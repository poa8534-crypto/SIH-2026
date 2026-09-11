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
| frappe-gantt chart | library never adopted; a hand-rolled Gantt was built later in `GanttChart.tsx`, reached from `Schedule.tsx` via the Gantt Chart toggle. No CPM redraw — it renders baseline vs actual, it does not recalculate. | H-004, D-107 |
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
| `8928df7` | `backend/extraction/textio.py :: read_text()` replaces `errors="replace"` with `utf-8-sig → cp1252 → latin-1` | D-010 |

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
    │  HTTP (JSON / multipart), CORS-allowed origins in backend/server/main.py:145
    ▼
backend/server/main.py  (FastAPI, 17 routes)
    │
    ├── backend/extraction/   heterogeneous input  →  ExtractedEvent[]
    ├── backend/matching/     ExtractedEvent       →  LinkDecision  →  RollupResult
    └── backend/server/db.py  SQLAlchemy → SQLite (dataset/epc_progress.db)
```

Two independent ingestion surfaces produce the same `ExtractedEvent` contract:

| Surface | Entry point | Producer |
|---|---|---|
| Document upload | `POST /ingest` | `backend/extraction/extractor.py` |
| Conversational agent | `POST /agent/turn` | `backend/server/agent_slots.py` + `backend/server/main.py::_create_event_from_slots` |

---

## 2. Primary path — document ingestion

The main pipeline. A planner uploads a DPR or a discipline spreadsheet.

```
frontend/src/pages/Ingest.tsx
    ↓  user selects file
frontend/src/lib/api.ts :: api.ingestFile(file)
    ↓  POST /ingest  (multipart/form-data)
backend/server/main.py :: ingest_file()                                    [line 769]
    │
    ├─ Path(filename).suffix  →  reject unless .txt .xlsx .csv .md .log   [line 701]
    ├─ sha256 of content  →  duplicate upload ignored entirely
    ├─ write to dataset/uploads/
    ├─ create Job row (status="processing")
    │
    ├─ EXTRACTION ────────────────────────────────────────────────
    │  backend/extraction/extractor.py :: Extractor(schedule_path=SCHEDULE_PATH)
    │      ↓
    │  Extractor.extract(path)                                    [line 99]
    │      ├─ .txt/.md/.log → _extract_text()                     [line 120]
    │      │       ↓
    │      │   backend/extraction/textio.py :: read_text()   (utf-8-sig → cp1252 → latin-1)
    │      │       ↓
    │      │   _extract_report_date()  →  _parse_text_spans()
    │      │       ↓
    │      │   _prepass_span()  per span
    │      │       ↓  backend/extraction/prepass.py
    │      │       extract_tags() · extract_dates_with_basis() · extract_quantities()
    │      │       extract_percentages() · extract_fractions()
    │      │       infer_discipline() · infer_status() · is_forecast_language()
    │      │       ↓
    │      │   [optional] backend/extraction/llm_backend.py :: LLMBackend.extract_events()
    │      │       (skipped entirely when EXTRACTION_PROVIDER=rules — the default)
    │      │       ↓
    │      │   _merge_event()  →  _bind_assertion_dates()         [line 304, 414]
    │      │       returns (start, start_basis, finish, finish_basis).
    │      │       A claim with no date in the span is carried by the report
    │      │       header's date and marked DEFAULTED_TO_REPORT_DATE (D-015).
    │      │
    │      └─ .xlsx → _extract_spreadsheet()                      [line 502]
    │              ↓
    │          backend/extraction/spreadsheet.py :: SpreadsheetParser.parse()
    │              _detect_headers() → _read_row() → _is_summary_row() → _row_to_event()
    │      ↓
    │  ExtractionResult.events : list[ExtractedEvent]
    │
    ├─ MATCHING ──────────────────────────────────────────────────
    │  backend/server/main.py :: get_matching_engine()      (module-level singleton)
    │      ↓
    │  backend/matching/engine.py :: MatchingEngine.match_events(events)
    │      ↓  per event
    │  MatchingEngine.match_event(event, i)                       [line 43]
    │      │
    │      ├─ backend/matching/retrieval.py :: HybridRetriever.retrieve(raw_text, tags)
    │      │      ├─ tag_channel()    exact/near-exact line-number match   (weight 1.0)
    │      │      ├─ bm25_channel()   rank_bm25 over tokenised descriptions (weight 0.7)
    │      │      ├─ dense_channel()  MiniLMEmbedder cosine, NumPy dot      (weight 0.7)
    │      │      └─ RRF fusion (RRF_K=60) → top TOP_K=20 candidate indices
    │      │
    │      ├─ per candidate: backend/matching/features.py :: compute_features()
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
    │  backend/matching/engine.py :: RollupAccumulator(get_matching_engine())
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
    │  backend/server/main.py :: _apply_rollup_to_schedule(db, results, event_index, ...)
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
backend/server/main.py :: get_review_queue()                               [line 1089]
    ↓
planner chooses confirm | reassign | create | ignore
    │  Reconcile.tsx maps three buttons onto those four actions (D-073):
    │    Confirm Match  → 'confirm'  when the selected candidate is
    │                     item.activity_id (which is what confirm commits),
    │                     'reassign' + activity_id when it differs, and always
    │                     'confirm' on a 'defaulted_finish_date' item
    │    Mark New       → 'create' + new_activity_id (NEW-<DISC>-<item.id[0:6]>)
    │                     + new_description
    │    Reject         → 'ignore', on the second armed press
    ↓  api.resolveReview(itemId, body)    POST /review/{item_id}/resolve
backend/server/main.py :: resolve_review_item()                            [line 1131]
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
> all three sites above. **Nothing in `backend/matching/` reads that table.** The correction is
> persisted but never influences a future match. This is the single most important gap
> in the current data flow, and any work on retrieval should close it.

---

## 4. Conversational agent path

```
frontend/src/pages/Field.tsx
    ↓  frontend/src/hooks/useSpeech.ts   (browser SpeechRecognition, typed fallback)
    ↓  POST /agent/turn
backend/server/main.py :: agent_turn()                                     [line 2213]
    │
    ├─ _context_from_request(req.context)  →  _apply_context(slots, context)   [2483,2246]
    ├─ _fill_slots(slots, req.message, context, db)                [line 2254 → 2378]
    │      ↓  backend/server/agent_slots.py  — pure, table-tested parsers
    │      parse discipline · location · status · date · quantity ("6 out of 18")
    │      ↓  [optional] backend/server/agent_llm.py  — bounded by NAVIS_LLM_TIMEOUT_SECONDS,
    │         one try, no retry; every value re-validated by the same parsers
    │         interpret() → _validate(outputs, message)            [agent_llm.py]
    │           · >1 event for 1 span      → whole payload refused, rules only
    │           · discipline               → must be in DISCIPLINE_VALUES
    │           · status                   → re-parsed by parse_status()
    │           · tags                     → re-derived by parse_tags()  (D-006)
    │           · activity_description     → _validate_description(cand, message)
    │               1 collapse whitespace; reject control/format chars
    │               2 reject markup, JSON punctuation, instruction-shaped text
    │               3 reject if ACTIVITY_ID_RE matches            (D-006)
    │               4 truncate to 160 chars on a word boundary
    │               5 reject unless >=75% of tokenize(desc) appear in
    │                 tokenize(message)                            (D-065)
    │         a suggestion only fills a slot the parsers left empty; each one it
    │         fills is named in slots.llm_suggested_fields
    ├─ _merge_quantity(slots, parsed)                              [line 2466]
    ├─ _next_missing(slots)   →  ask for one slot at a time        [line 2527]
    │      (after 2 failed attempts on a slot, move on and leave it for the planner)
    │
    └─ when all required slots are filled:
           _match_slots(slots, session_id)                         [line 2563]
               ↓  runs the REAL matching engine (section 2) on the composed sentence
               ↓  the engine reads slots.description / tags / date / quantity /
               ↓  discipline / status — NEVER slots.activity_description
               ↓  returns proposal — activity, confidence, outcome — WITHOUT writing
               ↓  overwrites activity_description with the matched activity's own
               ↓  text, and drops "activity_description" from llm_suggested_fields
               ↓  because the value is now the baseline's, not the model's
           ↓
       supervisor reviews the structured card
           ↓  second call with confirm: true
       _create_event_from_slots(slots, session_id, db)             [line 2607]
           → LinkedEvent + ReviewQueueItem
           → does NOT touch actual_start / actual_finish
    ↓
AgentTurnResponse (backend/server/schemas.py) {
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
GET /schedule                backend/server/main.py :: get_schedule()            [1316]
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
MODULE: backend/extraction/

Called by:   backend/server/main.py :: ingest_file()
             backend/eval.py
Consumes:    file paths (.txt .md .log .xlsx .csv), dataset/baseline_schedule.json
Calls:       backend/extraction/textio.py    (explicit decode chain)
             backend/extraction/prepass.py   (deterministic regex)
             backend/extraction/spreadsheet.py
             backend/extraction/llm_backend.py  (only when EXTRACTION_PROVIDER != rules)
Produces:    ExtractionResult { events: list[ExtractedEvent], warnings, errors }
Downstream:  backend/matching/engine.py
```

```
MODULE: backend/matching/

Called by:   backend/server/main.py :: ingest_file(), _match_slots()
             backend/eval.py, research/data/*.py
Consumes:    ExtractedEvent, dataset/baseline_schedule.json (via ScheduleIndex.from_json)
Calls:       backend/matching/retrieval.py    HybridRetriever (tag + BM25 + dense → RRF)
             backend/matching/features.py     compute_features → final_score → blend_with_line_lock
             backend/matching/schedule_index.py  ScheduleIndex (by_id, line_index, bm25, records)
             backend/matching/textutils.py    parse_tag, tag_variants, normalize_uom, tokenize
Produces:    LinkDecision, and via RollupAccumulator → RollupResult
Downstream:  backend/server/main.py persistence, review queue, audit trail, API responses
Reads:       NOTHING from the database — matching is pure over the baseline JSON.
             (This is why the alias lexicon is not consulted; see Audit-1 F-03.)
```

```
MODULE: backend/server/

Entry:       backend/server/main.py (FastAPI app, 17 routes)
Calls:       backend/extraction/, backend/matching/, backend/server/db.py, backend/server/schemas.py,
             backend/server/agent_slots.py, backend/server/agent_llm.py, backend/server/demo.py
Persists:    activities · jobs · linked_events · audit_records · review_queue
             alias_lexicon · conversation_turns · memory_cache
Produces:    Pydantic response models from backend/server/schemas.py
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
| `ExtractedEvent` | `backend/extraction/models.py` | `backend/extraction/` | `backend/matching/engine.py` |
| `Provenance` | `backend/extraction/models.py` | `backend/extraction/` | audit trail |
| `LinkCandidate` / `FeatureVector` | `backend/matching/models.py` | `backend/matching/features.py` | `decide_outcome`, UI |
| `LinkDecision` | `backend/matching/models.py` | `MatchingEngine.match_event` | `backend/server/main.py`, `backend/eval.py` |
| `DateAssertion` / `RollupResult` | `backend/matching/models.py` | `RollupAccumulator` | `_apply_rollup_to_schedule` |
| `BaselineVersion` / `PredecessorLink` | `backend/matching/providers.py` | `JsonScheduleProvider` | `ScheduleIndex` · `_seed_schedule_if_empty` · `POST /schedule/import` · `GET /schedule` |
| `DateBasis` | `backend/extraction/models.py` | `prepass` · `Extractor` · `SpreadsheetParser` | `RollupAccumulator.results` (gate) · `Activity.*_basis` · `GET /schedule` · `DateCell` |
| `SlotState` | `backend/server/agent_slots.py` | `_fill_slots` | `_match_slots` |
| SQLAlchemy models | `backend/server/db.py` | `backend/server/main.py` | persistence |
| Response models | `backend/server/schemas.py` | `backend/server/main.py` | `frontend/src/types.ts` |

---

## 8. Verification entry points

```
python -m pytest -q                  264 tests
  ├─ backend/extraction/test_extractor.py · test_llm_guards.py
  ├─ backend/matching/test_matching.py
  └─ backend/server/test_server.py · test_agent.py · test_agent_llm.py  (conftest.py fixtures)

cd frontend && npx vitest run          55 tests
  └─ src/test/{field,reconcile,speech,states}.test.tsx

