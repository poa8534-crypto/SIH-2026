# NAVIS — SIH 2026 Grand Finale Master Battle Plan

**Problem Statement SIH26122** · Oil India Limited / Ministry of Petroleum and Natural Gas
**Event Date**: September 11, 2026 · **Execution Date**: September 10, 2026 (TODAY — the only full prep day)
**Codebase State**: Commit `3db290c` · **1,431 passing tests** (1,202 pytest + 229 vitest, re-counted 2026-09-10 after D-099) · `tsc` clean · production build clean · `eval.py` reproduces `METRICS.md` §3.1 exactly

> ### ⚠️ THIS FILE HAS BEEN OVERWRITTEN ONCE ALREADY
> A previous revision of this plan was reverted, losing every correction below and
> restoring seven factually false lines. **If you regenerate this file from an older
> draft, you will reintroduce claims that contradict the source code.** Check the
> `[CORRECTED]` markers are still present before trusting any version of this document.
>
> **Verification status.** Re-verified on 2026-09-10 against `3db290c`. Two commits
> landed after the first draft — `ee9097e` (agent discipline detection) and `3db290c`
> (field report rejection and resubmit flow). Both re-checked: full suite green, type
> check clean, build clean, and **every matcher number unchanged**. Neither touches
> `matching/`, `extraction/`, or any threshold.
>
> **The printable numbers sheet is `NUMBERS_SHEET.md`.** Print that, not this.
>
> **Governing rule:** `METRICS.md` is the authority for every number. If this plan and
> `METRICS.md` disagree, `METRICS.md` wins and this plan is the bug.

---

## 0. Executive Reality Check: The Three Traps We Avoid

**1 · You have no known bugs.** Putting three people on "fix bugs" today wastes half
your team. The matching engine, CPM forward/backward pass, FIDIC delay engine and React
UI are stable and verified — 1,431 tests pass, the type check is clean and the
production build succeeds. Retask Squad B to **dead-button hunting, reset reliability
and contingency drills.**

**2 · Your research documents currently teach your team to say false things.**

- `research/JUDGE_QUESTIONS.md` Q2 tells presenters to concede: *"PMXML/XER exist as
  export only... Import is our first post-hackathon item."* **This is false.**
  `matching/primavera.py` implements `parse_pmxml` and `parse_xer`, both providers are
  wired in `matching/providers.py`, and `POST /schedule/import` accepts `.json`, `.xml`
  and `.xer`. You built it. Conceding it forfeits a PS requirement you satisfy.
- `pitch_deck.md` quotes dead-corpus numbers and claims features that do not exist.
- **Four further research documents carry the same stale figures** (§3). The generated
  report PDF is built from them.

**3 · [ADDED] The correction itself is the third trap.** An earlier revision of this
plan "fixed" false claims by replacing them with *softer* false claims — inventing a
justification, relabelling an assumption as empirical data. That is the same failure
mode as the original defect. **A claim is either traceable to something the system
computed, or it does not go on a slide.** Rewording does not make it supported.

---

## 0.5 Phase map — work in gates, not clock times

Clock times slip. Gates do not. **Do not start a phase until the previous gate is
green, and do not keep polishing a phase whose gate is already green.**

| Phase | Who | Exit gate — do not proceed until true |
| :--- | :--- | :--- |
| **0 · Sync** | Lead solo | Slot length confirmed · 4 roles assigned · all 6 machines on `3db290c` · suite green on the presenting machine · `NUMBERS_SHEET.md` printed |
| **1 · Truth pass** | Squad A | **No document in the repo contradicts `METRICS.md`.** Deck, 5 research docs, `METRICS.md` §8, `README.md`, `DEMO.md` reconciled |
| **2 · Stability pass** *(parallel with 1)* | Squad B | Airplane-mode answer **known and reported to Squad A** · zero dead buttons · reset deterministic across 5 runs · Funnel B confirmed off the running server |
| **3 · Assets** | Both | Metric slide exists (curve + one labelled funnel) · all 6 Q&A answers delivered cold by every presenter |
| **4 · Rehearsal** | Both | 3 clean full runs at the confirmed slot length · at least one included a deliberate rejection in `/reconcile` |
| **5 · Lock** | Lead | Committed and pushed · `main` == `origin/main` · **no further code changes, by anyone** |
| **6 · Stage** | All | Pre-flight checklist (§7) fully green |

**The one hard dependency:** Phase 2's airplane-mode result decides the deck's
on-premise wording and whether voice is in the demo at all. **Squad B must report it to
Squad A within the first hour**, or Phase 1 finishes on an assumption.

