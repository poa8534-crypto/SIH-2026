# NAVIS — RUN SHEET, 11 September 2026

**Judging: 15:00. This sheet was scoped at 12:50.**
Problem Statement SIH26122 · Oil India Limited · Team NamasteByte

> **This supersedes `HACKATHON_EVE_BATTLE_PLAN.md` for today.** That plan was written
> for 10 September as "the only full prep day" and its phase *shape* is still right —
> but four of its load-bearing claims are no longer true, and its Phase 1 is already
> spent. Read this sheet, then your own phase. Keep `NUMBERS_SHEET.md` in your hand.

---

## STOP — the one thing that matters before anything else

```bash
git pull
```

**Anyone still on `3db290c` or earlier is running a broken build.** `POST /ingest`
returned HTTP 500 on that code — the single endpoint the entire demo narrative runs
through. Fixed in `bee2694` (D-103). If you demo from an unpulled machine, the ingest
step dies in front of the judges.

Confirm you are on it:

```bash
git log --oneline -1
```

You want `bee2694` or later.

---

## What changed since the eve plan was written

| The eve plan says | Actually true now |
|---|---|
| *"You have no known bugs. Putting three people on fix-bugs wastes half your team"* | `/ingest` was 500ing; backend 83 failed + 41 errors, frontend 43 failed. Environmental, not logic. Fixed in `bee2694` |
| `pytest -q` → **1,202 passed** | **1,055.** Verified at `3db290c` too, in a clean worktree — 1,202 was never a real run |
| Total **1,431** tests | **1,284** (1,055 pytest + 229 vitest). The printed deck still says 1,431 — see below |
| Phase 5 must write D-098/099/100 | Already written, through D-102. That gap is closed |
| Phase 1 = a full day of document repair | Squad A finished it. Two items survived; both fixed in D-104 |

**The deck disagrees with the sheet on one number.** The slide says 1,431 tests. The
real count is 1,284. The PPTX and PDF are final and we are not rebuilding them at
T-2h. If a judge points at it:

> *"That figure on the slide is stale — the real count is 1,284, 1,055 Python and 229
> TypeScript. You can run `python -m pytest -q` on this laptop right now."*

Own it in one sentence and move on. Do not defend 1,431. It is the one number a judge
can check in ten seconds, and being the team that corrects itself reads far better
than being the team that got caught.

---

## Gate status at 12:50

| Phase | Gate | Status |
|---|---|---|
| 0 · Sync | Slot length · 4 roles · all machines on `bee2694` | **RED** — nothing confirmed |
| 1 · Truth pass | No document contradicts `METRICS.md` | **GREEN** — closed by D-104 |
| 2 · Stability | Airplane answer · zero dead buttons · reset drill · `.env` pinned · fail-safe video | **RED** — `frontend/.env` missing, no video |
| 3 · Assets | Metric slide · Q&A cold | deck **GREEN** · Q&A **RED**, never said aloud |
| 4 · Rehearsal | 3 clean runs at slot length | **RED** — zero |
| 5 · Lock | `main == origin/main` | **GREEN** at `bee2694` |
| 6 · Pre-flight | §7 checklist | pending |

**Phases 1, 3-assets and 5 are done. Everything red is Phase 0, 2 and 4.**

---

## P0 · SYNC & DECIDE — 12:50 → 13:05 · team lead solo

Everything downstream blocks on two decisions only you can make.

- [ ] **Slot length.** The eve plan scripts 2 min pitch + 2 min demo + 3 min Q&A. If
      the real slot is 10 or 15 minutes, P4 is the wrong shape and you must know now.
- [ ] **Four roles, named out loud:**
      - **Presenter** — speaks the pitch, narrates the demo
      - **Driver** — operates the laptop. **Never the same person as the presenter**
      - **Q&A lead** — fields judges, owns `METRICS.md`
      - **Reset operator** — runs `scripts/reset_demo.py`, watches the clock
      The other two are backup presenter and backup driver, able to take over cold.
- [ ] **Every machine `git pull`** — confirm `bee2694` on all six, out loud, one by one.
- [ ] Charge everything. Print `NUMBERS_SHEET.md`, one copy per person.

**Exit gate:** slot known · roles named · six machines confirmed on `bee2694`.

---

## P1 · PRESENTING-MACHINE PROOF — 13:05 → 13:25 · driver

Not "a machine." **The** laptop that goes on stage.

```bash
git pull
python -m pytest -q                 # expect: 1055 passed
python scripts/healthcheck.py       # expect: 31 passed, 0 failed
```

- [ ] The healthcheck output must contain **`dense retrieval   MiniLM (offline)`**.
      **If it says anything else, the hashed fallback is live and no number on the
      printed sheet is quotable.** Stop and say so immediately.
- [ ] **Create `frontend/.env`** — still missing, and it is eve-plan item 2e:
      ```
      VITE_API_URL=http://127.0.0.1:8000
      ```
      Without it the UI calls `http://<hostname>:8000`. On a venue machine with a
      different hostname that breaks **silently**.
- [ ] `python scripts/reset_demo.py` three times; identical counts each time.
      Do **not** restart the server between runs — the script is designed to run
      while it is up.
- [ ] **Airplane test, 3 minutes.** Wi-Fi off, click through all three roles.
      Everything local works. Chrome's `webkitSpeechRecognition` streams audio to
      Google and will fail. **Decide now:** voice with Wi-Fi on and say plainly
      *"browser speech needs the network; every other part of NAVIS runs with the
      cable pulled"* — or lead with the typed fallback, which always works.
      **Report the decision to the presenter immediately**, it changes the script.

**Exit gate:** suite green on the stage laptop · `MiniLM (offline)` confirmed · `.env`
created and both shells re-tested · Wi-Fi decision made and communicated.

