# NAVIS Technical Audit — component-by-component status, read from code

Scope: every claim below was checked against the repository (matching/, extraction/,
server/, frontend/src, eval.py) on this branch. Statuses: IMPLEMENTED, PARTIAL,
DEFECT (implemented but measurably wrong), MOCKED, NOT FOUND.

## Pipeline components

| Component | Status | Evidence |
|---|---|---|
| Input: DPR free text (.txt) | IMPLEMENTED | extraction/textio.py (utf-8-sig → cp1252 → latin-1 decode chain), extraction/extractor.py |
| Input: discipline spreadsheet (.xlsx) | IMPLEMENTED | extraction/spreadsheet.py; dataset/civil_progress.xlsx, piping_progress.xlsx |
| Input: conversational agent turn | IMPLEMENTED | server/agent_slots.py, POST /agent/turn |
| Input: browser speech-to-text | PARTIAL | frontend Web Speech API; typed fallback verified end-to-end (DEMO.md §5) |
| Input: scanned document / OCR | NOT FOUND | no OCR code anywhere in the repo |
| Input: Primavera PMXML / XER import | NOT FOUND | baseline is a hand-written JSON (dataset/baseline_schedule.json) |
| Ingestion: upload, sha256 dedup, job record | IMPLEMENTED | server/main.py POST /ingest refuses byte-identical content |
| Extraction: deterministic regex pre-pass | IMPLEMENTED | extraction/prepass.py — tags, dates (incl. year-less), quantities, percentages |
| Extraction: LLM structured output | PARTIAL | extraction/llm_backend.py; off by default (EXTRACTION_PROVIDER=rules); LLM never supplies dates or tags |
| Extraction: forecast-vs-actual date guard | IMPLEMENTED | is_forecast_language() + _bind_assertion_dates; tested in extraction/test_llm_guards.py |
| Extraction: provenance line/row/span | IMPLEMENTED | Provenance(locator, char_span) on every ExtractedEvent |
| Retrieval: exact tag channel | IMPLEMENTED | matching/retrieval.py TAG channel, weight 1.0 |
| Retrieval: BM25 channel | IMPLEMENTED | rank_bm25, weight 0.7 |
| Retrieval: dense MiniLM channel | IMPLEMENTED | all-MiniLM-L6-v2, offline-first, hashed-ngram fallback; weight 0.7 |
| Retrieval: weighted RRF fusion | IMPLEMENTED | RRF k=60, top-20 candidates |
| Ranking: 6-feature scoring | IMPLEMENTED | matching/features.py FEATURE_WEIGHTS (tag 0.32, dense 0.22, fuzzy 0.20, date 0.10, discipline 0.06, predecessor 0.06) |
| Ranking: dense feature for all candidates | DEFECT | embedding_cosine is None for candidates that did not surface in the dense channel; weights renormalise instead — densefix.py measured the fix at +2.5 pts Top-1, +1.6 pts coverage, same 100% auto-precision. Not yet applied in code. |
| Confidence: threshold + margin policy | IMPLEMENTED | tau_high=0.775, tau_low=0.5, margin_min=0.03 (matching/models.py Thresholds; calibrated via eval.py) |
| Decision: AUTO_LINK / REVIEW / NEW_ACTIVITY | IMPLEMENTED | matching/engine.py decide_outcome; discipline-conflict veto on AUTO_LINK |
| Granularity: many-to-one roll-up | IMPLEMENTED | matching/engine.py roll-up: quantity-based % complete, uom required, earliest start / latest finish |
| Granularity: partial-scope finish guard | IMPLEMENTED | Actual Finish written ONLY at 100% of planned quantity; withheld finishes recorded as conflicts |
| Persistence: SQLite schedule write | IMPLEMENTED | server/db.py + SQLAlchemy |
| Persistence: append-only audit trail | IMPLEMENTED | AuditRecord rows; corrections append, never mutate |
| Persistence: cross-upload conflict detect | IMPLEMENTED | server/main.py compares prior audit writes per field; GET /schedule/conflicts; 25 conflicts on the seeded corpus (21 spreadsheet-vs-DPR) |
| Review: planner queue + resolve | IMPLEMENTED | GET /review-queue, POST /review/{id}/resolve (confirm / reassign / create) |
| Review: clarification back to supervisor | IMPLEMENTED | ReviewQueueItem clarification columns; field Clarifications screen |
| Learning: alias lexicon WRITE | IMPLEMENTED | planner correction → alias_lexicon row |
| Learning: alias lexicon READ by matcher | NOT FOUND | the matcher never consults the lexicon — the learning loop is open (risk R7) |
| UI: planner ingest/reconcile/schedule/memory | IMPLEMENTED | frontend/src/pages/{Ingest,Reconcile,Schedule,Memory}.tsx |
| UI: field supervisor agent screens | IMPLEMENTED | frontend/src/pages/Field*.tsx; 12 design mockups in Design/ |
| Analytics: duration / productivity / delay | PARTIAL | GET /memory/query; sample sizes shown (47/120 activities with both actual dates) |
| Export: PMXML + XER write-out | IMPLEMENTED | POST /schedule/export (export only; no import path) |
| Auth / users / project isolation | NOT FOUND | no authentication; any caller can ingest or resolve (risk R9) |

## Headline evaluation (all MEASURED, research/data/eval_output.txt)

- 254 labelled mentions (242 gold-positive, 12 NO_MATCH), 120-activity schedule
- Top-1 accuracy 87.2% · suggestion precision 83.1% · recall 85.5%
- AUTO_LINK coverage 50.4% at **100.0% auto-link precision** (tau_high=0.775)
- Zero wrong AUTO_LINKs in the confusion table ("Gold activity, WRONG" × AUTO_LINK = 0)
- NO_MATCH rejection 8.3% (1/12) — known weakness
- End-to-end latency: 266 events in 1.86 s (~7 ms/event) + 4.4 s one-time cold start
- 76 nodes received auto-linked mentions; Actual Finish only at 100% quantity
