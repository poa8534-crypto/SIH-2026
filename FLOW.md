# FLOW.md — How execution actually travels through NAVIS

The code tells you **what** the system does. `DECISIONS.md` tells you **why**.
This file tells you **how execution travels** — deep enough to answer:

> When this action happens, what exact code runs next?

Every file, function and class named here was verified against the codebase on
**2026-08-30** (commit `1de9b4d`). **Never add a path to this file that you have not
read in the source.**

---

## 1. System map

```
frontend/ (React 19 + Vite + TanStack Query)
    │  HTTP (JSON / multipart), CORS-allowed origins in server/main.py:145
    ▼
server/main.py  (FastAPI, 17 routes)
    │
    ├── extraction/   heterogeneous input  →  ExtractedEvent[]
    ├── matching/     ExtractedEvent       →  LinkDecision  →  RollupResult
    └── server/db.py  SQLAlchemy → SQLite (dataset/epc_progress.db)
```

Two independent ingestion surfaces produce the same `ExtractedEvent` contract:

| Surface | Entry point | Producer |
|---|---|---|
| Document upload | `POST /ingest` | `extraction/extractor.py` |
| Conversational agent | `POST /agent/turn` | `server/agent_slots.py` + `server/main.py::_create_event_from_slots` |

---

## 2. Primary path — document ingestion

The main pipeline. A planner uploads a DPR or a discipline spreadsheet.

```
frontend/src/pages/Ingest.tsx
    ↓  user selects file
frontend/src/lib/api.ts :: api.ingestFile(file)
    ↓  POST /ingest  (multipart/form-data)
server/main.py :: ingest_file()                                    [line 679]
    │
    ├─ Path(filename).suffix  →  reject unless .txt .xlsx .csv .md .log   [line 701]
    ├─ sha256 of content  →  duplicate upload ignored entirely
    ├─ write to dataset/uploads/
    ├─ create Job row (status="processing")
    │
    ├─ EXTRACTION ────────────────────────────────────────────────
    │  extraction/extractor.py :: Extractor(schedule_path=SCHEDULE_PATH)
    │      ↓
    │  Extractor.extract(path)                                    [line 99]
    │      ├─ .txt/.md/.log → _extract_text()                     [line 120]
    │      │       ↓
    │      │   extraction/textio.py :: read_text()   (utf-8-sig → cp1252 → latin-1)
    │      │       ↓
    │      │   _extract_report_date()  →  _parse_text_spans()
    │      │       ↓
    │      │   _prepass_span()  per span
    │      │       ↓  extraction/prepass.py
    │      │       extract_tags() · extract_dates_with_flags() · extract_quantities()
    │      │       extract_percentages() · extract_fractions()
    │      │       infer_discipline() · infer_status() · is_forecast_language()
    │      │       ↓
    │      │   [optional] extraction/llm_backend.py :: LLMBackend.extract_events()
    │      │       (skipped entirely when EXTRACTION_PROVIDER=rules — the default)
    │      │       ↓
    │      │   _merge_event()  →  _bind_assertion_dates()         [line 288, 384]
    │      │
    │      └─ .xlsx → _extract_spreadsheet()                      [line 502]
    │              ↓
    │          extraction/spreadsheet.py :: SpreadsheetParser.parse()
    │              _detect_headers() → _read_row() → _is_summary_row() → _row_to_event()
    │      ↓
    │  ExtractionResult.events : list[ExtractedEvent]
    │
    ├─ MATCHING ──────────────────────────────────────────────────
    │  server/main.py :: get_matching_engine()      (module-level singleton)
    │      ↓
    │  matching/engine.py :: MatchingEngine.match_events(events)
    │      ↓  per event
    │  MatchingEngine.match_event(event, i)                       [line 43]
    │      │
    │      ├─ matching/retrieval.py :: HybridRetriever.retrieve(raw_text, tags)
    │      │      ├─ tag_channel()    exact/near-exact line-number match   (weight 1.0)
    │      │      ├─ bm25_channel()   rank_bm25 over tokenised descriptions (weight 0.7)
    │      │      ├─ dense_channel()  MiniLMEmbedder cosine, NumPy dot      (weight 0.7)
    │      │      └─ RRF fusion (RRF_K=60) → top TOP_K=20 candidate indices
    │      │
    │      ├─ per candidate: matching/features.py :: compute_features()
    │      │      _tag_overlap() · discipline agreement · _date_proximity()
    │      │      _predecessor_plausibility() · rapidfuzz token_set_ratio · embedding cosine
    │      │      ↓
    │      │  final_score()               weighted blend over present features, renormalised
    │      │      ↓
    │      │  blend_with_line_lock()      unique full line match → floor 0.93
    │      │
    │      └─ decide_outcome(scored, thresholds)                  [line 103]
    │             ├─ top1 < tau_low                    → NEW_ACTIVITY
    │             ├─ top1 ≥ tau_high AND margin ≥ min AND no discipline conflict → AUTO_LINK
    │             └─ otherwise                         → REVIEW
    │             ↓
    │         _rationale()  →  deterministic feature-name list
    │      ↓
    │  LinkDecision  (outcome, chosen_activity_id, confidence, margin, rationale, candidates)
    │
    ├─ DEDUPLICATION ─────────────────────────────────────────────
    │  _existing_event_keys(db)  +  _event_key(event)
    │      → events already ingested (same source position + text) are skipped
    │
    ├─ PERSISTENCE (per event) ───────────────────────────────────
    │  LinkedEvent row  (activity_id set ONLY when outcome is AUTO_LINK)
    │      ├─ AUTO_LINK    → appended to auto_pairs for roll-up
    │      ├─ REVIEW       → ReviewQueueItem row (schedule NOT mutated)
    │      ├─ NEW_ACTIVITY → ReviewQueueItem row (schedule NOT mutated)
    │      └─ REJECTED     → _write_audit(field="event_rejected")   history only
    │
    ├─ ROLL-UP (many-to-one granularity) ─────────────────────────
    │  matching/engine.py :: RollupAccumulator(get_matching_engine())
    │      ↓  .add(decision, event)   per AUTO_LINK pair
    │      │     quantity guards: _qty_swallowed_by_tag() · UOM mismatch · unitless
    │      │     collects DateAssertion for actual_start / actual_finish
    │      ↓  .results()
    │      │     percent_complete from installed/planned qty, else explicit %
    │      │     actual_start  = earliest assertion, else min(reported_date)
    │      │     actual_finish = latest assertion — ONLY when 100% complete
    │      │     _describe_conflicts()  records disagreement, does not silence it
    │      ↓
    │  RollupResult[]
    │      ↓
    │  server/main.py :: _apply_rollup_to_schedule(db, results, event_index, ...)
    │      ├─ _build_event_index(event_rows)   maps assertion → originating LinkedEvent
    │      ├─ _prior_write(db, activity_id, field)     most recent audit row
    │      ├─ _cross_file_conflict(prior, new_value, new_file)
    │      ├─ mutate Activity.actual_start / actual_finish / installed_qty / percent_complete
    │      └─ _write_audit(...) per field mutation        ← append-only
    │
    └─ Job row updated (status="completed", counts) → db.commit()
    ↓
IngestResponse { job_id, filename, status, message }
    ↓
frontend/src/pages/Ingest.tsx  →  api.getJob(job_id)  →  pipeline trace UI
```

