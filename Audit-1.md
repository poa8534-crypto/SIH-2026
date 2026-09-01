# Audit-1 — NAVIS vs SIH 26122 Problem Statement

> **SCOPE: v1 CORPUS, 2026-08-30.** Every figure in this document was measured
> against the **v1** evaluation corpus — `dataset/ground_truth.csv`, 254
> labelled mentions, against the 120-activity demo baseline
> `dataset/baseline_schedule.json` — with **no train/dev/test split**. Those
> numbers still reproduce exactly (`python eval.py`) and are the numbers the
> **running application** produces, so nothing here is retracted.
>
> What they are **not** is the held-out result. A harder v2 research corpus
> (814 mentions, 218 activities, proper splits) exists and reports 71.4%
> held-out top-1. Neither number supersedes the other; they measure different
> things. **`METRICS.md` is the authority** — read §1 and §3 before quoting
> anything from this file.


**Independent gap analysis of the NAVIS prototype against the problem statement:
what is missing, what is measurably underperforming, and the order in which to fix it.**

| | |
|---|---|
| Repo | `poa8534-crypto/SIH-2026` |
| Commit | `1de9b4d` on `main` |
| Date of audit | 2026-08-30 |
| Basis | Source code read + all evaluation harnesses re-run + direct SQLite queries |
| Findings | 11 (4 critical, 5 not previously documented) |

---

## Method

Every number in this document was re-derived by executing the code, not read from
the repository's own documentation:

```bash
python -m pytest -q                 # 264 passed AT THE TIME; 580 as of 2026-09-01
cd frontend && npx vitest run       # 55 passed
python eval.py                      # headline metrics, confusion table, tau sweep
```

plus direct `sqlite3` queries against `dataset/epc_progress.db`, and reading
`research/data/*.json` (ablation, bm25gate, densefix, latency).

**Result: the repository's own `NAVIS_TECHNICAL_AUDIT.md` is accurate.** I could not
find a claim in it that the code contradicts. That is unusual and it is worth
defending in front of judges.

Because that self-audit is sound, this document does not re-list what it already
caught. Its contribution is three things:

1. The one number in the repo's own research folder that undercuts the core
   architectural claim, and needs a rehearsed answer.
2. Five defects the existing audit does not mention (marked **NEW** below).
3. A ranked order of work.

---

## Verdict

The engineering is well above typical hackathon standard: 319 passing tests, a
reproducible experiment log, and an `ARCHITECTURE.md` that documents its own
failures more honestly than most production systems do.

The prototype demonstrates every headline PS capability at least partially. The
two things that will be attacked are (a) the matching engine is measurably worse
than a trivial baseline on ranking, and (b) the "institutional memory"
differentiator is a real mechanism containing almost no data.

---

## Verified metrics (re-run 2026-08-30)

| Metric | Value | Note |
|---|---|---|
| Auto-link precision | **100.0%** | 0 wrong AUTO_LINKs in 254 mentions |
| Coverage (auto-linked) | **50.4%** | 128 of 254 mentions |
| Top-1 accuracy | **87.2%** | shipped hybrid + feature scoring |
| Top-1, tags stripped | **70.1%** | n = 87 |
| Suggestion precision | 83.1% | 207 correct of all concrete suggestions |
| Suggestion recall | 85.5% | of 242 gold positives |
| NO_MATCH rejection | 8.3% | 1 of 12 correctly refused |
| Review-queue load | **121 items** | of which 31 carry a wrong top-1 |
| Latency | ~7 ms/event | 266 events in 1.86 s; 4.4 s cold start |
| Tests passing | **319** *(at the time)* | 264 pytest + 55 vitest. **Now 635: 580 pytest + 55 vitest** |

Dataset: 120 activities, 254 gold mentions, 11 DPRs, 2 discipline spreadsheets.

---

## What to protect (do not cut these)

- **Zero wrong auto-links.** Not one AUTO_LINK in 254 mentions wrote a wrong
  activity. The margin guard and discipline-conflict guard are doing real work.
- **Provenance that actually resolves.** Audit rows carry a real foreign key plus
  file/line/row, and where a position is absent the system says so rather than
  inventing one. The cp1252 decoding fix in `extraction/textio.py` is the kind of
  detail that separates a prototype from a toy.
- **Cross-file conflict detection.** 25 surfaced conflicts, 21 spreadsheet-vs-DPR,
  and the UI states that the stored value is the last writer rather than the
  correct one.
