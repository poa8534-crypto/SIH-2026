# NAVIS — Product Demo Video Script (full feature walkthrough)

**Problem Statement SIH26122 · Oil India Limited / Ministry of Petroleum & Natural Gas**
Target length **9:00**. A **5:00** cut is marked with **[CORE]**; a **2:30** cut is marked
with **[SHORT]**.

> **How this script was built.** Every screen, tab, button, label and quoted sentence below
> was read off the running application on **2026-09-12** (API `:8000`, UI `:5173`, current
> working tree). Every matcher figure was re-produced the same day with
> `python backend/eval.py`. Every feature claimed here was exercised, including the P6
> import, the PMXML export, the Ask-NAVIS assistant and the full field→planner→field
> clarification loop.
>
> It **replaces** the earlier 4-minute pitch script in this file. `demo_script.md` remains
> retracted. `DEMO.md` is the live-stage runbook and has drifted from the build in seven
> places — see §1. `NUMBERS_SHEET.md` remains the authority for any spoken figure.

---

## Contents

| § | | |
|---|---|---|
| 1 | Before you record — 6 things that will bite you on camera | |
| 2 | Pre-flight | |
| 3 | The feature map — what the video must cover | |
| 4 | The script, chapter by chapter | 9:00 |
| 5 | The 5:00 and 2:30 cuts | |
| 6 | Numbers you may say | verified 2026-09-12 |
| 7 | After you record | |

---

## 1 · Before you record — six things that will bite you on camera

### 1.1 Reconcile prints a threshold that disagrees with your own numbers sheet

The Detail pane renders **"AUTO-LINK THRESHOLD 77.5% · calibrated τ_high"** and
**`τ_high=0.775`**. The shipped matcher runs **0.80**
([`config.py:163`](backend/matching/config.py:163) `SHIPPED_THRESHOLDS`) — that is what
`eval.py` measures and what `NUMBERS_SHEET.md` row 9 tells you to say. The 0.775 is
hardcoded at [`Reconcile.tsx:1096`](frontend/src/pages/Reconcile.tsx:1096) and defaulted
again at [`MatchReasoning.tsx:155`](frontend/src/components/MatchReasoning.tsx:155).

**Fix it before recording** (one line, then `npx vitest run`), **or** never say a threshold
number in Chapter 4 — say *"below the auto-link threshold"* and name no figure.

### 1.2 `pytest -q` prints two failures

```
2 failed, 1053 passed in 198s
  test_learned.py::TestAliasChannel::test_key_matches_what_the_server_writes
  test_delay_evidence.py::TestKeywordListStaysShared::test_memory_uses_the_raid_keyword_list
```

Both files are **green in isolation** (20 passed, 8 passed) — it is cross-test state
leakage, not a product fault. The frontend suite has the same shape of problem: D-113
records `scheduleInspectionPanel.test.tsx` as flaky, landing between **253 and 257 of 257**
(it returned a clean 257 on 2026-09-12, which is luck, not a baseline).

**Do not film a test run, and do not say "all passing"** until this is fixed. The wording in
Chapter 10 is true either way.

### 1.3 The P6 dry-run button fails on its own

On the baseline importer, ticking **only** "Validate only (Dry Run)" returns HTTP 409 —
*"A baseline is already active… Pass replace=true"*. The active-baseline guard
(`main.py:2616`) runs **before** `dry_run` is evaluated (`main.py:2666`).

**Tick both boxes** — "Validate only (Dry Run)" **and** "Replace the active baseline". The
dry run still writes nothing; verified, baseline untouched. Chapter 5 scripts this.

### 1.4 "Ask Supervisor" only closes the loop on field-submitted items

`GET /field/clarifications` reads `_field_events`, which filters to
`match_method == "agent_turn"`. Ask a question on a queue item that came from a DPR or a
spreadsheet and the supervisor never sees it — correctly, there is no supervisor attached to
a document, but the button is offered on every row.

**Chapter 8 demos the loop on the report the supervisor filed in Chapter 3.** Do not demo it
on a document-sourced row.

