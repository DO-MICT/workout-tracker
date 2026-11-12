# Android app brief (WP10)

The Android app is the web app (`app.html` + `src/`) bundled inside a Capacitor 8 shell. One codebase: a fix in `src/`
reaches the website at once and the app in its next Play release. Architecture: section 3.2 of the solution architecture.

## How it fits together

| Piece | What it does |
| --- | --- |
| `tools/build_app.py [--env dev]` | Builds `build/app/` (not checked in): `app.html` with an app head (no service worker or manifest; `window.GFD_SHELL` carries the site address from `site.json`, the app id, the environment and the sign-in link scheme), plus `src/`, `vendor/`, `icons/` and the policy pages, pointed at GFD Prod (default) or GFD Dev |
| `capacitor.config.json` | App id `co.za.getfitdaily.app`, name GFD, `webDir: build/app`, edge-to-edge insets, notification icon |
| `android/app/build.gradle` flavours | `prod` = the Play app; `dev` = "GFD Dev" (`co.za.getfitdaily.app.dev`, amber icon, `gfddev://`). Resources in `android/app/src/dev/`. A check stops a build whose web files are for the other environment |
| `android/` | The native project (checked in). `npx cap sync android` copies `build/app` into it |
| `src/js/platform.js` | The only file that talks to Capacitor. Web and Android behind one API (see its header). Core code calls `platform.*` |
| `tools/build_android_icons.js` | Draws the launcher, round, adaptive/themed, notification and splash icons from the brand logo |
| `.github/workflows/android-build.yml` | PRs: GFD Dev debug APK artifact. Push to `dev`: GFD Dev APK on the `dev-latest` release. Push to `main`, `v*` tag or Run workflow on main: signed Play `.aab`, uploaded to Play's internal track if the service account secret is set |

What the shell adds over the website:
- **Works offline from the first open**: the files are inside the app (no service worker in the app).
- **Rest alert with the screen off** (G10): `startTimer` asks `platform.restAlert(endTime)` to schedule a local
  notification on the "Rest timer" channel. With the app on screen the in-app beep plays and the notification is
  cancelled a second before; Done cancels it. First rest asks for notification permission (Android 13+).
  Android 14+ grants exact alarms only if the person allows "Alarms and reminders"; otherwise Android may deliver the
  alert a little late. If testers report late alerts, add a settings link (not a foreground service).
- **Sign-in links**: emails link to `gfd://auth-callback#access_token=…` (`platform.authRedirect()`); the app catches
  them (intent filter in `AndroidManifest.xml`) and `appAuthLink()` in `signin.js` sets the session, or opens New
  password for a reset link. The website keeps using its own address.
- **Google sign-in** (WP11): `platform.openAuthUrl()` opens Google in a Custom Tab (Google blocks sign-in inside a
  WebView), the result comes back as `gfd://auth-callback#access_token=…` like an email link, and the tab is closed.
  No Android OAuth client or SHA-1 is needed: it's the same browser flow as the web. Setup: `docs/site-brief.md`.
- **Back button**: closes whatever Escape would (sheet, menu, popup); on the main screen or sign-in it leaves the app.
- **Downloads** (data export ZIP): written to the app cache and handed to Android's share sheet.
- **Links that open a new tab** (policy pages) open in the in-app browser tab at the public site address.
- **Update bar**: when `app_config.min_version` is newer, the app points to Google Play instead of reloading.
- No Android backup (`allowBackup=false`): data comes back from the server after sign-in.

## Dev test app ("GFD Dev") and the road to Play

Two apps come from the same code and install side by side on one phone:

| | GFD Dev | GFD (Play) |
| --- | --- | --- |
| Package | `co.za.getfitdaily.app.dev` | `co.za.getfitdaily.app` |
| Server | GFD Dev (test data) | GFD Prod (real accounts) |
| Built from | `dev`, on every push that touches the app | `main`, on every push that touches the app |
| Where it goes | GitHub release `dev-latest` → `gfd-dev.apk`, installed straight on the phone | Play Console → Internal testing (automatic once `PLAY_SERVICE_ACCOUNT_JSON` is set; by hand before that) |
| Icon, name | amber, "GFD Dev" | volt, "GFD" |
| Sign-in links | `gfddev://auth-callback` | `gfd://auth-callback` |

