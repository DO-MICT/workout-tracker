# Workout tracker

A mobile-first workout planner and logger. MVP running as a single web page, with
Supabase for accounts and sync. Live at **https://do-mict.github.io/workout-tracker/**.

## What it does
- Workout plans (5-day split, Bro split, Full body 3-day + cardio, or build your own with a guided setup)
- Cole’s Sessions: a random session from the gear at a chosen location (full body, upper, lower, core or cardio; you pick how many exercises and sets)
- Per-set logging with PR hints, rest timer with a race-start countdown, supersets and circuits
- Workout history: every completed workout (date, plan, day, location, duration, every set), per-exercise progress chart, delete a workout
- Equipment per location (gym, home, …); each plan day has a location and is checked against its gear, with swap suggestions
- Profile with measurements, injury notes per exercise, light/dark mode
- Email + password accounts (Supabase); data syncs per user, newest save wins
- Suggestions page (web version): testers send an idea or problem with an optional screenshot
- Feedback page (admins only): every suggestion with sender, context and screenshot; set the status and reply in the app (testers see replies, with a dot on the menu for new ones)

## Files
| Path | What it is |
|---|---|
| `app.html` | Page shell: head, the HTML body and the `<script>` list. Rarely needs editing. |
| `src/styles.css` | All the styling. |
| `src/js/*.js` | The app code, one file per area (see below). Plain scripts that share one global scope, loaded in the order listed in `app.html`. |
| `index.html` | Built from `app.html` for GitHub Pages. Don't edit by hand. |
| `tools/build_pages.py` | Builds `index.html` (adds web title, home-screen install tags, icons). |
| `manifest.webmanifest`, `icons/` | "Add to Home Screen" support. |
| `vendor/supabase.js` | Supabase JS client v2.45.4 (MIT), served from this repo so there's no CDN dependency. |
| `supabase/migrations/` | Database schema applied to the Supabase project. |
| `docs/context.md` | Project context for planning sessions. |

## Making changes
1. Edit the file for that area in `src/js/` (or `src/styles.css`).
2. Run `python3 tools/build_pages.py`.
3. Commit and push to `main`. GitHub Pages updates within a few minutes.

## Supabase
- Project: `Workout tracker` (`zdllpjrkwcdmcuizxuum`, eu-west-3), free plan.
- Tables: `profiles` (name, email, tier), `user_state` (the app's data as JSON) `suggestions` (tester feedback), and `workouts` + `workout_sets` (history; saved through the `save_workout` function in one transaction, with ids made on the phone so retries never duplicate). Row level security: each user can only read and write their own rows; tier and suggestion status can't be changed from the app.
- Storage: private `suggestions` bucket for screenshots (images only, 5 MB max, one folder per user).
- Admins: `profiles.is_admin`. Admins see Menu → Feedback in the app. Add one in the SQL editor: `update public.profiles set is_admin = true where email = '…';`
- Reading suggestions without the app: Table Editor → `suggestions` (set `status` to seen / planned / done / wont_do; testers see it update). Screenshots: Storage → `suggestions`, path in `screenshot_path`.
- The key in `app.html` is the **publishable** key, which is meant to be public. Never put a secret/service key in this repo.
- Auth settings to check in the dashboard (Authentication): Site URL = `https://do-mict.github.io/workout-tracker/`, add it to Redirect URLs, and decide whether email confirmation is on.

## Code layout (`src/js/`, in load order)
| File | Covers |
|---|---|
| `diagrams.js` | Stick-figure exercise diagrams |
| `library.js` | Built-in program and the exercise library |
| `state.js` | App state, load/save |
| `day.js` | Day view rendering and its tap/click events |
| `plans.js` | Plan data, plan switcher, Workout plans page, guided plan setup |
| `onboarding.js` | Register + first-run setup |
| `signin.js` | Web mode: Supabase sign-in and sync |
| `history.js` | Saving and reading workout history, History page, per-exercise progress |
| `feedback.js` | Suggestions page and the admin Feedback page |
| `backup.js` | Copy out / restore all data |
| `coles.js` | Cole’s Sessions |
| `builder.js` | Injury notes and the workout builder |
| `equipment.js` | Equipment and locations |
| `profile.js` | Profile measurements, account and subscription placeholders |
| `finish.js` | Well-done popup, on-screen keyboard, rest timer |
| `main.js` | Startup (runs last) |

New files must be added to the `<script>` list in `app.html` in the right place. Earlier files can't run code at load time that needs a later file.
