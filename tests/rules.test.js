/* Tests for src/js/rules.js. Run with: node --test tests/*.test.js
   Tests marked { todo } are known bugs from the tester reports: they describe the behaviour we want,
   fail today, and don't break the run. Remove the todo when the fix lands (F2). */
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/js/rules.js");

const KG = ["kg", "reps"], BW = ["+kg", "reps"], CARDIO = ["km", "min"], HOLD = ["", "sec"];
const sets = (...a) => a.map(([w, r]) => ({ w: w == null ? "" : String(w), r: r == null ? "" : String(r) }));

/* ---------- records ---------- */
test("heavier than the record is a PR, heavier than last time is 'up'", () => {
  assert.deepEqual(R.sessionWin("w", KG, sets([85, 5]), 80, sets([80, 5])), { pr: { now: 85, was: 80, u: "kg" } });
  assert.deepEqual(R.sessionWin("w", KG, sets([82.5, 5]), 90, sets([80, 5])), { up: { by: 2.5, u: "kg" } });
  assert.equal(R.sessionWin("w", KG, sets([80, 5]), 80, sets([80, 5])), null);
  assert.equal(R.sessionWin("w", KG, sets([60, 8]), 0, undefined), null, "first time is not a PR");
  assert.equal(R.sessionWin("hold", HOLD, sets([60, 30]), 40, undefined), null, "no weight box, no weight PR");
});

/* history rows like the workout_sets table */
const row = (wid, at, ex, setNo, weight, reps, measure = "w") => ({ workout_id: wid, performed_at: at, exercise_id: ex, set_no: setNo, measure, weight, reps });

test("records and last time come from saved history", () => {
  const rows = [
    row("w1", "2026-10-01T10:00:00Z", "bench", 1, 80, 5), row("w1", "2026-10-01T10:00:00Z", "bench", 2, 80, 5),
    row("w2", "2026-10-08T10:00:00Z", "bench", 2, 77.5, 6), row("w2", "2026-10-08T10:00:00Z", "bench", 1, 82.5, 4),
    row("w2", "2026-10-08T10:00:00Z", "plank", 1, null, 45, "hold"),
  ];
  const rec = R.exerciseRecords(rows);
  assert.equal(rec.bench.best, 82.5);
  assert.equal(rec.bench.bestAt, "2026-10-08T10:00:00Z");
  assert.deepEqual(rec.bench.last, { date: "2026-10-08T10:00:00Z", sets: [{ w: "82.5", r: "4" }, { w: "77.5", r: "6" }] }, "last session, in set order");
  assert.deepEqual(rec.plank.last.sets, [{ w: "", r: "45" }]);
  assert.equal(rec.plank.best, 0);
});

test("deleting the heaviest workout brings back the next-best real set", () => {
  const rows = [row("w1", "2026-10-01T10:00:00Z", "bench", 1, 80, 5), row("w2", "2026-10-08T10:00:00Z", "bench", 1, 90, 3)];
  assert.equal(R.exerciseRecords(rows).bench.best, 90);
  assert.equal(R.exerciseRecords(rows.filter((r) => r.workout_id !== "w2")).bench.best, 80);
});

test("a reset record only counts sets after the reset; last time still shows", () => {
  const rows = [row("w1", "2026-10-01T10:00:00Z", "squat", 1, 140, 3), row("w2", "2026-10-20T10:00:00Z", "squat", 1, 100, 5)];
  const rec = R.exerciseRecords(rows, { squat: "2026-10-10T00:00:00Z" });
  assert.equal(rec.squat.best, 100);
  assert.equal(rec.squat.last.sets[0].w, "100");
  assert.equal(R.exerciseRecords(rows, { squat: "2026-10-25T00:00:00Z" }).squat.best, 0, "nothing since the reset");
});

test("a workout waiting to upload replaces its saved copy (an offline edit)", () => {
  const db = [row("w1", "2026-10-01T10:00:00Z", "bench", 1, 850, 5), row("w0", "2026-09-24T10:00:00Z", "bench", 1, 80, 5)];
  const pending = [{ id: "w1", performed_at: "2026-10-01T10:00:00Z", sets: [{ exercise_id: "bench", set_no: 1, measure: "w", weight: 85, reps: 5 }] }];
  const rows = R.historyRows(db, pending);
  assert.equal(rows.length, 2);
  assert.equal(R.exerciseRecords(rows).bench.best, 85);
  assert.equal(R.historyRows(db, []).length, 2);
});

test("cardio distance records are in km", () => {
  assert.deepEqual(R.sessionWin("cardio", CARDIO, sets([5.2, 30]), "5", sets([5, 31])), { pr: { now: 5.2, was: 5, u: "km" } });
});

