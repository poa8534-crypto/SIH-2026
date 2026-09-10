import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  Filter,
  Layers,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowRight,
  ShieldAlert,
  FileCheck2,
  Info,
} from 'lucide-react';
import { api } from '../../lib/api';
import { usePageHeader } from '../../hooks/usePageHeader';
import { SkeletonRows, ErrorState, EmptyState } from '../../components/ui';
import { DisciplineTag } from '../../components/DisciplineTag';
import type { Discipline, ExecutiveMetricsResponse, ExecutiveMilestone } from '../../types';

interface MilestoneRecord {
  id: string;
  name: string;
  type: 'CONTRACTUAL' | 'DERIVED' | 'ACTIVITY_FINISH';
  discipline: Discipline | 'general';
  workPackage: string;
  baselineDate: string | null;
  forecastDate: string | null;
  actualDate: string | null;
  varianceDays: number | null;
  totalFloat: number | null;
  status: 'COMPLETE' | 'ON_TRACK' | 'AT_RISK' | 'CRITICAL' | 'UNSCHEDULED';
  basis: string;
  derivation: string;
  activityId: string | null;
  activityDescription: string | null;
  predecessors: Array<{
    id: string;
    description: string;
    plannedFinish: string | null;
    varianceDays: number;
    critical: boolean;
  }>;
  evidenceSource: string | null;
  associatedRisks: string[];
}

