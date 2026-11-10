-- WP6: consent records (FR-1.2, FR-1.5, NFR-6, architecture 6.1 and 6.2).
--
-- consents      one row per consent given or withdrawn: user, kind (terms, privacy, health, marketing), version,
--               given_at, withdrawn_at, source. Rows are only ever added: withdrawing adds a new row with
--               withdrawn_at set. The newest row per kind is the current state. Deleted with the account.
-- my_consents   (view) the signed-in user's current state per kind, next to the version the app shows now.
-- give_consent / withdraw_consent   the only way the app records consent. Terms and privacy can't be withdrawn
--               (that is closing the account, WP8). Health and marketing can, at any time.
-- app_config.policies   the current version of each text. terms and privacy stay empty until the policy pages are
--               published (WP7); while empty the app doesn't ask and give_consent refuses them.
-- private.has_consent(uid, kind)   for RLS on the health tables (WP9): rows open only while health consent is active.
-- Withdrawing health consent calls private.delete_health_data(uid), which WP9 fills in with the health tables.
--
-- Sign-up: the app puts the versions the person agreed to in the sign-up metadata (consents: {terms, privacy,
-- marketing}); a trigger records them with the new profile when they match the current versions.

create schema if not exists private;

create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('terms', 'privacy', 'health', 'marketing')),
  version text not null check (version ~ '^[0-9A-Za-z][0-9A-Za-z.-]{0,19}$'),
  given_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  source text not null default 'web' check (source in ('signup', 'web', 'android', 'ios', 'admin')),
  recorded_at timestamptz not null default now()
);
comment on table public.consents is 'Consent records (WP6). Append-only: withdrawing adds a row with withdrawn_at. Newest row per user and kind is the current state. Written only by give_consent, withdraw_consent and the sign-up trigger.';
create index consents_user_kind_idx on public.consents (user_id, kind, id desc);

alter table public.consents enable row level security;
create policy "Users read own consents" on public.consents for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;

-- append-only, for everyone (account deletion still removes the rows through the cascade)
create or replace function private.consents_no_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Consent records are never edited; add a new row instead' using errcode = '42501';
end;
$$;
create trigger consents_no_update before update on public.consents
  for each row execute function private.consents_no_update();

-- ---------- policy versions ----------
insert into public.app_config (key, value, note) values
  ('policies',
   '{"terms": "", "privacy": "", "health": "2026.11.08", "marketing": "2026.11.08", "terms_url": "", "privacy_url": ""}',
   'Current version of each consent text. terms/privacy (+ their urls) are set when the pages are published (WP7); empty = the app does not ask yet. Bump a version when its text changes: everyone is asked again on next open (terms, privacy).')
on conflict (key) do nothing;

create or replace function private.policy_version(p_kind text)
returns text language sql stable security definer set search_path = '' as $$
  select nullif(btrim(value ->> p_kind), '') from public.app_config where key = 'policies';
$$;

-- the newest row for a user and kind
create or replace function private.consent_latest(p_uid uuid, p_kind text)
returns public.consents language sql stable security definer set search_path = '' as $$
  select * from public.consents where user_id = p_uid and kind = p_kind order by id desc limit 1;
$$;

-- true while the newest row for that kind is a consent, not a withdrawal (any version)
create or replace function private.has_consent(p_uid uuid, p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select c.withdrawn_at is null from public.consents c
                   where c.user_id = p_uid and c.kind = p_kind order by c.id desc limit 1), false);
$$;

