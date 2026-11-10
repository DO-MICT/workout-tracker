-- The Free plan cap, downgrade without loss and Pro-only photo rows (WP14, D13, D20).
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ---------- structure ----------
select ok(not has_function_privilege('authenticated', 'private.apply_plan_limits(uuid)', 'execute'), 'apply_plan_limits stays off the API');
select ok(not has_function_privilege('authenticated', 'private.has_feature(uuid, text)', 'execute'), 'has_feature stays off the API');
select ok(not has_function_privilege('anon', 'public.my_plan_access()', 'execute'), 'signed-out visitors cannot call my_plan_access');
select ok(not has_function_privilege('anon', 'public.choose_plans(text[])', 'execute'), 'signed-out visitors cannot call choose_plans');
select has_trigger('public', 'plans', 'plans_limit', 'plans have the cap trigger');
select has_trigger('public', 'entitlements', 'entitlements_plan_limits', 'entitlement changes apply the limits');
select is((select value -> 'plans' from public.app_config where key = 'free_limits'), '3'::jsonb, 'Free keeps 3 plans');

-- F is on Free (the sign-up trial is removed), P will get Pro, T is on a trial that runs out by itself
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000f1', 'cap-free@example.com'),
  ('00000000-0000-4000-8000-0000000000f2', 'cap-other@example.com'),
  ('00000000-0000-4000-8000-0000000000f3', 'cap-trial@example.com');
delete from public.entitlements where user_id in ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f2');

create function pg_temp.mkplan(n int, uid text) returns jsonb language sql as $$
  select jsonb_build_object('t', 'plans', 'id', ('00000000-0000-4000-9000-' || lpad(right(uid, 2) || n::text, 12, '0'))::uuid, 'op', 'upsert',
    'f', jsonb_build_object('local_id', 'p' || n, 'name', 'Plan ' || n, 'body', jsonb_build_object('custom', jsonb_build_object('id', 'p' || n, 'name', 'Plan ' || n), 'pos', n)));
$$;
create function pg_temp.pid(n int, uid text) returns uuid language sql as $$
  select ('00000000-0000-4000-9000-' || lpad(right(uid, 2) || n::text, 12, '0'))::uuid;
$$;
grant execute on function pg_temp.mkplan(int, text), pg_temp.pid(int, text) to authenticated;

