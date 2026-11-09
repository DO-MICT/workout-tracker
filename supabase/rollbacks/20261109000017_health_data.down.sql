-- Rollback for 20261109000017_health_data.sql (WP9).
-- LOSES DATA: every injury note, limit and pain score in health_limits and pain_entries is dropped. Ask people to
-- export first (Profile › Download my data), or copy the two tables out, before rolling back.
-- Afterwards, remove the migration's row so it can be applied again:
--   delete from supabase_migrations.schema_migrations where version = '20261109000017';

-- export_my_data as WP8 left it (no health section)
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
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- the WP6 stub again
create or replace function private.delete_health_data(p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform p_uid;   -- no health tables yet
end;
$$;
revoke all on function private.delete_health_data(uuid) from public, anon, authenticated;

drop table if exists public.pain_entries;
drop table if exists public.health_limits;
drop function if exists private.pain_entries_cap();
drop function if exists private.health_limits_cap();
drop function if exists private.health_touch();
drop function if exists private.own_workout(uuid);
drop function if exists private.health_ok();
