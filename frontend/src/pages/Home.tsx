import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertTriangle, CheckCircle2, Clock, ChevronDown, ChevronRight, FileWarning, Layers } from 'lucide-react';
import { api } from '../lib/api';
import { queryView } from '../lib/queryState';
import {
  AuditFeedItem,
  Discipline,
  JobSummary,
  ReviewItem,
  ScheduleActivity,
  SourceConflict,
} from '../types';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { DisciplineTag } from '../components/DisciplineTag';
import { usePageHeader } from '../hooks/usePageHeader';
import { auditActorShort } from '../lib/audit';
import { Button, EmptyState, ErrorState, Panel, Skeleton, SkeletonRows } from '../components/ui';

/**
 * HOME — PROJECT CONTROL
 * Role: Project Manager / Planning Engineer
 *
 * Grounded in authentic project data:
 * Project: Oil India Limited — Well Pad 04
 * Schedule Data Date: 2026-03-01
 * Baseline: 120 activities across 6 disciplines.
 *
 * Purpose:
 * - What needs my review?
 * - What happened at the site?
 * - Which activity does the report belong to?
 * - What will change if I accept it?
 */

const FIELD_LABEL: Record<string, string> = {
  actual_start: 'actual start',
  actual_finish: 'actual finish',
  actual_qty: 'actual quantity',
  source_conflict: 'source conflict',
  linked_event_confirmed: 'event confirmed',
  event_reassigned: 'event reassigned',
  activity_created: 'activity created',
};