- **The research corpus.** Eight reproducible experiments, each with a harness.
  Most teams cannot answer "why this design?" with a command.

---

# CRITICAL FINDINGS

## F-01 — The matching engine ranks worse than plain BM25, and the defense is buried

**Severity: CRITICAL · Verified**

This is in the repo's own `research/data/ablation.json`. The shipped pipeline is
the *least* accurate ranking arm measured, and 37x slower than the best one.

| Retrieval arm | Top-1 | R@20 | ms / mention |
|---|---:|---:|---:|
| EXACT (tag only) | 4.9% | 32.2% | 0.005 |
| BM25 (lexical only) | **93.8%** | 99.2% | **0.15** |
| DENSE (MiniLM only) | 88.8% | 100% | 4.81 |
| HYBRID RRF (no scoring) | 92.1% | 100% | 4.95 |
| **HYBRID + feature scoring — SHIPPED** | **87.2%** | 100% | 5.55 |

Both sophisticated stages are net-negative on ranking: adding the dense channel to
BM25 costs 1.7 points, and adding the six-feature scorer costs another 4.9 points.

A judge who opens this file asks the obvious question, and "we built a hybrid
retriever" is not an answer to it.

**There IS a real answer, and almost nobody will find it.** It is in
`research/data/bm25gate.json`: BM25 ranks better but *gates* worse.

| Gating approach | Coverage at 100% auto-precision |
|---|---:|
| BM25 raw-score threshold (gate=14) | 35.0% |
| **Shipped hybrid (tau_high=0.775)** | **50.4%** |

The product is not ranking, it is a calibrated confidence that supports an
auto-link decision. That is a legitimate and interesting argument. It is currently
invisible.

### How to combat it

- **Lead with the gating chart, not the hybrid architecture diagram.** Put the
  precision-at-coverage curve on the slide and state plainly: *"BM25 ranks better;
  we optimised for the decision, not the ranking, because a wrong auto-link
  corrupts a schedule."* That converts the weakest number into the most
  thoughtful one.
- **Run the arm never tested:** BM25 retrieval + feature scoring, dense channel
  off. Nothing in the experiment set isolates whether MiniLM's 33x latency earns
  its place once the scorer is present. If gating holds without it, the result is
  a leaner, faster, more defensible system.
- **Ship `densefix`.** Already measured in `research/data/densefix.json`: filling
  `embedding_cosine` for all candidates instead of only dense-channel survivors
  gives Top-1 87.2% → 89.7% and coverage 50.4% → 52.0%, auto-precision unchanged
  at 100%. Free accuracy sitting unshipped. **See F-09 first — there is a booby
  trap in that exact function.**

---

## F-02 — At 50.4% coverage, half the manual reconciliation the PS complains about still happens

**Severity: CRITICAL · Verified**

The PS's grievance is that "manual reconciliation with the baseline schedule is
slow, error-prone, and often lags the schedule update cycle by days or weeks."

NAVIS leaves **121 of 254 mentions** for a human. That is a genuine halving, but it
is not automation, and the framing matters enormously.

```
Confusion table — eval.py
  Gold activity, correct  ->  128 AUTO_LINK  ·  79 REVIEW
  Gold activity, WRONG    ->    0 AUTO_LINK  ·  31 REVIEW (misleading)  ·  4 NEW (miss)
  NO_MATCH, refused       ->   11 REVIEW (safe)  ·  1 NEW (correct)
```

The sharper risk is inside that queue: **31 of the 121 review items present a wrong
top-1 suggestion.** A planner clearing the queue at ten seconds an item is being
nudged toward the wrong activity roughly a quarter of the time.

That is textbook automation bias, and it is more dangerous than a visible failure
because the 100% auto-precision headline implies the suggestions are trustworthy.

### How to combat it

- **Treat the review queue as the product, not the fallback.** Right now it reads
  as an admission. Reframed, it is the planner's cockpit — and it is where the
  actual differentiation lives.
- **Never show a single pre-selected answer.** For REVIEW outcomes, present top-3
  side by side with their distinguishing features. Costs nothing, structurally
  removes the bias.
- **Batch by pattern.** Items sharing a tag family, discipline, or source line
  should approve in one keystroke. 10 s x 121 is twenty minutes; batching
  plausibly takes it under five.
- **Change the headline metric.** "50% coverage" invites "what about the other
  half?". *"A schedule update that took two days now takes twenty minutes"* is the
  same fact and it answers the PS directly.

