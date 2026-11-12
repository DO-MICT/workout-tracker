"""Build the web files for the Android app (WP10) into build/app/, which Capacitor copies into the APK.

Usage:  python3 tools/build_app.py              then  npx cap sync android   (the Play app, GFD Prod)
        python3 tools/build_app.py --env dev    then  npx cap sync android   ("GFD Dev" test app, GFD Dev)
Gradle checks that the flavour you build matches: prod* for production, dev* for dev (android/app/build.gradle).
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


# per environment: the URL scheme sign-in links come back on (must match the flavour's custom_url_scheme string)
SCHEMES = {"production": "gfd", "dev": "gfddev"}


def app_head(site_url, env):
    # appId stays the Play package in both: it is only used for the Google Play link and billing
    app_id = json.loads((root / "capacitor.config.json").read_text(encoding="utf-8"))["appId"]
    shell = {"site": site_url, "platform": "android", "appId": app_id, "env": env, "scheme": SCHEMES[env]}
    head = f"""<title>GFD · Get Fit Daily</title>
<meta name="theme-color" content="#0D0F12">
<script>window.GFD_SHELL={json.dumps(shell)};</script>"""
    return head + (DEV_ERRORS if env == "dev" else "")


# GFD Dev only: script errors show in a red box at the bottom of the screen (tap to hide), with the WebView
# version, so a tester can screenshot them. There's no console to look at on a phone.
DEV_ERRORS = r"""
<script>(function(){
  var box=null, n=0;
  function show(msg){
    if(n++>20) return;
    if(!document.body){ document.addEventListener("DOMContentLoaded",function(){ show(msg); n--; }); return; }
    if(!box){
      box=document.createElement("div");
      box.setAttribute("style","position:fixed;left:6px;right:6px;bottom:6px;z-index:99999;max-height:45vh;overflow:auto;"+
        "background:#B00020;color:#fff;font:12px/1.35 monospace;padding:8px;border-radius:8px;white-space:pre-wrap;word-break:break-word");
      box.onclick=function(){ box.remove(); box=null; };
      box.textContent="GFD Dev errors (tap to hide)\n"+(navigator.userAgent.match(/Chrome\/[0-9.]+/)||["?"])[0]+"\n";
      document.body.appendChild(box);
    }
    box.textContent+="\n• "+msg;
  }
  window.addEventListener("error",function(e){
    if(e.target&&e.target!==window&&(e.target.src||e.target.href)){ show("Failed to load "+(e.target.src||e.target.href)); return; }
    show((e.message||"error")+"  @ "+String(e.filename||"").replace(/^.*\/public\//,"").replace(/^https?:\/\/[^/]+\//,"")+":"+e.lineno+":"+e.colno);
  },true);
  window.addEventListener("unhandledrejection",function(e){ var r=e.reason; show("Promise: "+(r&&(r.message||r))+""); });
})();</script>"""


def build(env="production"):
    src = (root / "app.html").read_text(encoding="utf-8")
    assert src.count("<title>5-day split</title>") == 1, "title tag not found in app.html"
    v, _report = build_site.build()
    html = src.replace("<title>5-day split</title>", app_head(v["site_url"], env), 1)

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    (out / "index.html").write_text(html, encoding="utf-8")
    for d in COPY_DIRS:
        shutil.copytree(root / d, out / d, ignore=shutil.ignore_patterns("*.md", ".DS_Store", "purchases-js*", "PURCHASES-JS-*"))
    for f in COPY_FILES:
        shutil.copy2(root / f, out / f)
    import supabase_env  # production = the Play app (GFD Prod); dev = the "GFD Dev" test app (deploy/supabase.json)
    supabase_env.apply(out, env)
    return out


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Build build/app/ for the Android app")
    ap.add_argument("--env", choices=sorted(SCHEMES), default="production",
                    help="production (the Play app, default) or dev (the GFD Dev test app)")
    env = ap.parse_args().env
    p = build(env)
    n = sum(1 for _ in p.rglob("*") if _.is_file())
    flavour = "prod" if env == "production" else "dev"
    print(f"build/app built for {env} ({n} files). Next: npx cap sync android, then a {flavour}* Gradle task")
