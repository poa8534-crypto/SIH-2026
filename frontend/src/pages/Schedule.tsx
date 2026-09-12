import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  CalendarRange,
  Download,
  Flame,
  LayoutList,
  ListFilter,
  Lock,
  Sparkles,
  X,
  Target,
  BarChart3,
  TrendingDown,
  Link2,
  SlidersHorizontal,
  ChevronDown,
  ShieldCheck,
  Filter,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { api, errorDetail, getBaseUrl } from '../lib/api';
import {
  AuditRecord,
  DateBasis,
  Discipline,
  IntegrityWarning,
  ScheduleActivity,
} from '../types';
import { DISCIPLINES, PROJECT } from '../config';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { DisciplineTag } from '../components/DisciplineTag';
import { GanttChart } from '../components/GanttChart';
import { ScheduleDoctor } from '../components/ScheduleDoctor';
import { ActivityInspectionPanel } from '../components/ActivityInspectionPanel';
import { subscribeToScheduleUpdates } from '../lib/liveSync';
import { usePageHeader } from '../hooks/usePageHeader';
import { Button, EmptyState, ErrorState, MetricCard, PageIntro, Skeleton } from '../components/ui';

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
 * An actual date, marked by how it was obtained.
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
 * negative is early and reads --accent. Zero is on-plan and stays neutral.
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

function getTimelinePos(startDate: string | null | undefined, finishDate: string | null | undefined, dataDate: string) {
  const center = new Date(`${dataDate}T00:00:00`).getTime();
  const baseStart = center - 31 * 86400000;
  const baseEnd = center + 46 * 86400000;
  const totalDuration = baseEnd - baseStart;

  if (!startDate && !finishDate) return null;
  const s = startDate ? Math.max(baseStart, new Date(startDate).getTime()) : baseStart;
  const f = finishDate ? Math.min(baseEnd, new Date(finishDate).getTime()) : s + 86400000 * 10;

  const left = Math.max(0, Math.min(95, ((s - baseStart) / totalDuration) * 100));
  const width = Math.max(4, Math.min(100 - left, ((f - s) / totalDuration) * 100));
  return { left, width };
}