---

## F-03 — The learning loop is open: the system cannot get better

**Severity: CRITICAL · Verified**

Every planner correction writes an `alias_lexicon` row. Three call sites in
`server/main.py`:

```
server/main.py:1101   _upsert_alias(db, le.raw_text, target_activity_id, ...)
server/main.py:1145   _upsert_alias(db, le.raw_text, req.activity_id, ...)
server/main.py:1199   _upsert_alias(db, le.raw_text, req.new_activity_id, ...)
```

The `matching/` package contains **zero references to it.** Confirmed by grep
across the whole package.

So a planner can correct "spool erected" → `PIP-ERC-1034` a hundred times and the
matcher asks the hundred-and-first time exactly as it asked the first.

For a problem statement whose central theme is capturing knowledge "instead of that
knowledge staying locked in individual supervisors' experience," this is the
deepest contradiction in the build. The existing audit flags it as risk R7; this
audit argues it is not a risk — it is the missing half of the thesis.

### How to combat it

- **Read the lexicon back as a fourth retrieval channel** in
  `HybridRetriever.retrieve()` — an exact/near-exact alias hit resolving to an
  activity, weighted near the tag channel. The RRF fusion already accepts arbitrary
  channels, so this is roughly 40 lines and no architectural change.
- **Then demo the delta.** Ingest, correct five items, re-ingest, show coverage
  move. *"Correct it once and it never asks again"* is a thirty-second demo moment
  that no competing team will have, and it turns the largest gap into the
  strongest scene.

---

## F-04 — Institutional memory, the stated differentiator, is statistically empty

**Severity: CRITICAL · Verified · Extends the existing audit**

`ARCHITECTURE.md` calls institutional memory "your only defensible differentiator"
and promotes it to primary. Measured contents:

```
dataset/epc_progress.db
  audit spans scanned        139
  delay causes found           4   fencing conflict, holiday delay,
                                   piling rig breakdown, rain delay
  activities per cause         1   each
  review resolution notes      0
```

Beyond thinness, three structural problems the existing audit does not name:

**1. The detection is overfit to the project's own corpus.**
`_compute_delay_reasons` (`server/main.py` ~2100) substring-matches twelve
hardcoded English phrases — `"piling rig breakdown"`, `"fencing conflict"`,
`"holiday delay"` — which are verbatim from the synthetic DPRs. A real report
saying "hydra not available" or "crane was down" yields nothing. This is
pattern-matching the test data.

**2. The taxonomy specified in the architecture was never built.**
`ARCHITECTURE.md §2.7` defines ten categories (`MATERIAL`, `MANPOWER`,
`DRAWING_RFI`, `PERMIT_HSE`, `WEATHER`, `EQUIPMENT`, `CLIENT_HOLD`, `REWORK_NCR`,
`FRONT_NOT_AVAILABLE`, `OTHER`) plus `impact_days` and `month`. **None exist in
code** — grep for `DRAWING_RFI` returns nothing. The shipped `DelayReason`
(`server/schemas.py:343`) is a raw keyword string with a frequency count.

**3. No `month` field means no seasonality.**
`ARCHITECTURE.md` states "`month` enables seasonality / historical-delay queries."
Without it the system cannot answer *"how much does monsoon cost us on civil
works?"* — the single most compelling institutional-memory question for Indian
infrastructure, and the one a domain-expert judge is most likely to ask.

### How to combat it

- **Build the §2.7 contract already designed.** Add `category`, `month`,
  `impact_days`. Classification is exactly what an LLM is good at, and the provider
  is already plumbed and guarded behind `EXTRACTION_PROVIDER` — keyword matching
  becomes the fallback rather than the mechanism.
- **Ship the monsoon query.** "Civil activities starting July–September overran by
  X% versus the rest of the year" is worth more than three generic charts.
- **Be first to state the sample size.** The UI already shows `actuals_count`
  everywhere — that instinct is right. Say "this is the mechanism, on ten days of
  synthetic data" before a judge says "this is four keywords."

---

# DEFECTS NOT IN THE EXISTING AUDIT

## F-05 — Planners can never teach the system a new delay cause

**Severity: BUG · Verified · NEW**

In `_compute_delay_reasons` (`server/main.py` ~2113), the loop over planner
resolution notes iterates over a dict populated only from keywords already found in
audit spans:

```python
reasons: dict[str, list[str]] = defaultdict(list)
for ar in audit_records:            # populates `reasons`
    ...
for item in review_items:
    text = item.resolution_note.lower()
    for reason_kw in reasons.keys():        # <-- only already-found keywords
        if reason_kw in text:
            reasons[reason_kw].append(...)
```

A planner who writes "material delay — vendor slipped" contributes nothing unless
that phrase already appeared in a DPR. And when the audit pass finds nothing,
`reasons` is empty and the entire review-note loop is inert.

The most reliable signal in the system — a human expert's own words — is
structurally discarded. Currently 0 review items carry resolution notes, so this is
latent rather than observed, but it will bite the moment planners start using it.

### How to combat it

Iterate the full keyword list (or the F-04 classifier) instead of `reasons.keys()`.
One line. It unblocks the only human-curated input the memory store has, and it
pairs naturally with the F-03 learning loop as a single "the system learns from
planners" narrative.

---

## F-06 — Inferred finish dates create zero-day durations that poison the memory store

**Severity: DATA QUALITY · Verified · NEW**

In `RollupAccumulator.results()` (`matching/engine.py`), when a node is complete but
no event asserted a finish, `actual_finish` falls back to `max(reported_date)` — the
date of the last report that happened to mention it. Start has the mirror fallback.
When one report mentions a node once, start and finish collapse to the same day.

```
Activities where actual_start == actual_finish — 5 of 47 completed
  ELE-CBL-1078    3400 m   cable tray        -> installed in 0 days
  ELE-FLT-1084      48 nos light fittings    -> installed in 0 days
  PIP-INS-1047      80 m2  insulation        -> installed in 0 days
  PIP-INS-1045     120 m2  insulation        -> installed in 0 days
  ELE-SWG-1082       6 nos switchgear        -> installed in 0 days
```

These are not observations, they are artifacts of report cadence — and they flow
straight into the duration statistics that F-04's institutional memory is built on.
Only 47 of 120 activities have both dates, so corrupting 5 of them matters at this
sample size. It compounds the effect `ARCHITECTURE.md` already noted, that 32 of 47
show identical planned and actual dates.

### How to combat it

Mark fallback-derived dates `INFERRED` rather than storing them indistinguishably
from asserted ones — the distinction already exists in the `date_basis` enum
(`DEFAULTED_TO_REPORT_DATE`), it just is not carried through the roll-up. Then
exclude inferred dates from duration statistics.

A smaller honest sample beats a larger contaminated one, and it yields a good line
for the pitch: *"we would rather report 40 durations we can defend than 47 we
cannot."*

---

## F-07 — One-to-many linking is absent, and the ground truth cannot reveal it

**Severity: SCOPE · Verified · NEW**

The PS explicitly names granularity mismatch. **Many-to-one is handled well**:
several mentions roll up into one node, with quantity-based percent complete.

The reverse case is unhandled. `LinkDecision.chosen_activity_id`
(`matching/models.py:77`) is a single `Optional[str]`, so one mention can never link
to several nodes.

Real DPRs are full of these: *"grouting completed for pump foundations PF-01 through
PF-06"* against six separate L5 nodes. The corpus even contains a range — "pedestals
P7 to P12" — but `dataset/ground_truth.csv` maps it to the single node
`CIV-FDN-1007`.

**Why this one is subtle:** the gold set contains no one-to-many cases at all. So
the evaluation *cannot* detect the limitation, and 100% auto-precision is partly a
property of a dataset built to the matcher's shape. This is the circularity risk
`ARCHITECTURE.md` raised as Risk B — but sharper than stated, because it is not
just labelling agreement, it is the task definition itself.

### How to combat it

Add range expansion in the prepass (`P7 to P12` → six tags) and let a decision fan
out to a set of activities with quantity split across them. Then add 15–20
one-to-many cases to the gold set.

**Expect the headline numbers to fall.** That is the correct outcome, and reporting
a lower number on a harder set you built yourself is far stronger than a judge
finding the gap on stage.

---

## F-08 — The field app cannot capture anything without connectivity

**Severity: FIELD READINESS · Verified · NEW**

There is no offline queue — no service worker, no IndexedDB, no draft persistence.
`frontend/src/pages/Field.tsx:358` handles this with real integrity:

```
// No offline storage: never claim it was saved, and keep his text.
```

and `frontend/src/test/field.test.tsx` actively asserts that no offline, draft or
sync language appears anywhere in the UI. That is honest, and it is the right call
for a demo.

