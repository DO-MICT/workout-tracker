# GetFitDaily (GFD) — User Acceptance Testing (UAT) Guide

**Version:** 2.0 (draft) · **Test site:** https://dev.getfitdaily.co.za · **Audience:** testers, stakeholders, product owner

**What changed in v2 (UAT 6.1):** setup is now three steps (Location, Equipment, Your plan) and the four questions are gone. Equipment can be skipped; until you pick some, every exercise shows. "Gear" is now called **Equipment** everywhere. Swap options are labelled Easier, Similar or Harder. Scripts ONB-01 to ONB-03, BLD-03, REC-02, LOC-01 and LOC-02 are updated, and ONB-04 and ONB-05 are new.

---

## 1. Welcome & Purpose of UAT

Thank you for helping test GetFitDaily! 🎉

**What is UAT?** User Acceptance Testing is the last check before an app goes live. You are not here to read code or hunt for technical glitches. You are here to answer one question: *"Can a real person use this app to do what they need to do, easily and correctly?"*

You'll do everyday things such as setting up an account, building a workout, logging a session, recording your weight and checking your progress. Then you'll tell us whether it worked and felt right.

**Goal of this cycle:** Confirm that the core journeys of GetFitDaily work as a normal user expects on a **phone**, so the release can be approved with confidence.

**Good to know**
- There are no "wrong" answers. If something confuses you, that is useful feedback, even if nothing is broken.
- **Test on your phone's browser** (Chrome on Android or Safari on iPhone). **Desktop view is out of scope**. If you see odd layouts on a computer, please ignore them.
- Use the **dev (test) site only**. Anything you enter here is practice data, not real data.

---

## 2. Schedule & Milestones

| Milestone | What happens | Owner | Start date | End date |
|---|---|---|---|---|
| Testing Kickoff | Walkthrough of this guide, accounts handed out, Q&A | Product Owner | `[DD/MM/YYYY]` | `[DD/MM/YYYY]` |
| Execution Window | Testers work through all scenarios (Section 6) | Testers | `[DD/MM/YYYY]` | `[DD/MM/YYYY]` |
| Bug Triage & Fixes | Reported issues are rated, assigned and fixed | QA Lead + Developer | `[DD/MM/YYYY]` | `[DD/MM/YYYY]` |
| Retesting | Testers re-check every fixed issue | Testers | `[DD/MM/YYYY]` | `[DD/MM/YYYY]` |
| Final Sign-Off | Go / No-Go decision and signatures (Section 8) | Sign-Off Approver | `[DD/MM/YYYY]` | `[DD/MM/YYYY]` |

---

## 3. Roles & Responsibilities

| Role | Who | What they do |
|---|---|---|
| **Tester** | `[Names]` | Runs the test scripts on their phone, records Pass/Fail, reports problems using the template in Section 7, retests fixes. |
| **QA Lead / Triage Owner** | `[Name]` | Checks each report is clear, removes duplicates, sets severity, assigns it to a developer, tracks progress. |
| **Developer (Bug Fixer)** | `[Name]` | Fixes assigned issues on the dev site and tells the QA Lead when a fix is ready to retest. |
| **Product Owner** | `[Name]` | Answers "is this a bug or intended?", decides priority when opinions differ, runs the kickoff. |
| **Sign-Off Approver** | `[Name]` | Reviews results against the exit criteria and signs the Go / No-Go in Section 8. |

---

## 4. Entry & Exit Criteria

### Entry criteria (testing starts only when all are true)
- [ ] The latest build is deployed to **dev.getfitdaily.co.za** and the site loads on a phone.
- [ ] Every tester has a phone, an internet connection and a working email address they can open.
- [ ] Testers have read this guide and attended the kickoff.
- [ ] A bug-tracking board is ready and every tester can add to it (Section 7).
- [ ] No known Blocker issue is open from earlier smoke testing.

