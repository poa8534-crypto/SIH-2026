/**
 * The register had a reader and a detector, and no writer.
 *
 * `GET /raid/candidates` proposed entries from the audit trail; every one
 * stayed `committed: false` because no screen let a Project Manager accept
 * one. The executive Exposure page read `GET /raid` and showed an empty
 * register explaining that candidates wait for a planner — and the planner had
 * no way to be that person. `lib/role.ts` already listed `/raid` among the
 * planner's routes; the nav entry and the page were simply missing.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Raid from '../pages/Raid';
import { api } from '../lib/api';

const CANDIDATE = {
  kind: 'issue' as const,
  title: 'Recurring delay cause: fencing conflict',
  description:
    "'fencing conflict' appears in 2 audit records across 1 activity, accounting for 21 days of finish slip.",
  category: 'interface',
  linked_activity_ids: ['CIV-DWG-1015'],
  occurrences: 2,
  days_lost: 21.0,
  source_kind: 'delay_analysis',
  source_id: 'fencing conflict',
  source_note:
    'Derived from AuditRecord.source_span. This is a PROPOSAL: nothing has been written to the register.',
  committed: false,
};

const ACCEPTED = {
  id: 'r1',
  kind: 'issue' as const,
  title: 'Recurring delay cause: fencing conflict',
  description: 'accepted',
  category: 'interface',
  status: 'open',
  owner: null,
  due_date: null,
  date_raised: '2026-09-03',
  date_closed: null,
  probability: null,
  impact_days: 21.0,
  exposure: null,
  linked_activity_ids: ['CIV-DWG-1015'],
  created_at: '2026-09-03T00:00:00',
};

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/raid']}>
        <Raid />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('the candidates client matches the real endpoint shape', () => {
  it('unwraps the {candidates, note} envelope', async () => {
    // GET /raid answers with a bare list; GET /raid/candidates answers with an
    // object. Mocking this one as a list is how a green test suite sat next to
    // a screen that crashed on the real response.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [CANDIDATE],
        note: 'Candidates are proposals derived from existing audit evidence.',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await api.getRaidCandidates();
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe(CANDIDATE.title);
    vi.unstubAllGlobals();
  });

  it('survives an envelope with no candidates key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ note: 'none' }),
    }));
    expect(await api.getRaidCandidates()).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe('the planner can adjudicate a RAID candidate', () => {
  it('shows detected candidates as proposals, not findings', async () => {
    vi.spyOn(api, 'getRaid').mockResolvedValue([]);
    vi.spyOn(api, 'getRaidCandidates').mockResolvedValue([CANDIDATE]);
    wrap();

    expect(await screen.findByText(CANDIDATE.title)).toBeInTheDocument();
    // The API's own disclaimer is shown rather than paraphrased away.
    expect(screen.getByText(/this is a proposal/i)).toBeInTheDocument();
    expect(screen.getByText(/not in the register/i)).toBeInTheDocument();
  });

  it('says plainly that an empty register is the design', async () => {
    vi.spyOn(api, 'getRaid').mockResolvedValue([]);
    vi.spyOn(api, 'getRaidCandidates').mockResolvedValue([CANDIDATE]);
    wrap();

    expect(await screen.findByText(/the register is empty/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is added automatically/i)).toBeInTheDocument();
  });

  it('accepting a candidate posts it to the register', async () => {
    vi.spyOn(api, 'getRaid').mockResolvedValue([]);
    vi.spyOn(api, 'getRaidCandidates').mockResolvedValue([CANDIDATE]);
    const create = vi.spyOn(api, 'createRaidItem').mockResolvedValue(ACCEPTED);
    wrap();

    fireEvent.click(await screen.findByText(/accept into register/i));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const body = create.mock.calls[0][0];
    expect(body.kind).toBe('issue');
    expect(body.title).toBe(CANDIDATE.title);
    expect(body.linked_activity_ids).toEqual(['CIV-DWG-1015']);
    // An issue carries no score. server/raid.py rejects probability and
    // impact_days on anything but a risk, and it rejects rather than
    // silently dropping — so sending them here made every accept fail with
    // "probability and impact_days apply to a risk, not to an issue".
    expect(body.impact_days).toBeUndefined();
    expect(body.probability).toBeUndefined();
  });

  it('scores a risk, because only a risk may be scored', async () => {
    const risk = { ...CANDIDATE, kind: 'risk' as const, days_lost: 21.0 };
    vi.spyOn(api, 'getRaid').mockResolvedValue([]);
    vi.spyOn(api, 'getRaidCandidates').mockResolvedValue([risk]);
    const create = vi.spyOn(api, 'createRaidItem').mockResolvedValue(ACCEPTED);
    wrap();

    fireEvent.click(await screen.findByText(/accept into register/i));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0].impact_days).toBe(21);
    expect(create.mock.calls[0][0].probability).toBeUndefined();
  });

  it('never computes exposure in the browser', async () => {
    vi.spyOn(api, 'getRaid').mockResolvedValue([
      { ...ACCEPTED, probability: 0.5, impact_days: 21, exposure: 10.5 },
    ]);
    vi.spyOn(api, 'getRaidCandidates').mockResolvedValue([]);
    wrap();

    // 10.5 is the server's number, shown as given. 0.5 x 21 is not recomputed.
    expect(await screen.findByText(/exposure 10.5d/i)).toBeInTheDocument();
  });

  it('does not offer a candidate that is already in the register', async () => {
    vi.spyOn(api, 'getRaid').mockResolvedValue([ACCEPTED]);
    vi.spyOn(api, 'getRaidCandidates').mockResolvedValue([CANDIDATE]);
    wrap();

    await screen.findByText(/nothing outstanding/i);
    expect(screen.queryByText(/accept into register/i)).not.toBeInTheDocument();
  });

  it('surfaces a failed accept instead of silently dropping it', async () => {
    vi.spyOn(api, 'getRaid').mockResolvedValue([]);
    vi.spyOn(api, 'getRaidCandidates').mockResolvedValue([CANDIDATE]);
    vi.spyOn(api, 'createRaidItem').mockRejectedValue(
      new Error('register unavailable')
    );
    wrap();

    fireEvent.click(await screen.findByText(/accept into register/i));
    expect(await screen.findByText(/register unavailable/i)).toBeInTheDocument();
  });

  it('closing an entry sends a status and a closing date', async () => {
    vi.spyOn(api, 'getRaid').mockResolvedValue([ACCEPTED]);
    vi.spyOn(api, 'getRaidCandidates').mockResolvedValue([]);
    const patch = vi
      .spyOn(api, 'updateRaidItem')
      .mockResolvedValue({ ...ACCEPTED, status: 'closed' });
    wrap();

    fireEvent.click(await screen.findByText(/^close$/i));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1].status).toBe('closed');
    expect(patch.mock.calls[0][1].date_closed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
