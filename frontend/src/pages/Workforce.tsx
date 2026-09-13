import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Gauge,
  Loader2,
  ScrollText,
  Users,
  X,
} from 'lucide-react';
import { api, errorDetail } from '../lib/api';
import { usePageHeader } from '../hooks/usePageHeader';
import {
  DataTableShell,
  DisclosureNotice,
  EmptyState,
  ErrorState,
  MetricCard,
  PageIntro,
  SkeletonRows,
  StatusBadge,
  Toolbar,
} from '../components/ui';
import type {
  AllocationBoardRow,
  AttendanceRollupRow,
  ResourceAssignment,
} from '../types';

/**
 * The Project Manager's manpower workspace.
 *
 * TWO TABS, BECAUSE THEY ANSWER TWO DIFFERENT QUESTIONS
 * -----------------------------------------------------
 *   Register    what actually happened — who turned up, and where the
 *               shortfall was. Evidence. Feeds a MANPOWER delay finding.
 *   Allocation  what is meant to happen — demand against supply, and the
 *               proposals waiting on a decision. Intention.
 *
 * The PM is the only role that can turn the second into a commitment
 * (D-009, D-117), and the commit control lives on this page and nowhere else.
 *
 * WHAT THIS PAGE REFUSES TO SHOW
 * ------------------------------
 * A percentage against a zero denominator, a reliability figure from too few
 * musters, and a demand figure for an activity type with no productivity norm.
 * Each of those is rendered as a stated absence rather than as a number,
 * because a plausible fabricated figure on a manpower board is worse than a
 * blank: somebody will move a crew on it.
 */

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function mondayOfThisWeek(): string {
  const d = new Date();
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
}

/** A percentage, or the reason there isn't one. Never a fabricated 0%. */
function pct(value: number | null): React.ReactNode {
  if (value === null) return <span className="text-muted">not contracted</span>;
  return <span className="tabular-nums">{value.toFixed(1)}%</span>;
}

