/* Extracts the static data from the web app's source (../src/js) into mobile/src/data/*.json,
   so the mobile app uses exactly the same exercise library, plans, equipment and diagrams.
   Run from mobile/:  node scripts/extract-web-data.js */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const webDir = path.join(__dirname, "..", "..", "src", "js");
const outDir = path.join(__dirname, "..", "src", "data");
fs.mkdirSync(outDir, { recursive: true });

const sandbox = { console, Math, Date, JSON, Object, Array, String, Number, parseFloat, isFinite };
sandbox.window = sandbox;
sandbox.document = { getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(sandbox);

for (const f of ["diagrams.js", "library.js", "equipment.js", "plans.js"]) {
  const code = fs.readFileSync(path.join(webDir, f), "utf8");
  try {
    vm.runInContext(code, sandbox, { filename: f });
  } catch (e) {
    console.error(`note: ${f} stopped at: ${e.message} (top-level data is still extracted)`);
  }
}
const get = (n) => vm.runInContext(`typeof ${n}==="undefined"?null:${n}`, sandbox);
const clone = (o) => JSON.parse(JSON.stringify(o));

const out = {
  library: {
    DEFAULT_DAYS: clone(get("DEFAULT_DAYS")),
    LABS: clone(get("LABS")),
    MGS: clone(get("MGS")),
    EXMETA: clone(get("EXMETA")),
    EXTRA: clone(get("EXTRA")),
  },
  templates: clone(get("TEMPLATES")),
  equipment: clone(get("EQUIP")),
  diagrams: clone(get("PAT")),
};
for (const [name, val] of Object.entries(out)) {
  if (!val) throw new Error(`missing data for ${name}`);
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(val, null, 1) + "\n");
  console.log(`wrote src/data/${name}.json`);
}
console.log("exercises (default+extra):", out.library.DEFAULT_DAYS.reduce((n, d) => n + d.ex.length, 0), "+", out.library.EXTRA.length);
console.log("diagram patterns:", Object.keys(out.diagrams).length, "equipment groups:", out.equipment.length);
