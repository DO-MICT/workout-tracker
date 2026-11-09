-- WP14: the Free plan cap, Pro-only rows, and downgrade without loss (D13, D20; architecture 5.3 and 5.4).
--
-- * Free keeps up to 3 of its own plans in use (app_config.free_limits.plans, so the cap can be raised without a
--   release). Built-in plans and your edits to them (plans.source_template set) are never counted or locked.
-- * The cap lives in a trigger on public.plans, so it holds however a row arrives (sync_push, migrate_from_blob,
--   choose_plans). It never refuses a sync write, because a refused write is lost on the phone:
--     - a new plan over the cap is saved read-only (nothing lost; the app shows the upgrade page before this happens)
--     - a change to a read-only plan keeps the plan as it was, and the attempted version goes to plan_versions
--       (a reorder, a delete or keeping it are fine)
--   Only an explicit unlock over the cap is refused (choose_plans locks the others first, so it never hits this).
-- * When the best tier drops to Free (trial end, cancel, refund), apply_plan_limits(user) keeps the active plan and
--   the two most recently trained and makes the rest read-only. It runs when an entitlement row changes, when the app
--   opens (my_plan_access), and nightly for trials that ran out on their own (pg_cron, where available).
--   Nothing is deleted. Pro again unlocks everything.
-- * choose_plans(local_ids) lets a Free user pick which 3 stay in use.
-- * New progress photo rows need the photos feature (F10 adds the files and the bucket policy).
-- * Full stats, timed workouts, progression and the extra measurement sites are gated in the app (access.js): the
--   data is the user's own and costs nothing to serve (architecture 5.3). The basic sites are in
--   app_config.free_limits.measure_sites.

create schema if not exists private;

insert into public.app_config (key, value, note) values
  ('free_limits', '{"plans": 3, "measure_sites": ["weight", "waist", "chest", "hips"]}',
   'What Free includes (WP14). plans: own plans in use at once. measure_sites: body measurement sites Free can log (height is always open). Raise plans with: update public.app_config set value = jsonb_set(value, ''{plans}'', ''5'') where key = ''free_limits'';')
on conflict (key) do nothing;

-- ---------- helpers ----------
create or replace function private.free_plan_limit()
returns integer language plpgsql stable security definer set search_path = '' as $$
declare n integer;
begin
  select (c.value ->> 'plans')::integer into n from public.app_config c where c.key = 'free_limits';
  return least(greatest(coalesce(n, 3), 1), 1000);
exception when others then
  return 3;
end;
$$;

-- the feature keys of a user's best active entitlement (the same choice my_access makes)
create or replace function private.user_features(uid uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce((
    select t.features
      from public.entitlements e
      join public.tier_features t on t.tier = e.tier
     where e.user_id = uid
       and e.status in ('active', 'grace')
       and e.starts_at <= now()
       and (e.expires_at is null or e.expires_at > now())
     order by t.rank desc, e.expires_at desc nulls first
     limit 1), '{}'::text[]);
$$;

create or replace function private.has_feature(uid uuid, feature text)
returns boolean language sql stable security definer set search_path = '' as $$
  select feature = any(private.user_features(uid));
$$;

-- every writer to a synced table holds this lock, so sync_pull never skips a change (see sync_push)
create or replace function private.sync_lock(uid uuid)
returns void language sql security definer set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('gfd-sync:' || uid::text, 0));
$$;

revoke all on function private.free_plan_limit() from public, anon, authenticated;
revoke all on function private.user_features(uuid) from public, anon, authenticated;
revoke all on function private.has_feature(uuid, text) from public, anon, authenticated;
revoke all on function private.sync_lock(uuid) from public, anon, authenticated;

-- ---------- the cap ----------
create or replace function private.plans_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cap integer;
  others integer;
  was_usable boolean := false;
