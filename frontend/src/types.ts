export type Discipline = 'civil' | 'piping' | 'static_equipment' | 'electrical' | 'instrumentation' | 'hse';

/** One activity the matcher ranked for a review item, with its own score. */
export interface ReviewCandidate {
  activity_id: string;
  rank: number;
  /** This candidate's own final_score — never the top candidate's. */
  score: number;
  /** Feature names that fired for THIS candidate. */
  rationale: string[];
  description: string | null;
}

export interface ReviewItem {
  id: string;
  linked_event_id: string;
  activity_id: string;
  reason: string;
  priority: string;
  status: string;
  source_span: string | null;
  raw_text: string;
  confidence: number;
  tags: string[];
  suggested_activity_id: string | null;
  /**
   * Every ranked candidate, each carrying its own score and rationale.
   *
   * Was `string[]`, which is why ranks 2+ had no score and "why did candidate
   * 1 beat candidate 2" was unanswerable. The engine scores every candidate
   * (`matching/engine.py:177-190`); only the ids used to survive
   * serialisation. See D-042.
   *
   * A row ingested before that change yields `score: 0`, `rank` by position
   * and an empty `rationale` — the UI reports that as absent rather than
   * substituting the top candidate's number.
   *
   * The bare-string arm mirrors `LinkedEvent.alternative_candidates()` on the
   * server, which reads both shapes for exactly the same reason. Normalise
   * with `toCandidates()` rather than reading this field directly.
   */
  alternatives: Array<ReviewCandidate | string>;
  created_at: string;

  /**
   * The matcher's own record of how it reached this proposal, now projected
   * by GET /review-queue (`server/schemas.py` ReviewQueueItemResponse,
   * populated in `get_review_queue`). `rationale` is the DECISION-level list
   * and can carry decision reasons such as `below_tau_low`; the per-candidate
   * evidence lives on each entry of `alternatives`.
   *
   * Optional, not because the endpoint omits them — it sends all three with
   * defaults — but because a response from an older server would not, and the
   * screen must degrade rather than render `undefined`.
   */
  rationale?: string[];
  margin?: number;
  match_method?: string;
}

/** ARCHITECTURE.md 2.3. EXPLICIT and RELATIVE_RESOLVED both come from the
 *  source; DEFAULTED_TO_REPORT_DATE is an inference the source never made. */
export type DateBasis = 'EXPLICIT' | 'RELATIVE_RESOLVED' | 'DEFAULTED_TO_REPORT_DATE';

/** A typed logic tie. The v1 baseline stores bare predecessor ids, which read
 *  back as FS with zero lag — what a bare id has always meant. */
export interface PredecessorLink {
  activity_id: string;
  rel: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days: number;
}

/** Which baseline schedule produced the numbers in a response. Two baselines
 *  ship and they share no activity ids, so a figure quoted without this is
 *  unattributable. `sha256` is over the source file's raw bytes. */
export interface BaselineVersion {
  name: string;
  filename: string;
  sha256: string;
  activity_count: number;
  source_format: string;
  source: string;
  imported_at: string | null;
}

export interface ScheduleActivity {
  activity_id: string;
  wbs_path: string;
  /** Planning level, 5 or 6. Null for the v1 baseline, which does not state
   *  one — recorded as absent rather than inferred from the path. */
  wbs_level: number | null;
  description: string;
  discipline: Discipline;
  tag: string | null;
  /** Work calendar ("6-day", "7-day"). Null for the v1 baseline. */
  calendar: string | null;
  planned_start: string | null;
  planned_finish: string | null;
  planned_qty: number;
  uom: string;
  actual_start: string | null;
  actual_finish: string | null;
  /** How each actual date was obtained. DEFAULTED_TO_REPORT_DATE means no
   *  source named the date — the report header's own date stood in — and the
   *  UI marks it as inferred rather than asserted. Null when the date is null. */
  actual_start_basis: DateBasis | null;
  actual_finish_basis: DateBasis | null;
  actual_qty: number | null;
  start_variance_days: number | null;
  finish_variance_days: number | null;
  percent_complete: number | null;
  predecessors: string[];
  predecessor_links: PredecessorLink[];
  /** Confidence of the audit write that last set an actual date. Null when
   *  the activity has no actuals. */
  link_confidence: number | null;
}

/** One entry from GET /schedule. `severity` is 'conflict' when two field
 *  sources disagreed, 'warning' for a schedule-logic problem. */
export interface IntegrityWarning {
  activity_id: string;
  field: string;
  message: string;
  severity: 'conflict' | 'warning';
  contributing_sources?: string[];
}

/** One immutable row of an activity's audit trail, from
 *  GET /schedule/{activity_id}/audit. Append-only: never updated or deleted. */
export interface AuditRecord {
  id: string;
  activity_id: string;
  /** The single event that produced this write. Null for aggregate writes
   *  (rolled-up quantity, conflict notes) which have no single origin. */
  linked_event_id: string | null;
  timestamp: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  source: string;
  source_file: string | null;
  source_line: number | null;
  source_row: number | null;
  source_span: string | null;
  confidence: number | null;
  model_version: string;
  auto_applied: boolean;
  contributing_sources: string[];
  conflict: boolean;
}

