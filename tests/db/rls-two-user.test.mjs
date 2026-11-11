// RLS two-user test (NFR-7): two real accounts talk to the API the way the app does,
// and each one must only ever see and change its own data.
//
// Runs against a local Supabase (the db-check workflow) or GFD Dev. Never point it at production:
// it creates and deletes accounts.
//
//   SUPABASE_URL          API url, e.g. http://127.0.0.1:54321
//   SUPABASE_ANON_KEY     publishable (or legacy anon) key, what the app ships with
//   SUPABASE_SERVICE_KEY  secret (or legacy service_role) key, only used to create, promote and delete the test accounts
//
// Run: node --test tests/db/*.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_KEY || '';
if (!URL_ || !ANON || !SERVICE) {
  throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY (local or GFD Dev, never production).');
}
if (isProduction(URL_)) throw new Error('This is the production project (GFD Prod or the old one). Use local or GFD Dev.');
function isProduction(u) {
  const cfg = JSON.parse(process.getBuiltinModule('node:fs').readFileSync(new URL('../../deploy/supabase.json', import.meta.url), 'utf8'));
  const prod = (cfg.production.url || '').replace(/\/$/, '');
  return /zdllpjrkwcdmcuizxuum/.test(u) || (!!prod && u.replace(/\/$/, '') === prod);
}

const run = Date.now().toString(36);
const PASSWORD = 'Test-' + randomUUID();
const users = {}; // a, b: { id, email, token }

async function call(path, { method = 'GET', token, key = ANON, body, headers = {} } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: {
      apikey: key,
      // new-style keys (sb_publishable_, sb_secret_) go in apikey only; legacy JWT keys also as Bearer
      ...(token || !key.startsWith('sb_') ? { Authorization: 'Bearer ' + (token || key) } : {}),
      ...(body !== undefined && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}
const admin = (path, opts = {}) => call(path, { ...opts, key: SERVICE });
const rest = (path, who, opts = {}) => call('/rest/v1/' + path, { ...opts, token: who && users[who].token });
const rows = (r) => (Array.isArray(r.json) ? r.json : []);

async function makeUser(tag, email) {
  const made = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: 'Tester ' + tag } },
  });
  assert.equal(made.status, 200, 'create user ' + tag + ': ' + JSON.stringify(made.json));
  const signin = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: PASSWORD } });
  assert.equal(signin.status, 200, 'sign in ' + tag + ': ' + JSON.stringify(signin.json));
  return { id: made.json.id, email, token: signin.json.access_token };
}

before(async () => {
  users.a = await makeUser('A', `rls-a-${run}@example.com`);
  users.b = await makeUser('B', `rls-b-${run}@example.com`);
});

after(async () => {
  for (const u of Object.values(users)) {
    if (u && u.id) await admin('/auth/v1/admin/users/' + u.id, { method: 'DELETE' });
  }
});

// ---------- sign-up ----------

test('sign-up makes a profile, an empty data row and a 14-day Pro trial', async () => {
  const p = rows(await rest('profiles?select=id,email,display_name,is_admin,data_model', 'a'));
  assert.equal(p.length, 1);
  assert.equal(p[0].id, users.a.id);
  assert.equal(p[0].display_name, 'Tester A');
  assert.equal(p[0].is_admin, false);
  assert.equal(p[0].data_model, 2, 'new accounts start on the synced tables (WP3)');

  assert.equal(rows(await rest('user_state?select=user_id', 'a')).length, 1);

  const acc = rows(await rest('my_access?select=tier,source,ends_at,features', 'a'));
  assert.equal(acc.length, 1);
  assert.equal(acc[0].tier, 'pro');
  assert.equal(acc[0].source, 'trial');
  const days = (new Date(acc[0].ends_at) - Date.now()) / 864e5;
  assert.ok(days > 13.9 && days <= 14.01, 'trial ends in 14 days, got ' + days);
  assert.ok(acc[0].features.includes('stats.full'));
});

// ---------- reading ----------

const SYNC_TABLES = ['user_settings', 'about_me', 'locations', 'plans', 'plan_versions', 'schedule_entries', 'measurements', 'exercise_notes', 'custom_exercises', 'progress_photos'];

for (const table of ['profiles', 'user_state', 'entitlements', 'my_access', 'workouts', 'workout_sets', 'suggestions', 'deletion_requests',
  ...SYNC_TABLES]) {
  test(`${table}: a user never sees the other user's rows`, async () => {
    const col = table === 'profiles' ? 'id' : 'user_id';
    const own = rows(await rest(`${table}?select=${col}`, 'a'));
    assert.ok(own.every((r) => r[col] === users.a.id), 'A only sees A');
    const peek = await rest(`${table}?select=${col}&${col}=eq.${users.b.id}`, 'a');
    assert.deepEqual(rows(peek), [], "A asking for B's rows gets none");
  });
}

test('signed-out visitors read the shared libraries but no personal data', async () => {
  assert.ok(rows(await rest('exercises?select=id&limit=1')).length >= 0);
  assert.equal((await rest('exercises?select=id&limit=1')).status, 200);
  assert.equal((await rest('gear?select=id&limit=1')).status, 200);
  assert.equal(rows(await rest('tier_features?select=tier')).length, 4);
  for (const table of ['profiles', 'user_state', 'entitlements', 'my_access', 'workouts', 'workout_sets', 'suggestions', 'deletion_requests',
  'events', 'client_errors', ...SYNC_TABLES]) {
    const r = await rest(`${table}?select=*`);
    assert.ok(r.status === 401 || r.status === 403 || rows(r).length === 0, `anon must not read ${table} (got ${r.status})`);
  }
});

