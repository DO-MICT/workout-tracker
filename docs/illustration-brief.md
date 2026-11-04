# Exercise illustration brief

Read this instead of the history of the illustration threads. The style is decided; new work adds poses, not new drawing code.

## New illustrations: use the generator (since 2 Nov 2026)

New exercise art is no longer written as `EX` entries by hand. It is made from short specs with the spec → SVG
generator in the project files, `illustrations/generator/` (its `README.md` has the commands, coordinates and spec format).
Before presenting art to Deon, follow `illustrations/reference/ILLUSTRATION-CHECKLIST.md`; the generator's build
runs the motion, equipment and flicker checks.

Approved generator art reaches the live app like this:

- `src/js/gfd-exercise-art-gym.js` (`GFDArtGym`, lazy-loaded) is **generated**, never edited by hand:
  `node tools/build_gym_art.js <generator dir> specs/<approved batch>.js ...` (list every approved spec file each time).
- `ART_GYM` in `src/js/exart.js` is the allow-list: only the ids listed there show generator art.
- Don't replace `src/js/gfd-exercise-art.js`; the 5-day split below still draws from it.

The rest of this brief describes that original engine, which still holds the 5-day split (30 exercises).

## Where it lives

- `src/js/gfd-exercise-art.js`: the whole engine plus the exercise entries (`EX`) and the 5-day split (`DAYS`).
  `render(id, theme, t, { view, cues, simple, transparent })` returns an SVG string. `t` 0 = setup position, 1 = other end of the rep.
- `src/js/exart.js`: shows them in the app (12 in-between frames, loops start → end → start, tap to pause, redraws on theme change).
  Exercises without an `EX` entry fall back to the old stick figure in `diagrams.js`.
- `tools/render_art.js`: checks entries and writes a contact sheet. See **Workflow**.

## Style (fixed, do not change without asking Deon)

- One posable, genderless, realistically proportioned figure, 1 head = 38 units. "Ghost glow" look.
- Level 1 detail: fingers and toes, no ears, no face. Solid body: each layer is one fill with only its outer outline, no seams.
- Worked muscles glow in volt (`#D4FF3A`): primary solid, secondary lighter. Equipment is flat grey tint shapes, never coloured.
- Light and dark themes come from `THEMES`; never hard-code colours in an entry.
- Floor at y = 250, standing ankle height `STAND` = 238. Side view is the default teaching view; use `view: 'front'` or `'back'`
  (or `views: [start, end]`) only when the arms move out to the side.

## Adding an exercise

Add one entry to `EX`, keyed by the app's exercise id (the same id as in `src/js/library.js` / the exercise library):

```js
// the real entry, laid out with comments
lateral: {
  name: 'Dumbbell lateral raise', view: 'front',
  muscles: { primary: ['sdelt'], secondary: ['traps', 'fdelt'] },          // keys of MUSCLES only
  pose: t => ({ ...standLegs(), torsoA: -90, legZ: [12, 12, 12],
    ik: sideArc(lerp(12, 84, t), 10, lerp(-.3, 0, t)) }),                     // hands swing out from 12° to 84°
  props: R => [floor(0, 0), ...dumbbell(R.near.H, 'x'), ...dumbbell(R.far.H, 'x')],
  cues: { front: [['H', [0, 0]]], top: [] },                                 // dashed motion path for a joint, with an offset
  frames: ['Arms down, dumbbells by your thighs', 'Raised out to shoulder height']   // start and end captions
},
```

- **pose(t)**: `hip`, `torsoA` (degrees, -90 = upright), legs via `standLegs()`, `legTo(hip, ankle, pref)` or `LIE` (flat on a bench),
  arms via `ik: { target, z, pole }` (or `upperA` / `foreA`), helpers `sideArc`, `flatArc`, `crossed`, `barPath`. `t` is already eased.
- **props(R)**: build from `floor`, `box`, `slab`, `rod`, `disc`, `cable`, `handle`, `barbell`, `dumbbell`, `benchProps`, `tower`.
  Attach weights to `R.near.H` / `R.far.H` so they follow the hands. Tall frames get `{ fit: false }` so they don't shrink the figure.
- Copy the closest existing entry and change it. Muscles available: pec, abs, obliques, glutes, erector, lats, upperback, traps,
  fdelt, sdelt, rdelt, biceps, triceps, forearm, quads, hipflex, hams, calves, tibialis.
- New movement families (floor work for pilates/yoga, kneeling, hanging) may need one new shared helper, like `LIE`, near the others.
  Add the helper once, then reuse it; don't write one-off geometry inside each entry.

## Workflow (keeps sessions small)

1. One session per batch of **about 6–10 exercises** of the same family (one day, or one group like "mat pilates").
   Start a new session for the next batch; this brief carries the context.
2. Write all the entries in the batch, then run `node tools/render_art.js <ids...>`. It prints one line per exercise and fails on bad muscles,
   missing captions, render errors or NaN coordinates. Fix those from the text output alone.
3. Open `art-preview/index.html` **once per batch** (one screenshot shows start, middle and end of every exercise, both themes).
   Fix what looks wrong, re-run, look once more. Avoid per-exercise screenshot loops in the app.
4. Before committing: `node tools/render_art.js --check` (all exercises) and `node --check src/js/gfd-exercise-art.js`.
   If `app.html` changed, run `python3 tools/build_pages.py`.

Batch art work does not need the biggest model: once the style is settled, Sonnet is fine for adding entries.
