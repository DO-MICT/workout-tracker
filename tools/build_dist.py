#!/usr/bin/env python3
"""Copy only the files that should be public into dist/.

Add a page here when it becomes public. Everything else in the repo
(migrations, tests, docs, notes) stays out of the deployed site.

GFD_ENV (production, the default, or dev) picks the Supabase project from
deploy/supabase.json (see tools/supabase_env.py). A dev build is also kept out
of search engines and says DEV in the tab title.
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

FILES = ["index.html", "sw.js", "manifest.webmanifest", "roadmap.html",
         "privacy.html", "terms.html", "delete-account.html", "robots.txt"]
DIRS = ["src", "icons", "vendor", ".well-known"]
REQUIRED = ["index.html", "sw.js", "manifest.webmanifest"]

if DIST.exists():
    shutil.rmtree(DIST)
DIST.mkdir()

for name in FILES:
    path = ROOT / name
    if path.is_file():
        shutil.copy2(path, DIST / name)

for name in DIRS:
    path = ROOT / name
    if path.is_dir():
        shutil.copytree(path, DIST / name)

sys.path.insert(0, str(ROOT / "tools"))
import supabase_env  # noqa: E402

env, url = supabase_env.apply(DIST)
if env == "dev":
    index = DIST / "index.html"
    html = index.read_text(encoding="utf-8")
    html, n = re.subn(r"<title>", '<meta name="robots" content="noindex, nofollow">\n<title>DEV · ', html, count=1)
    if n != 1:
        sys.exit("dev build: no <title> in index.html")
    index.write_text(html, encoding="utf-8")
    (DIST / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
print(f"Supabase ({env}): {url}")

missing = [n for n in REQUIRED if not (DIST / n).is_file()]
if missing:
    sys.exit("dist incomplete, missing: " + ", ".join(missing)
             + " (did tools/build_pages.py run?)")

print("dist built:", ", ".join(sorted(p.name for p in DIST.iterdir())))
