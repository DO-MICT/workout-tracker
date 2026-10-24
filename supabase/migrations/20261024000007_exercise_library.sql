-- Exercise library: the shared catalogue of exercises (reference data, same for every user).
-- Source of truth is data/exercise-library/exercises.json; rows are loaded by data/exercise-library/exercises.sql.
--   * id matches the app's exercise ids, so workout_sets.exercise_id joins straight to it
--   * req uses the app's gear ids (comma = all of, | = any of), so equipment filtering works as in the app
--   * everyone can read it (signed in or not); only admins can change it

create table public.exercises (
  id text primary key check (id ~ '^[a-z0-9]{1,40}$'),
  name text not null check (char_length(name) between 1 and 120),
  aliases text[] not null default '{}',
  training_type text not null check (training_type in ('Strength', 'Calisthenics', 'Core', 'Balance', 'Power', 'Plyometric',
    'Strongman', 'Cardio', 'Combat', 'Mobility', 'Stretching', 'Recovery', 'Yoga', 'Pilates')),
  tags text[] not null default '{}',
  muscle_group text not null check (muscle_group in ('Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes', 'Core', 'Cardio', 'Mobility')),
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  movement_pattern text not null check (char_length(movement_pattern) <= 40),
  equipment text[] not null default '{}',
  req text not null default '' check (char_length(req) <= 200),
  equipment_tier smallint not null check (equipment_tier between 0 and 3),  -- 0 none, 1 minimal home, 2 home gym, 3 commercial gym
  difficulty text not null check (difficulty in ('Beginner', 'Intermediate', 'Advanced')),
  tracking text not null default 'w' check (tracking in ('w', 'bw', 'cardio', 'time', 'hold', 'count')),
  unilateral boolean not null default false,
  sets smallint not null default 3 check (sets between 1 and 20),
  reps text not null check (char_length(reps) <= 40),
  form_cues text[] not null default '{}',
  common_mistakes text[] not null default '{}',
  regressions text[] not null default '{}',
  progressions text[] not null default '{}',
  safety text not null default '',
  video text check (video ~ '^https://'),
  diagram text not null default '',
  notes text not null default '',
  active boolean not null default true,                 -- hide an exercise without deleting it
  updated_at timestamptz not null default now()
);
comment on table public.exercises is 'Shared exercise catalogue. Reference data: readable by all, edited by admins.';
create index exercises_type_idx on public.exercises (training_type, equipment_tier);
create index exercises_muscle_idx on public.exercises (muscle_group);

create trigger exercises_touch before update on public.exercises
  for each row execute function public.touch_updated_at();

alter table public.exercises enable row level security;

create policy "Anyone can read exercises" on public.exercises
  for select to anon, authenticated using (true);
create policy "Admins add exercises" on public.exercises
  for insert to authenticated with check ((select private.is_admin()));
create policy "Admins update exercises" on public.exercises
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins delete exercises" on public.exercises
  for delete to authenticated using ((select private.is_admin()));
