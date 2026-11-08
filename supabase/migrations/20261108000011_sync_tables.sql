-- WP3: per-record sync tables replace the user_state blob (NFR-1, NFR-2, NFR-8, R2).
-- Architecture section 4. The blob is split into owned tables that sync record by record:
--   * every synced table has the same sync columns: id (made on the device), user_id, rev, change_seq
--     (one database sequence, stamped by trigger on every insert and update), created_at, updated_at,
--     deleted_at (a tombstone instead of a hard delete)
--   * the app never writes these tables directly. It calls sync_push(mutations) with only the fields it
--     changed, and sync_pull(since) for everything above its cursor. Both take a per-user lock, so a pull
--     never skips a change that was still being written (change_seq order = commit order per user).
--   * conflict rule: per field, the change that reaches the server last wins (server time, never the device
--     clock). Two phones changing different plans, or different fields of one record, both keep their
--     changes. A plan body that gets replaced is kept in plan_versions (last 20).
--   * migrate_from_blob(records) moves one user off the blob once (profiles.data_model 1 -> 2). It only
--     inserts, so a repeat run changes nothing. After that the user's user_state row is read-only; it is
--     kept 30 days as a fallback and dropped by a later cleanup migration.
-- No data moves on the server in this migration.

create schema if not exists private;

create sequence private.sync_change_seq;
revoke all on sequence private.sync_change_seq from public, anon, authenticated;

-- ---------- data model flag ----------
-- 1 = data still in the user_state blob (everyone today), 2 = moved to the synced tables.
-- New accounts start on 2: they have no blob to move.
alter table public.profiles add column data_model smallint not null default 1 check (data_model in (1, 2));
alter table public.profiles alter column data_model set default 2;
comment on column public.profiles.data_model is '1 = data in user_state (old), 2 = per-record sync tables. Set only by migrate_from_blob.';

-- ---------- triggers ----------
create or replace function private.sync_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.change_seq := nextval('private.sync_change_seq');
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.rev := old.rev + 1;
    new.created_at := old.created_at;
    new.user_id := old.user_id;
  else
    new.rev := 1;
    new.created_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.sync_stamp() from public, anon, authenticated;

-- ---------- synced tables ----------
-- One row per user. Fields merge one by one; prefs merges key by key (a null value removes a key).
create table public.user_settings (
  id uuid primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  units text not null default 'kg' check (units in ('kg', 'lb')),
  theme text check (char_length(theme) <= 20),
  palette text check (char_length(palette) <= 20),
  celebrate text check (char_length(celebrate) <= 20),
  active_plan text check (char_length(active_plan) <= 80),
  rest_default integer check (rest_default between 0 and 600),
  display_names jsonb check (display_names is null or jsonb_typeof(display_names) = 'array'),
  prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(prefs) = 'object' and octet_length(prefs::text) <= 200000),
  rev integer not null default 1,
  change_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (id = user_id)
);
comment on table public.user_settings is 'Synced: one row per user (id = user_id). Units, theme, active plan, rest default, names; other app settings in prefs.';

create table public.about_me (
  id uuid primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  train text check (char_length(train) <= 40),
  level text check (char_length(level) <= 40),
  goal text check (char_length(goal) <= 40),
  days_per_week smallint check (days_per_week between 1 and 7),
  rev integer not null default 1,
  change_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (id = user_id)
);
comment on table public.about_me is 'Synced: one row per user (id = user_id). The onboarding answers.';

create table public.locations (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  local_id text not null check (char_length(local_id) between 1 and 80),
  name text check (char_length(name) <= 80),
  gear text[] not null default '{}' check (cardinality(gear) <= 1000),
  sort integer not null default 0,
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object' and octet_length(extra::text) <= 20000),
  rev integer not null default 1,
  change_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.locations is 'Synced: where you train and the gear there. local_id is the app''s own id (loc1...).';

create table public.plans (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  local_id text not null check (char_length(local_id) between 1 and 80),
  name text check (char_length(name) <= 120),
  source_template text check (char_length(source_template) <= 80),
  body jsonb not null default '{}'::jsonb check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 250000),
  read_only boolean not null default false,
  rev integer not null default 1,
  change_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.plans is 'Synced: your own plans and your changes to built-in ones (source_template). body holds weeks, days, exercises and targets.';

create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rev integer not null,
  body jsonb not null,
  saved_at timestamptz not null default now()
);
comment on table public.plan_versions is 'Earlier bodies of a plan (last 20), written by trigger when a plan body is replaced. Not synced.';
create index plan_versions_plan_idx on public.plan_versions (plan_id, saved_at desc);

