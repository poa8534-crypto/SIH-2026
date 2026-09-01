# SIH 26122 — System Architecture

> Converted from the supplied architecture PDF into Markdown for use as the repo-level architecture/specification file.
> No substantive architectural changes were made during conversion.

> ## How to read this file
>
> **§0–§6 are the ORIGINAL DESIGN SPECIFICATION**, written before the build.
> They record what was intended, including estimates and choices that the
> implementation later changed. They are kept as written, because the reasoning
> is still the reasoning — but do **not** read them as a description of the
> current system.
>
> **§7 (Known Limitations) is CURRENT** and is maintained against the code.
>
> For what the system does *now*: `FLOW.md` (execution paths), `METRICS.md`
> (every number, and which corpus it came from), `README.md` §4 (the pipeline
> in plain English).
>
> Corrections to §0–§6 where the spec and the code diverged, so a reader is not
> misled by a document that is otherwise deliberately frozen:
>
> | Spec says | Code does |
> |---|---|
> | Embeddings: `bge-small-en-v1.5` (§5) | **`all-MiniLM-L6-v2`**, 384-dim, offline-first, with a deterministic hashed-ngram fallback |
> | Retrieval: exact tag + BM25 + **fuzzy** + embedding (§1) | Three fusion channels — exact tag, BM25, embedding. **Fuzzy is a ranking feature, not a retrieval channel.** Two further channels (char n-gram, alias lexicon) are built and switched off |
> | "120 activities" throughout | Correct for the **demo** baseline. A second research baseline has 218 and the server does not load it — `METRICS.md` §1 |
> | PMXML input worth the effort (§0) | PMXML and XER **import** are declared as `NotImplementedError` providers. **Export** in both formats is implemented |
> | Recall@20 ≥ 0.95 as a target (§ milestone E) | **Achieved and exceeded: recall@20 is 100%.** The consequence is that all remaining error is ranking, not retrieval |

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
  "asserted_date": "2026-03-10",
  "date_basis": "RELATIVE_RESOLVED",
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

Allowed date basis values:

```text
EXPLICIT
RELATIVE_RESOLVED
DEFAULTED_TO_REPORT_DATE
```

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
| Embeddings | sentence-transformers + `bge-small-en-v1.5` *(SPEC — the code ships `all-MiniLM-L6-v2`)* | ~130 MB, CPU-capable, offline, suited to short technical text. |
| Vector search | NumPy dot product | At 120 × 384 dimensions, brute-force cosine is sufficient. No FAISS/Chroma needed. *(Still true, and re-confirmed in D-026: batching the encoder, not a vector store, was the latency fix.)* |
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

## The pipeline as it actually runs today

Verified 2026-09-01 against the code, not against this document's §1.

```
field input (.txt DPR | .xlsx | voice transcript)
   |
   v  extraction/  — deterministic regex pre-pass; LLM optional and OFF
ExtractedEvent          tags, quantity, uom, dates + basis, discipline,
   |                    status, percentage, provenance (file, line/row, span)
   v  matching/retrieval.py — CANDIDATE RETRIEVAL, recall-oriented, top-20
   |     ACTIVE   TAG    exact/near-exact tag, O(1) dict lookup   weight 1.0
   |     ACTIVE   BM25   precomputed term x doc matrix            weight 0.7
   |     ACTIVE   DENSE  all-MiniLM-L6-v2, batched per file       weight 0.7
   |     off      NGRAM  char 3-5 gram TF-IDF                     weight 0.0
   |     off      ALIAS  planner corrections                      weight 0.0
   |     -> reciprocal rank fusion (k=60) -> 20 candidates
   |        recall@20 = 100% on the held-out test split
   v  matching/features.py — RANKING, precision-oriented, scored as a matrix
   |     tag_overlap · fuzzy_similarity · embedding_cosine ·
   |     date_proximity · discipline_agreement · predecessor_plausibility
   |     (+5 extra features, built, OFF in production)
   |     -> weighted blend, renormalised over present features
   |     -> line-lock floor where a tag identifies a unique activity
   v  matching/engine.py :: decide_outcome — CALIBRATED DECISION
   |     score < tau_low                          -> NEW_ACTIVITY
   |     score >= tau_high AND margin >= margin_min
   |                        AND no discipline conflict -> AUTO_LINK
   |     otherwise                                 -> REVIEW
   v  matching/engine.py :: RollupAccumulator — many-to-one, quantity-based %
   |     Actual Finish written ONLY at 100% complete AND only when a source
   |     named the date. Otherwise withheld and routed to the planner.
   v  server/main.py -> SQLite (dataset/epc_progress.db)
         activities (actuals only; baseline read-only)
         linked_events · review_queue · audit_records (APPEND-ONLY)
         alias_lexicon  <- written here, NOT read back (see below)
```

