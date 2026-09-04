# Graph Report - SIH 2026  (2026-09-04)

## Corpus Check
- 325 files · ~837,305 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5640 nodes · 9793 edges · 415 communities (347 shown, 53 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 483 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `246110db`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- agent_turn
- main.py
- extension.ts
- LinkedEvent
- get_pricing
- parse_pmxml
- interpret
- features.py
- SIH26122_7Day_Build_Plan.md
- Extractor
- get_dashboard_data
- scan
- parse_jsonl_file
- sync_delay_events
- 7. Known Limitations
- harness.py
- test_extractor.py
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
- AuditRecord
- EngineConfig
- HybridRetriever
- MatchingEngine
- _turn
- devDependencies
- TestHTMLTemplate
- compilerOptions
- dependencies
- compilerOptions
- scripts/cli.py
- make_report.py
- _import
- test_evalstats_additions.py
- extract_dates_with_basis
- compute_evm
- test_subagent.py
- TestAuditTrail
- Path
- normalize_wbs_level
- Setup — Windows, from nothing
- _make_user_record
- Running the demo
- 2. Findings
- FLOW.md — How execution actually travels through NAVIS
- cavecrew/SKILL.md
- Caveman Help
- Claude Code Usage — VS Code extension
- extract_tags
- Activity
- api
- test_agent.py
- make_graphs.py
- healthcheck.py
- vscode-extension/package.json
- Caveman Compress
- caveman/SKILL.md
- TestVersion
- parse_predecessors
- 15. Historical handoff — state at the end of the reconstruction session (2026-08-31)
- _field_event
- 15. Implementation order
- 15. Implementation order
- LLMEventOutput
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
- qa_agent.py
- providers.py
- extract_fractions
- config.ts
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
- _build_event
- TestIngestEndpoint
- JsonScheduleProvider
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
- MiniLMEmbedder
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
- llm_backend.py
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
- validate_activities
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
- states.test.tsx
- MCP Tools: code-review-graph
- MCP Tools: code-review-graph
- MCP Tools: code-review-graph
- 8. Risk engine and pattern analysis
- Home.tsx
- MCP Tools: code-review-graph
- Competitive landscape — method and honesty statement
- Evidence index — what kind of claim each number in the report is
- test_learned.py
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
- evaluate_duration_predictions
- PS Analysis — SIH 26122 requirement coverage, audited against code
- 11. The semantic layer
- 14. MVP triage
- 3. The three roles
- Independent audit — SIH 2026 matching system
- 9. Knowledge handoff — design
- Schedule.tsx
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
- Ingest.tsx
- Innovation analysis — what is genuinely novel vs table stakes
- NAVIS Technical Audit — component-by-component status, read from code
- generate_v2_dataset.py
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
- eval_real.py
- Run and deploy your AI Studio app
- 0. Read this first
- 10. MPP and Primavera — verified
- 12. Evaluation module
- code-review-graph
- code-review-graph
- Experiment log — every number traces to a harness in research/data/
- SIH judge analysis — 15-dimension self-scorecard
- Raid.tsx
- TestHonestyFieldsArePresentAndStructured
- NAVIS — Stitch prompts, rewritten for screen generation
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
- test_primavera.py
- _validate_description
- 2026-09-04 / D-077 — A delay becomes a row, so a planner has something to overrule
- agent_llm.py
- 2026-09-01 / D-017 — A second baseline is adopted as a version, not as a replacement
- 2026-09-01 / D-019 — Refuse to evaluate a baseline the ground truth does not describe
- BaselineAgreement
- TestMemoryQuery
- 2026-09-01 / D-018 — Baselines are read through a provider, never by `json.load` at the call site
- test_terminology.py
- TestDashboardSubagentData
- .test_session_across_files_not_inflated
- TestDashboardOnUnmigratedDB
- OpenAICompatibleBackend
- TestNonBillableModelFallback
- test_date_basis.py
- NAVIS — copy-paste Stitch prompt pack
- 2026-09-04 / D-076 — The delay taxonomy is built, and liability is a lookup a human can audit
- drift_eval.py
- NAVIS — run-up to the internal hackathon, Fri 4 Sep
- TestPrimaveraImport
- _event
- END OF PART 0 — the D-series resumes below
- storage.test.tsx
- vocabulary.py
- METRICS.md — the only place a number is defined
- extract_quantities
- test_evidence.py
- Reconcile.tsx
- ErrorBoundary
- test_agent_llm.py
- TestExtractorPipeline
- embedcache.py
- resolve
- probe
- VALIDATION — dataset/v2
- 2026-09-03 / D-065 — An LLM-suggested description must be the supervisor's own words
- NAVIS — backend-to-interface audit
- 2026-09-01 / D-028 - The learned ranker is selected under the precision floor, not on top-1
- NAVIS
- agent_slots.py
- TestExportDownload
- 2026-09-02 / D-047 - Primavera PMXML and XER are read, not just written; FINDINGS F3 closed
- 2026-09-02 / D-052 - An activity-type vocabulary from CFIHOS and Uniclass, built and deliberately not wired in
- TestStandardCoverageIsHonest
- llm_enabled
- 2026-09-01 / D-022 — A tag's digit count is a numbering convention, not part of what a tag is
- 2026-09-01 / D-024 - A near-miss is a mention with its discriminator removed
- 2026-09-01 / D-030 - One design system: six type steps, six spacing steps, three radii, and five button jobs
- 2026-09-01 / D-034 - Demo counts re-measured; the review queue grew because the system got more careful
- 2026-09-01 / D-037 - An independent audit refuted four of our claims, and it was right about three and a half
- 2026-09-03 / D-071 — A delay cause is counted once per report, not once per audit row
- test_vocabulary.py
- TestNotWiredIntoMatching
- 2026-09-01 / D-031 - One file defines every number, and it is not any of the ones that had them
- 2026-09-01 / D-032 - The alias loop is NOT closed, and the documentation said three different things
- 2026-09-01 / D-033 - The live server runs the v1 hand-set blend, and no document said so
- 2026-09-01 / D-035 - Real-corpus counts verified from manifests; the WSDOT schedule has 27 activities
- 2026-09-01 / D-039 - Tier 1 screens restructured around one question each; the matcher's reasoning is still invisible on Reconcile, and that is a backend gap
- 2026-09-01 / D-041 — Projector legibility: conflicts above the fold, and a banner that reads as detection
- 2026-09-01 / D-042 - The review queue projects the matcher's reasoning, and every candidate carries its own score
- 2026-09-01 / D-043 — The product fonts ship with the frontend
- 2026-09-02 / D-046 - Schedule-side EVM, and why its headline SPI is flagged unsafe on this dataset
- 2026-09-02 / D-048 - RAID register: one table, arithmetic exposure, and no candidate commits itself
- 2026-09-02 / D-049 - Field notifications derived from the audit trail, with no read state and no new table
- 2026-09-02 / D-051 - eval.py reports calibration, confidence intervals and macro-F1, and the calibration result is mixed
- 2026-09-03 / D-066 — A give-up must be remembered, and a confirm must never vanish
- 2026-09-03 / D-067 — The role decides the application; a viewport never does
- 2026-09-03 / D-069 — The register gets the writer it was missing
- 2026-09-03 / D-072 — The design brief enters the repository, dated to a commit
- Small follow-ups — use individually after the relevant screen exists
- 2026-09-01 / D-020 — The v2 evaluation corpus is generated as one family, from one seed
- 2026-09-01 / D-023 — A unit suffix is not a numerator
- 2026-09-01 / D-025 - Two more tag-normalisation defects, found by auditing for the assumption rather than the symptom
- 2026-09-01 / D-026 - The dense channel was 86% of latency because it encoded one mention at a time
- 2026-09-01 / D-027 - Recall@20 is 100%, so retrieval tuning cannot help and discipline gating actively hurts
- 2026-09-01 / D-036 - Negative results are kept, labelled, and not quietly dropped
- 2026-09-01 / D-038 — The resolver rejected the Reconcile screen's own verb
- 2026-09-01 / D-040 — Recall is reported at the depth the planner is shown, and a CSV upload now fails loudly
- 2026-09-02 / D-044 - Exports are downloadable; the advertised URL is no longer dead
- 2026-09-02 / D-045 - The committed corpus is UTF-8, and the generator can no longer write anything else
- 2026-09-02 / D-050 - The Evidence API reports the corpus from its own manifests, caveats included
- 2026-09-02 / D-060 — Three roles behind a role picker, and an executive view that never shows a queue
- 2026-09-03 / D-068 — `auto_applied` is not a claim about who decided
- 2026-09-03 / D-070 — The server migrates its own database, or the migration does not exist
- 2026-09-04 / D-073 — The Reconcile screen speaks the server's resolve vocabulary
- TestDescriptionLength
- TestLifecycle
- parse_date
- 2026-09-03 / D-064 — DEMO.md realigned to the three-role application
- infer_discipline
- TestPlannerResolvesAWithheldFinish
- TestDatabaseModels
- TestReviewQueue
- TestBuiltFromTheBaseline
- WSDOT C8078 candidate-link verification review
- test_evm.py
- Basics.md
- TestStartupAppliesTheMigration
- 2026-09-01 / D-029 - Confidence becomes a probability; the abstention model earns nothing on top of it
- lucide-react
- react-router-dom
- @tanstack/react-table
- typescript
- The numbers you may say out loud
- parse_quantity
- TestScheduleIndex
- 2026-09-04 / D-075 — D-061 is re-affirmed, and now pinned on the served engine
- TestCandidatesAreNeverAutoCommitted
- compute_exposure
- TestIntegrityRules
- TestTheVocabularyStaysShared
- read_text
- 2026-09-04 / D-078 — A liability becomes a finding only when a planner rules, and the ruling is audited
- get_matching_engine
- TestJobsEndpoint
- TestUnreportableInputIsRefused
- normalize_wbs_path
- TestTheAgentNeverAsksTheSameSlotForever
- load_ground_truth
- expected_calibration_error
- test_every_baseline_activity_id_matches_the_pattern
- 9. Application startup — what loads, when, and in what order
- TestAConfirmIsNeverSilentlySwallowed
- _parse_date

## God Nodes (most connected - your core abstractions)
1. `MatchingEngine` - 92 edges
2. `Activity` - 86 edges
3. `END OF PART 0 — the D-series resumes below` - 79 edges
4. `ScheduleIndex` - 53 edges
5. `EngineConfig` - 52 edges
6. `LinkedEvent` - 47 edges
7. `extract_tags()` - 45 edges
8. `AuditRecord` - 45 edges
9. `Thresholds` - 40 edges
10. `Extractor` - 39 edges

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
- 3-file cycle: `matching/__init__.py -> matching/engine.py -> matching/retrieval.py -> matching/__init__.py`

## Communities (415 total, 53 thin omitted)

### Community 0 - "agent_turn"
Cohesion: 0.08
Nodes (37): AgentContext, AgentTurnRequest, AgentContext, choices_for(), mentions_countable(), question_for(), True when the update is about something the project counts. Decides whether a…, Structured context the client already knows. Supplied as request data, never… (+29 more)

### Community 1 - "main.py"
Cohesion: 0.03
Nodes (126): DurationDistribution, get, ProductivityMetric, Job, Tracks a file ingestion and extraction pipeline run., agent_llm_status(), _baseline_response(), _compute_duration_distribution() (+118 more)

### Community 2 - "extension.ts"
Cohesion: 0.05
Nodes (37): activate(), deactivate(), describeMode(), Extension, noInstallMessage(), noPythonMessage(), claudeUsageCandidateNames(), dashboardSpawnArgs() (+29 more)

### Community 3 - "LinkedEvent"
Cohesion: 0.03
Nodes (87): EventIndex, post, ResolveResponse, AliasLexicon, IntegrityError, IntegrityWarning, LinkedEvent, _now() (+79 more)

### Community 4 - "get_pricing"
Cohesion: 0.06
Nodes (32): calc_cost(), cmd_dashboard(), cmd_scan(), cmd_stats(), cmd_today(), cmd_week(), fmt(), fmt_cost() (+24 more)

### Community 5 - "parse_pmxml"
Cohesion: 0.06
Nodes (44): Element, _attr(), _child_text(), _discipline_from_id(), _field(), _finish(), _iso(), _lag_days() (+36 more)

### Community 6 - "interpret"
Cohesion: 0.13
Nodes (13): interpret(), Ask the model to read one message. Returns None on any problem. `backend` is…, _Output, The model's status is run through our parser, not taken as given., Stands in for LLMEventOutput., A rejected description must not take the rest of the turn with it., One span in, one event out. More than one is refused, never truncated., D-006, enforced rather than assumed. (+5 more)

### Community 7 - "features.py"
Cohesion: 0.07
Nodes (44): _area_match(), blend_matrix(), blend_with_line_lock(), compute_features(), _date_proximity(), final_score(), matrix_to_vectors(), _predecessor_plausibility() (+36 more)

### Community 8 - "SIH26122_7Day_Build_Plan.md"
Cohesion: 0.04
Nodes (48): 0. What We're Actually Building (Plain Language), Biggest Risks to This Timeline, Concepts each person should understand today, Concepts each person should understand today, Concepts each person should understand today, Concepts each person should understand today, Concepts each person should understand today, Concepts each person should understand today (+40 more)

### Community 9 - "Extractor"
Cohesion: 0.08
Nodes (23): _basis_at(), Extractor, date, DateBasis, Discipline, ExtractedEvent, Extract progress events from a source file. Dispatches to the appropriate…, Extract from a text-based daily progress report. (+15 more)

### Community 10 - "get_dashboard_data"
Cohesion: 0.12
Nodes (6): get_dashboard_data(), Regression: turns with model='' (empty string) must group as 'unknown'.…, Regression: a mix of model=NULL and model='' rows must collapse into a SINGLE…, TestEmptyStringModelNormalization, TestGetDashboardData, TestMixedNullAndEmptyModel

### Community 11 - "scan"
Cohesion: 0.09
Nodes (20): _backfill_topics(), extract_agent_dispatch(), _extract_title(), is_subagent_record(), Extract a session title from a custom-title or ai-title record., One-time backfill of topics for a DB created before topic support. Transcript…, True if a record belongs to a dispatched subagent (Task/Agent tool). Subagents…, Pull the subagent id off a record, if any (top-level or data wrapper). (+12 more)

### Community 12 - "parse_jsonl_file"
Cohesion: 0.11
Nodes (14): parse_jsonl_file(), Parse a JSONL file and return (session_metas, turns, agents, line_count).…, _make_assistant_record(), Test deduplication of streaming events by message.id., Multiple records with same message.id should produce one turn., Records with different message.id are separate turns., Records without message.id are kept as-is (no dedup)., Mix of records with and without message.id. (+6 more)

### Community 13 - "sync_delay_events"
Cohesion: 0.03
Nodes (76): DelayEvent, One delay, classified, with the sentence it was read from. ARCHITECTURE.md §2.7…, adjudicate(), attribution(), _citing_record(), effective_liability(), is_adjudicated(), _month_of() (+68 more)

### Community 14 - "7. Known Limitations"
Cohesion: 0.05
Nodes (42): 0. Five places I think you're wrong, 1. Component Diagram, 2.1 `ScheduleActivity`, 2.2 `RawInput`, 2.3 `ExtractedEvent`, 2.4 `LinkCandidate`, 2.5 `LinkDecision`, 2.6 `AuditRecord` (+34 more)

### Community 15 - "harness.py"
Cohesion: 0.04
Nodes (64): Configuration for retrieval and ranking. Every knob that an experiment might…, abstention_features(), _basis_for(), _basis_of(), decide_outcome(), _describe_conflicts(), DateBasis, ndarray (+56 more)

### Community 16 - "test_extractor.py"
Cohesion: 0.09
Nodes (43): Main extraction orchestrator. Ties together: 1. Deterministic pre-pass (regex)…, DateBasis, Discipline, EventStatus, ExtractedEvent, ExtractionMethod, Provenance, BaseModel (+35 more)

### Community 17 - "scanner.py"
Cohesion: 0.10
Nodes (20): dashboard.py - Local web dashboard served on localhost:8080., _ensure_column(), get_db(), init_db(), insert_turns(), _model_priority(), scanner.py - Scans Claude Code JSONL transcript files and stores data in SQLite., Add a column to an existing table if it isn't already present. Returns True if… (+12 more)

### Community 18 - "Audit-1.md"
Cohesion: 0.06
Nodes (34): APPENDIX — REPRODUCING EVERY NUMBER, Audit-1 — NAVIS vs SIH 26122 Problem Statement, CRITICAL FINDINGS, DEFECTS NOT IN THE EXISTING AUDIT, F-01 — The matching engine ranks worse than plain BM25, and the defense is buried, F-02 — At 50.4% coverage, half the manual reconciliation the PS complains about still happens, F-03 — The learning loop is open: the system cannot get better, F-04 — Institutional memory, the stated differentiator, is statistically empty (+26 more)

### Community 19 - "RollupAccumulator"
Cohesion: 0.09
Nodes (20): Aggregates many field mentions (AUTO_LINK decisions) into one L5/L6 schedule…, RollupAccumulator, make_event(), date, fixture, A finish date nobody asserted must not reach the schedule. A DPR line that says…, Roll 1200 m2 - the full planned quantity of CIV-SIT-1001., The other half of the same defect: no finish claim at all, and the bare report… (+12 more)

### Community 20 - "Workflow"
Cohesion: 0.06
Nodes (31): Architecture, CHANGELOG conventions, Common commands, Cost calculation, Dashboard server, Data flow, Homebrew formula and self-referential SHA, Non-obvious invariants (+23 more)

### Community 21 - "TestMessageIdDedupIntegration"
Cohesion: 0.29
Nodes (4): Integration test: dedup across scan cycles., 3 streaming events for 2 messages should produce 2 turns., Re-scanning a file shouldn't create duplicate turns for same message_id., TestMessageIdDedupIntegration

### Community 22 - "types.ts"
Cohesion: 0.10
Nodes (31): ApiError, fetchWithHandler(), ANSWER, ITEM, ready(), wrap(), AgentContext, AgentTurnRequest (+23 more)

### Community 23 - "eval.py"
Cohesion: 0.09
Nodes (52): assert_baseline_matches_ground_truth(), _baseline_line(), calibrate(), _calibration_observations(), _dated(), _decision_for(), evaluate(), _gold_discipline() (+44 more)

### Community 24 - "test_llm_guards.py"
Cohesion: 0.10
Nodes (36): _extract_one(), parametrize, Guards protecting the pipeline from LLM extraction errors. These cover three…, The guard must not suppress genuine actuals., Belt and braces for providers with no grammar constraint., Tags feed the matcher's near-decisive tag_overlap feature. Description words…, The model returned ['steel erection', 'pipe rack'] and missed TK-1., The observed case: "All 12 pockets grouted" yields quantity 12 with no uom.… (+28 more)

### Community 25 - "ScheduleIndex"
Cohesion: 0.05
Nodes (45): Returns (score, line_locked). A full line+size+spec match sets line_locked=True…, _tag_overlap(), Hybrid candidate retrieval: exact tag + BM25 + dense + char n-gram + alias…, BaselineVersion, date, Schedule index: loads the baseline schedule and precomputes every lookup…, Build the BM25 index for these (k1, b), reusing it if unchanged. rank_bm25…, Precompute the term x document BM25 score matrix. Every factor in the Okapi… (+37 more)

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
Cohesion: 0.09
Nodes (17): buildRecognition(), classifySpeechError(), getCtor(), langSubscribers, setSharedLang(), SPEECH_LANGUAGES, SpeechFailure, SpeechRecognitionAlternative (+9 more)

### Community 30 - "compress.py"
Cohesion: 0.13
Nodes (24): build_compress_prompt(), build_fix_prompt(), call_claude(), _compress_file_locked(), first_nonblank_line(), mask_code_blocks(), r"""Strip an outer ```markdown ... ``` fence when it wraps the ENTIRE output.…, Write ``text`` to ``path`` atomically as UTF-8. Path.write_text() truncates the… (+16 more)

### Community 31 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 32 - "App.tsx"
Cohesion: 0.12
Nodes (23): App(), DesktopShell(), EXECUTIVE_NAV, MobileShell(), NavItem, PLANNER_NAV, Session, SessionContext (+15 more)

### Community 33 - "Changelog"
Cohesion: 0.09
Nodes (23): Changelog, Dashboard, Dashboard, Dashboard, Dashboard, Extension, Packaging, Packaging (+15 more)

### Community 34 - "Field.tsx"
Cohesion: 0.08
Nodes (41): NeedsYourResponse(), RecentUpdates(), STATUS_ICON, STATUS_SHORT, when(), BaseProps, Button(), ButtonProps (+33 more)

### Community 35 - "caveman-compress/README.md"
Cohesion: 0.09
Nodes (20): Before / After, Benchmarks, How It Work, <img src="../../docs/assets/dancing-rock.svg" width="20" height="20" alt="rock"/> Caveman (285 tokens), Install, Original (706 tokens), Part of Caveman, Security (+12 more)

### Community 36 - "AuditRecord"
Cohesion: 0.03
Nodes (84): DeclarativeBase, ObservationKey, patch, AuditRecord, Base, ConversationTurn, get_db(), MemoryCache (+76 more)

### Community 37 - "EngineConfig"
Cohesion: 0.06
Nodes (47): EngineConfig, RetrievalConfig, The one embedder for this process. Every construction path that does not pass…, shared_embedder(), Configuration settings that a measurement disqualified, pinned so they cannot…, D-061. The alias channel cannot help, so it stays off. Measured on the…, D-062. `extra_features=True` breaches the precision floor on v1. Row 8a of the…, The hand-set blend is what the v1 demo runs, by design. (+39 more)

### Community 38 - "HybridRetriever"
Cohesion: 0.10
Nodes (12): _load_pickle(), Path, HybridRetriever, L2-normalised activity embeddings, read from disk when this exact (model,…, Exact/near-exact tag match, ranked by match quality: full (line+size+spec) >…, Character 3-5 gram cosine. Robust to the spelling errors and abbreviations the…, Planner corrections, read back. A confirmed correction is the strongest…, The single activity an unambiguous tag resolves to, else None. 'Unambiguous'… (+4 more)

### Community 39 - "MatchingEngine"
Cohesion: 0.11
Nodes (17): Roll one event onto one node and return the RollupResult., _rollup_one(), _discipline_of(), MatchingEngine, Resolve a whole file's mentions, encoding them in one forward pass., Score the whole candidate pool as a matrix, then wrap the result in the per-…, Cosine similarity of the dense channel for this candidate (None if the…, Resolve one ExtractedEvent against the schedule. Routed through the batch path… (+9 more)

### Community 40 - "_turn"
Cohesion: 0.13
Nodes (12): client(), fixture, An API client sharing the seeded test database., The exact three-turn conversation the demo runs on., Part 17: 'Electrical' used to be rejected and the question repeated., How many were planned in total?" accepted no plain answer at all., TestDemonstrationExchange, TestHumanGate (+4 more)

### Community 41 - "devDependencies"
Cohesion: 0.10
Nodes (21): autoprefixer, esbuild, devDependencies, autoprefixer, esbuild, jsdom, tailwindcss, @testing-library/jest-dom (+13 more)

### Community 42 - "TestHTMLTemplate"
Cohesion: 0.11
Nodes (9): Verify XSS protection is present (PR #10)., Verify getPricing falls back to substring match for unknown models., Verify getPricing returns null for non-Anthropic models., Hourly distribution chart has a canvas + TZ toggle., Peak-hour set covers UTC 12–17 (Mon–Fri 05:00–11:00 PT)., The 'Today' range is wired into RANGE_LABELS, RANGE_TICKS, getRangeBounds, and…, The head carries the server-substituted config placeholder and the footer…, The GitHub update check and the extension promo are web-only: both guard on… (+1 more)

### Community 43 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, lib, module, outDir, resolveJsonModule, rootDir, skipLibCheck (+10 more)

### Community 44 - "dependencies"
Cohesion: 0.10
Nodes (20): @fontsource-variable/inter, @fontsource-variable/jetbrains-mono, dependencies, @fontsource-variable/inter, @fontsource-variable/jetbrains-mono, react, react-dom, recharts (+12 more)

### Community 45 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+11 more)

### Community 46 - "scripts/cli.py"
Cohesion: 0.19
Nodes (15): main(), print_usage(), backup_dir_for(), Out-of-tree backup dir for filepath, keyed by its parent dir name — kept…, detect_file_type(), _is_code_line(), _is_json_content(), _is_yaml_content() (+7 more)

### Community 47 - "make_report.py"
Cohesion: 0.13
Nodes (11): BaseDocTemplate, callout(), fig(), Path, Build research/NAVIS_SIH_FINAL_REPORT.pdf from repository evidence. Nothing…, Numbered data table with a caption; status_col cells are colour-coded., Image + numbered caption, kept together. Aspect ratio preserved., ReportDoc (+3 more)

### Community 48 - "_import"
Cohesion: 0.07
Nodes (15): _import(), Path, PMXML is now READ, not refused (D-047 closes FINDINGS F3). This used to assert…, Adding PMXML and XER must not have opened the door to everything., Half-loading a broken baseline is far harder to notice than a refusal, so…, Nothing is being replaced, so nothing needs consent., Deleting them would orphan their LinkedEvent and AuditRecord rows and silently…, The planned fields already match, so a re-import is a no-op beyond registering… (+7 more)

### Community 49 - "test_evalstats_additions.py"
Cohesion: 0.27
Nodes (20): accuracy(), confusion_counts(), f1(), precision(), Calibration, confidence intervals and macro-F1 for `eval.py`. ROADMAP §12.…, Count tp / fp / fn / tn over link observations. WHY: precision, recall,…, Fraction of suggested links that were correct: tp / (tp + fp). WHY: precision…, Fraction of gold-positive items that received a correct link: tp / gold. WHY:… (+12 more)

### Community 50 - "extract_dates_with_basis"
Cohesion: 0.08
Nodes (18): extract_dates(), extract_dates_with_basis(), extract_dates_with_flags(), date, DateBasis, Resolve a year-less date ("30 Jul") against the report's header date. DPR prose…, Extract dates in encounter order with the basis of each, plus warnings for…, Extract dates in encounter order, plus warnings for anything that could not be… (+10 more)

### Community 51 - "compute_evm"
Cohesion: 0.07
Nodes (24): compute_evm(), EVMFigures, planned_fraction(), date, PV/EV/SV/SPI for one grouping, plus what produced the percentages., EV / PV, or None when PV is 0. Never 0.0 as a stand-in., Project and per-discipline EVM as of `data_date`. Read-only: no table is…, Share of the activity's planned duration elapsed by the data date. Wholly… (+16 more)

### Community 52 - "test_subagent.py"
Cohesion: 0.23
Nodes (5): _assistant(), _dispatch(), Tests for subagent attribution: detection, agent-dispatch capture, scan…, TestSubagentDetection, TestSubagentScanIntegration

### Community 54 - "Path"
Cohesion: 0.15
Nodes (17): compress_file(), file_lock(), is_sensitive_path(), lock_path_for(), LockTimeoutError, Path, Raised when another process holds the compress lock past LOCK_WAIT_SECONDS., Cross-session lock path keyed on the same (parent-dir-name, stem) identity… (+9 more)

### Community 55 - "normalize_wbs_level"
Cohesion: 0.38
Nodes (4): normalize_wbs_level(), The planning level, or None when the source does not state one. Deliberately…, v1's "1.1.1.1" has four segments. Inferring level 4 from it would contradict…, TestWbsLevel

### Community 56 - "Setup — Windows, from nothing"
Cohesion: 0.11
Nodes (18): 0. What you need, 1. Get the repo and create a virtual environment, 2. Install Python dependencies, 3. Seed the database, 4. Start the backend — from the PROJECT ROOT, 5. Install and start the frontend, 6. Verify, Checking what is actually live (+10 more)

### Community 57 - "_make_user_record"
Cohesion: 0.22
Nodes (8): _make_ai_title_record(), _make_custom_title_record(), _make_user_record(), Topic persistence through scan(): DB write, incremental capture, and the no-…, One-time backfill of topics for DBs that predate topic support (#147)., Simulate a not-yet-backfilled DB: clear the captured topic and the one-time…, TestSessionTopicScan, TestTopicBackfill

### Community 58 - "Running the demo"
Cohesion: 0.07
Nodes (27): 1. Home — the state of the project, 2. Ingest — watch the pipeline, 3. Reconcile — resolve one, 4. Schedule — confirm it landed, 4a. Exposure — adjudicate what the evidence proposes, 5. Memory — the half nobody else builds, 6. Overview — schedule health, read-only, 7. Exposure — the RAID register and unresolved conflicts (+19 more)

### Community 59 - "2. Findings"
Cohesion: 0.12
Nodes (16): 0. Verdict, 1. PS requirement coverage, 2. Findings, 3. What you are underselling, 4. Last day, in order, Act on this first, F1 — CRITICAL — Eleven activities share one finish date; two have zero duration, F2 — HIGH — "50.4% coverage" counts mentions; the schedule received eleven rows (+8 more)

### Community 60 - "FLOW.md — How execution actually travels through NAVIS"
Cohesion: 0.14
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
Cohesion: 0.09
Nodes (12): extract_tags(), Extract all equipment/line tags from free text., parametrize, A tag number's digit count is a numbering convention, not part of what a tag…, The bound is generous on purpose — the next baseline should not need another…, WHCP-2101 is a real v2 tag; a three-letter prefix bound dropped it., Longest match wins. Widening the equipment suffix to five digits also made this…, The prefix stays uppercase-only. Widening it to four letters would otherwise… (+4 more)

### Community 65 - "Activity"
Cohesion: 0.04
Nodes (63): on_event, RuntimeError, main(), Reset the demo database to a known seeded state. Safe to run while the server…, main(), Build a working database from scratch. Loads the 120-activity baseline…, Activity, BaselineVersion (+55 more)

### Community 66 - "api"
Cohesion: 0.16
Nodes (15): FieldNav(), TABS, PLANNER, api, Card(), FieldClarifications(), Filter, FILTERS (+7 more)

### Community 67 - "test_agent.py"
Cohesion: 0.19
Nodes (8): discipline_choice_text(), discipline_label(), parse_discipline(), Read a discipline from free text. `as_answer` means the message is a direct…, Human label for a stored discipline value. Raises on an unknown value rather…, The choices, in the order the schedule lists them., Tests for the conversational agent: parsing, the human gate, and the guarantee…, TestDisciplineLabels

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

### Community 74 - "parse_predecessors"
Cohesion: 0.20
Nodes (8): parse_predecessor(), parse_predecessors(), PredecessorLink, Any, One predecessor entry, from either baseline shape. Accepts a bare id (`"CIV-…, One logic tie into an activity. `rel` is the Primavera relationship type and…, A relationship type we cannot read is a weaker signal than a predecessor…, TestPredecessors

### Community 75 - "15. Historical handoff — state at the end of the reconstruction session (2026-08-31)"
Cohesion: 0.17
Nodes (12): 15. Historical handoff — state at the end of the reconstruction session (2026-08-31), Completed, Component status at handoff, Environment assumptions the next agent should verify first, Known bugs, Known failing tests, Known technical debt, Last major task attempted (+4 more)

### Community 76 - "_field_event"
Cohesion: 0.17
Nodes (12): _activity(), _audit(), _field_event(), Rejecting writes no actual, so nothing points back at the event. This is the…, Only this supervisor's own submissions count — the same scoping /field/reports…, Null, not 0 — a 0 would read as "measured, and on plan".…, A submission from the supervisor — the same scoping /field/reports uses., planned finish 1 Sep, reported 3 Sep -> +2 days. (+4 more)

### Community 77 - "15. Implementation order"
Cohesion: 0.17
Nodes (12): 15. Implementation order, Phase 10 — Integration layer, Phase 11 — Risk engine, Phase 1 — Data model foundation, Phase 2 — Roles and permissions, Phase 3 — RAID, Phase 4 — EVM, Phase 5 — Verification screen completion (+4 more)

### Community 78 - "15. Implementation order"
Cohesion: 0.17
Nodes (12): 15. Implementation order, Phase 10 — Integration layer, Phase 11 — Risk engine, Phase 1 — Data model foundation, Phase 2 — Roles and permissions, Phase 3 — RAID, Phase 4 — EVM, Phase 5 — Verification screen completion (+4 more)

### Community 79 - "LLMEventOutput"
Cohesion: 0.13
Nodes (11): LLMBatchOutput, LLMEventOutput, OllamaBackend, BaseModel, Local Ollama backend for offline/demo mode. Two things matter for correctness…, Reachable AND actually serving the configured model., Build and send one request. The ~3,000-token baseline schedule is deliberately…, Structured output we request from the LLM. Deliberately asks for NO dates and… (+3 more)

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
Nodes (11): 10. RESOLVED (2026-09-01, D-016) — `0/0 nos → 100.0%`, 13. Technical debt, dead code, and live defects, 1. CLOSED (D-073) — the planner resolve actions now speak the server's vocabulary, 2. LIVE BUG (latent) — `.csv` is accepted for upload and cannot be parsed, 3. Dead code — the unreachable `_dense_cos` / `_unique_line` duplicate, 4. Dead code — the unreachable `REJECTED` branch in `ingest_file`, 5. Incomplete implementation — the predecessor integrity warning is unconditional, 6. Dead schema and dead index (+3 more)

### Community 91 - ".from_json"
Cohesion: 0.11
Nodes (15): check_ground_truth_agreement(), Do the ground truth and the loaded baseline describe the same project?…, Path, Load a JSON baseline. Both shipped baselines load through the same provider, so…, The startup-built term x doc matrix must BE BM25, not approximate it., Refitting for new (k1, b) must refit the matrix too — a stale matrix beside a…, TestPrecomputedBM25, _ground_truth_ids() (+7 more)

### Community 92 - "test_scanner.py"
Cohesion: 0.13
Nodes (12): aggregate_sessions(), _meta_get(), _meta_set(), project_name_from_cwd(), Read a value from the schema_meta key/value table (None if absent)., Upsert a value into the schema_meta key/value table., Derive a friendly project name from cwd path., Aggregate turn data back into session-level stats. (+4 more)

### Community 93 - "qa_agent.py"
Cohesion: 0.10
Nodes (47): _accept(), _allowed_numbers(), _build_facts(), _build_prompt(), _compose(), _coverage_fraction(), _delay_facts(), _duration_facts() (+39 more)

### Community 94 - "providers.py"
Cohesion: 0.10
Nodes (15): BaselineVersion, normalize_activity(), _PrimaveraProvider, ABC, Schedule providers: where a baseline comes from, and what shape it arrives in.…, One activity from any baseline, in the shape every consumer expects.…, A source of baseline schedule activities. Two methods, deliberately separate:…, Normalised activity dicts (see `normalize_activity`). (+7 more)

### Community 95 - "extract_fractions"
Cohesion: 0.21
Nodes (7): extract_fractions(), Extract progress fractions like '6 of 8'., A unit suffix is not a numerator. `FRACTION_RE` had no boundary before the…, dataset/v2 currently writes "40 of 120 m3" to route around this bug. That…, The v2 generator produced "1 m3 of 1 m3", which parsed as 3/1 = 300% and was…, The whole point: the derived percentage has to be usable, because it is what…, TestFractionUnitSuffix

### Community 96 - "config.ts"
Cohesion: 0.09
Nodes (20): DISCIPLINE_COLOR, DisciplineTagProps, DISCIPLINE_AXIS, DISCIPLINE_LABEL, DISCIPLINE_META, DISCIPLINE_ORDER, DISCIPLINE_SHORT, DISCIPLINES (+12 more)

### Community 97 - "ROADMAP.md — Senior PM review, decoded and architected"
Cohesion: 0.20
Nodes (9): 13. Layer separation — every recommendation, assigned, 16. Open questions to take back to him, 2. Reconstruction — what he was actually proposing, 4. The two-destination model, 6. Information classification — what goes where, 7. The verification workflow, ROADMAP.md — Senior PM review, decoded and architected, The evidence panel — twelve elements, in this order (+1 more)

### Community 98 - "1. Glossary — every term, with construction examples"
Cohesion: 0.20
Nodes (10): 1.1 The three roles, 1.2 EVM — Earned Value Management, 1.3 Project data vs knowledge handoff, 1.4 RAID, 1.5 Risk management and pattern analysis, 1.6 MPP files, 1.7 Database update vs project update, 1.8 The evaluation metrics (+2 more)

### Community 99 - "ROADMAP.md — Senior PM review, decoded and architected"
Cohesion: 0.07
Nodes (29): 0.1 Scope reality, 0.2 The thing you may not realise, 0. Read this first, 10. MPP and Primavera — verified, 12. Evaluation module, 13. Layer separation — every recommendation, assigned, 16. Open questions to take back to him, 2. Reconstruction — what he was actually proposing (+21 more)

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

### Community 108 - "_build_event"
Cohesion: 0.23
Nodes (7): _build_event(), ExtractedEvent, Turn a labelled mention into an ExtractedEvent via the shared prepass., infer_status(), Infer progress status and a rough confidence., Tests for status keyword classification., TestStatusInference

### Community 110 - "JsonScheduleProvider"
Cohesion: 0.16
Nodes (6): JsonScheduleProvider, Path, The JSON baselines this repository ships. Reads either shape - `[ {...} ]` or…, Explicit decode, matching extraction/textio.py's reasoning: a lossy decode of a…, The whole point of recording a version: two runs quoting different numbers must…, TestJsonScheduleProvider

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

### Community 132 - "MiniLMEmbedder"
Cohesion: 0.16
Nodes (9): _hashed_embeddings(), MiniLMEmbedder, ndarray, Identity of what this embedder produces, for the on-disk cache. The hashed…, Encode and L2-normalise, so a dot product IS the cosine., Deterministic hashed character-ngram embeddings (offline fallback)., sentence-transformers all-MiniLM-L6-v2, offline-first. Loading is lazy:…, No code path may reload the sentence-transformers model. (+1 more)

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

### Community 146 - "llm_backend.py"
Cohesion: 0.17
Nodes (14): _env(), LLMBackend, make_backend_from_env(), NullBackend, ABC, LLM backend interface for structured event extraction. Two backends behind one…, Check if this backend is reachable., Read config with precedence: real environment, then .env, then default. The… (+6 more)

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

### Community 157 - "validate_activities"
Cohesion: 0.27
Nodes (6): dangling_predecessors(), Problems worth refusing to load on. Returns human-readable messages. Checked: a…, Predecessor ids that are not activities in the same baseline., validate_activities(), The v1 baseline states no level at all; that is not an error., TestValidation

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
Cohesion: 0.29
Nodes (7): Current Modification Area, Previous area (retained for context), Previous modification area (D-064 .. D-071), Previous modification area (D-072), Previous modification area (D-073 .. D-075), Previous modification area (D-076), Previous modification area (D-077)

### Community 172 - "states.test.tsx"
Cohesion: 0.17
Nodes (5): CLARIFICATION, Fake, made, PROPOSAL, REPORT

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

### Community 177 - "Home.tsx"
Cohesion: 0.16
Nodes (12): isUnresolved(), QueryLike, queryView, clock(), FeedRow, FIELD_LABEL, Home(), position() (+4 more)

### Community 178 - "MCP Tools: code-review-graph"
Cohesion: 0.33
Nodes (5): Key Tools, MCP Tools: code-review-graph, Verify in the source, When to use graph tools FIRST, Workflow

### Community 179 - "Competitive landscape — method and honesty statement"
Cohesion: 0.33
Nodes (5): Competitive landscape — method and honesty statement, Positioning, The honest competitive story for judges, What this analysis is, What this analysis is NOT

### Community 180 - "Evidence index — what kind of claim each number in the report is"
Cohesion: 0.29
Nodes (6): AUDITED — read from code, not from documentation, Evidence index — what kind of claim each number in the report is, MEASURED — from runnable harnesses against the real engine + dataset, NOT CLAIMED, RUBRIC — reasoned judgement, labelled as such on the figure itself, Where the v2 / held-out evidence lives

### Community 181 - "test_learned.py"
Cohesion: 0.09
Nodes (25): AbstentionModel, Calibrator, _design(), _design_names(), fit_abstention(), fit_calibrator(), fit_ranker(), LearnedRanker (+17 more)

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

### Community 212 - "evaluate_duration_predictions"
Cohesion: 0.10
Nodes (33): baseline_planned_mean(), evaluate_duration_predictions(), format_duration_report(), _metric_entry(), Evaluation of the duration-suggestion feature. The system suggests how long an…, Render evaluate_duration_predictions output as a fixed-width CLI table. WHY n…, Default predictor: the baseline plan's mean duration for the activity type.…, Score a duration predictor against observed actual_mean_days per activity type.… (+25 more)

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

### Community 217 - "Independent audit — SIH 2026 matching system"
Cohesion: 0.06
Nodes (31): 1. Published numbers, 2.1 Split leakage/generalisation — **REFUTED as a strong generalisation test**, 2.2 Threshold tuning and CV, 2.3 Production model selected on test — **REFUTED as held-out evidence**, 2.4 Circularity — **CONFIRMED**, 2.5 Confidence intervals — **CONFIRMED narrow evidence**, 2. Evaluation methodology, 3.1 “An LLM never chooses an activity” — **REFUTED as normally understood** (+23 more)

### Community 218 - "9. Knowledge handoff — design"
Cohesion: 0.40
Nodes (5): 9. Knowledge handoff — design, How future projects retrieve it, How the AI decides something is a lesson [INFERRED], Separate module? Yes., What to store per lesson

### Community 219 - "Schedule.tsx"
Cohesion: 0.18
Nodes (9): auditActor, auditActorLabel(), auditActorShort(), PLANNER_SOURCES, AuditTrail(), FIELD_LABEL, sourceLocation(), DateBasis (+1 more)

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

### Community 231 - "Ingest.tsx"
Cohesion: 0.16
Nodes (12): ConfidenceBadge(), ConfidenceBadgeProps, DisciplineTag(), isDiscipline(), ACCEPTED_EXTENSIONS, extensionOf(), formatBytes(), Ingest() (+4 more)

### Community 232 - "Innovation analysis — what is genuinely novel vs table stakes"
Cohesion: 0.50
Nodes (3): Cross-checks, Innovation analysis — what is genuinely novel vs table stakes, Reading the profile

### Community 233 - "NAVIS Technical Audit — component-by-component status, read from code"
Cohesion: 0.50
Nodes (3): Headline evaluation (all MEASURED, research/data/eval_output.txt), NAVIS Technical Audit — component-by-component status, read from code, Pipeline components

### Community 235 - "generate_v2_dataset.py"
Cohesion: 0.08
Nodes (38): extract_percentages(), Extract explicit percentage values., abbreviate(), build_mention(), build_near_miss(), build_near_miss_families(), build_near_miss_queue(), build_spreadsheet() (+30 more)

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

### Community 248 - "eval_real.py"
Cohesion: 0.17
Nodes (29): Counter, boot_ci(), ci_str(), constructcie(), _f(), _iso(), load_csv(), load_jsonl() (+21 more)

### Community 250 - "0. Read this first"
Cohesion: 0.67
Nodes (3): 0.1 Scope reality, 0.2 The thing you may not realise, 0. Read this first

### Community 251 - "10. MPP and Primavera — verified"
Cohesion: 0.67
Nodes (3): 10. MPP and Primavera — verified, MPP files, Primavera APIs — your note needs correcting

### Community 252 - "12. Evaluation module"
Cohesion: 0.67
Nodes (3): 12. Evaluation module, Metric per task, Module design

### Community 257 - "Raid.tsx"
Cohesion: 0.08
Nodes (30): EmptyState(), ErrorState(), Panel(), SectionTitle(), Skeleton(), SkeletonRows(), PageHeader, PageHeaderContext (+22 more)

### Community 258 - "TestHonestyFieldsArePresentAndStructured"
Cohesion: 0.08
Nodes (10): needs_corpus, _clear_cache(), fixture, 1,661 CPWD reference work items must not be counted as schedule activities to…, 630 MB must not be touched to answer one request. Every `open` during the call…, The endpoint reports; it must never re-derive and disagree., The frontend must not have to hardcode any of these., TestCountsMatchTheManifests (+2 more)

### Community 259 - "NAVIS — Stitch prompts, rewritten for screen generation"
Cohesion: 0.07
Nodes (27): Coverage and suggested order, Implementation guardrails — reference only; do not paste into Stitch, NAVIS — Stitch prompts, rewritten for screen generation, Prompt 01 — START HERE: Report Progress, desktop, Prompt 02 — Report Progress, mobile capture, Prompt 03 — Field Home, desktop, Prompt 04 — My Updates with selected report, Prompt 05 — Field Clarifications (+19 more)

### Community 290 - "test_primavera.py"
Cohesion: 0.14
Nodes (13): PmxmlScheduleProvider, PrimaveraXerScheduleProvider, Primavera P6 PMXML (`.xml`). Reads both the canonical Oracle shape, where…, Primavera `.xer`. Reads a real XER table dump - `%T` table, `%F` header, `%R`…, Primavera PMXML and XER reading — FINDINGS.md F3, D-047. Two fixtures under…, The two fixtures describe the same schedule, so the readers must too., They used to raise NotImplementedError; F3 is closed., TestBothFormatsAgree (+5 more)

### Community 291 - "_validate_description"
Cohesion: 0.12
Nodes (11): The supervisor's own words, formalised — or None. Returns the cleaned…, _validate_description(), parametrize, A description is the supervisor's own words, formalised — or nothing., `tokenize` maps erected -> erection, so a tense change is faithful., A description with `kept` grounded tokens and `invented` unseen ones., D-006: the model does not choose activities, and naming one is choosing., A line tag is not a schedule id and must survive. (+3 more)

### Community 292 - "2026-09-04 / D-077 — A delay becomes a row, so a planner has something to overrule"
Cohesion: 0.22
Nodes (9): 2026-09-04 / D-077 — A delay becomes a row, so a planner has something to overrule, Affected Areas, Alternatives Considered, Context, Decision, Measured on the demo corpus, On `month`, Trade-offs / Consequences (+1 more)

### Community 293 - "agent_llm.py"
Cohesion: 0.21
Nodes (12): _attr(), configured_provider(), LLMSuggestion, Optional LLM interpretation for one conversational turn. The LLM is an…, Values the model proposed, already validated. All optional. `suggested_fields`…, Keep only values that survive the deterministic validators., The provider name the operator selected, normalised. Never a secret., _validate() (+4 more)

### Community 294 - "2026-09-01 / D-017 — A second baseline is adopted as a version, not as a replacement"
Cohesion: 0.22
Nodes (9): 2026-09-01 / D-017 — A second baseline is adopted as a version, not as a replacement, Affected Areas, Alternatives Considered, Context, Decision, Known limitation, reported rather than hidden, Reason, Verification (+1 more)

### Community 295 - "2026-09-01 / D-019 — Refuse to evaluate a baseline the ground truth does not describe"
Cohesion: 0.29
Nodes (7): 2026-09-01 / D-019 — Refuse to evaluate a baseline the ground truth does not describe, Affected Areas, Alternatives Considered, Context, Decision, Future Notes, Reason — why resolvable coverage, not exact matching

### Community 296 - "BaselineAgreement"
Cohesion: 0.29
Nodes (3): BaselineAgreement, How well a ground-truth file and a baseline describe the same project., The message a human needs to fix this, not just to know it broke.

### Community 298 - "2026-09-01 / D-018 — Baselines are read through a provider, never by `json.load` at the call site"
Cohesion: 0.33
Nodes (6): 2026-09-01 / D-018 — Baselines are read through a provider, never by `json.load` at the call site, Affected Areas, Alternatives Considered, Context, Decision, Predecessor storage — the migration

### Community 299 - "test_terminology.py"
Cohesion: 0.15
Nodes (17): canonicalise(), expansion_tokens(), expansions(), mapping_count(), Controlled construction-terminology normalisation (field → schedule). Why this…, Canonical schedule-vocabulary phrases found in `text` (original kept)., `text` with canonical schedule vocabulary APPENDED. Expansion, not replacement:…, Tokens of the canonical phrases, for the BM25 query side. (+9 more)

### Community 301 - ".test_session_across_files_not_inflated"
Cohesion: 0.40
Nodes (3): Test that session totals are correct when the same session spans multiple files., Same session in 2 files with duplicate message_ids should not inflate totals., TestCrossFileSessionTotals

### Community 303 - "OpenAICompatibleBackend"
Cohesion: 0.27
Nodes (4): OpenAICompatibleBackend, Backend for any OpenAI-compatible API (Claude, OpenAI, etc.)., Check API connectivity., Call the API to extract structured events.

### Community 305 - "test_date_basis.py"
Cohesion: 0.07
Nodes (22): db_session(), Shared fixtures. `server/test_server.py` builds its own database with an…, Load the real 120-activity baseline. The matcher fixture has to be the real…, A session on the test database, with the baseline loaded., _seed_activities(), add_missing_columns(), Bring an existing SQLite file up to the current schema. `target` defaults to…, clean_database() (+14 more)

### Community 306 - "NAVIS — copy-paste Stitch prompt pack"
Cohesion: 0.09
Nodes (22): Definition of a non-dummy interface, How to use this pack, NAVIS — copy-paste Stitch prompt pack, Prompt 0 — master direction and shared components, Prompt 10 — controlled baseline import, Prompt 11 — planner RAID workspace, Prompt 12 — Project Memory and terminology reference, Prompt 13 — executive overview with honest schedule performance (+14 more)

### Community 307 - "2026-09-04 / D-076 — The delay taxonomy is built, and liability is a lookup a human can audit"
Cohesion: 0.22
Nodes (9): 2026-09-04 / D-076 — The delay taxonomy is built, and liability is a lookup a human can audit, Affected Areas, Alternatives Considered, Consequence for the demo, stated rather than discovered, Context, Decision, Trade-offs / Consequences, Two classification calls worth defending (+1 more)

### Community 308 - "drift_eval.py"
Cohesion: 0.20
Nodes (20): categorise(), family_of(), gold_description(), gold_text(), jaccard(), load_drift_kinds(), longest_common_run(), main() (+12 more)

### Community 309 - "NAVIS — run-up to the internal hackathon, Fri 4 Sep"
Cohesion: 0.10
Nodes (19): 1. What does the demo reset actually produce?, 2. Does the test suite still pass?, 3. What are the current headline metrics?, FRI 4 SEP — run sheet, Housekeeping, whenever, NAVIS — run-up to the internal hackathon, Fri 4 Sep, Not doing, and why, T1. Morning — the three answers that can sink you (+11 more)

### Community 310 - "TestPrimaveraImport"
Cohesion: 0.14
Nodes (8): FINDINGS.md F3 — the PS names Primavera exports as an input. The critical…, The whole point of the dry run. A P6 file can be inspected without touching the…, The import path end to end, not just the dry run. The fixture ids do not exist…, A second import needs explicit consent. Two guards can fire here — one for an…, ROADMAP §4 rule 5 — an import populates a baseline, never actuals., Never a 200 with zero activities — the D-040 bug shape., MPXJ needs a JVM; the refusal has to say so, or someone will add it., TestPrimaveraImport

### Community 311 - "_event"
Cohesion: 0.21
Nodes (9): _event(), ExtractedEvent, The server's write key and this read key must be one function. If they drift,…, An alias is a RETRIEVAL channel, never a decision. The mention text supports…, TestAliasChannel, alias_key(), Normalise a raw field mention to the key the alias lexicon is stored under.…, alias_lexicon_from() (+1 more)

### Community 312 - "END OF PART 0 — the D-series resumes below"
Cohesion: 0.09
Nodes (23): 2026-09-01 / D-021 — Thresholds are tuned on dev and reported on test, 2026-09-02 / D-053 - The frontend had no React type checking at all, and now does, 2026-09-02 / D-054 - An error boundary, because a render throw was a white screen, 2026-09-02 / D-055 - localStorage access goes through one total helper, 2026-09-02 / D-056 - Enter and the Send button agree about when a turn may start, 2026-09-02 / D-057 - An unreachable API must never render as good news, 2026-09-02 / D-058 - Classification and regression metrics, and what each is allowed to measure, 2026-09-02 / D-059 - The baseline plan is a worse duration predictor than the mean, and now we can say so (+15 more)

### Community 313 - "storage.test.tsx"
Cohesion: 0.26
Nodes (11): storedOverride(), useDevice(), ViewMode, apply(), stored(), Theme, useTheme(), readStored() (+3 more)

### Community 314 - "vocabulary.py"
Cohesion: 0.18
Nodes (15): ActivityType, _baseline_types(), cfihos_disciplines(), _heads(), _keyword_index(), A canonical `activity_type` vocabulary, and a resolver onto it. ROADMAP §11.…, One canonical activity type, with where it came from., `Ac_` code -> title, for the Construction group. Empty if absent. (+7 more)

### Community 315 - "METRICS.md — the only place a number is defined"
Cohesion: 0.12
Nodes (16): 1. Four different things, four different numbers, 2. What each metric means, 3.1 CURRENT PRODUCTION / DEMO — what the running server actually does, 3.2 HELD-OUT EVALUATION — the honest research number, 3.3 POOLED / 5-FOLD CV — the number with a usable denominator, 3.4 EXPERIMENTAL — measured, selected, and NOT deployed, 3.4a WHAT THE EVALUATION DOES **NOT** ESTABLISH, 3.5 RESEARCH CORPUS — real, public-source, no matcher accuracy claimed (+8 more)

### Community 316 - "extract_quantities"
Cohesion: 0.11
Nodes (12): extract_quantities(), is_forecast_language(), _normalize_uom(), True when the span describes a plan or a schedule change rather than work…, Extract all (quantity, uom) pairs from free text., Normalize unit-of-measurement strings., Tests for quantity + UOM patterns., TestQuantityExtraction (+4 more)

### Community 317 - "test_evidence.py"
Cohesion: 0.16
Nodes (12): _caveats(), corpus_summary(), CorpusUnavailable, _load(), What the real corpus actually contains, read from its own manifests.…, The Evidence page's whole payload. Reads manifests only., The corpus manifests are not present. Names which file is missing., Both manifests, read once. Raises `CorpusUnavailable` if either is gone. Cached… (+4 more)

### Community 318 - "Reconcile.tsx"
Cohesion: 0.24
Nodes (8): hasScore(), MatchReasoning(), SignalChips(), toCandidates(), PRIORITY_WEIGHT, Reconcile(), ReviewCandidate, ScheduleActivity

### Community 319 - "ErrorBoundary"
Cohesion: 0.15
Nodes (5): ErrorBoundary, Props, State, queryClient, quiet

### Community 320 - "test_agent_llm.py"
Cohesion: 0.18
Nodes (7): The LLM must be optional, bounded, and silent when it fails. Every test here…, Unplugging Ollama must not break the demonstration., No LLM-suggested value may set activity_id or confidence on a real turn., The final description is the baseline's own text, so the model cannot be…, TestD006EndToEnd, TestProvenanceReachesTheAuditTrail, _turn()

### Community 322 - "embedcache.py"
Cohesion: 0.21
Nodes (12): cache_dir(), content_key(), load(), ndarray, Path, On-disk cache for the activity-embedding matrix. The 218 activity descriptions…, Stable key over the exact inputs that determine the matrix., Write atomically: a half-written .npy read by a concurrent process is the one… (+4 more)

### Community 323 - "resolve"
Cohesion: 0.21
Nodes (7): Indexing only `label` would leave "Pedestal Concreting" unresolvable purely…, The id encodes the type as a fact; prose is an inference., A wrong activity type on a lesson learned is worse than none., Ordering is by keyword length, so the specific beats the general., TestResolver, The canonical activity type for a description, or None. Deterministic and…, resolve()

### Community 324 - "probe"
Cohesion: 0.18
Nodes (7): Protocol, probe(), The part of LLMBackend this module uses., Answer whether the LLM path is on and whether it actually responds. Read-only…, SupportsExtract, make_backend_from_env falls back to NullBackend; that is not 'working'., TestLLMStatusRoute

### Community 325 - "VALIDATION — dataset/v2"
Cohesion: 0.15
Nodes (12): 1. Every positive label's activity_id exists in v2, 2. No hard negative accidentally matches an activity, 3. Tag-free positive mentions, 4. Hard-negative count, 5. Splits, 6. No mention appears in more than one split, 7. Dates stated in the mention text, Composition (+4 more)

### Community 326 - "2026-09-03 / D-065 — An LLM-suggested description must be the supervisor's own words"
Cohesion: 0.15
Nodes (13): 2026-09-03 / D-065 — An LLM-suggested description must be the supervisor's own words, Affected Areas, Alternatives Considered, Connectability, Context, Decision, Future Notes, Multi-output: refused rather than truncated (+5 more)

### Community 327 - "NAVIS — backend-to-interface audit"
Cohesion: 0.15
Nodes (10): 1. GitHub and local state, 2. What was covered, 3. Product definition, 4. Priority defects and missing connections, 5. Complete operation-to-purpose map, 6. Roles and navigation to design, 7. The sidebar AI assistant: what is real and what must be added, 8. Capability guardrails for the mockups (+2 more)

### Community 328 - "2026-09-01 / D-028 - The learned ranker is selected under the precision floor, not on top-1"
Cohesion: 0.17
Nodes (12): 2026-09-01 / D-028 - The learned ranker is selected under the precision floor, not on top-1, Affected Areas, Cross-encoder: cost measured, gain not, Decision, Guards, Honest reading of the selected row, Measured - held-out test (198 mentions, 185 positives, 68 near-miss), `rationale` is unchanged (+4 more)

### Community 329 - "NAVIS"
Cohesion: 0.17
Nodes (12): 10. Where to jump in, 11. Three things to know before you change code, 1. What problem are we solving?, 2. What does the system actually do?, 3. The one rule that matters, 4. How the matching works (the interesting part), 5. Where the project stands, 6. What tools we used, and why (+4 more)

### Community 330 - "agent_slots.py"
Cohesion: 0.17
Nodes (12): _find_unit(), _india_tz(), now_ist(), _num(), datetime, Quantity, Deterministic slot filling for the conversational logging agent. Everything…, A completed amount, optionally out of a planned total. (+4 more)

### Community 331 - "TestExportDownload"
Cohesion: 0.18
Nodes (5): parametrize, GET /uploads/{filename} — the route ExportResponse.download_url points at.…, Nothing outside dataset/uploads is reachable, and nothing 500s., Only export types are served, so a file that lands in the directory by some…, TestExportDownload

### Community 332 - "2026-09-02 / D-047 - Primavera PMXML and XER are read, not just written; FINDINGS F3 closed"
Cohesion: 0.20
Nodes (10): 2026-09-02 / D-047 - Primavera PMXML and XER are read, not just written; FINDINGS F3 closed, Affected Areas, Context, Decision, Defect found and fixed: our XER export contradicted our PMXML export, Safety - the demo baseline cannot be disturbed, Status, Two dialects per format, because our own exporter is not canonical (+2 more)

### Community 333 - "2026-09-02 / D-052 - An activity-type vocabulary from CFIHOS and Uniclass, built and deliberately not wired in"
Cohesion: 0.20
Nodes (10): 2026-09-02 / D-052 - An activity-type vocabulary from CFIHOS and Uniclass, built and deliberately not wired in, Affected Areas, Ambiguous labels are declared, not hidden, Context, Decision - three layers, each carrying its provenance, Not wired into matching, and tested as such, Status, The honest finding: Uniclass does not cover this work (+2 more)

### Community 334 - "TestStandardCoverageIsHonest"
Cohesion: 0.20
Nodes (5): Uniclass is a BUILDING taxonomy. Most EPC work has no entry, and the response…, The specific overclaim this design refuses: mapping PIP-HYT onto Ac_10_40_67…, Where a mapping exists it resolves to the actual published title., CFIHOS has no macro discipline for either. Absent, not approximated., TestStandardCoverageIsHonest

### Community 335 - "llm_enabled"
Cohesion: 0.24
Nodes (5): llm_enabled(), llm_timeout_seconds(), True when the operator has opted in to the LLM path., Disabled must mean no import, no client, no socket, no wait., TestFlag

### Community 336 - "2026-09-01 / D-022 — A tag's digit count is a numbering convention, not part of what a tag is"
Cohesion: 0.22
Nodes (9): 2026-09-01 / D-022 — A tag's digit count is a numbering convention, not part of what a tag is, Affected Areas, Context, Decision, Digit-count assumptions elsewhere — reported, not changed, Honest reading of the gain, Measured impact, Status (+1 more)

### Community 337 - "2026-09-01 / D-024 - A near-miss is a mention with its discriminator removed"
Cohesion: 0.22
Nodes (9): 2026-09-01 / D-024 - A near-miss is a mention with its discriminator removed, Affected Areas, Context, Decision, Measured - held-out test (198 mentions, 185 positives), One thing this exposed before the family merge, Reading it honestly, Status (+1 more)

### Community 338 - "2026-09-01 / D-030 - One design system: six type steps, six spacing steps, three radii, and five button jobs"
Cohesion: 0.22
Nodes (9): 2026-09-01 / D-030 - One design system: six type steps, six spacing steps, three radii, and five button jobs, Affected Areas, Context, Decisions, Follow-up within the same pass, Not unified, and why, Status, Status colour: one inconsistency fixed, one reported and left (+1 more)

### Community 339 - "2026-09-01 / D-034 - Demo counts re-measured; the review queue grew because the system got more careful"
Cohesion: 0.22
Nodes (9): 2026-09-01 / D-034 - Demo counts re-measured; the review queue grew because the system got more careful, Affected Areas, Also found, Consequence, Context, Evidence, Status, The one code change (+1 more)

### Community 340 - "2026-09-01 / D-037 - An independent audit refuted four of our claims, and it was right about three and a half"
Cohesion: 0.22
Nodes (9): 2026-09-01 / D-037 - An independent audit refuted four of our claims, and it was right about three and a half, Affected Areas, Consequence / open work, Context, Decision, Status, Two further refutations, verified and accepted, What survives every criticism (+1 more)

### Community 341 - "2026-09-03 / D-071 — A delay cause is counted once per report, not once per audit row"
Cohesion: 0.22
Nodes (9): 2026-09-03 / D-071 — A delay cause is counted once per report, not once per audit row, Affected Areas, Alternatives Considered, Context, Decision, Reason, Status, Trade-offs / Consequences (+1 more)

### Community 342 - "test_vocabulary.py"
Cohesion: 0.22
Nodes (5): fixture, Activity-type vocabulary — ROADMAP §11, D-052. The hardest assertion in this…, 17 of 56 codes cover more than one heading. Picking one silently would mislabel…, TestAmbiguousLabels, voc()

### Community 343 - "TestNotWiredIntoMatching"
Cohesion: 0.22
Nodes (5): If any of these fail, the vocabulary has leaked into scoring., The real guard. Parse the engine, retriever, features and config — an import…, The vocabulary must not have been used as a way to switch it on., The module's own imports are csv, json, re, dataclasses, pathlib. Note the…, TestNotWiredIntoMatching

### Community 344 - "2026-09-01 / D-031 - One file defines every number, and it is not any of the ones that had them"
Cohesion: 0.25
Nodes (8): 2026-09-01 / D-031 - One file defines every number, and it is not any of the ones that had them, Affected Areas, Consequence, Context, Decision, Evidence, Status, Why this rather than fixing the numbers in place

### Community 345 - "2026-09-01 / D-032 - The alias loop is NOT closed, and the documentation said three different things"
Cohesion: 0.25
Nodes (8): 2026-09-01 / D-032 - The alias loop is NOT closed, and the documentation said three different things, Affected Areas, Consequence, Context, Decision, Evidence, from the code, Status, Why it matters

### Community 346 - "2026-09-01 / D-033 - The live server runs the v1 hand-set blend, and no document said so"
Cohesion: 0.25
Nodes (8): 2026-09-01 / D-033 - The live server runs the v1 hand-set blend, and no document said so, Affected Areas, Consequence, Context, Decision, Evidence, Status, Why it matters

### Community 347 - "2026-09-01 / D-035 - Real-corpus counts verified from manifests; the WSDOT schedule has 27 activities"
Cohesion: 0.25
Nodes (8): 2026-09-01 / D-035 - Real-corpus counts verified from manifests; the WSDOT schedule has 27 activities, Affected Areas, Consequence, Context, Decision, Evidence, Status, Why it matters

### Community 348 - "2026-09-01 / D-039 - Tier 1 screens restructured around one question each; the matcher's reasoning is still invisible on Reconcile, and that is a backend gap"
Cohesion: 0.25
Nodes (8): 2026-09-01 / D-039 - Tier 1 screens restructured around one question each; the matcher's reasoning is still invisible on Reconcile, and that is a backend gap, Affected Areas, Backend work this pass identified and did NOT do, BLOCKED: GET /review-queue does not return the matcher's reasoning, Decisions, Status, Verification, Visual language

### Community 349 - "2026-09-01 / D-041 — Projector legibility: conflicts above the fold, and a banner that reads as detection"
Cohesion: 0.25
Nodes (8): 2026-09-01 / D-041 — Projector legibility: conflicts above the fold, and a banner that reads as detection, Affected Areas, Context, Decision, Not done, Reason, Status, Verification

### Community 350 - "2026-09-01 / D-042 - The review queue projects the matcher's reasoning, and every candidate carries its own score"
Cohesion: 0.25
Nodes (8): 2026-09-01 / D-042 - The review queue projects the matcher's reasoning, and every candidate carries its own score, Affected Areas, Part 1 - the three missing fields, Part 2 - per-candidate scores: they exist, and they were being discarded, Part 3 - frontend, Status, Verification, Verified end to end

### Community 351 - "2026-09-01 / D-043 — The product fonts ship with the frontend"
Cohesion: 0.25
Nodes (8): 2026-09-01 / D-043 — The product fonts ship with the frontend, Affected Areas, Alternatives Considered, Context, Decision, Reason, Status, Verification

### Community 352 - "2026-09-02 / D-046 - Schedule-side EVM, and why its headline SPI is flagged unsafe on this dataset"
Cohesion: 0.25
Nodes (8): 2026-09-02 / D-046 - Schedule-side EVM, and why its headline SPI is flagged unsafe on this dataset, Affected Areas, Context, Decisions, Status, The diagnosis the pipeline asked for, Verification, What was built instead of suppressing it

### Community 353 - "2026-09-02 / D-048 - RAID register: one table, arithmetic exposure, and no candidate commits itself"
Cohesion: 0.25
Nodes (8): 2026-09-02 / D-048 - RAID register: one table, arithmetic exposure, and no candidate commits itself, Affected Areas, Decision - one typed table, not four, Exposure is arithmetic, and is not accepted from the caller, Provenance, Status, The rule that must hold: a candidate is never auto-committed, Verification

### Community 354 - "2026-09-02 / D-049 - Field notifications derived from the audit trail, with no read state and no new table"
Cohesion: 0.25
Nodes (8): 2026-09-02 / D-049 - Field notifications derived from the audit trail, with no read state and no new table, Affected Areas, Context, Day movement is never invented, Decision - derive on read, Status, Verification, What is deliberately missing, and why

### Community 355 - "2026-09-02 / D-051 - eval.py reports calibration, confidence intervals and macro-F1, and the calibration result is mixed"
Cohesion: 0.25
Nodes (8): 2026-09-02 / D-051 - eval.py reports calibration, confidence intervals and macro-F1, and the calibration result is mixed, Affected Areas, Context, One defect found and fixed while building it, Status, The measured result, reported as it came out, What is null rather than zero, What was added

### Community 356 - "2026-09-03 / D-066 — A give-up must be remembered, and a confirm must never vanish"
Cohesion: 0.25
Nodes (8): 2026-09-03 / D-066 — A give-up must be remembered, and a confirm must never vanish, Affected Areas, Alternatives Considered, Context, Decision, Reason, Status, Trade-offs / Consequences

### Community 357 - "2026-09-03 / D-067 — The role decides the application; a viewport never does"
Cohesion: 0.25
Nodes (8): 2026-09-03 / D-067 — The role decides the application; a viewport never does, Affected Areas, Alternatives Considered, Context, Decision, Reason, Status, Trade-offs / Consequences

### Community 358 - "2026-09-03 / D-069 — The register gets the writer it was missing"
Cohesion: 0.25
Nodes (8): 2026-09-03 / D-069 — The register gets the writer it was missing, Affected Areas, Alternatives Considered, `clear_progress` now clears the register, Context, Decision, Status, Trade-offs / Consequences

### Community 359 - "2026-09-03 / D-072 — The design brief enters the repository, dated to a commit"
Cohesion: 0.25
Nodes (8): 2026-09-03 / D-072 — The design brief enters the repository, dated to a commit, Affected Areas, Alternatives Considered, Context, Decision, Reason, Trade-offs / Consequences, What the refresh actually changed

### Community 360 - "Small follow-ups — use individually after the relevant screen exists"
Cohesion: 0.25
Nodes (8): A — Field report success, B — Planner clarification drawer, C — Create-activity decision drawer, D — Schedule export dialog, E — Real failure state, F — Remove the rejected toggle, G — Visual consistency correction, Small follow-ups — use individually after the relevant screen exists

### Community 361 - "2026-09-01 / D-020 — The v2 evaluation corpus is generated as one family, from one seed"
Cohesion: 0.29
Nodes (7): 2026-09-01 / D-020 — The v2 evaluation corpus is generated as one family, from one seed, Affected Areas, Context, Decision, Known limitation — the corpus does not yet stress the ranker, Reason, Two extractor defects this corpus exposed

### Community 362 - "2026-09-01 / D-023 — A unit suffix is not a numerator"
Cohesion: 0.29
Nodes (7): 2026-09-01 / D-023 — A unit suffix is not a numerator, Affected Areas, Consequence for the v2 corpus — a task, not a change, Context, Decision, Measured impact, Status

### Community 363 - "2026-09-01 / D-025 - Two more tag-normalisation defects, found by auditing for the assumption rather than the symptom"
Cohesion: 0.29
Nodes (7): 2026-09-01 / D-025 - Two more tag-normalisation defects, found by auditing for the assumption rather than the symptom, Affected Areas, Context, Measured, Status, The two defects, Why the bound is generous rather than exact

### Community 364 - "2026-09-01 / D-026 - The dense channel was 86% of latency because it encoded one mention at a time"
Cohesion: 0.29
Nodes (7): 2026-09-01 / D-026 - The dense channel was 86% of latency because it encoded one mention at a time, Affected Areas, Context, Decisions, Measured, Status, What this is NOT

### Community 365 - "2026-09-01 / D-027 - Recall@20 is 100%, so retrieval tuning cannot help and discipline gating actively hurts"
Cohesion: 0.29
Nodes (7): 2026-09-01 / D-027 - Recall@20 is 100%, so retrieval tuning cannot help and discipline gating actively hurts, Affected Areas, Consequences, each measured on held-out test, Decision, Status, The measurement that reframed the work, Why discipline gating hurts

### Community 366 - "2026-09-01 / D-036 - Negative results are kept, labelled, and not quietly dropped"
Cohesion: 0.29
Nodes (7): 2026-09-01 / D-036 - Negative results are kept, labelled, and not quietly dropped, Affected Areas, Consequence, Context, Decision, Status, The distinction that must survive

### Community 367 - "2026-09-01 / D-038 — The resolver rejected the Reconcile screen's own verb"
Cohesion: 0.29
Nodes (7): 2026-09-01 / D-038 — The resolver rejected the Reconcile screen's own verb, Affected Areas, Context, Decision, Reason, Status, Verification

### Community 368 - "2026-09-01 / D-040 — Recall is reported at the depth the planner is shown, and a CSV upload now fails loudly"
Cohesion: 0.29
Nodes (7): 2026-09-01 / D-040 — Recall is reported at the depth the planner is shown, and a CSV upload now fails loudly, Affected Areas, Context, Decision, Reason, Status, Verification

### Community 369 - "2026-09-02 / D-044 - Exports are downloadable; the advertised URL is no longer dead"
Cohesion: 0.29
Nodes (7): 2026-09-02 / D-044 - Exports are downloadable; the advertised URL is no longer dead, Affected Areas, Context, Decision, Reason - the filename is hostile input, Status, Verification

### Community 370 - "2026-09-02 / D-045 - The committed corpus is UTF-8, and the generator can no longer write anything else"
Cohesion: 0.29
Nodes (7): 2026-09-02 / D-045 - The committed corpus is UTF-8, and the generator can no longer write anything else, Affected Areas, Context, Decision, Reason - why re-encode rather than teach every reader a cascade, Status, Verification - nothing was regenerated

### Community 371 - "2026-09-02 / D-050 - The Evidence API reports the corpus from its own manifests, caveats included"
Cohesion: 0.29
Nodes (7): 2026-09-02 / D-050 - The Evidence API reports the corpus from its own manifests, caveats included, Affected Areas, Context, Decision - read the manifests, never the corpus, Status, The honesty fields are structured data, not prose, Verification

### Community 372 - "2026-09-02 / D-060 — Three roles behind a role picker, and an executive view that never shows a queue"
Cohesion: 0.29
Nodes (7): 2026-09-02 / D-060 — Three roles behind a role picker, and an executive view that never shows a queue, Affected Areas, Context, Decision, Reason, Status, Verification

### Community 373 - "2026-09-03 / D-068 — `auto_applied` is not a claim about who decided"
Cohesion: 0.29
Nodes (7): 2026-09-03 / D-068 — `auto_applied` is not a claim about who decided, Affected Areas, Alternatives Considered, Context, Decision, Reason, Status

### Community 374 - "2026-09-03 / D-070 — The server migrates its own database, or the migration does not exist"
Cohesion: 0.29
Nodes (7): 2026-09-03 / D-070 — The server migrates its own database, or the migration does not exist, Affected Areas, Context, Decision, Reason, Status, Trade-offs / Consequences

### Community 375 - "2026-09-04 / D-073 — The Reconcile screen speaks the server's resolve vocabulary"
Cohesion: 0.29
Nodes (7): 2026-09-04 / D-073 — The Reconcile screen speaks the server's resolve vocabulary, Affected Areas, Alternatives Considered, Context, Decision, Trade-offs / Consequences, Verification

### Community 378 - "parse_date"
Cohesion: 0.23
Nodes (8): _build(), InvalidDate, parse_date(), date, Exception, The text looked like a date but cannot be one., Resolve a date from free text, relative to the project's data date. Relative…, TestDateParsing

### Community 379 - "2026-09-03 / D-064 — DEMO.md realigned to the three-role application"
Cohesion: 0.33
Nodes (6): 2026-09-03 / D-064 — DEMO.md realigned to the three-role application, Consequences, Context, Decision, Status, The gotcha this file now leads with

### Community 380 - "infer_discipline"
Cohesion: 0.26
Nodes (5): infer_discipline(), Discipline, Infer the most likely discipline from context keywords., Tests for discipline keyword classification., TestDisciplineInference

### Community 382 - "TestDatabaseModels"
Cohesion: 0.29
Nodes (3): Verify all 120 activities were seeded., Test SQLAlchemy model behavior., TestDatabaseModels

### Community 383 - "TestReviewQueue"
Cohesion: 0.27
Nodes (3): Test GET /review-queue and POST /review/{id}/resolve., Ingest a file and return a review item ID., TestReviewQueue

### Community 385 - "WSDOT C8078 candidate-link verification review"
Cohesion: 0.33
Nodes (5): Decisions worth a second look, Preliminary metrics if these labels are approved, Proposed decisions, Review method, WSDOT C8078 candidate-link verification review

### Community 386 - "test_evm.py"
Cohesion: 0.18
Nodes (10): _event_percentages(), percent_complete(), planned_weight(), Schedule-side Earned Value Management: PV, EV, SV, SPI. ROADMAP §5.…, Percent complete and which of the three rules produced it. `event_percentages`…, `activity_id -> max(LinkedEvent.percentage)`, in one pass. Mirrors…, Planned duration in days, inclusive of both endpoints, minimum 1. An activity…, db() (+2 more)

### Community 387 - "Basics.md"
Cohesion: 0.18
Nodes (5): Basics — start at README.md, Decision index, DECISIONS.md — Why NAVIS is built this way, Provenance of the initial entries, The 2026-08-31 historical pass (H-001 … H-027)

### Community 389 - "2026-09-01 / D-029 - Confidence becomes a probability; the abstention model earns nothing on top of it"
Cohesion: 0.33
Nodes (6): 2026-09-01 / D-029 - Confidence becomes a probability; the abstention model earns nothing on top of it, Affected Areas, Calibration, NO_MATCH rejection, pooled over 5-fold CV (all 70 negatives), Status, The abstention model earns nothing, and that is the finding

### Community 394 - "The numbers you may say out loud"
Cohesion: 0.33
Nodes (6): Demo-database counts (this run, this schedule), Recall@3 — the one to quote, and the one that replaces Recall@20, Sentences that must **not** be said, The numbers you may say out loud, v1 — what the running server actually does (`python eval.py`), v2 — the honest held-out numbers

### Community 395 - "parse_quantity"
Cohesion: 0.31
Nodes (3): parse_quantity(), Read a completed / planned quantity from free text. Ratios are kept as two…, TestQuantityParsing

### Community 397 - "2026-09-04 / D-075 — D-061 is re-affirmed, and now pinned on the served engine"
Cohesion: 0.33
Nodes (6): 2026-09-04 / D-075 — D-061 is re-affirmed, and now pinned on the served engine, Affected Areas, Alternatives Considered, Context, Decision, Verification

### Community 398 - "TestCandidatesAreNeverAutoCommitted"
Cohesion: 0.18
Nodes (4): Mirrors D-009 for dates: the system proposes, a human commits., The whole rule, in one assertion., A delay that already happened is an issue. Inventing a probability for a past…, TestCandidatesAreNeverAutoCommitted

### Community 399 - "compute_exposure"
Cohesion: 0.24
Nodes (5): compute_exposure(), `probability x impact_days`, or None when either side is unknown. None means…, A risk with no schedule impact scores 0.0 — a measured value., None means 'not calculable'. Confusing it with 0.0 would let an unscored risk…, TestExposure

### Community 400 - "TestIntegrityRules"
Cohesion: 0.20
Nodes (6): Test schedule integrity validation., Actual Start after data_date should raise IntegrityError., Actual Finish before Actual Start should raise IntegrityError., Predecessor-not-started should warn, not block., Valid actual dates should not raise errors., TestIntegrityRules

### Community 402 - "read_text"
Cohesion: 0.28
Nodes (7): Load baseline schedule and build compact context string., Path, Reading source documents without losing characters. The supplied DPRs are…, Read a text document, preserving every character it actually contains., Read a JSON document. Same rules, named separately for intent., read_json_text(), read_text()

### Community 403 - "2026-09-04 / D-078 — A liability becomes a finding only when a planner rules, and the ruling is audited"
Cohesion: 0.25
Nodes (8): 2026-09-04 / D-078 — A liability becomes a finding only when a planner rules, and the ruling is audited, Affected Areas, Alternatives Considered, Context, Decision, Demonstrated end to end, Trade-offs / Consequences, Verification

### Community 404 - "get_matching_engine"
Cohesion: 0.32
Nodes (5): get_matching_engine(), Lazily build the schedule-linking engine. Built once per process. The MiniLM…, D-061, enforced on the engine the SERVER actually builds.…, The singleton is load-bearing, not an optimisation detail. Every proposal to…, TestServedEngineKeepsTheAliasChannelOff

### Community 406 - "TestUnreportableInputIsRefused"
Cohesion: 0.29
Nodes (4): parametrize, The matcher ranks; it does not judge. Given any string it returns its best…, TestStatusParsing, TestUnreportableInputIsRefused

### Community 407 - "normalize_wbs_path"
Cohesion: 0.43
Nodes (3): normalize_wbs_path(), A single displayable WBS path. v1 gives a dotted code (`"1.1.1.1"`); v2 gives…, TestWbsPath

### Community 408 - "TestTheAgentNeverAsksTheSameSlotForever"
Cohesion: 0.29
Nodes (4): `_next_missing` skips a slot it has asked about twice. That decision used to…, DEMO.md's own opener carried a quantity, which is what triggered it., The regression itself: abandoned, then asked again one turn later., TestTheAgentNeverAsksTheSameSlotForever

### Community 409 - "load_ground_truth"
Cohesion: 0.33
Nodes (6): ground_truth_activity_ids(), load_ground_truth(), _open_ground_truth(), Ground-truth files differ in encoding: the v1 key is cp1252, the v2 key is…, Load ground truth and build one ExtractedEvent per labelled mention., Every activity id the ground truth references, NO_MATCH excluded.

### Community 410 - "expected_calibration_error"
Cohesion: 0.50
Nodes (4): expected_calibration_error(), ECE: bin-size-weighted mean gap between claimed and observed accuracy., One row per confidence decile that contains at least one prediction. Empty bins…, reliability_bins()

### Community 411 - "test_every_baseline_activity_id_matches_the_pattern"
Cohesion: 0.33
Nodes (4): Precondition: neither completion regex fires on this line, so the only route to…, If the schedule's id shape ever changes, both callers must be revisited., test_every_baseline_activity_id_matches_the_pattern(), test_implicit_completion_has_no_regex_keyword()

### Community 412 - "9. Application startup — what loads, when, and in what order"
Cohesion: 0.50
Nodes (4): 9. Application startup — what loads, when, and in what order, Backend, Frontend, Offline / non-server entry points

## Knowledge Gaps
- **1684 isolated node(s):** `name`, `version`, `license`, `private`, `type` (+1679 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 3000 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **53 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Session` connect `App.tsx` to `Activity`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `reset_demo()` connect `Activity` to `App.tsx`, `main.py`, `AuditRecord`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `END OF PART 0 — the D-series resumes below` connect `END OF PART 0 — the D-series resumes below` to `Basics.md`, `2026-09-01 / D-029 - Confidence becomes a probability; the abstention model earns nothing on top of it`, `2026-09-04 / D-075 — D-061 is re-affirmed, and now pinned on the served engine`, `pre-2026-08-30 / D-007 — Unitless quantities cannot drive percent-complete`, `pre-2026-08-30 / D-008 — `actual_finish` is written only at 100% complete`, `2026-09-04 / D-078 — A liability becomes a finding only when a planner rules, and the ruling is audited`, `pre-2026-08-30 / D-005 — The LLM is optional and off by default`, `pre-2026-08-30 / D-009 — Agent/voice updates are proposals, never direct writes`, `pre-2026-08-30 / D-012 — SQLite, synchronous ingest, and "on submission"`, `2026-09-04 / D-077 — A delay becomes a row, so a planner has something to overrule`, `2026-09-01 / D-017 — A second baseline is adopted as a version, not as a replacement`, `2026-09-01 / D-019 — Refuse to evaluate a baseline the ground truth does not describe`, `2026-09-01 / D-018 — Baselines are read through a provider, never by `json.load` at the call site`, `2026-09-04 / D-076 — The delay taxonomy is built, and liability is a lookup a human can audit`, `2026-09-03 / D-065 — An LLM-suggested description must be the supervisor's own words`, `2026-09-01 / D-028 - The learned ranker is selected under the precision floor, not on top-1`, `2026-09-02 / D-047 - Primavera PMXML and XER are read, not just written; FINDINGS F3 closed`, `2026-09-02 / D-052 - An activity-type vocabulary from CFIHOS and Uniclass, built and deliberately not wired in`, `2026-09-04 / D-073 — The Reconcile screen speaks the server's resolve vocabulary`, `pre-2026-08-30 / D-002 — Precision-first decision rule with a margin guard`, `2026-09-01 / D-022 — A tag's digit count is a numbering convention, not part of what a tag is`, `2026-09-01 / D-024 - A near-miss is a mention with its discriminator removed`, `2026-09-01 / D-030 - One design system: six type steps, six spacing steps, three radii, and five button jobs`, `2026-09-01 / D-034 - Demo counts re-measured; the review queue grew because the system got more careful`, `2026-09-01 / D-037 - An independent audit refuted four of our claims, and it was right about three and a half`, `2026-09-03 / D-071 — A delay cause is counted once per report, not once per audit row`, `pre-2026-08-30 / D-001 — Retrieval and ranking are separate stages`, `2026-09-01 / D-031 - One file defines every number, and it is not any of the ones that had them`, `2026-09-01 / D-032 - The alias loop is NOT closed, and the documentation said three different things`, `2026-09-01 / D-033 - The live server runs the v1 hand-set blend, and no document said so`, `2026-09-01 / D-035 - Real-corpus counts verified from manifests; the WSDOT schedule has 27 activities`, `2026-09-01 / D-039 - Tier 1 screens restructured around one question each; the matcher's reasoning is still invisible on Reconcile, and that is a backend gap`, `2026-09-01 / D-041 — Projector legibility: conflicts above the fold, and a banner that reads as detection`, `2026-09-01 / D-042 - The review queue projects the matcher's reasoning, and every candidate carries its own score`, `2026-09-01 / D-043 — The product fonts ship with the frontend`, `2026-09-02 / D-046 - Schedule-side EVM, and why its headline SPI is flagged unsafe on this dataset`, `2026-09-02 / D-048 - RAID register: one table, arithmetic exposure, and no candidate commits itself`, `2026-09-02 / D-049 - Field notifications derived from the audit trail, with no read state and no new table`, `2026-09-02 / D-051 - eval.py reports calibration, confidence intervals and macro-F1, and the calibration result is mixed`, `2026-09-03 / D-066 — A give-up must be remembered, and a confirm must never vanish`, `2026-09-03 / D-067 — The role decides the application; a viewport never does`, `2026-09-03 / D-069 — The register gets the writer it was missing`, `2026-09-03 / D-072 — The design brief enters the repository, dated to a commit`, `2026-08-31 / D-014 — Backfill history as a parallel H-series, and document defects rather than fix them`, `2026-09-01 / D-015 — `date_basis` is carried end to end, and a defaulted finish date is never written`, `2026-09-01 / D-016 — A missing planned quantity is not a milestone`, `2026-09-01 / D-020 — The v2 evaluation corpus is generated as one family, from one seed`, `2026-09-01 / D-023 — A unit suffix is not a numerator`, `2026-09-01 / D-025 - Two more tag-normalisation defects, found by auditing for the assumption rather than the symptom`, `2026-09-01 / D-026 - The dense channel was 86% of latency because it encoded one mention at a time`, `2026-09-01 / D-027 - Recall@20 is 100%, so retrieval tuning cannot help and discipline gating actively hurts`, `2026-09-01 / D-036 - Negative results are kept, labelled, and not quietly dropped`, `2026-09-01 / D-038 — The resolver rejected the Reconcile screen's own verb`, `2026-09-01 / D-040 — Recall is reported at the depth the planner is shown, and a CSV upload now fails loudly`, `2026-09-02 / D-044 - Exports are downloadable; the advertised URL is no longer dead`, `2026-09-02 / D-045 - The committed corpus is UTF-8, and the generator can no longer write anything else`, `2026-09-02 / D-050 - The Evidence API reports the corpus from its own manifests, caveats included`, `2026-08-30 / D-013 — Adopt a persistent repository memory protocol`, `2026-09-02 / D-060 — Three roles behind a role picker, and an executive view that never shows a queue`, `2026-09-03 / D-068 — `auto_applied` is not a claim about who decided`, `2026-09-03 / D-070 — The server migrates its own database, or the migration does not exist`, `pre-2026-08-30 / D-004 — The audit trail is append-only`, `2026-09-03 / D-064 — DEMO.md realigned to the three-role application`, `pre-2026-08-30 / D-006 — Tags are never taken from the LLM`, `pre-2026-08-30 / D-010 — Source files are decoded explicitly, never lossily`, `pre-2026-08-30 / D-011 — Source conflicts are detected across uploads, via the audit trail`, `pre-2026-08-30 / D-003 — `rationale` is deterministic feature names, never LLM prose`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Are the 18 inferred relationships involving `MatchingEngine` (e.g. with `EngineConfig` and `LinkCandidate`) actually correct?**
  _`MatchingEngine` has 18 INFERRED edges - model-reasoned connections that need verification._
- **Are the 55 inferred relationships involving `Activity` (e.g. with `main()` and `_month_of()`) actually correct?**
  _`Activity` has 55 INFERRED edges - model-reasoned connections that need verification._
- **Are the 22 inferred relationships involving `ScheduleIndex` (e.g. with `main()` and `MatchingEngine`) actually correct?**
  _`ScheduleIndex` has 22 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `EngineConfig` (e.g. with `MatchingEngine` and `TestAliasChannelStaysOff`) actually correct?**
  _`EngineConfig` has 15 INFERRED edges - model-reasoned connections that need verification._