import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ExecutiveMilestones from '../pages/executive/Milestones';
import ExecutiveProgress from '../pages/executive/Progress';
import ExecutiveRisksDelays from '../pages/executive/RisksDelays';
import ExecutiveForecasts from '../pages/executive/Forecasts';
import ExecutiveExecutionInsights from '../pages/executive/ExecutionInsights';
import ExecutiveManagementReports from '../pages/executive/ManagementReports';
import ExecutiveDataConfidence from '../pages/executive/DataConfidence';

import { api } from '../lib/api';
import type {
  ExecutiveMetricsResponse,
  ScheduleResponse,
  RaidItem,
  DelayAttribution,
  DelayEvent,
  SourceConflict,
  EvidenceCorpus,
  EvmResponse,
  MemoryQueryResponse,
} from '../types';

const BASE_METRICS: ExecutiveMetricsResponse = {
  as_of: '2026-09-15',
  kpis: {
    spi: 0.4984,
    spi_band: 'Behind',
    pv_total: 1284.6,
    ev_total: 640.4,
    float_drift_days: 14,
    critical_activities_count: 31,
    evidence_coverage_pct: 64.2,
    total_activities: 120,
    evidenced_activities: 77,
    unevidenced_activities: 43,
  },
  dispute_shield: {
    employer_delay_days: 0,
    contractor_delay_days: 1,
    neutral_delay_days: 1,
    contested_delay_days: 41,
    employer_beyond_float_days: 0,
    contractor_beyond_float_days: 1,
    concurrent_pairs: 1,
    concurrent_conflicts: 0,
    adjudicated_days: { COMPENSABLE: 0, NON_COMPENSABLE: 0, EXCUSABLE: 0, CONTESTED: 0 },
    adjudicated_beyond_float_days: { COMPENSABLE: 0, NON_COMPENSABLE: 0, EXCUSABLE: 0, CONTESTED: 0 },
    adjudicated_events: 0,
    total_events: 4,
    notice_compliance_pct: 50.0,
    notice_served_count: 0,
    notice_open_count: 2,
    notice_lapsed_count: 2,
    notice_unknown_count: 0,
    notice_note: 'Notice windows are 28 days from the date the delay was evidenced.',
    impact_days_basis: 'Each activity’s whole finish slip is credited to every cause.',
    unadjudicated_note: 'Rows without a planner ruling are proposals.',
  },
  financial: {
    available: false,
    reason: 'No contract value was supplied, so no financial exposure is computed.',
    basis: null,
    contract_value_cr: null,
    prolongation_lakhs_per_day: null,
    employer_claim_cr: null,
    contractor_ld_risk_cr: null,
    ld_pct_per_week: 0.5,
    ld_cap_pct: 10.0,
    note: null,
  },
  completion_forecast: {
    baseline_finish: '2026-09-28',
    logic_finish: '2026-10-12',
    exposed_finish: '2026-10-12',
    current_forecast_finish: '2026-10-12',
    variance_days: 14,
    open_critical_exposure_days: 0,
    is_probabilistic: false,
    logic_conflicts: 27,
    logic_conflicts_note: "27 of the baseline's logic ties are broken by its own authored dates.",
    basis: 'Three computed dates, not percentiles.',
  },
  s_curve: [
    { date: '2026-07-09', week_label: 'W07', pv_cumulative: 11.6, ev_cumulative: 3.3, ev_projected: 3.3, is_future: false },
    { date: '2026-08-20', week_label: 'W13', pv_cumulative: 65.1, ev_cumulative: 19.0, ev_projected: 19.0, is_future: false },
    { date: '2026-10-01', week_label: 'W19', pv_cumulative: 100.0, ev_cumulative: null, ev_projected: 34.8, is_future: true },
  ],
  ev_basis: 'A percentage of planned duration, on a 0/100 rule.',
  critical_drivers: [
    {
      activity_id: 'CIV-PLY-1004',
      description: 'Piling — Rig Pad',
      discipline: 'civil',
      planned_finish: '2026-06-20',
      actual_finish: '2026-06-21',
      finish_variance_days: 1,
      driving_delay: 'piling rig breakdown',
      driving_delay_category: 'EQUIPMENT_BREAKDOWN',
      driving_delay_liability: 'NON_COMPENSABLE',
      driving_delay_adjudicated: false,
      driving_delay_source: 'civil_progress.xlsx',
      critical: true,
    },
  ],
  critical_drivers_note: 'Null means no cause is recorded.',
  milestones: [
    {
      name: 'Civil scope complete',
      activity_id: 'CIV-FEN-1019',
      activity_description: 'Fence & Gate — Plot Boundary',
      derived: true,
      derivation: 'last planned finish in this discipline',
      baseline_date: '2026-08-18',
      forecast_date: '2026-09-02',
      basis: 'actual_finish',
      variance_days: 15,
      status: 'COMPLETE',
    },
    {
      name: 'Project finish',
      activity_id: null,
      activity_description: null,
      derived: true,
      derivation: 'latest finish across the network',
      baseline_date: '2026-09-28',
      forecast_date: '2026-10-12',
      basis: 'cpm_project_finish',
      variance_days: 14,
      status: 'CRITICAL',
    },
  ],
  milestones_note: 'The baseline carries no milestone flag, so these are derived.',
};

