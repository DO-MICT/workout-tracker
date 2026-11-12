-- WP12: billing through RevenueCat (Google Play now, Paddle on the web in WP13).
-- RevenueCat knows what each person bought; the Edge Function supabase/functions/billing-webhook turns that into
-- rows in public.entitlements (sources 'play', 'web', 'lifetime'), which my_access already reads.
-- The function is the only writer of these sources: it calls public.billing_apply as service_role.
--
-- billing_events   every RevenueCat webhook we accepted, once (its event id), so a retried webhook does nothing twice.
--                  Holds the event type, store and product only: no emails or subscriber attributes.
-- export_my_data   now includes the person's billing_events.
-- billing_apply    sets a person's store-bought entitlements to exactly what RevenueCat says, in one go.
-- my_access        gains product_id at the end, so the app can tell a yearly plan from a monthly one.

-- ---------- webhook log ----------
create table public.billing_events (
  id text primary key,                     -- RevenueCat event id
  user_id uuid references auth.users (id) on delete cascade,   -- goes with the account (Google and RevenueCat keep the receipts)
  type text not null,                      -- INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, ...
  store text,                              -- PLAY_STORE, PADDLE, RC_BILLING, ...
  product_id text,
  environment text,                        -- SANDBOX or PRODUCTION
  event_at timestamptz,
  received_at timestamptz not null default now(),
  result text                              -- what the function did: applied, no user, skipped, error: ...
);
comment on table public.billing_events is 'RevenueCat webhooks received by the billing-webhook Edge Function (one row per event id). Server only.';
create index billing_events_user_idx on public.billing_events (user_id);

alter table public.billing_events enable row level security;
-- no policies: only service_role (which skips RLS) reads or writes it; admins look in the SQL editor
revoke all on public.billing_events from anon, authenticated;

-- ---------- billing_apply ----------
-- p_rows: a JSON array of the store entitlements this person has right now, one per source, e.g.
--   [{"source":"play","product_id":"gfd_pro:monthly","starts_at":"...","expires_at":"...","status":"active",
--     "will_renew":true,"external_ref":"GPA.1234","note":"Google Play"}]
-- Sources in p_managed that are missing from p_rows are ended (status 'revoked'), so a refund, a transfer to another
-- account or a lapsed plan can't leave Pro behind. Other sources (trial, admin, promo, couple) are never touched.
-- Returns false if the account doesn't exist (deleted, or a RevenueCat id that isn't one of ours).
create or replace function public.billing_apply(p_user uuid, p_rows jsonb, p_managed text[] default '{play,web,lifetime}')
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  src text;
  seen text[] := '{}'::text[];
begin
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then return false; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'p_rows must be a JSON array'; end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    src := r->>'source';
    if src is null or not (src = any (p_managed)) then raise exception 'source % is not managed here', src; end if;
    if src = any (seen) then continue; end if;   -- one row per source; the caller sends the best one first
    seen := seen || src;
    insert into public.entitlements as e (user_id, tier, source, product_id, starts_at, expires_at, status, will_renew, external_ref, note)
    values (
      p_user,
      coalesce(r->>'tier', 'pro'),
      src,
      r->>'product_id',
      coalesce((r->>'starts_at')::timestamptz, now()),
      (r->>'expires_at')::timestamptz,
      coalesce(r->>'status', 'active'),
      coalesce((r->>'will_renew')::boolean, false),
      r->>'external_ref',
      r->>'note'
    )
    on conflict (user_id, source) do update set
      tier = excluded.tier, product_id = excluded.product_id, starts_at = excluded.starts_at,
      expires_at = excluded.expires_at, status = excluded.status, will_renew = excluded.will_renew,
      external_ref = excluded.external_ref, note = excluded.note
    where (e.tier, e.product_id, e.starts_at, e.expires_at, e.status, e.will_renew, e.external_ref, e.note)
      is distinct from (excluded.tier, excluded.product_id, excluded.starts_at, excluded.expires_at, excluded.status,
                        excluded.will_renew, excluded.external_ref, excluded.note);
  end loop;

  update public.entitlements e
     set status = 'revoked', will_renew = false
   where e.user_id = p_user
     and e.source = any (p_managed)
     and not (e.source = any (seen))
     and e.status in ('active', 'grace', 'paused');
  return true;
end;
$$;
comment on function public.billing_apply(uuid, jsonb, text[]) is 'Sets a person''s store-bought entitlements (play, web, lifetime) to what RevenueCat reports. service_role only (billing-webhook).';
revoke all on function public.billing_apply(uuid, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.billing_apply(uuid, jsonb, text[]) to service_role;

-- ---------- my_access + product_id ----------
-- Same view as in 000010 with one column added at the end (create or replace allows only that).
create or replace view public.my_access with (security_invoker = on) as
select
  u.uid as user_id,
  coalesce(b.tier, 'free') as tier,
  coalesce(b.source, 'none') as source,
  b.starts_at,
  b.expires_at as ends_at,
  coalesce(b.will_renew, false) as will_renew,
  coalesce(f.features, '{}') as features,
  now() as checked_at,
  b.product_id
from (select auth.uid() as uid) u
left join lateral (
  select e.tier, e.source, e.starts_at, e.expires_at, e.will_renew, e.product_id
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
comment on view public.my_access is 'The signed-in user''s best active tier, when it ends, why, its feature keys and (for store plans) the product.';
revoke all on public.my_access from anon, authenticated;
grant select on public.my_access to authenticated;

-- ---------- export_my_data + billing_events ----------
-- Same as in 000017 with billing_events added to tables.
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
      'deletion_requests',(select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' - 'last_error'), '[]') from public.deletion_requests t where t.user_id = uid),
      'billing_events',   (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.received_at), '[]') from public.billing_events t where t.user_id = uid)
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
