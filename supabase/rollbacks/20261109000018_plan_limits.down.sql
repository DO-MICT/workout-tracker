-- Rollback for 20261109000018_plan_limits.sql (WP14).
-- Loses no data: plans keep their rows and bodies. Plans marked read-only stay marked (the column is WP3's), but
-- nothing reads the flag without WP14, so they behave as normal plans again. Attempted edits saved to plan_versions
-- while a plan was read-only stay there.
-- The pg_cron extension is left installed; only this migration's job is removed.
-- Afterwards, remove the migration's row so it can be applied again:
--   delete from supabase_migrations.schema_migrations where version = '20261109000018';

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'gfd-plan-limits';
  end if;
exception when others then
  raise notice 'Could not remove the nightly plan job: %', sqlerrm;
end;
$$;

drop trigger if exists progress_photos_pro on public.progress_photos;
drop trigger if exists entitlements_plan_limits on public.entitlements;
drop trigger if exists plans_limit on public.plans;

drop function if exists public.choose_plans(text[]);
drop function if exists public.my_plan_access();
drop function if exists private.progress_photos_pro();
drop function if exists private.apply_due_plan_limits();
drop function if exists private.entitlements_plan_limits();
drop function if exists private.plan_state(uuid);
drop function if exists private.apply_plan_limits(uuid);
drop function if exists private.plans_limit();
drop function if exists private.sync_lock(uuid);
drop function if exists private.has_feature(uuid, text);
drop function if exists private.user_features(uuid);
drop function if exists private.free_plan_limit();

delete from public.app_config where key = 'free_limits';

comment on column public.plans.read_only is null;
