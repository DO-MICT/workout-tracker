# Gear library

441 pieces of training equipment, from no equipment and household stand-ins up to a full commercial gym,
linked to the 1,032-exercise library in `data/exercise-library/` (PR #2).
The app reads them from the Supabase `gear` table (loaded with `gear.sql`, which also sets the exact `req` for the 41 exercises below); these files are the source.
Rebuild the SQL: `cd data/gear-library && python3 tools/to_sql.py`.

| File | What it is |
| --- | --- |
| `gear.json` | Full records: `{ version, count, categories, items: [...] }` |
| `gear.csv` | Same records, one row each; lists joined with `; `, footprint as `LxWxH` cm |
| `app-equip.json` | App-ready groups in the same shape as `EQUIP` in `src/js/equipment.js`: `[{g, items: [[id, name, keywords]]}]` |
| `exercise-req-updates.json` | Exact `req` values for 41 exercises that used the nearest gear id because the real kit had no id |
| `sources/*.json` | Raw research, one file per slice |
| `tools/merge.py` | Rebuilds the outputs from `sources/` (validates, de-duplicates, links exercises) |

Rebuild (needs the exercise library from PR #2):
`cd data/gear-library && python3 tools/merge.py . ../exercise-library/exercises.json`

## Keeping the app working

- All 90 gear ids already in `EQUIP` keep their id, name, group and search words (`in_app: true`), so saved gear lists still match.
- In `app-equip.json` every existing group starts with its existing items in their existing order; new items follow, and six new groups are added at the end
  (Strongman, Combat, Conditioning & agility, Attachments, Lifting accessories, Outdoor & everyday).
- The kit the exercise library was missing now has ids: `agilityladder`, `cones`, `hurdles`, `pole`, `yoke`, `log`, `tyre`, `atlasstone`, `pool`, `ssb`,
  `versaclimber`, `pulloverm`, `vsquat`, `parachute`, `speedbag`, `ube` and more. `exercise-req-updates.json` lists the exercise `req` changes to make once these ids go into `EQUIP`.

## Fields

- `id`, `name`, `aliases`, `keywords` (search words for the app).
- `category` / `subcategory`: 40 readable categories such as Bars, Leg machines, Cable attachments, Strongman, Pilates.
- `app_group`: the Equipment screen group.
- `tier`: 0 none or household, 1 minimal home kit, 2 home gym, 3 commercial gym (same scale as the exercise library). `setting`: home, commercial or both.
- `description`, `muscle_focus`, `loading` (Plate loaded, Selectorised stack, Band / elastic, Bodyweight and so on), `weight_options`, `adjustability`.
- `footprint` (typical length, width and height in cm, or `null` for small items), `space` (S drawer, M corner, L dedicated area, XL commercial floor), `price_band` ($ under 50 USD, $$ 50–300, $$$ 300–1,500, $$$$ over 1,500).
- `requires`: other gear ids it needs (a barbell needs plates). `substitutes`: gear ids that can stand in for it.
- `signature_exercises`: readable examples. `exercise_ids` / `exercise_count`: library exercises it is used for, from each exercise's `req`, the researched links and the proposed req updates. Every no-equipment exercise links to `calisthenics`.
- `buying_tips`, `safety`.

## Caveats

- Researched from expert knowledge by six parallel passes, not checked item by item against retailers. Prices, weights and sizes are typical ranges, not quotes.
- Some specialist kit (Conan's wheel, focus mitts, Cadillac and others) has no exercises in the library yet, so `exercise_count` is 0.
- General-purpose cable units link to every cable exercise they can do, so those lists are long.
