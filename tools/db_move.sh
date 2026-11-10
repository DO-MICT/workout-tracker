#!/usr/bin/env bash
# One-time move of everything in the old Supabase project ("Workout tracker", zdllpjrkwcdmcuizxuum) into GFD Prod.
# Run by the "Move to GFD Prod" workflow (.github/workflows/db-move.yml); it can also run on any machine with
# Docker, the Supabase CLI 3.x and curl. See docs/db-brief.md, "Moving to GFD Prod".
#
#   tools/db_move.sh check   # reads both projects, changes nothing, says what it would do
#   tools/db_move.sh apply   # does the move
#
# What moves: sign-in accounts (auth.users + auth.identities, so passwords keep working), every table in public and
# private (profiles, plans blob, workouts, sets, feedback, entitlements, trial ledger and its salt, exercise and gear
# library), and the files in storage (feedback screenshots). Sessions don't move: everyone signs in once more.
#
# Order matters: the new project first gets the migrations the old one has (up to OLD_LEVEL), then the data, then the
# newer migrations, so any migration that reshapes data runs on the real data, exactly as it would have on the old one.
#
# Environment (never print these):
#   OLD_DB_URL, NEW_DB_URL             session pooler URIs with the passwords filled in
#   OLD_SUPABASE_URL, OLD_SERVICE_KEY  https://<ref>.supabase.co and its secret (service role) key, for storage files
#   NEW_SUPABASE_URL, NEW_SERVICE_KEY  the same for GFD Prod
#   FINAL_DIR                          folder holding the supabase/ whose migrations finish the move (default: this repo)
set -euo pipefail

MODE=${1:-check}
[[ $MODE == check || $MODE == apply ]] || { echo "usage: $0 check|apply"; exit 2; }
ROOT=$(cd "$(dirname "$0")/.." && pwd)
FINAL_DIR=${FINAL_DIR:-$ROOT}
OLD_LEVEL=${OLD_LEVEL:-20261108000010}   # newest migration in the old project (entitlements)
for v in OLD_DB_URL NEW_DB_URL OLD_SUPABASE_URL OLD_SERVICE_KEY NEW_SUPABASE_URL NEW_SERVICE_KEY; do
  [[ -n ${!v:-} ]] || { echo "::error::$v is not set"; exit 2; }
done
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"
PGIMAGE=${PGIMAGE:-postgres:17}   # the servers run Postgres 17; pg_dump must not be older

pg() { docker run --rm -i --network host -e PGCONNECT_TIMEOUT=20 -v "$WORK:/work" "$PGIMAGE" "$@"; }
q() { pg psql "$1" -XAtq -v ON_ERROR_STOP=1 -c "$2"; }
say() { echo "$*"; [[ -n ${GITHUB_STEP_SUMMARY:-} ]] && echo "$*" >> "$GITHUB_STEP_SUMMARY" || true; }

COUNTS="select s||'.'||t||' '||(xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I.%I', s, t), false, true, '')))[1]::text
from (select table_schema s, table_name t from information_schema.tables
      where table_schema in ('public','private') and table_type = 'BASE TABLE'
      union all values ('auth','users'), ('auth','identities'), ('storage','objects')) x order by 1"

say "### Move to GFD Prod: $MODE"

# ---------- 1. look before touching anything ----------
q "$OLD_DB_URL" "select 1" >/dev/null || { echo "::error::Can't reach the old project (OLD_DB_URL)"; exit 1; }
q "$NEW_DB_URL" "select 1" >/dev/null || { echo "::error::Can't reach GFD Prod (NEW_DB_URL)"; exit 1; }

old_has() { q "$OLD_DB_URL" "select to_regclass('$1') is not null"; }
[[ $(old_has public.entitlements) == t ]] || { echo "::error::The old project has no entitlements table: it isn't at migration $OLD_LEVEL. Stop."; exit 1; }
[[ $(old_has public.plans) == f ]] || { echo "::error::The old project already has the sync tables (migration 000011). Set OLD_LEVEL to its newest migration first."; exit 1; }

new_users=$(q "$NEW_DB_URL" "select count(*) from auth.users")
new_level=$(q "$NEW_DB_URL" "select coalesce(max(version), 'none') from supabase_migrations.schema_migrations" 2>/dev/null || echo none)
new_tables=$(q "$NEW_DB_URL" "select count(*) from information_schema.tables where table_schema = 'public'")
say "- GFD Prod now: $new_users accounts, $new_tables public tables, newest migration: $new_level"
if [[ $new_users != 0 ]]; then
  echo "::error::GFD Prod already has $new_users accounts. The move only runs into an empty project, so nothing is overwritten."; exit 1
fi
if [[ $new_level != none && $new_level > $OLD_LEVEL ]]; then
  echo "::error::GFD Prod already has migrations newer than the old project ($new_level). Reset it (Database > Settings > reset, or a new project), then run again."; exit 1
fi
if [[ $new_level == none && $new_tables != 0 ]]; then
  echo "::error::GFD Prod has $new_tables public tables but no migration history: something was created by hand. Empty it first."; exit 1
fi

q "$OLD_DB_URL" "$COUNTS" > "$WORK/old_counts.txt"
say "- Old project rows (table, rows):"
say '```'; while read -r l; do say "$l"; done < "$WORK/old_counts.txt"; say '```'

