import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { CalendarRange, Download, Flame, LayoutList, ListFilter, Lock, X } from 'lucide-react';
import { api, errorDetail, getBaseUrl } from '../lib/api';
import {
  AuditRecord,
  DateBasis,
  Discipline,
  IntegrityWarning,
  ScheduleActivity,
} from '../types';
import { DISCIPLINES } from '../config';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { DisciplineTag } from '../components/DisciplineTag';
import { GanttChart } from '../components/GanttChart';
import { usePageHeader } from '../hooks/usePageHeader';
import { auditActor, auditActorLabel } from '../lib/audit';
import { Button, EmptyState, ErrorState, SectionTitle, Skeleton } from '../components/ui';

/**
 * QUESTION:  What does the schedule actually say now, and where did each
 *            actual date come from?
 * ACTION:    Open an activity's audit trail.
 *
 * The table is the answer to the first half; the drawer is the answer to the
 * second. Nothing on this screen writes — the trail is append-only (D-004) and
 * planned dates are the read-only baseline. See D-031.
 */

/** Which audit fields represent an actual-date write, for the trail's header. */
const FIELD_LABEL: Record<string, string> = {
  actual_start: 'ACTUAL START',
  actual_finish: 'ACTUAL FINISH',
  actual_qty: 'ACTUAL QTY',
  actual_finish_withheld: 'FINISH WITHHELD',
  source_conflict: 'SOURCE CONFLICT',
  linked_event_confirmed: 'EVENT CONFIRMED',
  event_reassigned: 'EVENT REASSIGNED',
  activity_created: 'ACTIVITY CREATED',
};

/** An em-dash in muted text, used wherever a date or number is genuinely absent. */
function Absent() {
  return <span className="text-muted">—</span>;
}

/**
 * An actual date, marked by how it was obtained. A date no source named — the
 * report header's date standing in for a line that claimed completion without
 * saying when — is not the same fact as a date a supervisor wrote down, and it
 * must not read like one. Inferred dates are dotted-underlined and carry the
 * reason on hover; asserted dates render plain.
 */
function DateCell({
  value,
  solid,
  basis,
}: {
  value: string | null;
  solid: boolean;
  basis?: DateBasis | null;
}) {
  if (!value) return <Absent />;
  const cls = `font-mono tabular-nums ${solid ? 'text-fg' : 'text-muted'}`;
  if (basis === 'DEFAULTED_TO_REPORT_DATE') {
    return (
      <span
        className={`${cls} underline decoration-dotted decoration-muted underline-offset-[3px]`}
        title="Inferred: no source named this date — defaulted to the report date"
      >
        {value}
        <span className="text-muted"> ~</span>
      </span>
    );
  }
  return <span className={cls}>{value}</span>;
}

/**
 * Variance in days. Positive is late (behind the baseline) and reads danger;
 * negative is early and reads --accent. Zero is on-plan and stays neutral, and
 * nothing here is green — DESIGN.md rules green out for completion states.
 */
function VarianceCell({ value }: { value: number | null }) {
  if (value === null || value === undefined) return null;
  if (value === 0) return <span className="font-mono tabular-nums text-muted">0d</span>;
  const late = value > 0;
  return (
    <span className={`font-mono tabular-nums ${late ? 'text-danger' : 'text-accent'}`}>
      {late ? '+' : ''}
      {value}d
    </span>
  );
}

/** Row-level location of a claim: a text line, a spreadsheet row, or neither. */
function sourceLocation(rec: AuditRecord): string {
  if (rec.source_line !== null) return `line ${rec.source_line}`;
  if (rec.source_row !== null) return `row ${rec.source_row}`;
  return '';
}

// ── Audit trail ─────────────────────────────────────────────────────────────

/**
 * The append-only trail for one activity, newest first.
 *
 * Rendered as a fixed left rule with a node per entry: the rule is continuous
 * and the entries hang off it in one direction only, so the sequence reads as
 * something that was accumulated rather than a list that can be edited. There
 * are deliberately no controls inside an entry — nothing here is actionable.
 */