## Active vs built-but-disabled

`matching/config.py` holds every switch, so a disabled component is a config
default rather than deleted code — the negative results stay reproducible.

| Component | State | Why |
|---|---|---|
| Char n-gram retrieval channel | **off** | measured +0.00 top-1, +0.50 ms/event |
| Alias retrieval channel | **off** | see below; ablation could not measure it |
| Discipline soft gate | **off** | measured **−4.32** top-1, CI [−7.0, −1.6] |
| Exact-tag short circuit | **off** | correct but fires on only 4.7% of mentions |
| Extra ranking features | **off** in production | fitted only against the v2 baseline |
| Learned logistic ranker | **off** in production | v2-only artefact, refused against v1 by a sha256 guard |
| Gradient-boosted ranker | **rejected** | 97.4% auto-link precision, below the 99% floor |
| Isotonic calibration | **off** in production | same v2 guard |
| Cross-encoder rerank | **off**, **accuracy UNMEASURED** | model not cached, no network; costs ~45 ms/event |

## The alias lexicon is written and not read

`server/main.py:_upsert_alias` inserts an `AliasLexicon` row on every planner
confirm, reassign and new-activity resolve. `HybridRetriever.alias_channel()`
exists to read them and is unit-tested.

**They are not connected.** `w_alias` is 0.0 in the shipped configuration, and
no production code path ever populates `EngineConfig.alias_lexicon` — the only
`db.query(AliasLexicon)` outside tests is the write-side deduplication lookup
inside `_upsert_alias` itself. A planner correction therefore **cannot**
influence a later re-ingest today.

The claim "the system learns from planner corrections" is not yet true and must
not be made. `METRICS.md` §5 carries the safe wording.


## Audit provenance is exact where it exists, and absent where it does not

`AuditRecord` carries a real foreign key, `linked_event_id`, to the
`LinkedEvent` that produced the write, plus a denormalised snapshot of
`source_file`, `source_line` and `source_row`. `DateAssertion` in
`matching/models.py` carries the line and row through the roll-up, so the
server reads the position straight off the winning assertion rather than
matching on text. Two identical lines in one file are distinct entries.

The snapshot is deliberately kept alongside the key: `audit_records` is
append-only and must stay readable as a historical record even if the event
row is later reinterpreted. On the seeded corpus every audit row agrees with
its foreign key on all three fields, and no key dangles.

The seeded corpus now holds **275** audit rows (verified 2026-09-01 by
`python scripts/reset_demo.py`). Earlier revisions of this section quoted 259
and `DEMO.md` quoted 274; both were captured from older runs. The *proportions*
below were measured at 259 rows and have not been recomputed — treat them as
indicative of the shape, not as current exact counts.

What is genuinely absent, and why:

- **Roughly two thirds of rows have an exact position** (165 of 259 when last
  counted). The rest are writes with no single originating line. Two cases
  produce them.
- **A date taken from the report's own date rather than a line.** When no
  event asserts a start or finish, `RollupAccumulator` falls back to
  `min`/`max` of the events' `reported_date`
  (`matching/engine.py`, `results()`). The value is real and the file is
  named, but no single line asserted it, so `source_line` stays null rather
  than pointing at an arbitrary one.
