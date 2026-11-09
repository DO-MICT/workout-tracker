/* Tests for src/js/syncmap.js (WP3: blob -> per-record sync). Run with: node --test tests/*.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const M = require("../src/js/syncmap.js");

const UID = "aaaaaaaa-0000-4000-8000-000000000001";

/* a blob like a real tester's, with every part the app keeps */
function sample() {
  return {
    v: 1, who: 0, ts: 1730000000000, names: ["Sam", "Partner"],
    cur: [{ bench: [{ w: "60", r: "8", d: true }] }, {}], last: [{}, {}],
    account: { id: UID, email: "sam@example.com", signedIn: true },
    wout: [{ id: "w1", sets: [] }], gearSeedV1: 1,
    theme: "dark", palette: "flow", celebrate: "calm", onboarded: true, sgSeen: "2026-11-01T00:00:00Z",
    swapToday: { date: "2026-11-08", plan: "split5", days: { mon: { a: "b" } } },
    coles: { opts: { focus: "full", count: 6, sets: 3, loc: "" } }, prReset: { bench: "2026-10-01" },
    about: { train: "gym", level: "beginner", goal: "strength", days: 4 },
    profile: {
      rest: 120, vals: { weight: "80.6", height: "180.0" }, mset: { off: {}, lr: true, tips: true }, remind: { weigh: 7, tape: 28 },
      hist: [
        { d: "2026-10-01T08:00:00.000Z", v: { weight: "81.2", waist: "88.5", uarm: "34.0", uarmL: "33.5" } },
        { d: "2026-11-01T08:00:00.000Z", v: { weight: "80.6" } },
      ],
    },
    locs: { active: "loc2", list: [
      { id: "loc1", name: "Gym", gear: ["barbell", "plates", "adjbench"] },
      { id: "loc2", name: "Home", gear: ["dumbbells"], kind: "home" },
    ] },
    plans: {
      active: "p1", custom: [
        { id: "p1", name: "My push pull", dayIds: ["mon", "thu"], days: { mon: { title: "Push", ex: [{ id: "bench", sets: 3, reps: "8" }] } }, rest: 90 },
        { id: "p2", name: "Legs", days: {} },
      ],
      edits: { split5: { mon: { title: "Chest", ex: [{ id: "bench", sets: 4, reps: "6", link: false }] } } },
      meta: { split5: { name: "My 5-day", rest: 60 } },
      dayLoc: { split5: { mon: "loc1" }, p1: { thu: "loc2" } },
    },
    notes: { bench: "Seat 4, grip on rings", squat: "Box at parallel" },
  };
}
const synced = (S) => { const o = JSON.parse(JSON.stringify(S)); for (const k of Object.keys(M.LOCAL)) delete o[k]; return o; };

