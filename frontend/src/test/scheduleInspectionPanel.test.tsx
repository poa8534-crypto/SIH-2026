import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Schedule from '../pages/Schedule';
import { api } from '../lib/api';
import type { ScheduleActivity, AuditRecord, QuantityLedger, ActivityProductivity } from '../types';

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

const MOCK_ACTIVITY_1: ScheduleActivity = {
  activity_id: 'PIP-SUP-1049',
  wbs_path: '2.4.1',
  wbs_level: 5,
  description: 'Pipe Support Installation — Tier 1',
  discipline: 'piping',
  tag: null,
  calendar: '7-Day',
  planned_start: '2026-08-10',
  planned_finish: '2026-08-25',
  planned_qty: 145,
  uom: 'nos',
  actual_start: '2026-08-10',
  actual_finish: '2026-08-25',
  actual_start_basis: 'EXPLICIT',
  actual_finish_basis: 'DEFAULTED_TO_REPORT_DATE',
  actual_qty: 98,
  start_variance_days: 0,
  finish_variance_days: 0,
  percent_complete: 67.6,
  predecessors: ['PIP-SKN-1051'],
  predecessor_links: [{ activity_id: 'PIP-SKN-1051', rel: 'FS', lag_days: 0 }],
  link_confidence: 0.98,
  total_float: 0,
  critical: true,
};

const MOCK_ACTIVITY_2: ScheduleActivity = {
  activity_id: 'PIP-SUP-1050',
  wbs_path: '2.4.1',
  wbs_level: 5,
  description: 'Pipe Support Installation — Tier 2',
  discipline: 'piping',
  tag: null,
  calendar: '7-Day',
  planned_start: '2026-08-15',
  planned_finish: '2026-08-28',
  planned_qty: 145,
  uom: 'nos',
  actual_start: null,
  actual_finish: null,
  actual_start_basis: null,
  actual_finish_basis: null,
  actual_qty: null,
  start_variance_days: null,
  finish_variance_days: null,
  percent_complete: 0,
  predecessors: ['PIP-SUP-1049'],
  predecessor_links: [{ activity_id: 'PIP-SUP-1049', rel: 'FS', lag_days: 0 }],
  link_confidence: null,
  total_float: 2,
  critical: false,
};

const MOCK_AUDIT: AuditRecord[] = [
  {
    id: 'audit-1',
    activity_id: 'PIP-SUP-1049',
    linked_event_id: 'evt-41665106',
    timestamp: '2026-09-05T07:31:49Z',
    field_changed: 'source_conflict',
    old_value: null,
    new_value:
      "finish asserted, but the evidence accounts for only 67.6% of the node's planned quantity (145 nos) — Actual Finish withheld, scope is partial",
    source: 'matching',
    source_file: 'dpr_day_03.txt',
    source_line: 14,
    source_row: null,
    source_span:
      'Pipe support installation Tier 1: 98 out of 145 supports done. Grinding marks on some supports to be rectified.',
    confidence: 1.0,
    model_version: 'gpt-4o',
    auto_applied: false,
    contributing_sources: ['dpr_day_03.txt line 14', 'piping_progress.xlsx row 31'],
    conflict: true,
  },
  {
    id: 'audit-2',
    activity_id: 'PIP-SUP-1049',
    linked_event_id: 'evt-9b4a2489',
    timestamp: '2026-09-05T07:31:49Z',
    field_changed: 'actual_start',
    old_value: null,
    new_value: '2026-08-11',
    source: 'matching',
    source_file: 'dpr_day_03.txt',
    source_line: 14,
    source_row: null,
    source_span: 'Pipe support installation Tier 1 started',
    confidence: 1.0,
    model_version: 'gpt-4o',
    auto_applied: true,
    contributing_sources: ['dpr_day_03.txt', 'piping_progress.xlsx row 31'],
    conflict: false,
  },
];

const MOCK_LEDGER: QuantityLedger = {
  activity_id: 'PIP-SUP-1049',
  description: 'Pipe Support Installation — Tier 1',
  discipline: 'piping',
  uom: 'nos',
  planned_qty: 145,
  counted_total: 98,
  naive_sum_all_jobs: 98,
  reported_by_jobs: 1,
  stored_actual_qty: 98,
  totals_agree: true,
  stored_total_basis: 'counted_readings',
  percent_complete_from_quantity: 67.6,
  raw_percent_from_quantity: 67.6,
  counted_events: 1,
  refused_events: 0,
  events_without_quantity: 0,
  total_note: 'counted_total is the largest accumulation from any single ingest.',
  refusal_note: 'A refused reading is a decision, not a gap: the roll-up declined to count it.',
  contributions: [
    {
      linked_event_id: 'evt-41665106',
      job_id: 'job-1',
      reported_date: '2026-08-11',
      quantity: 98,
      uom: 'nos',
      percentage: null,
      counted_quantity: 98,
      counted: true,
      reason_code: 'counted',
      reason: '+98 nos',
      source_file: 'dpr_day_03.txt',
      source_line: 14,
      source_row: null,
      source_span: 'Pipe support installation Tier 1: 98 out of 145 supports done.',
      raw_text: 'Pipe support installation Tier 1: 98 out of 145 supports done.',
      confidence: 1.0,
      reviewed: true,
    },
  ],
};

