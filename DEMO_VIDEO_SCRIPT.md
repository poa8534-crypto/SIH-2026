# NAVIS — Demo Video Recording Script

**Problem Statement SIH26122 · Oil India Limited / Ministry of Petroleum & Natural Gas**
Target length **4:00**, with a **2:00** short cut marked inline.

> **Every screen, label and quoted sentence in this script was read off the running
> application on 2026-09-12** against the current working tree (the uncommitted UI
> redesign), at API `:8000` / UI `:5173`. Every metric was re-run the same day with
> `python backend/eval.py` and `pytest`. Where a number depends on database state it is
> marked **[read off screen]** and is deliberately *not* scripted.
>
> **This file supersedes `demo_script.md` (retracted).** It does not supersede
> `NUMBERS_SHEET.md`, which remains the authority for any spoken figure.

---

## 0 · Read this before you record

Three things changed under the documentation. If you rehearse from `DEMO.md` you will be
surprised on camera.

| What `DEMO.md` says | What the app actually does now |
|:---|:---|
| Planner Home shows four tiles `120 / 67 / 135 / 38` | Home shows **Planned progress · Actual progress · Schedule variance · At-risk activities**, then Needs-your-attention, Recent changes, a completion chart, a source-conflict panel and Discipline Work Packages |
| Senior Management has **three** destinations | It has **eight** |
| Executive "Data" screen shows corpus provenance (124 artifacts, 1,462 checks) | It is now **Data Confidence** — reporting coverage, timeliness, source disagreements |
| Role picker prints a paragraph saying there is no authentication | **That paragraph is gone.** The footer now reads only *"Local pilot environment"* |
| Field bottom nav is Home / Reports / Clarifications / Profile | Labels are **Home / Updates / Questions / Settings** |
| Field agent offers Today / Yesterday **chips** | It offers a free-text *"Type the missing detail…"* box |
| Reconcile is a three-column pane | It is a **Queue / Detail** two-tab layout |

**Consequence for the script:** the honesty line about authentication is now something you
**say**, not something you point at. It is scripted in Scene 1.

### ⚠ One screen contradicts the numbers sheet — decide before you record

The Reconcile detail pane prints **"AUTO-LINK THRESHOLD 77.5% · calibrated τ_high"** and
**"τ_high=0.775"**. The shipped matcher runs **τ_high = 0.80**
(`backend/matching/config.py:163`, `SHIPPED_THRESHOLDS`), which is what `eval.py` uses and
what `NUMBERS_SHEET.md` row 9 tells you to say. The value is hardcoded in the frontend at
[`Reconcile.tsx:1096`](frontend/src/pages/Reconcile.tsx:1096) and defaulted again at
[`MatchReasoning.tsx:155`](frontend/src/components/MatchReasoning.tsx:155).

**Pick one before recording:**

- **Fix it** (one line, then re-run `npx vitest run`) — recommended, or
- **Never say a threshold number out loud in Scene 4**, and say *"below the auto-link
  threshold"* instead. Do not say "0.80" while 77.5% is on screen.

### ⚠ `pytest -q` currently prints 2 failures — do not invite a live run until it is green

Re-run 2026-09-12 on this working tree:

```
2 failed, 1053 passed in 198.48s
FAILED backend/matching/test_learned.py::TestAliasChannel::test_key_matches_what_the_server_writes
FAILED backend/server/test_delay_evidence.py::TestKeywordListStaysShared::test_memory_uses_the_raid_keyword_list
```

**Both tests pass in isolation** — each file is green on its own (20 passed, 8 passed).
They fail only in the full-suite run, so this is cross-test state leakage, **not a product
defect**. It is still the first thing a judge would see if you hand them the laptop and say
"run the tests."

The frontend suite has the same shape of problem, already recorded in D-113:
`scheduleInspectionPanel.test.tsx` is flaky and the vitest run lands anywhere between
**253 and 257 of 257**. It returned a clean 257 on 2026-09-12, but that is a lucky run,
not a stable baseline — so do not film the vitest output either.

**Before recording, either:**

- **Fix the leakage** and re-run, then say *"1,312 tests, all passing"*, or
- **Say the honest version** in the close — scripted in Scene 7 — and do not invite anyone
  to run the suite on camera.

Never say "all passing" while the command prints two failures. That is the one claim a judge
can disprove in three minutes.