- **Aggregate writes.** A rolled-up `actual_qty` is the sum of several
  events, and a `source_conflict` note is by definition more than one
  source. These get `linked_event_id = NULL` and carry every contributor in
  `contributing_sources` instead. A single key here would misattribute the
  write.

Every row still names its `source_file`. The rule the UI relies on is: a
position shown is exact; no position shown means there is no single line to
show, not that the line was lost.

## `link_confidence` on `GET /schedule` is derived per request

`ScheduleActivityResponse.link_confidence` is not stored. It is read back off
the audit trail on every `GET /schedule` — the confidence of the most recent
write that set `actual_start` or `actual_finish`. It exists so the Schedule
table can show a confidence per row without issuing one audit request per
activity.

It is one grouped query, not a query per activity, so the cost is flat. But
it does mean the value is a projection of the audit log rather than a fact
about the activity, and it will shift if the audit trail is ever rewritten
(it cannot be — the table is append-only, which is what makes this safe).

## The time agent fills slots by regex, not by an LLM

The problem statement asks for "an LLM-based conversational or voice
interface". `POST /agent/turn` is conversational and it is stateful
slot-filling, but the slot extraction in `_fill_slots_from_message` is regex
and keyword matching — there is no model in that path. The LLM is used in
`extraction/`, on ingested documents, not in the agent. Worth saying plainly
if a judge asks, because the conversation is convincing enough to be mistaken
for a model.

Consequences visible in the UI:

- **It asks for three things only:** `discipline`, `location`, `status`. It
  never asks for a date or a quantity, so those are captured only when the
  supervisor happens to mention them unprompted. The Stitch mockups show the
  agent asking "Which date was it completed?" and "How many spools out of the
  planned quantity?" — those questions do not exist.
- **Quantity needs a unit.** "6 nos" parses; "6 out of 18", which is what the
  mockup's own script says, does not. This is consistent with the deliberate
  decision to reject unitless quantities in the roll-up, but it means the
  QUANTITY row on the structured card is often "Not stated".
- **Prompts are raw enum strings**, e.g. "Which discipline? (civil, piping,
  electrical, instrumentation, hse, static_equipment)". Legible, but it reads
  as a form rather than a conversation.

Two bugs in this path were fixed while wiring the screen, both fatal:
`SlotState.date` was annotated `Optional[date]`, where the field name shadowed
the imported type under `from __future__ import annotations`, so Pydantic
resolved it to `NoneType` and the endpoint returned 500 on the turn after any
date was mentioned; and the location regex matched an uppercase character
class against a lowercased string, so no answer containing "Zone A" could
ever satisfy the agent and it re-asked forever.

## Voice updates are proposals, never direct writes

`POST /agent/turn` now runs the real matching engine when the last slot fills
and returns the proposal — activity, confidence, outcome — without writing
anything. A second call with `confirm: true` persists a `LinkedEvent` and a
`ReviewQueueItem` and still does not touch `actual_start` or `actual_finish`.

This matters because the previous behaviour did the opposite: it created the
event on the turn that filled the last slot, before the supervisor saw
anything, wrote actual dates directly with `auto_applied=True`, and created no
review item at all — so a voice update bypassed the planner and never appeared
in any queue. The alias-lexicon write was removed from that path too: learning
from an unconfirmed update would feed the matcher its own unreviewed guesses.
`POST /review/{id}/resolve` remains the only place an actual date is committed.

## Institutional memory is real but thin, and the screen says so

Every figure on the Memory screen is computed by `GET /memory/query` from
captured execution data. The honest caveat is how little of it there is on the
seeded corpus, and the UI surfaces the sample size everywhere rather than
hiding it.

- **38 of 120 activities have both an actual start and finish** (verified
  2026-09-01). Only those can contribute a duration. This fell from 47 when
  D-015 stopped writing an Actual Finish that no source had dated — the drop is
  the system becoming more careful, not losing data.
- **43 of 67 actual starts equal the planned start.** So most of the
  planned-vs-actual delta is driven by the finish date alone, not by a measured
  execution window. 24 starts do genuinely differ, so this is a majority
  artefact rather than a total one.