// ---------- writing ----------

test("user_state: A can save own data but not B's", async () => {
  // behave like accounts made before WP3, which still keep their data in user_state
  for (const u of ['a', 'b']) {
    const r = await admin(`/rest/v1/profiles?id=eq.${users[u].id}`, { method: 'PATCH', body: { data_model: 1 } });
    assert.ok(r.status < 300, 'set data_model 1: ' + JSON.stringify(r.json));
  }
  const mine = await rest(`user_state?user_id=eq.${users.a.id}`, 'a', {
    method: 'PATCH', body: { data: { v: 1, hello: 'a' }, client_ts: 1 }, headers: { Prefer: 'return=representation' },
  });
  assert.equal(rows(mine).length, 1);

  const theirs = await rest(`user_state?user_id=eq.${users.b.id}`, 'a', {
    method: 'PATCH', body: { data: { hacked: true } }, headers: { Prefer: 'return=representation' },
  });
  assert.deepEqual(rows(theirs), [], "A's update of B's row changes nothing");

  const steal = await rest('user_state', 'a', { method: 'POST', body: { user_id: users.b.id, data: {} } });
  assert.ok(steal.status >= 400, 'A cannot insert a row as B');

  const del = await rest(`user_state?user_id=eq.${users.b.id}`, 'a', { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  assert.deepEqual(rows(del), []);
  assert.equal(rows(await rest('user_state?select=data', 'b'))[0].data.hacked, undefined);
});

// ---------- per-record sync (WP3) ----------

const push = (who, mutations) => rest('rpc/sync_push', who, { method: 'POST', body: { mutations } });
const pull = (who, since = 0) => rest('rpc/sync_pull', who, { method: 'POST', body: { since } });
const pulled = async (who, t, id) => (await pull(who)).json.rows.filter((x) => x.t === t && (!id || x.r.id === id)).map((x) => x.r);

test('sync: moving off the blob happens once, then user_state is read-only', async () => {
  const planId = randomUUID();
  const recs = [
    { t: 'user_settings', f: { theme: 'dark', prefs: { onboarded: true } } },
    { t: 'plans', id: planId, f: { local_id: 'p1', name: 'From blob', body: { days: {} } } },
  ];
  const first = await rest('rpc/migrate_from_blob', 'a', { method: 'POST', body: { records: recs } });
  assert.equal(first.status, 200, JSON.stringify(first.json));
  assert.equal(first.json.data_model, 2);
  assert.equal(first.json.already, false);

  recs[1].f.name = 'Second run';
  const again = await rest('rpc/migrate_from_blob', 'a', { method: 'POST', body: { records: recs } });
  assert.equal(again.json.already, true, 'a repeat run changes nothing');
  assert.equal((await pulled('a', 'plans', planId))[0].name, 'From blob');
  assert.equal(rows(await rest('profiles?select=data_model', 'a'))[0].data_model, 2);

  const blob = await rest(`user_state?user_id=eq.${users.a.id}`, 'a', {
    method: 'PATCH', body: { data: { v: 1, late: true } }, headers: { Prefer: 'return=representation' },
  });
  assert.ok(blob.status >= 400 || rows(blob).length === 0, 'old app versions can no longer write the blob');
  assert.equal(rows(await rest('user_state?select=data', 'a'))[0].data.late, undefined);

  // B has not moved yet: B's blob still works, and B cannot move A's records into B's account
  const bBlob = await rest(`user_state?user_id=eq.${users.b.id}`, 'b', {
    method: 'PATCH', body: { data: { v: 1, still: true } }, headers: { Prefer: 'return=representation' },
  });
  assert.equal(rows(bBlob).length, 1);
  const steal = await rest('rpc/migrate_from_blob', 'b', { method: 'POST', body: { records: [{ t: 'plans', id: planId, f: { local_id: 'x', name: 'mine now' } }] } });
  assert.ok(steal.status >= 400, "B's move fails as a whole when it names A's record");
  assert.equal(rows(await rest('profiles?select=data_model', 'b'))[0].data_model, 1, 'and B stays on the blob');
});

test('sync: the app cannot write synced tables directly', async () => {
  for (const t of SYNC_TABLES) {
    const r = await rest(t, 'a', { method: 'POST', body: { id: users.a.id, user_id: users.a.id } });
    assert.ok(r.status >= 400, `direct insert into ${t} must fail (got ${r.status})`);
  }
});

test('sync: changes to different fields on two phones both survive, and B cannot touch A', async () => {
  const id = randomUUID();
  const made = await push('a', [{ t: 'plans', id, f: { local_id: 'p2', name: 'Push day', body: { v: 1 } } }]);
  assert.equal(made.json.results[0].status, 'applied', JSON.stringify(made.json));
  const rev = made.json.results[0].rev;

  // phone 1 renames, phone 2 (still on the old rev) edits the body
  const p1 = await push('a', [{ t: 'plans', id, rev, f: { name: 'Push day A' } }]);
  const p2 = await push('a', [{ t: 'plans', id, rev, f: { body: { v: 2 } } }]);
  assert.equal(p1.json.results[0].status, 'applied');
  assert.equal(p2.json.results[0].status, 'merged');
  const row = (await pulled('a', 'plans', id))[0];
  assert.equal(row.name, 'Push day A');
  assert.deepEqual(row.body, { v: 2 });
  assert.equal(row.rev, rev + 2);
  assert.ok(rows(await rest(`plan_versions?plan_id=eq.${id}&select=body`, 'a')).some((v) => v.body.v === 1), 'the replaced body is kept');

  const b = await push('b', [{ t: 'plans', id, f: { name: 'hacked' } }, { t: 'plans', id, op: 'delete' }]);
  assert.deepEqual(b.json.results.map((r) => r.status), ['skipped', 'skipped']);
  assert.deepEqual(await pulled('b', 'plans', id), [], 'B never sees A\'s plan');
  assert.deepEqual(rows(await rest(`plan_versions?plan_id=eq.${id}`, 'b')), []);
  assert.equal((await pulled('a', 'plans', id))[0].name, 'Push day A');
});

test('sync: settings merge key by key, deletes are tombstones, a bad change does not block the rest', async () => {
  const before = (await pull('a')).json.cursor;
  const locId = randomUUID();
  const r = await push('a', [
    { t: 'user_settings', f: { units: 'lb', prefs: { a: 1, b: 2 } } },
    { t: 'about_me', f: { days_per_week: 12 } },
    { t: 'no_such_table', f: {} },
    { t: 'locations', id: locId, f: { local_id: 'loc9', name: 'Home', gear: ['dumbbells'] } },
  ]);
  assert.deepEqual(r.json.results.map((x) => x.status), ['applied', 'error', 'error', 'applied']);
  await push('a', [{ t: 'user_settings', f: { prefs: { a: null, c: 3 } } }, { t: 'locations', id: locId, op: 'delete' }]);

  const after = await pull('a', before);
  const s = after.json.rows.filter((x) => x.t === 'user_settings').map((x) => x.r)[0];
  assert.deepEqual(s.prefs, { onboarded: true, b: 2, c: 3 });
  assert.equal(s.units, 'lb');
  assert.equal(s.theme, 'dark', 'fields not sent are left alone');
  const loc = after.json.rows.filter((x) => x.t === 'locations').map((x) => x.r)[0];
  assert.ok(loc.deleted_at, 'a deleted record comes back as a tombstone');
  assert.ok(after.json.cursor > before);
  assert.deepEqual((await pull('a', after.json.cursor)).json.rows, [], 'nothing new after the cursor');
});

test('sync: signed-out visitors cannot push or pull', async () => {
  assert.ok((await push(null, [])).status >= 400);
  assert.ok((await pull(null)).status >= 400);
});

test('profiles: a user changes only their display name, never email, tier or admin', async () => {
  const ok = await rest(`profiles?id=eq.${users.a.id}`, 'a', {
    method: 'PATCH', body: { display_name: 'Renamed A' }, headers: { Prefer: 'return=representation' },
  });
  assert.equal(rows(ok)[0]?.display_name, 'Renamed A');
  for (const body of [{ is_admin: true }, { tier: 'pro' }, { email: 'x@example.com' }]) {
    const r = await rest(`profiles?id=eq.${users.a.id}`, 'a', { method: 'PATCH', body });
    assert.ok(r.status >= 400, 'blocked: ' + JSON.stringify(body));
  }
  const other = await rest(`profiles?id=eq.${users.b.id}`, 'a', {
    method: 'PATCH', body: { display_name: 'Owned' }, headers: { Prefer: 'return=representation' },
  });
  assert.deepEqual(rows(other), []);
});

test('entitlements: nobody can give themselves Pro', async () => {
  const ins = await rest('entitlements', 'a', {
    method: 'POST', body: { user_id: users.a.id, tier: 'tester', source: 'admin' },
  });
  assert.ok(ins.status >= 400, 'insert blocked');
  const upd = await rest(`entitlements?user_id=eq.${users.a.id}`, 'a', {
    method: 'PATCH', body: { expires_at: null },
  });
  assert.ok(upd.status >= 400, 'update blocked');
  const grant = await rest('rpc/admin_grant', 'a', { method: 'POST', body: { p_email: users.a.email, p_tier: 'tester' } });
  assert.ok(grant.status >= 400, 'admin_grant blocked for non-admins');
  assert.match(JSON.stringify(grant.json), /Only admins/);
  const tf = await rest('tier_features?tier=eq.free', 'a', { method: 'PATCH', body: { features: ['stats.full'] } });
  assert.ok(tf.status >= 400, 'tier_features are read-only');
});

test('private functions are not reachable through the API', async () => {
  for (const fn of ['start_trial', 'is_admin', 'can_grant', 'email_hash', 'apply_plan_limits', 'has_feature', 'apply_due_plan_limits', 'user_features']) {
    const r = await rest('rpc/' + fn, 'a', { method: 'POST', body: {} });
    assert.ok(r.status >= 400, fn + ' must not be callable');
  }
  const h = await rest('rpc/handle_new_user', 'a', { method: 'POST', body: {} });
  assert.ok(h.status >= 400);
});

test("workouts: A's history is private and B cannot add sets to it or delete it", async () => {
  const wid = randomUUID();
  const save = await rest('rpc/save_workout', 'a', {
    method: 'POST',
    body: { w: { id: wid, plan_name: 'Test', sets: [{ exercise_id: 'bench', exercise_name: 'Bench', exercise_order: 0, set_no: 1, weight: 60, reps: 8, done: true }] } },
  });
  assert.equal(save.status, 200, JSON.stringify(save.json));
  assert.equal(rows(await rest(`workouts?id=eq.${wid}&select=id,volume_kg`, 'a'))[0]?.volume_kg, 480);

  assert.deepEqual(rows(await rest(`workouts?id=eq.${wid}`, 'b')), []);
  assert.deepEqual(rows(await rest(`workout_sets?workout_id=eq.${wid}`, 'b')), []);

  const sneak = await rest('workout_sets', 'b', {
    method: 'POST',
    body: { workout_id: wid, user_id: users.b.id, performed_at: new Date().toISOString(), exercise_id: 'x', exercise_name: 'x', exercise_order: 1, set_no: 1 },
  });
  assert.ok(sneak.status >= 400, "B cannot add a set to A's workout");

  // save_workout runs as the caller: B re-sending A's id must not touch A's workout
  const replay = await rest('rpc/save_workout', 'b', { method: 'POST', body: { w: { id: wid, sets: [] } } });
  assert.ok(replay.status >= 400 || rows(await rest(`workouts?id=eq.${wid}`, 'b')).length === 0);

  const del = await rest(`workouts?id=eq.${wid}`, 'b', { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  assert.deepEqual(rows(del), []);
  assert.equal(rows(await rest(`workouts?id=eq.${wid}`, 'a')).length, 1, "A's workout is still there");

  const upd = await rest('rpc/update_workout', 'b', { method: 'POST', body: { w: { id: wid, sets: [] } } });
  assert.ok(upd.status >= 400 || rows(await rest(`workout_sets?workout_id=eq.${wid}`, 'a')).length === 1,
    "B's update_workout must not change A's sets");
});

test('suggestions: private to the sender, and status is not theirs to set', async () => {
  const s = await rest('suggestions', 'a', {
    method: 'POST', body: { kind: 'bug', message: 'RLS test' }, headers: { Prefer: 'return=representation' },
  });
  assert.equal(s.status, 201, JSON.stringify(s.json));
  const id = rows(s)[0].id;
  assert.deepEqual(rows(await rest(`suggestions?id=eq.${id}`, 'b')), []);
  const st = await rest(`suggestions?id=eq.${id}`, 'a', { method: 'PATCH', body: { status: 'done' }, headers: { Prefer: 'return=representation' } });
  assert.ok(st.status >= 400 || rows(st).length === 0, 'sender cannot set status');
  const pre = await rest('suggestions', 'a', { method: 'POST', body: { message: 'x', status: 'done' } });
  assert.ok(pre.status >= 400, 'cannot send one already marked done');
  const forged = await rest('suggestions', 'a', { method: 'POST', body: { message: 'x', user_id: users.b.id } });
  assert.ok(forged.status >= 400, 'cannot send as someone else');
});

test("screenshots: A uploads to A's folder only, and B cannot open A's file", async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const up = (who, path) => call(`/storage/v1/object/suggestions/${path}`, {
    method: 'POST', token: users[who].token, body: png, headers: { 'Content-Type': 'image/png' },
  });
  const own = await up('a', `${users.a.id}/rls-${run}.png`);
  assert.equal(own.status, 200, JSON.stringify(own.json));
  const wrong = await up('a', `${users.b.id}/rls-${run}.png`);
  assert.ok(wrong.status >= 400, "A cannot write into B's folder");
  const peek = await call(`/storage/v1/object/authenticated/suggestions/${users.a.id}/rls-${run}.png`, { token: users.b.token });
  assert.ok(peek.status >= 400, "B cannot download A's screenshot");
  const mine = await call(`/storage/v1/object/authenticated/suggestions/${users.a.id}/rls-${run}.png`, { token: users.a.token });
  assert.equal(mine.status, 200);
  await call(`/storage/v1/object/suggestions/${users.a.id}/rls-${run}.png`, { method: 'DELETE', key: SERVICE });
});

// ---------- admins ----------

test("an admin reads everyone's feedback and grants access; the other user still sees only their own", async () => {
  const promote = await admin(`/rest/v1/profiles?id=eq.${users.a.id}`, { method: 'PATCH', body: { is_admin: true } });
  assert.ok(promote.status < 300, JSON.stringify(promote.json));

  await rest('suggestions', 'b', { method: 'POST', body: { message: 'From B' } });
  const all = rows(await rest('suggestions?select=user_id', 'a'));
  assert.ok(all.some((r) => r.user_id === users.b.id), 'admin sees B');

  const g = await rest('rpc/admin_grant', 'a', { method: 'POST', body: { p_email: users.b.email, p_tier: 'tester' } });
  assert.equal(g.status, 200, JSON.stringify(g.json));
  assert.equal(rows(await rest('my_access?select=tier', 'b'))[0].tier, 'tester');

  const r = await rest('rpc/admin_revoke', 'a', { method: 'POST', body: { p_email: users.b.email, p_source: 'admin' } });
  assert.equal(r.json, 1);
  assert.equal(rows(await rest('my_access?select=tier,source', 'b'))[0].source, 'trial');

  // admin rights are read-only on other people's data
  const edit = await rest(`user_state?user_id=eq.${users.b.id}`, 'a', { method: 'PATCH', body: { data: {} }, headers: { Prefer: 'return=representation' } });
  assert.deepEqual(rows(edit), []);
  assert.deepEqual(rows(await rest(`profiles?id=eq.${users.a.id}&select=id`, 'b')), [], 'B still cannot see A');
});

// ---------- usage events, error log, app config (WP5) ----------

test('events and errors: the app can log them but nobody reads or writes the tables directly', async () => {
  const anonId = randomUUID();
  const ok = await rest('rpc/log_event', 'a', { method: 'POST', body: { p_name: 'first_workout', p_anon_id: anonId, p_props: { exercises: 6 }, p_app_version: '2026.11.08' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json, true);
  const signedOut = await rest('rpc/log_event', null, { method: 'POST', body: { p_name: 'paywall_seen', p_anon_id: randomUUID() } });
  assert.equal(signedOut.status, 200, 'signed-out visitors can log too: ' + JSON.stringify(signedOut.json));

  const badName = await rest('rpc/log_event', 'a', { method: 'POST', body: { p_name: 'sign_up', p_anon_id: anonId } });
  assert.ok(badName.status >= 400, 'the app cannot send server-only or unknown events');
  const freeText = await rest('rpc/log_event', 'a', { method: 'POST', body: { p_name: 'export', p_anon_id: anonId, p_props: { note: 'my knee hurts' } } });
  assert.ok(freeText.status >= 400, 'free text in props is refused');

  for (let i = 0; i < 2; i++) {
    const e = await rest('rpc/log_client_error', 'b', { method: 'POST', body: { p_message: `TypeError for ${users.b.email}`, p_anon_id: anonId, p_screen: 'stats', p_app_version: '2026.11.08' } });
    assert.equal(e.status, 200, JSON.stringify(e.json));
  }

  for (const t of ['events', 'client_errors']) {
    for (const who of ['a', 'b', null]) {
      const r = await rest(`${t}?select=*`, who);
      assert.ok(r.status >= 400 || rows(r).length === 0, `${who || 'anon'} must not read ${t}`);
    }
    const ins = await rest(t, 'a', { method: 'POST', body: t === 'events' ? { name: 'export' } : { message: 'x' } });
    assert.ok(ins.status >= 400, `A cannot insert into ${t} directly`);
  }
});

test('app_config: everyone reads it, nobody writes it', async () => {
  const anon = rows(await rest('app_config?select=key,value'));
  assert.ok(anon.some((r) => r.key === 'min_version'), 'signed-out visitors read min_version');
  const upd = await rest('app_config?key=eq.min_version', 'a', { method: 'PATCH', body: { value: '9999' }, headers: { Prefer: 'return=representation' } });
  assert.ok(upd.status >= 400 || rows(upd).length === 0, 'A cannot change app config');
  assert.equal(rows(await rest('app_config?select=value&key=eq.min_version'))[0].value, '0');
});

test('usage counts and errors are for admins only, and errors are scrubbed', async () => {
  assert.ok((await rest('rpc/admin_usage', 'b', { method: 'POST', body: {} })).status >= 400, 'B is not an admin');
  assert.ok((await rest('rpc/admin_errors', 'b', { method: 'POST', body: {} })).status >= 400, 'B is not an admin');
  assert.ok((await rest('rpc/admin_usage', null, { method: 'POST', body: {} })).status >= 400, 'anon is not an admin');

  // A was made an admin above
  const u = await rest('rpc/admin_usage', 'a', { method: 'POST', body: { p_days: 2 } });
  assert.equal(u.status, 200, JSON.stringify(u.json));
  const names = new Set(rows(u).map((r) => r.name));
  for (const n of ['sign_up', 'trial_start', 'first_workout']) assert.ok(names.has(n), `usage counts ${n}`);

  const e = rows(await rest('rpc/admin_errors', 'a', { method: 'POST', body: { p_limit: 20 } }));
  const mine = e.find((x) => x.screen === 'stats' && /^TypeError for/.test(x.message));
  assert.ok(mine, 'the error was logged');
  assert.equal(mine.message, 'TypeError for [email]', 'the email was scrubbed');
  assert.ok(mine.count >= 2, 'the same error within an hour adds to its count');
});

// ---------- consents (WP6) ----------

test('consents: private to each user, recorded only through give/withdraw, never edited', async () => {
  // publish test versions of the terms and privacy texts for this run, and put the old value back after
  const old = rows(await admin('/rest/v1/app_config?select=value&key=eq.policies'))[0].value;
  const pol = { ...old, terms: 't-' + run, privacy: 'p-' + run };
  const set = await admin('/rest/v1/app_config?key=eq.policies', { method: 'PATCH', body: { value: pol } });
  assert.ok(set.status < 300, 'service key sets policy versions: ' + JSON.stringify(set.json));
  try {
    // before agreeing, A's view shows nothing active and today's versions
    let mine = rows(await rest('my_consents?select=kind,active,version,current_version', 'a'));
    assert.equal(mine.length, 4);
    assert.deepEqual(mine.find((r) => r.kind === 'terms'), { kind: 'terms', active: false, version: null, current_version: 't-' + run });

    // the wrong (old) version is refused; the current one is recorded once
    assert.ok((await rest('rpc/give_consent', 'a', { method: 'POST', body: { p_kind: 'terms', p_version: 'old' } })).status >= 400);
    for (let i = 0; i < 2; i++) {
      const g = await rest('rpc/give_consent', 'a', { method: 'POST', body: { p_kind: 'terms', p_version: 't-' + run } });
      assert.equal(g.status, 200, JSON.stringify(g.json));
    }
    await rest('rpc/give_consent', 'a', { method: 'POST', body: { p_kind: 'privacy', p_version: 'p-' + run } });
    await rest('rpc/give_consent', 'a', { method: 'POST', body: { p_kind: 'marketing', p_version: pol.marketing } });
    assert.equal(rows(await rest('consents?select=id&kind=eq.terms', 'a')).length, 1, 'agreeing twice adds one row');

    // marketing withdrawn: a new row, the old one stays
    const w = await rest('rpc/withdraw_consent', 'a', { method: 'POST', body: { p_kind: 'marketing' } });
    assert.equal(w.status, 200, JSON.stringify(w.json));
    const mk = rows(await rest('consents?select=withdrawn_at&kind=eq.marketing&order=id', 'a'));
    assert.equal(mk.length, 2);
    assert.equal(mk[0].withdrawn_at, null);
    assert.ok(mk[1].withdrawn_at);
    mine = rows(await rest('my_consents?select=kind,active', 'a'));
    assert.deepEqual(Object.fromEntries(mine.map((r) => [r.kind, r.active])), { terms: true, privacy: true, health: false, marketing: false });

    // terms can't be withdrawn (that's deleting the account), and nothing is written directly
    assert.ok((await rest('rpc/withdraw_consent', 'a', { method: 'POST', body: { p_kind: 'terms' } })).status >= 400);
    const ins = await rest('consents', 'a', { method: 'POST', body: { user_id: users.a.id, kind: 'health', version: '1' } });
    assert.ok(ins.status >= 400, 'A cannot insert consent rows directly');
    const upd = await rest('consents?kind=eq.marketing', 'a', { method: 'PATCH', body: { withdrawn_at: null }, headers: { Prefer: 'return=representation' } });
    assert.ok(upd.status >= 400 || rows(upd).length === 0, 'A cannot edit consent rows');
    const del = await rest('consents?kind=eq.terms', 'a', { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    assert.ok(del.status >= 400 || rows(del).length === 0, 'A cannot delete consent rows');

    // B sees none of A's rows; signed-out visitors can't record or read anything
    assert.equal(rows(await rest('consents?select=id', 'b')).length, 0, "B sees none of A's consents");
    assert.ok(rows(await rest('my_consents?select=active', 'b')).every((r) => r.active === false));
    assert.ok((await rest('rpc/give_consent', null, { method: 'POST', body: { p_kind: 'terms', p_version: 't-' + run } })).status >= 400);
    assert.equal(rows(await rest('consents?select=id')).length, 0);
    assert.ok((await rest('rpc/has_consent', 'a', { method: 'POST', body: { p_uid: users.a.id, p_kind: 'terms' } })).status >= 400,
      'has_consent is private');

    // sign-up: versions ticked on the form are recorded with the account; stale ones are not
    const email = `rls-d-${run}@example.com`;
    const made = await admin('/auth/v1/admin/users', {
      method: 'POST',
      body: { email, password: PASSWORD, email_confirm: true,
        user_metadata: { display_name: 'Tester D', consents: { terms: 't-' + run, privacy: 'stale', marketing: pol.marketing } } },
    });
    assert.equal(made.status, 200, JSON.stringify(made.json));
    users.d = { id: made.json.id };
    const signin = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: PASSWORD } });
    const d = rows(await call('/rest/v1/my_consents?select=kind,active', { token: signin.json.access_token }));
    assert.deepEqual(Object.fromEntries(d.map((r) => [r.kind, r.active])), { terms: true, privacy: false, health: false, marketing: true });
  } finally {
    await admin('/rest/v1/app_config?key=eq.policies', { method: 'PATCH', body: { value: old } });
  }
});

test('consents: terms and privacy are refused while the policies are unpublished', async () => {
  const pol = rows(await admin('/rest/v1/app_config?select=value&key=eq.policies'))[0].value;
  if (pol.terms) return; // GFD Dev may have published versions
  const r = await rest('rpc/give_consent', 'b', { method: 'POST', body: { p_kind: 'terms', p_version: '' } });
  assert.ok(r.status >= 400);
  assert.match(JSON.stringify(r.json), /not published/);
});

// ---------- policy pages (WP7) ----------

test('policies: the published terms and privacy are asked of new accounts, and each person only sees their own yes', async () => {
  const pol = rows(await rest('app_config?select=value&key=eq.policies', 'b'))[0].value;
  assert.match(pol.terms, /^\d{4}\.\d{2}\.\d{2}$/, 'terms published');
  assert.match(pol.privacy, /^\d{4}\.\d{2}\.\d{2}$/, 'privacy published');
  assert.equal(pol.terms_url, 'terms.html');
  assert.equal(pol.privacy_url, 'privacy.html');

  // B never agreed: the app would ask for both
  let mine = rows(await rest('my_consents?select=kind,active,current_version', 'b'));
  assert.deepEqual(mine.find((r) => r.kind === 'terms'), { kind: 'terms', active: false, current_version: pol.terms });
  assert.deepEqual(mine.find((r) => r.kind === 'privacy'), { kind: 'privacy', active: false, current_version: pol.privacy });

  for (const k of ['terms', 'privacy']) {
    const g = await rest('rpc/give_consent', 'b', { method: 'POST', body: { p_kind: k, p_version: pol[k] } });
    assert.equal(g.status, 200, JSON.stringify(g.json));
  }
  mine = rows(await rest('my_consents?select=kind,active,version', 'b'));
  assert.deepEqual(mine.filter((r) => r.kind === 'terms' || r.kind === 'privacy').map((r) => [r.kind, r.active, r.version]).sort(),
    [['privacy', true, pol.privacy], ['terms', true, pol.terms]]);

  // A sees only A's rows, and B's yes isn't visible to anyone signed out
  assert.ok(rows(await rest('consents?select=user_id', 'a')).every((r) => r.user_id === users.a.id), "A sees none of B's consents");
  assert.equal(rows(await rest('consents?select=id')).length, 0);
});

// ---------- health details (WP9) ----------

test('health: rows open only to their owner and only with health consent; withdrawing deletes them', async () => {
  const pol = rows(await rest('app_config?select=value&key=eq.policies', 'a'))[0].value;
  const note = { kind: 'exercise_note', exercise_id: 'bench', note: 'Left shoulder: elbows tucked' };
  const ret = { Prefer: 'return=representation' };

  // no consent yet: nothing can be saved or read, even by the owner
  assert.ok((await rest('health_limits', 'a', { method: 'POST', body: note })).status >= 400, 'A cannot save before agreeing');
  assert.ok((await rest('pain_entries', 'a', { method: 'POST', body: { score: 3 } })).status >= 400);

  const g = await rest('rpc/give_consent', 'a', { method: 'POST', body: { p_kind: 'health', p_version: pol.health } });
  assert.equal(g.status, 200, JSON.stringify(g.json));
  const id = randomUUID();
  const ins = await rest('health_limits', 'a', { method: 'POST', body: { id, ...note }, headers: ret });
  assert.equal(ins.status, 201, JSON.stringify(ins.json));
  assert.equal(rows(ins)[0].user_id, users.a.id, 'user_id is filled in from the session');
  const up = await rest('health_limits?on_conflict=id', 'a', { method: 'POST', body: { id, ...note, note: 'Changed' },
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' } });
  assert.equal(up.status, 200, 'the app upserts by id: ' + JSON.stringify(up.json));
  assert.equal(rows(up)[0].note, 'Changed');
  assert.equal((await rest('pain_entries', 'a', { method: 'POST', body: { score: 4, exercise_id: 'bench' } })).status, 201);
  assert.ok((await rest('pain_entries', 'a', { method: 'POST', body: { score: 12 } })).status >= 400, 'pain is 0 to 10');
  assert.ok((await rest('health_limits', 'a', { method: 'POST', body: { kind: 'cant_do', code: 'no_jumping', user_id: users.b.id } })).status >= 400,
    'A cannot save a row for B');

  // B (no consent) and signed-out visitors see nothing, and can't change A's rows
  assert.equal(rows(await rest('health_limits?select=id', 'b')).length, 0, "B sees none of A's health details");
  assert.equal(rows(await rest('pain_entries?select=id', 'b')).length, 0);
  assert.equal(rows(await rest('health_limits?select=id')).length, 0);
  const bdel = await rest('health_limits?id=eq.' + id, 'b', { method: 'DELETE', headers: ret });
  assert.ok(bdel.status >= 400 || rows(bdel).length === 0, "B cannot delete A's rows");
  // B agreeing doesn't open A's rows
  await rest('rpc/give_consent', 'b', { method: 'POST', body: { p_kind: 'health', p_version: pol.health } });
  assert.equal(rows(await rest('health_limits?select=id', 'b')).length, 0, "B's consent opens only B's rows");

  // the export has a separate health section
  const x = (await rest('rpc/export_my_data', 'a', { method: 'POST', body: {} })).json;
  assert.equal(x.health.health_limits.length, 1);
  assert.equal(x.health.pain_entries.length, 1);
  assert.equal(x.tables.health_limits, undefined, 'health is not mixed in with the other tables');

  // withdrawing deletes everything at once
  const w = await rest('rpc/withdraw_consent', 'a', { method: 'POST', body: { p_kind: 'health' } });
  assert.equal(w.status, 200, JSON.stringify(w.json));
  const left = rows(await admin('/rest/v1/health_limits?select=id&user_id=eq.' + users.a.id)).length
    + rows(await admin('/rest/v1/pain_entries?select=id&user_id=eq.' + users.a.id)).length;
  assert.equal(left, 0, 'withdrawing health consent deleted every health row');
  assert.ok((await rest('health_limits', 'a', { method: 'POST', body: note })).status >= 400, 'and nothing can be saved after');
});

// ---------- one trial per person ----------

test('deleting an account and joining again with the same email gives no second trial', async () => {
  const email = `rls-c-${run}@example.com`;
  const first = await makeUser('C', email);
  assert.equal(rows(await call('/rest/v1/my_access?select=source', { token: first.token }))[0].source, 'trial');
  await admin('/auth/v1/admin/users/' + first.id, { method: 'DELETE' });

  const again = await makeUser('C2', email.replace('@', '+again@').toUpperCase());
  users.c = again;
  assert.equal(rows(await call('/rest/v1/my_access?select=tier,source', { token: again.token }))[0].tier, 'free');
});

// ---------- the Free plan cap (WP14) ----------

test('plan cap: Free keeps 3 plans in use and picks which; B cannot touch them; photos are Pro', async () => {
  // C (from the test above) had no second trial, so C is on Free; B is on the sign-up trial
  const plan = (n) => ({ t: 'plans', id: randomUUID(), f: { local_id: 'p' + n, name: 'Plan ' + n, body: { custom: { id: 'p' + n }, pos: n } } });
  const cPush = (mutations) => call('/rest/v1/rpc/sync_push', { method: 'POST', token: users.c.token, body: { mutations } });
  const cRpc = (fn, body = {}) => call('/rest/v1/rpc/' + fn, { method: 'POST', token: users.c.token, body });
  const four = [1, 2, 3, 4].map(plan);
  const pushed = await cPush(four);
  assert.deepEqual(pushed.json.results.map((r) => r.status), ['applied', 'applied', 'applied', 'applied'], 'nothing is refused');
  const mine = rows(await call('/rest/v1/plans?select=local_id,read_only&order=local_id', { token: users.c.token }));
  assert.deepEqual(mine.map((r) => r.read_only), [false, false, false, true], 'the 4th plan is kept read-only');

  const st = await cRpc('my_plan_access');
  assert.equal(st.status, 200, JSON.stringify(st.json));
  assert.deepEqual(st.json, { unlimited: false, limit: 3, in_use: 3, locked: ['p4'] });

  const tooMany = await cRpc('choose_plans', { p_keep: ['p1', 'p2', 'p3', 'p4'] });
  assert.ok(tooMany.status >= 400, 'Free cannot keep 4');
  const picked = await cRpc('choose_plans', { p_keep: ['p2', 'p3', 'p4'] });
  assert.deepEqual(picked.json.locked, ['p1']);

  const unlock = await call(`/rest/v1/plans?local_id=eq.p1`, { method: 'PATCH', token: users.c.token, body: { read_only: false } });
  assert.ok(unlock.status >= 400, 'the app cannot unlock a plan itself');

  const b = await rest('rpc/choose_plans', 'b', { method: 'POST', body: { p_keep: ['p1'] } });
  assert.equal(b.status, 200);
  assert.equal(b.json.unlimited, true, 'B is on the trial, so unlimited');
  const again = await cRpc('my_plan_access');
  assert.deepEqual(again.json.locked, ['p1'], 'B picking changed nothing for C');
  assert.deepEqual(rows(await rest('plans?local_id=eq.p1&select=id', 'b')).filter((r) => four.some((x) => x.id === r.id)), [], 'B never sees C\'s plans');

  const photo = { t: 'progress_photos', id: randomUUID(), f: { taken_on: new Date().toISOString().slice(0, 10), pose: 'front' } };
  assert.equal((await cPush([photo])).json.results[0].status, 'error', 'Free cannot add progress photos');
  assert.equal((await push('b', [{ ...photo, id: randomUUID() }])).json.results[0].status, 'applied', 'the trial can');

  const anon = await call('/rest/v1/rpc/my_plan_access', { method: 'POST', body: {} });
  assert.ok(anon.status >= 400, 'signed-out visitors cannot call it');
});

test('billing (WP12): only the server writes store purchases; nobody reads the webhook log', async () => {
  const apply = await rest('rpc/billing_apply', 'a', {
    method: 'POST', body: { p_user: users.a.id, p_rows: [{ source: 'play', product_id: 'gfd_pro:yearly', expires_at: '2099-01-01T00:00:00Z' }] },
  });
  assert.ok(apply.status >= 400, 'a user cannot call billing_apply');
  const anonApply = await call('/rest/v1/rpc/billing_apply', { method: 'POST', body: { p_user: users.a.id, p_rows: [] } });
  assert.ok(anonApply.status >= 400, 'signed-out visitors cannot call billing_apply');
  for (const who of ['a', null]) {
    const r = await rest('billing_events?select=id', who);
    assert.ok(r.status >= 400 || rows(r).length === 0, 'billing_events is not readable');
    const w = await rest('billing_events', who, { method: 'POST', body: { id: 'fake-' + run, type: 'INITIAL_PURCHASE' } });
    assert.ok(w.status >= 400, 'billing_events is not writable');
  }
  // B's purchase, written by the server, is B's alone
  const ok = await admin('/rest/v1/rpc/billing_apply', {
    method: 'POST', body: { p_user: users.b.id, p_rows: [{ source: 'play', product_id: 'gfd_pro:yearly', expires_at: '2099-01-01T00:00:00Z', will_renew: true }] },
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const bAcc = rows(await rest('my_access?select=source,product_id', 'b'))[0];
  assert.deepEqual(bAcc, { source: 'play', product_id: 'gfd_pro:yearly' });
  assert.notEqual(rows(await rest('my_access?select=source', 'a'))[0].source, 'play', "B's purchase gives A nothing");
  await admin('/rest/v1/rpc/billing_apply', { method: 'POST', body: { p_user: users.b.id, p_rows: [] } });
});
