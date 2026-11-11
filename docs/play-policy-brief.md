# Google Play policy brief

GFD ships on Google Play, so every design and every change must stay inside the
[Google Play Developer Program Policy](https://play.google/developer-content-policy/). This page turns that policy
into rules for this app. Read it before you design or build anything that touches money, personal data, health,
permissions, notifications, the store listing or sign-up. A PR that breaks a rule here doesn't go into `dev`.

The rules have ids (P1, D2, …) so code comments, PRs and reviews can point at them. `tests/play-policy.test.js`
checks the ones a machine can check; it runs in CI with the other tests.

Facts these rules rely on (change the rules if one changes): Android package `co.za.getfitdaily.app` (locked in Play Console); Health & Fitness
category; audience 18 and over (`site.json` `min_age`, Play Console Target audience 18+ only, neutral age screen at sign-up); no ads; developer is a trader (EU DSA); Pro is sold by
Google Play Billing through RevenueCat in the app and by Paddle on the website; 14-day Pro trial granted by our
server at sign-up, no card and no automatic charge.

## The rules

### Payments and subscriptions ([Payments](https://support.google.com/googleplay/android-developer/answer/9858738), [Subscriptions](https://support.google.com/googleplay/android-developer/answer/9900533))

- **P1. Inside the Android app, Pro is only sold through Google Play Billing** (`platform.billing`, RevenueCat).
  No other checkout, card form or payment SDK in the app. Paddle code (`webbilling.js`, `vendor/purchases-js*`) runs
  only when `!platform.native` and is left out of the app build by `tools/build_app.py`.
- **P2. The app may honour Pro bought on the website** (it reads `my_access`), but it never tells people where or how
  to buy it there: no web prices, no "cheaper on the website", no buy links. For a web subscriber the app may say
  "You bought Pro on the website. Sign in there to change or cancel it." with no link.
- **P3. No path from the app to another way to pay.** That covers buttons, links, webviews, Custom Tabs, emails the
  app triggers, the store listing and screenshots. Our own pages opened from the app get `?inapp=1`
  (`platform.openExternal`) and `site/shell.html` then hides links to the web app. A new link out of the app must not
  reach a page that sells Pro. Changing this needs Play's external offers or alternative billing programme, which is
  Deon's decision.
- **P4. Every offer screen is clear before the buy button**: price as the store gives it, how often it bills
  ("a month", "a year"), that it **renews automatically until cancelled**, and how to cancel (Google Play ›
  Subscriptions, or Profile › Your plan › Manage or cancel). A yearly plan shows its yearly price as the main price
  (a per-month figure may only appear smaller, next to it). Store prices are shown as returned (already localised).
- **P5. Easy to leave**: every paywall has a visible "Not now"; Free keeps working without Pro; Profile › Your plan
  always has Manage or cancel for a Play subscription.
- **P6. Truthful names and benefits.** "Free trial" only means our server trial (no card, ends on its own, nothing
  charged). If we ever add a Play intro offer or a trial that turns into a paid plan, the offer screen must say how
  long it lasts, what it costs after, the date it converts and how to cancel before then. Pro's list only names
  features that are live (or says "as they arrive").
- **P7. Subscriptions give ongoing value.** One-off things (for example lifetime) are one-time products, not
  subscriptions. Never take features away from a paid plan mid-period, and never cancel someone's plan without
  their request.
- **P8. Keep the RevenueCat plugin current** so the Play Billing Library it uses meets Play's yearly deadline.

### User data and privacy ([User Data](https://support.google.com/googleplay/android-developer/answer/9888076), [privacy policy requirements](https://support.google.com/googleplay/android-developer/answer/10144311))

- **D1. One public privacy policy**: `https://getfitdaily.co.za/privacy.html`, plain HTML over HTTPS, no login, no
  geo-block, not a PDF, built from `site/privacy.html` + `site.json`. It names GFD, the developer (same name as the
  Play developer account) and a contact, and has **no draft gaps** when a release goes to Play.
- **D2. It's linked in the app** (More › Privacy policy, the sign-up agreement, the health details sheet) and in Play
  Console. Don't remove those links.
- **D3. Same PR, three places.** A change that collects a new kind of data, sends data to a new provider, adds an SDK
  or keeps data longer updates, in the same PR: `site/privacy.html` (what, why, who, how long), the Data safety table
  in `docs/store-listing.md`, and `export_my_data` / account deletion if it's a new personal table. The PR says
  "Data safety form changes" so Deon updates Play Console before the release.
- **D4. Ask before collecting anything people wouldn't expect.** Show an in-app disclosure in normal use (not only in
  the policy) saying what is collected and why, followed by a clear yes (tap or tick). Leaving the screen is not a
  yes, and nothing is collected until they agree. Health details already work this way (`health.js`).