const BASE_SCHEDULE: ScheduleResponse = {
  project: 'OIL Well-Site Duliajan',
  data_date: '2026-09-15',
  baseline: null,
  total_activities: 120,
  activities_with_actuals: 77,
  activities_completed: 40,
  critical_activities: 12,
  average_start_variance: 0,
  average_finish_variance: 14,
  integrity_warnings: [],
  activities: [
    {
      activity_id: 'CIV-PLY-1004',
      description: 'Piling — Rig Pad',
      discipline: 'civil',
      wbs_path: 'Civil > Piling',
      wbs_level: 5,
      tag: null,
      calendar: '6-day',
      planned_start: '2026-06-01',
      planned_finish: '2026-06-21',
      planned_qty: 40,
      uom: 'piles',
      actual_start: '2026-06-01',
      actual_finish: '2026-06-21',
      actual_start_basis: 'EXPLICIT',
      actual_finish_basis: 'EXPLICIT',
      actual_qty: 40,
      start_variance_days: 0,
      finish_variance_days: 1,
      percent_complete: 100,
      predecessors: [],
      predecessor_links: [],
      link_confidence: 0.95,
      critical: true,
      total_float: 0,
    },
    {
      activity_id: 'CIV-FEN-1019',
      description: 'Fence & Gate — Plot Boundary',
      discipline: 'civil',
      wbs_path: 'Civil > Fencing',
      wbs_level: 5,
      tag: null,
      calendar: '6-day',
      planned_start: '2026-08-01',
      planned_finish: '2026-09-02',
      planned_qty: 500,
      uom: 'm',
      actual_start: '2026-08-01',
      actual_finish: '2026-09-02',
      actual_start_basis: 'EXPLICIT',
      actual_finish_basis: 'EXPLICIT',
      actual_qty: 325,
      start_variance_days: 0,
      finish_variance_days: 15,
      percent_complete: 65,
      predecessors: ['CIV-PLY-1004'],
      predecessor_links: [],
      link_confidence: 0.9,
      critical: false,
      total_float: 15,
    },
    {
      activity_id: 'PIP-SPL-2001',
      description: 'Piping Spool Erection Area A',
      discipline: 'piping',
      wbs_path: 'Mechanical > Piping',
      wbs_level: 5,
      tag: null,
      calendar: '6-day',
      planned_start: '2026-09-05',
      planned_finish: '2026-10-10',
      planned_qty: 120,
      uom: 'spools',
      actual_start: '2026-09-05',
      actual_finish: null,
      actual_start_basis: 'EXPLICIT',
      actual_finish_basis: null,
      actual_qty: 24,
      start_variance_days: 0,
      finish_variance_days: null,
      percent_complete: 20,
      predecessors: ['CIV-PLY-1004'],
      predecessor_links: [],
      link_confidence: 0.85,
      critical: true,
      total_float: 0,
    },
  ],
};

