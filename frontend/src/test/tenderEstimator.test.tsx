import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenderEstimator } from '../components/TenderEstimator';
import Memory from '../pages/Memory';
import { api } from '../lib/api';
import type { DurationDistribution, MemoryQueryResponse, TenderEstimateResponse } from '../types';

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

const MOCK_DURATIONS: DurationDistribution[] = [
  {
    activity_type: 'PIP-SPL',
    count: 24,
    actuals_count: 18,
    planned_mean_days: 14.5,
    actual_mean_days: 19.2,
    planned_min_days: 7,
    planned_max_days: 30,
  },
  {
    activity_type: 'CIV-FDN',
    count: 12,
    actuals_count: 10,
    planned_mean_days: 20.0,
    actual_mean_days: 25.4,
    planned_min_days: 10,
    planned_max_days: 45,
  },
];

const MOCK_ESTIMATE: TenderEstimateResponse = {
  discipline: 'piping',
  activity_type: 'PIP-SPL',
  site_condition: 'monsoon_upper_assam',
  target_quantity: 50,
  uom: 'spools',
  sample_size: 24,
  actuals_count: 18,
  historical_productivity_rate: 0.42,
  productivity_uom: 'spools/day',
  baseline_days_p50: 15.0,
  calibrated_days_p10: 22.5,
  calibrated_days_p50: 38.0,
  calibrated_days_p90: 54.0,
  weather_risk_factor: 1.35,
  total_contingency_days: 9,
  recommended_tender_duration: 47,
  risk_factors: [
    {
      risk_type: 'Heavy Monsoon Rain & Waterlogging',
      probability_pct: 75,
      impact_days: 12,
      mitigation: 'Contractual weather buffer (FIDIC Cl. 8.4) & elevated equipment pads.',
      historical_frequency: 5,
    },
  ],
  pmxml_snippet: '<Activity><Id>PIP-SPL</Id><PlannedDuration>376h</PlannedDuration></Activity>',
  computed_at: '2026-09-05T12:00:00Z',
};

const MOCK_MEMORY_ALL: MemoryQueryResponse = {
  query_type: 'all',
  duration_distribution: MOCK_DURATIONS,
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
    sample_size: 24,
    actuals_count: 18,
    median_planned_days: 15,
    median_actual_days: 19,
    p80_actual_days: 24,
    recommendation: 'Historical actual duration is 19d.',
  },
  computed_at: '2026-09-05T12:00:00Z',
};

describe('TenderEstimator Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'estimateTender').mockResolvedValue(MOCK_ESTIMATE);
    vi.spyOn(api, 'queryMemory').mockResolvedValue(MOCK_MEMORY_ALL);
  });

  it('renders input controls and calculates duration percentiles', async () => {
    wrap(<TenderEstimator durations={MOCK_DURATIONS} />);

    expect(screen.getByText('Future Project Estimator (Tender Intelligence)')).toBeInTheDocument();
    expect(screen.getByText(/FIDIC Cl. 8.4 Calibrated/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('47d')).toBeInTheDocument();
      expect(screen.getByText('22.5d')).toBeInTheDocument();
      expect(screen.getByText('54d')).toBeInTheDocument();
    });

    expect(screen.getByText('0.42')).toBeInTheDocument();
    expect(screen.getByText('Heavy Monsoon Rain & Waterlogging')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('switches between Historical Benchmarks and Tender Estimator tab on Memory page', async () => {
    wrap(<Memory />);

    await waitFor(() => {
      expect(screen.getByText('Planned vs actual duration')).toBeInTheDocument();
      expect(screen.getByText('Suggested duration')).toBeInTheDocument();
    });

    const tenderTab = screen.getByRole('button', { name: /Tender Estimator/i });
    fireEvent.click(tenderTab);

    await waitFor(() => {
      expect(screen.getByText('Future Project Estimator (Tender Intelligence)')).toBeInTheDocument();
      expect(screen.getByText('P50 Tender Baseline')).toBeInTheDocument();
    });
  });
});