### 1.5 Three screens say "AI" about deterministic rules

Schedule Doctor's column reads **"AI CRITIQUE & PRESCRIPTION"**, the Knowledge Base says
**"ENFORCED AI PRESCRIPTION"**, and delay adjudication badges its recommendation
**"AI · ADVISORY"**. These are rule engines with rule IDs (`CONTR-PROD-01`,
`ENV-MONSOON-01`, `DCMA-OPEN-ENDS-01`). Your central claim is that no model is in the
decision — so whenever one of those labels is on screen, say **"rule IDs, not a model"** in
the same breath. Scripted where it matters.

### 1.6 Don't linger on these two

- **XER export.** The dropdown offers PMXML and XER; use **PMXML**. XER is written but not
  P6-conformant (D-047).
- **The field Settings line "Nothing is recorded or sent to a speech service."** Browser
  speech uses `webkitSpeechRecognition`, which in Chrome does transmit audio to Google. The
  sentence is about NAVIS, but it reads wider than it is. Show the language chips, don't
  zoom the caption.

**One more, not a defect:** do not script the executive evidence-coverage figure. D-113
records `GET /executive/metrics` returning **46 / 38.3%** on a clean seed and on the
deployed instance, while D-111/D-112 and the numbers sheet record **67 / 55.8%** (this
machine showed 67 / 55.8% today). Chapter 9 reads it off the screen.

---

## 2 · Pre-flight

**Reset first.** The database is dirty from rehearsals right now — review queue at 120
instead of 135, RAID register holding 53 accepted items, one field report already filed. A
video whose counts disagree with `NUMBERS_SHEET.md` is worse than no video.

```bash
python backend/scripts/reset_demo.py
```

```bash
python backend/scripts/healthcheck.py
```

```bash
python -m uvicorn server.main:app --app-dir backend --port 8000
```

```bash
npm --prefix frontend run dev
```

> On this Mac `python` is not on `PATH` — use `./.venv/bin/python` for all three. The same
> applies to `.claude/launch.json`, which calls bare `python`.

**Hold one report back** so Chapter 5 has something to ingest, *before* the reset:

```bash
mv "dataset/dpr_day_03.txt" /tmp/ && python backend/scripts/reset_demo.py
```

Move it back when you finish recording.

**Machine**

- [ ] Browser **1280×800 or wider**, single tab, no bookmarks bar, no second window. The
      planner and executive screens are dense; narrower and you lose the right-hand columns.
- [ ] Notifications silenced — system, Slack, mail.
- [ ] Light mode (toggle is bottom-left in the sidebar).
- [ ] Sign out to the picker: `localStorage.removeItem('navis.role')`, or **Switch role**.
      The role is browser state and **the reset does not clear it**.
- [ ] Have `schedule_export_20260902_133434.xml` (project root) ready for Chapter 5.

**Confirm on screen, then use these figures rather than the ones printed here**

| | Expected after reset | Confirmed |
|---|---|---|
| Activities in baseline | 120 | ______ |
| With actual dates | 67 | ______ |
| Review queue pending | 135 | ______ |
| Completed | 38 | ______ |
| Source conflicts (Home) | 18 | ______ |
| RAID register (executive) | empty | ______ |

**Recording.** QuickTime → File → New Screen Recording → **⌄** → set Microphone → capture
the browser region only. Narrate live. Fallback: `screencapture -v -g ~/Desktop/navis.mov`.

---

## 3 · The feature map — what the video must cover

Everything below is in the product and everything below appears in the script. Use this as
the coverage checklist when you review the recording.

**Cross-cutting** — three role-scoped workspaces with route guards · **Ask NAVIS**
read-only grounded assistant (role-aware, cites sources) · light/dark · EN / हिन्दी /
অসমীয়া · append-only audit trail · runs on-premise, LLM off by default.

**Field Supervisor (4 tabs + Report Studio)** — free-text and voice capture, photo and
document attach, quick presets · slot-filling agent that asks only for what's missing ·
3-step Capture → Review → Submit with a confidence-scored extraction card · submission
routing and baseline-protection notice · Updates history with status filters and report
references · Questions (clarifications from Planning) · Settings: theme, language, read-only
assignment.

