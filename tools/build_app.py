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


# GFD Dev only: a small "DEV" tag in the bottom-left corner. Tap it for a status report (WebView version, screen size,
# server connection, sign-in, tab bar) to screenshot; it turns red and opens by itself when a script error happens.
# There's no console to look at on a phone.
DEV_ERRORS = r"""
<script>(function(){
  var log=[], tag=null, box=null, t0=Date.now();
  function chrome(){ return (navigator.userAgent.match(/Chrome\/[0-9.]+/)||["Chrome ?"])[0]; }
  function el(id){ return document.getElementById(id); }
  function vis(e){ if(!e) return "missing"; var r=e.getBoundingClientRect(), cs=getComputedStyle(e);
    return (e.hidden?"hidden ":"")+"display:"+cs.display+" top:"+Math.round(r.top)+" h:"+Math.round(r.height); }
  function v(f){ try{ return String(f()); }catch(e){ return "ERR "+e.message; } }
  function report(){
    return ["GFD Dev status (tap to close)", chrome()+" · Android "+(navigator.userAgent.match(/Android [0-9.]+/)||["?"])[0],
      "seconds open: "+Math.round((Date.now()-t0)/1000),
      "window "+innerWidth+"x"+innerHeight+" screen "+screen.width+"x"+screen.height+" dpr "+devicePixelRatio,
      "safe-area top: "+v(function(){ var d=document.createElement("div"); d.style.cssText="position:fixed;top:0;height:env(safe-area-inset-top,0px)"; document.body.appendChild(d); var h=d.getBoundingClientRect().height; d.remove(); return h; }),
      "supabase lib: "+v(function(){ return typeof (window.supabase&&window.supabase.createClient); }),
      "client: "+v(function(){ return !!sb; })+" · offline: "+v(function(){ return sbOffline; })+" · user: "+v(function(){ return sbUser?"signed in":"none"; }),
      "account on phone: "+v(function(){ return JSON.stringify(acct()); }).slice(0,120),
      "status text: "+v(function(){ var s=el("status")||document.querySelector("[data-status]"); return s?s.textContent:"-"; }),
      "body class: "+document.body.className,
      "sign-in sheet: "+vis(el("onboard")),
      "tab bar: "+vis(el("tabbar")),
      "log:"].concat(log).join("\n");
  }
  function ensure(){
    if(tag||!document.body) return;
    tag=document.createElement("button"); tag.type="button"; tag.textContent="DEV";
    tag.setAttribute("style","position:fixed;left:4px;bottom:4px;z-index:99999;font:bold 11px monospace;padding:3px 6px;border-radius:6px;border:0;background:#FF9F1C;color:#000;opacity:.85");
    tag.onclick=function(){ toggle(); };
    document.body.appendChild(tag);
  }
  function toggle(force){
    if(box&&!force){ box.remove(); box=null; return; }
    if(!box){ box=document.createElement("pre"); box.onclick=function(){ box.remove(); box=null; };
      box.setAttribute("style","position:fixed;left:6px;right:6px;top:6px;z-index:99999;max-height:80vh;overflow:auto;margin:0;"+
        "background:#111;color:#fff;font:11px/1.35 monospace;padding:8px;border-radius:8px;white-space:pre-wrap;word-break:break-word");
      document.body.appendChild(box); }
    box.textContent=report();
  }
  function add(msg, bad){
    log.push(Math.round((Date.now()-t0)/1000)+"s "+msg); if(log.length>30) log.shift();
    if(bad&&document.body){ ensure(); tag.style.background="#B00020"; tag.style.color="#fff"; toggle(true); }
    else if(box) box.textContent=report();
  }
  window.addEventListener("error",function(e){
    if(e.target&&e.target!==window&&(e.target.src||e.target.href)){ add("Failed to load "+(e.target.src||e.target.href),1); return; }
    add((e.message||"error")+" @ "+String(e.filename||"").replace(/^https?:\/\/[^/]+\//,"")+":"+e.lineno+":"+e.colno,1);
  },true);
  window.addEventListener("unhandledrejection",function(e){ var r=e.reason; add("Promise: "+(r&&(r.message||r)),1); });
  ["warn","error"].forEach(function(k){ var o=console[k]; console[k]=function(){ try{ add(k+": "+Array.prototype.map.call(arguments,String).join(" ").slice(0,200)); }catch(e){} return o&&o.apply(console,arguments); }; });
  document.addEventListener("DOMContentLoaded",function(){ ensure(); add("page ready"); });
  window.addEventListener("load",function(){ add("all files loaded"); });
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