const BASE_RAID: RaidItem[] = [
  {
    id: 'RAID-001',
    kind: 'risk',
    title: 'Monsoon Flooding Risk on Access Road',
    description: 'Heavy rainfall predicted in Duliajan area may impede material transport.',
    category: 'WEATHER',
    status: 'OPEN',
    owner: 'Site Logistics Lead',
    due_date: '2026-10-01',
    date_raised: '2026-09-01',
    date_closed: null,
    probability: 0.7,
    impact_days: 10,
    exposure: 7.0,
    linked_activity_ids: ['CIV-PLY-1004'],
    created_at: '2026-09-01T00:00:00Z',
    source_kind: 'USER',
  },
];

const DELAY_ABSORBED: DelayEvent = {
  id: 'de-1',
  activity_id: 'CIV-DWG-1015',
  phrase: 'fencing conflict',
  category: 'OTHER',
  liability_proposed: 'CONTESTED',
  liability_final: null,
  liability_effective: 'CONTESTED',
  adjudicated: false,
  adjudication_note: null,
  inferred_by: 'rules',
  confidence: 0.9,
  discipline: 'civil',
  month: '2026-09',
  impact_days: 21,
  activity_total_float: 100,
  float_consumed_days: 21,
  beyond_float_days: 0,
  on_critical_path: false,
  evidenced_on: '2026-09-02',
  evidenced_basis: 'REPORTED',
  notice_due_on: '2026-09-30',
  notice_status: 'OPEN',
  notice_days_remaining: 15,
  notice_served_on: null,
  notice_reference: null,
  audit_record_id: 'ar-1',
  source_file: 'civil_progress.xlsx',
  source_line: null,
  source_row: 18,
  source_span: 'Drainage Channels — Delayed by fencing conflict',
};

const DELAY_CRITICAL: DelayEvent = {
  ...DELAY_ABSORBED,
  id: 'de-2',
  activity_id: 'CIV-PLY-1004',
  phrase: 'piling rig breakdown',
  category: 'EQUIPMENT',
  liability_proposed: 'NON_COMPENSABLE',
  liability_effective: 'NON_COMPENSABLE',
  month: '2026-07',
  impact_days: 1,
  activity_total_float: 0,
  float_consumed_days: 0,
  beyond_float_days: 1,
  on_critical_path: true,
  evidenced_on: '2026-07-02',
  notice_due_on: '2026-07-30',
  notice_status: 'LAPSED',
  notice_days_remaining: -47,
  source_row: 7,
  source_span: 'Bored Piling — 1 day over, piling rig breakdown',
};

const BASE_DELAY_ATTRIBUTION: DelayAttribution = {
  events: [DELAY_ABSORBED, DELAY_CRITICAL],
  total_events: 2,
  adjudicated_events: 0,
  adjudicated_days: { COMPENSABLE: 0, NON_COMPENSABLE: 0, EXCUSABLE: 0, CONTESTED: 0 },
  proposed_days: { COMPENSABLE: 0, NON_COMPENSABLE: 1, EXCUSABLE: 0, CONTESTED: 21 },
  days_by_month: { '2026-07': 1, '2026-09': 21 },
  categories_present: ['EQUIPMENT', 'OTHER'],
  notice_window_days: 28,
  notice_counts: { SERVED: 0, OPEN: 1, LAPSED: 1, UNKNOWN: 0 },
  notice_lapsed_days: 1,
  notice_as_of: '2026-09-15',
  beyond_float_days: { COMPENSABLE: 0, NON_COMPENSABLE: 1, EXCUSABLE: 0, CONTESTED: 0 },
  adjudicated_beyond_float_days: { COMPENSABLE: 0, NON_COMPENSABLE: 0, EXCUSABLE: 0, CONTESTED: 0 },
  float_basis: 'Total float is computed from the baseline network.',
  network: {
    activities_scheduled: 120,
    critical_activities: 12,
    project_finish: '2026-10-12',
    authored_finish: '2026-09-28',
    logic_conflicts: 27,
    logic_matches_dates: false,
    unresolved_activities: [],
    dangling_predecessors: [],
    calendar_basis: '6-day',
  },
  concurrency: {
    pairs: [],
    total_pairs: 0,
    pairs_listed: 0,
    counts: {},
    beyond_float_pairs: 0,
    note: '',
  },
  impact_days_basis: 'Whole finish slip credited to cause.',
  unadjudicated_note: 'Proposals until ruled.',
  notice_note: '28-day notice window.',
  computed_at: '2026-09-15T00:00:00Z',
};