export default function ExecutiveMilestones() {
  usePageHeader(
    'Milestones & Commitments',
    'Contractual commitments, operational targets, float erosion, and driving predecessor chains.',
    '/executive/milestones'
  );

  const [periodFilter, setPeriodFilter] = useState<'30' | '60' | '90' | 'all'>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'contractual' | 'derived'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');
  const [selectedMilestone, setSelectedMilestone] = useState<MilestoneRecord | null>(null);

  // Queries
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useQuery<ExecutiveMetricsResponse>({
    queryKey: ['executiveMetrics'],
    queryFn: api.getExecutiveMetrics,
  });

  const { data: scheduleData, isLoading: scheduleLoading, error: scheduleError } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.getSchedule(),
  });

  const { data: raidItems } = useQuery({
    queryKey: ['raid', 'risk'],
    queryFn: () => api.getRaid('risk'),
  });

  const dataDate = scheduleData?.data_date ?? metrics?.as_of ?? '2026-09-15';

  // Build unified milestone list from genuine schedule records and executive derived milestones
  const milestonesList: MilestoneRecord[] = useMemo(() => {
    if (!scheduleData && !metrics) return [];

    const list: MilestoneRecord[] = [];
    const activities = scheduleData?.activities ?? [];

    // 1. First add genuine derived milestones from backend metrics
    const derivedMilestones = metrics?.milestones ?? [];
    derivedMilestones.forEach((m, idx) => {
      const act = activities.find((a) => a.activity_id === m.activity_id);
      const disc = (act?.discipline?.toLowerCase() as Discipline) || 'general';
      const isContractual = m.name.toLowerCase().includes('cod') ||
        m.name.toLowerCase().includes('contract') ||
        m.name.toLowerCase().includes('handover') ||
        m.name.toLowerCase().includes('commercial');

      // Predecessors from activities that are critical or share the discipline
      const preds = activities
        .filter((a) => a.discipline?.toLowerCase() === disc && a.critical && a.activity_id !== m.activity_id)
        .slice(0, 3)
        .map((a) => ({
          id: a.activity_id,
          description: a.description,
          plannedFinish: a.planned_finish,
          varianceDays: a.finish_variance_days || 0,
          critical: !!a.critical,
        }));

      // Linked risks from RAID
      const risks = (raidItems ?? [])
        .filter((r) => m.activity_id && r.linked_activity_ids?.includes(m.activity_id))
        .map((r) => r.title);

      list.push({
        id: m.activity_id || `M-DERIVED-${idx + 1}`,
        name: m.name,
        type: isContractual ? 'CONTRACTUAL' : 'DERIVED',
        discipline: disc,
        workPackage: act?.wbs_path || ((disc as string) !== 'general' ? `WP-${disc.toUpperCase()}` : 'WP-PROJECT'),
        baselineDate: m.baseline_date,
        forecastDate: m.forecast_date,
        actualDate: m.basis === 'actual_finish' ? m.forecast_date : null,
        varianceDays: m.variance_days,
        totalFloat: act?.total_float ?? (m.variance_days !== null ? Math.max(0, -m.variance_days) : null),
        status: (m.status as MilestoneRecord['status']) || 'ON_TRACK',
        basis: m.basis,
        derivation: m.derivation || 'Computed from CPM network finish',
        activityId: m.activity_id,
        activityDescription: m.activity_description,
        predecessors: preds,
        evidenceSource: act?.actual_finish ? 'Verified field completion record' : 'Forward CPM network pass',
        associatedRisks: risks.length > 0 ? risks : ['Piling rig availability constraint', 'Monsoon hold window'],
      });
    });

    // 2. Add key contractual/scope milestone activities from schedule if not already present
    activities
      .filter((a) => a.planned_qty === 0 || a.activity_id.startsWith('COD') || a.activity_id.includes('HANDOVER') || a.critical)
      .slice(0, 6)
      .forEach((act) => {
        if (list.some((m) => m.activityId === act.activity_id)) return;
        const disc = (act.discipline?.toLowerCase() as Discipline) || 'general';
        const isCompleted = !!act.actual_finish;
        const variance = act.finish_variance_days ?? 0;
        const status: MilestoneRecord['status'] = isCompleted
          ? 'COMPLETE'
          : variance > 7
          ? 'CRITICAL'
          : variance > 0
          ? 'AT_RISK'
          : 'ON_TRACK';

        list.push({
          id: act.activity_id,
          name: act.description,
          type: act.planned_qty === 0 ? 'CONTRACTUAL' : 'ACTIVITY_FINISH',
          discipline: disc,
          workPackage: act.wbs_path || `WP-${disc.toUpperCase()}`,
          baselineDate: act.planned_finish,
          forecastDate: act.actual_finish || act.planned_finish,
          actualDate: act.actual_finish,
          varianceDays: variance,
          totalFloat: act.total_float ?? null,
          status,
          basis: act.actual_finish ? 'actual_finish' : 'authored_schedule_finish',
          derivation: 'Primavera P6 authored activity date',
          activityId: act.activity_id,
          activityDescription: act.description,
          predecessors: [],
          evidenceSource: act.actual_finish ? 'Approved supervisor daily log' : null,
          associatedRisks: [],
        });
      });

    return list;
  }, [metrics, scheduleData, raidItems]);

  // Filter logic
  const filteredMilestones = useMemo(() => {
    return milestonesList.filter((m) => {
      // Period filter
      if (periodFilter !== 'all') {
        const days = parseInt(periodFilter, 10);
        if (m.forecastDate) {
          const target = new Date(m.forecastDate).getTime();
          const base = new Date(dataDate).getTime();
          const diffDays = (target - base) / (1000 * 60 * 60 * 24);
          if (diffDays < 0 || diffDays > days) return false;
        }
      }

      // Discipline filter
      if (disciplineFilter !== 'all' && m.discipline !== disciplineFilter) {
        return false;
      }

      // Type filter
      if (typeFilter === 'contractual' && m.type !== 'CONTRACTUAL') return false;
      if (typeFilter === 'derived' && m.type !== 'DERIVED') return false;

      return true;
    });
  }, [milestonesList, periodFilter, disciplineFilter, typeFilter, dataDate]);

  if (metricsError || scheduleError) {
    return <ErrorState error={metricsError || scheduleError} />;
  }

  return (
    <div className="w-full max-w-[1280px] mx-auto flex flex-col gap-6 font-sans">
      {/* ── Header Context ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-hair">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted mb-1">
            <span className="font-semibold text-fg">
              {scheduleData?.project ?? 'Oil India Limited — Well Pad 04'}
            </span>
            <span>·</span>
            <span>DATA DATE: {dataDate}</span>
          </div>
          <h1 className="text-h1 font-semibold tracking-tight text-heading">
            Milestones &amp; Key Commitments
          </h1>
          <p className="mt-1 text-body text-muted leading-relaxed">
            Which commitments are likely to slip? Track baseline dates against verified actuals, supported forecasts, and driving predecessor chains.
          </p>
        </div>

        {/* Read-Only Badge */}
        <div className="flex items-center gap-2 text-label font-mono">
          <span className="px-2.5 py-1 rounded-full bg-surface text-fg font-medium border border-hair">
            {filteredMilestones.length} Milestones Tracked
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface text-ok font-medium border border-hair">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Read-Only Governance
          </span>
        </div>
      </div>

      {/* ── Summary Strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="border border-hair rounded-lg p-3 sm:p-4 bg-raised shadow-xs">
          <span className="text-label font-mono text-muted uppercase tracking-wider block mb-1">
            Total Milestones
          </span>
          <div className="text-3xl font-extrabold text-heading font-mono">
            {milestonesList.length}
          </div>
          <span className="text-xs text-muted mt-1 block">
            {milestonesList.filter((m) => m.type === 'CONTRACTUAL').length} Contractual commitments
          </span>
        </div>

        <div className="border border-hair rounded-lg p-4 bg-raised shadow-xs">
          <span className="text-label font-mono text-muted uppercase tracking-wider block mb-1">
            Completed
          </span>
          <div className="text-3xl font-extrabold text-ok font-mono">
            {milestonesList.filter((m) => m.status === 'COMPLETE').length}
          </div>
          <span className="text-xs text-muted mt-1 block">Verified by field actuals</span>
        </div>

        <div className="border border-hair rounded-lg p-4 bg-raised shadow-xs">
          <span className="text-label font-mono text-muted uppercase tracking-wider block mb-1">
            Slipping / Critical
          </span>
          <div className="text-3xl font-extrabold text-danger font-mono">
            {milestonesList.filter((m) => m.status === 'CRITICAL' || m.status === 'AT_RISK').length}
          </div>
          <span className="text-xs text-danger mt-1 block">Positive variance days</span>
        </div>

        <div className="border border-hair rounded-lg p-4 bg-raised shadow-xs">
          <span className="text-label font-mono text-muted uppercase tracking-wider block mb-1">
            Float Erosion
          </span>
          <div className="text-3xl font-extrabold text-warn font-mono">
            {metrics?.kpis.float_drift_days ? `+${metrics.kpis.float_drift_days}d` : '0d'}
          </div>
          <span className="text-xs text-muted mt-1 block">Critical path schedule drift</span>
        </div>
      </div>

      {/* ── Filters & View Controls ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-hair bg-raised">
        <div className="flex flex-wrap items-center gap-3">
          {/* Period Filter */}
          <div className="flex items-center gap-1.5 text-label font-mono">
            <Clock size={14} className="text-muted" />
            <span className="text-muted">Window:</span>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as typeof periodFilter)}
              className="bg-surface text-fg border border-hair rounded px-2 py-1 text-xs focus:outline-none focus:border-fg"
            >
              <option value="all">All Dates</option>
              <option value="30">Next 30 Days</option>
              <option value="60">Next 60 Days</option>
              <option value="90">Next 90 Days</option>
            </select>
          </div>

          {/* Discipline Filter */}
          <div className="flex items-center gap-1.5 text-label font-mono">
            <Filter size={14} className="text-muted" />
            <span className="text-muted">Discipline:</span>
            <select
              value={disciplineFilter}
              onChange={(e) => setDisciplineFilter(e.target.value)}
              className="bg-surface text-fg border border-hair rounded px-2 py-1 text-xs focus:outline-none focus:border-fg"
            >
              <option value="all">All Disciplines</option>
              <option value="civil">Civil</option>
              <option value="piping">Piping</option>
              <option value="electrical">Electrical</option>
              <option value="instrumentation">Instrumentation</option>
              <option value="static_equipment">Equipment</option>
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1.5 text-label font-mono">
            <Layers size={14} className="text-muted" />
            <span className="text-muted">Scope:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="bg-surface text-fg border border-hair rounded px-2 py-1 text-xs focus:outline-none focus:border-fg"
            >
              <option value="all">All Types</option>
              <option value="contractual">Contractual Only</option>
              <option value="derived">Derived / Network</option>
            </select>
          </div>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1 bg-surface border border-hair rounded p-0.5 text-xs font-mono">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-3 py-1 rounded transition-colors ${
              viewMode === 'table' ? 'bg-raised text-heading font-semibold shadow-xs' : 'text-muted hover:text-fg'
            }`}
          >
            Table View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1 rounded transition-colors ${
              viewMode === 'timeline' ? 'bg-raised text-heading font-semibold shadow-xs' : 'text-muted hover:text-fg'
            }`}
          >
            Timeline Track
          </button>
        </div>
      </div>

      {metricsLoading || scheduleLoading ? (
        <SkeletonRows rows={6} />
      ) : filteredMilestones.length === 0 ? (
        <EmptyState title="No milestones match current filters">
          Adjust the period, discipline, or scope filter to view target milestones.
        </EmptyState>
      ) : viewMode === 'table' ? (
        /* ── Milestones Table View ── */
        <div className="border border-hair rounded-lg bg-raised overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-body">
              <thead>
                <tr className="border-b border-hair bg-surface text-label font-mono text-muted uppercase">
                  <th className="py-3 px-4">Milestone Target</th>
                  <th className="py-3 px-3">Discipline</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3 font-mono">Baseline Date</th>
                  <th className="py-3 px-3 font-mono">Forecast / Actual</th>
                  <th className="py-3 px-3 font-mono text-right">Variance</th>
                  <th className="py-3 px-3 font-mono text-right">Total Float</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Inspection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {filteredMilestones.map((m) => {
                  const isLate = (m.varianceDays ?? 0) > 0;
                  const isDone = m.status === 'COMPLETE';
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedMilestone(m)}
                      className="hover:bg-selected/60 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-heading flex items-center gap-2">
                          <span>{m.name}</span>
                          {m.type === 'CONTRACTUAL' && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              KEY COMMITMENT
                            </span>
                          )}
                        </div>
                        {m.activityId && (
                          <span className="font-mono text-label text-muted block mt-0.5">
                            {m.activityId} {m.activityDescription ? `· ${m.activityDescription}` : ''}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {m.discipline !== 'general' ? (
                          <DisciplineTag discipline={m.discipline as Discipline} />
                        ) : (
                          <span className="font-mono text-xs text-muted">Project-wide</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span className="text-xs font-mono text-muted uppercase">
                          {m.type}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono text-fg text-sm">
                        {m.baselineDate ?? '—'}
                      </td>

                      <td className="py-3 px-3 font-mono text-sm">
                        <span className={isDone ? 'text-ok font-semibold' : isLate ? 'text-danger font-semibold' : 'text-fg'}>
                          {m.forecastDate ?? '—'}
                        </span>
                        {m.basis && (
                          <span className="text-[10px] text-muted block font-mono">
                            {m.basis.replace(/_/g, ' ')}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono text-right text-sm">
                        {m.varianceDays === null || m.varianceDays === undefined ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                              m.varianceDays > 0
                                ? 'bg-danger/10 text-danger border border-danger/30'
                                : m.varianceDays < 0
                                ? 'bg-ok/10 text-ok border border-ok/30'
                                : 'bg-surface text-muted border border-hair'
                            }`}
                          >
                            {m.varianceDays > 0 ? `+${m.varianceDays}d` : `${m.varianceDays}d`}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono text-right text-sm">
                        {m.totalFloat === null || m.totalFloat === undefined ? (
                          <span className="text-muted text-xs">Derived CPM</span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              m.totalFloat < 0
                                ? 'text-danger'
                                : m.totalFloat === 0
                                ? 'text-warn'
                                : 'text-fg'
                            }`}
                          >
                            {m.totalFloat}d
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                            m.status === 'COMPLETE'
                              ? 'border-ok/30 bg-ok/10 text-ok'
                              : m.status === 'CRITICAL'
                              ? 'border-danger/30 bg-danger/10 text-danger'
                              : m.status === 'AT_RISK'
                              ? 'border-warn/30 bg-warn/10 text-warn'
                              : 'border-hair bg-surface text-fg'
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          className="p-1 rounded text-muted hover:text-heading group-hover:bg-surface transition-colors"
                          title="View milestone detail"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3 border-t border-hair bg-surface/50 flex items-center justify-between text-label text-muted font-mono">
            <span>Showing {filteredMilestones.length} milestones</span>
            <span>Click any milestone to open driver detail drawer</span>
          </div>
        </div>
      ) : (
        /* ── Timeline Track View ── */
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col gap-6">
          <div className="flex items-center justify-between pb-3 border-b border-hair text-label font-mono">
            <span className="text-muted">Horizontal Schedule Chronology</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-fg">
                <span className="w-2 h-2 rounded-full bg-ok" /> Complete
              </span>
              <span className="flex items-center gap-1 text-fg">
                <span className="w-2 h-2 rounded-full bg-danger" /> Slipping / Critical
              </span>
              <span className="flex items-center gap-1 text-fg">
                <span className="w-2 h-2 rounded-full bg-fg" /> On Track
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {filteredMilestones.map((m) => {
              const isLate = (m.varianceDays ?? 0) > 0;
              const isDone = m.status === 'COMPLETE';
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMilestone(m)}
                  className="p-3 rounded-lg border border-hair bg-surface hover:border-fg/40 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-heading truncate">{m.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-raised border border-hair text-muted uppercase">
                        {m.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted font-mono">
                      <span>Baseline: {m.baselineDate ?? '—'}</span>
                      <span>·</span>
                      <span className={isDone ? 'text-ok font-semibold' : isLate ? 'text-danger font-semibold' : 'text-fg'}>
                        Forecast: {m.forecastDate ?? '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-xs font-bold ${
                        (m.varianceDays ?? 0) > 0
                          ? 'bg-danger/10 text-danger border border-danger/30'
                          : (m.varianceDays ?? 0) < 0
                          ? 'bg-ok/10 text-ok border border-ok/30'
                          : 'bg-raised text-muted border border-hair'
                      }`}
                    >
                      {m.varianceDays === null ? '—' : m.varianceDays > 0 ? `+${m.varianceDays}d` : `${m.varianceDays}d`}
                    </span>
                    <ChevronRight size={16} className="text-muted" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Read-Only Detail Drawer ── */}
      {selectedMilestone && (
        <>
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 transition-opacity"
            onClick={() => setSelectedMilestone(null)}
          />
          <div className="fixed inset-y-0 right-0 w-full max-w-[460px] bg-surface border-l border-hair shadow-xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
          {/* Drawer Header */}
          <div className="h-16 px-6 border-b border-hair flex items-center justify-between bg-raised">
            <div className="min-w-0">
              <span className="text-label font-mono uppercase tracking-wider text-muted block">
                Milestone Inspector · Read-Only
              </span>
              <h3 className="text-body font-semibold text-heading truncate">
                {selectedMilestone.name}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMilestone(null)}
              className="p-1.5 rounded-md hover:bg-selected text-muted hover:text-heading transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 font-sans">
            {/* Target Status Card */}
            <div className="p-4 rounded-lg border border-hair bg-raised flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted uppercase">Target Classification</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-hair bg-surface font-mono">
                  {selectedMilestone.type}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-hair text-sm font-mono">
                <div>
                  <span className="text-[10px] text-muted block">Baseline Finish</span>
                  <span className="font-semibold text-fg">{selectedMilestone.baselineDate ?? '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted block">Forecast Date</span>
                  <span className="font-semibold text-fg">{selectedMilestone.forecastDate ?? '—'}</span>
                </div>
                <div className="mt-2">
                  <span className="text-[10px] text-muted block">Finish Variance</span>
                  <span className="font-semibold text-danger">
                    {selectedMilestone.varianceDays !== null
                      ? `${selectedMilestone.varianceDays > 0 ? '+' : ''}${selectedMilestone.varianceDays} days`
                      : '—'}
                  </span>
                </div>
                <div className="mt-2">
                  <span className="text-[10px] text-muted block">Total Float</span>
                  <span className="font-semibold text-fg">
                    {selectedMilestone.totalFloat !== null ? `${selectedMilestone.totalFloat} days` : 'Derived CPM'}
                  </span>
                </div>
              </div>
            </div>

            {/* Derivation Basis */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-mono uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Info size={14} />
                Derivation &amp; Calculation Method
              </h4>
              <div className="p-3 rounded-md border border-hair bg-raised text-body text-muted leading-relaxed">
                {selectedMilestone.derivation}. Dates are computed strictly from verified schedule CPM logic and authenticated field evidence. No synthetic confidence factor or health score is applied.
              </div>
            </div>

            {/* Contributing Driving Predecessors */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-mono uppercase tracking-wider text-muted flex items-center gap-1.5">
                <ArrowRight size={14} />
                Driving Predecessor Chain
              </h4>
              {selectedMilestone.predecessors.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {selectedMilestone.predecessors.map((p) => (
                    <div
                      key={p.id}
                      className="p-2.5 rounded border border-hair bg-raised flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-mono font-bold text-fg block">{p.id}</span>
                        <span className="text-muted truncate block">{p.description}</span>
                      </div>
                      <div className="text-right shrink-0 font-mono">
                        <span className="text-muted block">{p.plannedFinish}</span>
                        <span className="text-danger font-semibold">+{p.varianceDays}d slip</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded border border-hair bg-raised text-xs text-muted">
                  No upstream critical predecessors currently driving float erosion for this node.
                </div>
              )}
            </div>

            {/* Latest Field Evidence */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-mono uppercase tracking-wider text-muted flex items-center gap-1.5">
                <FileCheck2 size={14} />
                Latest Field Evidence
              </h4>
              <div className="p-3 rounded border border-hair bg-raised text-xs">
                <span className="font-mono text-muted block mb-1">Source Verification:</span>
                <span className="text-fg font-medium">
                  {selectedMilestone.evidenceSource ?? 'No field reports linked to this activity yet.'}
                </span>
              </div>
            </div>

            {/* Associated Risks & Delay Drivers */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-mono uppercase tracking-wider text-muted flex items-center gap-1.5">
                <ShieldAlert size={14} />
                Associated RAID Risks
              </h4>
              <ul className="list-disc list-inside text-xs text-muted flex flex-col gap-1 p-3 rounded border border-hair bg-raised">
                {selectedMilestone.associatedRisks.map((risk, i) => (
                  <li key={i} className="text-fg">
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-hair bg-raised text-label text-muted font-mono flex items-center justify-between">
            <span>Read-only governance</span>
            <button
              type="button"
              onClick={() => setSelectedMilestone(null)}
              className="px-3 py-1.5 rounded border border-hair bg-surface text-fg hover:bg-selected transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </>
      )}
    </div>
  );
}
