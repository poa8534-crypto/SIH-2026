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
  /** The linked event's discipline, projected by GET /review-queue. Optional
   *  because an older server does not send it. */
  discipline?: string | null;
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
  quantity?: number | null;
  uom?: string | null;
  reported_date?: string | null;
  event_status?: string | null;
  location?: string | null;
}

/** ── Granularity resolution: quantity, productivity, forecast ──────────────
 *
 *  The ledger answers "which readings built this activity's installed
 *  quantity, and which did the roll-up refuse". A refused reading is a
 *  DECISION the planner may disagree with, not an absence of data — which is
 *  why `reason_code` distinguishes a refusal from an event that simply never
 *  carried a quantity. See D-085.
 */
export interface QuantityContribution {
  linked_event_id: string;
  job_id: string | null;
  reported_date: string | null;
  quantity: number | null;
  uom: string | null;
  percentage: number | null;
  counted_quantity: number | null;
  counted: boolean;
  reason_code: string;
  reason: string;
  source_file: string | null;
  source_line: number | null;
  source_row: number | null;
  source_span: string | null;
  raw_text: string | null;
  confidence: number | null;
  reviewed: boolean;
}

export interface QuantityLedger {
  activity_id: string;
  description: string | null;
  discipline: string | null;
  uom: string | null;
  planned_qty: number;
  /** The largest accumulation from any single ingest — what the schedule
   *  holds, because `actual_qty` is written as max(current, rolled-up). */
  counted_total: number;
  /** Every accepted reading added together. Larger than `counted_total`
   *  exactly when the same work was reported by more than one ingest. */
  naive_sum_all_jobs: number;
  reported_by_jobs: number;
  stored_actual_qty: number | null;
  totals_agree: boolean;
  stored_total_basis: string;
  percent_complete_from_quantity: number | null;
  /** Uncapped, so an over-report is visible as one. */
  raw_percent_from_quantity: number | null;
  contributions: QuantityContribution[];
  counted_events: number;
  refused_events: number;
  events_without_quantity: number;
  total_note: string;
  refusal_note: string;
}

/** One rate, or an honest absence of one: `value` is null with a `note`
 *  saying why, because a zero would read as "measured, and nothing
 *  happened". See D-087. */
export interface ProductivityRate {
  basis: 'planned' | 'observed_elapsed' | 'observed_reported';
  value: number | null;
  days: number | null;
  quantity: number | null;
  sample_size: number;
  note: string;
}

export interface ProductivityComparables {
  activity_type: string;
  count: number;
  members: string[];
  median_qty_per_day: number | null;
  mean_qty_per_day: number | null;
  enough: boolean;
  note: string;
}

/** When this activity finishes according to one rate. Every rate that can
 *  produce a forecast produces one; a single figure would hide that the same
 *  evidence supports a range. See D-088. */
export interface ForecastCandidate {
  basis: string;
  rate: number;
  remaining_days: number;
  forecast_finish: string;
  baseline_finish: string | null;
  variance_days: number | null;
  sample_size: number;
  /** Present only on the nominated forecast: why this rate and not another. */
  why: string | null;
}

export interface ForecastEvidence {
  readings_counted: number;
  reported_days: number;
  measured_quantity: number;
  uom: string | null;
  comparable_activities: number;
}

export interface ActivityProductivity {
  activity_id: string;
  description: string | null;
  discipline: string | null;
  uom: string | null;
  planned_qty: number;
  counted_qty: number;
  percent_complete: number;
  percent_complete_source: string;
  remaining_qty: number;
  actual_start: string | null;
  actual_finish: string | null;
  as_of: string;
  reported_days: number;
  rates: ProductivityRate[];
  comparables: ProductivityComparables;
  calendar_basis: string;
  basis_note: string;
  baseline_finish: string | null;
  /** Null when no forecast could be made; `reason` says which refusal. */
  forecast: ForecastCandidate | null;
  candidates: ForecastCandidate[];
  reason: string | null;
  evidence: ForecastEvidence;
  forecast_note: string;
}

/** ── Delay attribution (the Contractor Dispute Shield) ────────────────────
 *
 *  Liability is a PROPOSAL until a planner rules. `liability_proposed` is the
 *  deterministic reading of the delay category; `liability_final` is null
 *  until someone has ruled, and `liability_effective` is whichever currently
 *  applies. A screen that showed only the effective value would present a
 *  machine proposal as a finding, which is the one thing that would discredit
 *  the whole feature — so all three travel together. See D-078.
 */