**If you fall behind, cut in this order:** Phase 3's funnel diagram (keep the curve),
then the fifth rehearsal run, then `research/EXPERIMENTS.md`. **Never cut Phase 1 or
Phase 4.** A polished deck of wrong numbers loses to a plain deck of right ones, and an
unrehearsed team loses to both.

---

## 1. Phase 0 — Sync (30 minutes, team lead solo)

**Machine verification is already done** — run today against `3db290c`:

| Check | Result |
| :--- | :--- |
| `python -m pytest -q` | **1,202 passed** |
| `npx vitest run` | **224 passed** (23 files) |
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | clean |
| `python eval.py` | 86.9% top-1 · 100% auto-link precision (67/67) · 43.5% coverage — **unchanged** |
| `git` | `main` == `origin/main`, in sync |

**What only you can do:**

1. **[BLOCKING] Confirm the slot length.** Check the official SIH finale brief. This
   plan scripts 2 min pitch + 2 min demo + 3 min Q&A. If the slot is 10 or 15 minutes,
   Phases 3 and 4 are the wrong shape. **Blocks Phase 3 and Phase 4.**
2. **[BLOCKING] Assign four roles.** **Blocks Phase 4** — you cannot rehearse
   unassigned.
   - **Presenter** — speaks the pitch, narrates the demo
   - **Driver** — operates the laptop. **Never the same person as the presenter**
   - **Q&A lead** — fields judges, owns `METRICS.md`
   - **Reset operator** — runs `scripts/reset_demo.py` between runs, watches the clock

   The remaining two are backup presenter and backup driver, and must be able to take
   over cold.
3. **Sync all six machines** — `git pull`, confirm each person is on `3db290c`. Two
   commits landed after the original plan; anyone on `30e68bc` is running different
   code.
4. **Charge everything** — presentation laptop, backup laptop, phone, power banks.
5. **Print `NUMBERS_SHEET.md`** — one copy per person, on paper.
6. **Send both files to all six** — tell them to read the numbers sheet and their own
   squad section now, not at the start of Phase 1.

---

## 2. THE NUMBERS — summary only; `NUMBERS_SHEET.md` is the printable authority

| Dimension | Quote exactly | Never say |
| :--- | :--- | :--- |
| Auto-link precision | **100.0%** (67 of 67) | — |
| Coverage | **43.5%** | ~~50.4%~~ |
| Top-1 accuracy | **86.9%** (126 of 145) | ~~87.2%~~, ~~96.7%~~ |
| Held-out v2 top-1 | **71.4%** (132 of 185) | — |
| Recall@3 (planner depth) | **88.1%** (163 of 185) | ~~Recall@20 = 100%~~ |
| NO_MATCH refusal | **80.0%** (56 of 70) pooled | ~~8.3%~~ |
| Automated tests | **1,431** (1,202 + 229) | ~~580~~, ~~1,250~~, ~~1,422~~, ~~1,426~~ |
| Demo schedule size | **120 activities** | ~~218~~ |
| Matcher thresholds | **0.80 / 0.40 / margin 0.03** | ~~0.85 / 0.15~~ |
| Wrong review rows | **28 queued, never written** | — |

### [CORRECTED] The funnel — there are two, and they must never be mixed

The previous revision quoted **254 → 128 → 76 → 11**. **That figure set is retired.**
It came from the 2026-08-31 run, before D-015, over the full 254-mention corpus with
**no train/dev/test split**. It is neither the build that ships nor the demo you show.

**Funnel A — the evaluation** (`python eval.py`, held-out test split):

```
154  test mentions (no threshold tuned on them)
 67  auto-linked                     43.5% coverage, 100% precision
 39  schedule nodes received auto-linked mentions
 32  of those had no measurable quantity → no percentage, no date written
  7  had a measurable quantity, and all 7 finish dates were WITHHELD
     because the only date available was the report header date (D-015)
```

**Funnel B — the live demo database** (what a judge sees on the Schedule screen):

```
120  activities in the baseline
 67  activities carrying actuals
 38  activities completed
 12  activities on the critical path
 18  source conflicts surfaced for planner adjudication
```

**[ADDED] Re-read Funnel B off the running server today** after
`python scripts/reset_demo.py`, and confirm it before rehearsal. Never present a number
you have not seen on screen that day.

---

## 3. Phase 1 — Squad A: Documents, Deck and Research