-- WP9 replaces this body with deletes from health_limits and pain_entries
create or replace function private.delete_health_data(p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform p_uid;   -- no health tables yet
end;
$$;

create or replace function private.on_consent_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'health' and new.withdrawn_at is not null then
    perform private.delete_health_data(new.user_id);
  end if;
  return new;
end;
$$;
create trigger consents_after_insert after insert on public.consents
  for each row execute function private.on_consent_insert();

-- ---------- what the app reads ----------
create view public.my_consents with (security_invoker = on) as
  select k.kind,
         c.version,
         c.given_at,
         c.withdrawn_at,
         coalesce(c.id is not null and c.withdrawn_at is null, false) as active,
         nullif(btrim(p.value ->> k.kind), '') as current_version
  from unnest(array['terms', 'privacy', 'health', 'marketing']) as k(kind)
  left join lateral (select x.id, x.version, x.given_at, x.withdrawn_at from public.consents x
                     where x.user_id = (select auth.uid()) and x.kind = k.kind
                     order by x.id desc limit 1) c on true
  left join public.app_config p on p.key = 'policies';
comment on view public.my_consents is 'The signed-in user''s current consent per kind, and the version the app shows now (WP6).';
revoke all on public.my_consents from anon, authenticated;
grant select on public.my_consents to authenticated;

-- ---------- what the app calls ----------
-- Records consent to the text the person saw. p_version must be the current one (else the app reloads the text).
-- Already agreed to this version: nothing is added. Returns the newest row.
create or replace function public.give_consent(p_kind text, p_version text, p_source text default 'web')
returns public.consents language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cur text := private.policy_version(p_kind);
  last public.consents;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('terms', 'privacy', 'health', 'marketing') then
    raise exception 'Unknown consent kind' using errcode = '22023';
  end if;
  if cur is null then raise exception 'That policy is not published yet' using errcode = '22023'; end if;
  if p_version is distinct from cur then
    raise exception 'The text has changed (now version %). Reload and read it again.', cur using errcode = '22023';
  end if;
  last := private.consent_latest(uid, p_kind);
  if last.id is not null and last.withdrawn_at is null and last.version = cur then return last; end if;
  if (select count(*) from public.consents where user_id = uid and recorded_at > now() - interval '1 day') >= 40 then
    raise exception 'Too many changes today. Try again tomorrow.' using errcode = '54000';
  end if;
  insert into public.consents (user_id, kind, version, source)
  values (uid, p_kind, cur, case when p_source in ('web', 'android', 'ios') then p_source else 'web' end)
  returning * into last;
  return last;
end;
$$;

-- Withdraws health or marketing consent. Not given (or already withdrawn): nothing is added.
create or replace function public.withdraw_consent(p_kind text, p_source text default 'web')
returns public.consents language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  last public.consents;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_kind in ('terms', 'privacy') then
    raise exception 'Terms and privacy can only be withdrawn by deleting the account' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('health', 'marketing') then
    raise exception 'Unknown consent kind' using errcode = '22023';
  end if;
  last := private.consent_latest(uid, p_kind);
  if last.id is null or last.withdrawn_at is not null then return last; end if;
  if (select count(*) from public.consents where user_id = uid and recorded_at > now() - interval '1 day') >= 40 then
    raise exception 'Too many changes today. Try again tomorrow.' using errcode = '54000';
  end if;
  insert into public.consents (user_id, kind, version, given_at, withdrawn_at, source)
  values (uid, p_kind, last.version, last.given_at, now(),
          case when p_source in ('web', 'android', 'ios') then p_source else 'web' end)
  returning * into last;
  return last;
end;
$$;

revoke all on function public.give_consent(text, text, text) from public, anon;
revoke all on function public.withdraw_consent(text, text) from public, anon;
grant execute on function public.give_consent(text, text, text) to authenticated;
grant execute on function public.withdraw_consent(text, text) to authenticated;

-- ---------- sign-up ----------
-- consents agreed on the sign-up form arrive in the user metadata; record the ones that match today's versions.
-- Never blocks a sign-up: anything odd is skipped and the app asks again after sign-in.
create or replace function private.on_profile_insert_consents()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m jsonb;
  k text;
  cur text;
begin
  select u.raw_user_meta_data -> 'consents' into m from auth.users u where u.id = new.id;
  if m is null or jsonb_typeof(m) <> 'object' then return new; end if;
  foreach k in array array['terms', 'privacy', 'marketing'] loop
    cur := private.policy_version(k);
    if cur is not null and m ->> k = cur then
      insert into public.consents (user_id, kind, version, source) values (new.id, k, cur, 'signup');
    end if;
  end loop;
  return new;
exception when others then
  return new;
end;
$$;
create trigger profiles_consents_insert after insert on public.profiles
  for each row execute function private.on_profile_insert_consents();

revoke all on function private.consents_no_update() from public, anon, authenticated;
revoke all on function private.policy_version(text) from public, anon, authenticated;
revoke all on function private.consent_latest(uuid, text) from public, anon, authenticated;
revoke all on function private.has_consent(uuid, text) from public, anon, authenticated;
revoke all on function private.delete_health_data(uuid) from public, anon, authenticated;
revoke all on function private.on_consent_insert() from public, anon, authenticated;
revoke all on function private.on_profile_insert_consents() from public, anon, authenticated;