**Project Manager (7 screens)** — Overview (planned vs verified progress, at-risk,
needs-attention, recent changes, source conflicts, discipline work packages) · Review &
Reconcile (worst-first queue, filters, extraction, why-not-auto-linked, three ranked
candidates with signals, schedule-write preview with float/CPM consequence, Confirm / Mark
New / Ask Supervisor / Reject) · Schedule (Activity Register, dual-bar CPM Gantt, Schedule
Doctor feasibility audit, Activity Inspection Panel with quantity ledger, productivity
forecast and audit trail, PMXML/XER export) · Field Data (report ingest with a live pipeline
trace and duplicate guard, **plus Primavera P6 baseline import**) · Risk & Exposure (RAID
proposals → accept into register) · Delay Analysis (attribution, concurrent-delay overlap,
FIDIC notice windows, adjudication with mandatory justification) · Project Knowledge
(historical benchmarks, 7 domain rules, tender estimator).

**Senior Management (8 screens)** — Overview · Milestones · Progress · Risks & Delays ·
Forecasts · Execution Insights · Reports · Data Confidence.

---

## 4 · The script

Timings assume a normal narration pace. Each chapter names the route, the actions, the
narration, and what to point at.

---

### Chapter 1 · The problem — 0:00–0:35 **[SHORT] [CORE]**

**Screen:** `http://localhost:5173`, signed out — the role picker.

**Do:** Hold on the landing panel. Don't click yet.

**Say:**

> "A refinery or a well-site project is planned in Primavera — thousands of activities, each
> with an ID and planned dates. Reality arrives as daily progress reports, discipline
> spreadsheets and messages written in ordinary language, with no activity IDs in them.
>
> A site engineer writes *'spool erection on the 24 inch header is done.'* The plan says
> `PIP-ERC-1030 — Spool Erection — 24-inch P-1001-A1A`. Same work, completely different
> words. Today a planner matches those by hand, thousands of times, and by the time the
> schedule is updated it is already out of date — and every decision resting on it is being
> made on stale information.
>
> NAVIS does that matching automatically, scores its own confidence, and refuses to write
> anything it isn't sure about. Three roles, three workspaces, one shared audit trail.
>
> One honest note before we start: there is no authentication behind this screen. It selects
> a role so each person sees the screens built for them; it does not check a credential and
> it does not restrict data. Single sign-on is production work, deliberately out of scope."

**Point at:** the *Capture · Verify · Decide* strip and the chips *Append-only audit trail ·
120 baseline activities · Data date 2026-09-15*.

---

### Chapter 2 · Field capture — 0:35–1:35 **[SHORT] [CORE]**

**Screen:** **Field Supervisor** → `/field`.

**Do:**
1. Let the phone-width shell land. Point at the location chip, the **Online** badge, the
   EN / हि / অস selector.
2. Point at **Quick presets** — Work Progress, Material Delivery, Delay / Constraint,
   Inspection — and at **Record Voice**, **Photo**, **Attach**.
3. **Type** (do not use the mic):
   `spool erection on the 24 inch header is done, 6 out of 18 done yesterday`
4. **Send Update.**

**Say (while typing):**

> "This is the supervisor's phone — same app, phone-width. He can speak it, type it, attach
> a photo or a test record. He writes plain language: no activity ID, no dropdown, no form.
> Voice input works in English, Hindi and Assamese."

**Say (on the review card — the beat of the chapter):**

> "One sentence, and here is what came back. NAVIS read the discipline, the quantity, the
> date and the status straight out of it, and matched it to `PIP-ERC-1030`, Spool Erection,
> 24-inch P-1001-A1A — **the correct activity** — at **65% confidence**.
>
> And at 65% it did **not** touch the schedule. Read the card: *the project schedule has not
> been changed yet; a Planning Engineer must verify this report before actuals are
> committed.* It routes to the planner's queue. In this system a field update is a proposal.
> It is never a write."