mapfile -t STAGE < <(cd "$ROOT/supabase/migrations" && ls *.sql | awk -v lvl="$OLD_LEVEL" '{v=substr($0,1,14)} v<=lvl')
mapfile -t LATER < <(cd "$FINAL_DIR/supabase/migrations" && ls *.sql | awk -v lvl="$OLD_LEVEL" '{v=substr($0,1,14)} v>lvl')
say "- Step A: ${#STAGE[@]} migrations up to $OLD_LEVEL (what the old project has)"
say "- Step B: copy accounts, tables and storage files"
say "- Step C: ${#LATER[@]} newer migrations from $(basename "$FINAL_DIR"): ${LATER[*]:-none}"

if [[ $MODE == check ]]; then
  say ""; say "Check only: nothing was changed. Run again with mode = apply to move."
  exit 0
fi

# ---------- 2. step A: the schema the old data fits ----------
mkdir -p "$WORK/stage"
cp -r "$ROOT/supabase" "$WORK/stage/"   # config.toml needs templates/ beside it
rm -rf "$WORK/stage/supabase/migrations" && mkdir "$WORK/stage/supabase/migrations"
for f in "${STAGE[@]}"; do cp "$ROOT/supabase/migrations/$f" "$WORK/stage/supabase/migrations/"; done
supabase db push --workdir "$WORK/stage" --remote="$NEW_DB_URL" --yes

# ---------- 3. step B: data ----------
# Plain INSERTs with column names, so the new project's column order doesn't matter; rows a migration already
# created (tier_features) are skipped. Generated columns are left out by pg_dump.
pg pg_dump "$OLD_DB_URL" --data-only --column-inserts --rows-per-insert=200 --on-conflict-do-nothing \
  --no-owner --no-privileges -t auth.users -t auth.identities -t 'public.*' -t 'private.*' -f /work/data.sql
# replica: no triggers fire (new-account trigger, updated_at stamps, foreign-key order), as in Supabase's own guide.
# The salt for the one-trial-per-person hashes must be the old one, or the trial ledger stops matching.
pg psql "$NEW_DB_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction \
  -c "set session_replication_role = replica" \
  -c "delete from private.app_secrets" \
  -f /work/data.sql >/dev/null
rm -f "$WORK/data.sql"
say "- Data copied"

# storage files: through the Storage API (the rows alone would point at files that aren't there)
# new secret keys (sb_secret_...) go in apikey only; old JWT service keys also as the bearer token
auth_args() { local -n _a=$1; _a=(-H "apikey: $2"); if [[ $2 == eyJ* ]]; then _a+=(-H "Authorization: Bearer $2"); fi; }
auth_args OLDH "$OLD_SERVICE_KEY"
auth_args NEWH "$NEW_SERVICE_KEY"
enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1"; }
q "$OLD_DB_URL" "select id||'|'||public::text from storage.buckets order by id" > "$WORK/buckets.txt"
while IFS='|' read -r b pub; do
  [[ -z $b ]] && continue
  if [[ $(q "$NEW_DB_URL" "select count(*) from storage.buckets where id = '$b'") == 0 ]]; then
    curl -fsS -X POST "$NEW_SUPABASE_URL/storage/v1/bucket" "${NEWH[@]}" \
      -H 'Content-Type: application/json' --data "{\"id\":\"$b\",\"name\":\"$b\",\"public\":$pub}" >/dev/null
    say "- Made bucket $b"
  fi
done < "$WORK/buckets.txt"
q "$OLD_DB_URL" "select bucket_id||'|'||coalesce(metadata->>'mimetype','application/octet-stream')||'|'||name from storage.objects order by 1" > "$WORK/objects.txt"
n=0
while IFS='|' read -r b mime name; do
  [[ -z $b ]] && continue
  path="$b/$(enc "$name" | sed 's#%2F#/#g')"
  curl -fsS -o "$WORK/obj" "${OLDH[@]}" "$OLD_SUPABASE_URL/storage/v1/object/$path"
  curl -fsS -o /dev/null -X POST "${NEWH[@]}" -H "x-upsert: true" -H "Content-Type: $mime" \
    --data-binary "@$WORK/obj" "$NEW_SUPABASE_URL/storage/v1/object/$path"
  n=$((n+1))
done < "$WORK/objects.txt"
rm -f "$WORK/obj"
say "- Storage files copied: $n"

# ---------- 4. compare ----------
q "$NEW_DB_URL" "$COUNTS" > "$WORK/new_counts.txt"
bad=0
while read -r t c; do
  nc=$(awk -v t="$t" '$1==t {print $2}' "$WORK/new_counts.txt")
  if [[ $nc != "$c" ]]; then echo "::error::$t: old $c rows, GFD Prod ${nc:-missing}"; bad=1; fi
done < "$WORK/old_counts.txt"
[[ $bad == 0 ]] || { echo "::error::Row counts differ: stop here and look before going on."; exit 1; }
say "- Row counts match for every table"

# ---------- 5. step C: the newer migrations ----------
supabase db push --workdir "$FINAL_DIR" --remote="$NEW_DB_URL" --yes
say "- Newest migration on GFD Prod: $(q "$NEW_DB_URL" "select max(version) from supabase_migrations.schema_migrations")"
say ""
say "Done. Next: point the live site at GFD Prod (deploy/supabase.json) and push the sign-in settings (docs/db-brief.md)."
