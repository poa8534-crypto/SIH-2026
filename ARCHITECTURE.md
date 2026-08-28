# SIH 26122 — System Architecture

> Converted from the supplied architecture PDF into Markdown for use as the repo-level architecture/specification file.  
> No substantive architectural changes were made during conversion.

## 0. Five places I think you're wrong

### 36 hours is not 36 hours
SIH finale is roughly 36 wall-clock hours minus mentoring rounds, judge visits, food, and the two hours nobody codes at 4am. Budget ~22 usable hours per person. Every estimate below assumes a 5-person team with real parallelism, not one person for 36 hours.

### Institutional memory should not be secondary
It's your only defensible differentiator. Every team that picks this PS will build:

`ingest → extract → link`

That's the obvious 80%. The PS explicitly names institutional memory as a co-equal outcome, and almost nobody will ship it. Promote it to primary. It's also cheap — it's SQL over data you already have.

### Drop schedule export write-back
PMXML input is worth the effort. PMXML output is 2–3 hours of namespace fiddling for a demo moment that is literally “here is a file.” Replace it with a CSV export plus one slide showing the P6 integration path.

XER goes on the stretch list.

### Constrain the voice-agent scope
“Slot-filling dialogue” is right, but a chat panel invites judges to type anything. Constrain the UI so the agent asks for one slot at a time with tappable suggestions, and make the structured card the visual hero.

It should read as a data-entry tool that happens to talk, not a chatbot.

### Avoid “near real time”
It implies streaming, WebSockets, and background workers. Nothing here needs it.

Ingest should be a synchronous POST that returns in under 3 seconds on 120 activities.

Use the phrase **“on submission”** instead.

---

# 1. Component Diagram

The structural point worth preserving is that **retrieval and ranking are separate stages on purpose**.

- Retrieval is recall-oriented: cast wide, e.g. top-20.
- Ranking is precision-oriented: feature scoring.
- Do not merge both into one opaque LLM call.
- Keeping them separate makes the match explainable and preserves the audit trail.

```text
Raw Input
   │
   ▼
Extraction
   │
   ▼
ExtractedEvent
   │
   ▼
Candidate Retrieval
   ├── Exact tag retrieval
   ├── BM25
   ├── Fuzzy retrieval
   └── Embedding retrieval
   │
   ▼
RRF Fusion
   │
   ▼
Feature Ranking
   │
   ▼
Confidence + Margin Decision
   ├── AUTO_LINK
   ├── REVIEW
   ├── NEW_ACTIVITY
   └── REJECTED
   │
   ▼
Persistence + Audit
   │
   ├── Schedule updates
   ├── AuditRecord
   └── DelayReason / institutional memory
```

---

# 2. Data Contracts

Turn each of these into a **Pydantic v2 model before writing other code**. These are the interfaces the team can code against in parallel.

## 2.1 `ScheduleActivity`

One L5/L6 node from the parsed baseline.

```json
{
  "uid": "uuid",
  "activity_id": "PIP-ER-1024",
  "wbs_path": ["Project", "Unit 2", "Piping", "Erection"],
  "wbs_level": 5,
  "description": "Erect Line 24\"-P-1001-A1A, Unit 2 rack",
  "discipline": "PIPING",
  "tags": ["24\"-P-1001-A1A"],
  "planned_start": "2026-03-04",
  "planned_finish": "2026-03-09",
  "actual_start": null,
  "actual_finish": null,
  "planned_qty": 120.0,
  "uom": "M",
  "installed_qty": 0.0,
  "percent_complete": 0.0,
  "predecessors": [
    {
      "activity_id": "PIP-FB-1024",
      "rel": "FS",
      "lag_days": 0
    }
  ],
  "status": "NOT_STARTED",
  "source_schedule_id": "uuid",
  "data_date": "2026-03-15"
}
```

Allowed discipline values:

```text
CIVIL
PIPING
STATIC
ROTATING
ELECTRICAL
INSTRUMENTATION
HSE
```

Allowed status values:

```text
NOT_STARTED
IN_PROGRESS
COMPLETE
```

---

## 2.2 `RawInput`

One uploaded artifact or one agent session.

