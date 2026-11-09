-- Rollback for 20261108000011_sync_tables.sql (WP3).
-- LOSES DATA: every row in the synced tables (settings, about me, locations, plans and their versions,
-- schedule, measurements, notes, custom exercises, photo records) and profiles.data_model.
-- Users who had moved off the blob go back to their user_state row as it was when they moved
-- (it was read-only since then), so anything they changed after moving is lost.
-- Only for staging, or production in an emergency with a backup taken first.
-- Afterwards, remove the migration's row so it can be applied again:
--   delete from supabase_migrations.schema_migrations where version = '20261108000011';

drop function if exists public.migrate_from_blob(jsonb);
drop function if exists public.sync_pull(bigint, integer);
drop function if exists public.sync_push(jsonb);
drop function if exists private.sync_apply(uuid, jsonb, boolean);
drop function if exists private.merge_keys(jsonb, jsonb);
drop function if exists private.sync_purge_tombstones(interval);

-- user_state writable again for everyone
drop policy if exists "Insert own data" on public.user_state;
drop policy if exists "Update own data" on public.user_state;
create policy "Insert own data" on public.user_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own data" on public.user_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop trigger if exists workouts_stamp on public.workouts;
drop index if exists public.workouts_user_seq_idx;
alter table public.workouts drop column if exists change_seq;
drop function if exists private.stamp_change_seq();

drop table if exists public.plan_versions;
drop table if exists public.progress_photos;
drop table if exists public.custom_exercises;
drop table if exists public.exercise_notes;
drop table if exists public.measurements;
drop table if exists public.schedule_entries;
drop table if exists public.plans;
drop function if exists private.keep_plan_version();
drop table if exists public.locations;
drop table if exists public.about_me;
drop table if exists public.user_settings;
drop function if exists private.sync_stamp();
drop sequence if exists private.sync_change_seq;

alter table public.profiles drop column if exists data_model;
