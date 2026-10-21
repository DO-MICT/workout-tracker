-- Stage 1: one profile and one data row per signed-in user. (Applied to project zdllpjrkwcdmcuizxuum.)

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  tier text not null default 'tester' check (tier in ('free', 'pro', 'tester')),
  tier_source text not null default 'placeholder',   -- later: 'revenuecat'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per user. Tier is set by the server (later by RevenueCat), never by the app.';

create table public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  client_ts bigint not null default 0,               -- the app's own save time, used for newest-save-wins
  schema_version int not null default 1,
  updated_at timestamptz not null default now()
);
comment on table public.user_state is 'The app data bundle per user. Stage 2 will split this into proper tables.';

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger user_state_touch before update on public.user_state
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  insert into public.user_state (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_state enable row level security;

create policy "Read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Read own data" on public.user_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own data" on public.user_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own data" on public.user_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own data" on public.user_state
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Users may only change their display name; email and tier are server-managed.
revoke update on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated;
revoke all on public.profiles from anon;
revoke all on public.user_state from anon;
