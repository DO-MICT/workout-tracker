-- WP2, run ONCE in the production SQL editor (project "Workout tracker").
-- It changes no tables or data. It only fixes the list of applied migrations so the new
-- "Deploy database" workflow knows production is already up to date.
-- (The early migrations were run by hand and were recorded under different numbers;
--  update_workout and entitlements were run by hand and not recorded at all.)

begin;

delete from supabase_migrations.schema_migrations
where version in ('20261021091616', '20261021091718', '20261021095730', '20261021101208',
                  '20261021101605', '20261021123841', '20261024100635', '20261024170931');

insert into supabase_migrations.schema_migrations (version, name) values
  ('20261021000001', 'stage1_profiles_and_user_state'),
  ('20261021000002', 'lock_internal_functions'),
  ('20261021000003', 'suggestions_and_screenshots'),
  ('20261021000004', 'admin_role_and_feedback_access'),
  ('20261021000005', 'suggestion_replies'),
  ('20261021000006', 'workout_history'),
  ('20261024000007', 'exercise_library'),
  ('20261024000008', 'gear_library'),
  ('20261105000009', 'update_workout'),
  ('20261108000010', 'entitlements')
on conflict (version) do nothing;

commit;

-- You should see 10 rows, 20261021000001 to 20261108000010:
select version, name from supabase_migrations.schema_migrations order by version;