**Scope note:** this is **six documents plus a generated PDF**, not two. `README.md` and
`DEMO.md` are here rather than with Squad B, because it is the same work and Squad B's
day is fully committed.

### 1a · Fix `pitch_deck.md`

Ten claims contradict the code. **[CORRECTED]** — four replacements proposed in the
earlier revision were themselves wrong and are rewritten here.

| Slide claim | Replace with | Why |
| :--- | :--- | :--- |
| "96.7% Top-1 Precision" | **86.9% top-1 · 100% auto-link precision (67/67)** | 96.7% is a **recall@3** figure from a superseded corpus (`DECISIONS.md:4234`). Wrong metric name, wrong corpus |
| "≥0.85 and margin ≥0.15" | **0.80 / 0.40 / margin 0.03** | `SHIPPED_THRESHOLDS`, `matching/config.py` |
| "audio hash" in the audit ledger | **Delete.** Provenance is file, line and character span | No audio is captured, stored or hashed. Zero occurrences in the codebase |
| "Offline-First PWA, offline voice queue" | **"Runs entirely on-premise. No cloud service, no API key, nothing leaves your network."** | **[CORRECTED]** There is **no service worker**. The manifest makes it installable, not offline-capable. Do not say "offline-first architecture" either — see Phase 2. For a PSU, "nothing leaves your network" is the stronger claim anyway |
| "Dual-engine OCR" beside "zero internet dependency" | Deterministic document and spreadsheet parsing with character-level provenance. If OCR comes up: *"optional, local Tesseract if installed; the cloud path needs a key and ships off"* | The two slides contradict each other. `extraction/ocr.py` falls back to Gemini/OpenAI, which needs a key and a network |
| "bi-directional MS Project" | **"We parse real P6 PMXML and XER — pure Python, no MPXJ, no JVM. We export both; the XER writer is our own simplified shape, not a P6-valid file, and we say so."** | **[CORRECTED]** `matching/providers.py` states the XER writer "does not produce valid XER; see D-047". There is no `.mpp` support at all |
| "0.42 spools/day" | **Delete.** | Appears nowhere in the code or any output |
| "+35% Upper Assam monsoon" under "Pure Historical Truth" | **"Planning assumption: +35% monsoon, +20% remote site. Unadjusted figure shown alongside."** | **[CORRECTED]** The earlier revision proposed "empirical risk scenario factor". **"Empirical" claims data that does not exist.** These are assumptions. D-094 and the project's standing rule require them labelled as such, with the unadjusted value recoverable |
| "1,250+ automated tests" | **1,431** | Stale |
| "₹100s of Crores in dispute claims annually" | Cite a public source or delete | Unsourced |

### 1b · Fix `research/JUDGE_QUESTIONS.md`

**Q2 — rewrite as a strength.** **[CORRECTED]** — drop the "round-tripping" claim.

> **Q: "Your schedule is just a JSON file. Can you read Primavera?"**
>
> **A:** *"Yes. `matching/primavera.py` implements pure-Python parsers for Oracle P6
> PMXML and tabular XER — no MPXJ, no JVM. `POST /schedule/import` accepts `.json`,
> `.xml` and `.xer`, and an imported baseline becomes the project the matcher runs
> against. We export both too — to be precise, our XER writer emits our own simplified
> shape, not a P6-valid file, and we document that in D-047. The demo baseline is a
> schedule we authored, because we have no live Oil India data — but the parser is real
> and we can import a genuine export in front of you."*

**Q1** — update to **43.5% coverage** and **86.9% top-1**.
**Q3** — verify whether the dense-feature defect described is still unshipped; correct
or remove.
**Q7 and any other question quoting a metric** — reconcile against `METRICS.md`.

### 1c · [ADDED] Fix the four remaining research documents

Not in the earlier plan at all.

| File | What is stale |
| :--- | :--- |
| `research/EVIDENCE.md` | 87.2% top-1, 50.4% coverage, NO_MATCH 8.3% |
| `research/EXPERIMENTS.md` | 87.2% and 50.4% across **five** rows |
| `research/INNOVATION_ANALYSIS.md` | 50.4% coverage |
| `research/PS_ANALYSIS.md` | "Primavera import MISSING" — **false** — plus 87.2% |

**`research/NAVIS_SIH_FINAL_REPORT.pdf` is generated from these.** If it reaches the
judges, the numbers sheet will not save you. Regenerate via `research/make_report.py`
after the fixes, or do not distribute it.

