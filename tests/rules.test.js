/* Tests for src/js/rules.js. Run with: node --test tests/*.test.js
   Tester scenarios (S1, P2, S4 ...) are at the end. A test marked { todo } is a known bug: it describes the
   behaviour we want, fails today and doesn't break the run. Remove the todo when the fix lands. */
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/js/rules.js");

const KG = ["kg", "reps"], BW = ["+kg", "reps"], CARDIO = ["km", "min"], HOLD = ["", "sec"];
const sets = (...a) => a.map(([w, r]) => ({ w: w == null ? "" : String(w), r: r == null ? "" : String(r) }));

/* ---------- records ---------- */
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

const recOf = (rows, ex) => R.exerciseRecords(rows)[ex];
const W1 = "2026-10-01T10:00:00Z", W2 = "2026-10-08T10:00:00Z", W3 = "2026-10-15T10:00:00Z";

test("weighted moves: heaviest, rep maxes at 1, 3, 5, 8, 10 and an estimated 1RM", () => {
  const rows = [row("w1", W1, "bench", 1, 100, 5), row("w1", W1, "bench", 2, 80, 10), row("w2", W2, "bench", 1, 110, 1)];
  const b = recOf(rows, "bench").bests;
  assert.equal(b.rm1.v, 110);
  assert.equal(b.rm3.v, 100, "100 × 5 also counts for 3 reps");
  assert.equal(b.rm5.v, 100);
  assert.equal(b.rm8.v, 80);
  assert.equal(b.rm10.v, 80);
  assert.equal(b.e1rm.v, 116.5, "Epley from 100 × 5, rounded to 0.5 kg");
  assert.equal(R.e1rm(110, 1), 110);
  assert.equal(R.e1rm(50, 20), 0, "too many reps for a fair estimate");
});

test("a heavier set with fewer reps doesn't replace the 10-rep record", () => {
  const rows = [row("w1", W1, "bench", 1, 80, 10)];
  const rec = recOf(rows, "bench");
  const win = R.sessionWin("w", KG, sets([90, 6]), rec, sets([80, 10]), "6–10");
  assert.deepEqual(win, { pr: { now: 90, was: 80, u: "kg", what: "Heaviest" } });
  const after = recOf(rows.concat([row("w2", W2, "bench", 1, 90, 6)]), "bench").bests;
  assert.equal(after.rm10.v, 80);
  assert.equal(after.rm5.v, 90);
});

test("a rep max beats its own bracket, and the estimate is shown as 'about'", () => {
  const rec = recOf([row("w1", W1, "bench", 1, 100, 3), row("w1", W1, "bench", 2, 80, 8)], "bench");
  assert.deepEqual(R.sessionWin("w", KG, sets([85, 8]), rec, sets([100, 3])), { pr: { now: 85, was: 80, u: "kg", what: "Best for 8 reps" } });
  const list = R.recordList("w", rec.bests);
  assert.deepEqual(list.map((o) => o.label), ["Heaviest", "Best for 8 reps", "Estimated 1RM"], "100 × 3 is the heaviest, 80 × 8 covers 5 and 8 reps; no set of 10 yet");
  assert.equal(list[0].set, "100 kg × 3");
  assert.equal(list.find((o) => o.key === "e1rm").text, "about 110 kg");
  assert.equal(list.find((o) => o.key === "rm8").set, "80 kg × 8");
});

test("bodyweight: most reps and most added weight", () => {
  const rows = [row("w1", W1, "pullup", 1, null, 12, "bw"), row("w2", W2, "pullup", 1, 10, 6, "bw")];
  const rec = recOf(rows, "pullup");
  assert.equal(rec.bests.reps.v, 12);
  assert.equal(rec.bests.added.v, 10);
  assert.deepEqual(R.sessionWin("bw", BW, sets([null, 14]), rec, sets([10, 6])), { pr: { now: 14, was: 12, u: "reps", what: "Most reps" } });
  assert.deepEqual(R.sessionWin("bw", BW, sets([12.5, 5]), rec, sets([10, 6])), { pr: { now: 12.5, was: 10, u: "kg", what: "Most added weight" } });
  assert.deepEqual(R.recordList("bw", rec.bests).map((o) => o.text), ["12 reps", "10 kg"]);
});

