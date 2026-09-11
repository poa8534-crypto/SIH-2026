import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Home from '../pages/Home';
import { api } from '../lib/api';
import type { ScheduleResponse, ReviewItem, AuditFeedItem, JobSummary, SourceConflict } from '../types';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const MOCK_SCHEDULE: ScheduleResponse = {
  project: 'Oil India Limited — Well Pad 04',
  data_date: '2026-09-15',
  baseline: {
    name: 'Rev-08',
    filename: 'oil_pad4_baseline_rev08.xer',
    sha256: '9b4a2489c7d1e8',
    activity_count: 120,
    source_format: 'XER',
    source: 'Primavera P6',
    imported_at: '2026-09-01T00:00:00Z',
  },
  total_activities: 120,
  activities_with_actuals: 67,
  activities_completed: 38,
  critical_activities: 8,
  average_start_variance: -1.2,
  average_finish_variance: 4.8,
  integrity_warnings: [],
  activities: [
    {
      activity_id: 'CIV-FDN-1014',
      wbs_path: '1.2',
      wbs_level: 4,
      description: 'Piling & Substructure Foundation',
      discipline: 'civil',
      tag: null,
      calendar: '7-Day',
      planned_start: '2026-01-15',
      planned_finish: '2026-02-18',
      planned_qty: 24,
      uom: 'nos',
      actual_start: '2026-01-15',
      actual_finish: '2026-02-18',
      actual_start_basis: 'EXPLICIT',
      actual_finish_basis: 'EXPLICIT',
      actual_qty: 24,
      start_variance_days: 0,
      finish_variance_days: 0,
      percent_complete: 100,
      predecessors: [],
      predecessor_links: [],
      link_confidence: 1.0,
      total_float: 0,
      critical: true,
    },
    {
      activity_id: 'ELE-LTG-1088',
      wbs_path: '3.1',
      wbs_level: 4,
      description: 'Area Lighting Installation',
      discipline: 'electrical',
      tag: null,
      calendar: '7-Day',
      planned_start: '2026-03-01',
      planned_finish: '2026-03-24',
      planned_qty: 12,
      uom: 'poles',
      actual_start: '2026-03-01',
      actual_finish: null,
      actual_start_basis: 'EXPLICIT',
      actual_finish_basis: null,
      actual_qty: 5,
      start_variance_days: 0,
      finish_variance_days: null,
      percent_complete: 41,
      predecessors: [],
      predecessor_links: [],
      link_confidence: 0.41,
      total_float: -6,
      critical: true,
    },
    {
      activity_id: 'PIP-ERC-1032',
      wbs_path: '2.1',
      wbs_level: 4,
      description: 'Spool Erection P-1003-A1B',
      discipline: 'piping',
      tag: null,
      calendar: '7-Day',
      planned_start: '2026-03-05',
      planned_finish: '2026-03-28',
      planned_qty: 30,
      uom: 'spools',
      actual_start: '2026-03-05',
      actual_finish: null,
      actual_start_basis: 'EXPLICIT',
      actual_finish_basis: null,
      actual_qty: 12,
      start_variance_days: 0,
      finish_variance_days: null,
      percent_complete: 40,
      predecessors: [],
      predecessor_links: [],
      link_confidence: 0.41,
      total_float: -4,
      critical: false,
    },
  ],
};

const MOCK_QUEUE: ReviewItem[] = [
  {
    id: 'item-1',
    linked_event_id: 'evt-1',
    activity_id: 'ELE-LTG-1088',
    reason: 'Low lexical score against Rev-08 scope',
    priority: 'high',
    status: 'pending',
    source_span: null,
    confidence: 0.41,
    tags: ['lighting', 'electrical'],
    suggested_activity_id: 'ELE-LTG-1088',
    raw_text: 'Area Lighting mast poles 5 of 12 erected on East boundary',
    alternatives: [],
    created_at: '2026-09-14T10:00:00Z',
  },
  {
    id: 'item-2',
    linked_event_id: 'evt-2',
    activity_id: 'PIP-ERC-1032',
    reason: 'Ambiguous manifold tie-in identification',
    priority: 'normal',
    status: 'pending',
    source_span: null,
    confidence: 0.41,
    tags: ['piping', 'spool'],
    suggested_activity_id: 'PIP-ERC-1032',
    raw_text: 'Spool P-1003 aligned with manifold flange',
    alternatives: [],
    created_at: '2026-09-14T10:00:00Z',
  },
];

const MOCK_AUDIT: AuditFeedItem[] = [
  {
    id: 'audit-1',
    activity_id: 'PIP-SUP-1049',
    field_changed: 'linked_event_confirmed',
    old_value: null,
    new_value: 'Tier 1 Pipe Support actual confirmed',
    source: 'planner_review',
    source_file: 'dpr_day_03.txt',
    source_line: 14,
    source_row: null,
    confidence: 0.98,
    auto_applied: false,
    conflict: false,
    timestamp: new Date(Date.now() - 120000).toISOString(), // 2m ago
  },
  {
    id: 'audit-2',
    activity_id: 'CIV-DWG-1015',
    field_changed: 'actual_start',
    old_value: null,
    new_value: '2026-09-10',
    source: 'matching',
    source_file: 'dpr_day_02.txt',
    source_line: 5,
    source_row: null,
    confidence: 0.96,
    auto_applied: true,
    conflict: false,
    timestamp: new Date(Date.now() - 240000).toISOString(), // 4m ago
  },
];

