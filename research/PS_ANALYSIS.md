# PS Analysis — SIH 26122 requirement coverage, audited against code

PS: "Intelligent Data Capture & Schedule-Linking Layer for Infrastructure
Project Management: Real-Time Actual Progress Tracking (Planning-to-Execution
Bridge)" (SIH-2026-PS.txt).

Method: each Expected-Outcome requirement was traced to a concrete file/symbol
in this repository and given one of IMPLEMENTED / PARTIAL / DEMO/MOCK / MISSING
/ NOT_REQUIRED_FOR_MVP. The machine-readable matrix is
`research/feature_gap_matrix.csv` (26 rows); the summary chart is
`research/graphs/ps_requirement_coverage.png`.

## Where NAVIS fully meets the PS

- **Heterogeneous ingestion.** Free-text DPRs (11 files, incl. one deliberately
  messy) and two discipline spreadsheets ingest through POST /ingest with sha256
  dedup. Scanned diaries/OCR are explicitly excused by the PS ("full
  production-grade OCR/ASR is not required") — NOT_REQUIRED_FOR_MVP.
- **LLM-based conversational / voice time agent.** POST /agent/turn does
  slot-filling with tappable suggestions and a structured card before commit;
  browser speech-to-text with a tested typed fallback. PARTIAL overall because
  the dialogue policy is deterministic and the LLM is optional
  (EXTRACTION_PROVIDER defaults to `rules`) — an honest engineering choice, but
  the PS word "LLM-based" is only conditionally satisfied.
- **Fuzzy-match linking with terminology and granularity handling.** Hybrid
  retrieval (tag/BM25/dense → RRF) + 6-feature scoring; many-to-one
  quantity roll-up handles field-granular progress; measured Top-1 87.2%.
- **Flag unmatched/new activities rather than dropping them.** NEW_ACTIVITY and
  REVIEW outcomes; caveat: NO_MATCH rejection is only 8.3% (1/12) — weak.
- **Auto-update with confidence score and audit trail.** Schedule writes carry
  confidence and append an AuditRecord naming field, old→new, source file and
  line/row. "Near real time" is delivered as *on submission* (synchronous, ~7 ms/event).
- **Institutional memory.** GET /memory/query answers durations, discipline
  slip, recurring delay causes, suggested duration — computed from captured
  execution data with sample sizes shown.

## Where the PS is only partially or not met

| PS ask | Status | Gap |
|---|---|---|
| Primavera/MS Project exports as input | MISSING | baseline is hand-written JSON; PMXML/XER exist as **export** only |
| Scanned diaries | NOT_REQUIRED_FOR_MVP | no OCR |
| "AI performance-monitoring stack / forecasting" | PARTIAL | the clean dataset + delay analytics exist; forecasting itself is future work |
| Robustness to "input quality varies with manpower skill" | PARTIAL | messy-DPR handling + clarification loop exist; no field study with real supervisors |
| Security/multi-project | MISSING | no auth, single SQLite file, one project |

## Verdict

Every PS bullet has at least a partial, demonstrable answer except OCR
(waived by the PS) and schedule-file import (export only). The two claims that
must be softened in front of judges: the agent is *LLM-optional*, and the
learning loop is write-only today.