function getRowStatus(a: ScheduleActivity): { label: string; cls: string } {
  if (a.percent_complete === 100 || a.actual_finish) {
    if (a.finish_variance_days && a.finish_variance_days > 0) {
      return {
        label: 'Late',
        cls: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300',
      };
    }
    return {
      label: 'On track',
      cls: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300',
    };
  }
  if (a.actual_start) {
    if (a.finish_variance_days && a.finish_variance_days > 0) {
      return {
        label: 'Behind',
        cls: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300',
      };
    }
    return {
      label: 'In progress',
      cls: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300',
    };
  }
  return {
    label: 'Not started',
    cls: 'bg-surface text-muted border-hair',
  };
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Schedule() {
  usePageHeader('Schedule', 'The active baseline with every confirmed actual date.', '/schedule');
  const [discipline, setDiscipline] = useState<string>('');
  const [search, setSearch] = useState('');
  const [onlyActuals, setOnlyActuals] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const deepLinked = searchParams.get('activity');
  const highlightParam = Boolean(searchParams.get('highlight'));

  const [viewMode, setViewMode] = useState<'table' | 'gantt' | 'doctor'>(() => {
    return viewParam === 'gantt' ? 'gantt' : 'table';
  });
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    planned_start: false,
    actual_start: false,
    total_float: false,
    wbs: false,
    confidence: false,
  });
  // The Ingest screen links auto-linked events here as /schedule?activity=ID.
  const [selectedId, setSelectedId] = useState<string | null>(deepLinked);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(Boolean(deepLinked && viewParam !== 'gantt' && !highlightParam));
  const [liveHighlightId, setLiveHighlightId] = useState<string | null>(() => {
    return highlightParam ? deepLinked : null;
  });

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
    refetchInterval: 3000,
  });

  useEffect(() => {
    const unsubscribe = subscribeToScheduleUpdates(() => {
      refetch();
    });
    return unsubscribe;
  }, [refetch]);

  useEffect(() => {
    if (viewParam === 'gantt' && viewMode !== 'gantt') {
      setViewMode('gantt');
    }
  }, [viewParam]);

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
    if (deepLinked) {
      setSelectedId(deepLinked);
      if (highlightParam) {
        setLiveHighlightId(deepLinked);
        setViewMode('gantt');
        setIsDrawerOpen(false);
        // Clear any filters that could hide the highlighted activity
        setDiscipline('');
        setSearch('');
        setOnlyActuals(false);
        setOnlyFlagged(false);
        setOnlyCritical(false);

        // Immediately scroll workbench into view without any manual page scrolling needed
        const raf = requestAnimationFrame(() => {
          const workbench = document.getElementById('schedule-workbench');
          if (workbench) {
            workbench.scrollIntoView({ block: 'start', behavior: 'auto' });
          }
        });
        return () => cancelAnimationFrame(raf);
      } else if (viewParam !== 'gantt') {
        setIsDrawerOpen(true);
      }
    }
  }, [deepLinked, viewParam, highlightParam]);

  // Bring a deep-linked row into view in table mode without scrolling outer page unnecessarily
  useEffect(() => {
    if (!selectedId || viewMode !== 'table') return;
    const raf = requestAnimationFrame(() => {
      rowRefs.current[selectedId]?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedId, viewMode]);

  const handleSelectActivity = (id: string) => {
    setSelectedId(id);
    setIsDrawerOpen(true);
    // Dismiss the live highlight immediately when user selects any activity
    setLiveHighlightId(null);
    if (searchParams.has('highlight') || searchParams.get('activity') !== id) {
      const next = new URLSearchParams(searchParams);
      next.delete('highlight');
      next.set('activity', id);
      setSearchParams(next, { replace: true });
    }
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedId(null);
    setLiveHighlightId(null);
    if (searchParams.has('activity') || searchParams.has('highlight')) {
      const next = new URLSearchParams(searchParams);
      next.delete('activity');
      next.delete('highlight');
      setSearchParams(next, { replace: true });
    }
  };

  const handleViewInGantt = (activityId: string) => {
    setViewMode('gantt');
    setSelectedId(activityId);
    setLiveHighlightId(null);
    setIsDrawerOpen(false);
  };

  const timelineDataDate = data?.data_date ?? PROJECT.dataDate;
  const timelineMonth = (offsetDays: number) => {
    const date = new Date(`${timelineDataDate}T00:00:00`);
    date.setDate(date.getDate() + offsetDays);
    return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  };

  const columns = useMemo(() => {
    const defs: ColumnDef<ScheduleActivity>[] = [
      {
        accessorKey: 'activity_id',
        header: 'Activity ID',
        size: 130,
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
        size: 260,
        cell: (c) => <span className="block truncate font-medium text-heading" title={c.getValue<string>()}>{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'discipline',
        header: 'Disc',
        size: 56,
        cell: (c) => <DisciplineTag discipline={c.getValue<Discipline>()} />,
      },
    ];

    if (visibleColumns.planned_start) {
      defs.push({
        accessorKey: 'planned_start',
        header: 'Planned Start',
        size: 96,
        cell: (c) => <span className="font-mono tabular-nums text-muted">{c.getValue<string>() ?? '—'}</span>,
      });
    }

    defs.push({
      accessorKey: 'planned_finish',
      header: 'Planned Finish',
      size: 96,
      cell: (c) => <span className="font-mono tabular-nums text-muted">{c.getValue<string>() ?? '—'}</span>,
    });

    if (visibleColumns.actual_start) {
      defs.push({
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
      });
    }

    defs.push(
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
        accessorKey: 'finish_variance_days',
        header: 'Variance',
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
          return <span className="font-mono tabular-nums text-fg">{v.toFixed(0)}%</span>;
        },
      },
      {
        id: 'status',
        header: 'Status',
        size: 90,
        cell: ({ row }) => {
          const st = getRowStatus(row.original);
          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${st.cls}`}
            >
              {st.label}
            </span>
          );
        },
      }
    );

    if (visibleColumns.total_float) {
      defs.push({
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
      });
    }

    if (visibleColumns.wbs) {
      defs.push({
        accessorKey: 'wbs_path',
        header: 'WBS',
        size: 70,
        cell: (c) => (
          <span className="font-mono text-[11px] text-muted">{c.getValue<string>() ?? '—'}</span>
        ),
      });
    }

    if (visibleColumns.confidence) {
      defs.push({
        id: 'confidence',
        header: 'Evidence',
        size: 80,
        cell: ({ row }) => {
          const a = row.original;
          const hasActual = Boolean(a.actual_start || a.actual_finish);
          if (!hasActual || a.link_confidence === null) return <Absent />;
          return (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400"
              title={`Confidence: ${(a.link_confidence * 100).toFixed(0)}%`}
            >
              <CheckCircle2 size={11} className="shrink-0" />
              <span>Verified (3)</span>
            </span>
          );
        },
      });
    }

    // Mini-Gantt Timeline column
    defs.push({
      id: 'timeline',
      header: () => (
        <div className="w-[340px] min-w-[340px] select-none">
          <div className="grid grid-cols-3 border-b border-hair/50 pb-0.5 text-[10px] text-muted font-mono font-medium">
            <span className="text-center">{timelineMonth(-31)}</span>
            <span className="text-center text-accent font-semibold">{timelineMonth(0)} (DD)</span>
            <span className="text-center">{timelineMonth(46)}</span>
          </div>
          <div className="grid grid-cols-3 text-[9px] font-mono text-muted/70 pt-0.5 px-1">
            <span>{timelineMonth(-31)}</span>
            <span className="text-center text-danger font-bold">{timelineDataDate}</span>
            <span className="text-right">{timelineMonth(46)}</span>
          </div>
        </div>
      ),
      size: 340,
      cell: ({ row }) => {
        const a = row.original;
        const planPos = getTimelinePos(a.planned_start, a.planned_finish, timelineDataDate);
        const actPos = getTimelinePos(
          a.actual_start,
          a.actual_finish || (a.actual_start ? timelineDataDate : null),
          timelineDataDate
        );
        const isLate = (a.finish_variance_days ?? 0) > 0;
        const isCrit = a.critical;

        return (
          <div className="relative w-[340px] h-6 flex items-center">
            {/* Data Date dashed guideline */}
            <div
              className="absolute top-0 bottom-0 w-px border-r border-dashed border-danger/60 z-10 pointer-events-none"
              style={{ left: '40%' }}
              title={`Data Date: ${timelineDataDate}`}
            />

            {/* Baseline / Planned Bar */}
            {planPos && (
              <div
                className="absolute h-2 rounded-xs bg-muted/30 border border-muted/50 transition-all"
                style={{ left: `${planPos.left}%`, width: `${planPos.width}%` }}
                title={`Planned: ${a.planned_start ?? '?'} to ${a.planned_finish ?? '?'}`}
              />
            )}

            {/* Actual Progress Bar */}
            {actPos && (
              <div
                className={`absolute h-2.5 rounded-xs transition-all ${
                  isCrit
                    ? 'bg-danger/90 border border-danger'
                    : isLate
                    ? 'bg-amber-500/90'
                    : 'bg-accent/90'
                }`}
                style={{
                  left: `${actPos.left}%`,
                  width: `${actPos.width}%`,
                  top: '7px',
                }}
                title={`Actual: ${a.actual_start ?? '?'} to ${
                  a.actual_finish ?? 'In progress'
                } (${a.percent_complete}%)`}
              />
            )}
          </div>
        );
      },
    });

    return defs;
  }, [visibleColumns, timelineDataDate]);

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

  const scheduleActivities = data?.activities ?? [];
  const activityCount = scheduleActivities.length;
  const plannedDueCount = data?.data_date
    ? scheduleActivities.filter(
        (activity) => activity.planned_finish && activity.planned_finish <= data.data_date
      ).length
    : 0;
  const completedCount = scheduleActivities.filter((activity) => activity.actual_finish).length;
  const plannedProgress = activityCount > 0
    ? Math.round((plannedDueCount / activityCount) * 100)
    : 0;
  const actualProgress = activityCount > 0
    ? Math.round((completedCount / activityCount) * 100)
    : 0;
  const progressVariance = actualProgress - plannedProgress;

  return (
    <div className="flex flex-col gap-5 w-full pb-8">
      <PageIntro
        eyebrow="Schedule control"
        title="Live project schedule"
        description="See the current baseline, verified field progress, and the activities that need intervention."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Planned progress" value={`${plannedProgress}%`} detail={`${plannedDueCount} of ${activityCount} activities due`} icon={<Target size={17} />} />
        <MetricCard label="Verified progress" value={`${actualProgress}%`} detail={`${completedCount} of ${activityCount} activities complete`} tone="accent" icon={<BarChart3 size={17} />} />
        <MetricCard label="Progress variance" value={`${progressVariance > 0 ? '+' : ''}${progressVariance}%`} detail="Activity-count basis" tone={progressVariance < 0 ? 'danger' : 'ok'} icon={<TrendingDown size={17} />} />
        <MetricCard label="Critical activities" value={data?.critical_activities ?? 0} detail={`${warningBreakdown.conflict} source conflicts`} tone="danger" icon={<Flame size={17} />} />
      </div>

      {/* ── MAIN WORKBENCH: SCHEDULE TABLE / GANTT / DOCTOR ────────────────── */}
      <div id="schedule-workbench" className="flex flex-col w-full bg-raised rounded-xl relative overflow-hidden min-h-[580px] ring-1 ring-hair shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
        {/* INTEGRITY BANNER */}
        {warnings.length > 0 && (
          <button
            onClick={() => setOnlyFlagged((v) => !v)}
            className={`shrink-0 min-h-[32px] py-1.5 px-3 sm:px-4 flex items-center gap-2 border-b text-left font-mono text-label transition-colors flex-wrap sm:flex-nowrap ${
              onlyFlagged
                ? 'bg-danger-bg border-danger-line text-danger'
                : 'bg-raised border-hair text-muted hover:text-fg'
            }`}
          >
            <div className="flex items-center gap-1.5 shrink-0">
              <ListFilter size={12} className={onlyFlagged ? 'text-danger' : 'text-warn'} />
              <span className="text-fg font-semibold">{warnings.length} items flagged for review</span>
            </div>
            <span className="text-muted text-[11px] sm:text-xs">
              — {warningBreakdown.conflict} source conflict
              {warningBreakdown.conflict === 1 ? '' : 's'}, {warningBreakdown.warning} date
              warning{warningBreakdown.warning === 1 ? '' : 's'}
            </span>
            <span className="ml-auto uppercase tracking-wider text-[10px] sm:text-xs shrink-0 font-semibold">
              {onlyFlagged
                ? `Showing ${flaggedIds.size} affected — click to clear`
                : 'Click to filter'}
            </span>
          </button>
        )}

        {/* FILTER BAR */}
        <div className="shrink-0 min-h-[44px] py-2 px-3 sm:px-4 border-b border-hair flex items-center gap-2.5 sm:gap-3 flex-wrap bg-raised">
          {/* View Mode Switcher */}
          <div className="flex items-center rounded-lg overflow-x-auto max-w-full mr-1 bg-secondary p-1 shrink-0">
            <button
              onClick={() => setViewMode('table')}
              aria-label="Table"
              className={`px-2.5 sm:px-3 py-1 text-label font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                viewMode === 'table'
                  ? 'bg-raised text-accent font-semibold shadow-xs'
                  : 'text-muted hover:text-heading'
              }`}
              title="Activity Register Grid"
            >
              <LayoutList size={13} />
              <span>Activity Register</span>
            </button>
            <button
              onClick={() => setViewMode('gantt')}
              className={`px-2.5 sm:px-3 py-1 text-label font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                viewMode === 'gantt'
                  ? 'bg-raised text-accent font-semibold shadow-xs'
                  : 'text-muted hover:text-heading'
              }`}
              title="Interactive Dual-Bar CPM Gantt Chart"
            >
              <CalendarRange size={13} />
              <span>Gantt Chart</span>
            </button>
            <button
              onClick={() => setViewMode('doctor')}
              className={`px-2.5 sm:px-3 py-1 text-label font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                viewMode === 'doctor'
                  ? 'bg-raised text-accent font-semibold shadow-xs'
                  : 'text-muted hover:text-heading'
              }`}
              title="AI Schedule Feasibility & Knowledge Auditor"
            >
              <Sparkles size={13} className="text-warn" />
              <span>Schedule Doctor</span>
            </button>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-ok/10 text-ok rounded-full text-label font-semibold shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
            Live
          </div>

          <select
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
            className="rounded-lg h-9 bg-raised border border-hair text-fg text-label px-2 transition-colors shrink-0"
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
            className="rounded-lg h-9 w-full xs:w-44 sm:w-56 flex-1 sm:flex-none bg-raised border border-hair px-3 text-label text-fg transition-colors min-w-[160px]"
          />

          <label className="flex items-center gap-2 cursor-pointer font-mono text-label text-muted hover:text-fg shrink-0">
            <input
              type="checkbox"
              checked={onlyActuals}
              onChange={(e) => setOnlyActuals(e.target.checked)}
              className="rounded-sm accent-accent"
            />
            Actuals only
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer font-mono text-label text-muted hover:text-fg shrink-0">
            <input
              type="checkbox"
              aria-label="Critical Path"
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

          {/* Inspect in Gantt Helper */}
          {viewMode === 'gantt' && selectedId && !isDrawerOpen && (
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="rounded-sm h-7 bg-accent/15 border border-accent/40 text-accent font-mono text-label px-2.5 flex items-center gap-1.5 hover:bg-accent/25 transition-colors cursor-pointer shrink-0"
              type="button"
              title={`Inspect activity ${selectedId}`}
            >
              <Eye size={12} />
              <span>Inspect {selectedId}</span>
            </button>
          )}

          {/* Columns Dropdown Toggle */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowColumnPicker((v) => !v)}
              className="rounded-sm h-7 bg-raised border border-hair text-fg font-mono text-label px-2.5 flex items-center gap-1.5 hover:bg-surface transition-colors"
              type="button"
              title="Toggle visible columns"
            >
              <SlidersHorizontal size={12} className="text-muted" />
              <span>Columns</span>
              <ChevronDown size={11} className="text-muted" />
            </button>
            {showColumnPicker && (
              <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1 w-48 bg-raised border border-hair rounded-lg shadow-xl p-2.5 z-40 text-label font-mono flex flex-col gap-1.5">
                <span className="text-[10px] text-muted uppercase tracking-wider font-semibold border-b border-hair pb-1">
                  Optional Columns
                </span>
                <label className="flex items-center gap-2 cursor-pointer text-fg hover:text-accent">
                  <input
                    type="checkbox"
                    checked={visibleColumns.planned_start}
                    onChange={(e) => setVisibleColumns((c) => ({ ...c, planned_start: e.target.checked }))}
                    className="rounded-sm accent-accent"
                  />
                  <span>Planned Start</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-fg hover:text-accent">
                  <input
                    type="checkbox"
                    checked={visibleColumns.actual_start}
                    onChange={(e) => setVisibleColumns((c) => ({ ...c, actual_start: e.target.checked }))}
                    className="rounded-sm accent-accent"
                  />
                  <span>Actual Start</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-fg hover:text-accent">
                  <input
                    type="checkbox"
                    checked={visibleColumns.total_float}
                    onChange={(e) => setVisibleColumns((c) => ({ ...c, total_float: e.target.checked }))}
                    className="rounded-sm accent-accent"
                  />
                  <span>Total Float</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-fg hover:text-accent">
                  <input
                    type="checkbox"
                    checked={visibleColumns.wbs}
                    onChange={(e) => setVisibleColumns((c) => ({ ...c, wbs: e.target.checked }))}
                    className="rounded-sm accent-accent"
                  />
                  <span>WBS Code</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-fg hover:text-accent">
                  <input
                    type="checkbox"
                    checked={visibleColumns.confidence}
                    onChange={(e) => setVisibleColumns((c) => ({ ...c, confidence: e.target.checked }))}
                    className="rounded-sm accent-accent"
                  />
                  <span>Evidence &amp; Conf</span>
                </label>
              </div>
            )}
          </div>

          <div className="flex sm:ml-auto items-center gap-2 shrink-0">
            {exportState.kind === 'done' && (
              <a
                href={exportState.url}
                download={exportState.name}
                className="font-mono text-label text-ok max-w-[180px] sm:max-w-[320px] truncate hover:underline"
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

        {/* MAIN VIEW: TABLE OR GANTT CHART OR DOCTOR */}
        {viewMode === 'table' ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-max min-w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-raised">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-hair">
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        style={{ width: h.getSize() }}
                        className="text-left text-label font-medium uppercase tracking-[0.05em] text-heading px-3 py-2.5 whitespace-nowrap"
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
                        <td key={j} className="px-3 py-2.5">
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
                        onClick={() => handleSelectActivity(a.activity_id)}
                        className={`border-b border-hair cursor-pointer transition-colors ${
                          a.activity_id === liveHighlightId
                            ? 'bg-emerald-500/20 dark:bg-emerald-500/30 border-l-4 border-l-emerald-400 shadow-[inset_0_0_15px_rgba(16,185,129,0.3)] animate-pulse'
                            : isSelected
                            ? 'bg-selected'
                            : 'even:bg-surface hover:bg-selected'
                        } ${hasActual ? 'text-fg' : 'text-muted'}`}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            style={{ width: cell.column.getSize() }}
                            className="px-3 py-2.5 text-body whitespace-nowrap max-w-0"
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
          // A definite height, not flex-1. The workbench is a flex column of
          // auto height, so `flex-1` resolved to the Gantt's own content height
          // (5809px for 120 activities) — its overflow-auto never engaged, its
          // sticky header never stuck, and `scrollTop` was a silent no-op, which
          // is why the auto-scroll could not land on a highlighted row.
          <div className="h-[calc(100vh-240px)] min-h-[420px]">
            <GanttChart
              activities={rows}
              selectedId={selectedId}
              highlightId={liveHighlightId}
              highlightKey={searchParams.get('highlight') || liveHighlightId}
              onSelectActivity={handleSelectActivity}
              dataDate={data?.data_date}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <ScheduleDoctor />
          </div>
        )}

        {/* FOOTER */}
        <div className="shrink-0 py-2 border-t border-hair px-4 flex items-center justify-between flex-wrap gap-3 font-mono text-label uppercase tracking-wider text-muted bg-raised">
          <div className="flex items-center gap-4 flex-wrap">
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
                baseline {data.baseline.name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Lock size={9} />
              Planned dates read-only
            </span>
          </div>

          {/* Timeline Legend */}
          {viewMode === 'table' && (
            <div className="flex items-center gap-3 text-[10px] lowercase text-muted ml-auto">
              <span className="flex items-center gap-1">
                <span className="w-3 h-1.5 rounded-xs bg-muted/40 border border-muted/60" />
                <span>baseline plan</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-1.5 rounded-xs bg-accent" />
                <span>actual</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-1.5 rounded-xs bg-danger" />
                <span>critical</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 border-t border-dashed border-danger" />
                <span>data date (15 sep)</span>
              </span>
            </div>
          )}
        </div>

        {/* ACTIVITY INSPECTION PANEL & MULTI-SOURCE EVIDENCE DOSSIER */}
        {selected && isDrawerOpen && (
          <ActivityInspectionPanel
            activity={selected}
            activitiesList={rows}
            onSelectActivity={handleSelectActivity}
            onClose={closeDrawer}
            onViewInGantt={handleViewInGantt}
          />
        )}
      </div>

    </div>
  );
}
