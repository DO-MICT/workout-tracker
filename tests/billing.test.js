/* Tests for WP12 billing: the webhook's rules (supabase/functions/billing-webhook/core.js) and the app side
   (platform.billing in src/js/platform.js, src/js/billing.js). Run: node --test tests/*.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const core = () => import("../supabase/functions/billing-webhook/core.js");
const NOW = Date.parse("2026-11-11T10:00:00Z"), DAY = 864e5;
const iso = (ms) => new Date(ms).toISOString();
const UID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

test("stores map to entitlement sources", async () => {
  const { storeSource } = await core();
  assert.equal(storeSource("PLAY_STORE"), "play");
  assert.equal(storeSource("play_store"), "play");
  assert.equal(storeSource("PADDLE"), "web");
  assert.equal(storeSource("RC_BILLING"), "web");
  assert.equal(storeSource("STRIPE"), "web");
  assert.equal(storeSource("APP_STORE"), null);
  assert.equal(storeSource("PROMOTIONAL"), null, "promos go through admin_grant, not RevenueCat");
});

test("a subscription becomes one row: active, cancelled, in grace, expired, refunded", async () => {
  const { subscriptionRow } = await core();
  const base = { store: "play_store", purchase_date: iso(NOW - DAY), expires_date: iso(NOW + 29 * DAY), store_transaction_id: "GPA.1" };
  let r = subscriptionRow("gfd_pro:monthly", base, NOW);
  assert.deepEqual([r.source, r.status, r.will_renew, r.product_id, r.external_ref, r.note], ["play", "active", true, "gfd_pro:monthly", "GPA.1", "Google Play"]);
  r = subscriptionRow("gfd_pro:monthly", { ...base, unsubscribe_detected_at: iso(NOW) }, NOW);
  assert.deepEqual([r.status, r.will_renew], ["active", false], "cancelled: Pro to the end of the paid month");
  r = subscriptionRow("gfd_pro:monthly", { ...base, expires_date: iso(NOW - DAY), grace_period_expires_date: iso(NOW + 2 * DAY), billing_issues_detected_at: iso(NOW - DAY) }, NOW);
  assert.deepEqual([r.status, r.expires_at], ["grace", iso(NOW + 2 * DAY)], "card problem: Pro stays through Google's grace period");
  r = subscriptionRow("gfd_pro:monthly", { ...base, expires_date: iso(NOW - DAY) }, NOW);
  assert.deepEqual([r.status, r.will_renew], ["expired", false]);
  r = subscriptionRow("gfd_pro:monthly", { ...base, refunded_at: iso(NOW) }, NOW);
  assert.equal(r.status, "refunded");
  r = subscriptionRow("gfd_pro_yearly", { ...base, store: "paddle", is_sandbox: true }, NOW);
  assert.deepEqual([r.source, r.note], ["web", "Web checkout (test purchase)"]);
});

test("a customer record gives the best row per source, lifetime included, test purchases optional", async () => {
  const { rowsFromSubscriber } = await core();
  const sub = {
    subscriptions: {
      "gfd_pro:monthly": { store: "play_store", purchase_date: iso(NOW - 60 * DAY), expires_date: iso(NOW - 30 * DAY) },
      "gfd_pro:yearly": { store: "play_store", purchase_date: iso(NOW - 29 * DAY), expires_date: iso(NOW + 336 * DAY), is_sandbox: true },
      "gfd_pro_web_monthly": { store: "paddle", purchase_date: iso(NOW - 900 * DAY), expires_date: iso(NOW - 800 * DAY) },
    },
    non_subscriptions: {
      gfd_pro_lifetime: [{ id: "x", store: "play_store", purchase_date: iso(NOW - DAY), store_transaction_id: "GPA.L" }],
      gfd_tip_jar: [{ id: "y", store: "play_store", purchase_date: iso(NOW) }],
    },
  };
  const rows = rowsFromSubscriber(sub, { now: NOW });
  assert.deepEqual(rows.map((r) => [r.source, r.product_id, r.status]), [["play", "gfd_pro:yearly", "active"], ["lifetime", "gfd_pro_lifetime", "active"]],
    "the live yearly beats the lapsed monthly; a web plan that ended years ago is left out; a tip isn't Pro");
  const live = rowsFromSubscriber(sub, { now: NOW, sandbox: false });
  assert.deepEqual(live.map((r) => [r.source, r.product_id, r.status]), [["play", "gfd_pro:monthly", "expired"], ["lifetime", "gfd_pro_lifetime", "active"]],
    "with test purchases off, the sandbox yearly doesn't count");
  assert.deepEqual(rowsFromSubscriber(null, { now: NOW }), []);
});

test("without a secret key, an event describes its own product", async () => {
  const { rowsFromEvent } = await core();
  const ev = { type: "INITIAL_PURCHASE", store: "PLAY_STORE", product_id: "gfd_pro:monthly", purchased_at_ms: NOW, expiration_at_ms: NOW + 30 * DAY, environment: "PRODUCTION", transaction_id: "GPA.9" };
  assert.deepEqual(rowsFromEvent(ev, { now: NOW }).map((r) => [r.source, r.status, r.will_renew]), [["play", "active", true]]);
  assert.deepEqual(rowsFromEvent({ ...ev, type: "CANCELLATION" }, { now: NOW }).map((r) => [r.status, r.will_renew]), [["active", false]]);
  assert.deepEqual(rowsFromEvent({ ...ev, type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" }, { now: NOW }).map((r) => r.status), ["refunded"]);
  assert.deepEqual(rowsFromEvent({ ...ev, type: "EXPIRATION", expiration_at_ms: NOW - 1 }, { now: NOW }).map((r) => r.status), ["expired"]);
  assert.equal(rowsFromEvent({ ...ev, type: "TEST" }, { now: NOW }), null);
  assert.equal(rowsFromEvent({ ...ev, store: "APP_STORE" }, { now: NOW }), null);
  assert.equal(rowsFromEvent({ ...ev, environment: "SANDBOX" }, { now: NOW, sandbox: false }), null);
  assert.deepEqual(rowsFromEvent({ ...ev, type: "NON_RENEWING_PURCHASE", product_id: "gfd_pro_lifetime", expiration_at_ms: null }, { now: NOW }).map((r) => [r.source, r.expires_at]), [["lifetime", null]]);
});

test("event users are our account ids only, transfers included", async () => {
  const { eventUsers } = await core();
  const B = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
  assert.deepEqual(eventUsers({ app_user_id: UID.toUpperCase(), original_app_user_id: "$RCAnonymousID:12", aliases: [UID, "$RCAnonymousID:12"] }), [UID]);
  assert.deepEqual(eventUsers({ transferred_from: [UID], transferred_to: [B] }), [UID, B]);
});

test("the webhook secret must match exactly", async () => {
  const { webhookAllowed } = await core();
  const s = "a-long-random-webhook-secret-123";
  assert.equal(webhookAllowed(s, s), true);
  assert.equal(webhookAllowed("Bearer " + s, s), true);
  assert.equal(webhookAllowed("Bearer wrong", s), false);
  assert.equal(webhookAllowed(null, s), false);
  assert.equal(webhookAllowed("short", "short"), false, "a short secret is refused");
});

test("the webhook logs each event once and asks RevenueCat for the record", async () => {
  const { handleWebhook } = await core();
  const seen = new Set(), calls = [];
  const f = async (url, init = {}) => {
    calls.push([init.method || "GET", String(url).replace(/^https?:\/\/[^/]+/, "")]);
    if (/api\.revenuecat\.com/.test(url)) return Response.json({ subscriber: { subscriptions: { "gfd_pro:monthly": { store: "play_store", purchase_date: iso(NOW), expires_date: iso(NOW + 30 * DAY) } } } });
    if (/billing_events$/.test(url)) { const id = JSON.parse(init.body).id; const dup = seen.has(id); seen.add(id); return Response.json(dup ? [] : [{ id }], { status: 201 }); }
    if (/rpc\/billing_apply/.test(url)) { const b = JSON.parse(init.body); assert.equal(b.p_user, UID); assert.equal(b.p_rows[0].source, "play"); return Response.json(true); }
    return new Response("", { status: 204 });
  };
  const opts = { url: "https://x.supabase.co", key: "sb_secret_x", revenuecatKey: "sk_x", fetch: f, now: NOW };
  const payload = { event: { id: "ev1", type: "RENEWAL", app_user_id: UID, store: "PLAY_STORE", product_id: "gfd_pro:monthly" } };
  assert.deepEqual(await handleWebhook(opts, payload), { status: 200, body: { ok: true, users: 1 } });
  assert.deepEqual((await handleWebhook(opts, payload)).body, { ok: true, duplicate: true });
  assert.equal(calls.filter((c) => /revenuecat/.test(c[1]) || c[1].startsWith("/v1/subscribers")).length, 1, "RevenueCat asked once");
  assert.equal((await handleWebhook(opts, {})).status, 400);
});

test("a failed write forgets the event so RevenueCat's retry is processed", async () => {
  const { handleWebhook } = await core();
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push(init.method || "GET");
    if (/api\.revenuecat\.com/.test(url)) return new Response("down", { status: 503 });
    if (/billing_events$/.test(url)) return Response.json([{ id: "e" }], { status: 201 });
    return new Response("", { status: 204 });
  };
  await assert.rejects(handleWebhook({ url: "https://x", key: "k", revenuecatKey: "sk", fetch: f }, { event: { id: "e", type: "RENEWAL", app_user_id: UID } }), /RevenueCat: 503/);
  assert.ok(calls.includes("DELETE"), "the log row is removed");
});

/* ---------- the app side ---------- */
const PLATFORM = fs.readFileSync(path.join(__dirname, "../src/js/platform.js"), "utf8");
const BILLING = fs.readFileSync(path.join(__dirname, "../src/js/billing.js"), "utf8");

