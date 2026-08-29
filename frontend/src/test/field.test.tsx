import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Field from '../pages/Field';
import FieldReports from '../pages/FieldReports';
import FieldClarifications from '../pages/FieldClarifications';
import FieldProfile from '../pages/FieldProfile';
import { FieldNav } from '../components/FieldNav';
import { api } from '../lib/api';

/**
 * The API is stubbed rather than reached: these assert what the screens do
 * with a response, and a test that needs a live server proves nothing about
 * the screen.
 */

function wrap(ui: React.ReactNode, path = '/field') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
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
  it('shows the seeded identity and no forbidden sections', () => {
    const { container } = wrap(<FieldProfile />);
    for (const value of [
      'Rajesh Kumar', 'Field Supervisor', 'OIL Well-Site Duliajan',
      'OIL-WSD-2026', 'Sector A · Digboi Well #4',
      'English', 'Hindi', 'Assamese',
    ]) {
      expect(screen.getByText(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy();
    }
    const text = container.textContent ?? '';
    for (const banned of ['Crew', 'Workers', 'Offline', 'Last sync',
                          'Pending', 'Draft', 'Notification']) {
      expect(text).not.toContain(banned);
    }
  });

  it('offers a way back to role selection', () => {
    wrap(<FieldProfile />);
    expect(screen.getByText(/return to role selection/i)).toBeInTheDocument();
  });
});
