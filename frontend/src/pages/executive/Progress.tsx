import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart as LineChartIcon,
  TrendingUp,
  Filter,
  Layers,
  ChevronRight,
  ChevronDown,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Info,
  Layers as WbsIcon,
  Activity as ActivityIcon,
} from 'lucide-react';
import { api } from '../../lib/api';
import { usePageHeader } from '../../hooks/usePageHeader';
import { SkeletonRows, ErrorState, EmptyState } from '../../components/ui';
import { DisciplineTag } from '../../components/DisciplineTag';
import type { Discipline, ExecutiveMetricsResponse, EvmResponse, Activity } from '../../types';

export default function ExecutiveProgress() {
  usePageHeader(
    'Progress & Earned Value Oversight',
    'Discipline and WBS progress trajectories, physical vs duration-weighted metrics, and record drill-down.',
    '/executive/progress'
  );

  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(null);
  const [wbsFilter, setWbsFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Queries
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useQuery<ExecutiveMetricsResponse>({
    queryKey: ['executiveMetrics'],
    queryFn: api.getExecutiveMetrics,
  });

  const { data: evmData, isLoading: evmLoading, error: evmError } = useQuery<EvmResponse>({
    queryKey: ['evm'],
    queryFn: api.getEvm,
  });

  const { data: scheduleData, isLoading: scheduleLoading, error: scheduleError } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.getSchedule(),
  });

  const sCurve = metrics?.s_curve ?? [];
  const activities = scheduleData?.activities ?? [];
  const dataDate = scheduleData?.data_date ?? evmData?.data_date ?? '2026-09-15';

  // Discipline Progress Aggregation
  const disciplineAggregates = useMemo(() => {
    const map: Record<
      string,
      {
        discipline: Discipline | string;
        total: number;
        completed: number;
        inProgress: number;
        notStarted: number;
        plannedValueDays: number;
        earnedValueDays: number;
        spi: number | null;
        totalInstalledQty: number;
        totalPlannedQty: number;
        uom: string;
        evidenceCount: number;
        activities: Activity[];
      }
    > = {};

    const DISCIPLINES: Discipline[] = ['civil', 'piping', 'static_equipment', 'electrical', 'instrumentation', 'hse'];

    DISCIPLINES.forEach((d) => {
      map[d] = {
        discipline: d,
        total: 0,
        completed: 0,
        inProgress: 0,
        notStarted: 0,
        plannedValueDays: 0,
        earnedValueDays: 0,
        spi: null,
        totalInstalledQty: 0,
        totalPlannedQty: 0,
        uom: '',
        evidenceCount: 0,
        activities: [],
      };
    });

    activities.forEach((act) => {
      const disc = (act.discipline?.toLowerCase() || 'general') as Discipline;
      if (!map[disc]) {
        map[disc] = {
          discipline: disc,
          total: 0,
          completed: 0,
          inProgress: 0,
          notStarted: 0,
          plannedValueDays: 0,
          earnedValueDays: 0,
          spi: null,
          totalInstalledQty: 0,
          totalPlannedQty: 0,
          uom: act.uom || '',
          evidenceCount: 0,
          activities: [],
        };
      }

      const item = map[disc];
      item.total += 1;
      item.activities.push(act);
      if (act.uom && !item.uom) item.uom = act.uom;

      const plannedDuration = act.planned_start && act.planned_finish
        ? Math.max(1, Math.round((new Date(act.planned_finish).getTime() - new Date(act.planned_start).getTime()) / 86400000))
        : 1;

      if (act.actual_finish) {
        item.completed += 1;
        item.earnedValueDays += plannedDuration;
      } else if (act.actual_start) {
        item.inProgress += 1;
      } else {
        item.notStarted += 1;
      }

      item.plannedValueDays += plannedDuration;
      item.totalPlannedQty += act.planned_qty || 0;
      item.totalInstalledQty += act.actual_qty || 0;
      if (act.actual_start || act.actual_finish) {
        item.evidenceCount += 1;
      }
    });

    // Populate SPI from evm by_discipline if available, or compute duration ratio
    Object.values(map).forEach((item) => {
      const evmDisc = evmData?.by_discipline?.[item.discipline];
      if (evmDisc && evmDisc.spi !== null) {
        item.spi = evmDisc.spi;
        item.plannedValueDays = evmDisc.planned_value;
        item.earnedValueDays = evmDisc.earned_value;
      } else if (item.plannedValueDays > 0) {
        item.spi = item.earnedValueDays / item.plannedValueDays;
      }
    });

    return Object.values(map).filter((item) => item.total > 0);
  }, [activities, evmData]);

  // S-Curve SVG coordinates calculation
  const svgWidth = 800;
  const svgHeight = 240;
  const padding = { top: 20, right: 30, bottom: 40, left: 45 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const pointsCount = sCurve.length || 1;
  const getX = (idx: number) => padding.left + (idx / Math.max(1, pointsCount - 1)) * graphWidth;
  const getY = (val: number) => padding.top + graphHeight - (Math.min(100, Math.max(0, val)) / 100.0) * graphHeight;

  const pvPath = sCurve.reduce((acc, pt, i) => {
    const x = getX(i);
    const y = getY(pt.pv_cumulative);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const pastPoints = sCurve.filter((p) => !p.is_future && p.ev_cumulative !== null);
  const evPath = pastPoints.reduce((acc, pt, i) => {
    const x = getX(i);
    const y = getY(pt.ev_cumulative ?? 0);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const projPoints = sCurve.filter((p) => p.ev_projected !== null);
  const projPath = projPoints.reduce((acc, pt, i) => {
    const idx = sCurve.indexOf(pt);
    const x = getX(idx);
    const y = getY(pt.ev_projected ?? 0);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const dataDateIndex = sCurve.findIndex((p) => p.is_future);
  const dataDateX = dataDateIndex >= 0 ? getX(dataDateIndex) : getX(Math.floor(pointsCount / 2));

  // Selected discipline details
  const activeDisciplineObj = useMemo(() => {
    if (!selectedDiscipline) return null;
    return disciplineAggregates.find((d) => d.discipline === selectedDiscipline) ?? null;
  }, [selectedDiscipline, disciplineAggregates]);

  const filteredContributingActivities = useMemo(() => {
    if (!activeDisciplineObj) return [];
    return activeDisciplineObj.activities.filter((act) => {
      if (wbsFilter !== 'all' && act.wbs_path !== wbsFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          act.activity_id.toLowerCase().includes(q) ||
          act.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeDisciplineObj, wbsFilter, searchQuery]);

  const uniqueWbsCodes = useMemo(() => {
    if (!activeDisciplineObj) return [];
    return Array.from(new Set(activeDisciplineObj.activities.map((a) => a.wbs_path).filter(Boolean))) as string[];
  }, [activeDisciplineObj]);

  if (metricsError || evmError || scheduleError) {
    return <ErrorState error={metricsError || evmError || scheduleError} />;
  }

  return (
    <div className="w-full max-w-[1280px] mx-auto flex flex-col gap-6 font-sans">
      {/* ── Context Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-hair">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted mb-1">
            <span className="font-semibold text-fg">
              {scheduleData?.project ?? 'Oil India Limited — Well Pad 04'}
            </span>
            <span>·</span>
            <span>SCHEDULE DATA DATE: {dataDate}</span>
          </div>
          <h1 className="text-h1 font-semibold tracking-tight text-heading">
            Progress &amp; Earned Value Oversight
          </h1>
          <p className="mt-1 text-body text-muted leading-relaxed">
            Where is execution ahead or behind? Physical quantities, duration-weighted earned value, discipline performance, and evidenced actuals.
          </p>
        </div>

        <div className="flex items-center gap-2 text-label font-mono">
          <span className="px-2.5 py-1 rounded-full bg-surface text-fg font-medium border border-hair">
            Weighting: Duration-Weighted (0/100 Rule)
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface text-ok font-medium border border-hair">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Read-Only
          </span>
        </div>
      </div>

      {/* ── Headline Invariant Alert ── */}
      <div className="p-4 rounded-lg border border-hair bg-raised text-body flex items-start gap-3">
        <Info size={18} className="text-fg shrink-0 mt-0.5" />
        <div className="text-xs text-muted leading-relaxed">
          <strong className="font-semibold text-fg">Measurement Standard &amp; Honesty Notice:</strong> Activity-count completion is never equated to physical percent complete or financial earned value. Earned Value (EV) reflects planned duration accrued upon verified activity completion (0/100 rule). Unadjudicated field updates remain categorized as reported progress until formally approved into committed actuals by the Project Manager.
        </div>
      </div>

      {/* ── Earned Value S-Curve Trajectory ── */}
      <div className="border border-hair rounded-lg p-6 bg-raised shadow-xs flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-hair">
          <div>
            <h2 className="text-lead font-semibold text-heading flex items-center gap-2">
              <TrendingUp size={18} className="text-fg" />
              Cumulative EVM S-Curve (Planned vs Earned Value)
            </h2>
            <p className="text-body text-muted mt-0.5">
              Planned Value (PV) vs Earned Value (EV) across chronological schedule weeks, with forward projection at current SPI.
            </p>
          </div>

          {/* S-Curve Legend */}
          <div className="flex flex-wrap items-center gap-4 text-label font-mono">
            <div className="flex items-center gap-1.5">
              <div className="h-1 w-5 bg-muted rounded-full" />
              <span className="text-muted font-medium">Planned Value (PV)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-5 bg-ok rounded-full" />
              <span className="text-fg font-medium">Earned Value (EV)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-1 w-5 border-t border-dashed border-warn" />
              <span className="text-muted font-medium">Projected EV</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-0.5 bg-danger" />
              <span className="text-danger font-medium">Data Date ({dataDate})</span>
            </div>
          </div>
        </div>

        {/* S-Curve SVG */}
        {metricsLoading ? (
          <SkeletonRows rows={4} />
        ) : sCurve.length > 0 ? (
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto min-w-[650px] overflow-visible select-none"
            >
              {[0, 25, 50, 75, 100].map((level) => {
                const y = getY(level);
                return (
                  <g key={level}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke="currentColor"
                      className="text-hair"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="font-mono text-[10px] fill-muted"
                    >
                      {level}%
                    </text>
                  </g>
                );
              })}

              {/* Vertical Data Date */}
              <line
                x1={dataDateX}
                y1={padding.top}
                x2={dataDateX}
                y2={svgHeight - padding.bottom}
                stroke="#DC2626"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <text
                x={dataDateX}
                y={padding.top - 6}
                textAnchor="middle"
                className="font-mono text-[9px] font-bold fill-danger uppercase"
              >
                DATA DATE ({dataDate})
              </text>

              {/* X Axis Labels */}
              {sCurve.filter((_, idx) => idx % 2 === 0).map((pt) => {
                const idx = sCurve.indexOf(pt);
                const x = getX(idx);
                return (
                  <text
                    key={pt.week_label}
                    x={x}
                    y={svgHeight - padding.bottom + 18}
                    textAnchor="middle"
                    className="font-mono text-[9px] fill-muted uppercase"
                  >
                    {pt.week_label}
                  </text>
                );
              })}

              {/* Projected Line */}
              <path d={projPath} fill="none" stroke="#D97706" strokeWidth="2" strokeDasharray="5 5" />
              {/* Planned Line */}
              <path d={pvPath} fill="none" stroke="#737373" strokeWidth="2" />
              {/* Earned Line */}
              <path d={evPath} fill="none" stroke="#10A37F" strokeWidth="3" strokeLinecap="round" />

              {/* Points on EV */}
              {pastPoints.map((pt, i) => (
                <circle
                  key={pt.week_label}
                  cx={getX(i)}
                  cy={getY(pt.ev_cumulative ?? 0)}
                  r="3.5"
                  className="fill-raised stroke-ok"
                  strokeWidth="2"
                />
              ))}
            </svg>
          </div>
        ) : (
          <div className="py-8 text-center text-muted font-mono text-sm">
            Cumulative S-Curve data points unavailable for active schedule.
          </div>
        )}
      </div>

      {/* ── Discipline Breakdown Table ── */}
      <div className="border border-hair rounded-lg bg-raised overflow-hidden shadow-xs flex flex-col gap-0">
        <div className="p-4 border-b border-hair flex flex-wrap items-center justify-between gap-3 bg-surface/50">
          <div>
            <h3 className="text-body font-semibold text-heading flex items-center gap-2">
              <Layers size={16} />
              Discipline Performance Comparison &amp; Activity Counts
            </h3>
            <span className="text-label text-muted">
              Select a discipline to drill down into contributing activities and field evidence.
            </span>
          </div>
          <span className="text-xs font-mono text-muted">
            {disciplineAggregates.length} Disciplines Active
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-body">
            <thead>
              <tr className="border-b border-hair bg-surface text-label font-mono text-muted uppercase">
                <th className="py-3 px-4">Discipline</th>
                <th className="py-3 px-3 font-mono text-right">Total Activities</th>
                <th className="py-3 px-3 font-mono text-center">Status Breakdown (C / IP / NS)</th>
                <th className="py-3 px-3 font-mono text-right">EVM Earned / Planned</th>
                <th className="py-3 px-3 font-mono text-right">SPI</th>
                <th className="py-3 px-3 font-mono text-right">Installed vs Planned Qty</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {disciplineAggregates.map((d) => {
                const isSelected = selectedDiscipline === d.discipline;
                const spi = d.spi;
                const spiColor =
                  spi === null
                    ? 'text-muted'
                    : spi >= 0.95
                    ? 'text-ok'
                    : spi >= 0.85
                    ? 'text-warn'
                    : 'text-danger';

                return (
                  <tr
                    key={d.discipline}
                    onClick={() => setSelectedDiscipline(isSelected ? null : d.discipline)}
                    className={`hover:bg-selected/60 transition-colors cursor-pointer ${
                      isSelected ? 'bg-selected/40 border-l-2 border-l-fg' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-semibold text-heading">
                      <div className="flex items-center gap-2">
                        <DisciplineTag discipline={d.discipline as Discipline} />
                        <span className="text-xs text-muted font-mono capitalize">
                          ({d.activities.length} acts)
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono text-right text-fg text-sm">
                      {d.total}
                    </td>

                    <td className="py-3 px-3 text-center">
                      <div className="inline-flex items-center gap-1.5 font-mono text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-ok/10 text-ok font-bold" title="Completed">
                          {d.completed}
                        </span>
                        <span className="text-muted">/</span>
                        <span className="px-1.5 py-0.5 rounded bg-warn/10 text-warn font-bold" title="In Progress">
                          {d.inProgress}
                        </span>
                        <span className="text-muted">/</span>
                        <span className="px-1.5 py-0.5 rounded bg-surface text-muted" title="Not Started">
                          {d.notStarted}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono text-right text-sm">
                      <span className="font-semibold text-fg">{d.earnedValueDays.toFixed(1)}</span>
                      <span className="text-muted"> / {d.plannedValueDays.toFixed(1)}d</span>
                    </td>

                    <td className={`py-3 px-3 font-mono text-right text-sm font-bold ${spiColor}`}>
                      {spi !== null ? spi.toFixed(2) : '—'}
                    </td>

                    <td className="py-3 px-3 font-mono text-right text-xs">
                      {d.totalPlannedQty > 0 ? (
                        <span>
                          {d.totalInstalledQty.toLocaleString()} / {d.totalPlannedQty.toLocaleString()} {d.uom}
                        </span>
                      ) : (
                        <span className="text-muted">Lump-sum duration</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        className="p-1 rounded text-muted hover:text-heading"
                        title="Toggle activity drill-down"
                      >
                        {isSelected ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Aggregate-to-Record Drill-Down Panel ── */}
      {activeDisciplineObj && (
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col gap-4 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-hair">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lead font-semibold text-heading capitalize">
                  {activeDisciplineObj.discipline} Contributing Activities
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface border border-hair text-muted">
                  {filteredContributingActivities.length} Records
                </span>
              </div>
              <p className="text-body text-muted mt-0.5">
                Record-level audit: planned vs actual dates, finish slip, installed quantities, and evidence links.
              </p>
            </div>

            {/* Filter controls inside drilldown */}
            <div className="flex flex-wrap items-center gap-3">
              {uniqueWbsCodes.length > 0 && (
                <div className="flex items-center gap-1.5 text-label font-mono">
                  <WbsIcon size={14} className="text-muted" />
                  <span className="text-muted">WBS:</span>
                  <select
                    value={wbsFilter}
                    onChange={(e) => setWbsFilter(e.target.value)}
                    className="bg-surface text-fg border border-hair rounded px-2 py-1 text-xs focus:outline-none"
                  >
                    <option value="all">All WBS Levels</option>
                    {uniqueWbsCodes.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <input
                type="text"
                placeholder="Search activity ID or name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-surface text-fg border border-hair rounded px-3 py-1 text-xs w-[200px] focus:outline-none focus:border-fg"
              />

              <button
                type="button"
                onClick={() => setSelectedDiscipline(null)}
                className="text-xs font-mono text-muted hover:text-fg px-2 py-1 rounded border border-hair bg-surface"
              >
                Close Drill-Down
              </button>
            </div>
          </div>

          {/* Activities List */}
          <div className="overflow-x-auto border border-hair rounded-md bg-surface">
            <table className="w-full text-left border-collapse text-body">
              <thead>
                <tr className="border-b border-hair bg-raised text-label font-mono text-muted uppercase">
                  <th className="py-2.5 px-3">Activity ID</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-2">WBS</th>
                  <th className="py-2.5 px-2 font-mono">Planned Dates</th>
                  <th className="py-2.5 px-2 font-mono">Actual Dates</th>
                  <th className="py-2.5 px-2 font-mono text-right">Variance</th>
                  <th className="py-2.5 px-2 font-mono text-right">Quantity</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair text-xs">
                {filteredContributingActivities.map((act) => {
                  const isDone = !!act.actual_finish;
                  const isLate = (act.finish_variance_days || 0) > 0;
                  return (
                    <tr key={act.activity_id} className="hover:bg-selected/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-fg">
                        {act.activity_id}
                        {act.critical && (
                          <span className="ml-1.5 px-1 py-0.2 rounded bg-danger/10 text-danger text-[9px]">
                            CRITICAL
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-fg max-w-[280px] truncate">
                        {act.description}
                      </td>

                      <td className="py-2.5 px-2 font-mono text-muted">
                        {act.wbs_path ?? '—'}
                      </td>

                      <td className="py-2.5 px-2 font-mono text-muted">
                        {act.planned_start} → {act.planned_finish}
                      </td>

                      <td className="py-2.5 px-2 font-mono">
                        {act.actual_start || act.actual_finish ? (
                          <span className={isDone ? 'text-ok font-semibold' : 'text-warn'}>
                            {act.actual_start ?? '—'} → {act.actual_finish ?? 'in prog'}
                          </span>
                        ) : (
                          <span className="text-muted">None logged</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 font-mono text-right">
                        {act.finish_variance_days ? (
                          <span
                            className={
                              act.finish_variance_days > 0
                                ? 'text-danger font-bold'
                                : act.finish_variance_days < 0
                                ? 'text-ok font-bold'
                                : 'text-muted'
                            }
                          >
                            {act.finish_variance_days > 0 ? `+${act.finish_variance_days}d` : `${act.finish_variance_days}d`}
                          </span>
                        ) : (
                          <span className="text-muted">0d</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 font-mono text-right">
                        {act.planned_qty ? (
                          <span>
                            {act.actual_qty || 0} / {act.planned_qty} {act.uom}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isDone
                              ? 'bg-ok/10 text-ok border border-ok/30'
                              : act.actual_start
                              ? 'bg-warn/10 text-warn border border-warn/30'
                              : 'bg-raised text-muted border border-hair'
                          }`}
                        >
                          {isDone ? 'COMPLETED' : act.actual_start ? 'IN PROGRESS' : 'NOT STARTED'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