- **19 of 56 activity types have any actual duration; 9 have two or more.**
  The largest overruns are single-activity types — `CIV-APN` reads 9d planned
  against 32d actual from one activity — which is why both the table and the
  picker show a completed-of-total count on every row, and why the suggested
  duration panel defaults to the worst overrun *among types with at least two
  completions* rather than the worst overall. It currently opens on `PIP-SPL`:
  planned median 16d, actual median 17.5d, P80 21d, from 2 completions of 5.
- **Delay causes are four keyword hits.** `_compute_delay_reasons` substring
  matches a fixed list against audit `source_span` text. All four found are
  civil and each touches one activity. This is keyword recall over DPR prose,
  not a modelled cause taxonomy.

Two fields were added so the UI could stop overstating its evidence.
`DurationDistribution.actuals_count` and `SuggestedDuration.actuals_count`
report how many activities a mean or median is actually drawn from —
`sample_size` alone counts every activity of the type, which claimed 5 samples
behind a median computed from 2. A suggestion is now suppressed entirely below
two completions, which also removes a 0-day recommendation that `ELE-CBL`
produced from one same-day activity.

`DelayReason.days_lost` is **attributed, not measured**: it sums the finish slip
of the affected activities, and an activity recording two causes has its slip
counted against both. The screen states this under the table. It is an upper
bound per cause, and the right way to tighten it is to attribute slip to a
cause at write time rather than to reconstruct it afterwards.

## Source-conflict detection was scoped to one upload

`RollupAccumulator` computes a conflict from the assertions it sees in a single
`POST /ingest` call. Real disagreements are almost always across uploads — a
discipline spreadsheet ingested on Tuesday contradicting a DPR ingested on
Monday — so the accumulator saw one assertion each time and found nothing. The
result was that 24 genuine disagreements existed in the data while
`integrity_warnings` reported zero of them, and the 35 entries it did flag were
partial-scope notes with a single contributing source, not two-sided conflicts.

Two changes fixed it, both in `server/main.py` rather than in `matching/`:

- Before writing `actual_start` or `actual_finish`, the roll-up now reads the
  most recent audit row for that field (`_prior_write`). If the incoming value
  differs and came from a different file, the write is flagged `conflict=True`
  and both sides are recorded in `contributing_sources`.
- When the stored value wins on the earliest-evidence rule and the incoming
  assertion is therefore discarded, a `source_conflict` audit row is written
  anyway. Previously that assertion vanished silently, which is the more
  dangerous of the two cases because nothing recorded that a source had been
  overruled.

`GET /schedule/conflicts` then derives the list by walking each activity's
writes per field and emitting a conflict wherever consecutive writes disagree
and came from different files. Nothing new is stored: the values, files and
line/row numbers were already in the audit trail.

On the seeded corpus this surfaces **25 conflicts, 21 of them spreadsheet
against daily report**. Two properties are worth stating to a planner:

- **The stored value is whichever source was ingested last, not whichever is
  right.** `PIP-SKN-1051` holds an `actual_finish` of 2026-08-20 from
  `piping_progress.xlsx` row 33, overruling 2026-09-02 from `dpr_day_08.txt`
  line 19 — moving the finish *earlier* purely because the spreadsheet arrived
  second. The screen shows both sides and which one is stored; it does not
  pretend the stored one is correct.
- **The Primavera baseline is never a side.** It is read-only and never
  written, so it cannot disagree with anything. Labelling a conflict column
  "Primavera" would be wrong, and `_source_kind` classifies sources as
  `spreadsheet`, `daily_report`, `agent` or `other` — never as the baseline.

`GET /audit/recent` was added alongside it so a dashboard can show recent
writes across all activities without fetching all 120 audit trails.

## Source files were decoded lossily, and the damage was permanent