---

## P2 · DEAD-BUTTON SWEEP — 13:25 → 13:55 · two people, parallel

Click **every** interactive element. Log anything that hangs, renders blank, or throws
an unhandled console error.

**Person 1 — Field + Project Manager**
`/field`, `/field/report`, `/field/reports`, `/field/reports/ledger`,
`/field/clarifications`, `/field/profile`, then the planner's seven:
`/home`, `/reconcile`, `/schedule`, `/ingest`, `/raid`, `/delay`, `/memory`.
Pay special attention to the **rejection / resubmit flow** — it shipped in `3db290c`
and has had the least human testing of anything in the repo.

**Person 2 — Senior Management, all eight**
`/executive`, `/milestones`, `/progress`, `/risks`, `/forecasts`, `/insights`,
`/reports`, `/confidence`.
**This is where "the executive lane feels incomplete" gets resolved — as a defect
list, not a rewrite.** All eight destinations exist, are routed, carry no stubs or
placeholders, and 19 tests cover them. Hunt *ungrounded numbers*: D-090 removed eight
fabricated figures from these screens. Anything you cannot trace to an API response
goes on the list.

**Fixing rules — non-negotiable:**
1. Fix **only** what this sweep finds.
2. **Do not touch `matching/`, `extraction/`, or any threshold.** The 100% auto-link
   precision claim is the entire pitch and there is no time to re-verify it.
3. After every change: `npx tsc --noEmit && npx vitest run`.
4. **Ten-minute rule** — not obviously fixable in ten minutes, `git checkout -- <file>`
   and move on. A cosmetic flaw costs less than a broken build at 14:30.

**Exit gate:** every screen visited · defect list written down · build still green.

---

## P3 · DRESS REHEARSAL ×3 — 13:55 → 14:35 · everyone

**This is the gate that decides your score. It does not slip.** If P2 overruns, ship
the defect list unfixed and rehearse anyway.

Reset between every run. Full sequence — **pitch → live demo → judge Q&A** — at the
slot length confirmed in P0.

- [ ] **Run 1** — straight through. Expect it to be rough.
- [ ] **Run 2** — include the **human-in-the-loop beat**: deliberately reject a wrong
      suggestion in `/reconcile`. Twenty-eight review rows carry a wrong top
      suggestion; showing a human catching one turns an admitted weakness into visible
      proof the review loop is real.
      **Read the reason off the screen. Do not script it.** A row is queued because its
      score falls between 0.40 and 0.80 **or** because the margin is under 0.03, and
      each row stores its actual reason. A live row reads `low_confidence`, not a
      margin failure. If the presenter says one thing while the screen says another,
      that is the moment you lose the room.
- [ ] **Run 3 — on the backup laptop.** Not "installed on it." *Run* on it. Otherwise
      "we have a backup" is a claim, not a fact.
- [ ] Q&A lead: `research/JUDGE_DRILL_02_ANSWERS.md`, cold, out loud. 575 lines and
      nobody has said them under pressure yet. A62 now reads 1,284 — it was wrong.

**Exit gate:** three clean runs at slot length · one included a live rejection · one
was on the backup machine · every presenter has delivered the six core answers cold.

---

## P4 · LOCK + FAIL-SAFE — 14:35 → 14:45 · lead + driver

- [ ] **Screen-record one clean full run.** You have no fail-safe video. At ten minutes
      of cost this is the single cheapest insurance on this sheet.
- [ ] ```bash
      git status && git add -A && git commit -m "..." && git push
      ```
- [ ] Confirm `main == origin/main`.
- [ ] **No code changes after this point, by anyone.** Say it out loud to the team.

---

## P5 · PRE-FLIGHT — 14:45 → 15:00 · all

```bash
python scripts/reset_demo.py                      # 1. clean baseline
python -m uvicorn server.main:app --port 8000     # 2. API, from the PROJECT ROOT
cd frontend && npm run dev                        # 3. UI, second terminal
```

- [ ] `python scripts/healthcheck.py` green, and it says `MiniLM (offline)`
- [ ] Browser at `http://localhost:5173`, 1280×800, **single tab**
- [ ] All three roles reachable from the picker
- [ ] Funnel B on the printed sheet matches the Schedule screen
- [ ] Laptop on AC power; sleep and screensaver disabled
- [ ] OS notifications silenced
- [ ] Wi-Fi state matches the P1 decision
- [ ] Demo source files under `dataset/` located and openable
- [ ] Fail-safe video open in a minimised player
- [ ] Backup laptop powered, on `bee2694`, demo already run on it
- [ ] Printed `NUMBERS_SHEET.md` in the presenter's hand

---

## What we deliberately cut, and why

- **Phase 1 document repair** — done by Squad A; the two survivors are fixed in D-104.
- **Phase 3 metric slide** — the deck is final and committed.
- **Reset drill ×5 → ×3** — diminishing returns against two hours.
- **Standalone chaos drills** (backend-kill, mic-denied) — folded into P3 as *"if it
  happens, here is the sentence you say."* Rehearsing a real run beats rehearsing a
  failure you can narrate.

---

## The rules, unchanged from the eve plan

1. **No new features. None.**
2. **Do not touch the matcher, the extractor, or any threshold.**
3. **Fix documents and slides, not working code.**
4. **If a number is not on `NUMBERS_SHEET.md`, do not say it.**
5. **A softened false claim is still a false claim.** Replace it with something the
   code supports, or delete it. Do not reword it.
6. **Rehearsal beats everything.** Judges score what they see and hear.

*Scoped 2026-09-11 12:50 against `bee2694`. Authority for every number:
`METRICS.md`, then `NUMBERS_SHEET.md`. See D-103 and D-104.*
