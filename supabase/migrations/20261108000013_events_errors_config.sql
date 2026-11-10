-- WP5: usage events, an error log and app config (NFR-11, G15, architecture 7.3).
--
-- events        privacy-safe counts: sign-up, onboarding done, first workout, week-2 return, trial start,
--               paywall seen, purchase, export, account deleted. No user id, no email, no free text, no health data.
--               anon_id is a random id made by each install, not the account id. Sign-up, trial start, purchase
--               and account deleted are written by the database itself (triggers), so they carry no anon_id at all.
-- client_errors app crashes: message, stack, app version, screen. Emails, long numbers and ids are scrubbed out.
-- app_config    public settings the app reads on start: min_version (older copies are asked to reload),
--               catalog_version, flags (feature switches). Changed by Deon in the SQL editor.
--
-- Nobody reads events or errors through the API except admins, through admin_usage / admin_errors.
-- Old rows are purged: events after 400 days, errors after 90 days.

create schema if not exists private;

-- ---------- events ----------
create table public.events (
  id bigint generated always as identity primary key,
  name text not null,
  at timestamptz not null default now(),
  anon_id uuid,                        -- per install, random; null for events the server writes
  platform text check (platform in ('web', 'android', 'ios')),
  app_version text check (app_version ~ '^[0-9][0-9.]{0,19}$'),
  props jsonb not null default '{}' check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 512),
  received_at timestamptz not null default now()
);
comment on table public.events is 'Privacy-safe usage events (WP5). No personal details. Written only by log_event and server triggers; read by admins through admin_usage.';
create index events_name_at_idx on public.events (name, at);
create index events_anon_idx on public.events (anon_id, received_at) where anon_id is not null;
create index events_received_idx on public.events (received_at);

alter table public.events enable row level security;   -- no policies: the API roles can't touch rows directly
revoke all on public.events from anon, authenticated;

-- the names the app may send; the server's own (sign_up, trial_start, purchase, account_deleted) are not on it
create or replace function private.client_event_names()
returns text[] language sql immutable set search_path = '' as $$
  select array['onboarding_done', 'first_workout', 'week2_return', 'paywall_seen', 'export']::text[];
$$;

-- props: up to 8 short keys; values are numbers, true/false, or short lower-case codes (never free text)
create or replace function private.props_ok(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; n int := 0;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(p) loop
    n := n + 1;
    if n > 8 or k !~ '^[a-z][a-z0-9_]{0,23}$' then return false; end if;
    if jsonb_typeof(v) = 'number' or jsonb_typeof(v) = 'boolean' then continue; end if;
    if jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[a-z0-9_.-]{0,32}$' then continue; end if;
    return false;
  end loop;
  return true;
end;
$$;

create or replace function private.server_event(p_name text, p_props jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.events (name, props) values (p_name, coalesce(p_props, '{}'));
$$;

-- ---------- client errors ----------
create table public.client_errors (
  id bigint generated always as identity primary key,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  count int not null default 1,
  anon_id uuid,
  platform text check (platform in ('web', 'android', 'ios')),
  app_version text check (app_version ~ '^[0-9][0-9.]{0,19}$'),
  screen text check (char_length(screen) <= 40),
  message text not null check (char_length(message) <= 300),
  stack text check (char_length(stack) <= 2000)
);
comment on table public.client_errors is 'App errors (WP5): message, stack, version, screen; scrubbed of emails, long numbers and ids. Written only by log_client_error; read by admins through admin_errors.';
create index client_errors_last_idx on public.client_errors (last_at);
create index client_errors_anon_idx on public.client_errors (anon_id, last_at);

alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;

create or replace function private.purge_logs()
returns void language sql security definer set search_path = '' as $$
  delete from public.events where received_at < now() - interval '400 days';
  delete from public.client_errors where last_at < now() - interval '90 days';
$$;

-- emails, urls' query strings, uuids and long numbers become placeholders
create or replace function private.scrub(t text, maxlen int)
returns text language sql immutable set search_path = '' as $$
  select left(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(t, ''), '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g'),
        '\?[^\s)]*', '?[query]', 'g'),
      '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '[id]', 'g'),
    '[0-9]{6,}', '[n]', 'g'),
  maxlen);
$$;