### Also avoid on camera

- **Do not export XER.** The Export dropdown offers PMXML and XER. Use **PMXML**. XER is
  written but not P6-conformant (D-047).
- **The Ingest dropzone advertises `.PDF, .XLSX, .CSV, .TXT, .PNG, .JPG`.** Only `.txt`
  and `.xlsx` are demo-solid — `.csv` returns HTTP 400 by design. Drop a `.txt`.
- **Do not script the executive evidence-coverage figure.** D-113 records that
  `GET /executive/metrics` returns **46 evidenced / 38.3%** on a clean `seed.py` database
  and on the deployed instance, while D-111/D-112 and `NUMBERS_SHEET.md` record
  **67 / 55.8%**. This machine showed 67 / 55.8% today. The two do not reliably agree, so
  Scene 6 reads the number off the screen and never says it in advance.
- **Schedule Doctor's column header reads "AI CRITIQUE & PRESCRIPTION."** The findings are
  deterministic rules (`CONTR-PROD-01` etc.), not a model. If you show this screen, say
  *"rule IDs, not a model"* in the same breath, or the header invites the one question you
  do not want.

---

## 1 · Pre-flight

Run in order. Do not skip the reset — the database on this machine is currently dirty from
rehearsals (review queue at 120 instead of 135, RAID register holding 53 accepted items),
and a video whose counts disagree with `NUMBERS_SHEET.md` is worse than no video.

```bash
python backend/scripts/reset_demo.py
```

```bash
python backend/scripts/healthcheck.py
```

Then start both services from the project root:

```bash
python -m uvicorn server.main:app --app-dir backend --port 8000
```

```bash
npm --prefix frontend run dev
```

> On this Mac `python` is not on `PATH`; use `./.venv/bin/python` for the two scripts and
> for uvicorn. `.claude/launch.json` has the same issue — it calls bare `python`.

**Machine setup**

- [ ] Browser at **1280×800 or wider**, single tab, no bookmarks bar, no second window.
      The planner and executive screens are dense; below this you lose the right columns.
- [ ] Notifications silenced (system + Slack + mail). A toast mid-frame is permanent.
- [ ] Light mode — the theme toggle sits bottom-left in the sidebar.
- [ ] Sign out to the role picker: `localStorage.removeItem('navis.role')` in the console,
      or **Switch role** in the sidebar. The role is browser state; **the reset does not
      clear it**.
- [ ] Hold out one report so Scene 3 has something to ingest:
      `mv dataset/dpr_day_03.txt /tmp/` **before** the reset, and move it back after.

**Confirm on screen before you press record** (write them here, then use these figures
rather than the ones in this file):

| | Expected after reset | Confirmed today |
|---|---|---|
| Activities in baseline | 120 | ______ |
| Activities with actuals | 67 | ______ |
| Review queue pending | 135 | ______ |
| Completed | 38 | ______ |
| Source conflicts on Home | 18 | ______ |
| RAID register (executive) | empty | ______ |

**Recording tool.** QuickTime Player → File → New Screen Recording → **⌄** next to record →
set Microphone → capture the browser region, not the whole display. Narrate live; a silent
capture is much weaker. CLI fallback: `screencapture -v -g ~/Desktop/navis_demo.mov`.

---

## 2 · The shot list

Timings assume you narrate at a normal pace and do not wait for animations. **[SHORT CUT]**
marks what survives in the 2:00 version.

---

### Scene 1 · The problem, and the role picker — 0:00–0:30 **[SHORT CUT]**

**Screen:** `http://localhost:5173`, signed out. The picker with three cards.

**Do:** Hold still on the landing panel. Do not click yet.

**Say:**

> "On a refinery or a well-site project, the plan lives in Primavera — thousands of
> activities, each with an ID and planned dates. Reality arrives as daily reports,
> spreadsheets and voice notes written in ordinary language, with no activity IDs in them.
> Today a planner matches those by hand, for weeks, and the schedule is stale before it is
> updated.
>
> NAVIS does that matching automatically, scores its own confidence, and — this is the
> part that matters — refuses to write anything it is not sure about.
>
> Three roles, three workspaces. One honest note first: there is no authentication behind
> this screen. It selects a role so each person sees the screens built for them; it does
> not check a credential and it does not restrict data. Single sign-on is production work
> and it is deliberately out of scope for this prototype."

