/* Tests for src/js/events.js (WP5): usage events, error reports and app config.
   The browser file runs in a small fake page (vm), with a fake Supabase client. Run: node --test tests/*.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "../src/js/events.js"), "utf8");

function page({ webMode = true } = {}) {
  const store = {}, listeners = {}, els = {};
  const el = (id) => els[id] || (els[id] = { id, hidden: true, innerHTML: "", setAttribute() {}, addEventListener(t, f) { this["on" + t] = f; } });
  const ctx = {
    WEB_MODE: webMode, S: {}, saves: 0, sb: null, sbUser: null,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    location: { origin: "https://app.example", reload() { ctx.reloaded = true; } },
    document: {
      getElementById: (id) => (id === "updBar" ? els.updBar || null : id === "updReload" ? el("updReload") : els[id] || null),
      createElement: () => ({ setAttribute() {}, set id(v) { els[v] = this; } }),
      body: { appendChild() {} },
      addEventListener: (t, f) => { listeners["doc:" + t] = f; },
      visibilityState: "visible",
    },
    crypto: require("node:crypto").webcrypto,
    console,
  };
  ctx.save = () => { ctx.saves++; };
  ctx.window = ctx;
  ctx.window.addEventListener = (t, f) => { listeners[t] = f; };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, store, listeners, els, queue: () => JSON.parse(store["gfd-evq-v1"] || "[]") };
}

/* a fake Supabase client: rpc answers come from a function */
function fakeSb(answer, config = []) {
  const calls = [];
  return {
    calls,
    rpc(name, body) { calls.push({ name, body }); return Promise.resolve(answer(name, body)); },
    from() { return { select: () => Promise.resolve({ data: config, error: null }) }; },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test("versions compare by number, part by part", () => {
  const { ctx } = page();
  assert.equal(ctx.versionLess("2026.11.08", "2026.12.01"), true);
  assert.equal(ctx.versionLess("2026.11.08", "2026.11.08.2"), true);
  assert.equal(ctx.versionLess("2026.11.10", "2026.11.9"), false);
  assert.equal(ctx.versionLess("2026.11.08", "0"), false);
  assert.equal(ctx.versionLess("2026.11.08", "2026.11.08"), false);
});

test("props: short codes, numbers and true/false only (same rule as the database)", () => {
  const { ctx } = page();
  assert.equal(ctx.evPropsOk({ source: "play", n: 3, ok: true }), true);
  assert.equal(ctx.evPropsOk({ note: "my knee hurts" }), false);
  assert.equal(ctx.evPropsOk({ a: { b: 1 } }), false);
  assert.equal(ctx.evPropsOk({ Bad: 1 }), false);
  assert.equal(ctx.evPropsOk({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9 }), false);
});

test("errors are scrubbed of emails, query strings, ids and long numbers", () => {
  const { ctx } = page();
  assert.equal(ctx.evScrub("Failed for jo.smith+x@mail.com at /rest?id=123", 300), "Failed for [email] at /rest?[query]");
  assert.equal(ctx.evScrub("user 0f8fad5b-d9cb-469f-a165-70867728950e row 12345678", 300), "user [id] row [n]");
});

test("the anon id is random, kept for the install, and is not the account id", () => {
  const { ctx } = page();
  const a = ctx.evAnonId();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(ctx.evAnonId(), a);
});

test("events wait on the phone while offline and go out in order once connected", async () => {
  const { ctx, queue } = page();
  ctx.logEvent("onboarding_done", { train: "gym", days: 3 });
  ctx.logEvent("first_workout", { note: "free text is dropped" });
  ctx.logEvent("sign_up");   // server-only: ignored
  assert.deepEqual(queue().map((e) => e.n), ["onboarding_done", "first_workout"]);
  assert.deepEqual(queue()[1].p, {}, "bad props are replaced by none");

  const sb = fakeSb(() => ({ data: true, error: null, status: 200 }));
  ctx.sb = sb;
  ctx.evFlush();
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(sb.calls.map((c) => c.body.p_name), ["onboarding_done", "first_workout"]);
  assert.equal(sb.calls[0].body.p_app_version, ctx.APP_VERSION);
  assert.equal(sb.calls[0].body.p_platform, "web");
  assert.equal(sb.calls[0].body.p_anon_id, ctx.evAnonId());
  assert.ok(!("user_id" in sb.calls[0].body));
  assert.deepEqual(queue(), []);
});

test("a network failure keeps the event; a refusal drops it", async () => {
  const { ctx, queue } = page();
  let answer = { data: null, error: { message: "Failed to fetch" }, status: 0 };
  ctx.sb = fakeSb(() => answer);
  ctx.logEvent("export");
  for (let i = 0; i < 3; i++) await tick();
  assert.equal(queue().length, 1, "kept for later");
  answer = { data: null, error: { message: "Unknown event name" }, status: 400 };
  ctx.evFlush();
  for (let i = 0; i < 3; i++) await tick();
  assert.equal(queue().length, 0, "refused for good");
});

test("the queue never grows past 50", () => {
  const { ctx, queue } = page();
  for (let i = 0; i < 60; i++) ctx.logEvent("export");
  assert.equal(queue().length, 50);
});

test("nothing is sent inside Claude", () => {
  const { ctx, queue } = page({ webMode: false });
  ctx.logEvent("export");
  ctx.reportError("TypeError: x is undefined", "");
  assert.deepEqual(queue(), []);
});

test("errors: offline noise is skipped, repeats once, at most 5 per visit", async () => {
  const { ctx } = page();
  const sb = fakeSb(() => ({ data: true, error: null }));
  ctx.reportError("TypeError: a for me@x.com");   // before Supabase is ready: waits
  ctx.sb = sb;
  ctx.evReady();
  ctx.reportError("TypeError: Failed to fetch");
  ctx.reportError("Script error.");
  for (let i = 0; i < 10; i++) ctx.reportError("Error " + (i % 7));
  await tick();
  const msgs = sb.calls.filter((c) => c.name === "log_client_error").map((c) => c.body.p_message);
  assert.equal(msgs[0], "TypeError: a for [email]");
  assert.equal(msgs.length, 5);
  assert.equal(new Set(msgs).size, 5);
});

test("an older copy is asked to reload when min_version is newer; flags are read from config", async () => {
  const { ctx, els } = page();
  ctx.sb = fakeSb(() => ({ data: true, error: null }), [{ key: "min_version", value: "2099.01.01" }, { key: "flags", value: { new_stats: true } }]);
  ctx.cfgLoad();
  await tick(); await tick();
  assert.ok(els.updBar, "the reload bar shows");
  assert.equal(ctx.flag("new_stats"), true);
  assert.equal(ctx.flag("other"), false);

  const p2 = page();
  p2.ctx.sb = fakeSb(() => ({ data: true, error: null }), [{ key: "min_version", value: "0" }]);
  p2.ctx.cfgLoad();
  await tick(); await tick();
  assert.equal(p2.els.updBar, undefined, "no bar when the app is new enough");
});

test("week-2 return is counted once, only 7 to 13 days after joining", () => {
  const { ctx, queue } = page();
  const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
  ctx.evWeek2({ created_at: ago(3) });
  assert.equal(queue().length, 0);
  ctx.evWeek2({ created_at: ago(9) });
  ctx.evWeek2({ created_at: ago(9) });
  assert.deepEqual(queue().map((e) => e.n), ["week2_return"]);
  assert.equal(ctx.S.evW2, 1);
  const p2 = page();
  p2.ctx.evWeek2({ created_at: ago(20) });
  assert.equal(p2.queue().length, 0);
});
