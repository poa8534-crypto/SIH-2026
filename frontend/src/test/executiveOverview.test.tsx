import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ExecutiveOverview from '../pages/executive/Overview';
import { api } from '../lib/api';

const MOCK_METRICS = {
  as_of: '2026-09-15',
  kpis: {
    spi: 0.88,
    spi_band: 'Slipping',
    pv_total: 120.0,
    ev_total: 105.6,
    float_drift_days: 14,
    critical_activities_count: 14,
    evidence_coverage_pct: 84.2,
    total_activities: 64,
    evidenced_activities: 56,
    unevidenced_activities: 8,
  },
  dispute_shield: {
    employer_delay_days: 24,
    contractor_delay_days: 8,
    concurrent_delay_days: 6,
    neutral_delay_days: 10,
    employer_claim_cr: 14.20,
    contractor_ld_risk_cr: 3.80,
    contract_value_cr: 180.0,
    notice_compliance_pct: 82.5,
    notice_served_count: 4,
    notice_open_count: 2,
    notice_lapsed_count: 1,
  },
  completion_forecast: {
    baseline_finish: '2026-10-15',
    current_forecast_finish: '2026-10-29',
    variance_days: 14,
    p10_finish: '2026-10-15',
    p50_finish: '2026-10-29',
    p90_finish: '2026-11-12',
    monte_carlo_runs: 1000,
  },
  s_curve: [
    {
      date: '2026-08-01',
      week_label: 'W01',
      pv_cumulative: 10.0,
      ev_cumulative: 8.5,
      ev_projected: 8.5,
      is_future: false,
    },
    {
      date: '2026-09-15',
      week_label: 'W07',
      pv_cumulative: 60.0,
      ev_cumulative: 52.8,
      ev_projected: 52.8,
      is_future: false,
    },
    {
      date: '2026-10-29',
      week_label: 'W13',
      pv_cumulative: 100.0,
      ev_cumulative: null,
      ev_projected: 100.0,
      is_future: true,
    },
  ],
  critical_drivers: [
    {
      activity_id: 'ACT-CIV-1002',
      description: 'Pad-04 concrete pour & curing',
      discipline: 'CIVIL',
      planned_finish: '2026-08-30',
      actual_finish: null,
      finish_variance_days: 14,
      driving_delay: 'Foundation curing & monsoon hold',
      critical: true,
    },
  ],
  milestones: [
    {
      name: 'Commercial Operation Date (COD)',
      baseline_date: '2026-10-15',
      forecast_date: '2026-10-29',
      variance_days: 14,
      status: 'CRITICAL',
      confidence: '71.2%',
    },
  ],
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

describe('ExecutiveOverview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getExecutiveMetrics').mockResolvedValue(MOCK_METRICS as never);
    vi.spyOn(api, 'getSchedule').mockResolvedValue({
      project: 'OIL Pipeline 04A',
      data_date: '2026-09-15',
      activities: [],
    } as never);
  });

  it('renders strategic executive KPI strip', async () => {
    wrap(<ExecutiveOverview />);

    expect(await screen.findByText('0.88')).toBeInTheDocument();
    expect(screen.getByText('Slipping')).toBeInTheDocument();
    expect(screen.getByText('+14d')).toBeInTheDocument();
    expect(screen.getAllByText(/14.20/).length).toBeGreaterThan(0);
    expect(screen.getByText(/84.2/)).toBeInTheDocument();
  });

  it('renders cumulative EVM S-Curve and FIDIC Dispute Shield', async () => {
    wrap(<ExecutiveOverview />);

    expect(await screen.findByText(/Cumulative S-Curve/i)).toBeInTheDocument();
    expect(screen.getByText(/FIDIC Contractual Dispute Shield/i)).toBeInTheDocument();
    expect(screen.getByText('24 Days')).toBeInTheDocument();
    expect(screen.getByText('8 Days')).toBeInTheDocument();
    expect(screen.getByText(/82.5% Compliant/i)).toBeInTheDocument();
  });

  it('runs interactive what-if scenario simulator and updates cost impact', async () => {
    wrap(<ExecutiveOverview />);

    expect(await screen.findByText(/What-If/i)).toBeInTheDocument();
    const weatherSlider = screen.getAllByRole('slider')[0];

    // Change weather days to 10
    fireEvent.change(weatherSlider, { target: { value: '10' } });

    expect(screen.getAllByText('+10 Days').length).toBeGreaterThan(0);
    expect(screen.getByText(/₹1.25 Crores/i)).toBeInTheDocument();
  });
});