export interface ExportResponse {
  format: string;
  filename: string;
  activity_count: number;
  content_type: string;
  download_url: string;
}

export interface ScheduleResponse {
  project: string;
  data_date: string;
  /** The baseline these activities came from. Null only when the activities
   *  table predates baseline tracking and the file could not be identified. */
  baseline: BaselineVersion | null;
  total_activities: number;
  activities_with_actuals: number;
  activities_completed: number;
  average_start_variance: number | null;
  average_finish_variance: number | null;
  integrity_warnings: IntegrityWarning[];
  activities: ScheduleActivity[];
}

export interface IngestResponse {
  job_id: string;
  filename: string;
  status: string;
  message: string;
}

export interface ExtractedEvent {
  id: string;
  source_file: string;
  source_line: number | null;
  source_row: number | null;
  source_span: string | null;
  raw_text: string;
  tags: string[];
  reported_date: string | null;
  asserted_start: string | null;
  asserted_finish: string | null;
  quantity: number | null;
  uom: string | null;
  discipline: string | null;
  status: string;
  percentage: number | null;
  confidence: number;
  match_method: string;
  /** Set when the matcher auto-linked this event to a schedule activity. */
  activity_id: string | null;
  alternatives: string[];
  reviewed: boolean;
  reviewer_action: string | null;
  /** AUTO_LINK | REVIEW | NEW_ACTIVITY | REJECTED */
  decision: string;
  margin: number;
  rationale: string[];
}

