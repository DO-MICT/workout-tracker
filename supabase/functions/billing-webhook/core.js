// WP12: the logic behind supabase/functions/billing-webhook (architecture 6.4).
// Plain JavaScript with fetch only, so the Edge Function (Deno) and the Node tests (tests/billing.test.mjs) run the
// same code.
//
// RevenueCat is the record of what each person bought (Google Play now; Paddle web checkout through RevenueCat Web
// Billing in WP13). Its app user id is the Supabase user id: the app logs in to RevenueCat with it.
// Two ways in:
//   webhook  RevenueCat posts an event (purchase, renewal, cancel, expiry, refund, transfer...). We log it once by its
//            id, then for every Supabase user it names we ask RevenueCat for that person's full customer record and
//            write the result with public.billing_apply. Asking again instead of trusting the event means events that
//            arrive late or out of order can't leave the wrong answer.
//   sync     the app, right after a purchase or a restore, asks us to do the same for the signed-in person, so Pro
//            opens at once instead of when the webhook arrives.
// Without REVENUECAT_SECRET_KEY the webhook falls back to the event's own fields (good enough for testing).

export const MANAGED = ['play', 'web', 'lifetime'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 864e5;

// RevenueCat store name -> entitlements.source; null = not ours to write here
export function storeSource(store) {
  const s = String(store || '').toLowerCase();
  if (s === 'play_store') return 'play';
  if (s === 'paddle' || s === 'rc_billing' || s === 'stripe') return 'web';
  return null;   // app_store (no iOS yet), promotional (use admin_grant), amazon, test_store...
}
const STORE_NOTE = { play: 'Google Play', web: 'Web checkout', lifetime: 'Lifetime' };

export function isLifetime(productId) { return /lifetime/i.test(String(productId || '')); }

function iso(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
  return isNaN(d) ? null : d.toISOString();
}
function later(a, b) { if (!a) return b; if (!b) return a; return Date.parse(a) >= Date.parse(b) ? a : b; }

// one RevenueCat subscription (REST v1 shape) -> an entitlement row
export function subscriptionRow(productId, s, now = Date.now()) {
  const source = storeSource(s.store);
  if (!source) return null;
  const expires = iso(s.expires_date);
  const grace = iso(s.grace_period_expires_date);
  const end = later(expires, grace);
  let status = 'active';
  if (s.refunded_at) status = 'refunded';
  else if (end && Date.parse(end) <= now) status = 'expired';
  else if (s.billing_issues_detected_at && grace && Date.parse(grace) > now) status = 'grace';
  const ended = status === 'refunded' || status === 'expired';
  return {
    source: isLifetime(productId) && !expires ? 'lifetime' : source,
    tier: 'pro',
    product_id: productId,
    starts_at: iso(s.purchase_date) || iso(s.original_purchase_date),
    expires_at: end,
    status,
    will_renew: !ended && !!expires && !s.unsubscribe_detected_at,
    external_ref: s.store_transaction_id || null,
    note: STORE_NOTE[source] + (s.is_sandbox ? ' (test purchase)' : ''),
  };
}

// one-time purchases: only lifetime products give Pro (WP15 sells them)
export function lifetimeRow(productId, purchases) {
  if (!isLifetime(productId) || !Array.isArray(purchases)) return null;
  const p = purchases.filter((x) => x && storeSource(x.store) && !x.refunded_at)
    .sort((a, b) => Date.parse(b.purchase_date || 0) - Date.parse(a.purchase_date || 0))[0];
  if (!p) return null;
  return {
    source: 'lifetime', tier: 'pro', product_id: productId, starts_at: iso(p.purchase_date), expires_at: null,
    status: 'active', will_renew: false, external_ref: p.store_transaction_id || p.id || null,
    note: 'Lifetime' + (p.is_sandbox ? ' (test purchase)' : ''),
  };
}

const RANK = { active: 4, grace: 3, paused: 2, expired: 1, refunded: 0, revoked: 0 };
function better(a, b) {
  if (!b) return true;
  if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] > RANK[b.status];
  if (!a.expires_at) return true;
  if (!b.expires_at) return false;
  return Date.parse(a.expires_at) > Date.parse(b.expires_at);
}

