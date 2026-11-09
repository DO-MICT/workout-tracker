/* Tests for src/js/account.js (WP8): the ZIP and CSV files in "Download my data".
   Run: node --test tests/*.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");

const SRC = fs.readFileSync(path.join(__dirname, "../src/js/account.js"), "utf8");
const ctx = { TextEncoder, Uint8Array, DataView, ArrayBuffer, JSON, Date, String, Math };
vm.createContext(ctx);
vm.runInContext(SRC, ctx);

const sample = {
  format: "gfd-export", version: 1, exported_at: "2026-11-09T10:00:00Z",
  account: { id: "u1", email: "sam@example.com" },
  tables: {
    workouts: [{ id: "w1", performed_at: "2026-11-08T07:00:00Z", plan_name: "5-day split", day_title: "Push", location_name: "Home, garage" }],
    workout_sets: [
      { workout_id: "w1", performed_at: "2026-11-08T07:05:00Z", exercise_id: "bench", exercise_name: "Bench press", exercise_order: 0, set_no: 1, weight: 60, reps: 8, measure: "reps", done: true },
      { workout_id: "w1", performed_at: "2026-11-08T07:09:00Z", exercise_id: "dip", exercise_name: '=HYPERLINK("x")', exercise_order: 1, set_no: 1, weight: null, reps: 12, done: false },
    ],
    measurements: [
      { taken_at: "2026-11-02T06:00:00Z", site: "waist", side: null, value: 82.5 },
      { taken_at: "2026-11-01T06:00:00Z", site: "weight", side: null, value: 80 },
      { taken_at: "2026-10-01T06:00:00Z", site: "weight", side: null, value: 99, deleted_at: "2026-10-02T00:00:00Z" },
    ],
  },
};

test("crc32 matches zlib", () => {
  const b = new TextEncoder().encode("Get Fit Daily");
  assert.equal(ctx.crc32(b), zlib.crc32(b));
});

test("the export has a README, the JSON and two CSVs", () => {
  const files = ctx.exportFiles(sample);
  assert.deepEqual([...files.map((f) => f.name)], ["README.txt", "gfd-data.json", "sets.csv", "measurements.csv"]);
  assert.deepEqual(JSON.parse(files[1].data), JSON.parse(JSON.stringify(sample)));
  const sets = files[2].data.trim().split("\r\n");
  assert.equal(sets[0], "date,plan,day,exercise,order,set,weight_kg,reps,type,done,place");
  assert.equal(sets[1], '2026-11-08,5-day split,Push,Bench press,0,1,60,8,reps,yes,"Home, garage"');
  assert.ok(sets[2].includes(`"'=HYPERLINK(""x"")"`), "a cell that looks like a formula is made plain text: " + sets[2]);
  const meas = files[3].data.trim().split("\r\n");
  assert.deepEqual(meas, ["date,site,side,value", "2026-11-01,weight,,80", "2026-11-02,waist,,82.5"], "sorted by date, deleted rows left out");
});

test("an empty export still makes valid files", () => {
  const files = ctx.exportFiles({ tables: {} });
  assert.equal(files[2].data, "date,plan,day,exercise,order,set,weight_kg,reps,type,done,place\r\n");
});

test("the ZIP opens with a standard unzip and holds the files byte for byte", () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255]);
  const files = ctx.exportFiles(sample).concat([{ name: "screenshots/shot.png", data: png }]);
  const zip = ctx.zipFiles(files, new Date(2026, 10, 9, 10, 30, 0));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gfd-zip-"));
  const file = path.join(dir, "out.zip");
  fs.writeFileSync(file, zip);
  let py = null;
  try { execFileSync("python3", ["--version"]); py = "python3"; } catch { /* no python: check by hand below */ }
  if (py) {
    const out = execFileSync(py, ["-I", "-c",
      "import sys,zipfile,json\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\n" +
      "print(json.dumps({i.filename:[i.file_size,list(z.read(i.filename)[:4])] for i in z.infolist()}))", file]).toString();
    const got = JSON.parse(out);
    assert.deepEqual(Object.keys(got), [...files.map((f) => f.name)]);
    assert.deepEqual(got["screenshots/shot.png"], [10, [137, 80, 78, 71]]);
    assert.equal(got["README.txt"][0], Buffer.byteLength(files[0].data));
  } else {
    assert.equal(zip.readUInt32LE ? zip.readUInt32LE(0) : new DataView(zip.buffer).getUint32(0, true), 0x04034b50);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
