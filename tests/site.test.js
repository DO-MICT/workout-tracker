/* Tests for the policy pages and sign-in emails (WP7): built from site.json, versions in step with the database.
   Run: node --test tests/*.test.js   (after python3 tools/build_pages.py) */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const site = JSON.parse(read("site.json"));

/* the newest migration that sets terms/privacy in app_config.policies */
function dbVersions() {
  const dir = path.join(ROOT, "supabase/migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().reverse();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    if (!/app_config/.test(sql)) continue;
    const t = sql.match(/"terms":\s*"([^"]*)"/), p = sql.match(/"privacy":\s*"([^"]*)"/);
    if (t && p) return { file: f, terms: t[1], privacy: p[1] };
  }
  return null;
}

test("site.json policy versions match the newest migration that publishes them", () => {
  const db = dbVersions();
  assert.ok(db, "a migration sets the policy versions");
  assert.equal(db.terms, site.policies.terms, `terms version: site.json vs ${db.file}`);
  assert.equal(db.privacy, site.policies.privacy, `privacy version: site.json vs ${db.file}`);
  assert.match(site.policies.terms, /^[0-9A-Za-z][0-9A-Za-z.-]{0,19}$/, "fits the consents.version check");
});

test("the built pages carry their version and no unfilled template tokens", () => {
  for (const [name, v] of [["privacy", site.policies.privacy], ["terms", site.policies.terms]]) {
    const html = read(name + ".html");
    assert.ok(html.includes("Version " + v), `${name}.html shows version ${v}`);
    assert.doesNotMatch(html, /\{\{[a-z_]+\}\}/, `${name}.html has no raw tokens`);
    assert.doesNotMatch(html, /<!--(TITLE|BODY|DRAFT|ROBOTS)-->/, `${name}.html is fully assembled`);
    const gaps = (html.match(/class="gap"/g) || []).length;
    assert.equal(html.includes('class="draft"'), gaps > 0, `${name}.html shows the draft banner only while there are gaps`);
    assert.equal(html.includes('name="robots" content="noindex"'), gaps > 0, `${name}.html is hidden from search only while a draft`);
  }
});

test("the terms say GFD is not medical advice; the privacy policy names the EU storage and the rights", () => {
  assert.match(read("terms.html"), /not medical/i);
  const p = read("privacy.html");
  assert.match(p, /European Union/);
  assert.match(p, /Information Regulator/);
  assert.match(p, /don't sell/i);
});

test("each sign-in email keeps Supabase's own link or code and links the policies", () => {
  const dir = path.join(ROOT, "supabase/templates");
  const names = fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort();
  assert.deepEqual(names, ["confirmation.html", "email_change.html", "invite.html", "magic_link.html", "reauthentication.html", "recovery.html"]);
  for (const f of names) {
    const html = fs.readFileSync(path.join(dir, f), "utf8");
    assert.match(html, f === "reauthentication.html" ? /\{\{ \.Token \}\}/ : /\{\{ \.ConfirmationURL \}\}/, f);
    assert.doesNotMatch(html, /\{\{[a-z_]+\}\}/, `${f} has no raw tokens`);
    assert.ok(html.includes("privacy.html") && html.includes("terms.html"), `${f} links the policies`);
  }
  const toml = read("supabase/config.toml");
  for (const f of names) assert.ok(toml.includes(`content_path = "./supabase/templates/${f}"`), `config.toml uses ${f}`);
});

test("CNAME follows the domain placeholder", () => {
  const has = fs.existsSync(path.join(ROOT, "CNAME"));
  if (!site.domain) assert.equal(has, false, "no CNAME until a domain is set");
  else assert.equal(read("CNAME").trim(), site.domain);
});

test("the app accepts the relative policy urls the migration publishes", () => {
  const vm = require("node:vm");
  const ctx = { cfg: () => ({ policies: { terms_url: "terms.html", privacy_url: "privacy.html" } }), esc: String };
  vm.createContext(ctx);
  vm.runInContext(read("src/js/consent.js"), ctx);
  assert.equal(ctx.policyUrl("terms"), "terms.html");
  assert.equal(ctx.policyUrl("privacy"), "privacy.html");
});
