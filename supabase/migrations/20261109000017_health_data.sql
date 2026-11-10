-- WP9: health details in their own tables, only with health consent (FR-1.5, NFR-6, architecture 8.1).
--
-- health_limits   injury notes per exercise (moved off the blob, not to exercise_notes), things I can't do, injuries
--                 and general health notes. One row per item.
-- pain_entries    pain score 0 to 10, for an exercise and/or a workout (FR-4.10). The screens come later.
--
-- Both tables open only to their owner, and only while the owner's health consent is active
-- (private.health_ok()). Without it the rows can't be read or written, even by the owner's app.
-- Withdrawing health consent deletes every health row at once: the WP6 trigger on consents calls
-- private.delete_health_data(uid), filled in here. Deleting the account cascades from auth.users.
-- They are outside sync (the app reads and writes them directly), never go in events, errors or analytics, and are a
-- separate "health" section of export_my_data().

create schema if not exists private;

-- ---------- tables ----------
create table public.health_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('exercise_note', 'cant_do', 'injury', 'note')),
  exercise_id text check (char_length(exercise_id) between 1 and 80),
  code text check (code ~ '^[a-z][a-z0-9_]{0,39}$'),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_limits_shape check (
    (kind = 'exercise_note' and exercise_id is not null and coalesce(note, '') <> '')
    or (kind = 'cant_do' and code is not null)
    or (kind in ('injury', 'note') and (code is not null or coalesce(note, '') <> '')))
);
comment on table public.health_limits is 'Health details (WP9): injury notes per exercise, things I can''t do (code), injuries and notes. Open to the owner only while health consent is active; deleted when it is withdrawn.';
create unique index health_limits_note_uq on public.health_limits (user_id, exercise_id) where kind = 'exercise_note';
create unique index health_limits_cant_uq on public.health_limits (user_id, code) where kind = 'cant_do';
create index health_limits_user_idx on public.health_limits (user_id, kind);

create table public.pain_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  score smallint not null check (score between 0 and 10),
  exercise_id text check (char_length(exercise_id) between 1 and 80),
  workout_id uuid references public.workouts (id) on delete set null,
  felt_at timestamptz not null default now(),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.pain_entries is 'Health details (WP9): pain score 0-10 for an exercise and/or workout. Open to the owner only while health consent is active; deleted when it is withdrawn.';
create index pain_entries_user_idx on public.pain_entries (user_id, felt_at desc);
create index pain_entries_workout_idx on public.pain_entries (workout_id) where workout_id is not null;

-- ---------- the consent check used by the policies ----------
-- No argument: it only ever answers for the signed-in person (private.has_consent stays off the API).
create or replace function private.health_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.has_consent(auth.uid(), 'health');
$$;
revoke all on function private.health_ok() from public, anon;
grant execute on function private.health_ok() to authenticated;

-- a pain entry may only point at one of your own workouts
create or replace function private.own_workout(p_workout uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_workout is null or exists (select 1 from public.workouts w where w.id = p_workout and w.user_id = auth.uid());
$$;
revoke all on function private.own_workout(uuid) from public, anon;
grant execute on function private.own_workout(uuid) to authenticated;

-- ---------- row level security ----------
alter table public.health_limits enable row level security;
alter table public.pain_entries enable row level security;

create policy "Own health limits, with health consent" on public.health_limits for select to authenticated
  using (user_id = (select auth.uid()) and (select private.health_ok()));
create policy "Add own health limits, with health consent" on public.health_limits for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.health_ok()));
create policy "Change own health limits, with health consent" on public.health_limits for update to authenticated
  using (user_id = (select auth.uid()) and (select private.health_ok()))
  with check (user_id = (select auth.uid()) and (select private.health_ok()));
create policy "Delete own health limits, with health consent" on public.health_limits for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.health_ok()));

create policy "Own pain entries, with health consent" on public.pain_entries for select to authenticated
  using (user_id = (select auth.uid()) and (select private.health_ok()));
create policy "Add own pain entries, with health consent" on public.pain_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.health_ok()) and private.own_workout(workout_id));
create policy "Change own pain entries, with health consent" on public.pain_entries for update to authenticated
  using (user_id = (select auth.uid()) and (select private.health_ok()))
  with check (user_id = (select auth.uid()) and (select private.health_ok()) and private.own_workout(workout_id));
