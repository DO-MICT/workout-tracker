/* Old Android WebViews (Chrome 80+) must keep working: see docs/android-brief.md, "Old WebViews".
   Run: node --test tests/*.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const files = ["src/styles.css", "app.html", "roadmap.html", "privacy.html", "terms.html", "delete-account.html"]
  .concat(fs.readdirSync(path.join(root, "src/js")).filter((f) => f.endsWith(".js") && !f.startsWith("gfd-exercise-art")).map((f) => "src/js/" + f));

test("no inset shorthand (Chrome 87+): write top/right/bottom/left", () => {
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), "utf8");
    const hit = text.match(/(^|[;{"'\s])inset\s*:/m);
    assert.equal(hit, null, `${f} uses "inset:"`);
  }
});

test("svh/dvh/lvh come after a vh line in the same rule", () => {
  const css = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
  const re = /([a-z-]+)\s*:\s*[^;{}]*\b\d*\.?\d+[sdl]vh\b/g;
  let m;
  while ((m = re.exec(css))) {
    const before = css.slice(css.lastIndexOf("{", m.index), m.index);
    assert.ok(new RegExp(m[1] + "\\s*:[^;{}]*\\d+vh\\b").test(before), `styles.css: ${m[0]} has no ${m[1]}: ...vh fallback before it`);
  }
});

test("the flex gap fallback is loaded by the app and cached for offline", () => {
  assert.match(fs.readFileSync(path.join(root, "app.html"), "utf8"), /src\/js\/flexgap\.js/);
  assert.match(fs.readFileSync(path.join(root, "sw.js"), "utf8"), /src\/js\/flexgap\.js/);
});
