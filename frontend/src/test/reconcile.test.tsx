import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Reconcile from '../pages/Reconcile';
import { api } from '../lib/api';
import { Clarification, ReviewItem } from '../types';

/**
 * The planner half of the clarification loop.
 *
 * FieldClarifications.tsx already reads and answers questions; until this
 * action existed nothing in the planner UI could create one, so the loop only
 * closed against seeded data. These assert the request that goes out, because
 * that is the contract POST /review/{item_id}/clarify is written against.
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

const ITEM: ReviewItem = {
  id: 'rq-7742',
  linked_event_id: 'ev-1',
  activity_id: 'PIP-ERC-1034',
  reason: 'low_confidence',
  priority: 'high',
  status: 'pending',
  source_span: 'spool erection',
  raw_text: 'spool erection on the 24 inch header is done',
  confidence: 0.61,
  tags: [],
  discipline: 'piping',
  suggested_activity_id: 'PIP-ERC-1034',
  alternatives: ['PIP-ERC-1035'],
  created_at: '2026-09-15T09:00:00',
};

const ANSWER: Clarification = {
  id: 'rq-7742',
  review_item_id: 'rq-7742',
  reference: 'FR-2026-09-15-AB12',
  original_text: ITEM.raw_text,
  question: 'Which header — north or south?',
  asked_by: 'Priya Das',
  asked_at: '2026-09-15T09:30:00',
  answered: false,
  response: null,
  answered_at: null,
  matched_activity_id: 'PIP-ERC-1034',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getReviewQueue').mockResolvedValue([ITEM]);
  vi.spyOn(api, 'getSchedule').mockResolvedValue({
    project: 'OIL Well-Site Duliajan',
    data_date: '2026-09-15',
    activities: [],
  } as never);
});

/** Wait for the queue to load and the first item to auto-select.
 *
 * Waiting for "Ask Supervisor" is not enough: it renders as soon as an ITEM
 * is selected, while Confirm stays disabled until the effect that picks a
 * CANDIDATE has run. Under a parallel run the click landed in that window and
 * hit a disabled button, so the resolve tests passed alone and failed
 * alongside any other file. Wait for the state the tests actually depend on.
 */
async function ready() {
  wrap(<Reconcile />);
  await screen.findByText(/Ask Supervisor/);
  await waitFor(() =>
    expect(document.getElementById('confirm-match')).not.toBeDisabled()
  );
}