test("only sets with a weight or reps typed are saved", () => {
  assert.deepEqual(R.loggedSets(sets([60, 8], [null, null], [null, 6])), sets([60, 8], [null, 6]));
  const prefilled = { w: "60", r: "8", pre: 1 };
  assert.deepEqual(R.loggedSets([prefilled]), [], "last time's values you never ticked aren't saved");
  assert.equal(R.loggedSets([{ ...prefilled, d: true }]).length, 1, "ticked");
  assert.equal(R.loggedSets([{ ...prefilled, t: 1 }]).length, 1, "typed over");
});

/* ---------- last time and hints ---------- */
test("last time reads like the sets you did", () => {
  assert.deepEqual(R.lastSetParts(sets([60, 8], [62.5, 6]), KG), ["60 kg × 8", "62.5 kg × 6"]);
  assert.deepEqual(R.lastSetParts(sets([10, 6], [null, 12]), BW), ["10 kg × 6", "12"]);
  assert.deepEqual(R.lastSetParts(sets([null, 45]), HOLD), ["45 sec"]);
  assert.deepEqual(R.lastSetParts(sets([3, 20]), CARDIO), ["3 km × 20 min"]);
});

test("set boxes start with last session's same set, never the all-time top", () => {
  const last = sets([80, 6], [80, 5]);
  assert.deepEqual(R.setPrefill(sets([null, null], [null, null]), 0, last), { w: "80", r: "6" });
  assert.deepEqual(R.setPrefill(sets([85, 4], [null, null]), 1, last), { w: "80", r: "5" }, "same set number last time, not today's set 1");
  assert.deepEqual(R.setPrefill(sets([85, 4], [85, 4], [null, null]), 2, last), { w: "85", r: "4" }, "past last session's sets: the nearest set today");
  assert.deepEqual(R.setPrefill(sets([null, null]), 0, undefined), { w: "", r: "" }, "first time: empty");
});

test("an empty box can't be ticked", () => {
  assert.equal(R.tickMissing(KG, { w: "", r: "8" }), "w");
  assert.equal(R.tickMissing(KG, { w: "60", r: "" }), "r");
  assert.equal(R.tickMissing(KG, { w: "60", r: "8" }), null);
  assert.equal(R.tickMissing(BW, { w: "", r: "12" }), null, "added weight is optional");
  assert.equal(R.tickMissing(BW, { w: "10", r: "" }), "r");
  assert.equal(R.tickMissing(HOLD, { w: "", r: "" }), "r");
  assert.equal(R.tickMissing(CARDIO, { w: "", r: "20" }), null, "time alone is fine for cardio");
  assert.equal(R.tickMissing(CARDIO, { w: "", r: "" }), "w");
});

test("big jumps are checked before saving", () => {
  assert.deepEqual(R.bigJump(KG, "850", sets([85, 5]), []), { x: 10, ref: 85 });
  assert.deepEqual(R.bigJump(KG, "110", sets([85, 5]), []), { by: 25, ref: 85 });
  assert.equal(R.bigJump(KG, "100", sets([85, 5]), []), null, "under 25% is fine");
  assert.deepEqual(R.bigJump(KG, "15", sets([10, 10]), []), { by: 5, ref: 10 });
  assert.equal(R.bigJump(KG, "14", sets([10, 10]), []), null, "small dumbbell jumps don't nag");
  assert.deepEqual(R.bigJump(KG, "600", undefined, sets([60, 8])), { x: 10, ref: 60, today: true }, "10× an earlier set today");
  assert.equal(R.bigJump(KG, "100", undefined, sets([60, 8])), null, "warm-up ramps are fine");
  assert.equal(R.bigJump(KG, "120", undefined, []), null, "first-ever set: no prompt");
  assert.deepEqual(R.bigJump(KG, "850", undefined, []), { limit: 400 }, "unless it's above a sane limit");
  assert.equal(R.bigJump(CARDIO, "8", sets([5, 30]), []), null, "longer runs aren't typos");
  assert.equal(R.bigJump(HOLD, "300", undefined, []), null, "no weight box, no check");
  assert.equal(R.jumpText({ x: 10, ref: 85 }, "850", "kg"), "850 kg? That's 10× your last set.");
  assert.equal(R.jumpText({ by: 25, ref: 85 }, "110", "kg"), "110 kg? That's 25 kg more than last time (85 kg).");
});

/* ---------- gear and swaps ---------- */
test("missing gear lists each 'any of' group you don't have", () => {
  assert.deepEqual(R.missingGear("barbell,flatbench|adjbench", ["barbell", "adjbench"]), []);
  assert.deepEqual(R.missingGear("barbell,flatbench|adjbench", ["dumbbells"]), ["barbell", "flatbench|adjbench"]);
  assert.deepEqual(R.missingGear("", []), []);
});