**On screen to point at:** the three strip items — *Capture · Verify · Decide* — and the
chips *Append-only audit trail · 120 baseline activities · Data date 2026-09-15*.

> **Why say the auth line:** it costs one sentence and removes the question from Q&A. It
> used to be printed on this screen and no longer is — so it has to come from you.

---

### Scene 2 · Field Supervisor — capture — 0:30–1:15 **[SHORT CUT]**

**Screen:** pick **Field Supervisor** → `/field`.

**Do:**
1. Let the phone-width shell land. Point at the location chip and the EN / हि / অস selector.
2. **Type** — do not use the microphone — into the box:
   `spool erection on the 24 inch header is done`
3. Press **Send Update**. The Report Studio opens on **1 Capture**.
4. The agent asks *"Which date was it completed?"* → type `yesterday` → **Send**.
5. It asks *"How many spools out of the planned quantity?"* → type `6 out of 18` → **Send**.
6. It advances to **STEP 2 · NAVIS REVIEW**.

**Say (over the three turns):**

> "This is the site supervisor's phone. He types what happened — no activity ID, no form,
> no dropdown. NAVIS reads the discipline, the location and the status straight out of that
> sentence, and then asks only for what it is still missing: the date, then the quantity. It
> does not interrogate him for what it can already infer."

**Say (on the review card — this is the beat of the scene):**

> "Here is what it produced. It matched 'the 24 inch header' to `PIP-INS-1045`, Insulation,
> 24-inch P-1001-A1A — at **69% confidence**. And at 69% it did **not** touch the schedule.
> Read the card: *the project schedule has not been changed yet; a Planning Engineer must
> verify this report before actuals are committed.* It routes to the planner's queue
> instead. A field update is a proposal in this system. It is never a write."

**On screen to point at:** `69% confidence`, the `Routing Queue → Planning Reconciliation
Queue /reconcile` row, and the **BASELINE PROTECTION** note.

> **Record the typed path, not voice.** Browser speech recognition needs the network; it is
> the one part of NAVIS that does. Everything else runs with the cable pulled.

---

### Scene 3 · Planner — ingest — 1:15–1:45

**Screen:** **Switch role** → **Project Manager / Planner** → **Field Data** (`/ingest`).

**Do:** Drag `dataset/dpr_day_03.txt` onto the dropzone. Let the trace reveal.

**Say:**

> "Same system, the planner's side. This is a raw daily progress report — no one hand-fed
> it, no one tagged it. Watch the pipeline: parsed, events extracted, matched, written. And
> note the gap between those last two — more events get linked than activities get changed,
> because a link is not a write. The number shown is what the roll-up actually did.
>
> Every row below carries the file and the line it came from. That is provenance, and it is
> what lets a human check our work later."

**[read off screen]** the PARSED / EXTRACTED / MATCHED / WRITTEN counts. Do not script them.

**Optional 5-second beat if you have room:** drop the same file again — it is refused by
content hash with an explanation, not an error.

---

### Scene 4 · Planner — reconcile — 1:45–2:30 **[SHORT CUT]**

This is the scene that wins the room. Do not rush it.

**Screen:** **Review & Reconcile** (`/reconcile`), then the **Detail** tab.

**Do:**
1. Show the queue header and the count. Scroll one screen of items.
2. Open the top item → **Detail**.
3. Walk the three blocks left to right: *What the supervisor said* → *Why NAVIS did not
   auto-link* → *Candidate Activities*.
4. Scroll to **What will change if accepted**.
5. Press **Confirm Match**.

**Say:**

> "This is the queue, worst-first. **[read off screen]** items are waiting — and that is the
> system declining to guess, not the system failing.
>
> Take the top one. On the left, exactly what the supervisor wrote. In the middle, why NAVIS
> would not auto-link it — and it tells you in plain words: the match score is below the
> auto-link threshold, and the top two candidates are too close together to separate. On the
> right, the three candidates it is choosing between, each with the signals that fired —
> date window, tag, text.
>
> None of that is a language model talking. Those are named, deterministic features, and
> that is the point: a model that cannot tell you *why* it picked an activity has no
> business writing into a project schedule.
>
> And before I commit anything, it shows me what will change — the current stored value, the
> proposed value, and the float consequence. I confirm. That goes to an append-only audit
> trail with its reason."