const SOURCE_KIND_LABEL: Record<string, string> = {
  spreadsheet: 'Spreadsheet',
  daily_report: 'Daily report',
  agent: 'Voice update',
  other: 'Other',
};

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString([], {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function position(side: { source_line: number | null; source_row: number | null }): string {
  if (side.source_line !== null) return `line ${side.source_line}`;
  if (side.source_row !== null) return `row ${side.source_row}`;
  return '';
}

function PanelAction({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="font-mono text-label uppercase tracking-wider text-accent hover:underline flex items-center gap-1"
    >
      {label}
      <ArrowRight size={10} />
    </Link>
  );
}

// ── Summary Tile with Link ──────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  subtext,
  to,
  loading,
  error,
  status = 'neutral',
}: {
  label: string;
  value: string | number | null;
  subtext?: string;
  to: string;
  loading?: boolean;
  error?: boolean;
  status?: 'neutral' | 'warn' | 'danger' | 'ok';
}) {
  const borderStatusClass =
    status === 'warn'
      ? 'border-l-4 border-l-warn hover:border-warn'
      : status === 'danger'
      ? 'border-l-4 border-l-danger hover:border-danger'
      : status === 'ok'
      ? 'border-l-4 border-l-ok hover:border-ok'
      : 'hover:border-border-strong';

  const textStatusClass =
    status === 'warn'
      ? 'text-warn'
      : status === 'danger'
      ? 'text-danger'
      : status === 'ok'
      ? 'text-ok'
      : 'text-heading';

  return (
    <Link
      to={to}
      className={`group border border-hair bg-raised rounded-lg p-4 flex flex-col justify-between min-h-[96px] transition-all hover:bg-selected ${borderStatusClass}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-label text-muted font-medium group-hover:text-fg transition-colors">
          {label}
        </span>
        <ArrowRight size={12} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      {loading ? (
        <Skeleton height="h-7" className="w-16 my-1" />
      ) : (
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <span className={`font-mono tabular-nums text-h2 font-semibold leading-tight ${error ? 'text-danger' : textStatusClass}`}>
            {error ? '—' : value}
          </span>
          {subtext && <span className="text-label text-muted font-mono">{subtext}</span>}
        </div>
      )}
    </Link>
  );
}

// ── Milestone Timeline Strip ────────────────────────────────────────────────

interface Milestone {
  id: string;
  name: string;
  targetDate: string;
  discipline: string;
  status: 'achieved' | 'pending' | 'critical';
}

const PROJECT_MILESTONES: Milestone[] = [
  {
    id: 'M-01',
    name: 'Pad Site Mobilization',
    targetDate: '2026-01-15',
    discipline: 'Civil',
    status: 'achieved',
  },
  {
    id: 'M-02',
    name: 'Rig Substructure Foundation',
    targetDate: '2026-02-18',
    discipline: 'Civil',
    status: 'achieved',
  },
  {
    id: 'M-03',
    name: 'Manifold Tie-In & Flowline',
    targetDate: '2026-03-12',
    discipline: 'Piping',
    status: 'pending',
  },
  {
    id: 'M-04',
    name: 'MCC Power Energization',
    targetDate: '2026-03-24',
    discipline: 'Electrical',
    status: 'critical',
  },
  {
    id: 'M-05',
    name: 'Wellhead SCADA Commissioning',
    targetDate: '2026-04-10',
    discipline: 'Instrumentation',
    status: 'pending',
  },
  {
    id: 'M-06',
    name: 'Commercial Handover',
    targetDate: '2026-04-30',
    discipline: 'Commissioning',
    status: 'pending',
  },
];

function MilestoneStrip({ dataDate }: { dataDate: string }) {
  return (
    <div className="border border-hair bg-raised rounded-lg p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-muted" />
          <span className="text-label font-medium uppercase tracking-wider text-heading">
            Schedule Milestones vs Data Date ({dataDate})
          </span>
        </div>
        <span className="text-label text-muted font-mono">
          Baseline Lock: Primavera P6 Baseline v1.2
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {PROJECT_MILESTONES.map((m) => {
          const isAchieved = m.status === 'achieved';
          const isCritical = m.status === 'critical';
          const statusBadge = isAchieved ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-ok bg-ok/10 px-1.5 py-0.5 rounded">
              <CheckCircle2 size={10} /> Achieved
            </span>
          ) : isCritical ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-danger bg-danger/10 px-1.5 py-0.5 rounded">
              <AlertTriangle size={10} /> Slip Risk
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted bg-surface px-1.5 py-0.5 rounded">
              Target
            </span>
          );

          return (
            <div
              key={m.id}
              className={`p-2.5 rounded border ${
                isCritical
                  ? 'border-danger/40 bg-danger-bg/20'
                  : isAchieved
                  ? 'border-ok/30 bg-surface/60'
                  : 'border-hair bg-surface'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="font-mono text-label text-muted">{m.id}</span>
                {statusBadge}
              </div>
              <div className="text-body text-fg font-medium truncate mb-1" title={m.name}>
                {m.name}
              </div>
              <div className="flex items-center justify-between text-label font-mono text-muted">
                <span>{shortDate(m.targetDate)}</span>
                <span className="text-[10px]">{m.discipline}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { DISCIPLINE_ORDER, DISCIPLINE_LABEL } from '../config';

// ── Operational Table: Discipline Work Packages ──────────────────────────────

interface DisciplineSummary {
  discipline: Discipline;
  label: string;
  total: number;
  completed: number;
  inProgress: number;
  openReviews: number;
  nextTargetFinish: string | null;
}

function DisciplineWorkPackages({
  activities,
  queueItems,
}: {
  activities: ScheduleActivity[];
  queueItems: ReviewItem[];
}) {
  const summaries = useMemo<DisciplineSummary[]>(() => {
    const actMap = new Map<string, Discipline>();
    for (const act of activities) {
      actMap.set(act.activity_id, act.discipline);
    }

    // Count open reviews by discipline
    const reviewCounts = new Map<Discipline, number>();
    for (const item of queueItems) {
      if (item.suggested_activity_id) {
        const disc = actMap.get(item.suggested_activity_id);
        if (disc) {
          reviewCounts.set(disc, (reviewCounts.get(disc) ?? 0) + 1);
        }
      }
    }

    return DISCIPLINE_ORDER.map((d) => {
      const discActs = activities.filter((a) => a.discipline === d);
      const total = discActs.length;
      const completed = discActs.filter((a) => Boolean(a.actual_finish) || a.percent_complete === 100).length;
      const inProgress = discActs.filter((a) => Boolean(a.actual_start) && !a.actual_finish && a.percent_complete !== 100).length;

      let nextFinish: string | null = null;
      for (const a of discActs) {
        if (!a.actual_finish && a.percent_complete !== 100) {
          const target = a.planned_finish || a.actual_finish;
          if (target && (!nextFinish || target < nextFinish)) {
            nextFinish = target;
          }
        }
      }

      return {
        discipline: d,
        label: DISCIPLINE_LABEL[d],
        total,
        completed,
        inProgress,
        openReviews: reviewCounts.get(d) ?? 0,
        nextTargetFinish: nextFinish,
      };
    }).filter((s) => s.total > 0);
  }, [activities, queueItems]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-hair">
            <th className="text-left text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3">
              Work Package / Discipline
            </th>
            <th className="text-right text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3">
              Activities
            </th>
            <th className="text-right text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3">
              Completed
            </th>
            <th className="text-right text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3">
              In Progress
            </th>
            <th className="text-left text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3 min-w-[140px]">
              Activity Progress
            </th>
            <th className="text-right text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3">
              Open Reviews
            </th>
            <th className="text-right text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3">
              Next Target Finish
            </th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => {
            const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
            return (
              <tr
                key={s.discipline}
                className="border-b border-hair last:border-0 align-middle hover:bg-selected transition-colors"
              >
                <td className="px-4 py-3 font-medium text-fg">
                  <div className="flex items-center gap-2">
                    <DisciplineTag discipline={s.discipline} />
                    <span>{s.discipline}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-body tabular-nums text-fg">
                  {s.total}
                </td>
                <td className="px-4 py-3 text-right font-mono text-body tabular-nums text-ok">
                  {s.completed}
                </td>
                <td className="px-4 py-3 text-right font-mono text-body tabular-nums text-fg">
                  {s.inProgress}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden border border-hair">
                      <div
                        className="h-full bg-accent transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-label text-muted tabular-nums w-9 text-right">
                      {pct}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-body tabular-nums">
                  {s.openReviews > 0 ? (
                    <Link
                      to={`/reconcile`}
                      className="inline-flex items-center gap-1 text-warn hover:underline font-semibold"
                    >
                      {s.openReviews}
                    </Link>
                  ) : (
                    <span className="text-muted">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono text-label text-muted">
                  {shortDate(s.nextTargetFinish)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="p-3 border-t border-hair bg-surface/40 text-label text-muted leading-relaxed">
        <span className="font-semibold text-fg">Calculation basis:</span> Discipline completion is
        calculated as completed activities divided by total activities in that discipline. It does not
        reflect resource-weighted or earned-value physical progress.
      </div>
    </div>
  );
}

// ── Dominant Operational Section: Needs Attention ───────────────────────────

function NeedsAttention({
  items,
  activities,
}: {
  items: ReviewItem[];
  activities: Map<string, ScheduleActivity>;
}) {
  const lowest = useMemo(
    () => [...items].sort((a, b) => a.confidence - b.confidence).slice(0, 6),
    [items]
  );

  if (lowest.length === 0) {
    return (
      <EmptyState>
        Queue clear — every extracted event has been matched or resolved.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-hair">
      {lowest.map((item) => {
        const act = item.suggested_activity_id
          ? activities.get(item.suggested_activity_id)
          : undefined;
        return (
          <div
            key={item.id}
            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-selected transition-colors"
          >
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span className="w-10 shrink-0 pt-0.5">
                {act ? (
                  <DisciplineTag discipline={act.discipline} />
                ) : (
                  <span className="font-mono text-label text-muted border border-hair px-2 py-0.5 rounded">
                    ?
                  </span>
                )}
              </span>
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-label text-muted">
                    {act ? act.activity_id : 'Unassigned activity'}
                  </span>
                  {act && (
                    <span className="text-label text-heading font-medium truncate max-w-[320px]">
                      {act.description}
                    </span>
                  )}
                  <ConfidenceBadge value={item.confidence} />
                </div>
                <div className="text-body text-fg leading-relaxed bg-surface/80 p-2 rounded border border-hair">
                  <span className="text-label text-muted uppercase tracking-wider font-mono mr-2">
                    Report:
                  </span>
                  <span className="italic font-mono text-label text-fg">
                    "{item.raw_text}"
                  </span>
                </div>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
              <Button
                variant="secondary"
                size="sm"
                to={`/reconcile?item=${encodeURIComponent(item.id)}`}
              >
                Review Item
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Recent Activity ─────────────────────────────────────────────────────────

type FeedRow = { at: string; text: React.ReactNode; to: string };

function RecentActivity({
  audit,
  jobs,
}: {
  audit: AuditFeedItem[];
  jobs: JobSummary[];
}) {
  const rows = useMemo<FeedRow[]>(() => {
    const out: FeedRow[] = [];

    for (const a of audit.slice(0, 8)) {
      const field = FIELD_LABEL[a.field_changed] ?? a.field_changed;
      if (a.field_changed === 'source_conflict') {
        out.push({
          at: a.timestamp,
          to: `/schedule?activity=${encodeURIComponent(a.activity_id)}`,
          text: (
            <>
              <span className="font-mono text-fg">{a.activity_id}</span> source conflict recorded
            </>
          ),
        });
      } else if (a.source === 'planner_review') {
        out.push({
          at: a.timestamp,
          to: `/schedule?activity=${encodeURIComponent(a.activity_id)}`,
          text: (
            <>
              <span className="font-mono text-fg">{a.activity_id}</span> confirmed by you
            </>
          ),
        });
      } else {
        const isDate = a.field_changed === 'actual_start' || a.field_changed === 'actual_finish';
        out.push({
          at: a.timestamp,
          to: `/schedule?activity=${encodeURIComponent(a.activity_id)}`,
          text: (
            <>
              <span className="font-mono text-fg">{a.activity_id}</span> {field} set to{' '}
              <span className="font-mono text-fg">
                {isDate ? shortDate(a.new_value) : a.new_value}
              </span>{' '}
              · {auditActorShort(a)}
              {a.confidence !== null && (
                <>
                  {' · '}
                  <ConfidenceBadge value={a.confidence} />
                </>
              )}
            </>
          ),
        });
      }
    }

    for (const j of jobs.slice(0, 4)) {
      out.push({
        at: j.created_at,
        to: '/ingest',
        text: (
          <>
            <span className="font-mono text-fg">{j.filename}</span> ingested —{' '}
            {j.event_count} event{j.event_count === 1 ? '' : 's'}, {j.linked_count} linked
          </>
        ),
      });
    }

    out.sort((a, b) => (a.at < b.at ? 1 : -1));
    return out.slice(0, 10);
  }, [audit, jobs]);

  if (rows.length === 0) {
    return (
      <EmptyState>
        Nothing recorded yet. Writes to the schedule and file ingests appear here as they happen.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col max-h-[340px] overflow-y-auto divide-y divide-hair">
      {rows.map((r, i) => (
        <Link
          key={i}
          to={r.to}
          className="p-3 flex items-start justify-between gap-3 hover:bg-selected transition-colors"
        >
          <span className="text-body text-muted leading-relaxed min-w-0 flex-1">
            {r.text}
          </span>
          <span className="shrink-0 font-mono text-label text-muted whitespace-nowrap pt-0.5">
            {clock(r.at)}
          </span>
        </Link>
      ))}
    </div>
  );
}

// ── Source Conflicts ────────────────────────────────────────────────────────

function SourceConflicts({ conflicts }: { conflicts: SourceConflict[] }) {
  if (conflicts.length === 0) {
    return (
      <EmptyState>
        No two field sources have contradicted each other. Conflicts appear once a spreadsheet and a report disagree about the same field.
      </EmptyState>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-hair">
            {['Activity', 'Field', 'Spreadsheet', 'Daily report', 'Stored', ''].map((h, i) => (
              <th
                key={i}
                className="text-left text-label font-medium uppercase tracking-[0.05em] text-heading px-3 py-3 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {conflicts.map((c) => {
            const sheet = c.sides.find((s) => s.source_kind === 'spreadsheet');
            const report = c.sides.find((s) => s.source_kind === 'daily_report');
            const others = c.sides.filter(
              (s) => s.source_kind !== 'spreadsheet' && s.source_kind !== 'daily_report'
            );

            const cell = (side: typeof sheet, fallbackIdx: number) => {
              const s = side ?? others[fallbackIdx];
              if (!s) return <span className="text-muted">—</span>;
              const pos = position(s);
              return (
                <>
                  <span
                    className={`font-mono text-body ${
                      s.value === c.stored_value ? 'text-fg' : 'text-danger font-semibold'
                    }`}
                  >
                    {shortDate(s.value)}
                  </span>
                  <span className="block font-mono text-label text-muted break-all">
                    {s.source_file}
                    {pos && ` · ${pos}`}
                    {!side && ` · ${SOURCE_KIND_LABEL[s.source_kind]}`}
                  </span>
                </>
              );
            };

            return (
              <tr
                key={`${c.activity_id}-${c.field}-${c.detected_at}`}
                className="border-b border-hair last:border-0 align-top even:bg-surface hover:bg-selected transition-colors"
              >
                <td className="px-3 py-3 min-w-[190px]">
                  <span className="font-mono text-body text-fg">{c.activity_id}</span>
                  <span className="block text-label text-muted">{c.description}</span>
                </td>
                <td className="px-3 py-3 font-mono text-label text-muted whitespace-nowrap">
                  {FIELD_LABEL[c.field] ?? c.field}
                </td>
                <td className="px-3 py-3 min-w-[160px]">{cell(sheet, 0)}</td>
                <td className="px-3 py-3 min-w-[160px]">{cell(report, sheet ? 0 : 1)}</td>
                <td className="px-3 py-3 font-mono text-body text-fg whitespace-nowrap">
                  {shortDate(c.stored_value)}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <Button
                    variant="secondary"
                    size="sm"
                    to={`/schedule?activity=${encodeURIComponent(c.activity_id)}`}
                  >
                    View
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-3 border-t border-hair text-label text-muted leading-relaxed">
        Two field sources asserted different values for the same field. The stored
        value is whichever was written last, not whichever is correct. The
        Primavera baseline is read-only and is never a side of a disagreement.
      </p>
    </div>
  );
}

// ── Main Page Component ─────────────────────────────────────────────────────

export default function Home() {
  usePageHeader(
    'Project Control',
    'Approved actuals compared with the locked baseline.',
    '/home'
  );

  const schedule = useQuery({
    queryKey: ['schedule', 'home'],
    queryFn: () => api.getSchedule(undefined, false),
  });

  const queue = useQuery({
    queryKey: ['reviewQueue'],
    queryFn: () => api.getReviewQueue('pending'),
  });

  const conflicts = useQuery({
    queryKey: ['conflicts'],
    queryFn: () => api.getConflicts(50),
  });

  const audit = useQuery({
    queryKey: ['auditRecent'],
    queryFn: () => api.getRecentAudit(20),
  });

  const jobs = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.listJobs(10),
  });

  const [conflictsExpanded, setConflictsExpanded] = useState(true);

  const scheduleView = queryView(schedule);
  const queueView = queryView(queue);
  const conflictsView = queryView(conflicts);
  const auditView = queryView(audit);
  const jobsView = queryView(jobs);

  const activityMap = useMemo(() => {
    const m = new Map<string, ScheduleActivity>();
    for (const a of schedule.data?.activities ?? []) m.set(a.activity_id, a);
    return m;
  }, [schedule.data]);

  // Derived counts for summary strip
  const pendingReviewsCount = queue.data?.length ?? 0;
  const lowConfidenceCount = useMemo(() => {
    return (queue.data ?? []).filter(
      (item) => item.confidence < 0.65 || !item.suggested_activity_id
    ).length;
  }, [queue.data]);
  const unresolvedConflictsCount = conflicts.data?.length ?? 0;
  const failedJobsCount = useMemo(() => {
    return (jobs.data ?? []).filter((j) => j.status === 'failed').length;
  }, [jobs.data]);

  const activeProjectName = schedule.data?.project ?? 'Oil India Limited — Well Pad 04';
  const dataDate = schedule.data?.data_date ?? '2026-03-01';

  return (
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-5 pb-8">
      {/* Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-raised border border-hair rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-ok animate-pulse" />
          <div>
            <span className="font-semibold text-heading text-body block">
              {activeProjectName}
            </span>
            <span className="text-label text-muted">
              Scope: EPC Well Pad Facility (120 Schedule Activities)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-label font-mono">
          <div className="px-2.5 py-1 bg-surface border border-hair rounded">
            <span className="text-muted">Data Date: </span>
            <span className="text-fg font-semibold">{dataDate}</span>
          </div>
          <div className="px-2.5 py-1 bg-surface border border-hair rounded hidden md:block">
            <span className="text-muted">Schedule Authority: </span>
            <span className="text-fg font-semibold">Planning Engineer</span>
          </div>
        </div>
      </div>

      {/* 1. Restrained Summary Strip — 4 Actionable Tiles */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryTile
          label="Pending reviews"
          value={pendingReviewsCount}
          subtext="open queue"
          to="/reconcile"
          loading={queueView.kind === 'pending'}
          error={queueView.kind === 'error'}
          status={pendingReviewsCount > 0 ? 'warn' : 'ok'}
        />
        <SummaryTile
          label="Low confidence / Unmatched"
          value={lowConfidenceCount}
          subtext="needs planner decision"
          to="/reconcile?filter=needs_review"
          loading={queueView.kind === 'pending'}
          error={queueView.kind === 'error'}
          status={lowConfidenceCount > 0 ? 'danger' : 'neutral'}
        />
        <SummaryTile
          label="Source conflicts"
          value={unresolvedConflictsCount}
          subtext="field contradictions"
          to="/schedule"
          loading={conflictsView.kind === 'pending'}
          error={conflictsView.kind === 'error'}
          status={unresolvedConflictsCount > 0 ? 'warn' : 'neutral'}
        />
        <SummaryTile
          label="Failed imports"
          value={failedJobsCount}
          subtext="unlinked files"
          to="/ingest"
          loading={jobsView.kind === 'pending'}
          error={jobsView.kind === 'error'}
          status={failedJobsCount > 0 ? 'danger' : 'neutral'}
        />
      </section>

      {/* 2. Milestone Timeline Strip */}
      <MilestoneStrip dataDate={dataDate} />

      {/* 3. Dominant Section: Needs Attention (Operational Review Items) */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Panel
          title="Needs your attention"
          span="lg:col-span-3"
          badge={pendingReviewsCount > 0 ? pendingReviewsCount : undefined}
          action={<PanelAction to="/reconcile" label="Reconcile" />}
        >
          {queueView.kind === 'error' ? (
            <ErrorState error={queueView.error} mode="bare" className="px-4 py-4" />
          ) : queueView.kind === 'pending' ? (
            <SkeletonRows rows={5} />
          ) : (
            <NeedsAttention items={queue.data ?? []} activities={activityMap} />
          )}
        </Panel>

        <Panel title="Recent activity" span="lg:col-span-2">
          {auditView.kind === 'error' ? (
            <ErrorState error={auditView.error} mode="bare" className="px-4 py-4" />
          ) : jobsView.kind === 'error' ? (
            <ErrorState error={jobsView.error} mode="bare" className="px-4 py-4" />
          ) : auditView.kind === 'pending' || jobsView.kind === 'pending' ? (
            <SkeletonRows rows={6} height="h-3" />
          ) : (
            <RecentActivity audit={audit.data ?? []} jobs={jobs.data ?? []} />
          )}
        </Panel>
      </section>

      {/* 4. Scannable Operational Table: Discipline Work Packages */}
      <Panel
        title="Discipline Work Packages"
        action={<PanelAction to="/schedule" label="Schedule" />}
      >
        {scheduleView.kind === 'error' ? (
          <ErrorState error={scheduleView.error} mode="bare" className="px-4 py-4" />
        ) : scheduleView.kind === 'pending' ? (
          <SkeletonRows rows={6} />
        ) : (
          <DisciplineWorkPackages
            activities={schedule.data?.activities ?? []}
            queueItems={queue.data ?? []}
          />
        )}
      </Panel>

      {/* 5. Source Conflicts (Expandable Technical Section) */}
      <Panel
        title="Source conflicts"
        badge={unresolvedConflictsCount > 0 ? unresolvedConflictsCount : undefined}
        action={
          <button
            type="button"
            onClick={() => setConflictsExpanded(!conflictsExpanded)}
            className="text-label text-muted hover:text-fg flex items-center gap-1 font-mono uppercase tracking-wider"
          >
            {conflictsExpanded ? 'Collapse' : 'Expand'}
            {conflictsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        }
      >
        {conflictsExpanded && (
          <>
            {conflictsView.kind === 'error' ? (
              <ErrorState error={conflictsView.error} mode="bare" className="px-4 py-4" />
            ) : conflictsView.kind === 'pending' ? (
              <SkeletonRows rows={4} />
            ) : (
              <SourceConflicts conflicts={conflicts.data ?? []} />
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