test("swaps: same muscle group, doable here, not already in the day, same tracking first", () => {
  const lib = {
    bench: { id: "bench", mg: "Chest", req: "barbell,flatbench", lab: "w" },
    dbpress: { id: "dbpress", mg: "Chest", req: "dumbbells", lab: "w" },
    pushup: { id: "pushup", mg: "Chest", req: "", lab: "bw" },
    cablefly: { id: "cablefly", mg: "Chest", req: "cablecross", lab: "w" },
    incdb: { id: "incdb", mg: "Chest", req: "dumbbells", lab: "w" },
    row: { id: "row", mg: "Back", req: "dumbbells", lab: "w" },
  };
  const ids = R.swapCandidates(lib, "bench", ["dumbbells"], ["incdb"]).map((o) => o.id);
  assert.deepEqual(ids, ["dbpress", "pushup"]);
  assert.deepEqual(R.swapCandidates(lib, "nope", ["dumbbells"], []), []);
  assert.equal(R.swapCandidates(lib, "bench", ["dumbbells", "cablecross"], [], 1).length, 1);
});

/* ---------- stats maths ---------- */
test("volume counts weighted sets only", () => {
  assert.equal(R.workoutVolume([{ measure: "w", weight: 60, reps: 8 }, { measure: "w", weight: 62.5, reps: 6 }, { measure: "cardio", weight: 5, reps: 30 }, { measure: "w", weight: null, reps: 10 }]), 855);
});

test("cardio sums distance and minutes", () => {
  assert.deepEqual(R.cardioSum([{ weight: 2.5, reps: 12 }, { weight: "2.5", reps: "13.5" }, { weight: NaN, reps: 0 }]), { km: 5, min: 25.5 });
});

/* ---------- tester scenarios ---------- */
/* Lifter, week 2: typed 850 instead of 85 on bench (tester issue S1). Fixed in F1. */
test("S1 (F1): an 850 kg typo is checked before it's saved", () => {
  const lastBench = sets([85, 5]);
  const j = R.bigJump(KG, "850", lastBench, []);
  assert.equal(R.jumpText(j, "850", "kg"), "850 kg? That's 10× your last set.");
});
test("S1 (F1): fixing 850 to 85 in History brings the record, last time and next prefill back to 85", () => {
  const db = [row("w1", "2026-10-01T10:00:00Z", "bench", 1, 85, 5), row("w2", "2026-10-08T10:00:00Z", "bench", 1, 850, 5)];
  assert.equal(R.exerciseRecords(db).bench.best, 850, "kept by mistake");
  const fixed = [{ id: "w2", performed_at: "2026-10-08T10:00:00Z", sets: [{ exercise_id: "bench", set_no: 1, measure: "w", weight: 85, reps: 5 }] }];
  const rec = R.exerciseRecords(R.historyRows(db, fixed)).bench;
  assert.equal(rec.best, 85);
  assert.deepEqual(R.setPrefill(sets([null, null]), 0, rec.last.sets), { w: "85", r: "5" });
  assert.deepEqual(R.sessionWin("w", KG, sets([87.5, 5]), rec.best, rec.last.sets), { pr: { now: 87.5, was: 85, u: "kg" } });
});

/* Pilates trainer: 18 clamshells, a bodyweight exercise tracked as +kg / reps (tester issue P2). */
test("today: 18 clamshells gives no record, and 18 in the first box shows as kg", () => {
  assert.equal(R.sessionWin("bw", BW, sets([null, 18]), undefined, sets([null, 15])), null);
  assert.deepEqual(R.sessionWin("bw", BW, sets([18, null]), 15, sets([15, null])), { pr: { now: 18, was: 15, u: "kg" } });
});
test("known bug P2 (F2): 18 clamshells after 15 is a record of 18 reps", { todo: "F2.E1 records by exercise type" }, () => {
  assert.deepEqual(R.sessionWin("bw", BW, sets([null, 18]), undefined, sets([null, 15])), { pr: { now: 18, was: 15, u: "reps" } });
});

/* Lifter: failed squat, 110 kg for 0 of 5 reps (tester issues S4, S15). */
test("today: a failed 110 kg squat is celebrated as a PR", () => {
  assert.deepEqual(R.sessionWin("w", KG, sets([110, 0]), 105, sets([105, 5])), { pr: { now: 110, was: 105, u: "kg" } });
  assert.equal(R.exerciseRecords([row("w1", "2026-10-01T10:00:00Z", "squat", 1, 110, 0)]).squat.best, 110);
});
test("known bug S4 (F2): a set with no reps done is not a record", { todo: "F2.E1 records count completed reps" }, () => {
  assert.equal(R.sessionWin("w", KG, sets([110, 0]), 105, sets([105, 5])), null);
  assert.equal(R.exerciseRecords([row("w1", "2026-10-01T10:00:00Z", "squat", 1, 110, 0)]).squat.best, 0);
});
