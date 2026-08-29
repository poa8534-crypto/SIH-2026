import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Field from '../pages/Field';
import { api } from '../lib/api';

/**
 * One test per Field state, each reached by driving the UI rather than by
 * setting state directly — so a state that cannot be reached fails here even
 * if its markup exists.
 */

const made: Fake[] = [];

class Fake {
  lang = 'en-IN';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  constructor() { made.push(this); }
  start() { this.onstart?.(); }
  stop() { this.onend?.(); }
  abort() { this.onend?.(); }
  say(text: string) {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: true, 0: { transcript: text } } },
    });
  }
}

const CLARIFICATION = {
  id: 'r1', review_item_id: 'r1', reference: 'FR-2026-09-15-AB12',
  original_text: 'spool erection on the 24 inch header is done',
  question: 'Please confirm the exact pour location.',
  asked_by: 'Priya Das', asked_at: '2026-09-15T09:12:00',
  answered: false, response: null, answered_at: null,
  matched_activity_id: 'PIP-ERC-1034',
};

const REPORT = {
  id: 'e1', reference: 'FR-2026-09-15-AB12',
  raw_text: 'P-201 alignment update', submitted_at: '2026-09-15T10:42:00',
  location: null, discipline: 'piping', discipline_label: 'Piping',
  status: 'Confirmed', matched_activity_id: 'PIP-ERC-1034',
  matched_activity_description: 'Spool Erection', confidence: 0.9,
  review_item_id: 'r1', clarification_question: null,
  clarification_response: null,
};

const PROPOSAL = {
  session_id: 's', turn_number: 3,
  agent_message: 'I have enough to prepare the update.',
  slots: {
    discipline: 'piping', location: 'Sector A · Digboi Well #4',
    quantity: 6, planned_quantity: 18, quantity_over_planned: false,
    uom: 'nos', tags: [], status: 'completed', activity_id: 'PIP-ERC-1034',
    description: 'spool erection', date: '2026-09-14', confidence: 0.682,
    activity_description: 'Spool Erection — 6"-P-1015-A1A',
    match_outcome: 'REVIEW', alternatives: [], asked_slot: null, ask_count: 0,
  },
  pending_slots: [], event_created: false, linked_event_id: null,
  confidence: 0.682, awaiting_confirmation: true,
  activity_description: 'Spool Erection — 6"-P-1015-A1A',
  match_outcome: 'REVIEW', review_item_id: null,
  discipline_label: 'Piping', status_label: 'Finished', choices: null,
};

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/field']}><Field /></MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  made.length = 0;
  vi.restoreAllMocks();
  vi.spyOn(api, 'getReviewQueue').mockResolvedValue([]);
  vi.spyOn(api, 'getClarifications').mockResolvedValue([CLARIFICATION] as never);
  vi.spyOn(api, 'getFieldReports').mockResolvedValue([REPORT] as never);
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition = Fake;
});

