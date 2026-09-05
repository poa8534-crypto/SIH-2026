import React, { useState } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AskNavisChat } from '../components/AskNavisChat';
import ReportStudio from '../pages/field/ReportStudio';
import { SessionContext } from '../hooks/useSession';
import { api } from '../lib/api';
import type { AgentTurnResponse } from '../types';

/**
 * Ask NAVIS is assistance. It is not the reporting flow.
 *
 * The reporting screen used to carry a permanently embedded "Field Update
 * Assistant" — a chat panel occupying a third of the width, which answered
 * itself on a `setTimeout` and through which the required clarification
 * questions arrived. Two consequences: the questions a report could not be
 * submitted without were mixed in with general chit-chat, and a supervisor on
 * a phone lost a third of the screen to a panel they had not asked for.
 *
 * Clarification now lives in the reporting flow (see `fieldStudio.test.tsx`).
 * What is left here is general assistance, behind a button, in every role.
 * See D-095.
 */

const READY: AgentTurnResponse = {
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

/** A page with the reporting form and a chat launcher, the way every shell
 *  composes them: siblings, so opening the panel cannot unmount the form. */
function Workspace() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ask NAVIS
      </button>
      <ReportStudio />
      <AskNavisChat isOpen={open} onClose={() => setOpen(false)} role="field" />
    </>
  );
}

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

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('the chat never opens itself', () => {
  it.each(['field', 'planner', 'executive'] as const)(
    'stays closed until asked, for the %s role',
    (role) => {
      const { container } = render(
        <MemoryRouter>
          <AskNavisChat isOpen={false} onClose={() => {}} role={role} />
        </MemoryRouter>
      );
      expect(container.firstChild).toBeNull();
    }
  );

  it.each(['field', 'planner', 'executive'] as const)(
    'closes on Escape and on the close button, for the %s role',
    (role) => {
      const onClose = vi.fn();
      render(
        <MemoryRouter>
          <AskNavisChat isOpen onClose={onClose} role={role} />
        </MemoryRouter>
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByLabelText('Close Ask NAVIS'));
      expect(onClose).toHaveBeenCalledTimes(2);
    }
  );
});

describe('focus', () => {
  it('returns to the trigger when the panel closes', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Ask NAVIS
          </button>
          <AskNavisChat isOpen={open} onClose={() => setOpen(false)} role="field" />
        </>
      );
    }
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    );

    const trigger = screen.getByRole('button', { name: 'Ask NAVIS' });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole('dialog');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );

    // Without restoration this is document.body, and a keyboard user is
    // returned to the top of the page.
    expect(document.activeElement).toBe(trigger);
  });
});

describe('reporting and chat are separate', () => {
  it('reporting is fully usable with the chat closed', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(READY);
    wrap(<Workspace />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('What happened on site'), {
      target: { value: 'P-201 spool erection complete' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Check report/ }));

    expect(await screen.findByText('Review your report')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Send to planner review/ })
    ).toBeEnabled();
  });

  it('preserves the draft across opening and closing the chat', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(READY);
    vi.spyOn(api, 'askChat').mockResolvedValue({
      answer: 'Describe the work and the quantity.',
      citations: [],
      grounded: true,
      model_available: false,
      suggested_actions: [],
    } as never);
    wrap(<Workspace />);

    fireEvent.change(screen.getByLabelText('What happened on site'), {
      target: { value: 'P-201 spool erection complete' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Check report/ }));
    await screen.findByText('Review your report');

    fireEvent.click(screen.getByRole('button', { name: 'Ask NAVIS' }));
    await screen.findByRole('dialog');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );

    // Draft, interpretation and the enabled submit all survive.
    expect(screen.getByLabelText('What happened on site')).toHaveValue(
      'P-201 spool erection complete'
    );
    expect(screen.getByText('Review your report')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Send to planner review/ })
    ).toBeEnabled();
  });

  it('a chat message cannot submit a report or approve anything', async () => {
    const turnSpy = vi.spyOn(api, 'agentTurn').mockResolvedValue(READY);
    const chatSpy = vi.spyOn(api, 'askChat').mockResolvedValue({
      answer: 'Submitting is done from the report screen.',
      citations: [],
      grounded: true,
      model_available: false,
      suggested_actions: [],
    } as never);
    wrap(<Workspace />);

    fireEvent.click(screen.getByRole('button', { name: 'Ask NAVIS' }));
    await screen.findByRole('dialog');

    const input = screen.getByPlaceholderText(/ask/i);
    fireEvent.change(input, { target: { value: 'submit my report please' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(chatSpy).toHaveBeenCalled());
    // The chat talks to /chat, which is read-only. It never reaches the
    // agent turn endpoint, which is the only path that can persist an update.
    expect(turnSpy).not.toHaveBeenCalled();
  });
});
