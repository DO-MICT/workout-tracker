-- WP1: entitlements decided on the server (FR-14.2, R1, AQ2).
-- One table says what each account may use. The app only reads it, through the my_access view.
-- Writers: the sign-up trigger (14-day Pro trial), admin_grant/admin_revoke (testers, promos),
-- and later the billing webhook Edge Function (Play and Paddle via RevenueCat, WP12/WP13) as service_role.
-- profiles.tier is no longer read by the app.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

-- ---------- what each tier unlocks ----------
-- Only Pro features are listed; Free features need no key. access.js asks can('<key>').
create table public.tier_features (
  tier text primary key check (tier in ('free', 'pro', 'tester', 'coach')),
  label text not null,
  rank int not null unique,          -- the best active tier wins in my_access
  features text[] not null default '{}'
);
comment on table public.tier_features is 'Feature keys each tier unlocks. Read by everyone, changed only by migrations.';

insert into public.tier_features (tier, label, rank, features) values
  ('free',   'Free',   10, '{}'),
  ('pro',    'Pro',    20, '{plans.unlimited,stats.full,progression,timed,photos,measure.full}'),
  ('tester', 'Tester', 30, '{plans.unlimited,stats.full,progression,timed,photos,measure.full,beta}'),
  ('coach',  'Coach',  40, '{plans.unlimited,stats.full,progression,timed,photos,measure.full,coach}');

alter table public.tier_features enable row level security;
create policy "Anyone reads tier features" on public.tier_features for select to anon, authenticated using (true);
revoke all on public.tier_features from anon, authenticated;
grant select on public.tier_features to anon, authenticated;

-- ---------- entitlements ----------
-- One row per source, so a trial and a paid plan can sit side by side without one hiding the other.
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tier text not null references public.tier_features (tier),
  source text not null check (source in ('trial', 'play', 'web', 'lifetime', 'couple', 'promo', 'admin')),
  product_id text,                    -- store product, e.g. gfd_pro_yearly
  starts_at timestamptz not null default now(),
  expires_at timestamptz,             -- null = no end (lifetime, tester)
  status text not null default 'active' check (status in ('active', 'grace', 'paused', 'expired', 'refunded', 'revoked')),
  will_renew boolean not null default false,
  external_ref text,                  -- RevenueCat / store transaction id
  note text,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source)
);
comment on table public.entitlements is 'What each account may use. Users read their own rows; only server code writes (sign-up trigger, admin_grant, billing webhook as service_role).';
create index entitlements_user_idx on public.entitlements (user_id);

create trigger entitlements_touch before update on public.entitlements
  for each row execute function public.touch_updated_at();

alter table public.entitlements enable row level security;
create policy "Read own entitlements" on public.entitlements
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Admins read all entitlements" on public.entitlements
  for select to authenticated using ((select private.is_admin()));
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;   -- no insert/update/delete: the app can't give itself Pro

-- ---------- my_access: the one thing the app reads ----------
create view public.my_access with (security_invoker = on) as
select
  u.uid as user_id,
  coalesce(b.tier, 'free') as tier,
  coalesce(b.source, 'none') as source,
  b.starts_at,
  b.expires_at as ends_at,
  coalesce(b.will_renew, false) as will_renew,
  coalesce(f.features, '{}') as features,
  now() as checked_at
from (select auth.uid() as uid) u
left join lateral (
  select e.tier, e.source, e.starts_at, e.expires_at, e.will_renew
  from public.entitlements e
  join public.tier_features t on t.tier = e.tier
  where e.user_id = u.uid
    and e.status in ('active', 'grace')
    and e.starts_at <= now()
    and (e.expires_at is null or e.expires_at > now())
  order by t.rank desc, e.expires_at desc nulls first
  limit 1
) b on true
left join public.tier_features f on f.tier = coalesce(b.tier, 'free')
where u.uid is not null;
comment on view public.my_access is 'The signed-in user''s best active tier, when it ends, why, and its feature keys.';
revoke all on public.my_access from anon, authenticated;
grant select on public.my_access to authenticated;