create table public.schedule_entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  on_date date not null,
  plan_local_id text check (char_length(plan_local_id) <= 80),
  day_id text check (char_length(day_id) <= 20),
  status text not null default 'due' check (status in ('due', 'done', 'missed', 'skipped')),
  workout_id uuid,
  rev integer not null default 1,
  change_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.schedule_entries is 'Synced: planned workouts by date (F9).';

create table public.measurements (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  taken_at timestamptz not null,
  site text not null check (char_length(site) between 1 and 20),
  side text check (side in ('left', 'right')),
  value numeric(8, 2) not null check (value between 0 and 10000),
  rev integer not null default 1,
  change_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.measurements is 'Synced: one body measurement per row (cm or kg). A check-in is the rows with the same taken_at.';

create table public.exercise_notes (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null check (char_length(exercise_id) between 1 and 80),
  note text not null check (char_length(note) <= 2000),
  kind text not null default 'setup' check (kind in ('setup', 'cue')),
  rev integer not null default 1,
  change_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.exercise_notes is 'Synced: your own notes on an exercise (seat height, cues). Injury notes belong in the health tables (WP6).';

create table public.custom_exercises (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  local_id text not null check (local_id ~ '^u_[A-Za-z0-9_-]{1,77}$'),
  name text not null check (char_length(name) between 1 and 120),
  pattern text check (char_length(pattern) <= 40),
  muscles text[] not null default '{}' check (cardinality(muscles) <= 40),
  gear text[] not null default '{}' check (cardinality(gear) <= 40),
  measure text not null default 'w' check (measure in ('w', 'bw', 'cardio', 'time', 'hold', 'count')),
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object' and octet_length(extra::text) <= 20000),
  rev integer not null default 1,
  change_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.custom_exercises is 'Synced: exercises you made (F12). local_id starts with u_ so it never clashes with the library.';

create table public.progress_photos (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  taken_on date not null,
  pose text check (char_length(pose) <= 20),
  storage_path text check (char_length(storage_path) <= 300),
  rev integer not null default 1,
  change_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.progress_photos is 'Synced: progress photo records (F10, Pro). The files go in a private bucket, added with F10.';

do $$
declare t text;
begin
  foreach t in array array['user_settings', 'about_me', 'locations', 'plans', 'schedule_entries', 'measurements',
                           'exercise_notes', 'custom_exercises', 'progress_photos'] loop
    execute format('create index %I on public.%I (user_id, change_seq)', t || '_user_seq_idx', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function private.sync_stamp()', t || '_stamp', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Read own rows" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    -- writes only through sync_push / migrate_from_blob
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

alter table public.plan_versions enable row level security;
create policy "Read own plan versions" on public.plan_versions
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.plan_versions from anon, authenticated;
grant select on public.plan_versions to authenticated;

-- keep the replaced body when a plan changes
create or replace function private.keep_plan_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.body is distinct from new.body and old.body <> '{}'::jsonb then
    insert into public.plan_versions (plan_id, user_id, rev, body) values (old.id, old.user_id, old.rev, old.body);
    delete from public.plan_versions v
     where v.plan_id = old.id
       and v.id not in (select k.id from public.plan_versions k where k.plan_id = old.id order by k.saved_at desc, k.rev desc limit 20);
  end if;
  return new;
end;
$$;
revoke all on function private.keep_plan_version() from public, anon, authenticated;
create trigger plans_keep_version after update on public.plans
  for each row execute function private.keep_plan_version();

-- ---------- workouts gain change_seq so other devices can pull them later ----------
create or replace function private.stamp_change_seq()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.change_seq := nextval('private.sync_change_seq');
  return new;
end;
$$;
revoke all on function private.stamp_change_seq() from public, anon, authenticated;
alter table public.workouts add column change_seq bigint not null default 0;
create trigger workouts_stamp before insert or update on public.workouts
  for each row execute function private.stamp_change_seq();
update public.workouts set change_seq = 0;   -- the trigger stamps every existing row
create index workouts_user_seq_idx on public.workouts (user_id, change_seq);

-- ---------- user_state becomes read-only once a user has moved ----------
drop policy "Insert own data" on public.user_state;
drop policy "Update own data" on public.user_state;
create policy "Insert own data" on public.user_state
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and coalesce((select p.data_model from public.profiles p where p.id = (select auth.uid())), 1) = 1);
create policy "Update own data" on public.user_state
  for update to authenticated using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and coalesce((select p.data_model from public.profiles p where p.id = (select auth.uid())), 1) = 1);

-- ---------- sync functions ----------
-- merge two objects key by key; a null value in b removes the key
create or replace function private.merge_keys(a jsonb, b jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each(coalesce(a, '{}'::jsonb) || coalesce(b, '{}'::jsonb)) e
   where e.value <> 'null'::jsonb;
$$;
revoke all on function private.merge_keys(jsonb, jsonb) from public, anon, authenticated;

-- Apply one change for one user. m = {t: table, id: uuid, op: 'upsert'|'delete', f: {changed fields}, rev: base rev}.
-- Returns {t, id, status, rev}. status: applied | merged (someone else changed it first; per-field rule applied)
-- | deleted | gone (delete of a record that never reached the server) | exists (insert_only and already there)
-- | skipped (not your record).
create or replace function private.sync_apply(uid uuid, m jsonb, insert_only boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t text := m ->> 't';
  op text := coalesce(m ->> 'op', 'upsert');
  rid uuid;
  f jsonb := coalesce(m -> 'f', '{}'::jsonb);
  base integer := nullif(m ->> 'rev', '')::integer;
  cols text[];
  cur jsonb;
  merged jsonb;
  collist text;
  new_rev integer;
  new_seq bigint;
  status text;
begin
  if t is null or t not in ('user_settings', 'about_me', 'locations', 'plans', 'schedule_entries', 'measurements',
                            'exercise_notes', 'custom_exercises', 'progress_photos') then
    raise exception 'unknown table %', coalesce(t, '(none)') using errcode = '22023';
  end if;
  if op not in ('upsert', 'delete') then raise exception 'unknown op %', op using errcode = '22023'; end if;
  if jsonb_typeof(f) <> 'object' then raise exception 'f must be an object' using errcode = '22023'; end if;
  rid := case when t in ('user_settings', 'about_me') then uid else (m ->> 'id')::uuid end;
  if rid is null then raise exception 'id is missing' using errcode = '22023'; end if;

  select array_agg(a.attname::text) into cols
    from pg_attribute a
   where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname not in ('id', 'user_id', 'rev', 'change_seq', 'created_at', 'updated_at', 'deleted_at');

  execute format('select to_jsonb(x) from public.%I x where x.id = $1', t) into cur using rid;
  if cur is not null and (cur ->> 'user_id')::uuid <> uid then
    return jsonb_build_object('t', t, 'id', rid, 'status', 'skipped');
  end if;
  if insert_only and cur is not null then
    return jsonb_build_object('t', t, 'id', rid, 'status', 'exists', 'rev', (cur ->> 'rev')::integer);
  end if;

  if op = 'delete' then
    if cur is null then return jsonb_build_object('t', t, 'id', rid, 'status', 'gone'); end if;
    execute format('update public.%I set deleted_at = now() where id = $1 returning rev, change_seq', t)
      into new_rev, new_seq using rid;
    return jsonb_build_object('t', t, 'id', rid, 'status', 'deleted', 'rev', new_rev, 'seq', new_seq);
  end if;

  -- only known, writable columns
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into f
    from jsonb_each(f) e where e.key = any(cols);
  if t = 'user_settings' and f ? 'prefs' then
    if jsonb_typeof(f -> 'prefs') <> 'object' then raise exception 'prefs must be an object' using errcode = '22023'; end if;
    f := jsonb_set(f, '{prefs}', private.merge_keys(cur -> 'prefs', f -> 'prefs'));
  end if;
  merged := f || jsonb_build_object('id', rid, 'user_id', uid, 'deleted_at', null);

  select string_agg(quote_ident(k), ', ') into collist from jsonb_object_keys(merged) k;
  if cur is null then
    execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) returning rev, change_seq',
                   t, collist) into new_rev, new_seq using merged;
    status := 'applied';
  else
    execute format('update public.%1$I set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) where id = $2 returning rev, change_seq',
                   t, collist) into new_rev, new_seq using merged, rid;
    status := case when base is null or base = (cur ->> 'rev')::integer then 'applied' else 'merged' end;
  end if;
  return jsonb_build_object('t', t, 'id', rid, 'status', status, 'rev', new_rev, 'seq', new_seq);
end;
$$;
revoke all on function private.sync_apply(uuid, jsonb, boolean) from public, anon, authenticated;

-- Push a batch of changes (1 to 500). A bad change is reported and skipped, never blocks the rest.
create or replace function public.sync_push(mutations jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m jsonb;
  res jsonb;
  out jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if jsonb_typeof(mutations) <> 'array' or jsonb_array_length(mutations) > 500 then
    raise exception 'Send a list of up to 500 changes' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gfd-sync:' || uid::text, 0));
  for m in select value from jsonb_array_elements(mutations) loop
    begin
      res := private.sync_apply(uid, m, false);
    exception when others then
      res := jsonb_build_object('t', m ->> 't', 'id', m ->> 'id', 'status', 'error', 'error', left(sqlerrm, 200));
    end;
    out := out || jsonb_build_array(res);
  end loop;
  return jsonb_build_object('results', out);
end;
$$;
revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;

-- Everything of yours changed after `since` (tombstones included), oldest first, up to max_rows.
-- Returns {rows: [{t, r}], cursor, more}. Call again with the cursor while more is true.
create or replace function public.sync_pull(since bigint default 0, max_rows integer default 1000)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lim integer := least(greatest(coalesce(max_rows, 1000), 1), 5000);
  got jsonb;
  n integer;
  last_seq bigint;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  -- wait for this user's pushes that are still being written, so no change is skipped
  perform pg_advisory_xact_lock_shared(hashtextextended('gfd-sync:' || uid::text, 0));
  with c as (
    select x.change_seq s, 'user_settings' t, to_jsonb(x) r from public.user_settings x where x.user_id = uid and x.change_seq > since
    union all select x.change_seq, 'about_me', to_jsonb(x) from public.about_me x where x.user_id = uid and x.change_seq > since
    union all select x.change_seq, 'locations', to_jsonb(x) from public.locations x where x.user_id = uid and x.change_seq > since
    union all select x.change_seq, 'plans', to_jsonb(x) from public.plans x where x.user_id = uid and x.change_seq > since
    union all select x.change_seq, 'schedule_entries', to_jsonb(x) from public.schedule_entries x where x.user_id = uid and x.change_seq > since
    union all select x.change_seq, 'measurements', to_jsonb(x) from public.measurements x where x.user_id = uid and x.change_seq > since
    union all select x.change_seq, 'exercise_notes', to_jsonb(x) from public.exercise_notes x where x.user_id = uid and x.change_seq > since
    union all select x.change_seq, 'custom_exercises', to_jsonb(x) from public.custom_exercises x where x.user_id = uid and x.change_seq > since
    union all select x.change_seq, 'progress_photos', to_jsonb(x) from public.progress_photos x where x.user_id = uid and x.change_seq > since
  ), page as (
    select * from c order by s limit lim
  )
  select coalesce(jsonb_agg(jsonb_build_object('t', t, 'r', r) order by s), '[]'::jsonb), count(*), max(s)
    into got, n, last_seq from page;
  return jsonb_build_object('rows', got, 'cursor', coalesce(last_seq, since), 'more', n >= lim);
end;
$$;
revoke all on function public.sync_pull(bigint, integer) from public, anon;
grant execute on function public.sync_pull(bigint, integer) to authenticated;

-- Move this user off the blob, once. All or nothing: if any record is refused, nothing changes and the
-- app stays on the blob until the next try. Records that already exist are left alone, so a repeat run
-- (or a second phone) changes nothing.
create or replace function public.migrate_from_blob(records jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  dm smallint;
  m jsonb;
  res jsonb;
  out jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if jsonb_typeof(records) <> 'array' or jsonb_array_length(records) > 5000 then
    raise exception 'Send a list of up to 5000 records' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gfd-sync:' || uid::text, 0));
  select p.data_model into dm from public.profiles p where p.id = uid for update;
  if dm is null then raise exception 'No profile' using errcode = 'P0002'; end if;
  if dm >= 2 then return jsonb_build_object('data_model', dm, 'already', true, 'results', '[]'::jsonb); end if;
  for m in select value from jsonb_array_elements(records) loop
    if coalesce(m ->> 'op', 'upsert') <> 'upsert' then continue; end if;
    res := private.sync_apply(uid, m, true);
    if res ->> 'status' = 'skipped' then raise exception 'Record % belongs to someone else', m ->> 'id' using errcode = '42501'; end if;
    out := out || jsonb_build_array(res);
  end loop;
  update public.profiles set data_model = 2 where id = uid;
  return jsonb_build_object('data_model', 2, 'already', false, 'results', out);
end;
$$;
revoke all on function public.migrate_from_blob(jsonb) from public, anon;
grant execute on function public.migrate_from_blob(jsonb) to authenticated;

-- Tombstones older than 90 days can go. Run by hand or by a scheduled job later (WP5 sets up jobs).
create or replace function private.sync_purge_tombstones(older_than interval default '90 days')
returns integer language plpgsql security definer set search_path = '' as $$
declare t text; n integer := 0; k integer;
begin
  foreach t in array array['user_settings', 'about_me', 'locations', 'plans', 'schedule_entries', 'measurements',
                           'exercise_notes', 'custom_exercises', 'progress_photos'] loop
    execute format('delete from public.%I where deleted_at < now() - $1', t) using older_than;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;
revoke all on function private.sync_purge_tombstones(interval) from public, anon, authenticated;