function app({ android = true, rcKey = "goog_key", purchase = null, access = { tier: "free", source: "none", will_renew: false, features: [] }, signedIn = true } = {}) {
  const calls = [], toasts = [], opened = [], store = {};
  let acc = { ...access };
  const pkgs = [
    { identifier: "$rc_monthly", packageType: "MONTHLY", product: { identifier: "gfd_pro:monthly", title: "GFD Pro (GFD)", priceString: "$4.99" } },
    { identifier: "$rc_annual", packageType: "ANNUAL", product: { identifier: "gfd_pro:yearly", title: "GFD Pro yearly", priceString: "$34.99" } },
    { identifier: "$rc_lifetime", packageType: "LIFETIME", product: { identifier: "gfd_pro_lifetime", priceString: "$79.99" } },
  ];
  const Purchases = {
    configure: (o) => { calls.push(["configure", o]); return Promise.resolve(); },
    logIn: (o) => { calls.push(["logIn", o]); return Promise.resolve({}); },
    logOut: () => { calls.push(["logOut"]); return Promise.resolve({}); },
    getOfferings: () => Promise.resolve({ current: { availablePackages: pkgs } }),
    purchasePackage: (o) => { calls.push(["purchase", o.aPackage.identifier]); return purchase ? Promise.reject(purchase) : Promise.resolve({ customerInfo: {} }); },
    restorePurchases: () => { calls.push(["restore"]); return Promise.resolve({ customerInfo: {} }); },
  };
  const ctx = {
    console, setTimeout: (fn) => fn(), URL, Promise,
    location: { origin: "https://getfitdaily.co.za", pathname: "/" },
    history: {}, navigator: {}, KeyboardEvent: function () {},
    document: { visibilityState: "visible", documentElement: { classList: { add() {} } }, addEventListener() {}, querySelector: () => null, getElementById: () => null },
    window: {},
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    cfg: () => (rcKey ? { play_billing: { rc_key: rcKey } } : {}),
    sbUser: signedIn ? { id: UID } : null,
    sb: { functions: { invoke: (name, o) => { calls.push(["invoke", name, o.method]); acc = { tier: "pro", source: "play", features: [], will_renew: true, product_id: "gfd_pro:yearly" }; return Promise.resolve({ data: { ok: true } }); } } },
    refreshAccess: () => Promise.resolve(acc),
    access: () => acc,
    isPro: () => acc.tier !== "free",
    toast: (m) => toasts.push(m),
    fmtDay: (s) => s.slice(0, 10),
    logEvent() {},
  };
  if (android) ctx.window.Capacitor = { getPlatform: () => "android", Plugins: { Purchases, App: { addListener() {}, getLaunchUrl: () => Promise.resolve(null) }, Browser: { open: (o) => { opened.push(o.url); return Promise.resolve(); } } } };
  vm.createContext(ctx);
  vm.runInContext(PLATFORM + "\n;this.platform=platform;", ctx);
  vm.runInContext(BILLING, ctx);
  return { ctx, calls, toasts, opened, store, setAccess: (a) => { acc = a; } };
}

