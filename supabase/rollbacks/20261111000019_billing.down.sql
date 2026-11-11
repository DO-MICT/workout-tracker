-- Rollback for 20261111000019_billing.sql (WP12).
-- Entitlement rows written by the billing webhook stay (people keep what they paid for); nothing new is written until
-- the migration is applied again. The webhook log is dropped.
-- Afterwards, remove the migration's row so it can be applied again:
--   delete from supabase_migrations.schema_migrations where version = '20261111000019';

-- my_access as in 000010 (a column can't be removed with create or replace, so drop and recreate)
drop view if exists public.my_access;
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

-- export_my_data as in 000017 (without billing_events)
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

drop function if exists public.billing_apply(uuid, jsonb, text[]);
drop table if exists public.billing_events;
