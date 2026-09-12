import {
  AgentTurnRequest,
  AgentTurnResponse,
  AuditFeedItem,
  AuditRecord,
  BaselineImportResponse,
  Clarification,
  FieldReport,
  ExportResponse,
  IngestResponse,
  JobResponse,
  JobSummary,
  MemoryQueryResponse,
  SourceConflict,
  EvmResponse,
  ExecutiveMetricsResponse,
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
  TenderEstimateResponse,
  KnowledgeRule,
  KnowledgeRulesResponse,
  ScheduleAuditResponse,
  ChatRequest,
  ChatResponse,
  AllocationBoard,
  AttendanceMarkBody,
  AttendanceRecord as AttendanceRow,
  AttendanceSummary,
  CaptureCoverage,
  Crew,
  CrewCapacity,
  DeviceView,
  HeartbeatBody,
  LinkHealth,
  ManDayRate,
  ReportingLag,
  ResourceAssignment,
  ShortfallEvidence,
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
 * True for the hosts a developer machine actually answers on: loopback, an
 * mDNS `.local` name, and the three private IPv4 ranges that a LAN or a phone
 * hotspot hands out. Deliberately the same set the backend's CORS regex
 * allows (`server/main.py`), because these two have to agree or the browser
 * blocks a request the URL got right.
 */
function isDevelopmentHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return true;
  if (hostname.endsWith('.local')) return true;
  return (
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

/**
 * Where the API lives. Exported because a download has to be an ABSOLUTE URL:
 * `ExportResponse.download_url` is a server-relative `/uploads/{file}`, and the
 * frontend is served from a different origin in development.
 *
 * Three cases, in order:
 *
 *   1. `VITE_API_URL` set — the deployed split, where the UI is a static site
 *      on one origin and the API is a web service on another. Baked in at
 *      build time by Vite, so it must be set on the *static site*, not on the
 *      API service.
 *   2. A development host — the API is a separate uvicorn on :8000 of the same
 *      machine. This is what makes the two-device LAN demo work with no
 *      rebuild: the phone derives the laptop's IP from the page it loaded.
 *   3. Anything else — same origin. This is the unified Docker/`SERVE_FRONTEND=1`
 *      deployment, where one FastAPI process serves both the SPA and the API.
 *
 * Case 3 used to be case 2: the old fallback was an unconditional
 * `http://{hostname}:8000`, which on any hosted origin produced a cross-origin
 * plaintext request to a port nothing listens on — blocked as mixed content
 * before it was even refused. See D-113.
 */
export const getBaseUrl = () => {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) {
    const trimmed = configured.trim().replace(/\/+$/, '');
    // A bare hostname is accepted and assumed HTTPS. Render's Blueprint can
    // only interpolate another service's `host`, which has no scheme, so
    // `VITE_API_URL=navis-api.onrender.com` is what render.yaml actually
    // produces. Without this it would be read as a relative path and every
    // request would go to the static site instead of the API.
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }
  if (isDevelopmentHost(window.location.hostname)) {
    return `http://${window.location.hostname}:8000`;
  }
  return window.location.origin;
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

  importSchedule: (
    file: File,
    options?: { replace?: boolean; dry_run?: boolean; note?: string }
  ): Promise<BaselineImportResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.replace) formData.append('replace', 'true');
    if (options?.dry_run) formData.append('dry_run', 'true');
    if (options?.note) formData.append('note', options.note);
    return fetchWithHandler('/schedule/import', {
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
   * Executive intelligence suite: cumulative EVM S-Curve, FIDIC dispute risk in ₹ Cr,
   * critical path float drift, milestone health, and evidence coverage.
   */
  getExecutiveMetrics: (): Promise<ExecutiveMetricsResponse> => fetchWithHandler('/executive/metrics'),

  /** AI Schedule Feasibility & Knowledge Auditor ("Schedule Doctor") */
  getScheduleAudit: (): Promise<ScheduleAuditResponse> => fetchWithHandler('/schedule/audit'),

  /** Institutional Knowledge Base & Domain Rules */
  getKnowledgeRules: (): Promise<KnowledgeRulesResponse> => fetchWithHandler('/knowledge/rules'),
  addKnowledgeRule: (rule: KnowledgeRule): Promise<{ status: string; rule_id: string }> =>
    fetchWithHandler('/knowledge/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
      headers: { 'Content-Type': 'application/json' },
    }),

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

  askChat: (body: ChatRequest): Promise<ChatResponse> => {
    return fetchWithHandler('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  },

  // ── Workforce ───────────────────────────────────────────────────────────

  getCrews: (params?: { discipline?: string; on?: string }): Promise<Crew[]> => {
    const q = new URLSearchParams();
    if (params?.discipline) q.set('discipline', params.discipline);
    if (params?.on) q.set('on', params.on);
    const qs = q.toString();
    return fetchWithHandler(`/workforce/crews${qs ? `?${qs}` : ''}`);
  },

  markAttendance: (body: AttendanceMarkBody): Promise<AttendanceRow> => {
    return fetchWithHandler('/workforce/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  getAttendance: (params?: {
    start?: string;
    end?: string;
    crew_id?: string;
    include_superseded?: boolean;
  }): Promise<AttendanceRow[]> => {
    const q = new URLSearchParams();
    if (params?.start) q.set('start', params.start);
    if (params?.end) q.set('end', params.end);
    if (params?.crew_id) q.set('crew_id', params.crew_id);
    if (params?.include_superseded) q.set('include_superseded', 'true');
    const qs = q.toString();
    return fetchWithHandler(`/workforce/attendance${qs ? `?${qs}` : ''}`);
  },

  getAttendanceSummary: (params?: {
    start?: string;
    end?: string;
  }): Promise<AttendanceSummary> => {
    const q = new URLSearchParams();
    if (params?.start) q.set('start', params.start);
    if (params?.end) q.set('end', params.end);
    const qs = q.toString();
    return fetchWithHandler(`/workforce/attendance/summary${qs ? `?${qs}` : ''}`);
  },

  getManDayRate: (activityId: string): Promise<ManDayRate> =>
    fetchWithHandler(
      `/workforce/activity/${encodeURIComponent(activityId)}/man-day-rate`
    ),

  getShortfallEvidence: (
    activityId: string,
    windowDays?: number
  ): Promise<ShortfallEvidence> =>
    fetchWithHandler(
      `/workforce/activity/${encodeURIComponent(activityId)}/shortfall-evidence` +
        (windowDays ? `?window_days=${windowDays}` : '')
    ),

  getAssignments: (params?: {
    status?: string;
    crew_id?: string;
    activity_id?: string;
  }): Promise<ResourceAssignment[]> => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.crew_id) q.set('crew_id', params.crew_id);
    if (params?.activity_id) q.set('activity_id', params.activity_id);
    const qs = q.toString();
    return fetchWithHandler(`/workforce/assignments${qs ? `?${qs}` : ''}`);
  },

  /**
   * Always creates a PROPOSAL. There is no way to ask for a commitment here —
   * the server's request model has no status field, which is what makes
   * "a supervisor cannot change the plan" structural rather than a role check.
   */
  proposeAssignment: (body: {
    crew_id: string;
    activity_id: string;
    from_date: string;
    to_date: string;
    allocated_strength: number;
    note?: string | null;
    requested_by?: string | null;
  }): Promise<ResourceAssignment> => {
    return fetchWithHandler('/workforce/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  /** The only path that commits. Project Manager only. */
  decideAssignment: (
    assignmentId: string,
    body: {
      decision: 'commit' | 'withdraw';
      note?: string | null;
      decided_by?: string;
      allocated_strength?: number | null;
    }
  ): Promise<ResourceAssignment> => {
    return fetchWithHandler(
      `/workforce/assignments/${encodeURIComponent(assignmentId)}/decide`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
  },

  getCapacity: (params?: {
    start?: string;
    end?: string;
    discipline?: string;
  }): Promise<CrewCapacity[]> => {
    const q = new URLSearchParams();
    if (params?.start) q.set('start', params.start);
    if (params?.end) q.set('end', params.end);
    if (params?.discipline) q.set('discipline', params.discipline);
    const qs = q.toString();
    return fetchWithHandler(`/workforce/capacity${qs ? `?${qs}` : ''}`);
  },

  getAllocationBoard: (params?: {
    week_start?: string;
    weeks?: number;
  }): Promise<AllocationBoard> => {
    const q = new URLSearchParams();
    if (params?.week_start) q.set('week_start', params.week_start);
    if (params?.weeks) q.set('weeks', String(params.weeks));
    const qs = q.toString();
    return fetchWithHandler(`/workforce/allocation-board${qs ? `?${qs}` : ''}`);
  },

  // ── Connectivity ────────────────────────────────────────────────────────

  sendHeartbeat: (body: HeartbeatBody): Promise<DeviceView> => {
    return fetchWithHandler('/connectivity/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  getLinkHealth: (): Promise<LinkHealth> =>
    fetchWithHandler('/connectivity/link-health'),

  getReportingLag: (days?: number): Promise<ReportingLag> =>
    fetchWithHandler(`/connectivity/reporting-lag${days ? `?days=${days}` : ''}`),

  getCaptureCoverage: (on?: string): Promise<CaptureCoverage> =>
    fetchWithHandler(`/connectivity/capture-coverage${on ? `?on=${on}` : ''}`),
};