// a RevenueCat customer record (GET /v1/subscribers/{id} -> .subscriber) -> the best row per source.
// Ended plans are still sent (status expired/refunded) so the row says what happened instead of just vanishing.
export function rowsFromSubscriber(sub, { now = Date.now(), sandbox = true } = {}) {
  const best = {};
  const add = (row, isSandbox) => {
    if (!row || (isSandbox && !sandbox)) return;
    if (better(row, best[row.source])) best[row.source] = row;
  };
  for (const [pid, s] of Object.entries((sub && sub.subscriptions) || {})) add(subscriptionRow(pid, s || {}, now), s && s.is_sandbox);
  for (const [pid, list] of Object.entries((sub && sub.non_subscriptions) || {})) {
    const row = lifetimeRow(pid, (list || []).filter((p) => sandbox || !p.is_sandbox));
    add(row, false);
  }
  // an ended plan older than 400 days is history, not something to show
  return MANAGED.map((k) => best[k]).filter((r) => r && !(r.status !== 'active' && r.status !== 'grace' && r.expires_at && Date.parse(r.expires_at) < now - 400 * DAY));
}

// fallback without a RevenueCat secret key: what a single event says about its own product
export function rowsFromEvent(ev, { now = Date.now(), sandbox = true } = {}) {
  const source = storeSource(ev.store);
  if (!source || (!sandbox && ev.environment === 'SANDBOX')) return null;   // null = don't change anything
  const t = ev.type;
  if (t === 'TEST' || t === 'SUBSCRIBER_ALIAS' || t === 'TRANSFER') return null;
  const lifetime = isLifetime(ev.product_id) && !ev.expiration_at_ms;
  const s = {
    store: ev.store,
    purchase_date: ev.purchased_at_ms,
    expires_date: ev.expiration_at_ms,
    grace_period_expires_date: ev.grace_period_expiration_at_ms,
    is_sandbox: ev.environment === 'SANDBOX',
    store_transaction_id: ev.transaction_id || ev.original_transaction_id,
    unsubscribe_detected_at: t === 'CANCELLATION' || t === 'EXPIRATION' ? now : null,
    refunded_at: t === 'CANCELLATION' && ev.cancel_reason === 'CUSTOMER_SUPPORT' ? now : null,
    billing_issues_detected_at: t === 'BILLING_ISSUE' ? now : null,
  };
  if (lifetime) return [lifetimeRow(ev.product_id, [{ ...s, purchase_date: iso(ev.purchased_at_ms), refunded_at: s.refunded_at }])].filter(Boolean);
  const row = subscriptionRow(ev.product_id, s, now);
  if (!row) return null;
  if (t === 'EXPIRATION') { row.status = 'expired'; row.will_renew = false; }
  if (t === 'SUBSCRIPTION_PAUSED') { row.status = 'paused'; row.will_renew = false; }
  return [row];
}

// every Supabase user an event is about (a transfer moves a purchase from one account to another)
export function eventUsers(ev) {
  const ids = [ev.app_user_id, ev.original_app_user_id, ...(ev.aliases || []), ...(ev.transferred_from || []), ...(ev.transferred_to || [])];
  return [...new Set(ids.filter((x) => typeof x === 'string' && UUID.test(x)).map((x) => x.toLowerCase()))];
}

// RevenueCat sends exactly what was typed in its "Authorization header value" box; accept it with or without Bearer
export function webhookAllowed(header, secret) {
  if (!secret || secret.length < 20 || !header) return false;
  const h = String(header).trim();
  return h === secret || h === 'Bearer ' + secret;
}

// ---------- talking to Supabase and RevenueCat ----------
function sbHeaders(key, json) {
  const h = { apikey: key };
  if (!key.startsWith('sb_')) h.Authorization = 'Bearer ' + key;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}
async function ok(res, what, allow = []) {
  if (res.ok || allow.includes(res.status)) return res;
  const text = await res.text().catch(() => '');
  throw new Error(`${what}: ${res.status} ${text.slice(0, 200)}`);
}

export async function fetchSubscriber({ revenuecatKey, fetch: f = fetch }, uid) {
  const res = await ok(await f(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
    headers: { Authorization: 'Bearer ' + revenuecatKey, 'Content-Type': 'application/json' },
  }), 'RevenueCat');
  const body = await res.json();
  return body && body.subscriber;
}

