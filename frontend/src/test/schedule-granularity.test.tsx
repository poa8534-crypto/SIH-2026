import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Schedule from '../pages/Schedule';
import { api } from '../lib/api';
import type { ActivityProductivity, QuantityLedger } from '../types';

/**
 * The two Granularity Resolution Engine sections in the Schedule drawer.
 *
 * The numbers themselves are the backend's and are tested there. What these
 * assert is that the screen does not quietly drop the parts that keep those
 * numbers honest:
 *
 *   * a REFUSED reading is shown with its reason, because the refusals are
 *     the reason the ledger exists (D-085)
 *   * every rate is listed, including the ones the forecast did not use, and
 *     an unavailable rate says why rather than rendering a zero (D-087)
 *   * a forecast names the rate it used and carries its evidence line, and a
 *     refusal to forecast is stated rather than left blank (D-088)
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

const ACTIVITY = {
  activity_id: 'ELE-CBL-1076',
  wbs_path: '1.4.2',
  wbs_level: 5,
  description: 'Cable Pulling — Zone A',
  discipline: 'electrical',
  tag: null,
  calendar: null,
  planned_start: '2026-08-05',
  planned_finish: '2026-08-18',
  planned_qty: 1200,
  uom: 'm',
  actual_start: '2026-08-11',
  actual_finish: null,
  actual_start_basis: 'EXPLICIT',
  actual_finish_basis: null,
  actual_qty: 800,
  start_variance_days: 6,
  finish_variance_days: null,
  percent_complete: 66.7,
  predecessors: [],
  predecessor_links: [],
  link_confidence: 0.94,
};

const LEDGER: QuantityLedger = {
  activity_id: 'ELE-CBL-1076',
  description: 'Cable Pulling — Zone A',
  discipline: 'electrical',
  uom: 'm',
  planned_qty: 1200,
  counted_total: 800,
  naive_sum_all_jobs: 800,
  reported_by_jobs: 1,
  stored_actual_qty: 800,
  totals_agree: true,
  stored_total_basis: 'counted_readings',
  percent_complete_from_quantity: 66.7,
  raw_percent_from_quantity: 66.7,
  counted_events: 1,
  refused_events: 1,
  events_without_quantity: 0,
  total_note: 'counted_total is the largest accumulation from any single ingest.',
  refusal_note:
    'A refused reading is a decision, not a gap: the roll-up declined to count it.',
  contributions: [
    {
      linked_event_id: 'le-1', job_id: 'j1', reported_date: '2026-08-11',
      quantity: 800, uom: 'm', percentage: null, counted_quantity: 800,
      counted: true, reason_code: 'counted', reason: '+800 m',
      source_file: 'dpr_day_03.txt', source_line: 12, source_row: null,
      source_span: 'Cable pulling Zone A — 800 m', raw_text: 'x',
      confidence: 0.94, reviewed: false,
    },
    {
      linked_event_id: 'le-2', job_id: 'j1', reported_date: '2026-08-19',
      quantity: 1.2, uom: 'km', percentage: null, counted_quantity: null,
      counted: false, reason_code: 'uom_mismatch',
      reason: 'uom mismatch ignored: event 1.2 km vs planned m',
      source_file: 'dpr_day_05.txt', source_line: 7, source_row: null,
      source_span: 'Cable pulling — 1.2 km complete', raw_text: 'x',
      confidence: 0.91, reviewed: false,
    },
  ],
};

const PRODUCTIVITY: ActivityProductivity = {
  activity_id: 'ELE-CBL-1076',
  description: 'Cable Pulling — Zone A',
  discipline: 'electrical',
  uom: 'm',
  planned_qty: 1200,
  counted_qty: 800,
  percent_complete: 66.7,
  percent_complete_source: 'installed_quantity',
  remaining_qty: 400,
  actual_start: '2026-08-11',
  actual_finish: null,
  as_of: '2026-09-15',
  reported_days: 1,
  rates: [
    {
      basis: 'planned', value: 85.71, days: 14, quantity: 1200,
      sample_size: 1, note: 'planned quantity over the planned duration',
    },
    {
      basis: 'observed_elapsed', value: 22.22, days: 36, quantity: 800,
      sample_size: 1, note: 'measured quantity over every calendar day',
    },
    {
      basis: 'observed_reported', value: null, days: null, quantity: null,
      sample_size: 1,
      note: 'needs readings on at least 2 distinct days; this activity has 1.',
    },
  ],
  comparables: {
    activity_type: 'ELE-CBL', count: 0, members: [],
    median_qty_per_day: null, mean_qty_per_day: null, enough: false,
    note: 'Only 0 completed ELE-CBL activities carry both actual dates and a measured quantity.',
  },
  calendar_basis: 'calendar days; no working calendar is applied',
  basis_note: 'Three rates, and none of them is the productivity.',
  baseline_finish: '2026-08-18',
  forecast: {
    basis: 'observed_elapsed', rate: 22.22, remaining_days: 19,
    forecast_finish: '2026-10-04', baseline_finish: '2026-08-18',
    variance_days: 47, sample_size: 1,
    why: 'observed over every calendar day since Actual Start — the reading a contract argues from',
  },
  candidates: [],
  reason: null,
  evidence: {
    readings_counted: 1, reported_days: 1, measured_quantity: 800,
    uom: 'm', comparable_activities: 0,
  },
  forecast_note:
    'A forecast is a projection and is never written to the schedule.',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getSchedule').mockResolvedValue({
    project: 'OIL Well-Site Duliajan',
    data_date: '2026-09-15',
    activities: [ACTIVITY],
  } as never);
  vi.spyOn(api, 'getActivityAudit').mockResolvedValue([] as never);
  vi.spyOn(api, 'getQuantityLedger').mockResolvedValue(LEDGER);
  vi.spyOn(api, 'getActivityProductivity').mockResolvedValue(PRODUCTIVITY);
});

/** Load the schedule, open the drawer, and wait for BOTH sections to resolve.
 *
 * Waiting for the section heading is not enough: it renders immediately while
 * the two queries behind it are still showing skeletons, so every assertion
 * below would race the fetch. Wait for content from each. */
