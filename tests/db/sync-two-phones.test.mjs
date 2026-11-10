// Two-phone sync test (NFR-2, WP3): two simulated phones run the app's own src/js/syncmap.js and
// src/js/store.js against the real sync_push / sync_pull / migrate_from_blob through the API.
// One phone moves an account off the blob, the second phone starts fresh, both change different
// things offline, and after they reconnect both phones hold both sets of changes.
//
// Same environment as rls-two-user.test.mjs (local Supabase or GFD Dev, never production).
// Run: node --test tests/db/*.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_KEY || '';
if (!URL_ || !ANON || !SERVICE) throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY (local or GFD Dev, never production).');
if (isProduction(URL_)) throw new Error('This is the production project (GFD Prod or the old one). Use local or GFD Dev.');
function isProduction(u) {
  const cfg = JSON.parse(process.getBuiltinModule('node:fs').readFileSync(new URL('../../deploy/supabase.json', import.meta.url), 'utf8'));
  const prod = (cfg.production.url || '').replace(/\/$/, '');
  return /zdllpjrkwcdmcuizxuum/.test(u) || (!!prod && u.replace(/\/$/, '') === prod);
}
const REPO = new URL('../../', import.meta.url).pathname;

async function call(path, { method = 'GET', token, key = ANON, body } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: {
      apikey: key,
      ...(token || !key.startsWith('sb_') ? { Authorization: 'Bearer ' + (token || key) } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}
const admin = (path, opts = {}) => call(path, { ...opts, key: SERVICE });
const user = {};

before(async () => {
  const email = `sync-${Date.now().toString(36)}@example.com`, password = 'Test-' + randomUUID();
  const made = await admin('/auth/v1/admin/users', { method: 'POST', body: { email, password, email_confirm: true } });
  assert.equal(made.status, 200, JSON.stringify(made.json));
  const signin = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  user.id = made.json.id; user.token = signin.json.access_token;
  // an account from before WP3: data still in the blob
  const r = await admin(`/rest/v1/profiles?id=eq.${user.id}`, { method: 'PATCH', body: { data_model: 1 } });
  assert.ok(r.status < 300, JSON.stringify(r.json));
});
after(async () => { if (user.id) await admin('/auth/v1/admin/users/' + user.id, { method: 'DELETE' }); });
const rest = (path) => call('/rest/v1/' + path, { token: user.token }).then((r) => (Array.isArray(r.json) ? r.json : []));

function phone(name, S) {
  const store = {};
  const ctx = {
    console: { warn() {}, log: console.log }, JSON, Math, Date, Object, Array, String, Number, parseFloat, isFinite, isNaN, Promise, encodeURIComponent, unescape,
    setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 5)), clearTimeout, setInterval: () => 0, clearInterval: () => {},
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { store[k] = undefined; } },
    document: { addEventListener() {}, activeElement: null, querySelector: () => null, visibilityState: 'visible' },
    navigator: { onLine: true }, KEY: 'split5-v1', S, sbUser: { id: user.id }, sbOk: false, sbOffline: false,
    setStatus() {}, renders: 0,
    // the supabase-js rpc shape: resolves {data, error}; a dropped connection rejects
    sb: { rpc: async (n, a) => {
      if (ctx.offline) throw new Error('Failed to fetch');
      const r = await call('/rest/v1/rpc/' + n, { method: 'POST', token: user.token, body: a });
      return r.status < 300 ? { data: r.json, error: null } : { data: null, error: r.json };
    } },
  };
  ctx.window = ctx; ctx.addEventListener = () => {}; ctx.renderAll = () => { ctx.renders++; }; ctx.DAYS = [];
  vm.createContext(ctx);
  for (const f of ['src/js/syncmap.js', 'src/js/store.js']) vm.runInContext(fs.readFileSync(REPO + f, 'utf8'), ctx, { filename: f });
  ctx.name = name;
  return ctx;
}

const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const blob = () => ({ v: 1, who: 0, names: ['Sam', 'Partner'], cur: [{}, {}], last: [{}, {}], theme: 'dark', onboarded: true,
  about: { train: 'gym', level: 'beginner', goal: 'strength', days: 3 },
  locs: { active: 'loc1', list: [{ id: 'loc1', name: 'Gym', gear: ['barbell'] }] },
  plans: { active: 'p1', custom: [{ id: 'p1', name: 'Plan one', days: {} }, { id: 'p2', name: 'Plan two', days: {} }], edits: {} },
  profile: { rest: 90, hist: [{ d: '2026-10-01T08:00:00.000Z', v: { weight: '81.2' } }] }, notes: { bench: 'Seat 4' } });

