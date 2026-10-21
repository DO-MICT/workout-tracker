-- Admins can review all suggestions (with sender and screenshot) and set their status.
-- Make someone an admin in the SQL editor: update public.profiles set is_admin = true where email = '...';

alter table public.profiles add column is_admin boolean not null default false;
-- (Users can only update display_name, so nobody can make themselves admin.)

create schema if not exists private;   -- not exposed through the API
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false);
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create policy "Admins read all profiles" on public.profiles
  for select to authenticated using ((select private.is_admin()));

create policy "Admins read all suggestions" on public.suggestions
  for select to authenticated using ((select private.is_admin()));
create policy "Admins update suggestion status" on public.suggestions
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant update (status) on public.suggestions to authenticated;

create policy "Admins view all screenshots" on storage.objects
  for select to authenticated using (bucket_id = 'suggestions' and (select private.is_admin()));
