-- Gear library: the shared catalogue of training equipment (reference data, same for every user).
-- Source of truth is data/gear-library/gear.json; rows are loaded by data/gear-library/gear.sql.
--   * id matches the app's gear ids, so saved gear lists and exercises.req match it
--   * app_group, group_order and sort_order give the Gear page its groups and order
--   * everyone can read it (signed in or not); only admins can change it

create table public.gear (
  id text primary key check (id ~ '^[a-z0-9]{1,40}$'),
  name text not null check (char_length(name) between 1 and 120),
  aliases text[] not null default '{}',
  keywords text not null default '' check (char_length(keywords) <= 300),
  category text not null check (char_length(category) <= 60),
  subcategory text not null default '' check (char_length(subcategory) <= 60),
  app_group text not null check (char_length(app_group) <= 60),
  group_order smallint not null default 0,
  sort_order smallint not null default 0,
  tier smallint not null check (tier between 0 and 3),  -- 0 none/household, 1 minimal home, 2 home gym, 3 commercial gym
  setting text not null check (setting in ('home', 'commercial', 'both')),
  description text not null default '',
  muscle_focus text[] not null default '{}',
  loading text not null default '',
  weight_options text not null default '',
  adjustability text not null default '',
  footprint jsonb,                                      -- {length_cm, width_cm, height_cm} or null for small items
  space text check (space in ('S', 'M', 'L', 'XL')),
  price_band text check (price_band in ('$', '$$', '$$$', '$$$$')),
  requires text[] not null default '{}',
  substitutes text[] not null default '{}',
  signature_exercises text[] not null default '{}',
  exercise_ids text[] not null default '{}',
  buying_tips text not null default '',
  safety text not null default '',
  active boolean not null default true,                 -- hide an item without deleting it
  updated_at timestamptz not null default now()
);
comment on table public.gear is 'Shared equipment catalogue. Reference data: readable by all, edited by admins.';
create index gear_group_idx on public.gear (group_order, sort_order);

create trigger gear_touch before update on public.gear
  for each row execute function public.touch_updated_at();

alter table public.gear enable row level security;

create policy "Anyone can read gear" on public.gear
  for select to anon, authenticated using (true);
create policy "Admins add gear" on public.gear
  for insert to authenticated with check ((select private.is_admin()));
create policy "Admins update gear" on public.gear
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins delete gear" on public.gear
  for delete to authenticated using ((select private.is_admin()));