test("on the website billing.js leaves GFDBilling to the web checkout", () => {
  const { ctx } = app({ android: false });
  assert.equal(ctx.platform.billing, null);
  assert.equal(ctx.window.GFDBilling, undefined);
});

test("in the app GFDBilling lists monthly and yearly with Google's prices", async () => {
  const { ctx, calls } = app();
  const b = ctx.window.GFDBilling;
  assert.equal(b.ready(), true);
  const plans = await b.plans();
  assert.deepEqual(JSON.parse(JSON.stringify(plans.map((p) => [p.id, p.title, p.price, p.per]))), [["$rc_monthly", "Monthly", "$4.99", "month"], ["$rc_annual", "Yearly", "$34.99", "year"]], "lifetime waits for WP15");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ["configure", { apiKey: "goog_key", appUserID: UID }], "RevenueCat knows the person by their Supabase id");
});

test("not ready without a key or a signed-in person", () => {
  assert.equal(app({ rcKey: null }).ctx.window.GFDBilling.ready(), false);
  assert.equal(app({ signedIn: false }).ctx.window.GFDBilling.ready(), false);
});

test("buying asks the server to sync, then Pro is open", async () => {
  const { ctx, calls } = app();
  const b = ctx.window.GFDBilling;
  await b.plans();
  assert.equal(await b.buy("plans", "$rc_annual"), true);
  assert.deepEqual(calls.filter((c) => c[0] !== "configure"), [["purchase", "$rc_annual"], ["invoke", "billing-webhook/sync", "POST"]]);
});

