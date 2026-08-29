import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Field from '../pages/Field';
import { api } from '../lib/api';
import { classifySpeechError } from '../hooks/useSpeech';

/** Recognition instances the component created, so a test can drive them. */
const made: FakeRecognition[] = [];

class FakeRecognition {
  lang = 'en-IN';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;

  constructor() {
    made.push(this);
  }
  start() {
    this.started = true;
    this.onstart?.();
  }
  stop() {
    this.stopped = true;
    this.onend?.();
  }
  abort() {
    this.aborted = true;
    this.onend?.();
  }
  /** Emit a finalised phrase, as Chrome would. */
  say(text: string) {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: true, 0: { transcript: text } } },
    });
  }
}

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/field']}>
        <Field />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  made.length = 0;
  vi.restoreAllMocks();
  vi.spyOn(api, 'getReviewQueue').mockResolvedValue([]);
  vi.spyOn(api, 'getClarifications').mockResolvedValue([]);
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition =
    FakeRecognition;
});

describe('error classification', () => {
  it.each([
    ['not-allowed', 'denied'],
    ['service-not-allowed', 'denied'],
    ['no-speech', 'no-speech'],
    ['audio-capture', 'no-speech'],
    ['network', 'error'],
  ])('%s maps to %s', (code, expected) => {
    expect(classifySpeechError(code)).toBe(expected);
  });

  it('aborted is not a failure', () => {
    expect(classifySpeechError('aborted')).toBeNull();
  });
});

describe('recording does not stop on a pause', () => {
  it('runs continuously with interim results', () => {
    wrap();
    fireEvent.click(screen.getByText('Tap & Speak'));
    expect(made[0].continuous).toBe(true);
    expect(made[0].interimResults).toBe(true);
  });

  it('restarts when the browser ends the session unprompted', () => {
    wrap();
    fireEvent.click(screen.getByText('Tap & Speak'));
    act(() => made[0].say('spool erection on the 24 inch header'));

    // Chrome gives up after a silence even with continuous = true.
    act(() => made[0].onend?.());

    // A new session was started rather than the recording ending.
    expect(made.length).toBe(2);
    expect(made[1].started).toBe(true);
    expect(screen.getByText(/Stop & process/i)).toBeInTheDocument();
  });

  it('keeps everything heard across a restart', () => {
    wrap();
    fireEvent.click(screen.getByText('Tap & Speak'));
    act(() => made[0].say('spool erection '));
    act(() => made[0].onend?.());
    act(() => made[1].say('on the 24 inch header is done'));

    expect(
      screen.getByText(/spool erection on the 24 inch header is done/)
    ).toBeInTheDocument();
  });

  it('ends only when Stop & Process is tapped', () => {
    wrap();
    fireEvent.click(screen.getByText('Tap & Speak'));
    act(() => made[0].say('spool erection is done'));
    fireEvent.click(screen.getByText(/Stop & process/i));

    // No further session was created.
    expect(made.length).toBe(1);
  });
});

describe('transcript review is mandatory after voice', () => {
  it('stopping goes to review, not straight to the server', () => {
    const spy = vi.spyOn(api, 'agentTurn');
    wrap();
    fireEvent.click(screen.getByText('Tap & Speak'));
    act(() => made[0].say('spool erection on the 24 inch header is done'));
    fireEvent.click(screen.getByText(/Stop & process/i));

    expect(screen.getByText('Check your transcript')).toBeInTheDocument();
    expect(
      screen.getByText(/speech recognition can mishear equipment numbers/i)
    ).toBeInTheDocument();
    // Nothing was sent yet.
    expect(spy).not.toHaveBeenCalled();
  });

  it('the transcript is editable and there is no audio player', () => {
    const { container } = wrap();
    fireEvent.click(screen.getByText('Tap & Speak'));
    act(() => made[0].say('spool erection on the 24 inch header is done'));
    fireEvent.click(screen.getByText(/Stop & process/i));

    const box = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(box).toBeTruthy();
    expect(box.readOnly).toBe(false);
    fireEvent.change(box, { target: { value: 'corrected 24"-P-1001-A1A' } });
    expect(box.value).toBe('corrected 24"-P-1001-A1A');

    expect(container.querySelector('audio')).toBeNull();
    expect(container.textContent).not.toContain('Play');
  });
});

describe('microphone denied', () => {
  it('falls back to typing without alarm', () => {
    const { container } = wrap();
    fireEvent.click(screen.getByText('Tap & Speak'));
    act(() => made[0].onerror?.({ error: 'not-allowed' }));
    act(() => made[0].onend?.());

    expect(screen.getByText('Microphone unavailable')).toBeInTheDocument();
    expect(screen.getByText('Typing works just as well.')).toBeInTheDocument();
    expect(container.querySelector('.bg-danger-bg')).toBeNull();

    const input = screen.getByPlaceholderText(/type your update/i) as HTMLInputElement;
    expect(input.disabled).toBe(false);
  });
});

describe('structured card', () => {
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
      match_outcome: 'REVIEW', alternatives: ['PIP-ERC-1034'],
      asked_slot: null, ask_count: 0,
    },
    pending_slots: [], event_created: false, linked_event_id: null,
    confidence: 0.682, awaiting_confirmation: true,
    activity_description: 'Spool Erection — 6"-P-1015-A1A',
    match_outcome: 'REVIEW', review_item_id: null,
    discipline_label: 'Piping', status_label: 'Finished', choices: null,
  };

  it('renders the backend match, not a hardcoded one', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(proposal as never);
    wrap();
    const input = screen.getByPlaceholderText(/type your update/i);
    fireEvent.change(input, { target: { value: 'spool erection is done' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // The card sits behind the deliberate READY TO DRAFT beat.
    fireEvent.click(await screen.findByText(/Review Structured Update/));
    expect(await screen.findByText(/PIP-ERC-1034/)).toBeInTheDocument();
    expect(screen.getByText(/68\.2%/)).toBeInTheDocument();
    expect(screen.getByText(/6 of 18 nos/)).toBeInTheDocument();
    expect(screen.getByText('14 Sep 2026')).toBeInTheDocument();
  });

  it('confidence has no pencil and there is no activity picker', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue(proposal as never);
    const { container } = wrap();
    const input = screen.getByPlaceholderText(/type your update/i);
    fireEvent.change(input, { target: { value: 'spool erection is done' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(await screen.findByText(/Review Structured Update/));
    await screen.findByText(/PIP-ERC-1034/);

    expect(screen.queryByLabelText(/correct confidence/i)).toBeNull();
    for (const key of ['activity', 'status', 'date', 'quantity']) {
      expect(screen.getByLabelText(new RegExp(`correct ${key}`, 'i'))).toBeTruthy();
    }
    // No dropdown of schedule ids anywhere on the card.
    const selects = Array.from(container.querySelectorAll('select'));
    for (const sel of selects) {
      expect(sel.textContent).not.toMatch(/[A-Z]{3}-[A-Z]{3}-\d{4}/);
    }
  });

  it('says so plainly when the matcher found nothing', async () => {
    vi.spyOn(api, 'agentTurn').mockResolvedValue({
      ...proposal,
      slots: { ...proposal.slots, activity_id: null, activity_description: null },
      activity_description: null, match_outcome: 'NEW_ACTIVITY',
    } as never);
    wrap();
    const input = screen.getByPlaceholderText(/type your update/i);
    fireEvent.change(input, { target: { value: 'something unusual happened' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(await screen.findByText(/Review Structured Update/));

    expect(
      await screen.findByText('No matching activity — flagged for Planning Engineer')
    ).toBeInTheDocument();
  });
});
