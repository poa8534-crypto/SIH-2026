# NAVIS — Demo Video Script (three roles, three devices)

**Problem Statement SIH26122 · Oil India Limited · Team NamasteByte**
Target length **5:30** (a 3:00 cut is marked at the end of each act).
Format: **ON SCREEN** = what you click. **VOICEOVER** = what you say over it.

> Every screen, label and number in this script was read off the running
> application on **2026-09-12**, after `python scripts/reset_demo.py`.
> Read `## Numbers` and `## Landmines` before you hit record — two of the
> landmines will end a take.

---

## 0 · Setup before you record

### Run it this way (not `START_DEMO.bat`)

Two terminals from the project root:

```bash
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000
```

```bash
cd frontend && npm run dev
```

Then reset the data so every number in this script matches your screen:

```bash
python scripts/reset_demo.py
```

| Device | Open | Role to pick |
|---|---|---|
| Phone | `http://<laptop-ip>:5173` | Field Supervisor |
| Laptop | `http://localhost:5173` | Project Manager / Planner |
| Desktop | `http://localhost:5173` | Senior Management |

Get `<laptop-ip>` with `ipconfig` (the Wi-Fi IPv4 address). All three devices
must be on the same Wi-Fi, and `frontend/.env` must **not** exist — if it does,
delete it and restart `npm run dev`, or the phone will call itself and every
screen will be empty.

Because the three devices each hold their own role, **you never switch roles on
camera.** Each device stays in its lane for the whole video.

### Why not port 8000

`http://localhost:8000` serves the API. It can also serve the built UI, but
then two screens collide with API routes: **`/schedule` and `/raid` return raw
JSON instead of the app** if you type the URL or refresh the page. On :5173
there is no collision. `START_DEMO.bat` also does not set `SERVE_FRONTEND=1`,
so `http://localhost:8000` shows `{"detail":"Not Found"}` — do not open it on
camera.

### Voice on the phone

Browser speech needs a secure context. On `http://<ip>:5173` the phone will
show **"Microphone unavailable — Typing works just as well"**, which is a
designed state, not an error. Two honest options:

- **Type on the phone** and narrate it as *"speak it, or type it"* — the
  screen literally offers both. Simplest, always works.
- **Record the mobile act on the laptop** in Chrome device emulation
  (F12 → device toolbar → iPhone 12 Pro) at `http://localhost:5173`, where
  `localhost` is a secure context and the mic works. Cleanest capture too.

Pick one before you record. Do not say "voice" while typing without saying you
can do both.

---

## ACT 1 — FIELD SUPERVISOR · phone · 1:30

Start with the phone filling the frame, app already open on **Home**.

### Scene 1.1 — the problem, on the device where it starts · 0:20

**ON SCREEN**
Hold on the Home screen. Let the header read: `Well Pad 04 · …`, the green
**Online** chip, the **EN** language chip. Scroll down one thumb-flick so
**QUICK PRESETS** and **CURRENT CONTEXT** pass through frame, then scroll back.

**VOICEOVER**
> "This is a site supervisor at an Oil India well pad, at the end of a shift.
> Today his progress goes into a paper diary, a WhatsApp message, or a
> spreadsheet somebody types up on Monday. By the time it reaches the plan, it
> is a week old and nobody can prove where the date came from.
> This is what NAVIS gives him instead — one box, and one question:
> *what happened on site today?*"

### Scene 1.2 — plain speech in, structure out · 0:40

**ON SCREEN**
Tap **Record Voice** and speak, or tap the box and type:

> **"spool erection on the 24 inch header is done"**

Send it. The **Report Progress** sheet opens with the stepper
**1 Capture → 2 Review → 3 Submit**, and the context bar already reads
`Well Pad 04 · Sector A · Piping · Day · 07:00–17:00`.
NAVIS asks for what it does not have — **"Which date was it completed?"**
Answer **yesterday**, then give the quantity **6 out of 18**.

**VOICEOVER**
> "He says it the way he'd say it to a colleague. No activity code, no form.
> NAVIS reads the sentence: discipline is piping, the location is his own
> workfront, the status is finished — so it doesn't ask him any of that. It
> asks only for what's missing: which date, and how much. Two answers. That is
> the whole data-entry burden."

### Scene 1.3 — the card, and the refusal to overreach · 0:30

**ON SCREEN**
Press **Check report** → **Send to planner review**. Hold on the structured
card long enough for the matched activity, the date, the quantity and the
confidence to be legible. Then hold on the confirmation line and the footer
text: *the project schedule has not been changed.* Scroll to **My Recent
Updates** and let the new row show its status.