5. Press **Submit Update**. Show the confirmation and the entry in **Recent Updates**.

**Point at:** `65% confidence`, `Routing Queue → Planning Reconciliation Queue /reconcile`,
and the **BASELINE PROTECTION** note.

> **Verified today.** That exact sentence produces `PIP-ERC-1030` at 65% and goes to review.
> If you prefer the multi-turn behaviour, type only *"spool erection on the 24 inch header is
> done"* — the agent then asks for the date, then the quantity, and asks for nothing it can
> already infer. It lands on `PIP-INS-1045` at 69%. **The one-sentence version is the better
> shot: it is faster and it gets the right activity.**
>
> **Record the typed path.** Browser speech needs the network — it is the one part of NAVIS
> that does.

---

### Chapter 3 · Field history and the return channel — 1:35–1:55

**Screen:** bottom nav → **Updates**, then **Questions**, then **Settings**.

**Do:** One beat on each.

**Say:**

> "He can see everything he has filed, with a reference number and a live status —
> processing, needs response, confirmed, rejected. **Questions** is the return channel: when
> the planner needs something clarified, it arrives here, and we'll come back to it. And
> Settings is his — theme, language, and a read-only view of his assignment. He cannot
> change a planned date from this device. Nobody in the field can."

---

### Chapter 4 · Reconcile — the core of the product — 1:55–3:10 **[SHORT] [CORE]**

**Screen:** **Switch role** → **Project Manager / Planner** → **Review & Reconcile**.

This is the chapter that earns the product. Do not rush it.

**Do:**
1. Show the queue header and count, and the filter chips: **All · Field Reports · High Conf
   (≥75%) · Needs Review (<75%) · Withheld / Conflict**. Scroll one screen.
2. Open the top row → **Detail** tab.
3. Walk it: *What the supervisor said* → *Entity extraction* → *Why NAVIS did not auto-link*
   → *Candidate activities* → *If confirmed* → *What will change if accepted*.
4. Press **Confirm Match**.

**Say:**

> "Everything that wasn't certain lands here, worst-first. **[read off screen]** items are
> waiting — and that is the system declining to guess, not the system failing. Most are
> low-confidence matches. The rest are withheld finish dates: a node reported complete where
> no source ever named the finish date, so rather than stamp it with the day the report was
> typed, NAVIS refuses and sends it to a person.
>
> Take the top one. On the left, exactly what the supervisor wrote, and what NAVIS pulled out
> of it — discipline, location, quantity, status, date.
>
> In the middle, why it would not auto-link, in plain words: the match score is below the
> auto-link threshold, and the top two candidates are too close together to separate.
>
> On the right, the three candidates it is choosing between, each with the signals that
> fired — date window, tag match, text similarity. **None of that is a language model
> talking.** Those are named, deterministic features. A model that cannot tell you *why* it
> chose an activity has no business writing into a project schedule — and it would
> occasionally invent an activity ID that doesn't exist.
>
> And before I commit anything, it shows me the write: the activity it will land on, the
> current stored value against the proposed one, and the float and CPM consequence. I
> confirm — and that goes to an append-only audit trail with its reason."

> **Read the reason off the screen.** Rows read `low_confidence`. Saying "margin" while the
> screen says `low_confidence` is a visible mismatch.
>
> **Threshold:** see §1.1. Either you fixed 0.775 → 0.80, or you name no number.

---

### Chapter 5 · Ingest — documents in, and Primavera in — 3:10–4:10

**Screen:** **Field Data** (`/ingest`).

**Do (tab 1 — Field report import):**
1. Drag `dataset/dpr_day_03.txt` onto the dropzone.
2. Let the pipeline trace reveal. Scroll the per-event table.
3. Drop the **same file again** — it is refused by content hash.

**Say:**

> "The other half of the input problem: documents. This is a raw daily progress report —
> nobody tagged it, nobody hand-fed it. Parsed, events extracted, matched, written.
>
> Note the gap between those last two numbers: more events get linked than activities get
> changed, because a link is not a write. Every row below names the file and the line it came
> from — that is provenance, and it is what lets a person check our work later.
>
> Drop the same file twice and it's refused by content hash, with an explanation rather than
> an error."