test("holds, timed moves and counts: longest or most, in their own unit", () => {
  const rows = [row("w1", W1, "plank", 1, null, 45, "hold"), row("w1", W1, "jog", 1, null, 20, "time"), row("w1", W1, "jacks", 1, null, 30, "count")];
  assert.deepEqual(R.sessionWin("hold", HOLD, sets([null, 60]), recOf(rows, "plank"), sets([null, 45])), { pr: { now: 60, was: 45, u: "sec", what: "Longest hold" } });
  assert.equal(R.recordList("hold", recOf(rows, "plank").bests)[0].text, "45 sec");
  assert.equal(R.recordList("time", recOf(rows, "jog").bests)[0].text, "20 min");
  assert.equal(R.recordList("count", recOf(rows, "jacks").bests)[0].text, "30 reps");
  assert.deepEqual(R.sessionWin("hold", HOLD, sets([null, 40], [null, 50]), recOf(rows, "plank"), sets([null, 45])), { pr: { now: 50, was: 45, u: "sec", what: "Longest hold" } });
});

test("cardio: longest distance, fastest pace, longest time; no km on time", () => {
  const rows = [row("w1", W1, "run", 1, 5, 30, "cardio")];
  const rec = recOf(rows, "run");
  assert.deepEqual(R.sessionWin("cardio", CARDIO, sets([5.2, 30]), rec, sets([5, 30])), { pr: { now: 5.2, was: 5, u: "km", what: "Longest distance" } });
  assert.deepEqual(R.sessionWin("cardio", CARDIO, sets([5, 28]), rec, sets([5, 30])), { pr: { now: 336, was: 360, u: "/km", what: "Fastest pace" } });
  assert.deepEqual(R.recordList("cardio", rec.bests).map((o) => o.text), ["5 km", "6:00 /km", "30 min"]);
});

test("every record shows the right unit: no kg on reps, no km on time", () => {
  const rows = [row("w1", W1, "clam", 1, null, 18, "bw"), row("w1", W1, "plank", 1, null, 45, "hold"), row("w1", W1, "jog", 1, null, 20, "time")];
  const rec = R.exerciseRecords(rows);
  assert.ok(R.recordList("bw", rec.clam.bests).every((o) => !/kg/.test(o.text)));
  assert.ok(R.recordList("time", rec.jog.bests).every((o) => !/km/.test(o.text)));
  assert.ok(R.recordList("hold", rec.plank.bests).every((o) => !/kg|km/.test(o.text)));
});

test("first time is never a record; more than last time is 'up'", () => {
  assert.equal(R.sessionWin("w", KG, sets([60, 8]), undefined, undefined), null);
  const rec = recOf([row("w1", W1, "bench", 1, 90, 5), row("w2", W2, "bench", 1, 80, 5)], "bench");
  assert.deepEqual(R.sessionWin("w", KG, sets([82.5, 5]), rec, sets([80, 5])), { up: { by: 2.5, u: "kg" } });
  assert.equal(R.sessionWin("w", KG, sets([80, 5]), rec, sets([80, 5])), null);
});

test("missed sets: fewer reps than planned never count as a win", () => {
  assert.deepEqual(R.targetOf("8–12 / side"), { lo: 8, hi: 12, u: "reps" });
  assert.deepEqual(R.targetOf("30 sec"), { lo: 30, hi: 30, u: "sec" });
  assert.equal(R.targetOf("AMRAP"), null);
  assert.equal(R.isMissed(KG, { w: "110", r: "3" }, "5"), true);
  assert.equal(R.isMissed(KG, { w: "110", r: "5" }, "5"), false);
  assert.equal(R.isMissed(KG, { w: "110", r: "8" }, "8–12"), false, "the bottom of a range is enough");
  assert.equal(R.isMissed(HOLD, { r: "20" }, "30 sec"), true);
  assert.equal(R.isMissed(CARDIO, { w: "3", r: "20" }, "20 m"), false, "a distance target isn't checked against minutes");
  const rec = recOf([row("w1", W1, "squat", 1, 105, 5)], "squat");
  assert.equal(R.sessionWin("w", KG, sets([110, 3]), rec, sets([105, 5]), "5"), null, "110 × 3 on a 5-rep day is missed");
  assert.deepEqual(R.sessionWin("w", KG, sets([110, 3], [105, 5]), rec, sets([105, 5]), "5"), null, "the completed 105 × 5 only equals last time");
  assert.deepEqual(R.sessionWin("w", KG, sets([110, 5]), rec, sets([105, 5]), "5"), { pr: { now: 110, was: 105, u: "kg", what: "Heaviest" } });
});