The flow: merge PRs into `dev` → install the new GFD Dev from the `dev-latest` release page (GitHub → Releases, or
the link in the run's summary) and test → merge `dev` into `main` → the Play bundle is built from `main` and lands in
internal testing → promote it in Play Console (closed testing, then production). A dev build is never promoted: the
Play build is always rebuilt from `main`, pointed at GFD Prod.

Notes:
- **Install**: on the phone open the release page, tap `gfd-dev.apk`, allow the browser to install apps the first
  time. The repo is public, so anyone who finds the page can install GFD Dev too; it only reaches GFD Dev (test data,
  whose address and publishable key are in the repo anyway). If that ever matters, drop the release step and use the
  run's `gfd-dev-apk` artifact (needs a GitHub sign-in, comes as a zip). New builds install over the old one once the upload key secrets
  exist (the dev APK is signed with the upload key; it's a different package, so Play never sees it). Before that each
  build has a throwaway key: uninstall GFD Dev first.
- **Sign-in**: GFD Dev needs `gfddev://auth-callback` in GFD Dev's Redirect URLs (Supabase → Authentication → URL
  Configuration, or Push sign-in settings for dev). Google sign-in on GFD Dev needs Google set up on GFD Dev too. No
  SHA-1 or Android OAuth client is needed for either app (browser flow).
- **Pro purchases don't work in GFD Dev**: Play billing only works for the Play package installed from Play. Test
  buying with the Play app on the internal testing track (License testing), or give the dev account Pro with `admin_grant`.

**Old WebViews**: the app runs in the phone's Android System WebView, which can be old (a Huawei P30 lite tested on
12 Nov 2026 had Chrome 80). Don't use `inset:` (Chrome 87+; write top/right/bottom/left), and give `svh`/`dvh` a
`vh` fallback first. `color-mix()` and flex `gap` just degrade (no tint, tighter spacing) on very old ones. GFD Dev's
DEV tag (bottom-left) shows the WebView version and where the sign-in sheet and tab bar are.

## Build it yourself

Needs Node 22, JDK 21 and the Android SDK (Android Studio, or the command-line tools with `platforms;android-36`).

```
npm ci
npm run app:dev          # GFD Dev:  app/build/outputs/apk/dev/debug/app-dev-debug.apk   (co.za.getfitdaily.app.dev.debug)
npm run app:apk          # the Play app pointed at GFD Prod: apk/prod/debug/app-prod-debug.apk (co.za.getfitdaily.app.debug)
```

Gradle tasks are per flavour: `assembleDevDebug`, `assembleDevRelease`, `assembleProdDebug`, `bundleProdRelease`.
Run `python3 tools/build_app.py` (or `--env dev`) and `npx cap sync android` first; Gradle refuses a mismatch. In
Android Studio pick the build variant (devDebug or prodDebug). Every PR that touches the app builds a GFD Dev debug APK:
Actions → the PR's Android build run → Artifacts → gfd-dev-debug-apk.

Change `app.html` or `src/`? Nothing else to do: the workflow rebuilds `build/app` every time. Change a plugin or
the Capacitor version? Run `npm install` and `npx cap sync android`, and commit `package-lock.json` and `android/`.

## Release to Google Play (Deon's steps)

1. **Play developer account** (B1) and create the app in Play Console: name "GFD · Get Fit Daily", package
   `co.za.getfitdaily.app` (fixed for ever once uploaded; this is the name Play Console has, so never change it).
2. **Upload key** (once; keep a copy of the file and passwords somewhere safe, e.g. a password manager):
   ```
   keytool -genkeypair -v -keystore gfd-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 gfd-upload.jks        # on Windows: certutil -encode gfd-upload.jks b64.txt (drop the BEGIN/END lines)
   ```
   GitHub → Settings → Secrets and variables → Actions → New secret: `GFD_UPLOAD_KEYSTORE_B64` (the base64 text),
   `GFD_UPLOAD_KEYSTORE_PASSWORD`, `GFD_UPLOAD_KEY_ALIAS` (`upload`), `GFD_UPLOAD_KEY_PASSWORD`.
   Play App Signing keeps the real signing key; this one only proves uploads come from us, and Google can reset it.
   The same key signs the GFD Dev APK, so new dev builds install over the old one.
3. **First upload by hand**: Actions → Android build → Run workflow (branch `main`). Download `gfd-release-aab` from
   the run and upload it in Play Console → Testing → Internal testing → Create release. (Play needs the first one by hand.)
4. **Automatic uploads after that** (optional): Google Cloud → service account with a JSON key; Play Console →
   Users and permissions → invite its email with "Release to testing tracks". Save the JSON as the
   `PLAY_SERVICE_ACCOUNT_JSON` secret. Then each merge into `main` that touches the app (or Run workflow on main, or a
   `v*` tag) lands in internal testing as a draft; use Run workflow with "completed" once the app has passed its first review.
5. **Supabase redirect URL** (done on GFD Prod 12 Nov 2026): add `gfd://auth-callback` under Authentication → URL Configuration → Redirect URLs
   (or run `tools/push_auth_emails.py --apply`, which now adds it). Without it, email links open the website instead.
