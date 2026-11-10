-- Rollback for 20261108000014_consents.sql (WP6).
-- LOSES DATA: every consent record is deleted. Only roll back if nobody has relied on them yet.
-- Afterwards, remove the migration's row so it can be applied again:
--   delete from supabase_migrations.schema_migrations where version = '20261108000014';
drop trigger if exists profiles_consents_insert on public.profiles;

drop function if exists public.give_consent(text, text, text);
drop function if exists public.withdraw_consent(text, text);
drop view if exists public.my_consents;
drop function if exists private.consent_latest(uuid, text);
drop table if exists public.consents;

drop function if exists private.on_profile_insert_consents();
drop function if exists private.on_consent_insert();
drop function if exists private.delete_health_data(uuid);
drop function if exists private.has_consent(uuid, text);
drop function if exists private.policy_version(text);
drop function if exists private.consents_no_update();

delete from public.app_config where key = 'policies';