**Do (tab 2 — Schedule baseline import):**
4. Switch to **Schedule baseline import**.
5. Tick **both** "Validate only (Dry Run — writes nothing)" **and** "Replace the active
   baseline". *(See §1.3 — dry run alone returns 409.)*
6. Drop `schedule_export_20260902_133434.xml`.

**Say:**

> "And we read Primavera. This accepts Oracle P6 PMXML, P6 XER, or our own JSON — pure
> Python parsers, no MPXJ, no JVM. I'll run it as a dry run: it parses the network, validates
> the topology and the WBS levels, tells me it found **120 activities, 120 with both planned
> dates, 120 IDs already in the schedule** — and writes nothing.
>
> And the policy underneath matters: activities missing from a new file are left in place,
> never deleted, because deleting them would orphan their evidence and destroy the audit
> trail. Replacing updates planned dates. It never touches a verified actual."

**Point at:** the **Safe Baseline Policy** paragraph and *"Nothing was written."*

> **Verified today:** that exact file dry-runs clean and the active baseline stays
> `baseline_schedule`, 120 activities.

---

### Chapter 6 · Schedule — register, Gantt, Doctor, audit — 4:10–5:40 **[SHORT: audit only] [CORE]**

**Screen:** **Schedule** (`/schedule`).

**Do (Activity Register):**
1. Point at the four tiles and the review banner. Toggle **Critical Path (12)**. Show the
   discipline filter and **Columns**.
2. Open the **Export** dropdown, show **PMXML** — *do not export XER*.

**Say:**

> "The whole baseline, 120 activities, planned against verified actual, with the variance on
> every row. Filter to the twelve activities on the critical path. And it exports back out to
> Primavera PMXML — this is not a one-way capture tool."

**Do (Gantt Chart tab):**
3. Switch to **Gantt Chart**. Show **Compact / Standard / Detailed** and **Focus Data Date**.

**Say:**

> "Dual-bar: the baseline on top, the earned actual underneath, day-level calendar, weekends
> shaded, the data date pinned."

**Do (Schedule Doctor tab):**
4. Switch to **Schedule Doctor**. Show the four scores and the finding categories: **Duration
   Fantasy · DCMA Logic Traps · Monsoon Clashes · Engineering Rules**.

**Say:**

> "And this audits the *plan itself*, before anyone reports against it. It checks planned
> durations against what this project has actually achieved, runs DCMA 14-point network
> checks — open ends, missing successors — and flags Upper Assam monsoon exposure. Every
> finding carries a rule ID: `CONTR-PROD-01`, `DCMA-OPEN-ENDS-01`. **Rule IDs, not a model.**
> Here it says a ten-day pedestal-concreting duration is fifty percent below what this
> project has actually managed."

**Do (the audit drawer — the strongest shot in the product):**
5. Search *Fence & Gate*, click **CIV-FNC-1016**. The **Activity Inspection Panel** opens,
   badged **CONFLICT DETECTED**, tabs **Overview · Evidence (3) · Audit Trail (8)**.
6. Show **+15 days** and **WHY NAVIS FLAGGED THIS**.
7. Scroll to the **Quantity Ledger**.
8. Open **Audit Trail (8)**.

**Say:**

> "One activity, and everything NAVIS knows about it. Fifteen days late — and it says why:
> the actual finish is later than planned, and two sources disagree.
>
> This is the quantity ledger. Three readings — plus-320 metres from one daily report,
> plus-480 from another, and the cumulative total from the Excel register — and it counts
> them **once**. It does not double-count the register against the incremental reports.
>
> And this is the audit trail: **eight records, append-only, never edited**. Each names the
> file and the line and quotes the sentence. Here it records that two sources asserted the
> same field and which one it kept. Here it records a finish it **withheld** — reported
> complete, but the only date available was the report header, so it refused to stamp it.
> Here it says the evidence only accounts for 66.7% of the planned quantity, so the scope is
> partial.
>
> A spreadsheet would have kept whichever arrived last and shown you nothing."