-- ---------- Free: the 4th plan is kept but read-only ----------
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000f1", "role": "authenticated"}';
select public.sync_push(jsonb_build_array(pg_temp.mkplan(1, 'f1'), pg_temp.mkplan(2, 'f1'), pg_temp.mkplan(3, 'f1')));
select is((select count(*)::int from public.plans where not read_only), 3, 'Free saves 3 plans in use');
select is(public.sync_push(jsonb_build_array(pg_temp.mkplan(4, 'f1'))) #>> '{results,0,status}', 'applied', 'a 4th plan is never refused');
select ok((select read_only from public.plans where local_id = 'p4'), 'the 4th plan is saved read-only');
select is(public.my_plan_access() -> 'locked', '["p4"]'::jsonb, 'my_plan_access lists the read-only plan');
select is(public.sync_push(jsonb_build_array(jsonb_build_object('t', 'plans', 'id', pg_temp.pid(5, 'f1'), 'op', 'upsert',
  'f', jsonb_build_object('local_id', 'bro', 'source_template', 'bro', 'body', '{"edits": {}}'::jsonb)))) #>> '{results,0,status}', 'applied',
  'an edit to a built-in plan saves');
select ok(not (select read_only from public.plans where local_id = 'bro'), 'built-in plans are never counted or locked');

-- a read-only plan keeps its content; the attempt is kept in plan_versions
select public.sync_push(jsonb_build_array(jsonb_build_object('t', 'plans', 'id', pg_temp.pid(4, 'f1'), 'op', 'upsert',
  'f', jsonb_build_object('name', 'Renamed', 'body', '{"custom": {"id": "p4", "name": "Renamed"}, "pos": 4}'::jsonb))));
select is((select name from public.plans where local_id = 'p4'), 'Plan 4', 'a read-only plan cannot be changed');
select is((select count(*)::int from public.plan_versions where plan_id = pg_temp.pid(4, 'f1') and body -> 'custom' ->> 'name' = 'Renamed'), 1,
  'the attempted change is not lost');
select public.sync_push(jsonb_build_array(jsonb_build_object('t', 'plans', 'id', pg_temp.pid(4, 'f1'), 'op', 'upsert',
  'f', jsonb_build_object('body', '{"custom": {"id": "p4", "name": "Plan 4"}, "pos": 2}'::jsonb))));
select is((select (body ->> 'pos')::int from public.plans where local_id = 'p4'), 2, 'a read-only plan can still move in the list');

-- picking which plans stay in use
select throws_ok($$select public.choose_plans(array['p1', 'p2', 'p3', 'p4'])$$, '22023', null, 'Free cannot keep 4');
select is(public.choose_plans(array['p2', 'p3', 'p4']) -> 'locked', '["p1"]'::jsonb, 'choose_plans swaps which plan is read-only');
select throws_ok($$update public.plans set read_only = false where local_id = 'p1'$$, '42501', null, 'the app cannot unlock a plan itself');

-- someone else sees none of it and cannot pick for F
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000f2", "role": "authenticated"}';
select is(public.choose_plans(array['p1']) -> 'locked', '[]'::jsonb, 'choose_plans only touches your own plans');
reset role;
select ok((select read_only from public.plans where user_id = '00000000-0000-4000-8000-0000000000f1' and local_id = 'p1'),
  'another account picking changes nothing for F');

-- ---------- Pro unlocks everything, and Free again keeps the active and recent plans ----------
insert into public.user_settings (id, user_id, active_plan) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f1', 'p1');
insert into public.workouts (id, user_id, performed_at, plan_id) values
  (gen_random_uuid(), '00000000-0000-4000-8000-0000000000f1', now() - interval '1 day', 'p4'),
  (gen_random_uuid(), '00000000-0000-4000-8000-0000000000f1', now() - interval '2 days', 'p3');
select public.admin_grant('cap-free@example.com', 'pro', 'promo', 30);
select is((select count(*)::int from public.plans where user_id = '00000000-0000-4000-8000-0000000000f1' and read_only), 0,
  'Pro unlocks every plan straight away');
select public.admin_revoke('cap-free@example.com', 'promo');
select is(array(select local_id from public.plans where user_id = '00000000-0000-4000-8000-0000000000f1'
                and source_template is null and not read_only order by local_id),
  array['p1', 'p3', 'p4'], 'when Pro ends the active plan and the two most recently trained stay in use');
select is((select count(*)::int from public.plans where user_id = '00000000-0000-4000-8000-0000000000f1' and deleted_at is null), 5,
  'nothing is deleted');

-- deleting a plan frees a place
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000f1", "role": "authenticated"}';
select public.sync_push(jsonb_build_array(jsonb_build_object('t', 'plans', 'id', pg_temp.pid(3, 'f1'), 'op', 'delete')));
select is(public.choose_plans(array['p1', 'p2', 'p4']) -> 'in_use', '3'::jsonb, 'after a delete another plan can be picked');

-- Pro-only photo rows
select is(public.sync_push(jsonb_build_array(jsonb_build_object('t', 'progress_photos', 'id', gen_random_uuid(), 'op', 'upsert',
  'f', jsonb_build_object('taken_on', current_date, 'pose', 'front')))) #>> '{results,0,status}', 'error', 'Free cannot add progress photos');
reset role;

-- ---------- a trial that runs out by itself is caught by the nightly job ----------
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000f3", "role": "authenticated"}';
select is(public.sync_push(jsonb_build_array(pg_temp.mkplan(1, 'f3'), pg_temp.mkplan(2, 'f3'), pg_temp.mkplan(3, 'f3'), pg_temp.mkplan(4, 'f3'),
  jsonb_build_object('t', 'progress_photos', 'id', gen_random_uuid(), 'op', 'upsert', 'f', jsonb_build_object('taken_on', current_date))))
  #>> '{results,4,status}', 'applied', 'a trial can add progress photos');
select is((select count(*)::int from public.plans where not read_only), 4, 'a trial has no plan cap');
reset role;
set local session_replication_role = replica;   -- the clock running out changes no row, so no trigger fires
update public.entitlements set starts_at = now() - interval '15 days', expires_at = now() - interval '1 day'
 where user_id = '00000000-0000-4000-8000-0000000000f3';
set local session_replication_role = origin;
select is(private.apply_due_plan_limits(), 1, 'the nightly job finds the ended trial');
select is((select count(*)::int from public.plans where user_id = '00000000-0000-4000-8000-0000000000f3' and read_only), 1,
  'and makes the plan over the cap read-only');
select is((select count(*)::int from public.progress_photos where user_id = '00000000-0000-4000-8000-0000000000f3'), 1,
  'photos saved during the trial stay');

select * from finish();
rollback;
