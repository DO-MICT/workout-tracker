-- Structure checks for consent records (WP6).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select is(
  array(select privilege_type::text from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'consents' and grantee = 'authenticated' order by 1),
  array['SELECT'],
  'the app only reads consents; writes go through give_consent and withdraw_consent');
select is(
  array(select privilege_type::text from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'consents' and grantee = 'anon' order by 1),
  '{}'::text[],
  'signed-out visitors have no rights on consents');
select ok(not has_function_privilege('anon', 'public.give_consent(text, text, text)', 'execute'), 'anon cannot give consent');
select ok(not has_function_privilege('authenticated', 'private.has_consent(uuid, text)', 'execute'), 'has_consent is not on the API');
select has_trigger('public', 'consents', 'consents_no_update', 'consent rows cannot be edited');
select has_trigger('public', 'consents', 'consents_after_insert', 'withdrawing health consent deletes health data');
select has_trigger('public', 'profiles', 'profiles_consents_insert', 'sign-up records the consents on the form');

-- terms and privacy stay unpublished until WP7
select is((select value ->> 'terms' from public.app_config where key = 'policies'), '', 'terms not published yet');
select isnt((select value ->> 'health' from public.app_config where key = 'policies'), '', 'health text has a version');

-- has_consent follows the newest row
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000c1', 'consent-test@example.com');
select ok(not private.has_consent('00000000-0000-4000-8000-0000000000c1', 'health'), 'no row: no consent');
insert into public.consents (user_id, kind, version) values ('00000000-0000-4000-8000-0000000000c1', 'health', '2026.11.08');
select ok(private.has_consent('00000000-0000-4000-8000-0000000000c1', 'health'), 'given: consent');
insert into public.consents (user_id, kind, version, withdrawn_at) values ('00000000-0000-4000-8000-0000000000c1', 'health', '2026.11.08', now());
select ok(not private.has_consent('00000000-0000-4000-8000-0000000000c1', 'health'), 'withdrawn: no consent');

select throws_ok(
  $$update public.consents set withdrawn_at = null where user_id = '00000000-0000-4000-8000-0000000000c1'$$,
  '42501', null, 'even the database owner cannot edit a consent row');

-- deleting the account removes its consent rows
delete from auth.users where id = '00000000-0000-4000-8000-0000000000c1';
select is((select count(*)::int from public.consents where user_id = '00000000-0000-4000-8000-0000000000c1'), 0,
  'consents go with the account');

select * from finish();
rollback;