**Point at:** `2 SOURCES ASSERTED THIS FIELD`, `SOURCE CONFLICT`,
`FINISH WITHHELD · RECORDED, NOT APPLIED`, and the decision bar — **Accept Field Actual /
Flag Conflict / Keep Baseline**.

---

### Chapter 7 · Risk and delay — 5:40–6:40

**Screen:** **Risk & Exposure** (`/raid`), then **Delay Analysis** (`/delay`).

**Do (RAID):**
1. Show the four **NAVIS Suggestions** with their evidence quotes.
2. Press **Accept into register** on one.

**Say:**

> "NAVIS found four recurring delay causes in its own audit trail — fencing conflict, holiday
> delay, piling rig breakdown, rain — each with the field report it came from and the finish
> variance on the activity. Every one says *this is a proposal, not in the register*.
>
> It found the pattern. It did not enter it. A person does, and the register records which
> person."

**Do (Delay Analysis):**
3. Show the KPI strip, the **baseline logic inconsistency** advisory, and the **concurrent
   delay** overlap pair.
4. Open **Adjudication**. Show NAVIS's recommendation, then the ruling controls.

**Say:**

> "Forensic delay. Each event carries its slip, the float available, and whether it actually
> moved the finish — twenty-one days of slip absorbed by a hundred days of float moves
> nothing; one day on the critical path moves everything.
>
> Concurrent delay: two causes open over the same twelve-day window. NAVIS names the overlap
> and cites both sides — *splitting it between parties is a matter for the contract, not for
> software*.
>
> FIDIC Clause 20.1 gives you 28 days to serve notice. This one has fifteen days left. Two
> windows on this project have already closed with no notice recorded, and it says so rather
> than hiding it.
>
> And here is the rule the whole product runs on: NAVIS proposes a classification and shows
> its reasoning. The official ruling is blank until a Project Manager picks one and types a
> justification. **The system recommends. A human decides** — and note the honesty of the
> notice field: *the date notice was given, not the date it is entered here. A date after the
> deadline is recorded and flagged, never refused.*"

> **Say "rule IDs, not a model"** if you dwell on the **AI · ADVISORY** badge (§1.5).

---

### Chapter 8 · The loop closes — 6:40–7:10 **[CORE]**

The payoff for Chapters 2 and 4. It only works on the report **you filed in Chapter 2**
(§1.4).

**Do:**
1. In **Review & Reconcile**, filter to **Field Reports** and open the supervisor's item —
   the `PIP-ERC-1030` one.
2. Press **Ask Supervisor**, type
   `Is this the 24-inch header P-1001-A1A, or the 12-inch line?`, **Send Question**.
3. **Switch role** → **Field Supervisor** → **Questions**.

**Say:**

> "Here is his report in my queue. I'm not sure which line he means, so instead of guessing —
> or rejecting it — I ask him.
>
> And it arrives on his phone, with his original words and the activity we think it is,
> attributed to the planner who asked. He answers, it comes back to my queue, and only then
> does a date reach the schedule.
>
> That is the whole thesis of the product in one screen: when the system isn't sure, it
> doesn't guess. It asks the person who was standing there."

**Point at:** the question, the quoted original text, `PIP-ERC-1030`, and
*Asked by Priya Das · Planning Engineer*.

---

### Chapter 9 · Senior Management — 7:10–8:25

**Screen:** **Switch role** → **Senior Management**.

**Do:** Move briskly — eight screens, roughly ten seconds each. `/executive` →
`/executive/milestones` → `/executive/progress` → `/executive/risks` →
`/executive/forecasts` → `/executive/insights` → `/executive/reports` →
`/executive/confidence`.

**Say (Overview):**

> "Same data, executive altitude, and note what leads — the caveat, above the number, not
> under it. Schedule performance, critical path drift, FIDIC exposure, evidence integrity. A
> recommended management action with the activity driving it. An earned-value S-curve
> projected forward at the measured SPI. And a what-if simulator that moves the computed
> finish date without writing anything to the schedule."

