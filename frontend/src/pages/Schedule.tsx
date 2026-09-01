import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { AlertCircle, AlertTriangle, Download, Lock, X } from 'lucide-react';
import { api, errorDetail } from '../lib/api';
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
import { usePageHeader } from '../hooks/usePageHeader';

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
  const cls = `font-mono ${solid ? 'text-fg' : 'text-muted'}`;
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
  if (value === 0) return <span className="font-mono text-muted">0d</span>;
  const late = value > 0;
  return (
    <span className={`font-mono ${late ? 'text-danger' : 'text-accent'}`}>
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
      <div className="space-y-2 opacity-50">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 bg-selected rounded-[8px] animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-3 border border-danger-line bg-danger-bg text-danger font-mono text-[12px] rounded-[10px] flex items-start gap-2">
        <AlertCircle size={12} className="mt-0.5 shrink-0" />
        {errorDetail(error)}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-4 border border-hair bg-raised rounded-[10px] text-muted font-mono text-[12px] text-center">
        No actual dates recorded yet.
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
                className={`border bg-raised rounded-[10px] px-3 py-3 font-mono text-[12px] leading-relaxed ${
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
                  <span
                    className={`px-2 border rounded-full text-[11px] uppercase ${
                      rec.auto_applied
                        ? 'border-hair text-muted'
                        : 'border-accent text-accent'
                    }`}
                  >
                    {rec.auto_applied ? 'Auto' : 'Confirmed by planner'}
                  </span>
                  {rec.confidence !== null && (
                    <span className="text-muted">
                      conf <ConfidenceBadge value={rec.confidence} />
                    </span>
                  )}
                  <span className="text-muted">{rec.source}</span>
                  <span className="text-muted">{rec.model_version}</span>
                </div>

                {!loc && rec.contributing_sources.length <= 1 && (
                  <div className="mt-1 text-muted italic">
                    Value taken from the report&rsquo;s date, not a single line.
                  </div>
                )}

                {rec.contributing_sources.length > 1 && (
                  <div className="mt-1.5 pt-1.5 border-t border-hair text-muted">
                    <div className="uppercase text-[11px] mb-0.5">
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

      <div className="mt-3 flex items-center gap-1.5 text-muted font-mono text-[11px] uppercase tracking-wider">
        <Lock size={10} />
        Append-only · {data.length} record{data.length === 1 ? '' : 's'} · never edited
      </div>
    </div>
  );
}

// ── Drawer ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</span>
      <span className="font-mono text-[14px] text-fg break-words">{children}</span>
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
          <div className="font-mono text-[15px] text-fg">{activity.activity_id}</div>
          <div className="text-[14px] text-muted mt-0.5">{activity.description}</div>
        </div>
        <button
          onClick={onClose}
          className="rounded-[8px] text-muted hover:text-fg shrink-0 p-1"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* DETAIL */}
        <section>
          <div className="font-mono text-[12px] uppercase tracking-wider text-muted mb-2.5">
            Detail
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="WBS Path">{activity.wbs_path}</Field>
            <Field label="Discipline">
              <DisciplineTag discipline={activity.discipline} />
            </Field>
          </div>

          {/* Planned against actual. Planned is read-only baseline and is
              rendered muted so the actual column is the one that reads. */}
          <div className="mt-3 border border-hair rounded-[8px] overflow-hidden">
            <div className="grid grid-cols-3 border-b border-hair bg-raised">
              <div className="px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-muted" />
              <div className="px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-muted border-l border-hair">
                Planned
              </div>
              <div className="px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-muted border-l border-hair">
                Actual
              </div>
            </div>
            <div className="grid grid-cols-3 border-b border-hair">
              <div className="px-2 py-1.5 font-mono text-[12px] text-muted">Start</div>
              <div className="px-2 py-1.5 font-mono text-[12px] text-muted border-l border-hair">
                {activity.planned_start ?? <Absent />}
              </div>
              <div className="px-2 py-1.5 font-mono text-[12px] text-fg border-l border-hair">
                <DateCell
                  value={activity.actual_start}
                  basis={activity.actual_start_basis}
                  solid
                />
              </div>
            </div>
            <div className="grid grid-cols-3">
              <div className="px-2 py-1.5 font-mono text-[12px] text-muted">Finish</div>
              <div className="px-2 py-1.5 font-mono text-[12px] text-muted border-l border-hair">
                {activity.planned_finish ?? <Absent />}
              </div>
              <div className="px-2 py-1.5 font-mono text-[12px] text-fg border-l border-hair">
                <DateCell
                  value={activity.actual_finish}
                  basis={activity.actual_finish_basis}
                  solid
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-3">
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
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
              Predecessors
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {activity.predecessors.length > 0 ? (
                activity.predecessors.map((p) => (
                  <span
                    key={p}
                    className="font-mono text-[12px] text-accent bg-selected rounded-full px-2 py-0.5"
                  >
                    {p}
                  </span>
                ))
              ) : (
                <span className="font-mono text-[12px] text-muted">None</span>
              )}
            </div>
          </div>
        </section>

        {/* AUDIT TRAIL */}
        <section>
          <div className="font-mono text-[12px] uppercase tracking-wider text-muted mb-2.5">
            Audit Trail
          </div>
          <AuditTrail activityId={activity.activity_id} />
        </section>
      </div>
    </aside>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Schedule() {
  usePageHeader('Schedule', 'The 120-activity baseline with every confirmed actual date.');
  const [discipline, setDiscipline] = useState<string>('');
  const [search, setSearch] = useState('');
  const [onlyActuals, setOnlyActuals] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  // The Ingest screen links auto-linked events here as /schedule?activity=ID.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinked = searchParams.get('activity');
  const [selectedId, setSelectedId] = useState<string | null>(deepLinked);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [exportFormat, setExportFormat] = useState<'pmxml' | 'xer'>('pmxml');
  const [exportState, setExportState] = useState<
    { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; name: string } | { kind: 'error'; detail: string }
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
    return list;
  }, [data, search, onlyActuals, onlyFlagged, flaggedIds]);

  const selected = useMemo(
    () => data?.activities.find((a) => a.activity_id === selectedId) ?? null,
    [data, selectedId]
  );

  // Follow a later deep link too — arriving from Ingest while already on this
  // screen changes the query string without remounting.
  useEffect(() => {
    if (deepLinked) setSelectedId(deepLinked);
  }, [deepLinked]);

  // Bring a deep-linked row into view once its data has arrived. A row hidden
  // behind a filter simply has no ref, and the drawer still opens.
  useEffect(() => {
    if (!selectedId || !data) return;
    rowRefs.current[selectedId]?.scrollIntoView({ block: 'center' });
  }, [selectedId, data]);

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
        size: 130,
        cell: (c) => <span className="font-mono text-fg">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'description',
        header: 'Description',
        size: 320,
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
        cell: (c) => <span className="font-mono text-muted">{c.getValue<string>() ?? '—'}</span>,
      },
      {
        accessorKey: 'planned_finish',
        header: 'Planned Finish',
        size: 96,
        cell: (c) => <span className="font-mono text-muted">{c.getValue<string>() ?? '—'}</span>,
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
        accessorKey: 'percent_complete',
        header: '% Comp',
        size: 64,
        cell: (c) => {
          const v = c.getValue<number | null>();
          if (v === null || v === undefined) return <Absent />;
          return <span className="font-mono text-fg">{v.toFixed(0)}%</span>;
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

  const handleExport = async () => {
    setExportState({ kind: 'busy' });
    try {
      const res = await api.exportSchedule({
        format: exportFormat,
        include_actuals: true,
        filter_discipline: discipline || undefined,
      });
      setExportState({ kind: 'done', name: res.filename });
    } catch (e) {
      setExportState({
        kind: 'error',
        detail: errorDetail(e),
      });
    }
  };

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle size={32} className="text-danger mb-4" />
        <div className="font-mono text-fg mb-2">Error loading schedule</div>
        <div className="text-muted text-sm mb-6 max-w-md">
          {errorDetail(error)}
        </div>
        <button
          onClick={() => refetch()}
          className="px-5 py-3 bg-accent text-accent-fg hover:bg-accent-hover font-mono uppercase text-xs rounded-[8px] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-raised border border-hair rounded-[10px] relative overflow-hidden">
      {/* INTEGRITY BANNER */}
      {warnings.length > 0 && (
        <button
          onClick={() => setOnlyFlagged((v) => !v)}
          className={`rounded-[8px] shrink-0 h-8 px-4 flex items-center gap-2 border-b text-left font-mono text-[12px] transition-colors ${
            onlyFlagged
              ? 'bg-danger-bg border-danger-line text-danger'
              : 'bg-raised border-hair text-muted hover:text-fg'
          }`}
        >
          <AlertTriangle size={12} className={onlyFlagged ? 'text-danger' : 'text-warn'} />
          <span className="text-fg">{warnings.length} integrity warnings</span>
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
        <select
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          className="rounded-[8px] h-7 bg-raised border border-hair text-fg font-mono text-[12px] px-2 transition-colors focus:outline-none focus:border-accent"
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
          className="rounded-[8px] h-7 w-64 bg-raised border border-hair px-2 font-mono text-[12px] text-fg transition-colors focus:outline-none focus:border-accent"
        />

        <label className="flex items-center gap-1.5 cursor-pointer font-mono text-[12px] text-muted hover:text-fg">
          <input
            type="checkbox"
            checked={onlyActuals}
            onChange={(e) => setOnlyActuals(e.target.checked)}
            className="rounded-[8px] accent-accent"
          />
          Only activities with actuals
        </label>

        <div className="ml-auto flex items-center gap-2">
          {exportState.kind === 'done' && (
            <span className="font-mono text-[12px] text-ok">Wrote {exportState.name}</span>
          )}
          {exportState.kind === 'error' && (
            <span className="font-mono text-[12px] text-danger">{exportState.detail}</span>
          )}
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'pmxml' | 'xer')}
            className="rounded-[8px] h-7 bg-raised border border-hair text-fg font-mono text-[12px] px-2 transition-colors focus:outline-none focus:border-accent"
            aria-label="Export format"
          >
            <option value="pmxml">PMXML</option>
            <option value="xer">XER</option>
          </select>
          <button
            onClick={handleExport}
            disabled={exportState.kind === 'busy'}
            className="rounded-[8px] h-7 flex items-center gap-1.5 bg-raised border border-accent text-accent px-3 font-mono text-[12px] uppercase hover:bg-selected disabled:opacity-50 transition-colors"
          >
            <Download size={12} />
            {exportState.kind === 'busy' ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-raised">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-hair">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    style={{ width: h.getSize() }}
                    className="text-left text-[12px] font-medium uppercase tracking-[0.05em] text-heading px-3 py-3 whitespace-nowrap"
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
                      <div className="h-3 bg-selected rounded-[4px] animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}

            {!isLoading &&
              table.getRowModel().rows.map((row) => {
                const a = row.original;
                // A row with an actual date is a fact; a planned-only row is a
                // forecast. Dimming the whole planned row is what separates
                // them at a glance, before any single cell is read.
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
                    } ${hasActual ? 'text-fg' : 'text-muted opacity-55'}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className="px-3 py-3 text-[14px] whitespace-nowrap max-w-0"
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
          <div className="py-16 text-center font-mono text-[12px] uppercase tracking-wider text-muted">
            No activities match the filter
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="shrink-0 h-7 border-t border-hair px-4 flex items-center gap-4 font-mono text-[11px] uppercase tracking-wider text-muted">
        <span>
          {rows.length} of {data?.total_activities ?? 0} activities
        </span>
        <span>{data?.activities_with_actuals ?? 0} with actuals</span>
        <span>{data?.activities_completed ?? 0} completed</span>
        {data?.average_start_variance !== null && data?.average_start_variance !== undefined && (
          <span>avg start var {data.average_start_variance}d</span>
        )}
        {data?.average_finish_variance !== null && data?.average_finish_variance !== undefined && (
          <span>avg finish var {data.average_finish_variance}d</span>
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