/* ---------- last time that matches the day ---------- */
test("last time looks back at the same plan day first, then the same rep target, then any session", () => {
  const P = "ppl";
  const r2 = (wid, at, w, reps, day) => ({ ...row(wid, at, "press", 1, w, reps), plan_id: P, day_id: day });
  const rows = [r2("w1", W1, 60, 8, "tue"), r2("w2", W2, 70, 4, "fri"), r2("w3", W3, 72.5, 3, "fri")];
  const rec = recOf(rows, "press");
  const plan = { tue: "8", fri: "3–5", sat: "8" };
  const targetFor = (p, d) => (p === P ? plan[d] : null);
  assert.deepEqual(R.lastMatching(rec, { plan: P, day: "tue", target: "8", targetFor }), { date: W1, sets: [{ w: "60", r: "8" }], match: "day" });
  assert.deepEqual(R.lastMatching(rec, { plan: P, day: "sat", target: "8", targetFor }).match, "target", "Saturday's 3×8 looks back at Tuesday's 3×8");
  assert.equal(R.lastMatching(rec, { plan: P, day: "sat", target: "8", targetFor }).date, W1);
  assert.equal(R.lastMatching(rec, { plan: P, day: "sun", target: "12" }).date, W3, "nothing matches: the newest session");
  assert.equal(R.lastMatching(rec, { plan: "other", day: "sat", target: "8" }).date, W1, "no plan to ask: judged by the reps done");
  assert.equal(R.lastMatching(undefined, {}), null);
});

test("waiting workouts keep their plan day", () => {
  const pending = [{ id: "w9", performed_at: W2, plan_id: "ppl", day_id: "tue", sets: [{ exercise_id: "press", set_no: 1, measure: "w", weight: 60, reps: 8 }] }];
  const s = R.exerciseRecords(R.historyRows([], pending)).press.sessions[0];
  assert.equal(s.plan, "ppl");
  assert.equal(s.day, "tue");
});

