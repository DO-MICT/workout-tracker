# Workout tracker: mobile app (Expo)

Core loop: sign in, plans, today's workout with set logging, rest timer, finish popup, history and progress, profile.
Uses the same Supabase project and `user_state` shape as the web app (on `main`), so one account works on both.

## Run it
```
cd mobile
npm install
npx expo start
```
- **iPhone:** install *Expo Go* from the App Store and scan the QR code (same Wi-Fi as your PC).
- **Android emulator on Windows:** install Android Studio, open Device Manager, create a Pixel device (latest API image), start it, then press `a` in the Expo terminal. Lighter alternatives: BlueStacks or LDPlayer (enable ADB), or a real Android phone with Expo Go.
- iOS simulators need a Mac. Without one, use Expo Go on the iPhone; store builds come from EAS (`npx eas-cli build`), no Mac needed.

## Before publishing
- Run `npx eas-cli init` to link an EAS project (adds `extra.eas.projectId` to `app.json`).
- App identifier is `com.junkdump.workouttracker` (iOS bundle ID and Android package). Change in `app.json` if needed.

## Not ported yet
Cole's Sessions, plan builder/editing, equipment and location editing, swap suggestions, backup, background rest-timer notifications, account deletion, subscriptions.
