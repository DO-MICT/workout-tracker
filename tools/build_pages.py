"""Build index.html (GitHub Pages) from app.html (the page shell; code lives in src/).

Usage:  python3 tools/build_pages.py
Adds the web title, home-screen install tags and icons. The app switches to Supabase
sign-in automatically when it runs outside Claude, so no other changes are needed.
"""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = (root / "app.html").read_text(encoding="utf-8")

head_tags = """<title>Workout tracker</title>
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#16202B">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Workouts">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">"""

assert src.count("<title>5-day split</title>") == 1, "title tag not found in app.html"
out = src.replace("<title>5-day split</title>", head_tags, 1)
(root / "index.html").write_text(out, encoding="utf-8")
print("index.html built")
