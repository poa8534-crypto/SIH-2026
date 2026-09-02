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
  RaidItem,
  ResolveResponse,
  ReviewItem,
  ScheduleResponse
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

  getReviewQueue: (status: string = 'pending'): Promise<ReviewItem[]> => {
    return fetchWithHandler(`/review-queue?status=${encodeURIComponent(status)}`);
  },

  resolveReview: (
    itemId: string,
    body: {
      action: 'confirm' | 'new_activity' | 'reject';
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
   * resolveReview for the three actions that close an item.
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