### Exit criteria — Go / No-Go
The release is a **GO** only if **all** of these are true:
- [ ] 100% of test scripts in Section 6 have been run at least once.
- [ ] **0** open Blocker issues.
- [ ] **0** open Major issues (or each has a written workaround accepted by the Product Owner).
- [ ] Minor and Cosmetic issues are logged. Any still open have been reviewed and accepted for a later release.
- [ ] Every fixed Blocker and Major issue has been **retested and passed**.
- [ ] At least **95%** of scripts are marked Pass after retesting.
- [ ] The Sign-Off Approver has signed Section 8.

Otherwise the decision is **NO-GO**, and the team agrees a new retest date.

---

## 5. Environment Setup & Pre-conditions

### Step 1 — Get ready
1. Use your **phone**, with Chrome (Android) or Safari (iPhone), updated to the latest version.
2. Turn on mobile data or Wi-Fi.
3. Keep a screenshot tool handy (press the power and volume buttons together on most phones).

### Step 2 — Open the test site
1. Go to **https://dev.getfitdaily.co.za**.
2. Check you see the GFD sign-in or welcome screen. If the page shows an error, report it immediately as a Blocker.

### Step 3 — Create your test account
1. Use the account details given at kickoff, or register with an email you control.
   Suggested format: `uat.yourname+1@gmail.com`.
2. If a sign-in email or code is sent, open it on the same phone and follow the link.
3. Write your login in the Tester Log: `[Tester name] · [email] · [date]`.

> ⚠️ Never use a real or important password. This is a test site and data may be wiped between rounds.

### Step 4 — Test data to have ready
| Item | Value to use |
|---|---|
| Starting weight | Any realistic number, e.g. `82.5 kg` |
| Body tape measurements | Waist `88 cm`, Chest `102 cm`, Hips `100 cm` |
| New location name | `Garage Gym` |
| Equipment at that location | A set of dumbbells, a bench, a pull-up bar |
| Plan name | `UAT Push Day` |

### Step 5 — Reset between scenarios
Some scripts need a **brand-new user**. Use a fresh email (`uat.yourname+2@gmail.com`) when a script says "New user".

### Getting around the app
The bottom bar has five tabs: **Plans · Stats · Workout (big centre button) · Equipment · More**.

### Pre-conditions summary
| Script group | You need |
|---|---|
| ONB (Onboarding) | A **new** email, not used before (ONB-04 and ONB-05 need another new email each) |
| BLD, REC | A finished onboarding (a plan and one location exist) |
| BDY | A signed-in account |
| LOC | A signed-in account |
| STA | At least **2 finished workouts** and **2 weigh-ins** (do REC and BDY first) |

---

## 6. Step-by-Step Test Scenarios

**How to use:** Run each script in order. Tick one result per script (✅ Pass · ❌ Fail · ⚠️ Pass with notes). If it fails, log a bug (Section 7) and write the bug number in the Notes column.

**Role for all scripts:** *Standard user* (the only role in this release).

---

### 6.1 User Onboarding

Setup has three steps: **Location**, **Equipment**, **Your plan**. A bar at the bottom of the screen holds the buttons (Back or Skip on the left, Next on the right) and stays in place while the page scrolls.

#### ONB-01 · New user completes setup (happy path)
**Role / Pre-conditions:** Standard user. **New** email. Fresh phone browser tab.

| # | Action | Expected Result |
|---|---|---|
| 1 | Open dev.getfitdaily.co.za. | **Given** I am new, **when** the site opens, **then** I see a welcome / register screen. |
| 2 | Register with your new email and follow any sign-in step. | I am signed in and taken to setup, not to an error. |
| 3 | On **Add your location**, type `Home`, then tap **Next**. | The screen says "Step 1 of 3 · Location". Name suggestions (Gym, Home, Hotel...) are shown. The name is accepted and I move on. |
| 4 | On **Equipment**, type "dumbbell" in the search box. | The screen says "Step 2 of 3 · Equipment". Search narrows the list. Equipment is in groups (Weights and Cables, Benches, Bars, Machines, Cardio, Other). **Bodyweight** is always on. |
| 5 | Tap dumbbells, a bench and a pull-up bar so they are marked, then tap **Next**. | Chosen items are clearly marked. I move to **Your plan**. |
| 6 | On **Your plan**, tap **Use a default plan**, choose one plan, then tap **Start training**. | I see two choices only: "Use a default plan" and "Build my own". The plan list has no "best fit" pick. After I confirm I land on my workout screen. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### ONB-02 · Setup can be left and resumed (edge case)
**Pre-conditions:** New user, midway through setup.