-- ---------- one trial per person ----------
-- A salted hash of the normalised email, so deleting the account and joining again gives no second trial.
create table private.app_secrets (key text primary key, value text not null);
revoke all on private.app_secrets from public, anon, authenticated;
insert into private.app_secrets (key, value)
  values ('trial_salt', encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (key) do nothing;

create table private.trial_ledger (
  email_hash text primary key,
  created_at timestamptz not null default now()
);
comment on table private.trial_ledger is 'Emails (salted hash only) that already had a Pro trial. Kept after account deletion.';
revoke all on private.trial_ledger from public, anon, authenticated;

-- lower case, no spaces, no +tag; Gmail ignores dots and googlemail.com is gmail.com
create or replace function private.normalise_email(e text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  s text := lower(btrim(coalesce(e, '')));
  loc text; dom text;
begin
  if position('@' in s) = 0 then return s; end if;
  loc := split_part(s, '@', 1);
  dom := split_part(s, '@', 2);
  loc := split_part(loc, '+', 1);
  if dom in ('gmail.com', 'googlemail.com') then
    loc := replace(loc, '.', '');
    dom := 'gmail.com';
  end if;
  return loc || '@' || dom;
end;
$$;

create or replace function private.email_hash(e text)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.digest(
    (select value from private.app_secrets where key = 'trial_salt') || ':' || private.normalise_email(e), 'sha256'), 'hex');
$$;

-- gives a new account 14 days of Pro, unless that email already had a trial
create or replace function private.start_trial(uid uuid, email text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  if email is null or btrim(email) = '' then return false; end if;
  h := private.email_hash(email);
  insert into private.trial_ledger (email_hash) values (h) on conflict do nothing;
  if not found then return false; end if;
  insert into public.entitlements (user_id, tier, source, starts_at, expires_at, note)
  values (uid, 'pro', 'trial', now(), now() + interval '14 days', '14-day Pro trial at sign-up')
  on conflict (user_id, source) do nothing;
  return true;
end;
$$;

revoke all on function private.normalise_email(text) from public, anon, authenticated;
revoke all on function private.email_hash(text) from public, anon, authenticated;
revoke all on function private.start_trial(uuid, text) from public, anon, authenticated;

-- sign-up now also starts the trial
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  insert into public.user_state (user_id) values (new.id);
  perform private.start_trial(new.id, new.email);
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------- admin grants (testers, promos) ----------
-- Who may call: an app admin (profiles.is_admin), the service role (Edge Functions),
-- or Deon in the Supabase SQL editor. Examples:
--   select public.admin_grant('friend@example.com', 'tester');            -- tester, no end date
--   select public.admin_grant('friend@example.com', 'pro', 'promo', 30);  -- 30 days of Pro
--   select public.admin_revoke('friend@example.com', 'admin');
create or replace function private.can_grant()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.is_admin()), false)
      or coalesce((select auth.role()), '') = 'service_role'
      or session_user::text in ('postgres', 'supabase_admin');
$$;
revoke all on function private.can_grant() from public, anon, authenticated;

create or replace function public.admin_grant(
  p_email text, p_tier text, p_source text default 'admin', p_days int default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid; rid uuid;
begin
  if not private.can_grant() then
    raise exception 'Only admins can grant access' using errcode = '42501';
  end if;
  if p_tier not in ('pro', 'tester', 'coach') then
    raise exception 'Tier must be pro, tester or coach' using errcode = '22023';
  end if;
  if p_source not in ('admin', 'promo') then
    raise exception 'Source must be admin or promo (stores write their own rows)' using errcode = '22023';
  end if;
  if p_days is not null and p_days < 1 then
    raise exception 'Days must be 1 or more, or empty for no end date' using errcode = '22023';
  end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then
    raise exception 'No account with that email' using errcode = 'P0002';
  end if;
  insert into public.entitlements (user_id, tier, source, starts_at, expires_at, status, will_renew, note, granted_by)
  values (uid, p_tier, p_source, now(),
          case when p_days is null then null else now() + make_interval(days => p_days) end,
          'active', false, p_note, auth.uid())
  on conflict (user_id, source) do update set
    tier = excluded.tier, starts_at = excluded.starts_at, expires_at = excluded.expires_at,
    status = 'active', note = excluded.note, granted_by = excluded.granted_by
  returning id into rid;
  return rid;
end;
$$;

create or replace function public.admin_revoke(p_email text, p_source text default 'admin')
returns integer language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not private.can_grant() then
    raise exception 'Only admins can revoke access' using errcode = '42501';
  end if;
  update public.entitlements e set status = 'revoked', expires_at = least(coalesce(e.expires_at, now()), now())
  from auth.users u
  where u.id = e.user_id and lower(u.email) = lower(btrim(p_email)) and e.source = p_source and e.status <> 'revoked';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.admin_grant(text, text, text, int, text) from public, anon;
revoke all on function public.admin_revoke(text, text) from public, anon;
grant execute on function public.admin_grant(text, text, text, int, text) to authenticated, service_role;
grant execute on function public.admin_revoke(text, text) to authenticated, service_role;

-- ---------- existing accounts keep what they have ----------
-- Everyone who signed up before this was a tester; they stay testers (no end date).
insert into public.entitlements (user_id, tier, source, note)
select p.id, p.tier, 'admin', 'Kept from profiles.tier when entitlements started (WP1)'
from public.profiles p
where p.tier in ('pro', 'tester')
on conflict (user_id, source) do nothing;

comment on column public.profiles.tier is 'Deprecated (WP1): use public.entitlements / my_access. Kept for now, not read by the app.';
comment on column public.profiles.tier_source is 'Deprecated (WP1): see public.entitlements.source.';
