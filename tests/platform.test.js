/* Tests for src/js/platform.js (WP10): the web / Android adapter.
   The browser file runs in a small fake page (vm), with fake Capacitor plugins for the Android case.
   Run: node --test tests/*.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "../src/js/platform.js"), "utf8");
const tick = () => new Promise((r) => setTimeout(r, 0));

function page({ android = false, launchUrl = null, shell = null, location = null } = {}) {
  const calls = [], listeners = {}, docListeners = {}, open = new Set();
  const plugin = (name, methods) => {
    const p = { addListener: (ev, fn) => { listeners[name + ":" + ev] = fn; return Promise.resolve({ remove() {} }); } };
    for (const [m, ret] of Object.entries(methods)) p[m] = (arg) => { calls.push([name + "." + m, arg]); return Promise.resolve(typeof ret === "function" ? ret(arg) : ret); };
    return p;
  };
  const ctx = {
    console, setTimeout, URL, Promise,
    location: location || { origin: "https://do-mict.github.io", pathname: "/workout-tracker/" },
    history: { back() { calls.push(["history.back"]); } },
    navigator: {},
    KeyboardEvent: function (t, o) { this.type = t; this.key = o.key; },
    document: {
      visibilityState: "visible",
      documentElement: { classList: { add() {} } },
      addEventListener: (t, f) => { docListeners[t] = f; },
      dispatchEvent: (e) => { calls.push(["key", e.key]); },
      querySelector: () => (open.size ? {} : null),
    },
  };
  ctx.window = ctx;
  if (shell) ctx.GFD_SHELL = shell;
  if (android) {
    ctx.location = { origin: "https://localhost", pathname: "/" };
    ctx.Capacitor = {
      getPlatform: () => "android",
      Plugins: {
        App: plugin("App", { getLaunchUrl: launchUrl ? { url: launchUrl } : {}, minimizeApp: null, getInfo: { version: "2026.11.09", build: "12" } }),
        LocalNotifications: plugin("LocalNotifications", { checkPermissions: { display: "granted" }, requestPermissions: { display: "granted" }, createChannel: null, schedule: null, cancel: null }),
        Haptics: plugin("Haptics", { vibrate: null }),
        Browser: plugin("Browser", { open: null, close: null }),
        Share: plugin("Share", { share: null }),
        Filesystem: plugin("Filesystem", { writeFile: { uri: "file:///cache/x.zip" } }),
      },
    };
  }
  vm.createContext(ctx);
  vm.runInContext(SRC + "\nthis.platform=platform;", ctx);
  return { ctx, p: ctx.platform, calls, listeners, docListeners, open };
}

test("web: names itself web, sign-in links come back to this page", () => {
  const { p } = page();
  assert.equal(p.name, "web");
  assert.equal(p.native, false);
  assert.equal(p.authRedirect(), "https://do-mict.github.io/workout-tracker/");
});

test("android: sign-in links come back to the app as gfd://auth-callback", () => {
  const { p } = page({ android: true });
  assert.equal(p.name, "android");
  assert.equal(p.native, true);
  assert.equal(p.authRedirect(), "gfd://auth-callback");
});

test("site links use the site address from the shell, relative paths included", () => {
  const { p } = page({ shell: { site: "https://getfitdaily.app/" } });
  assert.equal(p.siteUrl("privacy.html"), "https://getfitdaily.app/privacy.html");
  assert.equal(p.siteUrl("./terms.html"), "https://getfitdaily.app/terms.html");
  assert.equal(p.siteUrl("https://example.com/x"), "https://example.com/x");
  assert.equal(page().p.siteUrl("roadmap.html"), "https://do-mict.github.io/workout-tracker/roadmap.html");
});

test("web: site links stay on the site the page is served from", () => {
  const p = page({ location: { origin: "https://getfitdaily.co.za", pathname: "/" } }).p;
  assert.equal(p.siteUrl("privacy.html"), "https://getfitdaily.co.za/privacy.html");
  const q = page({ location: { origin: "https://dev.getfitdaily.co.za", pathname: "/index.html" } });
  assert.equal(q.p.siteUrl("terms.html"), "https://dev.getfitdaily.co.za/terms.html");
});

test("auth links: tokens and type are read from the fragment, errors from the query", () => {
  const { p } = page();
  const a = p.parseLink("gfd://auth-callback#access_token=AAA&refresh_token=RRR&expires_in=3600&type=recovery");
  assert.equal(a.access_token, "AAA");
  assert.equal(a.refresh_token, "RRR");
  assert.equal(a.type, "recovery");
  const e = p.parseLink("gfd://auth-callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  assert.equal(e.error_code, "otp_expired");
  assert.equal(e.error_description, "Email link is invalid or has expired");
});

test("a link that opened the app waits until sign-in is ready, and is handled once", async () => {
  const { p, listeners } = page({ android: true, launchUrl: "gfd://auth-callback#access_token=A&refresh_token=R&type=signup" });
  await tick(); await tick();
  const got = [];
  p.onAuthLink((a) => got.push(a));
  assert.equal(got.length, 1);
  assert.equal(got[0].type, "signup");
  listeners["App:appUrlOpen"]({ url: "gfd://auth-callback#access_token=A&refresh_token=R&type=signup" });   // same link again
  listeners["App:appUrlOpen"]({ url: "https://evil.example/#access_token=X" });                          // not ours
  assert.equal(got.length, 1);
});

test("rest timer: schedules a notification at the end time, cancels when skipped or on screen", async () => {
  const { p, calls, ctx } = page({ android: true });
  const end = Date.now() + 90000;
  p.restAlert(end);
  for (let i = 0; i < 8; i++) await tick();
  const sched = calls.find((c) => c[0] === "LocalNotifications.schedule");
  assert.ok(sched, "scheduled");
  const n = sched[1].notifications[0];
  assert.equal(n.channelId, "rest");
  assert.equal(+n.schedule.at, end);
  assert.ok(n.schedule.allowWhileIdle);
  assert.ok(calls.some((c) => c[0] === "LocalNotifications.createChannel"));

  calls.length = 0;
  p.restSoon();                                   // app open when rest ends: the beep plays instead
  assert.ok(calls.some((c) => c[0] === "LocalNotifications.cancel"));

  calls.length = 0;
  p.restAlert(Date.now() + 60000); ctx.document.visibilityState = "hidden";
  p.restSoon();                                   // screen off: keep the notification
  for (let i = 0; i < 8; i++) await tick();
  assert.ok(!calls.slice(1).some((c) => c[0] === "LocalNotifications.cancel"), "not cancelled while hidden");

  calls.length = 0;
  p.restAlert(0);
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(JSON.stringify(calls.map((c) => c[0])), JSON.stringify(["LocalNotifications.cancel"]));
});

test("web: the rest timer never touches notifications", async () => {
  const { p, calls } = page();
  p.restAlert(Date.now() + 90000); p.restSoon(); p.restAlert(0);
  await tick();
  assert.equal(calls.length, 0);
});

test("back button: closes what's open (as Escape), else leaves the app", () => {
  const { listeners, calls, open } = page({ android: true });
  open.add("sheet");
  listeners["App:backButton"]({ canGoBack: false });
  assert.equal(JSON.stringify(calls.pop()), JSON.stringify(["key", "Escape"]));
  open.clear();
  listeners["App:backButton"]({ canGoBack: false });
  assert.equal(calls.pop()[0], "App.minimizeApp");
});

test("android: links that would open a new tab go to the browser", () => {
  const { docListeners, calls } = page({ android: true, shell: { site: "https://getfitdaily.app/" } });
  let prevented = false;
  const a = { getAttribute: () => "privacy.html" };
  docListeners.click({ target: { closest: () => a }, preventDefault: () => { prevented = true; } });
  assert.ok(prevented);
  assert.equal(JSON.stringify(calls.pop()), JSON.stringify(["Browser.open", { url: "https://getfitdaily.app/privacy.html?inapp=1", toolbarColor: "#0D0F12" }]));
});

test("android: our own pages get ?inapp=1 (Play P3), other sites don't", () => {
  const { p, calls } = page({ android: true, shell: { site: "https://getfitdaily.app/" } });
  p.openExternal("terms.html?v=2#paying");
  assert.equal(calls.pop()[1].url, "https://getfitdaily.app/terms.html?v=2&inapp=1#paying");
  p.openExternal("https://play.google.com/store/account/subscriptions");
  assert.equal(calls.pop()[1].url, "https://play.google.com/store/account/subscriptions");
});

test("android: saving a file writes it to the cache and opens the share sheet", async () => {
  const { p, calls, ctx } = page({ android: true });
  ctx.FileReader = function () { this.readAsDataURL = () => { this.result = "data:application/zip;base64,UEsDBA=="; this.onload(); }; };
  const ok = await p.saveFile({}, "gfd-data-2026-11-09.zip");
  assert.equal(ok, true);
  const w = calls.find((c) => c[0] === "Filesystem.writeFile")[1];
  assert.equal(JSON.stringify(w), JSON.stringify({ path: "gfd-data-2026-11-09.zip", data: "UEsDBA==", directory: "CACHE" }));
  assert.equal(JSON.stringify(calls.find((c) => c[0] === "Share.share")[1].files), JSON.stringify(["file:///cache/x.zip"]));
});

test("android: Google sign-in opens in a Custom Tab, which closes when the link comes back (WP11)", async () => {
  const { p, calls, listeners } = page({ android: true });
  const got = [];
  p.onAuthLink((a) => got.push(a));
  let closed = 0;
  p.openAuthUrl("https://x.supabase.co/auth/v1/authorize?provider=google", () => closed++);
  await tick();
  assert.deepEqual(calls.find((c) => c[0] === "Browser.open")[1].url, "https://x.supabase.co/auth/v1/authorize?provider=google");
  listeners["App:appUrlOpen"]({ url: "gfd://auth-callback#access_token=a&refresh_token=r" });
  await tick();
  assert.ok(calls.some((c) => c[0] === "Browser.close"));
  assert.equal(got[0].access_token, "a");
  listeners["Browser:browserFinished"]();
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(closed, 0, "finishing after the link came back doesn't reset the button");
});

test("android: closing the Google tab by hand lets the sign-in screen try again", async () => {
  const { p, listeners } = page({ android: true });
  let closed = 0;
  p.openAuthUrl("https://x/authorize", () => closed++);
  listeners["Browser:browserFinished"]();
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(closed, 1);
});

test("web: Google sign-in goes to Google in this tab", () => {
  const { ctx, p } = page();
  let went = "";
  ctx.location.assign = (u) => { went = u; };
  p.openAuthUrl("https://x/authorize");
  assert.equal(went, "https://x/authorize");
});
