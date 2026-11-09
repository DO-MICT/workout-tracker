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
- Adding a synced table: add it to the arrays in `sync_apply`, `sync_pull` and `sync_purge_tombstones` (new migration),
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
