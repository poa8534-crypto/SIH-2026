# NAVIS — run-up to the internal hackathon, Fri 4 Sep

Written 1 Sep. Three working blocks: tonight, Wed, Thu. Friday is the event.

The governing rule for all three days: **the demo is the deliverable.** Every
number you say out loud must match what is on the screen behind you. Right now
they don't, and that is the thing to fix first.

---

## TONIGHT (Tue 1 Sep) — 2 hours. Measure. Change nothing.

You cannot plan the next two days until you know what the code actually does
today. Three commands, three outputs, then stop.

### 1. What does the demo reset actually produce?

```powershell
# terminal 1
$env:NAVIS_ENABLE_RESET = "1"
python -m uvicorn server.main:app --reload

# terminal 2, from the project root
.\scripts\demo_reset.ps1
```

Save the whole output. **Expect the SUMMARY assertion to fail.** `DEMO.md` and
`demo_reset.ps1` both hard-code `activities=120 with actuals=67 review
queue=118`, and those predate D-015. D-015's own verification section says the
ingest path now finishes 38 activities and pushes 17 withheld-finish items into
the planner queue. So the queue is roughly 135, not 118.

A failing assertion here is **information, not a disaster.** It is the script
doing its job.

### 2. Does the test suite still pass?

```powershell
python -m pytest -q
```

D-015 recorded 435 passing. Anything below that is a regression from D-016/022/023
and jumps to the front of the queue.

### 3. What are the current headline metrics?

```powershell
python eval.py > research\data\eval_v1_current.txt
python eval.py --cv > research\data\eval_v1_cv.txt
```

You need `auto-link precision` from this. If it is still 100.0%, your best
sentence survives. If it moved, everything else waits.

### Then stop and send me all three outputs.

That's tonight. Do not start fixing anything. Two hours, three commands, go to bed.

---

## WED 2 SEP — morning: make the demo honest again

### W1. Two server-side fixes (20 min, no frontend rebuild needed)

**Fix A — the live 400 error.** `Reconcile.tsx:227` sends `{action:'reject'}`.
`_resolve_defaulted_finish` accepts only `confirm` and `ignore`, so rejecting
any of the 17 withheld-finish items throws an error banner on stage. This
matters because your own FINDINGS.md recommends the "deliberately reject a wrong
suggestion" beat.

In `server/main.py`, at the top of `_resolve_defaulted_finish` (~line 1481),
replace:

```python
    if req.action not in ("confirm", "ignore"):
        raise HTTPException(
            400,
            f"Review item {item.id} is a withheld finish date; "
            "the only actions are 'confirm' and 'ignore'",
        )
```

with:

```python
    # The Reconcile screen sends 'reject' for "not this". On a withheld finish
    # date that means exactly what 'ignore' means — leave the node complete with
    # no Actual Finish — so normalise before the guard rather than 400 on the
    # UI's own verb.
    action = "ignore" if req.action == "reject" else req.action
    if action not in ("confirm", "ignore"):
        raise HTTPException(
            400,
            f"Review item {item.id} is a withheld finish date; "
            "the only actions are 'confirm', 'reject' and 'ignore'",
        )
```

Then, ~10 lines below, change `if req.action == "ignore":` to `if action == "ignore":`.

**Fix B — the queue comes back in the wrong order.** `main.py:1238` sorts by
`ReviewQueueItem.priority.desc()`. `priority` is a *string* column, so that puts
`"medium"` above `"high"`. The Reconcile screen masks it by re-sorting
client-side with its own weight map, but the API is wrong and anything else
reading it gets the wrong order.

Line 42, change:

```python
from sqlalchemy import func
```

to:

```python
from sqlalchemy import case, func
```

Then replace the `order_by` at ~line 1237:

```python
    items = query.order_by(
        ReviewQueueItem.priority.desc(),
        ReviewQueueItem.created_at,
    ).all()
```

with:

```python
    # priority is a string column: .desc() would sort 'medium' above 'high'.
    # Rank by meaning instead.
    priority_rank = case(
        {"high": 3, "medium": 2, "low": 1},
        value=ReviewQueueItem.priority,
        else_=0,
    )
    items = query.order_by(priority_rank.desc(), ReviewQueueItem.created_at).all()
```

Re-run `python -m pytest -q` after both. Then re-run `demo_reset.ps1`.

### W2. Rewrite the numbers (45 min)

With tonight's real output in hand:

- Update the known-good table in `DEMO.md` (activities / with actuals / completed
  / review queue / audit records / conflicts).
- Update the `SUMMARY` assertion inside `scripts/demo_reset.ps1` to match, so the
  script stops crying wolf.
- Walk **all six** demo steps live and correct every figure quoted in the script:
  step 1's four Home tiles, step 2's ingest trace (`18 events / 12 auto-linked /
  8 activities`), step 4's worked example (`PIP-SPL-1028`, four audit records),
  step 6's `PIP-HYT` baseline-5d-suggested-6d.

Any figure you can't reproduce, **delete from the script** rather than hoping.

### W3. New: say something about the withheld dates (15 min, no code)

D-015 gave you a genuinely good beat and nobody has written it into the demo.
The Schedule screen now renders an inferred date dotted-underlined with a `~`.
Add one line to the demo script at step 4:

> "This activity has no Actual Finish. The report said the work was done but
> never said when — so the system refused to write the day the report was typed
> and sent it to the planner instead. Seventeen of those. We'd rather have a gap
> than a date nobody asserted."