> **Read the queue reason off the screen.** Rows read `low_confidence`. If you say "margin"
> while the screen says `low_confidence`, the judge sees the mismatch.
>
> **Threshold:** see §0. Either you fixed 0.775 → 0.80, or you say *"below the auto-link
> threshold"* and name no number.

---

### Scene 5 · Planner — the audit trail — 2:30–3:00 **[SHORT CUT]**

**Screen:** **Schedule** (`/schedule`) → search *Fence & Gate* → click **CIV-FNC-1016**.

This example reproduces on a clean reset and is the strongest auditability shot in the
product.

**Do:**
1. Point at the footer strip and the review banner first — one second each.
2. Open the row. The **Activity Inspection Panel** opens on **Overview**, badged
   **CONFLICT DETECTED**, tabs **Overview · Evidence (3) · Audit Trail (8)**.
3. Show **+15 days** finish variance and **WHY NAVIS FLAGGED THIS**.
4. Scroll to the **Quantity Ledger**.
5. Open **Audit Trail (8)**.

**Say:**

> "Here is one activity, and everything NAVIS knows about it. Fifteen days late — and it
> says why: the actual finish is later than planned, and two sources disagree about the
> dates.
>
> This is the quantity ledger. Three readings — plus-320 metres from one daily report,
> plus-480 from another, and the cumulative total from the Excel register — and it counts
> them **once**. It does not double-count the register against the incremental reports.
>
> And this is the audit trail: eight records, append-only, never edited. Each one names the
> file and the line it came from and quotes the sentence. Here it records that two sources
> asserted the same field and which one it kept. Here it records a finish it **withheld** —
> the node was reported complete, but the only date available was the report header, so
> NAVIS refused to stamp it and sent it to a planner instead.
>
> A spreadsheet would have kept whichever arrived last and shown you nothing."

**On screen to point at:** `2 SOURCES ASSERTED THIS FIELD`, the `SOURCE CONFLICT` row, and
`FINISH WITHHELD · RECORDED, NOT APPLIED`.

---

### Scene 6 · Senior Management — 3:00–3:30

**Screen:** **Switch role** → **Senior Management** → `/executive`, then
`/executive/confidence`.

**Do:** Land on Overview. Let the banner and the four tiles settle. Then jump to **Data
Confidence**.

**Say:**

> "Same data, executive altitude. Schedule performance, critical path drift, the FIDIC
> notice clock, evidence integrity — and note what leads: the caveat, above the number, not
> under it. Earned value here counts only what a field report actually evidenced, so the
> disciplines that look worst are largely the disciplines nobody has reported on yet.
>
> And this role has **no review queue**. That is deliberate. An executive who can approve an
> update bypasses the single accountable owner of the plan. Governance sees everything and
> approves nothing — the Project Manager is the only role that changes the schedule.
>
> On Data Confidence the system grades its own evidence: **[read off screen]** of 120
> activities carry field citations, the rest are running on planned duration alone, and
> every source disagreement is listed with both sides. It tells you how much of what you
> are looking at is actually earned."

---

### Scene 7 · Institutional memory + close — 3:30–4:00 **[SHORT CUT — close only]**

**Screen:** **Switch role** → Planner → **Project Knowledge** (`/memory`) → **Tender
Estimator** tab.

**Do:** Discipline **PIPING**, Activity scope **PIP-ERC (5 actuals)**. Then — if you have
five spare seconds — switch to **PIP-SPL (2 actuals)** to show the refusal.

**Say:**

> "The second half of the problem statement asks how future projects learn from this one.
> This is built from verified actuals only — pending reviews and contested records are
> excluded, and it says so at the top.
>
> Pick a scope type and it gives you what this project has actually done: a fastest case, a
> recommended tender duration, a slowest case. And look at the labels — *'an extreme
> observed, not a confidence level'*, *'a planning convention rather than a measured
> figure'*. It is not dressing arithmetic up as probability.
>
> Switch to a scope with only two completions and it refuses outright: *insufficient
> evidence, at least three are needed before a duration percentile means anything.* It would
> rather say nothing than say something unfounded."

**Close (hold on any screen, or cut to the picker):**

> "Zero wrong auto-links on a held-out test set — 67 for 67. Forty-three percent coverage,
> because everything else went to a human on purpose. Every number reproducible on this
> laptop with one command, behind more than thirteen hundred automated tests.
>
> No cloud, no API key, nothing leaves your network. NAVIS doesn't guess. When it isn't
> sure, it asks."