const MOCK_JOBS: JobSummary[] = [
  {
    id: 'job-1',
    filename: 'piping_progress.xlsx',
    file_type: 'spreadsheet',
    status: 'completed',
    event_count: 24,
    linked_count: 22,
    review_count: 2,
    activities_updated: 22,
    audit_records_created: 22,
    error_message: null,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    completed_at: new Date(Date.now() - 3500000).toISOString(),
  },
  {
    id: 'job-2',
    filename: 'agent_session_559007f7-1975-4be8-9642-fe8c0678d9fa.wav',
    file_type: 'voice',
    status: 'completed',
    event_count: 1,
    linked_count: 1,
    review_count: 0,
    activities_updated: 1,
    audit_records_created: 1,
    error_message: null,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    completed_at: new Date(Date.now() - 7100000).toISOString(),
  },
];

const MOCK_CONFLICTS: SourceConflict[] = [
  {
    activity_id: 'PIP-SPL-1027',
    description: 'Header Spool Erection',
    discipline: 'piping',
    field: 'actual_finish',
    sides: [],
    stored_value: '2026-08-14',
    detected_at: '2026-09-14T10:00:00Z',
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getSchedule').mockResolvedValue(MOCK_SCHEDULE as never);
  vi.spyOn(api, 'getReviewQueue').mockResolvedValue(MOCK_QUEUE as never);
  vi.spyOn(api, 'getRecentAudit').mockResolvedValue(MOCK_AUDIT as never);
  vi.spyOn(api, 'listJobs').mockResolvedValue(MOCK_JOBS as never);
  vi.spyOn(api, 'getConflicts').mockResolvedValue(MOCK_CONFLICTS as never);
});

describe('Project Control Homepage — Information Architecture & Visual Clarity', () => {
  it('renders four project-control KPIs derived from the schedule response', async () => {
    wrap(<Home />);

    expect(await screen.findByText('Planned progress')).toBeInTheDocument();
    expect((await screen.findAllByText('100%')).length).toBeGreaterThan(0);

    expect(screen.getByText('Actual progress')).toBeInTheDocument();
    expect((await screen.findAllByText('33%')).length).toBeGreaterThan(0);

    expect(screen.getByText('Schedule variance')).toBeInTheDocument();
    expect(await screen.findByText('-67%')).toBeInTheDocument();
    expect(await screen.findByText(/▼ 67% BEHIND/i)).toBeInTheDocument();

    expect(screen.getByText('At-risk activities')).toBeInTheDocument();
    expect(await screen.findByText('8')).toBeInTheDocument();
  });

  it('renders the grounded plan-versus-verified completion visual and methodology', async () => {
    wrap(<Home />);

    expect(await screen.findByText(/Activity completion \(plan vs verified\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Activities due by the data date/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Activities verified complete/i).length).toBeGreaterThan(0);
    expect(await screen.findByText(/67% BEHIND PLAN/i)).toBeInTheDocument();
    expect(await screen.findByText(/not a financial earned-value measure/i)).toBeInTheDocument();
    expect(screen.queryByText(/SPI 0.91/i)).not.toBeInTheDocument();
  });

  it('shows latest verified activity from the audit feed without a fabricated live claim', async () => {
    wrap(<Home />);

    expect(await screen.findByText(/Recent changes/i)).toBeInTheDocument();
    expect((await screen.findAllByText('PIP-SUP-1049')).length).toBeGreaterThan(0);
    expect(await screen.findByText(/approved by you/i)).toBeInTheDocument();
    expect(screen.queryByText(/Committed Just Now/i)).not.toBeInTheDocument();
  });

  it('uses the runtime baseline and does not render the removed seeded milestone story', async () => {
    wrap(<Home />);

    expect(await screen.findByText('Rev-08')).toBeInTheDocument();
    expect(screen.queryByText('M-01')).not.toBeInTheDocument();
    expect(screen.queryByText(/Committed Just Now/i)).not.toBeInTheDocument();
  });

  it('renders compact operational review queue without bloated text blocks', async () => {
    wrap(<Home />);

    expect(await screen.findByText(/Needs your attention/i)).toBeInTheDocument();
    expect(await screen.findByText('ELE-LTG-1088')).toBeInTheDocument();
    expect(screen.getByText('Area Lighting Installation')).toBeInTheDocument();
    expect(screen.getByText('PIP-ERC-1032')).toBeInTheDocument();

    // Compact single-line actions
    const reviewLinks = screen.getAllByRole('link', { name: /Review →/i });
    expect(reviewLinks.length).toBeGreaterThanOrEqual(2);

    // Footer link
    expect(screen.getByText(/View all 2 pending reviews →/i)).toBeInTheDocument();
  });

  it('cleans recent changes feed and strips raw developer UUIDs', async () => {
    wrap(<Home />);

    expect(await screen.findByText(/Recent changes/i)).toBeInTheDocument();
    expect(await screen.findByText(/PIP-SUP-1049/i)).toBeInTheDocument();
    expect(screen.getByText(/approved by you/i)).toBeInTheDocument();
    expect(screen.getByText(/CIV-DWG-1015/i)).toBeInTheDocument();

    // Checks that raw UUID was sanitized into human-readable label
    expect(screen.queryByText(/agent_session_559007f7/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Site Voice Dictation Note/i)).toBeInTheDocument();
  });

  it('renders compact Source Conflicts alert card and discipline table with Activity Completion', async () => {
    wrap(<Home />);

    // Compact conflict alert banner
    expect(await screen.findByText(/Source Conflicts Require Reconciliation/i)).toBeInTheDocument();
    expect(screen.getByText(/4 Critical Path/i)).toBeInTheDocument();
    expect(screen.getByText(/Review Conflicts →/i)).toBeInTheDocument();

    // Discipline table with rigorous "Activity Completion" column
    expect(await screen.findByText('Discipline Work Packages')).toBeInTheDocument();
    expect(screen.getByText(/Activity completion is the share of schedule activities/i)).toBeInTheDocument();
  });
});
