import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ClipboardList,
  HardHat,
  Loader2,
  Minus,
  Plus,
  Send,
  Users,
} from 'lucide-react';
import { api, errorDetail } from '../../lib/api';
import { enqueue } from '../../lib/outbox';
import { useConnectivity } from '../../hooks/useConnectivity';
import { OfflineBanner } from '../../components/LinkStatus';
import { ErrorState, SkeletonRows } from '../../components/ui';
import type { Crew, ResourceAssignment } from '../../types';

/**
 * The Field Supervisor's manpower screen: muster, deployment, and asking for
 * more people.
 *
 * ONE TAB, THREE SYSTEMS, BECAUSE IT IS ONE SUBJECT
 * -------------------------------------------------
 * Attendance, deployment and a manpower request are three different tables and
 * one conversation at the work front: who turned up, what they are on, and
 * whether it is enough. Splitting them across three tabs would make a
 * supervisor navigate to answer a question they are already standing in front
 * of, and the phone's bottom bar has room for five tabs, not seven.
 *
 * FIFTEEN SECONDS
 * ---------------
 * The muster is the highest-frequency action in the whole product — once per
 * crew per day, at the face, one-handed, often in the sun with gloves on. So
 * the present count is pre-filled with the crew's contracted strength and the
 * common case is one tap on Save. Steppers are 44px. Absence reasons are
 * chips, not a dropdown, and are only asked for once somebody is actually
 * missing.
 *
 * WHAT THIS SCREEN CANNOT DO
 * --------------------------
 * It cannot commit manpower. Asking for four more fitters creates a PROPOSAL
 * (D-009 applied to resources, D-117); the Project Manager decides. The screen
 * says so in those words rather than implying it, because a supervisor who
 * believes the crew is confirmed will plan tomorrow around people who are not
 * coming.
 */

