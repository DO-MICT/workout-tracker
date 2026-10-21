# Workout tracker

A mobile-first workout planner and logger. MVP running as a single web page, with
Supabase for accounts and sync. Live at **https://do-mict.github.io/workout-tracker/**.

## What it does
- Workout plans (5-day split, Bro split, Full body 3-day + cardio, or build your own with a guided setup)
- Per-set logging with PR hints, rest timer with a race-start countdown, supersets and circuits
- Equipment per location (gym, home, …); each plan day has a location and is checked against its gear, with swap suggestions
- Profile with measurements, injury notes per exercise, light/dark mode
- Email + password accounts (Supabase); data syncs per user, newest save wins

## Files
| Path | What it is |
|---|---|
| `app.html` | **The single source.** Same file runs inside Claude (Claude storage) and on the web (Supabase). |
| `index.html` | Built from `app.html` for GitHub Pages. Don't edit by hand. |
| `tools/build_pages.py` | Builds `index.html` (adds web title, home-screen install tags, icons). |
| `manifest.webmanifest`, `icons/` | "Add to Home Screen" support. |
| `vendor/supabase.js` | Supabase JS client v2.45.4 (MIT), served from this repo so there's no CDN dependency. |
| `supabase/migrations/` | Database schema applied to the Supabase project. |
| `docs/context.md` | Project context for planning sessions. |

## Making changes
1. Edit `app.html`.
2. Run `python3 tools/build_pages.py`.
3. Commit and push to `main`. GitHub Pages updates within a few minutes.

## Supabase
- Project: `Workout tracker` (`zdllpjrkwcdmcuizxuum`, eu-west-3), free plan.
- Tables: `profiles` (name, email, tier) and `user_state` (the app's data as JSON). Row level security: each user can only read and write their own rows; tier can't be changed from the app.
- The key in `app.html` is the **publishable** key, which is meant to be public. Never put a secret/service key in this repo.
- Auth settings to check in the dashboard (Authentication): Site URL = `https://do-mict.github.io/workout-tracker/`, add it to Redirect URLs, and decide whether email confirmation is on.
