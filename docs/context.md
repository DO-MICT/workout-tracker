# Workout tracker — project context

Hand this to a planning or build session so it starts from what actually exists.

## Who
Deon (South Africa, West Coast). Has coded before, mainly JavaScript/Java on ServiceNow. No Mac; uses an iPhone. Trains 5 days a week with a partner in a gym (build muscle, lose weight).

## Goal
Publish to the Apple App Store and Google Play with a subscription model:
- **Free** — basic access (no ads; ads dropped from the release)
- **Pro** — full access, price TBC
- **Tester** — full access while testing

The server decides the tier (WP1, Nov 2026): `entitlements` + `my_access`, read by `src/js/access.js` (`can('stats.full')`). New accounts get a 14-day Pro trial. Free vs Pro gating (WP14): see `docs/db-brief.md` → Free and Pro.

## Where it stands (October 2026)
- **MVP web app** — one HTML file (`app.html`), mobile-first, no build tooling.
  - Runs inside Claude (Deon's private copy, Claude storage) and on **GitHub Pages** (`https://do-mict.github.io/workout-tracker/`) where it uses Supabase.
  - Mode is picked automatically: no `window.claude` → web mode (Supabase sign-in + sync).
- **Backend — Supabase** project `Workout tracker` (`zdllpjrkwcdmcuizxuum`, eu-west-3, free plan).
  - `profiles`: id, email, display_name, tier + tier_source (deprecated since WP1, not read by the app).
  - `entitlements`: one row per user per source (trial, play, web, lifetime, couple, promo, admin) with tier (free|pro|tester|coach), expires_at, status, will_renew. Users read their own; nobody writes from the app. Written by the sign-up trigger (14-day trial, one per email via a salted hash in `private.trial_ledger`), `admin_grant(email, tier, source, days)` / `admin_revoke(email, source)` (admins, or the SQL editor), and later the billing webhook. `tier_features` lists each tier's feature keys; the view `my_access` returns the best active tier.
  - `user_state`: user_id, data (jsonb — the whole app state), client_ts, schema_version.
  - `suggestions`: user_id, kind (idea|bug|other), message, screenshot_path, context (plan, day, version, device), status (new|seen|planned|done|wont_do), admin_reply + replied_at (server-stamped). Screenshots in private bucket `suggestions/<user_id>/…`.
  - `workouts` (one row per completed workout: performed_at, started_at, duration, plan/day/location ids **and names as snapshots**, set_count, volume_kg, source app|import) and `workout_sets` (exercise id/name/muscle group, exercise_order, set_no, measure w|bw|cardio|time|hold|count, weight, reps, done, superset tag; user_id + performed_at copied in for fast per-exercise progress). Written only via `save_workout(jsonb)`: one transaction, idempotent on the device-generated uuid. Users read/insert/delete their own rows; no updates yet.
  - `profiles.is_admin` + `private.is_admin()`: admins read all suggestions, profiles and screenshots and can update suggestion status only.
  - Trigger creates profile + user_state rows on sign-up. RLS: own rows only; users may update only `display_name` on profiles.
  - Migrations in `supabase/migrations/`, checked by the `db-check` workflow and applied by `db-deploy` (GFD Dev from the `dev` branch, GFD Prod from `main` on approval). Hosting moved to Coolify (getfitdaily.co.za = main + GFD Prod, dev.getfitdaily.co.za = dev + GFD Dev) in Nov 2026. See `docs/db-brief.md`.
- **Repo** `DO-MICT/workout-tracker` (public, required for free GitHub Pages).

## Features in the MVP
- Plans: 5-day split, Bro split, Full body 3-day + cardio (Tue/Thu treadmill), custom plans via a 6-step guided setup (days Mon–Sun → exercises per day → rest → name → review → save). Every plan editable; built-ins keep only the differences and can be reset.
- **Cole’s Sessions** (built-in plan `coles`): pick location, focus (full/upper/lower/core/cardio), exercise count (2–12) and sets (1–6); builds a balanced random session from that location’s gear, main lifts first per muscle group; swap any exercise for another of the same group; stored in `coles` (opts + today’s session).
- Title is a plan switcher; the day is one button with the full day name that opens a day picker (today marked). Workout plans page (use, edit, duplicate, rename, delete, reset).
- ~150-exercise library with muscle group, required gear, default sets/reps, cues and stick-figure diagrams.
- Equipment: ~90 items in 9 groups, searchable; **locations** each with their own gear; each plan day has a location and shows whether its gear is sufficient, with same-muscle swap suggestions.
- **Well-done popup** after Complete workout: random cheer (PR-specific when a PR is beaten), time, sets, exercises, kg lifted, new PRs (with the old value) and exercises up on last time; buttons See in History / Done.
- **History**: every Complete workout is saved as a record (outbox `S.wout` → `save_workout`, retried when back online; on-device `S.wlog` in the Claude copy). History page by month with sets per workout, delete, load older; per-exercise progress (best per workout, chart, every session), opened from History or “See history and progress” on an exercise. Older “last time” entries were imported once as workouts marked “From before history”.
- Logging: per-set kg/reps, grey hints from PR then from earlier sets today, auto-advance to the next exercise, supersets/circuits in blue groups, rest timer (wheel picker, per-plan rest) with race-start countdown sound.
- Profile: details, "Your plan" card (read only, from the server), default rest, body measurements with history, backup code (copy/restore all data).
- Injury note per exercise, light/dark/auto theme.
- Feedback page (admins only, web): all suggestions with sender, context, screenshot viewer, status filter and picker, reply box (tester sees the reply; unread dot on their menu).
- Suggestions page (web only): type, text, optional screenshot (shrunk to ≤1600px JPEG), history with status.
- Web mode: register / sign in / email confirmation / password reset, sync newest-save-wins, sign out clears the device.

## Data model (app state, stored as JSON in `user_state.data`)
`v`, `names`, `cur` (today's sets), `last` (last saved session per exercise), `pr`, `notes`, `profile` (rest, measurements), `plans` (`active`, `custom[]`, `edits`, `meta`, `dayLoc`), `locs` (`active`, `list[{id,name,gear[]}]`), `coles` (`opts`, `session`), `sgSeen`, `account`, `theme`, `onboarded`, `ts`.

## Next steps (agreed direction)
1. Supabase Auth settings: Site URL + redirect URL for GitHub Pages; decide on email confirmation (built-in email sending is rate-limited — fine for a handful of testers, use custom SMTP before launch).
2. Native store app: an Expo / React Native attempt (`mobile/`) didn't work out and was removed in Nov 2026. The web app is the source of truth; any future store build should wrap or port it, using the same Supabase project and `user_state` shape.
3. TestFlight + Play internal testing.
4. RevenueCat + Paddle for subscriptions: the billing webhook (WP12) writes `entitlements` as service_role. No ads.
5. Privacy policy (POPIA), in-app account deletion and data export, store listings.
6. Stage 2 schema: split the rest of `user_state` into tables (locations, plans, plan_days, measurements, notes; workout history is already in tables), derive PRs from `workout_sets` and move the exercise library into the database.
7. Later: Apple Health / Health Connect sync, calorie tracking, Wear OS, Apple Watch app.
