-- Structure and behaviour checks for health details (WP9, NFR-6).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select is(
  array(select table_name || ':' || privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name in ('health_limits', 'pain_entries') and grantee = 'anon' order by 1),
  '{}'::text[],
  'signed-out visitors have no rights on the health tables');
select ok(not has_function_privilege('authenticated', 'private.has_consent(uuid, text)', 'execute'), 'has_consent stays off the API');
select ok(not has_function_privilege('anon', 'private.health_ok()', 'execute'), 'anon cannot use health_ok');
select is(
  array(select tablename::text || ':' || cmd from pg_policies
        where schemaname = 'public' and tablename in ('health_limits', 'pain_entries')
          and not (coalesce(qual, '') like '%health_ok()%' or coalesce(with_check, '') like '%health_ok()%')
        order by 1),
  '{}'::text[],
  'every health policy needs active health consent');
select ok(position('health_limits' in (select prosrc from pg_proc where oid = 'private.delete_health_data(uuid)'::regprocedure)) > 0
      and position('pain_entries' in (select prosrc from pg_proc where oid = 'private.delete_health_data(uuid)'::regprocedure)) > 0,
  'withdrawing consent deletes both health tables');

-- two people: H agrees, N never does
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'health-yes@example.com'),
  ('00000000-0000-4000-8000-0000000000e2', 'health-no@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e2", "role": "authenticated"}';
select throws_ok($$insert into public.health_limits (kind, exercise_id, note) values ('exercise_note', 'bench', 'Left shoulder')$$,
  '42501', null, 'without health consent nothing can be saved');

set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
select public.give_consent('health', (select value ->> 'health' from public.app_config where key = 'policies'), 'web');
select lives_ok($$insert into public.health_limits (kind, exercise_id, note) values ('exercise_note', 'bench', 'Left shoulder')$$,
  'with health consent an injury note saves');
select lives_ok($$insert into public.health_limits (kind, code) values ('cant_do', 'no_jumping')$$, 'and a thing I can''t do');
select lives_ok($$insert into public.pain_entries (score, exercise_id) values (4, 'bench')$$, 'and a pain score');
select throws_ok($$insert into public.pain_entries (score) values (11)$$, '23514', null, 'pain is 0 to 10');
select throws_ok($$insert into public.health_limits (kind, exercise_id, note) values ('exercise_note', 'bench', 'again')$$,
  '23505', null, 'one injury note per exercise');
select throws_ok($$insert into public.health_limits (user_id, kind, code) values ('00000000-0000-4000-8000-0000000000e2', 'cant_do', 'no_running')$$,
  '42501', null, 'nobody saves health rows for someone else');
select is((select count(*)::int from public.health_limits), 2, 'the owner reads their rows');
select is((select jsonb_array_length(public.export_my_data() -> 'health' -> 'health_limits')), 2, 'the export has a health section');

set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e2", "role": "authenticated"}';
select is((select count(*)::int from public.health_limits) + (select count(*)::int from public.pain_entries), 0,
  'someone else sees none of them');

set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
select public.withdraw_consent('health', 'web');
reset role;
select is((select count(*)::int from public.health_limits where user_id = '00000000-0000-4000-8000-0000000000e1')
        + (select count(*)::int from public.pain_entries where user_id = '00000000-0000-4000-8000-0000000000e1'), 0,
  'withdrawing health consent deletes every health row');

select * from finish();
rollback;
