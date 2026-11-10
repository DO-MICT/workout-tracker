# Database brief: migrations, staging and CI

How database changes get from a PR to the live Supabase project (WP2, Nov 2026). Before WP2, SQL was pasted into the
production SQL editor by hand; from now on GitHub Actions applies it, staging first.

## Environments

| | Supabase project | Used for |
|---|---|---|
| Local / CI | Throwaway Supabase started in Docker (`supabase start`) | Every PR that touches `supabase/` |
| Staging | `gfd-staging` (free plan) | Migration rehearsal, two-user tests, later sync and billing tests with test accounts |
| Production | `Workout tracker` (`zdllpjrkwcdmcuizxuum`, eu-west-3) | Real users |

Staging gets the same migrations plus the exercise and gear library (seed). It never holds real people's data.

## Writing a migration

1. Add `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_name>.sql`, newer than every file already there.
2. Add `supabase/rollbacks/<same name>.down.sql` that undoes it (required for every migration from `20261108000010` on).
   Say at the top if it loses data.
3. Never edit, rename or delete a migration that is already on `main`: it may be live. Write a new one.
4. Keep app versions working with the previous schema for 30 days (NFR-8): add columns, don't rename or drop them in the
   same release.
5. New tables: enable RLS and add policies in the same migration. The structure checks fail otherwise.

Check locally (needs Docker and the Supabase CLI 3.x):