test('two phones: move off the blob, change different things offline, both end up with everything', async () => {
  const p1 = phone('p1', blob());
  assert.equal(await vm.runInContext(`storeStart(sbUser,1)`, p1), true, 'phone 1 moves off the blob');
  assert.equal((await rest('profiles?select=data_model'))[0].data_model, 2);
  assert.equal((await rest('plans?select=id')).length, 2);
  assert.equal((await rest('measurements?select=id')).length, 1);
  assert.equal((await rest('exercise_notes?select=id')).length, 0, 'injury notes are health details: not synced here (WP9)');
  await wait();
  assert.deepEqual(Object.keys(p1.SY.queue), [], 'nothing left to send after the move');

  const p2 = phone('p2', { v: 1, who: 0, names: ['You', 'Partner'], cur: [{}, {}], last: [{}, {}] });
  assert.equal(await vm.runInContext(`storeStart(sbUser,2)`, p2), true, 'phone 2 starts fresh');
  await wait();
  assert.equal(p2.S.plans.custom[1].name, 'Plan two');
  assert.equal(p2.S.notes, undefined, 'injury notes come from the health table (health.js), not sync');
  assert.equal(p1.S.notes.bench, 'Seat 4', 'phone 1 keeps its own notes until health.js handles them');
  assert.equal(p2.S.profile.hist[0].v.weight, '81.2');
  assert.deepEqual(Object.keys(p2.SY.queue), [], 'adopting the account data sends nothing back');

  // both phones go offline and change different things
  p1.offline = p2.offline = true;
  p1.S.plans.custom[0].name = 'Renamed on phone 1'; p1.S.theme = 'light';
  p2.S.plans.custom[1].name = 'Renamed on phone 2'; p2.S.palette = 'flow';
  vm.runInContext('storeChanged(true)', p1); vm.runInContext('storeChanged(true)', p2);
  await vm.runInContext('syPush()', p1); await vm.runInContext('syPush()', p2);
  assert.ok(Object.keys(p1.SY.queue).length >= 2, 'phone 1 keeps its changes while offline');
  // back online
  p1.offline = p2.offline = false; p1.SY.fails = p2.SY.fails = 0;
  await vm.runInContext('syPush().then(syPull)', p1);
  await vm.runInContext('syPush().then(syPull)', p2);
  await vm.runInContext('syPull()', p1);
  await wait();
  for (const p of [p1, p2]) {
    assert.equal(p.S.plans.custom[0].name, 'Renamed on phone 1', p.name);
    assert.equal(p.S.plans.custom[1].name, 'Renamed on phone 2', p.name);
    assert.equal(p.S.theme, 'light', p.name);
    assert.equal(p.S.palette, 'flow', p.name);
    assert.deepEqual(Object.keys(p.SY.queue), [], p.name + ' queue empty');
  }
  assert.ok(p1.renders > 0, "phone 1 redrew after pulling phone 2's changes");
  assert.equal((await rest('exercise_notes?select=id')).length, 0, 'still no injury notes in the synced tables');

  // a reopened phone with saved state only sends what changed
  const saved = JSON.parse(p1.localStorage.getItem('gfd-sync-' + user.id));
  assert.equal(saved.epoch, p1.S._sync);
  const p1b = phone('p1b', JSON.parse(JSON.stringify(p1.S)));
  p1b.localStorage.setItem('gfd-sync-' + user.id, JSON.stringify(saved));
  p1b.S.locs.list[0].gear.push('plates');
  const seqOf = async () => Math.max(...(await rest('plans?select=change_seq')).map((r) => r.change_seq));
  const seq0 = await seqOf();
  assert.equal(await vm.runInContext(`storeStart(sbUser,2)`, p1b), true);
  await wait();
  assert.deepEqual((await rest('locations?select=gear'))[0].gear, ['barbell', 'plates']);
  assert.equal(await seqOf(), seq0, 'plans were not sent again');
});
