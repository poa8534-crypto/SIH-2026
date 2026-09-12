import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ExecutiveWorkforce from '../pages/executive/Workforce';
import { CaptureTimeliness } from '../components/CaptureTimeliness';
import { api } from '../lib/api';

/**
 * Senior Management's manpower workspace.
 *
 * This role is defined by what it must NOT be able to do (`lib/role.ts`:
 * "never the review queue, and nothing to approve"), so most of what is worth
 * pinning here is absence:
 *
 *   1. No control that writes anything — no muster, no commit, no decline.
 *   2. No contractor ranked on a sample too thin to rank on.
 *   3. Uncommitted capacity is not called waste.
 *   4. A governance page loses a panel, never the page, when a source is down.
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
  musters: 60,
  planned_strength: 1000,
  present: 850,
  absent: 150,
  shortfall: 150,
  attendance_pct: 85.0,
  man_days: 850,
  absence_reasons: { no_show: 90, sick: 60 },
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getAttendanceSummary').mockResolvedValue({
    window: { from: '2026-08-14', to: '2026-09-12' },
    daily: [],
    by_discipline: [{ discipline: 'piping', crews: 2, ...ROLLUP }],
    by_contractor: [
      {
        contractor: 'Northeast Mechanical Works',
        crews: 2,
        ...ROLLUP,
        attendance_pct: 82.6,
        sample_sufficient: true,
        reliable: true,
      },
      {
        contractor: 'Thin Data Ltd',
        crews: 1,
        ...ROLLUP,
        musters: 2,
        sample_sufficient: false,
        reliable: null,
      },
    ],
    totals: ROLLUP,
    conflicts: [],
  } as never);
  vi.spyOn(api, 'getCapacity').mockResolvedValue([
    {
      crew_id: 'CIV-GANG-01',
      name: 'Civil Gang 1',
      discipline: 'civil',
      contractor: 'ABC',
      planned_strength: 18,
      days: 28,
      reliability: 0.917,
      basis: 'reliability_adjusted',
      nominal_man_days: 504,
      supply_man_days: 462,
      committed_man_days: 200,
      headroom_man_days: 262,
      utilisation_pct: 43.3,
      overcommitted: false,
    },
  ] as never);
  vi.spyOn(api, 'getAllocationBoard').mockResolvedValue({
    week_start: '2026-09-07',
    weeks: 4,
    norms: {},
    weeks_detail: [
      {
        week_start: '2026-09-07',
        week_end: '2026-09-13',
        rows: [],
        total_demand: 0,
        total_supply: 462,
        total_committed: 200,
      },
    ],
    demand_not_derivable: [{ activity_id: 'X', discipline: 'civil', description: 'd', planned_qty_in_week: 1, uom: 'm', reason: 'no_productivity_norm' }],
    double_bookings: [],
  } as never);
});

describe('the executive workforce workspace is read-only', () => {
  it('offers nothing that writes', async () => {
    wrap(<ExecutiveWorkforce />);
    await screen.findAllByText('85.0%');
    // The whole role definition, asserted: no muster, no commit, no decline.
    for (const label of [/save muster/i, /^commit$/i, /decline/i, /correct today/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  it('does not rank a contractor on too few musters', async () => {
    wrap(<ExecutiveWorkforce />);
    const row = (await screen.findByText('Thin Data Ltd')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Not measured')).toBeInTheDocument();
    expect(within(row).queryByText('Below commitment')).toBeNull();
  });

  it('picks the weakest MEASURED contractor for the headline', async () => {
    wrap(<ExecutiveWorkforce />);
    // Thin Data Ltd would sort worse but has not been measured, so it must not
    // be named as the weakest performer.
    expect(
      (await screen.findAllByText('Northeast Mechanical Works')).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('82.6%').length).toBeGreaterThan(0);
  });

  it('refuses to call uncommitted capacity waste', async () => {
    wrap(<ExecutiveWorkforce />);
    expect(
      await screen.findByText(/is not a measure of idleness/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/becomes waste only if there is unmet demand/i)
    ).toBeInTheDocument();
  });

  it('shows demand as not derivable rather than as zero', async () => {
    wrap(<ExecutiveWorkforce />);
    expect(await screen.findByText('not derivable')).toBeInTheDocument();
  });
});

describe('capture timeliness on the governance lane', () => {
  const LAG = {
    window_days: 30,
    rows: [
      {
        discipline: 'piping',
        events: 40,
        median_lag_hours: 249.1,
        max_lag_hours: 400,
        last_reported_on: '2026-09-02',
        days_since_last_report: 10,
      },
    ],
    events: 131,
    median_lag_hours: 249.1,
    silent_disciplines: ['piping'],
  };

  it('names the disciplines whose forecasts are running on stale data', async () => {
    vi.spyOn(api, 'getReportingLag').mockResolvedValue(LAG as never);
    vi.spyOn(api, 'getLinkHealth').mockResolvedValue({
      devices: [], total: 2, online: 0, offline: 2,
      queued_submissions: 0, queued_bytes: 0, worst_band: null,
    } as never);
    wrap(<CaptureTimeliness />);
    expect((await screen.findAllByText('249.1 h')).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Forecasts covering piping are running on data at least that old/i)
    ).toBeInTheDocument();
  });

  it('states that a degraded link never lowers a confidence score', async () => {
    vi.spyOn(api, 'getReportingLag').mockResolvedValue(LAG as never);
    vi.spyOn(api, 'getLinkHealth').mockResolvedValue({
      devices: [], total: 0, online: 0, offline: 0,
      queued_submissions: 0, queued_bytes: 0, worst_band: null,
    } as never);
    wrap(<CaptureTimeliness />);
    expect(
      await screen.findByText(/removes an assist, not a guarantee/i)
    ).toBeInTheDocument();
  });

  it('loses the panel rather than the page when its source is down', async () => {
    vi.spyOn(api, 'getReportingLag').mockRejectedValue(new Error('500'));
    vi.spyOn(api, 'getLinkHealth').mockResolvedValue({
      devices: [], total: 0, online: 0, offline: 0,
      queued_submissions: 0, queued_bytes: 0, worst_band: null,
    } as never);
    const { container } = wrap(<CaptureTimeliness />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toBe('');
  });
});