> **The test-count sentence depends on §0.** If you fixed the suite, say *"and 1,312
> automated tests, all passing."* If you did **not**, use the wording above — "behind more
> than thirteen hundred automated tests" — which is true either way, and be ready with:
> *"1,310 of 1,312 pass; two fail only when the whole suite runs together — they're green
> in isolation, it's test-state leakage, not a product fault."* Owning that costs nothing.

---

## 3 · The 2:00 short cut

Scenes 1 → 2 → 4 → 5 → close. Drop ingest, executive and memory entirely; do not compress
Scene 4 or 5, they are the reason to watch.

| | |
|---|---|
| 0:00–0:20 | Scene 1, trimmed to the problem + the auth line |
| 0:20–0:55 | Scene 2 — three turns, land on 69% and "not a write" |
| 0:55–1:30 | Scene 4 — the explanation, the three candidates, confirm |
| 1:30–1:50 | Scene 5 — audit trail, withheld finish |
| 1:50–2:00 | Close |

---

## 4 · Numbers you may say — re-run 2026-09-12

Reproduce all of these with `python backend/eval.py`. Held-out test split: 154 mentions
(145 gold-positive, 9 NO_MATCH) from source files no threshold was tuned against.

| Figure | Value | Say it like this |
|---|---|---|
| Auto-link precision | **100.0%** | "67 of 67 — zero wrong auto-links, on data we did not tune on" |
| Coverage | **43.5%** | "67 of 154 mentions handled automatically; the rest went to a human" |
| Top-1 accuracy | **86.9%** | "126 of 145 — 95% CI 81.4 to 92.4" |
| Recall@3 (v1 held-out) | **97.2%** | "141 of 145 — the planner is shown three candidates" |
| Wrong review rows | **28** | "queued for a planner to reject — never written" |
| NO_MATCH on this split | **0 of 9 refused** | "all nine were routed to review; none was linked" |
| Automated tests | **1,312** total, **1,310 passing** | "1,055 Python + 257 TypeScript" — see the §0 warning before claiming "all passing" |
| Demo schedule | **120 activities** | "the demo project schedule" |
| Thresholds | **0.80 / 0.40 / margin 0.03** | see the §0 warning before saying this on camera |

**Corrections to the printed sheet.** `NUMBERS_SHEET.md` row 7 says **1,284** (1,055 + 229)
"all passing". Two things have moved: the working tree now has **257** vitest tests (all
green), so the total is **1,312**; and the full `pytest -q` run currently reports **2
failed, 1053 passed** — see §0. Row 5 quotes Recall@3 = 88.1%, which is the **v2 research
corpus**; the v1 held-out figure printed by `eval.py` is **97.2%**. Name the corpus whenever
you quote either.

### Never say

- ❌ "Offline-first PWA" — there is no service worker. Say *"runs entirely on-premise."*
- ❌ "Everything works offline" — browser speech needs the network. Everything else does not.
- ❌ "We import Primavera files" — PMXML/XER **export** works; say export.
- ❌ "Bi-directional MS Project" — there is no `.mpp` support.
- ❌ "The system learns from planner corrections" — corrections are persisted as a training
  signal; `w_alias = 0.0` and the matcher does not read them back (D-061).
- ❌ "96.7%", "87.2%", "50.4%", "1,431 tests", "Recall@20 is 100% so a planner can always fix it."
- ❌ "All our tests pass" — not until §0 is resolved. `pytest -q` prints 2 failures today.
- ❌ Any claim about an unseen project — 84% of v2 test positives reuse a training activity.

---

## 5 · After you record

- [ ] Watch it once, end to end, with sound. An unwatched video is not a deliverable.
- [ ] Check no number spoken contradicts a number on screen — especially the threshold.
- [ ] Check no notification, no second tab, no personal bookmark is visible in any frame.
- [ ] Copy to both laptops and one phone. Not cloud-only.
- [ ] **Do not commit the video.** `*.mov` / `*.mp4` are large binaries; keep them out of git.

---

*NAVIS · SIH26122 · Oil India Limited · script verified against the running application,
2026-09-12. Authority for figures: `METRICS.md`, then `NUMBERS_SHEET.md`.*