const BASE_CONFLICT: SourceConflict = {
  activity_id: 'CIV-PLY-1004',
  description: 'Piling — Rig Pad',
  discipline: 'civil',
  field: 'actual_finish',
  stored_value: '2026-06-21',
  detected_at: '2026-09-02T14:30:00Z',
  sides: [
    {
      source_file: 'civil_progress.xlsx',
      source_line: null,
      source_row: 7,
      value: '2026-06-21',
      source_kind: 'spreadsheet',
    },
    {
      source_file: 'daily_site_report_w25.pdf',
      source_line: 3,
      source_row: null,
      value: '2026-06-24',
      source_kind: 'daily_report',
    },
  ],
};

const BASE_CORPUS: EvidenceCorpus = {
  data_origin: 'OIL Well-Site Duliajan EPC Package',
  built_at_utc: '2026-09-01T08:00:00Z',
  validated_at_utc: '2026-09-01T08:30:00Z',
  artifacts: {
    count: 42,
    bytes: 1540000000,
    by_extension: { '.xlsx': 18, '.pdf': 20, '.docx': 4 },
    by_source: { 'Field Engineering': 24, 'Contractor QA/QC': 18 },
  },
  records: { activities: 120, daily_reports: 85, progress_updates: 310 },
  ocr: { pages: 142, lines: 4500, activity_mentions: 890, verified: true },
  validation: { passed: true, checks_run: 18, errors: 0, warnings: 2 },
  caveats: [
    {
      id: 'CAV-01',
      statement: 'Piping spools hydrotest logs pending 3rd party TPI sign-off.',
    },
  ],
};

const BASE_EVM: EvmResponse = {
  data_date: '2026-09-15',
  weighting: 'Duration-weighted baseline',
  project: {
    planned_value: 1284.6,
    earned_value: 640.4,
    schedule_variance: -644.2,
    spi: 0.4984,
    total_weight: 1284.6,
    activity_count: 120,
    percent_source_counts: { actual_finish: 30, linked_event_percentage: 47, no_evidence_floor: 43 },
  },
  by_discipline: {
    civil: {
      planned_value: 600.0,
      earned_value: 450.0,
      schedule_variance: -150.0,
      spi: 0.75,
      total_weight: 600.0,
      activity_count: 50,
      percent_source_counts: { actual_finish: 20, linked_event_percentage: 25, no_evidence_floor: 5 },
    },
    piping: {
      planned_value: 684.6,
      earned_value: 190.4,
      schedule_variance: -494.2,
      spi: 0.278,
      total_weight: 684.6,
      activity_count: 70,
      percent_source_counts: { actual_finish: 10, linked_event_percentage: 22, no_evidence_floor: 38 },
    },
  },
};

