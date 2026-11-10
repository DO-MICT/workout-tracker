/* Tests for src/js/health.js (WP9): injury notes only reach the server with health consent.
   Run: node --test tests/*.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "../src/js/health.js"), "utf8");
const SYNC = require("../src/js/syncmap.js");

/* a page with a fake Supabase that keeps health_limits rows in memory */
function page({ health, server = {}, S = {}, signedIn = true } = {}) {
  const calls = [];
  const rows = Object.entries(server).map(([exercise_id, note]) => ({ exercise_id, note }));
  const q = (table) => {
    const st = { table, filters: {} };
    const done = (v) => Promise.resolve(v);
    const api = {
      select: () => api,
      eq: (k, v) => { st.filters[k] = v; return st.op === "delete" ? api.run() : api.selectRun(); },
      selectRun: () => { calls.push(["select", table, { ...st.filters }]); return done({ data: rows.slice() }); },
      upsert: (row) => {
        calls.push(["upsert", table, row]);
        const i = rows.findIndex((r) => r.exercise_id === row.exercise_id);
        if (i >= 0) rows[i] = { exercise_id: row.exercise_id, note: row.note }; else rows.push({ exercise_id: row.exercise_id, note: row.note });
        return done({});
      },
      delete: () => { st.op = "delete"; return api; },
      run: () => {
        if (!("exercise_id" in st.filters)) return api;
        calls.push(["delete", table, { ...st.filters }]);
        const i = rows.findIndex((r) => r.exercise_id === st.filters.exercise_id);
        if (i >= 0) rows.splice(i, 1);
        return done({});
      },
    };
    return api;
  };
  const els = {};
  const ctx = {
    WEB_MODE: true, S, GFDSync: SYNC,
    sbUser: signedIn ? { id: "11111111-1111-4111-8111-111111111111" } : null,
    sb: { from: q, rpc: () => Promise.resolve({}) },
    consentRow: (k) => (k === "health" ? health : null),
    save: () => {}, toast: () => {}, esc: (s) => String(s), policyLink: () => "", policyVersion: () => "1", consentWhen: () => "today",
    document: { getElementById: (id) => els[id] || (els[id] = { hidden: true, dataset: {}, focus() {}, innerHTML: "" }), body: { style: {} } },
    openNote: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, calls, rows, els };
}
const ON = { kind: "health", active: true, version: "1", current_version: "1" };
const OFF = { kind: "health", active: false, version: "1", withdrawn_at: "2026-11-09T00:00:00Z", current_version: "1" };
const NEVER = { kind: "health", active: false, version: null, current_version: "1" };

test("consent state: on, withdrawn, never asked, or unknown when offline", () => {
  const { ctx } = page();
  assert.equal(ctx.healthStateOf(ON), "on");
  assert.equal(ctx.healthStateOf(OFF), "off");
  assert.equal(ctx.healthStateOf(NEVER), "never");
  assert.equal(ctx.healthStateOf(null), "unknown");
});

test("merge: the server wins, waiting changes go on top, and a phone's old notes upload the first time", () => {
  const { ctx } = page();
  const m = ctx.healthMerge({ bench: "server" }, { bench: "old", squat: "knee" }, { row: "" }, true);
  assert.deepEqual({ ...m.notes }, { bench: "server", squat: "knee" });
  assert.deepEqual({ ...m.queue }, { row: "", squat: "knee" });
  const later = ctx.healthMerge({ bench: "server" }, { squat: "knee" }, {}, false);
  assert.deepEqual({ ...later.notes }, { bench: "server" }, "after the first load, a note gone from the server is gone here");
});

test("with consent: notes load from the health table and this phone's old ones upload", async () => {
  const S = { notes: { squat: "Knee: box squat only" } };
  const { ctx, rows } = page({ health: ON, server: { bench: "Left shoulder" }, S });
  await ctx.healthStart();
  assert.deepEqual({ ...S.notes }, { bench: "Left shoulder", squat: "Knee: box squat only" });
  assert.deepEqual(rows.map((r) => r.exercise_id).sort(), ["bench", "squat"]);
  assert.deepEqual({ ...S.healthQ }, {}, "nothing left waiting");
});

test("saving and deleting a note goes to the health table, by a stable id", async () => {
  const S = { notes: {}, healthSync: "11111111-1111-4111-8111-111111111111" };
  const { ctx, calls, rows } = page({ health: ON, S });
  S.notes.row = "Lower back"; ctx.healthNoteChanged("row", "Lower back"); await ctx.healthBusy;
  const up = calls.find((c) => c[0] === "upsert");
  assert.equal(up[2].id, SYNC.recId("11111111-1111-4111-8111-111111111111", "hnote", "row"));
  assert.equal(up[2].kind, "exercise_note");
  delete S.notes.row; ctx.healthNoteChanged("row", ""); await ctx.healthBusy;
  assert.equal(rows.length, 0);
});

test("without consent nothing is sent; the phone asks once whether to keep its notes", async () => {
  const S = { notes: { bench: "Left shoulder" } };
  const { ctx, calls, els } = page({ health: NEVER, S });
  ctx.healthNoteChanged("bench", "Left shoulder");
  const started = ctx.healthStart();
  assert.equal(els.healthsheet.hidden, false, "the keep-your-notes sheet is open");
  assert.equal(els.healthsheet.dataset.mode, "move");
  ctx.healthClose(); await started;
  assert.equal(calls.length, 0, "nothing reached the server");
  assert.equal(S.notes.bench, "Left shoulder", "Not now keeps them on this phone");
  assert.equal(ctx.healthMayEdit("bench"), false, "adding a note asks first");
});

test("withdrawn on another device: this phone forgets its notes", async () => {
  const S = { notes: { bench: "Left shoulder" }, healthSync: "x" };
  const { ctx, calls } = page({ health: OFF, S });
  await ctx.healthStart();
  assert.deepEqual({ ...S.notes }, {});
  assert.equal(calls.length, 0);
});

test("signed out (local only): notes stay on the phone as before", () => {
  const S = { notes: {} };
  const { ctx, calls } = page({ signedIn: false, S });
  assert.equal(ctx.healthMayEdit("bench"), true);
  ctx.healthNoteChanged("bench", "x");
  assert.equal(S.healthQ, undefined);
  assert.equal(calls.length, 0);
});