| # | Action | Expected Result |
|---|---|---|
| 1 | Finish the Location step, then close the browser tab while on **Equipment**. | — |
| 2 | Reopen dev.getfitdaily.co.za and sign in. | **Then** setup continues on the **Equipment** step, and my location name is kept. |
| 3 | Tap **Next** to reach **Your plan**, then close the tab again and reopen. | Setup continues on **Your plan**. |
| 4 | On **Your plan**, tap **Use a default plan** to open the plan list. On Android, press the phone's back button. In a browser, tap **Back**. | I return to the two choices (Use a default plan, Build my own). The app stays open. |
| 5 | Press the phone's back button (or tap **Back**) again. | I am on **Equipment**. Equipment is marked as before. A **Back** button sits beside Skip and Next, and all three are the same height. |
| 6 | Press back once more. | I am on **Location**, and my name is kept. |
| 7 | Press the phone's back button on **Location**. | On Android the app minimises, as if I pressed Home. Opening it again shows **Location**. In a browser there is no phone button, so skip this step. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### ONB-03 · Invalid sign-in details and blank location (error case)
**Pre-conditions:** On the register / sign-in screen.

| # | Action | Expected Result |
|---|---|---|
| 1 | Enter an invalid email such as `abc@` and try to continue. | A clear, friendly message ("Enter a valid email.") tells me what is wrong. I am not signed in. |
| 2 | Leave the email empty and try to continue. | The same kind of message appears. Nothing crashes. |
| 3 | In setup, clear the location name (or type only spaces) and tap **Next**. | The app keeps the default name ("Default") and moves on. It does not save a blank location. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### ONB-04 · Skip location and equipment (edge case)
**Pre-conditions:** A **new** email (different from ONB-01).

| # | Action | Expected Result |
|---|---|---|
| 1 | Register, then on **Add your location** tap **Skip**. | I move to **Equipment**. The location is called "Default". |
| 2 | On **Equipment** tap **Skip**, then on **Your plan** choose **Use a default plan**, pick one and tap **Start training**. | I land on my workout screen. |
| 3 | Open the **Equipment** tab. | It says nothing is picked yet and every exercise shows. |
| 4 | Open a workout day and look at the exercises, swap options and the plan list. | No exercise is locked, and no "needs equipment you don't have" warning appears anywhere. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### ONB-05 · Build my own at the end of setup (alternative path)
**Pre-conditions:** A **new** email (different from ONB-01 and ONB-04).

| # | Action | Expected Result |
|---|---|---|
| 1 | Register and go through Location and Equipment (any choices). | I reach **Your plan**. |
| 2 | Tap **Build my own**, then tap **Next**. | The plan builder opens and asks for the days I train. |
| 3 | Cancel the builder. | I come back to setup on **Your plan**. Setup is not finished yet. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

---

### 6.2 Workout Builder

#### BLD-01 · Build my own workout plan (happy path)
**Pre-conditions:** Finished onboarding.

| # | Action | Expected Result |
|---|---|---|
| 1 | Tap **Plans** in the bottom bar. | My current plan is listed. |
| 2 | Start a new plan / workout (e.g. "Build my own"). | The builder opens. |
| 3 | Name it `UAT Push Day`. | The name is shown. |
| 4 | Add 3 exercises (e.g. bench press, shoulder press, triceps). Use the filters or search to find them. | Each exercise appears in the list with a picture or diagram. |
| 5 | Set sets, reps (and weight if asked) for each. | Numbers can be typed on the on-screen keypad. They show correctly. |
| 6 | Save. | **Then** `UAT Push Day` appears in Plans with 3 exercises. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### BLD-02 · Edit and reorder a workout
**Pre-conditions:** `UAT Push Day` exists.

