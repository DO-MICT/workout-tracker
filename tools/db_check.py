#!/usr/bin/env python3
"""Checks on supabase/migrations, run by the db-check workflow (and locally before a PR).

  python3 tools/db_check.py files [--base origin/main]   naming, rollbacks present, shipped migrations untouched
  python3 tools/db_check.py roundtrip --db-url URL       each rollback runs, then its migration applies again

Rules (docs/db-brief.md):
  * migration files are supabase/migrations/<14-digit version>_<snake_name>.sql, versions unique and increasing
  * every migration from ROLLBACK_FROM on has supabase/rollbacks/<same name>.down.sql
  * a migration already on main is never edited: write a new one
"""
import argparse
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIG = os.path.join(ROOT, 'supabase', 'migrations')
RB = os.path.join(ROOT, 'supabase', 'rollbacks')
ROLLBACK_FROM = '20261108000010'   # rollbacks became required with WP2; older migrations predate the rule
NAME = re.compile(r'^(\d{14})_([a-z0-9_]+)\.sql$')


def migrations():
    out = []
    for f in sorted(os.listdir(MIG)):
        m = NAME.match(f)
        out.append((f, m.group(1) if m else None))
    return out


def check_files(base):
    errors = []
    seen = set()
    for f, version in migrations():
        if not version:
            errors.append(f'{f}: name must be <14-digit version>_<lower_snake_name>.sql')
            continue
        if version in seen:
            errors.append(f'{f}: version {version} is used twice')
        seen.add(version)
        if version >= ROLLBACK_FROM and not os.path.exists(os.path.join(RB, f[:-4] + '.down.sql')):
            errors.append(f'{f}: add supabase/rollbacks/{f[:-4]}.down.sql (how to undo it)')
    for f in sorted(os.listdir(RB)) if os.path.isdir(RB) else []:
        if not f.endswith('.down.sql') or not os.path.exists(os.path.join(MIG, f[:-9] + '.sql')):
            errors.append(f'supabase/rollbacks/{f}: no migration with that name')

    if base:
        diff = subprocess.run(['git', 'diff', '--name-status', f'{base}...HEAD', '--', 'supabase/migrations/'],
                              cwd=ROOT, capture_output=True, text=True)
        if diff.returncode != 0:
            errors.append(f'git diff against {base} failed: {diff.stderr.strip()}')
        newest_on_base = max((v for f, v in migrations_at(base) if v), default='')
        for line in diff.stdout.splitlines():
            status, *paths = line.split('\t')
            path = paths[-1]
            if status[0] in 'MDR':
                errors.append(f'{path}: already on main, so it may be live. Do not edit, rename or delete it; add a new migration.')
            elif status[0] == 'A':
                m = NAME.match(os.path.basename(path))
                if m and m.group(1) <= newest_on_base:
                    errors.append(f'{path}: version must be newer than {newest_on_base}, the newest on main')
    return errors


def migrations_at(ref):
    ls = subprocess.run(['git', 'ls-tree', '--name-only', ref, 'supabase/migrations/'],
                        cwd=ROOT, capture_output=True, text=True)
    out = []
    for p in ls.stdout.split():
        m = NAME.match(os.path.basename(p))
        out.append((p, m.group(1) if m else None))
    return out


def psql(db_url, path):
    r = subprocess.run(['psql', db_url, '-v', 'ON_ERROR_STOP=1', '-q', '-f', path], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f'{os.path.relpath(path, ROOT)} failed:\n{r.stderr.strip()}')


def roundtrip(db_url):
    """Undo every migration that has a rollback (newest first), then apply them again (oldest first)."""
    pairs = [(f, os.path.join(RB, f[:-4] + '.down.sql')) for f, v in migrations()
             if v and os.path.exists(os.path.join(RB, f[:-4] + '.down.sql'))]
    if not pairs:
        print('No rollbacks to test.')
        return []
    # a rollback can only undo the migrations after it if those are undone first, so go newest first
    newest_first = list(reversed(pairs))
    try:
        for f, down in newest_first:
            psql(db_url, down)
            print(f'rolled back {f}')
        for f, _ in pairs:
            psql(db_url, os.path.join(MIG, f))
            print(f'applied again {f}')
    except RuntimeError as e:
        return [str(e)]
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('what', choices=['files', 'roundtrip'])
    ap.add_argument('--base', help='git ref to compare with, e.g. origin/main')
    ap.add_argument('--db-url', help='local database url for roundtrip')
    a = ap.parse_args()
    if a.what == 'files':
        errors = check_files(a.base)
    else:
        if not a.db_url or re.search(r'zdllpjrkwcdmcuizxuum|supabase\.co|pooler\.supabase', a.db_url):
            sys.exit('roundtrip runs only against a local database')
        errors = roundtrip(a.db_url)
    for e in errors:
        print('::error::' + e if os.environ.get('GITHUB_ACTIONS') else 'ERROR ' + e)
    if errors:
        sys.exit(1)
    print('OK')


if __name__ == '__main__':
    main()