```json
{
  "input_id": "uuid",
  "format": "DPR_TEXT",
  "filename": "dpr_2026-03-11.txt",
  "sha256": "...",
  "report_date": "2026-03-11",
  "discipline_hint": "PIPING",
  "contractor": "Sub-C 3",
  "uploaded_by": "supervisor_07",
  "uploaded_at": "2026-03-11T20:14:00+05:30",
  "parse_status": "PARSED"
}
```

Allowed formats:

```text
DPR_TEXT
DISCIPLINE_XLSX
AGENT_TURN
```

Allowed parse status values:

```text
PENDING
PARSED
FAILED
```

`sha256` is required for deduplication. Uploading the same artifact twice must not double-write progress.

---

## 2.3 `ExtractedEvent`

One progress assertion before linking.

```json
{
  "event_id": "uuid",
  "input_id": "uuid",
  "provenance": {
    "locator": "line:14",
    "char_span": [212, 268],
    "raw_text": "spool erected for 24\"-P-1001 upto gridline 7, 40m done"
  },
  "event_type": "PROGRESS",
  "reported_date": "2026-03-10",
  "asserted_start": null,
  "asserted_finish": "2026-03-10",
  "description_text": "spool erected for line 24-P-1001 upto gridline 7",
  "tags_found": ["24\"-P-1001"],
  "discipline_inferred": "PIPING",
  "quantity": {
    "value": 40.0,
    "uom": "M"
  },
  "delay_signal": null,
  "extractor": {
    "method": "HYBRID",
    "model": "qwen2.5:7b",
    "version": "0.3.1"
  },
  "extraction_confidence": 0.86
}
```

Allowed event types:

```text
START
FINISH
PROGRESS
BLOCKED
```

### Dates: one reported, two asserted

An event carries three dates, and they do different jobs.

`reported_date` is the single date the **matcher** scores against (the
`date_proximity` feature). It is resolved from the span itself where the text
carries a date, and otherwise defaults to the source's report date — the DPR
header date, or the completion column of a spreadsheet register. It is
always populated. Recording *which* of those produced it — the `date_basis`
provenance field — was deferred.

`asserted_start` and `asserted_finish` are what reaches the **schedule**.
Either may be null, and most events assert only one: a line reading
"backfilling started today" asserts a start and no finish. They exist
because a single date slot cannot express both ends of an activity, which
left every activity with `actual_start == actual_finish` and a fictitious
start variance.

How the two are bound:

- **Free text** binds by verb. An explicit start verb ("started",
  "commenced", "mobilised") asserts a start. A completion is taken from the
  line's inferred status, so that a progress line reading "about 40% done"
  leans `in_progress` and is not misread as a completion. A completion verb
  with a date bound directly to it ("pour completed on 30 Jul") asserts a
  finish even when a later clause in the same line is still open ("curing
  ongoing"). When a line makes both claims and carries two dates, they bind
  positionally in the order the verbs appear. When a claim carries no
  in-span date, the report's own date carries it.
- **Spreadsheets** assert both from one row: the commencement column is an
  actual start, and the completion column is an actual finish — but only for
  a row that is genuinely complete. Headers like `Actual / Est. Completion`
  and `End Date` hold a *forecast* for a row still in progress, and writing
  a forecast as an actual finish would corrupt the schedule.

Year-less dates ("completed 30 Jul") are resolved against the report's own
header date by taking the candidate year that puts the date nearest that
report date, preferring a past reading on a near-tie because field reports
describe work already done. A date further than ~6 months from the report
date sits near the midpoint between two candidate years, so it is flagged as
ambiguous and left unresolved rather than guessed.

**Provenance is non-negotiable.** It is the spine of the audit trail.

---

## 2.4 `LinkCandidate`

One `(event, activity)` pair with its scoring evidence.

```json
{
  "candidate_id": "uuid",
  "event_id": "uuid",
  "activity_uid": "uuid",
  "retrieval_sources": ["TAG_EXACT", "BM25"],
  "rrf_score": 0.031,
  "features": {
    "tag_overlap": 1.0,
    "discipline_match": true,
    "date_delta_days": 1,
    "within_planned_window": true,
    "predecessor_plausible": true,
    "fuzzy_ratio": 0.61,
    "embedding_cosine": 0.74,
    "uom_compatible": true
  },
  "final_score": 0.91,
  "rank": 1
}
```

---

## 2.5 `LinkDecision`

The adjudication — system or human.

```json
{
  "decision_id": "uuid",
  "event_id": "uuid",
  "outcome": "AUTO_LINK",
  "chosen_activity_uid": "uuid",
  "confidence": 0.91,
  "margin": 0.28,
  "thresholds": {
    "tau_high": 0.82,
    "tau_low": 0.45,
    "margin_min": 0.10
  },
  "rationale": [
    "tag_exact_match",
    "discipline_match",
    "within_planned_window"
  ],
  "resolved_by": "SYSTEM",
  "resolved_at": "2026-03-11T20:14:03+05:30",
  "planner_override": null
}
```

Allowed outcomes:

```text
AUTO_LINK
REVIEW
NEW_ACTIVITY
REJECTED
```

A low top-1 minus top-2 margin must force review even when the top score is high.

`rationale` must contain deterministic feature names, **not free-form LLM prose**.

---

## 2.6 `AuditRecord`

Append-only record created for every field mutation.

```json
{
  "audit_id": "uuid",
  "activity_uid": "uuid",
  "field": "actual_start",
  "old_value": null,
  "new_value": "2026-03-10",
  "source_event_id": "uuid",
  "source_input_id": "uuid",
  "source_locator": "line:14",
  "decision_id": "uuid",
  "confidence": 0.91,
  "actor": "SYSTEM",
  "versions": {
    "model": "qwen2.5:7b",
    "ruleset": "v4"
  },
  "integrity_checks": [
    "not_after_data_date",
    "finish_ge_start",
    "predecessor_started"
  ],
  "contributing_sources": [
    "2026-07-12 from civil_progress.xlsx \"Pedestal Concreting P1-P12\"",
    "2026-08-02 from dpr_day_01.txt \"pedestals P7 to P12 completed yesterday\""
  ],
  "conflict": true,
  "created_at": "2026-03-11T20:14:03+05:30"
}
```

Relevant mutable schedule fields:

```text
actual_start
actual_finish
installed_qty
percent_complete
```

The audit log has **no update path**. Corrections create a new record instead of mutating historical records.

### Conflicting sources are recorded, never silently resolved

Two sources routinely disagree about one node: a full-scope spreadsheet row
says a node finished 12 Jul, while a partial-scope DPR line says pedestals
P7–P12 completed 2 Aug. Precedence is **earliest start wins, latest finish
wins**, but the losing claim is not discarded. Every source that asserted a
value is listed in `contributing_sources`, `conflict` is set on the write it
affects, and the disagreement surfaces on `GET /schedule` as an
`integrity_warnings` entry with `severity: "conflict"`. A planner has to be
able to see that the surviving date came from a partial-scope line.

### Partial scope must not finish a whole node

A completion mention that covers part of a node's scope must not set Actual
Finish on the whole node. On a node measured by quantity, a completion
asserted *without* a quantity is recorded as progress only — the quantity
roll-up decides completion, and the finish assertion is withheld and
reported. A DPR line completing pedestals P7–P12 therefore cannot finish a
P1–P12 node on its own. Only an unquantified node (a milestone), where a
completion claim is all the evidence there will ever be, completes on the
claim alone.

---

## 2.7 `DelayReason`

The institutional-memory unit.

```json
{
  "delay_id": "uuid",
  "activity_uid": "uuid",
  "discipline": "PIPING",
  "category": "DRAWING_RFI",
  "raw_text": "hold due to rfi pending on isometric rev 2",
  "source_event_id": "uuid",
  "inferred_by": "LLM",
  "confidence": 0.78,
  "impact_days": 3,
  "month": "2026-03"
}
```

Allowed categories:

```text
MATERIAL
MANPOWER
DRAWING_RFI
PERMIT_HSE
WEATHER
EQUIPMENT
CLIENT_HOLD
REWORK_NCR
FRONT_NOT_AVAILABLE
OTHER
```

`month` enables seasonality / historical-delay queries.

---

## Contract Decisions to Defend

Two decisions are worth explicitly defending:

1. `rationale` is a list of feature names rather than LLM prose, making explanations deterministic and auditable.
2. `AuditRecord` is append-only. Corrections write a new record instead of mutating history.

---

# 3. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | Python 3.11 | One language for extraction, matching, and API. |
| Contracts | Pydantic v2 | Also serves as the structured-output schema for the LLM. |
| API | FastAPI + Uvicorn | Automatic OpenAPI docs provide a judge-facing artifact. |
| Database | SQLite + SQLAlchemy | Zero setup, single-file, seedable, resettable. Postgres adds little at ~120 activities. |
| Spreadsheet | pandas + openpyxl | Handles merged headers and mixed date types. |
| Lexical retrieval | rank_bm25 | Pure Python; no external search daemon. |
| Fuzzy matching | rapidfuzz | Fast token-set matching for word-order drift. |
| Embeddings | sentence-transformers + `bge-small-en-v1.5` | ~130 MB, CPU-capable, offline, suited to short technical text. |
| Vector search | NumPy dot product | At 120 × 384 dimensions, brute-force cosine is sufficient. No FAISS/Chroma needed. |
| LLM | Ollama `qwen2.5:7b-instruct` primary; API accelerator | Offline path is the tested default rather than an untested fallback. |
| Structured output | Ollama JSON schema mode | Constrained structured decoding instead of best-effort JSON prompting. |
| Schedule import | lxml for PMXML | XML with a published schema. |
| Frontend | React + Vite + Tailwind + TanStack Query/Table | Fast UI development; strong reconciliation-table support. |
| Charts | Recharts | Only three charts are planned. |
| Deploy | `venv` + `npm run dev` | Avoid Docker dependency during the hackathon. |

## Offline Preparation

Before travelling:

```bash
pip download -d wheelhouse -r requirements.txt
```

Also:

- commit `package-lock.json`
- keep a local copy of `node_modules`
- pull required Ollama models onto every demo/development laptop
- assume venue internet may be unavailable

---

# 4. Build Order

Parallel tracks:

```text
A. Contracts ──┬── B. Synthetic data ──┬── D. Extraction ──┬── E. Retrieval + Rank ── F. Eval ─┐
               │                        │                    │                                  │
               └── C. Schedule import ──┘                    └──────── G. Persist + Audit ──────┤
                                                                                               │
                                                        H. API ── I. Frontend ── J. Memory ─────┤
                                                                                               │
                                                        K. Agent ── L. Harden ──────────────────┘
```

| Step | Work | Hackathon hours | Definition of done | Demo moment unlocked |
|---|---|---:|---|---|
| A | Repo, `AGENTS.md`, Pydantic contracts | 0–1.5 | All 7 models importable and JSON round-trip | — |
| B | Synthetic corpus + ground truth | 1.5–5 | 10 DPRs, 2 XLSX, 120 activities, ~180 labelled mentions incl. 15% hard cases | — |
| C | PMXML → `ScheduleActivity` | 3–5 | 120 activities loaded, WBS tree intact, tags parsed from descriptions | “This is a real Primavera export” |
| D | Extraction | 5–10 | `ExtractedEvent` list from both formats; every event has a character span | Highlighted source text |
| E | Retrieval + ranking + decision | 9–17 | Hybrid recall@20 ≥ 0.95; thresholds wired but uncalibrated | — |
| F | `eval.py` + calibration | 15–19 | Precision/recall/coverage table + PR-at-coverage curve | The number on your slide |
| G | Persistence, write-back, integrity rules | 17–22 | Audit record per mutation; all 3 integrity rules enforced and tested | Audit drawer |
| H | API surface | 19–23 | All endpoints green in `/docs` | — |
| I | Frontend: Ingest, Reconciliation, Schedule | 21–29 | Keyboard-driven reconciliation; live pipeline trace on ingest | The hero 20 seconds |
| J | Memory store + queries + charts | 26–31 | Three queries answered incl. suggested-duration lookback | The differentiator |
| K | Agent slot-filling | 29–32 | Four slots filled conversationally; structured card confirms before commit | PS compliance |
| L | Seed, offline test, `JUDGE_QA`, metrics slide | 31–36 | Airplane-mode full run passes cold | Survival |

**Step E is the long pole.** If E slips, everything after it slips. Put the strongest available developers on E.

---

# 5. Three Riskiest Assumptions

## A. “Our matcher is good” when the tag is actually doing all the work

Line and equipment tags are near-decisive evidence. If synthetic DPRs mention a tag in 90% of lines, the matcher may show very high precision while failing on normal human language.

### Cheapest test

Run `eval.py` twice:

1. normal dataset
2. with tags stripped from event text

If precision barely changes, the matcher is robust.

If it falls dramatically, the dataset is too tag-dependent. Increase tag-free hard cases to roughly 35%.

---

## B. Generated ground truth is circular

If one model generates both the DPR text and its label, evaluation may only measure agreement with the generator's intent.

### Cheapest test

Have two teammates independently label 40 randomly sampled mentions without seeing `ground_truth.csv`.

Then calculate human-vs-CSV agreement.

If agreement is below 85%, regenerate/review hard cases.

Also report inter-annotator agreement on the final slide.

---

## C. Local inference works at the venue

Potential failures include:

- cold model startup
- CPU thermal throttling
- RAM pressure from browser + Vite + Ollama + SQLite
- offline dependency problems

### Cheapest test

Before late-stage development:

1. enable airplane mode
2. fresh boot the actual demo laptop
3. run the full ingest-to-memory flow
4. time it

If a 7B extraction pass takes more than ~20 seconds per DPR, drop to a smaller model or move extraction toward regex/rules and use the LLM only for residual cases.

---

# 6. Cut List

Ranked from first to remove.

1. **XER parsing** — ~3h, little visible demo value.
2. **PMXML export write-back** — ~2.5h. Replace with CSV + an integration slide.
3. **Predecessor-plausibility feature** — ~2h for one scoring feature.
4. **Second discipline spreadsheet** — ~2h. One XLSX already proves heterogeneous input.
5. **Recharts memory visuals → sortable table** — ~1.5h.
6. **Ollama fallback → API-only** — ~2h, but only if offline/venue conditions are consciously accepted.
7. **Standalone agent screen → 3-turn slot-filler embedded in ingest** — ~3h.
8. **Audit drawer → source-span + confidence tooltip** — ~1.5h.

## Never Cut

Even under severe time pressure, keep:

- reconciliation screen
- review queue
- `eval.py` output
- provenance character spans
- at least one institutional-memory query

Those five elements are the core pitch. Everything else is packaging.

---

# 7. Known Limitations

Recorded deliberately, so they can be answered directly if asked rather
than discovered during a demo. Both are known and understood, not
undiscovered bugs.

## A. A dateless completion in a mixed-status line registers no finish

A finish is asserted either when the line's inferred status is `completed`,
or when a completion verb has a date bound directly to it ("pour completed
on 30 Jul"). A line whose overall status is *not* `completed`, and whose
completion verb carries no date of its own, therefore asserts no finish.

For example, "Tank TK-1 shell erection going good — currently on 4th course
(lower courses 1-3 completed)" registers no finish date. The parenthetical
completion refers to a sub-scope, the line as a whole reads `in_progress`,
and no date is bound to the word "completed".

This is a deliberate precision-first trade, not an oversight. The same rule
is what stops "about 40% done" from being read as a completion — reading
every stray completion verb as a finish would write false Actual Finish
dates onto live schedule nodes, which is the more expensive error. The cost
is that a completion stated without a date, in a line that is otherwise
about work in progress, is missed. The quantity roll-up still captures the
progress itself, so the node is not lost — only the finish date is.

## B. `eval.py` measures the matcher, not the system end to end

`eval.py` builds its `ExtractedEvent` objects directly from
`dataset/ground_truth.csv` (`_build_event`), reading the labelled mention
text and the `source_date` column. It does **not** call `Extractor` or
`SpreadsheetParser`.

So its metrics — top-1 accuracy, precision, coverage, auto-link precision —
measure **retrieval, feature scoring, and the decision thresholds on clean,
correctly-dated input**. They are honest numbers for the matcher. They are
not end-to-end system numbers, and they will not move when extraction
changes.

This has already cost us once. Extraction was silently dropping every date
on the real ingest path while `eval.py`, feeding the matcher dates straight
from the ground-truth CSV, continued to report healthy figures. The bug was
invisible to the metrics table and only surfaced through `GET /schedule`
reporting `activities_with_actuals: 0`.

The practical consequences:

- A regression in `extraction/` will not show up in the metrics table.
  Verify extraction changes against the API (`POST /ingest` then
  `GET /schedule`), not against `eval.py`.
- Quote these numbers as matcher performance. Describing them as end-to-end
  accuracy would overstate what has been measured.

Closing this would mean a second evaluation path that runs the real
extractors over the source files and aligns their output to ground truth by
provenance span. That is worthwhile but was not built.
