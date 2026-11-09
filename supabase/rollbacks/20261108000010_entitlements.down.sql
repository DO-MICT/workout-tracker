-- Rollback for 20261108000010_entitlements.sql (WP1).
-- LOSES DATA: every trial, grant and purchase row in entitlements, and the trial ledger.
-- Only for staging, or production in an emergency with a backup taken first.
-- Afterwards, remove the migration's row so it can be applied again:
--   delete from supabase_migrations.schema_migrations where version = '20261108000010';

-- sign-up goes back to profile + data row only
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  insert into public.user_state (user_id) values (new.id);
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop function if exists public.admin_revoke(text, text);
drop function if exists public.admin_grant(text, text, text, int, text);
drop function if exists private.can_grant();
drop function if exists private.start_trial(uuid, text);
drop function if exists private.email_hash(text);
drop function if exists private.normalise_email(text);
drop table if exists private.trial_ledger;
drop table if exists private.app_secrets;
drop view if exists public.my_access;
drop table if exists public.entitlements;
drop table if exists public.tier_features;

comment on column public.profiles.tier is null;
comment on column public.profiles.tier_source is null;
