-- Workout history: every completed workout and each set in it.
-- Designed to be the long-term home for training data (web app now, native app later):
--   * ids are generated on the device, so a retry after a dropped connection never duplicates a workout
--   * plan / day / location / exercise names are copied in, so history still reads correctly
--     after a plan is renamed or deleted
--   * user_id and performed_at are repeated on each set so per-exercise progress is one indexed query

create table public.workouts (
  id uuid primary key,                                   -- generated on the device
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  performed_at timestamptz not null,                     -- when "Complete workout" was tapped
  started_at timestamptz,                                -- first set ticked, if known
  duration_sec integer check (duration_sec between 0 and 86400),
  plan_id text check (char_length(plan_id) <= 80),
  plan_name text check (char_length(plan_name) <= 80),
  day_id text check (char_length(day_id) <= 20),         -- mon..sun
  day_title text check (char_length(day_title) <= 80),
  location_id text check (char_length(location_id) <= 80),
  location_name text check (char_length(location_name) <= 80),
  set_count integer not null default 0 check (set_count >= 0),
  volume_kg numeric(12, 2) not null default 0,           -- sum of kg x reps for weighted sets
  notes text check (char_length(notes) <= 2000),
  source text not null default 'app' check (source in ('app', 'import')),
  app_version text check (char_length(app_version) <= 40),
  created_at timestamptz not null default now()
);
comment on table public.workouts is 'One row per completed workout. Names are snapshots so history survives plan changes.';
create index workouts_user_performed_idx on public.workouts (user_id, performed_at desc);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  performed_at timestamptz not null,                     -- copy of the workout's time, for progress queries
  exercise_id text not null check (char_length(exercise_id) between 1 and 80),
  exercise_name text not null check (char_length(exercise_name) between 1 and 120),
  muscle_group text check (char_length(muscle_group) <= 40),
  exercise_order smallint not null check (exercise_order between 0 and 199),  -- order of the exercise in the workout
  set_no smallint not null check (set_no between 1 and 50),
  measure text not null default 'w' check (measure in ('w', 'bw', 'cardio', 'time', 'hold', 'count')),
  weight numeric(8, 2) check (weight between -1000 and 5000),     -- kg (w), added kg (bw), km (cardio)
  reps numeric(8, 2) check (reps between 0 and 100000),           -- reps, minutes or seconds by measure
  done boolean not null default false,                            -- set was ticked off
  group_tag text check (group_tag in ('a', 'b', 'c')),            -- superset / circuit marker
  unique (workout_id, exercise_order, set_no)
);
comment on table public.workout_sets is 'Each logged set. measure says how to read weight and reps.';
create index workout_sets_workout_idx on public.workout_sets (workout_id);
create index workout_sets_user_exercise_idx on public.workout_sets (user_id, exercise_id, performed_at desc);

alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;

create policy "Read own workouts" on public.workouts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Add own workouts" on public.workouts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Delete own workouts" on public.workouts
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Read own sets" on public.workout_sets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Add own sets" on public.workout_sets
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid()))
  );
create policy "Delete own sets" on public.workout_sets
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.workouts, public.workout_sets from anon;
revoke update, truncate, references, trigger on public.workouts, public.workout_sets from authenticated;

-- Save a workout and its sets in one transaction. Safe to call again with the same id (does nothing).
-- Runs as the caller, so the policies above still apply.
create or replace function public.save_workout(w jsonb)
returns uuid
language plpgsql
security invoker
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
  if jsonb_typeof(sets) <> 'array' or jsonb_array_length(sets) > 600 then
    raise exception 'Invalid sets' using errcode = '22023';
  end if;
  wid := (w ->> 'id')::uuid;
  done_at := coalesce((w ->> 'performed_at')::timestamptz, now());

  insert into public.workouts (id, user_id, performed_at, started_at, duration_sec, plan_id, plan_name,
                               day_id, day_title, location_id, location_name, set_count, volume_kg,
                               notes, source, app_version)
  values (
    wid, uid, done_at,
    (w ->> 'started_at')::timestamptz,
    (w ->> 'duration_sec')::integer,
    w ->> 'plan_id', w ->> 'plan_name', w ->> 'day_id', w ->> 'day_title',
    w ->> 'location_id', w ->> 'location_name',
    jsonb_array_length(sets),
    coalesce((select sum((s ->> 'weight')::numeric * (s ->> 'reps')::numeric)
              from jsonb_array_elements(sets) s
              where coalesce(s ->> 'measure', 'w') = 'w'
                and s ->> 'weight' is not null and s ->> 'reps' is not null), 0),
    w ->> 'notes',
    coalesce(w ->> 'source', 'app'),
    w ->> 'app_version'
  )
  on conflict (id) do nothing;

  if not found then
    return wid;  -- already saved by an earlier attempt
  end if;

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

  return wid;
end;
$$;
comment on function public.save_workout(jsonb) is 'Insert a workout and its sets atomically; idempotent on the device-generated id.';

revoke execute on function public.save_workout(jsonb) from public, anon;
grant execute on function public.save_workout(jsonb) to authenticated;
