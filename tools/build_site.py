"""Build the public site pages and sign-in emails from site.json (WP7).

Usage:  python3 tools/build_site.py      (tools/build_pages.py runs it too, so CI checks the output is current)

  site/privacy.html, site/terms.html      ->  privacy.html, terms.html (served by GitHub Pages)
  site/delete-account.html                ->  delete-account.html (WP8: the deletion link for Google Play)
  site/emails/*.html                      ->  supabase/templates/*.html (Supabase auth emails)
  site.json "domain"                      ->  CNAME (only once a domain is set)

Templates use {{name}} for values from site.json (see values() below). A value that isn't filled in yet becomes a
highlighted gap on the pages, and the page shows a "draft" banner and asks search engines not to index it.
Supabase's own email variables ({{ .ConfirmationURL }} and so on) have a space and a dot, so they pass through.
"""
import html
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
SITE = root / "site"
TOKEN = re.compile(r"\{\{([a-z_]+)\}\}")

# what each gap says on the page while it's empty
GAP_LABEL = {
    "owner_name": "name of the person or business that runs GFD",
    "owner_address": "postal address",
    "information_officer": "information officer",
    "hello_email": "contact email",
    "privacy_email": "privacy email",
}


def load():
    return json.loads((root / "site.json").read_text(encoding="utf-8"))


def supabase_client():
    """the app's Supabase URL and publishable key, read from src/js/signin.js so there is one place for them"""
    src = (root / "src" / "js" / "signin.js").read_text(encoding="utf-8")
    m = re.search(r'var SB_URL="(https://[a-z0-9.-]+)", SB_KEY="([A-Za-z0-9_.-]+)"', src)
    assert m, "src/js/signin.js: SB_URL and SB_KEY not found"
    return m.group(1), m.group(2)


def values(c):
    domain = (c.get("domain") or "").strip().lower()
    assert re.fullmatch(r"([a-z0-9-]+\.)+[a-z]{2,}", domain) or domain == "", "site.json domain: just the name, like example.com"
    lp = c["email_local_parts"]
    mail = lambda k: f"{lp[k]}@{domain}" if domain else ""
    io = (c.get("information_officer") or "").strip() or (c.get("owner_name") or "").strip()
    return {
        "domain": domain,
        "site_url": f"https://{domain}/" if domain else c["pages_url"],
        "owner_name": (c.get("owner_name") or "").strip(),
        "owner_address": (c.get("owner_address") or "").strip(),
        "information_officer": io,
        "country": c["country"],
        "min_age": str(c["min_age"]),
        "hello_email": mail("hello"),
        "privacy_email": mail("privacy"),
        "sender_email": mail("sender"),
        "sender_name": c["email_sender_name"],
        "terms_version": c["policies"]["terms"],
        "privacy_version": c["policies"]["privacy"],
        "effective": c["policies"]["effective"],
        "supabase_url": supabase_client()[0],
        "supabase_key": supabase_client()[1],
    }


def render_page(tpl, v):
    gaps = []

    def sub(m):
        k = m.group(1)
        if k not in v:
            raise KeyError(f"unknown {{{{{k}}}}} in a site template")
        if v[k]:
            val = html.escape(v[k])
            if k.endswith("_email"):
                return f'<a href="mailto:{val}">{val}</a>'
            return val
        gaps.append(k)
        return f'<mark class="gap">[{GAP_LABEL.get(k, k)}]</mark>'

    out = TOKEN.sub(sub, tpl)
    draft = ('<div class="draft" role="note"><b>Draft.</b> A few details on this page are still being filled in '
             '(highlighted). The rest is how GFD works today.</div>') if gaps else ""
    robots = '<meta name="robots" content="noindex">' if gaps else ""
    return out.replace("<!--DRAFT-->", draft).replace("<!--ROBOTS-->", robots), sorted(set(gaps))


def render_email(tpl, v):
    def sub(m):
        k = m.group(1)
        if k not in v:
            raise KeyError(f"unknown {{{{{k}}}}} in an email template")
        return html.escape(v[k]) if v[k] else ""
    return TOKEN.sub(sub, tpl)


def build():
    c = load()
    v = values(c)
    shell = (SITE / "shell.html").read_text(encoding="utf-8")
    report = {}
    for name in ("privacy", "terms", "delete-account"):
        body = (SITE / f"{name}.html").read_text(encoding="utf-8")
        title, _, body = body.partition("\n")
        page = shell.replace("<!--TITLE-->", title.strip()).replace("<!--BODY-->", body)
        out, gaps = render_page(page, v)
        (root / f"{name}.html").write_text(out, encoding="utf-8")
        report[name] = gaps

    tdir = root / "supabase" / "templates"
    tdir.mkdir(exist_ok=True)
    frame = (SITE / "emails" / "_frame.html").read_text(encoding="utf-8")
    for f in sorted((SITE / "emails").glob("*.html")):
        if f.name.startswith("_"):
            continue
        text = f.read_text(encoding="utf-8")
        subject, _, body = text.partition("\n")
        assert subject.startswith("Subject: "), f"{f.name}: first line must be 'Subject: ...'"
        (tdir / f.name).write_text(render_email(frame.replace("<!--BODY-->", body.strip()), v), encoding="utf-8")

    cname = root / "CNAME"
    if v["domain"]:
        cname.write_text(v["domain"] + "\n", encoding="utf-8")
    elif cname.exists():
        cname.unlink()
    return v, report


def email_subjects():
    """{template name: subject}, for tools/push_auth_emails.py"""
    out = {}
    for f in sorted((SITE / "emails").glob("*.html")):
        if not f.name.startswith("_"):
            out[f.stem] = f.read_text(encoding="utf-8").partition("\n")[0][len("Subject: "):].strip()
    return out


if __name__ == "__main__":
    v, report = build()
    for name, gaps in report.items():
        print(f"{name}.html built" + (f" (draft, still to fill in site.json: {', '.join(gaps)})" if gaps else ""))
    print("emails built in supabase/templates/" + ("" if v["domain"] else " (no domain yet: no CNAME)"))