test("backing out is silent; other store errors have a friendly message", async () => {
  let b = app({ purchase: { code: "1", userCancelled: true } }).ctx.window.GFDBilling;
  await b.plans();
  await assert.rejects(b.buy("plans", "$rc_monthly"), (e) => e && e.cancelled === true);
  b = app({ purchase: { code: "6" } }).ctx.window.GFDBilling;
  await b.plans();
  await assert.rejects(b.buy("plans", "$rc_monthly"), /Restore purchases/);
  b = app().ctx.window.GFDBilling;
  await assert.rejects(b.buy("plans", "$rc_monthly"), /isn’t available/, "plans() wasn't loaded");
});

test("Your plan card: manage and restore for Google Play, a note for web and lifetime", () => {
  const { ctx, opened } = app();
  const play = ctx.billingCardHtml({ tier: "pro", source: "play", will_renew: true, product_id: "gfd_pro:monthly" });
  assert.match(play, /data-bill="manage"/); assert.match(play, /data-bill="restore"/); assert.match(play, /Cancel any time in Google Play/);
  assert.match(ctx.billingCardHtml({ tier: "pro", source: "web", will_renew: true }), /bought Pro on the website/);
  assert.match(ctx.billingCardHtml({ tier: "pro", source: "lifetime" }), /yours for good/);
  assert.doesNotMatch(ctx.billingCardHtml({ tier: "free", source: "none" }), /manage/);
  assert.equal(ctx.billingCardHtml({ tier: "tester", source: "preview" }), "");
  ctx.setTimeout = (fn) => fn();
  const t = { dataset: { bill: "manage" } };
  ctx.access = () => ({ source: "play", product_id: "gfd_pro:monthly" });
  assert.equal(ctx.billingClick(t), true);
  assert.equal(opened[0], "https://play.google.com/store/account/subscriptions?sku=gfd_pro&package=" + ctx.platform.storeUrl().split("id=")[1]);
  assert.match(app({ android: false }).ctx.billPlayManageUrl("gfd_pro:yearly"), /sku=gfd_pro&package=[a-z.]+$/, "the website uses the same package name");
  assert.equal(ctx.billingClick({ dataset: {} }), false);
});