-- ---------- app config ----------
create table public.app_config (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  value jsonb not null,
  note text,
  updated_at timestamptz not null default now()
);
comment on table public.app_config is 'Public settings the app reads on start (WP5). Change in the SQL editor, e.g. update public.app_config set value = ''"2026.12.01"'' where key = ''min_version'';';
create trigger app_config_touch before update on public.app_config
  for each row execute function public.touch_updated_at();

alter table public.app_config enable row level security;
create policy "Anyone reads app config" on public.app_config for select to anon, authenticated using (true);
revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;

insert into public.app_config (key, value, note) values
  ('min_version', '"0"', 'App copies older than this (APP_VERSION in src/js/events.js, e.g. "2026.11.08") are asked to reload. "0" asks nobody.'),
  ('catalog_version', '"2026.10.24"', 'Version of the exercise and gear library in the database. Bump when exercises.sql or gear.sql is reloaded.'),
  ('flags', '{}', 'Feature switches the app reads with flag("name"), e.g. {"new_stats": true}.')
on conflict (key) do nothing;

-- ---------- what the app calls ----------
-- Returns true when kept, false when dropped by the rate limit. A bad name or bad props is an error.
create or replace function public.log_event(
  p_name text, p_anon_id uuid, p_props jsonb default '{}', p_app_version text default null,
  p_platform text default 'web', p_at timestamptz default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_name is null or not (p_name = any (private.client_event_names())) then
    raise exception 'Unknown event name' using errcode = '22023';
  end if;
  if p_anon_id is null then
    raise exception 'anon_id is required' using errcode = '22023';
  end if;
  if not private.props_ok(p_props) then
    raise exception 'Event props must be up to 8 numbers, true/false or short codes' using errcode = '22023';
  end if;
  -- 100 a day per install, 20,000 an hour in total
  if (select count(*) from public.events where anon_id = p_anon_id and received_at > now() - interval '1 day') >= 100
     or (select count(*) from public.events where received_at > now() - interval '1 hour') >= 20000 then
    return false;
  end if;
  insert into public.events (name, at, anon_id, platform, app_version, props)
  values (p_name,
          -- queued offline events keep their own time, within the last 7 days
          least(now(), greatest(coalesce(p_at, now()), now() - interval '7 days')),
          p_anon_id,
          case when p_platform in ('web', 'android', 'ios') then p_platform end,
          case when p_app_version ~ '^[0-9][0-9.]{0,19}$' then p_app_version end,
          coalesce(p_props, '{}'));
  return true;
end;
$$;

-- The same error from the same install within an hour adds to its count instead of a new row.
create or replace function public.log_client_error(
  p_message text, p_anon_id uuid default null, p_stack text default null, p_screen text default null,
  p_app_version text default null, p_platform text default 'web')
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  msg text := private.scrub(p_message, 300);
  stk text := nullif(private.scrub(p_stack, 2000), '');
  scr text := nullif(left(regexp_replace(coalesce(p_screen, ''), '[^a-z0-9_.-]', '', 'g'), 40), '');
  ver text := case when p_app_version ~ '^[0-9][0-9.]{0,19}$' then p_app_version end;
  rid bigint;
begin
  if btrim(msg) = '' then return false; end if;
  update public.client_errors set count = count + 1, last_at = now()
  where id = (select id from public.client_errors
              where anon_id is not distinct from p_anon_id and message = msg
                and app_version is not distinct from ver and last_at > now() - interval '1 hour'
              order by last_at desc limit 1)
  returning id into rid;
  if rid is not null then return true; end if;
  -- 20 new errors an hour per install, 500 an hour in total
  if (p_anon_id is not null and (select count(*) from public.client_errors
        where anon_id = p_anon_id and first_at > now() - interval '1 hour') >= 20)
     or (select count(*) from public.client_errors where first_at > now() - interval '1 hour') >= 500 then
    return false;
  end if;
  insert into public.client_errors (anon_id, platform, app_version, screen, message, stack)
  values (p_anon_id, case when p_platform in ('web', 'android', 'ios') then p_platform end, ver, scr, msg, stk);
  if random() < 0.01 then perform private.purge_logs(); end if;
  return true;
end;
$$;

revoke all on function public.log_event(text, uuid, jsonb, text, text, timestamptz) from public;
revoke all on function public.log_client_error(text, uuid, text, text, text, text) from public;
grant execute on function public.log_event(text, uuid, jsonb, text, text, timestamptz) to anon, authenticated;
grant execute on function public.log_client_error(text, uuid, text, text, text, text) to anon, authenticated;

-- ---------- what the database logs itself ----------
create or replace function private.on_profile_insert_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.server_event('sign_up');
  return new;
end;
$$;
create or replace function private.on_profile_delete_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.server_event('account_deleted');
  return old;
end;
$$;
-- a trial row is a trial start; a store, web, lifetime or couple row is a purchase (WP12/WP13 write those)
create or replace function private.on_entitlement_insert_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'trial' then
    perform private.server_event('trial_start');
  elsif new.source in ('play', 'web', 'lifetime', 'couple') then
    perform private.server_event('purchase', jsonb_build_object('source', new.source)
      || case when new.product_id ~ '^[a-z0-9_.-]{1,32}$' then jsonb_build_object('product', new.product_id) else '{}'::jsonb end);
  end if;
  return new;
end;
$$;

create trigger profiles_event_insert after insert on public.profiles
  for each row execute function private.on_profile_insert_event();
create trigger profiles_event_delete after delete on public.profiles
  for each row execute function private.on_profile_delete_event();
create trigger entitlements_event_insert after insert on public.entitlements
  for each row execute function private.on_entitlement_insert_event();

-- ---------- admin reads ----------
-- Counts per event and day, newest first. Also purges old rows.
create or replace function public.admin_usage(p_days int default 30)
returns table (name text, day date, n bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_grant() then
    raise exception 'Only admins can read usage' using errcode = '42501';
  end if;
  perform private.purge_logs();
  return query
    select e.name, (e.at at time zone 'utc')::date as day, count(*)::bigint as n
    from public.events e
    where e.at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 400)))
    group by 1, 2
    order by 2 desc, 1;