**Failure handling:** `HTTPException` sets `job.status="failed"` and re-raises; any
other exception records `job.error_message` and returns HTTP 500. The job row always
reflects the outcome.

---

## 3. Planner reconciliation path — the only route that commits an actual date

```
frontend/src/pages/Reconcile.tsx
    ↓  api.getReviewQueue('pending')      GET /review-queue
server/main.py :: get_review_queue()                               [line 996]
    ↓
planner chooses confirm | reassign | create | ignore
    ↓  api.resolveReview(itemId, body)    POST /review/{item_id}/resolve
server/main.py :: resolve_review_item()                            [line 1038]
    │
    ├─ load ReviewQueueItem  →  load its LinkedEvent
    ├─ guard: item.status must be "pending"
    │
    ├─ action = confirm ──────────────────────────────────────────
    │      _write_audit(...)                                       [line 1082]
    │      _apply_confirmed_event_to_schedule(db, le, target_activity_id)   [1098]
    │      _upsert_alias(db, le.raw_text, target_activity_id, ...)          [1101]
    │
    ├─ action = reassign ─────────────────────────────────────────
    │      _write_audit(...) → _apply_confirmed_event_to_schedule(...)      [1126,1142]
    │      _upsert_alias(db, le.raw_text, req.activity_id, ...)             [1145]
    │
    ├─ action = create (new activity) ────────────────────────────
    │      _write_audit(...)                                       [line 1185]
    │      _upsert_alias(db, le.raw_text, req.new_activity_id, ...)         [1199]
    │
    └─ action = ignore  →  item closed, schedule untouched
    ↓
ResolveResponse { audit_records_created, alias_entries_created, ... }
```

> **Open loop — see `Audit-1.md` F-03.** `_upsert_alias` writes `AliasLexicon` rows at
> all three sites above. **Nothing in `matching/` reads that table.** The correction is
> persisted but never influences a future match. This is the single most important gap
> in the current data flow, and any work on retrieval should close it.

---

## 4. Conversational agent path

