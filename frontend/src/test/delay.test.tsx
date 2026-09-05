import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Delay from '../pages/Delay';
import { api } from '../lib/api';
import type { DelayAttribution, DelayEvent } from '../types';

/**
 * The planner half of the Contractor Dispute Shield.
 *
 * The backend proposes a liability, a notice status and a float split; every
 * one of them is a proposal until a human rules (D-078). These assert the two
 * things that make the screen trustworthy rather than merely informative:
 *
 *   1. A proposal never renders as a finding. An unruled row says so, and the
 *      proposal stays visible beside a ruling so an override reads as one.
 *   2. The whole slip is shown beside the part that outran float. The smaller
 *      number is credible precisely because the larger one is next to it.
 *
 * They assert the request bodies too, because that is the contract
 * POST /delay/{id}/classify and POST /delay/{id}/notice are written against —
 * the same reason reconcile.test.tsx asserts its own.
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

const ABSORBED: DelayEvent = {
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

const CRITICAL: DelayEvent = {
  ...ABSORBED,
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

const MATRIX: DelayAttribution = {
  events: [ABSORBED, CRITICAL],
  total_events: 2,
  adjudicated_events: 0,
  adjudicated_days: {
    COMPENSABLE: 0, NON_COMPENSABLE: 0, EXCUSABLE: 0, CONTESTED: 0,
  },
  proposed_days: {
    COMPENSABLE: 0, NON_COMPENSABLE: 1, EXCUSABLE: 0, CONTESTED: 21,
  },
  days_by_month: { '2026-07': 1, '2026-09': 21 },
  categories_present: ['EQUIPMENT', 'OTHER'],
  notice_window_days: 28,
  notice_counts: { SERVED: 0, OPEN: 1, LAPSED: 1, UNKNOWN: 0 },
  notice_lapsed_days: 1,
  notice_as_of: '2026-09-15',
  beyond_float_days: {
    COMPENSABLE: 0, NON_COMPENSABLE: 1, EXCUSABLE: 0, CONTESTED: 0,
  },
  adjudicated_beyond_float_days: {
    COMPENSABLE: 0, NON_COMPENSABLE: 0, EXCUSABLE: 0, CONTESTED: 0,
  },
  float_basis:
    'Total float is computed from the baseline network — the slack the PLAN gave an activity.',
  network: {
    activities_scheduled: 120,
    critical_activities: 12,
    project_finish: '2026-10-12',
    authored_finish: '2026-09-28',
    logic_conflicts: 27,
    logic_matches_dates: false,
    unresolved_activities: [],
    dangling_predecessors: [],
    calendar_basis: 'calendar days; no working calendar is applied',
  },
  concurrency: {
    pairs: [],
    total_pairs: 0,
    pairs_listed: 0,
    counts: { CONFLICT: 0, UNRESOLVED: 0, ALIGNED: 0 },
    beyond_float_pairs: 0,
    note: 'A SAME_ACTIVITY overlap is definitional.',
  },
  impact_days_basis:
    "Each activity's whole finish slip is credited to every cause recorded against it, so these are upper bounds.",
  unadjudicated_note: 'Rows without a planner ruling are proposals.',
  notice_note: 'Notice windows are 28 days from the date the delay was evidenced.',
  computed_at: '2026-09-15T09:00:00',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getDelayAttribution').mockResolvedValue(MATRIX);
});

/** Wait for the matrix to load and the first delay to auto-select. */
async function ready() {
  wrap(<Delay />);
  await screen.findByText(/Record a notice given/);
}

describe('a proposal never renders as a finding', () => {
  it('marks every unruled row as a proposal', async () => {
    await ready();
    expect(screen.getAllByText('proposal')).toHaveLength(2);
  });

  it('shows the proposal beside the ruling, so an override reads as one', async () => {
    vi.spyOn(api, 'getDelayAttribution').mockResolvedValue({
      ...MATRIX,
      events: [
        {
          ...ABSORBED,
          liability_final: 'COMPENSABLE',
          liability_effective: 'COMPENSABLE',
          adjudicated: true,
          adjudication_note: 'Fence handover was an owner obligation.',
        },
        CRITICAL,
      ],
      adjudicated_events: 1,
    });
    await ready();

    expect(screen.getByText('Proposed')).toBeInTheDocument();
    expect(screen.getByText('Ruled')).toBeInTheDocument();
    // Both values on screen at once: the machine's and the planner's.
    expect(screen.getAllByText('Contested').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Compensable').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Fence handover was an owner obligation/)
    ).toBeInTheDocument();
  });

  it('carries the upper-bound caveat from the API rather than restating it', async () => {
    await ready();
    expect(screen.getByText(/upper bounds/)).toBeInTheDocument();
  });
});

describe('the numbers a claim is argued from', () => {
  it('shows the whole slip beside the part that outran float', async () => {
    await ready();
    // The float line appears in the queue row and again in the detail pane,
    // deliberately: a planner scanning the list needs it as much as one
    // reading the evidence. getAllByText, because both are correct.
    expect(
      screen.getAllByText(/21d slip · absorbed by 100d float/).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/1d slip · 1d beyond float · critical path/).length
    ).toBeGreaterThan(0);
  });

  it('states the baseline conflict before the figures that rest on it', async () => {
    await ready();
    expect(
      screen.getByText(/of the logic ties it states/)
    ).toBeInTheDocument();
    expect(screen.getByText('2026-10-12')).toBeInTheDocument();
    expect(screen.getByText('2026-09-28')).toBeInTheDocument();
  });

  it('says a closed notice window means none was recorded, not none given', async () => {
    await ready();
    expect(
      screen.getByText(/Notice window closed 2026-07-30 — 47d ago, none recorded/)
    ).toBeInTheDocument();
  });

  it('cites the file and row the evidence came from', async () => {
    await ready();
    expect(
      screen.getByText(/civil_progress.xlsx, row 18 · civil/)
    ).toBeInTheDocument();
  });
});

