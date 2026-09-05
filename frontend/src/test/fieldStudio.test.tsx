import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ReportStudio from '../pages/field/ReportStudio';
import UpdatesLedger from '../pages/field/UpdatesLedger';
import { SessionContext } from '../hooks/useSession';
import { api, ApiError } from '../lib/api';
import type { AgentTurnResponse } from '../types';

/**
 * The Report Studio, and the one thing it must never do.
 *
 * It used to end its submit handler in `catch { setSubmitted(true) }`, so an
 * unreachable API produced "Dispatched to Project Controls" — a supervisor
 * told their work was filed when nothing had left the browser. The old tests
 * in this file asserted the fabricated content that shipped alongside it (the
 * geo-stamped photo card, `ACT-PIP-201-04`, the scripted chat) and so passed
 * throughout.
 *
 * The first test below is the acceptance condition: disconnecting the API
 * cannot produce a success screen. See D-091.
 */

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={{ role: 'field', signOut: vi.fn() }}>
        <MemoryRouter>{ui}</MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>
  );
}

const PROPOSAL: AgentTurnResponse = {
  session_id: 's1',
  turn_number: 1,
  agent_message: 'I have enough to prepare the update.',
  slots: {
    discipline: 'piping',
    location: 'Sector A · Digboi Well #4',
    quantity: 12,
    planned_quantity: 12,
    quantity_over_planned: false,
    uom: 'nos',
    tags: ['P-201'],
    status: 'complete',
    activity_id: 'PIP-ERC-1031',
    description: 'P-201 spool erection complete',
    date: '2026-09-14',
    confidence: 0.91,
    activity_description: 'Spool Erection — Rack P1',
    match_outcome: 'AUTO_LINK',
    alternatives: [],
  },
  pending_slots: [],
  event_created: false,
  linked_event_id: null,
  confidence: 0.91,
  awaiting_confirmation: true,
  activity_description: 'Spool Erection — Rack P1',
  match_outcome: 'AUTO_LINK',
  review_item_id: null,
  discipline_label: 'Piping',
  status_label: 'Completed',
  choices: null,
};

const PERSISTED: AgentTurnResponse = {
  ...PROPOSAL,
  turn_number: 2,
  agent_message: 'Sent for Planning Engineer review. The schedule has not been changed yet.',
  event_created: true,
  linked_event_id: 'le-9001',
  review_item_id: 'rq-4477',
  awaiting_confirmation: false,
};

const submitButton = () =>
  screen.getByRole('button', { name: /Send to planner review/ });