export async function applyRows({ url, key, fetch: f = fetch }, uid, rows) {
  const res = await ok(await f(`${url}/rest/v1/rpc/billing_apply`, {
    method: 'POST', headers: sbHeaders(key, true), body: JSON.stringify({ p_user: uid, p_rows: rows }),
  }), 'billing_apply');
  return (await res.json()) === true;
}

// logs the event once; false if we already had it (RevenueCat retries until it gets a 200)
export async function logEvent({ url, key, fetch: f = fetch }, ev, uid) {
  const row = {
    id: String(ev.id), user_id: uid || null, type: String(ev.type || 'UNKNOWN'), store: ev.store || null,
    product_id: ev.product_id || null, environment: ev.environment || null, event_at: iso(ev.event_timestamp_ms),
  };
  const res = await f(`${url}/rest/v1/billing_events`, {
    method: 'POST', headers: { ...sbHeaders(key, true), Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  if (res.status === 409) return false;
  await ok(res, 'log event');
  const out = await res.json().catch(() => []);
  return Array.isArray(out) ? out.length > 0 : true;
}
async function noteResult({ url, key, fetch: f = fetch }, id, result) {
  await f(`${url}/rest/v1/billing_events?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: sbHeaders(key, true), body: JSON.stringify({ result: String(result).slice(0, 200) }),
  }).catch(() => {});
}

// brings one person's entitlements in line with RevenueCat; returns 'applied' | 'no user' | 'unchanged'
export async function syncUser(opts, uid, ev = null) {
  let rows;
  if (opts.revenuecatKey) rows = rowsFromSubscriber(await fetchSubscriber(opts, uid), { now: opts.now, sandbox: opts.sandbox });
  else if (ev && uid === String(ev.app_user_id || '').toLowerCase()) {
    rows = rowsFromEvent(ev, { now: opts.now, sandbox: opts.sandbox });
    if (!rows) return 'unchanged';
    // without the full record only this event's source is known: leave the other sources alone
    const managed = [...new Set(rows.map((r) => r.source))];
    if (!managed.length) return 'unchanged';
    const res = await ok(await (opts.fetch || fetch)(`${opts.url}/rest/v1/rpc/billing_apply`, {
      method: 'POST', headers: sbHeaders(opts.key, true), body: JSON.stringify({ p_user: uid, p_rows: rows, p_managed: managed }),
    }), 'billing_apply');
    return (await res.json()) === true ? 'applied' : 'no user';
  } else return 'unchanged';
  return (await applyRows(opts, uid, rows)) ? 'applied' : 'no user';
}

// the webhook: {status, body}
export async function handleWebhook(opts, payload) {
  const ev = payload && payload.event;
  if (!ev || !ev.id || !ev.type) return { status: 400, body: { error: 'no event' } };
  const users = eventUsers(ev);
  const first = await logEvent(opts, ev, users[0]);
  if (!first) return { status: 200, body: { ok: true, duplicate: true } };
  if (ev.type === 'TEST' || !users.length) {
    await noteResult(opts, ev.id, ev.type === 'TEST' ? 'test' : 'no user');
    return { status: 200, body: { ok: true, users: 0 } };
  }
  const out = {};
  try {
    for (const uid of users) out[uid] = await syncUser(opts, uid, ev);
  } catch (e) {
    await noteResult(opts, ev.id, 'error: ' + (e && e.message || e));
    // let RevenueCat retry: forget this event id so the retry isn't taken for a duplicate
    await (opts.fetch || fetch)(`${opts.url}/rest/v1/billing_events?id=eq.${encodeURIComponent(ev.id)}`, {
      method: 'DELETE', headers: sbHeaders(opts.key),
    }).catch(() => {});
    throw e;
  }
  const vals = Object.values(out);
  await noteResult(opts, ev.id, vals.includes('applied') ? 'applied' : vals.includes('no user') ? 'no user' : 'unchanged');
  return { status: 200, body: { ok: true, users: users.length } };
}

// the signed-in person's own sync, after a purchase or restore in the app
export async function handleSync(opts, uid) {
  if (!uid || !UUID.test(uid)) return { status: 401, body: { error: 'sign in first' } };
  if (!opts.revenuecatKey) return { status: 503, body: { error: 'billing is not set up yet' } };
  const r = await syncUser(opts, uid.toLowerCase());
  return { status: 200, body: { ok: r === 'applied' } };
}