function AuditTrail({ activityId }: { activityId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', activityId],
    queryFn: () => api.getActivityAudit(activityId),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height="h-14" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState error={error} />
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="border border-hair bg-raised rounded-lg">
        <EmptyState>No actual dates recorded yet.</EmptyState>
      </div>
    );
  }

  return (
    <div className="relative pl-4">
      {/* The spine. One unbroken rule behind every entry. */}
      <div className="absolute left-0 top-1 bottom-1 w-px bg-hair" aria-hidden />

      <div className="space-y-3">
        {data.map((rec) => {
          const loc = sourceLocation(rec);
          const isConflict = rec.conflict || rec.field_changed === 'source_conflict';
          return (
            <div key={rec.id} className="relative">
              {/* Node on the spine */}
              <div
                className={`absolute -left-4 top-1.5 w-[7px] h-[7px] -translate-x-[3px] border ${
                  isConflict ? 'border-danger bg-danger' : 'border-strong bg-surface'
                }`}
                aria-hidden
              />

              <div
                className={`border bg-raised rounded-lg px-3 py-3 font-mono text-label leading-relaxed ${
                  isConflict ? 'border-danger-line' : 'border-hair'
                }`}
              >
                {/* What changed */}
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className={isConflict ? 'text-danger' : 'text-fg'}>
                    {FIELD_LABEL[rec.field_changed] || rec.field_changed.toUpperCase()}
                  </span>
                  <span className="text-muted shrink-0">
                    {new Date(rec.timestamp).toLocaleString()}
                  </span>
                </div>

                {/* old -> new */}
                {rec.field_changed !== 'source_conflict' && (
                  <div className="mb-1.5">
                    <span className="text-muted">{rec.old_value ?? 'null'}</span>
                    <span className="text-muted mx-1.5">-&gt;</span>
                    <span className="text-fg">{rec.new_value ?? 'null'}</span>
                  </div>
                )}
                {rec.field_changed === 'source_conflict' && rec.new_value && (
                  <div className="mb-1.5 text-danger whitespace-pre-wrap break-words">
                    {rec.new_value}
                  </div>
                )}

                {/* Where it came from. A position shown is exact; no
                    position means no single line asserted this value, which
                    is said outright rather than left as a blank. */}
                <div className="text-muted break-all">
                  {rec.source_file ?? 'unknown source'}
                  {loc ? (
                    <span className="text-fg"> · {loc}</span>
                  ) : (
                    <span className="italic"> · no single line</span>
                  )}
                </div>
                {rec.source_span && (
                  <div className="mt-1 pl-2 border-l border-hair text-muted whitespace-pre-wrap break-words">
                    &ldquo;{rec.source_span}&rdquo;
                  </div>
                )}

                {/* How it was applied */}
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  {/* Who decided this, read from `source` rather than from
                      `auto_applied`. See lib/audit.ts: not-auto-applied is not
                      the same as planner-confirmed, and on a clean reset 67 of
                      275 rows claimed a confirmation nobody had made. */}
                  <span
                    className={`px-2 border rounded-full text-label uppercase ${
                      auditActor(rec) === 'planner'
                        ? 'border-accent text-accent'
                        : 'border-hair text-muted'
                    }`}
                  >
                    {auditActorLabel(rec)}
                  </span>
                  {rec.confidence !== null && (
                    <span className="text-muted">
                      conf <ConfidenceBadge value={rec.confidence} />
                    </span>
                  )}
                  <span className="text-muted">{rec.source}</span>
                  {/* model_version was here. No planner decision turns on it,
                      and it competed with the source and confidence that do. */}
                </div>

                {/* Which extracted event caused this write. */}
                {rec.linked_event_id && (
                  <div className="mt-1 text-muted">
                    from event{' '}
                    <span className="text-fg">{rec.linked_event_id.split('-')[0]}</span>
                  </div>
                )}

                {!loc && rec.contributing_sources.length <= 1 && (
                  <div className="mt-1 text-muted italic">
                    Value taken from the report&rsquo;s date, not a single line.
                  </div>
                )}

                {rec.contributing_sources.length > 1 && (
                  <div className="mt-1.5 pt-2 border-t border-hair text-muted">
                    <div className="uppercase text-label mb-0.5">
                      {rec.contributing_sources.length} sources asserted this field
                    </div>
                    {rec.contributing_sources.map((src, i) => (
                      <div key={i} className="break-words">
                        · {src}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 text-muted font-mono text-label uppercase tracking-wider">
        <Lock size={10} />
        Append-only · {data.length} record{data.length === 1 ? '' : 's'} · never edited
      </div>
    </div>
  );
}

/**
 * Which readings built this activity's installed quantity, and which the
 * roll-up refused.
 *
 * The refusals are the reason this section exists. A ledger showing 800 of
 * 1200 m without saying that another reading was thrown away for a unit
 * mismatch would be hiding its own judgement — and on `ELE-CBL-1076` that
 * discarded reading is 1.2 km, which is 1200 m and would have completed the
 * activity. See D-085.
 *
 * NOTE ON THE DESIGN. There is no mockup in `Design/` for these two sections,
 * so they are assembled from the vocabulary this drawer already uses — its
 * `Field`, its `SectionTitle`, its tokens. Nothing new was invented; if a
 * mockup arrives, this reproduces it instead.
 */
function QuantityLedgerSection({ activityId }: { activityId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['quantityLedger', activityId],
    queryFn: () => api.getQuantityLedger(activityId),
  });

  if (isLoading) return <Skeleton height="h-20" />;
  if (error) return <ErrorState error={error} mode="bare" />;
  if (!data || data.contributions.length === 0) {
    return (
      <span className="font-mono text-label text-muted">
        No readings linked to this activity.
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2 flex-wrap font-mono text-body">
        <span className="text-fg">
          {data.counted_total}
          <span className="text-muted"> / {data.planned_qty} {data.uom}</span>
        </span>
        {data.percent_complete_from_quantity !== null && (
          <span className="text-muted">
            = {data.percent_complete_from_quantity}%
          </span>
        )}
        {/* Above 100 means more was reported than the node was planned to
            hold — usually a quantity from different work matched onto it. */}
        {data.raw_percent_from_quantity !== null &&
          data.raw_percent_from_quantity > 100 && (
            <span className="text-danger text-label uppercase tracking-wider">
              reported {data.raw_percent_from_quantity}% — over planned scope
            </span>
          )}
      </div>

      <div className="border border-hair rounded-sm divide-y divide-hair">
        {data.contributions.map((c) => (
          <div key={c.linked_event_id} className="px-3 py-2 flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2 flex-wrap font-mono text-label">
              <span className={c.counted ? 'text-ok' : 'text-danger'}>
                {c.counted ? 'COUNTED' : 'REFUSED'}
              </span>
              <span className="text-fg">
                {c.quantity ?? '—'} {c.uom ?? ''}
              </span>
              <span className="text-muted">{c.reported_date ?? ''}</span>
            </div>
            <span className="text-label text-muted break-words">{c.reason}</span>
            <span className="font-mono text-label text-muted break-words">
              {c.source_file}
              {c.source_row !== null
                ? `, row ${c.source_row}`
                : c.source_line !== null
                  ? `, line ${c.source_line}`
                  : ''}
            </span>
          </div>
        ))}
      </div>

      <p className="text-label text-muted leading-relaxed">
        {data.refusal_note}
      </p>
    </div>
  );
}

/**
 * How fast the work went, and therefore when it finishes.
 *
 * Three rates and none of them is THE rate: the elapsed reading is punished by
 * reporting gaps, the reported reading ignores them, and the planned rate is
 * what the schedule assumed. The forecast names which one it used, and every
 * rate that disagreed is shown beside it — a single figure would hide that the
 * same evidence supports a range. Nothing here is written to the schedule.
 * See D-087, D-088.
 */
function ForecastSection({ activityId }: { activityId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['activityProductivity', activityId],
    queryFn: () => api.getActivityProductivity(activityId),
  });

  if (isLoading) return <Skeleton height="h-20" />;
  if (error) return <ErrorState error={error} mode="bare" />;
  if (!data) return null;

  const forecast = data.forecast;

  return (
    <div className="flex flex-col gap-3">
      {forecast ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 flex-wrap font-mono text-body">
            <span className="text-fg">{forecast.forecast_finish}</span>
            <span className="text-muted">vs baseline {forecast.baseline_finish}</span>
            {forecast.variance_days !== null && (
              <span className={forecast.variance_days > 0 ? 'text-danger' : 'text-ok'}>
                {forecast.variance_days > 0 ? '+' : ''}
                {forecast.variance_days}d
              </span>
            )}
          </div>
          <span className="font-mono text-label text-muted">
            from {forecast.basis} at {forecast.rate} {data.uom}/day ·{' '}
            {data.remaining_qty} {data.uom} remaining
          </span>
          {forecast.why && (
            <span className="text-label text-muted leading-relaxed">
              {forecast.why}
            </span>
          )}
        </div>
      ) : (
        // "We cannot say" and "we did not look" are different answers, so the
        // refusal is shown rather than an empty panel.
        <span className="font-mono text-label text-muted">
          No forecast: {data.reason?.replace(/_/g, ' ')}
        </span>
      )}

      {/* Every rate, including the ones the forecast did not use. */}
      <div className="border border-hair rounded-sm divide-y divide-hair">
        {data.rates.map((r) => (
          <div key={r.basis} className="px-3 py-2 flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-label uppercase tracking-wider text-muted">
              {r.basis.replace(/_/g, ' ')}
            </span>
            <span className="font-mono text-body text-fg">
              {r.value === null ? '—' : `${r.value} ${data.uom}/d`}
            </span>
            {r.days !== null && (
              <span className="font-mono text-label text-muted">
                over {r.days}d
              </span>
            )}
            {r.value === null && (
              <span className="text-label text-muted break-words">{r.note}</span>
            )}
          </div>
        ))}
      </div>

      {/* The evidence line: one reading is a thin basis for a claim in weeks,
          and the reader is told rather than left to assume. */}
      <span className="font-mono text-label text-muted break-words">
        {data.evidence.readings_counted} reading
        {data.evidence.readings_counted === 1 ? '' : 's'} over{' '}
        {data.evidence.reported_days} reported day
        {data.evidence.reported_days === 1 ? '' : 's'} ·{' '}
        {data.evidence.measured_quantity} {data.evidence.uom} confirmed ·{' '}
        {data.comparables.count} comparable
        {data.comparables.count === 1 ? '' : 's'}
      </span>

      <p className="text-label text-muted leading-relaxed">
        {data.forecast_note}
      </p>
    </div>
  );
}

// ── Drawer ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-label uppercase tracking-wider text-muted">{label}</span>
      <span className="font-mono text-body text-fg break-words">{children}</span>
    </div>
  );
}

function AuditDrawer({
  activity,
  onClose,
}: {
  activity: ScheduleActivity;
  onClose: () => void;
}) {
  return (
    <aside
      className="absolute top-0 right-0 bottom-0 w-[480px] max-w-full bg-raised border-l border-hair flex flex-col z-30"
      role="dialog"
      aria-label={`Audit trail for ${activity.activity_id}`}
    >
      {/* Header */}
      <div className="border-b border-hair px-4 py-3 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <div className="font-mono text-lead text-fg">{activity.activity_id}</div>
          <div className="text-body text-muted mt-0.5">{activity.description}</div>
        </div>
        <Button variant="icon" onClick={onClose} aria-label="Close">
          <X size={16} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* DETAIL */}
        <section>
          <SectionTitle className="mb-3">Detail</SectionTitle>

          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <Field label="WBS Path">{activity.wbs_path}</Field>
            {activity.wbs_level !== null && (
              <Field label="WBS Level">L{activity.wbs_level}</Field>
            )}
            {activity.calendar && (
              <Field label="Calendar">{activity.calendar}</Field>
            )}
            <Field label="Discipline">
              <DisciplineTag discipline={activity.discipline} />
            </Field>
          </div>

          {/* Planned against actual. Planned is read-only baseline and is
              rendered muted so the actual column is the one that reads. */}
          <div className="mt-3 border border-hair rounded-sm overflow-hidden">
            <div className="grid grid-cols-3 border-b border-hair bg-raised">
              <div className="px-2 py-1 font-mono text-label uppercase tracking-wider text-muted" />
              <div className="px-2 py-1 font-mono text-label uppercase tracking-wider text-muted border-l border-hair">
                Planned
              </div>
              <div className="px-2 py-1 font-mono text-label uppercase tracking-wider text-muted border-l border-hair">
                Actual
              </div>
            </div>
            <div className="grid grid-cols-3 border-b border-hair">
              <div className="px-2 py-2 font-mono text-label text-muted">Start</div>
              <div className="px-2 py-2 font-mono text-label text-muted border-l border-hair">
                {activity.planned_start ?? <Absent />}
              </div>
              <div className="px-2 py-2 font-mono text-label text-fg border-l border-hair">
                <DateCell
                  value={activity.actual_start}
                  basis={activity.actual_start_basis}
                  solid
                />
              </div>
            </div>
            <div className="grid grid-cols-3">
              <div className="px-2 py-2 font-mono text-label text-muted">Finish</div>
              <div className="px-2 py-2 font-mono text-label text-muted border-l border-hair">
                {activity.planned_finish ?? <Absent />}
              </div>
              <div className="px-2 py-2 font-mono text-label text-fg border-l border-hair">
                <DateCell
                  value={activity.actual_finish}
                  basis={activity.actual_finish_basis}
                  solid
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-3 mt-3">
            <Field label="Planned Qty">
              {activity.planned_qty} {activity.uom}
            </Field>
            <Field label="Actual Qty">
              {activity.actual_qty !== null ? (
                <>
                  {activity.actual_qty} {activity.uom}
                </>
              ) : (
                <Absent />
              )}
            </Field>
            <Field label="Percent Complete">
              {activity.percent_complete !== null ? (
                `${activity.percent_complete.toFixed(1)}%`
              ) : (
                <Absent />
              )}
            </Field>
            <Field label="Confidence">
              {activity.link_confidence !== null ? (
                <ConfidenceBadge value={activity.link_confidence} />
              ) : (
                <Absent />
              )}
            </Field>
          </div>

          <div className="mt-3">
            <span className="font-mono text-label uppercase tracking-wider text-muted">
              Predecessors
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {activity.predecessors.length > 0 ? (
                activity.predecessors.map((p) => (
                  <span
                    key={p}
                    className="font-mono text-label text-accent bg-selected rounded-full px-2 py-1"
                  >
                    {p}
                  </span>
                ))
              ) : (
                <span className="font-mono text-label text-muted">None</span>
              )}
            </div>
          </div>
        </section>

        {/* QUANTITY LEDGER */}
        <section>
          <SectionTitle className="mb-3">Quantity Ledger</SectionTitle>
          <QuantityLedgerSection activityId={activity.activity_id} />
        </section>

        {/* PRODUCTIVITY AND FORECAST */}
        <section>
          <SectionTitle className="mb-3">Productivity &amp; Forecast</SectionTitle>
          <ForecastSection activityId={activity.activity_id} />
        </section>

        {/* AUDIT TRAIL */}
        <section>
          <SectionTitle className="mb-3">Audit Trail</SectionTitle>
          <AuditTrail activityId={activity.activity_id} />
        </section>
      </div>
    </aside>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Schedule() {
  usePageHeader('Schedule', 'The 120-activity baseline with every confirmed actual date.', '/schedule');
  const [discipline, setDiscipline] = useState<string>('');
  const [search, setSearch] = useState('');
  const [onlyActuals, setOnlyActuals] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'gantt'>('table');
  // The Ingest screen links auto-linked events here as /schedule?activity=ID.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinked = searchParams.get('activity');
  const [selectedId, setSelectedId] = useState<string | null>(deepLinked);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [exportFormat, setExportFormat] = useState<'pmxml' | 'xer'>('pmxml');
  const [exportState, setExportState] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'done'; name: string; url: string }
    | { kind: 'error'; detail: string }
  >({ kind: 'idle' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['schedule', 'page', discipline],
    queryFn: () => api.getSchedule(discipline || undefined, true),
  });

  const warnings: IntegrityWarning[] = data?.integrity_warnings ?? [];

  /** Activity ids named by at least one integrity warning. */
  const flaggedIds = useMemo(
    () => new Set(warnings.map((w) => w.activity_id)),
    [warnings]
  );

  const warningBreakdown = useMemo(() => {
    let conflict = 0;
    let warning = 0;
    for (const w of warnings) {
      if (w.severity === 'conflict') conflict += 1;
      else warning += 1;
    }
    return { conflict, warning };
  }, [warnings]);

  /** Discipline is a server-side filter; search and the toggles are local. */
  const rows = useMemo(() => {
    let list = data?.activities ?? [];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((a) => a.description.toLowerCase().includes(q));
    if (onlyActuals) list = list.filter((a) => a.actual_start || a.actual_finish);
    if (onlyFlagged) list = list.filter((a) => flaggedIds.has(a.activity_id));
    if (onlyCritical) list = list.filter((a) => Boolean(a.critical));
    return list;
  }, [data, search, onlyActuals, onlyFlagged, onlyCritical, flaggedIds]);

  const selected = useMemo(
    () => data?.activities.find((a) => a.activity_id === selectedId) ?? null,
    [data, selectedId]
  );

  // Follow a later deep link too — arriving from Ingest while already on this
  // screen changes the query string without remounting.
  useEffect(() => {
    if (deepLinked) setSelectedId(deepLinked);
  }, [deepLinked]);

  // Bring a deep-linked row into view. A row hidden behind a filter simply has
  // no ref, and the drawer still opens.
  //
  // This used to depend on `data` as well, and `data` is refetched every three
  // seconds — so any change anywhere in the 120-activity payload re-centred the
  // table under the open drawer. It scrolls when the selection changes and at
  // no other time; the rAF gives the row one frame to mount on a first load
  // where the selection arrives before the rows do.
  useEffect(() => {
    if (!selectedId) return;
    const raf = requestAnimationFrame(() => {
      rowRefs.current[selectedId]?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedId]);

  const closeDrawer = () => {
    setSelectedId(null);
    if (searchParams.has('activity')) {
      const next = new URLSearchParams(searchParams);
      next.delete('activity');
      setSearchParams(next, { replace: true });
    }
  };

  const columns = useMemo(() => {
    const defs: ColumnDef<ScheduleActivity>[] = [
      {
        accessorKey: 'activity_id',
        header: 'Activity ID',
        size: 140,
        cell: (c) => {
          const isCrit = c.row.original.critical;
          return (
            <span className="font-mono text-fg flex items-center gap-1.5">
              {isCrit && (
                <span title="Critical Path Activity (Float ≤ 0)" className="inline-flex">
                  <Flame
                    size={12}
                    className="text-danger shrink-0 animate-pulse"
                  />
                </span>
              )}
              {c.getValue<string>()}
            </span>
          );
        },
      },
      {
        accessorKey: 'description',
        header: 'Description',
        size: 300,
        cell: (c) => <span className="block truncate">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'discipline',
        header: 'Disc',
        size: 56,
        cell: (c) => <DisciplineTag discipline={c.getValue<Discipline>()} />,
      },
      {
        accessorKey: 'planned_start',
        header: 'Planned Start',
        size: 96,
        cell: (c) => <span className="font-mono tabular-nums text-muted">{c.getValue<string>() ?? '—'}</span>,
      },
      {
        accessorKey: 'planned_finish',
        header: 'Planned Finish',
        size: 96,
        cell: (c) => <span className="font-mono tabular-nums text-muted">{c.getValue<string>() ?? '—'}</span>,
      },
      {
        accessorKey: 'actual_start',
        header: 'Actual Start',
        size: 96,
        cell: (c) => (
          <DateCell
            value={c.getValue<string | null>()}
            basis={c.row.original.actual_start_basis}
            solid
          />
        ),
      },
      {
        accessorKey: 'actual_finish',
        header: 'Actual Finish',
        size: 96,
        cell: (c) => (
          <DateCell
            value={c.getValue<string | null>()}
            basis={c.row.original.actual_finish_basis}
            solid
          />
        ),
      },
      {
        accessorKey: 'start_variance_days',
        header: 'Start Var',
        size: 68,
        cell: (c) => <VarianceCell value={c.getValue<number | null>()} />,
      },
      {
        accessorKey: 'finish_variance_days',
        header: 'Finish Var',
        size: 68,
        cell: (c) => <VarianceCell value={c.getValue<number | null>()} />,
      },
      {
        accessorKey: 'total_float',
        header: 'Float',
        size: 60,
        cell: (c) => {
          const v = c.getValue<number | null | undefined>();
          if (v === null || v === undefined) return <Absent />;
          const isCrit = c.row.original.critical;
          return (
            <span
              className={`font-mono tabular-nums ${
                isCrit ? 'text-danger font-bold' : 'text-muted'
              }`}
              title={isCrit ? 'Critical activity (0 days float)' : `${v} days float`}
            >
              {v}d
            </span>
          );
        },
      },
      {
        accessorKey: 'percent_complete',
        header: '% Comp',
        size: 64,
        cell: (c) => {
          const v = c.getValue<number | null>();
          if (v === null || v === undefined) return <Absent />;
          return <span className="font-mono tabular-nums text-fg">{v.toFixed(0)}%</span>;
        },
      },
      {
        id: 'confidence',
        header: 'Conf',
        size: 60,
        // Only meaningful where an actual exists — there is nothing to be
        // confident about on a row that is still purely planned.
        cell: ({ row }) => {
          const a = row.original;
          const hasActual = Boolean(a.actual_start || a.actual_finish);
          if (!hasActual || a.link_confidence === null) return null;
          return <ConfidenceBadge value={a.link_confidence} />;
        },
      },
    ];
    return defs;
  }, []);

  const table = useReactTable<ScheduleActivity>({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  /**
   * Export writes the file on the server, then downloads it.
   *
   * `GET /uploads/{filename}` now serves the file as an attachment (D-044), so
   * `ExportResponse.download_url` finally resolves — it pointed at a route
   * nothing served for the whole life of the feature, which is why this button
   * used to say "Saved on server" (D-031, D-039 gap 3).
   *
   * The click is triggered programmatically AND the filename is left on screen
   * as a real link: a browser that blocks the automatic download still leaves
   * the planner something to click, rather than a button that silently did
   * nothing.
   */
  const handleExport = async () => {
    setExportState({ kind: 'busy' });
    try {
      const res = await api.exportSchedule({
        format: exportFormat,
        include_actuals: true,
        filter_discipline: discipline || undefined,
      });

      // download_url is server-relative; in development the app is served from
      // a different origin, so it has to be resolved against the API base.
      const url = `${getBaseUrl()}${res.download_url}`;
      setExportState({ kind: 'done', name: res.filename, url });

      const link = document.createElement('a');
      link.href = url;
      link.download = res.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      setExportState({
        kind: 'error',
        detail: errorDetail(e),
      });
    }
  };

  // The result used to sit in the toolbar for the rest of the session, so a
  // file exported once looked like it had just been exported again.
  useEffect(() => {
    if (exportState.kind !== 'done' && exportState.kind !== 'error') return;
    const t = setTimeout(() => setExportState({ kind: 'idle' }), 6000);
    return () => clearTimeout(t);
  }, [exportState]);

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <ErrorState
        error={error}
        mode="full"
        title="Error loading schedule"
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-raised border border-hair rounded-lg relative overflow-hidden">
      {/* INTEGRITY BANNER */}
      {warnings.length > 0 && (
        <button
          onClick={() => setOnlyFlagged((v) => !v)}
          className={`shrink-0 h-8 px-4 flex items-center gap-2 border-b text-left font-mono text-label transition-colors ${
            onlyFlagged
              ? 'bg-danger-bg border-danger-line text-danger'
              : 'bg-raised border-hair text-muted hover:text-fg'
          }`}
        >
          <ListFilter size={12} className={onlyFlagged ? 'text-danger' : 'text-warn'} />
          <span className="text-fg">{warnings.length} items flagged for review</span>
          <span>
            — {warningBreakdown.conflict} source conflict
            {warningBreakdown.conflict === 1 ? '' : 's'}, {warningBreakdown.warning} date
            warning{warningBreakdown.warning === 1 ? '' : 's'}
          </span>
          <span className="ml-auto uppercase tracking-wider">
            {onlyFlagged
              ? `Showing ${flaggedIds.size} affected — click to clear`
              : 'Click to filter'}
          </span>
        </button>
      )}

      {/* FILTER BAR */}
      <div className="shrink-0 h-11 px-4 border-b border-hair flex items-center gap-3">
        {/* View Mode Switcher */}
        <div className="flex items-center rounded border border-hair overflow-hidden mr-1">
          <button
            onClick={() => setViewMode('table')}
            className={`px-2.5 py-1 text-label font-mono flex items-center gap-1.5 transition-colors ${
              viewMode === 'table'
                ? 'bg-selected text-accent font-semibold'
                : 'text-muted hover:text-fg'
            }`}
            title="Grid Table View"
          >
            <LayoutList size={12} />
            Table
          </button>
          <button
            onClick={() => setViewMode('gantt')}
            className={`px-2.5 py-1 text-label font-mono border-l border-hair flex items-center gap-1.5 transition-colors ${
              viewMode === 'gantt'
                ? 'bg-selected text-accent font-semibold'
                : 'text-muted hover:text-fg'
            }`}
            title="Interactive Dual-Bar CPM Gantt Chart"
          >
            <CalendarRange size={12} />
            Gantt Chart
          </button>
        </div>

        <select
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          className="rounded-sm h-7 bg-raised border border-hair text-fg font-mono text-label px-2 transition-colors focus:outline-none focus:border-accent"
          aria-label="Filter by discipline"
        >
          <option value="">All disciplines</option>
          {DISCIPLINES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search descriptions"
          className="rounded-sm h-7 w-56 bg-raised border border-hair px-2 font-mono text-label text-fg transition-colors focus:outline-none focus:border-accent"
        />

        <label className="flex items-center gap-2 cursor-pointer font-mono text-label text-muted hover:text-fg">
          <input
            type="checkbox"
            checked={onlyActuals}
            onChange={(e) => setOnlyActuals(e.target.checked)}
            className="rounded-sm accent-accent"
          />
          Actuals only
        </label>

        <label className="flex items-center gap-1.5 cursor-pointer font-mono text-label text-muted hover:text-fg">
          <input
            type="checkbox"
            checked={onlyCritical}
            onChange={(e) => setOnlyCritical(e.target.checked)}
            className="rounded-sm accent-danger"
          />
          <Flame size={12} className={onlyCritical ? 'text-danger' : 'text-muted'} />
          <span>Critical Path</span>
          {data?.critical_activities ? (
            <span className="text-[10px] bg-danger/15 text-danger font-bold px-1 rounded-xs">
              {data.critical_activities}
            </span>
          ) : null}
        </label>

        <div className="ml-auto flex items-center gap-2">
          {exportState.kind === 'done' && (
            /* The download has already been triggered. This stays for a few
               seconds as the fallback for a browser that blocked it. */
            <a
              href={exportState.url}
              download={exportState.name}
              className="font-mono text-label text-ok max-w-[320px] truncate hover:underline"
              title={`Downloaded ${exportState.name}. Click to download again.`}
            >
              Downloaded {exportState.name}
            </a>
          )}
          {exportState.kind === 'error' && (
            <span className="font-mono text-label text-danger">{exportState.detail}</span>
          )}
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'pmxml' | 'xer')}
            className="rounded-sm h-7 bg-raised border border-hair text-fg font-mono text-label px-2 transition-colors focus:outline-none focus:border-accent"
            aria-label="Export format"
          >
            <option value="pmxml">PMXML</option>
            <option value="xer">XER</option>
          </select>
          <Button
            variant="secondary"
            size="xs"
            onClick={handleExport}
            disabled={exportState.kind === 'busy'}
          >
            <Download size={12} />
            {exportState.kind === 'busy' ? 'Exporting…' : 'Export'}
          </Button>
        </div>
      </div>

      {/* MAIN VIEW: TABLE OR GANTT CHART */}
      {viewMode === 'table' ? (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-raised">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-hair">
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      style={{ width: h.getSize() }}
                      className="text-left text-label font-medium uppercase tracking-[0.05em] text-heading px-3 py-3 whitespace-nowrap"
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>

            <tbody>
              {isLoading &&
                Array.from({ length: 18 }).map((_, i) => (
                  <tr key={i} className="border-b border-hair">
                    {columns.map((_c, j) => (
                      <td key={j} className="px-3 py-3">
                        <Skeleton height="h-3" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!isLoading &&
                table.getRowModel().rows.map((row) => {
                  const a = row.original;
                  const hasActual = Boolean(a.actual_start || a.actual_finish);
                  const isSelected = a.activity_id === selectedId;
                  return (
                    <tr
                      key={row.id}
                      ref={(el) => {
                        rowRefs.current[a.activity_id] = el;
                      }}
                      onClick={() => setSelectedId(a.activity_id)}
                      className={`border-b border-hair cursor-pointer transition-colors ${
                        isSelected ? 'bg-selected' : 'even:bg-surface hover:bg-selected'
                      } ${hasActual ? 'text-fg' : 'text-muted'}`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                          className="px-3 py-3 text-body whitespace-nowrap max-w-0"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>

          {!isLoading && rows.length === 0 && (
            <EmptyState>No activities match the filter.</EmptyState>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <GanttChart
            activities={rows}
            selectedId={selectedId}
            onSelectActivity={(id) => setSelectedId(id)}
            dataDate={data?.data_date}
          />
        </div>
      )}

      {/* FOOTER */}
      <div className="shrink-0 h-7 border-t border-hair px-4 flex items-center gap-4 font-mono text-label uppercase tracking-wider text-muted">
        <span>
          {rows.length} of {data?.total_activities ?? 0} activities
        </span>
        <span>{data?.activities_with_actuals ?? 0} with actuals</span>
        <span>{data?.activities_completed ?? 0} completed</span>
        {data?.critical_activities !== undefined && (
          <span className="text-danger font-medium flex items-center gap-1">
            <Flame size={10} />
            {data.critical_activities} critical
          </span>
        )}
        {data?.average_start_variance !== null && data?.average_start_variance !== undefined && (
          <span>avg start var {data.average_start_variance}d</span>
        )}
        {data?.average_finish_variance !== null && data?.average_finish_variance !== undefined && (
          <span>avg finish var {data.average_finish_variance}d</span>
        )}
        {data?.baseline && (
          <span
            title={`${data.baseline.filename} · ${data.baseline.activity_count} activities · sha256 ${data.baseline.sha256}`}
          >
            baseline {data.baseline.name} @{data.baseline.sha256.slice(0, 7)}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Lock size={9} />
          Planned dates are baseline — read only
        </span>
      </div>

      {/* DRAWER */}
      {selected && <AuditDrawer activity={selected} onClose={closeDrawer} />}
    </div>
  );
}
