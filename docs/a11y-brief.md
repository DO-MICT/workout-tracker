# Accessibility brief (WP17, WCAG 2.2 AA)

The target is NFR-5: follows the phone's text size, works with TalkBack (and VoiceOver later), 4.5:1 text contrast,
44 px tap targets, charts readable as text, no meaning by colour alone, reduced motion respected.
It must pass before any store submission.

## The check (CI)

`tests/a11y/audit.js`, run by `.github/workflows/a11y-check.yml` on every PR that touches `app.html` or `src/`.
It serves the repo, opens `app.html` in device-only mode (no sign-in) and walks 13 screens: sign-up, workout (an
exercise open), plans, stats (with sample workouts), exercise progress, gear, more, profile, library, injury note,
body check-in, body progress and the new-plan wizard. On each it checks:

- axe-core WCAG 2.0/2.1/2.2 A and AA rules, in GFD, Flow, Drift and Glow, light and dark, on a phone and a desktop
- tap targets of at least 44 × 44 px on a phone (an invisible `::before` hit area counts, see below)
- nothing runs off a 390 px screen with text at 200%

Run it locally: `npm i --no-save --no-package-lock playwright@1.63.0 axe-core@4.10.2 && node tests/a11y/audit.js`.
When you add a screen, add a step to `STEPS` in the script. Accepted exceptions go in `ALLOW` with a reason (none so far).

## Rules for new UI

- **Text size**: use `rem`, never `px`, for text (the body is `100%`, so the browser's and Android's text size apply).
  Android's WebView scales text with the system font size. Rows with a title and a button must wrap (`flex-wrap`).
- **Tap targets**: 44 px minimum. If a button must look smaller (`.chip.sm`, `.linkbtn`, `.planbtn`), it gets a
  centred 44 px `::before` hit area; add the class `hit` to any other small control. Don't put `overflow:hidden`
  on a parent that would clip it.
- **No buttons inside `<summary>`**: TalkBack can't reach them. Put the action in the opened part (the injury note
  button is under "See history and progress"); a status mark in the row is fine with `.sr` text.
- **Colour**: text uses `--ink`, `--muted`, `--danger` (red, lighter in dark mode) or the theme's `--done`/`--blue`.
  Never hard-code `#C0392B` for text. Check new colours on `--bg`, `--card` and `--line` in every palette.
- **Announcements**: `toast(m)` and `announce(m)` (finish.js) read a message aloud through the `#srlive` status
  region. The rest timer announces start and "Rest over. Go." only; never put a live region on something that ticks.
- **Pages and popups**: tab pages (Plans, Stats, Gear, More, Profile, Library...) are `aria-modal="false"` so the
  tab bar stays reachable; popups over the workout (wizard, note, check-in, done) are `aria-modal="true"`.
  While any `.sheet` or `.donepop` is open, `syncInert()` (tabs.js) makes the workout page underneath `inert`.
  A new sheet id must be added to the `watch` list in tabs.js. If you move focus back into the workout page right
  after closing a sheet, call `syncInert()` first.
- **Charts**: every chart has `role="img"` with an `aria-label` that reads the numbers, or a table next to it.
- **Motion**: a global `prefers-reduced-motion` rule stops animations and transitions; exercise art stays still
  (`artStill()` in exart.js).

## Still to do by hand (needs a phone)

- A TalkBack run-through on the Android build (closed testing), and VoiceOver once the iOS build exists.
- Android "Display size" (not just font size) at its largest setting.
