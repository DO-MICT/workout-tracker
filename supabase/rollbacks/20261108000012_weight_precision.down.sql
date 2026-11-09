-- Rollback for 20261108000012_weight_precision.sql (WP4).
-- Rounds every set weight back to 2 decimals (at most 0.005 kg, about 0.01 lb). Nothing else is lost.
-- Afterwards, remove the migration's row so it can be applied again:
--   delete from supabase_migrations.schema_migrations where version = '20261108000012';
alter table public.workout_sets alter column weight type numeric(8, 2);
comment on column public.workout_sets.weight is null;
comment on column public.user_settings.units is null;
