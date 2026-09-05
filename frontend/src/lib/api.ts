import {
  AgentTurnRequest,
  AgentTurnResponse,
  AuditFeedItem,
  AuditRecord,
  Clarification,
  FieldReport,
  ExportResponse,
  IngestResponse,
  JobResponse,
  JobSummary,
  MemoryQueryResponse,
  SourceConflict,
  EvmResponse,
  EvidenceCorpus,
  RaidCandidate,
  RaidItem,
  ResolveResponse,
  ActivityProductivity,
  DelayAttribution,
  DelayClassifyResponse,
  DelayNoticeResponse,
  Liability,
  QuantityLedger,
  ReviewItem,
  ScheduleResponse,
  TenderEstimateRequest,
  TenderEstimateResponse
} from '../types';

export class ApiError extends Error {
  public status: number;
  public detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * The message to show a user for any thrown failure.
 *
 * An ApiError carries the server's own `detail`, which is always more useful
 * than anything we could write. Anything else means the request never got a
 * reply — DNS, a refused connection, CORS, an unparseable body — so name that
 * instead of saying "unknown error", which tells the user nothing and hides
 * the one fact that matters: the server was not reached.
 */
export function errorDetail(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  if (error instanceof Error && error.message) {
    return `Could not reach the API at ${getBaseUrl()} — ${error.message}`;
  }
  return `Could not reach the API at ${getBaseUrl()}.`;
}

/**
 * Where the API lives. Exported because a download has to be an ABSOLUTE URL:
 * `ExportResponse.download_url` is a server-relative `/uploads/{file}`, and the
 * frontend is served from a different origin in development.
 */
export const getBaseUrl = () => {
  return import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;
};

async function fetchWithHandler(endpoint: string, options?: RequestInit) {
  const url = `${getBaseUrl()}${endpoint}`;
  const response = await fetch(url, options);

  if (!response.ok) {
    let detail = 'An unexpected error occurred';
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        detail = errorData.detail;
      }
    } catch {
      // Failed to parse JSON
    }
    throw new ApiError(response.status, detail);
  }

  return response.json();
}

