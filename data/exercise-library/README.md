# Exercise library

1,032 exercises grouped by training type, from no equipment up to a full commercial gym.
Nothing in the app reads these files yet; they are the data for growing the in-app library.

| File | What it is |
| --- | --- |
| `exercises.json` | Full records: `{ version, count, exercises: [...] }` |
| `exercises.csv` | Same records, one row each; list fields are joined with `; ` |
| `app-extra.json` | App-ready tuples in the same shape as `EXTRA` in `src/js/library.js`: `[id, name, muscle group, req, diagram, sets, reps, measure, cues]` |
| `sources/*.json` | Raw research, one file per slice |
| `tools/merge.py` | Rebuilds the three outputs from `sources/` (dedupes, validates, sorts) |

Rebuild: `cd data/exercise-library && python3 tools/merge.py tools .`

## Fields

- `id`: stable id. All 152 exercises already in the app keep their ids (`in_app: true`), so plans and history still match.
- `training_type`: one of Strength, Calisthenics, Core, Balance, Power, Plyometric, Strongman, Cardio, Combat, Mobility, Stretching, Recovery, Yoga, Pilates.
- `tags`: every other category the exercise fits (extra training types, goals such as Hypertrophy or Rehab, Home-friendly, Unilateral, Compound or Isolation).
- `muscle_group`: the app's bucket (`MGS`). `primary_muscles` and `secondary_muscles` are more detailed.
- `movement_pattern`: Squat, Hinge, Lunge, Horizontal/Vertical push and pull, Carry, Rotation, Anti-rotation, and so on.
- `equipment`: readable list. `req`: app gear ids from `EQUIP` (comma = all of, `|` = any of, empty = no equipment).
- `equipment_tier`: 0 none, 1 minimal home kit, 2 home gym, 3 commercial gym.
- `difficulty`: Beginner, Intermediate or Advanced.
- `tracking`: the app's measure (`w`, `bw`, `cardio`, `time`, `hold`, `count`). `sets` and `reps` are sensible defaults.
- `form_cues`, `common_mistakes`, `regressions`, `progressions`, `safety`, `notes`.
- `video`: a checked demo link, or `null`. None are filled yet. `video_search` is a YouTube search link that always works.
- `diagram`: the app's diagram key when one exists, otherwise empty.

## Caveats

- Researched from expert knowledge, not checked line by line against outside sources. Worth a skim before shipping.
- Some kit has no gear id yet (agility ladder and cones, pole, yoke, log, tyre, atlas stone, swimming pool, safety squat bar, VersaClimber, pullover and V-squat machines). Those entries use the nearest id and say so in `notes`. Adding the ids to `EQUIP` would make filtering exact.
