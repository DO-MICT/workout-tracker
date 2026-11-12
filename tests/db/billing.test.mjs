// Billing (WP12): the billing-webhook Edge Function's code (supabase/functions/billing-webhook/core.js) runs against
// the real API, with RevenueCat replaced by a fake that answers like its REST v1 API.
//
// Runs against a local Supabase (the db-check workflow) or GFD Dev. Never point it at production: it creates and
// deletes accounts. Same variables as rls-two-user.test.mjs: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
//
// Run: node --test --test-concurrency=1 tests/db/*.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handleWebhook, handleSync } from '../../supabase/functions/billing-webhook/core.js';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_KEY || '';
if (!URL_ || !ANON || !SERVICE) {
  throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY (local or GFD Dev, never production).');
}
if (/zdllpjrkwcdmcuizxuum/.test(URL_)) throw new Error('This is production. Use local or GFD Dev.');

const PASSWORD = 'Test-' + randomUUID();
const run = Date.now().toString(36);
const users = {};
const DAY = 864e5;

function h(key, token) {
  return { apikey: key, ...(token || !key.startsWith('sb_') ? { Authorization: 'Bearer ' + (token || key) } : {}), 'Content-Type': 'application/json' };
}
async function call(path, { method = 'GET', key = ANON, token, body } = {}) {
  const res = await fetch(URL_ + path, { method, headers: h(key, token), body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}
async function makeUser(tag) {
  const email = `bill-${tag}-${run}@example.com`;
  const made = await call('/auth/v1/admin/users', { method: 'POST', key: SERVICE, body: { email, password: PASSWORD, email_confirm: true } });
  assert.equal(made.status, 200, JSON.stringify(made.json));
  const s = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: PASSWORD } });
  return { id: made.json.id, token: s.json.access_token };
}
const myAccess = async (who) => (await call('/rest/v1/my_access?select=tier,source,ends_at,will_renew,product_id', { token: users[who].token })).json[0];
const ents = async (who) => (await call(`/rest/v1/entitlements?select=source,status,will_renew,product_id&user_id=eq.${users[who].id}&order=source`, { key: SERVICE })).json;

// a fake RevenueCat: GET /v1/subscribers/{id} answers from this map
const rc = {};
const fakeFetch = async (url, init) => {
  const m = String(url).match(/^https:\/\/api\.revenuecat\.com\/v1\/subscribers\/([^/?]+)/);
  if (m) {
    assert.equal(init.headers.Authorization, 'Bearer sk_test', 'the secret key is sent');
    const sub = rc[decodeURIComponent(m[1])] || { subscriptions: {}, non_subscriptions: {}, entitlements: {} };
    return new Response(JSON.stringify({ subscriber: sub }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return fetch(url, init);
};
const opts = () => ({ url: URL_, key: SERVICE, revenuecatKey: 'sk_test', fetch: fakeFetch, sandbox: true });
const iso = (ms) => new Date(ms).toISOString();
const ev = (type, uid, extra = {}) => ({ event: { id: randomUUID(), type, app_user_id: uid, store: 'PLAY_STORE', product_id: 'gfd_pro:monthly', environment: 'SANDBOX', event_timestamp_ms: Date.now(), ...extra } });

before(async () => { users.a = await makeUser('a'); users.b = await makeUser('b'); });
after(async () => { for (const u of Object.values(users)) await call('/auth/v1/admin/users/' + u.id, { method: 'DELETE', key: SERVICE }); });

test('a Google Play purchase opens Pro; a retried webhook changes nothing twice', async () => {
  rc[users.a.id] = { subscriptions: { 'gfd_pro:yearly': {
    store: 'play_store', purchase_date: iso(Date.now() - 1000), expires_date: iso(Date.now() + 365 * DAY), is_sandbox: true,
    unsubscribe_detected_at: null, billing_issues_detected_at: null, refunded_at: null, store_transaction_id: 'GPA.1',
  } } };
  const e = ev('INITIAL_PURCHASE', users.a.id, { product_id: 'gfd_pro:yearly' });
  const r = await handleWebhook(opts(), e);
  assert.equal(r.status, 200);
  const a = await myAccess('a');
  assert.equal(a.source, 'play'); assert.equal(a.product_id, 'gfd_pro:yearly'); assert.equal(a.will_renew, true);
  const again = await handleWebhook(opts(), e);
  assert.equal(again.body.duplicate, true, 'the same event id is taken once');
  const log = (await call(`/rest/v1/billing_events?select=type,result,user_id&id=eq.${e.event.id}`, { key: SERVICE })).json;
  assert.deepEqual(log, [{ type: 'INITIAL_PURCHASE', result: 'applied', user_id: users.a.id }]);
});

test('cancelling keeps Pro to the end of the paid time; a refund ends it; the trial is untouched', async () => {
  const s = rc[users.a.id].subscriptions['gfd_pro:yearly'];
  s.unsubscribe_detected_at = iso(Date.now());
  await handleWebhook(opts(), ev('CANCELLATION', users.a.id));
  let a = await myAccess('a');
  assert.equal(a.source, 'play'); assert.equal(a.will_renew, false, 'still Pro, won\'t renew');
  s.refunded_at = iso(Date.now());
  await handleWebhook(opts(), ev('CANCELLATION', users.a.id, { cancel_reason: 'CUSTOMER_SUPPORT' }));
  a = await myAccess('a');
  assert.equal(a.source, 'trial', 'back to the sign-up trial');
  assert.deepEqual((await ents('a')).map((x) => [x.source, x.status]), [['play', 'refunded'], ['trial', 'active']]);
});

test('a transfer moves Pro from A to B', async () => {
  rc[users.b.id] = { subscriptions: { 'gfd_pro:monthly': {
    store: 'play_store', purchase_date: iso(Date.now()), expires_date: iso(Date.now() + 30 * DAY), is_sandbox: true, store_transaction_id: 'GPA.2',
  } } };
  rc[users.a.id] = { subscriptions: {} };
  // give A an active play row first, so the transfer has something to take away
  await call('/rest/v1/rpc/billing_apply', { method: 'POST', key: SERVICE, body: { p_user: users.a.id, p_rows: [{ source: 'play', product_id: 'gfd_pro:monthly', expires_at: iso(Date.now() + 30 * DAY) }] } });
  await handleWebhook(opts(), ev('TRANSFER', null, { transferred_from: [users.a.id], transferred_to: [users.b.id], app_user_id: undefined }));
  assert.equal((await myAccess('b')).source, 'play');
  assert.deepEqual((await ents('a')).filter((x) => x.source === 'play').map((x) => x.status), ['revoked']);
});

test('the app\'s own sync needs a signed-in user and writes only that user', async () => {
  assert.equal((await handleSync(opts(), null)).status, 401);
  assert.equal((await handleSync({ ...opts(), revenuecatKey: '' }, users.b.id)).status, 503);
  rc[users.b.id] = { subscriptions: {} };
  const r = await handleSync(opts(), users.b.id);
  assert.equal(r.status, 200);
  assert.equal((await myAccess('b')).source, 'trial', 'nothing bought any more: back to the trial');
});

test('an id that is not one of our accounts is logged and ignored', async () => {
  const r = await handleWebhook(opts(), ev('INITIAL_PURCHASE', '$RCAnonymousID:abc'));
  assert.equal(r.status, 200);
  assert.equal(r.body.users, 0);
  const ghost = randomUUID();
  const r2 = await handleWebhook(opts(), ev('INITIAL_PURCHASE', ghost));
  assert.equal(r2.status, 200, 'a deleted account does not make RevenueCat retry forever');
});
