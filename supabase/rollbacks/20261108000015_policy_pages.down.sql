-- Rollback for 20261108000015_policy_pages.sql (WP7).
-- Unpublishes the terms and privacy versions, so the app stops asking. Consent records already given are kept.
-- Afterwards, remove the migration's row so it can be applied again:
--   delete from supabase_migrations.schema_migrations where version = '20261108000015';
update public.app_config
set value = value || '{"terms": "", "privacy": "", "terms_url": "", "privacy_url": ""}'::jsonb
where key = 'policies';
