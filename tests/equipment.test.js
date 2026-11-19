/* Equipment picker: six groups, not-set means no filtering, bodyweight always available */
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), vm = require("vm"), path = require("path");
const R = require("../src/js/rules.js");
const src = (f) => fs.readFileSync(path.join(__dirname, "../src/js", f), "utf8");
const ctx = { GFDRules: R, S: {}, document: {}, setTimeout() {}, save() {}, esc: String };
vm.createContext(ctx);
vm.runInContext(src("equipment.js"), ctx);
/* missingFor lives in library.js with a lot of page code around it: run just that function */
const mf = src("library.js").match(/function missingFor\(ex,g\)\{[\s\S]*?\n\}/)[0];
vm.runInContext(mf + "\nfunction gear(){return curLoc().gear;}", ctx);
const same = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
const ids = (g) => g.items.map((i) => i[0]);

test("six groups in the agreed order, every item listed once", () => {
  const groups = ctx.eqPickGroups("");
  same(groups.map((g) => g.g), ["Weights and Cables", "Benches", "Bars", "Machines", "Cardio", "Other"]);
  const all = [].concat(...groups.map(ids)), total = ctx.EQUIP.reduce((n, G) => n + G.items.length, 0);
  assert.strictEqual(all.length, total);
  assert.strictEqual(new Set(all).size, total);
  assert.ok(ids(groups[0]).includes("dumbbells") && ids(groups[1]).includes("flatbench") && ids(groups[2]).includes("barbell"));
  assert.ok(ids(groups[3]).includes("legpress") && ids(groups[4]).includes("treadmill"));
});
test("search narrows the tiles", () => {
  const hit = [].concat(...ctx.eqPickGroups("treadmill").map(ids));
  same(hit, ["treadmill"]);
});
test("not set shows everything; set filters; bodyweight is in both", () => {
  const press = { req: "dumbbells,flatbench" }, body = { req: "calisthenics" }, none = { req: "" };
  assert.strictEqual(ctx.gearSet([]), false);
  same(ctx.missingFor(press, []), []);          /* not set: nothing missing */
  same(ctx.missingFor(press, ["dumbbells"]), ["flatbench"]); /* set: filters */
  same(ctx.missingFor(body, ["dumbbells"]), []); /* bodyweight never filtered */
  same(ctx.missingFor(none, ["dumbbells"]), []);
});
test("a saved list is read as it was", () => {
  ctx.S = { locs: { active: "loc1", list: [{ id: "loc1", name: "Gym", gear: ["dumbbells", "flatbench"] }] } };
  same(ctx.gear(), ["dumbbells", "flatbench"]);
  assert.strictEqual(ctx.gearSet(ctx.gear()), true);
});
test("swaps: not set shows every option, set filters, bodyweight is in both", () => {
  const lib = {
    a: { id: "a", n: "Dumbbell press", mg: "Chest", req: "dumbbells", x: { mp: "Push", pm: ["Chest"], diff: "Beginner" } },
    b: { id: "b", n: "Barbell press", mg: "Chest", req: "barbell", x: { mp: "Push", pm: ["Chest"], diff: "Beginner" } },
    c: { id: "c", n: "Push-up", mg: "Chest", req: "calisthenics", x: { mp: "Push", pm: ["Chest"], diff: "Beginner" } },
  };
  const unset = R.rankSwaps(lib, "a", { gear: null }).map((r) => r.o.id).sort();
  same(unset, ["b", "c"]);                                   /* not set: nothing filtered */
  const set = R.rankSwaps(lib, "a", { gear: ["dumbbells"] }).map((r) => r.o.id);
  same(set, ["c"]);                                          /* set: barbell press drops, bodyweight stays */
});
test("removing the last pick turns filtering off again", () => {
  ctx.S = { locs: { active: "loc1", list: [{ id: "loc1", name: "Default", gear: [] }] } };
  vm.runInContext("gearChanged=function(){}", ctx);
  vm.runInContext("document.querySelector=function(){return null}", ctx);
  ctx.toggleGear("dumbbells");
  assert.strictEqual(ctx.gearSet(ctx.gear()), true);
  ctx.toggleGear("dumbbells");
  assert.strictEqual(ctx.gearSet(ctx.gear()), false);
  same(ctx.missingFor({ req: "dumbbells" }, ctx.gear()), []);
});
test("a new account gets one Default location with equipment not set", () => {
  ctx.S = {};
  const L = ctx.locState();
  assert.strictEqual(L.list.length, 1);
  assert.strictEqual(L.list[0].name, "Default");
  assert.strictEqual(ctx.gearSet(L.list[0].gear), false);
});
