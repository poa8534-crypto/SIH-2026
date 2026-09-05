import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { GanttChart } from '../components/GanttChart';
import Schedule from '../pages/Schedule';
import { api } from '../lib/api';
import type { ScheduleActivity, ScheduleResponse } from '../types';

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

const MOCK_ACTIVITIES: ScheduleActivity[] = [
  {
    activity_id: 'CIV-FTG-001',
    wbs_path: '1.1.1',
    wbs_level: 5,
    description: 'Foundation Excavation & Blinding',
    discipline: 'civil',
    tag: null,
    calendar: '6-day',
    planned_start: '2026-03-01',
    planned_finish: '2026-03-15',
    planned_qty: 500,
    uom: 'm3',
    actual_start: '2026-03-01',
    actual_finish: '2026-03-15',
    actual_start_basis: 'EXPLICIT',
    actual_finish_basis: 'EXPLICIT',
    actual_qty: 500,
    start_variance_days: 0,
    finish_variance_days: 0,
    percent_complete: 100,
    predecessors: [],
    predecessor_links: [],
    link_confidence: 0.98,
    total_float: 0,
    critical: true,
  },
  {
    activity_id: 'PIP-UG-010',
    wbs_path: '1.2.1',
    wbs_level: 5,
    description: 'Underground Spool Fabrication & Laying',
    discipline: 'piping',
    tag: null,
    calendar: '6-day',
    planned_start: '2026-03-16',
    planned_finish: '2026-04-10',
    planned_qty: 1200,
    uom: 'm',
    actual_start: '2026-03-20',
    actual_finish: null,
    actual_start_basis: 'EXPLICIT',
    actual_finish_basis: null,
    actual_qty: 600,
    start_variance_days: 4,
    finish_variance_days: 4,
    percent_complete: 50,
    predecessors: ['CIV-FTG-001'],
    predecessor_links: [{ activity_id: 'CIV-FTG-001', rel: 'FS', lag_days: 0 }],
    link_confidence: 0.92,
    total_float: 5,
    critical: false,
  },
];

const MOCK_SCHEDULE_RESPONSE: ScheduleResponse = {
  project: 'Duliajan OCS Phase 2 Expansion',
  data_date: '2026-04-10',
  baseline: {
    name: 'rev0',
    filename: 'baseline.json',
    imported_at: '2026-03-01',
    activity_count: 2,
    sha256: 'abcdef1234567890',
    source_format: 'json',
    source: 'test',
  },
  total_activities: 2,
  activities_with_actuals: 2,
  activities_completed: 1,
  critical_activities: 1,
  average_start_variance: 2.0,
  average_finish_variance: 2.0,
  integrity_warnings: [],
  activities: MOCK_ACTIVITIES,
};

describe('GanttChart Component', () => {
  it('renders activities with planned dates, float slack, and critical indicator', () => {
    const onSelect = vi.fn();
    render(
      <GanttChart
        activities={MOCK_ACTIVITIES}
        selectedId={null}
        onSelectActivity={onSelect}
        dataDate="2026-04-10"
      />
    );

    // Checks activity descriptions and IDs
    expect(screen.getByText('CIV-FTG-001')).toBeInTheDocument();
    expect(screen.getByText('Foundation Excavation & Blinding')).toBeInTheDocument();
    expect(screen.getByText('PIP-UG-010')).toBeInTheDocument();
    expect(screen.getByText('Underground Spool Fabrication & Laying')).toBeInTheDocument();

    // Critical badge for zero float activity
    expect(screen.getByText('CRIT')).toBeInTheDocument();

    // Float labels
    expect(screen.getByText('0d')).toBeInTheDocument();
    expect(screen.getByText('5d')).toBeInTheDocument();

    // Clicking row calls onSelectActivity
    fireEvent.click(screen.getByText('CIV-FTG-001'));
    expect(onSelect).toHaveBeenCalledWith('CIV-FTG-001');
  });

  it('switches zoom scale between Compact, Standard, and Detailed', () => {
    const onSelect = vi.fn();
    render(
      <GanttChart
        activities={MOCK_ACTIVITIES}
        selectedId={null}
        onSelectActivity={onSelect}
        dataDate="2026-04-10"
      />
    );

    const compactBtn = screen.getByRole('button', { name: 'Compact' });
    const detailedBtn = screen.getByRole('button', { name: 'Detailed' });
    const standardBtn = screen.getByRole('button', { name: 'Standard' });

    expect(standardBtn).toHaveClass('text-accent');

    fireEvent.click(compactBtn);
    expect(compactBtn).toHaveClass('text-accent');

    fireEvent.click(detailedBtn);
    expect(detailedBtn).toHaveClass('text-accent');
  });
});

describe('Schedule Page Gantt Integration', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getSchedule').mockResolvedValue(MOCK_SCHEDULE_RESPONSE);
  });

  it('toggles between Table view and Gantt Chart view', async () => {
    wrap(<Schedule />);

    // Table view is default
    expect(await screen.findByText('Activity ID')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gantt Chart/i })).toBeInTheDocument();

    // Switch to Gantt Chart
    fireEvent.click(screen.getByRole('button', { name: /Gantt Chart/i }));

    // Gantt chart scale controls appear
    expect(screen.getByText('Scale:')).toBeInTheDocument();
    expect(screen.getByText('Focus Data Date (2026-04-10)')).toBeInTheDocument();

    // Switch back to Table
    fireEvent.click(screen.getByRole('button', { name: /Table/i }));
    expect(screen.getByText('Activity ID')).toBeInTheDocument();
  });

  it('filters by critical path activities only', async () => {
    wrap(<Schedule />);

    expect(await screen.findByText('CIV-FTG-001')).toBeInTheDocument();
    expect(screen.getByText('PIP-UG-010')).toBeInTheDocument();

    // Click Critical Path checkbox
    const critCheckbox = screen.getByLabelText(/Critical Path/i);
    fireEvent.click(critCheckbox);

    // Only CIV-FTG-001 should remain
    expect(screen.getByText('CIV-FTG-001')).toBeInTheDocument();
    expect(screen.queryByText('PIP-UG-010')).not.toBeInTheDocument();
  });
});