But `Design/field_supervisor_update_pending_sync/` contains a pending-sync screen
that was designed and never built. A supervisor standing in a plant under a pipe
rack is exactly where connectivity fails, and "low-friction capture for site
supervisors across disciplines" is the PS's central promise.

### How to combat it

An IndexedDB queue with sync-on-reconnect is a few hours and the screen is already
designed. It moves the field story from "works in the demo hall" to "works at the
site," which is the difference between a prototype and something a judge can
imagine deployed.

If it does not get built, say so in one line before being asked — it is a scope
decision, not an oversight.

---

## F-09 — A dead duplicate of the exact method that needs fixing

**Severity: TRAP · Verified · NEW**

`matching/engine.py:157–170` contains copies of `_dense_cos` and `_unique_line`
indented inside `_rationale()`, **after its `return` statement**. They are
unreachable and never bound to the class — harmless at runtime.

```python
def _rationale(c: LinkCandidate) -> list[str]:
    ...
    return r or ["weak_evidence"]

    # ── Helpers ──────────────────────────────────────────────
    def _dense_cos(self, idx, info):     # <-- DEAD, never executed
        ...
    def _unique_line(self, idx):         # <-- DEAD, never executed
        ...
```

It matters because `_dense_cos` is precisely the function the `densefix`
improvement in F-01 has to change. Someone editing the dead copy at 3am will see no
change in the metrics and lose an hour hunting a phantom.

### How to combat it

Delete lines 157–170 before touching anything else in that file.

---

# PS COMPLIANCE GAPS

## F-10 — No schedule import: the PS names Primavera/MS Project exports as an input

**Severity: CRITICAL (PS compliance) · Verified**

```
server/main.py:701
    if suffix not in (".txt", ".xlsx", ".csv", ".md", ".log"):
        raise HTTPException(400, f"Unsupported file type: {suffix}")
```

`/ingest` rejects `.xml` and `.xer`. The baseline is a hand-written
`dataset/baseline_schedule.json`. PMXML and XER exist only as **export**
(`_generate_pmxml`, `_generate_xer` at `server/main.py:1652` and `:1713`) — the
opposite direction to what the PS asks for.

The PS names "Primavera/MS Project exports" in the same breath as the input formats
that ARE handled. A planning-domain judge will notice that the baseline is authored
by hand.

### How to combat it

PMXML import is roughly 3 hours with `lxml`. The `ScheduleActivity` contract exists
and the export writer provides the field mapping to mirror. This removes the "your
baseline is hand-written" objection at its root and turns the Primavera story into a
round trip rather than a one-way export.

**Highest credibility-per-hour item on this list.**

---

## F-11 — No authentication, no multi-project isolation

**Severity: SCOPE · Verified**

No auth anywhere in `server/`: no JWT, no session, no API key, no user model, no
roles. Every endpoint is open. There is no `project_id` column — a single SQLite
file holds a single project.

CORS additionally allows any origin on the three private IPv4 ranges (a deliberate
demo decision, documented at `server/main.py:145`), so on venue WiFi any device on
the network can read and write the API.

Two things that are **correct** and should not be changed under pressure:
`/admin/reset` is properly env-gated behind `NAVIS_ENABLE_RESET=1`, and `.env` is
correctly gitignored, never committed, and contains no live credentials.

### How to combat it

Acknowledge as scope, not oversight — one slide. Adding a `project_id` column plus
a header-based role stub is roughly 2 hours and removes an easy judge question. Full
auth is correctly out of scope for a 36-hour prototype; say that rather than letting
it be discovered.

---

# PS REQUIREMENT TRACE

| PS requirement | Status | What is actually there |
|---|---|---|
| Ingest free-text DPRs | **Met** | 11 files incl. one deliberately messy; sha256 dedup |
| Ingest discipline spreadsheets | **Met** | Civil + piping XLSX, merged headers, mixed date types |
| Ingest Primavera / MS Project exports | **MISSING** | `/ingest` rejects `.xml`/`.xer`; export only (F-10) |
| Scanned diaries / OCR | Waived | PS explicitly excuses it |
| LLM-based conversational agent | Partial | Stateful 5-slot dialogue, voice input, structured card before commit — but slot-filling is regex; LLM opt-in and off by default |
| Fuzzy-match to L5/L6, terminology drift | **Met** | Hybrid retrieval + 6-feature scoring; 87.2% Top-1, 70.1% tags stripped |
| Granularity mismatch | Half | Many-to-one roll-up strong; one-to-many absent (F-07) |
| Flag unmatched rather than drop | **Met** | REVIEW / NEW_ACTIVITY; nothing silently dropped |
| Confidence score + audit trail | **Met** | Append-only audit, real FK, file/line/row, cross-file conflicts |
| Near-real-time schedule update | **Met** | Synchronous on submission, ~7 ms/event |
| Structured discipline-tagged dataset | **Met** | Clean relational store, queryable |
| Institutional memory repository | Thin | Mechanism real, contents near-empty (F-04) |
| Feeds forecasting / risk analytics | Partial | Clean data + delay analytics; no forecasting model |
| Multi-project / auth / roles | **MISSING** | No authentication; single SQLite file; no `project_id` (F-11) |

