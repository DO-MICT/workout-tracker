-- WP4: kg or lb. Weights stay in kg; the app converts for people who picked pounds (user_settings.units).
-- A weight typed in lb is kept in kg to 3 decimals, so 45 lb (20.412 kg) shows as 45 lb again.
-- workout_sets.weight held 2 decimals (45 lb -> 20.41 kg -> 44.996 lb), so it gets a third.
-- Existing values keep their value; the check on the range stays as it was.
alter table public.workout_sets alter column weight type numeric(9, 3);

comment on column public.workout_sets.weight is
  'kg for weighted sets (w) and added weight (bw), km for cardio. 3 decimals so pounds typed in the app round-trip. Shown in lb when user_settings.units = lb.';
comment on column public.user_settings.units is
  'kg or lb: only what the app shows and takes in. Every weight in the database is kg (body weight too).';