**VOICEOVER**
> "Now watch what it does *not* do. It has matched his sentence to a real
> activity in the Primavera baseline, and it shows you its confidence in that
> match. It is not certain enough — so it refuses to write the schedule. The
> screen says it plainly: this has been sent for planning review, and the
> project schedule has not been changed. A field report is evidence. It is
> never, on its own, a commitment."

> **3:00 cut** — drop Scene 1.1 to two sentences over the same shot.

---

## TRANSITION 1 → the laptop

**ON SCREEN**
Hold two seconds on the phone's confirmation, then cut — phone shot on the
left of frame shrinking out, laptop screen filling in, or a hard cut on the
word "queue".

**VOICEOVER**
> "So where did it go? Two hundred kilometres away, on the planner's desk."

---

## ACT 2 — PROJECT MANAGER / PLANNER · laptop · 2:00

Laptop is already signed in as **Project Manager**, sitting on **Overview**.

### Scene 2.1 — the state of the project, evidence-first · 0:30

**ON SCREEN**
Top of **Overview**. Let the header read `OIL Well-Site Duliajan · 120 Schedule
Activities · 6 Disciplines`, the **LIVE UPDATING** chip, `Data Date 2026-09-15`,
`Baseline: P6 Rev-08`. Gesture across the four tiles — **Planned 67%**,
**Actual 61%**, **Variance −6%**, **At-risk 12** — then the line underneath:
`198 pending reviews · 34 require manual decision · 9 source conflicts ·
0 failed imports`.

**VOICEOVER**
> "The planner's side. A hundred and twenty L5/L6 activities, six disciplines,
> one read-only Primavera baseline. Planned progress against actual progress,
> and the gap between them — six per cent behind, and the reason is written
> underneath, not guessed at. And notice the honest line: a hundred and
> ninety-eight items are waiting for a human. That is not the system failing.
> That is the system declining to guess."

### Scene 2.2 — the supervisor's report, on the planner's desk · 0:40

**ON SCREEN**
Click **Review & Reconcile** in the sidebar. Header reads **198 PENDING**.
Click the **Field Reports** filter chip and open the item the phone just sent.
In the right pane, walk the three columns with the cursor: **what the
supervisor said** → **why NAVIS chose this link** → **Candidate Activities**.
Land on the named signals in the decision panel.

**VOICEOVER**
> "Here is the update he just sent, on the planner's desk within seconds — no
> email, no re-typing. And here is the part that matters to an auditor: the
> planner is not asked to trust a black box. The left column is exactly what
> the supervisor said. The middle column is *why* NAVIS proposed this
> activity — named signals. Tag overlap. Discipline match. Inside the planned
> window. Not an opinion from a language model, a score she can argue with.
> And she gets the runners-up, not just the winner."

### Scene 2.3 — the only place a date gets committed · 0:30

**ON SCREEN**
Press **Confirm Match**. Let the queue count drop. Then click **Schedule** in
the sidebar — **from the sidebar, never the URL bar** — find the activity and
open its **audit drawer**. Scroll the drawer to the footer:
`APPEND-ONLY · NEVER EDITED`.

**VOICEOVER**
> "She confirms. *That* is the moment the schedule changes — one role, one
> route, one decision. And it leaves a trail: every actual date carries the
> file it came from, the line it came from, the confidence, and who approved
> it. This log is append-only. A correction writes a new row; nothing is ever
> silently overwritten. If a contractor disputes a date eighteen months from
> now, this is the answer."

### Scene 2.4 — the thing a spreadsheet cannot do · 0:20

**ON SCREEN**
Back to **Overview**, scroll to the **Source Conflicts Require Reconciliation**
panel. Hover one row so both sides — the daily report and the spreadsheet —
are visible with their file names.

**VOICEOVER**
> "One more. Two sources reported the same activity and disagreed — a daily
> diary against a discipline spreadsheet. A spreadsheet would have kept
> whichever was pasted in last and shown you nothing. NAVIS quarantines the
> disagreement, names both files, and puts it in front of a human."

> **3:00 cut** — keep 2.2 and 2.3; compress 2.1 to the four tiles, drop 2.4.

---

## TRANSITION 2 → the desktop

**ON SCREEN**
Hold on the audit drawer, then cut to the desktop already on the executive
**Overview**.

**VOICEOVER**
> "One field sentence is now a verified, sourced, approved actual date. Step
> back one altitude, and a hundred of those become a decision."

---

## ACT 3 — SENIOR MANAGEMENT · desktop · 1:20

Desktop is signed in as **Senior Management**, on **Overview**.

### Scene 3.1 — governance sees everything and approves nothing · 0:30

