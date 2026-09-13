import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import CrewScreen from '../pages/field/CrewScreen';
import { SessionContext } from '../hooks/useSession';
import { api, ApiError } from '../lib/api';
import {
  enqueue,
  flushOutbox,
  listOutbox,
  pendingOutbox,
  rejectedOutbox,
} from '../lib/outbox';

/**
 * The Field Supervisor's manpower screen, and the outbox behind it.
 *
 * The properties worth pinning are the ones a supervisor would be harmed by
 * getting wrong:
 *
 *   1. "Not marked" is never rendered as an attendance of zero.
 *   2. A correction is presented as a correction — the first reading stands.
 *   3. Asking for manpower is presented as a REQUEST, never as a booking.
 *   4. With no link, a muster is kept rather than lost, and the screen says so.
 *   5. A server refusal is surfaced, never silently retried forever.
 */

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={{ role: 'field', signOut: vi.fn() }}>
        <MemoryRouter initialEntries={['/field/crew']}>{ui}</MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>
  );
}

/**
 * A crew's muster card, scoped to the muster section.
 *
 * The crew name deliberately appears three times on this screen — the muster
 * card, the deployment list, and the request dropdown — so an unscoped query
 * is ambiguous. That repetition is correct for the supervisor and only
 * inconvenient for the test.
 */
async function musterCard(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: /Today.s muster/i });
  const section = heading.closest('section') as HTMLElement;
  const label = await within(section).findByText(name);
  return label.closest('div.rounded-2xl') as HTMLElement;
}

const UNMARKED = {
  crew_id: 'CIV-TEAM-01',
  name: 'Civil Team 1',
  discipline: 'civil',
  contractor: 'ABC Infra Pvt Ltd',
  trade: 'mason',
  planned_strength: 18,
  foreman: null,
  shift: 'day',
  active: true,
  today_present: null,
  today_absent: null,
  today_record_id: null,
  today_planned: null,
  reliability: 0.917,
};

const MARKED = {
  ...UNMARKED,
  crew_id: 'PIP-TEAM-01',
  name: 'Piping Team 1',
  discipline: 'piping',
  planned_strength: 22,
  today_present: 21,
  today_absent: 1,
  today_record_id: 'rec-1',
  today_planned: 22,
};

// A rest day, exactly as seed_workforce and POST /workforce/attendance write
// one: contracted 0, present 0 (D-117). The crew's STANDING strength is still
// 14 — that is the trap this fixture exists to catch.
const REST_DAY = {
  ...UNMARKED,
  crew_id: 'ELE-TEAM-01',
  name: 'Electrical Team',
  discipline: 'electrical',
  trade: 'electrician',
  planned_strength: 14,
  today_present: 0,
  today_absent: 0,
  today_record_id: 'rec-rest',
  today_planned: 0,
};

// The other way a present count of zero happens: the whole crew was due and
// none of them came. Same `today_present`, completely different fact.
const TOTAL_NO_SHOW = {
  ...REST_DAY,
  crew_id: 'INS-TEAM-01',
  name: 'Instrumentation Team',
  discipline: 'instrumentation',
  trade: 'instrument_tech',
  planned_strength: 9,
  today_record_id: 'rec-noshow',
  today_absent: 9,
  today_planned: 9,
};

