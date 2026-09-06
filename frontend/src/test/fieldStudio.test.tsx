import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ReportStudio from '../pages/field/ReportStudio';
import UpdatesLedger from '../pages/field/UpdatesLedger';
import { SessionContext } from '../hooks/useSession';
import { api, ApiError } from '../lib/api';
import type { AgentTurnResponse } from '../types';

/**
 * The reporting flow, state by state.
 *
 * Two defects motivate most of this file. The first: the submit handler used
 * to end in `catch { setSubmitted(true) }`, so an unreachable API produced
 * "Dispatched to Project Controls". The second: the screen had only two
 * states — "no response" and "a response" — so ANY 200 opened the
 * interpretation panel. "I love pizza", which the server refuses outright,
 * rendered under "NAVIS understood" beside a discipline chip reading Civil,
 * because the form defaulted to the first entry in the list and sent it as
 * context.
 *
 * The tests below walk the journeys those defects hid: empty, irrelevant,
 * incomplete, unmatched, edited-after-checking, and the two different kinds
 * of failure. See D-091 and D-095.
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

const SLOTS = {
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
};

/** Every required slot filled, an activity matched: the submit button lives. */
const READY: AgentTurnResponse = {
  session_id: 's1',
  turn_number: 1,
  agent_message: 'I have enough to prepare the update.',
  slots: SLOTS,
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

/** The server refused it: not a report about work at all. */
const INVALID: AgentTurnResponse = {
  ...READY,
  agent_message:
    "I can't log that — it does not describe site work, a quantity, an equipment tag, or something that stopped work. Tell me what happened on site.",
  slots: {
    ...SLOTS,
    discipline: null,
    activity_id: null,
    activity_description: null,
    tags: [],
    quantity: null,
    status: null,
    date: null,
    match_outcome: 'not_a_progress_report',
    confidence: 0,
  },
  confidence: 0,
  awaiting_confirmation: false,
  activity_description: null,
  match_outcome: 'not_a_progress_report',
  discipline_label: null,
  status_label: null,
};

/** Relevant, but a slot is still open. */
const NEEDS_DATE: AgentTurnResponse = {
  ...READY,
  agent_message: 'Which date was it completed?',
  slots: { ...SLOTS, date: null },
  pending_slots: ['date'],
  awaiting_confirmation: false,
  choices: 'Today, Yesterday',
};

/** Relevant and complete, and nothing in the schedule matched. */
const UNMATCHED: AgentTurnResponse = {
  ...READY,
  agent_message: 'I have enough to prepare the update.',
  slots: { ...SLOTS, activity_id: null, activity_description: null },
  activity_description: null,
  match_outcome: 'NEW_ACTIVITY',
  confidence: 0.12,
};

const PERSISTED: AgentTurnResponse = {
  ...READY,
  turn_number: 2,
  agent_message: 'Sent for Planning Engineer review. The schedule has not been changed yet.',
  event_created: true,
  linked_event_id: 'le-9001',
  review_item_id: 'rq-4477',
  awaiting_confirmation: false,
};

const checkButton = () => screen.getByRole('button', { name: /Check report|Check again|Checking/ });
const submitButton = () =>
  screen.getByRole('button', { name: /Send to planner review|Send for a planner to place|Submitting/ });

function typeReport(text: string) {
  fireEvent.change(screen.getByLabelText('What happened on site'), {
    target: { value: text },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

// ── Journey 1: an untouched form ────────────────────────────────────────────

describe('an untouched form', () => {
  it('shows only the composer, and asks the server nothing', () => {
    const spy = vi.spyOn(api, 'agentTurn');
    wrap(<ReportStudio />);

    expect(screen.getByLabelText('What happened on site')).toBeInTheDocument();
    // No interpretation, no status panel, no refusal.
    expect(screen.queryByText('Review your report')).not.toBeInTheDocument();
    expect(screen.queryByText('A few details needed')).not.toBeInTheDocument();
    expect(screen.queryByText(/NAVIS understood/)).not.toBeInTheDocument();

    expect(checkButton()).toBeDisabled();
    expect(submitButton()).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('prefills the assigned supervisor discipline (Piping)', () => {
    wrap(<ReportStudio />);
    const select = screen.getByLabelText('Discipline') as HTMLSelectElement;

    expect(select.value).toBe('piping');
  });

  it('honours a saved preference, which is the only legitimate default', () => {
    window.localStorage.setItem('navis.discipline', 'electrical');
    wrap(<ReportStudio />);

    expect((screen.getByLabelText('Discipline') as HTMLSelectElement).value).toBe(
      'electrical'
    );
  });

  it('sends no discipline when none is chosen', async () => {
    const spy = vi.spyOn(api, 'agentTurn').mockResolvedValue(READY);
    wrap(<ReportStudio />);
    fireEvent.change(screen.getByLabelText('Discipline'), {
      target: { value: '' },
    });
    typeReport('spool erection complete');
    fireEvent.click(checkButton());

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][0].context).not.toHaveProperty('discipline');
  });
});

// ── Journey 2: irrelevant input ─────────────────────────────────────────────

describe('irrelevant input', () => {
  it('shows validation, not extracted results', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(INVALID);
    wrap(<ReportStudio />);
    typeReport('I love pizza');
    fireEvent.click(checkButton());

    expect(
      await screen.findByText('This does not look like a site report')
    ).toBeInTheDocument();
    // Also echoed in the collapsed transcript below, hence getAllByText.
    expect(screen.getAllByText(/it does not describe site work/).length).toBeGreaterThan(0);

    // The interpretation panel must not open on a refusal.
    expect(screen.queryByText('Review your report')).not.toBeInTheDocument();
    expect(screen.queryByText('A few details needed')).not.toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it('infers no discipline and no activity from it', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(INVALID);
    wrap(<ReportStudio />);
    typeReport('I love pizza');
    fireEvent.click(checkButton());

    await screen.findByText('This does not look like a site report');
    // The interpretation panel must not open on a refusal.
    expect(screen.queryByText('Review your report')).not.toBeInTheDocument();
    expect(screen.queryByText('A few details needed')).not.toBeInTheDocument();
    const asValue = (t: string) =>
      screen.queryAllByText(t).filter((el) => el.tagName !== 'OPTION');
    expect(asValue('Civil')).toHaveLength(0);
    expect(screen.queryByText('PIP-ERC-1031')).not.toBeInTheDocument();
  });

  it('never shows the internal outcome code', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(INVALID);
    wrap(<ReportStudio />);
    typeReport('I love pizza');
    fireEvent.click(checkButton());

    await screen.findByText('This does not look like a site report');
    expect(screen.queryByText(/not_a_progress_report/)).not.toBeInTheDocument();
  });
});

// ── Journey 3: incomplete → clarification → review ──────────────────────────

describe('an incomplete report', () => {
  it('asks for the missing detail inside the reporting flow', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(NEEDS_DATE);
    wrap(<ReportStudio />);
    typeReport('Pump installation finished');
    fireEvent.click(checkButton());

    expect(await screen.findByText('A few details needed')).toBeInTheDocument();
    expect(screen.getAllByText('Which date was it completed?').length).toBeGreaterThan(0);
    // The closed set arrives as chips, in the form — not in a chat panel.
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yesterday' })).toBeInTheDocument();
    expect(screen.getByLabelText('Answer the question')).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it('proceeds to review once the answer is given', async () => {
    vi.spyOn(api, 'agentTurn')
      .mockResolvedValueOnce(NEEDS_DATE)
      .mockResolvedValueOnce(READY);

    wrap(<ReportStudio />);
    typeReport('Pump installation finished');
    fireEvent.click(checkButton());
    await screen.findByText('A few details needed');

    fireEvent.click(screen.getByRole('button', { name: 'Yesterday' }));

    expect(await screen.findByText('Review your report')).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });
});

// ── Journey 4: relevant but unmatched ───────────────────────────────────────

describe('a relevant report with no matching activity', () => {
  it('says so, and still offers a route to the planner', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(UNMATCHED);
    wrap(<ReportStudio />);
    typeReport('Work stopped because access was blocked');
    fireEvent.click(checkButton());

    expect(await screen.findByText('No matching activity found')).toBeInTheDocument();
    expect(screen.getByText(/a planner will place it/i)).toBeInTheDocument();
    // Not a dead end: it can still be sent.
    expect(
      screen.getByRole('button', { name: /Send for a planner to place/ })
    ).toBeEnabled();
  });
});

// ── Journey 5: valid → edit → recheck → submit ──────────────────────────────

describe('editing a checked report', () => {
  it('invalidates the interpretation and requires another check', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(READY);
    wrap(<ReportStudio />);
    typeReport('P-201 spool erection complete');
    fireEvent.click(checkButton());
    await screen.findByText('Review your report');
    expect(submitButton()).toBeEnabled();

    typeReport('P-201 spool erection complete, 12 studs torqued');

    expect(screen.queryByText('Review your report')).not.toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText(/check it again/i)).toBeInTheDocument();
  });

  it('invalidates when the date changes, not only the text', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(READY);
    wrap(<ReportStudio />);
    typeReport('P-201 spool erection complete');
    fireEvent.click(checkButton());
    await screen.findByText('Review your report');

    fireEvent.change(screen.getByLabelText('Reported work date'), {
      target: { value: '2026-09-11' },
    });

    expect(submitButton()).toBeDisabled();
    expect(screen.queryByText('Review your report')).not.toBeInTheDocument();
  });

  it('invalidates when the discipline changes', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(READY);
    wrap(<ReportStudio />);
    typeReport('P-201 spool erection complete');
    fireEvent.click(checkButton());
    await screen.findByText('Review your report');

    fireEvent.change(screen.getByLabelText('Discipline'), {
      target: { value: 'civil' },
    });

    expect(submitButton()).toBeDisabled();
  });

  it('submits the rechecked draft and shows the persisted id', async () => {
    const spy = vi
      .spyOn(api, 'agentTurn')
      .mockResolvedValueOnce(READY)
      .mockResolvedValueOnce(READY)
      .mockResolvedValueOnce(PERSISTED);

    wrap(<ReportStudio />);
    typeReport('P-201 spool erection complete');
    fireEvent.click(checkButton());
    await screen.findByText('Review your report');

    typeReport('P-201 spool erection complete, 12 studs torqued');
    fireEvent.click(checkButton());
    await screen.findByText('Review your report');

    fireEvent.click(submitButton());
    expect(await screen.findByText('Sent for planner review')).toBeInTheDocument();
    expect(screen.getByText('rq-4477')).toBeInTheDocument();

    // The confirm turn carried the edited text's session, and only it had
    // confirm set.
    expect(spy.mock.calls[0][0].confirm).toBe(false);
    expect(spy.mock.calls[1][0].confirm).toBe(false);
    expect(spy.mock.calls[2][0].confirm).toBe(true);
    // A new session after the edit, so stale server-side slots cannot leak in.
    expect(spy.mock.calls[1][0].session_id).not.toBe(spy.mock.calls[0][0].session_id);
    expect(spy.mock.calls[2][0].session_id).toBe(spy.mock.calls[1][0].session_id);
  });
});