6. **Closed test**: 12+ testers for 14 days before production (Play rule for new personal accounts).
7. Store listing and Data safety: `docs/store-listing.md`.
8. **Before the production launch: Google sign-in branding.** Google's account picker says "continue to
   zdllpjrkwcdmcuizxuum.supabase.co" until GFD Prod has a Supabase custom domain (paid add-on, e.g.
   `auth.getfitdaily.co.za`). Set that up, add its `/auth/v1/callback` to the Google Web client, point the app at it
   (`deploy/supabase.json`), then ask Google for brand verification (Google Auth Platform → Branding) so the screen
   shows the GFD name and logo. Sign-in works without it; it only looks less trustworthy. See `docs/site-brief.md`.

Version: `versionName` is `APP_VERSION` in `src/js/events.js`; `versionCode` is 1000 + the workflow run number.

## Waiting on the domain

When the domain is bought (`site.json` → `domain`), uncomment the App Links intent filter in
`android/app/src/main/AndroidManifest.xml`, set its host, and publish `/.well-known/assetlinks.json` on the domain
with the app-signing SHA-256 from Play Console → Setup → App signing. Until then `gfd://` covers sign-in links.

## Pro billing (WP12)

Google Play sells Pro; RevenueCat checks every purchase and tells our server, and the server alone writes
`public.entitlements`. The app never decides Pro: after buying it asks the server to sync and reads `my_access` again.
Paddle on the website (WP13) goes through the same RevenueCat project and the same webhook.

| Piece | What it does |
| --- | --- |
| `platform.billing` (`src/js/platform.js`) | The RevenueCat Capacitor plugin, app only: `ready(key, uid)`, `plans()`, `buy(id)`, `restore()`, `signOut()`, `manageUrl(product)` |
| `src/js/billing.js` | Sets `window.GFDBilling` in the app for the upgrade page; the Your plan card's Manage or cancel and Restore purchases; the reminder a week before a yearly plan renews |
| `supabase/functions/billing-webhook` | `POST /billing-webhook`: RevenueCat's webhook. `POST /billing-webhook/sync`: the app right after a purchase or restore. Both ask RevenueCat for the person's full record and call `billing_apply` |
| Migration `20261111000019_billing.sql` | `billing_events` (each webhook once, no personal details), `billing_apply` (service_role only), `my_access.product_id` |

RevenueCat's app user id is the Supabase user id (`Purchases.configure({appUserID})`), so a purchase always lands on the
right account, and signing out logs RevenueCat out too. Stores map to sources: Google Play → `play`, Paddle/Web Billing →
`web`, a product id containing `lifetime` → `lifetime` (WP15). RevenueCat promotional grants are ignored: use `admin_grant`.

**Products** (create them in Play Console → Monetize → Subscriptions, then import them into RevenueCat):
subscription `gfd_pro` with base plans `monthly` (US$4.99, auto-renewing, 1 month) and `yearly` (US$34.99, 1 year).
No free trial on the base plans: everyone already gets 14 days of Pro at sign-up. In RevenueCat: entitlement `pro`
with both products attached, and offering `default` with packages Monthly and Annual. The app shows whatever the current
offering holds (monthly and yearly; lifetime waits for WP15), with Google's local prices.

**Settings per Supabase project** (GFD Dev and GFD Prod):
- `app_config` key `play_billing`: `insert into public.app_config (key, value, note) values ('play_billing', '{"rc_key":"goog_..."}', 'RevenueCat Google Play public key (WP12)') on conflict (key) do update set value = excluded.value;`
  Until it exists, the upgrade page says buying opens soon, exactly as before.
- Edge Function secrets: `REVENUECAT_WEBHOOK_AUTH` (any long random text, the same as RevenueCat's webhook
  Authorization value), `REVENUECAT_SECRET_KEY` (RevenueCat secret API key, `sk_...`; delete-account uses it too), and
  later `BILLING_SANDBOX=off` on GFD Prod once real sales start, so test purchases stop counting there.
- Deploy: Actions → Deploy functions (deploys delete-account and billing-webhook).
- RevenueCat → Integrations → Webhooks: URL `https://<project ref>.supabase.co/functions/v1/billing-webhook`,
  Authorization header value = `REVENUECAT_WEBHOOK_AUTH`. One webhook per project (Dev and Prod can each have one,
  filtered by environment: Sandbox for Dev, both for Prod).

**Testing a purchase**: add your Google account under Play Console → Settings → License testing, install the app from
the internal testing track, and buy: Google uses test cards and renews monthly every 5 minutes. Check
`select * from public.billing_events order by received_at desc limit 5;` and the Your plan card.

Cancel: Google Play handles it (the card links to Play's subscription page). Pro stays until the end of the paid
time; the webhook then marks the row expired. Refunds end Pro straight away. A card problem keeps Pro through Google's
grace period (status `grace`).

## Later work packages

- iOS (M4): a new branch in `platform.js` and `npx cap add ios`; no fork.
