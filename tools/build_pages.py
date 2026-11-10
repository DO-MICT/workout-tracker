"""Build index.html (GitHub Pages) from app.html (the page shell; code lives in src/).

Usage:  python3 tools/build_pages.py
Adds the web title, home-screen install tags, icons and the offline service worker (sw.js). The app switches to Supabase
sign-in automatically when it runs outside Claude, so no other changes are needed.
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = (root / "app.html").read_text(encoding="utf-8")

# Link preview (WhatsApp, Facebook, X, LinkedIn): crawlers need absolute https URLs, so they use the live domain from
# site.json. The images come from tools/build_share_images.js. WhatsApp takes the first og:image, so the big card is first.
_site = json.loads((root / "site.json").read_text(encoding="utf-8"))
base = f"https://{_site['domain']}/" if _site.get("domain") else _site["pages_url"]
share_title = "GFD · Get Fit Daily"
share_desc = "Great Form and Discipline. Plan, log and track your gym workouts."
share_tags = f"""<link rel="canonical" href="{base}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Get Fit Daily">
<meta property="og:url" content="{base}">
<meta property="og:title" content="{share_title}">
<meta property="og:description" content="{share_desc}">
<meta property="og:locale" content="en_ZA">
<meta property="og:image" content="{base}icons/share-card.png">
<meta property="og:image:secure_url" content="{base}icons/share-card.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="GFD weight plate logo with Get Fit Daily, Great Form and Discipline">
<meta property="og:image" content="{base}icons/share-square.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="600">
<meta property="og:image:height" content="600">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{share_title}">
<meta name="twitter:description" content="{share_desc}">
<meta name="twitter:image" content="{base}icons/share-card.png">
<meta name="twitter:image:alt" content="GFD weight plate logo with Get Fit Daily, Great Form and Discipline">"""

head_tags = f"""<title>GFD · Get Fit Daily</title>
<meta name="description" content="Get Fit Daily: Great Form and Discipline. Plan, log and track your gym workouts.">
<link rel="manifest" href="manifest.webmanifest">
{share_tags}
<meta name="theme-color" content="#0D0F12">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="GFD">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<script>if("serviceWorker" in navigator)addEventListener("load",function(){{navigator.serviceWorker.register("sw.js").catch(function(){{}})}});</script>"""

assert src.count("<title>5-day split</title>") == 1, "title tag not found in app.html"
out = src.replace("<title>5-day split</title>", head_tags, 1)
(root / "index.html").write_text(out, encoding="utf-8")
print("index.html built")

# the policy pages, sign-in emails and CNAME come from site.json (WP7)
import sys
sys.path.insert(0, str(root / "tools"))
import build_site  # noqa: E402
_v, _report = build_site.build()
for _name, _gaps in _report.items():
    print(f"{_name}.html built" + (f" (draft: fill in {', '.join(_gaps)} in site.json)" if _gaps else ""))