export default function Workforce() {
  usePageHeader(
    'Workforce',
    'Who turned up, and who is committed where',
    '/workforce'
  );
  const [tab, setTab] = useState<'register' | 'allocation'>('register');

  return (
    <div className="flex flex-col gap-6">
      <PageIntro
        eyebrow="Manpower"
        title="Workforce"
        description={
          tab === 'register'
            ? 'The muster register: what the crews actually fielded, and where the shortfall was. This is the evidence a MANPOWER delay finding is argued from.'
            : 'Demand against supply, week by week — and the manpower your supervisors have asked for. You are the only role that can commit a crew.'
        }
      />

      <Toolbar>
        <TabButton active={tab === 'register'} onClick={() => setTab('register')} icon={ScrollText}>
          Register
        </TabButton>
        <TabButton active={tab === 'allocation'} onClick={() => setTab('allocation')} icon={CalendarDays}>
          Allocation
        </TabButton>
      </Toolbar>

      {tab === 'register' ? <Register /> : <Allocation />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-body font-medium transition-colors cursor-pointer ${
        active
          ? 'bg-selected text-accent font-semibold'
          : 'text-muted hover:bg-secondary hover:text-heading'
      }`}
    >
      <Icon size={15} />
      {children}
    </button>
  );
}

// ── Register ────────────────────────────────────────────────────────────────

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
];

function Register() {
  const [days, setDays] = useState(14);
  const start = isoDaysAgo(days - 1);
  const end = isoDaysAgo(0);

  const summary = useQuery({
    queryKey: ['attendance', 'summary', start, end],
    queryFn: () => api.getAttendanceSummary({ start, end }),
  });

  if (summary.isLoading) return <SkeletonRows rows={6} />;
  if (summary.error) return <ErrorState error={summary.error} />;
  if (!summary.data) return null;

  const t = summary.data.totals;

  return (
    <div className="flex flex-col gap-5">
      <Toolbar>
        <span className="px-2 text-label font-medium text-muted">Window</span>
        {WINDOWS.map((w) => (
          <button
            key={w.days}
            type="button"
            onClick={() => setDays(w.days)}
            className={`rounded-lg px-3 py-1.5 text-label font-medium cursor-pointer ${
              days === w.days
                ? 'bg-selected text-accent font-semibold'
                : 'text-muted hover:bg-secondary'
            }`}
          >
            {w.label}
          </button>
        ))}
      </Toolbar>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Attendance"
          value={t.attendance_pct === null ? '—' : `${t.attendance_pct.toFixed(1)}%`}
          detail={`${t.present} of ${t.planned_strength} contracted, across ${t.musters} musters`}
          tone={
            t.attendance_pct === null
              ? 'default'
              : t.attendance_pct >= 90
                ? 'ok'
                : t.attendance_pct >= 80
                  ? 'warn'
                  : 'danger'
          }
          icon={<Users size={15} />}
        />
        <MetricCard
          label="Man-days fielded"
          value={t.man_days.toLocaleString()}
          detail="The denominator behind every man-day productivity figure"
          icon={<Gauge size={15} />}
        />
        <MetricCard
          label="Shortfall"
          value={t.shortfall.toLocaleString()}
          detail="Heads short of contracted strength over the window"
          tone={t.shortfall > 0 ? 'warn' : 'ok'}
        />
        <MetricCard
          label="Contested readings"
          value={summary.data.conflicts.length}
          detail={
            summary.data.conflicts.length
              ? 'Two sources counted the same team differently'
              : 'No source disagrees with another'
          }
          tone={summary.data.conflicts.length ? 'danger' : 'ok'}
        />
      </div>

      {/* Rest days are the reason a percentage can be absent. Said once, at
          the top, rather than repeated against every null cell. */}
      <DisclosureNotice summary="How these figures are computed, and when they are withheld">
        <p>
          <strong className="text-heading">Attendance</strong> is present heads
          over the strength each crew was <em>contracted</em> to field that day,
          snapshotted onto the muster when it was taken. Re-sizing a crew
          therefore cannot rewrite a past shortfall.
        </p>
        <p className="mt-2">
          A day with <strong className="text-heading">nothing contracted</strong>{' '}
          — a rest day on the site calendar — carries no percentage rather than
          a 0%. Recording rest days as total no-shows previously made every
          contractor read as unreliable; that was the calendar, not the
          contractor.
        </p>
        <p className="mt-2">
          A contractor with fewer than five musters is shown as{' '}
          <strong className="text-heading">not measured</strong>, never as
          unreliable. Two data points cannot convict anybody.
        </p>
      </DisclosureNotice>

      {summary.data.conflicts.length > 0 && (
        <section className="rounded-xl bg-danger-bg p-4 ring-1 ring-danger/30">
          <h3 className="flex items-center gap-2 text-body font-semibold text-danger">
            <AlertTriangle size={15} />
            Two sources disagree on a headcount
          </h3>
          <p className="mt-1 text-label leading-5 text-muted">
            Both readings are live and neither has been superseded. NAVIS shows
            the disagreement rather than picking one, because picking one
            silently would destroy the only evidence that they differed.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {summary.data.conflicts.map((c) => (
              <li key={`${c.crew_id}-${c.attendance_date}`} className="rounded-lg bg-raised p-3">
                <p className="text-body font-medium text-heading">
                  {c.crew_name} · {c.attendance_date}
                </p>
                <p className="mt-1 text-label text-muted">
                  {c.records
                    .map((r) => `${r.present} present (${r.source})`)
                    .join('  vs  ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RollupTable
        title="By discipline"
        caption="Worst shortfall first — this answers “where is the manpower missing”."
        rows={summary.data.by_discipline}
        keyField="discipline"
      />

      <RollupTable
        title="By contractor"
        caption="Did they field the strength they contracted to field?"
        rows={summary.data.by_contractor}
        keyField="contractor"
        showReliability
      />

      <DailyCurve rows={summary.data.daily} />
    </div>
  );
}

function RollupTable({
  title,
  caption,
  rows,
  keyField,
  showReliability = false,
}: {
  title: string;
  caption: string;
  rows: AttendanceRollupRow[];
  keyField: 'discipline' | 'contractor';
  showReliability?: boolean;
}) {
  if (!rows.length) {
    return (
      <EmptyState title={`No ${keyField} data in this window`}>
        No musters were recorded, so there is nothing to roll up.
      </EmptyState>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-lead font-semibold text-heading">{title}</h3>
        <p className="text-label text-muted">{caption}</p>
      </div>
      <DataTableShell>
        <table className="w-full min-w-[640px] text-body">
          <thead className="bg-secondary text-label uppercase tracking-[0.06em] text-muted">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">
                {keyField === 'discipline' ? 'Discipline' : 'Contractor'}
              </th>
              <th className="px-4 py-2.5 text-right font-semibold">Contracted</th>
              <th className="px-4 py-2.5 text-right font-semibold">Present</th>
              <th className="px-4 py-2.5 text-right font-semibold">Shortfall</th>
              <th className="px-4 py-2.5 text-right font-semibold">Attendance</th>
              {showReliability && (
                <th className="px-4 py-2.5 text-left font-semibold">Verdict</th>
              )}
              <th className="px-4 py-2.5 text-left font-semibold">Top reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const topReason = Object.entries(r.absence_reasons)[0];
              return (
                <tr key={String(r[keyField])} className="border-t border-hair">
                  <td className="px-4 py-2.5 font-medium text-heading">
                    {String(r[keyField]).replace('_', ' ')}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.planned_strength}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.present}</td>
                  <td
                    className={`px-4 py-2.5 text-right tabular-nums ${
                      r.shortfall > 0 ? 'text-warn font-semibold' : ''
                    }`}
                  >
                    {r.shortfall}
                  </td>
                  <td className="px-4 py-2.5 text-right">{pct(r.attendance_pct)}</td>
                  {showReliability && (
                    <td className="px-4 py-2.5">
                      {/* Three states. `null` is "not measured", which must
                          never be rendered as a failing grade. */}
                      {r.reliable === null ? (
                        <StatusBadge tone="neutral">Not measured</StatusBadge>
                      ) : r.reliable ? (
                        <StatusBadge tone="ok">Fielding strength</StatusBadge>
                      ) : (
                        <StatusBadge tone="warn">Under strength</StatusBadge>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-muted">
                    {topReason ? `${topReason[0].replace('_', ' ')} (${topReason[1]})` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataTableShell>
    </section>
  );
}

function DailyCurve({ rows }: { rows: AttendanceRollupRow[] }) {
  // A day with nothing contracted is drawn as a gap, not as a zero-height bar
  // sitting on the axis: a rest day and a total no-show must not look alike.
  const peak = Math.max(1, ...rows.map((r) => r.planned_strength));

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-lead font-semibold text-heading">Day by day</h3>
        <p className="text-label text-muted">
          Contracted strength in outline, present heads filled. A day with
          nothing contracted is drawn as a gap.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl bg-raised p-4 ring-1 ring-hair/80">
        <div className="flex min-w-[560px] items-end gap-1" style={{ height: 140 }}>
          {rows.map((r) => {
            const restDay = r.planned_strength === 0;
            return (
              <div
                key={r.date}
                className="group relative flex flex-1 flex-col justify-end"
                style={{ height: '100%' }}
                title={
                  restDay
                    ? `${r.date} · nothing contracted`
                    : `${r.date} · ${r.present}/${r.planned_strength} present`
                }
              >
                {restDay ? (
                  <div className="h-1 w-full rounded-sm bg-hair" />
                ) : (
                  <div
                    className="w-full rounded-t-sm bg-secondary ring-1 ring-hair"
                    style={{ height: `${(r.planned_strength / peak) * 100}%` }}
                  >
                    <div
                      className="w-full rounded-t-sm bg-accent"
                      style={{
                        height: `${(r.present / Math.max(1, r.planned_strength)) * 100}%`,
                        marginTop: `${100 - (r.present / Math.max(1, r.planned_strength)) * 100}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-label text-muted">
          <span>{rows[0]?.date}</span>
          <span>{rows[rows.length - 1]?.date}</span>
        </div>
      </div>
    </section>
  );
}

// ── Allocation ──────────────────────────────────────────────────────────────

function Allocation() {
  const qc = useQueryClient();
  const weekStart = useMemo(mondayOfThisWeek, []);

  const board = useQuery({
    queryKey: ['allocation-board', weekStart],
    queryFn: () => api.getAllocationBoard({ week_start: weekStart, weeks: 4 }),
  });
  const proposals = useQuery({
    queryKey: ['assignments', 'proposed'],
    queryFn: () => api.getAssignments({ status: 'proposed' }),
  });

  const decide = useMutation({
    mutationFn: ({
      id,
      decision,
      strength,
    }: {
      id: string;
      decision: 'commit' | 'withdraw';
      strength?: number;
    }) =>
      api.decideAssignment(id, {
        decision,
        decided_by: 'planner',
        allocated_strength: strength,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignments'] });
      void qc.invalidateQueries({ queryKey: ['allocation-board'] });
    },
  });

  if (board.isLoading) return <SkeletonRows rows={6} />;
  if (board.error) return <ErrorState error={board.error} />;
  if (!board.data) return null;

  const norms = Object.keys(board.data.norms).length;

  return (
    <div className="flex flex-col gap-5">
      {/* The proposals are the only actionable thing on this page, so they go
          first — a PM should not have to scroll past four weeks of arithmetic
          to find the decision waiting on them. */}
      <section className="flex flex-col gap-2">
        <h3 className="text-lead font-semibold text-heading">
          Waiting on you
          {proposals.data?.length ? ` (${proposals.data.length})` : ''}
        </h3>
        <p className="text-label text-muted">
          Manpower your supervisors have asked for. Nothing here has changed the
          plan — committing is the only thing that does, and only you can do it.
        </p>
        {proposals.isLoading && <SkeletonRows rows={2} />}
        {!proposals.isLoading && !proposals.data?.length && (
          <p className="rounded-xl bg-secondary p-4 text-body text-muted">
            No open requests.
          </p>
        )}
        {decide.isError && <ErrorState error={decide.error} mode="bare" />}
        <div className="flex flex-col gap-2">
          {(proposals.data ?? []).map((p) => (
            <ProposalRow
              key={p.id}
              proposal={p}
              pending={decide.isPending}
              onDecide={(decision, strength) =>
                decide.mutate({ id: p.id, decision, strength })
              }
            />
          ))}
        </div>
      </section>

      {board.data.double_bookings.length > 0 && (
        <section className="rounded-xl bg-danger-bg p-4 ring-1 ring-danger/30">
          <h3 className="flex items-center gap-2 text-body font-semibold text-danger">
            <AlertTriangle size={15} />
            {board.data.double_bookings.length} crew double-booked
          </h3>
          <p className="mt-1 text-label leading-5 text-muted">
            Committed to two activities over overlapping days. A team cannot be
            in two places in one shift.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {board.data.double_bookings.map((d) => (
              <li key={d.assignment_ids.join('-')} className="rounded-lg bg-raised p-3 text-label">
                <span className="font-medium text-heading">{d.crew_id}</span>
                {' — '}
                {d.activity_ids.join(' and ')} overlap {d.overlap_days} day
                {d.overlap_days === 1 ? '' : 's'} ({d.overlap_from} → {d.overlap_to})
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The honesty note. A board that quietly reported zero demand for
          everything it could not size would look complete and be wrong. */}
      {board.data.demand_not_derivable.length > 0 && (
        <DisclosureNotice
          summary={`Demand excludes ${board.data.demand_not_derivable.length} activities with no productivity norm`}
        >
          <p>
            Demand in man-days is planned quantity divided by a
            quantity-per-man-day norm, and that norm can only come from work
            that has actually finished with a muster against it.
            {norms === 0
              ? ' No activity type has enough completed, mustered work yet, so no demand figure is derivable at all.'
              : ` ${norms} activity type${norms === 1 ? ' has' : 's have'} a norm so far.`}
          </p>
          <p className="mt-2">
            The activities below contribute <strong className="text-heading">zero</strong>{' '}
            to demand and are named rather than absorbed, because a demand
            figure estimated from a neighbouring discipline would look identical
            to a derived one.
          </p>
          <ul className="mt-2 max-h-48 overflow-y-auto text-label">
            {board.data.demand_not_derivable.slice(0, 40).map((a) => (
              <li key={a.activity_id} className="py-0.5">
                {a.activity_id} — {a.description}
              </li>
            ))}
          </ul>
        </DisclosureNotice>
      )}

      {board.data.weeks_detail.map((week) => (
        <WeekTable key={week.week_start} week={week} />
      ))}
    </div>
  );
}

function ProposalRow({
  proposal,
  pending,
  onDecide,
}: {
  proposal: ResourceAssignment;
  pending: boolean;
  onDecide: (decision: 'commit' | 'withdraw', strength?: number) => void;
}) {
  // The PM can commit fewer than were asked for, because that is what actually
  // happens: a supervisor asks for six and there are four to spare.
  const [strength, setStrength] = useState(proposal.allocated_strength);

  return (
    <div className="rounded-xl bg-raised p-4 ring-1 ring-hair/80">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-semibold text-heading">
            {proposal.crew_name} → {proposal.activity_id}
          </p>
          <p className="mt-0.5 text-label text-muted">
            {proposal.activity_description}
          </p>
          <p className="mt-1 text-label text-muted">
            {proposal.from_date} → {proposal.to_date} · asked for{' '}
            {proposal.allocated_strength} · requested by {proposal.requested_by}
          </p>
          {proposal.note && (
            <p className="mt-1 text-label italic text-fg">“{proposal.note}”</p>
          )}
          {/* Deterministic feature tokens, never model prose (D-003). */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {proposal.rationale.map((token) => (
              <span
                key={token}
                className="rounded-full bg-secondary px-2 py-0.5 font-mono text-label text-muted"
              >
                {token}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-1.5 text-label text-muted">
            Commit
            <input
              type="number"
              min={0}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
              className="w-16 rounded-lg bg-surface px-2 py-1.5 text-right tabular-nums text-body text-fg ring-1 ring-hair"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => onDecide('commit', strength)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-label font-semibold text-accent-fg disabled:opacity-60 cursor-pointer"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Commit
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onDecide('withdraw')}
            className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-label font-semibold text-muted hover:text-heading disabled:opacity-60 cursor-pointer"
          >
            <X size={14} />
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

function WeekTable({
  week,
}: {
  week: { week_start: string; week_end: string; rows: AllocationBoardRow[] };
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-lead font-semibold text-heading">
        {week.week_start} → {week.week_end}
      </h3>
      <DataTableShell>
        <table className="w-full min-w-[720px] text-body">
          <thead className="bg-secondary text-label uppercase tracking-[0.06em] text-muted">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Discipline</th>
              <th className="px-4 py-2.5 text-right font-semibold">Demand</th>
              <th className="px-4 py-2.5 text-right font-semibold">Supply</th>
              <th className="px-4 py-2.5 text-right font-semibold">Committed</th>
              <th className="px-4 py-2.5 text-right font-semibold">Headroom</th>
              <th className="px-4 py-2.5 text-right font-semibold">Gap</th>
              <th className="px-4 py-2.5 text-left font-semibold">Supply basis</th>
            </tr>
          </thead>
          <tbody>
            {week.rows.map((r) => (
              <tr key={r.discipline} className="border-t border-hair">
                <td className="px-4 py-2.5 font-medium text-heading">
                  {r.discipline.replace('_', ' ')}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {r.demand_man_days || <span className="text-muted">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.supply_man_days}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {r.committed_man_days}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {r.headroom_man_days}
                </td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums ${
                    r.gap_man_days > 0 ? 'font-semibold text-warn' : ''
                  }`}
                >
                  {r.gap_man_days}
                </td>
                <td className="px-4 py-2.5">
                  {/* Nominal means at least one crew in the discipline has too
                      few musters to measure. The weaker claim wins. */}
                  {r.supply_basis === 'nominal' ? (
                    <StatusBadge tone="neutral">Nominal</StatusBadge>
                  ) : (
                    <StatusBadge tone="ok">Reliability-adjusted</StatusBadge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableShell>
    </section>
  );
}
