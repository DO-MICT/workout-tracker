"""Build the web files for the Android app (WP10) into build/app/, which Capacitor copies into the APK.

Usage:  python3 tools/build_app.py        then  npx cap sync android
The app is the same app.html + src/ as the website, with three differences:
  - no service worker or web manifest (the files are already inside the app, so it works offline from the first open)
  - window.GFD_SHELL tells platform.js which site address to use for links that open in the browser
    (the policy pages, the roadmap), taken from site.json (the domain once bought, else GitHub Pages)
  - only the files the app needs are copied (no art previews, data sources or tools)
build/ is not checked in; the android-build workflow runs this script before every build.
"""
import json
import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = root / "build" / "app"

sys.path.insert(0, str(root / "tools"))
import build_site  # noqa: E402

COPY_DIRS = ["src", "vendor", "icons"]
COPY_FILES = ["roadmap.html", "privacy.html", "terms.html", "delete-account.html"]


def app_head(site_url):
    app_id = json.loads((root / "capacitor.config.json").read_text(encoding="utf-8"))["appId"]
    shell = {"site": site_url, "platform": "android", "appId": app_id}
    return f"""<title>GFD · Get Fit Daily</title>
<meta name="theme-color" content="#0D0F12">
<script>window.GFD_SHELL={json.dumps(shell)};</script>"""


def build():
    src = (root / "app.html").read_text(encoding="utf-8")
    assert src.count("<title>5-day split</title>") == 1, "title tag not found in app.html"
    v, _report = build_site.build()
    html = src.replace("<title>5-day split</title>", app_head(v["site_url"]), 1)

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    (out / "index.html").write_text(html, encoding="utf-8")
    for d in COPY_DIRS:
        shutil.copytree(root / d, out / d, ignore=shutil.ignore_patterns("*.md", ".DS_Store"))
    for f in COPY_FILES:
        shutil.copy2(root / f, out / f)
    return out


if __name__ == "__main__":
    p = build()
    n = sum(1 for _ in p.rglob("*") if _.is_file())
    print(f"build/app built ({n} files). Next: npx cap sync android")