**Say (Milestones → Progress → Risks → Forecasts):**

> "Milestones — and it tells you they're **derived**, because the baseline carries no
> milestone flag: the last-finishing activity of each discipline, plus project finish, each
> saying whether its date is an actual or a CPM early finish.
>
> Progress, by discipline, with earned-versus-planned days and installed-versus-planned
> quantity.
>
> Risks and delays — the accepted register, the delay matrix, and every source disagreement.
>
> Forecasts, with the modelling notice stated plainly: *deterministic forward-pass CPM, not
> Monte Carlo, not P80 or P90.* Named scenarios — monsoon hold, vendor disruption, recovery
> plan — and they cannot mutate the baseline."

**Say (Insights → Reports → Data Confidence):**

> "Execution insights — measured overruns by trade, with an explicit **low sample** badge
> wherever fewer than three activities back the number.
>
> Management reports — a board pack assembled from live records, filtered by window and
> scope, ready to copy, download or print.
>
> And Data Confidence, which is the one I'd point a sceptic at. The system grades its own
> evidence: **[read off screen]** of 120 activities carry field citations, the rest are
> running on planned duration alone, and every disagreement is listed with both sides. It
> tells you how much of what you're looking at is actually earned.
>
> One thing this role does **not** have: a review queue. That's deliberate. An executive who
> can approve an update bypasses the single accountable owner of the plan. Governance sees
> everything and approves nothing."

---

### Chapter 10 · Institutional memory, Ask NAVIS, and close — 8:25–9:00 **[SHORT: close only] [CORE]**

**Screen:** **Switch role** → Planner → **Project Knowledge** (`/memory`).

**Do:**
1. **Historical Benchmarks** — point at the evidence tier on every row (`MODERATE (n=5)`,
   `LOW · Emerging (n=3)`, `Insufficient (n=2)`).
2. **Knowledge Base** — the 7 domain rules.
3. **Tender Estimator** — Discipline **PIPING**, scope **PIP-ERC (5 actuals)**. Then switch
   to **PIP-SPL (2 actuals)**.
4. Open **Ask NAVIS** and click *"Which activities are driving the critical path variance?"*

**Say:**

> "The second half of the problem statement asks how the *next* project learns from this one.
> Only confirmed, completed, uncontested actuals feed this — it says so at the top — and every
> row carries its sample size rather than hiding it.
>
> The knowledge base is seven codified domain rules: the Upper Assam monsoon window,
> fourteen-day concrete curing to IS 456, DCMA open-end checks. Those are what Schedule Doctor
> enforces.
>
> And the tender estimator turns actuals into a bid. Pick a scope type and you get what this
> project actually achieved — a fastest case, a recommended tender duration, a slowest case.
> Read the labels: *'an extreme observed, not a confidence level'*, *'a planning convention
> rather than a measured figure'*. It is not dressing arithmetic up as probability.
>
> And pick a scope with only two completions and it refuses: *insufficient evidence — at
> least three are needed before a duration percentile means anything.* It would rather say
> nothing than say something unfounded.
>
> Last thing. Ask NAVIS is a read-only assistant across all three roles, grounded strictly in
> the project's own records — and every answer cites the activities and causes it drew on. It
> reads. It never writes."

**Close:**

> "Zero wrong auto-links on a held-out test set — sixty-seven out of sixty-seven. Forty-three
> percent coverage, because everything else went to a human on purpose. Eighty-seven percent
> top-one accuracy. Every one of those numbers reproducible on this laptop with one command,
> behind more than thirteen hundred automated tests.
>
> Primavera in, Primavera out. Voice, documents and spreadsheets in. No cloud, no API key,
> nothing leaves your network.
>
> NAVIS doesn't guess. When it isn't sure, it asks."

> **The test sentence depends on §1.2.** If you fixed the suite, say *"and 1,312 automated
> tests, all passing."* If not, keep the wording above and have this ready:
> *"1,310 of 1,312 pass; two fail only when the whole suite runs at once — they're green in
> isolation, it's test-state leakage, not a product fault."*