const COMMITTED = {
  id: 'a1',
  crew_id: 'CIV-TEAM-01',
  crew_name: 'Civil Team 1',
  discipline: 'civil',
  contractor: 'ABC Infra Pvt Ltd',
  activity_id: 'CIV-SIT-1001',
  activity_description: 'Site Clearing & Grubbing — Zone A',
  from_date: '2026-08-01',
  to_date: '2026-08-15',
  days: 15,
  allocated_strength: 14,
  man_days: 210,
  status: 'committed' as const,
  rationale: ['discipline_match', 'trade:mason'],
  requested_by: 'planner',
  decided_by: 'planner',
  decided_at: '2026-08-01T00:00:00',
  note: null,
  created_at: '2026-08-01T00:00:00',
};

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(api, 'getCrews').mockResolvedValue([UNMARKED, MARKED] as never);
  vi.spyOn(api, 'getAssignments').mockResolvedValue([COMMITTED] as never);
  vi.spyOn(api, 'getSchedule').mockResolvedValue({
    project: 'OIL Well-Site Duliajan',
    activities: [
      { activity_id: 'CIV-SIT-1001', description: 'Site Clearing', actual_finish: null },
      { activity_id: 'CIV-SIT-1002', description: 'Done already', actual_finish: '2026-08-02' },
    ],
  } as never);
  vi.spyOn(api, 'markAttendance').mockResolvedValue({ id: 'new' } as never);
  vi.spyOn(api, 'proposeAssignment').mockResolvedValue({ id: 'p1' } as never);
});

afterEach(() => {
  window.localStorage.clear();
});

// ── Not marked is not zero ─────────────────────────────────────────────────

describe('the muster distinguishes "not counted" from "nobody came"', () => {
  it('pre-fills an unmarked crew with its contracted strength, not zero', async () => {
    wrap(<CrewScreen />);
    const panel = await musterCard('Civil Team 1');
    // 18 contracted and nobody has counted yet: the common case is a full
    // turnout and one tap, so the stepper starts at 18 rather than at 0.
    expect(within(panel).getByText('18')).toBeInTheDocument();
    expect(within(panel).queryByText('Marked')).toBeNull();
  });

  it('shows an already-marked crew as marked, at the count that was recorded', async () => {
    wrap(<CrewScreen />);
    const panel = await musterCard('Piping Team 1');
    expect(within(panel).getByText('21')).toBeInTheDocument();
    expect(within(panel).getByText('Marked')).toBeInTheDocument();
  });

  it('counts marked crews honestly in the header', async () => {
    wrap(<CrewScreen />);
    expect(
      await screen.findByText('1 of 2 crews marked for today.')
    ).toBeInTheDocument();
  });
});

// ── A correction is a correction ───────────────────────────────────────────

describe('correcting a count appends rather than overwrites', () => {
  it('says the first reading is kept', async () => {
    wrap(<CrewScreen />);
    const panel = await musterCard('Piping Team 1');
    expect(
      within(panel).getByText(/the first is never overwritten/i)
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole('button', { name: /correct today/i })
    ).toBeInTheDocument();
  });

  it('sends supersedes_id so the server chains rather than mutates', async () => {
    wrap(<CrewScreen />);
    const panel = await musterCard('Piping Team 1');
    fireEvent.click(within(panel).getByRole('button', { name: /correct today/i }));

    await waitFor(() => expect(api.markAttendance).toHaveBeenCalled());
    const body = vi.mocked(api.markAttendance).mock.calls[0][0];
    expect(body.supersedes_id).toBe('rec-1');
  });

  it('a first muster carries no supersedes_id', async () => {
    wrap(<CrewScreen />);
    const panel = await musterCard('Civil Team 1');
    fireEvent.click(within(panel).getByRole('button', { name: /save muster/i }));

    await waitFor(() => expect(api.markAttendance).toHaveBeenCalled());
    expect(vi.mocked(api.markAttendance).mock.calls[0][0].supersedes_id).toBeNull();
  });
});

// ── A rest day is not a no-show ────────────────────────────────────────────

