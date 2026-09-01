# FLOW.md — How execution actually travels through NAVIS

The code tells you **what** the system does. `DECISIONS.md` tells you **why**.
This file tells you **how execution travels** — deep enough to answer:

> When this action happens, what exact code runs next?

Every file, function and class named here was verified against the codebase on
**2026-08-30** (commit `1de9b4d`) for §1–§8, and re-verified on **2026-08-31** along
with the new §0 and §9–§15. **Never add a path to this file that you have not read in
the source.**

### How to read this file

| If you need to… | Start at |
|---|---|
| trace a request end to end | **§2** (ingest), **§3** (reconcile), **§4** (agent), **§5** (reads) |
| understand *why* the pipeline has these stages | **§0** — the designs it replaced |
| know what loads at boot and what is lazy | **§9** |
| quote an accuracy or coverage number | **§10 first** — four threshold sets exist |
| know a module's obligations and failure behaviour | **§11** |
| follow one object from source line to screen | **§12** |
| know what is broken, dead, or hard-coded | **§13** |
| know which docs to trust | **§14** |
| pick up where the last session stopped | **§15** |

Historical material is confined to **§0**, **§13**, **§14** and **§15** and is labelled
as such. §1–§12 describe running code only.

---

## 0. Execution flow evolution — how the pipeline got this shape

Sections 1–8 describe the **current** flow. This section describes the flows that
came before it, because the current architecture only makes sense as a reaction to
them. Full reasoning is in `DECISIONS.md` Part 0 (H-001 … H-027); this is the
execution-path view.

Nothing in this section is currently running. Everything here is either **planned and
never built** or **built and replaced**.

---

### V0 — planned, never built (2026-08-22)

The original product, specified in `SIH26122_7Day_Build_Plan_v2.md`. A completely
different system on a completely different stack.

```
field engineer types a WhatsApp-style message (+ optional photo)
    ↓
Lovable-generated React app
    ↓
Supabase Storage (photo)          Supabase Edge Function `parse-update`
    ↓                                  ↓
vision call: "describe, don't      Claude API, WITH THE WHOLE 40-TASK SCHEDULE
conclude" → caption                INJECTED INTO THE PROMPT
    ↓                                  ↓
    └──────────► proposals table ◄─────┘  { matched_task_id, match_confidence,
                     ↓                      alternatives, proposed_status,
              review queue UI               proposed_percent, reasoning,
                     ↓                      needs_clarification }
              site engineer clicks Confirm
                     ↓
       DETERMINISTIC CPM RECALCULATION (topological sort → forward pass)
                     ↓
       projected_start / projected_finish written back
                     ↓
       frappe-gantt redraws: baseline bar vs projected bar, project end date moves
                     ↓
              audit_log row
```

**What survived into the shipped system:** the review queue, the mandatory human
gate, "low confidence is a valid answer", and the honesty policy about never claiming
autonomous verification.

**What did not survive:**

| V0 stage | Fate | Reference |
|---|---|---|
| Lovable + Supabase + Edge Functions | replaced by FastAPI + SQLite, local | H-002 |
| one LLM call picks the task | replaced by hybrid retrieval + feature scoring | H-003 |
| CPM recalculation + cascade | **never built at all** | H-004 |
| frappe-gantt chart | **never built** — `Schedule.tsx` is a TanStack table | H-004 |
| photo upload + vision caption | **never built** | H-005 |
| WhatsApp-shaped chat input | replaced by `POST /agent/turn` slot filling | H-001 |

---

### V1 — specified in the architecture, partly built, immediately corrected (~2026-08-27 → 08-28)

The first Python implementation, at commit `c16d5f4`. The retrieval → ranking →
decision structure was already right; the **data flow through it was broken**.

```
DPR .txt
    ↓  open(..., errors="replace")            ← D-010: destroys cp1252 bytes at ingest
Extractor._parse_text_spans
    ↓
_prepass_span → hints{tags, dates, quantities, ...}
    ↓
_merge_event
    ↓
ExtractedEvent(reported_date=None)            ← H-015: THE DATE WAS NEVER BOUND
    ↓
MatchingEngine.match_event
    ├─ _date_proximity(reported=None)      → None → feature dropped, weights renormalise
    └─ _predecessor_plausibility(None)     → None → feature dropped
    ↓
RollupAccumulator
    ↓
    no actual_start, no actual_finish, no audit row for any date
    ↓
Schedule screen shows a baseline with zero actuals
```

Three defects were fixed in sequence, each changing the execution path:

| Commit | Path change | Entry |
|---|---|---|
| `2da3c92` | `_merge_event` now binds `reported_date` (span date, else DPR header date); `_row_to_event` binds it from the completion column, else commencement | H-015 |
| `e664dd8` | one date becomes two claims: `_bind_assertion_dates` produces `asserted_start` / `asserted_finish`; `is_forecast_language()` short-circuits both to `None`; `DateAssertion` carries file+line+row through the roll-up | H-017 |
| `8928df7` | `extraction/textio.py :: read_text()` replaces `errors="replace"` with `utf-8-sig → cp1252 → latin-1` | D-010 |

The V1 conflict path was also wrong in a way that produced a false clean bill of
health, and was replaced:

```
V1 (superseded, D-011a)                     V2 (current, D-011)
RollupAccumulator._describe_conflicts       _prior_write(db, activity_id, field)
  sees only assertions from ONE /ingest       reads the most recent audit row
       ↓                                            ↓
  cross-upload disagreement invisible         _cross_file_conflict(prior, new, file)
       ↓                                            ↓
  reported 0 of 24 real conflicts             25 conflicts, 21 spreadsheet-vs-DPR
```

---

### V1a — the agent wrote directly to the schedule (superseded, D-009a)

Briefly, `POST /agent/turn` committed on the turn that filled the last slot:

```
last slot fills
    ↓
_create_event_from_slots                     ← immediately, no confirmation
    ↓
LinkedEvent + DIRECT WRITE of actual_start / actual_finish  (auto_applied=True)
    ↓
_upsert_alias(...)                           ← learned from an unreviewed guess
    ↓
NO ReviewQueueItem — the update never reached a planner
```

Replaced by the two-call proposal flow in §4. See D-009.

---

### V2 — current

Sections 1–8. The invariants that came out of the above and must not be reversed:

```
extraction never decides         matching never touches the database
matching never writes            only /review/{id}/resolve commits an actual date
the LLM never supplies tags      the LLM never supplies dates
a forecast is never an actual    a finish is never written below 100%
audit rows are never mutated     a lossy decode is never used on an input path
```

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
server/main.py :: ingest_file()                                    [line 769]
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
    │      │       extract_tags() · extract_dates_with_basis() · extract_quantities()
    │      │       extract_percentages() · extract_fractions()
    │      │       infer_discipline() · infer_status() · is_forecast_language()
    │      │       ↓
    │      │   [optional] extraction/llm_backend.py :: LLMBackend.extract_events()
    │      │       (skipped entirely when EXTRACTION_PROVIDER=rules — the default)
    │      │       ↓
    │      │   _merge_event()  →  _bind_assertion_dates()         [line 304, 414]
    │      │       returns (start, start_basis, finish, finish_basis).
    │      │       A claim with no date in the span is carried by the report
    │      │       header's date and marked DEFAULTED_TO_REPORT_DATE (D-015).
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
    │      │     quantity guard: planned_qty <= 0 with a uom → progress noted,
    │      │       NO percentage derived (D-016); no uom → genuine milestone
    │      │     collects DateAssertion (with .basis) for actual_start /
    │      │       actual_finish, and for the bare reported_date fallback
    │      ↓  .results()
    │      │     percent_complete from installed/planned qty, else explicit %
    │      │     actual_start  = earliest assertion, else min(reported_date)
    │      │                     — basis recorded, defaulted dates still written
    │      │     actual_finish = latest assertion — ONLY when 100% complete AND
    │      │                     basis is not DEFAULTED_TO_REPORT_DATE (D-015).
    │      │                     Otherwise → withheld_finish + review_reasons
    │      │     _describe_conflicts()  records disagreement, does not silence it
    │      ↓
    │  RollupResult[]
    │      ↓
    │  server/main.py :: _apply_rollup_to_schedule(db, results, event_index, ...)
    │      ├─ _build_event_index(event_rows)   maps assertion → originating LinkedEvent
    │      ├─ _prior_write(db, activity_id, field)     most recent audit row
    │      ├─ _cross_file_conflict(prior, new_value, new_file)
    │      ├─ per review_reason:  _write_audit(field="actual_finish_withheld")
    │      │                      + _queue_defaulted_finish()  → ReviewQueueItem
    │      │                        (reason="defaulted_finish_date")
    │      ├─ mutate Activity.actual_start / actual_finish (+ their _basis) /
    │      │         installed_qty / percent_complete
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
server/main.py :: get_review_queue()                               [line 1089]
    ↓
planner chooses confirm | reassign | create | ignore
    ↓  api.resolveReview(itemId, body)    POST /review/{item_id}/resolve
