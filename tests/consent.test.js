/* Tests for src/js/consent.js (WP6): which consents are owed, and what the sign-up form sends.
   Run: node --test tests/*.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "../src/js/consent.js"), "utf8");

function page(policies, boxes = {}) {
  const ctx = {
    WEB_MODE: true, sb: null, sbUser: null,
    cfg: () => ({ policies }),
    esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]),
    document: { getElementById: (id) => (id in boxes ? { checked: boxes[id] } : null) },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return ctx;
}
const row = (kind, o = {}) => ({ kind, version: null, active: false, current_version: null, ...o });

test("nothing is asked while the policies are unpublished", () => {
  const c = page({});
  assert.deepEqual([...c.consentNeeds([row("terms"), row("privacy"), row("marketing", { current_version: "1" })])], []);
  assert.deepEqual([...c.consentNeeds(null)], []);
});

test("a new account owes both; agreeing to the current versions clears them", () => {
  const c = page({});
  assert.deepEqual([...c.consentNeeds([row("terms", { current_version: "t1" }), row("privacy", { current_version: "p1" })])], ["terms", "privacy"]);
  assert.deepEqual([...c.consentNeeds([
    row("terms", { current_version: "t1", version: "t1", active: true }),
    row("privacy", { current_version: "p1", version: "p1", active: true }),
  ])], []);
});

test("a changed privacy policy asks again, as an update", () => {
  const c = page({});
  const rows = [
    row("terms", { current_version: "t1", version: "t1", active: true }),
    row("privacy", { current_version: "p2", version: "p1", active: true }),
  ];
  const needs = c.consentNeeds(rows);
  assert.deepEqual([...needs], ["privacy"]);
  assert.equal(c.consentIsUpdate(rows, needs), true);
  assert.equal(c.consentIsUpdate([row("privacy", { current_version: "p2" })], ["privacy"]), false, "never agreed: not an update");
});

test("sign-up form: tick box only once published; versions go in the metadata", () => {
  assert.equal(page({ terms: "", privacy: "" }).consentSignupHtml(), "");
  const pol = { terms: "t1", privacy: "p1", marketing: "m1", terms_url: "https://gfd.example/terms", privacy_url: "javascript:alert(1)" };
  const html = page(pol).consentSignupHtml();
  assert.match(html, /id="obAgree"/);
  assert.match(html, /href="https:\/\/gfd.example\/terms"/);
  assert.doesNotMatch(html, /javascript:/, "only https or local pages are linked");

  assert.match(page(pol, { obAgree: false }).consentSignupError(), /agree/);
  assert.equal(page(pol, { obAgree: true }).consentSignupError(), null);
  assert.deepEqual({ ...page(pol, { obAgree: true, obNews: false }).consentSignupMeta() }, { terms: "t1", privacy: "p1" });
  assert.deepEqual({ ...page(pol, { obAgree: true, obNews: true }).consentSignupMeta() }, { terms: "t1", privacy: "p1", marketing: "m1" });
  assert.equal(page({}, {}).consentSignupMeta(), null);
});