const REASONS: Array<{ key: string; label: string }> = [
  { key: 'leave', label: 'Leave' },
  { key: 'sick', label: 'Sick' },
  { key: 'no_show', label: 'No show' },
  { key: 'redeployed', label: 'Moved' },
  { key: 'weather', label: 'Weather' },
  { key: 'other', label: 'Other' },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CrewScreen() {
  const link = useConnectivity();
  const on = today();

  const crews = useQuery({
    queryKey: ['crews', on],
    queryFn: () => api.getCrews({ on }),
  });

  const assignments = useQuery({
    queryKey: ['assignments', 'field'],
    queryFn: () => api.getAssignments(),
  });

  const marked = (crews.data ?? []).filter((c) => c.today_present !== null).length;
  const total = crews.data?.length ?? 0;

  return (
    <div className="w-full bg-surface text-fg font-sans">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 pb-10 sm:px-6 lg:px-8 lg:py-8">
        <header>
          <h1 className="text-h2 font-semibold tracking-[-0.03em] text-heading">
            Crew
          </h1>
          <p className="mt-1 text-body leading-6 text-muted">
            Mark who turned up, see where they are working, and ask for more
            people if you are short.
          </p>
        </header>

        <OfflineBanner />

        {/* The one number that says whether today's register is done. */}
        {!crews.isLoading && !crews.error && total > 0 && (
          <div
            className={`flex items-center gap-2.5 rounded-xl p-3 ring-1 ${
              marked === total
                ? 'bg-ok/10 ring-ok/30'
                : 'bg-amber-500/10 ring-amber-500/30'
            }`}
          >
            {marked === total ? (
              <Check size={16} className="shrink-0 text-ok" />
            ) : (
              <ClipboardList size={16} className="shrink-0 text-amber-500" />
            )}
            <p className="text-label leading-5 text-fg">
              {marked === total
                ? `All ${total} crews marked for today.`
                : `${marked} of ${total} crews marked for today.`}
            </p>
          </div>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lead font-semibold text-heading">
            <Users size={16} className="text-accent" />
            Today&rsquo;s muster
          </h2>

          {crews.isLoading && <SkeletonRows rows={3} />}
          {crews.error && <ErrorState error={crews.error} />}
          {!crews.isLoading && !crews.error && total === 0 && (
            <p className="rounded-xl bg-secondary p-4 text-body text-muted">
              No crews are on the register yet. Your planner adds them.
            </p>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {(crews.data ?? []).map((crew) => (
              <MusterCard key={crew.crew_id} crew={crew} on={on} offline={!link.online} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lead font-semibold text-heading">
            <HardHat size={16} className="text-accent" />
            Where your crews are working
          </h2>
          <Deployment
            rows={assignments.data ?? []}
            loading={assignments.isLoading}
            error={assignments.error}
          />
        </section>

        <RequestManpower crews={crews.data ?? []} offline={!link.online} />
      </div>
    </div>
  );
}

// ── Muster ──────────────────────────────────────────────────────────────────

function MusterCard({
  crew,
  on,
  offline,
}: {
  crew: Crew;
  on: string;
  offline: boolean;
}) {
  const qc = useQueryClient();
  // `today_present` is null for "not marked", which is NOT zero. Pre-fill with
  // the contracted strength because a full turnout is the common case and the
  // whole point is one tap.
  const alreadyMarked = crew.today_present !== null;
  // A rest day is stored as contracted 0, present 0 (D-117). `today_planned`
  // is the muster's own contracted figure, so zero-while-marked is the only
  // thing that shape can be — a real total no-show records the crew's full
  // strength as contracted and nobody present. Without this the card reads
  // today's roster size, subtracts a present count of zero, and renders every
  // Sunday as "18 missing · 18 unexplained" (D-125).
  const markedRestDay = alreadyMarked && crew.today_planned === 0;
  const [present, setPresent] = useState<number>(
    // On a rest day the stored reading is 0 by definition, which would be a
    // useless starting point if the supervisor unticks the box to correct it.
    // Fall back to the standing strength, same as an unmarked crew.
    markedRestDay ? crew.planned_strength : crew.today_present ?? crew.planned_strength
  );
  const [reasons, setReasons] = useState<Record<string, number>>({});
  const [restDay, setRestDay] = useState(markedRestDay);
  const [open, setOpen] = useState(false);
  const [queued, setQueued] = useState(false);

  const absent = restDay ? 0 : Math.max(0, crew.planned_strength - present);
  const assigned = Object.values(reasons).reduce((a, b) => a + b, 0);
  const unassigned = absent - assigned;

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof api.markAttendance>[0]) =>
      api.markAttendance(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crews'] });
      void qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });

  const submit = () => {
    const body = {
      crew_id: crew.crew_id,
      attendance_date: on,
      present: restDay ? 0 : present,
      // Anything the supervisor did not attribute is recorded as `other`
      // rather than dropped: the headcount and the reasons must add up, or
      // the discipline rollup silently loses absences.
      absence_reasons: restDay
        ? {}
        : unassigned > 0
          ? { ...reasons, other: (reasons.other ?? 0) + unassigned }
          : reasons,
      activity_ids: [],
      rest_day: restDay,
      source: 'field_app',
      reported_by: 'field',
      // A second muster for the same crew and day supersedes the first, which
      // is what makes a correction append rather than overwrite (D-117).
      supersedes_id: crew.today_record_id,
    };

    if (offline) {
      enqueue('attendance', body);
      setQueued(true);
      return;
    }
    mutation.mutate(body);
  };

  const done = queued || mutation.isSuccess;

  return (
    <div className="rounded-2xl bg-raised p-4 ring-1 ring-hair">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-heading">{crew.name}</p>
          <p className="mt-0.5 text-label text-muted">
            {crew.discipline.replace('_', ' ')} · {crew.planned_strength} contracted
            {crew.trade ? ` · ${crew.trade.replace('_', ' ')}` : ''}
          </p>
        </div>
        {alreadyMarked && !done && (
          <span className="shrink-0 rounded-full bg-ok/15 px-2 py-0.5 text-label font-semibold text-ok">
            Marked
          </span>
        )}
        {done && (
          <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-label font-semibold text-accent">
            {queued ? 'Saved on phone' : 'Sent'}
          </span>
        )}
      </div>

      {!restDay && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-label font-medium text-muted">Present</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPresent((v) => Math.max(0, v - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-heading ring-1 ring-hair active:bg-selected"
              aria-label="One fewer"
            >
              <Minus size={18} />
            </button>
            <span className="min-w-[3ch] text-center font-mono text-h3 font-bold text-heading">
              {present}
            </span>
            <button
              type="button"
              onClick={() =>
                setPresent((v) => Math.min(crew.planned_strength, v + 1))
              }
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-heading ring-1 ring-hair active:bg-selected"
              aria-label="One more"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      )}

      {!restDay && absent > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg py-1 text-label font-medium text-accent"
          >
            <span>
              {absent} missing
              {unassigned > 0 ? ` · ${unassigned} unexplained` : ' · all explained'}
            </span>
            <ChevronDown
              size={14}
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
          {open && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() =>
                    setReasons((prev) => {
                      const current = prev[r.key] ?? 0;
                      // Cannot attribute more heads than are actually missing.
                      if (current === 0 && unassigned <= 0) return prev;
                      const next = { ...prev };
                      if (current === 0) next[r.key] = 1;
                      else if (unassigned > 0) next[r.key] = current + 1;
                      else delete next[r.key];
                      return next;
                    })
                  }
                  className={`min-h-9 rounded-full px-3 text-label font-medium ring-1 transition-colors ${
                    reasons[r.key]
                      ? 'bg-accent text-accent-fg ring-accent'
                      : 'bg-surface text-heading ring-hair'
                  }`}
                >
                  {r.label}
                  {reasons[r.key] ? ` ${reasons[r.key]}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <label className="mt-3 flex min-h-11 items-center gap-2.5 text-label text-fg">
        <input
          type="checkbox"
          checked={restDay}
          onChange={(e) => setRestDay(e.target.checked)}
          className="h-5 w-5 rounded border-hair accent-[var(--accent)]"
        />
        <span>
          Rest day — nobody was due
          <span className="block text-muted">
            Keeps today out of the crew&rsquo;s attendance record instead of
            counting it as a no-show.
          </span>
        </span>
      </label>

      {mutation.isError && (
        <p className="mt-3 rounded-lg bg-danger/10 p-2 text-label text-danger">
          {errorDetail(mutation.error)}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={mutation.isPending || done}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-body font-semibold text-accent-fg disabled:opacity-60"
      >
        {mutation.isPending ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Check size={16} />
        )}
        {done
          ? queued
            ? 'Will send when online'
            : 'Saved'
          : alreadyMarked
            ? 'Correct today’s count'
            : 'Save muster'}
      </button>

      {alreadyMarked && !done && (
        <p className="mt-2 text-label leading-5 text-muted">
          {markedRestDay
            ? 'Already marked as a rest day — nobody was due.'
            : `Already marked at ${crew.today_present} present.`}{' '}
          Saving again keeps both readings — the first is never overwritten.
        </p>
      )}
    </div>
  );
}

// ── Deployment ──────────────────────────────────────────────────────────────

function Deployment({
  rows,
  loading,
  error,
}: {
  rows: ResourceAssignment[];
  loading: boolean;
  error: unknown;
}) {
  const committed = rows.filter((r) => r.status === 'committed');
  const waiting = rows.filter((r) => r.status === 'proposed');
  const refused = rows.filter((r) => r.status === 'withdrawn');

  if (loading) return <SkeletonRows rows={2} />;
  if (error) return <ErrorState error={error} />;
  if (!rows.length) {
    return (
      <p className="rounded-xl bg-secondary p-4 text-body text-muted">
        No crews are assigned to activities yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {committed.map((row) => (
        <AssignmentRow key={row.id} row={row} tone="ok" note="Confirmed by your planner" />
      ))}
      {waiting.map((row) => (
        <AssignmentRow
          key={row.id}
          row={row}
          tone="wait"
          note="Waiting on your planner — not confirmed"
        />
      ))}
      {refused.map((row) => (
        <AssignmentRow
          key={row.id}
          row={row}
          tone="off"
          note={row.note ? `Declined — ${row.note}` : 'Declined by your planner'}
        />
      ))}
    </div>
  );
}

function AssignmentRow({
  row,
  tone,
  note,
}: {
  row: ResourceAssignment;
  tone: 'ok' | 'wait' | 'off';
  note: string;
}) {
  const ring =
    tone === 'ok'
      ? 'ring-hair'
      : tone === 'wait'
        ? 'ring-amber-500/30 bg-amber-500/5'
        : 'ring-hair opacity-70';
  return (
    <div className={`rounded-xl bg-raised p-3 ring-1 ${ring}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-body font-medium text-heading">
          {row.crew_name}
        </p>
        <span className="shrink-0 font-mono text-label text-muted">
          {row.allocated_strength} people
        </span>
      </div>
      <p className="mt-0.5 truncate text-label text-muted" title={row.activity_description}>
        {row.activity_id} · {row.activity_description}
      </p>
      <p className="mt-1 text-label text-muted">
        {row.from_date} → {row.to_date} · {note}
      </p>
    </div>
  );
}

// ── Request manpower ────────────────────────────────────────────────────────

function RequestManpower({ crews, offline }: { crews: Crew[]; offline: boolean }) {
  const qc = useQueryClient();
  const [crewId, setCrewId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [strength, setStrength] = useState(4);
  const [note, setNote] = useState('');
  const [queued, setQueued] = useState(false);

  const schedule = useQuery({
    queryKey: ['schedule', 'header'],
    queryFn: () => api.getSchedule(undefined, false),
    retry: false,
  });

  // Only activities that are actually open: asking for people on something
  // already finished is a mistake the form should not let you make.
  const openActivities = useMemo(() => {
    const all = schedule.data?.activities ?? [];
    return all.filter((a) => !a.actual_finish).slice(0, 60);
  }, [schedule.data]);

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof api.proposeAssignment>[0]) =>
      api.proposeAssignment(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignments'] });
      setNote('');
    },
  });

  const submit = () => {
    if (!crewId || !activityId) return;
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
    const body = {
      crew_id: crewId,
      activity_id: activityId,
      from_date: from,
      to_date: to,
      allocated_strength: strength,
      note: note || null,
      requested_by: 'field',
    };
    if (offline) {
      enqueue('assignment_request', body);
      setQueued(true);
      return;
    }
    mutation.mutate(body);
  };

  const done = queued || mutation.isSuccess;

  return (
    <section className="rounded-2xl bg-raised p-4 ring-1 ring-hair">
      <h2 className="flex items-center gap-2 text-lead font-semibold text-heading">
        <Send size={16} className="text-accent" />
        Ask for more people
      </h2>

      {/* Said in the supervisor's own terms, not as a policy note. A person who
          thinks the crew is confirmed will plan tomorrow around people who are
          not coming. */}
      <div className="mt-2 flex items-start gap-2 rounded-xl bg-secondary p-3">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
        <p className="text-label leading-5 text-fg">
          This sends a <strong className="font-semibold">request</strong>. It does
          not book the crew and it does not change the schedule — your planner
          decides, and you will see the answer under &ldquo;Where your crews are
          working&rdquo;.
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-label font-medium text-muted">Crew</span>
          <select
            value={crewId}
            onChange={(e) => setCrewId(e.target.value)}
            className="min-h-12 rounded-xl bg-surface px-3 text-body text-fg ring-1 ring-hair"
          >
            <option value="">Choose a crew…</option>
            {crews.map((c) => (
              <option key={c.crew_id} value={c.crew_id}>
                {c.name} ({c.discipline.replace('_', ' ')})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-label font-medium text-muted">For which activity</span>
          <select
            value={activityId}
            onChange={(e) => setActivityId(e.target.value)}
            className="min-h-12 rounded-xl bg-surface px-3 text-body text-fg ring-1 ring-hair"
          >
            <option value="">Choose an activity…</option>
            {openActivities.map((a) => (
              <option key={a.activity_id} value={a.activity_id}>
                {a.activity_id} — {a.description}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center justify-between gap-3">
          <span className="text-label font-medium text-muted">How many extra</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStrength((v) => Math.max(1, v - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-heading ring-1 ring-hair"
              aria-label="One fewer"
            >
              <Minus size={18} />
            </button>
            <span className="min-w-[3ch] text-center font-mono text-h3 font-bold text-heading">
              {strength}
            </span>
            <button
              type="button"
              onClick={() => setStrength((v) => Math.min(99, v + 1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-heading ring-1 ring-hair"
              aria-label="One more"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-label font-medium text-muted">Why (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Backfill at the rack trenches is running slow"
            className="rounded-xl bg-surface p-3 text-body text-fg ring-1 ring-hair"
          />
        </label>

        {mutation.isError && (
          <p className="rounded-lg bg-danger/10 p-2 text-label text-danger">
            {errorDetail(mutation.error)}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!crewId || !activityId || mutation.isPending || done}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-body font-semibold text-accent-fg disabled:opacity-50"
        >
          {mutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
          {done
            ? queued
              ? 'Will send when online'
              : 'Request sent to your planner'
            : 'Send request'}
        </button>
      </div>
    </section>
  );
}
