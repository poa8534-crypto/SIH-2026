import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Workforce from '../pages/Workforce';
import CaptureHealth from '../pages/CaptureHealth';
import { ManpowerEvidence } from '../components/ManpowerEvidence';
import { api } from '../lib/api';

/**
 * The Project Manager's manpower and capture-health screens.
 *
 * What is worth pinning is the refusals. Any dashboard can render a number;
 * these screens are only trustworthy if they decline to render one when the
 * data cannot support it, because somebody will move a crew on whatever is
 * shown.
 *
 *   1. A percentage against a zero denominator is withheld, not shown as 0%.
 *   2. An unmeasured contractor is "not measured", never "unreliable".
 *   3. Demand that cannot be derived is NAMED, never absorbed into zero.
 *   4. A manpower delay cause has three answers, and "no register" is not a
 *      weaker "no".
 *   5. Only this role can commit, and committing writes what was decided.
 */

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

const ROLLUP = {
  musters: 10,
  planned_strength: 100,
  present: 86,
  absent: 14,
  shortfall: 14,
  attendance_pct: 86.0,
  man_days: 86,
  absence_reasons: { no_show: 9, sick: 5 },
};

const SUMMARY = {
  window: { from: '2026-08-30', to: '2026-09-12' },
  daily: [
    { date: '2026-09-11', ...ROLLUP },
    // A rest day: nothing contracted, so no percentage exists.
    {
      date: '2026-09-12',
      musters: 8,
      planned_strength: 0,
      present: 0,
      absent: 0,
      shortfall: 0,
      attendance_pct: null,
      man_days: 0,
      absence_reasons: {},
    },
  ],
  by_discipline: [{ discipline: 'piping', crews: 2, ...ROLLUP }],
  by_contractor: [
    {
      contractor: 'Thin Data Ltd',
      crews: 1,
      ...ROLLUP,
      musters: 2,
      sample_sufficient: false,
      reliable: null,
    },
    {
      contractor: 'ABC Infra Pvt Ltd',
      crews: 3,
      ...ROLLUP,
      sample_sufficient: true,
      reliable: true,
    },
  ],
  totals: ROLLUP,
  conflicts: [],
};

const BOARD = {
  week_start: '2026-09-07',
  weeks: 1,
  norms: {},
  weeks_detail: [
    {
      week_start: '2026-09-07',
      week_end: '2026-09-13',
      rows: [
        {
          discipline: 'civil',
          crews: 2,
          demand_man_days: 0,
          supply_man_days: 188.37,
          committed_man_days: 0,
          headroom_man_days: 188.37,
          gap_man_days: 0,
          utilisation_pct: null,
          supply_basis: 'reliability_adjusted' as const,
        },
      ],
      total_demand: 0,
      total_supply: 188.37,
      total_committed: 0,
    },
  ],
  demand_not_derivable: [
    {
      activity_id: 'CIV-FDN-1007',
      discipline: 'civil',
      description: 'Foundation pour',
      planned_qty_in_week: 12,
      uom: 'm3',
      reason: 'no_productivity_norm',
    },
  ],
  double_bookings: [],
};

const PROPOSAL = {
  id: 'p1',
  crew_id: 'CIV-GANG-02',
  crew_name: 'Civil Gang 2',
  discipline: 'civil',
  contractor: 'ABC Infra Pvt Ltd',
  activity_id: 'CIV-SIT-1002',
  activity_description: 'Site Clearing — Zone B',
  from_date: '2026-09-14',
  to_date: '2026-09-20',
  days: 7,
  allocated_strength: 6,
  man_days: 42,
  status: 'proposed' as const,
  rationale: ['discipline_match', 'trade:steel_fixer', 'reliability_measured'],
  requested_by: 'field',
  decided_by: null,
  decided_at: null,
  note: 'Backfill at the rack trenches is running slow',
  created_at: '2026-09-12T00:00:00',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getAttendanceSummary').mockResolvedValue(SUMMARY as never);
  vi.spyOn(api, 'getAllocationBoard').mockResolvedValue(BOARD as never);
  vi.spyOn(api, 'getAssignments').mockResolvedValue([PROPOSAL] as never);
  vi.spyOn(api, 'decideAssignment').mockResolvedValue({
    ...PROPOSAL,
    status: 'committed',
  } as never);
});

// ── The register withholds rather than fabricates ──────────────────────────

