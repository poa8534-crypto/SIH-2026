# Graph Report - SIH 2026  (2026-09-02)

## Corpus Check
- Large corpus: 371 files · ~643,201 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 2272 nodes · 5121 edges · 126 communities (97 shown, 22 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 350 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Event Extraction
- Matching Engine
- API Endpoints
- API Schemas & Audit Records
- Database Bootstrap & Demo Reset
- Real-Corpus Evaluation
- Conversational Agent
- Date & Basis Extraction
- Tag Matching & Scoring
- Persistence Layer
- Evaluation Harness
- Matcher Configuration
- Feature Computation
- Field UI Components
- Matching · group 14
- Matching · group 15
- Frontend · group 16
- Server · group 17
- Frontend · group 18
- Extraction · group 19
- Frontend · group 20
- Frontend · group 21
- Matching · group 22
- .Agents · group 23
- Frontend · group 24
- Matching · group 25
- Matching · group 26
- Research · group 27
- Extraction · group 28
- .Agents · group 29
- Server · group 30
- Generate_V2_Dataset · group 31
- Matching · group 32
- Matching · group 33
- Research · group 34
- Research · group 35
- Server · group 36
- Matching · group 37
- Server · group 38
- Frontend · group 39
- Extraction · group 40
- Frontend · group 41
- Frontend · group 42
- Matching · group 43
- Matching · group 44
- .Agents · group 45
- Research · group 46
- Extraction · group 47
- Frontend · group 48
- Matching · group 49
- .Agents · group 50
- Extraction · group 51
- Extraction · group 52
- Frontend · group 53
- Matching · group 54
- Extraction · group 55
- Matching · group 56
- Matching · group 57
- Extraction · group 58
- Frontend · group 59
- Matching · group 60
- Matching · group 61
- Research · group 62
- Scripts · group 63
- Server · group 64
- Server · group 65
- Frontend · group 66
- Matching · group 67
- Server · group 68
- Server · group 69
- Server · group 70
- Server · group 71
- Extraction · group 72
- Frontend · group 73
- Server · group 74
- Server · group 75
- Server · group 76
- Server · group 77
- .Agents · group 78
- .Agents · group 79
- Server · group 80
- Extraction · group 81
- Extraction · group 82
- Server · group 83
- Server · group 84
- Extraction · group 85
- Frontend · group 86
- Generate_Duliajan_P6_Schedule · group 87
- Server · group 88
- Extraction · group 89
- Extraction · group 90
- Frontend · group 91
- Matching · group 92
- Server · group 93
- Server · group 94
- .Agents · group 95
- Extraction · group 96
- Server · group 97
- Frontend · group 98
- Generate_V2_Dataset · group 99
- Matching · group 100
- Server · group 101
- .Agents · group 102
- Generate_V2_Dataset · group 103
- Server · group 104
- Server · group 106
- Server · group 107
- .Agents · group 108
- .Cursor · group 109
- .Mcp.Json · group 110
- .Qoder · group 111
- .Agents · group 112
- Extraction · group 113
- Frontend · group 114
- Frontend · group 115
- .Gemini · group 116
- .Gemini · group 117
- Generate_V2_Dataset · group 119
- Generate_V2_Dataset · group 120

## God Nodes (most connected - your core abstractions)
1. `MatchingEngine` - 92 edges
2. `ScheduleIndex` - 53 edges
3. `Activity` - 53 edges
4. `EngineConfig` - 46 edges
5. `extract_tags()` - 45 edges
6. `Extractor` - 39 edges
7. `Thresholds` - 38 edges
8. `RollupAccumulator` - 35 edges
9. `Provenance` - 33 edges
10. `ExtractedEvent` - 33 edges

## Surprising Connections (you probably didn't know these)
- `_dated()` --uses--> `DateBasis`  [INFERRED]
  eval.py → extraction/models.py
- `main()` --uses--> `ScheduleIndex`  [INFERRED]
  eval.py → matching/schedule_index.py
- `ingest_file()` --uses--> `Extractor`  [INFERRED]
  server/main.py → extraction/extractor.py
- `check_provider()` --uses--> `NullBackend`  [INFERRED]
  scripts/healthcheck.py → extraction/llm_backend.py
- `_event()` --uses--> `Discipline`  [INFERRED]
  matching/test_learned.py → extraction/models.py

## Import Cycles
- 3-file cycle: `matching/__init__.py -> matching/engine.py -> matching/retrieval.py -> matching/__init__.py`

## Communities (126 total, 22 thin omitted)

### Community 0 - "Event Extraction"
Cohesion: 0.06
Nodes (59): _build_event(), ExtractedEvent, Turn a labelled mention into an ExtractedEvent via the shared prepass., Extractor, Main extraction orchestrator. Ties together: 1. Deterministic pre-pass (regex)…, Coerce an LLM status to our enum's values, defaulting to unknown., Unified extraction pipeline for EPC field reports. Accepts: - .txt files → DPR…, LLM backend interface for structured event extraction. Two backends behind one… (+51 more)

### Community 1 - "Matching Engine"
Cohesion: 0.06
Nodes (55): abstention_features(), _basis_for(), _basis_of(), decide_outcome(), _describe_conflicts(), DateBasis, ndarray, _qty_swallowed_by_tag() (+47 more)

### Community 2 - "API Endpoints"
Cohesion: 0.06
Nodes (66): _baseline_response(), _cross_file_conflict(), export_schedule(), _generate_pmxml(), _generate_xer(), get_review_queue(), get_schedule(), list_source_conflicts() (+58 more)

### Community 3 - "API Schemas & Audit Records"
Cohesion: 0.05
Nodes (63): AuditRecord, EventIndex, post, ResolveResponse, _now(), _uuid(), _activate_baseline(), admin_reset() (+55 more)

### Community 4 - "Database Bootstrap & Demo Reset"
Cohesion: 0.07
Nodes (48): DeclarativeBase, main(), Reset the demo database to a known seeded state. Safe to run while the server…, main(), Build a working database from scratch. Loads the 120-activity baseline…, db_session(), Shared fixtures. `server/test_server.py` builds its own database with an…, Load the real 120-activity baseline. The matcher fixture has to be the real… (+40 more)

### Community 5 - "Real-Corpus Evaluation"
Cohesion: 0.09
Nodes (37): Counter, boot_ci(), ci_str(), constructcie(), _f(), _iso(), load_csv(), load_jsonl() (+29 more)

### Community 6 - "Conversational Agent"
Cohesion: 0.07
Nodes (41): AgentContext, AgentTurnRequest, AgentContext, choices_for(), discipline_choice_text(), discipline_label(), mentions_countable(), parse_discipline() (+33 more)

### Community 7 - "Date & Basis Extraction"
Cohesion: 0.06
Nodes (29): _basis_at(), date, DateBasis, Discipline, ExtractedEvent, Extract the report date from DPR header lines., Merge prepass hints and LLM output into a final ExtractedEvent., Decide whether this line asserts a start date, a finish date, both, or neither,… (+21 more)

### Community 8 - "Tag Matching & Scoring"
Cohesion: 0.09
Nodes (18): Returns (score, line_locked). A full line+size+spec match sets line_locked=True…, _tag_overlap(), make_event(), date, fixture, A finish date nobody asserted must not reach the schedule. A DPR line that says…, Roll 1200 m2 - the full planned quantity of CIV-SIT-1001., The other half of the same defect: no finish claim at all, and the bare report… (+10 more)

### Community 9 - "Persistence Layer"
Cohesion: 0.05
Nodes (30): _add_missing_columns(), AliasLexicon, ConversationTurn, IntegrityError, IntegrityWarning, MemoryCache, date, datetime (+22 more)

### Community 10 - "Evaluation Harness"
Cohesion: 0.10
Nodes (43): assert_baseline_matches_ground_truth(), _baseline_line(), calibrate(), _dated(), _decision_for(), evaluate(), ground_truth_activity_ids(), load_ground_truth() (+35 more)

### Community 11 - "Matcher Configuration"
Cohesion: 0.08
Nodes (24): EngineConfig, _discipline_of(), MatchingEngine, Resolve a whole file's mentions, encoding them in one forward pass., Score the whole candidate pool as a matrix, then wrap the result in the per-…, Cosine similarity of the dense channel for this candidate (None if the…, Resolve one ExtractedEvent against the schedule. Routed through the batch path…, (2) one forward pass for the file == one call per event. `match_event` routes… (+16 more)

### Community 12 - "Feature Computation"
Cohesion: 0.09
Nodes (34): _area_match(), blend_matrix(), compute_features(), _date_proximity(), final_score(), matrix_to_vectors(), _predecessor_plausibility(), _predecessor_progress() (+26 more)

### Community 13 - "Field UI Components"
Cohesion: 0.11
Nodes (28): NeedsYourResponse(), RecentUpdates(), STATUS_ICON, STATUS_SHORT, when(), BaseProps, Button(), ButtonProps (+20 more)

### Community 14 - "Matching · group 14"
Cohesion: 0.09
Nodes (22): AbstentionModel, Calibrator, _design(), _design_names(), fit_abstention(), fit_calibrator(), fit_ranker(), LearnedRanker (+14 more)

### Community 15 - "Matching · group 15"
Cohesion: 0.07
Nodes (22): BaselineVersion, ABC, A source of baseline schedule activities. Two methods, deliberately separate:…, Normalised activity dicts (see `normalize_activity`)., Identity of the source: name, filename, sha256, activity count., Which schedule is loaded, and how to prove it later. `sha256` is over the raw…, ScheduleProvider, BaselineVersion (+14 more)

### Community 16 - "Frontend · group 16"
Cohesion: 0.11
Nodes (25): App(), DesktopShell(), MobileShell(), hasScore(), MatchReasoning(), SignalChips(), toCandidates(), useDevice() (+17 more)

### Community 17 - "Server · group 17"
Cohesion: 0.08
Nodes (13): _import(), Path, Half-loading a broken baseline is far harder to notice than a refusal, so…, Nothing is being replaced, so nothing needs consent., Deleting them would orphan their LinkedEvent and AuditRecord rows and silently…, The planned fields already match, so a re-import is a no-op beyond registering…, Importing a baseline changes what the SCHEDULE holds without changing what…, conftest seeds rows the way a pre-typed-predecessor database looks: `["CIV-… (+5 more)

### Community 18 - "Frontend · group 18"
Cohesion: 0.11
Nodes (27): ApiError, fetchWithHandler(), getBaseUrl(), ANSWER, ITEM, ready(), wrap(), AgentContext (+19 more)

### Community 19 - "Extraction · group 19"
Cohesion: 0.09
Nodes (15): Run deterministic pre-pass on a single text span., extract_fractions(), extract_quantities(), _normalize_uom(), Extract all (quantity, uom) pairs from free text., Extract progress fractions like '6 of 8'., Normalize unit-of-measurement strings., A unit suffix is not a numerator. `FRACTION_RE` had no boundary before the… (+7 more)

### Community 20 - "Frontend · group 20"
Cohesion: 0.09
Nodes (19): agentContext(), buildRecognition(), classifySpeechError(), getCtor(), langSubscribers, setSharedLang(), SPEECH_LANGUAGES, SpeechFailure (+11 more)

### Community 21 - "Frontend · group 21"
Cohesion: 0.13
Nodes (22): ConversationStage(), MicUnavailable(), NotUnderstood(), ServerUnreachable(), IdleStage(), ListeningStage(), BAR_HEIGHTS, CardRow (+14 more)

### Community 22 - "Matching · group 22"
Cohesion: 0.11
Nodes (17): date, _safe_date(), TestTagParsing, extract_size_mentions(), parse_tag(), Parse a tag string into (size, line, spec). Examples: '24"-P-1001-A1A' →…, Nominal pipe sizes mentioned in text: 24", 12 inch, 8 in, 4"., Expand slash-style equipment tags: 'P-101A/B' → ['P-101A', 'P-101B']. Schedule… (+9 more)

### Community 23 - ".Agents · group 23"
Cohesion: 0.13
Nodes (23): count_bullets(), extract_code_blocks(), extract_fenced_spans(), extract_headings(), extract_indented_code_blocks(), extract_inline_codes(), extract_paths(), extract_urls() (+15 more)

### Community 24 - "Frontend · group 24"
Cohesion: 0.10
Nodes (16): ConfidenceBadge(), ConfidenceBadgeProps, clock(), FeedRow, FIELD_LABEL, position(), RecentActivity(), shortDate() (+8 more)

### Community 25 - "Matching · group 25"
Cohesion: 0.09
Nodes (11): _load_pickle(), Path, Path, Load a JSON baseline. Both shipped baselines load through the same provider, so…, The startup-built term x doc matrix must BE BM25, not approximate it., Refitting for new (k1, b) must refit the matrix too — a stale matrix beside a…, TestPrecomputedBM25, TestScheduleIndex (+3 more)

### Community 26 - "Matching · group 26"
Cohesion: 0.11
Nodes (10): HybridRetriever, L2-normalised activity embeddings, read from disk when this exact (model,…, Exact/near-exact tag match, ranked by match quality: full (line+size+spec) >…, Character 3-5 gram cosine. Robust to the spelling errors and abbreviations the…, Planner corrections, read back. A confirmed correction is the strongest…, The single activity an unambiguous tag resolves to, else None. 'Unambiguous'…, Returns (ordered candidate indices, per-candidate retrieval info). `dense_hits`…, Dense retrieval for many queries in ONE forward pass. This is the whole reason… (+2 more)

### Community 27 - "Research · group 27"
Cohesion: 0.11
Nodes (23): abstention_pairs(), bootstrap_ci(), bootstrap_delta(), brier(), calibration_arrays(), ece(), fmt_ci(), in_family_hits() (+15 more)

### Community 28 - "Extraction · group 28"
Cohesion: 0.11
Nodes (24): _extract_one(), parametrize, Belt and braces for providers with no grammar constraint., Tags feed the matcher's near-decisive tag_overlap feature. Description words…, The model returned ['steel erection', 'pipe rack'] and missed TK-1., Fix 2 must not weaken the forecast guard: it runs first and wins., Replays a fixed LLM output, standing in for a misbehaving model., Run one free-text span through the real merge path. (+16 more)

### Community 29 - ".Agents · group 29"
Cohesion: 0.13
Nodes (24): build_compress_prompt(), build_fix_prompt(), call_claude(), _compress_file_locked(), first_nonblank_line(), mask_code_blocks(), r"""Strip an outer ```markdown ... ``` fence when it wraps the ENTIRE output.…, Write ``text`` to ``path`` atomically as UTF-8. Path.write_text() truncates the… (+16 more)

### Community 30 - "Server · group 30"
Cohesion: 0.09
Nodes (15): LinkedEvent, An extracted progress event linked to a schedule activity. Created by the…, The candidate activity ids, oldest callers' shape. The column stored a bare…, Every ranked candidate with its own score and rationale. Empty `rationale` and…, _existing_agent_submission(), The (linked_event_id, review_item_id) already submitted for a session. Agent…, clean_database(), _ingest() (+7 more)

### Community 31 - "Generate_V2_Dataset · group 31"
Cohesion: 0.16
Nodes (22): abbreviate(), build_mention(), build_near_miss(), build_spreadsheet(), bullet(), core_phrases(), dpr_header(), main() (+14 more)

### Community 32 - "Matching · group 32"
Cohesion: 0.13
Nodes (12): normalize_activity(), normalize_wbs_level(), normalize_wbs_path(), A single displayable WBS path. v1 gives a dotted code (`"1.1.1.1"`); v2 gives…, The planning level, or None when the source does not state one. Deliberately…, One activity from any baseline, in the shape every consumer expects.…, Tests for schedule providers, baseline identity, and the agreement guard. Two…, v2 omits `detail` entirely; it is concatenated into the embedding document and… (+4 more)

### Community 33 - "Matching · group 33"
Cohesion: 0.14
Nodes (14): production(), Configuration for retrieval and ranking. Every knob that an experiment might…, The configuration the ablation selected, if its artefacts are present. Row 8b:…, RetrievalConfig, (3) skipping dense + fuzzy must not change WHICH activity is chosen. Driven…, A line shared by several activities must NOT short circuit — that is precisely…, TestShortCircuitAgrees, _gold_indices() (+6 more)

### Community 34 - "Research · group 34"
Cohesion: 0.21
Nodes (17): The one embedder for this process. Every construction path that does not pass…, shared_embedder(), calibrate_on_dev(), fit_and_measure_ranker(), _load_tuned(), main(), measure(), The ablation: what each change contributes ALONE, and what it costs. Reading… (+9 more)

### Community 35 - "Research · group 35"
Cohesion: 0.20
Nodes (20): categorise(), family_of(), gold_description(), gold_text(), jaccard(), load_drift_kinds(), longest_common_run(), main() (+12 more)

### Community 36 - "Server · group 36"
Cohesion: 0.19
Nodes (8): interpret(), Ask the model to read one message. Returns None on any problem. `backend` is…, _Output, The model's status is run through our parser, not taken as given., Stands in for LLMEventOutput., RecordingBackend, TestSilentFallback, TestValidation

### Community 37 - "Matching · group 37"
Cohesion: 0.15
Nodes (17): canonicalise(), expansion_tokens(), expansions(), mapping_count(), Controlled construction-terminology normalisation (field → schedule). Why this…, Canonical schedule-vocabulary phrases found in `text` (original kept)., `text` with canonical schedule vocabulary APPENDED. Expansion, not replacement:…, Tokens of the canonical phrases, for the BM25 query side. (+9 more)

### Community 38 - "Server · group 38"
Cohesion: 0.17
Nodes (10): client(), fixture, An API client sharing the seeded test database., The exact three-turn conversation the demo runs on., Part 17: 'Electrical' used to be rejected and the question repeated., TestDemonstrationExchange, TestHumanGate, TestMatchingIsReal (+2 more)

### Community 39 - "Frontend · group 39"
Cohesion: 0.11
Nodes (19): autoprefixer, esbuild, devDependencies, autoprefixer, esbuild, jsdom, tailwindcss, @testing-library/jest-dom (+11 more)

### Community 40 - "Extraction · group 40"
Cohesion: 0.14
Nodes (12): LLMBatchOutput, LLMEventOutput, OllamaBackend, BaseModel, Local Ollama backend for offline/demo mode. Two things matter for correctness…, Reachable AND actually serving the configured model., Build and send one request. The ~3,000-token baseline schedule is deliberately…, Structured output we request from the LLM. Deliberately asks for NO dates and… (+4 more)

### Community 41 - "Frontend · group 41"
Cohesion: 0.16
Nodes (14): DISCIPLINE_COLOR, DisciplineTagProps, DISCIPLINE_LABEL, DISCIPLINE_META, DISCIPLINE_SHORT, DISCIPLINES, FIELD_ROLE, LANGUAGES (+6 more)

### Community 42 - "Frontend · group 42"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+10 more)

### Community 43 - "Matching · group 43"
Cohesion: 0.19
Nodes (9): parse_predecessor(), parse_predecessors(), PredecessorLink, Any, Schedule providers: where a baseline comes from, and what shape it arrives in.…, One predecessor entry, from either baseline shape. Accepts a bare id (`"CIV-…, One logic tie into an activity. `rel` is the Primavera relationship type and…, A relationship type we cannot read is a weaker signal than a predecessor… (+1 more)

### Community 44 - "Matching · group 44"
Cohesion: 0.16
Nodes (9): _hashed_embeddings(), MiniLMEmbedder, ndarray, Identity of what this embedder produces, for the on-disk cache. The hashed…, Encode and L2-normalise, so a dot product IS the cosine., Deterministic hashed character-ngram embeddings (offline fallback)., sentence-transformers all-MiniLM-L6-v2, offline-first. Loading is lazy:…, No code path may reload the sentence-transformers model. (+1 more)

### Community 45 - ".Agents · group 45"
Cohesion: 0.19
Nodes (15): main(), print_usage(), backup_dir_for(), Out-of-tree backup dir for filepath, keyed by its parent dir name — kept…, detect_file_type(), _is_code_line(), _is_json_content(), _is_yaml_content() (+7 more)

### Community 46 - "Research · group 46"
Cohesion: 0.13
Nodes (11): BaseDocTemplate, callout(), fig(), Path, Build research/NAVIS_SIH_FINAL_REPORT.pdf from repository evidence. Nothing…, Numbered data table with a caption; status_col cells are colour-coded., Image + numbered caption, kept together. Aspect ratio preserved., ReportDoc (+3 more)

### Community 47 - "Extraction · group 47"
Cohesion: 0.18
Nodes (5): extract_tags(), Extract all equipment/line tags from free text., Tests for equipment/line tag regex patterns., TestTagExtraction, TestMaterialGrades

### Community 48 - "Frontend · group 48"
Cohesion: 0.11
Nodes (18): dependencies, lucide-react, react, react-dom, react-router-dom, recharts, @tailwindcss/vite, @tanstack/react-query (+10 more)

### Community 49 - "Matching · group 49"
Cohesion: 0.19
Nodes (5): JsonScheduleProvider, The JSON baselines this repository ships. Reads either shape - `[ {...} ]` or…, Explicit decode, matching extraction/textio.py's reasoning: a lossy decode of a…, The whole point of recording a version: two runs quoting different numbers must…, TestJsonScheduleProvider

### Community 50 - ".Agents · group 50"
Cohesion: 0.15
Nodes (17): compress_file(), file_lock(), is_sensitive_path(), lock_path_for(), LockTimeoutError, Path, Raised when another process holds the compress lock past LOCK_WAIT_SECONDS., Cross-session lock path keyed on the same (parent-dir-name, stem) identity… (+9 more)

### Community 51 - "Extraction · group 51"
Cohesion: 0.17
Nodes (14): _env(), make_backend_from_env(), NullBackend, Read config with precedence: real environment, then .env, then default. The…, Build the extraction backend named by EXTRACTION_PROVIDER. Defaults to rules-…, No-op backend that returns empty LLM output. Useful for testing prepass-only., Guards protecting the pipeline from LLM extraction errors. These cover three…, The guard must not suppress genuine actuals. (+6 more)

### Community 52 - "Extraction · group 52"
Cohesion: 0.12
Nodes (7): parametrize, A tag number's digit count is a numbering convention, not part of what a tag…, The bound is generous on purpose — the next baseline should not need another…, WHCP-2101 is a real v2 tag; a three-letter prefix bound dropped it., Longest match wins. Widening the equipment suffix to five digits also made this…, The prefix stays uppercase-only. Widening it to four letters would otherwise…, TestTagDigitWidth

### Community 53 - "Frontend · group 53"
Cohesion: 0.17
Nodes (14): FieldNav(), TABS, PLANNER, api, Card(), FieldClarifications(), Filter, FILTERS (+6 more)

### Community 54 - "Matching · group 54"
Cohesion: 0.16
Nodes (10): Hybrid candidate retrieval: exact tag + BM25 + dense + char n-gram + alias…, TestTokenize, Text utilities: tokenisation, tag parsing/normalisation, synonym expansion. A…, Lowercase tokeniser that keeps tag-like tokens (p-1001, tk-1) whole, expands…, tokenize(), Answers the judge's first objection: 'why not just BM25?' BM25 ranks better on…, bm25_score(), bm25_top1() (+2 more)

### Community 55 - "Extraction · group 55"
Cohesion: 0.15
Nodes (7): Extract progress events from a source file. Dispatches to the appropriate…, Extract from a text-based daily progress report., Parse DPR text into logical progress spans. Returns list of (text, line_number)…, Extract from an xlsx discipline spreadsheet., Placeholder for future CSV parsing., ExtractionResult, Complete output of the extraction pipeline for one source file.

### Community 56 - "Matching · group 56"
Cohesion: 0.15
Nodes (9): PmxmlScheduleProvider, PrimaveraXerScheduleProvider, Path, Shared body for the formats that are declared but not built., Primavera P6 PMXML (`.xml`) — DECLARED, NOT IMPLEMENTED. The problem statement…, Primavera `.xer` — DECLARED, NOT IMPLEMENTED. XER is a tab-delimited table…, _UnimplementedProvider, parametrize (+1 more)

### Community 57 - "Matching · group 57"
Cohesion: 0.21
Nodes (9): _event(), ExtractedEvent, The server's write key and this read key must be one function. If they drift,…, An alias is a RETRIEVAL channel, never a decision. The mention text supports…, TestAliasChannel, alias_key(), Normalise a raw field mention to the key the alias lexicon is stored under.…, alias_lexicon_from() (+1 more)

### Community 58 - "Extraction · group 58"
Cohesion: 0.14
Nodes (10): coerce_date(), any, date, ExtractedEvent, Coerce various date representations to a date object. Handles: - datetime.date…, Parse an xlsx file and return ExtractedEvents., Find the actual data header row (skip merged group headers, titles). Returns…, Read a row using the column map. (+2 more)

### Community 59 - "Frontend · group 59"
Cohesion: 0.20
Nodes (10): DisciplineTag(), isDiscipline(), ACCEPTED_EXTENSIONS, extensionOf(), formatBytes(), Ingest(), positionOf(), Status (+2 more)

### Community 60 - "Matching · group 60"
Cohesion: 0.21
Nodes (12): cache_dir(), content_key(), load(), ndarray, Path, On-disk cache for the activity-embedding matrix. The 218 activity descriptions…, Stable key over the exact inputs that determine the matrix., Write atomically: a half-written .npy read by a concurrent process is the one… (+4 more)

### Community 61 - "Matching · group 61"
Cohesion: 0.27
Nodes (6): dangling_predecessors(), Problems worth refusing to load on. Returns human-readable messages. Checked: a…, Predecessor ids that are not activities in the same baseline., validate_activities(), The v1 baseline states no level at all; that is not an error., TestValidation

### Community 62 - "Research · group 62"
Cohesion: 0.36
Nodes (13): ablation(), architecture(), competitor_coverage(), implementation_status(), innovation_scores(), load(), operating_point(), ps_coverage() (+5 more)

### Community 63 - "Scripts · group 63"
Cohesion: 0.31
Nodes (13): check_dataset(), check_embedder(), check_endpoints(), check_imports(), check_provider(), main(), Verify an installation end to end: imports, data, and all 8 endpoints. python…, The LLM is optional. Absence is a PASS, not a failure. (+5 more)

### Community 64 - "Server · group 64"
Cohesion: 0.20
Nodes (7): llm_enabled(), llm_timeout_seconds(), True when the operator has opted in to the LLM path., parametrize, The LLM must be optional, bounded, and silent when it fails. Every test here…, Disabled must mean no import, no client, no socket, no wait., TestFlag

### Community 65 - "Server · group 65"
Cohesion: 0.18
Nodes (9): BaselineVersion, Which baseline schedule the activities table was built from. A metric is only…, get_active_baseline(), _matcher_baseline_drift(), BaselineVersion, Warn when the active baseline is not the one the matcher links against.…, The baseline the activities table was last built from, or None., conftest seeds activities directly, the way a database created before baseline… (+1 more)

### Community 66 - "Frontend · group 66"
Cohesion: 0.17
Nodes (6): DISCIPLINE_AXIS, DISCIPLINE_ORDER, Overrun, DelayReasonRow, DurationDistribution, ProductivityMetric

### Community 67 - "Matching · group 67"
Cohesion: 0.27
Nodes (6): check_ground_truth_agreement(), Do the ground truth and the loaded baseline describe the same project?…, _ground_truth_ids(), The exact failure this guard exists for: 218 activity ids that do not intersect…, 0/0 must not read as 100%: a ground truth with nothing in it cannot vouch for a…, TestGroundTruthAgreement

### Community 68 - "Server · group 68"
Cohesion: 0.21
Nodes (11): _attr(), LLMSuggestion, Optional LLM interpretation for one conversational turn. The LLM is an…, Keep only values that survive the deterministic validators., Values the model proposed, already validated. All optional., _validate(), parse_status(), parse_tags() (+3 more)

### Community 69 - "Server · group 69"
Cohesion: 0.17
Nodes (12): _find_unit(), _india_tz(), now_ist(), _num(), datetime, Quantity, Deterministic slot filling for the conversational logging agent. Everything…, A completed amount, optionally out of a planned total. (+4 more)

### Community 70 - "Server · group 70"
Cohesion: 0.23
Nodes (8): _build(), InvalidDate, parse_date(), date, Exception, The text looked like a date but cannot be one., Resolve a date from free text, relative to the project's data date. Relative…, TestDateParsing

### Community 71 - "Server · group 71"
Cohesion: 0.24
Nodes (4): parse_quantity(), Read a completed / planned quantity from free text. Ratios are kept as two…, parametrize, TestQuantityParsing

### Community 72 - "Extraction · group 72"
Cohesion: 0.26
Nodes (5): infer_discipline(), Discipline, Infer the most likely discipline from context keywords., Tests for discipline keyword classification., TestDisciplineInference

### Community 73 - "Frontend · group 73"
Cohesion: 0.17
Nodes (5): CLARIFICATION, Fake, made, PROPOSAL, REPORT

### Community 74 - "Server · group 74"
Cohesion: 0.20
Nodes (12): get, Job, Tracks a file ingestion and extraction pipeline run., get_activity_audit(), get_job(), _job_summary(), list_jobs(), Past ingests, newest first, without their events. The events array on a single… (+4 more)

### Community 75 - "Server · group 75"
Cohesion: 0.27
Nodes (3): Test GET /review-queue and POST /review/{id}/resolve., Ingest a file and return a review item ID., TestReviewQueue

### Community 76 - "Server · group 76"
Cohesion: 0.17
Nodes (5): Test GET /schedule with integrity rules., Set actual dates and check variance is computed., Should warn when predecessors haven't started., Activities with actual_finish should count as completed., TestScheduleEndpoint

### Community 77 - "Server · group 77"
Cohesion: 0.17
Nodes (4): Test POST /agent/turn., Test multi-turn slot filling., Test that session persists across turns., TestAgentTurn

### Community 78 - ".Agents · group 78"
Cohesion: 0.18
Nodes (10): description, files, SKILL.md, license, name, private, scripts, test (+2 more)

### Community 79 - ".Agents · group 79"
Cohesion: 0.18
Nodes (10): description, files, SKILL.md, license, name, private, scripts, test (+2 more)

### Community 80 - "Server · group 80"
Cohesion: 0.18
Nodes (11): DurationDistribution, ProductivityMetric, _compute_duration_distribution(), _compute_productivity(), _compute_suggested_duration(), memory_query(), Institutional memory queries. Returns: - Actual vs planned duration…, Group activities by type prefix, compute planned/actual duration stats. (+3 more)

### Community 81 - "Extraction · group 81"
Cohesion: 0.24
Nodes (7): Load baseline schedule and build compact context string., Path, Reading source documents without losing characters. The supplied DPRs are…, Read a text document, preserving every character it actually contains., Read a JSON document. Same rules, named separately for intent., read_json_text(), read_text()

### Community 82 - "Extraction · group 82"
Cohesion: 0.27
Nodes (4): OpenAICompatibleBackend, Backend for any OpenAI-compatible API (Claude, OpenAI, etc.)., Check API connectivity., Call the API to extract structured events.

### Community 83 - "Server · group 83"
Cohesion: 0.20
Nodes (6): Test schedule integrity validation., Actual Start after data_date should raise IntegrityError., Actual Finish before Actual Start should raise IntegrityError., Predecessor-not-started should warn, not block., Valid actual dates should not raise errors., TestIntegrityRules

### Community 86 - "Frontend · group 86"
Cohesion: 0.25
Nodes (8): scripts, build, clean, dev, lint, preview, test, test:watch

### Community 87 - "Generate_Duliajan_P6_Schedule · group 87"
Cohesion: 0.46
Nodes (5): add_work(), is_work(), next_work(), sched(), sub_work()

### Community 88 - "Server · group 88"
Cohesion: 0.25
Nodes (5): Test extraction across all 10 DPR files + both spreadsheets., All 10 DPR files should be processable., Both discipline spreadsheets should be processable., Check that our extraction can find at least some ground-truth activity IDs., TestCrossDPRStatistics

### Community 89 - "Extraction · group 89"
Cohesion: 0.29
Nodes (5): LLMBackend, ABC, Check if this backend is reachable., Abstract LLM backend for structured event extraction., Extract structured events from text spans. Args: text_spans: Free-text lines to…

### Community 90 - "Extraction · group 90"
Cohesion: 0.29
Nodes (7): Roll one event onto one node and return the RollupResult., The observed case: "All 12 pockets grouted" yields quantity 12 with no uom.…, The guard must not block legitimate measured progress., _rollup_one(), test_llm_quantity_with_a_unit_is_admitted(), test_quantity_with_matching_unit_still_counts(), test_unitless_llm_quantity_excluded_from_percent_complete()

### Community 91 - "Frontend · group 91"
Cohesion: 0.29
Nodes (6): engines, node, name, private, type, version

### Community 92 - "Matching · group 92"
Cohesion: 0.29
Nodes (3): BaselineAgreement, How well a ground-truth file and a baseline describe the same project., The message a human needs to fix this, not just to know it broke.

### Community 94 - "Server · group 94"
Cohesion: 0.29
Nodes (3): Verify all 120 activities were seeded., Test SQLAlchemy model behavior., TestDatabaseModels

### Community 95 - ".Agents · group 95"
Cohesion: 0.60
Nodes (5): benchmark_pair(), count_tokens(), main(), print_table(), Path

### Community 99 - "Generate_V2_Dataset · group 99"
Cohesion: 0.40
Nodes (5): build_near_miss_families(), build_near_miss_queue(), _desc_tokens(), Every group of activities a mention could genuinely fail to separate. Returns…, A shuffled work queue of (family, gold) pairs to emit as near-misses. Families…

### Community 101 - "Server · group 101"
Cohesion: 0.40
Nodes (5): on_event, get_db(), FastAPI dependency for DB sessions., Initialize DB and seed baseline schedule., startup()

### Community 103 - "Generate_V2_Dataset · group 103"
Cohesion: 0.50
Nodes (4): make_tag_free(), Repair the doubled nouns that tag substitution creates. Replacing a tag with…, Rewrite a description so no line or equipment tag survives. A matcher that can…, _tidy_substitutions()

### Community 104 - "Server · group 104"
Cohesion: 0.50
Nodes (3): Protocol, The part of LLMBackend this module uses., SupportsExtract

## Knowledge Gaps
- **124 isolated node(s):** `name`, `version`, `license`, `private`, `type` (+119 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 878 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MatchingEngine` connect `Matcher Configuration` to `Event Extraction`, `Matching Engine`, `API Endpoints`, `Tag Matching & Scoring`, `Evaluation Harness`, `Feature Computation`, `Matching · group 14`, `Matching · group 15`, `Matching · group 22`, `Matching · group 25`, `Matching · group 26`, `Research · group 27`, `Generate_V2_Dataset · group 31`, `Matching · group 33`, `Research · group 34`, `Research · group 35`, `Matching · group 37`, `Matching · group 44`, `Extraction · group 51`, `Matching · group 54`, `Matching · group 57`, `Scripts · group 63`, `Extraction · group 90`, `Matching · group 100`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `ScheduleIndex` connect `Matching · group 15` to `Event Extraction`, `Matching Engine`, `Matching · group 32`, `Matching · group 67`, `Research · group 34`, `API Endpoints`, `Tag Matching & Scoring`, `Evaluation Harness`, `Matcher Configuration`, `Feature Computation`, `Matching · group 49`, `Matching · group 54`, `Matching · group 22`, `Matching · group 25`, `Matching · group 26`, `Research · group 27`, `Generate_V2_Dataset · group 31`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `extract_tags()` connect `Extraction · group 47` to `Event Extraction`, `Matching Engine`, `Real-Corpus Evaluation`, `Date & Basis Extraction`, `Generate_V2_Dataset · group 103`, `Evaluation Harness`, `Matching · group 15`, `Extraction · group 19`, `Extraction · group 52`, `Matching · group 22`, `Matching · group 57`, `Generate_V2_Dataset · group 31`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 18 inferred relationships involving `MatchingEngine` (e.g. with `EngineConfig` and `LinkCandidate`) actually correct?**
  _`MatchingEngine` has 18 INFERRED edges - model-reasoned connections that need verification._
- **Are the 22 inferred relationships involving `ScheduleIndex` (e.g. with `main()` and `MatchingEngine`) actually correct?**
  _`ScheduleIndex` has 22 INFERRED edges - model-reasoned connections that need verification._
- **Are the 34 inferred relationships involving `Activity` (e.g. with `main()` and `_activity_model()`) actually correct?**
  _`Activity` has 34 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `EngineConfig` (e.g. with `MatchingEngine` and `TestBatchEqualsSingle`) actually correct?**
  _`EngineConfig` has 13 INFERRED edges - model-reasoned connections that need verification._