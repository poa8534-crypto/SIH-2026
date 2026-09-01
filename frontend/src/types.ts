export type Discipline = 'civil' | 'piping' | 'static_equipment' | 'electrical' | 'instrumentation' | 'hse';

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
  alternatives: string[];
  created_at: string;

  /* ── The matcher's reasoning ──────────────────────────────────────────────
   *
   * OPTIONAL BECAUSE THE ENDPOINT DOES NOT SEND THEM YET.
   *
   * All three are persisted on the LinkedEvent row this item points at
   * (`server/db.py` — `match_method` 266, `margin` 269, `rationale` 270) and
   * all three are already projected onto `LinkedEventResponse`, which is what
   * GET /jobs/{id} returns (`server/schemas.py` 47/53/54, populated at
   * `server/main.py` 1230/1236/1237).
   *
   * GET /review-queue does not project them. `server/main.py:1264` already
   * loads the same LinkedEvent as `le` and reads six other fields off it, so
   * the change is three lines in the `ReviewQueueItemResponse(...)` call at
   * 1266 plus three fields on the schema at `server/schemas.py:80`.
   *
   * That is an endpoint-shape change, which this pass is not permitted to
   * make. The fields are declared here — and `MatchReasoning` renders them —
   * so that when the endpoint sends them the UI lights up with no further
   * frontend work. They are NEVER faked and NEVER computed client-side: when
   * absent the panel says the endpoint does not supply them. See D-031.
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