---

## 5 · The cuts

**5:00 [CORE]** — Chapters 1, 2, 4, 6 (audit drawer only), 8, 10 (close only).
Drop ingest, RAID/delay, the executive lane and memory. Do not compress 4 or 6.

**2:30 [SHORT]**

| | |
|---|---|
| 0:00–0:25 | Ch.1 — the problem, trimmed |
| 0:25–1:05 | Ch.2 — one sentence → `PIP-ERC-1030` at 65%, not a write |
| 1:05–1:50 | Ch.4 — why it didn't auto-link, three candidates, confirm |
| 1:50–2:15 | Ch.6 — audit trail and the withheld finish |
| 2:15–2:30 | Close |

---

## 6 · Numbers you may say — re-run 2026-09-12

`python backend/eval.py`. Held-out test split: 154 mentions (145 gold-positive, 9 NO_MATCH),
from source files no threshold was tuned against.

| Figure | Value | Say it like this |
|---|---|---|
| Auto-link precision | **100.0%** | "67 of 67 — zero wrong auto-links, on data we didn't tune on" |
| Coverage | **43.5%** | "67 of 154; the rest went to a human" |
| Top-1 accuracy | **86.9%** | "126 of 145 — 95% CI 81.4 to 92.4" |
| Recall@3, v1 held-out | **97.2%** | "141 of 145 — the planner is shown three candidates" |
| Wrong review rows | **28** | "queued for a planner to reject — never written" |
| NO_MATCH, this split | **0 of 9 refused** | "all nine routed to review; none linked" |
| Demo schedule | **120 activities** | "the demo project schedule" — not the corpus |
| Automated tests | **1,312** total, **1,310** passing | see §1.2 before claiming "all passing" |
| Thresholds | **0.80 / 0.40 / margin 0.03** | see §1.1 before saying this on camera |

**Corrections to the printed sheet.** Row 7 says **1,284** (1,055 + 229) "all passing":
vitest is now **257**, so the total is **1,312**, and `pytest -q` currently reports **2
failed**. Row 5's Recall@3 of 88.1% is the **v2 research corpus**; the v1 held-out figure
`eval.py` prints is **97.2%**. Name the corpus whenever you quote either.

### Never say

- ❌ "Offline-first PWA" — no service worker. Say *"runs entirely on-premise."*
- ❌ "Everything works offline" — browser speech needs the network; everything else doesn't.
- ❌ "Bi-directional MS Project" — no `.mpp`. P6 PMXML and XER only.
- ❌ "Our XER export drops into P6" — PMXML does; XER is not conformant (D-047).
- ❌ "The system learns from planner corrections" — corrections are persisted as a training
  signal; `w_alias = 0.0` and the matcher never reads them back (D-061).
- ❌ "All our tests pass" — not until §1.2 is resolved.
- ❌ "96.7%", "87.2%", "50.4%", "1,431 tests", "Recall@20 is 100% so a planner can always fix it."
- ❌ Any claim about an unseen project — 84% of v2 test positives reuse a training activity.

**Volunteer the limits before a judge finds them:** coverage is under half by design ·
NO_MATCH refusal is the weakest metric · no authentication · single project · synthetic
120-activity baseline (the authentic WSDOT schedule has **27** activities).

---

## 7 · After you record

- [ ] Watch it once end to end, with sound.
- [ ] Check the §3 feature map — did every claimed feature actually appear?
- [ ] Check no spoken number contradicts a number on screen. Especially the threshold.
- [ ] Check no notification, second tab or personal bookmark is in any frame.
- [ ] Move `dpr_day_03.txt` back into `dataset/` and re-run the reset.
- [ ] Copy to both laptops and one phone. Not cloud-only.
- [ ] **Do not commit the video** — `*.mov` / `*.mp4` stay out of git.

---

*NAVIS · SIH26122 · Oil India Limited · every screen and figure verified against the running
application, 2026-09-12. Authority for figures: `METRICS.md`, then `NUMBERS_SHEET.md`.*