/** A past ingest without its events, from GET /jobs. */
export interface JobSummary {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  event_count: number;
  linked_count: number;
  review_count: number;
  activities_updated: number;
  audit_records_created: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface JobResponse extends JobSummary {
  events: ExtractedEvent[];
}

export interface ResolveResponse {
  review_item_id: string;
  resolution: string;
  activity_id: string;
  alias_entries_created: number;
  audit_records_created: number;
  message: string;
}

/** One side of a source disagreement, with the exact place it came from. */
export interface ConflictSide {
  value: string;
  source_file: string | null;
  source_line: number | null;
  source_row: number | null;
  /** spreadsheet | daily_report | agent | other. Never the baseline —
   *  Primavera is read-only and cannot be a side of a conflict. */
  source_kind: 'spreadsheet' | 'daily_report' | 'agent' | 'other';
}

/** Two field sources disagreeing about the same field of one activity. */
export interface SourceConflict {
  activity_id: string;
  description: string;
  discipline: Discipline;
  field: string;
  sides: ConflictSide[];
  /** What the schedule currently holds. */
  stored_value: string | null;
  detected_at: string;
}

/** One recent write, from GET /audit/recent. */
export interface AuditFeedItem {
  id: string;
  activity_id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  source: string;
  source_file: string | null;
  source_line: number | null;
  source_row: number | null;
  confidence: number | null;
  auto_applied: boolean;
  conflict: boolean;
  timestamp: string;
}

/** One update this supervisor submitted, from GET /field/reports. */
export interface FieldReport {
  id: string;
  reference: string;
  raw_text: string;
  submitted_at: string;
  location: string | null;
  discipline: string | null;
  discipline_label: string | null;
  /** Processing | Needs Information | Confirmed | Rejected */
  status: string;
  matched_activity_id: string | null;
  matched_activity_description: string | null;
  confidence: number;
  review_item_id: string | null;
  clarification_question: string | null;
  clarification_response: string | null;
}

/** A Planning Engineer question about one of this supervisor's reports. */
export interface Clarification {
  id: string;
  review_item_id: string;
  reference: string;
  original_text: string;
  question: string;
  asked_by: string;
  asked_at: string;
  answered: boolean;
  response: string | null;
  answered_at: string | null;
  matched_activity_id: string | null;
}

/** GET /memory/query — institutional memory. All four shapes below are
 *  computed from actual execution data, not from the baseline plan. */

export interface DurationDistribution {
  /** Activity type prefix, e.g. "PIP-SPL" — not a human name. */
  activity_type: string;
  count: number;
  /** Of `count`, how many have both actual dates — what actual_mean_days is
   *  computed from. */
  actuals_count: number;
  planned_mean_days: number;
  /** Null when no activity of this type has both an actual start and finish. */
  actual_mean_days: number | null;
  planned_min_days: number;
  planned_max_days: number;
}

export interface ProductivityMetric {
  discipline: string;
  total_activities: number;
  completed: number;
  average_planned_days: number;
  /** Null when nothing of this discipline has completed. */
  average_actual_days: number | null;
  average_qty_per_day: number | null;
}

export interface DelayReasonRow {
  reason: string;
  frequency: number;
  affected_activities: string[];
  /** Finish slip summed over affected activities — attributed, not measured. */
  days_lost: number;
}

export interface SuggestedDuration {
  activity_type_pattern: string;
  /** Activities of this type in the baseline. */
  sample_size: number;
  /** Of those, how many have actual dates — what the medians are based on. */
  actuals_count: number;
  median_planned_days: number;
  /** Null when there are fewer than two completed activities. */
  median_actual_days: number | null;
  p80_actual_days: number | null;
  recommendation: string;
}

export interface MemoryQueryResponse {
  query_type: string;
  duration_distribution: DurationDistribution[] | null;
  productivity: ProductivityMetric[] | null;
  delay_reasons: DelayReasonRow[] | null;
  suggested_duration: SuggestedDuration | null;
  computed_at: string;
}

/** Structured context the client already knows. Optional and additive. */
export interface AgentContext {
  project_code: string;
  location: string;
  discipline: string;
  data_date: string;
  timezone: string;
}

export interface AgentTurnRequest {
  session_id: string;
  message: string;
  context?: AgentContext;
  /** Commit the proposed update. Until true the agent only proposes and
   *  nothing is written. */
  confirm?: boolean;
}

/** Slots the agent accumulates across a session. */
export interface SlotState {
  discipline: string | null;
  location: string | null;
  quantity: number | null;
  planned_quantity: number | null;
  quantity_over_planned: boolean;
  uom: string | null;
  tags: string[];
  status: string | null;
  activity_id: string | null;
  description: string | null;
  date: string | null;
  confidence: number | null;
  activity_description: string | null;
  match_outcome: string | null;
  alternatives: string[];
}

export interface AgentTurnResponse {
  session_id: string;
  turn_number: number;
  agent_message: string;
  slots: SlotState;
  pending_slots: string[];
  event_created: boolean;
  linked_event_id: string | null;
  confidence: number;
  /** Every slot filled and a proposal on the table, nothing written yet. */
  awaiting_confirmation: boolean;
  activity_description: string | null;
  /** AUTO_LINK | REVIEW | NEW_ACTIVITY | REJECTED */
  match_outcome: string | null;
  review_item_id: string | null;
  /** Human labels. The raw enum values stay in `slots`. */
  discipline_label: string | null;
  status_label: string | null;
  /** Options to show under a question, when it has a closed set. */
  choices: string | null;
}

// ── Earned value (schedule half only) ────────────────────────────────────────

/**
 * One EVM figure set, for the project or for one discipline.
 *
 * `spi` is nullable on purpose: when planned value is zero there is no ratio to
 * report, and the server sends null rather than 0.0 so the UI cannot render an
 * absence as a measured collapse. See D-046.
 */
export interface EvmFigures {
  planned_value: number;
  earned_value: number;
  schedule_variance: number;
  spi: number | null;
  total_weight: number;
  activity_count: number;
  /**
   * How each activity's percent-complete was obtained. This is what makes SPI
   * auditable: `no_evidence_floor` counts activities scored at 0% because no
   * source reported anything, not because work stalled.
   */
  percent_source_counts: {
    actual_finish: number;
    linked_event_percentage: number;
    no_evidence_floor: number;
  };
}

export interface EvmResponse {
  data_date: string;
  weighting: string;
  project: EvmFigures;
  by_discipline: Record<string, EvmFigures>;
  cost_metrics_available?: boolean;
  cost_metrics_reason?: string;
  headline_safe?: boolean;
  headline_warning?: string | null;
}

// ── Real-corpus provenance ───────────────────────────────────────────────────

export interface CorpusCaveat {
  id: string;
  statement?: string;
  text?: string;
  detail?: string;
}

export interface EvidenceCorpus {
  data_origin: string;
  built_at_utc: string;
  validated_at_utc: string;
  artifacts: {
    count: number;
    bytes: number;
    by_extension: Record<string, number>;
    by_source: Record<string, number>;
  };
  records: Record<string, number>;
  ocr: { pages: number; lines: number; activity_mentions: number; verified: boolean };
  validation: { passed: boolean; checks_run: number; errors: number; warnings: number };
  caveats: CorpusCaveat[];
  source?: unknown;
}

// ── RAID register ────────────────────────────────────────────────────────────

export type RaidKind = 'risk' | 'issue' | 'action' | 'decision';

/**
 * One accepted register entry. Nothing reaches this shape automatically:
 * candidates detected from field reports stay proposals until a Project
 * Manager adjudicates them, per ROADMAP §6 and D-048.
 */
export interface RaidItem {
  id: string;
  kind: RaidKind;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  owner: string | null;
  due_date: string | null;
  date_raised: string | null;
  date_closed: string | null;
  probability: number | null;
  impact_days: number | null;
  /** probability x impact, computed server-side. Never in the browser. */
  exposure: number | null;
  linked_activity_ids: string[];
  created_at: string;
  source_kind?: string | null;
  source_id?: string | null;
  source_note?: string | null;
}

/**
 * A register entry the system has *proposed* from the evidence it already
 * holds — a recurring delay cause in the audit trail, say. It is not in the
 * register: `committed` is false until a Project Manager accepts it, which is
 * the same rule D-009 applies to dates. The system proposes; a person decides.
 */
export interface RaidCandidate {
  kind: RaidKind;
  title: string;
  description: string;
  category: string | null;
  linked_activity_ids: string[];
  occurrences: number | null;
  days_lost: number | null;
  source_kind: string | null;
  source_id: string | null;
  source_note: string | null;
  committed: boolean;
}
