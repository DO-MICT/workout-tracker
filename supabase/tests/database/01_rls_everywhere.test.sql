-- Structure checks that hold for every table and function, now and in later migrations (NFR-7).
-- Run with: supabase test db   (the db-check workflow does this on every PR touching supabase/)
-- The two-user behaviour test is tests/db/rls-two-user.test.mjs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- 1. Every table the API can reach has row level security switched on.
select is(
  array(select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1),
  '{}'::text[],
  'every table in public has RLS enabled');

-- 2. Signed-out visitors can't write anything: no policy lets anon (or every role) insert, update or delete.
--    (Supabase grants anon table rights by default; with RLS on and no such policy they do nothing.)
select is(
  array(select tablename || ':' || policyname from pg_policies
        where schemaname in ('public', 'storage') and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
          and (roles && array['anon', 'public']::name[]) order by 1),
  '{}'::text[],
  'no write policy applies to signed-out visitors');

-- 3. Views run with the caller's rights, so RLS applies through them.
select is(
  array(select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'v'
          and not coalesce(c.reloptions @> array['security_invoker=on'] or c.reloptions @> array['security_invoker=true'], false)
        order by 1),
  '{}'::text[],
  'every public view is security_invoker');

-- 4. Security definer functions pin search_path, so nobody can hijack them with their own objects.
select is(
  array(select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
        order by 1),
  '{}'::text[],
  'every security definer function sets search_path');

-- 5. Nothing in private is callable by signed-out visitors.
select is(
  array(select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute') order by 1),
  '{}'::text[],
  'anon cannot execute any private function');

-- 6. Rights are written only by server code: the app role can only read them.
select is(
  array(select table_name || ':' || privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name in ('entitlements', 'tier_features')
          and grantee = 'authenticated' and privilege_type <> 'SELECT' order by 1),
  '{}'::text[],
  'authenticated can only select entitlements and tier_features');

-- 7. Private tables are closed to the API roles.
select is(
  array(select table_name::text from information_schema.role_table_grants
        where table_schema = 'private' and grantee in ('anon', 'authenticated') order by 1),
  '{}'::text[],
  'no API role has table rights in private');

select * from finish();
rollback;