// ── Journey 6: failures ─────────────────────────────────────────────────────

describe('a failed submission', () => {
  it('cannot show success when the API is unreachable', async () => {
    vi.spyOn(api, 'agentTurn')
      .mockResolvedValueOnce(READY)
      .mockRejectedValueOnce(new Error('Failed to fetch'));

    wrap(<ReportStudio />);
    typeReport('P-201 spool erection complete');
    fireEvent.click(checkButton());
    await screen.findByText('Review your report');
    fireEvent.click(submitButton());

    expect(await screen.findByText('Could not confirm')).toBeInTheDocument();
    expect(screen.queryByText('Sent for planner review')).not.toBeInTheDocument();
    expect(screen.queryByText(/Dispatched/)).not.toBeInTheDocument();
  });

  it('preserves the draft and the interpretation', async () => {
    vi.spyOn(api, 'agentTurn')
      .mockResolvedValueOnce(READY)
      .mockRejectedValueOnce(new ApiError(503, 'Service Unavailable'));

    wrap(<ReportStudio />);
    typeReport('P-201 spool erection complete');
    fireEvent.click(checkButton());
    await screen.findByText('Review your report');
    fireEvent.click(submitButton());
    await screen.findByText('Not submitted');

    expect(screen.getByLabelText('What happened on site')).toHaveValue(
      'P-201 spool erection complete'
    );
    // The interpretation survives a failure — it is still about this draft.
    expect(screen.getByText('Review your report')).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });

  it('distinguishes a refusal from a lost response', async () => {
    vi.spyOn(api, 'agentTurn')
      .mockResolvedValueOnce(READY)
      .mockRejectedValueOnce(new ApiError(400, 'Bad request'));

    wrap(<ReportStudio />);
    typeReport('P-201 spool erection complete');
    fireEvent.click(checkButton());
    await screen.findByText('Review your report');
    fireEvent.click(submitButton());

    // The server answered, so "nothing was stored" is a fact, not a guess.
    expect(await screen.findByText('Not submitted')).toBeInTheDocument();
    expect(screen.getByText(/Nothing was stored/)).toBeInTheDocument();
    expect(screen.queryByText('Could not confirm')).not.toBeInTheDocument();
  });

  it('does not claim nothing was stored when the response was lost', async () => {
    vi.spyOn(api, 'agentTurn')
      .mockResolvedValueOnce(READY)
      .mockRejectedValueOnce(new TypeError('NetworkError'));

    wrap(<ReportStudio />);
    typeReport('P-201 spool erection complete');
    fireEvent.click(checkButton());
    await screen.findByText('Review your report');
    fireEvent.click(submitButton());

    await screen.findByText('Could not confirm');
    expect(screen.getByText(/may or may not have been recorded/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing was stored/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('retries on the same session, so the server can deduplicate', async () => {
    const spy = vi
      .spyOn(api, 'agentTurn')
      .mockResolvedValueOnce(READY)
      .mockRejectedValueOnce(new TypeError('NetworkError'))
      .mockResolvedValueOnce(PERSISTED);

    wrap(<ReportStudio />);
    typeReport('P-201 spool erection complete');
    fireEvent.click(checkButton());
    await screen.findByText('Review your report');
    fireEvent.click(submitButton());
    await screen.findByText('Could not confirm');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Sent for planner review')).toBeInTheDocument();

    expect(spy.mock.calls[2][0].session_id).toBe(spy.mock.calls[1][0].session_id);
    expect(spy.mock.calls[2][0].confirm).toBe(true);
  });

  it('does not claim success when the server answers without persisting', async () => {
    vi.spyOn(api, 'agentTurn')
      .mockResolvedValueOnce(READY)
      .mockResolvedValueOnce({ ...NEEDS_DATE, event_created: false });

    wrap(<ReportStudio />);
    typeReport('P-201 spool erection complete');
    fireEvent.click(checkButton());
    await screen.findByText('Review your report');
    fireEvent.click(submitButton());

    expect(await screen.findByText('Not submitted')).toBeInTheDocument();
    expect(screen.queryByText('Sent for planner review')).not.toBeInTheDocument();
  });
});

// ── Journey 7: an out-of-order response ─────────────────────────────────────

describe('a response that arrives late', () => {
  it('cannot overwrite a newer draft', async () => {
    let releaseFirst: (v: AgentTurnResponse) => void = () => {};
    const slow = new Promise<AgentTurnResponse>((resolve) => {
      releaseFirst = resolve;
    });
    vi.spyOn(api, 'agentTurn').mockReturnValueOnce(slow as never);

    wrap(<ReportStudio />);
    typeReport('P-201 spool erection complete');
    fireEvent.click(checkButton());

    // The supervisor keeps typing while the first check is still in flight.
    typeReport('Actually the hydrotest is what finished');

    // The stale answer lands afterwards and must be discarded.
    releaseFirst(READY);
    await waitFor(() =>
      expect(screen.queryByText('Checking your report')).not.toBeInTheDocument()
    );

    expect(screen.queryByText('Review your report')).not.toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(screen.getByLabelText('What happened on site')).toHaveValue(
      'Actually the hydrotest is what finished'
    );
  });
});

// ── What the screen no longer contains ──────────────────────────────────────

describe('the embedded assistant', () => {
  it('is gone — clarification lives in the reporting flow', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(NEEDS_DATE);
    wrap(<ReportStudio />);
    typeReport('Pump installation finished');
    fireEvent.click(checkButton());
    await screen.findByText('A few details needed');

    expect(screen.queryByText('Field Update Assistant')).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/Reply or provide additional site details/i)
    ).not.toBeInTheDocument();
  });

  it('makes no GPS, Exif or P6 acceptance claim', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(READY);
    wrap(<ReportStudio />);
    typeReport('P-201 spool erection complete');
    fireEvent.click(checkButton());
    await screen.findByText('Review your report');

    for (const claim of [/GPS VERIFIED/i, /GEO-STAMPED/i, /IMG_8821/, /Rev-08/, /98.4%/]) {
      expect(screen.queryByText(claim)).not.toBeInTheDocument();
    }
  });

  it('says where each proposed value came from', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(READY);
    wrap(<ReportStudio />);
    typeReport('P-201 spool erection complete');
    fireEvent.click(checkButton());
    await screen.findByText('Review your report');

    expect(screen.getAllByText('read from your report').length).toBeGreaterThan(0);
    expect(screen.getAllByText('you selected').length).toBeGreaterThan(0);
  });
});

describe('UpdatesLedger', () => {
  it('renders the updates ledger', () => {
    wrap(<UpdatesLedger />);
    expect(screen.getByText('My Updates')).toBeInTheDocument();
  });
});
