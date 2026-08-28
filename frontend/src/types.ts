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
}

export interface ScheduleActivity {
  activity_id: string;
  wbs_path: string;
  description: string;
  discipline: Discipline;
  tag: string | null;
  planned_start: string | null;
  planned_finish: string | null;
  planned_qty: number;
  uom: string;
  actual_start: string | null;
  actual_finish: string | null;
  actual_qty: number | null;
  start_variance_days: number | null;
  finish_variance_days: number | null;
  percent_complete: number | null;
  predecessors: string[];
}

export interface ScheduleResponse {
  project: string;
  data_date: string;
  total_activities: number;
  activities_with_actuals: number;
  activities_completed: number;
  average_start_variance: number | null;
  average_finish_variance: number | null;
  integrity_warnings: unknown[];
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
}

export interface JobResponse {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  event_count: number;
  linked_count: number;
  review_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
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

export interface AgentTurnRequest {
  session_id: string;
  message: string;
}