| # | Action | Expected Result |
|---|---|---|
| 1 | Open `UAT Push Day` and edit it. | Edit mode opens with my exercises. |
| 2 | Remove one exercise and add a different one. | The list updates straight away. |
| 3 | Save, leave the screen, come back. | The changes are still there. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### BLD-03 · Exercise not suited to my equipment (edge case)
**Pre-conditions:** A location exists with **only** dumbbells picked. (A location with no equipment picked shows every exercise, so use one with dumbbells set.)

| # | Action | Expected Result |
|---|---|---|
| 1 | In the builder, look for a machine-only exercise (e.g. a cable exercise). | The app shows it as unavailable at this location, or warns me, rather than silently adding it as if I can do it. Bodyweight exercises are always shown. |
| 2 | Try to save a workout with **no** exercises. | The app stops me or asks me to add one. No empty, broken workout is created. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

---

### 6.3 Workout Recording

#### REC-01 · Do and finish a workout (happy path)
**Pre-conditions:** A plan with today's workout exists.

| # | Action | Expected Result |
|---|---|---|
| 1 | Tap the big **Workout** button in the centre of the bottom bar. | Today's workout shows its exercises. |
| 2 | Open the first exercise. | I see how to do it (picture/diagram) and set rows. |
| 3 | Enter reps and weight for each set, and mark each set done. | Each set shows as done. Numbers match what I typed. |
| 4 | Do the same for the other exercises. | Progress is clear throughout. |
| 5 | Finish the workout. | **Then** I see a completion summary. The session is saved. |
| 6 | Open **Stats** (History). | The workout appears for today with the correct exercises and numbers. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### REC-02 · Change or swap an exercise mid-workout
| # | Action | Expected Result |
|---|---|---|
| 1 | During a workout, swap an exercise for another (use the swap/replace option). | A suitable alternative is offered, and each option is tagged **Easier**, **Similar** or **Harder** than the exercise I am swapping. After swapping, the new exercise is in today's list. |
| 2 | Add a note to the workout. | The note is saved and shown after finishing. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### REC-03 · Unusual entries and interruptions (edge case)
| # | Action | Expected Result |
|---|---|---|
| 1 | Enter an unrealistic value, e.g. `0` reps, a negative number or `99999` weight. | The app rejects it or limits it. It does not save nonsense or crash. |
| 2 | Halfway through a workout, close the browser and reopen it. | My completed sets are still there. |
| 3 | Switch phone to airplane mode, log a set, then switch back on. | The app handles it gracefully (a message, or it saves and syncs). **Note exactly what you saw.** |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

---

### 6.4 Weigh-ins & Body Measurements

#### BDY-01 · Record a weigh-in (happy path)
| # | Action | Expected Result |
|---|---|---|
| 1 | Find the weigh-in / measurements option (try **Stats** or **More**). | I find it without help. (If not, note where you looked.) |
| 2 | Enter your weight, e.g. `82.5`. | The number shows as typed, in **kg**. |
| 3 | Save. | **Then** it appears with today's date. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### BDY-02 · Record body measurements
| # | Action | Expected Result |
|---|---|---|
| 1 | Open body measurements. | A list of spots is shown (neck, chest, waist, hips, thighs, etc.). |
| 2 | Open **Waist** and read the tip. | A clear how-to-measure tip and picture are shown. |
| 3 | Enter waist `88`, chest `102`, hips `100` (cm), then save. | All three are saved in **cm** with today's date. |
| 4 | Come back later the same day and add another weigh-in. | The new entry is added. The older one is not lost or overwritten without warning. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### BDY-03 · Invalid or missing measurements (error case)
| # | Action | Expected Result |
|---|---|---|
| 1 | Enter weight as `0`, a negative number, or letters. | The app rejects or corrects it with a clear message. |
| 2 | Enter an extreme waist such as `500`. | The app blocks it or warns. It does not silently save. |
| 3 | Save with the field empty. | Nothing is saved, or it asks me to enter a value. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