describe('every Field state renders', () => {
  it('IDLE — panel, context, both persistent blocks, human-gate footer', async () => {
    wrap();
    expect(screen.getByText('Tap & Speak')).toBeInTheDocument();
    expect(screen.getByText('Describe what happened on site')).toBeInTheDocument();
    expect(screen.getByText('Current Context')).toBeInTheDocument();
    expect(await screen.findByText('Needs Your Response')).toBeInTheDocument();
    expect(await screen.findByText('Answer Question')).toBeInTheDocument();
    expect(await screen.findByText('Recent Updates')).toBeInTheDocument();
    expect(screen.getByText(/P-201 alignment update/)).toBeInTheDocument();
    expect(
      screen.getByText(/Every submitted update requires Planning Engineer/)
    ).toBeInTheDocument();
  });

  it('LISTENING — timer, Stop & Process, Cancel, blocks dimmed', async () => {
    const { container } = wrap();
    await screen.findByText('Needs Your Response');
    fireEvent.click(screen.getByText('Tap & Speak'));

    expect(screen.getByText('Listening')).toBeInTheDocument();
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.getByText(/Stop & Process/)).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    // Still in sight, dimmed and inert.
    const dimmed = container.querySelectorAll('[aria-hidden="true"].opacity-50');
    expect(dimmed.length).toBeGreaterThanOrEqual(2);
  });

  it('TRANSCRIPT REVIEW — caption, editable box, both actions, dimmed blocks', async () => {
    const { container } = wrap();
    fireEvent.click(screen.getByText('Tap & Speak'));
    act(() => made[0].say('spool erection on the 24 inch header is done'));
    fireEvent.click(screen.getByText(/Stop & Process/));

    expect(screen.getByText('Check your transcript')).toBeInTheDocument();
    expect(
      screen.getByText(/Check this before sending — speech recognition can mishear/)
    ).toBeInTheDocument();
    expect(container.querySelector('textarea')).toBeTruthy();
    expect(screen.getByText('Use This Transcript')).toBeInTheDocument();
    expect(screen.getByText('Record Again')).toBeInTheDocument();
    expect(await screen.findByText('My Recent Updates')).toBeInTheDocument();
  });

  it('CONVERSATION — session header, labels, both input paths', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue({
      ...PROPOSAL, agent_message: 'Which date was it completed?',
      awaiting_confirmation: false, pending_slots: ['date'],
    } as never);
    wrap();
    const input = screen.getByPlaceholderText(/type your update/i);
    fireEvent.change(input, { target: { value: 'spool erection is done' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('Which date was it completed?')).toBeInTheDocument();
    expect(screen.getByText('Data Entry Session')).toBeInTheDocument();
    expect(screen.getByLabelText(/close session/i)).toBeInTheDocument();
    expect(screen.getByText('Supervisor')).toBeInTheDocument();
    expect(screen.getAllByText('NAVIS Assistant').length).toBeGreaterThan(0);
    expect(screen.getByText('Answer by voice')).toBeInTheDocument();
  });

  it('READY then CARD — the beat, then the five rows', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(PROPOSAL as never);
    wrap();
    const input = screen.getByPlaceholderText(/type your update/i);
    fireEvent.change(input, { target: { value: '6 out of 18' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('READY TO DRAFT')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Review Structured Update/));

    expect(screen.getByText('STRUCTURED UPDATE')).toBeInTheDocument();
    for (const row of ['ACTIVITY', 'STATUS', 'DATE', 'QUANTITY', 'Confidence']) {
      expect(screen.getByText(row)).toBeInTheDocument();
    }
    expect(screen.getByText('CONFIRM & SUBMIT')).toBeInTheDocument();
    expect(
      screen.getByText(/Submitting confirms the report information only/)
    ).toBeInTheDocument();
  });

  it('SUBMITTED — the three lines and Return Home', async () => {
    const spy = vi.spyOn(api, 'agentTurn');
    spy.mockResolvedValueOnce(PROPOSAL as never);
    spy.mockResolvedValueOnce({
      ...PROPOSAL, event_created: true, awaiting_confirmation: false,
      linked_event_id: 'le-1', review_item_id: 'ri-1',
      agent_message: 'Sent for Planning Engineer review.',
    } as never);

    wrap();
    const input = screen.getByPlaceholderText(/type your update/i);
    fireEvent.change(input, { target: { value: '6 out of 18' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(await screen.findByText(/Review Structured Update/));
    fireEvent.click(screen.getByText('CONFIRM & SUBMIT'));

    expect(await screen.findByText('Update submitted')).toBeInTheDocument();
    expect(screen.getByText(/Report reference:/)).toBeInTheDocument();
    expect(screen.getByText('Sent for Planning Engineer review.')).toBeInTheDocument();
    expect(
      screen.getByText('The project schedule has not been changed.')
    ).toBeInTheDocument();
    expect(screen.getByText('Return Home')).toBeInTheDocument();
  });

  it('MIC UNAVAILABLE — quiet fallback, typing primary', () => {
    fireEvent.click(document.body); // no-op, keeps lint quiet
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    wrap();
    expect(screen.getByText('Microphone unavailable')).toBeInTheDocument();
    expect(screen.getByText('Typing works just as well.')).toBeInTheDocument();
    expect(screen.queryByText('Tap & Speak')).toBeNull();
  });

  it('SPEECH NOT UNDERSTOOD — Active pill and both recovery actions', () => {
    wrap();
    fireEvent.click(screen.getByText('Tap & Speak'));
    act(() => made[0].onerror?.({ error: 'no-speech' }));
    act(() => made[0].onend?.());

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(
      screen.getByText(/We couldn’t understand that recording/)
    ).toBeInTheDocument();
    expect(screen.getByText('Record Again')).toBeInTheDocument();
    expect(screen.getByText('Type Response')).toBeInTheDocument();
  });

  it('SERVER UNREACHABLE — states it was not saved, keeps the text', async () => {
    vi.spyOn(api, 'agentTurn').mockRejectedValue(new Error('down'));
    wrap();
    const input = screen.getByPlaceholderText(/type your update/i);
    fireEvent.change(input, { target: { value: 'spool erection is done' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(
      await screen.findByText('Could not reach the server — try again')
    ).toBeInTheDocument();
    expect(screen.getByText(/This update was not saved/)).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
    await waitFor(() => {
      const after = screen.getByPlaceholderText(/type your update/i) as HTMLInputElement;
      expect(after.value).toBe('spool erection is done');
    });
  });
});