begin
  -- built-in plans (and your edits to them) are always open
  if new.source_template is not null then
    new.read_only := false;
    return new;
  end if;
  -- Pro has no read-only plans
  if private.has_feature(new.user_id, 'plans.unlimited') then
    new.read_only := false;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    was_usable := old.source_template is null and old.deleted_at is null and not old.read_only;
    -- a read-only plan can be deleted, kept or moved in the list (body.pos), but not changed
    if old.read_only and old.deleted_at is null and new.deleted_at is null
       and ((new.body - 'pos') is distinct from (old.body - 'pos') or new.name is distinct from old.name) then
      insert into public.plan_versions (plan_id, user_id, rev, body) values (old.id, old.user_id, old.rev, new.body);
      delete from public.plan_versions v
       where v.plan_id = old.id
         and v.id not in (select k.id from public.plan_versions k where k.plan_id = old.id order by k.saved_at desc, k.rev desc limit 20);
      new.body := case when new.body ? 'pos' then old.body || jsonb_build_object('pos', new.body -> 'pos') else old.body end;
      new.name := old.name;
    end if;
  end if;

  if new.deleted_at is null and not new.read_only and not was_usable then
    cap := private.free_plan_limit();
    select count(*) into others
      from public.plans p
     where p.user_id = new.user_id and p.id <> new.id
       and p.source_template is null and p.deleted_at is null and not p.read_only;
    if others >= cap then
      if tg_op = 'UPDATE' and old.read_only and old.deleted_at is null then
        raise exception 'plan_limit: Free keeps % plans in use. Pick which ones, or upgrade to Pro.', cap using errcode = 'P0001';
      end if;
      new.read_only := true;   -- saved, but read-only until the user picks it or upgrades
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.plans_limit() from public, anon, authenticated;

-- fires before plans_stamp (triggers run in name order), so the stamp still bumps rev and change_seq
create trigger plans_limit before insert or update on public.plans
  for each row execute function private.plans_limit();

