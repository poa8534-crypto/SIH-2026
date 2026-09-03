import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Field from '../pages/Field';
import FieldReports from '../pages/FieldReports';
import FieldClarifications from '../pages/FieldClarifications';
import FieldProfile from '../pages/FieldProfile';
import { SessionContext } from '../hooks/useSession';
import { FieldNav } from '../components/FieldNav';
import { api } from '../lib/api';

/**
 * The API is stubbed rather than reached: these assert what the screens do
 * with a response, and a test that needs a live server proves nothing about
 * the screen.
 */

// Signing out has to go back through App, which owns the role in state, so
// the field lane reads it from context. The wrapper mirrors the real tree.
let lastSignOut = vi.fn();

function wrap(ui: React.ReactNode, path = '/field') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  lastSignOut = vi.fn();
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={{ role: 'field', signOut: lastSignOut }}>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>
  );
}

const REPORT = {
  id: 'e1',
  reference: 'FR-2026-09-15-AB12',
  raw_text: 'spool erection on the 24 inch header is done',
  submitted_at: '2026-09-15T10:42:00',
  location: null,
  discipline: 'piping',
  discipline_label: 'Piping',
  status: 'Processing',
  matched_activity_id: 'PIP-ERC-1034',
  matched_activity_description: 'Spool Erection — 6"-P-1015-A1A',
  confidence: 0.68,
  review_item_id: 'r1',
  clarification_question: null,
  clarification_response: null,
};

const CLARIFICATION = {
  id: 'r1',
  review_item_id: 'r1',
  reference: 'FR-2026-09-15-AB12',
  original_text: 'spool erection on the 24 inch header is done',
  question: 'Which header — the 24 inch or the 12 inch?',
  asked_by: 'Priya Das',
  asked_at: '2026-09-15T11:00:00',
  answered: false,
  response: null,
  answered_at: null,
  matched_activity_id: 'PIP-ERC-1034',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getReviewQueue').mockResolvedValue([]);
  vi.spyOn(api, 'getClarifications').mockResolvedValue([]);
  vi.spyOn(api, 'getFieldReports').mockResolvedValue([]);
});

// ── Navigation ──────────────────────────────────────────────────────────────

