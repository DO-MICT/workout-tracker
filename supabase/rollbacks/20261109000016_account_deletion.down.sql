-- Rollback for 20261109000016_account_deletion.sql (WP8).
-- LOSES DATA: pending deletion requests are forgotten, so those accounts are kept. Tell the people who asked
-- (or delete them by hand in Authentication > Users) before rolling back.
-- Afterwards, remove the migration's row so it can be applied again:
--   delete from supabase_migrations.schema_migrations where version = '20261109000016';
drop function if exists public.export_my_data();
drop function if exists public.cancel_account_deletion();
drop function if exists public.request_account_deletion(text);
drop function if exists private.deletion_grace();
drop table if exists public.deletion_requests;
