-- Structure checks for kg or lb (WP4): weights are kg, with room for pounds to round-trip.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select is(
  (select numeric_scale from information_schema.columns
    where table_schema = 'public' and table_name = 'workout_sets' and column_name = 'weight')::integer,
  3, 'workout_sets.weight keeps 3 decimals');

select is((20.4117)::numeric(9, 3), 20.412::numeric, '45 lb is kept as 20.412 kg');

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'user_settings' and column_name = 'units'),
  '''kg''::text', 'units default to kg');

select * from finish();
rollback;
