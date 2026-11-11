-- Rollback for 20261111000022_workout_time.sql (F1.E4.S1).
-- Puts back update_workout as it was (sets only; performed_at is ignored again). Loses no data: workouts that
-- were moved to another date keep their new date.
-- Afterwards, remove the migration's row so it can be applied again:
--   delete from supabase_migrations.schema_migrations where version = '20261111000022';

create or replace function public.update_workout(w jsonb)
returns uuid
language plpgsql
security definer          -- needed to update workouts (UPDATE is revoked from clients); ownership is checked below
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  wid uuid;
  sets jsonb := coalesce(w -> 'sets', '[]'::jsonb);
  done_at timestamptz;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if jsonb_typeof(sets) <> 'array' or jsonb_array_length(sets) = 0 or jsonb_array_length(sets) > 600 then
    raise exception 'Invalid sets' using errcode = '22023';
  end if;
  wid := (w ->> 'id')::uuid;

  -- only the owner's workout; lock it so two edits can't interleave
  select performed_at into done_at
  from public.workouts
  where id = wid and user_id = uid
  for update;
  if not found then
    raise exception 'Workout not found' using errcode = 'P0002';
  end if;

  delete from public.workout_sets where workout_id = wid;

  insert into public.workout_sets (workout_id, user_id, performed_at, exercise_id, exercise_name, muscle_group,
                                   exercise_order, set_no, measure, weight, reps, done, group_tag)
  select wid, uid, done_at,
         s ->> 'exercise_id', s ->> 'exercise_name', s ->> 'muscle_group',
         (s ->> 'exercise_order')::smallint, (s ->> 'set_no')::smallint,
         coalesce(s ->> 'measure', 'w'),
         (s ->> 'weight')::numeric, (s ->> 'reps')::numeric,
         coalesce((s ->> 'done')::boolean, false),
         s ->> 'group_tag'
  from jsonb_array_elements(sets) s;

  update public.workouts
  set set_count = jsonb_array_length(sets),
      volume_kg = coalesce((select sum((s ->> 'weight')::numeric * (s ->> 'reps')::numeric)
                            from jsonb_array_elements(sets) s
                            where coalesce(s ->> 'measure', 'w') = 'w'
                              and s ->> 'weight' is not null and s ->> 'reps' is not null), 0),
      edited_at = now()
  where id = wid;

  return wid;
end;
$$;
comment on function public.update_workout(jsonb) is 'Replace the sets of one of your own workouts and recalculate its totals; safe to repeat.';

revoke execute on function public.update_workout(jsonb) from public, anon;
grant execute on function public.update_workout(jsonb) to authenticated;
