-- Structure checks for the per-record sync tables (WP3). Behaviour is in tests/db/rls-two-user.test.mjs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- 1. Every synced table has the sync columns.
select is(
  array(select t from unnest(array['user_settings', 'about_me', 'locations', 'plans', 'schedule_entries', 'measurements',
                                   'exercise_notes', 'custom_exercises', 'progress_photos']) t
        where (select count(*) from information_schema.columns c
               where c.table_schema = 'public' and c.table_name = t
                 and c.column_name in ('id', 'user_id', 'rev', 'change_seq', 'created_at', 'updated_at', 'deleted_at')) <> 7
        order by 1),
  '{}'::text[],
  'every synced table has id, user_id, rev, change_seq, created_at, updated_at, deleted_at');

-- 2. Every synced table stamps rev and change_seq by trigger.
select is(
  array(select t from unnest(array['user_settings', 'about_me', 'locations', 'plans', 'schedule_entries', 'measurements',
                                   'exercise_notes', 'custom_exercises', 'progress_photos']) t
        where not exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || t)::regclass and g.tgname = t || '_stamp')
        order by 1),
  '{}'::text[],
  'every synced table has its stamp trigger');

-- 3. The app only reads these tables; writes go through sync_push and migrate_from_blob.
select is(
  array(select table_name || ':' || grantee || ':' || privilege_type from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('user_settings', 'about_me', 'locations', 'plans', 'plan_versions', 'schedule_entries',
                             'measurements', 'exercise_notes', 'custom_exercises', 'progress_photos')
          and grantee in ('anon', 'authenticated')
          and not (grantee = 'authenticated' and privilege_type = 'SELECT')
        order by 1),
  '{}'::text[],
  'synced tables: authenticated can only select, anon nothing');

-- 4. Signed-in users can call the sync functions; signed-out visitors can't.
select ok(
  has_function_privilege('authenticated', 'public.sync_push(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.sync_pull(bigint, integer)', 'execute')
  and has_function_privilege('authenticated', 'public.migrate_from_blob(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.sync_push(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.sync_pull(bigint, integer)', 'execute')
  and not has_function_privilege('anon', 'public.migrate_from_blob(jsonb)', 'execute'),
  'sync functions: authenticated yes, anon no');

select * from finish();
rollback;
