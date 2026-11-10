-- Structure checks for usage events, the error log and app config (WP5).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- the API roles can't read or write events and errors directly, only through the functions
select is(
  array(select table_name || ':' || grantee || ':' || privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name in ('events', 'client_errors')
          and grantee in ('anon', 'authenticated') order by 1),
  '{}'::text[],
  'anon and authenticated have no table rights on events or client_errors');

select is(
  array(select table_name || ':' || privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'app_config'
          and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT' order by 1),
  '{}'::text[],
  'app_config is read-only for the app');

select ok(has_function_privilege('anon', 'public.log_event(text, uuid, jsonb, text, text, timestamptz)', 'execute'),
  'signed-out visitors may log an event');
select ok(not has_function_privilege('anon', 'public.admin_usage(int)', 'execute'), 'anon cannot read usage');

select is((select value #>> '{}' from public.app_config where key = 'min_version'), '0', 'min_version starts at 0 (nobody asked to reload)');

-- events never hold an account id: no column refers to auth.users
select is(
  (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'events'
     and column_name in ('user_id', 'email')),
  0, 'events have no user_id or email column');

-- props: short codes only
select ok(private.props_ok('{"source": "play", "n": 3, "ok": true}'), 'short codes, numbers and booleans are fine');
select ok(not private.props_ok('{"note": "my knee hurts"}'), 'free text is refused');
select ok(not private.props_ok('{"a": {"b": 1}}'), 'nested objects are refused');

-- scrubbing
select is(private.scrub('Failed for jo.smith+x@mail.com at /rest?id=123', 300), 'Failed for [email] at /rest?[query]', 'emails and query strings are removed');
select is(private.scrub('user 0f8fad5b-d9cb-469f-a165-70867728950e row 12345678', 300), 'user [id] row [n]', 'ids and long numbers are removed');

-- triggers: a new entitlement of a store kind counts as a purchase
select has_trigger('public', 'entitlements', 'entitlements_event_insert', 'entitlements log trial starts and purchases');
select has_trigger('public', 'profiles', 'profiles_event_insert', 'profiles log sign-ups');

select * from finish();
rollback;
