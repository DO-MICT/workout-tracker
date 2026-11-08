// RLS two-user test (NFR-7): two real accounts talk to the API the way the app does,
// and each one must only ever see and change its own data.
//
// Runs against a local Supabase (the db-check workflow) or staging. Never point it at production:
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
  throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY (local or staging, never production).');
}
if (/zdllpjrkwcdmcuizxuum/.test(URL_)) throw new Error('This is the production project. Use local or staging.');

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

for (const table of ['profiles', 'user_state', 'entitlements', 'my_access', 'workouts', 'workout_sets', 'suggestions',
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
  for (const table of ['profiles', 'user_state', 'entitlements', 'my_access', 'workouts', 'workout_sets', 'suggestions',
  ...SYNC_TABLES]) {
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
  for (const fn of ['start_trial', 'is_admin', 'can_grant', 'email_hash']) {
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