create policy "Delete own pain entries, with health consent" on public.pain_entries for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.health_ok()));

revoke all on public.health_limits from anon, authenticated;
revoke all on public.pain_entries from anon, authenticated;
-- whole-row rights so the app can upsert by id; the policies pin user_id and the trigger keeps created_at
grant select, insert, update, delete on public.health_limits to authenticated;
grant select, insert, update, delete on public.pain_entries to authenticated;

-- ---------- updated_at, and a ceiling so nobody fills the tables ----------
create or replace function private.health_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end;
$$;
create trigger health_limits_touch before insert or update on public.health_limits
  for each row execute function private.health_touch();
create trigger pain_entries_touch before insert or update on public.pain_entries
  for each row execute function private.health_touch();

create or replace function private.health_limits_cap()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.health_limits where user_id = new.user_id) >= 1000 then
    raise exception 'That''s the most health notes GFD can keep. Delete some first.' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger health_limits_cap before insert on public.health_limits
  for each row execute function private.health_limits_cap();

create or replace function private.pain_entries_cap()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.pain_entries where user_id = new.user_id and created_at > now() - interval '1 day') >= 200 then
    raise exception 'Too many pain scores today. Try again tomorrow.' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger pain_entries_cap before insert on public.pain_entries
  for each row execute function private.pain_entries_cap();

-- ---------- withdrawing health consent deletes it all (WP6 left this empty) ----------
create or replace function private.delete_health_data(p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.health_limits where user_id = p_uid;
  delete from public.pain_entries where user_id = p_uid;
end;
$$;

-- ---------- export: health is its own section ----------
create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  return jsonb_build_object(
    'format', 'gfd-export',
    'version', 1,
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at,
                                          'last_sign_in_at', u.last_sign_in_at)
                from auth.users u where u.id = uid),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'tables', jsonb_build_object(
      'user_settings',    (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at), '[]') from public.user_settings t where t.user_id = uid),
      'about_me',         (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at), '[]') from public.about_me t where t.user_id = uid),
      'locations',        (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at), '[]') from public.locations t where t.user_id = uid),
      'plans',            (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at), '[]') from public.plans t where t.user_id = uid),
      'plan_versions',    (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.saved_at), '[]') from public.plan_versions t where t.user_id = uid),
      'schedule_entries', (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at), '[]') from public.schedule_entries t where t.user_id = uid),
      'measurements',     (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at), '[]') from public.measurements t where t.user_id = uid),
      'exercise_notes',   (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at), '[]') from public.exercise_notes t where t.user_id = uid),
      'custom_exercises', (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at), '[]') from public.custom_exercises t where t.user_id = uid),
      'progress_photos',  (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at), '[]') from public.progress_photos t where t.user_id = uid),
      'workouts',         (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at), '[]') from public.workouts t where t.user_id = uid),
      'workout_sets',     (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.performed_at, t.workout_id, t.exercise_order, t.set_no), '[]') from public.workout_sets t where t.user_id = uid),
      'user_state',       (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id'), '[]') from public.user_state t where t.user_id = uid),
      'suggestions',      (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at), '[]') from public.suggestions t where t.user_id = uid),
      'entitlements',     (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' - 'granted_by' order by t.created_at), '[]') from public.entitlements t where t.user_id = uid),
      'consents',         (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.id), '[]') from public.consents t where t.user_id = uid),
      'deletion_requests',(select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' - 'last_error'), '[]') from public.deletion_requests t where t.user_id = uid)
    ),
    'health', jsonb_build_object(
      'health_limits',    (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at), '[]') from public.health_limits t where t.user_id = uid),
      'pain_entries',     (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.felt_at), '[]') from public.pain_entries t where t.user_id = uid)
    )
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
revoke all on function private.health_touch() from public, anon, authenticated;
revoke all on function private.health_limits_cap() from public, anon, authenticated;
revoke all on function private.pain_entries_cap() from public, anon, authenticated;
revoke all on function private.delete_health_data(uuid) from public, anon, authenticated;
