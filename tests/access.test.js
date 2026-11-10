/* Tests for the Free limits in src/js/access.js (WP14): which plans are read-only, the plan cap,
   measurement sites and the upgrade page's words. Run: node --test tests/*.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "../src/js/access.js"), "utf8");
const UID = "00000000-0000-4000-8000-000000000001";

function page({ tier = "free", features = [], custom = [], active = "split5", locked = null, config = {}, web = true } = {}) {
  const store = {};
  const P = { active, custom: custom.map((id) => ({ id, name: "Plan " + id })), edits: {} };
  const ctx = {
    WEB_MODE: web, sb: null, sbUser: { id: UID },
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    document: { addEventListener() {}, getElementById: () => null },
    window: {},
    cfg: () => config,
    acct: () => ({ id: UID }),
    plansState: () => P,
    customById: (id) => P.custom.find((c) => c.id === id) || null,
    msSpot: (k) => ({ weight: ["weight", "Weight"], waist: ["waist", "Waist"], chest: ["chest", "Chest"], hips: ["hips", "Hips"], neck: ["neck", "Neck"] })[k] || null,
    esc: (s) => String(s),
    save() {}, renderPlans() {}, logEvent() {},
  };
  store["gfd-access-v1"] = JSON.stringify({ uid: UID, tier, source: tier === "free" ? "none" : "play", ends_at: null, will_renew: false, features,
    plans: locked ? { limit: 3, locked } : null });
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, P };
}
const keys = (o) => Object.keys(o).sort();

test("Pro and testers have no read-only plans", () => {
  const { ctx } = page({ tier: "pro", features: ["plans.unlimited", "measure.full"], custom: ["a", "b", "c", "d", "e"] });
  assert.deepEqual(keys(ctx.lockedPlans()), []);
  assert.equal(ctx.planCap(), Infinity);
  assert.equal(ctx.canAddPlan(), true);
  assert.equal(ctx.msLocked("neck"), false);
});

test("Free keeps 3 of its own plans; built-in plans are never counted", () => {
  const { ctx } = page({ custom: ["a", "b"] });
  assert.equal(ctx.plansInUse(), 2);
  assert.equal(ctx.canAddPlan(), true);
  assert.equal(ctx.planLocked("split5"), false, "built-in plans are open");
  const three = page({ custom: ["a", "b", "c"] }).ctx;
  assert.equal(three.canAddPlan(), false, "the 4th needs Pro");
});

test("the server's list wins; offline extras beyond the cap are read-only too, never the active plan", () => {
  const srv = page({ custom: ["a", "b", "c", "d"], locked: ["a"] }).ctx;
  assert.deepEqual(keys(srv.lockedPlans()), ["a"]);
  const offline = page({ custom: ["a", "b", "c", "d", "e"], active: "e" }).ctx;
  assert.deepEqual(keys(offline.lockedPlans()), ["c", "d"], "active first, then list order");
  assert.equal(offline.planLocked("e"), false);
  const both = page({ custom: ["a", "b", "c", "d", "e"], locked: ["b"] }).ctx;
  assert.deepEqual(keys(both.lockedPlans()), ["b", "e"], "a plan made offline beyond the cap waits too");
});

test("the cap and the basic sites come from app_config.free_limits", () => {
  const { ctx } = page({ custom: ["a", "b", "c", "d"], config: { free_limits: { plans: 5, measure_sites: ["weight", "neck"] } } });
  assert.equal(ctx.planCap(), 5);
  assert.equal(ctx.canAddPlan(), true);
  assert.equal(ctx.msLocked("neck"), false);
  assert.equal(ctx.msLocked("waist"), true);
  assert.equal(ctx.freeSitesText(), "Weight and neck");
  const bad = page({ config: { free_limits: { plans: "x", measure_sites: [] } } }).ctx;
  assert.equal(bad.planCap(), 3, "a bad value falls back to 3");
  assert.equal(bad.freeSitesText(), "Weight, waist, chest and hips");
});

test("Free logs the basic sites; height is always open; left sides follow their site", () => {
  const { ctx } = page();
  assert.equal(ctx.msLocked("weight"), false);
  assert.equal(ctx.msLocked("height"), false);
  assert.equal(ctx.msLocked("neck"), true);
  assert.equal(ctx.msLocked("uarmL"), true);
});

test("the preview inside Claude has everything open", () => {
  const { ctx } = page({ web: false, custom: ["a", "b", "c", "d", "e"] });
  assert.deepEqual(keys(ctx.lockedPlans()), []);
  assert.equal(ctx.msLocked("neck"), false);
});

test("a trial that ended offline is Free again, and a cached copy of someone else counts for nothing", () => {
  const ended = page({ tier: "pro", features: ["plans.unlimited"], custom: ["a", "b", "c", "d"] });
  const a = JSON.parse(ended.ctx.localStorage.getItem("gfd-access-v1"));
  a.source = "trial"; a.ends_at = new Date(Date.now() - 1000).toISOString();
  ended.ctx.localStorage.setItem("gfd-access-v1", JSON.stringify(a));
  vm.runInContext("ACC=null", ended.ctx);
  assert.deepEqual(keys(ended.ctx.lockedPlans()), ["d"]);
});

test("every upgrade reason has friendly words", () => {
  const { ctx } = page();
  for (const why of ["general", "plans", "stats", "measure", "photos", "timed", "progression"]) {
    const line = vm.runInContext(`PRO_WHY[${JSON.stringify(why)}]()`, ctx);
    assert.match(line, /^[A-Z].+\.$/, why);
  }
  assert.match(vm.runInContext("PRO_WHY.plans()", ctx), /3 of your own plans/);
});