server/main.py :: resolve_review_item()                            [line 1131]
    │
    ├─ load ReviewQueueItem  →  load its LinkedEvent
    ├─ guard: item.status must be "pending"
    │
    ├─ reason == "defaulted_finish_date" ─────────────────────────
    │      _resolve_defaulted_finish(db, item, le, req)
    │      The link is already committed; what is being adjudicated is a DATE
    │      the roll-up refused to infer (D-015). Only two actions are legal:
    │        confirm → write le.asserted_finish (else le.reported_date) as
    │                  Activity.actual_finish, source="planner_review",
    │                  auto_applied=False, basis stays DEFAULTED_TO_REPORT_DATE
    │        ignore  → the node stays complete with no Actual Finish
    │      anything else → HTTP 400
    │
    ├─ action = confirm ──────────────────────────────────────────
    │      _write_audit(...)                                       [line 1182]
    │      _apply_confirmed_event_to_schedule(db, le, target_activity_id)   [1198]
    │      _upsert_alias(db, le.raw_text, target_activity_id, ...)          [1201]
    │
    ├─ action = reassign ─────────────────────────────────────────
    │      _write_audit(...) → _apply_confirmed_event_to_schedule(...)      [1226,1242]
    │      _upsert_alias(db, le.raw_text, req.activity_id, ...)             [1245]
    │
    ├─ action = create (new activity) ────────────────────────────
    │      _write_audit(...)                                       [line 1285]
    │      _upsert_alias(db, le.raw_text, req.new_activity_id, ...)         [1299]
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
AgentTurnResponse (server/schemas.py) {
    session_id, turn_number, agent_message, slots: SlotState, pending_slots[],
    event_created, linked_event_id, confidence,
    awaiting_confirmation,        ← true when the proposal is on the table and
                                    NOTHING has been written; the client then
                                    renders the structured card and sends
                                    confirm: true on the next turn
    activity_description, match_outcome, review_item_id,
    discipline_label, status_label, choices
}
```

> Corrected 2026-08-31: this block previously read
> `{ reply, slots, proposal, extracted_intent }`. None of those four field names
> exist on `AgentTurnResponse`.

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
| `BaselineVersion` / `PredecessorLink` | `matching/providers.py` | `JsonScheduleProvider` | `ScheduleIndex` · `_seed_schedule_if_empty` · `POST /schedule/import` · `GET /schedule` |
| `DateBasis` | `extraction/models.py` | `prepass` · `Extractor` · `SpreadsheetParser` | `RollupAccumulator.results` (gate) · `Activity.*_basis` · `GET /schedule` · `DateCell` |
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

---

## 9. Application startup — what loads, when, and in what order

Two processes. Neither serves the other; they are joined only by CORS (H-021).

### Backend

```
python -m uvicorn server.main:app --reload
    ↓
IMPORT TIME (server/main.py)
    ├─ sys.path.insert(0, <repo root>)              main.py:46 — lets `python server/main.py` work
    ├─ from .db import ...                          server/db.py imported
    │      └─ create_engine(f"sqlite:///{DB_PATH}")
    │         DB_PATH = $EPC_DB_PATH or <repo>/dataset/epc_progress.db
    │         Anchored to the repo root, NOT the CWD: a CWD-relative URL
    │         silently creates a second, empty database.
    ├─ DATA_DATE = date(2026, 9, 15)                main.py:179 — hard-coded; see §13
    ├─ MATCHING_THRESHOLDS = Thresholds(0.70/0.40/0.03)   main.py:237 — see §10
    └─ CORSMiddleware installed                     main.py:147–176
    ↓
@app.on_event("startup") :: startup()               main.py:182
    ├─ Base.metadata.create_all(bind=engine)
    │      Creates MISSING TABLES ONLY. It never adds a missing COLUMN to an
    │      existing table — the failure mode D-012 describes, and the reason
    │      server/demo.py :: _schema_matches() exists.
    └─ _seed_schedule_if_empty(db)                  main.py:195
           if activities table is empty:
               read_text(dataset/baseline_schedule.json)   ← explicit decode, D-010
               → 120 Activity rows → db.commit()
           else: return immediately
    ↓
SERVER READY.  Note what has NOT happened yet:
    ✗ no schedule index built
    ✗ no BM25 corpus
    ✗ no embedding model loaded
    ✗ no LLM client created
```

**The matching engine is lazy.** `_MATCHING_ENGINE` is a module-level singleton built
on **first use**, not at startup:

```
first POST /ingest  (or first POST /agent/turn that fills its last slot)
    ↓
get_matching_engine()                                main.py:247
    ↓
MatchingEngine(SCHEDULE_PATH, thresholds=MATCHING_THRESHOLDS)
    ├─ ScheduleIndex.from_json(dataset/baseline_schedule.json)
    │      per activity: prepass_extract_tags(desc + detail) → tag_variants → parse_tag
    │      builds  records[] · line_index · full_key_index · by_id · tokens
    │      builds  BM25Okapi(corpus)
    └─ HybridRetriever(index)
           MiniLMEmbedder._load()
               1. SentenceTransformer("all-MiniLM-L6-v2", local_files_only=True)
               2. on failure → download once (needs network)
               3. on failure → _hashed_embeddings()  SILENT degradation, H-010
           _embed_docs() → doc_matrix (120 × 384, L2-normalised)
    ↓
~4.4 s cold start, ONCE PER PROCESS  (research/data/latency.json)
```

Consequences worth knowing:

- The **first** ingest of a session is ~4.4 s slower than every later one. Warm it
  before a demo by ingesting anything, or by running `scripts/healthcheck.py`.
- A machine with no cached model and no network still starts, still serves, and still
  matches — with a hashed-trigram embedder and materially worse dense recall, and
  **nothing in the API says so**. The only routine signal is the line `eval.py` prints:
  `dense: sentence-transformers all-MiniLM-L6-v2 (local, offline)`.
- The engine holds `dataset/baseline_schedule.json` in memory and **never re-reads
  it**. Editing that file requires a server restart; editing the `activities` table
  does not affect matching at all, because `matching/` never reads the database.

### Frontend

```
cd frontend && npm run dev          → vite --port=5173 --host=0.0.0.0
    ↓
index.html → src/main.tsx → QueryClientProvider → App.tsx (react-router)
    ↓
src/config.ts resolves the API base URL (VITE_API_URL, else same-host:8000)
    ↓
useTheme / useDevice read two localStorage keys (the ONLY client persistence, H-024)
```

### Offline / non-server entry points

```
python scripts/seed.py            rebuilds the DB in-process, no server needed;
                                  uses the same code paths as POST /ingest
python scripts/reset_demo.py      clears ROWS (not the file) so it can run while the
                                  server is up; rebuilds the schema first if any
                                  model column is missing (server/demo.py::_schema_matches)
python scripts/healthcheck.py     needs the server up; probes 8 endpoints
                                  non-destructively (re-uploads a known-duplicate
                                  file; probes a 404 review id)
scripts/demo_reset.ps1            Windows demo wrapper
python eval.py                    builds its OWN MatchingEngine — never touches the DB
```

---

## 10. Threshold configuration map — read this before quoting a metric

The single most confusing thing in this codebase: **four different threshold sets
exist and they are not interchangeable.** Full reasoning in `DECISIONS.md` H-014.

```
matching/models.py :: Thresholds        DEFAULTS  0.78 / 0.42 / 0.06
    │   used by any MatchingEngine(...) built without explicit thresholds
    ├──► research/data/ablation.py
    ├──► research/data/bm25gate.py
    ├──► research/data/disagree.py
    └──► research/data/hypothesis.py

server/main.py:237 :: MATCHING_THRESHOLDS         0.70 / 0.40 / 0.03   ◄── THE LIVE SERVER
    │   calibrated on EXTRACTION SPANS (the real pipeline)
    │   measured: 96.6% auto-link precision, 48% coverage
    └──► POST /ingest · POST /agent/turn · scripts/seed.py · scripts/reset_demo.py
         → therefore: the demo database, every screen, every audit row

