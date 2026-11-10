-- Structure checks for account deletion and data export (WP8).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select is(
  array(select privilege_type::text from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'deletion_requests' and grantee = 'authenticated' order by 1),
  array['SELECT'],
  'the app only reads its deletion request; it asks and cancels through functions');
select is(
  array(select privilege_type::text from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'deletion_requests' and grantee = 'anon' order by 1),
  '{}'::text[],
  'signed-out visitors have no rights on deletion requests');
select ok(not has_function_privilege('anon', 'public.request_account_deletion(text)', 'execute'), 'anon cannot ask to delete');
select ok(not has_function_privilege('anon', 'public.export_my_data()', 'execute'), 'anon cannot export');
select ok(has_function_privilege('authenticated', 'public.export_my_data()', 'execute'), 'signed-in people can export');

-- every table that holds a user's rows is in the export (a new table must be added to export_my_data on purpose)
select is(
  array(select c.table_name::text
        from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
        where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'
          and position('public.' || c.table_name || ' t ' in
                       (select prosrc from pg_proc where oid = 'public.export_my_data()'::regprocedure)) = 0
        order by 1),
  '{}'::text[],
  'export_my_data covers every public table with a user_id');

-- every table with a user_id is removed with the auth user (cascade), so deleting the auth user deletes everything
select is(
  array(select c.table_name::text
        from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
        where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'
          and not exists (
            select 1 from pg_constraint k
            join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
            where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.confdeltype = 'c'
              and k.conrelid = format('public.%I', c.table_name)::regclass and a.attname = 'user_id')
        order by 1),
  '{}'::text[],
  'every user_id column cascades from auth.users');

-- asking, asking again, cancelling
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000d1', 'delete-test@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000d1", "role": "authenticated"}';
select ok((select due_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'
           from public.request_account_deletion('android')), 'a request is due in 7 days');
select is((select (public.export_my_data() -> 'account' ->> 'email')), 'delete-test@example.com', 'the export has the account');
select ok(public.cancel_account_deletion(), 'cancelling removes the request');
reset role;

delete from auth.users where id = '00000000-0000-4000-8000-0000000000d1';
select is((select count(*)::int from public.deletion_requests where user_id = '00000000-0000-4000-8000-0000000000d1'), 0,
  'the request goes with the account');

select * from finish();
rollback;