---

# ORDER OF WORK

Sequenced by leverage, not by severity.

| # | Work | Effort | Findings |
|---|---|---|---|
| 1 | Delete the dead code, then ship `densefix` | ~10 min | F-09, F-01 |
| 2 | Fix the resolution-note loop; mark inferred dates | ~1 h | F-05, F-06 |
| 3 | Close the learning loop — read `alias_lexicon` in retrieval | ~2 h | F-03 |
| 4 | PMXML import | ~3 h | F-10 |
| 5 | Rebuild the delay taxonomy (§2.7 + `month` + monsoon query) | ~3 h | F-04 |
| 6 | Harden the review queue — top-3, batch approval, re-time it | ~2 h | F-02 |
| 7 | One-to-many linking; offline capture queue | if time | F-07, F-08 |

**Rationale for the ordering.** Step 1 is free measured accuracy. Steps 2 and 5
both feed the institutional-memory story, which is the stated differentiator and
currently the weakest evidence. Step 3 has the highest ratio of narrative payoff to
engineering effort in the whole list — it is the difference between a pipeline and a
system that learns. Step 4 removes the most concrete PS-compliance objection. Step 6
is presentation-critical but changes no core logic, so it can absorb a slip.

---

# THREE QUESTIONS TO REHEARSE

Each is answerable from work already done. None is answerable if met for the first
time on stage.

**1. "Why is your hybrid worse than BM25 alone?"**
Because we optimised the decision, not the ranking. At 100% auto-precision BM25
covers 35%, we cover 50%. Show the gating curve from `bm25gate.json`.

**2. "Your ground truth was generated with your data — how do you know it works?"**
Tag-stripped Top-1 is 70.1% on 87 mentions; a deliberately messy DPR is in the
corpus; and here is the independent relabelling of 40 samples.
*That last part does not exist yet.* Two teammates, one hour, and it becomes the
strongest slide the team owns — `ARCHITECTURE.md` §5B already specifies the
procedure.

**3. "Show me the institutional memory."**
Be first to the sample size. Say "here is the mechanism and here is how thin ten
days of synthetic data makes it" before anyone else characterises it.

---

# APPENDIX — REPRODUCING EVERY NUMBER

```bash
# Test suites
python -m pytest -q                        # 264 passed
cd frontend && npx vitest run              # 55 passed

# Headline metrics, confusion table, tau sweep
python eval.py

# Retrieval arm comparison (F-01)
cat research/data/ablation.json

# Gating comparison — the defense for F-01
cat research/data/bm25gate.json

# The unshipped +2.5 pt fix (F-01)
cat research/data/densefix.json

# Zero-duration activities (F-06)
sqlite3 dataset/epc_progress.db \
  "SELECT activity_id, planned_qty, uom FROM activities
   WHERE actual_start = actual_finish;"

# Delay-cause yield (F-04)
sqlite3 dataset/epc_progress.db \
  "SELECT COUNT(*) FROM audit_records
   WHERE field_changed IN ('actual_start','actual_finish')
     AND source_span IS NOT NULL;"

# Open learning loop (F-03) — returns nothing
grep -rn "alias" matching/

# Schedule import missing (F-10)
sed -n '699,703p' server/main.py

# Dead code (F-09)
sed -n '148,172p' matching/engine.py

# No auth (F-11) — returns nothing
grep -rn "jwt\|OAuth\|authenticate\|password" server/*.py
```

---

*Prepared 2026-08-30 from commit `1de9b4d`. All metrics re-derived by execution, not
read from repository documentation. Findings marked NEW do not appear in
`research/NAVIS_TECHNICAL_AUDIT.md`; the remainder independently confirm it.*