export type Liability =
  | 'COMPENSABLE'
  | 'NON_COMPENSABLE'
  | 'EXCUSABLE'
  | 'CONTESTED';

/** SERVED / OPEN / LAPSED / UNKNOWN. LAPSED means "no notice recorded here",
 *  never "no notice was given" — NAVIS holds no notice register. See D-080. */
export type NoticeStatus = 'SERVED' | 'OPEN' | 'LAPSED' | 'UNKNOWN';

export interface DelayEvent {
  id: string;
  activity_id: string | null;
  phrase: string;
  category: string;
  liability_proposed: Liability;
  liability_final: Liability | null;
  liability_effective: Liability;
  adjudicated: boolean;
  adjudication_note: string | null;
  inferred_by: string;
  confidence: number | null;
  discipline: string | null;
  month: string | null;
  /** The activity's whole finish slip, credited to every cause recorded
   *  against it. An upper bound — `beyond_float_days` is the claimable part. */
  impact_days: number;
  /** Baseline float, null when the activity could not be scheduled at all. */
  activity_total_float: number | null;
  float_consumed_days: number;
  /** The only part of the slip that can have moved the completion date. */
  beyond_float_days: number;
  on_critical_path: boolean;
  evidenced_on: string | null;
  /** REPORTED is a date a source asserted; the others are inferences. */
  evidenced_basis: string | null;
  notice_due_on: string | null;
  notice_status: NoticeStatus;
  notice_days_remaining: number | null;
  notice_served_on: string | null;
  notice_reference: string | null;
  audit_record_id: string | null;
  source_file: string | null;
  source_line: number | null;
  source_row: number | null;
  source_span: string | null;
}

export interface ConcurrentDelayPair {
  /** SAME_ACTIVITY is definitional; OVERLAPPING_WINDOW is temporal only. */
  kind: 'SAME_ACTIVITY' | 'OVERLAPPING_WINDOW';
  status: 'CONFLICT' | 'UNRESOLVED' | 'ALIGNED';
  overlap_start: string;
  overlap_end: string;
  overlap_days: number;
  left_delay_event_id: string;
  left_activity_id: string | null;
  left_phrase: string;
  left_category: string;
  left_liability: Liability;
  left_adjudicated: boolean;
  left_beyond_float_days: number;
  right_delay_event_id: string;
  right_activity_id: string | null;
  right_phrase: string;
  right_category: string;
  right_liability: Liability;
  right_adjudicated: boolean;
  right_beyond_float_days: number;
  /** Both sides outran their own float, so each could have moved the finish.
   *  This is what turns a temporal overlap into a claim about the date. */
  both_beyond_float: boolean;
}

export interface DelayConcurrency {
  pairs: ConcurrentDelayPair[];
  total_pairs: number;
  pairs_listed: number;
  counts: Record<string, number>;
  beyond_float_pairs: number;
  note: string;
}

/** The baseline network the float figures came from. Two finish dates, and
 *  neither is preferred: where the authored dates break the ties they state,
 *  float is advisory until they are reconciled. See D-082. */
export interface DelayNetworkSummary {
  activities_scheduled: number;
  critical_activities: number;
  project_finish: string | null;
  authored_finish: string | null;
  logic_conflicts: number;
  logic_matches_dates: boolean;
  unresolved_activities: string[];
  dangling_predecessors: string[];
  calendar_basis: string;
}

export interface DelayAttribution {
  events: DelayEvent[];
  total_events: number;
  adjudicated_events: number;
  /** Days a planner has ruled on, per liability. */
  adjudicated_days: Record<string, number>;
  /** Every row at its effective liability — proposals included. */
  proposed_days: Record<string, number>;
  days_by_month: Record<string, number>;
  categories_present: string[];
  notice_window_days: number;
  notice_counts: Record<string, number>;
  notice_lapsed_days: number;
  notice_as_of: string | null;
  beyond_float_days: Record<string, number>;
  adjudicated_beyond_float_days: Record<string, number>;
  float_basis: string;
  network: DelayNetworkSummary;
  concurrency: DelayConcurrency;
  impact_days_basis: string;
  unadjudicated_note: string;
  notice_note: string;
  computed_at: string;
}

export interface DelayClassifyResponse {
  delay_event_id: string;
  activity_id: string | null;
  liability_proposed: Liability;
  liability_previous: Liability | null;
  liability_final: Liability;
  overrides_proposal: boolean;
  audit_records_created: number;
  message: string;
}