test("restore checks Google Play and the server, then says what it found", async () => {
  const { ctx, calls, toasts } = app();
  const t = { dataset: { bill: "restore" }, disabled: false, textContent: "" };
  ctx.billingClick(t);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.ok(calls.some((c) => c[0] === "restore"));
  assert.ok(calls.some((c) => c[0] === "invoke"));
  assert.match(toasts[0], /Pro is back/);
});

test("a yearly plan gets one reminder in the week before it renews", () => {
  const { ctx, toasts } = app();
  const soon = new Date(Date.now() + 3 * DAY).toISOString();
  const a = { source: "play", will_renew: true, ends_at: soon, product_id: "gfd_pro:yearly" };
  ctx.billingAfterAccess(a);
  ctx.billingAfterAccess(a);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /renews on/);
  ctx.billingAfterAccess({ ...a, ends_at: new Date(Date.now() + 20 * DAY).toISOString() });
  ctx.billingAfterAccess({ ...a, product_id: "gfd_pro:monthly", ends_at: new Date(Date.now() + 2 * DAY).toISOString() });
  ctx.billingAfterAccess({ ...a, will_renew: false, ends_at: new Date(Date.now() + 2 * DAY).toISOString() });
  assert.equal(toasts.length, 1, "not too early, not for monthly, not when it won't renew");
});

test("signing out logs RevenueCat out too", async () => {
  const { ctx, calls } = app();
  await ctx.window.GFDBilling.plans();
  ctx.billingForget();
  await new Promise((r) => setImmediate(r));
  assert.ok(calls.some((c) => c[0] === "logOut"));
});

test("an upgrade page without a plan picker buys the yearly plan", async () => {
  const { ctx, calls } = app();
  assert.equal(await ctx.window.GFDBilling.buy("plans"), true);
  assert.ok(calls.some((c) => c[0] === "purchase" && c[1] === "$rc_annual"));
});

test("the upgrade page says Pro renews automatically and how to cancel", () => {
  const t = app().ctx.billingTermsHtml();
  assert.match(t, /renew automatically/); assert.match(t, /Google Play → Subscriptions/); assert.match(t, /Manage or cancel/);
  const w = app({ android: false }).ctx.billingTermsHtml();
  assert.match(w, /renew automatically/); assert.doesNotMatch(w, /Google Play/);
  const SRC = fs.readFileSync(path.join(__dirname, "../src/js/access.js"), "utf8");
  assert.ok(SRC.indexOf("billingTermsHtml()") < SRC.indexOf('id="proBuy"'), "the line comes before the buy button");
});
