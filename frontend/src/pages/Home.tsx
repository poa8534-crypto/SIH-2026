import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { queryView } from '../lib/queryState';
import {
  AuditFeedItem,
  JobSummary,
  ReviewItem,
  ScheduleActivity,
  SourceConflict,
} from '../types';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { DisciplineTag } from '../components/DisciplineTag';
import { usePageHeader } from '../hooks/usePageHeader';
import { Button, EmptyState, ErrorState, Panel, Skeleton, SkeletonRows } from '../components/ui';

/**
 * QUESTION:  What needs me right now?
 * ACTION:    Open the thing that needs me.
 *
 * Everything on this screen is either a count of outstanding work or a row
 * that opens the work. The per-discipline variance chart that used to sit
 * between them was the same computation as Memory's "Slip by discipline" and
 * answered a different question — how is the project trending — so it now
 * lives only on Memory. See D-031.
 *
 * Each panel owns its own query, so one endpoint failing degrades that panel
 * to an error line and leaves the rest of the page working. Nothing here is a
 * placeholder: every figure comes from a live call.
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

/** Where in a source a value came from, or '' when there is no single line. */
function position(side: { source_line: number | null; source_row: number | null }): string {
  if (side.source_line !== null) return `line ${side.source_line}`;
  if (side.source_row !== null) return `row ${side.source_row}`;
  return '';
}

// ── Shared panel chrome ─────────────────────────────────────────────────────

/**
 * This screen's panels are the shared `Panel`; the local copy that used to
 * live here (header `px-4 py-2.5`) was one of six card-header paddings. The
 * local `PanelError`, `PanelEmpty` and `Skeleton` are gone the same way —
 * `PanelEmpty` had never been called by anything.
 */
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

// ── Row 1: metric tiles ─────────────────────────────────────────────────────