eval.py :: calibrate() grid search                0.775 / 0.5 / 0.03   ◄── THE HEADLINE NUMBER
    │   calibrated on GROUND-TRUTH MENTIONS ("extraction alignment noise is
    │   deliberately excluded" — eval.py docstring)
    │   measured: 100.0% auto-link precision, 50.4% coverage, 0 wrong AUTO_LINKs
    └──► research/data/eval_output.txt · EVIDENCE.md · the slide

research/data/densefix.py, weights.py             0.775 / 0.5 / 0.03  (hard-coded to match eval.py)
matching/test_matching.py                         0.8   / 0.45 / 0.06 (one unit test)
```

**Rules for anyone quoting a number:**

1. `100% auto-link precision` describes `eval.py` at 0.775 on gold mentions. Say so.
2. The running demo is at 0.70. Its measured precision is 96.6%, not 100%.
3. Absolute coverage figures from `ablation.py` / `bm25gate.py` / `disagree.py` /
   `hypothesis.py` use the 0.78 defaults and are **not** comparable to
   `eval_output.txt`. Their arm-vs-arm *comparisons* are valid, which is all they claim.
4. Changing any of these requires re-running `python eval.py` and recording the
   movement in `DECISIONS.md` (`CLAUDE.md`, Verification section).

---

## 11. Module contracts

The formal contract for each module boundary. §6 gives the call graph; this gives the
obligations.

```
MODULE: extraction/

Purpose            Turn heterogeneous source documents into a uniform ExtractedEvent
                   stream with mandatory provenance. It DECIDES NOTHING about the
                   schedule — it does not know what an activity_id means.
Called by          server/main.py :: ingest_file()  ·  server/demo.py :: reset_demo()
                   (eval.py uses extraction/prepass.py only, not Extractor)
Inputs             a file path (.txt .md .log .xlsx .csv) + optionally
                   dataset/baseline_schedule.json for context (now unused, H-019)
Outputs            ExtractionResult { events: list[ExtractedEvent], errors, warnings }
Calls              textio.read_text · prepass.* · spreadsheet.SpreadsheetParser
                   llm_backend.make_backend_from_env  (NullBackend unless opted in)
Downstream         matching/engine.py
State              Extractor holds self.schedule / self.schedule_context in memory and
                   one LLMBackend. No database. No cache. Idempotent per file.
Failure behaviour  Unsupported suffix → ExtractionResult with an error, no exception.
                   Spreadsheet parse error → caught, appended to result.errors.
                   LLM failure at ANY layer (unreachable, timeout, non-JSON, schema
                   mismatch) → LLMBackend._fallback() returns an empty LLMEventOutput
                   and the deterministic pre-pass result stands. Never raises.
                   .csv → returns an error: _extract_csv is an UNIMPLEMENTED STUB,
                   even though POST /ingest accepts .csv. See §13.
Invariants         Every event carries a Provenance. Tags come only from the regex
                   pre-pass (D-006). No file is ever decoded lossily (D-010).
```

```
MODULE: matching/

Purpose            Entity resolution: resolve one ExtractedEvent to one L5/L6 node,
                   with a calibrated confidence and an auditable reason — then
                   aggregate many events into one node's progress.
Called by          server/main.py :: ingest_file(), _match_slots()
                   eval.py  ·  research/data/*.py
Inputs             ExtractedEvent (duck-typed — matching never imports extraction's
                   models, only reads attributes), dataset/baseline_schedule.json
Outputs            LinkDecision per event;  RollupResult per activity
Calls              retrieval.HybridRetriever · features.compute_features/final_score/
                   blend_with_line_lock · schedule_index.ScheduleIndex · textutils
Downstream         server/main.py persistence · review queue · audit trail · eval.py
State              MatchingEngine is a long-lived singleton in the server: an in-memory
                   ScheduleIndex, a BM25 corpus, and a 120×384 embedding matrix, all
                   built once. RollupAccumulator is per-request and disposable.
                   ** READS NOTHING FROM THE DATABASE. ** This is why AliasLexicon
                   cannot influence a match (Audit-1 F-03), and why the engine is
                   testable without a server.
Failure behaviour  Empty candidate list → NEW_ACTIVITY with rationale ["no_candidates"].
                   Missing embedding model → hashed-trigram fallback, silent (H-010).
                   Absent feature → None → excluded from the blend, weights
                   renormalise. This is by design and is also how H-015 hid for a
                   commit and how Audit-1 F-01 hides today.
Invariants         Pure over the baseline JSON. Never writes. Never calls an LLM.
                   Never mutates its input event.
```

```
MODULE: server/

Purpose            HTTP surface, persistence, the audit trail, and the ONLY place a
                   schedule field is ever mutated.
Entry              server/main.py — FastAPI app, 17 routes
Calls              extraction/ · matching/ · db.py · schemas.py · agent_slots.py ·
                   agent_llm.py · demo.py
Persists           activities · jobs · linked_events · audit_records · review_queue ·
                   alias_lexicon · conversation_turns · (memory_cache — declared,
                   never written; see §13)
Outputs            Pydantic response models from server/schemas.py
Downstream         frontend/
State              One SQLite file; one MatchingEngine singleton; one Extractor per
                   ingest request.
Failure behaviour  HTTPException → job.status="failed", re-raised with its own status.
                   Any other exception during ingest → job.error_message recorded,
                   HTTP 500. The Job row always reflects the outcome.
                   IntegrityError from db.py validators → the write is refused; the
                   roll-up continues with the remaining fields.
Invariants         Every schedule mutation writes an AuditRecord (D-004).
                   AuditRecord is append-only — there is no UPDATE path anywhere.
                   Only resolve_review_item() commits an actual date from a review.
                   REVIEW / NEW_ACTIVITY outcomes never mutate the schedule.
```

```
MODULE: frontend/

Purpose            Two role surfaces over one API (H-023).
Entry              src/main.tsx → App.tsx (react-router)
Calls              src/lib/api.ts — the single place any URL is constructed
State              TanStack Query cache only. localStorage holds exactly two UI
                   preferences (theme, device-view override) and NO project data.
Failure behaviour  A failed field submit preserves the supervisor's text and claims
                   nothing (H-024). Speech unavailable →
                   typed fallback, an explicit designed state.
Known mismatch     src/lib/api.ts :: resolveReview sends action names the server does
                   not accept. See §13, item 1 — this is a LIVE BUG.
```

```
BOUNDARY: eval.py → matching/

eval.py deliberately bypasses extraction/. It rebuilds ExtractedEvents from
ground_truth.csv mentions using the SAME prepass functions the extractor uses
(extract_tags, extract_quantities, extract_percentages, extract_fractions,
infer_discipline, infer_status), so that what is measured is the MATCHER, not the
extractor's span segmentation. That separation is why eval.py's operating point
differs from the server's — see §10.
```

---

## 12. Data object lifecycle

```
a file on disk  /  a supervisor's sentence
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ExtractedEvent                       extraction/models.py                   │
│ created:  Extractor._merge_event()   |  SpreadsheetParser._row_to_event()   │
│           server/main.py::_create_event_from_slots()  (agent path)          │
│           eval.py::_build_event()                     (evaluation path)     │
│                                                                             │
│ raw_text          the exact span — this is what gets matched                │
│ tags              REGEX ONLY, never the LLM (D-006) — near-decisive         │
│ reported_date     when the line was written (span date, else header date)   │
│ asserted_start /  what the line CLAIMS about start/finish; None unless a     │
│ asserted_finish   claim was actually made; both None on forecast text (H-017)│
│ *_basis           HOW each date was obtained: EXPLICIT | RELATIVE_RESOLVED   │
│                   | DEFAULTED_TO_REPORT_DATE. A defaulted finish never       │
│                   reaches the schedule automatically (D-015)                 │
│ quantity + uom    a unitless quantity cannot drive progress (D-007)         │
│ discipline        soft signal; inference from field prose is noisy          │
│ status            authoritative for finish claims (H-017)                   │
│ percentage        explicit % or a parsed fraction                           │
│ provenance        MANDATORY — file, line|row, exact span, extraction method  │
│ activity_id /     V1 residue (H-003): filled later by the matcher, or never  │
│  confidence /     read at all (`reasoning`, `activity_description`);         │
│  alternatives /   `alternatives` from the LLM is OVERWRITTEN by the matcher's │
│  reasoning        own candidates in server/main.py                          │
└─────────────────────────────────────────────────────────────────────────────┘
        │  MatchingEngine.match_event()
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LinkCandidate[]  (≤ 20)              matching/models.py                     │
│ activity_id · retrieval_sources[TAG|BM25|DENSE] · rrf_score · rank          │
│ features: FeatureVector — every field Optional; None means SIGNAL ABSENT     │
│           and the weight renormalises out. `line_locked` is a bool FLOOR,    │
│           not a weight, which is why a bad tag cannot be down-weighted away. │
│ final_score = weighted blend, then blend_with_line_lock():                   │
│           unique full line match → floor 0.93;  any line lock → floor 0.46   │
└─────────────────────────────────────────────────────────────────────────────┘
        │  decide_outcome(scored, thresholds)   ← §10: WHICH thresholds matters
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LinkDecision                          matching/models.py                    │
│ outcome ∈ {AUTO_LINK, REVIEW, NEW_ACTIVITY}   (Decision.REJECTED exists in   │
│           server/db.py's comment vocabulary but NOT in the Decision enum)    │
│ chosen_activity_id — for REVIEW this is a PROPOSAL, not a link              │
│ confidence · margin · thresholds (embedded, so the decision is reproducible) │
│ rationale — closed vocabulary only (D-003)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ├── AUTO_LINK ──────► RollupAccumulator.add()
        │                        DateAssertion{field, value, BASIS,
        │                                     file, line|row, span}
        │                        kept individually so disagreement stays visible
        │                              ▼
        │                     RollupResult   percent_complete · actual_start ·
        │                        actual_finish (ONLY at 100% (D-008) and only
        │                        from a non-defaulted basis (D-015)) ·
        │                        actual_start/finish_basis · withheld_finish ·
        │                        withheld_finish_assertions · review_reasons ·
        │                        notes · conflicts · start/finish_assertions
        │                              ▼
        │                     _apply_rollup_to_schedule()
        │                              ▼
        │            ┌──────────────────────────────────────────┐
        │            │ Activity  (server/db.py)   MUTATED HERE   │
        │            │ actual_start · actual_finish · actual_qty │
        │            │ + actual_start_basis · actual_finish_basis│
        │            │ + compute_variance(DATA_DATE)             │
        │            └──────────────────────────────────────────┘
        │                              │ every field change
        │                              ▼
        │            ┌──────────────────────────────────────────┐
        │            │ AuditRecord — APPEND ONLY, NO UPDATE PATH │
        │            │ FK linked_event_id (NULL for aggregate    │
        │            │ writes) + denormalised file/line/row/span │
        │            │ + confidence + auto_applied + conflict    │
        │            │ + contributing_sources                    │
        │            └──────────────────────────────────────────┘
        │                              │ projected per request
        │                              ▼
        │              ScheduleActivityResponse.link_confidence
        │              (NOT stored — safe only because audit is append-only)
        │
        └── REVIEW / NEW_ACTIVITY ──► LinkedEvent (activity_id NULL for AUTO_LINK
                                       only; a REVIEW proposal is not committed)
                                          ▼
                                     ReviewQueueItem   status=pending
                                          │
                        ┌─────────────────┴─────────────────┐
                        │                                   │
              POST /review/{id}/clarify           POST /review/{id}/resolve
                        │                                   │
              clarification_question set,        confirm | reassign | create | ignore
              item stays PENDING                          │
                        ▼                                  ├─► AuditRecord
              /field/clarifications                        ├─► _apply_confirmed_event_to_schedule()
                        ▼                                  │     ← THE ONLY PLACE AN ACTUAL
              …/respond → clarification_response           │       DATE IS COMMITTED FROM A REVIEW
                        └──────────────────────────────────┘
                                                           └─► AliasLexicon row
                                                                 ⚠ WRITE-ONLY.
                                                                 Nothing in matching/
                                                                 ever reads it.
                                                                 (Audit-1 F-03)
```

**The agent path produces the same objects by a different route:**

```
SlotState (server/schemas.py)  ──_match_slots()──►  a synthetic sentence
                                                     ▼
                                            MatchingEngine (the real one)
                                                     ▼
                                            proposal only — NOTHING WRITTEN
                               ──confirm:true──►  _create_event_from_slots()
                                                     ▼
                                            ExtractedEvent → LinkedEvent
                                                            + ReviewQueueItem
                                            and still no actual date (D-009)
```

**Objects that exist but go nowhere** — knowing this saves an hour of tracing:

| Object | Status |
|---|---|
| `MemoryCache` (`server/db.py`) | table declared, imported into `main.py`, **never read or written**. Memory queries are computed live on every request. |
| `ScheduleIndex.full_key_index` | built at index time, **read by nothing**. `line_index` does the work. |
| `ExtractedEvent.reasoning` / `.activity_description` | populated only by the LLM; read by nothing downstream. |
| `AliasLexicon` | written by all three resolve actions; read by nothing. |
| `Job` | written and read within the same synchronous request (H-007). |

---

## 13. Technical debt, dead code, and live defects

Everything below was **verified in the source on 2026-08-31** and deliberately left in
place (D-014). Items marked **LIVE BUG** affect running behaviour; the rest are dead
weight or hard-coded assumptions.

`Audit-1.md` carries eleven findings (F-01 … F-11) and is not repeated here. These are
**additional** and none of them appear there.

### 1. LIVE BUG — two of the four planner resolve actions cannot succeed

The frontend and the server disagree on the action vocabulary of
`POST /review/{item_id}/resolve`.

| Server accepts (`server/main.py`, `ResolveRequest`) | Frontend sends (`frontend/src/pages/Reconcile.tsx`) |
|---|---|
| `confirm` | `confirm` ✅ |
| `reassign` | — |
| `create` (requires `new_activity_id` **and** `new_description`) | `new_activity` (sends only `new_description`) ❌ |
| `ignore` | `reject` ❌ |

```
Reconcile.tsx :: handleNew()     → { action: 'new_activity', new_description }
Reconcile.tsx :: handleReject()  → { action: 'reject' }
        ↓ api.ts :: resolveReview — passes the body through verbatim
        ↓ POST /review/{id}/resolve
        ↓ resolve_review_item()
        └─ falls through every elif → raise HTTPException(400, f"Unknown action: {req.action}")
```

Even after renaming `new_activity` → `create`, the request would still 400 because the
UI never collects a `new_activity_id`. The frontend's own TypeScript signature bakes
the wrong vocabulary in:
`action: 'confirm' | 'new_activity' | 'reject'` (`frontend/src/lib/api.ts`).

**Why it survived:** no test covers either path. `server/test_server.py` exercises
`confirm`, `reassign`, `create` and `ignore` against the API directly;
`frontend/src/test/reconcile.test.tsx` covers only the clarification flow. Nothing
tests the two together.

**Effect on the demo:** the "New activity" and "Reject" buttons on the reconciliation
screen fail. Only "Confirm" works. `reassign`, which the server supports and which is
the strongest training signal for `_upsert_alias`, **has no UI at all**.

### 2. LIVE BUG (latent) — `.csv` is accepted for upload and cannot be parsed

`POST /ingest` permits `.csv` (`server/main.py`, suffix allow-list), and
`Extractor.extract` dispatches it to `_extract_csv`, which is a stub:

```python
def _extract_csv(self, filepath: str) -> ExtractionResult:
    """Placeholder for future CSV parsing."""
    result = ExtractionResult(source_file=Path(filepath).name)
    result.errors.append("CSV extraction not yet implemented")
    return result
```

The upload succeeds, a `Job` row is created, zero events are extracted, and the user
gets a completed job with nothing in it. Either implement it or remove `.csv` from the
allow-list; the current state is the worst of the two.

### 3. Dead code — the unreachable `_dense_cos` / `_unique_line` duplicate

`matching/engine.py:155–169`, physically inside `_rationale()` **after its `return`**
on line 153, indented as methods of a class that is not there. Unreachable, and it
duplicates the two live `MatchingEngine` helpers at lines 88–99.

This is the same `_dense_cos` that `Audit-1.md` F-01 says needs fixing (+2.5 pts Top-1,
measured in `research/data/densefix.json`). **Anyone fixing F-01 must edit the copy at
line 88, not the one at line 157.** Deleting the dead block first would remove the
trap.

### 4. Dead code — the unreachable `REJECTED` branch in `ingest_file`

`server/main.py:838`, `else:  # REJECTED — preserve event + decision in history only`.
`matching.models.Decision` has exactly three members — `AUTO_LINK`, `REVIEW`,
`NEW_ACTIVITY` — and the preceding `if/elif/elif` covers all three. The branch can
never run, so **no `field="event_rejected"` audit row can ever be written by ingest.**

`REJECTED` also appears as a fourth value in `server/db.py`'s `decision` column comment,
in `_create_event_from_slots`'s reason map, and in a `server/test_agent.py` assertion —
all of them describing a state the enum does not have.

### 5. Incomplete implementation — the predecessor integrity warning is unconditional

`server/db.py :: validate_actual_start()` appends *"Predecessor {id} has not started
yet"* for **every** predecessor, unconditionally, with the reason in the code:

```python
for pred_id in activity.predecessor_list():
    pred = None
    # We need a session to query — caller handles this
    # Just return the warning with the predecessor ID
    warnings.append(IntegrityWarning(...))
```

No caller ever performs that lookup. The warning therefore fires whether or not the
predecessor actually started, so `integrity_warnings` on any activity with
predecessors is noise. The hard block in the same function (`Actual Start` after the
data date) *is* correct and does work.

### 6. Dead schema and dead index

- **`MemoryCache`** (`server/db.py`) — table declared, created by `create_all`,
  imported into `server/main.py`, and **never read or written anywhere**. Memory
  queries are recomputed on every request. Either wire it or drop it; as it stands it
  implies a caching layer that does not exist.
- **`ScheduleIndex.full_key_index`** (`matching/schedule_index.py`) — built on every
  index construction, **read by nothing**. `line_index` carries the tag channel.

### 7. Dead dependency

`recharts` is in `frontend/package.json` and is **imported by no file** in
`frontend/src`. It was the charting library for the Gantt/analytics visuals that were
never built (H-004).

### 8. Hard-coded demo constants

| Constant | Where | Risk |
|---|---|---|
| `DATA_DATE = date(2026, 9, 15)` | `server/main.py:179` — *"Latest date in our dataset"* | Every variance calculation, the `Actual Start` hard block, and the planned dates of planner-created activities are pinned to the seeded corpus. Ingesting anything dated after 2026-09-15 raises `IntegrityError` on the start write. |
| `reference_date = date(2026, 8, 15)` | `Extractor.__init__` — *"midpoint of our DPR range"* | Resolves year-less and relative dates. Wrong corpus → wrong year on every bare "12 Sep". |
| 12 delay keywords | `_compute_delay_reasons` | The entire delay taxonomy. See `Audit-1.md` F-04/F-05. |
| CORS origin list + regex | `server/main.py:147–176` | Deliberately permissive for demo hosts (H-021). Not a production posture — and there is no authentication behind it (`Audit-1.md` F-11). |

### 9. Stale comments and prompts

- `extraction/llm_backend.py :: SYSTEM_PROMPT` rule 3 — *"Use the schedule context to
  infer discipline and status"*. No schedule context has been sent since `ab137ee`
  (H-019). Harmless, but it instructs the model to use something it never receives.
- `server/main.py` module docstring — *"POST /schedule/export emit PMXML (XER as
  stretch)"*. XER shipped.
- `server/db.py :: _now()` uses the deprecated `datetime.utcnow()`, producing ~17,600
  `DeprecationWarning`s per test run. Cosmetic, but it drowns real warnings.

### 10. RESOLVED (2026-09-01, D-016) — `0/0 nos → 100.0%`

`FINDINGS.md` F7 flagged `PIP-PCD-1053` showing `0/0 nos` at `100.0%` in the roll-up
table, and proposed guarding "the percent-complete path so `planned_qty == 0` cannot
produce a quantity-derived percentage".

**This section previously argued the observation was right but the diagnosis wrong,
and that applying the fix literally would make every milestone un-completable. That
warning was correct, and D-016 is the fix that avoids it.** The 100% was never
quantity-derived: it came from the unquantified-node rule in `RollupAccumulator.add()`,
reached through `elif acc["pct_events"]`, not through the `installed / planned_qty`
branch (which is, and always was, guarded by `rec.planned_qty > 0`).

What the earlier analysis missed is that `planned_qty == 0` is two different states,
and the **unit of measure** separates them:

| `planned_qty` | `uom` | What it is | Behaviour |
|---|---|---|---|
| `> 0` | any | a quantified node | partial-scope protection (D-008 / H-017) |
| `<= 0` | `"nos"` | a quantified node with a **missing** planned quantity | progress recorded, **no percentage derived** |
| `<= 0` | `""` | a genuine **milestone** | a completion claim means 100% — unchanged |

`PIP-PCD-1053` is *"P&ID Punch List Close-out"*, `planned_qty = 0`, `uom = "nos"` — the
middle row, a data gap in `dataset/baseline_schedule.json`, not a milestone. It now
reports 0% and receives no dates. The 120-activity baseline contains **no** node in the
bottom row, so `matching/test_matching.py::TestMilestoneNode` builds a synthetic
one-node schedule to prove milestones still complete.

A percentage the source *stated* still counts on such a node; only a percentage
**derived** from a missing planned quantity is refused.

---

## 14. Documentation status — which files are current and which are dated

`CLAUDE.md`'s rule is that stale documentation is worse than none, because it is
trusted. So:

| File | Status | How to read it |
|---|---|---|
| `CLAUDE.md` | **CURRENT** | Binding operating rules |
| `DECISIONS.md` | **CURRENT** | D-series = current reasoning; Part 0 H-series = reconstructed history |
| `FLOW.md` (this file) | **CURRENT** | §1–§8 verified against commit `1de9b4d`; §0 and §9–§16 verified 2026-08-31 |
| `Audit-1.md` | **CURRENT** | Independent gap analysis, 11 open findings (F-01…F-11), reproduction commands in its appendix |
| `FINDINGS.md` | **CURRENT** | Second independent review (2026-08-31), F1–F7 plus a ranked last-day order of work. Overlaps `Audit-1.md` by design; its **F1** is the sharpest statement of `Audit-1.md` F-06, its **F7** is new (§13.10, fixed by D-016), and its F3/F4 restate F-10/F-03. Its numbers come from `research/data/eval_output.txt` — i.e. the **eval** operating point, not the server's (§10, H-014). All line citations verified 2026-08-31. |
| `research/` | **CURRENT** | Eight reproducible harnesses; `EVIDENCE.md` labels every claim MEASURED / AUDITED / RUBRIC / NOT CLAIMED |
| `SETUP.md`, `DEMO.md` | **CURRENT** | Runbooks |
| `SIH-2026-PS.txt` | **CURRENT** | The actual problem statement — the authority on scope |
| `ARCHITECTURE.md` §0, §1, §3–§6 | **DATED (2026-08-28)** | The original specification, including the parts that were rejected. Excellent reasoning; **not** a description of the current code. See H-008 to H-012 for what diverged. |
| `ARCHITECTURE.md` §2 (Data Contracts) | **HISTORICAL — do not code against it** | Field names, `event_type`, `date_basis`, `asserted_date`, `delay_signal`, `uom_compatible` and the `extractor{}` block never existed in code. Divergence table in H-009. |
| `ARCHITECTURE.md` §7 (Known Limitations) | **MOSTLY CURRENT, partly overtaken** | Names `_fill_slots_from_message`, a symbol that no longer exists (it is `_fill_slots` + `server/agent_slots.py`). Its "asks for three things only" paragraph was superseded within the same document by "the agent asks for what it needs". |
| `research/NAVIS_TECHNICAL_AUDIT.md` | **CURRENT with one caveat** | Attributes `tau_high=0.775` to `matching/models.py` and to the shipped system. Both are loose — see §10 and H-014. |
| `SIH context.txt` | **SUPERSEDED CONCEPT (2026-08-22)** | Describes a WhatsApp/photo/Gantt product. Its competitive analysis, risk list and honesty policy are still good; its product description is not this system. H-001. |
| `SIH26122_7Day_Build_Plan*.md` / `*.pdf` | **SUPERSEDED PLAN (2026-08-22)** | A different stack, a different architecture, and features that were never built. Read only as history. H-002 … H-005. |
| `Design/` (22 mockups) | **SPECIFICATION, partly refused** | Where a mockup and the code disagree, the code is authoritative. `field_supervisor_update_pending_sync` describes a state that deliberately does not exist (H-024). |

---

## 15. Historical handoff — state at the end of the reconstruction session (2026-08-31)

Written per the handoff requirement so the next agent inherits an accurate picture
rather than an optimistic one.

### Last major task attempted
Reconstruct the project's history into `DECISIONS.md` and `FLOW.md` from Git,
the source, and the repository's own planning and research documents (D-014).

### Completed
- `DECISIONS.md` Part 0: **27 historical entries (H-001 … H-027)** covering the
  planning era, the pre-Git build week, and every code commit from `c16d5f4` to
  `1de9b4d`, each naming its evidence.
- `DECISIONS.md` D-014 recording the handoff method and why defects were not fixed.
- Cross-links added from D-001, D-002 and D-005 to the historical entries that
  qualify them.
- Two documentation corrections in `DECISIONS.md`: the stale symbol
  `_fill_slots_from_message`, and a prominent warning on D-002's operating point.
- `FLOW.md` §0 (execution-flow evolution V0 → V1 → V1a → V2), §9 (startup), §10
  (threshold map), §11 (module contracts), §12 (data lifecycle), §13 (technical debt),
  §14 (documentation status), and this section.

### Partially completed
- **Verification of `ARCHITECTURE.md` §7 against current code.** Its stale paragraphs
  are identified in §14 but the file itself was **not edited** — it is a dated
  document by design (D-014) and editing it would destroy the record it holds.
- **`research/NAVIS_TECHNICAL_AUDIT.md`'s threshold attribution** is flagged in §10
  and §14 but not corrected in that file.

### Not started
- Every one of the eleven `Audit-1.md` findings.
- Every defect in §13 above.
- The inter-annotator agreement test proposed in `ARCHITECTURE.md` §5.B, which would
  quantify the ground-truth circularity (H-013). Never run.
- The BM25 + feature-scoring / no-dense arm (`Audit-1.md` F-01, H-027). Never run.

### Known failing tests
**None.** `python -m pytest -q` → **264 passed** (40.9 s, 17,924 warnings — almost all
`datetime.utcnow()` deprecations from `server/db.py :: _now()`).

### Known bugs
See §13. In priority order for a demo:
1. `new_activity` / `reject` buttons on `/reconcile` return HTTP 400 (§13.1) — **the
   most likely thing to break on stage.**
2. `.csv` upload silently produces an empty job (§13.2).
3. Unconditional predecessor integrity warnings (§13.5).
4. `Audit-1.md` F-01 — `_dense_cos` returns `None` for candidates outside the dense
   channel; the measured fix is +2.5 pts Top-1 and is **not applied**.
5. `Audit-1.md` F-05 — a planner's resolution note can never introduce a new delay
   cause.

### Known technical debt
§13 items 3, 4, 6, 7, 8, 9. Plus the two structural gaps that are decisions rather
than defects: the alias lexicon is write-only (`Audit-1.md` F-03) and there is no
authentication or project isolation (`Audit-1.md` F-11).

### Temporary workarounds in place
- The hashed-trigram embedder standing in for MiniLM, **silently** (H-010).
- `DATA_DATE` and `reference_date` pinned to the seeded corpus (§13.8).
- `scripts/reset_demo.py` rebuilding the schema on drift instead of a migration —
  deliberate, since everything in that database is regenerable (D-012).
- Two calibrated operating points instead of one (H-014).

### Planned next step (recommended order)
1. **Fix §13.1.** One line in `Reconcile.tsx`/`api.ts` plus a UI field for
   `new_activity_id`, and a test that exercises the frontend body against the server
   route. It is a demo-blocking bug with a five-minute fix.
2. **Resolve H-014 consciously.** Either align `MATCHING_THRESHOLDS` with the
   calibrated point and re-run `eval.py`, or document the two points everywhere a
   number is quoted. Do not leave it implicit.
3. **Delete the dead `_dense_cos` at `matching/engine.py:155–169`, then apply
   `Audit-1.md` F-01** to the live copy at line 88. Re-run `eval.py` and record the
   movement in `DECISIONS.md`. This is the largest measured win available (+2.5 pts
   Top-1, +1.6 pts coverage, auto-precision unchanged).
4. **Close the alias-lexicon loop (`Audit-1.md` F-03).** It converts a write-only
   table into the PS's stated learning claim. Note the constraint: `matching/` reads
   nothing from the database by design (§11), so the lexicon must be injected into
   `MatchingEngine` rather than queried from inside it.
5. Fix `Audit-1.md` F-05 (one-line loop bug), then F-06 (zero-day durations).

### Component status at handoff

| Area | Status |
|---|---|
| **Extraction** | Working. Rules-only by default; LLM opt-in and guarded. `.csv` is a stub (§13.2). No OCR, by decision (H-005). |
| **Matching** | Working. 87.2% Top-1, 100% auto-link precision at the eval operating point / 96.6% at the server's. One measured, unapplied improvement (F-01). |
| **Roll-up + integrity** | Working. Partial-scope guard, unitless-quantity guard, UOM-mismatch guard, cross-file conflict detection all live. |
| **Persistence + audit** | Working. Append-only, 259 rows on the seeded corpus, 165 with an exact position. No dangling foreign keys. |
| **Review queue** | Working server-side (4 actions). **UI reaches only 1 of them** (§13.1). |
| **Clarification loop** | Working both directions. |
| **Agent / voice** | Working. Slot filling is deterministic; the LLM layer is optional and re-validated. Browser speech with a typed fallback. Proposals only, never writes (D-009). |
| **Institutional memory** | Working, and statistically thin by admission (H-006, `Audit-1.md` F-04). |
| **Export** | Working (PMXML + XER). **No import path** (H-008, F-10). |
| **Frontend** | Working, 55 vitest tests. No offline capture, by decision (H-024). One live contract bug (§13.1). |
| **Database** | SQLite, 8 tables, 1 of them (`memory_cache`) unused. No auth, no multi-project isolation (F-11). |
| **Evaluation** | Working and reproducible: `eval.py` plus 8 harnesses in `research/data/`. Ground truth is partly circular and the mitigation test was never run (H-013). |
| **Documentation** | Current for `CLAUDE.md` / `DECISIONS.md` / `FLOW.md` / `Audit-1.md` / `research/`. Dated for `ARCHITECTURE.md` and the build plans (§14). |

### Environment assumptions the next agent should verify first

```
python -m pytest -q                   expect: 264 passed
cd frontend && npx vitest run         expect: 55 passed
python eval.py | head -20             expect the line:
    dense: sentence-transformers all-MiniLM-L6-v2 (local, offline)
    ↑ if this says anything else, the hashed fallback is active (H-010) and
      NO metric from that run is comparable to a published one.
```

---

## Current Modification Area

**Task:** Make the matching engine measurably stronger and measurably faster,
with every change justified on the held-out test split and an ablation showing
what it contributed alone.
**Date:** 2026-09-01 - **Decisions:** D-025, D-026, D-027, D-028, D-029

### Current path - document ingestion, after the change

```
server/main.py :: get_matching_engine()
  ScheduleIndex.from_json(SCHEDULE_PATH)
        |                 _build()                 records, tag_keys, tokens
        |                 ensure_bm25(k1, b)       BM25Okapi  +  NEW
        |                   _build_bm25_matrix()   term x doc score matrix,
        |                                          built ONCE at startup
        |                 _pos_by_id               NEW  O(1) activity_id -> row
        |                 _build_feature_columns() NEW  planned_lo/hi, planned_qty,
        |                                          padded predecessor start/finish
        |                                          matrices - schedule-only facts
        |                                          hoisted out of the scoring loop
        |
  config.production(baseline.sha256)               NEW - fitted ranker +
        |                                          calibrator, but ONLY for the
        |                                          baseline they were fitted
        |                                          against; otherwise DEFAULT
  MatchingEngine(..., index=index, config=cfg)
        |
  HybridRetriever.__init__
        |   retrieval.shared_embedder()            NEW  process-wide singleton,
        |                                          lazy - ctor loads nothing
        |   _embed_docs()
        |       embedcache.content_key(model, docs)   sha256 over model name +
        |       embedcache.load(key)                  exact doc strings
        |         hit  -> np.load(mmap_mode="r")      ~10 ms
        |         miss -> encode_normalized + store   ~370 ms
        |
link_events_to_activities()
  engine.match_events(events)                      the whole file at once
        |
        v
HybridRetriever.retrieve_many(texts, tags, disciplines)
   1. unambiguous_tag_hit() per event              short circuit: answered
                                                   without touching the encoder
                                                   (fires 4.7% on v2, 0.4% v1)
   2. dense_channel_many(remaining)                ONE forward pass for the file
        embedder.encode_normalized(texts)
        sims = Q @ doc_matrix.T
        np.argpartition(-sims, k)                  O(n) top-k per row
   3. retrieve(text, tags, dense_hits=...) each
        tag_channel()      line_index dict lookup, O(tags)
        bm25_channel()     index.bm25_scores() - row gather + sum on the
                           precomputed matrix (bit-exact vs rank_bm25, 47x)
        ngram_channel()    OFF by default (w_ngram=0.0) - D-027
        alias_channel()    OFF unless a lexicon is supplied; reads
                           textutils.alias_key(text), the SAME function
                           server.main._upsert_alias writes with
        RRF fusion over enabled channels
        discipline gate    OFF by default - measured -4.32 top-1, D-027
        |
        v
MatchingEngine._decide -> _score(event, cand_ids, info)
        features.score_pool()                      NEW  matrix, not a loop
            tag_overlap        event keys parsed ONCE, then per candidate
            discipline         vector compare
            date_proximity     masked numpy over col_planned_lo/hi
            predecessor_*      bucketed min over the padded matrices
            fuzzy_similarity   ONE rapidfuzz.process.cdist for the pool
            embedding_cosine   from the dense hits
            + 5 extra features when config.extra_features
        ranker.score(M)  OR  features.blend_matrix(M)
        blend_with_line_lock()                     unchanged near-decisive rule
        _cross_encode()                            OFF by default; degrades to a
                                                   no-op when uncached
        features.matrix_to_vectors()               FeatureVector.model_construct
        |
        v
engine.decide_outcome(scored, thresholds, abstainer)
        abstainer.should_abstain()                 OFF by default; can ONLY
                                                   refuse, never promote
        tau_low / tau_high / margin_min            unchanged rule
        |
engine._calibrated()                               isotonic score -> probability;
                                                   rewrites confidence ONLY,
                                                   never the choice
```

### Measurement path (new, research/bench/)

```
harness.py            corpus + splits, bootstrap CIs, near-miss split,
                      recall@k, risk-coverage, ECE/Brier/reliability,
                      pooled_no_match (5-fold over all 70 negatives)
   |
   +-- profile_latency.py   per-stage warm latency, batched throughput
   +-- cold_start.py        phase-by-phase cold start in a FRESH process
   +-- tune_retrieval.py    BM25 (k1,b) and RRF grid search, TRAIN only
   +-- fit_production.py    fits ranker (train) + calibrator (dev),
   |                        writes matching/artifacts/
   +-- ablation.py          the full report -> ABLATION_RESULTS.txt
```

### Verification performed

```
python -m pytest -q                              580 passed
  matching/test_equivalence.py    13  vectorised == scalar, batch == single,
                                      BM25 matrix == rank_bm25 (atol 1e-12),
                                      short circuit never changes the winner,
                                      one model per process
  matching/test_learned.py        20  alias channel fires and does NOT bypass
                                      scoring; ranker falls back when broken;
                                      abstainer can only refuse; calibration
                                      never changes a choice; cross-encoder
                                      degrades to a no-op
python eval.py                                   v1 byte-identical to baseline
python eval.py --production --schedule ...v2     top-1 74.1 | near-miss 29.4
                                                 | rest 100.0 | auto-P 100.0
                                                 | NO_MATCH 13/13
python scripts/healthcheck.py                    22 passed, 1 failed
                                                 (server not running - expected)
```

### Headline numbers, held-out test split (198 mentions, 185 positives)

```
                        baseline    selected (D-028)
top-1                     71.4%       74.1%   [-1.6, +7.6]  spans zero
near-miss top-1 (n=68)    26.5%       29.4%   [-8.8, +14.7] spans zero
all the rest   (n=117)    97.4%      100.0%
coverage                  39.4%       47.0%
auto-link precision      100.0%      100.0%   floor holds
NO_MATCH (pooled, n=70)   80.0%      100.0%   intervals do not overlap
ECE                       0.129       0.042
per-event, batched     2.07 ms     2.50 ms
```

### Known limitations

- **The top-1 gain is not statistically established.** [-1.6, +7.6] at n=185.
  The coverage and NO_MATCH gains are; the top-1 and near-miss moves are
  directional only. This is stated wherever the number appears.
- **Retrieval has no remaining headroom on this corpus.** recall@20 is 100% on
  every split, so four of the planned retrieval improvements measured exactly
  +0.00 and are shipped OFF. On a corpus where retrieval misses, they would
  have to be re-measured rather than assumed dead.
- **The cross-encoder is unmeasured for accuracy** - not cached, no network.
  Only its cost (45 ms/event lower bound) and its degradation path are known.
- **The alias channel cannot be measured on this corpus at all**: zero lexical
  overlap between splits by construction. Its behaviour is proven by unit test
  instead.
- **The fitted artefacts are valid for `baseline_schedule_v2` only.** The server
  still defaults to v1, so `production()` deliberately resolves to the hand-set
  blend there. Re-run `fit_production.py` after any change to the feature set,
  the retrieval config, or the baseline.
- **Cold start is still ~8 s**, dominated by `import torch`. The embedding cache
  removes 372 ms of it and nothing available removes the rest.

---

## Previous Modification Area (2026-09-01, D-024) - retained for history

**Task:** Raise near-misses to at least 150 of the v2 corpus, concentrated in
dev and test, and report top-1 three ways.
**Date:** 2026-09-01 - **Decision:** D-024

### Current path

```
generate_v2_dataset.py
  build_near_miss_families()   NEW - discriminator_omitted | adjacent_sequence
                               | shared_tag; overlapping pairs merged into
                               complete families so confusable_with is whole
  build_near_miss_queue()      NEW - fixed count, families cycled
  build_near_miss()            REWRITTEN - the deciding token is REMOVED
  _strip_tokens()              NEW - drops the token, the positional noun it
                               qualified, and the whole tag when the token
                               lived inside one
  splits                       third stratification axis: near_miss,
                               ratio 0.25 / 0.35 / 0.40 train/dev/test
        |
dataset/v2/ground_truth_v2.csv   + near_miss_kind, missing_discriminator,
                                   confusable_with
        |
eval.py :: print_near_miss()     NEW - strict top-1 three ways, in-family
                                 top-1, and the REVIEW rate on the subset
```

### Verification performed

```
python -m pytest -q extraction matching server   400 passed
python eval.py                                   v1 unchanged (87.2 / 100.0 / 50.4)
held-out test (198):  overall 71.4% | near-miss 26.5% (68) | rest 97.4% (117)
                      in-family 75.0%, REVIEW on near-misses 100%,
                      auto-link precision 100.0%, NO_MATCH rejection 84.6%
pooled CV (814):      overall 82.1% | near-miss 25.0% (160) | rest 97.8%
                      in-family 78.8%, auto-link precision 99.8%
```

### Known limitations

- **Strict top-1 on near-misses is partly luck.** Where a mention is compatible
  with three siblings, no system can pick the gold one from the text. In-family
  top-1 and the REVIEW rate are the fair readings and are reported beside it.
- **`shared_tag` dominates the subset** (117 of 160) because v2 has 19 tags
  spanning 80 activities and only 27 clean discriminator pairs. It is the most
  realistic kind but the mix is uneven.
- Corpus grew 700 -> 814 mentions; near-misses were added rather than swapped in.

---

## Previous Modification Area (2026-09-01, D-022/D-023) - retained for history

**Task:** Fix the two confirmed extractor defects recorded in D-020
(`EQUIPMENT_TAG_RE` digit bound, `FRACTION_RE` unit suffix) and republish every
evaluation before and after.
**Date:** 2026-09-01 · **Decisions:** D-022, D-023

### Current path

```
extraction/prepass.py
  TAG_NUM  = r'\d{1,5}'     NEW named bound, equipment/instrument suffix
  LINE_NUM = r'\d{3,5}'     NEW named bound, pipe line number
  EQUIPMENT_TAG_RE          prefix [A-Z]{1,3} -> {1,4} (WHCP-2101),
                            suffix \d{1,3} -> TAG_NUM
  INSTRUMENT_TAG_RE         suffix \d{1,3} -> TAG_NUM  (PT-1101, LT-1201)
  PIPE_TAG_RE / PIPE_BARE_RE   \d{3,4} -> LINE_NUM
  extract_tags()            + containment guard on the equipment and
                            instrument branches: longest match wins, so
                            "P-1015" is not re-added beside '6"-P-1015-A1A'
                            with no size (that defeated the size-mismatch
                            guard — caught by test_size_mismatch_penalised)
  FRACTION_RE               numerator must start at a word boundary and not
                            follow a digit or '.'; an optional unit token may
                            sit between numerator and "of"
        ↓
matching/  UNTOUCHED. Two digit assumptions remain there and are reported
           in D-022: _PIP_FULL_RE/_PIP_BARE_RE (\d{3,4}) and, live on v2,
           _SLASH_VARIANT_RE (\d{1,3}) which fails to expand P-1401A/B.
```

### Upstream

```
extract_tags()      -> ScheduleIndex._build (record tag_keys)
                    -> Extractor._prepass_span (event tags)
                    -> features._tag_overlap  (near-decisive)
extract_fractions() -> Extractor._merge_event -> ExtractedEvent.percentage
                    -> RollupAccumulator -> percent_complete -> actual_finish
```

### Downstream

```
v2 tag readability   41 -> 101 activities; 22/40 -> 40/40 distinct strings
v2 mentions w/ tags  96 -> 205 of 700
v2 fractions         42 -> 104 of 700
v1                   IDENTICAL on every count — neither defect fired on it
```

### Verification performed

```
python -m pytest -q extraction matching server   400 passed (35 new tests)
python -m pytest -q --ignore=tmp                 547 passed (400 NAVIS +
                                                 147 unrelated claude-usage/)
python eval.py                                   v1 unchanged on every metric
python eval.py --schedule v2 --ground-truth v2   test: coverage 80.3 -> 81.0
python eval.py --schedule v2 --ground-truth v2 --cv
                                                 pooled: coverage 54.1 -> 56.6,
                                                 auto-link recall 60.0 -> 62.7,
                                                 Top-1 96.8 -> 97.0,
                                                 auto-link precision 100.0 (flat)
```

### Known limitations

- **NO_MATCH rejection did not move** (70.6%, 48/68 pooled). Neither defect
  touched abstention; that needs the explicit reject-option model.
- **`_SLASH_VARIANT_RE` in `matching/textutils.py` still caps at 3 digits**, so
  `P-1401A/B` does not expand. Reported, not changed — `matching/` was out of
  scope.
- **The v2 corpus still phrases quantities as `40 of 120 m3`** to route around
  D-023, which is no longer necessary. Deliberately not regenerated: moving the
  dataset and the extractor in one commit would make the before/after numbers
  above unattributable.

---

## Previous Modification Area (2026-09-01, D-020/D-021) — retained for history

**Task:** Regenerate the evaluation dataset — schedule, daily reports,
spreadsheets and ground truth — as one mutually consistent family against
`dataset/baseline_schedule_v2.json`.
**Date:** 2026-09-01 · **Decisions:** D-020, D-021

### Current path

```
generate_v2_dataset.py                 NEW — the whole family, one seed (20260901)
  make_tag_free() / _tidy_substitutions()   tag-free mention variants
  literal_tags()                       a tag as a HUMAN reads it, independent of
                                       what extract_tags recognises
  build_mention()                      completion / progress / start / delay /
                                       narrative, mixed date formats
  build_near_miss_mention()            text that reads like a sibling activity
  HARD_NEGATIVES                       68 plausible non-scope lines
  build_spreadsheet()                  merged headers, mixed dates, blank cells
  validate()                           7 checks; writes dataset/v2/VALIDATION.md
        ↓
dataset/v2/
  dpr_day_01..29.txt                   29 reports, 4 deliberately messy
  civil|piping|equipment|eni|hse_progress.xlsx
  ground_truth_v2.csv                  700 mentions; + mention_date, + split
  splits.json                          train 423 / dev 140 / test 137
  VALIDATION.md
        ↓
eval.py
  --ground-truth                       NEW
  _open_ground_truth()                 NEW — v1 is cp1252, v2 is utf-8
  split-aware main()                   calibrate on dev, report on test
  print_date_basis()                   NEW — EXPLICIT vs DEFAULTED_TO_REPORT_DATE
```

### Upstream

```
python generate_v2_dataset.py   → dataset/v2/*  (reads baseline_schedule_v2.json)
python eval.py --schedule dataset/baseline_schedule_v2.json \
               --ground-truth dataset/v2/ground_truth_v2.csv
```

### Downstream

```
dataset/            UNTOUCHED — v1 metrics reproduce byte-for-byte
matching/           UNTOUCHED — no engine change
D-015 date gate     now exercised: 41.6% EXPLICIT on test, finish dates written
```

### Verification performed

```
python -m pytest -q                    513 passed (unchanged)
python eval.py                         v1 unchanged: Top-1 87.2%, coverage 50.4%,
                                       auto-link precision 100.0%
python eval.py --schedule v2 --ground-truth v2
                                       test split: Top-1 99.2%, auto-link
                                       precision 100.0%, coverage 80.3%,
                                       NO_MATCH rejection 53.8%
python eval.py --schedule v2 (v1 key)  still refused, exit 2 (D-019 guard holds)
dataset/v2/VALIDATION.md               7 checks, all pass
```

### Known limitations

- **The corpus does not yet stress the ranker.** Held-out Top-1 99.2%, one wrong
  suggestion. Cause is not lexical copying (overlap is *lower* than v1); it is
  v2's more distinctive descriptions and only 35 near-misses in 700. Pooled CV
  over all 700 gives 97.0%.
- **Two live extractor defects the corpus exposed**, reported not fixed:
  `extract_tags` misses all 4-digit equipment tags (18 of v2's 40), and
  `FRACTION_RE` reads the digit inside `m2`/`m3` so "40 m3 of 120 m3" parses as
  2.5%. Both are in `extraction/prepass.py` and would move v1's numbers.
- **NO_MATCH rejection is 53.8%** on test — better than v1's 8.3%, still the
  weakest metric.

---

## Previous Modification Area (2026-09-01, D-017/D-018/D-019) — retained for history

**Task:** Adopt the 218-activity Duliajan P6 schedule as a second, versioned
baseline without breaking the existing 120-activity one.
**Date:** 2026-09-01 · **Decisions:** D-017, D-018, D-019

### Current path

```
BASELINE SOURCES
dataset/baseline_schedule.json      120 activities — UNCHANGED, still the default
                                    everywhere (seeder, SCHEDULE_PATH, eval.py)
dataset/baseline_schedule_v2.json   218 activities — moved here from the repo
                                    root. 0 shared activity ids with v1.
        ↓
matching/providers.py               NEW — the only place that reads a baseline
  ScheduleProvider (ABC)              read_activities() | read_baseline()
  JsonScheduleProvider                both shipped files; caches bytes
  PmxmlScheduleProvider               STUB — raises NotImplementedError
  PrimaveraXerScheduleProvider        STUB — raises NotImplementedError
  normalize_activity()                wbs_path list → joined string;
                                      detail optional → ""; predecessors → typed
  normalize_wbs_path/_level()         level NOT inferred when absent
  parse_predecessors()                bare id → FS/lag 0; {activity_id,rel,lag_days}
  validate_activities()               refuses dup/missing id, missing planned
                                      date, wbs_level outside 5/6
  check_ground_truth_agreement()      the D-019 guard
        ↓
matching/schedule_index.py
  ScheduleIndex.from_provider()       NEW
  ScheduleIndex.from_json()           now delegates to JsonScheduleProvider
  ScheduleIndex.baseline              which schedule these records came from
  ActivityRecord.wbs_level/.calendar/.predecessor_links   NEW
        ↓
SERVER
server/db.py
  Activity.wbs_level (Integer, null)  NULL for v1 — absent, not inferred
  Activity.calendar  (String, null)   "6-day" | "7-day"; recorded, not yet used
                                      in date arithmetic
  Activity.detail                     nullable=True (was NOT NULL); still
                                      written as "" so existing DBs are unaffected
  Activity.predecessor_list()         ids only — SIGNATURE UNCHANGED
  Activity.predecessor_links()        NEW — {activity_id, rel, lag_days}
  BaselineVersion (table)             NEW — name, filename, sha256, count,
                                      is_active, source, imported_at
  _ADDED_COLUMNS                      + activities.wbs_level, activities.calendar
server/main.py
  DEFAULT_BASELINE_PATH / BASELINE_V2_PATH
  get_schedule_provider()             NEW
  _activity_from_dict()               NEW — normalised dict → Activity row
  _apply_planned_fields()             NEW — planned fields only, never actuals
  get_active_baseline()               NEW
  _activate_baseline()                NEW — retires the previous row, never deletes
  _seed_schedule_if_empty()           REWRITTEN onto the provider; registers the
                                      version; registers retrospectively for a
                                      pre-existing activities table
  POST /schedule/import               NEW — .json only; 409 without replace=true;
                                      validates before writing; audit row per
                                      activity naming file + sha256
  _matcher_baseline_drift()           NEW — warns when the active baseline is not
                                      the one the matcher links against
  GET /schedule                       + baseline block, wbs_level, calendar,
                                      predecessor_links
server/schemas.py                     + BaselineVersionResponse,
                                      BaselineImportResponse,
                                      PredecessorLinkResponse
        ↓
FRONTEND
frontend/src/types.ts                 + BaselineVersion, PredecessorLink,
                                      wbs_level, calendar, predecessor_links,
                                      ScheduleResponse.baseline
frontend/src/pages/Schedule.tsx       footer prints "baseline <name> @<sha7>";
                                      drawer shows WBS Level and Calendar when
                                      the baseline states them
        ↓
HARNESS
eval.py
  --schedule                          NEW — evaluate against another baseline
  assert_baseline_matches_ground_truth()  NEW — D-019 guard, exits 2
  ground_truth_activity_ids()         NEW
  baseline printed above the headline table
```

### Upstream

```
server startup      → _seed_schedule_if_empty → provider → BaselineVersion row
POST /schedule/import → JsonScheduleProvider → validate → upsert → audit + version
GET  /schedule      → get_active_baseline → ScheduleResponse.baseline
eval.py main()      → MatchingEngine(args.schedule) → guard → scoring
```

### Downstream

```
activities.wbs_level / .calendar   NULL for every v1 row; populated by v2
activities.predecessors            typed JSON; legacy bare ids still readable
baseline_versions                  new table; one active row, history retained
AuditRecord                        new field value "baseline_imported"
GET /schedule                      + baseline{}, + integrity warning on drift
```

### Verification performed

```
python -m pytest -q                  513 passed  (435 before; 78 new tests)
cd frontend && npx vitest run         55 passed
cd frontend && npx tsc --noEmit       clean
python eval.py                        UNCHANGED: auto-link precision 100.0%,
                                      coverage 50.4%, 254 mentions
python eval.py --schedule dataset/baseline_schedule_v2.json
                                      refused, exit 2, 63/141 resolvable (44.7%)
```

### Known limitations

- **The matcher stays on v1.** `get_matching_engine()` is pinned to
  `SCHEDULE_PATH`; the retrieval index, the thresholds and `ground_truth.csv`
  were all built against the 120-activity schedule. Importing v2 changes the
  schedule without changing what ingest can link to. Reported as an integrity
  warning by `_matcher_baseline_drift()` rather than left silent.
- **`ground_truth.csv` still describes v1 only.** 141 distinct ids, 0 of which
  exist in v2. Making v2 the reference baseline means re-labelling 254 mentions
  by hand; D-019's guard is what stops that being skipped by accident.
- **`calendar` is recorded, not applied.** No date arithmetic reads it yet, so a
  6-day activity's variance is still counted in calendar days.
- **`detail` is nullable in the model**, which a database created before this
  change will not pick up (SQLite cannot relax NOT NULL in place). Harmless:
  the value is always written as `""`, never NULL.

---

## Previous Modification Area (2026-09-01, D-015/D-016) — retained for history

**Task:** Fix the two correctness defects in the roll-up write path — `FINDINGS.md`
F1 (defaulted report dates written as asserted finish dates) and F7 (an activity with
`planned_qty == 0` reporting 100% complete).
**Date:** 2026-09-01 · **Decisions:** D-015, D-016

### Current path

```
EXTRACTION
extraction/models.py        + DateBasis{EXPLICIT, RELATIVE_RESOLVED,
                                        DEFAULTED_TO_REPORT_DATE}
                            + ExtractedEvent.reported_date_basis
                                          .asserted_start_basis
                                          .asserted_finish_basis
extraction/prepass.py       + extract_dates_with_basis()  → [(date, DateBasis)]
                              extract_dates_with_flags() / extract_dates() kept
                              as basis-free views over it
extraction/extractor.py     + _basis_at(hints, i)                        [line 54]
                              _prepass_span()  → hints["date_bases"]      [line 264]
                              _merge_event()   → reported_date_basis      [line 304]
                              _bind_assertion_dates() now returns          [line 414]
                                (start, start_basis, finish, finish_basis)
extraction/spreadsheet.py     _row_to_event() → every basis EXPLICIT
        ↓
MATCHING
matching/models.py          + DateAssertion.basis / .is_defaulted
                            + RollupResult.actual_start_basis
                                          .actual_finish_basis
                                          .withheld_finish
                                          .withheld_finish_assertions
                                          .review_reasons
matching/engine.py          RollupAccumulator.add()                       [line 200]
                              acc["dates"] now holds DateAssertions
                              planned_qty <= 0 + uom → no derived %  (D-016)
                            RollupAccumulator.results()                   [line 334]
                              actual_finish written ONLY from a
                              non-defaulted basis (D-015); otherwise
                              withheld_finish + review_reasons
                            + _basis_of()                                 [line 460]
                            + _basis_for()                                [line 473]
        ↓
SERVER
server/db.py                + Activity.actual_start_basis / .actual_finish_basis
                            + LinkedEvent.reported_date_basis
                                         .asserted_start_basis
                                         .asserted_finish_basis
                            + _add_missing_columns()  (additive SQLite migration,
                              called from init_db)
server/main.py              + _basis_value()                              [line 431]
                            + _basis_or_none()                            [line 436]
                            + _queue_defaulted_finish()                   [line 448]
                              _apply_rollup_to_schedule()                 [line 488]
                                writes *_basis; a withheld finish emits an
                                audit row field="actual_finish_withheld"
                                (auto_applied=False) + a ReviewQueueItem
                                reason="defaulted_finish_date"
                            + _resolve_defaulted_finish()                 [line 1325]
                                the confirm|ignore date decision, reached from
                                resolve_review_item()                     [line 1131]
server/schemas.py             ScheduleActivityResponse.actual_start_basis
                                                      .actual_finish_basis
        ↓
FRONTEND
frontend/src/types.ts       + DateBasis; ScheduleActivity.actual_*_basis
frontend/src/pages/Schedule.tsx
                              DateCell(value, solid, basis) — an inferred date
                              renders dotted-underlined with a "~" marker and
                              the reason on hover; asserted dates unchanged
        ↓
HARNESS
eval.py                     _build_event() now binds start/finish assertions
                              through Extractor._bind_assertion_dates, so the
                              roll-up table reflects production date behaviour
                            print_rollup() prints "withheld" and marks inferred
                              dates with "~"
```

### Upstream

```
POST /ingest          → Extractor → MatchingEngine → RollupAccumulator
POST /review/{id}/resolve → _resolve_defaulted_finish (new date-only branch)
GET  /schedule        → ScheduleActivityResponse (now carries both bases)
eval.py               → RollupAccumulator directly, over ground_truth.csv
```

### Downstream

```
Activity.actual_finish       — fewer writes; every remaining one is a date a
                               source named
Activity.actual_*_basis      — new; read by GET /schedule and the Schedule table
AuditRecord                  — new field value "actual_finish_withheld"
ReviewQueueItem              — new reason "defaulted_finish_date"; the review
                               queue now carries date decisions, not only links
schedule export (PMXML/XER)  — inherits the gate: an inferred finish date is not
                               exported, because it is not written
```

### Verification performed

```
python -m pytest -q                 435 passed  (411 before; 24 new tests)
cd frontend && npx vitest run        55 passed
cd frontend && npx tsc --noEmit      clean
python eval.py                       auto-link precision 100.0% (unchanged)
                                     coverage 50.4% (unchanged)
                                     roll-up: 11 identical finish dates → 10
                                     withheld + PIP-PCD-1053 dropped to 0%
/ingest over the whole dataset       38 activities finish, ALL basis EXPLICIT
                                     0 zero-duration activities (was 2)
                                     17 withheld-finish items → planner
```

### Known follow-ups

- `eval.py`'s events are built from `ground_truth.csv`, whose `source_date` is the
  report's date by construction, so **every** date in the harness is
  `DEFAULTED_TO_REPORT_DATE` and every finish in its roll-up table is withheld. The
  `/ingest` path is not affected — the real extractor reads dates out of the DPR line.
  A ground-truth column carrying the in-line date would let the harness show both.
- `FINDINGS.md` F2–F6 remain open. F4 (the write-only alias lexicon) is still the
  largest gap in the data flow; see §3.

---

## Previous Modification Area (2026-08-31, D-014) — retained for history

**Task:** One-time knowledge handoff — reconstruct the project's history from Git,
the source, and the repository's own planning and research documents, and persist it
into `DECISIONS.md` and `FLOW.md`.
**Date:** 2026-08-31 · **Decision:** D-014

### Current path

```
Documentation only — NO runtime execution path was modified.
No source file, schema, route, contract, dependency or config was touched.

DECISIONS.md   + Part 0: H-001 … H-027  (planning era, pre-Git build week,
                 every code commit c16d5f4 → 1de9b4d), each naming its evidence
               + D-014  (why history was backfilled as an H-series, and why the
                 defects found were documented rather than fixed)
               + cross-links from D-001 / D-002 / D-005 into the H-series
               + 2 corrections: the stale symbol `_fill_slots_from_message`,
                 and a warning on D-002's operating point (see H-014)

FLOW.md        + §0   execution flow evolution: V0 (planned) → V1 → V1a → V2
               + §9   application startup: eager vs lazy, cold start, degradation
               + §10  threshold configuration map — four sets, only one is live
               + §11  module contracts incl. failure behaviour and invariants
               + §12  data object lifecycle, incl. objects that go nowhere
               + §13  technical debt, dead code, and two live defects
               + §14  documentation status: current vs dated vs superseded
               + §15  historical handoff state
               + 1 correction: the AgentTurnResponse field list in §4
```

### Upstream

```
None. No module calls into these files at runtime.
Read by: human developers and AI agents before making changes.
```

### Downstream

```
None at runtime.
Process-level: CLAUDE.md's Prime Rule. Additionally, three claims elsewhere in the
repository are now qualified by this task and should be read together with it:
  research/NAVIS_TECHNICAL_AUDIT.md  threshold attribution  → FLOW.md §10, H-014
  research/EVIDENCE.md               "100% auto-link precision" → FLOW.md §10
  ARCHITECTURE.md §2, §7             dated / partly overtaken  → FLOW.md §14
```

### Files currently modified

```
MODIFIED:  DECISIONS.md   645 → ~2,050 lines
MODIFIED:  FLOW.md        438 → ~1,250 lines
UNCHANGED: CLAUDE.md      (its rules already cover this workflow — D-013; nothing
                           was missing, so nothing was added)
UNCHANGED: all source, all tests, all data, all config
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
python -m pytest -q            → 264 passed (40.9 s)
cd frontend && npx vitest run  →  55 passed (4 files)
cd frontend && npx tsc --noEmit → clean, exit 0
git status                     → only DECISIONS.md and FLOW.md modified
Git archaeology                → git log --all --stat, per-commit diffs, and
                                 git log -S on MATCHING_THRESHOLDS and the
                                 Thresholds field defaults
Symbol verification            → every file, function, class, constant, route and
                                 line number named in the new sections confirmed
                                 present by reading the source or by grep
Absence verification           → CPM/topological/projected/cascade, photo/vision/
                                 OCR, gantt, recharts imports, AliasLexicon reads
                                 in matching/, MemoryCache reads, and
                                 full_key_index reads all confirmed ABSENT
```

### New findings this task produced (none previously recorded anywhere)

```
H-014   four threshold sets; the live server is NOT at the headline operating point
§13.1   LIVE BUG — /reconcile "New activity" and "Reject" send action names the
        server rejects with HTTP 400; only "Confirm" works, and `reassign` has no UI
§13.2   .csv is an accepted upload type behind an unimplemented extractor stub
§13.4   the REJECTED branch in ingest_file is unreachable (Decision has 3 members)
§13.5   validate_actual_start warns on every predecessor unconditionally
§13.6   MemoryCache and ScheduleIndex.full_key_index are dead
§13.7   recharts is a dead dependency
```

### Known open items (not addressed by this task)

`Audit-1.md`'s eleven findings remain open, and every item in §13 was deliberately
left in place (D-014). The recommended order of work is in **§15 → Planned next
step**; the demo-blocking one is **§13.1**.

### Addendum — 2026-08-31, second commit

`FINDINGS.md` (a second independent review of the pushed branch) was added to the
repository in a follow-up commit. Documentation-only; no code changed.

```
NEW:       FINDINGS.md      F1-F7 + a ranked last-day order of work
MODIFIED:  CLAUDE.md        one row in Related Documentation
MODIFIED:  FLOW.md          §14 doc-status row; §13.10 (below)
```

All five of its line citations were verified against the source before it was
committed (`matching/engine.py:296`, `:330`; `server/main.py:1301`;
`research/graphs/make_graphs.py:253`, `:321`) — all correct.

Two cross-checks the next agent should carry forward:

- **Its F7 diagnosis was wrong even though its observation was right.** See §13.10.
  Applying the fix as written would have made every milestone un-completable; D-016
  uses the unit of measure to separate a missing planned quantity from a milestone.
  **F1 and F7 are both fixed as of 2026-09-01 (D-015, D-016).**
- **Its numbers are the eval operating point**, taken from
  `research/data/eval_output.txt` (0.775/0.5/0.03 on gold mentions), not the
  server's 0.70/0.40/0.03. Its funnel `254 → 128 → 76 → 11` is therefore an
  `eval.py` funnel; the seeded database's figures will differ. See §10 and H-014.
  This does not weaken F1 — the `max(acc["dates"])` fallback at `engine.py:330` is
  threshold-independent — but the count "eleven" is.

---

## Previous Modification Area (2026-08-30, D-013) — retained for history

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