/* ---------- milestones ---------- */
test("milestones: first workout, workout counts, first full week, weeks in a row, every set done", () => {
  const t = (d) => new Date(d).toISOString();
  assert.deepEqual(R.milestones([], t("2026-11-03T08:00:00"), 3, false).map((m) => m.key), ["first"]);
  const four = [t("2026-10-06T08:00:00"), t("2026-10-14T08:00:00"), t("2026-10-21T08:00:00"), t("2026-10-28T08:00:00")];
  assert.deepEqual(R.milestones(four, t("2026-11-03T08:00:00"), 3, true).map((m) => m.text), ["5 workouts done", "5 weeks in a row", "Every set done"]);
  const week = [t("2026-11-03T08:00:00"), t("2026-11-04T08:00:00")];
  assert.deepEqual(R.milestones(week, t("2026-11-06T08:00:00"), 3, false).map((m) => m.text), ["First full week: every planned day done"]);
  assert.deepEqual(R.milestones([t("2026-10-20T08:00:00")], t("2026-11-03T08:00:00"), 3, false), [], "a gap week breaks the streak");
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

/* ---------- F4 swaps ---------- */
/* the real catalogue, shaped the way catalog.js loads it */
const CATALOG = (() => {
  const lib = {};
  require("../data/exercise-library/exercises.json").exercises.forEach((r) => {
    lib[r.id] = { id: r.id, n: r.name, mg: r.muscle_group, req: r.req || "", lab: r.tracking || "w", reps: r.reps,
      x: { tt: r.training_type, diff: r.difficulty, pm: r.primary_muscles || [], mp: r.movement_pattern, uni: r.unilateral } };
  });
  return lib;
})();

test("D2: Barbell RDL offers Dumbbell RDL first, and every top swap is still a hinge", () => {
  const top = R.rankSwaps(CATALOG, "rdl", { gear: ["dumbbells", "kettlebells", "cablecross"], level: "some", n: 3 });
  assert.equal(top[0].o.id, "dbrdl");
  top.forEach((r) => assert.equal(r.o.x.mp, "Hinge", r.o.n));
  assert.equal(R.swapReason(top[0], (id) => ({ dumbbells: "Dumbbells" })[id] || id), "Same movement, uses dumbbells");
});

test("S7: floor moves count at every location without adding gear", () => {
  assert.deepEqual(R.missingGear("calisthenics|yogamat|pilatesmat", []), [], "plank as built into the app");
  assert.deepEqual(R.missingGear("calisthenics", ["barbell"]), []);
  assert.deepEqual(R.missingGear("barbell,yogamat", []), ["barbell"], "the floor doesn't stand in for a barbell");
  const ids = R.rankSwaps(CATALOG, "rdl", { gear: [] }).map((r) => r.o.id);
  assert.ok(ids.includes("glutebridge"), "a bodyweight hinge is on offer with no gear at all");
});

test("PW6: away from the studio a reformer move offers a band or mat version", () => {
  const top = R.rankSwaps(CATALOG, "rowing", { gear: ["bands"], n: 3 });
  assert.ok(top.length);
  top.forEach((r) => assert.ok(!/reformer/.test(r.o.req), r.o.n));
  assert.equal(top[0].o.id, "bandrow");
});

test("swaps above your level stay in the list, lower down and marked harder", () => {
  const lib = {
    a: { id: "a", n: "Push-up", mg: "Chest", req: "", lab: "bw", x: { mp: "Horizontal push", pm: ["Chest"], diff: "Beginner" } },
    hard: { id: "hard", n: "Archer push-up", mg: "Chest", req: "", lab: "bw", x: { mp: "Horizontal push", pm: ["Chest"], diff: "Advanced" } },
    easy: { id: "easy", n: "Knee push-up", mg: "Chest", req: "", lab: "bw", x: { mp: "Horizontal push", pm: ["Chest"], diff: "Beginner" } },
    fly: { id: "fly", n: "Floor fly", mg: "Chest", req: "", lab: "w", x: { mp: "Isolation", pm: ["Chest"], diff: "Beginner" } },
  };
  const r = R.rankSwaps(lib, "a", { gear: [], level: "new" });
  assert.deepEqual(r.map((x) => x.o.id), ["easy", "fly", "hard"]);
  assert.equal(r[2].harder, true);
  const exp = R.rankSwaps(lib, "a", { gear: [], level: "experienced" });
  assert.ok(exp.findIndex((x) => x.o.id === "hard") < exp.findIndex((x) => x.o.id === "fly"), "no penalty when it suits your level");
  assert.equal(exp.find((x) => x.o.id === "hard").harder, false);
  assert.equal(R.rankSwaps(lib, "a", { gear: null }).length, 3, "gear null = don't check gear (no gear picked yet)");
});

test("a swap keeps the plan's target when both are tracked the same way", () => {
  assert.equal(R.swapReps({ lab: "w" }, { lab: "w", reps: "10" }, "6–8"), "6–8");
  assert.equal(R.swapReps({ lab: "w" }, { lab: "hold", reps: "30 s" }, "6–8"), "30 s");
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
  assert.deepEqual(R.sessionWin("w", KG, sets([87.5, 5]), rec, rec.last.sets), { pr: { now: 87.5, was: 85, u: "kg", what: "Heaviest" } });
});

/* Pilates trainer: 18 clamshells, a bodyweight exercise tracked as +kg / reps (tester issue P2). Fixed in F2. */
test("P2 (F2): 18 clamshells after 15 is a record of 18 reps, not kg", () => {
  const rec = recOf([row("w1", W1, "clam", 1, null, 15, "bw")], "clam");
  assert.deepEqual(R.sessionWin("bw", BW, sets([null, 18]), rec, sets([null, 15]), "15"), { pr: { now: 18, was: 15, u: "reps", what: "Most reps" } });
  assert.deepEqual(R.recordList("bw", recOf([row("w1", W1, "clam", 1, null, 18, "bw")], "clam").bests).map((o) => o.text), ["18 reps"]);
});

/* Lifter: failed squat, 110 kg for 0 of 5 reps (tester issues S4, S15). Fixed in F2. */
test("S4 (F2): a set with no reps done is not a record", () => {
  const rec = recOf([row("w0", W1, "squat", 1, 105, 5)], "squat");
  assert.equal(R.sessionWin("w", KG, sets([110, 0]), rec, sets([105, 5]), "5"), null);
  assert.equal(R.exerciseRecords([row("w1", W1, "squat", 1, 110, 0)]).squat.best, 0);
});
test("S4 (F2): Tuesday's 3×8 press pre-fills from the last 3×8 day, not Friday's heavy triples", () => {
  const r2 = (wid, at, w, reps, day) => ({ ...row(wid, at, "press", 1, w, reps), plan_id: "ppl", day_id: day });
  const rec = recOf([r2("w1", W1, 60, 8, "tue"), r2("w2", W2, 72.5, 3, "fri")], "press");
  const L = R.lastMatching(rec, { plan: "ppl", day: "tue", target: "8" });
  assert.deepEqual(R.setPrefill(sets([null, null]), 0, L.sets), { w: "60", r: "8" });
});

/* ---------- onboarding plan suggestion (F3) ---------- */
const GYM_SPLITS = ["split5", "bro"];
test("a pilates instructor at a studio is never given a gym split", () => {
  const ans = { train: "pilates", level: "experienced", goal: "move", days: 3 };
  const r = R.recommendPlan(ans, { pilates: 1, yoga: 0.6, beginner: 0.1, split5: 0.2, bro: 0.1, fb3: 0.2 });
  assert.equal(r.pick, "pilates");
  assert.ok(r.order.every((id) => !GYM_SPLITS.includes(id)));
});
test("a 3-day beginner gets the beginner full body plan, never a split", () => {
  const r = R.recommendPlan({ train: "gym", level: "new", goal: "general", days: 3 }, { beginner: 1, fb3: 0.8, split5: 0.9 });
  assert.equal(r.pick, "beginner");
  assert.ok(r.order.every((id) => !GYM_SPLITS.includes(id)));
});
test("a plan that mostly needs missing gear is skipped", () => {
  const r = R.recommendPlan({ train: "gym", level: "new", goal: "strength", days: 2 }, { beginner: 0.3, fb3: 0.6 });
  assert.equal(r.pick, "fb3");
  assert.equal(R.recommendPlan({ train: "pilates", level: "new", days: 3 }, { pilates: 0.1, yoga: 0.2, beginner: 0 }).pick, "coles", "falls back to sessions built from the gear that's there");
});
test("experienced lifters training 5 days get the split", () => {
  assert.equal(R.recommendPlan({ train: "gym", level: "experienced", goal: "muscle", days: 5 }, {}).pick, "split5");
  assert.equal(R.recommendPlan({ train: "gym", level: "some", goal: "strength", days: 3 }, {}).pick, "fb3");
  assert.equal(R.recommendPlan({ train: "running", level: "new", days: 3 }, {}).pick, "run");
  assert.equal(R.recommendPlan({ train: "yoga", level: "some", days: 4 }, {}).pick, "yoga");
});
test("celebration style and starter days follow the answers", () => {
  assert.equal(R.celebrateFor({ train: "pilates", goal: "strength" }), "calm");
  assert.equal(R.celebrateFor({ train: "gym", goal: "move" }), "calm");
  assert.equal(R.celebrateFor({ train: "gym", goal: "muscle" }), "energetic");
  assert.deepEqual(R.starterDays(2), ["mon", "thu"]);
  assert.deepEqual(R.starterDays(5), ["mon", "wed", "fri"]);
});

/* ---------- kg or lb (WP4) ---------- */
test("weights are kept in kg and shown in the chosen unit", () => {
  assert.equal(R.toKg("45", "lb"), 20.412);
  assert.equal(R.toKg("100", "kg"), 100);
  assert.equal(R.toKg("abc", "lb"), null);
  assert.equal(R.fromKg(20.412, "lb"), 45);
  assert.equal(R.fromKg(100, "lb", 1), 220.5);
  // typed in lb, saved in kg, shown again exactly as typed (to 0.01 lb)
  for (const t of ["45", "135", "225", "2.5", "317.5", "1000", "12.25", "0.5"]) assert.equal(R.boxShow(R.boxSave(t, "lb"), "lb"), t, t);
  assert.equal(R.boxSave("45", "lb"), "20.412");
  assert.equal(R.boxSave("60", "kg"), "60", "kg users' boxes are saved as typed");
  assert.equal(R.boxSave("", "lb"), "");
  assert.equal(R.boxShow("", "lb"), "");
  assert.equal(R.boxShow("62.5", "kg"), "62.5");
  assert.equal(R.boxShow("61.235", "kg"), "61.24", "a weight typed in lb shows to 2 decimals in kg");
  assert.equal(R.boxShow("-20", "lb"), "-44.1", "assisted (negative) weights convert too");
  assert.equal(R.unitLabel("kg", "lb"), "lb");
  assert.equal(R.unitLabel("+kg", "lb"), "+lb");
  assert.equal(R.unitLabel("km", "lb"), "km");
  assert.equal(R.unitLabel("kg"), "kg");
  assert.equal(R.fmtWeight(100, "lb"), "220.5 lb");
  assert.equal(R.fmtWeight(102.058, "lb"), "225 lb");
  assert.equal(R.fmtWeight(82.5, "kg"), "82.5 kg");
  assert.equal(R.unitOf("stone"), "kg");
});

test("records, last time and the big-jump check speak pounds for lb users", () => {
  const B = R.bestsOf("w", [{ w: 102.058, r: 5 }, { w: 92.986, r: 8 }]);
  const lb = R.recordList("w", B, "lb");
  assert.equal(lb[0].text, "225 lb");
  assert.equal(lb[0].set, "225 lb × 5");
  assert.equal(R.recordList("w", B)[0].text, "102.06 kg", "kg stays the default");
  assert.equal(R.recordList("bw", R.bestsOf("bw", [{ w: 11.34, r: 8 }]), "lb").find((x) => x.key === "added").text, "25 lb");
  assert.deepEqual(R.lastSetParts(sets([61.235, 8], [61.235, 6]), KG, "lb"), ["135 lb × 8", "135 lb × 6"]);
  assert.deepEqual(R.lastSetParts(sets([60, 8]), KG), ["60 kg × 8"]);
  assert.deepEqual(R.lastSetParts(sets([5, 30]), CARDIO, "lb"), ["5 km × 30 min"], "distances stay km");
  const j = R.bigJump(KG, "204.117", sets([102.058, 5]));
  assert.equal(R.jumpText(j, "204.117", "kg", "lb"), "450 lb? That's 2× your last set.");
  const by = R.bigJump(KG, "136.078", sets([102.058, 5]));
  assert.equal(R.jumpText(by, "136.078", "kg", "lb"), "300 lb? That's 75 lb more than last time (225 lb).");
  assert.equal(R.jumpText(R.bigJump(CARDIO, "300", []), "300", "km", "lb"), "300 km? That's more than most people ever log for this.");
});

test("a pound weight saved with only 2 kg decimals still shows as typed", () => {
  assert.equal(R.boxShow(61.24, "lb"), "135");
  assert.equal(R.boxShow(20.41, "lb"), "45");
  assert.equal(R.boxShow(5.556, "lb"), "12.25");
});
