#!/usr/bin/env python3
"""Point a built copy of the app at the dev or production Supabase project.

The source files (src/js/signin.js, delete-account.html) hold one project URL and publishable key, in the line
    var SB_URL="https://<ref>.supabase.co", SB_KEY="sb_publishable_...";
Builds rewrite that line in their output folder only, from deploy/supabase.json:

    GFD_ENV=dev python3 tools/build_dist.py       # dev.getfitdaily.co.za -> GFD Dev
    GFD_ENV=production python3 tools/build_dist.py  # getfitdaily.co.za    -> GFD Prod (the default)

SUPABASE_URL and SUPABASE_KEY environment variables, when set, win over the file (handy for a one-off test build).
A production build with no url in the file keeps what the source has (the old project), so nothing breaks before
the move. A dev build with no url stops: a dev site must never write into production.
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "deploy" / "supabase.json"
LINE = re.compile(r'var SB_URL="[^"]*", SB_KEY="[^"]*"')
FILES = ["src/js/signin.js", "delete-account.html"]
ENVS = ("production", "dev")


def resolve(env=None):
    env = (env or os.environ.get("GFD_ENV") or "production").strip().lower()
    if env not in ENVS:
        sys.exit(f"GFD_ENV must be one of {', '.join(ENVS)}, not {env!r}")
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))[env]
    url = (os.environ.get("SUPABASE_URL") or cfg.get("url") or "").strip().rstrip("/")
    key = (os.environ.get("SUPABASE_KEY") or cfg.get("key") or "").strip()
    if bool(url) != bool(key):
        sys.exit(f"{env}: set both the Supabase url and the publishable key (deploy/supabase.json), or neither")
    if url and not re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co", url):
        sys.exit(f"{env}: the Supabase url should look like https://<project ref>.supabase.co, got {url!r}")
    if key and not key.startswith("sb_publishable_"):
        sys.exit(f"{env}: use the publishable key (sb_publishable_...), never the secret key")
    if not url and env == "dev":
        sys.exit("dev: no Supabase project in deploy/supabase.json, so this build would talk to production. "
                 "Fill in dev.url and dev.key first.")
    return env, url, key, cfg


def apply(folder, env=None):
    """Rewrite the Supabase line in the built files under folder. Returns (env, url used)."""
    env, url, key, _cfg = resolve(env)
    folder = Path(folder)
    used = None
    for name in FILES:
        p = folder / name
        if not p.is_file():
            continue
        text = p.read_text(encoding="utf-8")
        found = LINE.findall(text)
        if len(found) != 1:
            sys.exit(f"{name}: expected one 'var SB_URL=..., SB_KEY=...' line, found {len(found)}")
        if url:
            text = LINE.sub(f'var SB_URL="{url}", SB_KEY="{key}"', text)
            p.write_text(text, encoding="utf-8")
            used = url
        else:
            used = re.search(r'SB_URL="([^"]*)"', found[0]).group(1)
            print(f"warning: {env} has no Supabase url in deploy/supabase.json; {name} keeps {used}")
    return env, used


if __name__ == "__main__":
    e, u, _k, c = resolve(sys.argv[1] if len(sys.argv) > 1 else None)
    print(f"{e}: {c.get('name')} {u or '(not set: source default)'}")
