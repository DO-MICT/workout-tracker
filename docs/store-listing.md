# Google Play store listing (draft, WP10 / F5.E5.S4)

Draft text for Play Console → Grow → Store presence → Main store listing, and the App content answers.
Plain, friendly English; metric units. Check against the brand guide and the privacy policy before submitting.
Gaps marked **TODO** wait on Deon (domain, owner details, pricing in the listing).

## Main store listing

**App name** (30 max): `GFD · Get Fit Daily`

**Short description** (80 max):
`Plan your gym week, log every set fast, and watch your strength go up.`

**Full description** (4,000 max):

```
GFD is a workout planner and logger for people who train in a gym, at home or both.
Great Form and Discipline: show up, log it, get stronger.

PLAN YOUR WEEK
• Start from a ready-made plan (5-day split, full body, bro split) or build your own day by day
• Over 1,000 exercises with form cues, and illustrations of the start and end position for the most popular ones
• Tell GFD where you train and what gear you have; it only suggests exercises you can actually do
• Swap any exercise for another that works the same muscles

LOG FAST, EVEN OFFLINE
• Weights and reps pre-filled from last time, so most sets are one tap
• Rest timer with a sound and an alert when rest is over, even with the screen off
• Supersets and circuits
• Works without signal in the gym; everything syncs when you're back online

SEE YOUR PROGRESS
• Personal records, and every session for each exercise on a chart
• Body check-ins: weight and measurements with progress over time
• History of every workout, which you can fix if you typed something wrong

YOUR DATA IS YOURS
• No ads, no ad trackers
• Download all your data as a spreadsheet-friendly ZIP at any time
• Delete your account from inside the app

GFD Pro: unlimited plans, full stats and more. Try Pro free for 14 days, no card needed.
The free plan keeps up to 3 plans.
```

Check before submitting: the Pro and free-plan lines describe WP12 and WP14, so keep them only once those are live,
and the illustration line only claims what is drawn (81 exercises live in Nov 2026).

**App category**: Health & Fitness. **Tags**: Workout tracker, Gym, Strength training.
**Contact email**: TODO (`hello@<domain>` from `site.json`). **Website**: TODO (domain) or the GitHub Pages address.
**Privacy policy URL**: `<site>/privacy.html` (must be published without draft gaps first, WP7).

**Graphics** (TODO, from the brand guide):
- App icon 512×512: `icons/icon-512.png` (already in the repo).
- Feature graphic 1024×500: volt plate logo on ink, tagline "Great Form and Discipline".
- Phone screenshots (2–8, 9:16, at least 1080 px wide): today's workout with sets, rest timer, plan builder,
  exercise illustration, progress chart, body check-in. Take them from the debug APK with a demo account in dark mode.

## App content answers

| Section | Answer |
| --- | --- |
| Privacy policy | `<site>/privacy.html` |
| Ads | No, the app has no ads |
| App access | Sign-in needed: give review a test account (email + password) with a plan and a few workouts |
| Content rating | Questionnaire: reference/health-and-fitness; no violence, user-to-user chat, gambling or location sharing → expected rating Everyone / PEGI 3 |
| Target audience | 16 and over (matches `min_age` in `site.json`; change both if Q12 lands on 13) |
| News app | No |
| Health apps | Fitness (workout logging). Not a medical device |
| Financial features | None |
| Government app | No |
| Data deletion | In-app: Profile › Delete my account. Web: `<site>/delete-account.html` |

## Data safety form

Data is encrypted in transit: **Yes**. People can ask for their data to be deleted: **Yes**.
Data is not sold, not used for ads, not shared with third parties (processors acting for us don't count as sharing).

| Data type (Play's names) | Collected | Optional? | Purposes |
| --- | --- | --- | --- |
| Personal info › Email address | Yes | Required | Account management, App functionality |
| Personal info › Name | Yes | Optional (display name) | App functionality |
| Health and fitness › Fitness info | Yes | Required for the app to be useful | App functionality |
| Health and fitness › Health info | Yes | Optional (only with health details switched on) | App functionality |
| Photos and videos › Photos | Yes | Optional (progress photos, feedback screenshots) | App functionality, Developer communications |
| Financial info › Purchase history | Yes (from WP12) | Required for Pro | App functionality, Account management |
| App activity › App interactions | Yes | Required | Analytics (anonymous counts, no account id) |
| App info and performance › Crash logs | Yes | Required | Analytics (scrubbed error reports) |
| Device or other IDs | Yes | Required | Analytics (random install id, not the advertising id) |
| Messages › Other in-app messages | Yes | Optional (suggestions/feedback) | Developer communications |

Not collected: location, contacts, calendar, files and docs, audio, web browsing, SMS, call logs.
The rest timer's alert is a local notification set on the phone; no push service and no data leaves the phone for it.

## Permissions the app asks for

| Permission | Why |
| --- | --- |
| Internet | Sign-in and sync |
| Notifications (Android 13+) | Rest-over alert; asked the first time a rest timer starts |
| Alarms and reminders (exact alarms) | So the rest alert fires on the second; Android 14+ leaves it off unless the person turns it on |
| Vibrate | Buzz when rest ends |
| Run at startup | Keeps a pending rest alert after a phone restart (part of the notifications plugin) |
