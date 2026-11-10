# GFD · Get Fit Daily

Workout planner and logger: a web app (`app.html` + `src/`, live on GitHub Pages) on the Supabase project in `supabase/migrations/`.
The web app is the source of truth; the earlier Expo app (`mobile/`) was removed in Nov 2026. Background and next steps: `docs/context.md`.

## Read the brief for the area you're working in, not old threads

- Exercise illustrations: `docs/illustration-brief.md` (style, how to add a pose, batch workflow, `tools/render_art.js`)
- Exercise and gear libraries: `docs/data-brief.md` (edit `sources/`, rebuild with the scripts, don't regenerate)
- Android app (Capacitor shell, `platform.js`, Play releases): `docs/android-brief.md`; store text: `docs/store-listing.md`
- Database changes: `docs/db-brief.md` (migrations + rollbacks, db-check CI, staging, deploy workflow)
- Domain, privacy policy, terms and sign-in emails: `docs/site-brief.md` (edit `site.json` and `site/`, never the built pages)

## Rules

- `index.html` is built from `app.html`, and `privacy.html`, `terms.html` and `supabase/templates/` from `site/` + `site.json`:
  run `python3 tools/build_pages.py` after changing any of them (CI fails otherwise).
- Native features (notifications, files, back button, deep links) go through `src/js/platform.js` only; never call Capacitor elsewhere.
- `sw.js` gives the live site offline support (network first, so no cache bump is needed). Add any new `src/js` file to its `SHELL` list.
- Database: add a new migration with a rollback in `supabase/rollbacks/`; never edit one already on `main`. Add a case to
  `tests/db/rls-two-user.test.mjs` for each new table. GitHub Actions deploys it (staging, then production on Deon's approval).
- Keep exercise and gear ids stable; saved plans, history and gear lists point at them.
- On Windows, set `PYTHONUTF8=1` before running the Python tools.
- Don't read the large generated files whole (`data/**/exercises.json`, `gear.json`, `*.sql`, `src/js/gfd-exercise-art.js`).
  Grep or query them for the part you need.
- Work in batches with a clear end (about 6–10 illustrations or 20–40 library entries per session). When a batch is done,
  update the relevant brief if something new was decided, and start a new session for the next batch.
- Plain, friendly English in the app; metric units.