describe('planner actions', () => {
  it('sends the ruling and the note the planner typed', async () => {
    const classify = vi.spyOn(api, 'classifyDelay').mockResolvedValue({
      delay_event_id: 'de-1',
      activity_id: 'CIV-DWG-1015',
      liability_proposed: 'CONTESTED',
      liability_previous: null,
      liability_final: 'COMPENSABLE',
      overrides_proposal: true,
      audit_records_created: 1,
      message: 'Delay on CIV-DWG-1015 ruled COMPENSABLE',
    });
    await ready();

    fireEvent.change(screen.getByPlaceholderText(/Why \(recorded/), {
      target: { value: 'Fence handover was an owner obligation.' },
    });
    fireEvent.click(document.getElementById('rule-COMPENSABLE')!);

    await waitFor(() => expect(classify).toHaveBeenCalledTimes(1));
    expect(classify).toHaveBeenCalledWith('de-1', {
      liability: 'COMPENSABLE',
      note: 'Fence handover was an owner obligation.',
    });
  });

  it('offers confirming the proposal as a ruling of its own', async () => {
    const classify = vi.spyOn(api, 'classifyDelay').mockResolvedValue({
      delay_event_id: 'de-1',
      activity_id: 'CIV-DWG-1015',
      liability_proposed: 'CONTESTED',
      liability_previous: null,
      liability_final: 'CONTESTED',
      overrides_proposal: false,
      audit_records_created: 1,
      message: 'confirming the proposal',
    });
    await ready();

    // There is no accept shortcut: agreeing sends the same value, and the
    // trail then shows a human agreed rather than a default nobody read.
    // Addressed by id: the same four words are tags on every queue row.
    fireEvent.click(document.getElementById('rule-CONTESTED')!);

    await waitFor(() =>
      expect(classify).toHaveBeenCalledWith('de-1', { liability: 'CONTESTED' })
    );
  });

  it('omits an empty note rather than sending a blank string', async () => {
    const classify = vi.spyOn(api, 'classifyDelay').mockResolvedValue({
      delay_event_id: 'de-1',
      activity_id: 'CIV-DWG-1015',
      liability_proposed: 'CONTESTED',
      liability_previous: null,
      liability_final: 'EXCUSABLE',
      overrides_proposal: true,
      audit_records_created: 1,
      message: 'ok',
    });
    await ready();

    fireEvent.click(document.getElementById('rule-EXCUSABLE')!);

    await waitFor(() =>
      expect(classify).toHaveBeenCalledWith('de-1', { liability: 'EXCUSABLE' })
    );
  });

  it('records a notice with the date it was given', async () => {
    const notice = vi.spyOn(api, 'recordDelayNotice').mockResolvedValue({
      delay_event_id: 'de-1',
      activity_id: 'CIV-DWG-1015',
      evidenced_on: '2026-09-02',
      notice_due_on: '2026-09-30',
      notice_served_on: '2026-09-10',
      notice_reference: 'NAVIS/NOT/2026-014',
      previous_served_on: null,
      served_late: false,
      audit_records_created: 1,
      message: 'Notice recorded',
    });
    await ready();

    fireEvent.change(screen.getByLabelText('Date notice was given'), {
      target: { value: '2026-09-10' },
    });
    fireEvent.change(screen.getByLabelText('Notice reference'), {
      target: { value: 'NAVIS/NOT/2026-014' },
    });
    fireEvent.click(screen.getByText('Record notice'));

    await waitFor(() => expect(notice).toHaveBeenCalledTimes(1));
    expect(notice).toHaveBeenCalledWith('de-1', {
      served_on: '2026-09-10',
      reference: 'NAVIS/NOT/2026-014',
    });
  });

  it('will not record a notice with no date', async () => {
    const notice = vi.spyOn(api, 'recordDelayNotice');
    await ready();

    fireEvent.click(screen.getByText('Record notice'));

    expect(notice).not.toHaveBeenCalled();
  });

  it('clears the composers when the selection moves', async () => {
    await ready();
    const note = screen.getByPlaceholderText(/Why \(recorded/) as HTMLInputElement;
    fireEvent.change(note, { target: { value: 'about the first delay' } });

    fireEvent.click(screen.getByText('CIV-PLY-1004'));

    // A note typed against one ruling must never be submitted with another.
    await waitFor(() =>
      expect(
        (screen.getByPlaceholderText(/Why \(recorded/) as HTMLInputElement).value
      ).toBe('')
    );
  });
});

describe('the report', () => {
  it('links to both renderings on the API origin', async () => {
    await ready();
    const open = screen.getByText('Open report').closest('a');
    const csv = screen.getByText('Download CSV').closest('a');

    expect(open).toHaveAttribute('href', expect.stringContaining('/delay/report?format=html'));
    expect(open).toHaveAttribute('target', '_blank');
    expect(csv).toHaveAttribute('href', expect.stringContaining('format=csv'));
    expect(csv).toHaveAttribute('download');
  });
});