- **D5. Collect only what a feature needs.** No selling data, no advertising IDs, no ad or tracking SDKs, no data to
  data brokers. Analytics stay anonymous (`events.js`: no user id, email, free text or health data).
- **D6. HTTPS only.** No cleartext traffic, `allowMixedContent` stays false, secrets never in the app.
- **D7. Account deletion stays in two places**: in the app (Profile › Delete my account) and on the web
  (`delete-account.html`, also the Play Console URL). Deletion removes the account and its data, not just hides it;
  anything we keep after (purchase records, the trial check code) is named in the privacy policy. Signing in with
  Google must still allow deletion.

### Health ([Health Content and Services](https://support.google.com/googleplay/android-developer/answer/9878878))

- **H1. GFD is a fitness app, not a medical device.** No feature or text claims to diagnose, treat, cure or prevent
  anything, or to replace a doctor or physio. Training advice must match mainstream exercise science; no
  supplement or drug claims.
- **H2. Keep the medical note** (`MEDICAL_NOTE` in `health.js`, shown on More and the health details sheet) and the
  last paragraph of the store description in `docs/store-listing.md`.
- **H3. Health details are sensitive data**: opt-in, kept apart, never used for statistics or anything but the feature
  they were given for (D4). Injury and pain features ask a health professional to be consulted when pain is involved.
- **H4. Health Connect, step counters, heart rate or wearables** need a new Health apps declaration in Play Console,
  only the permissions the feature uses, and their own disclosure. Ask Deon before starting one.

### Permissions and device ([Permissions](https://support.google.com/googleplay/android-developer/answer/12579724), [Device and Network Abuse](https://support.google.com/googleplay/android-developer/answer/9888379))

- **A1. Only the permissions a live feature needs.** Today: internet, notifications (rest alert, asked the first time
  a rest timer runs), exact alarms through `SCHEDULE_EXACT_ALARM` (person-granted), vibrate, run at startup.
  `USE_EXACT_ALARM`, location, contacts, SMS, call log, all-files, `QUERY_ALL_PACKAGES`, accessibility services and
  `USE_FULL_SCREEN_INTENT` are off-limits unless Deon approves a feature that truly needs one and its Play
  declaration. A new permission is added to the table in `docs/store-listing.md`.
- **A2. Ask in context.** Runtime permission prompts appear when the person uses the feature, after a line saying why.
- **A3. Native features go through `platform.js`** (CLAUDE.md), so the permission list stays in one place.
- **A4. No background work the person didn't start.** A foreground service needs a Play declaration and Deon's OK.
- **A5. Notifications are only for things the person set up** (rest alert; later reminders they turn on). No
  marketing pushes without an opt-in, and none that look like system alerts.
- **A6. Target the API level Play requires** (`android/variables.gradle` `targetSdkVersion`): within a year of each
  new Android release, so check every August. The test fails below 35.

### Store listing and promotion ([Metadata](https://support.google.com/googleplay/android-developer/answer/9898842), [Ratings](https://support.google.com/googleplay/android-developer/answer/9898684))

- **L1. The listing tells the truth** about what is live now (counts such as exercises or illustrations included).
  No "best", "#1", "free" (Pro costs money), prices, emojis or capitals for shouting in the title, icon or
  short description; no testimonials we can't prove; no other brands' names or logos.
- **L2. Screenshots show the real app.**
- **L3. Never reward or pressure reviews** (no "rate 5 stars for…", no gating features on a rating). A plain
  "Enjoying GFD? Rate it" after real use is fine and must be dismissable.
- **L4. Content rating questionnaire and Target audience** are answered honestly and redone when a feature changes
  the answers (for example chat between users or sharing with other people).

### Content, people and families