### 1d · [ADDED] Fix `METRICS.md` §8, `README.md`, `DEMO.md`

- **`METRICS.md` §8** still lists *"❌ We import Primavera files"* as a forbidden
  sentence. **That sentence is now true.** Your own source of truth is telling the team
  not to say something correct. **Fix this first** — Squad A will otherwise follow it.
- **`README.md` §5** claims Primavera import is not implemented (it is), 18 API routes
  (**45 handlers over 40 paths**), 580 + 55 tests (**1,202 + 224**), two frontend roles
  (**three**), and no EVM / RAID / risk engine (**all three exist**).
- **`DEMO.md`** says Senior Management has three destinations. It has **eight**.

### 1e · Build the master metric slide

1. **The precision-at-coverage trade-off curve** — `eval.py` prints it. Mark the
   operating point. Direct evidence of engineering judgment; pre-empts "only 43%?" by
   making the trade explicit.
2. **The funnel** — Funnel A **or** Funnel B, labelled with which. Never a blend.

### 1f · Cold Q&A drill

All six answers are scripted in **`NUMBERS_SHEET.md` §3**. Every presenter delivers all
six out loud, without notes. The three that were factually wrong in the earlier
revision — corrections, LLM, real data — are marked there with what **not** to say.

---

## 4. Phase 2 — Squad B: Stability and Contingency (NOT bug fixing)

### 2a · [CORRECTED — DO THIS FIRST] The airplane-mode test

The earlier revision scheduled this for the afternoon and **asserted the answer in
advance**: *"Does the whole application function? (Yes, zero external calls)."*

**That assertion is wrong, and the answer changes your demo script — which is why it
now runs first.**

`frontend/src/hooks/useSpeech.ts` uses `webkitSpeechRecognition`. **Chrome's
implementation streams audio to Google's servers. It is not on-device and it needs the
network.**

Turn the Wi-Fi off and test honestly:

- Backend, frontend, ingest, matching, schedule, reconcile, memory, EVM, delay, RAID and
  all eight executive screens should work — those genuinely make no external calls.
- **Voice input will very likely fail.**

Then decide, **before rehearsal**, which you are doing:

- demo voice **with Wi-Fi on**, saying plainly *"browser speech needs the network; every
  other part of NAVIS runs with the cable pulled"*, or
- lead with the **typed fallback**, which is tested and always works.

**Report the result to Squad A within the hour** so the deck's on-premise wording matches
reality.

### 2b · The dead-button hunt

Open all three roles; click **every interactive element**.

- **Field Supervisor** — `/field`, `/field/reports`, `/field/clarifications`,
  `/field/profile`. Text fallback, voice toggle, language chip, respond drawer, and the
  **new rejection / resubmit flow from `3db290c`** — this shipped after the plan was
  written and has had the least human testing.
- **Project Manager** — `/home`, `/reconcile`, `/schedule`, `/ingest`, `/memory`,
  `/raid`, `/delay`. Table/Gantt toggle, critical-path filter, export buttons, audit
  drawer, activity inspection panel.
- **Senior Management** — all eight: Overview, Exposure, Progress, Milestones, Risks &
  Delays, Execution Insights, Forecasts, Management Reports.

Log anything that hangs, renders blank, or throws an unhandled console error.

**[ADDED] While in the executive layer, hunt ungrounded numbers.** D-090 removed eight
fabricated figures from those screens. Any remaining blank tile or number with no
visible basis is exactly what a judge finds first. Anything you cannot trace to an API
response goes on the list.

### 2c · [CORRECTED] Reset reliability drill

```powershell
python scripts/reset_demo.py
```

Five consecutive runs; confirm identical counts each time.

**The earlier revision said "confirm the server restarts."** It does not restart, and
should not. The script's docstring states it is safe to run **while the server is up**,
because it clears rows rather than deleting the database file — deliberately, so Windows
never fights a held file handle. **Do not teach the team to restart the server between
runs.**

Record the confirmed counts and hand them to Squad A for Funnel B.

### 2d · Triage and polish

Fix **only** what the dead-button hunt found.

**Do not touch `matching/`, `extraction/`, or any threshold in `config.py`.** A change
there risks the 100% auto-link precision claim on the last day, with no time to
re-verify.

**[ADDED] Rollback discipline — mandatory:**

