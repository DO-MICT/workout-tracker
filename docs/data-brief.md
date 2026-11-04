# Exercise and gear library brief

Read this instead of the history of the research threads. Both libraries already exist and rebuild from scripts;
new work edits the source slices and re-runs them. Don't re-research or regenerate what's there.

| Library | Source of truth | Outputs | Loaded into |
| --- | --- | --- | --- |
| 1,032 exercises | `data/exercise-library/sources/*.json` | `exercises.json`, `.csv`, `app-extra.json`, `exercises.sql` | Supabase `exercises` |
| 441 gear items | `data/gear-library/sources/*.json` | `gear.json`, `.csv`, `app-equip.json`, `exercise-req-updates.json`, `gear.sql` | Supabase `gear` |

Field definitions: `data/exercise-library/README.md`, `data/exercise-library/tools/SPEC.md`, `data/gear-library/README.md`.
Gear ids allowed in an exercise's `req`: `data/exercise-library/tools/gear_ids.tsv`.

## Adding or fixing entries

1. Edit the right slice in `sources/` (one object per exercise or gear item). Reuse ids; never rename an `in_app` id,
   because saved plans, history and gear lists point at them.
2. Rebuild (on Windows set `PYTHONUTF8=1` first, or the scripts write cp1252 and garble every en dash):
   ```bash
   export PYTHONUTF8=1
   cd data/exercise-library && python tools/merge.py tools . && python tools/to_sql.py && cd ../..
   cd data/gear-library && python tools/merge.py . ../exercise-library/exercises.json && python tools/to_sql.py && cd ../..
   ```
3. Check `git diff --stat`: only the entries you touched should change. `merge.py` prints counts and writes
   `tools/merge_report.json` (warnings, dropped duplicates); read that, then delete it.
4. Apply to Supabase by running the changed `.sql` file in the SQL editor (or a migration for schema changes).

## Keeping sessions small

- Never paste or read the big outputs whole (`exercises.json` is 1.3 MB, `gear.json` 0.6 MB). Query them:
  `python -c "import json;d=json.load(open('data/gear-library/gear.json',encoding='utf-8'));print([i['id'] for i in d['items'] if i['tier']==3][:20])"`
- Add entries in batches of about 20–40 per session, one slice at a time, written straight into the slice file with a short script.
- Research with subagents that each write one slice file (that's how SPEC.md was used); the main session only merges and checks.

## Known quirk (as of 2026-10-27)

`exercises.json` on main already has the 41 `exercise-req-updates.json` changes applied. Re-running the gear merge
therefore sees them as already done and drops 18 stale gear → exercise links (for example `sealrow` from `flatbench`).
That output is more correct, but commit it on purpose as its own change, not mixed into something else.