async function openDrawer() {
  wrap(<Schedule />);
  fireEvent.click(await screen.findByText('ELE-CBL-1076'));
  await screen.findByText('Quantity Ledger');
  await screen.findByText(/reading over/);
}

describe('the quantity ledger section', () => {
  it('shows the refused reading with its reason', async () => {
    await openDrawer();

    expect(screen.getByText('REFUSED')).toBeInTheDocument();
    expect(
      screen.getByText(/uom mismatch ignored: event 1.2 km vs planned m/)
    ).toBeInTheDocument();
    // And the counted one, so the arithmetic is checkable.
    expect(screen.getByText('COUNTED')).toBeInTheDocument();
  });

  it('cites the file and line each reading came from', async () => {
    await openDrawer();
    expect(screen.getByText(/dpr_day_05.txt, line 7/)).toBeInTheDocument();
  });

  it('carries the refusal note from the API rather than restating it', async () => {
    await openDrawer();
    expect(screen.getByText(/a decision, not a gap/)).toBeInTheDocument();
  });
});

describe('the productivity and forecast section', () => {
  it('names the forecast, the baseline and the variance', async () => {
    await openDrawer();

    expect(screen.getByText('2026-10-04')).toBeInTheDocument();
    expect(screen.getByText(/vs baseline 2026-08-18/)).toBeInTheDocument();
    expect(screen.getByText('+47d')).toBeInTheDocument();
  });

  it('says which rate the forecast used, and why', async () => {
    await openDrawer();

    expect(
      screen.getByText(/from observed_elapsed at 22.22 m\/day/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the reading a contract argues from/)
    ).toBeInTheDocument();
  });

  it('lists every rate, including the one it could not compute', async () => {
    await openDrawer();

    expect(screen.getByText('planned')).toBeInTheDocument();
    expect(screen.getAllByText('observed elapsed').length).toBeGreaterThan(0);
    expect(screen.getByText('observed reported')).toBeInTheDocument();
    // An unavailable rate says why rather than rendering a zero.
    expect(
      screen.getByText(/needs readings on at least 2 distinct days/)
    ).toBeInTheDocument();
  });

  it('carries the evidence line', async () => {
    await openDrawer();
    expect(
      screen.getByText(/1 reading over 1 reported day · 800 m confirmed · 0 comparables/)
    ).toBeInTheDocument();
  });

  it('states that a forecast is never written to the schedule', async () => {
    await openDrawer();
    expect(
      screen.getByText(/never written to the schedule/)
    ).toBeInTheDocument();
  });

  it('states a refusal to forecast rather than leaving it blank', async () => {
    vi.spyOn(api, 'getActivityProductivity').mockResolvedValue({
      ...PRODUCTIVITY,
      forecast: null,
      reason: 'quantity_complete_awaiting_finish_date',
    });
    await openDrawer();

    expect(
      screen.getByText(/No forecast: quantity complete awaiting finish date/)
    ).toBeInTheDocument();
  });
});