/** Type a report and get to the point where the submit button is live. */
async function reachProposal() {
  wrap(<ReportStudio />);
  fireEvent.change(screen.getByLabelText('What work was done'), {
    target: { value: 'P-201 spool erection complete, 12 studs torqued' },
  });
  fireEvent.click(screen.getByText('Parse this report'));
  await screen.findByText(/91.0% match confidence/);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('the submit path', () => {
  it('cannot show success when the API is unreachable', async () => {
    const spy = vi
      .spyOn(api, 'agentTurn')
      .mockResolvedValueOnce(PROPOSAL)
      .mockRejectedValueOnce(new Error('Failed to fetch'));

    await reachProposal();
    fireEvent.click(screen.getByText('Send to planner review'));

    expect(await screen.findByText('Not submitted')).toBeInTheDocument();
    expect(screen.queryByText(/Dispatched/)).not.toBeInTheDocument();
    expect(screen.queryByText('Sent for planner review')).not.toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('keeps the draft on screen when submission fails', async () => {
    vi.spyOn(api, 'agentTurn')
      .mockResolvedValueOnce(PROPOSAL)
      .mockRejectedValueOnce(new ApiError(503, 'Service Unavailable'));

    await reachProposal();
    fireEvent.click(screen.getByText('Send to planner review'));
    await screen.findByText('Not submitted');

    // The supervisor's words are still there, and the screen says so.
    expect(screen.getByLabelText('What work was done')).toHaveValue(
      'P-201 spool erection complete, 12 studs torqued'
    );
    expect(screen.getByText(/Service Unavailable/)).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing was sent and nothing was stored anywhere/)
    ).toBeInTheDocument();
  });

  it('does not claim success when the server answers without persisting', async () => {
    // A 200 that did not write: event_created false, still an open slot.
    vi.spyOn(api, 'agentTurn')
      .mockResolvedValueOnce(PROPOSAL)
      .mockResolvedValueOnce({
        ...PROPOSAL,
        agent_message: 'I need one more thing before I can send this. What date?',
        event_created: false,
        awaiting_confirmation: false,
        pending_slots: ['date'],
      });

    await reachProposal();
    fireEvent.click(screen.getByText('Send to planner review'));

    expect(await screen.findByText('Not submitted')).toBeInTheDocument();
    expect(screen.getAllByText(/I need one more thing/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Sent for planner review')).not.toBeInTheDocument();
  });

  it('shows success only with a persisted row id, and names it', async () => {
    vi.spyOn(api, 'agentTurn')
      .mockResolvedValueOnce(PROPOSAL)
      .mockResolvedValueOnce(PERSISTED);

    await reachProposal();
    fireEvent.click(screen.getByText('Send to planner review'));

    expect(await screen.findByText('Sent for planner review')).toBeInTheDocument();
    expect(screen.getByText('rq-4477')).toBeInTheDocument();
    expect(screen.getByText('PIP-ERC-1031')).toBeInTheDocument();
    expect(screen.getByText(/schedule has not been changed/i)).toBeInTheDocument();
  });

  it('refuses to submit before the server says the report is complete', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue({
      ...PROPOSAL,
      awaiting_confirmation: false,
      pending_slots: ['date'],
      agent_message: 'What date did this finish?',
    });

    wrap(<ReportStudio />);
    // Nothing parsed yet: the button is dead.
    expect(submitButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText('What work was done'), {
      target: { value: 'spool erection done' },
    });
    fireEvent.click(screen.getByText('Parse this report'));
    await screen.findByText(/What date did this finish/);

    expect(submitButton()).toBeDisabled();
    expect(
      screen.getByText('The server has not said this is complete yet.')
    ).toBeInTheDocument();
  });
});

describe('what the studio sends', () => {
  it('sends the text actually typed, with the chosen date and discipline', async () => {
    const spy = vi.spyOn(api, 'agentTurn').mockResolvedValue(PROPOSAL);

    wrap(<ReportStudio />);
    fireEvent.change(screen.getByLabelText('What work was done'), {
      target: { value: 'Poured 40 m3 on the raft at Pad-04' },
    });
    fireEvent.change(screen.getByLabelText('Reported work date'), {
      target: { value: '2026-09-11' },
    });
    fireEvent.change(screen.getByLabelText('Discipline'), {
      target: { value: 'civil' },
    });
    fireEvent.click(screen.getByText('Parse this report'));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const sent = spy.mock.calls[0][0];
    expect(sent.message).toBe('Poured 40 m3 on the raft at Pad-04');
    expect(sent.confirm).toBe(false);
    expect(sent.context?.data_date).toBe('2026-09-11');
    expect(sent.context?.discipline).toBe('civil');
  });

  it('commits only on the confirm turn', async () => {
    const spy = vi
      .spyOn(api, 'agentTurn')
      .mockResolvedValueOnce(PROPOSAL)
      .mockResolvedValueOnce(PERSISTED);

    await reachProposal();
    fireEvent.click(screen.getByText('Send to planner review'));
    await screen.findByText('Sent for planner review');

    expect(spy.mock.calls[0][0].confirm).toBe(false);
    expect(spy.mock.calls[1][0].confirm).toBe(true);
    // Same session, so the server can treat a retry as idempotent.
    expect(spy.mock.calls[1][0].session_id).toBe(spy.mock.calls[0][0].session_id);
  });
});

describe('what the studio no longer asserts', () => {
  it('shows the matcher confidence, not a hardcoded one', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(PROPOSAL);
    await reachProposal();

    expect(screen.getByText(/91.0% match confidence/)).toBeInTheDocument();
    expect(screen.queryByText(/98.4%/)).not.toBeInTheDocument();
  });

  it('makes no GPS, Exif or P6 acceptance claim', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(PROPOSAL);
    await reachProposal();

    for (const claim of [
      /GPS VERIFIED/i,
      /GEO-STAMPED/i,
      /IMG_8821/,
      /Exif/i,
      /Rev-08/,
      /baseline staging/i,
      /0 Days Variance/i,
      /ACT-PIP-201-04/,
    ]) {
      expect(screen.queryByText(claim)).not.toBeInTheDocument();
    }
  });

  it('renders an em dash for a slot the agent did not fill', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue({
      ...PROPOSAL,
      slots: { ...PROPOSAL.slots, tags: [], quantity: null, uom: null },
    });
    await reachProposal();

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('UpdatesLedger', () => {
  it('renders the updates ledger', () => {
    wrap(<UpdatesLedger />);
    expect(screen.getByText('My Updates')).toBeInTheDocument();
  });
});