const BASE_MEMORY: MemoryQueryResponse = {
  query_type: 'all',
  duration_distribution: [
    {
      activity_type: 'CIV-FDN',
      count: 12,
      actuals_count: 10,
      planned_mean_days: 20.0,
      actual_mean_days: 25.4,
      planned_min_days: 10,
      planned_max_days: 45,
    },
    {
      activity_type: 'PIP-SPL',
      count: 2,
      actuals_count: 2,
      planned_mean_days: 14.5,
      actual_mean_days: 19.2,
      planned_min_days: 7,
      planned_max_days: 30,
    },
  ],
  productivity: [
    {
      discipline: 'piping',
      total_activities: 24,
      completed: 18,
      average_planned_days: 14.5,
      average_actual_days: 19.2,
      average_qty_per_day: 0.42,
    },
  ],
  delay_reasons: [
    {
      reason: 'heavy monsoon rain',
      frequency: 5,
      affected_activities: ['PIP-SPL-001', 'PIP-SPL-002'],
      days_lost: 12,
    },
  ],
  suggested_duration: {
    activity_type_pattern: 'PIP-SPL',
    sample_size: 18,
    actuals_count: 18,
    median_planned_days: 14.5,
    median_actual_days: 19.2,
    p80_actual_days: 22,
    recommendation: 'Calibrated duration based on 18 actuals.',
  },
  computed_at: '2026-09-15T00:00:00Z',
};

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

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getExecutiveMetrics').mockResolvedValue(BASE_METRICS as never);
  vi.spyOn(api, 'getSchedule').mockResolvedValue(BASE_SCHEDULE as never);
  vi.spyOn(api, 'getRaid').mockResolvedValue(BASE_RAID as never);
  vi.spyOn(api, 'getDelayAttribution').mockResolvedValue(BASE_DELAY_ATTRIBUTION as never);
  vi.spyOn(api, 'getConflicts').mockResolvedValue([BASE_CONFLICT] as never);
  vi.spyOn(api, 'getEvidenceCorpus').mockResolvedValue(BASE_CORPUS as never);
  vi.spyOn(api, 'getEvm').mockResolvedValue(BASE_EVM as never);
  vi.spyOn(api, 'queryMemory').mockResolvedValue(BASE_MEMORY as never);
});

describe('ExecutiveMilestones destination', () => {
  it('renders milestone commitments and allows opening read-only detail drawer', async () => {
    wrap(<ExecutiveMilestones />);

    expect(await screen.findByText(/Milestones & Key Commitments/i)).toBeInTheDocument();
    expect(await screen.findByText(/Civil scope complete/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Project finish/i).length).toBeGreaterThan(0);

    // Switch view mode to timeline track
    const timelineBtn = screen.getByRole('button', { name: /Timeline Track/i });
    fireEvent.click(timelineBtn);
    expect(await screen.findByText(/Horizontal Schedule Chronology/i)).toBeInTheDocument();

    // Switch back to table view
    const tableBtn = screen.getByRole('button', { name: /Table View/i });
    fireEvent.click(tableBtn);

    // Click on milestone row to open drawer
    const row = await screen.findByText(/Civil scope complete/i);
    fireEvent.click(row);

    expect(await screen.findByText(/Milestone Inspector · Read-Only/i)).toBeInTheDocument();
  });
});

describe('ExecutiveProgress destination', () => {
  it('renders EVM metrics, S-Curve trajectory and discipline breakdown', async () => {
    wrap(<ExecutiveProgress />);

    expect(await screen.findByText(/Progress & Earned Value Oversight/i)).toBeInTheDocument();
    expect(await screen.findByText(/Cumulative EVM S-Curve/i)).toBeInTheDocument();
    expect(screen.getByText(/Discipline Performance Comparison/i)).toBeInTheDocument();

    // Check discipline SPI from EVM breakdown payload
    expect(screen.getByText('0.75')).toBeInTheDocument();
  });
});