export interface DelayNoticeResponse {
  delay_event_id: string;
  activity_id: string | null;
  evidenced_on: string | null;
  notice_due_on: string | null;
  notice_served_on: string;
  notice_reference: string | null;
  previous_served_on: string | null;
  served_late: boolean;
  audit_records_created: number;
  message: string;
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
  /** Total float in days computed from CPM network pass. Null if unscheduled. */
  total_float?: number | null;
  /** True if activity lies on the critical path (total_float <= 0). */
  critical?: boolean | null;
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
  critical_activities?: number;
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

export interface TenderRiskFactor {
  risk_type: string;
  /** Normally null. It used to be `frequency x 15` floored at 20%, which put
   *  "20% probability" against a cause observed exactly once. */
  probability_pct: number | null;
  impact_days: number;
  mitigation: string;
  historical_frequency: number;
  basis: string;
}

export interface TenderEstimateRequest {
  discipline: string;
  activity_type?: string;
  target_quantity?: number;
  uom?: string;
  site_condition?: string;
}

/** An empirical duration estimate, or a statement that there is not one.
 *
 *  Every duration field is nullable and they are all null together. When
 *  `evidence_sufficient` is false the screen must render `evidence_note`
 *  rather than a number: this endpoint used to manufacture percentiles from a
 *  single observation, or from planned duration x 0.85/1.15/1.45, or from a
 *  literal 10 days. See D-094. */
export interface TenderEstimateResponse {
  discipline: string;
  activity_type: string;
  site_condition: string;
  target_quantity: number | null;
  uom: string | null;
  sample_size: number;
  actuals_count: number;
  minimum_actuals_required: number;
  evidence_sufficient: boolean;
  evidence_note: string;
  historical_productivity_rate: number | null;
  productivity_uom: string | null;
  baseline_days_p50: number | null;
  calibrated_days_p10: number | null;
  calibrated_days_p50: number | null;
  calibrated_days_p90: number | null;
  weather_risk_factor: number;
  /** Names the multiplier as an assumption. Always rendered beside it. */
  weather_basis: string;
  total_contingency_days: number | null;
  contingency_basis: string;
  recommended_tender_duration: number | null;
  risk_factors: TenderRiskFactor[];
  risk_factors_note: string;
  pmxml_snippet: string | null;
  computed_at: string;
}

/** Structured context the client already knows. Optional and additive. */
export interface AgentContext {
  project_code: string;
  location: string;
  discipline?: string;
  data_date: string;
  timezone: string;
}

export type Activity = ScheduleActivity;

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

// ── Executive Intelligence & S-Curve ─────────────────────────────────────────

export interface ExecutiveSCurvePoint {
  date: string;
  week_label: string;
  pv_cumulative: number;
  ev_cumulative: number | null;
  ev_projected: number | null;
  is_future: boolean;
}

/** A milestone the backend DERIVED from the schedule, because the baseline
 *  carries no milestone flag. `derivation` says how, `basis` says whether the
 *  forecast date is an actual date or the CPM early finish. There is no
 *  confidence field: nothing in the system calibrates one. */
export interface ExecutiveMilestone {
  name: string;
  activity_id: string | null;
  activity_description: string | null;
  derived: boolean;
  derivation: string;
  baseline_date: string | null;
  forecast_date: string | null;
  basis: 'actual_finish' | 'cpm_early_finish' | 'cpm_project_finish' | 'not_scheduled' | string;
  variance_days: number | null;
  status: 'COMPLETE' | 'ON_TRACK' | 'AT_RISK' | 'CRITICAL' | 'UNSCHEDULED' | string;
}

export interface ExecutiveCriticalDriver {
  activity_id: string;
  description: string;
  discipline: string;
  planned_finish: string | null;
  actual_finish: string | null;
  finish_variance_days: number;
  /** The worst delay RECORDED against this activity, with its citation.
   *  Null means no cause is recorded — which is a real state, not a prompt
   *  to supply one. */
  driving_delay: string | null;
  driving_delay_category: string | null;
  driving_delay_liability: string | null;
  driving_delay_adjudicated: boolean;
  driving_delay_source: string | null;
  critical: boolean;
}

export interface ExecutiveMetricsResponse {
  as_of: string;
  kpis: {
    spi: number | null;
    spi_band: string;
    pv_total: number;
    ev_total: number;
    float_drift_days: number;
    critical_activities_count: number;
    evidence_coverage_pct: number;
    total_activities: number;
    evidenced_activities: number;
    unevidenced_activities: number;
  };
  /** Liability in DAYS, keyed by the delay layer's own vocabulary. There is
   *  no money here — see `financial`, which is opt-in. */
  dispute_shield: {
    employer_delay_days: number;
    contractor_delay_days: number;
    neutral_delay_days: number;
    contested_delay_days: number;
    employer_beyond_float_days: number;
    contractor_beyond_float_days: number;
    concurrent_pairs: number;
    concurrent_conflicts: number;
    adjudicated_days: Record<string, number>;
    adjudicated_beyond_float_days: Record<string, number>;
    adjudicated_events: number;
    total_events: number;
    notice_compliance_pct: number | null;
    notice_served_count: number;
    notice_open_count: number;
    notice_lapsed_count: number;
    notice_unknown_count: number;
    notice_note: string | null;
    impact_days_basis: string | null;
    unadjudicated_note: string | null;
  };
  /** Money only when an operator supplied contract parameters. When
   *  `available` is false every figure here is null and `reason` says why —
   *  the screen must render the absence, never a placeholder. */
  financial: {
    available: boolean;
    reason: string | null;
    basis: string | null;
    contract_value_cr: number | null;
    prolongation_lakhs_per_day: number | null;
    employer_claim_cr: number | null;
    contractor_ld_risk_cr: number | null;
    ld_pct_per_week: number;
    ld_cap_pct: number;
    note: string | null;
  };
  /** Three computed dates. NOT percentiles — `is_probabilistic` is false and
   *  stays false until something in the system holds a duration distribution. */
  completion_forecast: {
    baseline_finish: string | null;
    logic_finish: string | null;
    exposed_finish: string | null;
    current_forecast_finish: string | null;
    variance_days: number;
    open_critical_exposure_days: number;
    is_probabilistic: boolean;
    logic_conflicts: number;
    logic_conflicts_note: string | null;
    basis: string;
  };
  s_curve: ExecutiveSCurvePoint[];
  ev_basis: string;
  critical_drivers: ExecutiveCriticalDriver[];
  critical_drivers_note: string;
  milestones: ExecutiveMilestone[];
  milestones_note: string;
}

// ── Schedule Feasibility & Knowledge Auditor ────────────────────────────────

export interface KnowledgeRule {
  id: string;
  category: 'environmental' | 'engineering' | 'logistics' | 'dcma_quality' | 'contractor' | string;
  title: string;
  description: string;
  condition_trigger: string;
  impact_recommendation: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | string;
  active: boolean;
}

export interface KnowledgeRulesResponse {
  rules: KnowledgeRule[];
  total_rules: number;
  categories: Record<string, number>;
}

export interface ScheduleAuditFinding {
  id: string;
  activity_id?: string | null;
  activity_description?: string | null;
  discipline?: string | null;
  category: 'duration_optimism' | 'dcma_logic' | 'monsoon_weather' | 'productivity_unrealistic' | 'engineering_rule' | string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  planned_value?: string | null;
  benchmark_value?: string | null;
  variance_pct?: number | null;
  critique_message: string;
  rule_reference?: string | null;
  calibrated_recommendation?: string | null;
}

export interface ScheduleAuditResponse {
  audit_id: string;
  schedule_name: string;
  data_date?: string | null;
  total_activities: number;
  feasibility_score: number;
  feasibility_band: 'FEASIBLE' | 'MODERATE_RISK' | 'CRITICAL_RISK' | string;
  score_breakdown: Record<string, number>;
  summary: Record<string, number>;
  findings: ScheduleAuditFinding[];
  calibrated_schedule_snippet?: string | null;
  audited_at: string;
}

export interface BaselineImportResponse {
  baseline?: {
    name: string;
    filename: string;
    imported_at: string;
    activity_count: number;
    sha256: string;
    source_format: string;
    source: string;
  } | null;
  activities_created: number;
  activities_updated: number;
  activities_in_file: number;
  replaced: boolean;
  message: string;
}

export interface ChatAction {
  type: 'insert_draft' | 'link' | 'filter' | string;
  label: string;
  text?: string | null;
  url?: string | null;
}

export interface ChatRequest {
  question: string;
  role?: string;
  context?: Record<string, unknown> | null;
}

export interface ChatResponse {
  answer: string;
  citations: string[];
  grounded: boolean;
  model_available: boolean;
  suggested_actions: ChatAction[];
}