describe('a rest day and a total no-show both read zero present', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getCrews').mockResolvedValue([REST_DAY, TOTAL_NO_SHOW] as never);
  });

  it('does not report the whole crew missing on a rest day', async () => {
    wrap(<CrewScreen />);
    const panel = await musterCard('Electrical Team');
    // The bug this guards: absent was computed as planned_strength - present,
    // which on a rest day is 14 - 0, so every Sunday rendered as a total
    // walkout with fourteen unexplained absences.
    expect(within(panel).queryByText(/missing/i)).toBeNull();
    expect(within(panel).queryByText(/unexplained/i)).toBeNull();
  });

  it('shows a rest day as a rest day, with the box already ticked', async () => {
    wrap(<CrewScreen />);
    const panel = await musterCard('Electrical Team');
    expect(within(panel).getByRole('checkbox')).toBeChecked();
    expect(
      within(panel).getByText(/already marked as a rest day/i)
    ).toBeInTheDocument();
  });

  it('still reports a genuine total no-show as missing heads', async () => {
    wrap(<CrewScreen />);
    const panel = await musterCard('Instrumentation Team');
    // 9 contracted that day, nobody present. This one IS a walkout and the
    // fix must not swallow it.
    expect(within(panel).getByText(/9 missing/i)).toBeInTheDocument();
    expect(within(panel).getByRole('checkbox')).not.toBeChecked();
  });

  it('untucking the rest day offers the full crew, not the stored zero', async () => {
    wrap(<CrewScreen />);
    const panel = await musterCard('Electrical Team');
    fireEvent.click(within(panel).getByRole('checkbox'));
    // A supervisor correcting a wrongly-marked rest day starts from a full
    // turnout, the same place an unmarked crew starts.
    expect(within(panel).getByText('14')).toBeInTheDocument();
  });

  it('a rest day still sends rest_day and supersedes the stored reading', async () => {
    wrap(<CrewScreen />);
    const panel = await musterCard('Electrical Team');
    fireEvent.click(within(panel).getByRole('button', { name: /correct today/i }));

    await waitFor(() => expect(api.markAttendance).toHaveBeenCalled());
    const body = vi.mocked(api.markAttendance).mock.calls[0][0];
    expect(body.rest_day).toBe(true);
    expect(body.present).toBe(0);
    expect(body.supersedes_id).toBe('rec-rest');
  });
});

// ── Absences must add up ───────────────────────────────────────────────────

describe('the headcount and the reasons reconcile', () => {
  it('attributes unexplained absences to "other" rather than dropping them', async () => {
    wrap(<CrewScreen />);
    const panel = await musterCard('Civil Team 1');

    // 18 contracted, drop to 15 present -> 3 missing, none explained.
    const minus = within(panel).getByLabelText('One fewer');
    fireEvent.click(minus);
    fireEvent.click(minus);
    fireEvent.click(minus);
    expect(within(panel).getByText(/3 missing · 3 unexplained/)).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: /save muster/i }));
    await waitFor(() => expect(api.markAttendance).toHaveBeenCalled());

    const body = vi.mocked(api.markAttendance).mock.calls[0][0];
    expect(body.present).toBe(15);
    // The discipline rollup would silently lose three absences otherwise.
    expect(body.absence_reasons).toEqual({ other: 3 });
  });

  it('a rest day submits nobody present and nobody absent', async () => {
    wrap(<CrewScreen />);
    const panel = await musterCard('Civil Team 1');
    fireEvent.click(within(panel).getByRole('checkbox'));
    fireEvent.click(within(panel).getByRole('button', { name: /save muster/i }));

    await waitFor(() => expect(api.markAttendance).toHaveBeenCalled());
    const body = vi.mocked(api.markAttendance).mock.calls[0][0];
    expect(body.rest_day).toBe(true);
    expect(body.present).toBe(0);
    expect(body.absence_reasons).toEqual({});
  });

  it('explains what a rest day is for, in the supervisor’s terms', async () => {
    wrap(<CrewScreen />);
    const panel = await musterCard('Civil Team 1');
    expect(
      within(panel).getByText(/instead of counting it as a no-show/i)
    ).toBeInTheDocument();
  });
});

// ── A request is not a booking ─────────────────────────────────────────────

