# Exercise library research spec

You are one of ~11 parallel researchers building a ~1000-exercise library for a workout-tracker app
(Expo/React Native + web). Each researcher owns one slice (given in your prompt). Stay inside your slice
so slices don't duplicate each other; if a move clearly belongs to another slice, skip it.

## Output
Write ONE file: a JSON array of exercise objects, to the path given in your prompt. Valid JSON only (no comments,
no trailing commas). Validate it with `python3 -c "import json;print(len(json.load(open('PATH'))))"` before finishing.
Write in batches if needed (e.g. build a Python list in a script file and dump it), but the final file must be one array.

## Object fields (all required unless marked optional)
```json
{
  "id": "goblet",                       // lowercase a-z0-9 only, short, unique. REUSE the id from existing_ids.tsv when the exercise is the same move.
  "name": "Goblet squat",               // sentence case, the common gym name
  "aliases": ["Kettlebell goblet squat"],// other names people search for ([] if none)
  "training_type": "Strength",          // ONE of: Strength, Calisthenics, Core, Cardio, Plyometric, Power, Mobility, Stretching, Yoga, Pilates, Balance, Recovery, Combat, Strongman
  "tags": ["Strength","Legs"],          // ALL categories it fits: any extra training types plus goals e.g. "Hypertrophy","Endurance","Rehab","Warm-up","Home-friendly","Unilateral","Compound","Isolation"
  "muscle_group": "Legs",               // app's primary bucket, ONE of: Chest, Back, Shoulders, Arms, Legs, Glutes, Core, Cardio, Mobility
  "primary_muscles": ["Quadriceps","Glutes"],
  "secondary_muscles": ["Adductors","Core"],
  "movement_pattern": "Squat",          // ONE of: Squat, Hinge, Lunge, Horizontal push, Vertical push, Horizontal pull, Vertical pull, Carry, Rotation, Anti-rotation, Anti-extension, Anti-lateral flexion, Flexion, Extension, Isolation, Locomotion, Jump, Throw, Hold, Mobility, Stretch, Gait
  "equipment": ["Dumbbell"],            // human-readable list of what you need ([] = none)
  "req": "dumbbells|kettlebells",       // app gear ids from gear_ids.tsv. comma = all needed, | = any one of. "" = no equipment needed (bodyweight on the floor). Use ONLY ids that exist in gear_ids.tsv. If the needed kit has no id, use the nearest id and mention it in notes.
  "equipment_tier": 1,                  // 0 = none (bodyweight/floor/wall/chair/towel), 1 = minimal home (bands, mat, jump rope, pull-up bar, dumbbells, kettlebell, foam roller), 2 = home gym (barbell, rack, bench, EZ bar, Smith, cable crossover, lat pulldown, treadmill, bike, rower, TRX, rings), 3 = full commercial gym (selectorized/plate-loaded machines, sleds, GHD, reformer, ski erg, stair climber, etc.)
  "difficulty": "Beginner",             // ONE of: Beginner, Intermediate, Advanced
  "tracking": "w",                      // app measure: w (kg + reps), bw (added kg + reps, bodyweight moves), cardio (km + min), time (min), hold (sec), count (reps only)
  "unilateral": false,
  "sets": 3,                            // sensible default
  "reps": "10–12",                      // string; use "30 sec", "20 min", "8 / side", "max" etc. Use an en dash for ranges.
  "form_cues": ["...", "...", "..."],   // 3 short, plain-English cues, coach voice, imperative. Max ~14 words each.
  "common_mistakes": ["...", "..."],    // 2–3
  "regressions": ["Box squat"],         // easier variations by name (0–3)
  "progressions": ["Front squat"],      // harder variations by name (0–3)
  "safety": "Keep heels down; stop if knees hurt.",  // one sentence; contraindications/spotting/setup
  "video": null,                        // ONLY a URL you actually fetched and confirmed shows this exercise (e.g. ExRx, ACE, NASM, reputable YouTube). Otherwise null. Do not guess URLs.
  "notes": ""                           // optional extra useful info: variations, tempo, what it's good for, home substitutes
}
```

## Rules
- Variations that train differently (grip, angle, implement, stance) get their OWN entry (e.g. incline vs flat DB press, sumo vs conventional deadlift). Trivial variations (tempo only) go in notes.
- Order your array from no equipment → minimal → home gym → commercial within your slice.
- Accuracy over volume: real, recognized exercises only. No invented names. Hit your target count but never pad with junk.
- Use web search/fetch to check anything you're unsure about (names, muscles, cues for unfamiliar moves). You don't need to cite every entry.
- Plain, friendly English (the app is for everyday gym-goers). Metric units.
- Reference files in the same folder: `existing_ids.tsv` (id, name, muscle group already in the app — reuse ids for same moves), `gear_ids.tsv` (allowed gear ids).