function Tile({
  label,
  value,
  loading,
  error,
  accent,
}: {
  label: string;
  value: string | number | null;
  loading?: boolean;
  error?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`border border-hair bg-raised rounded-lg p-4 flex flex-col justify-between h-24 ${
        accent ? 'border-l-2 border-l-danger' : ''
      }`}
    >
      {loading ? (
        <Skeleton height="h-8" className="w-20 mt-1" />
      ) : (
        <div
          className={`font-mono tabular-nums text-h1 leading-none mt-1 ${
            error ? 'text-danger' : accent ? 'text-danger' : 'text-fg'
          }`}
        >
          {error ? '—' : value}
        </div>
      )}
      <div className="font-mono text-label uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

// ── Row 2 left: needs your attention ────────────────────────────────────────

function NeedsAttention({
  items,
  activities,
}: {
  items: ReviewItem[];
  activities: Map<string, ScheduleActivity>;
}) {
  // The five the matcher was least sure about — where a planner's judgement is
  // worth the most.
  const lowest = useMemo(
    () => [...items].sort((a, b) => a.confidence - b.confidence).slice(0, 5),
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
    <div className="flex flex-col">
      {lowest.map((item) => {
        const act = item.suggested_activity_id
          ? activities.get(item.suggested_activity_id)
          : undefined;
        return (
          /* These rows highlighted on hover and did nothing. They open the
             item they are about — Reconcile reads `?item=` and selects it. */
          <Link
            key={item.id}
            to={`/reconcile?item=${encodeURIComponent(item.id)}`}
            className="px-4 py-3 border-b border-hair last:border-0 flex items-start gap-3 min-w-0 hover:bg-selected transition-colors"
          >
            <span className="w-10 shrink-0 pt-1">
              {act ? (
                <DisciplineTag discipline={act.discipline} />
              ) : (
                <span className="font-mono text-label text-muted border border-hair px-2 rounded-full">
                  ?
                </span>
              )}
            </span>
            {/* Two lines, not one truncated line with the rest on hover. This
                is the report the matcher was least sure about; it is the whole
                reason the row is here, and a projector has no hover. */}
            <span className="flex-1 text-body text-fg leading-relaxed line-clamp-2">
              {item.raw_text}
            </span>
            <span className="shrink-0 pt-1">
              <ConfidenceBadge value={item.confidence} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ── Row 2 right: recent activity ────────────────────────────────────────────

/** `to` is where the row opens. Every row has one. */
type FeedRow = { at: string; text: React.ReactNode; to: string };

/**
 * Audit writes and ingests interleaved, newest first. Both halves are real:
 * writes from GET /audit/recent, ingests from GET /jobs.
 */
function RecentActivity({
  audit,
  jobs,
}: {
  audit: AuditFeedItem[];
  jobs: JobSummary[];
}) {
  const rows = useMemo<FeedRow[]>(() => {
    const out: FeedRow[] = [];

    // Budget each source separately before merging. A single ingest writes
    // dozens of audit rows in the same second, which otherwise fills the whole
    // feed and the ingest lines never appear at all.
    for (const a of audit.slice(0, 8)) {
      const field = FIELD_LABEL[a.field_changed] ?? a.field_changed;
      if (a.field_changed === 'source_conflict') {
        out.push({
          at: a.timestamp,
          to: `/schedule?activity=${encodeURIComponent(a.activity_id)}`,
          text: (
            <>
              <span className="font-mono text-fg">{a.activity_id}</span> source conflict
              recorded
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
              · {a.auto_applied ? 'auto' : 'planner'}
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
    return out.slice(0, 12);
  }, [audit, jobs]);

  if (rows.length === 0) {
    return (
      <EmptyState>
        Nothing recorded yet. Writes to the schedule and file ingests appear
        here as they happen.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col max-h-[260px] overflow-y-auto">
      {/* These rows highlighted on hover and did nothing. An audit line opens
          that activity's row and audit drawer; an ingest line opens Ingest. */}
      {rows.map((r, i) => (
        <Link
          key={i}
          to={r.to}
          className="px-4 py-3 border-b border-hair last:border-0 flex items-start gap-3 hover:bg-selected transition-colors"
        >
          <span className="flex-1 text-body text-muted leading-relaxed min-w-0">
            {r.text}
          </span>
          <span className="shrink-0 font-mono text-label text-muted text-right whitespace-nowrap pt-1">
            {clock(r.at)}
          </span>
        </Link>
      ))}
    </div>
  );
}

// ── Source conflicts ─────────────────────────────────────────────────

function SourceConflicts({ conflicts }: { conflicts: SourceConflict[] }) {
  if (conflicts.length === 0) {
    return (
      <EmptyState>
        No two field sources have contradicted each other. Conflicts appear
        once a spreadsheet and a report disagree about the same field.
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
            // Columns are by source TYPE, not by which side arrived first.
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
                      s.value === c.stored_value ? 'text-fg' : 'text-danger'
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
                  {/* Opens that activity's audit drawer on the Schedule screen. */}
                  {/* Was "Resolve". It opens the Schedule audit drawer, which
                      is deliberately read-only (D-004 — the trail is never
                      edited), so the label promised an action the destination
                      cannot perform. There is no endpoint that resolves a
                      source conflict, so the honest fix is the label. */}
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

// ── Page ────────────────────────────────────────────────────────────────────

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

  // Never key a render on `isLoading`: it is false between retry attempts, and
  // `error` is null until retries are exhausted, so the success branch renders
  // an empty list as "nothing to report" while the API is simply unreachable.
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

  return (
    /* No `h-full overflow-y-auto` here: the shell's <main> already scrolls, and
       nesting a second scroll container gave the page two scrollbars. */
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-4">
        {/* ROW 1 */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Tile
            label="Activities in baseline"
            value={schedule.data?.total_activities ?? null}
            loading={scheduleView.kind === 'pending'}
            error={scheduleView.kind === 'error'}
          />
          <Tile
            label="With actual dates"
            value={schedule.data?.activities_with_actuals ?? null}
            loading={scheduleView.kind === 'pending'}
            error={scheduleView.kind === 'error'}
          />
          <Tile
            label="Awaiting your review"
            value={queue.data?.length ?? null}
            loading={queueView.kind === 'pending'}
            error={queueView.kind === 'error'}
            accent
          />
          {/* Every tile is a figure off /schedule or /review-queue. There is
              no endpoint behind a matcher-precision number, so there is no
              tile claiming one. */}
          <Tile
            label="Completed"
            value={schedule.data?.activities_completed ?? null}
            loading={scheduleView.kind === 'pending'}
            error={scheduleView.kind === 'error'}
          />
        </section>

        {/* ROW 2 — surfaced with a count, not buried in a footer. */}
        <Panel
          title="Source conflicts"
          badge={conflicts.data?.length}
          action={<PanelAction to="/schedule" label="Schedule" />}
        >
          {conflictsView.kind === 'error' ? (
            <ErrorState error={conflictsView.error} mode="bare" className="px-4 py-4" />
          ) : conflictsView.kind === 'pending' ? (
            <SkeletonRows rows={4} />
          ) : (
            <SourceConflicts conflicts={conflicts.data ?? []} />
          )}
        </Panel>

        {/* ROW 3 */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Panel
            title="Needs your attention"
            span="lg:col-span-3"
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

    </div>
  );
}