- **C1. Adults only (18+), enforced by a neutral age screen** ([Families](https://support.google.com/googleplay/android-developer/answer/9893335)).
  Play Console Target audience is **18+ only**. Picking any age group under 18 (13–15, 16–17) puts the whole
  [Families policy](https://play.google.com/about/families/children-and-families) on GFD: everything a child could see
  must suit children, any ads must come from certified networks, and every SDK must meet COPPA, GDPR-K (parental
  consent under 13–16 depending on the country), POPIA (a child is under 18; a parent must consent) and the UK
  Children's Code. Health data, progress photos and subscriptions for teens make that a big job, so we don't.
  How it's enforced: every new account gives its birth year (`ageFieldHtml` / `ageError` in `consent.js`) on the email
  sign-up form and on the terms screen a new Google account gets. The field starts empty, says nothing about the limit,
  and an under-age answer only hears "Sorry, you can't create a GFD account": the device is then blocked from making
  accounts, and a new Google account is signed out with its deletion requested. The year never leaves the phone.
  `MIN_AGE` (consent.js), `site.json` `min_age` and the Play answer must always match (the test checks the first two).
  Never market to children: no cartoon kids, school or toy themes in the listing or app.
  Lowering the age is Deon's decision and needs the full Families rules added here first.
- **C2. User-generated content.** Suggestions and custom exercises are private today. Anything that lets people see
  each other's content (couple plan, coach mode, sharing) needs a report button, a way to block, moderation and
  terms that forbid abuse, before it ships.
- **C3. AI-generated content.** If an AI feature is added, people must be able to report offensive output in the app,
  and it must not give medical advice (H1).
- **C4. Our own art and words.** Exercise illustrations are original; no copyrighted images, music, gym or
  equipment brand logos, or another app's look.
- **C5. No impersonation.** "Sign in with Google" follows Google's button rules; nothing suggests GFD is made by or
  endorsed by Google or a gym brand.

### Functionality and spam

- **F1. More than a website in a box.** The app keeps working offline from first open and keeps its native features
  (rest alert, back button, share sheet). Don't strip these out.
- **F2. Stable and honest.** No crashes on launch, no broken buttons, no fake "coming soon" screens behind paywalls,
  no hidden behaviour that differs from the description.
- **F3. Reviewers can get in.** Play Console › App access has a working review account with sample data.

## Before each Play release (checklist for the release PR)

1. `node --test tests/*.test.js` passes (includes `tests/play-policy.test.js`).
2. Privacy policy has no draft banner; its providers list matches what the release uses.
3. Data safety form in Play Console matches `docs/store-listing.md`.
4. Store text checked against L1 and H2; new screenshots if screens changed.
5. Offer screen checked against P4–P6 on a real phone; Manage or cancel opens Google Play.
6. Account deletion works end to end on that build (the daily deletion job is set up).
7. `targetSdkVersion` meets Play's current deadline.

## Audit, 11 November 2026

Checked `dev` and open PRs #55–#60 against every section of the policy. Not applicable: gambling, financial services,
blockchain, news, government, Android TV/Wear/Auto/XR, instant apps, Families ads.

| Area | Status | Notes |
| --- | --- | --- |
| Payments: Play Billing in app, Paddle web only (P1) | OK | PR #55 gates Paddle on `!platform.native` and leaves its SDK out of the app build |
| Payments: no route from app to web checkout (P3) | Fixed here | Policy pages opened from the app linked back to the web app, which sells Pro through Paddle |
| Subscriptions: offer screen disclosure (P4) | Gap, in PR #55/#56 | The offer screen shows price and period but not "renews automatically until you cancel" or how to cancel. Add before Play billing ships |
| Subscriptions: manage/cancel in settings (P5) | OK (PR #56) | Profile › Your plan › Manage or cancel opens Google Play subscriptions |
| Privacy policy content (D1) | Fixed here, one gap left | Named the real host (Hetzner), email (Brevo, ImprovMX), RevenueCat data, Android section. Still a draft: postal address empty in `site.json` |
| Privacy policy linked in app (D2) | OK | More, sign-up agreement, health sheet |
| Account deletion (D7) | OK in code, not yet running | Needs Deon's secrets for the daily deletion job (WP8 notes) |
| Health disclaimer (H2) | Fixed here | Added to More, the health details sheet and the store description |
| Permissions (A1) | OK | Only INTERNET in our manifest; the notifications plugin adds notifications, `SCHEDULE_EXACT_ALARM`, vibrate, boot |
| Target API (A6) | OK | Targets 36 |
| Ads, SDKs, UGC, AI, IP | OK | No ads or trackers; UGC is private; no AI features |
| Package name | Being changed | Play Console is locked to `co.za.getfitdaily.app`; the code still says `com.getfitdaily.app` until the rename PR lands |
| Audience / Families | Fixed here | Play Console had 13+; set it to 18+ only. App, terms and privacy now 18+ with a neutral age screen at sign-up |
| Trader status (Play Console) | Deon | Play shows a trader's address, phone and email on the listing in the EU: use business contact details |
