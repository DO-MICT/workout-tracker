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

## Fields the app's swaps depend on (since F4, Nov 2026)

Swaps (`GFDRules.rankSwaps` in `src/js/rules.js`) rank by `movement_pattern` first, then the first of
`primary_muscles`, `training_type`, `tracking`, `unilateral`, then `difficulty` against the user's level.
Keep `movement_pattern` to the existing 22 values (Hinge, Squat, Lunge, Horizontal push, Isolation ...);
a new spelling of an old pattern splits swaps. "Isolation", "Stretch" and "Mobility" only count as the same
movement when the main muscle matches too. Gear ids `calisthenics`, `yogamat`, `towel`, `wall` and `openspace` count
as always available (floor, towel, wall or open space stands in), so moves needing only those show at every location.

## Launch gear trim (15 Nov 2026)

Deon cut the 441-item gear list to the 90 common gym items for launch (`data/gear-library/launch-trim.json`: `keep`, the
`floor` ids, `req_map` swaps for merged duplicates, `renames`, the 92 exercises hidden and the 59 whose gear changed).
Nothing was deleted: migration `20261115000023_launch_gear_trim` sets `active = false` (the app only loads active rows)
and its rollback sets them back. The seed files never touch `active`, so a re-seed does not bring them back.
Calisthenics, Towel, Wall and Open floor space are out of the gear list but stay valid in `req` (`FLOOR` in `rules.js`).
After running `merge.py` again, run `cd data/gear-library && python3 tools/apply_launch_trim.py` to put the trim back
on the rebuilt files. To bring an item back, add it to `keep` there, add a migration that sets it active, and rebuild.
Saved gear lists that still name a merged item (Pilates mat, Roman chair, half rack, plate-loaded incline press, squat
stands) count as the kept one (`GEAR_NOW` in `rules.js`).