describe('the register refuses to invent a figure', () => {
  it('withholds a percentage where nothing was contracted', async () => {
    wrap(<Workforce />);
    await screen.findAllByText('86.0%');
    // The rest-day row must not read as 0% attendance anywhere on the page.
    expect(screen.queryByText('0.0%')).toBeNull();
  });

  it('calls a thin sample "not measured", never "under strength"', async () => {
    wrap(<Workforce />);
    const table = (await screen.findByText('Thin Data Ltd')).closest(
      'table'
    ) as HTMLElement;
    const row = (await within(table).findByText('Thin Data Ltd')).closest(
      'tr'
    ) as HTMLElement;
    expect(within(row).getByText('Not measured')).toBeInTheDocument();
    // Two data points cannot convict a contractor.
    expect(within(row).queryByText('Under strength')).toBeNull();
  });

  it('states how the figures are computed and when they are withheld', async () => {
    wrap(<Workforce />);
    expect(
      await screen.findByText(/that was the calendar, not the contractor/i)
    ).toBeInTheDocument();
  });
});

// ── The allocation board names what it cannot size ─────────────────────────

describe('the allocation board is honest about missing norms', () => {
  it('names the excluded activities rather than absorbing them into zero', async () => {
    wrap(<Workforce />);
    fireEvent.click(await screen.findByRole('button', { name: /Allocation/i }));
    expect(
      await screen.findByText(/Demand excludes 1 activities with no productivity norm/i)
    ).toBeInTheDocument();
  });

  it('marks a supply figure that is only partly measured', async () => {
    wrap(<Workforce />);
    fireEvent.click(await screen.findByRole('button', { name: /Allocation/i }));
    expect(await screen.findByText('Reliability-adjusted')).toBeInTheDocument();
  });

  it('shows a nominal supply as nominal', async () => {
    vi.mocked(api.getAllocationBoard).mockResolvedValue({
      ...BOARD,
      weeks_detail: [
        {
          ...BOARD.weeks_detail[0],
          rows: [{ ...BOARD.weeks_detail[0].rows[0], supply_basis: 'nominal' }],
        },
      ],
    } as never);
    wrap(<Workforce />);
    fireEvent.click(await screen.findByRole('button', { name: /Allocation/i }));
    expect(await screen.findByText('Nominal')).toBeInTheDocument();
  });
});

// ── Only this role commits ─────────────────────────────────────────────────

describe('committing manpower', () => {
  it('puts the waiting decision above four weeks of arithmetic', async () => {
    wrap(<Workforce />);
    fireEvent.click(await screen.findByRole('button', { name: /Allocation/i }));
    expect(await screen.findByText(/Waiting on you \(1\)/)).toBeInTheDocument();
  });

  it('shows the deterministic rationale tokens, not prose', async () => {
    wrap(<Workforce />);
    fireEvent.click(await screen.findByRole('button', { name: /Allocation/i }));
    expect(await screen.findByText('discipline_match')).toBeInTheDocument();
    expect(screen.getByText('trade:steel_fixer')).toBeInTheDocument();
  });

  it('commits the number the PM decided, not the number that was asked for', async () => {
    wrap(<Workforce />);
    fireEvent.click(await screen.findByRole('button', { name: /Allocation/i }));
    const input = (await screen.findByDisplayValue('6')) as HTMLInputElement;
    // A supervisor asks for six; there are four to spare.
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /^Commit$/i }));

    await waitFor(() => expect(api.decideAssignment).toHaveBeenCalled());
    expect(vi.mocked(api.decideAssignment).mock.calls[0][1]).toMatchObject({
      decision: 'commit',
      allocated_strength: 4,
      decided_by: 'planner',
    });
  });

  it('declining sends a withdraw, which keeps the row', async () => {
    wrap(<Workforce />);
    fireEvent.click(await screen.findByRole('button', { name: /Allocation/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Decline/i }));
    await waitFor(() => expect(api.decideAssignment).toHaveBeenCalled());
    expect(vi.mocked(api.decideAssignment).mock.calls[0][1].decision).toBe('withdraw');
  });
});

// ── Manpower delay evidence: three answers ─────────────────────────────────