describe('planner clarify action', () => {
  it('sends the selected item id and the typed question', async () => {
    const ask = vi.spyOn(api, 'askClarification').mockResolvedValue(ANSWER);
    await ready();

    fireEvent.click(screen.getByText(/Ask Supervisor/));
    const input = await screen.findByPlaceholderText(/ask the supervisor/i);
    fireEvent.change(input, {
      target: { value: '  Which header — north or south?  ' },
    });
    fireEvent.click(screen.getByText('Send Question'));

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    // Exactly the two arguments POST /review/{item_id}/clarify takes. The
    // question is trimmed; asked_by is left for the server to default,
    // because this app has no authentication and so no person to name.
    expect(ask).toHaveBeenCalledWith('rq-7742', {
      question: 'Which header — north or south?',
    });
  });

  it('opens the composer on the A key and sends from it', async () => {
    const ask = vi.spyOn(api, 'askClarification').mockResolvedValue(ANSWER);
    await ready();

    fireEvent.keyDown(window, { key: 'a' });
    const input = await screen.findByPlaceholderText(/ask the supervisor/i);
    fireEvent.change(input, { target: { value: 'Confirm the pour date' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(ask).toHaveBeenCalledWith('rq-7742', {
        question: 'Confirm the pour date',
      })
    );
  });

  it('confirms on success and leaves the item in the queue', async () => {
    vi.spyOn(api, 'askClarification').mockResolvedValue(ANSWER);
    const resolve = vi.spyOn(api, 'resolveReview');
    await ready();

    fireEvent.click(screen.getByText(/Ask Supervisor/));
    fireEvent.change(await screen.findByPlaceholderText(/ask the supervisor/i), {
      target: { value: 'Which header?' },
    });
    fireEvent.click(screen.getByText('Send Question'));

    // Same toast treatment the three resolve actions use.
    expect(
      await screen.findByText(/Question sent to the supervisor/)
    ).toBeInTheDocument();
    // Asking is not resolving: the item is still selected and nothing was
    // sent to /review/{id}/resolve.
    expect(resolve).not.toHaveBeenCalled();
    expect(screen.getByText(/Ask Supervisor/)).toBeInTheDocument();
  });

  it('will not send an empty question', async () => {
    const ask = vi.spyOn(api, 'askClarification');
    await ready();

    fireEvent.click(screen.getByText(/Ask Supervisor/));
    await screen.findByPlaceholderText(/ask the supervisor/i);
    fireEvent.click(screen.getByText('Send Question'));

    expect(await screen.findByText(/A question is required/)).toBeInTheDocument();
    expect(ask).not.toHaveBeenCalled();
  });

  it('leaves the three resolve actions reachable', async () => {
    await ready();
    for (const label of [/Confirm Match/, /Mark New/, /Reject/]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

/**
 * The bodies the three closing actions put on POST /review/{id}/resolve.
 *
 * `ResolveRequest` accepts exactly confirm / reassign / create / ignore, and
 * 'confirm' commits `item.activity_id` regardless of any activity_id in the
 * body. All three actions were sending something the server could not act on
 * correctly, so these assert the payload rather than the rendering.
 */
describe('planner resolve actions', () => {
  const RESOLVED = {
    review_item_id: 'rq-7742',
    resolution: 'confirm',
    activity_id: 'PIP-ERC-1034',
    alias_entries_created: 1,
    audit_records_created: 1,
    message: 'Review item resolved',
  };

  it('confirms the matcher proposal without an activity_id', async () => {
    const resolve = vi.spyOn(api, 'resolveReview').mockResolvedValue(RESOLVED as never);
    await ready();

    fireEvent.click(screen.getByText(/Confirm Match/));

    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    // 'confirm' commits item.activity_id; sending one would be ignored.
    expect(resolve).toHaveBeenCalledWith('rq-7742', { action: 'confirm' });
  });

  it('reassigns when the planner picks a different candidate', async () => {
    const resolve = vi.spyOn(api, 'resolveReview').mockResolvedValue(RESOLVED as never);
    await ready();

    // '2' selects the second ranked candidate — PIP-ERC-1035, not the
    // suggestion. Confirming that as 'confirm' would have linked the event to
    // PIP-ERC-1034, the activity the planner just passed over.
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.click(screen.getByText(/Confirm Match/));

    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    expect(resolve).toHaveBeenCalledWith('rq-7742', {
      action: 'reassign',
      activity_id: 'PIP-ERC-1035',
    });
  });

  it('creates a new activity with both an id and a description', async () => {
    const resolve = vi.spyOn(api, 'resolveReview').mockResolvedValue(RESOLVED as never);
    await ready();

    fireEvent.click(screen.getByText(/Mark New/));
    fireEvent.change(await screen.findByPlaceholderText(/short description/i), {
      target: { value: '  Tie-in spool at the north header  ' },
    });
    fireEvent.click(screen.getByText('Save Activity'));

    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    // The id is derived from the item, not the clock, so it is stable across
    // a retry and cannot collide with a second planner in the same second.
    expect(resolve).toHaveBeenCalledWith('rq-7742', {
      action: 'create',
      new_activity_id: 'NEW-PIP-RQ7742',
      new_description: 'Tie-in spool at the north header',
    });
  });

  it('rejects as ignore, and only on the second press', async () => {
    const resolve = vi.spyOn(api, 'resolveReview').mockResolvedValue(RESOLVED as never);
    await ready();

    fireEvent.click(screen.getByText(/Reject/));
    expect(resolve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Press again to reject/));

    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    expect(resolve).toHaveBeenCalledWith('rq-7742', { action: 'ignore' });
  });

  it('confirms a withheld finish date rather than reassigning it', async () => {
    // The server accepts only confirm and ignore on this reason, so a
    // differing candidate must not turn Confirm into a reassign.
    vi.spyOn(api, 'getReviewQueue').mockResolvedValue([
      { ...ITEM, reason: 'defaulted_finish_date' },
    ]);
    const resolve = vi.spyOn(api, 'resolveReview').mockResolvedValue(RESOLVED as never);
    await ready();

    fireEvent.keyDown(window, { key: '2' });
    fireEvent.click(screen.getByText(/Confirm Match/));

    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    expect(resolve).toHaveBeenCalledWith('rq-7742', { action: 'confirm' });
  });
});

describe('Reconcile information architecture & auto-link decision UI', () => {
  it('renders explicit PRIORITY: HIGH in queue card and clear filter tabs', async () => {
    await ready();
    expect(screen.getByText(/PRIORITY:/)).toBeInTheDocument();
    expect(screen.getByText(/HIGH/)).toBeInTheDocument();
    expect(screen.getByText(/High Conf/)).toBeInTheDocument();
    expect(screen.getByText(/Needs Review/)).toBeInTheDocument();
  });

  it('renders Why NAVIS did not auto-link and Auto-Link Decision metrics', async () => {
    await ready();
    expect(screen.getByText('Why NAVIS did not auto-link')).toBeInTheDocument();
    expect(screen.getByText('Auto-Link Decision')).toBeInTheDocument();
    expect(screen.getAllByText(/Auto-link threshold/i).length).toBeGreaterThan(0);
    expect(screen.getByText('77.5%')).toBeInTheDocument();
    expect(screen.getByText(/Planner decision required/i)).toBeInTheDocument();
  });

  it('renders NAVIS Extracted structured breakdown beneath supervisor statement', async () => {
    await ready();
    expect(screen.getByText('What the supervisor said')).toBeInTheDocument();
    expect(screen.getByText('NAVIS Extracted')).toBeInTheDocument();
    expect(screen.getByText('Entity Extraction')).toBeInTheDocument();
    expect(screen.getByText('PIPING')).toBeInTheDocument();
  });

  it('renders compressed candidate cards with human-readable signal chips', async () => {
    await ready();
    expect(screen.getByText(/Candidate Activities/)).toBeInTheDocument();
    expect(screen.getAllByText(/PIP-ERC-1034/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Date/i).length).toBeGreaterThan(0);
  });

  it('renders IF CONFIRMED destination consequence preview', async () => {
    await ready();
    expect(screen.getByText(/IF CONFIRMED/)).toBeInTheDocument();
    expect(screen.getByText(/This field update will be linked to:/)).toBeInTheDocument();
    expect(screen.getByText(/Schedule → PIP-ERC-1034/)).toBeInTheDocument();
  });

  it('renders defensible action button labels', async () => {
    await ready();
    expect(screen.getByText(/Confirm Match/)).toBeInTheDocument();
    expect(screen.getByText(/Flag as Unplanned Work \(Mark New\)/)).toBeInTheDocument();
    expect(screen.getByText(/Ask Supervisor/)).toBeInTheDocument();
    expect(screen.getByText(/Reject Report/)).toBeInTheDocument();
  });
});

