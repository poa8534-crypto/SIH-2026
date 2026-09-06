import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { CalendarRange, Download, Flame, LayoutList, ListFilter, Lock, Sparkles, X } from 'lucide-react';
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
import { ScheduleDoctor } from '../components/ScheduleDoctor';
import { ActivityInspectionPanel } from '../components/ActivityInspectionPanel';
import { usePageHeader } from '../hooks/usePageHeader';
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui';

/**
 * QUESTION:  What does the schedule actually say now, and where did each
 *            actual date come from?
 * ACTION:    Open an activity's audit trail.
 *
 * The table is the answer to the first half; the drawer is the answer to the
 * second. Nothing on this screen writes — the trail is append-only (D-004) and
 * planned dates are the read-only baseline. See D-031.
 */

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

// ── Page ────────────────────────────────────────────────────────────────────

export default function Schedule() {
  usePageHeader('Schedule', 'The 120-activity baseline with every confirmed actual date.', '/schedule');
  const [discipline, setDiscipline] = useState<string>('');
  const [search, setSearch] = useState('');
  const [onlyActuals, setOnlyActuals] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'gantt' | 'doctor'>('table');
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
        <div className="flex items-center rounded-md border border-hair overflow-hidden mr-1 bg-surface/50">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1 text-label font-medium flex items-center gap-1.5 transition-colors ${
              viewMode === 'table'
                ? 'bg-raised text-heading font-semibold shadow-xs'
                : 'text-muted hover:text-heading'
            }`}
            title="Grid Table View"
          >
            <LayoutList size={13} />
            <span>Table</span>
          </button>
          <button
            onClick={() => setViewMode('gantt')}
            className={`px-3 py-1 text-label font-medium border-l border-hair flex items-center gap-1.5 transition-colors ${
              viewMode === 'gantt'
                ? 'bg-raised text-heading font-semibold shadow-xs'
                : 'text-muted hover:text-heading'
            }`}
            title="Interactive Dual-Bar CPM Gantt Chart"
          >
            <CalendarRange size={13} />
            <span>Gantt Chart</span>
          </button>
          <button
            onClick={() => setViewMode('doctor')}
            className={`px-3 py-1 text-label font-medium border-l border-hair flex items-center gap-1.5 transition-colors ${
              viewMode === 'doctor'
                ? 'bg-raised text-heading font-semibold shadow-xs'
                : 'text-muted hover:text-heading'
            }`}
            title="AI Schedule Feasibility & Knowledge Auditor"
          >
            <Sparkles size={13} className="text-warn" />
            <span>Schedule Doctor</span>
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
          <div className="group relative">
            <Button
              variant="secondary"
              size="xs"
              onClick={handleExport}
              disabled={exportState.kind === 'busy'}
            >
              <Download size={12} />
              {exportState.kind === 'busy' ? 'Exporting…' : 'Export'}
            </Button>
            <div className="hidden group-hover:block absolute right-0 top-full mt-1.5 w-72 p-2.5 bg-raised border border-hair rounded-lg shadow-lg text-label text-muted font-mono z-30 pointer-events-none">
              <span className="text-fg font-semibold block mb-1">P6 Export Policy:</span>
              Only confirmed actuals and planner-approved adjustments are written into the XER/PMXML payload. Uncommitted field proposals remain quarantined in NAVIS.
            </div>
          </div>
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
      ) : viewMode === 'gantt' ? (
        <div className="flex-1 min-h-0">
          <GanttChart
            activities={rows}
            selectedId={selectedId}
            onSelectActivity={(id) => setSelectedId(id)}
            dataDate={data?.data_date}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <ScheduleDoctor />
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

      {/* ACTIVITY INSPECTION PANEL & MULTI-SOURCE EVIDENCE DOSSIER */}
      {selected && (
        <ActivityInspectionPanel
          activity={selected}
          activitiesList={rows}
          onSelectActivity={(id) => setSelectedId(id)}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
