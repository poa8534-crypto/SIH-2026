import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ExecutiveOverview from '../pages/executive/Overview';
import { api } from '../lib/api';
import type { ExecutiveMetricsResponse } from '../types';

/**
 * The executive screen, and what it must NOT do.
 *
 * This screen previously rendered ₹14.20 Cr of employer claim, ₹3.80 Cr of LD
 * risk, an ₹180.00 Cr contract baseline, a P90 of 2026-11-12 and 84.2%
 * evidence coverage as hardcoded fallbacks, against an endpoint that was in
 * fact returning ₹0.00 because it read the delay layer with key names that
 * layer never emitted. The invented figures were therefore what a reader saw
 * while the endpoint was broken.
 *
 * The old tests here asserted those same invented numbers, so they passed
 * throughout. These assert the opposite property: that an unavailable figure
 * renders as unavailable, and that every figure shown came from the payload.
 * See D-090.
 */

const BASE: ExecutiveMetricsResponse = {
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
    logic_conflicts_note:
      "27 of the baseline's logic ties are broken by its own authored dates.",
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

function mount(metrics: ExecutiveMetricsResponse = BASE) {
  vi.spyOn(api, 'getExecutiveMetrics').mockResolvedValue(metrics as never);
  vi.spyOn(api, 'getSchedule').mockResolvedValue({
    project: 'OIL Well-Site Duliajan',
    data_date: '2026-09-15',
    activities: [],
  } as never);
  wrap(<ExecutiveOverview />);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('the KPI strip', () => {
  it('renders the values the payload actually carries', async () => {
    mount();

    expect(await screen.findByText('0.50')).toBeInTheDocument();
    expect(screen.getByText('Behind')).toBeInTheDocument();
    expect(screen.getByText('+14d')).toBeInTheDocument();
    expect(screen.getByText(/64.2/)).toBeInTheDocument();
  });

  it('renders an em dash, not a plausible number, when a KPI is missing', async () => {
    mount({ ...BASE, kpis: { ...BASE.kpis, spi: null, evidence_coverage_pct: null as never } });

    // The old screen printed 0.88 and 84.2% here regardless of the payload.
    expect(await screen.findAllByText('—')).not.toHaveLength(0);
    expect(screen.queryByText('0.88')).not.toBeInTheDocument();
    expect(screen.queryByText(/84.2/)).not.toBeInTheDocument();
  });
});

describe('money', () => {
  it('shows delay in days and names the absence when no contract value was supplied', async () => {
    mount();

    expect(await screen.findByText(/FIDIC Contractual Dispute Shield/i)).toBeInTheDocument();
    expect(screen.getByText('0 Days')).toBeInTheDocument();
    expect(screen.getByText('1 Days')).toBeInTheDocument();
    expect(
      screen.getByText(/No claim value — no contract sum supplied/)
    ).toBeInTheDocument();
    expect(screen.getByText(/CONTRACT VALUE NOT SUPPLIED/)).toBeInTheDocument();
  });

  it('never invents a rupee figure', async () => {
    mount();
    await screen.findByText(/FIDIC Contractual Dispute Shield/i);

    // The four literals this screen used to fall back to.
    for (const invented of ['14.20', '3.80', '180.00', '2026-11-12']) {
      expect(screen.queryByText(new RegExp(invented))).not.toBeInTheDocument();
    }
  });

  it('prices the days when the operator does supply a contract', async () => {
    mount({
      ...BASE,
      financial: {
        ...BASE.financial,
        available: true,
        reason: null,
        basis: 'operator_supplied',
        contract_value_cr: 180.0,
        prolongation_lakhs_per_day: 12.5,
        employer_claim_cr: 0.0,
        contractor_ld_risk_cr: 0.13,
        note: 'Operator assumptions applied to the project evidence.',
      },
    });

    expect(await screen.findByText(/CONTRACT BASELINE: ₹180.00 CR/)).toBeInTheDocument();
    expect(screen.getByText(/₹0.13 Cr LD Risk/)).toBeInTheDocument();
  });
});

describe('the completion range', () => {
  it('shows three computed dates and no percentile', async () => {
    mount();

    expect(await screen.findByText('Baseline')).toBeInTheDocument();
    expect(screen.getByText('Logic')).toBeInTheDocument();
    expect(screen.getByText('Exposed')).toBeInTheDocument();
    expect(screen.getByText('as authored')).toBeInTheDocument();
    expect(screen.getByText('CPM over actuals')).toBeInTheDocument();

    expect(screen.queryByText(/P10/)).not.toBeInTheDocument();
    expect(screen.queryByText(/P90/)).not.toBeInTheDocument();
  });

  it('says when the baseline disagrees with its own logic', async () => {
    mount();
    expect(
      await screen.findByText(/27 of the baseline's logic ties are broken/)
    ).toBeInTheDocument();
  });
});

describe('milestones', () => {
  it('states that they are derived and where each date came from', async () => {
    mount();

    expect(await screen.findByText('Derived Milestones')).toBeInTheDocument();
    expect(screen.getByText('DERIVED FROM BASELINE')).toBeInTheDocument();
    expect(screen.getByText('Civil scope complete')).toBeInTheDocument();
    expect(screen.getByText('actual · +15d')).toBeInTheDocument();
    expect(screen.getByText(/carries no milestone flag/)).toBeInTheDocument();
  });

  it('carries no confidence percentage', async () => {
    mount();
    await screen.findByText('Derived Milestones');
    expect(screen.queryByText(/conf\./)).not.toBeInTheDocument();
  });
});

describe('critical path drivers', () => {
  it('names the recorded cause and cites the document', async () => {
    mount();

    expect(await screen.findByText('piling rig breakdown')).toBeInTheDocument();
    expect(screen.getByText(/EQUIPMENT_BREAKDOWN/)).toBeInTheDocument();
    expect(screen.getByText(/proposed, not adjudicated/)).toBeInTheDocument();
    expect(screen.getByText('civil_progress.xlsx')).toBeInTheDocument();
  });

  it('says so when no cause is recorded, rather than supplying one', async () => {
    mount({
      ...BASE,
      critical_drivers: [
        {
          ...BASE.critical_drivers[0],
          driving_delay: null,
          driving_delay_category: null,
          driving_delay_liability: null,
          driving_delay_source: null,
        },
      ],
    });

    expect(await screen.findByText('No cause recorded')).toBeInTheDocument();
    // The string the old code would have produced from the "CIV" prefix.
    expect(
      screen.queryByText(/Foundation curing & monsoon hold/)
    ).not.toBeInTheDocument();
  });
});

describe('the what-if simulator', () => {
  it('moves the computed finish date instead of inventing a cost', async () => {
    mount();

    expect(await screen.findByText(/What-If/i)).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '10' } });

    expect(screen.getAllByText('+10 Days').length).toBeGreaterThan(0);
    // logic_finish 2026-10-12 plus 10 days.
    expect(screen.getByText('2026-10-22')).toBeInTheDocument();
    // The old screen printed "₹1.25 Crores" here from a rate written into
    // the component.
    expect(screen.queryByText(/₹1.25 Crores/)).not.toBeInTheDocument();
  });
});
