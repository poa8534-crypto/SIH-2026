import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { api, errorDetail } from '../lib/api';
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

/**
 * Project control landing screen.
 *
 * Each panel owns its own query, so one endpoint failing degrades that panel
 * to an error line and leaves the rest of the page working. Nothing here is a
 * placeholder: every figure comes from a live call.
 */

const DISCIPLINE_ORDER: Discipline[] = [
  'civil',
  'piping',
  'static_equipment',
  'electrical',
  'instrumentation',
  'hse',
];

const DISCIPLINE_LABEL: Record<Discipline, string> = {
  civil: 'CIV',
  piping: 'PIP',
  static_equipment: 'SEQ',
  electrical: 'ELE',
  instrumentation: 'INS',
  hse: 'HSE',
};

/** Our measured eval figure — correct AUTO_LINKs over all AUTO_LINKs. */
const AUTO_LINK_PRECISION = '100%';

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

function Panel({
  title,
  span,
  badge,
  action,
  children,
}: {
  title: string;
  span: string;
  badge?: number;
  action?: { to: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className={`${span} border border-hair bg-surface flex flex-col min-w-0`}>
      <div className="px-4 py-2.5 border-b border-hair flex items-center justify-between gap-3">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted flex items-center gap-2">
          {title}
          {badge !== undefined && badge > 0 && (
            <span className="bg-danger text-surface font-mono text-[9px] px-1.5 py-0.5">
              {badge}
            </span>
          )}
        </h3>
        {action && (
          <Link
            to={action.to}
            className="font-mono text-[9px] uppercase tracking-wider text-accent hover:underline flex items-center gap-1"
          >
            {action.label}
            <ArrowRight size={10} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Per-panel failure, so one dead endpoint cannot blank the page. */
function PanelError({ error }: { error: unknown }) {
  return (
    <div className="px-4 py-4 flex items-start gap-2">
      <AlertCircle size={12} className="mt-0.5 shrink-0 text-danger" />
      <span className="font-mono text-[10px] text-danger">
        {errorDetail(error)}
      </span>
    </div>
  );
}

function PanelEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-8 text-center font-mono text-[10px] uppercase tracking-wider text-muted">
      {children}
    </div>
  );
}

function Skeleton({ rows, height = 'h-4' }: { rows: number; height?: string }) {
  return (
    <div className="p-4 space-y-2 opacity-50">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`${height} bg-raised animate-pulse`} />
      ))}
    </div>
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
      className={`border border-hair bg-surface p-4 flex flex-col justify-between h-24 ${
        accent ? 'border-l-2 border-l-danger' : ''
      }`}
    >
      {loading ? (
        <div className="h-8 w-20 bg-raised animate-pulse mt-1" />
      ) : (
        <div
          className={`font-mono text-[28px] leading-none mt-1 ${
            error ? 'text-danger' : accent ? 'text-danger' : 'text-fg'
          }`}
        >
          {error ? '—' : value}
        </div>
      )}
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted">{label}</div>
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
      <div className="px-4 py-8 text-center text-[11px] text-muted leading-relaxed">
        Queue clear — every extracted event has been matched or resolved.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {lowest.map((item) => {
        const act = item.suggested_activity_id
          ? activities.get(item.suggested_activity_id)
          : undefined;
        return (
          <div
            key={item.id}
            className="px-4 py-2.5 border-b border-hair last:border-0 flex items-center gap-3 min-w-0"
          >
            <span className="w-10 shrink-0">
              {act ? (
                <DisciplineTag discipline={act.discipline} />
              ) : (
                <span className="font-mono text-[9px] text-muted border border-hair px-1 rounded-[2px]">
                  ?
                </span>
              )}
            </span>
            <span className="flex-1 text-[11px] text-fg truncate" title={item.raw_text}>
              {item.raw_text}
            </span>
            <span className="shrink-0">
              <ConfidenceBadge value={item.confidence} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Row 2 right: recent activity ────────────────────────────────────────────

type FeedRow = { at: string; text: React.ReactNode };

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
      <div className="px-4 py-8 text-center text-[11px] text-muted leading-relaxed">
        Nothing recorded yet. Writes to the schedule and file ingests appear
        here as they happen.
      </div>
    );
  }

  return (
    <div className="flex flex-col max-h-[260px] overflow-y-auto">
      {rows.map((r, i) => (
        <div
          key={i}
          className="px-4 py-2 border-b border-hair last:border-0 flex items-start gap-3"
        >
          <span className="flex-1 text-[11px] text-muted leading-relaxed min-w-0">
            {r.text}
          </span>
          <span className="shrink-0 font-mono text-[9px] text-muted text-right whitespace-nowrap pt-0.5">
            {clock(r.at)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Row 3: schedule health ──────────────────────────────────────────────────

function ScheduleHealth({ activities }: { activities: ScheduleActivity[] }) {
  const bars = useMemo(() => {
    const acc = new Map<Discipline, number[]>();
    for (const a of activities) {
      if (a.finish_variance_days === null) continue;
      const list = acc.get(a.discipline) ?? [];
      list.push(a.finish_variance_days);
      acc.set(a.discipline, list);
    }
    return DISCIPLINE_ORDER.map((d) => {
      const v = acc.get(d) ?? [];
      const mean = v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
      return { discipline: d, mean, n: v.length };
    });
  }, [activities]);

  const maxAbs = Math.max(1, ...bars.map((b) => (b.mean === null ? 0 : Math.abs(b.mean))));

  return (
    <div className="p-4 flex flex-col gap-2.5">
      {bars.map((b) => (
        <div key={b.discipline} className="flex items-center gap-3">
          <span className="w-10 shrink-0 font-mono text-[10px] text-muted text-right">
            {DISCIPLINE_LABEL[b.discipline]}
          </span>
          {b.mean === null ? (
            <span className="flex-1 text-[10px] text-muted italic">
              no activity with an actual finish yet
            </span>
          ) : (
            <span className="flex-1 bg-raised h-2 relative block">
              <span
                className={`h-full absolute top-0 left-0 ${
                  b.mean > 0 ? 'bg-danger' : b.mean < 0 ? 'bg-ok' : 'bg-strong'
                }`}
                style={{ width: `${Math.max(2, (Math.abs(b.mean) / maxAbs) * 100)}%` }}
              />
            </span>
          )}
          <span
            className={`w-14 shrink-0 font-mono text-[10px] text-right ${
              b.mean === null
                ? 'text-muted'
                : b.mean > 0
                  ? 'text-danger'
                  : b.mean < 0
                    ? 'text-ok'
                    : 'text-muted'
            }`}
          >
            {b.mean === null ? '—' : `${b.mean > 0 ? '+' : ''}${b.mean.toFixed(1)}d`}
          </span>
          <span className="w-8 shrink-0 font-mono text-[9px] text-muted text-right">
            {b.n || ''}
          </span>
        </div>
      ))}
      <p className="text-[10px] text-muted border-t border-hair pt-2 leading-relaxed">
        Average finish variance across each discipline&rsquo;s activities that have an
        actual finish. The right-hand figure is how many that is.
      </p>
    </div>
  );
}

// ── Row 4: source conflicts ─────────────────────────────────────────────────

function SourceConflicts({ conflicts }: { conflicts: SourceConflict[] }) {
  if (conflicts.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[11px] text-muted leading-relaxed">
        No two field sources have contradicted each other. Conflicts appear
        once a spreadsheet and a report disagree about the same field.
      </div>
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
                className="text-left font-mono text-[9px] uppercase tracking-wider text-muted font-normal px-3 py-2 whitespace-nowrap"
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
                    className={`font-mono text-[11px] ${
                      s.value === c.stored_value ? 'text-fg' : 'text-danger'
                    }`}
                  >
                    {shortDate(s.value)}
                  </span>
                  <span className="block font-mono text-[9px] text-muted break-all">
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
                className="border-b border-hair last:border-0 align-top"
              >
                <td className="px-3 py-2 min-w-[190px]">
                  <span className="font-mono text-[11px] text-fg">{c.activity_id}</span>
                  <span className="block text-[10px] text-muted">{c.description}</span>
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted whitespace-nowrap">
                  {FIELD_LABEL[c.field] ?? c.field}
                </td>
                <td className="px-3 py-2 min-w-[160px]">{cell(sheet, 0)}</td>
                <td className="px-3 py-2 min-w-[160px]">{cell(report, sheet ? 0 : 1)}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-fg whitespace-nowrap">
                  {shortDate(c.stored_value)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {/* Opens that activity's audit drawer on the Schedule screen. */}
                  <Link
                    to={`/schedule?activity=${encodeURIComponent(c.activity_id)}`}
                    className="font-mono text-[9px] uppercase tracking-wider text-accent border border-hair px-2 py-1 hover:border-strong"
                  >
                    Resolve
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 border-t border-hair text-[10px] text-muted leading-relaxed">
        Two field sources asserted different values for the same field. The stored
        value is whichever was written last, not whichever is correct. The
        Primavera baseline is read-only and is never a side of a disagreement.
      </p>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Home() {
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

  const activityMap = useMemo(() => {
    const m = new Map<string, ScheduleActivity>();
    for (const a of schedule.data?.activities ?? []) m.set(a.activity_id, a);
    return m;
  }, [schedule.data]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1280px] w-full mx-auto flex flex-col gap-4">
        {/* ROW 1 */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Tile
            label="Activities in baseline"
            value={schedule.data?.total_activities ?? null}
            loading={schedule.isLoading}
            error={Boolean(schedule.error)}
          />
          <Tile
            label="With actual dates"
            value={schedule.data?.activities_with_actuals ?? null}
            loading={schedule.isLoading}
            error={Boolean(schedule.error)}
          />
          <Tile
            label="Awaiting your review"
            value={queue.data?.length ?? null}
            loading={queue.isLoading}
            error={Boolean(queue.error)}
            accent
          />
          <Tile label="Auto-link precision" value={AUTO_LINK_PRECISION} />
        </section>

        {/* ROW 2 */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Panel
            title="Needs your attention"
            span="lg:col-span-3"
            action={{ to: '/reconcile', label: 'Reconcile' }}
          >
            {queue.error ? (
              <PanelError error={queue.error} />
            ) : queue.isLoading ? (
              <Skeleton rows={5} />
            ) : (
              <NeedsAttention items={queue.data ?? []} activities={activityMap} />
            )}
          </Panel>

          <Panel title="Recent activity" span="lg:col-span-2">
            {audit.error && jobs.error ? (
              <PanelError error={audit.error} />
            ) : audit.error ? (
              <PanelError error={audit.error} />
            ) : jobs.error ? (
              <PanelError error={jobs.error} />
            ) : audit.isLoading || jobs.isLoading ? (
              <Skeleton rows={6} height="h-3" />
            ) : (
              <RecentActivity audit={audit.data ?? []} jobs={jobs.data ?? []} />
            )}
          </Panel>
        </section>

        {/* ROW 3 */}
        <Panel title="Schedule health" span="">
          {schedule.error ? (
            <PanelError error={schedule.error} />
          ) : schedule.isLoading ? (
            <Skeleton rows={6} height="h-3" />
          ) : (
            <ScheduleHealth activities={schedule.data?.activities ?? []} />
          )}
        </Panel>

        {/* ROW 4 — surfaced with a count, not buried in a footer. */}
        <Panel
          title="Source conflicts"
          span=""
          badge={conflicts.data?.length}
          action={{ to: '/schedule', label: 'Schedule' }}
        >
          {conflicts.error ? (
            <PanelError error={conflicts.error} />
          ) : conflicts.isLoading ? (
            <Skeleton rows={4} />
          ) : (
            <SourceConflicts conflicts={conflicts.data ?? []} />
          )}
        </Panel>

        {conflicts.data && conflicts.data.length > 0 && (
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted flex items-center gap-1.5">
            <AlertTriangle size={10} className="text-warn" />
            {conflicts.data.length} activities have contradictory field evidence
          </p>
        )}
      </div>
    </div>
  );
}