```
frontend/src/pages/Field.tsx
    ↓  frontend/src/hooks/useSpeech.ts   (browser SpeechRecognition, typed fallback)
    ↓  POST /agent/turn
server/main.py :: agent_turn()                                     [line 2213]
    │
    ├─ _context_from_request(req.context)  →  _apply_context(slots, context)   [2483,2246]
    ├─ _fill_slots(slots, req.message, context, db)                [line 2254 → 2378]
    │      ↓  server/agent_slots.py  — pure, table-tested parsers
    │      parse discipline · location · status · date · quantity ("6 out of 18")
    │      ↓  [optional] server/agent_llm.py  — bounded by NAVIS_LLM_TIMEOUT_SECONDS,
    │         one try, no retry; every value re-validated by the same parsers
    ├─ _merge_quantity(slots, parsed)                              [line 2466]
    ├─ _next_missing(slots)   →  ask for one slot at a time        [line 2527]
    │      (after 2 failed attempts on a slot, move on and leave it for the planner)
    │
    └─ when all required slots are filled:
           _match_slots(slots, session_id)                         [line 2563]
               ↓  runs the REAL matching engine (section 2) on the composed sentence
               ↓  returns proposal — activity, confidence, outcome — WITHOUT writing
           ↓
       supervisor reviews the structured card
           ↓  second call with confirm: true
       _create_event_from_slots(slots, session_id, db)             [line 2607]
           → LinkedEvent + ReviewQueueItem
           → does NOT touch actual_start / actual_finish
    ↓
AgentTurnResponse { reply, slots, proposal, extracted_intent }
```

**Invariant (D-009):** the agent never commits an actual date. Only
`POST /review/{item_id}/resolve` does. A voice update always surfaces in the planner's
queue.

---

## 5. Read paths

```
GET /schedule                server/main.py :: get_schedule()            [1316]
    └─ link_confidence is NOT stored — projected per request off the audit trail
       (one grouped query, not one per activity). Safe only because audit is append-only.

GET /schedule/{id}/audit     get_activity_audit()                        [1441]
GET /schedule/conflicts      list_source_conflicts()                     [1508]
    └─ walks each activity's writes per field; emits a conflict where consecutive
       writes disagree AND came from different files. Uses _source_kind() to label
       spreadsheet | daily_report | agent | other — never the baseline.
GET /audit/recent            recent_audit()                              [1578]

GET /memory/query            memory_query()                              [1972]
    ├─ _compute_duration_distribution()                                  [2008]
    ├─ _compute_productivity()                                           [2053]
    ├─ _compute_delay_reasons()      ← 12 hardcoded keywords; see Audit-1 F-04, F-05
    └─ _compute_suggested_duration() ← suppressed below 2 completions    [2147]

GET /field/reports           field_reports()  →  _field_events()         [1828]
GET /field/clarifications    field_clarifications()                      [1862]
POST /review/{id}/clarify    ask_clarification()   planner → supervisor  [1932]
POST /field/clarifications/{id}/respond   answer_clarification()         [1892]

POST /schedule/export        export_schedule()                           [1616]
    ├─ _generate_pmxml()                                                 [1652]
    └─ _generate_xer()                                                   [1713]
    ⚠ EXPORT ONLY. /ingest rejects .xml/.xer — there is no import path. Audit-1 F-10.

POST /admin/reset            admin_reset()   gated behind NAVIS_ENABLE_RESET=1  [1754]
```

---

## 6. Module relationships

```
MODULE: extraction/

Called by:   server/main.py :: ingest_file()
             eval.py
Consumes:    file paths (.txt .md .log .xlsx .csv), dataset/baseline_schedule.json
Calls:       extraction/textio.py    (explicit decode chain)
             extraction/prepass.py   (deterministic regex)
             extraction/spreadsheet.py
             extraction/llm_backend.py  (only when EXTRACTION_PROVIDER != rules)
Produces:    ExtractionResult { events: list[ExtractedEvent], warnings, errors }
Downstream:  matching/engine.py
```

```
MODULE: matching/

Called by:   server/main.py :: ingest_file(), _match_slots()
             eval.py, research/data/*.py
Consumes:    ExtractedEvent, dataset/baseline_schedule.json (via ScheduleIndex.from_json)
Calls:       matching/retrieval.py    HybridRetriever (tag + BM25 + dense → RRF)
             matching/features.py     compute_features → final_score → blend_with_line_lock
             matching/schedule_index.py  ScheduleIndex (by_id, line_index, bm25, records)
             matching/textutils.py    parse_tag, tag_variants, normalize_uom, tokenize
Produces:    LinkDecision, and via RollupAccumulator → RollupResult
Downstream:  server/main.py persistence, review queue, audit trail, API responses
Reads:       NOTHING from the database — matching is pure over the baseline JSON.
             (This is why the alias lexicon is not consulted; see Audit-1 F-03.)
```