python backend/eval.py                       matching quality over dataset/ground_truth.csv
python backend/scripts/healthcheck.py        end-to-end server health
python backend/scripts/reset_demo.py         rebuild DB from dataset/ (schema-drift aware)
research/data/*.py                   8 reproducible experiment harnesses
```

---

---

## 9. Application startup — what loads, when, and in what order

Two processes. Neither serves the other; they are joined only by CORS (H-021).

### Backend

```
python -m uvicorn server.main:app --app-dir backend --reload
    ↓
IMPORT TIME (backend/server/main.py)
    ├─ sys.path.insert(0, <repo root>)              main.py:46 — lets `python backend/server/main.py` work
    ├─ from .db import ...                          backend/server/db.py imported
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
    │      backend/server/demo.py :: _schema_matches() exists.
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
  before a demo by ingesting anything, or by running `backend/scripts/healthcheck.py`.
- A machine with no cached model and no network still starts, still serves, and still
  matches — with a hashed-trigram embedder and materially worse dense recall, and
  **nothing in the API says so**. The only routine signal is the line `backend/eval.py` prints:
  `dense: sentence-transformers all-MiniLM-L6-v2 (local, offline)`.
- The engine holds `dataset/baseline_schedule.json` in memory and **never re-reads
  it**. Editing that file requires a server restart; editing the `activities` table
  does not affect matching at all, because `backend/matching/` never reads the database.

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
python backend/scripts/seed.py            rebuilds the DB in-process, no server needed;
                                  uses the same code paths as POST /ingest
python backend/scripts/reset_demo.py      clears ROWS (not the file) so it can run while the
                                  server is up; rebuilds the schema first if any
                                  model column is missing (backend/server/demo.py::_schema_matches)
python backend/scripts/healthcheck.py     needs the server up; probes 8 endpoints
                                  non-destructively (re-uploads a known-duplicate
                                  file; probes a 404 review id)
backend/scripts/demo_reset.ps1            Windows demo wrapper
python backend/eval.py                    builds its OWN MatchingEngine — never touches the DB
```

---

## 10. Threshold configuration map — read this before quoting a metric

The single most confusing thing in this codebase: **four different threshold sets
exist and they are not interchangeable.** Full reasoning in `DECISIONS.md` H-014.

```
backend/matching/models.py :: Thresholds        DEFAULTS  0.78 / 0.42 / 0.06
    │   used by any MatchingEngine(...) built without explicit thresholds
    ├──► research/data/ablation.py
    ├──► research/data/bm25gate.py
    ├──► research/data/disagree.py
    └──► research/data/hypothesis.py

backend/server/main.py:237 :: MATCHING_THRESHOLDS         0.70 / 0.40 / 0.03   ◄── THE LIVE SERVER
    │   calibrated on EXTRACTION SPANS (the real pipeline)
    │   measured: 96.6% auto-link precision, 48% coverage
    └──► POST /ingest · POST /agent/turn · backend/scripts/seed.py · backend/scripts/reset_demo.py
         → therefore: the demo database, every screen, every audit row

backend/eval.py :: calibrate() grid search                0.775 / 0.5 / 0.03   ◄── THE HEADLINE NUMBER
    │   calibrated on GROUND-TRUTH MENTIONS ("extraction alignment noise is
    │   deliberately excluded" — backend/eval.py docstring)
    │   measured: 100.0% auto-link precision, 50.4% coverage, 0 wrong AUTO_LINKs
    └──► research/data/eval_output.txt · EVIDENCE.md · the slide

research/data/densefix.py, weights.py             0.775 / 0.5 / 0.03  (hard-coded to match backend/eval.py)
backend/matching/test_matching.py                         0.8   / 0.45 / 0.06 (one unit test)
```

**Rules for anyone quoting a number:**

1. `100% auto-link precision` describes `backend/eval.py` at 0.775 on gold mentions. Say so.
2. The running demo is at 0.70. Its measured precision is 96.6%, not 100%.
3. Absolute coverage figures from `ablation.py` / `bm25gate.py` / `disagree.py` /
   `hypothesis.py` use the 0.78 defaults and are **not** comparable to
   `eval_output.txt`. Their arm-vs-arm *comparisons* are valid, which is all they claim.
4. Changing any of these requires re-running `python backend/eval.py` and recording the
   movement in `DECISIONS.md` (`CLAUDE.md`, Verification section).

---

## 11. Module contracts

The formal contract for each module boundary. §6 gives the call graph; this gives the
obligations.

```
MODULE: backend/extraction/

Purpose            Turn heterogeneous source documents into a uniform ExtractedEvent
                   stream with mandatory provenance. It DECIDES NOTHING about the
                   schedule — it does not know what an activity_id means.
Called by          backend/server/main.py :: ingest_file()  ·  backend/server/demo.py :: reset_demo()
                   (backend/eval.py uses backend/extraction/prepass.py only, not Extractor)
Inputs             a file path (.txt .md .log .xlsx .csv) + optionally
                   dataset/baseline_schedule.json for context (now unused, H-019)
Outputs            ExtractionResult { events: list[ExtractedEvent], errors, warnings }
Calls              textio.read_text · prepass.* · spreadsheet.SpreadsheetParser
                   llm_backend.make_backend_from_env  (NullBackend unless opted in)
Downstream         backend/matching/engine.py
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
MODULE: backend/matching/

Purpose            Entity resolution: resolve one ExtractedEvent to one L5/L6 node,
                   with a calibrated confidence and an auditable reason — then
                   aggregate many events into one node's progress.
Called by          backend/server/main.py :: ingest_file(), _match_slots()
                   backend/eval.py  ·  research/data/*.py
Inputs             ExtractedEvent (duck-typed — matching never imports extraction's
                   models, only reads attributes), dataset/baseline_schedule.json
Outputs            LinkDecision per event;  RollupResult per activity
Calls              retrieval.HybridRetriever · features.compute_features/final_score/
                   blend_with_line_lock · schedule_index.ScheduleIndex · textutils
Downstream         backend/server/main.py persistence · review queue · audit trail · backend/eval.py
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
MODULE: backend/server/

Purpose            HTTP surface, persistence, the audit trail, and the ONLY place a
                   schedule field is ever mutated.
Entry              backend/server/main.py — FastAPI app, 17 routes
Calls              backend/extraction/ · backend/matching/ · db.py · schemas.py · agent_slots.py ·
                   agent_llm.py · demo.py
Persists           activities · jobs · linked_events · audit_records · review_queue ·
                   alias_lexicon · conversation_turns · (memory_cache — declared,
                   never written; see §13)
Outputs            Pydantic response models from backend/server/schemas.py
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
Resolve vocabulary src/lib/api.ts :: resolveReview is typed to the server's four
                   actions: confirm / reassign / create / ignore (D-073).
                   Reconcile.tsx picks between them; see §13, item 1.
```

```
BOUNDARY: backend/eval.py → backend/matching/

backend/eval.py deliberately bypasses backend/extraction/. It rebuilds ExtractedEvents from
ground_truth.csv mentions using the SAME prepass functions the extractor uses
(extract_tags, extract_quantities, extract_percentages, extract_fractions,
infer_discipline, infer_status), so that what is measured is the MATCHER, not the
extractor's span segmentation. That separation is why backend/eval.py's operating point
differs from the server's — see §10.
```

---

## 12. Data object lifecycle

```
a file on disk  /  a supervisor's sentence
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ExtractedEvent                       backend/extraction/models.py                   │
│ created:  Extractor._merge_event()   |  SpreadsheetParser._row_to_event()   │
│           backend/server/main.py::_create_event_from_slots()  (agent path)          │
│           backend/eval.py::_build_event()                     (evaluation path)     │
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
│  reasoning        own candidates in backend/server/main.py                          │
└─────────────────────────────────────────────────────────────────────────────┘
        │  MatchingEngine.match_event()
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LinkCandidate[]  (≤ 20)              backend/matching/models.py                     │
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
│ LinkDecision                          backend/matching/models.py                    │
│ outcome ∈ {AUTO_LINK, REVIEW, NEW_ACTIVITY}   (Decision.REJECTED exists in   │
│           backend/server/db.py's comment vocabulary but NOT in the Decision enum)    │
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
        │            │ Activity  (backend/server/db.py)   MUTATED HERE   │
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
                                                                 Nothing in backend/matching/
                                                                 ever reads it.
                                                                 (Audit-1 F-03)
```

**The agent path produces the same objects by a different route:**

```
SlotState (backend/server/schemas.py)  ──_match_slots()──►  a synthetic sentence
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
| `MemoryCache` (`backend/server/db.py`) | table declared, imported into `main.py`, **never read or written**. Memory queries are computed live on every request. |
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

### 1. CLOSED (D-073) — the planner resolve actions now speak the server's vocabulary

The frontend and the server used to disagree on the action vocabulary of
`POST /review/{item_id}/resolve`. Two actions 400'd on every press, and a third
wrote the wrong link silently. The mapping the screen sends today:

| Server accepts (`backend/server/main.py`, `ResolveRequest`) | Frontend sends (`frontend/src/pages/Reconcile.tsx`) |
|---|---|
| `confirm` | `handleConfirm`, when the chosen candidate **is** `item.activity_id` — body carries no `activity_id`, because confirm never reads one |
| `reassign` | `handleConfirm`, when the chosen candidate **differs** — `{action: 'reassign', activity_id}` |
| `create` (requires `new_activity_id` **and** `new_description`) | `handleNew` — id derived as `NEW-<DISC>-<item.id[0:6]>`, description trimmed |
| `ignore` | `handleReject`, on the second (armed) press |

```
Reconcile.tsx :: handleConfirm()  → candidate === item.activity_id
                                      ? { action: 'confirm' }
                                      : { action: 'reassign', activity_id }
                                    reason 'defaulted_finish_date' always confirms
Reconcile.tsx :: handleNew()      → { action: 'create', new_activity_id, new_description }
Reconcile.tsx :: handleReject()   → { action: 'ignore' }
        ↓ api.ts :: resolveReview — passes the body through verbatim
        ↓ POST /review/{id}/resolve
        ↓ resolve_review_item()  → the matching branch, never the 400 fall-through
```

The worst of the three was `confirm`: the server's confirm branch commits
`item.activity_id` and ignores `req.activity_id`, so picking candidate 2 and
pressing Confirm linked the event to candidate 1 and wrote an audit row and an
alias entry naming it. A visible 400 is recoverable; that was not.

**Why it survived:** no test covered a frontend request body against the server's
action set. `backend/server/test_server.py` exercises `confirm`, `reassign`, `create` and
`ignore` against the API directly; `frontend/src/test/reconcile.test.tsx` covered
only the clarification flow. It now also asserts all four bodies, plus the
`defaulted_finish_date` case where a differing candidate must NOT become a
reassign.

**Effect on the demo:** the "New activity" and "Reject" buttons on the reconciliation
screen fail. Only "Confirm" works. `reassign`, which the server supports and which is
the strongest training signal for `_upsert_alias`, **has no UI at all**.

### 2. LIVE BUG (latent) — `.csv` is accepted for upload and cannot be parsed

`POST /ingest` permits `.csv` (`backend/server/main.py`, suffix allow-list), and
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

`backend/matching/engine.py:155–169`, physically inside `_rationale()` **after its `return`**
on line 153, indented as methods of a class that is not there. Unreachable, and it
duplicates the two live `MatchingEngine` helpers at lines 88–99.

This is the same `_dense_cos` that `Audit-1.md` F-01 says needs fixing (+2.5 pts Top-1,
measured in `research/data/densefix.json`). **Anyone fixing F-01 must edit the copy at
line 88, not the one at line 157.** Deleting the dead block first would remove the
trap.

### 4. Dead code — the unreachable `REJECTED` branch in `ingest_file`

`backend/server/main.py:838`, `else:  # REJECTED — preserve event + decision in history only`.
`matching.models.Decision` has exactly three members — `AUTO_LINK`, `REVIEW`,
`NEW_ACTIVITY` — and the preceding `if/elif/elif` covers all three. The branch can
never run, so **no `field="event_rejected"` audit row can ever be written by ingest.**

`REJECTED` also appears as a fourth value in `backend/server/db.py`'s `decision` column comment,
in `_create_event_from_slots`'s reason map, and in a `backend/server/test_agent.py` assertion —
all of them describing a state the enum does not have.

### 5. Incomplete implementation — the predecessor integrity warning is unconditional

`backend/server/db.py :: validate_actual_start()` appends *"Predecessor {id} has not started
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

- **`MemoryCache`** (`backend/server/db.py`) — table declared, created by `create_all`,
  imported into `backend/server/main.py`, and **never read or written anywhere**. Memory
  queries are recomputed on every request. Either wire it or drop it; as it stands it
  implies a caching layer that does not exist.
- **`ScheduleIndex.full_key_index`** (`backend/matching/schedule_index.py`) — built on every
  index construction, **read by nothing**. `line_index` carries the tag channel.

### 7. Dead dependency

`recharts` is in `frontend/package.json` and is **imported by no file** in
`frontend/src`. It was the charting library for the Gantt/analytics visuals that were
never built (H-004).

### 8. Hard-coded demo constants

| Constant | Where | Risk |
|---|---|---|
| `DATA_DATE = date(2026, 9, 15)` | `backend/server/main.py:179` — *"Latest date in our dataset"* | Every variance calculation, the `Actual Start` hard block, and the planned dates of planner-created activities are pinned to the seeded corpus. Ingesting anything dated after 2026-09-15 raises `IntegrityError` on the start write. |
| `reference_date = date(2026, 8, 15)` | `Extractor.__init__` — *"midpoint of our DPR range"* | Resolves year-less and relative dates. Wrong corpus → wrong year on every bare "12 Sep". |
| 12 delay keywords | `_compute_delay_reasons` | The entire delay taxonomy. See `Audit-1.md` F-04/F-05. |
| CORS origin list + regex | `backend/server/main.py:147–176` | Deliberately permissive for demo hosts (H-021). Not a production posture — and there is no authentication behind it (`Audit-1.md` F-11). |

### 9. Stale comments and prompts

- `backend/extraction/llm_backend.py :: SYSTEM_PROMPT` rule 3 — *"Use the schedule context to
  infer discipline and status"*. No schedule context has been sent since `ab137ee`
  (H-019). Harmless, but it instructs the model to use something it never receives.
- `backend/server/main.py` module docstring — *"POST /schedule/export emit PMXML (XER as
  stretch)"*. XER shipped.
- `backend/server/db.py :: _now()` uses the deprecated `datetime.utcnow()`, producing ~17,600
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
bottom row, so `backend/matching/test_matching.py::TestMilestoneNode` builds a synthetic
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
| `ARCHITECTURE.md` §7 (Known Limitations) | **MOSTLY CURRENT, partly overtaken** | Names `_fill_slots_from_message`, a symbol that no longer exists (it is `_fill_slots` + `backend/server/agent_slots.py`). Its "asks for three things only" paragraph was superseded within the same document by "the agent asks for what it needs". |
| `research/NAVIS_TECHNICAL_AUDIT.md` | **CURRENT with one caveat** | Attributes `tau_high=0.775` to `backend/matching/models.py` and to the shipped system. Both are loose — see §10 and H-014. |
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
`datetime.utcnow()` deprecations from `backend/server/db.py :: _now()`).

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
- `backend/scripts/reset_demo.py` rebuilding the schema on drift instead of a migration —
  deliberate, since everything in that database is regenerable (D-012).
- Two calibrated operating points instead of one (H-014).

### Planned next step (recommended order)
1. ~~**Fix §13.1.**~~ Done in D-073: `Reconcile.tsx`/`api.ts` now send the
   server's four actions and five tests exercise the request bodies against them.
   What remains is optional — a UI field so the planner names the new activity
   instead of accepting the derived `NEW-<DISC>-<item.id[0:6]>` id.
2. **Resolve H-014 consciously.** Either align `MATCHING_THRESHOLDS` with the
   calibrated point and re-run `backend/eval.py`, or document the two points everywhere a
   number is quoted. Do not leave it implicit.
3. **Delete the dead `_dense_cos` at `backend/matching/engine.py:155–169`, then apply
   `Audit-1.md` F-01** to the live copy at line 88. Re-run `backend/eval.py` and record the
   movement in `DECISIONS.md`. This is the largest measured win available (+2.5 pts
   Top-1, +1.6 pts coverage, auto-precision unchanged).
4. **Close the alias-lexicon loop (`Audit-1.md` F-03).** It converts a write-only
   table into the PS's stated learning claim. Note the constraint: `backend/matching/` reads
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
| **Evaluation** | Working and reproducible: `backend/eval.py` plus 8 harnesses in `research/data/`. Ground truth is partly circular and the mitigation test was never run (H-013). |
| **Documentation** | Current for `CLAUDE.md` / `DECISIONS.md` / `FLOW.md` / `Audit-1.md` / `research/`. Dated for `ARCHITECTURE.md` and the build plans (§14). |

### Environment assumptions the next agent should verify first

```
python -m pytest -q                   expect: 264 passed
cd frontend && npx vitest run         expect: 55 passed
python backend/eval.py | head -20             expect the line:
    dense: sentence-transformers all-MiniLM-L6-v2 (local, offline)
    ↑ if this says anything else, the hashed fallback is active (H-010) and
      NO metric from that run is comparable to a published one.
```

---

## Current Modification Area

**Task:** NAVIS deployed to Render as two connected services — a static site for the SPA and a Python web service for the API. Fixed the start command D-112 invalidated, the frontend's API-base fallback, the HTTP-only CORS policy, the empty deployed database and SPA deep links. No schema, threshold, matcher or metric changed.
**Date:** 2026-09-12 · **Decision:** D-113

```
DEPLOYED TOPOLOGY — WHAT RUNS WHERE                              (D-113)

  browser
     |
     |  GET /  and every client-side route
     v
  ┌──────────────────────────────────────────┐
  │ STATIC SITE   navis-yuvf.onrender.com    │   Render CDN, no server
  │   rootDir      frontend/                 │
  │   build        npm install; npm run build│
  │   publish      frontend/dist/            │
  │   built with   VITE_API_URL=<api origin> │ <-- the ONLY link between them,
  └──────────────────────────────────────────┘     inlined by Vite at BUILD time
     |
     |  fetch(`${getBaseUrl()}${endpoint}`)       frontend/src/lib/api.ts:77
     |  cross-origin, preflighted
     v
  ┌──────────────────────────────────────────┐
  │ WEB SERVICE   navis-api.onrender.com     │   uvicorn, 1 instance
  │   build        bash render-build.sh      │
  │   start        python -m uvicorn         │
  │                  server.main:app         │
  │                  --app-dir backend       │ <-- D-112's anchor. Without it:
  │                  --host 0.0.0.0          │     ModuleNotFoundError: 'server'
  │                  --port $PORT            │
  │   health       GET /health               │
  └──────────────────────────────────────────┘


HOW THE FRONTEND DECIDES WHERE THE API IS      frontend/src/lib/api.ts:72

  getBaseUrl()
    |
    +-- 1. import.meta.env.VITE_API_URL set?
    |        -> return it, trailing slashes stripped
    |        ......... the deployed split. Set on the STATIC SITE only;
    |                  setting it on the API service does nothing at all.
    |
    +-- 2. isDevelopmentHost(window.location.hostname)?      api.ts:56
    |        localhost | 127.0.0.1 | [::1] | *.local
    |        | 192.168.x.x | 10.x.x.x | 172.16-31.x.x
    |        -> return `http://${hostname}:8000`
    |        ......... run_navis.bat, and the two-device LAN demo: the phone
    |                  derives the laptop's IP from the page it loaded.
    |
    +-- 3. otherwise
             -> return window.location.origin
             ......... the unified Dockerfile build (SERVE_FRONTEND=1), where
                       one FastAPI process serves both the SPA and the API.

  Case 3 was previously `http://${hostname}:8000` unconditionally, which on any
  hosted HTTPS origin is a mixed-content request to a closed port: blocked by
  the browser before it is even refused by the network.

  The host set in case 2 is deliberately the same one the backend's CORS regex
  allows. If these two disagree the URL is right and the browser blocks it.


WHAT THE BROWSER'S PREFLIGHT HITS              backend/server/main.py:255

  OPTIONS <any non-GET>
    -> CORSMiddleware                          main.py:298
         allow_origins        CORS_ALLOWED_ORIGINS      main.py:261
                                localhost:5173, 127.0.0.1:5173
                                + NAVIS_ALLOWED_ORIGINS env, comma-separated
         allow_origin_regex   CORS_ALLOWED_ORIGIN_REGEX main.py:274
                                http://  localhost | 127.0.0.1
                                         | 192.168/16 | 10/8 | 172.16/12
                                https:// [a-z0-9-]+.onrender.com   <-- D-113
         allow_credentials    False  (no cookie or session auth anywhere)

  Starlette matches the regex with fullmatch, so
  http://evil.onrender.com.attacker.net is refused, not matched as a prefix.


BUILD-TIME WORK THAT RUNTIME DEPENDS ON        render-build.sh

  Render builds and runs a native service in the SAME directory
  (/opt/render/project/src), so everything below survives into the instance.

  1. pip install torch==2.2.2 --index-url download.pytorch.org/whl/cpu
         PyPI's Linux torch bundles ~2.5 GB of nvidia-* CUDA wheels this
         service can never use. Installed first so requirements.txt resolves
         against it.
  2. pip install -r requirements.txt
  3. python backend/scripts/seed.py
         |
         +-- init_db()                          backend/server/db.py
         +-- _seed_schedule_if_empty()          backend/server/main.py:332
         |     120 activities from dataset/baseline_schedule.json
         +-- ingest_one() over dataset/*.txt, *.xlsx   backend/server/demo.py
         |     266 events, 75 auto-linked, 198 review items, 141 audit records
         +-- writes dataset/epc_progress.db     (gitignored; absent on a clone)
         +-- warms .hfcache/ (HF_HOME) and .cache/embeddings/

  Without step 3 the deployed app is an empty shell: startup() seeds the
  baseline schedule but never the field reports, so the schedule has no
  progress, no audit trail and no review queue.

  The database is ephemeral by design: every deploy resets it to this state.


SPA DEEP LINKS                                 frontend/package.json

  GET /executive/milestones on the static site asks for a file that was never
  built. Two layers answer it:

    npm run build -> vite build
                  -> postbuild:spa-fallback   cp dist/index.html dist/404.html
                     ......... works with no dashboard access; serves the app
                               with a 404 status, and react-router takes over.

    render.yaml routes: rewrite /* -> /index.html
                     ......... the correct fix, 200 status. CANNOT be set
                               through Render's API — dashboard or Blueprint
                               only, so it is declared but applied by hand.
```

**Files changed:**

| File | Change |
|---|---|
| `frontend/src/lib/api.ts:56` | new `isDevelopmentHost()` — loopback, `.local`, the three private IPv4 ranges |
| `frontend/src/lib/api.ts:72` | `getBaseUrl()` three-case resolution; same-origin replaces the `:8000` guess |
| `frontend/package.json` | `build` now emits `dist/404.html` via `postbuild:spa-fallback` |
| `backend/server/main.py:274` | CORS regex gained `https://[a-z0-9-]+\.onrender\.com` |
| `backend/server/main.py:284` | `NAVIS_ALLOWED_ORIGINS` merged into `CORS_ALLOWED_ORIGINS` |
| `render.yaml` | **new** — Blueprint recording both services |
| `render-build.sh` | **new** — CPU torch, dependencies, seed |
| `backend/scripts/seed.py:109` | stale `--reload` launch line gained `--app-dir backend` (D-112 leftover) |
| `backend/scripts/healthcheck.py:3,230` | same |

**Render service configuration (not in the repo):**

| Setting | Value | Why it cannot be guessed |
|---|---|---|
| API `startCommand` | `python -m uvicorn server.main:app --app-dir backend --host 0.0.0.0 --port $PORT` | the D-112 import root |
| API `HF_HOME` | `/opt/render/project/src/.hfcache` | `$HOME/.cache` does not survive the build |
| API `PYTHON_VERSION` | `3.12.10` | numpy 1.26.4 and torch 2.2.2 stop at cp312 |
| Static site `VITE_API_URL` | the API's origin | build-time constant; a change needs a **rebuild**, not a restart |

**Verified:** `pytest` 1055 passed · `tsc --noEmit` clean · build emits `dist/404.html` · `eval.py` auto-link precision **100.0%**, coverage 43.5% · CORS matched against six origins, two of which must fail · Render build 85 s with **no `nvidia-*` wheel** · build-time seed **120/266/75/198/141**, identical to local, which is what proves the deployed matcher runs MiniLM and not the 39-auto-link hashing fallback · `healthcheck.py --base-url https://navis-api-0t15.onrender.com` **31 passed, 0 failed** · a preflighted cross-origin `POST /agent/turn` from the static site origin returns **200** · the shipped bundle contains the API origin and no longer contains the `:8000` guess · no OOM on the free 512 MB instance.

> **Two pre-existing defects surfaced while verifying, neither introduced nor fixed here** (see D-113): `GET /executive/metrics` returns **46 evidenced / 38.3%**, not the 67 / 55.8% D-111 and D-112 record — local and deployed agree exactly, so the recorded figure is what is wrong; and `frontend/src/test/scheduleInspectionPanel.test.tsx` is **flaky**, putting the suite anywhere between 253 and 257 of 257, confirmed by re-running at `5d3da5c`.

---

## Previous Modification Area (2026-09-12, D-112) - retained for history

**Task:** All Python moved under `backend/`. `server/`, `matching/`, `extraction/`, `scripts/` and the ten loose root `.py` files now live in `backend/`; `dataset/`, `datasets/`, `frontend/`, `research/`, `requirements.txt` and the `Dockerfile` stayed at the project root. No import statement, schema, threshold or metric changed.
**Date:** 2026-09-12 · **Decision:** D-112

```
WHERE THE TWO "ROOTS" NOW POINT                                  (D-112)

  Before the move these were the same directory, so one expression
  served both and the ambiguity was invisible:

      Path(__file__).resolve().parent.parent

  They are now permanently different:

      <repo>/                    <- PROJECT_ROOT  (data, config, frontend)
        dataset/                    epc_progress.db, baseline_schedule.json,
                                    dpr_day_*.txt, uploads/, fixtures/
        datasets/real/              evidence corpus  (server/evidence.py)
        .cache/embeddings/          MiniLM vectors   (matching/embedcache.py)
        .env                        provider config  (extraction/llm_backend.py)
        frontend/dist/              static bundle    (server/main.py:5701)
        research/bench/             harnesses; ROOT stays here, sys.path gets
                                    ROOT / "backend"
        |
        +-- backend/               <- BACKEND_ROOT  (the import root)
              server/               main.py, db.py, cpm.py, evm.py, ...
              matching/             engine.py, retrieval.py, config.py,
                                    artifacts/
              extraction/           extractor.py, textio.py, llm_backend.py
              scripts/              healthcheck.py, seed.py, reset_demo.py
              eval.py  eval_real.py  evalstats.py  evalduration.py


HOW EACH ENTRY POINT FINDS `server` AND `matching` NOW

  uvicorn ---------> python -m uvicorn server.main:app --app-dir backend
                         |
                         +-- --app-dir puts <repo>/backend on sys.path
                         +-- backend/server/main.py:52 re-inserts
                             parent.parent (= backend/) so `from matching...`
                             resolves however the process was started

  pytest ----------> python -m pytest -q        (still from the project root)
                         |
                         +-- backend/ has no __init__.py, so pytest's rootdir
                             insertion walks up from backend/server/test_*.py
                             through server/__init__.py and stops at backend/,
                             inserting it. No flag, no conftest at the root.

  scripts ---------> python backend/scripts/healthcheck.py
                         |
                         +-- BACKEND_ROOT = parent.parent -> sys.path
                             PROJECT_ROOT = BACKEND_ROOT.parent -> dataset/

  eval ------------> python backend/eval.py
                         |
                         +-- BACKEND_ROOT = parent          -> sys.path
                             PROJECT_ROOT = BACKEND_ROOT.parent -> dataset/

  research/bench --> ROOT = parents[2]            (still the project root)
                     sys.path.insert(ROOT / "backend")
```

**Path anchors edited (the only content changes; everything else is a pure rename):**

| File | Was | Now |
|---|---|---|
| `backend/server/db.py:754` | `parent.parent` | `parent.parent.parent` — keeps `DB_PATH` on the root `dataset/epc_progress.db` |
| `backend/server/demo.py:21` | `parent.parent` | `parent.parent.parent` |
| `backend/server/evidence.py:47` | `parent.parent / "datasets"` | `parent.parent.parent / "datasets"` |
| `backend/server/main.py:326, 1348, 2801, 5701` | `parent.parent / …` | `parent.parent.parent / …` — `DATASET_DIR`, both upload dirs, `frontend/dist` |
| `backend/matching/vocabulary.py:57` | `parent.parent` | `parent.parent.parent` |
| `backend/matching/embedcache.py:31` | `parents[1]` | `parents[2]` — `.cache/embeddings` |
| `backend/extraction/llm_backend.py:425` | `parent.parent / ".env"` | `parent.parent.parent / ".env"` |
| `backend/scripts/make_why_no_llm_pdf.py:33` | `parents[1]` | `parents[2]` — `deliverables/` |
| 8 dual-use files | one `PROJECT_ROOT` | split into `BACKEND_ROOT` + `PROJECT_ROOT` |
| 20 sys.path-only sites | `parent.parent` | **unchanged** — now names `backend/`, which is what they always wanted |
| `research/bench/*.py` (5: `harness`, `profile_latency`, `drift_eval`, `grouped_split`, `cold_start`) | `sys.path.insert(ROOT)` | `sys.path.insert(ROOT / "backend")` |
| `research/bench/fit_production.py:35` | `parents[2] / "matching"` | `parents[2] / "backend" / "matching"` |

**Launch commands updated:** `Dockerfile`, `run_navis.bat`, `run_navis_fast.bat`,
`.claude/launch.json`, `frontend/.env.example`, and every `uvicorn` line in
`README.md`, `SETUP.md`, `DEMO.md`, `RUN_SHEET_SEP11.md`, `demo_script.md`,
`HACKATHON_EVE_BATTLE_PLAN.md` and this file.

**Verified:** `pytest` 1055 passed (identical to the pre-move baseline) ·
`vitest` 257 passed · live server on `--app-dir backend` returns 120 activities
and 55.8% coverage, matching D-111 · `healthcheck.py` 31/31 ·
`eval.py` auto-link precision **100.0%**, coverage 43.5%.

> **Reading older sections of this file:** all 353 backend path references in
> §0–§15 were prefixed with `backend/` in this pass. `DECISIONS.md` was
> deliberately **not** rewritten — entries before D-112 name pre-move paths.

---

## Previous Modification Area (2026-09-11, D-111) - retained for history

**Task:** Senior Management sweep, second pass. Every figure in the executive lane is now derived from the API payload rather than from a literal fallback; two decorative report selectors were wired; a dead RAID click, an empty report section and a mislabelled staleness panel were fixed.
**Date:** 2026-09-11 · **Decision:** D-111

```
SENIOR MANAGEMENT — WHERE EACH NUMBER NOW COMES FROM            (D-111)

  DataConfidence.tsx
    useQuery ['executiveMetrics']  api.getExecutiveMetrics()
        -> GET /executive/metrics          backend/server/main.py:2887
        -> kpis.evidence_coverage_pct      coverageLabel
                                           auditGrade (banded, scale shown)
           kpis.evidenced_activities  \
           kpis.total_activities       >-- the "Formula:" line
           kpis.unevidenced_activities/    (was the literal "77 / 120 = 64.2%")

    useQuery ['recentAudit', 1]     api.getRecentAudit(1)
        -> GET /audit/recent?limit=1
        -> [0].timestamp                   LATEST FIELD REPORT INGEST
           [0].source_file                 the caption beneath it
           (was the literal '2026-09-15 07:15:00 IST')

    activities.filter(actual_start && !actual_finish
                      && finish_variance_days > OVERRUN_THRESHOLD_DAYS)
        -> "Overrunning In-Progress Activities (> 5 Days Past Planned
            Finish)".  The same filter previously sat under the heading
            "> 7 Days Without Update"; GET /schedule carries no
            per-activity evidence timestamp, so no recency claim is made.

  ManagementReports.tsx  — the two selectors are now inputs to the pack
    reportPeriod  -> periodWindowDays (7 | 30 | null)
    reportScope   -> status filter | CIV/PIP prefix filter
                        |
                        v
                  reportMilestones  (useMemo over metrics.milestones)
                        |
          +-------------+-------------+
          v                           v
     on-screen table §3        fullReportMarkdown §3
     scopeStatement            "**Review Scope:** ..." header line
                                    |
                                    v
                        copyText() / .md download / window.print()

    defaultNarrative (useMemo over metrics)
        metrics.critical_drivers[0]  -> the driving activity + its slip
        .driving_delay               -> action 1, quoted with its activity
        kpis.unevidenced_activities  -> action 2
        (replaces the fabricated tag "Skid B-4")
            |
            v
        useEffect syncs into aiNarrative until
        narrativeIsUserOwned.current flips true — set by typing in the
        textarea, or by handleGenerateAi's api.askChat() reply.

  RisksDelays.tsx
    activeTab: 'raid'|'delays'|'conflicts'|null   (null = not yet chosen)
        resolvedTab = activeTab ?? first tab with rows
                      raidCount -> delayCount -> conflictCount -> 'raid'
        Every render reads resolvedTab; only the tab buttons setActiveTab,
        so a refetch cannot move the reader.

    <tr onClick> setSelectedRaidItem(toggle)
        -> selectedRaidItem?.id === item.id
        -> a second <tr> carrying RaidDetailField x6
           (previously the state was set and never read)

  lib/units.ts — shared by Overview, RisksDelays, Forecasts,
                 ExecutionInsights, Progress, ManagementReports
    pluralise(n, singular, plural?)   "1 Day"  not "1 Days"
    days(n) / signedDays(n)           KPI tiles and variance chips
    qty(value, uom)                   discrete UOM -> whole numbers
                                      ("1,447 / 1,693 nos", not 1,446.94)
```

**Deleted:** `pages/executive/Exposure.tsx` and `pages/executive/Provenance.tsx`
— imported by nothing; `/executive/exposure` and `/executive/provenance` already
redirected to `/executive/risks` and `/executive/confidence` in `App.tsx`.

---

## Previous Modification Area (2026-09-11, D-110) - retained for history

**Task:** Committed the Gantt calendar-header rewrite left uncommitted by a parallel session — day-level ticks, scroll-pinned month labels, weekend shading.
**Date:** 2026-09-11 · **Decision:** D-110 (authored elsewhere; recorded from the diff)

```
GANTT TIMELINE HEADER — WHAT BUILDS IT                            (D-110)

  NOTE ON PROVENANCE
      This rewrite came from a different Claude Code session in the same
      worktree and was found uncommitted. What follows is read off the
      code. Where the reasoning was not recorded, D-110 says so.

  GEOMETRY MEMO  [activities, dataDate, pxPerDay]
      minTime  = min(planned/actual dates, dataDate) - 7d, then aligned
                 to the 1st of its month
      maxTime  = max(planned/actual finishes) + 14d
                 + float slack per activity, capped at 120d      <- D-110
                     a long float tail used to draw past the canvas
      alignedMaxTime = 1st of the month AFTER maxTime            <- D-110
      totalDays = max(30, ceil((alignedMaxTime - minTime)/day), monthSpanDays)
                 two guarantees of the same thing - D-107's monthSpanDays
                 and D-110's month-end alignment. They agree; neither was
                 removed.

      months: GanttMonth[]   { label, shortLabel, offsetDays, durationDays }
      days:   GanttDay[]     ONE ENTRY PER TIMELINE DAY          <- D-110
              { dayIndex, timestamp, dayOfMonth, dayOfWeek, isWeekend,
                isMonday, isFirstOfMonth, monthIndex, shortDate,
                weekdayLabel, isoDate }
              every tick, grid line and shading column reads from this one
              list instead of recomputing dates inline

  PX_PER_DAY_MAP   compact 7 | normal 14 | detailed 24           <- D-110
      was 6/12/20. The wider column is what lets a day number fit at
      standard zoom.

  HORIZONTAL SCROLL TRACKING                                     <- D-110
      onScroll -> requestAnimationFrame -> setScrollLeft(newLeft)
          rAF-throttled so it does not setState per scroll event;
          the pending frame is cancelled on unmount
      used ONLY to pin month labels:
          shift = clamp(scrollLeft - left + 8, 0, width - 110)
          isNarrow = width - shift < 65  ->  m.shortLabel
      a month wider than the viewport keeps its name visible instead of
      scrolling away under the sticky pane

  TICK TIERS
      top     months, label translated by `shift`, Calendar icon, bg-surface/90
      bottom  by zoom:
        compact   days.filter(isMonday || isFirstOfMonth) -> "Sep 15"
                  1st of month in accent
        normal    EVERY day -> day number
        detailed  EVERY day -> weekday initial over day number
      D-107's labelEveryDays heuristic is REMOVED, superseded by this.

  GRID + SHADING  (overlay, left: LEFT_PANE_PX, top: HEADER_PX, z-0)
      normal/detailed   weekend shading column per weekend day
                        one grid line per day, weighted:
                          1st of month  hair/90   Monday  hair/40
                          other         hair/20
      compact           lines on Mondays and 1st only
      data date         w-0.5 accent, opacity-85, glow

  DATA DATE COLUMN                                               <- D-110
      the day cell whose isoDate === dataDate gets bg-accent/20, ring-inset
      and a title of "<Weekday>, <iso> (Project Data Date)"

  parseISODate HARDENED                                          <- D-110
      /^(\\d{4})-(\\d{2})-(\\d{2})/ out of any ISO string, NaN otherwise
      the old split('-').map(Number) turned "2026-09-15T00:00:00" into
      Date.UTC(2026, 8, NaN)

  TOOLBAR / LEGEND                                               <- D-110
      whitespace-nowrap + shrink-0 on every chip,
      flex-wrap sm:flex-nowrap overflow-x-auto on the bar
      stops the legend reflowing to a second line and pushing the chart down
      "Focus Data Date" now CENTRES the data date in the visible timeline
      instead of offsetting it by a fixed 300px

  WHAT D-107 STILL OWNS, UNCHANGED BY THIS REWRITE
      barTone / fillTone / barGlow      one chain, one winner
      LIVE_BADGE_PX clamp on the pill
      z-10 on bar and badge, under the sticky meta pane (z-20)
      scrollIntoView gated on highlightId
      the [zoom] lock-release effect
      hasFieldProgress shared by renderer and auto-scroll
      no dataDate default
      All seven D-107 guards pass against this rewrite - which is what they
      were written for.

  COST, RECORDED BECAUSE IT WAS NOT
      normal/detailed render one tick div + one grid line + possibly one
      shading div PER DAY across the whole timeline. ~260 days on the
      120-activity baseline is order 700 extra nodes, independent of
      activity count. No virtualisation, not measured. First place to look
      if the Gantt starts feeling heavy on a longer schedule.
```

---

## Previous Modification Area (2026-09-11, D-108/D-109) - retained for history

**Task:** The PM decision dock on the schedule inspection panel wrote nothing — eight buttons, one cosmetic handler. Wired to the real resolve and RAID endpoints, and every write now names where its data landed.
**Date:** 2026-09-11 · **Decision:** D-108, D-109

```
PM DECISION DOCK — WHAT RUNS WHEN A BUTTON IS PRESSED             (D-108)

  BEFORE
    ActivityInspectionPanel.tsx:506   handleAction(kind)
        setActionFeedback('Actuals verified and confirmed in project
                           ledger.')
        setTimeout(clear, 4000)
        return                       <- that was the whole function
    The component imported useQuery only. No useMutation, no POST, in
    1400 lines. Eight buttons routed here:
        Overview   Update Actuals | Flag for Review
        Evidence   Approve Ground Truth | Request Clarification |
                   Contest Report
        Dock       Accept Field Actual | Flag Conflict | Keep Baseline
    Measured live on SEQ-PMP-1061: zero POST/PUT/PATCH, activity row and
    audit count identical before and after.

  NOW — the dock adjudicates REVIEW ITEMS, not the activity row

  useQuery ['reviewQueue']  api.getReviewQueue('pending')
        same cache key Reconcile uses (Reconcile.tsx:274), so a decision
        on either screen refreshes the other
        |
        v
  pendingItems = queue.filter(activity_id === this activity && pending)
        D-009: POST /review/{id}/resolve is the ONLY path that commits an
        actual date, so the review item is the unit of decision. With none,
        there is nothing to adjudicate and the buttons say so.
        |
        +--> accept  ──> resolveAll.mutate({action:'confirm'})
        |                  for each pending item, SEQUENTIALLY:
        |                    api.resolveReview(id, {action:'confirm', note})
        |                  sequential, not Promise.all: each call appends to
        |                  audit_records and a partial failure must leave a
        |                  truthful count
        |                  -> server _apply_confirmed_event_to_schedule
        |                  -> notifyScheduleUpdate  -> toast + Gantt highlight
        |
        +--> override ──> resolveAll.mutate({action:'ignore'})
        |                  closes the item, writes no actual date
        |                  NO notifyScheduleUpdate: nothing moved, so
        |                  announcing it would be a second false claim
        |
        +--> flag    ──> api.createRaidItem({kind:'issue', ...})
                           kind is 'issue', never 'risk': backend/server/raid.py:89
                           refuses probability/impact_days on a non-risk, and
                           an observed conflict is not a scored possibility.
                           Neither field is sent.
                           -> lands in Risk & Exposure

  AFTER ANY WRITE   refreshAfterWrite()
      invalidates ['reviewQueue'] ['schedule'] ['fieldReports'] ['evm']
                  ['auditRecent'] ['audit', activityId] ['raid']
      the same set Reconcile invalidates, so both paths leave the app in
      the same state

  BUTTON STATE — the label tells the truth about scope
      pendingItems.length > 0   "Accept Field Actual (3)"   enabled
      pendingItems.length === 0  "Accept Field Actual"      DISABLED
            title: "No pending review item for this activity —
                    nothing to accept"
            Flag stays enabled: raising an issue never depended on the queue.
      in flight                  "Writing…" / "Raising…"    all disabled

  WHERE THE DATA LANDED — every success names a destination     <- D-109
      accept   -> setDrawerTab('audit')   the rows are one tab away, so the
                                          panel goes there itself
                  + CTA "See the bar move on the Gantt"
                    /schedule?view=gantt&activity=<id>&highlight=<ts>
                    the D-107 path: timestamp key, not "true", or the
                    one-shot scroll lock swallows a second visit
      override -> CTA "Open the review queue"   /reconcile
                  deliberately NOT the Gantt: nothing moved on the schedule,
                  and pointing at an unchanged bar would be a smaller
                  version of the original lie
      flag     -> CTA "Open Risk & Exposure"    /raid
      following a CTA closes the drawer first: an inspection panel for one
      activity floating over another screen is not a state worth keeping

  FEEDBACK — two states, two elements, never one falling back to the other
      actionFeedback  green banner, only on a write that returned
            "2 of 3 review item(s) confirmed · 4 audit record(s) written"
      actionError     role="alert", on refusal, failure, or nothing-to-do
            a failed write clears actionFeedback before setting this
      The defect being repaired was exactly a success banner shown for a
      write that never happened, so these can no longer share a path.

  KEYBOARD                                                    <- D-108
      Enter   -> document.getElementById('panel-accept-actual')?.focus()
               NOT handleAction('accept'). Accept commits actual dates to an
               append-only ledger (D-004); it is not one stray keystroke
               away. Same protocol, and the same reason, as Reconcile's
               confirm (Reconcile.tsx:688).
      Escape  -> onClose        ArrowLeft/Right -> prev/next activity

  RELABELLED
      "Request Clarification" -> "Raise as Issue"
          it routes to the RAID register, not to the clarification loop
          (POST /review/{item_id}/clarify, which needs a question to send).
          A button must not name an action it does not perform.

  STILL COSMETIC IN THIS PANEL — raised, left on instruction
      :960  '23 days' fallback when finish_variance_days is 0/absent
      :835  "Evidence (3)" hardcoded
      :847  auditRecords?.length || 8
      :871  "Log #8931-REV2" on every activity
      :529  VN_<date>_0842.wav invented filename
      "More" button is still an alert().

  REGRESSION GUARDS  src/test/scheduleInspectionPanel.test.tsx  (7 -> 12)
    The old banner-text test was DELETED, not amended: it asserted the
    defect, and would have failed the moment the buttons started working.
    accept calls resolveReview once per pending item with action:'confirm'
    Keep Baseline sends action:'ignore'
    flag sends kind:'issue' and NO probability / impact_days
    no pending item -> accept and overrule disabled, flag still enabled
    a rejected write renders role="alert" and no success text
    bare Enter calls nothing and focuses #panel-accept-actual
```

## Previous Modification Area (2026-09-11, D-107) - retained for history

**Task:** Gantt rendering sweep — a highlighted bar with no background, a chart whose vertical scroll never engaged, a page-hijacking row click, and tsc broken again.
**Date:** 2026-09-11 · **Decision:** D-107

```
LIVE HIGHLIGHT — WHAT ACTUALLY RUNS, END TO END                    (D-107)

  LiveNotificationToast.tsx:34   "View Updated Bar in Gantt"
      navigate(`/schedule?view=gantt&activity=<ID>&highlight=${Date.now()}`)
              highlight is a TIMESTAMP, not "true": a second update to the
              same activity must produce a different key or the one-shot
              scroll lock below swallows it.
        |
        v
  Schedule.tsx:168    highlightParam = Boolean(searchParams.get('highlight'))
  Schedule.tsx:254    effect [deepLinked, viewParam, highlightParam]
                        setLiveHighlightId(deepLinked)
                        setViewMode('gantt'); setIsDrawerOpen(false)
                        clears discipline/search/onlyActuals/onlyFlagged/
                          onlyCritical  - a filter could hide the target row
                        rAF -> #schedule-workbench.scrollIntoView
        |
        v
  Schedule.tsx:1097   <GanttChart
                        activities={rows}            <- FILTERED list
                        selectedId={selectedId}
                        highlightId={liveHighlightId}
                        highlightKey={searchParams.get('highlight')
                                      || liveHighlightId}
                        dataDate={data?.data_date}   <- undefined until the
                                                        query resolves
                      />
                      wrapper: h-[calc(100vh-240px)] min-h-[420px]   <- D-107
                        NOT flex-1. The workbench is a flex column of auto
                        height, so flex:1 1 0% resolved to the Gantt's own
                        content height (5809px for 120 rows) and
                        overflow-auto never engaged on the vertical axis:
                        scrollTop was a silent no-op and the header could
                        not stick. Measured live before the fix:
                           clientHeight 5809 == scrollHeight 5809
        |
        v
  GanttChart.tsx
    useMemo [activities, dataDate, pxPerDay]      timeline geometry
        minTime/maxTime over planned+actual dates and dataDate
        pad -7d / +14d, align minTime to its month start
        monthList built to the END of the month containing maxTime
        totalDays = max(30, dateSpan, monthSpanDays)      <- D-107
              sizing from the date span alone clipped the last month header
        returns { minTimestamp, totalDays, months, dataDateOffsetPx }
              maxTimestamp deleted - computed, returned, never read

    useEffect [zoom]                              lock release   <- D-107
        lastScrolledTargetRef = null
        lastScrolledHighlightRef = null
        DECLARED BEFORE the scroll effect on purpose: effects run in
        declaration order, so clearing after would leave the locks stale
        for a whole render and the zoom would not re-centre.

    useEffect [selectedId, highlightId, highlightKey, activities,
               minTimestamp, pxPerDay, dataDate]      auto-scroll
        targetId = highlightId || selectedId
        currentHighlightKey = (highlightKey || highlightId) ?? null
              ?? null is what keeps tsc clean: both props are optional, so
              the || chain is string | null | undefined and the ref is
              string | null.
        one-shot lock:  highlightId ? lastScrolledHighlightRef
                                    : lastScrolledTargetRef
        attemptScroll() on rAF + 60ms + 180ms + 350ms, each retrying at
          50ms up to 35 times while the query and DOM settle
            #gantt-row-<id>     -> vertical centring, minus HEADER_PX
            #gantt-bar-<id> or
            #gantt-ghost-<id>   -> horizontal centring
                 offsetLeft is measured from the row's timeline canvas,
                 which already starts after the sticky pane, so it takes
                 no LEFT_PANE_PX term
            no bar element -> hasFieldProgress(act) picks the date to aim at
                 ONE module-level helper, shared with the renderer. Two
                 private copies disagreed on actual_qty and the scroll
                 aimed at a bar the renderer had not drawn.
        container.scrollTop / .scrollLeft written directly (no smooth
          behaviour - it was being cancelled mid-animation)
        if (highlightId) -> #schedule-workbench.scrollIntoView   <- D-107
              GATED. A live update from elsewhere in the app may move the
              viewport; a click inside the Gantt may not. This effect runs
              for selectedId too, so ungated it fired on every row click.

  PER-ROW RENDER — the layering, which is load-bearing

    z-40  header's sticky left cell
    z-30  sticky header row  (months + week ticks)
    z-20  each row's sticky meta pane  (ID / disc / description / float / %)
    z-10  actual bar, ghost bar, #gantt-badge-<id>            <- D-107
             all three were z-20 or z-30 and painted OVER the activity-ID
             column and the month band when scrolled
    z-0   grid + data-date overlay  (left: LEFT_PANE_PX, top: HEADER_PX)
    ---   the rows container is STATIC: a z-* on it is inert and was
          removed. Painting order here is DOM order, which is what puts
          the z-0 overlay above the rows' own backgrounds (grid lines stay
          visible across a row) and below the bars and the meta pane.

    colour is resolved in JS, once:                           <- D-107
        barTone  = highlighted -> critical -> delayed -> normal
        fillTone = same chain, for the interior progress fill
        barGlow  = highlight-only ring/shadow, leading space included
      Emitting a fragment per state and concatenating them produced the
      single token `bg-emerald-500/30bg-accent/20`, which matches no rule -
      the highlighted bar lost EVERY background it was meant to have.

    badgeLeft = clamp(bar left, 0, timelineWidth - LIVE_BADGE_PX)
      the pill is whitespace-nowrap and cannot shrink, so without the clamp
      it ran off the scroll area and was cut mid-word

    labelEveryDays = pxPerDay * 7 < 48 ? 14 : 7
      a tick label ("Sep 15") needs ~48px; at compact 6px/day a weekly one
      got 42px and they collided. Grid lines stay weekly at every zoom.

  DATA DATE — there is no default any more                      <- D-107
    dataDate?: string, no fallback value. Every read is guarded:
      geometry memo          if (dataDate)
      actual bar end         dataDate ? parseISODate(dataDate) : NaN
                               -> NaN falls through to the one-day stub
      scroll fallback        `if (dateStr && ...)`
      header tag / Focus     rendered only when dataDateOffsetPx !== null
    A hardcoded '2026-04-10' drew a Data Date marker for the whole first
    paint on a day this project never had (its real one is 2026-09-15).

  REGRESSION GUARDS  src/test/gantt.test.tsx  (+7, 239 -> 246)
    exactly one bg-* class on the highlighted bar, no merged token
    highlighted critical stays green, never bg-danger/20
    bar and badge are z-10, under the meta pane
    badge left clamped inside the timeline canvas
    month band end <= timeline width
    ordinary selection does NOT call scrollIntoView
    no data date -> no marker, no Focus button, rows still render
  All seven were confirmed to FAIL against the defective code before being
  accepted: the defects were re-introduced, the suite ran 4 failed, and the
  file was restored.
```

## Previous Modification Area (2026-09-11, D-106) - retained for history

**Task:** Dead-button sweep of all eight Senior Management destinations; fixed three private copies of canonical config lists, a clipboard that reported success it had not achieved, and the sole error breaking tsc.
**Date:** 2026-09-11 · **Decision:** D-106

```
EXECUTIVE LANE SWEEP — WHAT WAS CLICKED, AND WHAT BROKE        (D-106)

  SWEPT LIVE (API :8000, UI :5173, 1024x768, every control clicked)
      /executive              Overview            0 findings
      /executive/milestones   Milestones          1  -> fixed
      /executive/progress     Progress            0 findings
      /executive/risks        Risks & Delays      0 defects (see sequencing)
      /executive/forecasts    Forecasts           0 findings
      /executive/insights     Execution Insights  1  -> fixed
      /executive/reports      Management Reports  2  -> fixed
      /executive/confidence   Data Confidence     0 findings (read-only)

  ROOT CAUSE SHARED BY THREE SCREENS — a private copy of a config list
      config.ts:45-53 says, verbatim:
        "six private copies is how a screen ends up one discipline short"

      Milestones.tsx:316          5 hand-listed disciplines, no `hse`
          ...while Timeline Track on the SAME page drew "HSE scope complete"
      ExecutionInsights.tsx:182   4 hand-listed, no `static_equipment`, no `hse`
          ...while its own header counted "6 Disciplines Active"
      FieldWorkspaceShell.tsx:238 lang === 'mr-IN' ? 'MR' : 'EN'
          ...`mr-IN` is Marathi. config.ts:105 has en-IN / hi-IN / as-IN only,
             so Assamese fell through to 'EN'. This was ALSO the only error
             breaking `npx tsc --noEmit` (from 7c47d97 / D-099).

      NOW:  {DISCIPLINES.map(...)}                    <- config.ts:83
            {languages.find(l => l.code === lang)?.short}

  THE CLIPBOARD PATH — before
      ManagementReports.tsx:163  navigator.clipboard.writeText(md)  // no await
      ScheduleDoctor.tsx:74           "                             // no catch
      TenderEstimator.tsx:40          "
      AskNavisChat.tsx:241,252        "
      setCopied(true)                                  // unconditional
        -> observed: button read "Copied" while the console carried
           NotAllowedError as an UNCAUGHT promise rejection
        -> on a plain-HTTP LAN origin navigator.clipboard is UNDEFINED,
           so this is a synchronous TypeError inside a click handler.
           Same Secure-Context rule that produced lib/uuid.ts (D-098).

  THE CLIPBOARD PATH — after
      lib/clipboard.ts :: copyText(text): Promise<boolean>
        1. navigator.clipboard?.writeText   <- optional-chained, no throw
        2. off-screen <textarea> + document.execCommand('copy')
        every call site:  if (await copyText(x)) setCopied(true)

      Verified by forcing navigator.clipboard = undefined in the live page:
        no exception, and the button STAYED "Copy Markdown".

  ALSO FIXED
      ManagementReports.tsx  URL.revokeObjectURL deferred to setTimeout(,0);
                             revoking synchronously after a.click() can race
                             the browser's read of the blob.

  LOGGED, DELIBERATELY NOT FIXED
      Login.tsx:194   role cards are <div onClick onDoubleClick> with no role,
                      no tabIndex, no onKeyDown -> not keyboard reachable and
                      absent from the a11y tree. Real defect, but it is the
                      entry point to all three roles and the presenter uses a
                      mouse. After the finale.

  DEMO SEQUENCING, NOT DEFECTS
      /executive/risks opens on "Accepted RAID Register (0)".
      Delay Attribution Matrix is (0) too. Source Disagreements is (18) and
      carries the best content on the page — real conflicting dates citing
      dpr_day_03.txt vs piping_progress.xlsx. Click straight to that tab.

  Pinned by: cd frontend && npx tsc --noEmit    clean (was 1 error)
             cd frontend && npx vitest run       229 passed
             cd frontend && npm run build        clean, 3.32s
             python -m pytest -q                1055 passed (no backend change)
```

---

### Previous modification area (D-105)

**Task:** Pinned the stage API URL, documented the three env modes and the cost of the pin, and gave the fail-safe video a shot list bound to the canonical demo path.
**Date:** 2026-09-11 · **Decision:** D-105

```
WHERE THE FRONTEND DECIDES WHICH API TO CALL                   (D-105)

  NO APPLICATION CODE CHANGED. Config, docs and .gitignore only.

  THE RESOLUTION POINT — one line, three outcomes
      frontend/src/lib/api.ts:73
          export const getBaseUrl = () =>
            import.meta.env.VITE_API_URL
            || `http://${window.location.hostname}:8000`

      every request goes through it:
          api.ts :: fetchWithHandler  ->  `${getBaseUrl()}${endpoint}`
          and ExportResponse.download_url is made absolute with it too

      MODE A  VITE_API_URL unset          (the shipped default)
              browser at localhost:5173   -> http://localhost:8000       OK
              phone at 192.168.x.y:5173   -> http://192.168.x.y:8000     OK
                                             (needs uvicorn --host 0.0.0.0)
              browser at Some-Mac.local   -> http://Some-Mac.local:8000  FAILS
                                             silently against loopback-only
                                             uvicorn: page renders, every
                                             request errors

      MODE B  VITE_API_URL=http://127.0.0.1:8000   <- CHOSEN FOR THE STAGE
              any browser on the laptop            -> 127.0.0.1:8000     OK
              phone over the LAN                   -> its OWN loopback   FAILS
              => removes the hostname trap, COSTS the second-device demo

      MODE C  VITE_API_URL=http://<other-host>:8000   backend elsewhere

  WHEN IT IS READ
      Vite loads frontend/.env at DEV-SERVER START ONLY. Editing it under a
      running `npm run dev` changes nothing and reads as "the pin failed".

  WHAT DOES NOT TRAVEL
      frontend/.gitignore:7   `.env*`   (negated only for `.env.example`)
      => `git pull` NEVER delivers the pin. Every presenting machine, the
         backup laptop included, creates its own:
             printf 'VITE_API_URL=http://127.0.0.1:8000\n' > frontend/.env
      frontend/.env.example is the one carrier git will take, so it now
      documents all three modes.

  VERIFIED LIVE, NOT REASONED (dev server restarted with the pin in place)
      GET http://127.0.0.1:8000/schedule?include_warnings=false   200 OK
      GET http://127.0.0.1:8000/executive/metrics                 200 OK
      GET http://127.0.0.1:8000/schedule?include_warnings=true    200 OK
      console errors: none
      screens rendered: Senior Management Overview, Data Confidence
                        120 activities · 67 evidenced · 53 unevidenced
                        · 55.6% coverage  == healthcheck + Funnel B

  FAIL-SAFE VIDEO  (RUN_SHEET_SEP11.md Appendix A)
      shot list is bound to DEMO.md "The demo path, in order" (line 246) so
      the fallback cannot contradict the rehearsed run
      QuickTime + microphone, not a silent capture
      records the TYPED field path, never voice — browser speech needs the
      network, and the network is what failed if the video is playing
      reset_demo.py first, so on-screen counts match Funnel B
      .gitignore:21  *.mov *.mp4 *.webm — P4 ends with `git add -A`

  Suites unaffected (no application code touched); 403745f results stand:
             python -m pytest -q                  1055 passed
             cd frontend && npx vitest run         229 passed
             python backend/scripts/healthcheck.py          31 passed
             python backend/eval.py       auto-link precision 100.0% (67/67)
```

---

### Previous modification area (D-104)

**Task:** Recounted the test suite against the code, corrected every presenter-facing document, re-derived the DEMO.md route table from App.tsx, and re-scoped today's plan into RUN_SHEET_SEP11.md.
**Date:** 2026-09-11 · **Decision:** D-104

```
DOCUMENT TRUTH PASS — WHAT WAS MEASURED, AND AGAINST WHAT      (D-104)

  NO CODE CHANGED IN THIS TASK. Documents only.

  THE TEST COUNT — how 1,202 was disproved
      pytest --collect-only            @ HEAD          -> 1055 collected
      git worktree add <tmp> 3db290c
        pytest --collect-only          @ 3db290c       -> 1055 collected
      git grep -E "^\s*(async )?def test_"
        3db290c -> 102 functions | HEAD -> 102 functions
      every @pytest.mark.parametrize in the tree is over a STATIC list, so
      collection is deterministic and host-independent
      backend/server/test_evidence.py :: needs_corpus is a skipif -> moves the
      pass/skip split, never the collected count (and 0 skipped anyway)
      => 1,202 was never a run of this suite.  1,055 + 229 = 1,284.

  THE ROUTE TABLE — re-derived, not edited
      frontend/src/App.tsx:396-402   PLANNER_NAV   7 items
      frontend/src/App.tsx:410-417   EXEC_NAV      8 items
      frontend/src/App.tsx:459-464   field routes  6 (incl. /field/report,
                                     which is NOT in the bottom nav)
      frontend/src/App.tsx:483-492   exec routes   8 real + 2 redirects
          /executive/exposure   -> <Navigate to="/executive/risks">
          /executive/provenance -> <Navigate to="/executive/confidence">
      frontend/src/components/FieldNav.tsx:14-22   field nav  4 items
      DEMO.md had claimed 3 executive destinations and 6 planner entries
      under their old labels.

  WHAT WAS CORRECTED (documents a human reads aloud or follows on stage)
      NUMBERS_SHEET.md                 row 7, verification stamp, judge warning
      research/JUDGE_DRILL_01_QUESTIONS.md   Q62
      research/JUDGE_DRILL_02_ANSWERS.md     A62
      demo_script.md, pitch_deck.md    correction tables
      DEMO.md                          roles + routes re-derived

  WHAT WAS DELIBERATELY LEFT ALONE (historical record)
      DECISIONS.md D-102  -> marked "superseded in part", not rewritten
      FLOW.md D-102 area, HACKATHON_EVE_BATTLE_PLAN.md,
      ppt_build/CONTENT_EVIDENCE_PLAN.md, FLOWCHART_PROMPTS.md,
      DECK_DIAGRAMS.md, and the built PPTX/PDF deliverables.
      The deck keeps 1,431; the presenters get a scripted sentence instead.

  NEW
      RUN_SHEET_SEP11.md   supersedes the eve plan for 11 September.
                           Opens with `git pull`, because the largest risk
                           this morning was a teammate presenting from a
                           machine still on 3db290c and hitting the D-103
                           500 live.

  Suites unaffected (no code touched); bee2694 results stand:
             python -m pytest -q                  1055 passed
             cd frontend && npx vitest run         229 passed
             python backend/scripts/healthcheck.py          31 passed
             python backend/eval.py       auto-link precision 100.0% (67/67)
```

---

### Previous modification area (D-103)

**Task:** Repaired the dense-retrieval dependency stack, made an unimportable embedder degrade instead of returning 500, and returned the backend, frontend and healthcheck suites to green.
**Date:** 2026-09-11 · **Decision:** D-103

```
INGEST — WHY IT WAS RETURNING 500, AND WHERE IT NOW DEGRADES        (D-103)

  THE CALL CHAIN (line numbers are CURRENT, i.e. after the fix)
      POST /ingest
        -> backend/server/main.py:1375        ingest_file
        -> backend/server/main.py:557         get_matching_engine
        -> backend/server/main.py:607         _build_engine_from_db_or_disk
        -> backend/server/main.py:583         _engine_from_index
        -> backend/matching/engine.py:58      MatchingEngine.__init__
        -> backend/matching/retrieval.py:210  HybridRetriever.__init__
        -> backend/matching/retrieval.py:218  _embed_docs
        -> backend/matching/retrieval.py:118  MiniLMEmbedder.cache_name
        -> backend/matching/retrieval.py:75   MiniLMEmbedder._load

      BEFORE: the sentence_transformers import sat OUTSIDE the try in _load.
      A NameError/ImportError escaped _load(), unwound all eight frames above,
      and became HTTP 500 — the fallback below was never reached.

  THE REPAIRED _load  (backend/matching/retrieval.py:75)
        try:  from sentence_transformers import SentenceTransformer
        except Exception:
              logger.error(... "falling back to hashing embedder")
              self._failed = True ; return
        try:  SentenceTransformer(MODEL_NAME, local_files_only=True)
        except: SentenceTransformer(MODEL_NAME)      # first-run download
        except: self._failed = True                  # offline, uncached

      _failed = True  ->  cache_name  = "hashed-ngram-384"
                          is_neural   = False
                          encode()    -> _hashed_embeddings(texts, dim=384)
      The dense channel weakens; BM25, rapidfuzz and tag_overlap are untouched,
      so retrieval still runs and /ingest still answers 200.

  WHY IT FAILED — THE DEPENDENCY CHAIN
      numpy 2.5.2  x  torch 2.2.2 (built against the NumPy 1.x C API)
          -> "Failed to initialize NumPy: _ARRAY_API not found"
      transformers 5.16.1 requires torch >= 2.5, finds 2.2.2, disables torch
          -> `import torch.nn as nn` skipped, but accelerate.py:65 annotates
             nn.Module at module scope -> NameError: name 'nn' is not defined
      sentence-transformers 3.x imports `datasets` at module scope
          -> resolves this repo's own corpus directory `datasets/` as an
             implicit namespace package -> cannot import name 'Dataset'
      torch 2.2.2 is the LAST x86_64 macOS wheel, so the stack is pinned
      DOWN to meet it: numpy 1.26.4, scipy 1.13.1, transformers 4.44.2,
      sentence-transformers 2.7.0 (requirements.txt).

  LIVE STATE AFTER THE FIX  (backend/scripts/healthcheck.py, 31/31)
      dense retrieval        MiniLM (offline)      <- loads from local HF cache
      schedule index         120 activities
      GET  /schedule         120 activities, 67 with actuals
      GET  /review-queue     135 pending
      POST /ingest           200
      GET  /openapi.json     46 endpoints (re-pinned from 44)

  TEST-HARNESS PATHS ALSO REPAIRED
      backend/server/test_schedule_auditor.py   setup_db teardown now calls
                                        test_engine.dispose() BEFORE unlinking
                                        dataset/test_schedule_auditor.db; a
                                        pooled connection to a deleted inode
                                        reads as "readonly database".
      frontend/src/test/setup.ts        installs an in-memory Storage when the
                                        platform provides none (Node 26's
                                        inert localStorage global shadows
                                        jsdom's) — unblocks roleRouting,
                                        fieldStudio and chatSeparation.

  Pinned by: python -m pytest -q                  1052 passed
             cd frontend && npx vitest run         223 passed
             python backend/scripts/healthcheck.py          31 passed
             python backend/eval.py       auto-link precision 100.0% (67/67)
```

---

### Previous modification area (D-102)

**Task:** External review answered; deck de-linked, test count corrected, slide 4 rebuilt native (D-102).
**Date:** 2026-09-10 · **Decision:** D-102

```
WHAT WAS RE-DERIVED, AND FROM WHERE

  pytest -q                    1,202 passed
  npx vitest run               229 passed, 89 suites        -> 1,431 total (was 1,426)
  grep @app.<method> main.py   46 unique routes             (deck said 18, fixed D-101)
  backend/matching/config.py           w_alias = 0.0                 inert learning loop, D-061
  dataset/ + datasets/         0 image fixtures              OCR untested on scans
  backend/server/main.py  action=="create"
        new Activity(planned_start = le.reported_date or DATA_DATE,
                     planned_finish = le.reported_date or DATA_DATE)
        -> a planner-created activity gets FABRICATED plan dates.  OPEN, D-102.

DECK NOW BUILDS WITH TWO IMAGES, NOT THREE
  slide 2   diagram_A_bridge.png      no figures in it
  slide 3   diagram_B_flowchart.png   thresholds only, and those are stable
  slide 4   native shapes             was diagram_D1_onprem.png, which had "18 REST
                                      routes" and "1,426 tests" baked into its pixels
  no URL on any slide
```

---

### Previous modification area

**Task:** Judge Q&A drill split into questions and answers; deck route count corrected (D-101).
**Date:** 2026-09-10 · **Decision:** D-101

```
JUDGE DRILL DOCUMENTS  (no runtime code - rehearsal instruments)

  research/JUDGE_DRILL_01_QUESTIONS.md   103 questions, 8 blocks, no answers
  research/JUDGE_DRILL_02_ANSWERS.md     A1..A103, each traced to a source
  research/JUDGE_QUESTIONS.md            older 12-question v1 set, now sign-posted

  Answer provenance actually read while writing them:
      backend/matching/features.py    FEATURE_WEIGHTS      six features + weights   (A64)
      backend/matching/config.py      SHIPPED_THRESHOLDS   0.80 / 0.40 / 0.03, D-093 (A56-A58)
      backend/server/main.py          MIN_ACTUALS_FOR_ESTIMATE = 3                  (A72)
      backend/server/main.py          list_source_conflicts                         (A69)
      backend/server/db.py            append-only guard, D-004                      (A75)
      METRICS.md              2.84 ms/event batched, 352 events/s           (A76)

  Correction that came out of it:
      backend/server/main.py currently declares 46 unique @app.<method> routes.
      The deck said 18 - fixed in ppt_build/build_navis_sih_deck.mjs, deck and
      PDF rebuilt. The same wrong figure is still baked into the slide-4 image
      ppt_build/assets/diagram_D1_onprem.png and needs an Eraser re-export.
```

---

### Previous modification area

**Task:** SIH idea deck rebuilt on the official template with the Eraser flow charts (D-100).
**Date:** 2026-09-10 · **Decision:** D-100

```
DECK BUILD PATH  (documentation artefact - no NAVIS runtime code is involved)

  ppt_build/build_navis_sih_deck.mjs        node, @oai/artifact-tool
      PresentationFile.importPptx(SIH2026-IDEA-Presentation-Format.pptx)
        slide 1  left exactly as shipped (speaker notes only)
        slide 2  deleteNamed("TextBox 8") -> bridge diagram + 3 pointer cards
        slide 3  technology column | divider | master flow chart
                 dashed rule -> 3 stat chips + evidence box
        slide 4  on-premise band -> risk / mitigation rows -> known-gaps line
        slide 5  native 5-node loop (shapes.connect) -> 4 beneficiary cards -> scale strip
        slide 6  5 reference rows | native evidence funnel -> evidence-boundary pills
        slides.getItem(6).delete()          the template's instruction page
      PresentationFile.exportPptx -> deliverables/NAVIS_SIH2026_NamasteByte_FINAL.pptx

  ppt_build/fill_template_fields.py          python-pptx, run-level edits only
      cover text box  6 paragraphs   fill_paragraph(run[0].text = value)
      team ovals      slides 2-6     "Your Team Name" -> "NamasteByte"
      font size overridden only where the shipped size cannot hold the content
      (PS title 24 -> 13 pt, oval -> 10 pt)

  ppt_build/render_final.mjs                 PNG proof of what was built
      -> ppt_build/final_render/slide-1..6.png, montage.png, final.inspect.ndjson
      -> deliverables/NAVIS_SIH2026_NamasteByte_FINAL.pdf   (Pillow, from those PNGs)

  Diagram assets: ppt_build/assets/diagram_A_bridge.png, diagram_B_flowchart.png,
  diagram_D1_onprem.png - exported from the Eraser workspace listed in DECK_DIAGRAMS.md
  and whitespace-trimmed. The other five Eraser diagrams are deliberately unused.
```

---

### Previous modification area

**Task:** Centralized browser-compatible UUID utility with non-secure LAN HTTP fallback (D-098).
**Date:** 2026-09-10 · **Decision:** D-098

```
BROWSER-COMPATIBLE UUID UTILITY — HTTP LAN COMPATIBILITY           (D-098)

  THE PROBLEM
      `crypto.randomUUID()` is restricted by W3C Web Cryptography API to Secure
      Contexts (`window.isSecureContext === true`).
      Accessing the app over a local LAN IP (http://192.168.1.7:5173) on iOS Safari
      or Chromium leaves `crypto.randomUUID` undefined, crashing Field.tsx,
      ReportStudio.tsx, and AskNavisChat.tsx with TypeError on mount.

  THE IMPLEMENTATION
      frontend/src/lib/uuid.ts
        generateUUID() / randomUUID()
          1. Native crypto.randomUUID() when in secure contexts (HTTPS & localhost)
          2. crypto.getRandomValues() RFC 4122 v4 calculation in non-secure contexts
          3. Math.random() + high-resolution timestamp fallback if crypto is absent

  AFFECTED CALL SITES
      Field.tsx                 sessionId on mount + resetSession()
      ReportStudio.tsx          sessionId on mount, edited effect, startOver()
      AskNavisChat.tsx          user message ID, assistant response/error IDs

  Pinned by frontend/src/test/uuid.test.ts (5 tests).
```

---

### Previous modification area (D-097)

**Task:** Field Supervisor Preferences page redesigned: personal settings first, compact metadata grid, synchronized voice language.
**Date:** 2026-09-06 · **Decision:** D-097

```
FIELD PREFERENCES — PERSONAL SETTINGS FIRST                        (D-097)

  THE INTERFACE
      FieldProfile.tsx          Personal application preferences with compact context
      Header                    "Preferences" + "Personalize how NAVIS works for you."
      Summary Banner            Compact horizontal user & assignment card (~100px)
                                Role avatar [FS], "Field Supervisor", project name,
                                workfront chip, discipline ("Piping"), shift ("Shift: Day")

  SECTION 1: APPEARANCE
      Segmented Control         [ ☀ Light ] [ ☾ Dark ] (~280px wide)
      Theme Integration         Wired to `useTheme`, syncs with localStorage['theme_override'],
                                login screen, and shell toggle

  SECTION 2: LANGUAGE & VOICE INPUT
      Segmented Control         [ English ] [ Hindi ] [ Assamese ]
      Persistence & Sync        `useSpeech.ts` persists to localStorage['navis.speech_lang']
                                Bidirectionally synced between shell header chips & Preferences
      Privacy Notice            "Speech recognition runs in the browser. Nothing is recorded or sent to a speech service."

  SECTION 3: CURRENT ASSIGNMENT (COMPACT METADATA)
      Grid                      Compact 3-column read-only metadata grid
                                Project (OIL-WSD-2026), Project code, Work front (Well Pad 04 · Sector A),
                                Discipline (Piping), Shift (Shift: Day), Data date (15-Sep-2026)
      Badge                     Subtle uppercase [READ-ONLY] chip

  SESSION ACTIONS
      Actions                   [ Back to home ] (secondary) & [ Return to role selection ] (accent CTA)
      Sign Out                  `useSession.signOut()` clears `navis.role` and redirects to role picker

  Pinned by frontend/src/test/field.test.tsx (25 tests).
```

---

### Previous modification area (D-096)

**Task:** Field Supervisor Clarifications page redesigned as an Actionable Work Queue & Inbox.
**Date:** 2026-09-06 · **Decision:** D-096

```
FIELD CLARIFICATIONS — WORK QUEUE & INBOX                          (D-096)

  GET /field/clarifications
      backend/server/main.py :: field_clarifications(unanswered_only=False)
      returns: list[ClarificationResponse]
          id, review_item_id, reference, original_text, question,
          asked_by, asked_at, answered, response, answered_at, matched_activity_id

  THE INTERFACE
      FieldClarifications.tsx   max-w-5xl operational inbox, 0 KPI dashboard tiles
      Header                    "Clarifications" + "{N} require your response · {M} answered"
      Filters                   [ All (N) ] [ Needs response (M) ] [ Answered (K) ]
                                active subtle NAVIS Blue, neutral inactive
      Search                    In-memory query matching question, update text, activity ID, asked by
      Empty State               Natural centered whitespace with CheckCircle2:
                                "No clarifications needed · Planning hasn't requested additional information"

  CARDS & HIERARCHY
      Needs Response Cards      Prominent question (text-lg font-semibold)
                                Subtle amber pill: "● Needs response"
                                Context box: verbatim report quote + matched activity ID & name
                                Attribution: "Asked by Priya Das · Planning Engineer | Sent 18 min ago"
                                Action: [ Respond ] CTA button (opens slideout drawer)
      Answered Cards            Less prominent, "✓ Answered" green pill, question + compact context,
                                "Your response: ..." callout, timestamp for traceability

  RESPOND SLIDEOUT DRAWER
      Drawer (right-aligned)    Active on [ Respond ] click or `?item=<id>` query param
      Header                    "Respond to Planning" + reference
      Context Preview           Amber callout with Planning's question + verbatim original report
      Response Composer         Textarea (`Type your response here...`) + useSpeech voice recording
      Schedule Protection       Reassurance that response goes to Planning before schedule actuals commit
      Actions                   [ Cancel ] | [ Send Response ]
      On Submit                 POST /field/clarifications/{id}/respond
                                invalidates ['clarifications'], ['fieldReports'], ['reviewQueue']
                                toast: "Response sent to Planning Engineer"
                                moves card to Answered immediately

  SIDEBAR INTEGRATION
      FieldWorkspaceShell.tsx   unanswered count defaults to 0, badge rendered ONLY when > 0
                                styled with amber warning pill

  CROSS-PAGE INTEGRATION
      FieldReports.tsx          Needs Information prompt navigates to /field/clarifications?item=<id>
                                auto-opening drawer on arrival

  Pinned by frontend/src/test/field.test.tsx (25 tests).
```

---

### Previous modification area (D-095)

**Task:** The reporting flow gets explicit states, a refusal renders as a
refusal, and clarification moves out of the embedded chat panel.
**Date:** 2026-09-06 · **Decision:** D-095

```
REPORT STUDIO - STATES                                            (D-095)

  draft -- check --> checking --> phaseFor(response)
                                   not_a_progress_report -> invalid
                                   !awaiting_confirmation -> needs_clarification
                                   no slots.activity_id   -> unmatched
                                   otherwise              -> ready
  ready|unmatched -- confirm --> submitting --> submitted
                                   (only with event_created AND a row id)

  FAILURE is not a state. It is a separate {kind, message}:
      ApiError        -> confirmed  "Nothing was stored."
      anything else   -> uncertain  "may or may not have been recorded",
                                    with Retry (idempotent per session)
  and the phase returns to where the draft already was.

  INVALIDATION   draftKey = report + date + workFront + discipline
      any change  -> clear interpretation, disable submit, NEW session id
                     (server slots are never overwritten once set, so the
                      old session would answer about the old text)
  STALENESS      every request takes seqRef++ and captures draftKey;
                 a reply that is not the latest, or whose key moved, is
                 discarded

  CONTEXT        agentContext(workFront, discipline || null)
                 omits `discipline` entirely when unchosen, so
                 backend/server/main.py :: _apply_context seeds nothing
                 savedDiscipline() / rememberDiscipline() - the only default

  RELEVANCE      backend/server/main.py :: _unreportable_reason
                 REPORTABLE_TERMS now covers work PREVENTED as well as work
                 done - permits, access, weather, materials, drawings,
                 plant, manpower, mobilisation, handover
                 the refusal names both halves; the outcome code is never
                 shown to a supervisor

  CLARIFICATION  in the reporting flow: agent_message, `choices` as chips,
                 and a free-text answer box inside the review panel.
                 The embedded Field Update Assistant is deleted.

  ASK NAVIS      opens only from its button, in all three shells.
                 Escape / close button / backdrop, and focus returns to the
                 trigger. Hooks now run before `if (!isOpen) return null`,
                 without which toggling threw "Rendered more hooks than
                 during the previous render" and destroyed the draft.

  Pinned by frontend/src/test/fieldStudio.test.tsx (25) and
  frontend/src/test/chatSeparation.test.tsx (10).
```

---

### Previous modification area (D-094)

**Task:** Insufficient evidence is an answer — the tender estimator and the
historical benchmarks stop manufacturing numbers, and the monsoon multipliers
are labelled as assumptions.
**Date:** 2026-09-05 · **Decision:** D-094

```
TENDER ESTIMATE — THE EVIDENCE BAR                                (D-094)

  POST|GET /memory/estimate
      backend/server/main.py :: _compute_tender_estimate
          scoped_activities(db)          one project, not two (D-092)
          filter by discipline, then by activity_type prefix
          actual_days  = completed activities with both actual dates

      MIN_ACTUALS_FOR_ESTIMATE = 3
          matches productivity.py :: MIN_COMPARABLES — one system, one
          opinion about what counts as evidence

      len(actual_days) < 3   ->   REFUSE
          evidence_sufficient  false
          calibrated_days_p10/p50/p90     null
          recommended_tender_duration     null
          total_contingency_days          null
          pmxml_snippet                   null
          evidence_note   how many were found, how many are needed
          baseline_days_p50 IS still reported - a fact about the plan,
          never scaled into a substitute for the percentiles

          Was: 1 actual  -> actual x0.8 / x1.0 / x1.3
               0 actuals -> planned x0.85 / 1.15 / 1.45
               no plan   -> a literal 10.0 days

      len(actual_days) >= 3  ->   percentiles over the ACTUALS, then
          _site_condition(cond) -> (multiplier, fraction, basis sentence)
              monsoon  1.35 / 0.25    ASSUMPTION, stated in every response
              remote   1.20 / 0.18    ASSUMPTION
              standard 1.00 / 0.08    planning convention
          weather_basis + contingency_basis travel WITH the numbers

  RISK FACTORS   _tender_risk_factors(activities, db)
      _compute_delay_reasons -> the project's own delay register
      probability_pct  ALWAYS None
          was min(85, max(20, frequency * 15)) - "20%" off one observation
      basis            "observed N times in this project's delay register"
      empty register   -> [] and risk_factors_note
          was a hardcoded "Upper Assam Monsoon Delays, 65%, frequency 3"

  THE SCREENS
      TenderEstimator.tsx   evidence_sufficient false -> one panel with the
          note and no percentile card at all
      Memory.tsx            MIN_ACTUALS_FOR_DELTA = 3; a row below it keeps
          its counts and reads "insufficient evidence" where the delta was.
          Was: sorted by delta, so CIV-PLT +483% off ONE activity led.

  Pinned by backend/server/test_server.py (6 tender tests) and
  frontend/src/test/tenderEstimator.test.tsx (6).
```

---

### Previous modification area (D-093)

**Task:** The metrics describe the build that ships — one threshold constant
for the server and the evaluator, tuned on dev and measured on held-out test.
**Date:** 2026-09-05 · **Decision:** D-093

```
ONE CONFIGURATION                                                 (D-093)

  backend/matching/config.py :: SHIPPED_THRESHOLDS
      Thresholds(tau_high=0.80, tau_low=0.40, margin_min=0.03)
          |                                    |
          |                                    |
  backend/server/main.py                          backend/eval.py
      MATCHING_THRESHOLDS = SHIPPED_        default mode evaluates AT it
      get_matching_engine()                 builds its engine through the
          production(sha)  <--- same call ---> same production(sha)

  THE SPLIT   dataset/ground_truth.csv, column `split`
      assigned BY SOURCE FILE, never by row
          dev   100 mentions  6 sources  3 hard negatives
          test  154 mentions  6 sources  9 hard negatives
      Row-wise splitting would put near-duplicate mentions of one pour on
      both sides, and the held-out score would measure memorisation.

  CHOOSING THE THRESHOLDS   on dev only
      among sets with 100% dev auto-link precision and >= 45% dev coverage,
      take the highest tau_high, then the largest margin
          -> 0.80 / 0.40 / 0.03

      on HELD-OUT test:
          0.75/0.30/0.02  dev-optimal      93.2%   7 wrong auto-links
          0.70/0.40/0.03  previously shipped 95.2%  5 wrong auto-links
          0.80/0.40/0.03  SHIPPED          100.0%   0 wrong auto-links

  backend/eval.py MODES
      (default)     shipped config, shipped thresholds, held-out test
      --calibrate   grid search on dev; mode line says NOT the shipped
                    build, and a NOTE names the difference
      --cv          5-fold, pooled out-of-fold

  print_errors()    wrong auto-links, wrong review rows, mentions with no
                    candidate, NO_MATCH outcomes - as COUNTS, beside the
                    percentages that hide them.

  The footer prints the command that reproduces the run. A figure this
  command does not print describes a build nobody is running.
```

---

### Previous modification area (D-092)

**Task:** An imported schedule becomes the project — the matcher re-indexes
from the active baseline, activities are attributed to the baseline they came
from, and export preserves relationship type and lag.
**Date:** 2026-09-05 · **Decision:** D-092

```
IMPORT -> INDEX -> REPORT -> RETRIEVE                             (D-092)

  POST /schedule/import  (replace=true)
      provider.read_activities()          JSON | PMXML | XER
      validate_activities()               refuses a broken file
      create / update Activity rows       actuals never touched
      _activate_baseline()                previous row retired, not deleted
      db.flush()
      _attribute_activities_to_baseline(db, record, ids_in_file)
          -> Activity.baseline_id = the new baseline
      db.commit()
      rebuild_matching_engine(db)         <-- the fix
          build_index_from_active_baseline(db)
              scoped_activities(db)       active baseline's rows only
              _activity_to_dict(row)      predecessor_LINKS, not ids
              ScheduleIndex(dicts, baseline=ProviderBaselineVersion(...))
          _engine_from_index(index)       production(sha) picks artefacts
          None -> keep the old engine, never install an empty index

  STALENESS, for the multi-worker case
      get_matching_engine(db)
          _index_is_stale(db, engine)     index.baseline.sha256 != active
          -> rebuild_matching_engine(db)
      Passed a session by: ingest (link_events_to_activities), the
      RollupAccumulator at ingest, _replay_linked_event on review resolve,
      and _match_slots on the agent path.

  SCOPING — ONE PROJECT AT A TIME
      scoped_activities(db)
          active baseline's rows, ordered by id
          NOTHING attributed yet -> every row (wide, not empty)
      Used by GET /schedule, its CPM pass, and the index build.
      The previous baseline's activities stay in the table (D-004) and out
      of the project.

  EXPORT — the logic survives
      POST /schedule/export
          project_name = active baseline's name, not a constant
          _generate_pmxml / _generate_xer
              act.predecessor_links()     rel + lag_days, per tie
              lag written as "{n}d"       a bare number = HOURS in XER
              window = min planned_start .. max planned_finish
      Was: predecessor_list() with Type="FS" Lag="0d" on every tie, which
      flattened SS/FF/SF and every lag - the input to cpm.py's float and to
      every beyond-float delay day.

  Pinned by backend/server/test_imported_schedule_is_usable.py (9, the acceptance
  condition on a tunnelling schedule alien to both shipped baselines) and
  backend/server/test_export_roundtrip.py (8, round-tripped through the real
  importer).
```

---

### Previous modification area (D-091)

**Task:** The Report Studio stops reporting false success — it now submits
what was typed, and shows success only when the server confirms it persisted.
**Date:** 2026-09-05 · **Decision:** D-091

```
REPORT STUDIO — THE SUBMIT PATH                                   (D-091)

  frontend/src/pages/field/ReportStudio.tsx :: send(text, {confirm})
      api.agentTurn({ session_id, message, confirm, context })
          message = what the supervisor typed, verbatim
          context = agentContext(workFront, discipline)
                    with data_date overridden by the date field
      -> POST /agent/turn  (backend/server/main.py :: agent_turn)

  PROPOSE TURN   confirm: false
      slot filling, then _match_slots runs the real matcher
      awaiting_confirmation true only when no slot is open
      renders: turn.confidence, turn.match_outcome, slots.activity_id,
               activity_description, quantity/uom, date, tags, location
               an unfilled slot renders an em dash, never a placeholder

  COMMIT TURN    confirm: true       enabled ONLY on awaiting_confirmation
      _existing_agent_submission  -> idempotent on a retry
      _create_event_from_slots    -> LinkedEvent + ReviewQueueItem
      response carries event_created + review_item_id/linked_event_id

  THE GATE       persistedReference(turn)
      event_created AND (review_item_id ?? linked_event_id)
      null  -> failure banner, draft untouched, nothing claimed
      id    -> success screen, naming that id and the matched activity

  FAILURE MODES, both stated and both non-destructive:
      request threw          errorDetail(e) names the host and the reason
      200 without a write    the agent's own agent_message says what is
                             missing

  There is no offline queue, so a failed submission is never described as
  saved. Was: `catch { setSubmitted(true) }`, which turned a pulled cable
  into "Dispatched to Project Controls".

  Pinned by frontend/src/test/fieldStudio.test.tsx (11 tests), whose first
  case is the acceptance condition: a rejected agentTurn cannot produce a
  success screen.
```

---

### Previous modification area (D-090)

**Task:** The executive layer stops inventing figures — eight fabricated
numbers removed from `executive_metrics.py` and the Overview screen, and money
made opt-in.
**Date:** 2026-09-05 · **Decision:** D-090

```
GET /executive/metrics                                            (D-090)
  ?contract_value_cr=          optional, NOT defaulted
  ?prolongation_lakhs_per_day= optional, NOT defaulted

  backend/server/main.py :: get_executive_metrics
      -> executive_metrics.compute_executive_metrics(db, DATA_DATE, **params)

  It aggregates; it derives nothing of its own:
      cpm.compute_schedule(activities)      network, float, early finishes
      evm.compute_evm(db, as_of)            spi, pv_total, ev_total, sources
      delay_events.attribution(db, as_of)   liability days, notices, events

  LIABILITY  read through delay_taxonomy.Liability, never a literal
      COMPENSABLE      -> employer_delay_days
      NON_COMPENSABLE  -> contractor_delay_days
      EXCUSABLE        -> neutral_delay_days
      CONTESTED        -> contested_delay_days
      beyond_float_days reported beside each
      concurrency from delay_data["concurrency"], NOT a liability bucket

  MONEY      financial.available is false unless the operator supplied a
             contract value; then LD = days/7 x 0.5% x value, capped at 10%
             (FIDIC 8.7), and employer claim = days x prolongation rate.
             Absent, the reason is in the payload. No constant, no default.

  COMPLETION baseline_finish   authored latest planned finish
             logic_finish      network.project_finish
             exposed_finish    logic + beyond-float days on critical
                               activities with no actual_finish
             is_probabilistic: false · logic_conflicts: len(conflicts)

  S-CURVE    pv   duration-weighted planned value per week
             ev   0/100 on actual_finish, history only
             ev_projected  planned value extended at measured SPI,
                           null when SPI is null

  DRIVERS    worst DelayEvent per activity by impact_days
             phrase, category, liability, adjudicated, source file+line
             null when nothing is recorded - never inferred from the id

  MILESTONES last planned finish per discipline, plus project finish
             basis: actual_finish | cpm_early_finish | cpm_project_finish
             no confidence field exists

  frontend/src/pages/executive/Overview.tsx
      dash()  renders an unavailable figure as an em dash. Every hardcoded
              fallback (14.20, 3.80, 180.00, 2026-11-12, 84.2, 24, 8) is gone.
      the simulator moves logic_finish by the slider total and prices it
      only against an operator-supplied rate.

  Pinned by backend/server/test_executive_metrics.py (18) and
  frontend/src/test/executiveOverview.test.tsx (12), which assert VALUES -
  the previous tests asserted key presence and the invented literals, and
  passed while the endpoint returned zero.
```

---

### Previous modification area (D-089)

**Task:** Phase 4 — the engine surfaces in the Schedule drawer. Completes the
Granularity Resolution Engine (Phases 0–4).
**Date:** 2026-09-05 · **Decision:** D-089

```
SCHEDULE DRAWER — WHERE THE ENGINE SURFACES                        (D-089)

  frontend/src/pages/Schedule.tsx  AuditDrawer
      DETAIL            (existing)
      QUANTITY LEDGER   QuantityLedgerSection
          useQuery ['quantityLedger', id] -> GET /activity/{id}/quantity
          counted total / planned, over-report flagged when raw > 100
          every contribution: COUNTED or REFUSED, its reason, its citation
          refusal_note rendered FROM THE PAYLOAD, never restated here
      PRODUCTIVITY & FORECAST   ForecastSection
          useQuery ['activityProductivity', id]
              -> GET /activity/{id}/productivity
          forecast finish · baseline · variance · the rate used and why
          all three rates, an unavailable one printing its reason not a zero
          the evidence line: readings, reported days, confirmed qty,
            comparables
          "never written to the schedule" from forecast_note
          a refusal prints "No forecast: <reason>", never a blank panel
      AUDIT TRAIL       (existing)

  No mockup exists for these two sections, so they are assembled from the
  drawer's own vocabulary and both components say so (same gate as D-083).

  ONE STORY, TOP TO BOTTOM, on ELE-CBL-1076:
    ledger    1.2 km REFUSED against a node planned in m
    forecast  +47d, from the elapsed rate, on 1 reading
    audit     finish withheld - evidence accounts for 0.0% of planned qty
  The DPR said the run was complete; the ledger says why nothing counted.

  Pinned by frontend/src/test/schedule-granularity.test.tsx (9 tests).
```

---

### Previous modification area (D-088)

**Task:** Phase 3 of the Granularity Resolution Engine — the forecast.
Remaining quantity over a named rate, with every rate that disagreed listed
beside it, and five refusals that each carry a reason.
**Date:** 2026-09-05 · **Decision:** D-088

```
FORECAST — WHICH RATE, AND WHAT IT MAY CLAIM                       (D-088)

  backend/server/productivity.py  forecast(db, activity_id, as_of)
    built on rates() (D-087); carried on GET /activity/{id}/productivity,
    because "how fast" and "therefore when" are one question
      |
      +-- REFUSALS, each with a reason not an empty object
      |     already_finished                        38
      |     not_started                             53
      |     quantity_complete_awaiting_finish_date   9   D-015 withheld the
      |                                                  finish date; saying
      |                                                  "still running" would
      |                                                  contradict the queue
      |     node_has_no_planned_quantity             1
      |     (forecast produced)                     19
      |
      +-- remaining = planned x (1 - percent_complete/100)
      |     percent_complete is backend/server/evm.py's SHARED four-rule derivation,
      |     so the forecast cannot contradict the progress figure beside it.
      |     Exact subtraction when a quantity was measured: going back through
      |     a rounded percentage turns 1200-800 into 399.6.
      |
      +-- one candidate per usable rate: elapsed, reported, planned,
      |     comparable median. ceil(remaining / rate) days from as_of.
      |
      +-- NOMINATION  observed_elapsed > comparable > planned
            the chosen one carries `why` in prose

  NOTHING IS WRITTEN. A forecast is a projection (D-009, D-078).

  ELE-CBL-1076  66.7%, 400 m left
    2026-10-04 vs baseline 2026-08-18 = +47d, from observed_elapsed 22.22 m/d
    alt planned 85.71 m/d -> 2026-09-20 (+33d)
    evidence: 1 reading, 1 reported day, 800 m confirmed, 0 comparables
  Pinned by backend/server/test_productivity.py (23 tests).
```

---

### Previous modification area (D-087)

**Task:** Phase 2 of the Granularity Resolution Engine — three productivity
rates per activity, plus comparables, and the refusals that keep them honest.
**Date:** 2026-09-05 · **Decision:** D-087

```
PRODUCTIVITY — THREE RATES, NONE OF THEM "THE" RATE                (D-087)

  backend/server/productivity.py  rates(db, activity_id, as_of)
      reads quantity_ledger.ledger() for the per-reading detail, so it adds
      no fourth opinion about which readings count (D-048, D-085)
      |
      +-- planned            planned_qty / planned duration
      +-- observed_elapsed   counted qty / days since Actual Start
      |                        to actual_finish when finished, else as_of
      |                        includes days nobody reported - pessimistic
      +-- observed_reported  counted qty / DISTINCT reported dates
                               two lines on one day are one day
                               REFUSED below MIN_REPORTED_DAYS (2): one day
                               is the whole reading divided by one
      +-- comparables()      same activity-type prefix, completed, measured
                               no average below MIN_COMPARABLES (3)

  every rate carries value / days / quantity / sample_size / note; value is
  None with a reason rather than 0, which would read as "measured, and
  nothing happened"

  GET /activity/{activity_id}/productivity      404 on unknown activity

  WHAT THE CORPUS SUPPORTS after D-086
    38 of 120 activities have a measured quantity, 24 complete
    observed_elapsed on 38 · observed_reported on 11
    comparable prefixes with 3+: CIV-FDN (4), CIV-PLY (3)

  CIV-FDN-1008: planned 8.00 · elapsed 12.00 · reported 90.00 m3/day
                that spread is the honest width of the evidence
  Pinned by backend/server/test_productivity.py (13 tests).
```

---

### Previous modification area (D-085, D-086)

**Task:** Phase 1 of the Granularity Resolution Engine — the quantity ledger,
and the write-path fix it prompted: `actual_qty` now holds a measurement or
nothing, never a quantity back-derived from an asserted percentage.
**Date:** 2026-09-05 · **Decisions:** D-085, D-086

```
actual_qty — A MEASUREMENT, OR NOTHING                            (D-086)

  backend/server/main.py  _apply_rollup_to_schedule()
    was:  new_qty = installed_qty
          if new_qty <= 0 and percent_complete > 0 and planned_qty:
              new_qty = percent_complete / 100 * planned_qty   <- SYNTHESISED
    now:  new_qty = installed_qty                              <- only that
          (still max(current, new) across ingests - monotonic)

  Nothing lost: all 29 affected activities carry a persisted
  LinkedEvent.percentage, so each still scores through percent_complete rule 3
  and now carries the label that names its evidence.

  MEASURED by re-ingesting the corpus
    EV 640.4 -> 640.407 · SPI 0.4984 -> 0.4984 · evidenced SPI unchanged
    installed_quantity      28 -> 14
    linked_event_percentage  1 -> 15      the 14 relabelled
    stored_total_basis   counted_readings 91 -> 120, the other two empty

  Every project figure identical; every stored quantity now attributable to a
  reading. Matters before Phase 2: dividing a percentage-derived quantity by
  elapsed days would be an invented rate in measured units.
```

---

### Phase 1 detail (D-085)

```
QUANTITY LEDGER — THE ARITHMETIC, AND THE REFUSALS          (D-085)

  backend/matching/engine.py  classify_quantity(qty, uom, tags, planned_qty,
                                        planned_uom) -> (counted, code, note)
    pure; no engine, no DB. EXTRACTED from RollupAccumulator.add so the
    accumulation and its explanation cannot use different rules (D-048).
      counted                     +34 m
      digits_belong_to_a_tag      "P-1001" -> 1001 is not a quantity
      uom_mismatch                1.2 km against a node planned in m
      unitless                    "All 12 pockets grouted" -> 12, no unit
      node_has_no_planned_quantity
      no_quantity_reported        NOT a refusal - nothing to refuse

  CALLED BY
    backend/matching/engine.py  RollupAccumulator.add()     when it accumulates
    backend/server/quantity_ledger.py  _contribution()      when it explains

  backend/server/quantity_ledger.py  ledger(db, activity_id)   derived, nothing stored
      contributions[]   every linked event, counted or refused, each with
                        job_id, quantity, uom, percentage, reason, and the
                        file/line/row/span citation
      counted_total     MAX of the per-job sums, because the schedule writes
                        actual_qty = max(current, rolled-up installed)
      naive_sum_all_jobs   every reading added; the difference from
                           counted_total is work reported twice
      stored_total_basis   counted_readings (91) / derived_from_percentage (28)
                           / unattributed (1)
                           -- _apply_rollup_to_schedule back-derives a quantity
                              from an asserted percentage when nothing was
                              counted, so a stored quantity is not always a
                              measurement. Qualifies D-084's source label.
      raw_percent_from_quantity   uncapped, so an over-report is visible

  GET /activity/{activity_id}/quantity   404 on an unknown activity

  FOUND ON THE CORPUS
    ELE-CBL-1076  800/1200 m = 66.7%, and a 1.2 km reading REFUSED for a unit
                  mismatch - 1200 m, which would have completed the node
    CIV-FDN-1008  120 m3 in one ingest, 180 in another; max keeps 180 against
                  a planned 120, which is the 150% D-084 caps
  Pinned by backend/server/test_quantity_ledger.py (17 tests).
```

---

### Previous modification area (D-084)

**Task:** Phase 0 of the Granularity Resolution Engine — earned value now reads
the installed quantity the roll-up already measured. A defect fix: eleven
in-progress activities were scoring 0% with reported quantity progress.
**Date:** 2026-09-05 · **Decision:** D-084

```
PERCENT COMPLETE — ONE DERIVATION, FOUR RULES                     (D-084)

  backend/server/evm.py  percent_complete(activity, event_percentages)
      1. actual_finish set                    -> 100%   actual_finish
      2. quantity_ratio(activity), CAPPED     -> ratio  installed_quantity NEW
           installed / planned, both present, planned > 0
           mirrors RollupAccumulator, which prefers a measured quantity
           over an asserted one for the same reason
      3. max(LinkedEvent.percentage)          -> value  linked_event_percentage
      4. otherwise                            -> 0%     no_evidence_floor

  CALLED BY
    backend/server/evm.py    compute_evm()          EV, SPI, evidence coverage
    backend/server/main.py   get_schedule()         NEW - it had a THIRD derivation
                                            inline (max percentage, no
                                            actual_finish rule, no quantity
                                            rule) and disagreed with EVM about
                                            the same activity. Now one place.
                                            A no-evidence activity renders
                                            null there, not 0%.

  OVER-INSTALLATION
    quantity_ratio() is uncapped; percent_complete caps at 100 for EV.
    compute_evm collects raw > 100 into `quantity_overruns` REGARDLESS of
    which rule scored the node - CIV-FDN-1008 finishes at rule 1 and never
    reaches rule 2, yet 180/120 m3 is still a linking fault.

  PERCENT_SOURCES tuple drives EVMFigures.as_dict, which previously named its
  three keys by hand and silently dropped the fourth.

  MEASURED  EV 554.0 -> 640.4 · SPI 0.4311 -> 0.4984 · coverage 45% -> 55%
            no_evidence_floor 64 -> 53 · evidenced SPI 0.9503 -> 0.9033 (down,
            because the excluded activities were the late ones)
  Pinned by backend/server/test_evm.py (29 tests).
```

---

### Previous modification area (D-083)

**Task:** Phase 7 — the planner screen at `/delay`. The chain that proposes a
liability, a notice window, a concurrency reading and a float split now has a
place where a human rules. Completes the Contractor Dispute Shield.
**Date:** 2026-09-04 · **Decision:** D-083

```
DELAY SCREEN — WHERE THE PROPOSALS GO                             (D-083)

  frontend/src/App.tsx      PLANNER_NAV + <Route path="/delay">
  frontend/src/lib/role.ts  planner.allows gains '/delay'

  frontend/src/pages/Delay.tsx
      useQuery ['delayAttribution']   GET /delay/attribution, 3s poll
        |
        +-- header      delays classified / carrying a ruling /
        |               days recorded vs days BEYOND FLOAT /
        |               notice windows closed
        |               caveat text comes from the API's impact_days_basis,
        |               never restated here, so screen and report cannot drift
        +-- banner      network.logic_matches_dates === false ->
        |               27 broken ties, both finish dates, "advisory"
        +-- ConcurrencyPanel   pairs, status, and the both_beyond_float reading
        +-- queue       one row per delay: activity, effective liability,
        |               the word "proposal" when unruled, FloatLine, NoticeLine
        +-- detail      evidence verbatim + file/row citation
                        Proposed AND Ruled side by side (an override reads
                          as an override)
                        4 ruling buttons, id=`rule-${liability}`
                          -> api.classifyDelay   POST /delay/{id}/classify
                        date + reference -> api.recordDelayNotice
                          -> POST /delay/{id}/notice
                        both invalidate ['delayAttribution'] and ['auditRecent']

  Report links are plain <a>, not <Button to=...>: `to` renders a
  react-router Link and the report is served from the API origin.

  Composers clear when the selection MOVES, not when it first arrives — the
  auto-select lands a render after the pane, and clearing then wiped anything
  typed in that window.

  Pinned by frontend/src/test/delay.test.tsx (14 tests).
```

---

### Previous modification area (D-082)

**Task:** Phase 6 — the critical-path pass. Each slip is split into float
consumed and delay beyond float, so the report can say which days could have
moved the completion date. Completes the Contractor Dispute Shield (Phases 0–6).
**Date:** 2026-09-04 · **Decision:** D-082

```
FLOAT — LATENESS IS NOT DELAY                                     (D-082)

  backend/server/cpm.py  compute_schedule(activities)      pure; no DB, no I/O
    reads activity_id, planned_start, planned_finish, predecessor_links()
      |
      +-- _topological_order()   Kahn. Cycles are EXCLUDED and named in
      |                          `unresolved`, never half-traversed.
      +-- forward pass    ES/EF, inclusive dates, calendar days
      |     open starts anchored at their authored planned_start
      |     FS  ES_s >= EF_p + 1 + lag        SS  ES_s >= ES_p + lag
      |     FF  EF_s >= EF_p + lag            SF  EF_s >= ES_p + lag
      +-- backward pass   LS/LF from max(EF); total_float = LF - EF
      +-- logic_conflicts  ties the AUTHORED dates break
                           27 of 146 on dataset/baseline_schedule.json,
                           logic finish 2026-10-12 vs authored 2026-09-28
                           BOTH reported; neither quietly preferred

  backend/server/cpm.py  split_slip(slip, total_float) -> (consumed, beyond)
      float None  -> (0, slip)    credits NO slack it cannot prove
      float < 0   -> (0, slip)    already behind the network
      otherwise   -> (min, rest)

  delay_events.sync_delay_events()   one network pass per sync, not per delay
      DelayEvent.activity_total_float / float_consumed_days /
                 beyond_float_days / on_critical_path      all derived

  Surfaced in:
    GET /delay/attribution   beyond_float_days + adjudicated_beyond_float_days
                             per liability, float_basis, network{...},
                             concurrency pairs gain both_beyond_float
    GET /delay/report        "Beyond float" column and its one-line reading,
                             a "Baseline network" block, a red line when the
                             authored dates break their own ties, a per-row
                             "absorbed by Nd float" / "Nd beyond float",
                             and two more caveats

  Demo corpus: 43 recorded days, ONE beyond float - the 1-day critical rig
  breakdown. The 21d and 20d slips were absorbed by 100d and 57d of float.
  Pinned by backend/server/test_cpm.py (23 tests) and TestFloatConsumption (9).
```

---

### Previous modification area (D-081)

**Task:** Phase 5 — concurrent delay. Delays open over the same period are
paired, classified and cited in `GET /delay/attribution` and in the report,
and deliberately not apportioned.
**Date:** 2026-09-04 · **Decision:** D-081

```
CONCURRENT DELAY — NAMED, NEVER APPORTIONED                       (D-081)

  delay_events.concurrency(db, rows)      called from attribution(), no
                                          endpoint of its own
      |
      +-- _overrun_window(activity)   planned_finish -> actual_finish
      |     None when the activity did not overrun, so finishing early
      |     cannot manufacture an overlap. This is the only window the data
      |     supports: a daily report names a cause, never a duration.
      |
      +-- combinations(windowed, 2), keep pairs whose windows intersect
      |
      +-- kind
      |     SAME_ACTIVITY       two causes on one slipped activity. They
      |                         share its overrun by construction and the
      |                         evidence does not divide it. THE dispute.
      |     OVERLAPPING_WINDOW  different activities, overlapping in time.
      |                         Temporal only - whether both moved the
      |                         completion date needs a critical-path pass
      |                         this system does not perform (Phase 6).
      |
      +-- status  from the two EFFECTIVE liabilities
      |     either CONTESTED -> UNRESOLVED   (surfaced BEFORE the ruling)
      |     differ            -> CONFLICT
      |     equal             -> ALIGNED     (reported anyway)
      |
      +-- overlap_days INCLUSIVE; days are NOT summed across a pair, because
            each side already carries its activity's whole slip (D-077)

  pairs[] capped at MAX_CONCURRENCY_PAIRS (50), longest first;
  total_pairs is always the true count.

  Surfaced in:
    GET /delay/attribution   concurrency{pairs,total_pairs,counts,note}
    GET /delay/report        "Concurrent delay" section, or an explicit
                             "No two delays ... open over the same period",
                             plus a sixth caveat: named, never apportioned

  Demo corpus, one overlap, meaning changes as the planner rules:
    both CONTESTED                          -> UNRESOLVED
    CIV-DWG-1015 ruled COMPENSABLE          -> UNRESOLVED (other side unruled)
    CIV-FLR-1020 ruled NON_COMPENSABLE      -> CONFLICT, 12 days 2026-08-12..23
  Pinned by backend/server/test_delay_attribution.py TestConcurrentDelay (10 tests).
```

---

### Previous modification area (D-080)

**Task:** Phase 4 — the contractual notice clock. Each delay gains the date it
was evidenced, how that date was established, and the date notice falls due;
`POST /delay/{id}/notice` records a notice given, and the report raises a
closed window on its face.
**Date:** 2026-09-04 · **Decision:** D-080

```
NOTICE CLOCK — WHICH DATE DOES IT START FROM?                     (D-080)

  delay_events._evidenced_on(db, audit_record, activity)
      |
      +-- AuditRecord.linked_event_id -> LinkedEvent.reported_date
      |        basis REPORTED       the only date a SOURCE asserted
      +-- else Activity.actual_finish
      |        basis ACTUAL_FINISH  inference: cannot have learned later
      +-- else AuditRecord.timestamp.date()
      |        basis RECORDED       measures the loader, not the project
      +-- else (None, None)         -> NoticeStatus.UNKNOWN

  notice_due_on = evidenced_on + NOTICE_WINDOW_DAYS (28, FIDIC 1999 20.1)
  written by sync_delay_events on every ingest, alongside category/impact

  notice_status(row, as_of)      as_of is DATA_DATE, passed explicitly
      notice_served_on set   -> SERVED
      no due date or no as_of -> UNKNOWN   (never "today")
      as_of > due             -> LAPSED
      otherwise               -> OPEN

  POST /delay/{delay_event_id}/notice   { served_on, reference?, recorded_by? }
      delay_events.record_notice()  sets notice_served_on / notice_reference
      main.py _write_audit()  field_changed "delay_notice",
                              source planner_review, auto_applied False,
                              old_value = previous served date
      a date AFTER the deadline is accepted and returned served_late=true
      NOT cleared by a re-sync - same rule as liability_final

  Surfaced in:
    GET /delay/attribution   notice_counts / notice_lapsed_days /
                             notice_as_of / notice_note, per-event status
    GET /delay/report        a "Contractual notice" table, a red alarm line
                             when any window has closed, a per-row notice line,
                             and a fifth caveat naming FIDIC as the default

  Demo corpus: basis REPORTED on all four; 2 LAPSED (-47d, -36d), 2 OPEN
  (+15d, +5d). None of this was visible before this phase.
  Pinned by backend/server/test_delay_attribution.py TestTheNoticeClock (10 tests).
```

---

### Previous modification area (D-079)

**Task:** Phase 3 — the Delay Attribution Report. `GET /delay/report` renders
the classified delays as a printable HTML document and as CSV, stamped with the
data date and baseline sha256 and carrying its own caveats. This completes the
core delay-attribution layer (Phases 0–3).
**Date:** 2026-09-04 · **Decision:** D-079

```
DELAY ATTRIBUTION REPORT — ONE COMPUTATION, TWO RENDERINGS       (D-079)

  GET /delay/report?format=html|csv&discipline=...      READ-ONLY
      |
      +-- delay_report.report_context(db, discipline, data_date=DATA_DATE)
      |     delay_events.attribution()          the rows and the totals
      |     BaselineVersion is_active           name / filename / sha256
      |     Activity counts                     "67 of 120 carry actuals"
      |     grouped by EFFECTIVE liability, in LIABILITY_ORDER
      |         COMPENSABLE, NON_COMPENSABLE, EXCUSABLE, CONTESTED
      |
      +-- to_html(context)   Response(media_type="text/html")   inline
      |     self-contained: no external CSS, no script, no font host,
      |     @page A4 - it has to print for someone with no network
      |     empty bucket prints "No delays attributed here on this evidence."
      |     a ruled row prints "Ruled by <name>, overriding the proposed <X>"
      |
      +-- to_csv(context)    StreamingResponse, Content-Disposition attachment
            filename  navis-delay-attribution-<data_date>-<sha8>.csv
            data_date / baseline_sha256 / generated_at repeated PER ROW
              (RFC 4180 has no comments; a pasted row still names its schedule)
            liability_proposed and liability_ruled are separate columns

  CAVEATS is one constant read by both renderings, so the document and the
  export cannot drift into saying different things about the same numbers.

  Demo output: 4 delays, 43 days, 21 ruled COMPENSABLE (CIV-DWG-1015),
  months 2026-07 2d / 2026-08 20d / 2026-09 21d.
  Pinned by backend/server/test_delay_attribution.py TestTheReport (12 tests).
```

---

### Previous modification area (D-078)

**Task:** Phase 2 of the delay-attribution layer — a planner rules on who
carries a delay through `POST /delay/{id}/classify`, and the ruling appends an
`AuditRecord` rather than only setting a column.
**Date:** 2026-09-04 · **Decision:** D-078

```
DELAY ADJUDICATION — PROPOSAL BECOMES FINDING                     (D-078)

  POST /delay/{delay_event_id}/classify   { liability, note?, adjudicated_by? }
      |
      +-- delay_taxonomy.parse_liability()   4 values, case-insensitive
      |     anything else -> HTTP 400, and NO audit row is written
      |
      +-- 404 when the delay event is unknown
      +-- 400 when the row names no activity (unreachable on real data:
      |        every DelayEvent derives from an AuditRecord, which always
      |        names one) - a ruling that cannot be audited is not written
      |
      +-- delay_events.adjudicate(row, liability, note, by, at)
      |     sets liability_final / adjudicated_by / adjudicated_at / note
      |     RETURNS the previous ruling, for the audit row's old_value
      |
      +-- main.py _write_audit()
            field_changed  "delay_liability"
            old_value      previous ruling, else the machine proposal
            new_value      the planner's ruling
            source         "planner_review"      auto_applied  False
            source_file / line / row / span   copied from the delay event
            contributing_sources  category, phrase, proposal, planner note
      |
      +-- response  overrides_proposal = (ruling != liability_proposed)

  NO ACCEPT SHORTCUT. A planner who agrees sends the same value; the trail
  then shows a human agreed rather than a default nobody read.

  RE-RULING APPENDS. The second record's old_value is the FIRST ruling, not
  the proposal, so an overturned decision reads as one (D-004).

  Reflected immediately in GET /delay/attribution:
    adjudicated_events  0/4 -> 1/4
    adjudicated_days    COMPENSABLE 21   (CIV-DWG-1015, civil_progress row 18)

  Pinned by backend/server/test_delay_attribution.py TestAdjudication (7 tests).
```

---

### Previous modification area (D-077)

**Task:** Phase 1 of the delay-attribution layer — delay text in the audit
trail becomes persisted, classified `DelayEvent` rows, exposed by a read-only
`GET /delay/attribution`. One scan of the audit trail now feeds three readers.
**Date:** 2026-09-04 · **Decision:** D-077

```
DELAY ATTRIBUTION — ONE SCAN, THREE READERS                       (D-077)

  backend/server/raid.py  delay_observations(db)          THE SINGLE SCAN
    key = (phrase, activity_id, source_file, source_span)
    value = every AuditRecord carrying that span
         |
         +--> raid.delay_evidence()               aggregate per phrase
         |      |                                 (return shape unchanged)
         |      +--> main.py _compute_delay_reasons()   GET /memory/query
         |      |        + category / liability from delay_taxonomy lookups
         |      |          (pure - reads NO DelayEvent rows)
         |      +--> raid.propose_candidates()           GET /raid/candidates
         |
         +--> delay_events.sync_delay_events(db)   MATERIALISE
                one observation -> one DelayEvent row, upserted on the key
                derived every run:  category, liability_proposed, month,
                                    impact_days, citation, discipline
                NEVER written here: liability_final, adjudicated_by/at, note
                                    (a planner's ruling survives every re-sync)
                    |
                    +--> delay_events.attribution(db)
                             GET /delay/attribution   READ-ONLY, writes nothing
                             adjudicated_days   rulings only
                             proposed_days      every row, effective liability
                             days_by_month      the seasonality §2.7 promised

  WRITE POINTS (the only places sync runs)
    main.py ingest_file()            after _apply_rollup_to_schedule
    main.py resolve_review_item()    before its commit
    main.py _resolve_defaulted_finish()  before its commit
                                     — a resolution moves finish variance,
                                       which impact_days is derived from

  backend/server/demo.py clear_progress()  deletes DelayEvent first: the rows cite
                                   AuditRecord ids and are meaningless without
                                   them. They return on the next ingest.

  Demo corpus after reset_demo.py: 4 events, 43 days, 41 of them CONTESTED.
  Pinned by backend/server/test_delay_attribution.py (15 tests).
```

---

### Previous modification area (D-076)

**Task:** Phase 0 of the delay-attribution layer — the ARCHITECTURE §2.7 delay
taxonomy and its liability map, built as pure data beside the existing delay
vocabulary. No behaviour change: the RAID register's categories are unmoved.
**Date:** 2026-09-04 · **Decision:** D-076

```
DELAY TAXONOMY — THREE MAPS, KEPT SEPARATE                        (D-076)

  backend/server/delay_taxonomy.py           pure data, no DB, no I/O

    DELAY_KEYWORDS  12 phrases, moved verbatim from backend/server/raid.py
         |          re-exported as server.raid.DELAY_KEYWORDS (same object)
         |
         +-- PHRASE_CATEGORY      phrase -> DelayCategory (the §2.7 ten)
         |        |
         |        +-- LIABILITY   DelayCategory -> Liability
         |                          COMPENSABLE      DRAWING_RFI, CLIENT_HOLD,
         |                                           FRONT_NOT_AVAILABLE
         |                          NON_COMPENSABLE  EQUIPMENT, MANPOWER,
         |                                           REWORK_NCR
         |                          EXCUSABLE        WEATHER
         |                          CONTESTED        MATERIAL, PERMIT_HSE,
         |                                           OTHER   <- no default,
         |                                           a planner rules (Phase 2)
         |
         +-- REGISTER_CATEGORY    phrase -> RAID category string, UNCHANGED
                  read by backend/server/raid.py propose_candidates()
                  "fencing conflict" -> "interface" here
                                     -> OTHER/CONTESTED in the taxonomy
                  They disagree on purpose and are asserted to disagree.

  Liability is a lookup in source, never a model output — D-006 one level up.
  An LLM may later widen RECOGNITION of unknown phrases; it never assigns
  liability.

  Pinned by backend/server/test_delay_taxonomy.py (44 tests).
```

---

### Previous modification area (D-073 .. D-075)

**Task:** The Reconcile screen's three resolve actions were corrected to the
server's action vocabulary, closing the three P0s that D-072 recorded as open.
`backend/scripts/healthcheck.py` had its stale 8-endpoint assertion pinned to the real
30 (D-074). A re-proposal of the alias-lexicon read path was refused and D-061
pinned on the served engine (D-075) — no execution path changed by that entry.
**Date:** 2026-09-04 · **Decisions:** D-073, D-074, D-075

```
RECONCILE RESOLVE — CLIENT BODY -> SERVER BRANCH                  (D-073)

  frontend/src/pages/Reconcile.tsx
    handleConfirm()
      selectedCandidate === selectedItem.activity_id
        |                     (suggested_activity_id is projected FROM
        |                      item.activity_id in get_review_queue)
        +-- yes -> { action: 'confirm' }
        |            backend/server/main.py resolve_review_item confirm branch
        |            commits item.activity_id, writes linked_event_confirmed
        +-- no  -> { action: 'reassign', activity_id: selectedCandidate }
                     writes event_reassigned carrying the OLD activity_id
      reason === 'defaulted_finish_date' -> always 'confirm'
                     _resolve_defaulted_finish 400s on anything else

    handleNew()   -> { action: 'create',
                       new_activity_id: NEW-<DISC>-<item.id[0:6]>,
                       new_description: trimmed }
                     id derived from the item, never Date.now(): stable across a
                     retry, so a duplicate is a visible 409 not a second row
                     newMode/newDesc cleared in onSuccess only

    handleReject() -> { action: 'ignore' }  on the second armed press

  backend/server/schemas.py ReviewQueueItemResponse gained `discipline`
  backend/server/main.py    get_review_queue projects le.discipline
  frontend/src/types.ts ReviewItem gained `discipline?: string | null`

  frontend/src/test/reconcile.test.tsx  +5 tests asserting the request BODY —
  the assertion class whose absence let this pass 912 backend tests
```

```
ALIAS CHANNEL — WHY get_matching_engine() TAKES NO Session           (D-075)

  backend/server/main.py  get_matching_engine()      no db parameter, by decision
    _MATCHING_ENGINE singleton, built once per process
    config = production(index.baseline.sha256)   -> alias_lexicon None
                                                    retrieval.w_alias 0.0
         |
         +-- HybridRetriever.alias_channel() exists and is correct, but
         |   cfg.use_alias is False so it is never in the channel dict
         |
         +-- backend/server/main.py _upsert_alias() still WRITES every resolve
             AliasLexicon rows = audit record + future training data (D-061)

  Pinned twice, at two levels:
    backend/matching/test_config_floor.py TestAliasChannelStaysOff  library DEFAULTS
    backend/server/test_server.py TestServedEngineKeepsTheAliasChannelOff
                                                       the SERVED engine,
                                                       incl. the singleton
```

---

### Previous modification area (D-072)

**Task:** The three untracked design documents were refreshed against the
current HEAD and committed. Documentation only — no application code changed.
**Date:** 2026-09-03 · **Decision:** D-072

```
DESIGN BRIEF → THE CONTRACT THE FRONTEND DOES NOT YET HONOUR      (D-072)

  Design/NAVIS_BACKEND_UI_AUDIT.md   basis commit ca63ba0, all links pinned
    §4 Status column: open / partly closed / closed (+ closing commit)
         |
         +-- 3 x P0 still open, and the 394-test suite cannot see them:
         |     frontend/src/pages/Reconcile.tsx L331  action 'confirm'
         |       + activity_id  ->  backend/server/main.py L1474 reads item.activity_id
         |                          and never req.activity_id
         |     frontend/src/pages/Reconcile.tsx L348  action 'new_activity'
         |       ->  backend/server/main.py L1558 wants 'create'
         |           + new_activity_id + new_description
         |     frontend/src/pages/Reconcile.tsx L368  action 'reject'
         |       ->  backend/server/main.py L1612 wants 'ignore', else 400
         |
         +-- 1 x P1 partly closed: executive Overview banner exists but keys
         |     on percent_source_counts.no_evidence_floor, not on the server's
         |     spi_headline_safe (backend/server/evm.py L259). frontend/src/types.ts
         |     L466 still names it headline_safe / headline_warning and omits
         |     evidence_coverage and evidenced_subset entirely
         |
         +-- 2 x P1 closed by d0bcede (Force Mobile View removed;
               FieldProfile signOut clears navis.role)

  prompts.md                          the generation input, Prompt 01 first
  Design/NAVIS_STITCH_PROMPTS.md      superseded, kept for its endpoint notes

  backend/server/qa_agent.py is merged and imported by nothing: it appears in neither
  backend/server/main.py nor frontend/src/lib/api.ts. GET /agent/llm-status (L3311)
  is a different module's health probe and does not imply QAAgent is wired.
```

---

### Previous modification area (D-064 .. D-071)

**Task:** Two strands landed together. (a) The demo script was realigned to
the three-role application, and the four defects found while walking it were
fixed. (b) The optional LLM path's one unvalidated field was closed, model
provenance now reaches the audit trail, and the path became checkable from
outside the process.
**Date:** 2026-09-03 - **Decisions:** D-064 .. D-071

```
DELAY CAUSES — ONE COUNTER, TWO SCREENS            (D-071)

  backend/server/raid.py  delay_evidence(db)
    one occurrence = one (activity_id, source_file, source_span)
    NOT one audit row: a single spreadsheet row writes actual_start,
    actual_finish and actual_qty from the same sentence
    NOT keyed on line/row: the quantity write records source_row=None
    while the date writes record 23, so the locator splits one
    observation back into two
         |
         +-- backend/server/main.py  _compute_delay_reasons()  -> GET /memory/query
         +-- backend/server/raid.py  propose_candidates()      -> GET /raid/candidates
    they reported 2 and 3 for the same evidence before this; both now
    report 1, and the copy says "report" rather than "occurrence"
```

```
1. THE AGENT SLOT LOOP THAT ATE A CONFIRM              (D-066, server)

   POST /agent/turn -> agent_turn()                    backend/server/main.py
     _abandon_exhausted(slots)   <-- NEW, and it must run FIRST
         writes slots.abandoned_slots, which nothing resets
     pending = _next_missing(slots)
         _exhausted(name) = name in abandoned_slots
                            OR (asked_slot == name AND ask_count >= 2)
         ^ the second half alone lasted one turn: the `else` branch below
           clears asked_slot and ask_count, so the skip was forgotten
     if pending:
         ask the question
         if req.confirm:  say WHY it cannot be sent   <-- NEW
                          (it used to be dropped in silence)
     else:
         asked_slot = None; ask_count = 0
         _match_slots() ; then commit when req.confirm

   _fill_slots() answering == "planned_quantity":      backend/server/main.py
     a bare number now fills planned_quantity          <-- NEW
     (parse_quantity reports a lone figure as *completed*, and
      _merge_quantity dropped it when quantity was already set, so the
      question "How many were planned in total?" had no valid answer)

2. THE ROLE DECIDES THE APPLICATION                    (D-067, frontend)

   App()                                               frontend/src/App.tsx
     was: role === 'field' || device === 'mobile'  ->  MobileShell
     now: role === 'field'                         ->  MobileShell
          role === 'executive'                     ->  DesktopShell + EXEC nav
          otherwise                                ->  DesktopShell + PLANNER nav
     removed: Force Mobile View, the PLANNER|FIELD pill, Force Desktop View
     SessionContext { role, signOut }              hooks/useSession.ts (new)
       -> FieldProfile "Return to role selection" now actually signs out

3. WHO DECIDED AN AUDIT RECORD                         (D-068, frontend)

   auditActor(record)                                  frontend/src/lib/audit.ts
     source === 'planner_review'  -> 'planner'  "Confirmed by planner"
     auto_applied                 -> 'auto'     "Auto"
     otherwise                    -> 'recorded' "Recorded, not applied"
     read by Schedule.tsx (audit drawer) and Home.tsx (recent activity)
     ^ auto_applied === false was rendered as a planner confirmation; on a
       clean reset that was 67 of 275 rows, every one source = "matching"

4. THE REGISTER GETS ITS WRITER                        (D-069, frontend)

   /raid  ->  Raid.tsx                                 frontend/src/pages/Raid.tsx
     GET  /raid/candidates  -> proposals  (envelope: {candidates, note})
     POST /raid             -> accept one into the register
     PATCH /raid/{id}       -> close an entry
     exposure is NEVER computed in the browser; probability is never invented;
     impact_days is sent only for kind === 'risk' (backend/server/raid.py refuses it
     on an issue rather than dropping it)
     -> the accepted row shows on Senior Management's Exposure page

   clear_progress()                                    backend/server/demo.py
     now deletes RaidItem too, so a rehearsal cannot leave an entry citing
     audit evidence the reset has just removed
```

```
THE ONE LLM FIELD THAT WAS NOT RE-VALIDATED — now closed

  POST /agent/turn
    └─ _fill_slots()                             backend/server/main.py
         └─ agent_llm.interpret(message, backend)
              └─ _validate(outputs, message)     backend/server/agent_llm.py
                   discipline  -> DISCIPLINE_VALUES membership     (was checked)
                   status      -> parse_status()                   (was checked)
                   tags        -> parse_tags()          (D-006)    (was checked)
                   description -> .strip()[:500]        <<< WAS THE HOLE
                                  now _validate_description(cand, message):
                                    grounding >= 0.75 of tokenize(desc)
                                    no ACTIVITY_ID_RE match        (D-006)
                                    no control chars / markup / instructions
                                    <= 160 chars, cut on a word boundary

  PROVENANCE, carried the way date_basis already is

    LLMSuggestion.suggested_fields                 backend/server/agent_llm.py
      -> SlotState.llm_suggested_fields            backend/server/schemas.py
      -> AgentTurnResponse.llm_suggested_fields    (API only; no UI reads it)
      -> LinkedEvent.llm_assisted_fields           backend/server/db.py  (new column)
      -> AuditRecord.llm_assisted_fields           backend/server/db.py  (new column)
           written by _write_audit(), reached from
           _apply_confirmed_event_to_schedule() and _apply_rollup_to_schedule()
           when POST /review/{id}/resolve commits the event
      NULL, never "[]", on rules-only work.

  WHAT STILL CANNOT COME FROM A MODEL (D-006, regression-tested)

    activity_id   <- MatchingEngine.match_event() only
    confidence    <- MatchingEngine.match_event() only
    tags          <- parse_tags() / regex prepass only
    dates         <- parse_date() only
    schedule      <- POST /review/{id}/resolve only

  GET /agent/llm-status                            backend/server/main.py
    └─ agent_llm.probe()  — bounded like interpret(); reports enabled,
       provider, reachable (null when off), detail, timeout_seconds.
       Never a key, never a base URL.
```

```
THE ALIAS LOOP — write path exists, read path deliberately NOT wired

  POST /review/{id}/resolve          backend/server/main.py:1783-1793
    └─ _upsert_alias()  ──────────>  alias_lexicon table   (rows ARE written)
                                       │
                                       x   NOTHING reads them into the engine
                                       │
  get_matching_engine()              backend/server/main.py:441
    └─ production(sha) -> DEFAULT      alias_lexicon = None,  w_alias = 0.0
         │
  HybridRetriever.build_pool()       backend/matching/retrieval.py:380
    └─ if cfg.use_alias:  ─────────>   FALSE, so alias_channel() never runs
         alias_channel()              backend/matching/retrieval.py:281  (exists, tested)

  WHY it is not wired (D-061):
    alias_key() is exact normalised text  backend/matching/textutils.py:145
      -> 0 of 185 test mentions match a train key
      -> 16 of 793 distinct keys repeat in the whole corpus
    AND fusion recall@20 = 100% (D-027): the gold is ALWAYS in the pool, so a
    RETRIEVAL channel has nothing left to add, whatever its key.
    backend/matching/features.py has NO correction-derived feature — the ranking stage,
    which is where the signal would have to live, was never given it.

RECALL HEADROOM — three directions, all closed (D-062)

  thresholds   backend/eval.py precision_at_coverage()   0.775 is the exact knee
                 0.750 -> auto-precision 97.9%   (floor breached)
  retrieval    recall@20 = 100%                  saturated
  ranking      EngineConfig(extra_features=True) on v1:
                 coverage 50.39% -> 53.54%, auto-precision 100% -> 94.85%,
                 7 wrong auto-links            DISQUALIFIED
               production(sha) is the ONLY legitimate route: extra_features
               paired with a ranker fitted on the SAME baseline, guarded by a
               sha256 check that refuses a mismatch  backend/matching/config.py:131

---

### Also completed this session

**Task:** Evaluation metrics (classification + regression), the first evaluation
of the duration-suggestion feature, and a read-only Q&A agent over project data.
**Date:** 2026-09-02 - **Decisions:** D-058, D-059, D-063

```
backend/evalstats.py   (appended, D-058)
  confusion_counts / precision / recall / accuracy / f1   classification
  rmse / mae / r2                                         regression
  -> undefined returns None, never 0.0
  -> r2 returns None on a zero-variance target (0/0)
  -> accuracy documented as never-quotable under class imbalance

backend/evalduration.py  (new, D-059)
  evaluate_duration_predictions(rows, predictor=baseline_planned_mean)
    rows = GET /memory/query -> duration_distribution[]
    scores predictor vs actual_mean_days, per activity type
    ├─ excludes actuals_count == 0            (counted: no_actuals)
    ├─ excludes predictor -> None             (counted: no_prediction)
    ├─ excludes non-numeric actual            (counted: malformed)
    ├─ MIN_N_FOR_R2 = 8   below it r2 is WITHHELD, not computed
    └─ bootstrap_ci() from evalstats on every reported figure
  format_duration_report(result) -> fixed-width table, n on every line

backend/server/qa_agent.py  (new, D-063)
  QAAgent(generate: Callable[[str], str] | None)     __slots__ = ("_generate",)
    .answer(question, data) -> {answer, citations, grounded, model_available}
      _build_facts(data)          facts computed in PYTHON from
        ├─ delay_reasons          /memory/query
        ├─ duration_distribution  /memory/query
        ├─ productivity           /memory/query
        ├─ suggested_duration     /memory/query
        └─ evm                    /evm  -> _coverage_fraction() accepts the
                                   REAL nested {fraction: ...} object
      _select(facts, question)    topic + entity match; none -> grounded=False
      generate(_build_prompt(..)) model PHRASES only
        └─ _accept()              rejects any number not in the facts, and any
                                  withheld SPI figure -> falls back to
                                  deterministic phrasing
      exception / generate=None   -> grounded figures, model_available=False
  NO database handle. NO write path. Public surface is answer() alone.

---

### Previous area (retained for context)
```

### Verification for this area

```
python -m pytest -q      678 passed  (634 upstream + 39 eval-metrics + 5 config-floor)
python backend/eval.py           auto-link precision 100.0%, coverage 50.4% - UNCHANGED
                         (no production behaviour was altered by either branch)
```

---

### Previous area (retained for context)

**Task:** Frontend defect fixing — restore React type checking, guard every
browser-storage access, add an error boundary, and make the export download.
**Date:** 2026-09-02 - **Decisions:** D-053, D-054, D-055, D-056

### What runs now that did not before

```
main.tsx
  <ErrorBoundary>                        src/components/ErrorBoundary.tsx
    └─ <QueryClientProvider>             any render throw below is CAUGHT
         └─ <RouterProvider>             (previously: white screen, no message)

Shell mount
  useDevice()                            src/hooks/useDevice.ts
    ├─ sessionOverride  (module-level)   survives an unwritable localStorage
    └─ readStored/writeStored            src/lib/storage.ts  ── total, never throw
  useTheme()                             same helper; no raw localStorage in src/

Schedule "Export"                        src/pages/Schedule.tsx
  POST /schedule/export -> { download_url: "/uploads/{file}" }
    └─ getBaseUrl() + download_url       src/lib/api.ts (getBaseUrl now EXPORTED)
         └─ programmatic <a download>.click()
              + visible <a href download> fallback link
                                         GET /uploads/{filename}  backend/server/main.py

Field text entry                         src/pages/field/TextInput.tsx
  Enter  ──> if (!disabled) onSend()     disabled = !typed.trim() || thinking
  Send   ──> if (!disabled) onSend()     the two paths now agree
    └─ send(typed)  Field.tsx:104        POST /agent/turn  (one turn per session)
```

```
Any Home panel / tile                    src/pages/Home.tsx
  useQuery(...)  ──> queryView(q)        src/lib/queryState.ts
       ├─ kind 'error'   -> <ErrorState error=...>   (q.error ?? q.failureReason)
       ├─ kind 'pending' -> <Skeleton>               (status === 'pending')
       └─ kind 'ready'   -> <List items={data}>      genuinely empty stays empty
  NEVER keyed on isLoading: that is isPending && isFetching, so it is false
  between retries while error is still null — the gap that rendered an
  unreachable API as "Queue clear". D-057.
```

### Verification gate for this area

`cd frontend` then:

```
node_modules/typescript/bin/tsc --noEmit     strict:true — 0 errors
node_modules/vitest/vitest.mjs run           8 files, 76 tests, 0 failures
node_modules/vite/bin/vite.js build          467 kB / 135 kB gzip
```

The type check is only meaningful as of D-053. Before that commit it passed
while verifying nothing about React, because `@types/react` was absent and
TypeScript resolves an unresolvable module to `any`.

---

### Previous area (retained for context)

**Task:** Restructure the Tier 1 demo-path screens so each answers one question
and offers one primary action. Layout, hierarchy and composition may change;
API contracts, endpoint shapes and backend calls may not.
**Date:** 2026-09-01 - **Decisions:** D-039

### The blocker, first

```
LinkedEvent (backend/server/db.py)
  match_method  266   ──┐
  margin        269   ──┼─> LinkedEventResponse (schemas.py 47/53/54)
  rationale     270   ──┘     populated main.py 1230/1236/1237
                              |
                              v
                        GET /jobs/{job_id}  ────> Ingest "Why" column  ✅ WIRED
                              |
                              x
                        GET /review-queue   ────> Reconcile            ❌ BLOCKED
                        ReviewQueueItemResponse (schemas.py 80-93)
                        projects 6 fields off the SAME `le` at main.py:1264
                        but not these three
```

`components/MatchReasoning.tsx` is built and mounted on both screens. On Ingest
it renders real values. On Reconcile it renders the "endpoint does not supply
this" statement — never a fabricated score. See D-039 for the exact three-line
backend change.

### Current path - Tier 1 screens after the change

```
main.tsx  QueryClient
  refetchInterval 3000 for:
    reviewQueue · schedule · jobs · conflicts · auditRecent   <- last two NEW
        |
        v
App.tsx  useDevice() -> DesktopShell | MobileShell
  DesktopShell
    usePageHeader publishes {title, subtitle, path} in useLayoutEffect
    shell renders it only while path === location.pathname       <- no flash
    <main> is the ONLY scroll container                          <- no double bar
  MobileShell
    max-w-[520px] mx-auto, border-x                              <- NEW, projector
        |
        v
/home      Home.tsx        tiles · NeedsAttention(Link -> /reconcile?item=)
                           RecentActivity(Link -> /schedule?activity= | /ingest)
                           SourceConflicts(Button "View")
                           ScheduleHealth DELETED -> lives only on Memory
/ingest    Ingest.tsx      drop zone
                           PipelineTrace TRACE_BEAT 130ms (was 550)
                           review-count call-to-action -> /reconcile
                           event table + Reasoning column (rationale/margin/method)
                           Outcome: AUTO_LINK -> /schedule?activity=
                                    REVIEW    -> /reconcile?event=   <- NEW
/reconcile Reconcile.tsx   ?item= | ?event= resolved against the queue
                           orderRef freezes list order while selected
                           detail: [ what the supervisor said | why the matcher
                                     chose this (MatchReasoning) ]
                           candidates: per-candidate score or "no score sent"
                           Enter -> focuses #confirm-match (does not fire)
                           r -> arms, second press commits
                           Queue Clear -> success + link to the row it wrote
/schedule  Schedule.tsx    scrollIntoView on [selectedId] only
                           planned rows text-muted (no opacity-55)
                           export: "Saved on server", auto-clears at 6s
                           AuditTrail: no model_version, names linked_event_id
/field     Field.tsx       container: ALL state + handlers, 391 lines
             field/shared.tsx           Stage, Message, CardRow, formatters, Waveform
             field/IdleStage.tsx
             field/ListeningStage.tsx
             field/TranscriptStage.tsx
             field/ConversationStage.tsx   conversation | ready | card
             field/SubmittedStage.tsx
             field/StructuredCard.tsx
             field/FallbackStates.tsx      MicUnavailable | NotUnderstood |
                                           ServerUnreachable
             field/ContextBlock.tsx
             field/TextInput.tsx
        |
        v
hooks/useSpeech.ts
  sharedLang + langSubscribers   module-level, one preference for every
                                 useSpeech() instance                <- NEW
  SPEECH_LANGUAGES = LANGUAGES   one list; chips use .short, Profile .label
```

### Still rendering their own markup, on purpose

```
App.tsx:153            Planner|Field segmented control
App.tsx:116,124        sidebar utility text buttons
Schedule.tsx:667       integrity banner - full-bleed clickable filter row
FieldReports.tsx:126   report row rendered as a button - a list row
field/ContextBlock.tsx:28  disclosure header
field/IdleStage.tsx:40     mic tap-card
```

## Previous Modification Area (2026-09-01, D-038) - retained for history

**Task:** Two demo-path defects in `backend/server/main.py`: the withheld-finish
resolver 400'd on the Reconcile screen's own `reject` verb, and the review
queue was ordered by the priority *string* rather than by priority.
**Date:** 2026-09-01 - **Decisions:** D-038

### What changed

Two edits in `backend/server/main.py`, plus three tests and two documents.

```
POST /review/{id}/resolve            backend/server/main.py:1293  resolve_review_item
  reason == DEFAULTED_FINISH_REASON
        |
        +-- _resolve_defaulted_finish(db, item, le, req)      main.py:1487
              action = "ignore" if req.action == "reject" else req.action
              NEW: 'reject' normalised to 'ignore' BEFORE the guard, so the
                   guard no longer 400s on the verb Reconcile.tsx sends.
                   'confirm' still the only branch that writes actual_finish;
                   'new_activity'/'reassign' still 400 (message updated).

GET /review-queue                    backend/server/main.py:1247  get_review_queue
  NEW: priority_rank = case({high:3, medium:2, low:1},
                            value=ReviewQueueItem.priority, else_=0)
       order_by(priority_rank.desc(), created_at)
       was: order_by(ReviewQueueItem.priority.desc(), ...) -- a string sort
       that put 'medium' above 'high'.
  `case` added to the sqlalchemy import at main.py:42.
```

Unchanged: `backend/matching/`, `backend/extraction/`, `frontend/`. `backend/matching/learned.py`
remains inert (`w_alias = 0.0`).

### Verification performed

```
python -m pytest -q                    583 passed (580 + 3 new)
  both new behavioural tests confirmed FAILING against the unfixed main.py
python backend/eval.py                         87.2 / 50.4 / 100.0 / 8.3  (unchanged)
backend/scripts/demo_reset.ps1                 activities=120 actuals=67 queue=135
GET /review-queue?status=pending       first item 'high'; 89 high before
                                       46 medium; 17 defaulted_finish items
POST /review/{id}/resolve reject       200, resolution "ignore", no
                                       actual_finish written
POST .. new_activity (same item type)  400, as intended
```

---

## Previous Modification Area (2026-09-01, D-031 .. D-037) - retained for history

**Task:** Reconcile every stale, contradictory and duplicated claim across the
documentation so the code, the demo, the metrics and the decision log tell one
truthful story.
**Date:** 2026-09-01 - **Decisions:** D-031 .. D-037

### What changed

No application code. One assertion constant and thirteen documents.

```
METRICS.md                    NEW - the single definition site for every number
  §1 four datasets, never interchangeable  A research · B evaluation ·
                                           C demo schedule · D live queue
  §2 what each metric means, in words
  §3 headline numbers BY CONFIGURATION     3.1 production/demo · 3.2 held-out ·
                                           3.3 out-of-fold · 3.4 experimental ·
                                           3.4a what the evaluation does NOT
                                           establish · 3.5 research corpus
  §4 production status - what is live, what is built and off
  §5 the alias loop - STORED SIGNAL ONLY, not closed
  §6 commands that regenerate every figure
  §7 what was wrong before · §8 what not to say to judges
        |
        +-- README.md          v1/v2 numbers separated; 580+55 tests; channel
        |                      table with active/off; absolute claims on planned
        |                      dates and "nothing dropped" restated precisely
        +-- DEMO.md            queue 118->135, completed 47->38, audit 274->275,
        |                      conflicts "25/21"->18 rows over 17 activities;
        |                      judge-safe number table; PIP-SPL memory panel
        +-- SETUP.md           seed block re-measured; stale-DB recovery step
        +-- ARCHITECTURE.md    header separating FROZEN SPEC (§0-6) from CURRENT
        |                      (§7); real pipeline diagram; active-vs-disabled
        |                      table; alias-not-wired subsection
        +-- FINDINGS.md        banded HISTORICAL; status table extended with
        |                      D-025/027/028 outcomes and the F4 correction
        +-- ROADMAP.md         alias status corrected; calibration marked done
        +-- Basics.md          was a byte-identical copy of README -> pointer
        +-- Audit-1.md         banded v1-scope; test counts annotated
        +-- research/*.md      four docs banded v1-scope; EVIDENCE gains a
        |                      pointer to the v2/bench evidence
        +-- backend/scripts/demo_reset.ps1   $Expected.ReviewQueue 118 -> 135
        +-- AUDIT_CODEX.md     received independent audit, retained as-is
```

### Verification performed

```
python -m pytest -q                          580 passed
cd frontend && npx vitest run                 55 passed          (635 total)
python backend/eval.py                                v1 87.2 / 50.4 / 100.0 / 8.3
python backend/eval.py --cv                           identical to the above
python backend/eval.py  ... v2                        held-out 71.4 / 40.9 / 100.0 / 84.6
python backend/eval.py --cv ... v2                    pooled 82.1 / 53.1 / 99.8
   recomputed as TRUE out-of-fold             99.5% autoP (437/439), 53.9% cov
python backend/eval.py --production ... v2            74.1 / 47.0 / 100.0 / 100.0
python backend/scripts/reset_demo.py                  120 / 266 / 148 / 135 / 67 / 38
                                              / 275 / 68
backend/scripts/demo_reset.ps1 (over HTTP)            same, review queue = 135
GET /schedule/conflicts                       18 rows across 17 activities
datasets/real manifests                       124 artefacts = 124 provenance
                                              sidecars, validation PASS
```

### Ground truth established this pass

- **The live server runs v1** (`baseline_schedule.json`, 120 activities).
  `production(sha)` returns `DEFAULT`: the learned ranker and isotonic
  calibration are **not live**, refused by the baseline sha256 guard.
- **The alias loop is not closed.** Written by `_upsert_alias`; the read path
  `HybridRetriever.alias_channel()` exists and is tested, but `w_alias = 0.0`
  and nothing populates `EngineConfig.alias_lexicon`.
- **Retrieval channels live:** TAG, BM25, DENSE. n-gram, alias, discipline
  gate, short circuit, cross-encoder and the learned ranker are all off.

### Known limitations recorded rather than fixed

- `backend/eval.py:run_cv` pools with a **median** threshold, which is not genuine
  out-of-fold; it prints 99.8% where the true figure is 99.5%.
- `research/bench/ablation.py` **selects on the test split**, so the
  experimental 74.1% is test-selected, not a clean held-out estimate.
- The splits isolate exact text but **not** activities: 156 of 185 test
  positives reuse a train activity.
- `result.errors` is never surfaced by `backend/server/main.py`; a `.csv` upload
  silently yields zero events.

All four are documented in `METRICS.md` §3.4a and D-037 as open work. None was
patched here: this pass corrects documentation to match code, and each of those
is a behaviour change that needs its own before/after.

---
## Previous Modification Area (2026-09-01, D-030) - retained for history

**Task:** Collapse the frontend onto one design system - visual tokens and
shared primitives only. No layout, IA, copy, routing, data-flow or component-
boundary changes.
**Date:** 2026-09-01 - **Decisions:** D-030

### Current path - how a screen gets its look, after the change

```
frontend/src/index.css
  @theme
    --color-*        27 semantic colour tokens        UNCHANGED this pass
    --text-*: initial                                 NEW - clears Tailwind's
    --text-label|body|lead|h3|h2|h1                   built-in sizes, then
                                                      defines exactly six
    --radius-sm (8px) / --radius-lg (10px)            NEW - with rounded-full,
                                                      the only three radii
  body { font-family: system-ui stack }               was 'Inter', which was
                                                      never loaded anywhere
  @keyframes navis-toast-in / .animate-toast-in       NEW - replaces the
                                                      tailwindcss-animate
                                                      classes that were never
                                                      installed
        |
        v
frontend/src/components/ui/
  Button.tsx
    Button({ variant, size, shape, active, tone, block, to })
      variant  primary | secondary | danger | ghost | icon
      size     md (16px mobile) | sm (12px planner mono) | xs (toolbar row)
      shape    rect | pill
      active   boolean -> toggle styling; undefined -> plain variant
      to       renders react-router <Link> with identical classes
  primitives.tsx
    SectionTitle          the one section-title treatment
    Panel / PanelHeader   the one card + the one header padding (px-4 py-3)
    Skeleton / SkeletonRows   one loading bar, one radius, no opacity stacking
    EmptyState            icon? + title? + line + action?, sentence case
    ErrorState            mode: bare | inline | full; calls errorDetail() itself
  index.ts                barrel
        |
        v
every page and component imports from '../components/ui'
```

### What each screen now delegates

```
App.tsx              ErrorState(bare) header failure - Button(icon) x2
pages/Home.tsx       Panel x4 - SkeletonRows - ErrorState(bare) x4
                     EmptyState x3 - Button(secondary/sm, to=) "Resolve"
                     local Panel / PanelError / PanelEmpty / Skeleton DELETED
                     (PanelEmpty had never been called)
pages/Reconcile.tsx  PanelHeader queue - ErrorState(full|inline) - Skeleton
                     EmptyState x3 - Button x9 - SectionTitle x3
                     'Sending...'/'Processing...' -> 'Sending…'/'Processing…'
                     toast: animate-in ... -> animate-toast-in
pages/Schedule.tsx   ErrorState(full|inline) - Skeleton x2 - EmptyState x2
                     Button(icon) drawer close - Button(secondary/xs) export
                     SectionTitle x2  <- were mono/12px/muted, the second system
pages/Ingest.tsx     Panel(Pipeline) - PanelHeader x2 - ErrorState x3
                     SkeletonRows - EmptyState
pages/Memory.tsx     Panel x4 (local copy deleted) - ErrorState(full|inline)
                     Skeleton x4 - NoData now wraps EmptyState (was left-aligned)
                     early-finish variance text-ok -> text-accent (D-030)
pages/Field.tsx      Button x16 - PanelHeader - SectionTitle - ErrorState
pages/FieldReports.tsx        Button(pill toggle) - EmptyState x2 - ErrorState
                              SkeletonRows - PanelHeader
pages/FieldClarifications.tsx Button(pill toggle) x2 - EmptyState x2
                              ErrorState x2 - SkeletonRows - PanelHeader
pages/FieldProfile.tsx        Button(pill toggle) language x3 - PanelHeader x2
components/FieldContextBlocks.tsx
                     PanelHeader x2 - ErrorState(bare) x2 - SkeletonRows x2
                     EmptyState x2  <- NeedsYourResponse returned null before,
                     so it had no empty state and shifted the page on load
```

### Still rendering their own markup, on purpose

```
App.tsx:148          Planner|Field segmented control - two halves, one border
App.tsx:111,119      sidebar utility text buttons - no bg, no padding
Schedule.tsx:620     integrity banner - full-bleed clickable filter row
Field.tsx:445,655    context disclosure header, mic tap-card - cards, not buttons
Field.tsx:590        serverErrorBox - carries "This update was not saved."
FieldReports.tsx:127 report row rendered as a button - a list row
```

See D-030 for why each of these is left alone.

---


## Previous Modification Area (2026-09-01, D-025..D-029) - retained for history

**Task:** Make the matching engine measurably stronger and measurably faster,
with every change justified on the held-out test split and an ablation showing
what it contributed alone.
**Date:** 2026-09-01 - **Decisions:** D-025, D-026, D-027, D-028, D-029

### Current path - document ingestion, after the change

```
backend/server/main.py :: get_matching_engine()
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
   |                        writes backend/matching/artifacts/
   +-- ablation.py          the full report -> ABLATION_RESULTS.txt
```

### Verification performed

```
python -m pytest -q                              580 passed
  backend/matching/test_equivalence.py    13  vectorised == scalar, batch == single,
                                      BM25 matrix == rank_bm25 (atol 1e-12),
                                      short circuit never changes the winner,
                                      one model per process
  backend/matching/test_learned.py        20  alias channel fires and does NOT bypass
                                      scoring; ranker falls back when broken;
                                      abstainer can only refuse; calibration
                                      never changes a choice; cross-encoder
                                      degrades to a no-op
python backend/eval.py                                   v1 byte-identical to baseline
python backend/eval.py --production --schedule ...v2     top-1 74.1 | near-miss 29.4
                                                 | rest 100.0 | auto-P 100.0
                                                 | NO_MATCH 13/13
python backend/scripts/healthcheck.py                    22 passed, 1 failed
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
backend/generate_v2_dataset.py
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
backend/eval.py :: print_near_miss()     NEW - strict top-1 three ways, in-family
                                 top-1, and the REVIEW rate on the subset
```

### Verification performed

```
python -m pytest -q extraction matching server   400 passed
python backend/eval.py                                   v1 unchanged (87.2 / 100.0 / 50.4)
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
backend/extraction/prepass.py
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
backend/matching/  UNTOUCHED. Two digit assumptions remain there and are reported
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
python backend/eval.py                                   v1 unchanged on every metric
python backend/eval.py --schedule v2 --ground-truth v2   test: coverage 80.3 -> 81.0
python backend/eval.py --schedule v2 --ground-truth v2 --cv
                                                 pooled: coverage 54.1 -> 56.6,
                                                 auto-link recall 60.0 -> 62.7,
                                                 Top-1 96.8 -> 97.0,
                                                 auto-link precision 100.0 (flat)
```

### Known limitations

- **NO_MATCH rejection did not move** (70.6%, 48/68 pooled). Neither defect
  touched abstention; that needs the explicit reject-option model.
- **`_SLASH_VARIANT_RE` in `backend/matching/textutils.py` still caps at 3 digits**, so
  `P-1401A/B` does not expand. Reported, not changed — `backend/matching/` was out of
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
backend/generate_v2_dataset.py                 NEW — the whole family, one seed (20260901)
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
backend/eval.py
  --ground-truth                       NEW
  _open_ground_truth()                 NEW — v1 is cp1252, v2 is utf-8
  split-aware main()                   calibrate on dev, report on test
  print_date_basis()                   NEW — EXPLICIT vs DEFAULTED_TO_REPORT_DATE
```

### Upstream

```
python backend/generate_v2_dataset.py   → dataset/v2/*  (reads baseline_schedule_v2.json)
python backend/eval.py --schedule dataset/baseline_schedule_v2.json \
               --ground-truth dataset/v2/ground_truth_v2.csv
```

### Downstream

```
dataset/            UNTOUCHED — v1 metrics reproduce byte-for-byte
backend/matching/           UNTOUCHED — no engine change
D-015 date gate     now exercised: 41.6% EXPLICIT on test, finish dates written
```

### Verification performed

```
python -m pytest -q                    513 passed (unchanged)
python backend/eval.py                         v1 unchanged: Top-1 87.2%, coverage 50.4%,
                                       auto-link precision 100.0%
python backend/eval.py --schedule v2 --ground-truth v2
                                       test split: Top-1 99.2%, auto-link
                                       precision 100.0%, coverage 80.3%,
                                       NO_MATCH rejection 53.8%
python backend/eval.py --schedule v2 (v1 key)  still refused, exit 2 (D-019 guard holds)
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
  2.5%. Both are in `backend/extraction/prepass.py` and would move v1's numbers.
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
                                    everywhere (seeder, SCHEDULE_PATH, backend/eval.py)
dataset/baseline_schedule_v2.json   218 activities — moved here from the repo
                                    root. 0 shared activity ids with v1.
        ↓
backend/matching/providers.py               NEW — the only place that reads a baseline
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
backend/matching/schedule_index.py
  ScheduleIndex.from_provider()       NEW
  ScheduleIndex.from_json()           now delegates to JsonScheduleProvider
  ScheduleIndex.baseline              which schedule these records came from
  ActivityRecord.wbs_level/.calendar/.predecessor_links   NEW
        ↓
SERVER
backend/server/db.py
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
backend/server/main.py
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
backend/server/schemas.py                     + BaselineVersionResponse,
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
backend/eval.py
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
backend/eval.py main()      → MatchingEngine(args.schedule) → guard → scoring
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
python backend/eval.py                        UNCHANGED: auto-link precision 100.0%,
                                      coverage 50.4%, 254 mentions
python backend/eval.py --schedule dataset/baseline_schedule_v2.json
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
backend/extraction/models.py        + DateBasis{EXPLICIT, RELATIVE_RESOLVED,
                                        DEFAULTED_TO_REPORT_DATE}
                            + ExtractedEvent.reported_date_basis
                                          .asserted_start_basis
                                          .asserted_finish_basis
backend/extraction/prepass.py       + extract_dates_with_basis()  → [(date, DateBasis)]
                              extract_dates_with_flags() / extract_dates() kept
                              as basis-free views over it
backend/extraction/extractor.py     + _basis_at(hints, i)                        [line 54]
                              _prepass_span()  → hints["date_bases"]      [line 264]
                              _merge_event()   → reported_date_basis      [line 304]
                              _bind_assertion_dates() now returns          [line 414]
                                (start, start_basis, finish, finish_basis)
backend/extraction/spreadsheet.py     _row_to_event() → every basis EXPLICIT
        ↓
MATCHING
backend/matching/models.py          + DateAssertion.basis / .is_defaulted
                            + RollupResult.actual_start_basis
                                          .actual_finish_basis
                                          .withheld_finish
                                          .withheld_finish_assertions
                                          .review_reasons
backend/matching/engine.py          RollupAccumulator.add()                       [line 200]
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
backend/server/db.py                + Activity.actual_start_basis / .actual_finish_basis
                            + LinkedEvent.reported_date_basis
                                         .asserted_start_basis
                                         .asserted_finish_basis
                            + _add_missing_columns()  (additive SQLite migration,
                              called from init_db)
backend/server/main.py              + _basis_value()                              [line 431]
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
backend/server/schemas.py             ScheduleActivityResponse.actual_start_basis
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
backend/eval.py                     _build_event() now binds start/finish assertions
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
backend/eval.py               → RollupAccumulator directly, over ground_truth.csv
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
python backend/eval.py                       auto-link precision 100.0% (unchanged)
                                     coverage 50.4% (unchanged)
                                     roll-up: 11 identical finish dates → 10
                                     withheld + PIP-PCD-1053 dropped to 0%
/ingest over the whole dataset       38 activities finish, ALL basis EXPLICIT
                                     0 zero-duration activities (was 2)
                                     17 withheld-finish items → planner
```

### Known follow-ups

- `backend/eval.py`'s events are built from `ground_truth.csv`, whose `source_date` is the
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
                                 in backend/matching/, MemoryCache reads, and
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
committed (`backend/matching/engine.py:296`, `:330`; `backend/server/main.py:1301`;
`research/graphs/make_graphs.py:253`, `:321`) — all correct.

Two cross-checks the next agent should carry forward:

- **Its F7 diagnosis was wrong even though its observation was right.** See §13.10.
  Applying the fix as written would have made every milestone un-completable; D-016
  uses the unit of measure to separate a missing planned quantity from a milestone.
  **F1 and F7 are both fixed as of 2026-09-01 (D-015, D-016).**
- **Its numbers are the eval operating point**, taken from
  `research/data/eval_output.txt` (0.775/0.5/0.03 on gold mentions), not the
  server's 0.70/0.40/0.03. Its funnel `254 → 128 → 76 → 11` is therefore an
  `backend/eval.py` funnel; the seeded database's figures will differ. See §10 and H-014.
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
                                 backend/matching/, backend/extraction/, backend/server/, frontend/src/
```

### Known open items (not addressed by this task)

`Audit-1.md` carries eleven findings. The four with the largest effect on the flows
documented above:

- **F-01** — `backend/matching/engine.py::_dense_cos` returns `None` for candidates absent
  from the dense channel; the measured fix is +2.5 pts Top-1 (`research/data/densefix.json`).
- **F-03** — the `_upsert_alias` → `backend/matching/` loop is open (section 3).
- **F-05** — `_compute_delay_reasons` iterates `reasons.keys()`, so a planner's
  resolution note can never introduce a new delay cause (section 5).
- **F-09** — dead, unreachable duplicates of `_dense_cos` / `_unique_line` at
  `backend/matching/engine.py:157–170`, inside `_rationale()` after its `return`.