describe('bottom navigation', () => {
  const routes = (
    <>
      <FieldNav />
      <Routes>
        <Route path="/field" element={<div>HOME PAGE</div>} />
        <Route path="/field/reports" element={<div>REPORTS PAGE</div>} />
        <Route path="/field/clarifications" element={<div>CLARIFICATIONS PAGE</div>} />
        <Route path="/field/profile" element={<div>PROFILE PAGE</div>} />
      </Routes>
    </>
  );

  it('shows all four tabs', () => {
    wrap(routes);
    for (const label of ['Home', 'Reports', 'Clarifications', 'Profile']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it.each([
    ['/field', 'HOME PAGE'],
    ['/field/reports', 'REPORTS PAGE'],
    ['/field/clarifications', 'CLARIFICATIONS PAGE'],
    ['/field/profile', 'PROFILE PAGE'],
  ])('%s resolves to its own page', (path, text) => {
    wrap(routes, path);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('marks the current tab active and no tab points at "#"', () => {
    const { container } = wrap(routes, '/field/reports');
    const active = container.querySelector('a[aria-current="page"]');
    expect(active?.textContent).toContain('Reports');
    for (const a of container.querySelectorAll('a')) {
      expect(a.getAttribute('href')).not.toBe('#');
    }
  });

  it('badges the unanswered count from the backend', async () => {
    vi.spyOn(api, 'getClarifications').mockResolvedValue([
      CLARIFICATION, { ...CLARIFICATION, id: 'r2' },
    ] as never);
    wrap(routes);
    expect(await screen.findByText('2')).toBeInTheDocument();
  });
});

// ── The field screen ────────────────────────────────────────────────────────

describe('field screen', () => {
  it('idle offers Tap & Speak and an equal typed path', () => {
    wrap(<Field />);
    expect(screen.getByText('Tap & Speak')).toBeInTheDocument();
    expect(screen.getByText('Describe what happened on site')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/type your update/i)
    ).toBeInTheDocument();
  });

  it('renders no forbidden concept anywhere', () => {
    const { container } = wrap(<Field />);
    const text = container.textContent ?? '';
    for (const banned of [
      'RFI', 'Crew', 'crew', 'Workers', 'photo', 'Photo', 'upload',
      'Offline', 'offline', 'sync', 'Draft', 'draft', 'Notification',
    ]) {
      expect(text).not.toContain(banned);
    }
  });

  it('sends typed text with structured context, not a fake message', async () => {
    const spy = vi.spyOn(api, 'agentTurn').mockResolvedValue({
      session_id: 's', turn_number: 1,
      agent_message: 'Which date was it completed?',
      slots: {} as never, pending_slots: ['date'],
      event_created: false, linked_event_id: null, confidence: 0,
      awaiting_confirmation: false, activity_description: null,
      match_outcome: null, review_item_id: null,
      discipline_label: 'Piping', status_label: null, choices: null,
    } as never);

    wrap(<Field />);
    const input = screen.getByPlaceholderText(/type your update/i);
    fireEvent.change(input, { target: { value: 'spool erection is done' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const body = spy.mock.calls[0][0] as never as Record<string, unknown>;
    // The message is exactly what he typed.
    expect(body.message).toBe('spool erection is done');
    // Context travels as structured data.
    expect(body.context).toMatchObject({
      project_code: 'OIL-WSD-2026',
      data_date: '2026-09-15',
      timezone: 'Asia/Kolkata',
    });
  });

  it('keeps the unsent text when the server cannot be reached', async () => {
    vi.spyOn(api, 'agentTurn').mockRejectedValue(new Error('down'));
    wrap(<Field />);
    const input = screen.getByPlaceholderText(/type your update/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'spool erection is done' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument();
    expect(screen.getByText(/this update was not saved/i)).toBeInTheDocument();
    // His words are still there to retry with.
    const after = screen.getByPlaceholderText(/type your update/i) as HTMLInputElement;
    expect(after.value).toBe('spool erection is done');
    // No draft or offline language anywhere.
    expect(screen.queryByText(/save as draft/i)).toBeNull();
  });
});

// ── Reports ─────────────────────────────────────────────────────────────────

describe('reports', () => {
  it('shows an empty state that leads back to Home', async () => {
    wrap(<FieldReports />);
    expect(await screen.findByText('No reports yet')).toBeInTheDocument();
    expect(
      screen.getByText('Your submitted updates will appear here.')
    ).toBeInTheDocument();
    expect(screen.getByText(/create first report/i)).toBeInTheDocument();
  });

  it('lists only what the field-scoped endpoint returned', async () => {
    const spy = vi.spyOn(api, 'getFieldReports').mockResolvedValue([REPORT] as never);
    wrap(<FieldReports />);
    expect(await screen.findByText(REPORT.raw_text)).toBeInTheDocument();
    expect(screen.getByText(/PIP-ERC-1034/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });

  it('has no search box, evidence column or attachments', async () => {
    vi.spyOn(api, 'getFieldReports').mockResolvedValue([REPORT] as never);
    const { container } = wrap(<FieldReports />);
    await screen.findByText(REPORT.raw_text);
    expect(container.querySelector('input[type="text"]')).toBeNull();
    const text = container.textContent ?? '';
    for (const banned of ['Evidence', 'Attach', 'Photo', 'Pending Sync']) {
      expect(text).not.toContain(banned);
    }
  });
});

// ── Clarifications ──────────────────────────────────────────────────────────

describe('clarifications', () => {
  it('answering switches the card to a read-only answered state', async () => {
    vi.spyOn(api, 'getClarifications').mockResolvedValue([CLARIFICATION] as never);
    const answer = vi.spyOn(api, 'answerClarification').mockResolvedValue({
      ...CLARIFICATION, answered: true, response: 'The 24 inch header.',
    } as never);

    wrap(<FieldClarifications />);
    const box = await screen.findByPlaceholderText(/type your response/i);
    fireEvent.change(box, { target: { value: 'The 24 inch header.' } });
    fireEvent.click(screen.getByText(/send response/i));

    await waitFor(() => expect(answer).toHaveBeenCalledWith('r1', 'The 24 inch header.'));
    expect(
      await screen.findByText('Response sent to Planning Engineer')
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/type your response/i)).toBeNull();
  });

  it('attributes the question to the Planning Engineer', async () => {
    vi.spyOn(api, 'getClarifications').mockResolvedValue([CLARIFICATION] as never);
    wrap(<FieldClarifications />);
    expect(await screen.findByText(/Priya Das/)).toBeInTheDocument();
    expect(screen.getByText(CLARIFICATION.question)).toBeInTheDocument();
  });

  it('never mentions RFI', async () => {
    vi.spyOn(api, 'getClarifications').mockResolvedValue([CLARIFICATION] as never);
    const { container } = wrap(<FieldClarifications />);
    await screen.findByText(CLARIFICATION.question);
    expect(container.textContent).not.toContain('RFI');
  });
});

// ── Profile ─────────────────────────────────────────────────────────────────

describe('profile', () => {
  it('shows the role and assignment, and no forbidden sections', () => {
    const { container } = wrap(<FieldProfile />);
    for (const value of [
      'Field Supervisor', 'OIL-WSD-2026', 'Sector A · Digboi Well #4',
      'English', 'Hindi', 'Assamese',
    ]) {
      // Several of these appear more than once now (a language is both a
      // button and part of the preferred-languages line).
      expect(
        screen.getAllByText(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length
      ).toBeGreaterThan(0);
    }
    const text = container.textContent ?? '';
    for (const banned of ['Crew', 'Workers', 'Offline', 'Last sync',
                          'Pending', 'Draft', 'Notification',
                          // There is no authentication and no profile
                          // endpoint, so no screen may name a person or
                          // carry a made-up employee record.
                          'Rajesh Kumar', 'OIL-FS-014']) {
      expect(text).not.toContain(banned);
    }
  });

  it('takes the project name from the schedule endpoint, not a constant', async () => {
    vi.spyOn(api, 'getSchedule').mockResolvedValue({
      project: 'Server Named Project', data_date: '2026-10-01',
    } as never);
    wrap(<FieldProfile />);
    expect(await screen.findAllByText(/Server Named Project/)).not.toHaveLength(0);
    expect(screen.getByText('2026-10-01')).toBeInTheDocument();
  });

  it('offers a way back to role selection, and it actually signs out', () => {
    // The button said "Return to role selection" and called setOverride
    // ('desktop'), which only swapped the shell. For the field role the router
    // keeps the mobile lane regardless, so it did nothing whatsoever.
    wrap(<FieldProfile />);
    const button = screen.getByText(/return to role selection/i);
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(lastSignOut).toHaveBeenCalledTimes(1);
  });
});

// ── The escape hatch ────────────────────────────────────────────────────────

describe('leaving a conversation', () => {
  const stalled = {
    session_id: 'stuck-1', turn_number: 1,
    agent_message: 'Which discipline does this work belong to?',
    slots: { asked_slot: 'discipline', ask_count: 1 } as never,
    pending_slots: ['discipline'],
    event_created: false, linked_event_id: null, confidence: 0,
    awaiting_confirmation: false, activity_description: null,
    match_outcome: null, review_item_id: null,
    discipline_label: null, status_label: null,
    choices: 'Civil, Piping, Static Equipment, Electrical, Instrumentation, or HSE',
  };

  async function enterConversation() {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(stalled as never);
    wrap(<Field />);
    const input = screen.getByPlaceholderText(/type your update/i);
    fireEvent.change(input, { target: { value: 'something happened' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText(stalled.agent_message);
  }

  it('shows the Data Entry Session header with a close control', async () => {
    await enterConversation();
    expect(screen.getByText('Data Entry Session')).toBeInTheDocument();
    expect(screen.getByLabelText(/close session/i)).toBeInTheDocument();
  });

  it('closing abandons the session and returns to idle', async () => {
    await enterConversation();
    // The agent is stuck on a slot — exactly the demo-killer case.
    fireEvent.click(screen.getByLabelText(/close session/i));

    expect(screen.getByText('Tap & Speak')).toBeInTheDocument();
    expect(screen.queryByText(stalled.agent_message)).toBeNull();
    expect(screen.queryByText('Data Entry Session')).toBeNull();
  });

  it('closing starts a new session id and writes nothing', async () => {
    const spy = vi.spyOn(api, 'agentTurn').mockResolvedValue(stalled as never);
    wrap(<Field />);
    const input = screen.getByPlaceholderText(/type your update/i);
    fireEvent.change(input, { target: { value: 'something happened' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText(stalled.agent_message);
    const firstSession = (spy.mock.calls[0][0] as never as Record<string, string>)
      .session_id;

    fireEvent.click(screen.getByLabelText(/close session/i));

    const again = screen.getByPlaceholderText(/type your update/i);
    fireEvent.change(again, { target: { value: 'a fresh start' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    const secondSession = (spy.mock.calls[1][0] as never as Record<string, string>)
      .session_id;
    expect(secondSession).not.toBe(firstSession);
    // Abandoning never confirms, so nothing was ever written.
    for (const call of spy.mock.calls) {
      expect((call[0] as never as Record<string, boolean>).confirm).toBe(false);
    }
  });
});

// ── The Review Structured Update beat ───────────────────────────────────────

describe('ready to draft', () => {
  const proposal = {
    session_id: 's', turn_number: 3,
    agent_message: 'I have enough to prepare the update.',
    slots: {
      discipline: 'piping', location: 'Sector A · Digboi Well #4',
      quantity: 6, planned_quantity: 18, quantity_over_planned: false,
      uom: 'nos', tags: [], status: 'completed',
      activity_id: 'PIP-ERC-1034', description: 'spool erection',
      date: '2026-09-14', confidence: 0.682,
      activity_description: 'Spool Erection — 6"-P-1015-A1A',
      match_outcome: 'REVIEW', alternatives: [],
      asked_slot: null, ask_count: 0,
    },
    pending_slots: [], event_created: false, linked_event_id: null,
    confidence: 0.682, awaiting_confirmation: true,
    activity_description: 'Spool Erection — 6"-P-1015-A1A',
    match_outcome: 'REVIEW', review_item_id: null,
    discipline_label: 'Piping', status_label: 'Finished', choices: null,
  };

  async function reachReady() {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(proposal as never);
    wrap(<Field />);
    const input = screen.getByPlaceholderText(/type your update/i);
    fireEvent.change(input, { target: { value: '6 out of 18' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('READY TO DRAFT');
  }

  it('stops at READY TO DRAFT rather than jumping to the card', async () => {
    await reachReady();
    expect(screen.getByText('I have enough to prepare the update.')).toBeInTheDocument();
    expect(screen.getByText(/Review Structured Update/)).toBeInTheDocument();
    // The card is not on screen yet.
    expect(screen.queryByText('STRUCTURED UPDATE')).toBeNull();
  });

  it('tapping the button reveals the card with the assistant preamble', async () => {
    await reachReady();
    fireEvent.click(screen.getByText(/Review Structured Update/));

    expect(screen.getByText('STRUCTURED UPDATE')).toBeInTheDocument();
    expect(
      screen.getByText(/extracted the structured data from your update/)
    ).toBeInTheDocument();
    expect(screen.getByText(/PIP-ERC-1034/)).toBeInTheDocument();
    expect(screen.getByText('CONFIRM & SUBMIT')).toBeInTheDocument();
  });
});
