import {
  AgentTurnRequest,
  IngestResponse,
  JobResponse,
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

const getBaseUrl = () => {
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

  getSchedule: (discipline?: string, includeWarnings: boolean = true): Promise<ScheduleResponse> => {
    const params = new URLSearchParams();
    if (discipline) params.append('discipline', discipline);
    params.append('include_warnings', String(includeWarnings));
    return fetchWithHandler(`/schedule?${params.toString()}`);
  },

  queryMemory: (params: Record<string, string>): Promise<any> => {
    const searchParams = new URLSearchParams(params);
    return fetchWithHandler(`/memory/query?${searchParams.toString()}`);
  },

  agentTurn: (body: AgentTurnRequest): Promise<any> => {
    return fetchWithHandler('/agent/turn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  },
};