**ON SCREEN**
Top of the executive **Overview**. Four tiles: **Schedule Performance**,
**Critical Path Drift +14d** with its COD exposure date, **FIDIC Dispute
Exposure — Clause 20.1**, **Evidence Integrity 38.3% · 46 of 120**. Then point
the cursor at the sidebar and run it down the eight destinations without
clicking.

**VOICEOVER**
> "Senior management. Same data, different question — not *what happened
> today*, but *will we hand this over on time, and can we defend it*. Float
> erosion on the critical path. Statutory notice exposure under FIDIC clause
> twenty-point-one. And evidence integrity: how much of this project is
> actually backed by a field report.
> Notice what is missing from this sidebar. There is no review queue. This
> role can see everything and approve nothing — because an executive who can
> approve a progress update has just bypassed the one person accountable for
> the plan."

### Scene 3.2 — exceptions, not dashboards · 0:25

**ON SCREEN**
Scroll to **Material Exceptions & Required Management Attention · 4 Exceptions
Active**. Read across the four cards. Click **Inspect Supporting Evidence** on
one and let it land.

**VOICEOVER**
> "It does not hand a director a dashboard to interpret. It hands them four
> exceptions, ranked by criticality and by statutory deadline — and every one
> of them clicks through to the field evidence underneath it. From a board
> slide to the line of a supervisor's report, in one click."

### Scene 3.3 — the close · 0:25

**ON SCREEN**
Go to **Forecasts**. Run the what-if: add the weather scenario, let
**Simulated Completion Delta** update, press **Reset to Baseline**. Then
**Data Confidence** and stop on **WHAT THIS CORPUS DOES NOT ESTABLISH**. Hold
there for the last line.

**VOICEOVER**
> "They can ask *what if the monsoon costs us another fortnight* and get the
> completion impact without touching the schedule — the model is a scenario,
> not a commit.
> And then this. Every prototype claims accuracy. This one ships its own
> limits on screen, rendered from the data itself — what this corpus does
> *not* establish. Because in a PSU capital project, a number you cannot
> defend is worse than no number at all.
> NAVIS. A sentence from the field, matched, reviewed, committed, and
> auditable — from the man in the mud to the board pack. Thank you."

> **3:00 cut** — keep 3.1 and 3.3; drop 3.2.

---

## Numbers

Quote these with the wording given. Everything else, read off the screen.

| Number | Say it exactly like this |
|---|---|
| 120 activities | "the demo project baseline — 120 L5/L6 activities, six disciplines" |
| 198 review items | "what this run produced — the system declining to guess" |
| 100% auto-link precision | "on our evaluation corpus, zero wrong auto-links — and it holds on the held-out test split too" |
| 71.4% top-1 | "our honest held-out number, on the harder v2 corpus" |
| 88.1% Recall@3 | "the correct activity is in the planner's top three 88% of the time — 100% on ordinary text" |
| 1,284 tests | "1,055 Python, 229 TypeScript — run them on this laptop now" |

**Never say, in the video or in Q&A:**

- ❌ "The system learns from planner corrections." It stores them; it does not
  read them back. (`w_alias = 0.0`.)
- ❌ "We import Primavera files." Export is PMXML and works. **Import is not
  implemented.**
- ❌ "Offline-first PWA / offline voice queue." There is no service worker and
  no offline queue.
- ❌ "1,431 tests", "96.7%", "99.8%", "Recall@20 is 100%".
- ❌ Any accuracy figure without naming the corpus.

**If a judge notices the two SPI figures** (planner shows SPI 0.91, executive
shows 0.35) — they are different measures and you should say so first:
*"The planner tile is duration-weighted physical progress. The executive tile
is earned value, and earned value only counts activities a field report has
actually evidenced — 74 of 120 have none yet, so they score zero. That is why
we print the evidence-coverage number right next to it."*

---

## Landmines

1. **Never type a URL or refresh on the Schedule screen.** On port 8000
   `/schedule` and `/raid` return raw JSON. Navigate by clicking the sidebar.
   (Recording on :5173 as set up above avoids this entirely.)
2. **Do not open `http://localhost:8000` on camera.** No UI is served there
   unless `SERVE_FRONTEND=1` is set; you will film a 404.
3. **Do not export XER.** The dropdown offers it; PMXML is the default and the
   one that works.
4. **Reset before every take** — `python scripts/reset_demo.py` — or the
   counts on screen will not match this script.
5. **Do not drop a `.csv` or an unknown file on Ingest** unless you mean to. It
   is a clean, honest error, but it is not in this script.
6. The role lives in browser storage, one key per device. A data reset does not
   change it. If a device lands on the picker mid-take, re-pick the role —
   nothing was lost.