describe('ExecutiveRisksDelays destination', () => {
  it('renders RAID register and switches to delay attribution and source conflicts tabs', async () => {
    wrap(<ExecutiveRisksDelays />);

    expect(await screen.findByText(/Risks & Delay Exposure/i)).toBeInTheDocument();
    expect(await screen.findByText(/Monsoon Flooding Risk on Access Road/i)).toBeInTheDocument();

    // Switch to delay attribution tab
    const delayTab = screen.getByRole('button', { name: /Delay Attribution Matrix/i });
    fireEvent.click(delayTab);

    expect(await screen.findByText(/FIDIC 28-Day Notice Compliance/i)).toBeInTheDocument();
    expect(screen.getByText(/piling rig breakdown/i)).toBeInTheDocument();
    expect(screen.getByText('LAPSED')).toBeInTheDocument();

    // Switch to conflicts tab
    const conflictsTab = screen.getByRole('button', { name: /Source Disagreements/i });
    fireEvent.click(conflictsTab);

    expect(await screen.findByText(/Measurement Uncertainty/i)).toBeInTheDocument();
    expect(screen.getByText(/civil_progress\.xlsx/i)).toBeInTheDocument();
  });
});

describe('ExecutiveForecasts destination', () => {
  it('renders deterministic completion forecast and interactive What-If scenario levers', async () => {
    wrap(<ExecutiveForecasts />);

    expect(await screen.findByText(/Completion Forecasts & Scenario Modeling/i)).toBeInTheDocument();
    expect(await screen.findByText(/Deterministic Forward Pass/i)).toBeInTheDocument();
    expect(screen.getByText(/Baseline Finish \(Contractual\)/i)).toBeInTheDocument();
    expect(screen.getByText(/What-If Management Lever Simulator/i)).toBeInTheDocument();

    // Check dates from forecast payload
    expect(screen.getByText('2026-09-28')).toBeInTheDocument();
    expect(screen.getAllByText('2026-10-12').length).toBeGreaterThan(0);

    // Weather slider change
    const weatherSlider = screen.getByLabelText(/Weather \/ Monsoon Hold/i);
    fireEvent.change(weatherSlider, { target: { value: '5' } });

    // Reset button restores to 0
    const resetBtn = screen.getByRole('button', { name: /Reset to Baseline/i });
    fireEvent.click(resetBtn);
    expect((weatherSlider as HTMLInputElement).value).toBe('0');
  });
});

describe('ExecutiveExecutionInsights destination', () => {
  it('renders duration distributions and warns on low sample sizes (< 3)', async () => {
    wrap(<ExecutiveExecutionInsights />);

    expect(await screen.findByText(/Execution Insights & Lessons/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(document.body.textContent).toContain('CIV-FDN');
    });
    expect(screen.getAllByText(/PIP-SPL/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/LOW SAMPLE \(< 3\)/i).length).toBeGreaterThan(0);
  });
});

describe('ExecutiveManagementReports destination', () => {
  it('renders review pack builder, supports copy markdown and print triggers', async () => {
    wrap(<ExecutiveManagementReports />);

    expect(await screen.findByText(/Management Review Reports/i)).toBeInTheDocument();
    expect(await screen.findByText(/NAVIS EXECUTIVE REVIEW PACK/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. Executive Narrative Summary/i)).toBeInTheDocument();

    // Mock clipboard
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    // Copy action
    const copyBtn = screen.getByRole('button', { name: /Copy Markdown/i });
    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalled();

    // Mock window.print
    const printMock = vi.fn();
    window.print = printMock;

    const printBtn = screen.getByRole('button', { name: /Print \/ Save PDF/i });
    fireEvent.click(printBtn);
    expect(printMock).toHaveBeenCalled();
  });
});

describe('ExecutiveDataConfidence destination', () => {
  it('renders coverage with explicit denominator and separates primary evidence from research corpus', async () => {
    wrap(<ExecutiveDataConfidence />);

    expect(await screen.findByText(/Data Confidence & Lineage Audit/i)).toBeInTheDocument();

    // Explicit denominator 77 evidenced ÷ 120 total = 64.2%
    expect(screen.getByText(/77 evidenced ÷ 120 total = 64.2%/)).toBeInTheDocument();

    // Primary Field Evidence vs Secondary Research Corpus
    expect(screen.getByText(/Active Project Reporting Coverage/i)).toBeInTheDocument();
    expect(screen.getByText(/Secondary EPC Reference Corpus/i)).toBeInTheDocument();
  });
});