describe('asking for manpower is a proposal', () => {
  it('says so before the supervisor sends it', async () => {
    wrap(<CrewScreen />);
    expect(
      await screen.findByText(/does not book the crew and it does not change the schedule/i)
    ).toBeInTheDocument();
  });

  it('offers only activities that are still open', async () => {
    wrap(<CrewScreen />);
    const label = await screen.findByText('For which activity');
    const activitySelect = label.parentElement?.querySelector(
      'select'
    ) as HTMLSelectElement;
    // The list is populated from the schedule query, so wait for it rather
    // than asserting against the placeholder option.
    await waitFor(() =>
      expect(
        Array.from(activitySelect.options).map((o) => o.value)
      ).toContain('CIV-SIT-1001')
    );
    const options = Array.from(activitySelect.options).map((o) => o.value);
    // Asking for people on finished work is a mistake the form must not allow.
    expect(options).not.toContain('CIV-SIT-1002');
  });

  it('labels a proposed assignment as waiting on the planner', async () => {
    vi.mocked(api.getAssignments).mockResolvedValue([
      { ...COMMITTED, id: 'a2', status: 'proposed', decided_by: null },
    ] as never);
    wrap(<CrewScreen />);
    expect(
      await screen.findByText(/Waiting on your planner — not confirmed/i)
    ).toBeInTheDocument();
  });

  it('keeps a refused request visible with the reason', async () => {
    vi.mocked(api.getAssignments).mockResolvedValue([
      {
        ...COMMITTED,
        id: 'a3',
        status: 'withdrawn',
        note: 'No crew to spare this cycle',
      },
    ] as never);
    wrap(<CrewScreen />);
    // "Manpower was asked for and refused" is what a delay claim points at.
    expect(
      await screen.findByText(/Declined — No crew to spare this cycle/i)
    ).toBeInTheDocument();
  });
});

// ── The outbox ─────────────────────────────────────────────────────────────

describe('the outbox keeps work a lost link would have destroyed', () => {
  it('queues in order and reports its depth', () => {
    enqueue('attendance', { crew_id: 'A', present: 1 });
    enqueue('assignment_request', { crew_id: 'A' });
    expect(pendingOutbox()).toHaveLength(2);
    expect(pendingOutbox()[0].kind).toBe('attendance');
  });

  it('sends oldest first, so a request cannot land before its muster', async () => {
    enqueue('attendance', { crew_id: 'A', present: 1 });
    enqueue('assignment_request', { crew_id: 'A' });
    const sent: string[] = [];
    await flushOutbox(
      async (item) => {
        sent.push(item.kind);
      },
      () => false
    );
    expect(sent).toEqual(['attendance', 'assignment_request']);
    expect(pendingOutbox()).toHaveLength(0);
  });

  it('keeps an item the network could not deliver, and stops trying the rest', async () => {
    enqueue('attendance', { crew_id: 'A', present: 1 });
    enqueue('attendance', { crew_id: 'B', present: 2 });
    const result = await flushOutbox(
      async () => {
        throw new Error('Failed to fetch');
      },
      () => false
    );
    // Burning the whole queue's retry budget against a link that is plainly
    // down helps nobody.
    expect(result.sent).toBe(0);
    expect(result.kept).toBe(1);
    expect(pendingOutbox()).toHaveLength(2);
  });

  it('surfaces a server refusal instead of retrying it forever', async () => {
    enqueue('attendance', { crew_id: 'GONE', present: 1 });
    const result = await flushOutbox(
      async () => {
        throw new ApiError(422, 'Unknown activity id(s): NOPE');
      },
      (e) => e instanceof ApiError && e.status < 500
    );
    expect(result.rejected).toBe(1);
    expect(pendingOutbox()).toHaveLength(0);
    // Not lost, and not silently dropped: shown to the supervisor.
    expect(rejectedOutbox()[0].rejected?.detail).toContain('Unknown activity');
    expect(listOutbox()).toHaveLength(1);
  });

  it('survives a corrupt stored blob rather than crashing every read', () => {
    window.localStorage.setItem('navis.outbox.v1', '{not json');
    expect(listOutbox()).toEqual([]);
  });
});
