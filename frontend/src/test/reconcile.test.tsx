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

/** Wait for the queue to load and the first item to auto-select. */
async function ready() {
  wrap(<Reconcile />);
  await screen.findByText(/Ask Supervisor/);
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
