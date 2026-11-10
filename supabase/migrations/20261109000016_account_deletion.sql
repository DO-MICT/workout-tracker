-- WP8: account deletion and data export (FR-1.3, FR-11.1, NFR-6, architecture 6.3 and 6.4).
--
-- deletion_requests   one row per account that asked to be deleted: when, from where, and when it will happen
--                     (7 days later). Signing in during those 7 days shows "Keep my account". Readable by the owner only;
--                     the app writes it only through the two functions below.
-- request_account_deletion(source)   starts the 7 days. Asking again keeps the first date.
-- cancel_account_deletion()          keeps the account (removes the request).
-- export_my_data()                   everything stored about the signed-in person, as one JSON document. The app
--                                    turns it into a ZIP (JSON plus CSV of sets and measurements). Free for everyone.
--
-- The deletion itself runs in the Edge Function delete-account (supabase/functions/delete-account) with the service
-- key, once a day: it removes the person's files in storage, then deletes the auth user, which cascades to every
-- table (profiles, data, history, feedback, consents, entitlements, this request). The trial check code stays
-- (private.trial_ledger, disclosed in the privacy policy) and the profiles trigger logs a no-id account_deleted event.

create schema if not exists private;

create table public.deletion_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now(),
  due_at timestamptz not null,
  source text not null default 'web' check (source in ('web', 'android', 'ios', 'page')),
  attempts int not null default 0,
  last_attempt_at timestamptz,
  last_error text check (char_length(last_error) <= 500)
);
comment on table public.deletion_requests is 'Accounts waiting to be deleted (WP8). due_at = requested_at + 7 days. Written by request/cancel_account_deletion; the delete-account Edge Function (service key) deletes the auth user once due, which removes this row too.';
create index deletion_requests_due_idx on public.deletion_requests (due_at);

alter table public.deletion_requests enable row level security;
create policy "Users read own deletion request" on public.deletion_requests for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.deletion_requests from anon, authenticated;
grant select on public.deletion_requests to authenticated;
grant select, update on public.deletion_requests to service_role;

create or replace function private.deletion_grace()
returns interval language sql immutable set search_path = '' as $$
  select interval '7 days';
$$;

-- ---------- what the app and the deletion page call ----------
create or replace function public.request_account_deletion(p_source text default 'web')
returns public.deletion_requests language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.deletion_requests;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  insert into public.deletion_requests (user_id, due_at, source)
  values (uid, now() + private.deletion_grace(),
          case when p_source in ('web', 'android', 'ios', 'page') then p_source else 'web' end)
  on conflict (user_id) do nothing;
  select * into r from public.deletion_requests where user_id = uid;
  return r;
end;
$$;

-- true when there was a request to cancel
create or replace function public.cancel_account_deletion()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  delete from public.deletion_requests where user_id = uid;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Everything kept about the signed-in person. Each table is listed by name (no dynamic SQL) so a new table must be
-- added here on purpose: tests/db/account-deletion.test.mjs checks the list against every table with a user_id.
-- Tombstoned sync rows (deleted_at set) are included until they are purged, because they are still stored.
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
    )
  );
end;
$$;

revoke all on function private.deletion_grace() from public, anon, authenticated;
revoke all on function public.request_account_deletion(text) from public, anon;
revoke all on function public.cancel_account_deletion() from public, anon;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;
grant execute on function public.export_my_data() to authenticated;