That is your precision story, on screen, in one sentence. It costs nothing.

---

## WED 2 SEP — afternoon: ONE build item, behind a kill switch

**The alias lexicon (FINDINGS F4).** Wire the planner's corrections into
retrieval so a live correction visibly teaches the system: correct one item on
stage → re-ingest the same DPR → the previously-uncertain line auto-links.

This is the only genuinely new thing a judge would see, and no other team will
have a closed loop. It is also the riskiest thing on this list, because it
touches `matching/`, which is why 100% auto-link precision holds.

**The rules, and they are not negotiable:**

1. Work on a branch. `git checkout -b alias-loop`.
2. `AliasLexicon` is written at `main.py:1641` and imported nowhere in
   `matching/`. The read side goes in retrieval: normalise the event text, look
   it up, and on a hit inject that activity into the candidate pool with a strong
   prior. Do not touch the feature weights or the thresholds.
3. **Acceptance test before you merge:** `python -m pytest -q` still green, and
   `python eval.py` still reports auto-link precision **100.0%**. If precision
   moves at all, revert. Not "investigate" — revert.
4. **Hard cutoff: 18:00 Wednesday.** If it is not merged, verified and rehearsed
   by then, `git checkout main` and it never happened. A half-wired learning loop
   is worth less than a clean run.

If you skip it, you lose nothing you already have. You still have two
differentiators most teams won't touch: **source conflicts** (25 cases where two
field sources disagree, each naming file and line) and **institutional memory**.
Give those the stage time instead.

### Wed evening — dry run #1, end to end, timed.

---

## THU 3 SEP — no code. Pitch and rehearsal.

### T1. Morning — the three answers that can sink you

Write them out and say them aloud. Each is a question a judge *will* ask, and
each has a good honest answer you currently haven't rehearsed.

**"Where did the baseline schedule come from?"**
Hand-written JSON. Say it before they ask. Then: the `ScheduleProvider` interface
exists and `POST /schedule/import` works; PMXML and XER are declared and
deliberately unimplemented because we had no real Primavera export to test
against, and we'd rather ship a stub that says so than a parser we never ran on
real data.

**"You said 50% coverage — how many of the 120 activities actually got dates?"**
Lead with the funnel, never the point metric: 254 mentions → 128 auto-linked →
76 nodes touched → the ones that got dates. Every narrowing is a guard you chose.
The last one is the quantity guard, and it is *why* precision is 100%.

**"Does it learn from the planner?"**
If you shipped the alias lexicon: demo it, don't describe it.
If you didn't: *"corrections are recorded as a training signal today and not yet
read back at match time. That's the next thing we build, and here's the row in
the database."* Do **not** claim the loop closes. It unravels in one follow-up.

### T2. Afternoon — dry runs #2 and #3, on the actual laptop you'll present on

Not your dev machine. The venue one. Check specifically:

- Does the microphone work on that browser? `DEMO.md` already documents the typed
  fallback — rehearse the *typed* path, assume the mic is blocked.
- Is port 8000 free? Know the `--port 8001` + `frontend/.env` workaround cold.
- Run `demo_reset.ps1` between every rehearsal.

### T3. Evening — freeze

- `git commit` everything. Tag it.
- Copy the whole working folder to a USB stick **and** somewhere online.
- Screen-record one complete clean run. If the live demo dies on Friday, you play
  the recording and keep talking. This has saved more hackathon teams than any
  feature.
- Stop touching the code. Anything you think of after this goes on a list titled
  "roadmap", which is a slide, not a commit.

---

## FRI 4 SEP — run sheet

1. Arrive early. Plug in. Start both terminals. Run `demo_reset.ps1`. Confirm the
   summary matches.
2. Open all six screens in tabs **before** you present, in demo order.
3. Open the screen recording in a background tab as insurance.
4. Present in the `DEMO.md` order: Home (dwell on source conflicts) → Ingest →
   Reconcile (reject one deliberately) → Schedule (audit drawer + the withheld
   date line) → Field (typed, not spoken) → Memory.
5. If something breaks: don't debug on stage. Say "that panel fetches
   independently — here's the same thing from the recording," and carry on.

---

## Not doing, and why

| Item | Why not |
|---|---|
| Cross-encoder re-ranker | Days of work aimed at a metric a campus judge won't ask about. New model dependency to fail on venue wifi. |
| Learned feature weights | Risks the 100% precision figure — your single best defensible number — for no visible gain. |
| PMXML/XER reader | You have no real Primavera export anywhere in `datasets/`. Parsing one you exported yourself is circular. The stub answers the question honestly. |
| Confidence calibration / ECE | A national-round answer. Nobody at a campus internal will ask for expected calibration error. |
| recall@3 on near-misses | Genuinely useful, ~20 min — but only if someone not on the demo has a spare slot. It defuses the 26.5% number if that ends up on a slide. |
| Confirming the WSDOT review | Also worth 30 min *if* someone is free. It's already drafted in `research/wsdot_c8078_verification_review.md` and buys you the best sentence in the pitch: "we tested against real 2011 WSDOT inspector reports, not just data we wrote ourselves." |

## Housekeeping, whenever

- `-.json` at the repo root is a scratch v1/v2 tag dump. Delete it.
- `.git` is a 291 MB pack because `datasets/` isn't in `.gitignore`. Leave it
  until after the 4th — a `filter-repo` and force-push is not a thing to do this
  week. When you do, drop `datasets/real/_staging/`, which duplicates ~85 MB of
  `datasets/real/raw/` exactly.