const MOCK_PRODUCTIVITY: ActivityProductivity = {
  activity_id: 'PIP-SUP-1049',
  description: 'Pipe Support Installation — Tier 1',
  discipline: 'piping',
  uom: 'nos',
  planned_qty: 145,
  counted_qty: 98,
  percent_complete: 67.6,
  percent_complete_source: 'installed_quantity',
  remaining_qty: 47,
  actual_start: '2026-08-10',
  actual_finish: '2026-08-25',
  as_of: '2026-09-15',
  reported_days: 15,
  rates: [
    {
      basis: 'planned',
      value: 9.67,
      days: 15,
      quantity: 145,
      sample_size: 1,
      note: 'planned quantity over planned duration',
    },
    {
      basis: 'observed_elapsed',
      value: 6.53,
      days: 15,
      quantity: 98,
      sample_size: 1,
      note: 'measured quantity over calendar days',
    },
    {
      basis: 'observed_reported',
      value: 6.53,
      days: 15,
      quantity: 98,
      sample_size: 1,
      note: 'measured quantity over active report days',
    },
  ],
  comparables: {
    activity_type: 'PIP-SUP',
    count: 2,
    members: ['PIP-SUP-1049', 'PIP-SUP-1050'],
    median_qty_per_day: 7.2,
    mean_qty_per_day: 7.2,
    enough: true,
    note: '2 completed PIP-SUP activities in baseline.',
  },
  calendar_basis: '7-day working calendar',
  basis_note: 'Three rates, and none of them is the productivity.',
  baseline_finish: '2026-08-25',
  forecast: {
    basis: 'observed_elapsed',
    rate: 6.53,
    remaining_days: 7,
    forecast_finish: '2026-09-01',
    baseline_finish: '2026-08-25',
    variance_days: 7,
    sample_size: 1,
    why: 'observed over calendar days since Actual Start',
  },
  candidates: [],
  reason: null,
  evidence: {
    readings_counted: 1,
    reported_days: 15,
    measured_quantity: 98,
    uom: 'nos',
    comparable_activities: 2,
  },
  forecast_note: 'A forecast is a projection and is never written to the schedule.',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getSchedule').mockResolvedValue({
    project: 'OIL Well-Site Duliajan',
    data_date: '2026-09-15',
    total_activities: 2,
    activities_with_actuals: 1,
    activities_completed: 1,
    critical_activities: 1,
    average_start_variance: 0,
    average_finish_variance: 0,
    baseline: {
      name: 'Rev-08',
      filename: 'oil_pad4_baseline_rev08.xer',
      sha256: '9b4a2489c7d1e8',
      activity_count: 2,
      source_format: 'XER',
      source: 'Primavera P6',
      imported_at: '2026-09-01T00:00:00Z',
    },
    activities: [MOCK_ACTIVITY_1, MOCK_ACTIVITY_2],
    integrity_warnings: [],
  } as never);
  vi.spyOn(api, 'getActivityAudit').mockImplementation(async (id) =>
    id === 'PIP-SUP-1049' ? (MOCK_AUDIT as never) : ([] as never)
  );
  vi.spyOn(api, 'getQuantityLedger').mockResolvedValue(MOCK_LEDGER as never);
  vi.spyOn(api, 'getActivityProductivity').mockResolvedValue(MOCK_PRODUCTIVITY as never);
});

