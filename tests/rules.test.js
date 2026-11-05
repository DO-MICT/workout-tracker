/* Tests for src/js/rules.js. Run with: node --test tests/*.test.js
   Tests marked { todo } are known bugs from the tester reports: they describe the behaviour we want,
   fail today, and don't break the run. Remove the todo when the fix lands (F1, F2). */
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/js/rules.js");

const KG = ["kg", "reps"], BW = ["+kg", "reps"], CARDIO = ["km", "min"], HOLD = ["", "sec"];
const sets = (...a) => a.map(([w, r]) => ({ w: w == null ? "" : String(w), r: r == null ? "" : String(r) }));

/* ---------- records ---------- */
test("best weight is the saved record or last session's heaviest set", () => {
  assert.equal(R.bestWeight("80", sets([82.5, 5], [80, 5])), 82.5);
  assert.equal(R.bestWeight("90", sets([82.5, 5])), 90);
  assert.equal(R.bestWeight(undefined, undefined), 0);
  assert.equal(R.bestWeight("abc", sets(["", 10])), 0);
});

test("the saved record only goes up", () => {
  assert.equal(R.nextStoredPr("80", sets([85, 3], [82.5, 5])), "85");
  assert.equal(R.nextStoredPr("90", sets([85, 3])), "90");
  assert.equal(R.nextStoredPr(undefined, sets(["", 12])), undefined);
});

test("heavier than the record is a PR, heavier than last time is 'up'", () => {
  assert.deepEqual(R.sessionWin("w", KG, sets([85, 5]), "80", sets([80, 5])), { pr: { now: 85, was: 80, u: "kg" } });
  assert.deepEqual(R.sessionWin("w", KG, sets([82.5, 5]), "90", sets([80, 5])), { up: { by: 2.5, u: "kg" } });
  assert.equal(R.sessionWin("w", KG, sets([80, 5]), "80", sets([80, 5])), null);
  assert.equal(R.sessionWin("w", KG, sets([60, 8]), undefined, undefined), null, "first time is not a PR");
  assert.equal(R.sessionWin("hold", HOLD, sets([60, 30]), "40", undefined), null, "no weight box, no weight PR");
});

test("cardio distance records are in km", () => {
  assert.deepEqual(R.sessionWin("cardio", CARDIO, sets([5.2, 30]), "5", sets([5, 31])), { pr: { now: 5.2, was: 5, u: "km" } });
});

test("only sets with a weight or reps typed are saved", () => {
  assert.deepEqual(R.loggedSets(sets([60, 8], [null, null], [null, 6])), sets([60, 8], [null, 6]));
});

/* ---------- last time and hints ---------- */
test("last time reads like the sets you did", () => {
  assert.deepEqual(R.lastSetParts(sets([60, 8], [62.5, 6]), KG), ["60 kg × 8", "62.5 kg × 6"]);
  assert.deepEqual(R.lastSetParts(sets([10, 6], [null, 12]), BW), ["10 kg × 6", "12"]);
  assert.deepEqual(R.lastSetParts(sets([null, 45]), HOLD), ["45 sec"]);
  assert.deepEqual(R.lastSetParts(sets([3, 20]), CARDIO), ["3 km × 20 min"]);
});

test("hints copy today's earlier set, then the record and last session", () => {
  const last = sets([80, 6], [80, 5]);
  assert.deepEqual(R.setHint(sets([null, null], [null, null]), 0, last, 82.5, KG, "6–8"), ["82.5", "6"]);
  assert.deepEqual(R.setHint(sets([85, 4], [null, null]), 1, last, 82.5, KG, "6–8"), ["85", "4"]);
  assert.deepEqual(R.setHint(sets([null, null], [null, null], [null, null]), 2, last, 82.5, KG, "6–8"), ["82.5", "5"], "past last session's sets: its last set");
  assert.deepEqual(R.setHint(sets([null, null]), 0, undefined, 0, KG, "8–10"), ["kg", "8"], "first time: unit and the plan's target");
  assert.deepEqual(R.setHint(sets([null, null]), 0, undefined, 0, BW, "max"), ["+kg", "max"]);
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

/* ---------- tester scenarios: how they behave today ---------- */
/* Lifter, week 2: typed 850 instead of 85 on bench (tester issue S1). */
test("today: an 850 kg typo becomes the bench record and the next hint", () => {
  const typed = sets([850, 5]);
  assert.deepEqual(R.sessionWin("w", KG, typed, "80", sets([80, 5])), { pr: { now: 850, was: 80, u: "kg" } });
  const pr = R.nextStoredPr("80", typed);
  assert.equal(pr, "850");
  assert.equal(R.setHint(sets([null, null]), 0, typed, R.bestWeight(pr, typed), KG, "5")[0], "850");
});
test("known bug S1 (F1): a 10× jump is not saved as a record without asking", { todo: "F1.E3 asks before saving a big jump" }, () => {
  assert.equal(R.nextStoredPr("80", sets([850, 5])), "80");
});
test("known bug S1 (F1): fixing 850 to 85 brings the record back to 85", { todo: "F1.E2 rebuilds records from history" }, () => {
  /* once the typo is fixed in History, the record must come from the sets, not the old saved 850 */
  assert.equal(R.bestWeight("850", sets([85, 5])), 85);
});

/* Pilates trainer: 18 clamshells, a bodyweight exercise tracked as +kg / reps (tester issue P2). */
test("today: 18 clamshells gives no record, and 18 in the first box shows as kg", () => {
  assert.equal(R.sessionWin("bw", BW, sets([null, 18]), undefined, sets([null, 15])), null);
  assert.deepEqual(R.sessionWin("bw", BW, sets([18, null]), "15", sets([15, null])), { pr: { now: 18, was: 15, u: "kg" } });
});
test("known bug P2 (F2): 18 clamshells after 15 is a record of 18 reps", { todo: "F2.E1 records by exercise type" }, () => {
  assert.deepEqual(R.sessionWin("bw", BW, sets([null, 18]), undefined, sets([null, 15])), { pr: { now: 18, was: 15, u: "reps" } });
});

/* Lifter: failed squat, 110 kg for 0 of 5 reps (tester issues S4, S15). */
test("today: a failed 110 kg squat is celebrated as a PR", () => {
  assert.deepEqual(R.sessionWin("w", KG, sets([110, 0]), "105", sets([105, 5])), { pr: { now: 110, was: 105, u: "kg" } });
  assert.equal(R.nextStoredPr("105", sets([110, 0])), "110");
});
test("known bug S4 (F2): a set with no reps done is not a record", { todo: "F2.E1 records count completed reps" }, () => {
  assert.equal(R.sessionWin("w", KG, sets([110, 0]), "105", sets([105, 5])), null);
  assert.equal(R.nextStoredPr("105", sets([110, 0])), "105");
});