---

### 6.5 Creating a New Location

#### LOC-01 · Add a location and its equipment (happy path)
| # | Action | Expected Result |
|---|---|---|
| 1 | Tap **Equipment** in the bottom bar. | I see my current location and its equipment. |
| 2 | Tap **+ Add location**. | A box asks for a name. |
| 3 | Type `Garage Gym` and confirm. | The new location is created and selected. |
| 4 | Add equipment: dumbbells, bench, pull-up bar. | Each item shows as added. A new location starts with nothing picked, and the first pick turns filtering on for that location. |
| 5 | Switch back to your first location, then again to `Garage Gym`. | Each location keeps its own equipment. |
| 6 | Open the workout builder and pick `Garage Gym`. | Exercises shown match the equipment there. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### LOC-02 · Rename a location
| # | Action | Expected Result |
|---|---|---|
| 1 | Rename `Garage Gym` to `Home Gym`. | The new name shows everywhere (Equipment, builder, workout). |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### LOC-03 · Bad location names (edge case)
| # | Action | Expected Result |
|---|---|---|
| 1 | Try to create a location with **no name**. | A clear message appears. No blank location is created. |
| 2 | Create one with a **very long** name (30+ characters). | The name is limited or shortened, and the screen still looks right. |
| 3 | Create a location with the **same name** as an existing one. | The app stops me or handles it clearly. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

---

### 6.6 Stats View

#### STA-01 · See my progress (happy path)
**Pre-conditions:** At least 2 finished workouts and 2 weigh-ins (from REC and BDY).

| # | Action | Expected Result |
|---|---|---|
| 1 | Tap **Stats**. | A progress screen loads in a reasonable time (about 3 seconds). |
| 2 | Look at the workout history. | Every finished workout is listed with the right date and exercises. |
| 3 | Look at weight and measurement trends. | Values match what I entered. The trend moves in the right direction. |
| 4 | Open a past workout. | Sets, reps and weights match what I recorded. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### STA-02 · Stats for a brand-new user (edge case)
**Pre-conditions:** New user with no workouts or weigh-ins.

| # | Action | Expected Result |
|---|---|---|
| 1 | Open **Stats**. | A friendly "nothing here yet" message is shown. There are no errors or broken charts. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

#### STA-03 · Privacy between users (access case)
**Pre-conditions:** Two test accounts (A and B), each with different data.

| # | Action | Expected Result |
|---|---|---|
| 1 | Sign in as A and note one workout and weight. | — |
| 2 | Sign out, then sign in as B. | **Then** B sees **only** B's data, never A's. |
| 3 | Open the site in a new tab **without signing in**. | I am asked to sign in. No personal data shows. |

**Result:** ☐ Pass ☐ Fail ☐ Pass with notes  **Notes:** __________

---

### 6.7 Quick "Feels Right" Checklist (all scripts)
- [ ] Text is easy to read and nothing is cut off on my phone.
- [ ] Buttons are easy to tap with a thumb.
- [ ] Rotating the phone does not break the screen.
- [ ] Nothing took longer than ~3 seconds without showing that it was working.
- [ ] Wording is clear and friendly. I never felt lost.

---

## 7. How to Report Bugs & Feedback

### Where to log them (free options)
| Tool | Why choose it |
|---|---|
| **GitHub Issues** (free) | Best if the developers already use GitHub. Supports labels and screenshots. |
| **Trello** (free tier) | Easiest for non-technical testers. Columns: *New → Triaged → In Progress → Ready to Retest → Done*. |
| **Google Forms + Google Sheets** (free) | Simplest option. One form feeds one shared tracking sheet. |
| **Jira** (free up to 10 users) | More advanced. Good if you need proper workflows. |