export const api = {
  ingestFile: (file: File): Promise<IngestResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchWithHandler('/ingest', {
      method: 'POST',
      body: formData,
    });
  },

  getJob: (jobId: string): Promise<JobResponse> => {
    return fetchWithHandler(`/jobs/${jobId}`);
  },

  /** Past ingests, newest first, without their events. */
  listJobs: (limit: number = 50): Promise<JobSummary[]> => {
    return fetchWithHandler(`/jobs?limit=${limit}`);
  },

  /**
   * The delay attribution matrix. GET /delay/attribution.
   *
   * Read-only: the rows are written by the ingest and resolution paths, not
   * by this call, so two identical requests do the same amount of work.
   */
  getDelayAttribution: (discipline?: string): Promise<DelayAttribution> => {
    const query = discipline ? `?discipline=${encodeURIComponent(discipline)}` : '';
    return fetchWithHandler(`/delay/attribution${query}`);
  },

  /**
   * A planner rules on who carries one delay. POST /delay/{id}/classify.
   *
   * There is no "accept the proposal" shortcut by design: a planner who
   * agrees sends the same value the machine proposed, and the audit trail
   * then shows a human agreed rather than a default nobody read (D-078).
   */
  classifyDelay: (
    delayEventId: string,
    body: { liability: Liability; note?: string; adjudicated_by?: string }
  ): Promise<DelayClassifyResponse> => {
    return fetchWithHandler(`/delay/${delayEventId}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  /**
   * Record that contractual notice was given. POST /delay/{id}/notice.
   *
   * `served_on` is the date notice was GIVEN, not the date it was typed here.
   * A date after the deadline is accepted and comes back `served_late` — a
   * late notice is a fact about the project (D-080).
   */
  recordDelayNotice: (
    delayEventId: string,
    body: { served_on: string; reference?: string; recorded_by?: string }
  ): Promise<DelayNoticeResponse> => {
    return fetchWithHandler(`/delay/${delayEventId}/notice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  /**
   * Absolute URL for the Delay Attribution Report.
   *
   * A URL rather than a fetch: the HTML is meant to be opened and printed,
   * and the CSV to be saved. Absolute because the frontend is served from a
   * different origin in development — the same reason `getBaseUrl` is
   * exported for export downloads.
   */
  delayReportUrl: (format: 'html' | 'csv', discipline?: string): string => {
    const query = new URLSearchParams({ format });
    if (discipline) query.set('discipline', discipline);
    return `${getBaseUrl()}/delay/report?${query.toString()}`;
  },

  /**
   * Which readings built this activity's installed quantity, and which the
   * roll-up refused. GET /activity/{id}/quantity.
   *
   * Derived on every request from the same classifier the roll-up itself
   * uses, so the explanation cannot drift from the answer (D-085).
   */
  getQuantityLedger: (activityId: string): Promise<QuantityLedger> => {
    return fetchWithHandler(
      `/activity/${encodeURIComponent(activityId)}/quantity`
    );
  },

  /**
   * How fast this activity went and therefore when it finishes.
   * GET /activity/{id}/productivity.
   *
   * Three rates, none of them THE rate, and a forecast from every one that
   * can produce one (D-087, D-088). Nothing here is written to the schedule.
   */
  getActivityProductivity: (activityId: string): Promise<ActivityProductivity> => {
    return fetchWithHandler(
      `/activity/${encodeURIComponent(activityId)}/productivity`
    );
  },

  getReviewQueue: (status: string = 'pending'): Promise<ReviewItem[]> => {
    return fetchWithHandler(`/review-queue?status=${encodeURIComponent(status)}`);
  },

  /**
   * Close a review item. POST /review/{item_id}/resolve.
   *
   * The four actions are the server's own (`ResolveRequest` in
   * server/schemas.py): 'confirm' commits the matcher's proposal and ignores
   * any activity_id sent with it, 'reassign' commits `activity_id` instead,
   * 'create' needs both `new_activity_id` and `new_description`, and 'ignore'
   * closes the item without writing anything. Anything else is a 400.
   */
  resolveReview: (
    itemId: string,
    body: {
      action: 'confirm' | 'reassign' | 'create' | 'ignore';
      activity_id?: string;
      new_activity_id?: string;
      new_description?: string;
      note?: string;
    }
  ): Promise<ResolveResponse> => {
    return fetchWithHandler(`/review/${itemId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  },

  /**
   * Planner side of the clarification loop: put a question back to the
   * supervisor about one queued item. POST /review/{item_id}/clarify.
   *
   * It deliberately does not resolve the item — the server sets the question
   * and clears any previous answer, and leaves the queue entry pending. Use
   * resolveReview for the actions that close an item.
   *
   * `asked_by` is optional and left unset by this app: ClarificationAskRequest
   * defaults it server-side, and there is no authentication here, so there is
   * no person for the client to name.
   */
  askClarification: (
    itemId: string,
    body: { question: string; asked_by?: string }
  ): Promise<Clarification> => {
    return fetchWithHandler(`/review/${encodeURIComponent(itemId)}/clarify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  },

  getSchedule: (discipline?: string, includeWarnings: boolean = true): Promise<ScheduleResponse> => {
    const params = new URLSearchParams();
    if (discipline) params.append('discipline', discipline);
    params.append('include_warnings', String(includeWarnings));
    return fetchWithHandler(`/schedule?${params.toString()}`);
  },

  /** Append-only audit trail for one activity, newest first. */
  getActivityAudit: (activityId: string): Promise<AuditRecord[]> => {
    return fetchWithHandler(`/schedule/${encodeURIComponent(activityId)}/audit`);
  },

  /** Activities where two field sources disagree about the same field. */
  getConflicts: (limit: number = 50): Promise<SourceConflict[]> => {
    return fetchWithHandler(`/schedule/conflicts?limit=${limit}`);
  },

  /**
   * Schedule-side earned value. PV, EV, SV and SPI only — the cost half needs
   * ACWP, which no daily progress report carries. See D-046.
   */
  getEvm: (): Promise<EvmResponse> => fetchWithHandler('/evm'),

  /**
   * The RAID register. Only entries a planner has accepted appear here;
   * detected candidates live behind /raid/candidates and are proposals.
   */
  getRaid: (kind?: string, status?: string): Promise<RaidItem[]> => {
    const params = new URLSearchParams();
    if (kind) params.append('kind', kind);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchWithHandler(`/raid${q ? `?${q}` : ''}`);
  },

  /**
   * Entries the system has proposed from evidence it already holds. Nothing
   * here is in the register: every candidate carries `committed: false` until
   * a Project Manager accepts it (D-048). Reading this endpoint changes
   * nothing.
   */
  getRaidCandidates: async (): Promise<RaidCandidate[]> => {
    // Unlike GET /raid, this one answers with an object: the candidates plus
    // a `note` restating that none of them is in the register. The note is
    // the endpoint talking to whoever reads it raw; the screen renders that
    // caveat itself, so only the list is carried through here.
    const body = (await fetchWithHandler('/raid/candidates')) as {
      candidates?: RaidCandidate[];
      note?: string;
    } | null;
    return body?.candidates ?? [];
  },

  /**
   * Accept an entry into the register. This is the only way a row gets there:
   * the detector proposes, a planner commits. `exposure` is not sent — the
   * server computes it from probability and impact.
   */
  createRaidItem: (body: {
    kind: string;
    title: string;
    description?: string;
    category?: string | null;
    status?: string;
    owner?: string | null;
    probability?: number | null;
    impact_days?: number | null;
    linked_activity_ids?: string[];
    source_kind?: string | null;
    source_id?: string | null;
    source_note?: string | null;
  }): Promise<RaidItem> =>
    fetchWithHandler('/raid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /** Partial update of a register entry. Absent fields are left unchanged. */
  updateRaidItem: (
    itemId: string,
    body: {
      status?: string;
      owner?: string | null;
      probability?: number | null;
      impact_days?: number | null;
      date_closed?: string | null;
    }
  ): Promise<RaidItem> =>
    fetchWithHandler(`/raid/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /** What the real corpus actually contains, read from its own manifests. */
  getEvidenceCorpus: (): Promise<EvidenceCorpus> =>
    fetchWithHandler('/evidence/corpus'),

  /** Newest audit writes across all activities. */
  getRecentAudit: (limit: number = 20): Promise<AuditFeedItem[]> => {
    return fetchWithHandler(`/audit/recent?limit=${limit}`);
  },

  exportSchedule: (body: {
    format: 'pmxml' | 'xer';
    include_actuals?: boolean;
    filter_discipline?: string;
  }): Promise<ExportResponse> => {
    return fetchWithHandler('/schedule/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  },

  /** This supervisor's own submissions, newest first. */
  getFieldReports: (): Promise<FieldReport[]> => {
    return fetchWithHandler('/field/reports');
  },

  /** Planning Engineer questions about this supervisor's reports. */
  getClarifications: (unansweredOnly: boolean = false): Promise<Clarification[]> => {
    return fetchWithHandler(`/field/clarifications?unanswered_only=${unansweredOnly}`);
  },

  answerClarification: (itemId: string, response: string): Promise<Clarification> => {
    return fetchWithHandler(`/field/clarifications/${encodeURIComponent(itemId)}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    });
  },

  queryMemory: (params: Record<string, string>): Promise<MemoryQueryResponse> => {
    const searchParams = new URLSearchParams(params);
    return fetchWithHandler(`/memory/query?${searchParams.toString()}`);
  },

  estimateTender: (body: TenderEstimateRequest): Promise<TenderEstimateResponse> => {
    return fetchWithHandler('/memory/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  agentTurn: (body: AgentTurnRequest): Promise<AgentTurnResponse> => {
    return fetchWithHandler('/agent/turn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  },
};