end;
$$;

-- Most recent errors (already scrubbed).
create or replace function public.admin_errors(p_limit int default 50)
returns setof public.client_errors
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_grant() then
    raise exception 'Only admins can read errors' using errcode = '42501';
  end if;
  return query
    select * from public.client_errors order by last_at desc limit greatest(1, least(coalesce(p_limit, 50), 500));
end;
$$;

revoke all on function public.admin_usage(int) from public, anon;
revoke all on function public.admin_errors(int) from public, anon;
grant execute on function public.admin_usage(int) to authenticated, service_role;
grant execute on function public.admin_errors(int) to authenticated, service_role;

revoke all on function private.client_event_names() from public, anon, authenticated;
revoke all on function private.props_ok(jsonb) from public, anon, authenticated;
revoke all on function private.server_event(text, jsonb) from public, anon, authenticated;
revoke all on function private.purge_logs() from public, anon, authenticated;
revoke all on function private.scrub(text, int) from public, anon, authenticated;
revoke all on function private.on_profile_insert_event() from public, anon, authenticated;
revoke all on function private.on_profile_delete_event() from public, anon, authenticated;
revoke all on function private.on_entitlement_insert_event() from public, anon, authenticated;

-- ---------- lint fix for WP3 ----------
-- `supabase db lint` (plpgsql_check) reads WP3's loop over table names as one table called "{user_settings,...}"
-- and fails the db-check run. Same behaviour, written out per table so the checker can follow it.
create or replace function private.sync_purge_tombstones(older_than interval default '90 days')
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer := 0; k integer;
begin
  delete from public.user_settings where deleted_at < now() - older_than;    get diagnostics k = row_count; n := n + k;
  delete from public.about_me where deleted_at < now() - older_than;         get diagnostics k = row_count; n := n + k;
  delete from public.locations where deleted_at < now() - older_than;        get diagnostics k = row_count; n := n + k;
  delete from public.plans where deleted_at < now() - older_than;            get diagnostics k = row_count; n := n + k;
  delete from public.schedule_entries where deleted_at < now() - older_than; get diagnostics k = row_count; n := n + k;
  delete from public.measurements where deleted_at < now() - older_than;     get diagnostics k = row_count; n := n + k;
  delete from public.exercise_notes where deleted_at < now() - older_than;   get diagnostics k = row_count; n := n + k;
  delete from public.custom_exercises where deleted_at < now() - older_than; get diagnostics k = row_count; n := n + k;
  delete from public.progress_photos where deleted_at < now() - older_than;  get diagnostics k = row_count; n := n + k;
  return n;
end;
$$;
revoke all on function private.sync_purge_tombstones(interval) from public, anon, authenticated;