**Recommendation:** Trello (or a Google Form) for a small, non-technical tester group.

### Severity matrix
| Severity | Meaning | Examples | Target response |
|---|---|---|---|
| 🔴 **Blocker** | App is unusable, or data is lost or exposed. No workaround. | Can't sign in or register. App crashes during a workout. Workout not saved. I can see another user's data. | Fix before anything else. Release is **blocked**. |
| 🟠 **Major** | An important feature is broken or gives wrong results, but there is a workaround. | Weight saves in the wrong unit. A set can't be edited. Stats show wrong totals. | Fix before release. |
| 🟡 **Minor** | Works, but is awkward or slightly wrong. | Confusing label. A button is hard to tap. Slow screen. | Fix if time allows, or plan for later. |
| ⚪ **Cosmetic** | Looks off, with no effect on function. | Misaligned text, odd spacing, typo. | Fix when convenient. |

*Not sure which one to pick? Choose your best guess. The QA Lead will confirm.*

### Bug report template (copy and paste)
```
BUG TITLE: [Short summary, e.g. "Weight not saved after tapping Save"]

TEST ID: [e.g. BDY-01]
SEVERITY (your guess): Blocker / Major / Minor / Cosmetic
TESTER NAME + DATE: 

STEPS TO REPRODUCE:
1.
2.
3.

EXPECTED RESULT: (what should have happened)

ACTUAL RESULT: (what happened instead)

HOW OFTEN: Every time / Sometimes / Once

PHONE + OS: [e.g. Samsung S23, Android 14]
BROWSER + VERSION: [e.g. Chrome 130]
SIGNED IN AS (email): 

SCREENSHOT / SCREEN RECORDING: [attach, or paste link]

EXTRA NOTES:
```

**Tips for a great report**
- One problem per report.
- Say exactly what you tapped, in order.
- A screenshot or short screen recording is worth a thousand words.
- Include any red message exactly as written.

### Feedback that is not a bug
If something is confusing, missing or could be better, log it as **Feedback** (same template, severity "n/a"). Tell us what you expected to happen.

---

## 8. Formal UAT Sign-Off Sheet

**Application:** GetFitDaily  **Build / Version:** `[_____]`  **Environment:** dev.getfitdaily.co.za
**Testing period:** `[DD/MM/YYYY]` to `[DD/MM/YYYY]`

### Results summary
| Measure | Result |
|---|---|
| Total scripts | `[   ]` |
| Passed | `[   ]` |
| Failed | `[   ]` |
| Pass rate after retest | `[   ]` % |
| Open Blockers | `[   ]` |
| Open Majors | `[   ]` |
| Open Minor / Cosmetic (accepted for later) | `[   ]` |

### Exit criteria check
| Criterion | Met? |
|---|---|
| All scripts executed | ☐ Yes ☐ No |
| 0 open Blockers | ☐ Yes ☐ No |
| 0 open Majors (or accepted workaround) | ☐ Yes ☐ No |
| All Blocker/Major fixes retested and passed | ☐ Yes ☐ No |
| Pass rate ≥ 95% | ☐ Yes ☐ No |

### Known issues accepted for release (if any)
_______________________________________________

### Decision
☐ **ACCEPTED: GO.** The build meets the agreed criteria and is approved for release.
☐ **ACCEPTED WITH CONDITIONS.** Release is approved if these are completed: ______________
☐ **REJECTED: NO-GO.** Reason: ______________ Retest date: `[DD/MM/YYYY]`

### Approvals
| Name | Role | Decision | Signature | Date |
|---|---|---|---|---|
| `[Name]` | Sign-Off Approver | ☐ Accept ☐ Reject | | |
| `[Name]` | Product Owner | ☐ Accept ☐ Reject | | |
| `[Name]` | QA Lead | ☐ Accept ☐ Reject | | |
| `[Name]` | Lead Tester / Business Rep | ☐ Accept ☐ Reject | | |

---

*Thank you for your time and honest feedback. You are helping make GetFitDaily better for everyone.* 💪
