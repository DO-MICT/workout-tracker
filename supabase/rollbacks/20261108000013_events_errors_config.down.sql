-- Rollback for 20261108000013_events_errors_config.sql (WP5).
-- LOSES DATA: every usage event, logged error and app config row is deleted.
-- Afterwards, remove the migration's row so it can be applied again:
--   delete from supabase_migrations.schema_migrations where version = '20261108000013';
drop trigger if exists profiles_event_insert on public.profiles;
drop trigger if exists profiles_event_delete on public.profiles;
drop trigger if exists entitlements_event_insert on public.entitlements;

drop function if exists public.admin_usage(int);
drop function if exists public.admin_errors(int);
drop function if exists public.log_event(text, uuid, jsonb, text, text, timestamptz);
drop function if exists public.log_client_error(text, uuid, text, text, text, text);
drop function if exists private.on_profile_insert_event();
drop function if exists private.on_profile_delete_event();
drop function if exists private.on_entitlement_insert_event();
drop function if exists private.purge_logs();
drop function if exists private.server_event(text, jsonb);
drop function if exists private.props_ok(jsonb);
drop function if exists private.client_event_names();
drop function if exists private.scrub(text, int);

drop table if exists public.app_config;
drop table if exists public.client_errors;
drop table if exists public.events;
-- private.sync_purge_tombstones keeps its written-out form: it does the same as WP3's loop.
