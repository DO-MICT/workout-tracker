// Account deletion and data export (WP8): two real accounts use the API like the app and the deletion page do,
// and the delete-account Edge Function's code (supabase/functions/delete-account/core.js) runs against the same API.
//
// Runs against a local Supabase (the db-check workflow) or staging. Never point it at production: it creates and
// deletes accounts. Same variables as rls-two-user.test.mjs:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
//
// Run: node --test --test-concurrency=1 tests/db/*.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runDeletions, removeFiles } from '../../supabase/functions/delete-account/core.js';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_KEY || '';
if (!URL_ || !ANON || !SERVICE) {
  throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY (local or staging, never production).');
}
if (/zdllpjrkwcdmcuizxuum/.test(URL_)) throw new Error('This is the production project. Use local or staging.');

const run = Date.now().toString(36);
const PASSWORD = 'Test-' + randomUUID();
const users = {};

async function call(path, { method = 'GET', token, key = ANON, body, headers = {} } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: {
      apikey: key,
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
const fn = { url: URL_, key: SERVICE };

async function makeUser(tag) {
  const email = `del-${tag}-${run}@example.com`;
  const made = await admin('/auth/v1/admin/users', {
    method: 'POST', body: { email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: 'Del ' + tag } },
  });
  assert.equal(made.status, 200, 'create user ' + tag + ': ' + JSON.stringify(made.json));
  const signin = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: PASSWORD } });
  assert.equal(signin.status, 200, 'sign in ' + tag);
  return { id: made.json.id, email, token: signin.json.access_token };
}
async function addWorkout(who) {
  const r = await rest('rpc/save_workout', who, {
    method: 'POST',
    body: { w: { id: randomUUID(), plan_name: 'Del test', sets: [{ exercise_id: 'bench', exercise_name: 'Bench', exercise_order: 0, set_no: 1, weight: 60, reps: 8, done: true }] } },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
}
async function addFile(who, name) {
  const r = await call(`/storage/v1/object/suggestions/${users[who].id}/${name}`, {
    method: 'POST', token: users[who].token, body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), headers: { 'Content-Type': 'image/png' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
}
const makeDue = (who) => admin(`/rest/v1/deletion_requests?user_id=eq.${users[who].id}`, {
  method: 'PATCH', body: { due_at: new Date(Date.now() - 60000).toISOString() },
});
const authUser = async (who) => (await admin('/auth/v1/admin/users/' + users[who].id)).status;
const deletedEvents = async () => rows(await admin('/rest/v1/events?name=eq.account_deleted&select=name')).length;

before(async () => {
  for (const t of ['a', 'b', 'd', 'e', 'f']) users[t] = await makeUser(t);
});
after(async () => {
  for (const u of Object.values(users)) if (u && u.id) await admin('/auth/v1/admin/users/' + u.id, { method: 'DELETE' });
});

// ---------- export ----------

test('export: everything of mine, nothing of the other user, and nothing for signed-out visitors', async () => {
  await addWorkout('a');
  await addWorkout('b');
  const s = await rest('suggestions', 'a', { method: 'POST', body: { message: 'Export me' } });
  assert.ok(s.status < 300, JSON.stringify(s.json));

  const r = await rest('rpc/export_my_data', 'a', { method: 'POST', body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const x = r.json;
  assert.equal(x.format, 'gfd-export');
  assert.equal(x.account.id, users.a.id);
  assert.equal(x.account.email, users.a.email);
  assert.equal(x.profile.display_name, 'Del a');
  assert.equal(x.tables.workouts.length, 1);
  assert.equal(x.tables.workout_sets.length, 1);
  assert.equal(x.tables.workout_sets[0].weight, 60);
  assert.equal(x.tables.suggestions[0].message, 'Export me');
  assert.ok(x.tables.entitlements.some((e) => e.source === 'trial'), 'the trial is in the export');
  assert.ok(!JSON.stringify(x).includes(users.b.id), "none of B's ids appear in A's export");
  assert.ok(!JSON.stringify(x).includes('user_id'), 'no user_id columns repeated in every row');

  const anon = await rest('rpc/export_my_data', null, { method: 'POST', body: {} });
  assert.ok(anon.status >= 400, 'signed-out visitors cannot export');
});

// ---------- asking and cancelling ----------

test('deletion requests: private, asked and cancelled only through the functions, 7 days of grace', async () => {
  const ask = await rest('rpc/request_account_deletion', 'a', { method: 'POST', body: { p_source: 'page' } });
  assert.equal(ask.status, 200, JSON.stringify(ask.json));
  const days = (new Date(ask.json.due_at) - Date.now()) / 864e5;
  assert.ok(days > 6.99 && days <= 7.01, 'due in 7 days, got ' + days);
  assert.equal(ask.json.source, 'page');

  const again = await rest('rpc/request_account_deletion', 'a', { method: 'POST', body: {} });
  assert.equal(again.json.due_at, ask.json.due_at, 'asking again keeps the first date');

  assert.equal(rows(await rest('deletion_requests?select=user_id', 'a')).length, 1);
  assert.deepEqual(rows(await rest('deletion_requests?select=user_id', 'b')), [], "B doesn't see A's request");

  const early = await rest(`deletion_requests?user_id=eq.${users.a.id}`, 'a', { method: 'PATCH', body: { due_at: new Date().toISOString() } });
  assert.ok(early.status >= 400 || rows(early).length === 0, 'A cannot move the date');
  const forge = await rest('deletion_requests', 'b', { method: 'POST', body: { user_id: users.a.id, due_at: new Date().toISOString() } });
  assert.ok(forge.status >= 400, 'B cannot make a request for A');

  const bCancel = await rest('rpc/cancel_account_deletion', 'b', { method: 'POST', body: {} });
  assert.equal(bCancel.json, false, 'B has nothing to cancel');
  assert.equal(rows(await admin(`/rest/v1/deletion_requests?user_id=eq.${users.a.id}&select=user_id`)).length, 1, "B's cancel leaves A's request");

  const cancel = await rest('rpc/cancel_account_deletion', 'a', { method: 'POST', body: {} });
  assert.equal(cancel.json, true);
  assert.deepEqual(rows(await rest('deletion_requests?select=user_id', 'a')), []);

  const anon = await rest('rpc/request_account_deletion', null, { method: 'POST', body: {} });
  assert.ok(anon.status >= 400, 'signed-out visitors cannot ask');
});

// ---------- the deletion run ----------

test('delete-account: removes due accounts with their files and rows, and leaves everyone else alone', async () => {
  // d: due, with data and two files; e: asked but not due yet; f: asked then cancelled; b: never asked
  await addWorkout('d');
  await addFile('d', `shot-${run}.png`);
  await addFile('d', `shot2-${run}.png`);
  await addFile('b', `keep-${run}.png`);
  for (const t of ['d', 'e', 'f']) assert.equal((await rest('rpc/request_account_deletion', t, { method: 'POST', body: {} })).status, 200);
  await rest('rpc/cancel_account_deletion', 'f', { method: 'POST', body: {} });

  const before = await runDeletions(fn);
  assert.equal(await authUser('d'), 200, 'nothing happens before the 7 days are up');
  assert.equal(before.failed, 0);

  const events0 = await deletedEvents();
  await makeDue('d');
  const out = await runDeletions(fn);
  assert.equal(out.failed, 0, JSON.stringify(out));
  assert.ok(out.deleted >= 1 && out.files >= 2, JSON.stringify(out));
  assert.deepEqual(Object.keys(out).sort(), ['deleted', 'due', 'failed', 'files'], 'the result is counts only');

  assert.equal(await authUser('d'), 404, 'the auth user is gone');
  for (const t of ['profiles?id', 'workouts?user_id', 'workout_sets?user_id', 'entitlements?user_id', 'user_settings?user_id', 'deletion_requests?user_id']) {
    const [table, col] = t.split('?');
    assert.deepEqual(rows(await admin(`/rest/v1/${table}?${col}=eq.${users.d.id}&select=${col}`)), [], `${table} rows are gone`);
  }
  const files = await admin('/storage/v1/object/list/suggestions', { method: 'POST', body: { prefix: users.d.id, limit: 10, offset: 0 } });
  assert.deepEqual(rows(files), [], 'the files are gone');
  assert.ok(await deletedEvents() >= events0 + 1, 'an account_deleted event, with no id');
  users.d = null;

  for (const t of ['b', 'e', 'f']) assert.equal(await authUser(t), 200, `${t} still has an account`);
  const keep = await admin('/storage/v1/object/list/suggestions', { method: 'POST', body: { prefix: users.b.id, limit: 10, offset: 0 } });
  assert.equal(rows(keep).length, 1, "B's file is untouched");
  assert.equal(rows(await admin(`/rest/v1/deletion_requests?user_id=eq.${users.e.id}&select=user_id`)).length, 1, "E's request waits");
  await removeFiles(fn, 'suggestions', users.b.id);
});

test('delete-account: a failure is noted on the request and retried next time', async () => {
  await makeDue('e');
  const broken = (url, init) => (String(url).includes('/auth/v1/admin/users/') ? Promise.resolve(new Response('boom', { status: 500 })) : fetch(url, init));
  const out = await runDeletions({ ...fn, fetch: broken });
  assert.equal(out.failed, 1);
  const r = rows(await admin(`/rest/v1/deletion_requests?user_id=eq.${users.e.id}&select=attempts,last_error`))[0];
  assert.equal(r.attempts, 1);
  assert.match(r.last_error, /delete auth user: 500/);
  assert.equal(await authUser('e'), 200, 'still there after the failed try');

  const retry = await runDeletions(fn);
  assert.equal(retry.failed, 0);
  assert.equal(await authUser('e'), 404, 'deleted on the next run');
  users.e = null;
});