```
MODULE: server/

Entry:       server/main.py (FastAPI app, 17 routes)
Calls:       extraction/, matching/, server/db.py, server/schemas.py,
             server/agent_slots.py, server/agent_llm.py, server/demo.py
Persists:    activities · jobs · linked_events · audit_records · review_queue
             alias_lexicon · conversation_turns · memory_cache
Produces:    Pydantic response models from server/schemas.py
Downstream:  frontend/
```

```
MODULE: frontend/

Entry:       frontend/src/main.tsx → App.tsx (react-router)
Planner:     /home /reconcile /schedule /ingest /memory
Field:       /field /field/reports /field/clarifications /field/profile
Calls:       frontend/src/lib/api.ts  →  every server route
State:       TanStack Query
Note:        NO offline persistence — no service worker, no IndexedDB. Field.tsx:358
             deliberately never claims a save succeeded. See Audit-1 F-08.
```

---

## 7. Data contracts crossing module boundaries

| Contract | Defined in | Produced by | Consumed by |
|---|---|---|---|
| `ExtractedEvent` | `extraction/models.py` | `extraction/` | `matching/engine.py` |
| `Provenance` | `extraction/models.py` | `extraction/` | audit trail |
| `LinkCandidate` / `FeatureVector` | `matching/models.py` | `matching/features.py` | `decide_outcome`, UI |
| `LinkDecision` | `matching/models.py` | `MatchingEngine.match_event` | `server/main.py`, `eval.py` |
| `DateAssertion` / `RollupResult` | `matching/models.py` | `RollupAccumulator` | `_apply_rollup_to_schedule` |
| `SlotState` | `server/agent_slots.py` | `_fill_slots` | `_match_slots` |
| SQLAlchemy models | `server/db.py` | `server/main.py` | persistence |
| Response models | `server/schemas.py` | `server/main.py` | `frontend/src/types.ts` |

---

## 8. Verification entry points

```
python -m pytest -q                  264 tests
  ├─ extraction/test_extractor.py · test_llm_guards.py
  ├─ matching/test_matching.py
  └─ server/test_server.py · test_agent.py · test_agent_llm.py  (conftest.py fixtures)

cd frontend && npx vitest run          55 tests
  └─ src/test/{field,reconcile,speech,states}.test.tsx

python eval.py                       matching quality over dataset/ground_truth.csv
python scripts/healthcheck.py        end-to-end server health
python scripts/reset_demo.py         rebuild DB from dataset/ (schema-drift aware)
research/data/*.py                   8 reproducible experiment harnesses
```

---

## Current Modification Area

**Task:** Establish permanent repository memory (`CLAUDE.md`, `DECISIONS.md`,
`FLOW.md`) and the read-before / update-after / commit-and-push workflow.
**Date:** 2026-08-30 · **Decision:** D-013

### Current path

```
Documentation only — no runtime execution path was modified.

CLAUDE.md      (new)  operating rules for AI agents in this repository
DECISIONS.md   (new)  D-001 … D-013; D-001–D-012 reconstructed from code
FLOW.md        (new)  this file — execution paths verified against commit 1de9b4d
Audit-1.md     (new, previous task)  independent gap analysis, 11 findings
```

### Upstream

```
None. No module calls into these files at runtime.
Read by: human developers and AI agents before making changes.
```

### Downstream

```
None at runtime.
Process-level: every future repository-changing task must read these files first
and update DECISIONS.md + FLOW.md before committing (CLAUDE.md, Prime Rule).
```

### Files currently modified

```
NEW:       CLAUDE.md
NEW:       DECISIONS.md
NEW:       FLOW.md
UNTRACKED FROM PRIOR TASK, now committed:  Audit-1.md
```

### Interfaces changed

```
None.
```

### API behaviour changed

```
None. No route, request model or response model was touched.
```

### Database changes

```
None. No schema, model, column or migration was touched.
```

### Verification performed

```
python -m pytest -q            → 264 passed
cd frontend && npx vitest run  →  55 passed
Symbol verification            → every file, function and class named in this
                                 document confirmed present via grep against
                                 matching/, extraction/, server/, frontend/src/
```

### Known open items (not addressed by this task)

`Audit-1.md` carries eleven findings. The four with the largest effect on the flows
documented above:

- **F-01** — `matching/engine.py::_dense_cos` returns `None` for candidates absent
  from the dense channel; the measured fix is +2.5 pts Top-1 (`research/data/densefix.json`).
- **F-03** — the `_upsert_alias` → `matching/` loop is open (section 3).
- **F-05** — `_compute_delay_reasons` iterates `reasons.keys()`, so a planner's
  resolution note can never introduce a new delay cause (section 5).
- **F-09** — dead, unreachable duplicates of `_dense_cos` / `_unique_line` at
  `matching/engine.py:157–170`, inside `_rationale()` after its `return`.