Every supplied DPR is cp1252, not UTF-8: an em-dash is the single byte `0x97`,
which is not valid UTF-8 at all. `extraction/extractor.py` read them with
`errors="replace"`, so each one became U+FFFD at ingest — and because the
replacement happened on the way in, it was written to `LinkedEvent.raw_text`,
to `source_span`, into the audit trail, and onto the screen as
"flange start <?> P-1002 flange boltup begins". 51 of 266 linked events and 48
of the 274 audit rows *present at the time* carried it (the seeded corpus now
holds 275 — see the note earlier in this section). Re-ingesting could not fix it; the original
character was gone.

`extraction/textio.py` now decodes by trying `utf-8-sig`, then `cp1252`, then
`latin-1`, and only falls back to lossy decoding if all three fail. cp1252
comes before latin-1 deliberately: it maps `0x80`-`0x9f` to real punctuation
where latin-1 maps them to control characters, and latin-1 accepts any byte so
it would otherwise mask the others.

Two bare `open()` calls were reading the baseline JSON with the platform
default encoding — cp1252 on Windows, UTF-8 elsewhere — so the same file could
parse differently on two machines. Both now decode explicitly.

After the fix: zero U+FFFD anywhere in the database, and 101 em-dashes survive
intact through `GET /schedule`. The baseline JSON itself was never corrupt; it
is pure ASCII with `\u2014` escapes, so activity descriptions were always
clean. Only text read from the report files was affected.

## The agent asks for what it needs, and the LLM is genuinely optional

`/agent/turn` proactively fills five slots — discipline, location, status, date
and, when the update is about something the project counts, a completed and
planned quantity. Parsing lives in `server/agent_slots.py` as pure functions so
each format is table-tested rather than discovered on stage.

Three fixes worth naming, because each was a loop or a lie:

- **A supervisor's answer is now read as an answer.** The parser compared
  against lowercase enum values, so answering "Electrical" to "which
  discipline?" matched nothing and the same question came back forever. The
  message is now read as a reply to the outstanding question first, matching is
  case-insensitive, and synonyms ("elec", "safety", "equipment") are accepted.
  After two failed attempts on one slot the agent moves on and leaves it for
  the planner rather than asking a third time.
- **Enum values never reach a phone.** `DISCIPLINE_LABELS` is the single
  mapping; `static_equipment` renders as "Static Equipment" everywhere, and
  `discipline_label()` raises on an unknown value so a typo fails a test rather
  than appearing in the UI.
- **A ratio stays two numbers.** "6 out of 18" is stored as completed 6 and
  planned 18. Collapsing it lost the denominator, which is what decides whether
  a node is finished. A completed figure above the planned total is retained
  and flagged, never clamped.

**The LLM is off by default and cannot break the demo.** The repository already
had a flag — `EXTRACTION_PROVIDER`, defaulting to `rules` — so none was added.
When it is off, `server/agent_llm.py` builds no client, opens no socket and
waits for nothing. When it is on, extraction is bounded by
`NAVIS_LLM_TIMEOUT_SECONDS` (default 5, far tighter than the batch path's 120),
tried once with no retry, and every value it returns is re-validated by the
same deterministic parsers before it may touch SlotState. A refused connection,
a timeout, malformed JSON or a schema violation all fall back silently: the
supervisor sees no Ollama error, keeps every slot already collected, and the
conversation continues. An Ollama problem is not a NAVIS outage and is never
presented as one.

One bug found while testing that bound: the timeout was not actually bounded.
`ThreadPoolExecutor` used as a context manager joins its workers on exit, so a
stalled model still held the request for its own full timeout after we had
given up waiting. It now shuts down without waiting.

## Resetting has to survive a schema change

`scripts/reset_demo.py` clears rows rather than dropping the database, which is
what lets it run while the server is up. That is not enough on its own:
SQLAlchemy's `create_all` adds missing tables but never missing columns, so a
database built before a model gained a field kept working right until the first
insert, which then failed with an OperationalError mid-demo — exactly what
happened when `ReviewQueueItem` gained its clarification columns.

`reset_demo` now compares every model column against the live database first
and rebuilds the schema when they differ. Everything in that database is
regenerated from `dataset/`, so there is nothing to preserve and no migration
to write.
