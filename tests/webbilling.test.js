/* Tests for src/js/webbilling.js (WP13): Pro on the website through RevenueCat Web Billing and Paddle.
   A fake RevenueCat SDK stands in for vendor/purchases-js.umd.js. Run: node --test tests/*.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "../src/js/webbilling.js"), "utf8");
const UID = "00000000-0000-4000-8000-000000000001";

const pkg = (type, micros, period) => ({
  identifier: type, packageType: type,
  product: { normalPeriodDuration: period, currentPrice: { amountMicros: micros, formattedPrice: "US$" + (micros / 1e6).toFixed(2) } },
});
const OFFERING = { availablePackages: [pkg("$rc_monthly", 4990000, "P1M"), pkg("$rc_annual", 34990000, "P1Y"), pkg("$rc_lifetime", 79990000, null)] };

function page({ key = "rcb_test_key", native = false, web = true, user = { id: UID, email: "a@example.com" }, purchase, proAfter = 0, preset = null } = {}) {
  const calls = { configure: [], purchase: [], events: [], refresh: 0, changeUser: [], sync: [] };
  let pro = false;
  const inst = {
    getOfferings: async () => ({ current: OFFERING, all: { alt: { availablePackages: [OFFERING.availablePackages[0]] } } }),
    purchase: async (p) => { calls.purchase.push(p); if (purchase) return purchase(p); return { customerInfo: {} }; },
    getCustomerInfo: async () => ({ managementURL: "https://paddle.example/portal" }),
    changeUser: async (id) => { calls.changeUser.push(id); return {}; },
  };
  const ErrorCode = { UserCancelledError: 1 };
  const win = { Purchases: { Purchases: { configure: (c) => { calls.configure.push(c); return inst; } }, ErrorCode } };
  if (preset) win.GFDBilling = preset;
  const body = { appendChild() {} };
  const ctx = {
    window: win, WEB_MODE: web, sbUser: user, platform: { native },
    sb: { functions: { invoke: async (name, o) => { calls.sync.push([name, o.method]); return {}; } } },
    cfg: () => ({ web_billing: key == null ? undefined : { rc_key: key, offering: null } }),
    document: { createElement: () => ({ remove() {} }), body, head: body },
    navigator: { onLine: true },
    setTimeout: (fn) => setImmediate(fn),
    logEvent: (n, d) => calls.events.push([n, d]),
    refreshAccess: async () => { calls.refresh++; if (calls.purchase.length && calls.refresh > proAfter) pro = true; },
    isPro: () => pro, access: () => ({ source: pro ? "web" : "trial" }),
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, B: ctx.webBilling, win, calls };
}

test("offered only on the website, signed in, with a RevenueCat Web Billing key", () => {
  assert.equal(page().B.ready(), true);
  assert.ok(page().win.GFDBilling, "the website gets web billing");
  assert.equal(page({ native: true }).win.GFDBilling, undefined, "never inside the Android app");
  assert.equal(page({ native: true }).B.ready(), false);
  assert.equal(page({ key: null }).B.ready(), false, "no app_config row: not on sale yet");
  assert.equal(page({ key: "" }).B.ready(), false);
  assert.equal(page({ key: "sk_secret" }).B.ready(), false, "only a public rcb_ key is used");
  assert.equal(page({ user: null }).B.ready(), false, "signed out");
  assert.equal(page({ web: false }).B.ready(), false, "the preview inside Claude has no billing");
  const other = { buy() {} };
  assert.equal(page({ preset: other }).win.GFDBilling, other, "never replaces billing set by the app");
});

test("prices come from the RevenueCat offering: yearly first with its saving, then monthly and lifetime", async () => {
  const { B, calls } = page();
  const ch = await B.plans();
  assert.deepEqual(Array.from(ch, (c) => c.id), ["$rc_annual", "$rc_monthly", "$rc_lifetime"]);
  assert.deepEqual(Array.from(ch, (c) => c.per), ["year", "month", "once"]);
  assert.equal(ch[0].price, "US$34.99");
  assert.equal(ch[0].title, "Yearly");
  assert.equal(ch[0].note, "Save 42%");
  assert.equal(ch[1].price, "US$4.99");
  assert.equal(calls.configure.length, 1);
  assert.equal(calls.configure[0].appUserId, UID, "the RevenueCat customer is the Supabase user");
  assert.equal(calls.configure[0].apiKey, "rcb_test_key");
});

test("buying passes the package and email, then waits for the webhook to give Pro", async () => {
  const { B, calls } = page({ proAfter: 2 });
  const r = await B.buy("plans", "$rc_monthly");
  assert.equal(calls.purchase.length, 1);
  assert.equal(calls.purchase[0].rcPackage.packageType, "$rc_monthly");
  assert.equal(calls.purchase[0].customerEmail, "a@example.com");
  assert.equal(r.pending, false);
  assert.deepEqual(calls.sync[0], ["billing-webhook/sync", "POST"], "asks the server to read RevenueCat straight away");
  assert.ok(calls.refresh >= 3, "asked my_access again until Pro arrived");
  assert.deepEqual(calls.events.map((e) => e[0]), ["checkout_started", "checkout_paid"]);
});

test("paid but the webhook is slow: says pending instead of failing", async () => {
  const { B } = page({ proAfter: 999 });
  const r = await B.buy("general");
  assert.equal(r.pending, true);
});

test("closing the checkout is quiet; other failures say nothing was charged", async () => {
  const cancel = page({ purchase: () => { const e = new Error("x"); e.errorCode = 1; throw e; } });
  await assert.rejects(cancel.B.buy("plans", "$rc_annual"), (e) => e.cancelled === true);
  assert.equal(cancel.calls.events.at(-1)[0], "checkout_cancelled");
  const fail = page({ purchase: () => { const e = new Error("boom"); e.errorCode = 7; throw e; } });
  await assert.rejects(fail.B.buy("plans", "$rc_annual"), /Nothing was charged/);
});

test("a different account on the same page becomes a different RevenueCat customer", async () => {
  const { B, ctx, calls } = page();
  await B.plans();
  ctx.sbUser = { id: "00000000-0000-4000-8000-000000000002" };
  B.forget();
  await B.plans();
  assert.equal(calls.configure.length, 1);
  assert.deepEqual([...calls.changeUser], ["00000000-0000-4000-8000-000000000002"]);
});
