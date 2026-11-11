/* Machine-checkable Google Play policy rules (docs/play-policy-brief.md). Run: node --test tests/*.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const exists = (f) => fs.existsSync(path.join(root, f));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1");

test("A1: the manifest asks for no restricted permissions", () => {
  const m = read("android/app/src/main/AndroidManifest.xml").replace(/<!--[\s\S]*?-->/g, "");
  const banned = ["USE_EXACT_ALARM", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "ACCESS_BACKGROUND_LOCATION",
    "READ_CONTACTS", "READ_SMS", "SEND_SMS", "READ_CALL_LOG", "MANAGE_EXTERNAL_STORAGE", "QUERY_ALL_PACKAGES",
    "BIND_ACCESSIBILITY_SERVICE", "USE_FULL_SCREEN_INTENT", "REQUEST_INSTALL_PACKAGES", "AD_ID", "SYSTEM_ALERT_WINDOW"];
  for (const p of banned) assert.ok(!m.includes("permission." + p) && !m.includes("permission:" + p), "restricted permission " + p);
  assert.ok(!/usesCleartextTraffic="true"/.test(m), "D6: cleartext traffic must stay off");
});

test("A6: targets a recent Android API level", () => {
  const t = Number((read("android/variables.gradle").match(/targetSdkVersion\s*=\s*(\d+)/) || [])[1]);
  assert.ok(t >= 35, "targetSdkVersion " + t);
});

test("D5: no ad or tracking SDKs", () => {
  const deps = Object.keys(Object.assign({}, JSON.parse(read("package.json")).dependencies));
  for (const d of deps) assert.ok(!/admob|firebase-analytics|facebook|appsflyer|adjust|mixpanel|amplitude|segment|onesignal|ads/i.test(d), "SDK " + d);
});

test("D6: no mixed content in the app shell", () => {
  assert.equal(JSON.parse(read("capacitor.config.json")).android.allowMixedContent, false);
});

test("P1: Paddle never runs in the app and its SDK stays out of the app build", () => {
  if (exists("src/js/webbilling.js")) assert.match(read("src/js/webbilling.js"), /platform\.native/);
  if (exists("vendor/purchases-js.umd.js")) assert.match(read("tools/build_app.py"), /purchases-js/);
});

test("P2/P3: app code never points people to buy on the website", () => {
  const steer = /(buy|subscribe|upgrade|pay|purchase|cheaper|get pro)[^"'`\n]{0,40}\b(on|at|through|via) (the|our) (website|web ?site|web)\b|getfitdaily\.co\.za\/(pro|pricing|checkout|buy)/i;
  const files = fs.readdirSync(path.join(root, "src/js")).filter((f) => f.endsWith(".js") && f !== "webbilling.js" && !f.startsWith("gfd-exercise-art"));
  for (const f of files) {
    const hit = stripComments(read("src/js/" + f)).match(steer);
    assert.equal(hit, null, f + ": " + (hit && hit[0]));
  }
});

test("P3: our pages opened from the app hide the way into the web app", () => {
  assert.match(read("src/js/platform.js"), /inapp=1/);
  for (const f of ["site/shell.html", "privacy.html", "terms.html", "delete-account.html"]) assert.match(read(f), /inapp=1/, f);
});

test("H2: the medical note is in the app and the store description", () => {
  assert.match(read("src/js/health.js"), /MEDICAL_NOTE=.*medical device.*health professional/);
  assert.match(read("src/js/tabs.js"), /MEDICAL_NOTE/);
  assert.match(read("docs/store-listing.md"), /not a medical device/i);
});

test("D1/D2/D7: privacy policy and account deletion are linked from the app", () => {
  assert.match(read("src/js/tabs.js"), /openPrivacy/);
  assert.match(read("tools/build_app.py"), /privacy\.html/);
  assert.match(read("tools/build_app.py"), /delete-account\.html/);
  assert.match(read("site/privacy.html"), /delete-account\.html/);
});