-- ---------- downgrade and upgrade ----------
-- Pro: unlock every plan. Free: if more than the cap are in use, keep the active plan and the most recently trained,
-- make the rest read-only. Never unlocks on Free (the user picks with choose_plans). Caller holds the sync lock.
create or replace function private.apply_plan_limits(uid uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  cap integer;
  n integer;
  active text;
begin
  if uid is null then return 0; end if;
  if private.has_feature(uid, 'plans.unlimited') then
    update public.plans set read_only = false where user_id = uid and read_only;
    get diagnostics n = row_count;
    return n;
  end if;
  cap := private.free_plan_limit();
  select count(*) into n from public.plans p
   where p.user_id = uid and p.source_template is null and p.deleted_at is null and not p.read_only;
  if n <= cap then return 0; end if;
  select s.active_plan into active from public.user_settings s where s.user_id = uid;
  with ranked as (
    select p.id,
           row_number() over (order by
             coalesce(p.local_id = active, false) desc,
             (select max(w.performed_at) from public.workouts w where w.user_id = uid and w.plan_id = p.local_id) desc nulls last,
             p.updated_at desc,
             p.id) as k
      from public.plans p
     where p.user_id = uid and p.source_template is null and p.deleted_at is null and not p.read_only
  )
  update public.plans p set read_only = true from ranked r where p.id = r.id and r.k > cap;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function private.apply_plan_limits(uuid) from public, anon, authenticated;

-- what the app needs to draw the plans page
create or replace function private.plan_state(uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'unlimited', private.has_feature(uid, 'plans.unlimited'),
    'limit', private.free_plan_limit(),
    'in_use', (select count(*) from public.plans p
                where p.user_id = uid and p.source_template is null and p.deleted_at is null and not p.read_only),
    'locked', coalesce((select jsonb_agg(p.local_id order by p.local_id) from public.plans p
                where p.user_id = uid and p.source_template is null and p.deleted_at is null and p.read_only), '[]'::jsonb));
$$;
revoke all on function private.plan_state(uuid) from public, anon, authenticated;

-- an entitlement changed (purchase, refund, admin grant or revoke, trial row): lock or unlock now
create or replace function private.entitlements_plan_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid := coalesce(new.user_id, old.user_id);
begin
  -- an account being deleted takes its entitlements and plans with it: nothing to do
  if not exists (select 1 from auth.users u where u.id = uid) then return null; end if;
  perform private.sync_lock(uid);
  perform private.apply_plan_limits(uid);
  return null;
end;
$$;
revoke all on function private.entitlements_plan_limits() from public, anon, authenticated;

create trigger entitlements_plan_limits after insert or update or delete on public.entitlements
  for each row execute function private.entitlements_plan_limits();

-- nightly: trials and plans that ran out by themselves (no row changed, so no trigger fired)
create or replace function private.apply_due_plan_limits()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  n integer := 0;
begin
  for uid in
    select p.user_id from public.plans p
     where p.source_template is null and p.deleted_at is null and not p.read_only
     group by p.user_id
    having count(*) > private.free_plan_limit()
  loop
    if not private.has_feature(uid, 'plans.unlimited') then
      perform private.sync_lock(uid);
      perform private.apply_plan_limits(uid);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function private.apply_due_plan_limits() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('gfd-plan-limits', '17 3 * * *', 'select private.apply_due_plan_limits()');
  end if;
exception when others then
  raise notice 'Nightly plan check not scheduled (%). The app still applies it on open.', sqlerrm;
end;
$$;

-- ---------- what the app calls ----------
-- Applies the limits for the signed-in user (cheap when nothing changed) and returns
-- {unlimited, limit, in_use, locked: [local_id]}.
create or replace function public.my_plan_access()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  perform private.sync_lock(uid);
  perform private.apply_plan_limits(uid);
  return private.plan_state(uid);
end;
$$;
revoke all on function public.my_plan_access() from public, anon;
grant execute on function public.my_plan_access() to authenticated;

-- Free: keep these plans (local ids, up to the cap) in use and make the rest of your own plans read-only.
-- Pro: everything is unlocked whatever you pass. Returns the same as my_plan_access.
create or replace function public.choose_plans(p_keep text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  keep text[];
  cap integer;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  perform private.sync_lock(uid);
  if private.has_feature(uid, 'plans.unlimited') then
    perform private.apply_plan_limits(uid);
    return private.plan_state(uid);
  end if;
  cap := private.free_plan_limit();
  select coalesce(array_agg(distinct p.local_id), '{}') into keep
    from public.plans p
   where p.user_id = uid and p.source_template is null and p.deleted_at is null
     and p.local_id = any(coalesce(p_keep, '{}'));
  if cardinality(keep) > cap then
    raise exception 'Pick up to % plans', cap using errcode = '22023';
  end if;
  -- lock first, so the unlocks below never go over the cap
  update public.plans set read_only = true
   where user_id = uid and source_template is null and deleted_at is null and not read_only and not (local_id = any(keep));
  update public.plans set read_only = false
   where user_id = uid and source_template is null and deleted_at is null and read_only and local_id = any(keep);
  return private.plan_state(uid);
end;
$$;
revoke all on function public.choose_plans(text[]) from public, anon;
grant execute on function public.choose_plans(text[]) to authenticated;

-- ---------- progress photos are Pro ----------
-- New photo rows need the photos feature; existing rows stay (and can be deleted) after Pro ends.
create or replace function private.progress_photos_pro()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' or (old.deleted_at is not null and new.deleted_at is null))
     and not private.has_feature(new.user_id, 'photos') then
    raise exception 'pro_required: progress photos are part of Pro' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.progress_photos_pro() from public, anon, authenticated;
create trigger progress_photos_pro before insert or update on public.progress_photos
  for each row execute function private.progress_photos_pro();

comment on column public.plans.read_only is 'Set by the server (WP14): a Free account''s plan beyond the cap. Kept, viewable, not editable. Pick with choose_plans or upgrade.';
