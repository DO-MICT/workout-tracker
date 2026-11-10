# Android app brief (WP10)

The Android app is the web app (`app.html` + `src/`) bundled inside a Capacitor 8 shell. One codebase: a fix in `src/`
reaches the website at once and the app in its next Play release. Architecture: section 3.2 of the solution architecture.

## How it fits together

| Piece | What it does |
| --- | --- |
| `tools/build_app.py` | Builds `build/app/` (not checked in): `app.html` with an app head (no service worker or manifest; `window.GFD_SHELL` carries the site address from `site.json` and the app id), plus `src/`, `vendor/`, `icons/` and the policy pages |
| `capacitor.config.json` | App id `com.getfitdaily.app`, name GFD, `webDir: build/app`, edge-to-edge insets, notification icon |
| `android/` | The native project (checked in). `npx cap sync android` copies `build/app` into it |
| `src/js/platform.js` | The only file that talks to Capacitor. Web and Android behind one API (see its header). Core code calls `platform.*` |
| `tools/build_android_icons.js` | Draws the launcher, round, adaptive/themed, notification and splash icons from the brand logo |
| `.github/workflows/android-build.yml` | PRs: debug APK artifact. `v*` tag or Run workflow: signed `.aab`, uploaded to Play's internal track if the service account secret is set |

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
- **Back button**: closes whatever Escape would (sheet, menu, popup); on the main screen or sign-in it leaves the app.
- **Downloads** (data export ZIP): written to the app cache and handed to Android's share sheet.
- **Links that open a new tab** (policy pages) open in the in-app browser tab at the public site address.
- **Update bar**: when `app_config.min_version` is newer, the app points to Google Play instead of reloading.
- No Android backup (`allowBackup=false`): data comes back from the server after sign-in.

## Build it yourself

Needs Node 22, JDK 21 and the Android SDK (Android Studio, or the command-line tools with `platforms;android-36`).

```
npm ci
npm run app:apk          # build/app → android → app/build/outputs/apk/debug/app-debug.apk
```

The debug build installs as "com.getfitdaily.app.debug" next to the real app. Every PR that touches the app also
builds one: Actions → the PR's Android build run → Artifacts → gfd-debug-apk.

Change `app.html` or `src/`? Nothing else to do: the workflow rebuilds `build/app` every time. Change a plugin or
the Capacitor version? Run `npm install` and `npx cap sync android`, and commit `package-lock.json` and `android/`.

## Release to Google Play (Deon's steps)

1. **Play developer account** (B1) and create the app in Play Console: name "GFD · Get Fit Daily", package
   `com.getfitdaily.app` (fixed for ever once uploaded).
2. **Upload key** (once; keep a copy of the file and passwords somewhere safe, e.g. a password manager):
   ```
   keytool -genkeypair -v -keystore gfd-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 gfd-upload.jks        # on Windows: certutil -encode gfd-upload.jks b64.txt (drop the BEGIN/END lines)
   ```
   GitHub → Settings → Secrets and variables → Actions → New secret: `GFD_UPLOAD_KEYSTORE_B64` (the base64 text),
   `GFD_UPLOAD_KEYSTORE_PASSWORD`, `GFD_UPLOAD_KEY_ALIAS` (`upload`), `GFD_UPLOAD_KEY_PASSWORD`.
   Play App Signing keeps the real signing key; this one only proves uploads come from us, and Google can reset it.
3. **First upload by hand**: Actions → Android build → Run workflow. Download `gfd-release-aab` from the run and
   upload it in Play Console → Testing → Internal testing → Create release. (Play needs the first one by hand.)
4. **Automatic uploads after that** (optional): Google Cloud → service account with a JSON key; Play Console →
   Users and permissions → invite its email with "Release to testing tracks". Save the JSON as the
   `PLAY_SERVICE_ACCOUNT_JSON` secret. Then each Run workflow (or `v*` tag) lands in internal testing as a draft;
   pick "completed" once the app has passed its first review.
5. **Supabase redirect URL**: add `gfd://auth-callback` under Authentication → URL Configuration → Redirect URLs
   (or run `tools/push_auth_emails.py --apply`, which now adds it). Without it, email links open the website instead.
6. **Closed test**: 12+ testers for 14 days before production (Play rule for new personal accounts).
7. Store listing and Data safety: `docs/store-listing.md`.

Version: `versionName` is `APP_VERSION` in `src/js/events.js`; `versionCode` is 1000 + the workflow run number.

## Waiting on the domain

When the domain is bought (`site.json` → `domain`), uncomment the App Links intent filter in
`android/app/src/main/AndroidManifest.xml`, set its host, and publish `/.well-known/assetlinks.json` on the domain
with the app-signing SHA-256 from Play Console → Setup → App signing. Until then `gfd://` covers sign-in links.

## Later work packages

- WP11 Google sign-in: use `platform.authRedirect()` as the OAuth redirect; the callback already lands in `appAuthLink`.
- WP12 billing: fill `platform.billing` (RevenueCat Capacitor plugin). Core code must not call RevenueCat directly.
- iOS (M4): a new branch in `platform.js` and `npx cap add ios`; no fork.