describe('Schedule Activity Inspection Panel & Evidence Dossier Integration', () => {
  it('opens the inspection panel with header, status badge, and AI understanding', async () => {
    wrap(<Schedule />);
    const row = await screen.findByText('Pipe Support Installation — Tier 1');
    fireEvent.click(row);

    // Header checks
    expect(await screen.findByText(/Activity Inspection Panel/i)).toBeInTheDocument();
    expect(screen.getAllByText('PIP-SUP-1049').length).toBeGreaterThan(0);
    expect(screen.getByText(/CONFLICT DETECTED/i)).toBeInTheDocument();

    // Natural Language Verification card checks
    expect(screen.getByText(/Natural Language Verification/i)).toBeInTheDocument();
    expect(screen.getByText(/98% CONF/i)).toBeInTheDocument();
    expect(screen.getAllByText(/J\. Gogoi \(Lead Piping\)/i).length).toBeGreaterThan(0);
    const supervisorQuotes = await screen.findAllByText(
      /Pipe support installation Tier 1: 98 out of 145 supports done/i
    );
    expect(supervisorQuotes.length).toBeGreaterThan(0);

    // AI diagnostic check
    const diagElements = await screen.findAllByText(/Actual Finish withheld, scope is partial/i);
    expect(diagElements.length).toBeGreaterThan(0);
  });

  it('renders Evidence & Verification Dossier with all three tabs', async () => {
    wrap(<Schedule />);
    fireEvent.click(await screen.findByText('Pipe Support Installation — Tier 1'));

    expect(await screen.findByText(/EVIDENCE & VERIFICATION DOSSIER/i)).toBeInTheDocument();
    expect(screen.getByText(/3 SOURCES SYNCED/i)).toBeInTheDocument();

    // Tabs exist
    const voiceTab = screen.getByRole('button', { name: /Voice Note/i });
    const excelTab = screen.getByRole('button', { name: /Excel Log/i });
    const diaryTab = screen.getByRole('button', { name: /Site Diary/i });
    expect(voiceTab).toBeInTheDocument();
    expect(excelTab).toBeInTheDocument();
    expect(diaryTab).toBeInTheDocument();

    // Default tab: Voice Note details
    expect(screen.getByText(/FIELD MOBILE VOICE NOTE & DICTATION/i)).toBeInTheDocument();
    expect(screen.getByText(/Pad-04 Separator Area/i)).toBeInTheDocument();
    expect(screen.getByText(/Whisper V3/i)).toBeInTheDocument();
    expect(screen.getByText(/CAT S62 Pro/i)).toBeInTheDocument();

    // Switch to Excel Log tab
    fireEvent.click(excelTab);
    expect(screen.getByText(/EXCEL SPREADSHEET LOG/i)).toBeInTheDocument();
    expect(screen.getAllByText(/piping_progress\.xlsx/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/View Sheet Excerpt/i)).toBeInTheDocument();

    // Switch to Site Diary tab
    fireEvent.click(diaryTab);
    expect(screen.getByText(/SITE DAILY DIARY REPORT/i)).toBeInTheDocument();
    expect(screen.getAllByText(/dpr_day_03\.txt/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/DFR-VERIFIED/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Line 14/i).length).toBeGreaterThan(0);
  });

  it('toggles audio waveform playback state on play/pause click', async () => {
    wrap(<Schedule />);
    fireEvent.click(await screen.findByText('Pipe Support Installation — Tier 1'));

    const playBtn = await screen.findByTitle(/Play audio dictation/i);
    expect(playBtn).toBeInTheDocument();
    expect(screen.getByText('0:18 / 0:42')).toBeInTheDocument();

    // Click play
    fireEvent.click(playBtn);
    expect(await screen.findByTitle(/Pause audio/i)).toBeInTheDocument();
    expect(screen.getByText('0:26 / 0:42')).toBeInTheDocument();

    // Click pause
    fireEvent.click(screen.getByTitle(/Pause audio/i));
    expect(await screen.findByTitle(/Play audio dictation/i)).toBeInTheDocument();
  });

  it('navigates to next activity via stepper buttons', async () => {
    wrap(<Schedule />);
    fireEvent.click(await screen.findByText('Pipe Support Installation — Tier 1'));

    expect(await screen.findByText(/1\/2/i)).toBeInTheDocument();
    const nextBtn = screen.getByLabelText('Next Activity');
    expect(nextBtn).toBeEnabled();

    // Step to PIP-SUP-1050
    fireEvent.click(nextBtn);
    expect(await screen.findByText(/2\/2/i)).toBeInTheDocument();
    expect(screen.getAllByText('PIP-SUP-1050').length).toBeGreaterThan(0);
    expect(await screen.findByText(/PLANNED BASELINE/i)).toBeInTheDocument();
  });

  it('triggers PM Single-Click Action Protocol decisions', async () => {
    wrap(<Schedule />);
    fireEvent.click(await screen.findByText('Pipe Support Installation — Tier 1'));

    const acceptBtn = await screen.findByRole('button', { name: /Accept Field Actual/i });
    const flagBtn = screen.getByRole('button', { name: /Flag Conflict/i });
    const overrideBtn = screen.getByRole('button', { name: /Keep Baseline/i });

    expect(acceptBtn).toBeInTheDocument();
    expect(flagBtn).toBeInTheDocument();
    expect(overrideBtn).toBeInTheDocument();

    // Test Accept Field Actual
    fireEvent.click(acceptBtn);
    expect(await screen.findByText(/Actuals verified and confirmed in project ledger/i)).toBeInTheDocument();

    // Test Flag Conflict
    fireEvent.click(flagBtn);
    expect(await screen.findByText(/Flagged for contractual dispute & delay attribution review/i)).toBeInTheDocument();

    // Test Override Baseline
    fireEvent.click(overrideBtn);
    expect(await screen.findByText(/Baseline target locked; field variance quarantined/i)).toBeInTheDocument();
  });

  it('supports closing the panel via Escape key and Close button', async () => {
    wrap(<Schedule />);
    fireEvent.click(await screen.findByText('Pipe Support Installation — Tier 1'));

    expect(await screen.findByText(/Activity Inspection Panel/i)).toBeInTheDocument();

    // Close with close button
    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);
    expect(screen.queryByText(/Activity Inspection Panel/i)).not.toBeInTheDocument();

    // Reopen and close with Escape key
    fireEvent.click(await screen.findByText('Pipe Support Installation — Tier 1'));
    expect(await screen.findByText(/Activity Inspection Panel/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText(/Activity Inspection Panel/i)).not.toBeInTheDocument();
  });
});