describe('manpower evidence gives three answers, not two', () => {
  const BASE = {
    activity_id: 'CIV-FDN-1007',
    window: { from: '2026-08-01', to: '2026-08-14' },
    musters: 24,
    planned_strength: 300,
    present: 282,
    absent: 18,
    shortfall: 18,
    attendance_pct: 94.0,
    man_days: 282,
    absence_reasons: { leave: 4, sick: 3 },
    short_days: [],
  };

  it('refutes a manpower cause when the crews were there', async () => {
    vi.spyOn(api, 'getShortfallEvidence').mockResolvedValue({
      ...BASE,
      supports_manpower_cause: false,
      reason: 'strength_fielded',
      note: 'Crews fielded 94.0% of contracted strength. The register does NOT support a MANPOWER cause — the manpower was there.',
    } as never);
    wrap(<ManpowerEvidence activityId="CIV-FDN-1007" />);
    expect(
      await screen.findByText('The register does not support a manpower cause')
    ).toBeInTheDocument();
  });

  it('supports a manpower cause when the crews were short', async () => {
    vi.spyOn(api, 'getShortfallEvidence').mockResolvedValue({
      ...BASE,
      attendance_pct: 44.1,
      short_days: ['2026-09-14'],
      supports_manpower_cause: true,
      reason: 'shortfall_observed',
      note: 'Crews fielded 44.1% of contracted strength, short on 1 day(s).',
    } as never);
    wrap(<ManpowerEvidence activityId="CIV-FDN-1007" />);
    expect(
      await screen.findByText(/^The register supports a manpower cause$/i)
    ).toBeInTheDocument();
  });

  it('says no register was kept, which is not a weaker "no"', async () => {
    vi.spyOn(api, 'getShortfallEvidence').mockResolvedValue({
      ...BASE,
      musters: 0,
      supports_manpower_cause: null,
      reason: 'no_register',
      note: 'No muster covers this activity in the window. A MANPOWER classification here is an assertion, not a finding.',
    } as never);
    wrap(<ManpowerEvidence activityId="CIV-FDN-1007" />);
    expect(await screen.findByText(/No muster register/i)).toBeInTheDocument();
    expect(screen.getByText(/an assertion, not a finding/i)).toBeInTheDocument();
    // It must not be dressed up as a refutation.
    expect(
      screen.queryByText('The register does not support a manpower cause')
    ).toBeNull();
  });

  it('stays silent rather than blocking an adjudication it cannot inform', async () => {
    vi.spyOn(api, 'getShortfallEvidence').mockRejectedValue(new Error('404'));
    const { container } = wrap(<ManpowerEvidence activityId="NOPE" />);
    await waitFor(() => expect(container.textContent).not.toMatch(/Checking/));
    expect(container.textContent).toBe('');
  });
});

// ── Capture health separates the two kinds of silence ──────────────────────

describe('capture health separates "no work" from "no signal"', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getLinkHealth').mockResolvedValue({
      devices: [],
      total: 0,
      online: 0,
      offline: 0,
      queued_submissions: 0,
      queued_bytes: 0,
      worst_band: null,
    } as never);
    vi.spyOn(api, 'getReportingLag').mockResolvedValue({
      window_days: 14,
      rows: [
        {
          discipline: 'piping',
          events: 4,
          median_lag_hours: 9.1,
          max_lag_hours: 81.1,
          last_reported_on: '2026-09-02',
          days_since_last_report: 10,
        },
      ],
      events: 4,
      median_lag_hours: 9.1,
      silent_disciplines: ['piping'],
    } as never);
    vi.spyOn(api, 'getCaptureCoverage').mockResolvedValue({
      date: '2026-09-12',
      rows: [
        { discipline: 'civil', progress_events: 0, attendance_marked: true, silent: false },
        { discipline: 'piping', progress_events: 0, attendance_marked: false, silent: true },
      ],
      expected_disciplines: 2,
      reporting: 1,
      silent: ['piping'],
    } as never);
  });

  it('calls a mustered-but-silent discipline a work question', async () => {
    wrap(<CaptureHealth />);
    expect(
      await screen.findByText(/Crews counted, no progress filed — a work question/i)
    ).toBeInTheDocument();
  });

  it('calls a totally silent discipline a capture question', async () => {
    wrap(<CaptureHealth />);
    expect(
      await screen.findByText(/Nothing arrived — treat as a capture question/i)
    ).toBeInTheDocument();
  });

  it('reports no worst band when nothing is online, rather than an outage', async () => {
    wrap(<CaptureHealth />);
    expect(
      await screen.findByText(/Nothing is online, so there is no link to band/i)
    ).toBeInTheDocument();
  });

  it('says throughput is reported and round trip is measured', async () => {
    wrap(<CaptureHealth />);
    expect(
      await screen.findByText(/What is measured here, and what is only reported/i)
    ).toBeInTheDocument();
  });
});
