/* Tests for the tablet and desktop mode in src/js/wide.js (WP16): the date-range buckets on Stats and the
   week grid's moves (supersets never join by accident). Run: node --test tests/*.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "../src/js/wide.js"), "utf8");
function page() {
  const noop = () => {};
  const ctx = {
    window: {}, document: { addEventListener: noop, body: null, querySelectorAll: () => [] },
    WEEK: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((id) => ({ id })),
    LIB: { a: { n: "A", sets: 3, reps: "10" }, b: { n: "B", sets: 4, reps: "8" } },
    ST: { from: "", to: "" }, MON3: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    stAdd: (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return ctx;
}
const ex = (id, link) => ({ id, sets: 3, reps: "10", link: !!link });
function grid(ctx, days, ids) {
  const all = {}; ctx.WEEK.forEach((w) => { all[w.id] = days[w.id] || { title: "Rest day", ex: [] }; });
  ctx.PG = { id: "p", d: { ids, days: all }, orig: "", undo: [], redo: [], dirty: false };
  vm.runInContext("PG=this.PG", ctx);
  return ctx.PG;
}

test("custom range: days up to 2 weeks, then weeks, then months", () => {
  const c = page();
  c.ST.from = "2026-11-01"; c.ST.to = "2026-11-07";
  let p = c.stCustomPeriod(0); assert.equal(p.b.length, 7); assert.equal(p.b[0].k, "day");
  c.ST.from = "2026-09-15"; c.ST.to = "2026-11-09";
  p = c.stCustomPeriod(0); assert.equal(p.b.length, 8); assert.equal(p.b[0].k, "week");
  assert.equal(+p.b[p.b.length - 1].e, +p.e, "last week stops at the end date");
  c.ST.from = "2026-01-01"; c.ST.to = "2026-10-31";
  p = c.stCustomPeriod(0); assert.equal(p.b.length, 10); assert.equal(p.b[0].k, "month");
  const prev = c.stCustomPeriod(1); assert.equal(+prev.e, +p.s, "the period before ends where this one starts");
});

test("dates the wrong way round are swapped", () => {
  const c = page(); c.ST.from = "2026-11-07"; c.ST.to = "2026-11-01";
  const p = c.stCustomPeriod(0); assert.ok(p.e > p.s); assert.equal(p.b.length, 7);
});

test("moving a card into a rest day makes it a training day and breaks no supersets", () => {
  const c = page();
  const pg = grid(c, { mon: { title: "Push", ex: [ex("a", true), ex("b"), ex("a")] } }, ["mon"]);
  vm.runInContext("pgMove('mon',1,'wed',0)", c);
  assert.deepEqual(Array.from(pg.d.ids), ["mon", "wed"]);
  assert.equal(pg.d.days.wed.title, "Workout");
  assert.equal(pg.d.days.mon.ex[0].link, false, "the card that linked to the moved one is unlinked");
  assert.equal(pg.d.days.wed.ex[0].link, false);
  assert.equal(pg.undo.length, 1);
});

test("reordering inside a day and adding from the library", () => {
  const c = page();
  const pg = grid(c, { tue: { title: "Pull", ex: [ex("a"), ex("b")] } }, ["tue"]);
  vm.runInContext("pgMove('tue',0,'tue',2)", c);
  assert.deepEqual(pg.d.days.tue.ex.map((x) => x.id), ["b", "a"]);
  vm.runInContext("pgAdd('b','tue',1)", c);
  assert.deepEqual(pg.d.days.tue.ex.map((x) => x.id), ["b", "b", "a"]);
  assert.equal(pg.d.days.tue.ex[1].sets, 4, "library defaults for sets");
  vm.runInContext("pgMove('tue',0,'tue',1)", c);
  assert.equal(pg.undo.length, 2, "dropping a card where it already is changes nothing");
});