test("record ids are real UUID v5 and stable", () => {
  // RFC 4122 example: v5 of "www.example.com" in the DNS namespace
  assert.equal(M.uuidv5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"), "2ed6657d-e927-568b-95e1-2665a8aea6a2");
  const id = M.recId(UID, "plan", "p1");
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(M.recId(UID, "plan", "p1"), id, "same input, same id");
  assert.notEqual(M.recId("bbbbbbbb-0000-4000-8000-000000000002", "plan", "p1"), id, "another user gets another id");
  // matches Node's own SHA-1 for a longer, non-ASCII name
  const name = UID + ":note:café-🏋️-" + "x".repeat(200);
  const ns = Buffer.from("6f1c2a529d3e5b7a8c410e5d7b2f9a63", "hex");
  const h = crypto.createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest().subarray(0, 16);
  h[6] = (h[6] & 15) | 0x50; h[8] = (h[8] & 63) | 0x80;
  const x = h.toString("hex");
  assert.equal(M.uuidv5(name), `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`);
});

test("the blob splits into the synced tables", () => {
  const R = M.toRecords(sample(), UID);
  const by = (t) => Object.values(R).filter((r) => r.t === t);
  assert.equal(by("user_settings").length, 1);
  assert.equal(by("user_settings")[0].id, UID);
  const st = by("user_settings")[0].f;
  assert.equal(st.theme, "dark");
  assert.equal(st.active_plan, "p1");
  assert.equal(st.rest_default, 120);
  assert.deepEqual(st.display_names, ["Sam", "Partner"]);
  assert.equal(st.prefs.onboarded, true);
  assert.deepEqual(st.prefs["profile.vals"], { weight: "80.6", height: "180.0" });
  assert.equal(st.prefs["locs.active"], "loc2");
  for (const k of ["cur", "last", "wout", "account", "who", "v", "ts", "gearSeedV1"]) assert.ok(!(k in st.prefs), k + " stays on the phone");
  assert.deepEqual(by("about_me")[0].f, { train: "gym", level: "beginner", goal: "strength", days_per_week: 4 });
  assert.equal(by("locations").length, 2);
  assert.deepEqual(by("locations").find((r) => r.f.local_id === "loc2").f, { local_id: "loc2", name: "Home", gear: ["dumbbells"], sort: 1, extra: { kind: "home" } });
  const plans = by("plans");
  assert.deepEqual(plans.map((r) => r.f.local_id).sort(), ["p1", "p2", "split5"]);
  const s5 = plans.find((r) => r.f.local_id === "split5").f;
  assert.equal(s5.source_template, "split5");
  assert.equal(s5.name, "My 5-day");
  assert.deepEqual(Object.keys(s5.body).sort(), ["dayLoc", "edits", "meta"]);
  const p1 = plans.find((r) => r.f.local_id === "p1").f;
  assert.equal(p1.source_template, null);
  assert.equal(p1.body.custom.name, "My push pull");
  assert.deepEqual(p1.body.dayLoc, { thu: "loc2" });
  const ms = by("measurements");
  assert.equal(ms.length, 5);
  const left = ms.find((r) => r.f.site === "uarm" && r.f.side === "left");
  assert.equal(left.f.value, 33.5);
  assert.equal(ms.find((r) => r.f.site === "waist").f.side, null);
  assert.deepEqual(by("exercise_notes").map((r) => r.f.exercise_id).sort(), ["bench", "squat"]);
});

test("records turn back into the same app data (round trip)", () => {
  const S0 = sample();
  const R = M.toRecords(S0, UID);
  const S1 = M.applyRecords({ v: 1, who: 0, cur: [{}, {}], last: [{}, {}], names: ["You", "Partner"] }, JSON.parse(JSON.stringify(R)));
  assert.deepEqual(M.toRecords(S1, UID), R, "records -> app data -> records is unchanged, so nothing is pushed again");
  const a = synced(S0), b = synced(S1);
  assert.deepEqual(b.plans.custom, a.plans.custom, "custom plans keep their order and content");
  assert.deepEqual(b.plans.edits, a.plans.edits);
  assert.deepEqual(b.plans.meta, a.plans.meta);
  assert.deepEqual(b.plans.dayLoc, a.plans.dayLoc);
  assert.equal(b.plans.active, "p1");
  assert.deepEqual(b.locs, a.locs);
  assert.deepEqual(b.about, a.about);
  assert.deepEqual(b.notes, a.notes);
  assert.deepEqual(b.profile.hist, a.profile.hist);
  assert.deepEqual(b.profile.vals, a.profile.vals);
  assert.equal(b.profile.rest, 120);
  assert.deepEqual(b.swapToday, a.swapToday);
  assert.equal(b.theme, "dark");
  assert.deepEqual(b.names, ["Sam", "Partner"]);
});

test("applying records keeps the in-progress workout and the outbox", () => {
  const S = sample();
  const R = M.toRecords(sample(), UID);
  R["user_settings:" + UID].f.theme = "light";
  M.applyRecords(S, R);
  assert.equal(S.theme, "light");
  assert.deepEqual(S.cur[0].bench[0], { w: "60", r: "8", d: true });
  assert.equal(S.wout.length, 1);
  assert.equal(S.account.email, "sam@example.com");
});

test("with nothing on the server yet, applying changes nothing", () => {
  const S = sample();
  M.applyRecords(S, {});
  assert.deepEqual(S, sample());
});

test("only changed fields are sent, settings key by key, removed records as deletes", () => {
  const S = sample();
  const prev = M.toRecords(S, UID);
  S.plans.custom[0].name = "Push pull v2";
  S.coles.opts.count = 8;
  delete S.prReset;
  delete S.notes.squat;
  S.locs.list[0].gear.push("smith");
  const muts = M.diff(prev, M.toRecords(S, UID));
  const find = (t, f) => muts.filter((m) => m.t === t && (!f || f(m)));
  const st = find("user_settings")[0];
  assert.deepEqual(st.f, { prefs: { coles: { opts: { focus: "full", count: 8, sets: 3, loc: "" } }, prReset: null } });
  const p1 = find("plans", (m) => m.id === M.recId(UID, "plan", "p1"))[0];
  assert.deepEqual(Object.keys(p1.f).sort(), ["body", "name"]);
  assert.equal(find("exercise_notes")[0].op, "delete");
  assert.deepEqual(find("locations")[0].f, { gear: ["barbell", "plates", "adjbench", "smith"] });
  assert.equal(muts.length, 4);
  assert.deepEqual(M.diff(prev, prev), [], "no change, nothing to send");
});

test("key order from the database does not count as a change", () => {
  const prev = M.toRecords(sample(), UID);
  const key = "plans:" + M.recId(UID, "plan", "split5");
  const row = { id: prev[key].id, deleted_at: null, rev: 3, ...prev[key].f };
  row.body = Object.fromEntries(Object.entries(row.body).reverse());
  assert.notEqual(JSON.stringify(row.body), JSON.stringify(prev[key].f.body));
  const back = M.fromServer("plans", JSON.parse(JSON.stringify(row)));
  assert.equal(M.canon(back.f), M.canon(prev[key].f));
});

test("server rows are normalised; tombstones come back as null", () => {
  const m = M.fromServer("measurements", { id: "x", taken_at: "2026-10-01T08:00:00+00:00", site: "weight", side: null, value: "81.20", deleted_at: null, rev: 1 });
  assert.deepEqual(m.f, { taken_at: "2026-10-01T08:00:00.000Z", site: "weight", side: null, value: 81.2 });
  assert.equal(M.fromServer("plans", { id: "x", deleted_at: "2026-11-08T00:00:00Z" }), null);
  assert.equal(M.fromServer("schedule_entries", { id: "x" }), null, "tables the app doesn't use yet are ignored");
});

test("the waiting queue keeps one entry per record", () => {
  const Q = {};
  M.enqueue(Q, { t: "user_settings", id: UID, op: "upsert", f: { theme: "dark", prefs: { a: 1 } } });
  M.enqueue(Q, { t: "user_settings", id: UID, op: "upsert", f: { prefs: { b: 2, a: null } } });
  assert.deepEqual(Q["user_settings:" + UID].f, { theme: "dark", prefs: { a: null, b: 2 } });
  M.enqueue(Q, { t: "plans", id: "p", op: "upsert", f: { name: "x" } });
  M.enqueue(Q, { t: "plans", id: "p", op: "delete" });
  assert.equal(Q["plans:p"].op, "delete");
  M.enqueue(Q, { t: "plans", id: "p", op: "upsert", f: { name: "y", local_id: "p" } });
  assert.deepEqual(Q["plans:p"], { t: "plans", id: "p", op: "upsert", f: { name: "y", local_id: "p" } });
});

test("a pulled row keeps this phone's waiting changes on top", () => {
  const server = { theme: "light", palette: "volt", prefs: { a: 1, b: 2 } };
  assert.deepEqual(M.overlay(server, { theme: "dark", prefs: { b: null, c: 3 } }), { theme: "dark", palette: "volt", prefs: { a: 1, c: 3 } });
});

test("NFR-2: two phones edit different plans offline and both keep their changes", () => {
  // both phones start from the same synced state
  const base = M.toRecords(sample(), UID);
  const phone1 = sample(), phone2 = sample();
  phone1.plans.custom[0].name = "Changed on phone 1";
  phone2.plans.custom[1].name = "Changed on phone 2";
  const m1 = M.diff(base, M.toRecords(phone1, UID));
  const m2 = M.diff(base, M.toRecords(phone2, UID));
  // the server applies field patches in arrival order (sync_push)
  const server = JSON.parse(JSON.stringify(base));
  for (const m of [...m1, ...m2]) server[m.t + ":" + m.id].f = M.overlay(server[m.t + ":" + m.id].f, m.f);
  const after = M.applyRecords(sample(), server);
  assert.equal(after.plans.custom[0].name, "Changed on phone 1");
  assert.equal(after.plans.custom[1].name, "Changed on phone 2");
});