```
supabase start -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
python3 tools/db_check.py files --base origin/main
supabase test db
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_KEY=$SERVICE_ROLE_KEY node --test tests/db/*.test.mjs
python3 tools/db_check.py roundtrip --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

`supabase db reset` rebuilds the local database from scratch.

## What CI checks (`.github/workflows/db-check.yml`)

Runs on every PR touching `supabase/`, `tests/db/`, `tools/db_check.py` or the library SQL:

- **Files**: names, unique and increasing versions, a rollback beside each new migration, nothing on `main` edited.
- **Fresh build**: all migrations plus the library seed apply to an empty Supabase.
- **Lint**: `supabase db lint` on the SQL functions.
- **Structure** (`supabase/tests/database/*.test.sql`, pgTAP): RLS on every public table, no write policy for signed-out
  visitors, views are `security_invoker`, security definer functions pin `search_path`, private functions and tables are
  closed to the API roles, entitlements and tier_features are read-only for the app.
- **RLS two-user test** (`tests/db/rls-two-user.test.mjs`): two real accounts use the API like the app does. Each sees only
  its own profile, data, history, feedback, screenshots and entitlements; nobody can give themselves Pro or admin; an admin
  can read feedback and grant access but not edit other people's data; a deleted and re-created email gets no second trial.
  Add a case here for every new table.
- **Rollback round trip**: each rollback runs (newest first), then the migrations apply again, then the checks rerun.

## Synced tables (WP3)

The `user_state` blob is being replaced by per-record tables (`user_settings`, `about_me`, `locations`, `plans` +
`plan_versions`, `schedule_entries`, `measurements`, `exercise_notes`, `custom_exercises`, `progress_photos`), migration
`20261108000011_sync_tables.sql`.

- Every synced table has `id` (made on the device, UUID v5 of user + old id), `user_id`, `rev`, `change_seq`,
  `created_at`, `updated_at`, `deleted_at` (tombstone). A trigger stamps `rev` and `change_seq`; RLS lets you read your
  own rows only, and the app has no write rights on these tables.
- Writes go through `sync_push(mutations)`: `[{t, id, op: 'upsert'|'delete', f: {changed fields}, rev}]`. Per field, the
  change that reaches the server last wins; `user_settings.prefs` merges key by key (null removes a key). A bad change
  comes back as `status: 'error'` and the rest still apply.
- Reads go through `sync_pull(since)`: rows above the cursor, tombstones included. Push and pull take a per-user lock, so
  `change_seq` order is commit order and a pull never skips a change.
- `migrate_from_blob(records)` moves an account off the blob once (`profiles.data_model` 1 to 2), insert only, all or
  nothing. After that the account's `user_state` row is read-only. New accounts start on 2. The blob stays 30 days
  (NFR-8), then a cleanup migration drops `user_state`.
- In the app: `src/js/syncmap.js` maps S to records and back (pure, tested in `tests/syncmap.test.js`);
  `src/js/store.js` keeps the queue in IndexedDB and runs push and pull. Screens still read and write S.
- Adding a synced table: add it to the table lists in `sync_apply`, `sync_pull` and `sync_purge_tombstones` (new migration),
  to `FIELDS` and the mapping in `syncmap.js`, to `02_sync_tables.test.sql` and to `SYNC_TABLES` in the two-user test.
- `tests/db/sync-two-phones.test.mjs` runs the real `syncmap.js` and `store.js` as two phones against the API.

## Weights and units (WP4)

- Every weight in the database is **kg**: `workout_sets.weight` (3 decimals since `20261108000012_weight_precision.sql`),
  `workouts.volume_kg`, body weight in `measurements` and in the blob. Never store pounds.
- `user_settings.units` (`kg` default, or `lb`) only changes what the app shows and takes in. It syncs in its own column
  (`syncmap.js`), never in `prefs`.
- Converting happens only in `src/js/rules.js` (`toKg`, `fromKg`, `boxShow`, `boxSave`, `fmtWeight`, `showVal`), tested in
  `tests/rules.test.js`. Screens call `U()` (state.js) for the unit. A set box keeps kg in `S.cur`; a lb user's typing is
  converted as it's saved, so records, last time and the big-jump check all work in kg.
- Distances (km), body lengths (cm) and times don't change with the setting.

## Usage events, errors and app config (WP5)

Migration `20261108000013_events_errors_config.sql`. Nothing here may hold personal details (NFR-11).

- `events(name, at, anon_id, platform, app_version, props)`: counts, not people. `anon_id` is a random id per install
  (`src/js/events.js`), never the account id. The app sends only `onboarding_done`, `first_workout`, `week2_return`,
  `paywall_seen` and `export` through `log_event`; the database writes `sign_up`, `trial_start`, `purchase` (an
  entitlement from play, web, lifetime or couple) and `account_deleted` itself, with no id at all. `props` holds up to 8
  numbers, true/false or short lower-case codes: free text and health data are refused. 100 events a day per install.
- `client_errors`: message, stack, screen, version, scrubbed of emails, query strings, ids and long numbers (in the app and
  again in `log_client_error`). The same error within an hour adds to `count`. 20 new errors an hour per install.
- Nobody reads either table through the API. Admins see counts and the latest errors on More → Usage
  (`admin_usage(days)`, `admin_errors(limit)`), or in the SQL editor. Events are purged after 400 days, errors after 90.
- `app_config` (everyone reads, only the SQL editor writes): `min_version` (copies with an older `APP_VERSION` show
  "A new version of GFD is ready" with a Reload button), `catalog_version`, `flags` (read with `flag("name")`).
  To force a reload after a breaking release: bump `APP_VERSION` in `src/js/events.js`, merge, then
  `update public.app_config set value = '"2026.12.01"' where key = 'min_version';`
- Adding an event: add its name to `private.client_event_names()` (new migration) and to `EV_NAMES` in `events.js`, and a
  label in `US_LABELS`.

## Deploying (`.github/workflows/db-deploy.yml`)

- **Staging, automatic**: merging a PR with a new migration to `main` applies it to staging (with the library seed) and runs
  the two-user test there.
- **Production, one approval**: Actions → Deploy database → Run workflow → `staging-then-production`. Staging runs first;
  the production job then waits for Deon's approval (the protected `production` environment), prints what it will apply
  and applies it. No more pasting SQL into the production SQL editor.
- Each job's summary lists the migrations it applied.
- Library data (`exercises.sql`, `gear.sql`) is still loaded into production by hand when it changes (`docs/data-brief.md`).

### Undoing a migration

Run its `supabase/rollbacks/<name>.down.sql` in the SQL editor (staging first; production only with a backup), then
`delete from supabase_migrations.schema_migrations where version = '<version>';` so a fixed version can be deployed.
Prefer a new forward migration that fixes the problem.

## One-time setup (Deon)

1. **Staging project.** supabase.com → New project, name `gfd-staging`, region eu-west-3 (Paris), free plan, strong
   database password (keep it in your password manager). The free plan allows two active projects; if Supabase refuses,
   pause a project you don't need.
2. **GitHub environments.** Repo → Settings → Environments:
   - `staging`, secrets: `SUPABASE_DB_URL` (dashboard → Connect → **Session pooler** URI, with the password filled in),
     `SUPABASE_URL` (Project Settings → API → URL), `SUPABASE_ANON_KEY` (publishable key), `SUPABASE_SERVICE_KEY`
     (secret key).
   - `production`, tick **Required reviewers** and add yourself; secret `SUPABASE_DB_URL` (production's Session pooler URI).
3. **Production migration history.** Run `supabase/one-off/wp2-production-migration-history.sql` once in the production SQL editor. It
   changes no tables or data; it renumbers the list of applied migrations to match the repo (the early ones were recorded
   under other numbers, and update_workout and entitlements were not recorded).
4. **First staging run.** Actions → Deploy database → Run workflow → `staging`. It builds staging from scratch and runs the
   two-user test there.

Secrets never go in the repo. The app keeps using only the production publishable key.

## Consents (WP6)

- `consents` (migration `20261108000014_consents.sql`): one row per consent given or withdrawn, kinds `terms`, `privacy`,
  `health`, `marketing`. Append-only: a trigger refuses every update; withdrawing adds a row with `withdrawn_at`. The
  newest row per kind is the current state. Rows go with the account (cascade).
- The app reads `my_consents` (one row per kind: active, agreed version, `current_version`) and writes only through
  `give_consent(kind, version)` (the version must be today's) and `withdraw_consent(kind)` (health and marketing only;
  terms and privacy end with account deletion, WP8).
- Current versions live in `app_config.policies`. `terms` and `privacy` stay empty until the policy pages are published
  (WP7); while empty nobody is asked. Bumping a version makes the app ask everyone again on next open.
- Sign-up: ticked versions go in the user metadata (`consents`); the `profiles_consents_insert` trigger records the
  ones that match today's versions. Anything else is asked by the screen after sign-in (`src/js/consent.js`).
- `private.has_consent(uid, kind)` is for the health tables' RLS (WP9). Withdrawing health consent calls
  `private.delete_health_data(uid)`; WP9 fills it in with deletes from its tables.

## Account deletion and data export (WP8)

Migration `20261109000016_account_deletion.sql`, Edge Function `supabase/functions/delete-account`, app `src/js/account.js`,
web page `site/delete-account.html` (built to `delete-account.html`, the link for Google Play's data deletion form).

- **Asking**: Profile › Delete my account (type DELETE), or the web page. `request_account_deletion(source)` adds a
  `deletion_requests` row due in 7 days (asking again keeps the first date). The phone then signs out and forgets its copy.
- **Changing your mind**: signing in during the 7 days shows "Keep your account?" before anything else (before the
  consent gate); `cancel_account_deletion()` removes the row. The web page offers the same.
- **Deleting**: `.github/workflows/account-deletions.yml` calls the `delete-account` function once a day with the header
  `x-cron-secret`. For each due request (`core.js`, the same code the tests run): remove the person's files under
  `<user id>/` in the `suggestions` and `progress-photos` buckets, delete the RevenueCat customer once
  `REVENUECAT_SECRET_KEY` is set (WP12), then delete the auth user. Every table with a `user_id` cascades from
  `auth.users` (a pgTAP check enforces it), the profiles trigger logs `account_deleted` with no id, and the trial check
  code stays in `private.trial_ledger`. A failure leaves the row with `attempts` and `last_error`; the next day retries.
  The function's result is counts only.
- **Export**: `export_my_data()` returns one JSON document with every table, listed by name. The app adds CSVs of sets
  and measurements, a README and feedback screenshots, and saves a ZIP (`gfd-data-YYYY-MM-DD.zip`). Logs `export`.
- **Adding a table with personal data**: give it `user_id ... references auth.users (id) on delete cascade`, add it to
  `export_my_data()` (new migration; `06_account_deletion.test.sql` fails otherwise), and if it holds files, add the
  bucket to `BUCKETS` in `core.js` with files under `<user id>/`. WP15 ends couple links in `deleteOne`.
- Tests: `supabase/tests/database/06_account_deletion.test.sql`, `tests/db/account-deletion.test.mjs` (export, the
  two-user cases, a full deletion run with files, and a failed run that retries), `tests/account.test.js` (ZIP and CSV).

### One-time setup (Deon)

1. Apply the migration (Deploy database workflow, as for the others).
2. Supabase → Edge Functions → Secrets (staging and production): `DELETE_CRON_SECRET` = a long random text
   (40+ characters, from a password manager).
3. Deploy the function: GitHub → Settings → Secrets → Actions: `SUPABASE_ACCESS_TOKEN` (supabase.com → Account →
   Access tokens); Settings → Environments → staging / production → Variables: `PROJECT_REF`. Then Actions → Deploy
   functions → Run workflow (staging, then production). Or from a computer with the CLI:
   `supabase functions deploy delete-account --project-ref <ref>`.
4. GitHub → Settings → Secrets → Actions: `DELETE_FN_URL` = `https://zdllpjrkwcdmcuizxuum.supabase.co/functions/v1/delete-account`
   and `DELETE_CRON_SECRET` = the same text as step 2. Then Actions → Account deletions → Run workflow once: it should
   print `{"due":0,"deleted":0,"failed":0,"files":0}`.
5. Google Play Console → App content → Data safety → Data deletion: link `<site>/delete-account.html`.

GitHub turns off scheduled workflows after 60 days without commits. If the repo goes quiet, re-enable it on the Actions
tab, or schedule the function in Supabase instead (Integrations → Cron → new job → Edge Function `delete-account`,
daily, header `x-cron-secret`).

## Health details (WP9)

Migration `20261109000017_health_data.sql`, app `src/js/health.js`. NFR-6: health details live apart, only with consent.

- `health_limits`: `kind` = `exercise_note` (injury note on an exercise, one per exercise), `cant_do` (a short code such as
  `no_jumping`, one per code), `injury` or `note`. `pain_entries`: `score` 0 to 10, optional `exercise_id` and `workout_id`
  (your own workouts only), `felt_at`, `note`. Only injury notes have screens so far; limits (G1) and pain (FR-4.10) come
  later on the same tables.
- RLS: own rows **and** `private.health_ok()` (= `has_consent(auth.uid(), 'health')`) for every read and write. Without
  active consent even the owner's app gets nothing. The app reads and writes them directly (not through sync).
- Withdrawing health consent (`withdraw_consent('health')`) runs `private.delete_health_data(uid)`, which deletes both
  tables' rows at once. Account deletion cascades as usual.
- `export_my_data()` returns them under a separate top-level `health` section, not in `tables`.
- Never put health details in `events`, `client_errors`, `user_settings.prefs` or the synced tables. Injury notes used to
  sync as `exercise_notes` (WP3 draft); they are now local-only in `S` (`syncmap.js` LOCAL: `notes`, `healthQ`,
  `healthSync`) and `health.js` keeps them in `health_limits`. `exercise_notes` is left for setup cues (FR-4.9).
- In the app: after the consent gate, `healthStart()` loads notes (consent on), forgets them (withdrawn), or asks once per
  open whether to keep a phone's older notes (never asked). Adding a note without consent asks first. Profile › Privacy has
  the Health details on/off switch (off deletes). Signed out, notes stay on the phone as before.
- Adding a health table: same RLS pattern, add it to `delete_health_data` and to the `health` section of
  `export_my_data()` (new migration), and a case in the health test of `tests/db/rls-two-user.test.mjs`.

## Free and Pro (WP14)

Migration `20261109000018_plan_limits.sql`, app `src/js/access.js` (plus small hooks in `plans.js`, `stats.js`,
`measure.js`). Decisions D13 and D20: Free keeps 3 plans and the basic measurements; when Pro ends nothing is deleted.

- **What Free includes** is in `app_config.free_limits`: `plans` (own plans in use at once, 3) and `measure_sites`
  (`weight`, `waist`, `chest`, `hips`; height is always open). Raise the cap without a release:
  `update public.app_config set value = jsonb_set(value, '{plans}', '5') where key = 'free_limits';`
- **The plan cap is on the server**: trigger `plans_limit` on `public.plans`. It counts your own plans
  (`source_template is null`) that aren't deleted or `read_only`. Built-in plans and your edits to them never count.
  It never refuses a sync write (a refused write is lost on the phone): a new plan over the cap is saved `read_only`, and
  a change to a read-only plan is undone with the attempted body kept in `plan_versions`. Moving it in the list
  (`body.pos`) and deleting it are allowed. Only an explicit unlock over the cap raises (`plan_limit`).
- **Downgrade**: `private.apply_plan_limits(uid)` keeps the active plan and the two most recently trained, and marks the
  rest `read_only`; on Pro it unlocks everything. It runs from the `entitlements_plan_limits` trigger (any purchase,
  refund, grant or revoke), from `my_plan_access()` when the app opens, and nightly at 03:17 UTC through pg_cron
  (`gfd-plan-limits` → `private.apply_due_plan_limits()`) for trials that ran out on their own.
- **The app calls** `my_plan_access()` (after `my_access`, in `refreshAccess`) → `{unlimited, limit, in_use, locked}`,
  and `choose_plans(local_ids)` from the "Plans in use" sheet. `read_only` is not in syncmap's `FIELDS`, so the app never
  writes it. While offline, `lockedPlans()` also treats any plan beyond the cap as read-only (active plan first).
- **Pro-only rows**: new `progress_photos` rows need the `photos` feature (trigger `progress_photos_pro`). F10 adds the
  bucket policy for the files.
- **App-only gates** (architecture 5.3: the data is the user's own): Stats ranges 3 months and year (`stats.full`),
  measurement sites beyond the basic ones (`measure.full`: shown in Body progress, read only; delete still works).
  Progression, timed workouts and photos have keys and upgrade words ready for when those features ship.
- **Upgrade page**: `proOffer(why)` opens it and logs `paywall_seen` with `{from: why}`. Buying hooks in through
  `window.GFDBilling = {buy(why) -> Promise, label}` (WP12 Play / RevenueCat, WP13 Paddle); without it the page says Pro
  opens with the Google Play release.
- Tests: `supabase/tests/database/08_plan_limits.test.sql`, the plan cap case in `tests/db/rls-two-user.test.mjs`,
  `tests/access.test.js`.
