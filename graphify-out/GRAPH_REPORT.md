# Graph Report - SIH 2026  (2026-09-01)

## Corpus Check
- 234 files · ~620,232 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3601 nodes · 5943 edges · 305 communities (249 shown, 41 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 286 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `29c139ce`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- agent_slots.py
- main.py
- extension.ts
- Activity
- get_pricing
- Session
- interpret
- test_matching.py
- SIH26122_7Day_Build_Plan.md
- Extractor
- get_dashboard_data
- scan
- parse_jsonl_file
- Schedule.tsx
- 7. Known Limitations
- engine.py
- extractor.py
- scanner.py
- Audit-1.md
- RollupAccumulator
- Workflow
- TestMessageIdDedupIntegration
- types.ts
- eval.py
- test_llm_guards.py
- ScheduleIndex
- validate.py
- CLAUDE.md — Repository Operating Rules
- SpreadsheetParser
- useSpeech.ts
- compress.py
- What You Must Do When Invoked
- App.tsx
- Changelog
- Field.tsx
- caveman-compress/README.md
- Home.tsx
- ExtractedEvent
- HybridRetriever
- test_date_basis.py
- TestClient
- devDependencies
- TestHTMLTemplate
- compilerOptions
- dependencies
- compilerOptions
- scripts/cli.py
- make_report.py
- _import
- LLMEventOutput
- extract_dates_with_basis
- DateAssertion
- test_subagent.py
- ReviewQueueItem
- Path
- MatchingEngine
- Setup — Windows, from nothing
- _make_user_record
- The demo path, in order
- 2. Findings
- FLOW.md — How execution actually travels through NAVIS
- cavecrew/SKILL.md
- Caveman Help
- Claude Code Usage — VS Code extension
- extract_tags
- test_baseline.py
- errorDetail
- Memory.tsx
- make_graphs.py
- healthcheck.py
- vscode-extension/package.json
- Caveman Compress
- caveman/SKILL.md
- TestVersion
- _build_event
- 15. Historical handoff — state at the end of the reconstruction session (2026-08-31)
- Previous Modification Area (2026-08-31, D-014) — retained for history
- 15. Implementation order
- 15. Implementation order
- TestReviewQueue
- TestScheduleEndpoint
- TestAgentTurn
- caveman-commit
- caveman-explore/package.json
- caveman-learn/package.json
- caveman-review
- Claude Code Usage Dashboard
- TestDashboardHTTP
- properties
- PART 0 — HISTORICAL RECONSTRUCTION (H-001 … H-027)
- 13. Technical debt, dead code, and live defects
- .from_json
- test_scanner.py
- _apply_rollup_to_schedule
- providers.py
- Previous Modification Area (2026-08-30, D-013) — retained for history
- Ingest.tsx
- ROADMAP.md — Senior PM review, decoded and architected
- 1. Glossary — every term, with construction examples
- ROADMAP.md — Senior PM review, decoded and architected
- 1. Glossary — every term, with construction examples
- graphify reference: extra exports and benchmark
- devDependencies
- scripts
- 2026-08-31 / D-014 — Backfill history as a parallel H-series, and document defects rather than fix them
- 2026-09-01 / D-015 — `date_basis` is carried end to end, and a defaulted finish date is never written
- 2026-09-01 / D-016 — A missing planned quantity is not a milestone
- pre-2026-08-30 / D-009 — Agent/voice updates are proposals, never direct writes
- infer_status
- TestIngestEndpoint
- TestMemoryQuery
- Review Caveman evidence
- Manage eval-gated experiments
- caveman-setup/SKILL.md
- keywords
- 2026-08-22 → ~2026-08-27 / H-002 — The no-code stack was abandoned for Python
- 2026-08-22 / H-001 — The problem was re-scoped from "WhatsApp photo → Gantt" to PS 26122
- 2026-08-30 `1de9b4d` / H-027 — Publishing the number that undercuts the architecture
- 2026-08-30 / D-013 — Adopt a persistent repository memory protocol
- pre-2026-08-30 / D-001 — Retrieval and ranking are separate stages
- pre-2026-08-30 / D-002 — Precision-first decision rule with a margin guard
- pre-2026-08-30 / D-003 — `rationale` is deterministic feature names, never LLM prose
- pre-2026-08-30 / D-004 — The audit trail is append-only
- pre-2026-08-30 / D-005 — The LLM is optional and off by default
- pre-2026-08-30 / D-006 — Tags are never taken from the LLM
- pre-2026-08-30 / D-010 — Source files are decoded explicitly, never lossily
- pre-2026-08-30 / D-011 — Source conflicts are detected across uploads, via the audit trail
- pre-2026-08-30 / D-012 — SQLite, synchronous ingest, and "on submission"
- planned 2026-08-22 / H-004 — The CPM / dependency-recalculation engine was never built
- DESIGN.md
- scripts
- generate_duliajan_p6_schedule.py
- TestCrossDPRStatistics
- DAY 7 — Rehearsal, Hardening, and the Story
- Evaluate an optimization observation
- caveman-stats
- TestCliReadCommandsMigrateOldSchema
- 2026-08-22 → ~2026-08-27 / H-003 — V1 matching (one LLM call picks the task) was abandoned before it shipped
- 2026-08-28 `2da3c92` / H-015 — The first real bug: dates were extracted and then dropped
- 2026-08-28 `ab137ee` / H-019 — Schedule context was removed from the LLM prompt; a messy DPR was added
- 2026-08-28 `e664dd8` / H-017 — Start and finish became distinct assertions, and forecasts stopped becoming actuals
- pre-2026-08-30 / D-007 — Unitless quantities cannot drive percent-complete
- pre-2026-08-30 / D-008 — `actual_finish` is written only at 100% complete
- pre-2026-08-28 / H-008 — Export was built and import was not, which is the reverse of the plan
- pre-2026-08-28 / H-014 — Four different threshold sets exist, and the demo does not run the headline one
- frontend/package.json
- TestDatabaseModels
- SIH26122_7Day_Build_Plan_v2.md
- MCP Tools: code-review-graph
- benchmark.py
- caveman-discover/SKILL.md
- graphify reference: query, path, explain
- Quick Start
- TestPricingParity
- contributes
- copy-python.js
- MCP Tools: code-review-graph
- END OF PART 0 — the D-series resumes below
- 2026-08-28 `21efdb9` / H-020 — Reproducibility pass, and 12k lines of export artifacts left Git
- 2026-08-28 `2da3c92` / H-016 — `date_basis` provenance was specified and deliberately deferred
- 2026-08-28 `3c6e59a` / H-018 — The Ollama path was added opt-in, with guards against three named model errors
- 2026-08-29 `8928df7` / H-024 — The field app has no offline capture, and is built never to claim one
- planned 2026-08-22 / H-005 — Photo evidence and the vision path were never built
- pre-2026-08-28 / H-009 — Contract-first Pydantic models, and how the contracts drifted
- pre-2026-08-28 / H-011 — LLM: `qwen2.5:7b-instruct` (spec) → `qwen3:8b` with grammar-constrained decoding
- pre-2026-08-28 / H-012 — pandas and lxml were designed in and never used
- pre-2026-08-28 / H-006 — Institutional memory was promoted from secondary to primary
- pre-2026-08-28 / H-007 — "Near real time" was deliberately downgraded to "on submission"
- pre-2026-08-28 / H-010 — Embeddings: `bge-small-en-v1.5` (spec) → `all-MiniLM-L6-v2` (shipped)
- pre-2026-08-28 / H-013 — One seeded generator builds the whole corpus, and the circularity is admitted
- TestGroundTruthAlignment
- Current Modification Area
- Fake
- MCP Tools: code-review-graph
- MCP Tools: code-review-graph
- MCP Tools: code-review-graph
- 8. Risk engine and pattern analysis
- JsonScheduleProvider
- MCP Tools: code-review-graph
- Competitive landscape — method and honesty statement
- Evidence index — what kind of claim each number in the report is
- 8. Risk engine and pattern analysis
- TestScheduleExport
- DAY 1 — Foundation: The Schedule Is Real Before Anything Else Is
- DAY 2 — The AI Core: Informal Text → The Right Task
- DAY 3 — The Engine: Dependency Recalculation and a Live Gantt
- DAY 5 — The Product Around the Engine
- DAY 6 — Integration and the First Honest End-to-End Run
- SIH26122 — 7-Day Build Plan (v2)
- skills/caveman-learn — the Caveman Learn editing skill (MIT, public)
- caveman-learn skill
- Debug Issue
- Explore Codebase
- Refactor Safely
- Review Changes
- Debug Issue
- Explore Codebase
- Refactor Safely
- Review Changes
- 2026-08-28 `4b8ea18` / H-021 — CORS: the frontend became a second process
- 2026-08-29 `8928df7` / H-022 — Design-first UI: 22 mockups were produced before the screens
- 0. Execution flow evolution — how the pipeline got this shape
- FakeRecognition
- Debug Issue
- Explore Codebase
- Refactor Safely
- Review Changes
- 11. The semantic layer
- 14. MVP triage
- 3. The three roles
- 5. EVM in NAVIS — what is honestly possible
- 9. Knowledge handoff — design
- startup
- PS Analysis — SIH 26122 requirement coverage, audited against code
- 11. The semantic layer
- 14. MVP triage
- 3. The three roles
- 5. EVM in NAVIS — what is honestly possible
- 9. Knowledge handoff — design
- TestAuditTrail
- caveman-explore/tests/skill-file.test.mjs
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- v1.5.5 — 2026-07-10
- v1.2.5 — 2026-06-15
- v1.1.0 — 2026-05-28
- v1.5.0 — 2026-06-21
- v1.3.0 — 2026-06-15
- ClaudeUsage
- claudeUsage.pythonPath
- 9. Application startup — what loads, when, and in what order
- Innovation analysis — what is genuinely novel vs table stakes
- NAVIS Technical Audit — component-by-component status, read from code
- TestJobsEndpoint
- caveman-learn/tests/skill-file.test.mjs
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- v1.2.0 — 2026-05-29
- v1.2.4 — 2026-05-30
- v1.2.3 — 2026-05-30
- v1.1.1 — 2026-05-28
- author
- categories
- repository
- find_code_cli
- code-review-graph
- vite
- Run and deploy your AI Studio app
- 0. Read this first
- 10. MPP and Primavera — verified
- 12. Evaluation module
- code-review-graph
- code-review-graph
- Experiment log — every number traces to a harness in research/data/
- SIH judge analysis — 15-dimension self-scorecard
- 0. Read this first
- 10. MPP and Primavera — verified
- 12. Evaluation module
- scripts/__init__.py
- investigate-first/SKILL.md
- lean-build/SKILL.md
- migration/SKILL.md
- safe-refactor/SKILL.md
- surgical-patch/SKILL.md
- verify-and-stop/SKILL.md
- .claude/CLAUDE.md
- extraction-spec.md
- bump-formula.sh
- run-docker.sh
- extraction/__init__.py
- crg-session-start.sh
- crg-update.sh
- JUDGE_QUESTIONS.md
- claude-usage
- _UnimplementedProvider
- test_providers.py
- validate_activities
- ScheduleProvider
- 2026-09-01 / D-017 — A second baseline is adopted as a version, not as a replacement
- 2026-09-01 / D-019 — Refuse to evaluate a baseline the ground truth does not describe
- BaselineAgreement
- normalize_wbs_path
- 2026-09-01 / D-018 — Baselines are read through a provider, never by `json.load` at the call site
- Previous Modification Area (2026-09-01, D-015/D-016) — retained for history
- TestDashboardSubagentData
- .test_session_across_files_not_inflated
- TestDashboardOnUnmigratedDB
- .predecessor_links
- TestNonBillableModelFallback

## God Nodes (most connected - your core abstractions)
1. `Activity` - 52 edges
2. `MatchingEngine` - 42 edges
3. `Extractor` - 37 edges
4. `scan()` - 36 edges
5. `parse_jsonl_file()` - 35 edges
6. `RollupAccumulator` - 35 edges
7. `_make_assistant_record()` - 31 edges
8. `DateBasis` - 30 edges
9. `LinkedEvent` - 30 edges
10. `errorDetail()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `_build_event()` --uses--> `Extractor`  [INFERRED]
  eval.py → extraction/extractor.py
- `_build_event()` --uses--> `DateBasis`  [INFERRED]
  eval.py → extraction/models.py
- `_build_event()` --uses--> `EventStatus`  [INFERRED]
  eval.py → extraction/models.py
- `_build_event()` --uses--> `ExtractionMethod`  [INFERRED]
  eval.py → extraction/models.py
- `_dated()` --uses--> `DateBasis`  [INFERRED]
  eval.py → extraction/models.py

## Import Cycles
- None detected.

## Communities (305 total, 41 thin omitted)

### Community 0 - "agent_slots.py"
Cohesion: 0.04
Nodes (66): AgentContext, AgentTurnRequest, AgentContext, _build(), choices_for(), discipline_choice_text(), discipline_label(), _find_unit() (+58 more)

### Community 1 - "main.py"
Cohesion: 0.06
Nodes (67): DurationDistribution, ProductivityMetric, _compute_delay_reasons(), _compute_duration_distribution(), _compute_productivity(), _compute_suggested_duration(), export_schedule(), _generate_pmxml() (+59 more)

### Community 2 - "extension.ts"
Cohesion: 0.05
Nodes (37): activate(), deactivate(), describeMode(), Extension, noInstallMessage(), noPythonMessage(), claudeUsageCandidateNames(), dashboardSpawnArgs() (+29 more)

### Community 3 - "Activity"
Cohesion: 0.05
Nodes (55): AuditRecord, DeclarativeBase, ResolveResponse, db_session(), Shared fixtures. `server/test_server.py` builds its own database with an…, Load the real 120-activity baseline. The matcher fixture has to be the real…, A session on the test database, with the baseline loaded., _seed_activities() (+47 more)

### Community 4 - "get_pricing"
Cohesion: 0.06
Nodes (32): calc_cost(), cmd_dashboard(), cmd_scan(), cmd_stats(), cmd_today(), cmd_week(), fmt(), fmt_cost() (+24 more)

### Community 5 - "Session"
Cohesion: 0.06
Nodes (52): get, post, PydanticEvent, Job, LinkedEvent, Tracks a file ingestion and extraction pipeline run., An extracted progress event linked to a schedule activity. Created by the…, admin_reset() (+44 more)

### Community 6 - "interpret"
Cohesion: 0.07
Nodes (31): Protocol, _attr(), interpret(), llm_enabled(), llm_timeout_seconds(), LLMSuggestion, Optional LLM interpretation for one conversational turn. The LLM is an…, Keep only values that survive the deterministic validators. (+23 more)

### Community 7 - "test_matching.py"
Cohesion: 0.09
Nodes (23): Hybrid candidate retrieval: exact tag + BM25 + dense embeddings, fused with…, date, Schedule index: loads the baseline schedule and precomputes every lookup…, _safe_date(), Unit tests for the matching engine. Run with: python -m pytest…, TestTagParsing, TestTokenize, extract_size_mentions() (+15 more)

### Community 8 - "SIH26122_7Day_Build_Plan.md"
Cohesion: 0.04
Nodes (48): 0. What We're Actually Building (Plain Language), Biggest Risks to This Timeline, Concepts each person should understand today, Concepts each person should understand today, Concepts each person should understand today, Concepts each person should understand today, Concepts each person should understand today, Concepts each person should understand today (+40 more)

### Community 9 - "Extractor"
Cohesion: 0.06
Nodes (28): _basis_at(), Extractor, date, DateBasis, Discipline, ExtractedEvent, Extract from a text-based daily progress report., Extract the report date from DPR header lines. (+20 more)

### Community 10 - "get_dashboard_data"
Cohesion: 0.12
Nodes (6): get_dashboard_data(), Regression: turns with model='' (empty string) must group as 'unknown'.…, Regression: a mix of model=NULL and model='' rows must collapse into a SINGLE…, TestEmptyStringModelNormalization, TestGetDashboardData, TestMixedNullAndEmptyModel

### Community 11 - "scan"
Cohesion: 0.09
Nodes (20): _backfill_topics(), extract_agent_dispatch(), _extract_title(), is_subagent_record(), Extract a session title from a custom-title or ai-title record., One-time backfill of topics for a DB created before topic support. Transcript…, True if a record belongs to a dispatched subagent (Task/Agent tool). Subagents…, Pull the subagent id off a record, if any (top-level or data wrapper). (+12 more)

### Community 12 - "parse_jsonl_file"
Cohesion: 0.11
Nodes (14): parse_jsonl_file(), Parse a JSONL file and return (session_metas, turns, agents, line_count).…, _make_assistant_record(), Test deduplication of streaming events by message.id., Multiple records with same message.id should produce one turn., Records with different message.id are separate turns., Records without message.id are kept as-is (no dedup)., Mix of records with and without message.id. (+6 more)

### Community 13 - "Schedule.tsx"
Cohesion: 0.10
Nodes (18): ConfidenceBadge(), ConfidenceBadgeProps, DISCIPLINES, PageHeader, PageHeaderContext, usePageHeader(), Home(), Memory() (+10 more)

### Community 14 - "7. Known Limitations"
Cohesion: 0.05
Nodes (39): 0. Five places I think you're wrong, 1. Component Diagram, 2.1 `ScheduleActivity`, 2.2 `RawInput`, 2.3 `ExtractedEvent`, 2.4 `LinkCandidate`, 2.5 `LinkDecision`, 2.6 `AuditRecord` (+31 more)

### Community 15 - "engine.py"
Cohesion: 0.10
Nodes (29): decide_outcome(), _rationale(), The matching engine: retrieval → feature scoring → calibrated decision.…, Core decision rule over scored candidates. Returns (outcome,…, Resolve one ExtractedEvent against the schedule., blend_with_line_lock(), final_score(), Weighted blend over present features, renormalised. (+21 more)

### Community 16 - "extractor.py"
Cohesion: 0.11
Nodes (28): Main extraction orchestrator. Ties together: 1. Deterministic pre-pass (regex)…, DateBasis, Discipline, EventStatus, ExtractionMethod, Enum, str, Pydantic schema for extracted progress events. Every field that touches the… (+20 more)

### Community 17 - "scanner.py"
Cohesion: 0.10
Nodes (20): dashboard.py - Local web dashboard served on localhost:8080., _ensure_column(), get_db(), init_db(), insert_turns(), _model_priority(), scanner.py - Scans Claude Code JSONL transcript files and stores data in SQLite., Add a column to an existing table if it isn't already present. Returns True if… (+12 more)

### Community 18 - "Audit-1.md"
Cohesion: 0.06
Nodes (34): APPENDIX — REPRODUCING EVERY NUMBER, Audit-1 — NAVIS vs SIH 26122 Problem Statement, CRITICAL FINDINGS, DEFECTS NOT IN THE EXISTING AUDIT, F-01 — The matching engine ranks worse than plain BM25, and the defense is buried, F-02 — At 50.4% coverage, half the manual reconciliation the PS complains about still happens, F-03 — The learning loop is open: the system cannot get better, F-04 — Institutional memory, the stated differentiator, is statistically empty (+26 more)

### Community 19 - "RollupAccumulator"
Cohesion: 0.14
Nodes (16): Aggregates many field mentions (AUTO_LINK decisions) into one L5/L6 schedule…, RollupAccumulator, make_event(), date, A finish date nobody asserted must not reach the schedule. A DPR line that says…, Roll 1200 m2 - the full planned quantity of CIV-SIT-1001., The other half of the same defect: no finish claim at all, and the bare report…, completed yesterday' names a day. It is resolved, not defaulted. (+8 more)

### Community 20 - "Workflow"
Cohesion: 0.06
Nodes (31): Architecture, CHANGELOG conventions, Common commands, Cost calculation, Dashboard server, Data flow, Homebrew formula and self-referential SHA, Non-obvious invariants (+23 more)

### Community 21 - "TestMessageIdDedupIntegration"
Cohesion: 0.29
Nodes (4): Integration test: dedup across scan cycles., 3 streaming events for 2 messages should produce 2 turns., Re-scanning a file shouldn't create duplicate turns for same message_id., TestMessageIdDedupIntegration

### Community 22 - "types.ts"
Cohesion: 0.13
Nodes (23): ApiError, fetchWithHandler(), getBaseUrl(), ANSWER, ITEM, ready(), wrap(), AgentContext (+15 more)

### Community 23 - "eval.py"
Cohesion: 0.14
Nodes (32): assert_baseline_matches_ground_truth(), _baseline_line(), calibrate(), _dated(), _decision_for(), evaluate(), ground_truth_activity_ids(), load_ground_truth() (+24 more)

### Community 24 - "test_llm_guards.py"
Cohesion: 0.06
Nodes (52): _env(), LLMBackend, make_backend_from_env(), NullBackend, ABC, LLM backend interface for structured event extraction. Two backends behind one…, Check if this backend is reachable., Read config with precedence: real environment, then .env, then default. The… (+44 more)

### Community 25 - "ScheduleIndex"
Cohesion: 0.12
Nodes (17): compute_features(), _date_proximity(), _predecessor_plausibility(), date, Feature scoring per (event, candidate) pair — the precision-oriented stage.…, 1.0 — no predecessors, or all finished (with grace) by report date 0.7 —…, Returns (score, line_locked). A full line+size+spec match sets line_locked=True…, _tag_overlap() (+9 more)

### Community 26 - "validate.py"
Cohesion: 0.13
Nodes (23): count_bullets(), extract_code_blocks(), extract_fenced_spans(), extract_headings(), extract_indented_code_blocks(), extract_inline_codes(), extract_paths(), extract_urls() (+15 more)

### Community 27 - "CLAUDE.md — Repository Operating Rules"
Cohesion: 0.08
Nodes (25): After implementing, Before implementing, CLAUDE.md — Repository Operating Rules, COMPLETION CHECKLIST, `DECISIONS.md` — WHY, Do not commit broken code to satisfy these rules, DOCUMENTATION RULES, During implementation (+17 more)

### Community 28 - "SpreadsheetParser"
Cohesion: 0.10
Nodes (16): coerce_date(), any, date, Discipline, ExtractedEvent, Coerce various date representations to a date object. Handles: - datetime.date…, Parse an EPC discipline progress spreadsheet into ExtractedEvents., Parse an xlsx file and return ExtractedEvents. (+8 more)

### Community 29 - "useSpeech.ts"
Cohesion: 0.10
Nodes (15): buildRecognition(), classifySpeechError(), getCtor(), SPEECH_LANGUAGES, SpeechFailure, SpeechRecognitionAlternative, SpeechRecognitionCtor, SpeechRecognitionErrorEventLike (+7 more)

### Community 30 - "compress.py"
Cohesion: 0.13
Nodes (24): build_compress_prompt(), build_fix_prompt(), call_claude(), _compress_file_locked(), first_nonblank_line(), mask_code_blocks(), r"""Strip an outer ```markdown ... ``` fence when it wraps the ENTIRE output.…, Write ``text`` to ``path`` atomically as UTF-8. Path.write_text() truncates the… (+16 more)

### Community 31 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 32 - "App.tsx"
Cohesion: 0.15
Nodes (18): App(), DesktopShell(), MobileShell(), DISCIPLINE_LABEL, DISCIPLINE_META, FIELD_ROLE, LANGUAGES, PLANNER_ROLE (+10 more)

### Community 33 - "Changelog"
Cohesion: 0.09
Nodes (23): Changelog, Dashboard, Dashboard, Dashboard, Dashboard, Extension, Packaging, Packaging (+15 more)

### Community 34 - "Field.tsx"
Cohesion: 0.11
Nodes (19): agentContext(), WORK_FRONTS, BAR_HEIGHTS, CardRow, clockTime(), Field(), longDate(), Message (+11 more)

### Community 35 - "caveman-compress/README.md"
Cohesion: 0.09
Nodes (20): Before / After, Benchmarks, How It Work, <img src="../../docs/assets/dancing-rock.svg" width="20" height="20" alt="rock"/> Caveman (285 tokens), Install, Original (706 tokens), Part of Caveman, Security (+12 more)

### Community 36 - "Home.tsx"
Cohesion: 0.15
Nodes (10): clock(), FeedRow, FIELD_LABEL, PanelError(), position(), RecentActivity(), shortDate(), SOURCE_KIND_LABEL (+2 more)

### Community 37 - "ExtractedEvent"
Cohesion: 0.10
Nodes (18): Extract progress events from a source file. Dispatches to the appropriate…, Extract from an xlsx discipline spreadsheet., Placeholder for future CSV parsing., ExtractedEvent, ExtractionResult, Provenance, BaseModel, Complete output of the extraction pipeline for one source file. (+10 more)

### Community 38 - "HybridRetriever"
Cohesion: 0.11
Nodes (10): Path, _hashed_embeddings(), HybridRetriever, MiniLMEmbedder, ndarray, Exact/near-exact tag match, ranked by match quality: full (line+size+spec) >…, Returns (ordered candidate indices, per-candidate retrieval info)., sentence-transformers all-MiniLM-L6-v2, offline-first. (+2 more)

### Community 39 - "test_date_basis.py"
Cohesion: 0.12
Nodes (10): clean_database(), _ingest(), ingested(), fixture, A defaulted finish date must not reach the schedule. `dataset/dpr_day_10.txt`…, Each test ingests the same report, so each needs its own database: a second…, The report that produced the defect, ingested., TestDefaultedFinishIsNotWritten (+2 more)

### Community 40 - "TestClient"
Cohesion: 0.17
Nodes (10): client(), fixture, An API client sharing the seeded test database., The exact three-turn conversation the demo runs on., Part 17: 'Electrical' used to be rejected and the question repeated., TestDemonstrationExchange, TestHumanGate, TestMatchingIsReal (+2 more)

### Community 41 - "devDependencies"
Cohesion: 0.11
Nodes (19): autoprefixer, esbuild, devDependencies, autoprefixer, esbuild, jsdom, tailwindcss, @testing-library/jest-dom (+11 more)

### Community 42 - "TestHTMLTemplate"
Cohesion: 0.11
Nodes (9): Verify XSS protection is present (PR #10)., Verify getPricing falls back to substring match for unknown models., Verify getPricing returns null for non-Anthropic models., Hourly distribution chart has a canvas + TZ toggle., Peak-hour set covers UTC 12–17 (Mon–Fri 05:00–11:00 PT)., The 'Today' range is wired into RANGE_LABELS, RANGE_TICKS, getRangeBounds, and…, The head carries the server-substituted config placeholder and the footer…, The GitHub update check and the extension promo are web-only: both guard on… (+1 more)

### Community 43 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, lib, module, outDir, resolveJsonModule, rootDir, skipLibCheck (+10 more)

### Community 44 - "dependencies"
Cohesion: 0.11
Nodes (19): dependencies, lucide-react, react, react-dom, react-router-dom, recharts, @tailwindcss/vite, @tanstack/react-query (+11 more)

### Community 45 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+10 more)

### Community 46 - "scripts/cli.py"
Cohesion: 0.19
Nodes (15): main(), print_usage(), backup_dir_for(), Out-of-tree backup dir for filepath, keyed by its parent dir name — kept…, detect_file_type(), _is_code_line(), _is_json_content(), _is_yaml_content() (+7 more)

### Community 47 - "make_report.py"
Cohesion: 0.13
Nodes (11): BaseDocTemplate, callout(), fig(), Path, Build research/NAVIS_SIH_FINAL_REPORT.pdf from repository evidence. Nothing…, Numbered data table with a caption; status_col cells are colour-coded., Image + numbered caption, kept together. Aspect ratio preserved., ReportDoc (+3 more)

### Community 48 - "_import"
Cohesion: 0.08
Nodes (13): _import(), Path, Half-loading a broken baseline is far harder to notice than a refusal, so…, Nothing is being replaced, so nothing needs consent., Deleting them would orphan their LinkedEvent and AuditRecord rows and silently…, The planned fields already match, so a re-import is a no-op beyond registering…, Importing a baseline changes what the SCHEDULE holds without changing what…, conftest seeds rows the way a pre-typed-predecessor database looks: `["CIV-… (+5 more)

### Community 49 - "LLMEventOutput"
Cohesion: 0.09
Nodes (15): LLMBatchOutput, LLMEventOutput, OllamaBackend, OpenAICompatibleBackend, BaseModel, Backend for any OpenAI-compatible API (Claude, OpenAI, etc.)., Check API connectivity., Call the API to extract structured events. (+7 more)

### Community 50 - "extract_dates_with_basis"
Cohesion: 0.12
Nodes (15): extract_dates(), extract_dates_with_basis(), extract_dates_with_flags(), date, DateBasis, Resolve a year-less date ("30 Jul") against the report's header date. DPR prose…, Extract dates in encounter order with the basis of each, plus warnings for…, Extract dates in encounter order, plus warnings for anything that could not be… (+7 more)

### Community 51 - "DateAssertion"
Cohesion: 0.12
Nodes (14): _basis_for(), _basis_of(), _describe_conflicts(), DateBasis, _qty_swallowed_by_tag(), Consume one AUTO_LINK decision (others are ignored by design:…, The basis an event recorded for one of its dates. Defaults to EXPLICIT for…, The basis of the assertion that produced the value actually written. (+6 more)

### Community 52 - "test_subagent.py"
Cohesion: 0.23
Nodes (5): _assistant(), _dispatch(), Tests for subagent attribution: detection, agent-dispatch capture, scan…, TestSubagentDetection, TestSubagentScanIntegration

### Community 53 - "ReviewQueueItem"
Cohesion: 0.12
Nodes (29): main(), Reset the demo database to a known seeded state. Safe to run while the server…, main(), Build a working database from scratch. Loads the 120-activity baseline…, _add_missing_columns(), AuditRecord, init_db(), Immutable audit log for every actual-date write. Once created, NEVER updated or… (+21 more)

### Community 54 - "Path"
Cohesion: 0.16
Nodes (16): compress_file(), file_lock(), is_sensitive_path(), lock_path_for(), LockTimeoutError, Path, Raised when another process holds the compress lock past LOCK_WAIT_SECONDS., Cross-session lock path keyed on the same (parent-dir-name, stem) identity… (+8 more)

### Community 55 - "MatchingEngine"
Cohesion: 0.12
Nodes (6): MatchingEngine, Cosine similarity of the dense channel for this candidate (None if the…, fixture, A node with no planned quantity AND no unit of measure is a milestone: a…, TestMilestoneNode, TestScheduleIndex

### Community 56 - "Setup — Windows, from nothing"
Cohesion: 0.12
Nodes (15): 0. What you need, 1. Get the repo and create a virtual environment, 2. Install Python dependencies, 3. Seed the database, 4. Start the backend — from the PROJECT ROOT, 5. Install and start the frontend, 6. Verify, Frontend checks (+7 more)

### Community 57 - "_make_user_record"
Cohesion: 0.22
Nodes (8): _make_ai_title_record(), _make_custom_title_record(), _make_user_record(), Topic persistence through scan(): DB write, incremental capture, and the no-…, One-time backfill of topics for DBs that predate topic support (#147)., Simulate a not-yet-backfilled DB: clear the captured topic and the one-time…, TestSessionTopicScan, TestTopicBackfill

### Community 58 - "The demo path, in order"
Cohesion: 0.13
Nodes (14): 1. Home — the state of the project, 2. Ingest — watch the pipeline, 3. Reconcile — resolve one, 4. Schedule — confirm it landed, 5. Field — the voice agent, 6. Memory — the half nobody else builds, Demo reset, From a terminal (+6 more)

### Community 59 - "2. Findings"
Cohesion: 0.13
Nodes (14): 0. Verdict, 1. PS requirement coverage, 2. Findings, 3. What you are underselling, 4. Last day, in order, Act on this first, F1 — CRITICAL — Eleven activities share one finish date; two have zero duration, F2 — HIGH — "50.4% coverage" counts mentions; the schedule received eleven rows (+6 more)

### Community 60 - "FLOW.md — How execution actually travels through NAVIS"
Cohesion: 0.13
Nodes (14): 10. Threshold configuration map — read this before quoting a metric, 11. Module contracts, 12. Data object lifecycle, 14. Documentation status — which files are current and which are dated, 1. System map, 2. Primary path — document ingestion, 3. Planner reconciliation path — the only route that commits an actual date, 4. Conversational agent path (+6 more)

### Community 61 - "cavecrew/SKILL.md"
Cohesion: 0.14
Nodes (12): cavecrew, Example chaining, How to invoke, Model overrides, See also, What it does, Auto-clarity (inherited), Chaining patterns (+4 more)

### Community 62 - "Caveman Help"
Cohesion: 0.14
Nodes (12): caveman-help, Example output, How to invoke, See also, What it does, Caveman Help, Configure Default Mode, Deactivate (+4 more)

### Community 63 - "Claude Code Usage — VS Code extension"
Cohesion: 0.14
Nodes (14): Build and install from source, Claude Code Usage — VS Code extension, Commands, From a prebuilt `.vsix` (no build step), From the VS Code Marketplace, How discovery works, Install, Privacy (+6 more)

### Community 64 - "extract_tags"
Cohesion: 0.24
Nodes (4): extract_tags(), Extract all equipment/line tags from free text., Tests for equipment/line tag regex patterns., TestTagExtraction

### Community 65 - "test_baseline.py"
Cohesion: 0.08
Nodes (27): _activity_from_dict(), _apply_planned_fields(), _baseline_response(), get_active_baseline(), get_schedule(), get_schedule_provider(), import_schedule(), _matcher_baseline_drift() (+19 more)

### Community 66 - "errorDetail"
Cohesion: 0.10
Nodes (26): NeedsYourResponse(), RecentUpdates(), STATUS_ICON, STATUS_SHORT, when(), FieldNav(), TABS, PLANNER (+18 more)

### Community 67 - "Memory.tsx"
Cohesion: 0.15
Nodes (7): DISCIPLINE_AXIS, DISCIPLINE_ORDER, Overrun, SuggestedDurationPanel(), DelayReasonRow, DurationDistribution, ProductivityMetric

### Community 68 - "make_graphs.py"
Cohesion: 0.36
Nodes (13): ablation(), architecture(), competitor_coverage(), implementation_status(), innovation_scores(), load(), operating_point(), ps_coverage() (+5 more)

### Community 69 - "healthcheck.py"
Cohesion: 0.31
Nodes (13): check_dataset(), check_embedder(), check_endpoints(), check_imports(), check_provider(), main(), Verify an installation end to end: imports, data, and all 8 endpoints. python…, The LLM is optional. Absence is a PASS, not a failure. (+5 more)

### Community 70 - "vscode-extension/package.json"
Cohesion: 0.15
Nodes (12): activationEvents, description, displayName, engines, vscode, homepage, icon, license (+4 more)

### Community 71 - "Caveman Compress"
Cohesion: 0.17
Nodes (11): Boundaries, Caveman Compress, Compress, Compression Rules, Pattern, Preserve EXACTLY (never modify), Preserve Structure, Process (+3 more)

### Community 72 - "caveman/SKILL.md"
Cohesion: 0.17
Nodes (10): caveman, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Intensity (+2 more)

### Community 73 - "TestVersion"
Cohesion: 0.20
Nodes (6): _changelog_top_version(), _package_json_version(), Tests for the single source-of-truth version (scanner.VERSION). The runtime…, Return the version from the first '## vX.Y.Z' heading in CHANGELOG.md., `python cli.py --version` prints the version and exits 0., TestVersion

### Community 74 - "_build_event"
Cohesion: 0.16
Nodes (10): _build_event(), _parse_date(), date, ExtractedEvent, Turn a labelled mention into an ExtractedEvent via the shared prepass., infer_discipline(), Discipline, Infer the most likely discipline from context keywords. (+2 more)

### Community 75 - "15. Historical handoff — state at the end of the reconstruction session (2026-08-31)"
Cohesion: 0.17
Nodes (12): 15. Historical handoff — state at the end of the reconstruction session (2026-08-31), Completed, Component status at handoff, Environment assumptions the next agent should verify first, Known bugs, Known failing tests, Known technical debt, Last major task attempted (+4 more)

### Community 76 - "Previous Modification Area (2026-08-31, D-014) — retained for history"
Cohesion: 0.17
Nodes (12): Addendum — 2026-08-31, second commit, API behaviour changed, Current path, Database changes, Downstream, Files currently modified, Interfaces changed, Known open items (not addressed by this task) (+4 more)

### Community 77 - "15. Implementation order"
Cohesion: 0.17
Nodes (12): 15. Implementation order, Phase 10 — Integration layer, Phase 11 — Risk engine, Phase 1 — Data model foundation, Phase 2 — Roles and permissions, Phase 3 — RAID, Phase 4 — EVM, Phase 5 — Verification screen completion (+4 more)

### Community 78 - "15. Implementation order"
Cohesion: 0.17
Nodes (12): 15. Implementation order, Phase 10 — Integration layer, Phase 11 — Risk engine, Phase 1 — Data model foundation, Phase 2 — Roles and permissions, Phase 3 — RAID, Phase 4 — EVM, Phase 5 — Verification screen completion (+4 more)

### Community 79 - "TestReviewQueue"
Cohesion: 0.27
Nodes (3): Test GET /review-queue and POST /review/{id}/resolve., Ingest a file and return a review item ID., TestReviewQueue

### Community 80 - "TestScheduleEndpoint"
Cohesion: 0.17
Nodes (5): Test GET /schedule with integrity rules., Set actual dates and check variance is computed., Should warn when predecessors haven't started., Activities with actual_finish should count as completed., TestScheduleEndpoint

### Community 81 - "TestAgentTurn"
Cohesion: 0.17
Nodes (4): Test POST /agent/turn., Test multi-turn slot filling., Test that session persists across turns., TestAgentTurn

### Community 82 - "caveman-commit"
Cohesion: 0.18
Nodes (9): caveman-commit, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 83 - "caveman-explore/package.json"
Cohesion: 0.18
Nodes (10): description, files, SKILL.md, license, name, private, scripts, test (+2 more)

### Community 84 - "caveman-learn/package.json"
Cohesion: 0.18
Nodes (10): description, files, SKILL.md, license, name, private, scripts, test (+2 more)

### Community 85 - "caveman-review"
Cohesion: 0.18
Nodes (9): caveman-review, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 86 - "Claude Code Usage Dashboard"
Cohesion: 0.18
Nodes (8): Claude Code Usage Dashboard, Cost estimates, Files, How it works, Requirements, Usage, VS Code extension, What this tracks

### Community 87 - "TestDashboardHTTP"
Cohesion: 0.11
Nodes (6): BaseHTTPRequestHandler, DashboardHandler, find_icon_file(), Locate the extension's icon.svg across both run contexts. - Bundled in the…, Integration test: start server and make HTTP requests., TestDashboardHTTP

### Community 88 - "properties"
Cohesion: 0.18
Nodes (11): default, description, type, default, description, type, properties, title (+3 more)

### Community 89 - "PART 0 — HISTORICAL RECONSTRUCTION (H-001 … H-027)"
Cohesion: 0.18
Nodes (11): 2026-08-29 / 2026-08-30 / H-025 — Three commits named "Update SIH project", 2026-08-29 `8928df7` / H-023 — Two roles, and a clarification loop back to the supervisor, 2026-08-30 / H-026 — The `cline checkpoint` commits are tooling residue, Consequences, Context, Decision, Historical index, PART 0 — HISTORICAL RECONSTRUCTION (H-001 … H-027) (+3 more)

### Community 90 - "13. Technical debt, dead code, and live defects"
Cohesion: 0.18
Nodes (11): 10. RESOLVED (2026-09-01, D-016) — `0/0 nos → 100.0%`, 13. Technical debt, dead code, and live defects, 1. LIVE BUG — two of the four planner resolve actions cannot succeed, 2. LIVE BUG (latent) — `.csv` is accepted for upload and cannot be parsed, 3. Dead code — the unreachable `_dense_cos` / `_unique_line` duplicate, 4. Dead code — the unreachable `REJECTED` branch in `ingest_file`, 5. Incomplete implementation — the predecessor integrity warning is unconditional, 6. Dead schema and dead index (+3 more)

### Community 91 - ".from_json"
Cohesion: 0.14
Nodes (11): check_ground_truth_agreement(), Do the ground truth and the loaded baseline describe the same project?…, Path, Load a JSON baseline. Both shipped baselines load through the same provider, so…, _ground_truth_ids(), The fact that makes the agreement guard necessary., Tests and synthetic schedules pass raw dicts, not provider output., The exact failure this guard exists for: 218 activity ids that do not intersect… (+3 more)

### Community 92 - "test_scanner.py"
Cohesion: 0.13
Nodes (12): aggregate_sessions(), _meta_get(), _meta_set(), project_name_from_cwd(), Read a value from the schema_meta key/value table (None if absent)., Upsert a value into the schema_meta key/value table., Derive a friendly project name from cwd path., Aggregate turn data back into session-level stats. (+4 more)

### Community 93 - "_apply_rollup_to_schedule"
Cohesion: 0.10
Nodes (21): EventIndex, _apply_rollup_to_schedule(), _assertion_for(), _basis_value(), _cross_file_conflict(), _describe_side(), list_source_conflicts(), _origin() (+13 more)

### Community 94 - "providers.py"
Cohesion: 0.19
Nodes (9): parse_predecessor(), parse_predecessors(), PredecessorLink, Any, Schedule providers: where a baseline comes from, and what shape it arrives in.…, One predecessor entry, from either baseline shape. Accepts a bare id (`"CIV-…, One logic tie into an activity. `rel` is the Primavera relationship type and…, A relationship type we cannot read is a weaker signal than a predecessor… (+1 more)

### Community 95 - "Previous Modification Area (2026-08-30, D-013) — retained for history"
Cohesion: 0.20
Nodes (10): API behaviour changed, Current path, Database changes, Downstream, Files currently modified, Interfaces changed, Known open items (not addressed by this task), Previous Modification Area (2026-08-30, D-013) — retained for history (+2 more)

### Community 96 - "Ingest.tsx"
Cohesion: 0.16
Nodes (14): DISCIPLINE_COLOR, DisciplineTag(), DisciplineTagProps, DISCIPLINE_SHORT, isDiscipline(), ACCEPTED_EXTENSIONS, extensionOf(), formatBytes() (+6 more)

### Community 97 - "ROADMAP.md — Senior PM review, decoded and architected"
Cohesion: 0.20
Nodes (9): 13. Layer separation — every recommendation, assigned, 16. Open questions to take back to him, 2. Reconstruction — what he was actually proposing, 4. The two-destination model, 6. Information classification — what goes where, 7. The verification workflow, ROADMAP.md — Senior PM review, decoded and architected, The evidence panel — twelve elements, in this order (+1 more)

### Community 98 - "1. Glossary — every term, with construction examples"
Cohesion: 0.20
Nodes (10): 1.1 The three roles, 1.2 EVM — Earned Value Management, 1.3 Project data vs knowledge handoff, 1.4 RAID, 1.5 Risk management and pattern analysis, 1.6 MPP files, 1.7 Database update vs project update, 1.8 The evaluation metrics (+2 more)

### Community 99 - "ROADMAP.md — Senior PM review, decoded and architected"
Cohesion: 0.20
Nodes (9): 13. Layer separation — every recommendation, assigned, 16. Open questions to take back to him, 2. Reconstruction — what he was actually proposing, 4. The two-destination model, 6. Information classification — what goes where, 7. The verification workflow, ROADMAP.md — Senior PM review, decoded and architected, The evidence panel — twelve elements, in this order (+1 more)

### Community 100 - "1. Glossary — every term, with construction examples"
Cohesion: 0.20
Nodes (10): 1.1 The three roles, 1.2 EVM — Earned Value Management, 1.3 Project data vs knowledge handoff, 1.4 RAID, 1.5 Risk management and pattern analysis, 1.6 MPP files, 1.7 Database update vs project update, 1.8 The evaluation metrics (+2 more)

### Community 101 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 102 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, @types/node, @types/vscode, typescript, vitest, @types/node, typescript, vitest (+1 more)

### Community 103 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, compile, copy-python, package, publish, test, test:watch, vscode:prepublish (+1 more)

### Community 104 - "2026-08-31 / D-014 — Backfill history as a parallel H-series, and document defects rather than fix them"
Cohesion: 0.22
Nodes (9): 2026-08-31 / D-014 — Backfill history as a parallel H-series, and document defects rather than fix them, Affected Areas, Alternatives Considered, Context, Decision, Historical Notes, Reason, Risks / Limitations (+1 more)

### Community 105 - "2026-09-01 / D-015 — `date_basis` is carried end to end, and a defaulted finish date is never written"
Cohesion: 0.22
Nodes (9): 2026-09-01 / D-015 — `date_basis` is carried end to end, and a defaulted finish date is never written, Affected Areas, Alternatives Considered, Context, Decision, Future Notes, Reason, Trade-offs / Consequences (+1 more)

### Community 106 - "2026-09-01 / D-016 — A missing planned quantity is not a milestone"
Cohesion: 0.22
Nodes (9): 2026-09-01 / D-016 — A missing planned quantity is not a milestone, Affected Areas, Alternatives Considered, Context, Decision, Future Notes, Reason, Trade-offs / Consequences (+1 more)

### Community 107 - "pre-2026-08-30 / D-009 — Agent/voice updates are proposals, never direct writes"
Cohesion: 0.22
Nodes (9): Affected Areas, Alternatives Considered, Context, D-009a — *(superseded by D-009)* Agent updates written directly to the schedule, Decision, Future Notes, pre-2026-08-30 / D-009 — Agent/voice updates are proposals, never direct writes, Reason (+1 more)

### Community 108 - "infer_status"
Cohesion: 0.33
Nodes (4): infer_status(), Infer progress status and a rough confidence., Tests for status keyword classification., TestStatusInference

### Community 111 - "Review Caveman evidence"
Cohesion: 0.25
Nodes (7): Hard rules, Review Caveman evidence, Step 1 — Load context, Step 2 — Establish baseline, Step 3 — Test the leading explanation with traces, Step 4 — Inspect representative traces, Step 5 — Report

### Community 112 - "Manage eval-gated experiments"
Cohesion: 0.25
Nodes (7): Manage eval-gated experiments, Non-negotiable gates, Step 1 — Load project and experiment, Step 2 — Evaluate evidence, Step 3 — Propose one action, Step 4 — Block unsafe execution, Step 5 — Re-read after external operator action

### Community 113 - "caveman-setup/SKILL.md"
Cohesion: 0.25
Nodes (7): Failure templates (use verbatim, filled in — never soften), Rules (non-negotiable), Step 1 — Find every live LLM callsite, Step 2 — Pick the app slug, Step 3 — Wire each callsite, Step 4 — Verify with one real request, Step 5 — Report

### Community 114 - "keywords"
Cohesion: 0.25
Nodes (8): keywords, anthropic, claude, claude-code, cost, dashboard, tokens, usage

### Community 115 - "2026-08-22 → ~2026-08-27 / H-002 — The no-code stack was abandoned for Python"
Cohesion: 0.25
Nodes (8): 2026-08-22 → ~2026-08-27 / H-002 — The no-code stack was abandoned for Python, Alternatives Considered (per the plan, then rejected), Consequences, Decision, Previous State, Reason (partly INFERRED), Risks / Limitations, Status

### Community 116 - "2026-08-22 / H-001 — The problem was re-scoped from "WhatsApp photo → Gantt" to PS 26122"
Cohesion: 0.25
Nodes (8): 2026-08-22 / H-001 — The problem was re-scoped from "WhatsApp photo → Gantt" to PS 26122, Consequences, Context, Decision, Historical Notes, Previous State, Reason, Status

### Community 117 - "2026-08-30 `1de9b4d` / H-027 — Publishing the number that undercuts the architecture"
Cohesion: 0.25
Nodes (8): 2026-08-30 `1de9b4d` / H-027 — Publishing the number that undercuts the architecture, Consequences, Context, Decision, Future Notes, Reason, Status, The defence, which is also measured

### Community 118 - "2026-08-30 / D-013 — Adopt a persistent repository memory protocol"
Cohesion: 0.25
Nodes (8): 2026-08-30 / D-013 — Adopt a persistent repository memory protocol, Affected Areas, Alternatives Considered, Context, Decision, Future Notes, Reason, Trade-offs / Consequences

### Community 119 - "pre-2026-08-30 / D-001 — Retrieval and ranking are separate stages"
Cohesion: 0.25
Nodes (8): Affected Areas, Alternatives Considered, Context, Decision, Future Notes, pre-2026-08-30 / D-001 — Retrieval and ranking are separate stages, Reason, Trade-offs / Consequences

### Community 120 - "pre-2026-08-30 / D-002 — Precision-first decision rule with a margin guard"
Cohesion: 0.25
Nodes (8): Affected Areas, Alternatives Considered, Context, Decision, Future Notes, pre-2026-08-30 / D-002 — Precision-first decision rule with a margin guard, Reason, Trade-offs / Consequences

### Community 121 - "pre-2026-08-30 / D-003 — `rationale` is deterministic feature names, never LLM prose"
Cohesion: 0.25
Nodes (8): Affected Areas, Alternatives Considered, Context, Decision, Future Notes, pre-2026-08-30 / D-003 — `rationale` is deterministic feature names, never LLM prose, Reason, Trade-offs / Consequences

### Community 122 - "pre-2026-08-30 / D-004 — The audit trail is append-only"
Cohesion: 0.25
Nodes (8): Affected Areas, Alternatives Considered, Context, Decision, Future Notes, pre-2026-08-30 / D-004 — The audit trail is append-only, Reason, Trade-offs / Consequences

### Community 123 - "pre-2026-08-30 / D-005 — The LLM is optional and off by default"
Cohesion: 0.25
Nodes (8): Affected Areas, Alternatives Considered, Context, Decision, Future Notes, pre-2026-08-30 / D-005 — The LLM is optional and off by default, Reason, Trade-offs / Consequences

### Community 124 - "pre-2026-08-30 / D-006 — Tags are never taken from the LLM"
Cohesion: 0.25
Nodes (8): Affected Areas, Alternatives Considered, Context, Decision, Future Notes, pre-2026-08-30 / D-006 — Tags are never taken from the LLM, Reason, Trade-offs / Consequences

### Community 125 - "pre-2026-08-30 / D-010 — Source files are decoded explicitly, never lossily"
Cohesion: 0.25
Nodes (8): Affected Areas, Alternatives Considered, Context, Decision, Future Notes, pre-2026-08-30 / D-010 — Source files are decoded explicitly, never lossily, Reason, Trade-offs / Consequences

### Community 126 - "pre-2026-08-30 / D-011 — Source conflicts are detected across uploads, via the audit trail"
Cohesion: 0.25
Nodes (8): Affected Areas, Context, D-011a — *(superseded by D-011)* Conflict detection scoped to one upload, Decision, Future Notes, pre-2026-08-30 / D-011 — Source conflicts are detected across uploads, via the audit trail, Reason, Trade-offs / Consequences

### Community 127 - "pre-2026-08-30 / D-012 — SQLite, synchronous ingest, and "on submission""
Cohesion: 0.25
Nodes (8): Affected Areas, Alternatives Considered, Context, Decision, Future Notes, pre-2026-08-30 / D-012 — SQLite, synchronous ingest, and "on submission", Reason, Trade-offs / Consequences

### Community 128 - "planned 2026-08-22 / H-004 — The CPM / dependency-recalculation engine was never built"
Cohesion: 0.25
Nodes (8): Consequences, Context, Decision, Future Notes, planned 2026-08-22 / H-004 — The CPM / dependency-recalculation engine was never built, Reason (INFERRED, but well supported), Status, What exists instead

### Community 129 - "DESIGN.md"
Cohesion: 0.25
Nodes (7): Brand & Style, Colors, Components, Elevation & Depth, Layout & Spacing, Shapes, Typography

### Community 130 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, clean, dev, lint, preview, test, test:watch

### Community 131 - "generate_duliajan_p6_schedule.py"
Cohesion: 0.46
Nodes (5): add_work(), is_work(), next_work(), sched(), sub_work()

### Community 132 - "TestCrossDPRStatistics"
Cohesion: 0.25
Nodes (5): Test extraction across all 10 DPR files + both spreadsheets., All 10 DPR files should be processable., Both discipline spreadsheets should be processable., Check that our extraction can find at least some ground-truth activity IDs., TestCrossDPRStatistics

### Community 133 - "DAY 7 — Rehearsal, Hardening, and the Story"
Cohesion: 0.25
Nodes (8): Biggest Risks to This Timeline, Concepts each person should understand today, DAY 7 — Rehearsal, Hardening, and the Story, End-of-day checkpoint, Goal for the day, Task breakdown by person, What we're building and how, Where the Slack Is

### Community 134 - "Evaluate an optimization observation"
Cohesion: 0.29
Nodes (6): 1. Read the exact observations, 2. Ask the operator to choose, 3. Design a candidate and paired eval, 4. Apply only the approved candidate, 5. Report observations, not savings, Evaluate an optimization observation

### Community 135 - "caveman-stats"
Cohesion: 0.29
Nodes (5): caveman-stats, Example output, How to invoke, See also, What it does

### Community 137 - "2026-08-22 → ~2026-08-27 / H-003 — V1 matching (one LLM call picks the task) was abandoned before it shipped"
Cohesion: 0.29
Nodes (7): 2026-08-22 → ~2026-08-27 / H-003 — V1 matching (one LLM call picks the task) was abandoned before it shipped, Decision — V2, the shipped architecture, Future Notes, Previous State — the V1 design, in full, Residue of V1 still visible in the code, Status, Why it was abandoned

### Community 138 - "2026-08-28 `2da3c92` / H-015 — The first real bug: dates were extracted and then dropped"
Cohesion: 0.29
Nodes (7): 2026-08-28 `2da3c92` / H-015 — The first real bug: dates were extracted and then dropped, Consequences at the time, Context, Decision, Historical Notes, Result, from the commit message, Status

### Community 139 - "2026-08-28 `ab137ee` / H-019 — Schedule context was removed from the LLM prompt; a messy DPR was added"
Cohesion: 0.29
Nodes (7): 2026-08-28 `ab137ee` / H-019 — Schedule context was removed from the LLM prompt; a messy DPR was added, Consequences, Decision, Previous State, Reason, Status, The second half of the commit

### Community 140 - "2026-08-28 `e664dd8` / H-017 — Start and finish became distinct assertions, and forecasts stopped becoming actuals"
Cohesion: 0.29
Nodes (7): 2026-08-28 `e664dd8` / H-017 — Start and finish became distinct assertions, and forecasts stopped becoming actuals, Consequences, Decision — four changes in one commit, Historical Notes, Previous State, Reason, Status

### Community 141 - "pre-2026-08-30 / D-007 — Unitless quantities cannot drive percent-complete"
Cohesion: 0.29
Nodes (7): Affected Areas, Alternatives Considered, Context, Decision, pre-2026-08-30 / D-007 — Unitless quantities cannot drive percent-complete, Reason, Trade-offs / Consequences

### Community 142 - "pre-2026-08-30 / D-008 — `actual_finish` is written only at 100% complete"
Cohesion: 0.29
Nodes (7): Affected Areas, Alternatives Considered, Context, Decision, pre-2026-08-30 / D-008 — `actual_finish` is written only at 100% complete, Reason, Trade-offs / Consequences

### Community 143 - "pre-2026-08-28 / H-008 — Export was built and import was not, which is the reverse of the plan"
Cohesion: 0.29
Nodes (7): Consequences, Future Notes, pre-2026-08-28 / H-008 — Export was built and import was not, which is the reverse of the plan, Previous State, Reason (INFERRED), Status, What actually happened

### Community 144 - "pre-2026-08-28 / H-014 — Four different threshold sets exist, and the demo does not run the headline one"
Cohesion: 0.29
Nodes (7): Consequences — read this before quoting a number, Context, Future Notes, pre-2026-08-28 / H-014 — Four different threshold sets exist, and the demo does not run the headline one, Status, The actual state of the code, Why they differ — this is the substantive point

### Community 145 - "frontend/package.json"
Cohesion: 0.29
Nodes (6): engines, node, name, private, type, version

### Community 146 - "TestDatabaseModels"
Cohesion: 0.29
Nodes (3): Verify all 120 activities were seeded., Test SQLAlchemy model behavior., TestDatabaseModels

### Community 147 - "SIH26122_7Day_Build_Plan_v2.md"
Cohesion: 0.29
Nodes (6): Concepts each person should understand today, DAY 4 — Photo Evidence, the Human Gate, and Deliberate Slack, End-of-day checkpoint, Goal for the day, Task breakdown by person, What we're building and how

### Community 148 - "MCP Tools: code-review-graph"
Cohesion: 0.33
Nodes (5): Key Tools, MCP Tools: code-review-graph, Verify in the source, When to use graph tools FIRST, Workflow

### Community 149 - "benchmark.py"
Cohesion: 0.60
Nodes (5): benchmark_pair(), count_tokens(), main(), print_table(), Path

### Community 150 - "caveman-discover/SKILL.md"
Cohesion: 0.33
Nodes (5): Step 1 — Inventory the workflows, Step 2 — Name them, Step 3 — Propose, then apply, Step 4 — Verify, Step 5 — Report

### Community 151 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 152 - "Quick Start"
Cohesion: 0.33
Nodes (6): Any OS (uv tool / pipx), Docker, macOS / Linux (clone), macOS / Linux (Homebrew), Quick Start, Windows

### Community 153 - "TestPricingParity"
Cohesion: 0.47
Nodes (3): Verify CLI and dashboard pricing tables stay in sync., Extract pricing values from the dashboard JS PRICING object., TestPricingParity

### Community 154 - "contributes"
Cohesion: 0.33
Nodes (6): contributes, commands, views, viewsContainers, claudeUsageSidebar, activitybar

### Community 155 - "copy-python.js"
Cohesion: 0.33
Nodes (5): files, fs, path, repoRoot, targetDir

### Community 156 - "MCP Tools: code-review-graph"
Cohesion: 0.33
Nodes (5): Key Tools, MCP Tools: code-review-graph, Verify in the source, When to use graph tools FIRST, Workflow

### Community 157 - "END OF PART 0 — the D-series resumes below"
Cohesion: 0.33
Nodes (5): Decision index, DECISIONS.md — Why NAVIS is built this way, END OF PART 0 — the D-series resumes below, Provenance of the initial entries, The 2026-08-31 historical pass (H-001 … H-027)

### Community 158 - "2026-08-28 `21efdb9` / H-020 — Reproducibility pass, and 12k lines of export artifacts left Git"
Cohesion: 0.33
Nodes (6): 2026-08-28 `21efdb9` / H-020 — Reproducibility pass, and 12k lines of export artifacts left Git, Consequences, Context, Decision — four things at once, Reason, Status

### Community 159 - "2026-08-28 `2da3c92` / H-016 — `date_basis` provenance was specified and deliberately deferred"
Cohesion: 0.33
Nodes (6): 2026-08-28 `2da3c92` / H-016 — `date_basis` provenance was specified and deliberately deferred, Consequences, Context, Decision, Future Notes, Status

### Community 160 - "2026-08-28 `3c6e59a` / H-018 — The Ollama path was added opt-in, with guards against three named model errors"
Cohesion: 0.33
Nodes (6): 2026-08-28 `3c6e59a` / H-018 — The Ollama path was added opt-in, with guards against three named model errors, Context, Decision, Historical Notes, Reason, Status

### Community 161 - "2026-08-29 `8928df7` / H-024 — The field app has no offline capture, and is built never to claim one"
Cohesion: 0.33
Nodes (6): 2026-08-29 `8928df7` / H-024 — The field app has no offline capture, and is built never to claim one, Context, Decision, Reason, Risks / Limitations, Status

### Community 162 - "planned 2026-08-22 / H-005 — Photo evidence and the vision path were never built"
Cohesion: 0.33
Nodes (6): Consequences, Context, Decision, planned 2026-08-22 / H-005 — Photo evidence and the vision path were never built, Reason, Status

### Community 163 - "pre-2026-08-28 / H-009 — Contract-first Pydantic models, and how the contracts drifted"
Cohesion: 0.33
Nodes (6): Consequences, Context, Decision, pre-2026-08-28 / H-009 — Contract-first Pydantic models, and how the contracts drifted, Status, What shipped, and what did not

### Community 164 - "pre-2026-08-28 / H-011 — LLM: `qwen2.5:7b-instruct` (spec) → `qwen3:8b` with grammar-constrained decoding"
Cohesion: 0.33
Nodes (6): Consequences, Decision, pre-2026-08-28 / H-011 — LLM: `qwen2.5:7b-instruct` (spec) → `qwen3:8b` with grammar-constrained decoding, Previous State, Reason, Status

### Community 165 - "pre-2026-08-28 / H-012 — pandas and lxml were designed in and never used"
Cohesion: 0.33
Nodes (6): Consequences, Context, Decision, pre-2026-08-28 / H-012 — pandas and lxml were designed in and never used, Reason, Status

### Community 166 - "pre-2026-08-28 / H-006 — Institutional memory was promoted from secondary to primary"
Cohesion: 0.33
Nodes (6): Consequences and honest limits (all measured, from `ARCHITECTURE.md` §7), Context, Decision, pre-2026-08-28 / H-006 — Institutional memory was promoted from secondary to primary, Risks / Limitations, Status

### Community 167 - "pre-2026-08-28 / H-007 — "Near real time" was deliberately downgraded to "on submission""
Cohesion: 0.33
Nodes (6): Context, Decision, Historical Notes, pre-2026-08-28 / H-007 — "Near real time" was deliberately downgraded to "on submission", Reason, Status

### Community 168 - "pre-2026-08-28 / H-010 — Embeddings: `bge-small-en-v1.5` (spec) → `all-MiniLM-L6-v2` (shipped)"
Cohesion: 0.33
Nodes (6): Decision, pre-2026-08-28 / H-010 — Embeddings: `bge-small-en-v1.5` (spec) → `all-MiniLM-L6-v2` (shipped), Previous State, Reason (INFERRED for the model swap; recorded for the fallback), Risks / Limitations, Status

### Community 169 - "pre-2026-08-28 / H-013 — One seeded generator builds the whole corpus, and the circularity is admitted"
Cohesion: 0.33
Nodes (6): Decision, Design choices inside it, and why, Ground-truth shape, pre-2026-08-28 / H-013 — One seeded generator builds the whole corpus, and the circularity is admitted, Risks / Limitations — stated, not hidden, Status

### Community 171 - "Current Modification Area"
Cohesion: 0.33
Nodes (6): Current Modification Area, Current path, Downstream, Known limitations, Upstream, Verification performed

### Community 173 - "MCP Tools: code-review-graph"
Cohesion: 0.33
Nodes (5): Key Tools, MCP Tools: code-review-graph, Verify in the source, When to use graph tools FIRST, Workflow

### Community 174 - "MCP Tools: code-review-graph"
Cohesion: 0.33
Nodes (5): Key Tools, MCP Tools: code-review-graph, Verify in the source, When to use graph tools FIRST, Workflow

### Community 175 - "MCP Tools: code-review-graph"
Cohesion: 0.33
Nodes (5): Key Tools, MCP Tools: code-review-graph, Verify in the source, When to use graph tools FIRST, Workflow

### Community 176 - "8. Risk engine and pattern analysis"
Cohesion: 0.33
Nodes (6): 8. Risk engine and pattern analysis, The Risk → Action → Response → Result loop [SAID], What is statistical / historical, What must be deterministic — never the LLM, What the LLM is genuinely good at, and should do, Who sees what

### Community 177 - "JsonScheduleProvider"
Cohesion: 0.19
Nodes (5): JsonScheduleProvider, The JSON baselines this repository ships. Reads either shape - `[ {...} ]` or…, Explicit decode, matching extraction/textio.py's reasoning: a lossy decode of a…, The whole point of recording a version: two runs quoting different numbers must…, TestJsonScheduleProvider

### Community 178 - "MCP Tools: code-review-graph"
Cohesion: 0.33
Nodes (5): Key Tools, MCP Tools: code-review-graph, Verify in the source, When to use graph tools FIRST, Workflow

### Community 179 - "Competitive landscape — method and honesty statement"
Cohesion: 0.33
Nodes (5): Competitive landscape — method and honesty statement, Positioning, The honest competitive story for judges, What this analysis is, What this analysis is NOT

### Community 180 - "Evidence index — what kind of claim each number in the report is"
Cohesion: 0.33
Nodes (5): AUDITED — read from code, not from documentation, Evidence index — what kind of claim each number in the report is, MEASURED — from runnable harnesses against the real engine + dataset, NOT CLAIMED, RUBRIC — reasoned judgement, labelled as such on the figure itself

### Community 181 - "8. Risk engine and pattern analysis"
Cohesion: 0.33
Nodes (6): 8. Risk engine and pattern analysis, The Risk → Action → Response → Result loop [SAID], What is statistical / historical, What must be deterministic — never the LLM, What the LLM is genuinely good at, and should do, Who sees what

### Community 183 - "DAY 1 — Foundation: The Schedule Is Real Before Anything Else Is"
Cohesion: 0.33
Nodes (6): Concepts each person should understand today, DAY 1 — Foundation: The Schedule Is Real Before Anything Else Is, End-of-day checkpoint, Goal for the day, Task breakdown by person, What we're building and how

### Community 184 - "DAY 2 — The AI Core: Informal Text → The Right Task"
Cohesion: 0.33
Nodes (6): Concepts each person should understand today, DAY 2 — The AI Core: Informal Text → The Right Task, End-of-day checkpoint, Goal for the day, Task breakdown by person, What we're building and how

### Community 185 - "DAY 3 — The Engine: Dependency Recalculation and a Live Gantt"
Cohesion: 0.33
Nodes (6): Concepts each person should understand today, DAY 3 — The Engine: Dependency Recalculation and a Live Gantt, End-of-day checkpoint, Goal for the day, Task breakdown by person, What we're building and how

### Community 186 - "DAY 5 — The Product Around the Engine"
Cohesion: 0.33
Nodes (6): Concepts each person should understand today, DAY 5 — The Product Around the Engine, End-of-day checkpoint, Goal for the day, Task breakdown by person, What we're building and how

### Community 187 - "DAY 6 — Integration and the First Honest End-to-End Run"
Cohesion: 0.33
Nodes (6): Concepts each person should understand today, DAY 6 — Integration and the First Honest End-to-End Run, End-of-day checkpoint, Goal for the day, Task breakdown by person, What we're building and how

### Community 188 - "SIH26122 — 7-Day Build Plan (v2)"
Cohesion: 0.33
Nodes (6): Corrected Role Map, Oil India Limited | Field-Update-to-Gantt Automation, SIH26122 — 7-Day Build Plan (v2), Tool Stack (decided up front — do not re-litigate mid-week), What Changed in This Revision, and Why, What We're Building (unchanged from v1)

### Community 189 - "skills/caveman-learn — the Caveman Learn editing skill (MIT, public)"
Cohesion: 0.40
Nodes (4): Boundary (binding), Install path, Layout, skills/caveman-learn — the Caveman Learn editing skill (MIT, public)

### Community 190 - "caveman-learn skill"
Cohesion: 0.40
Nodes (4): caveman-learn skill, Honesty, Install, What it does

### Community 191 - "Debug Issue"
Cohesion: 0.40
Nodes (4): Debug Issue, Steps, Tips, Token Efficiency Rules

### Community 192 - "Explore Codebase"
Cohesion: 0.40
Nodes (4): Explore Codebase, Steps, Tips, Token Efficiency Rules

### Community 193 - "Refactor Safely"
Cohesion: 0.40
Nodes (4): Refactor Safely, Safety Checks, Steps, Token Efficiency Rules

### Community 194 - "Review Changes"
Cohesion: 0.40
Nodes (4): Output Format, Review Changes, Steps, Token Efficiency Rules

### Community 195 - "Debug Issue"
Cohesion: 0.40
Nodes (4): Debug Issue, Steps, Tips, Token Efficiency Rules

### Community 196 - "Explore Codebase"
Cohesion: 0.40
Nodes (4): Explore Codebase, Steps, Tips, Token Efficiency Rules

### Community 197 - "Refactor Safely"
Cohesion: 0.40
Nodes (4): Refactor Safely, Safety Checks, Steps, Token Efficiency Rules

### Community 198 - "Review Changes"
Cohesion: 0.40
Nodes (4): Output Format, Review Changes, Steps, Token Efficiency Rules

### Community 199 - "2026-08-28 `4b8ea18` / H-021 — CORS: the frontend became a second process"
Cohesion: 0.40
Nodes (5): 2026-08-28 `4b8ea18` / H-021 — CORS: the frontend became a second process, Consequences, Decision, Reason, Status

### Community 200 - "2026-08-29 `8928df7` / H-022 — Design-first UI: 22 mockups were produced before the screens"
Cohesion: 0.40
Nodes (5): 2026-08-29 `8928df7` / H-022 — Design-first UI: 22 mockups were produced before the screens, Decision, Historical Notes — where the mockups and the code disagree, Reason, Status

### Community 201 - "0. Execution flow evolution — how the pipeline got this shape"
Cohesion: 0.40
Nodes (5): 0. Execution flow evolution — how the pipeline got this shape, V0 — planned, never built (2026-08-22), V1 — specified in the architecture, partly built, immediately corrected (~2026-08-27 → 08-28), V1a — the agent wrote directly to the schedule (superseded, D-009a), V2 — current

### Community 203 - "Debug Issue"
Cohesion: 0.40
Nodes (4): Debug Issue, Steps, Tips, Token Efficiency Rules

### Community 204 - "Explore Codebase"
Cohesion: 0.40
Nodes (4): Explore Codebase, Steps, Tips, Token Efficiency Rules

### Community 205 - "Refactor Safely"
Cohesion: 0.40
Nodes (4): Refactor Safely, Safety Checks, Steps, Token Efficiency Rules

### Community 206 - "Review Changes"
Cohesion: 0.40
Nodes (4): Output Format, Review Changes, Steps, Token Efficiency Rules

### Community 207 - "11. The semantic layer"
Cohesion: 0.40
Nodes (5): 11. The semantic layer, Entity model, What it buys each subsystem, What it should be — and should not be, You have three quarters of it already

### Community 208 - "14. MVP triage"
Cohesion: 0.40
Nodes (5): 14. MVP triage, Explicit warnings, MUST — this week, POST-MVP — architect for, do not build, SHOULD — if the above are done and verified

### Community 209 - "3. The three roles"
Cohesion: 0.40
Nodes (5): 3.1 Field Supervisor, 3.2 Project Manager, 3.3 Senior Management, 3.4 Information flow between them, 3. The three roles

### Community 210 - "5. EVM in NAVIS — what is honestly possible"
Cohesion: 0.40
Nodes (5): 5. EVM in NAVIS — what is honestly possible, The honest position to present, What you can compute today, What you cannot compute, and must not fake, Where it appears, and for whom

### Community 211 - "9. Knowledge handoff — design"
Cohesion: 0.40
Nodes (5): 9. Knowledge handoff — design, How future projects retrieve it, How the AI decides something is a lesson [INFERRED], Separate module? Yes., What to store per lesson

### Community 212 - "startup"
Cohesion: 0.40
Nodes (5): on_event, get_db(), FastAPI dependency for DB sessions., Initialize DB and seed baseline schedule., startup()

### Community 213 - "PS Analysis — SIH 26122 requirement coverage, audited against code"
Cohesion: 0.40
Nodes (4): PS Analysis — SIH 26122 requirement coverage, audited against code, Verdict, Where NAVIS fully meets the PS, Where the PS is only partially or not met

### Community 214 - "11. The semantic layer"
Cohesion: 0.40
Nodes (5): 11. The semantic layer, Entity model, What it buys each subsystem, What it should be — and should not be, You have three quarters of it already

### Community 215 - "14. MVP triage"
Cohesion: 0.40
Nodes (5): 14. MVP triage, Explicit warnings, MUST — this week, POST-MVP — architect for, do not build, SHOULD — if the above are done and verified

### Community 216 - "3. The three roles"
Cohesion: 0.40
Nodes (5): 3.1 Field Supervisor, 3.2 Project Manager, 3.3 Senior Management, 3.4 Information flow between them, 3. The three roles

### Community 217 - "5. EVM in NAVIS — what is honestly possible"
Cohesion: 0.40
Nodes (5): 5. EVM in NAVIS — what is honestly possible, The honest position to present, What you can compute today, What you cannot compute, and must not fake, Where it appears, and for whom

### Community 218 - "9. Knowledge handoff — design"
Cohesion: 0.40
Nodes (5): 9. Knowledge handoff — design, How future projects retrieve it, How the AI decides something is a lesson [INFERRED], Separate module? Yes., What to store per lesson

### Community 221 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 222 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 223 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 224 - "v1.5.5 — 2026-07-10"
Cohesion: 0.50
Nodes (4): Dashboard, Project / docs, Scanner / CLI, v1.5.5 — 2026-07-10

### Community 225 - "v1.2.5 — 2026-06-15"
Cohesion: 0.50
Nodes (4): Dashboard, Packaging, Scanner / CLI, v1.2.5 — 2026-06-15

### Community 226 - "v1.1.0 — 2026-05-28"
Cohesion: 0.50
Nodes (4): Dashboard, Project / docs, Scanner, v1.1.0 — 2026-05-28

### Community 227 - "v1.5.0 — 2026-06-21"
Cohesion: 0.50
Nodes (4): Dashboard, Packaging / docs, Scanner / CLI, v1.5.0 — 2026-06-21

### Community 228 - "v1.3.0 — 2026-06-15"
Cohesion: 0.50
Nodes (4): Dashboard, Project / docs, Scanner / CLI, v1.3.0 — 2026-06-15

### Community 230 - "claudeUsage.pythonPath"
Cohesion: 0.50
Nodes (4): default, description, type, claudeUsage.pythonPath

### Community 231 - "9. Application startup — what loads, when, and in what order"
Cohesion: 0.50
Nodes (4): 9. Application startup — what loads, when, and in what order, Backend, Frontend, Offline / non-server entry points

### Community 232 - "Innovation analysis — what is genuinely novel vs table stakes"
Cohesion: 0.50
Nodes (3): Cross-checks, Innovation analysis — what is genuinely novel vs table stakes, Reading the profile

### Community 233 - "NAVIS Technical Audit — component-by-component status, read from code"
Cohesion: 0.50
Nodes (3): Headline evaluation (all MEASURED, research/data/eval_output.txt), NAVIS Technical Audit — component-by-component status, read from code, Pipeline components

### Community 239 - "v1.2.0 — 2026-05-29"
Cohesion: 0.67
Nodes (3): CI, Distribution, v1.2.0 — 2026-05-29

### Community 240 - "v1.2.4 — 2026-05-30"
Cohesion: 0.67
Nodes (3): Dashboard, Extension, v1.2.4 — 2026-05-30

### Community 241 - "v1.2.3 — 2026-05-30"
Cohesion: 0.67
Nodes (3): Extension, Scanner / CLI, v1.2.3 — 2026-05-30

### Community 242 - "v1.1.1 — 2026-05-28"
Cohesion: 0.67
Nodes (3): Packaging, Project / docs, v1.1.1 — 2026-05-28

### Community 243 - "author"
Cohesion: 0.67
Nodes (3): author, name, url

### Community 244 - "categories"
Cohesion: 0.67
Nodes (3): categories, Other, Visualization

### Community 245 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 248 - "vite"
Cohesion: 0.67
Nodes (3): vite, vite, vite

### Community 250 - "0. Read this first"
Cohesion: 0.67
Nodes (3): 0.1 Scope reality, 0.2 The thing you may not realise, 0. Read this first

### Community 251 - "10. MPP and Primavera — verified"
Cohesion: 0.67
Nodes (3): 10. MPP and Primavera — verified, MPP files, Primavera APIs — your note needs correcting

### Community 252 - "12. Evaluation module"
Cohesion: 0.67
Nodes (3): 12. Evaluation module, Metric per task, Module design

### Community 257 - "0. Read this first"
Cohesion: 0.67
Nodes (3): 0.1 Scope reality, 0.2 The thing you may not realise, 0. Read this first

### Community 258 - "10. MPP and Primavera — verified"
Cohesion: 0.67
Nodes (3): 10. MPP and Primavera — verified, MPP files, Primavera APIs — your note needs correcting

### Community 259 - "12. Evaluation module"
Cohesion: 0.67
Nodes (3): 12. Evaluation module, Metric per task, Module design

### Community 290 - "_UnimplementedProvider"
Cohesion: 0.15
Nodes (9): PmxmlScheduleProvider, PrimaveraXerScheduleProvider, Path, Shared body for the formats that are declared but not built., Primavera P6 PMXML (`.xml`) — DECLARED, NOT IMPLEMENTED. The problem statement…, Primavera `.xer` — DECLARED, NOT IMPLEMENTED. XER is a tab-delimited table…, _UnimplementedProvider, parametrize (+1 more)

### Community 291 - "test_providers.py"
Cohesion: 0.18
Nodes (9): normalize_activity(), normalize_wbs_level(), The planning level, or None when the source does not state one. Deliberately…, One activity from any baseline, in the shape every consumer expects.…, Tests for schedule providers, baseline identity, and the agreement guard. Two…, v2 omits `detail` entirely; it is concatenated into the embedding document and…, v1's "1.1.1.1" has four segments. Inferring level 4 from it would contradict…, TestNormalizeActivity (+1 more)

### Community 292 - "validate_activities"
Cohesion: 0.27
Nodes (6): dangling_predecessors(), Problems worth refusing to load on. Returns human-readable messages. Checked: a…, Predecessor ids that are not activities in the same baseline., validate_activities(), The v1 baseline states no level at all; that is not an error., TestValidation

### Community 293 - "ScheduleProvider"
Cohesion: 0.18
Nodes (7): BaselineVersion, ABC, A source of baseline schedule activities. Two methods, deliberately separate:…, Normalised activity dicts (see `normalize_activity`)., Identity of the source: name, filename, sha256, activity count., Which schedule is loaded, and how to prove it later. `sha256` is over the raw…, ScheduleProvider

### Community 294 - "2026-09-01 / D-017 — A second baseline is adopted as a version, not as a replacement"
Cohesion: 0.22
Nodes (9): 2026-09-01 / D-017 — A second baseline is adopted as a version, not as a replacement, Affected Areas, Alternatives Considered, Context, Decision, Known limitation, reported rather than hidden, Reason, Verification (+1 more)

### Community 295 - "2026-09-01 / D-019 — Refuse to evaluate a baseline the ground truth does not describe"
Cohesion: 0.29
Nodes (7): 2026-09-01 / D-019 — Refuse to evaluate a baseline the ground truth does not describe, Affected Areas, Alternatives Considered, Context, Decision, Future Notes, Reason — why resolvable coverage, not exact matching

### Community 296 - "BaselineAgreement"
Cohesion: 0.29
Nodes (3): BaselineAgreement, How well a ground-truth file and a baseline describe the same project., The message a human needs to fix this, not just to know it broke.

### Community 297 - "normalize_wbs_path"
Cohesion: 0.43
Nodes (3): normalize_wbs_path(), A single displayable WBS path. v1 gives a dotted code (`"1.1.1.1"`); v2 gives…, TestWbsPath

### Community 298 - "2026-09-01 / D-018 — Baselines are read through a provider, never by `json.load` at the call site"
Cohesion: 0.33
Nodes (6): 2026-09-01 / D-018 — Baselines are read through a provider, never by `json.load` at the call site, Affected Areas, Alternatives Considered, Context, Decision, Predecessor storage — the migration

### Community 299 - "Previous Modification Area (2026-09-01, D-015/D-016) — retained for history"
Cohesion: 0.33
Nodes (6): Current path, Downstream, Known follow-ups, Previous Modification Area (2026-09-01, D-015/D-016) — retained for history, Upstream, Verification performed

### Community 301 - ".test_session_across_files_not_inflated"
Cohesion: 0.40
Nodes (3): Test that session totals are correct when the same session spans multiple files., Same session in 2 files with duplicate message_ids should not inflate totals., TestCrossFileSessionTotals

## Knowledge Gaps
- **1170 isolated node(s):** `name`, `version`, `license`, `private`, `type` (+1165 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1972 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `interpret()` connect `interpret` to `test_llm_guards.py`, `agent_slots.py`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `LockTimeoutError` connect `Path` to `compress.py`, `interpret`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `TestReviewQueue` connect `TestReviewQueue` to `Activity`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `Activity` (e.g. with `main()` and `_activity_model()`) actually correct?**
  _`Activity` has 33 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `MatchingEngine` (e.g. with `LinkCandidate` and `LinkDecision`) actually correct?**
  _`MatchingEngine` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `Extractor` (e.g. with `_build_event()` and `LLMBackend`) actually correct?**
  _`Extractor` has 13 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `license` to the rest of the system?**
  _1170 weakly-connected nodes found - possible documentation gaps or missing edges._