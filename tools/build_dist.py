#!/usr/bin/env python3
"""Copy only the files that should be public into dist/.

Add a page here when it becomes public. Everything else in the repo
(migrations, tests, docs, notes) stays out of the deployed site.
"""
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

missing = [n for n in REQUIRED if not (DIST / n).is_file()]
if missing:
    sys.exit("dist incomplete, missing: " + ", ".join(missing)
             + " (did tools/build_pages.py run?)")

print("dist built:", ", ".join(sorted(p.name for p in DIST.iterdir())))
