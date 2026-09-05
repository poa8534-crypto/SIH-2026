import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ScheduleDoctor } from '../components/ScheduleDoctor';
import Memory from '../pages/Memory';
import { api } from '../lib/api';
import type { ScheduleAuditResponse, KnowledgeRulesResponse } from '../types';

const MOCK_AUDIT: ScheduleAuditResponse = {
  audit_id: 'AUDIT-TEST-001',
  schedule_name: 'OIL Duliajan Well-Site 04A',
  data_date: '2026-09-15',
  total_activities: 120,
  feasibility_score: 68,
  feasibility_band: 'CRITICAL_RISK',
  score_breakdown: {
    empirical_realism: 55,
    dcma_logic: 60,
    weather_buffer: 50,
    productivity_sanity: 75,
  },
  summary: {
    critical: 4,
    high: 6,
    medium: 3,
    low: 1,
    total_findings: 14,
  },
  findings: [
    {
      id: 'FIND-001',
      activity_id: 'CIV-FDN-1002',
      activity_description: 'Equipment Foundation Concrete Pour',
      discipline: 'civil',
      category: 'duration_optimism',
      severity: 'critical',
      planned_value: '8 Days',
      benchmark_value: 'P50: 20d (P90: 28d)',
      variance_pct: -60.0,
      critique_message: 'Planned duration of 8d is 60.0% below OIL historical actuals (20d P50). High risk of unmitigated schedule collapse.',
      rule_reference: 'CONTR-PROD-01',
      calibrated_recommendation: 'Extend planned duration to 20 days with 4-day monsoon buffer.',
    },
    {
      id: 'FIND-002',
      activity_id: 'PIP-SPL-1025',
      activity_description: 'Erect Line 24-SPL Spools',
      discipline: 'piping',
      category: 'dcma_logic',
      severity: 'critical',
      planned_value: '0 Successors',
      benchmark_value: '≥ 1 Successor',
      critique_message: 'Open-ended activity: PIP-SPL-1025 has no successor logic tie. Delays will not propagate.',
      rule_reference: 'DCMA-OPEN-ENDS-01',
      calibrated_recommendation: 'Tie activity to downstream tie-in milestone.',
    },
  ],
  calibrated_schedule_snippet: '<Project Id="Calibrated_P6"/>',
  audited_at: '2026-09-15T10:00:00Z',
};

const MOCK_RULES: KnowledgeRulesResponse = {
  rules: [
    {
      id: 'ENV-MONSOON-01',
      category: 'environmental',
      title: 'Upper Assam Monsoon Earthwork Constraint',
      description: 'Active monsoon rainfall causes 35-45% slowdown in trenching.',
      condition_trigger: 'Earthwork scheduled between June 15 and September 15.',
      impact_recommendation: 'Insert 14-21 days weather buffer.',
      severity: 'critical',
      active: true,
    },
  ],
  total_rules: 1,
  categories: { environmental: 1 },
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

describe('ScheduleDoctor Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getScheduleAudit').mockResolvedValue(MOCK_AUDIT);
    vi.spyOn(api, 'getKnowledgeRules').mockResolvedValue(MOCK_RULES);
  });

  it('renders feasibility score and finding critique message', async () => {
    wrap(<ScheduleDoctor />);

    expect(await screen.findByText('68')).toBeInTheDocument();
    expect(screen.getByText(/CRITICAL RISK/i)).toBeInTheDocument();
    expect(screen.getByText('CIV-FDN-1002')).toBeInTheDocument();
    expect(screen.getByText(/Planned duration of 8d is 60.0% below OIL historical actuals/i)).toBeInTheDocument();
    expect(screen.getByText(/CONTR-PROD-01/i)).toBeInTheDocument();
  });

  it('filters findings when clicking category pills', async () => {
    wrap(<ScheduleDoctor />);

    expect(await screen.findByText('CIV-FDN-1002')).toBeInTheDocument();
    expect(screen.getByText('PIP-SPL-1025')).toBeInTheDocument();

    // Click on "Duration Fantasy"
    const durBtn = screen.getByRole('button', { name: /Duration Fantasy/i });
    fireEvent.click(durBtn);

    expect(screen.getByText('CIV-FDN-1002')).toBeInTheDocument();
    expect(screen.queryByText('PIP-SPL-1025')).not.toBeInTheDocument();
  });

  it('opens calibrated P6 XML modal on button click', async () => {
    wrap(<ScheduleDoctor />);

    expect(await screen.findByText(/Generate Calibrated Baseline/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Generate Calibrated Baseline/i));

    expect(screen.getByText(/AI-Calibrated Schedule Prescription/i)).toBeInTheDocument();
    expect(screen.getByText(/Download P6 XML/i)).toBeInTheDocument();
  });
});

describe('Memory Page Knowledge Base Tab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'queryMemory').mockResolvedValue({
      query_type: 'all',
      duration_distribution: [],
      productivity: [],
      delay_reasons: [],
      suggested_duration: null,
      computed_at: '2026-09-15T10:00:00Z',
    });
    vi.spyOn(api, 'getKnowledgeRules').mockResolvedValue(MOCK_RULES);
  });

  it('switches to Knowledge Base tab and renders institutional rules', async () => {
    wrap(<Memory />);

    expect(await screen.findByText(/Knowledge Base/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Knowledge Base/i));

    expect(await screen.findByText(/Upper Assam Monsoon Earthwork Constraint/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Enforced Guardrails/i)).toBeInTheDocument();
    expect(screen.getByText(/ENV-MONSOON-01/i)).toBeInTheDocument();
  });
});
