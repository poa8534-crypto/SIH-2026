import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { GanttChart } from '../components/GanttChart';
import { LiveNotificationToast } from '../components/LiveNotificationToast';
import { notifyScheduleUpdate } from '../lib/liveSync';
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

  it('renders highlighted bar and UPDATED LIVE marker when highlightId is set', () => {
    const onSelect = vi.fn();
    render(
      <GanttChart
        activities={MOCK_ACTIVITIES}
        selectedId="PIP-UG-010"
        highlightId="PIP-UG-010"
        onSelectActivity={onSelect}
        dataDate="2026-04-10"
      />
    );

    expect(screen.getByText('PIP-UG-010')).toBeInTheDocument();
    const liveBadges = screen.getAllByText('LIVE');
    expect(liveBadges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/UPDATED LIVE/i)).toBeInTheDocument();
    expect(screen.getAllByText('50%').length).toBeGreaterThanOrEqual(1);
  });

  it('displays LiveNotificationToast when schedule update is broadcasted', async () => {
    wrap(<LiveNotificationToast />);

    expect(screen.queryByText(/Live Schedule Sync/i)).not.toBeInTheDocument();

    act(() => {
      notifyScheduleUpdate({
        activityId: 'PIP-UG-010',
        activityDescription: 'Underground Spool Fabrication & Laying',
        message: 'Field report confirmed: 50% completed',
        source: 'Reconcile',
        percentComplete: 50,
      });
    });

    expect(await screen.findByText(/Live Schedule Sync/i)).toBeInTheDocument();
    expect(screen.getByText(/PIP-UG-010/i)).toBeInTheDocument();
    expect(screen.getByText(/Underground Spool Fabrication/i)).toBeInTheDocument();
    expect(screen.getByText(/View Updated Bar in Gantt/i)).toBeInTheDocument();
  });

  it('clicking the UPDATED LIVE floating badge triggers activity selection to stop glow', () => {
    const onSelect = vi.fn();
    render(
      <GanttChart
        activities={MOCK_ACTIVITIES}
        selectedId={null}
        highlightId="PIP-UG-010"
        onSelectActivity={onSelect}
        dataDate="2026-04-10"
      />
    );

    const badge = screen.getByText(/Click to Stop Glow/i);
    expect(badge).toBeInTheDocument();
    fireEvent.click(badge);
    expect(onSelect).toHaveBeenCalledWith('PIP-UG-010');
  });

  it('automatically triggers zero-scroll alignment and centers target row when highlightId and highlightKey are provided', async () => {
    const scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    const onSelect = vi.fn();
    render(
      <div id="schedule-workbench">
        <GanttChart
          activities={MOCK_ACTIVITIES}
          selectedId="PIP-UG-010"
          highlightId="PIP-UG-010"
          highlightKey="test-key-123"
          onSelectActivity={onSelect}
          dataDate="2026-04-10"
        />
      </div>
    );

    expect(screen.getByText('PIP-UG-010')).toBeInTheDocument();
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    });
  });
  // ── Regression guards for the Gantt rendering sweep (D-107) ───────────────
  //
  // Every test below pins a defect that shipped into the working tree and was
  // invisible to the suite that existed at the time: the whole module type
  // checked and every assertion passed while the highlighted bar rendered with
  // no background at all.

  /** The timeline canvas width, read off the row's right-hand pane. */
  function timelineWidthOf(container: HTMLElement, activityId: string): number {
    const row = container.querySelector(`#gantt-row-${activityId}`)!;
    const canvas = row.lastElementChild as HTMLElement;
    return parseFloat(canvas.style.width);
  }

  it('gives the highlighted bar exactly one background class, not a merged one', () => {
    const { container } = render(
      <GanttChart
        activities={MOCK_ACTIVITIES}
        selectedId={null}
        highlightId="PIP-UG-010"
        onSelectActivity={vi.fn()}
        dataDate="2026-04-10"
      />
    );

    const bar = container.querySelector('#gantt-bar-PIP-UG-010') as HTMLElement;
    const classes = bar.className.split(/\s+/);

    // The concatenation bug produced the single token "bg-emerald-500/30bg-accent/20",
    // which matches no rule, so the bar lost every background it was meant to have.
    for (const cls of classes) {
      expect(cls.match(/bg-/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
    expect(classes).toContain('bg-emerald-500/30');
    expect(classes).toContain('border-emerald-400');
    expect(classes.filter((c) => c.startsWith('bg-'))).toHaveLength(1);
  });

  it('keeps a highlighted critical activity green rather than letting red win on stylesheet order', () => {
    const { container } = render(
      <GanttChart
        activities={MOCK_ACTIVITIES}
        selectedId={null}
        highlightId="CIV-FTG-001"
        onSelectActivity={vi.fn()}
        dataDate="2026-04-10"
      />
    );

    // CIV-FTG-001 is critical: the old code emitted both states onto the element.
    const bar = container.querySelector('#gantt-bar-CIV-FTG-001') as HTMLElement;
    const classes = bar.className.split(/\s+/);
    expect(classes).toContain('bg-emerald-500/30');
    expect(classes).not.toContain('bg-danger/20');
    expect(classes).not.toContain('border-danger');
  });

  it('keeps the highlighted bar under the sticky activity pane', () => {
    const { container } = render(
      <GanttChart
        activities={MOCK_ACTIVITIES}
        selectedId={null}
        highlightId="PIP-UG-010"
        onSelectActivity={vi.fn()}
        dataDate="2026-04-10"
      />
    );

    // The meta pane is z-20; a bar or badge at z-20+ floats over the activity IDs.
    const bar = container.querySelector('#gantt-bar-PIP-UG-010') as HTMLElement;
    expect(bar.className.split(/\s+/)).toContain('z-10');

    const badge = container.querySelector('#gantt-badge-PIP-UG-010') as HTMLElement;
    expect(badge.className.split(/\s+/)).toContain('z-10');
  });

  it('clamps the live badge inside the timeline instead of letting it run off the edge', () => {
    // PIP-UG-010 runs to the data date, which sits near the end of the timeline —
    // exactly where an unclamped nowrap pill overflowed the scroll area.
    const { container } = render(
      <GanttChart
        activities={MOCK_ACTIVITIES}
        selectedId={null}
        highlightId="PIP-UG-010"
        onSelectActivity={vi.fn()}
        dataDate="2026-04-10"
      />
    );

    const badge = container.querySelector('#gantt-badge-PIP-UG-010') as HTMLElement;
    const left = parseFloat(badge.style.left);
    const width = timelineWidthOf(container, 'PIP-UG-010');

    expect(left).toBeGreaterThanOrEqual(0);
    expect(left).toBeLessThanOrEqual(width);
  });

  it('sizes the timeline to hold the whole month band, including the final month', () => {
    const { container } = render(
      <GanttChart
        activities={MOCK_ACTIVITIES}
        selectedId={null}
        highlightId={null}
        onSelectActivity={vi.fn()}
        dataDate="2026-04-10"
      />
    );

    const width = timelineWidthOf(container, 'PIP-UG-010');
    const monthBand = Array.from(
      container.querySelectorAll('div[class*="font-semibold"][class*="truncate"]')
    ) as HTMLElement[];
    expect(monthBand.length).toBeGreaterThan(0);

    // The band always runs to the end of the month containing the last date, so
    // sizing the canvas from that date alone clipped the final header.
    const bandEnd = Math.max(
      ...monthBand.map((m) => parseFloat(m.style.left) + parseFloat(m.style.width))
    );
    expect(bandEnd).toBeLessThanOrEqual(width);
  });

  it('does not scroll the outer page for an ordinary selection', () => {
    const scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    render(
      <div id="schedule-workbench">
        <GanttChart
          activities={MOCK_ACTIVITIES}
          selectedId="PIP-UG-010"
          highlightId={null}
          onSelectActivity={vi.fn()}
          dataDate="2026-04-10"
        />
      </div>
    );

    // Only a live highlight may move the viewport. Clicking a row inside the
    // Gantt must scroll the Gantt's own container and nothing else.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(scrollIntoViewMock).not.toHaveBeenCalled();
        resolve();
      }, 500);
    });
  });

  it('renders without a data date instead of inventing one', () => {
    const { container } = render(
      <GanttChart
        activities={MOCK_ACTIVITIES}
        selectedId={null}
        highlightId={null}
        onSelectActivity={vi.fn()}
      />
    );

    // The schedule query has not resolved yet. A hardcoded default put a Data
    // Date marker on 2026-04-10 for every project, whatever its real one.
    expect(screen.queryByText(/Focus Data Date/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Data Date$/)).not.toBeInTheDocument();
    expect(container.querySelector('#gantt-bar-PIP-UG-010')).toBeInTheDocument();
  });
});