1. `git commit` everything currently working **before** touching a file.
2. After every change: `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
3. If any fails and the fix is not obvious within ten minutes, `git checkout -- <file>`
   and move on. A cosmetic imperfection costs less than a broken build at 18:00.

### 2e · Chaos and contingency drills

- **Microphone denied** — verify the typed fallback in Field Supervisor mode.
- **Backend killed** — kill uvicorn mid-demo; time the relaunch; practise the sentence
  you say while it comes back.
- **Backup machine** — laptop #2 on `3db290c`, dependencies installed, and **a full demo
  actually run on it**. Not just installed — *run*.
- **Fail-safe video** — record a clean walkthrough of the full demo.
- **[ADDED] Pin the API URL.** `DEMO.md` notes that with no `frontend/.env` the UI calls
  `http://<hostname>:8000`. On a venue machine with a different hostname this breaks
  silently. Create `frontend/.env` with `VITE_API_URL=http://127.0.0.1:8000` and re-test
  both shells.

### 2f · Final re-verification on the presenting machine

```powershell
python -m pytest -q
cd frontend ; npx vitest run ; npx tsc --noEmit ; npm run build
```

---

## 5. Phase 4 — Full dress rehearsal × 3

Reset between every run. Execute the whole sequence — **pitch → live demo → judge
Q&A** — at the slot length confirmed in Phase 0.

### The human-in-the-loop demo beat

In at least one rehearsal, **deliberately reject a wrong suggestion in `/reconcile`.**
Twenty-eight review rows carry a wrong top suggestion — that is in your own findings, and
showing a human catching one converts an admitted weakness into visible proof the review
loop is real rather than decorative.

**[CORRECTED] Do not script the reason.** The earlier revision had the presenter say
*"flagged because the confidence margin was below our 0.03 safety threshold."* A row is
queued because its score falls between 0.40 and 0.80 **or** because the margin is below
0.03 — and each row stores its **actual** reason. A live row pulled from the API reads
`low_confidence`, not a margin failure. **The screen will show one reason while your
presenter says another.** Read the reason off the screen.

Full presenter track: **`NUMBERS_SHEET.md` §5**.

---

## 6. Phase 5 — Lock (end of day)

`CLAUDE.md` requires every repository-changing task to end committed and pushed. Both
squads edit files all day.

```powershell
git status
git diff
git add -A
git commit -m "docs: reconcile pitch deck, research docs and README against METRICS.md"
git push
git log --oneline -1
```

Confirm the push succeeded and `main` matches `origin/main`.

**[ADDED] Three commits have no `DECISIONS.md` entry** — `30e68bc` (multilingual
localisation), `ee9097e` (agent discipline detection) and `3db290c` (field rejection and
resubmit flow). That is a prime-rule gap sitting on your three newest commits. Write
**D-098, D-099 and D-100** as part of today's documentation work, with a `FLOW.md`
**Current Modification Area** update. If a judge or mentor probes your decision
discipline, that is where the hole is.

---

## 7. Phase 6 — September 11 pre-flight (30 minutes before stage)

```powershell
# 1. Reset to the clean demo baseline
python scripts/reset_demo.py

# 2. Start the API — from the PROJECT ROOT, never from inside server/
python -m uvicorn server.main:app --port 8000

# 3. Start the UI (second terminal)
cd frontend
npm run dev
```

- [ ] `python scripts/healthcheck.py` returns green
- [ ] Browser at `http://localhost:5173`, 1280×800, **single tab**
- [ ] All three roles reachable from the picker
- [ ] Funnel B on the printed sheet matches the Schedule screen
- [ ] Laptop on AC power; sleep and screensaver disabled
- [ ] OS notifications silenced (Windows Focus Assist on)
- [ ] Wi-Fi state matches the Phase 2 decision (voice demo or typed fallback)
- [ ] Demo source files under `dataset/` located and openable
- [ ] Backup video open in a minimised player
- [ ] Backup laptop powered, on `3db290c`, demo already run on it
- [ ] Printed `NUMBERS_SHEET.md` in the presenter's hand

---

## 8. The Six Rules for Today

1. **No new features.** None.
2. **Do not touch the matcher, the extractor, or any threshold.** The 100% auto-link
   precision claim is the entire pitch.
3. **Fix documents and slides, not working code.** The documents are what is wrong.
4. **If a number is not on `NUMBERS_SHEET.md`, do not say it.**
5. **A softened false claim is still a false claim.** When a slide is wrong, replace it
   with something the code supports, or delete it. Do not reword it.
6. **Rehearsal beats everything.** Judges score what they see and hear.

---

*NAVIS · Problem Statement SIH26122 · Oil India Limited · verified at commit `3db290c`, 2026-09-10*
