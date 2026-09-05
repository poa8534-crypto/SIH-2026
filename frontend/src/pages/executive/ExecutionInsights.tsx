import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  Search,
  AlertTriangle,
  Clock,
  Layers,
  ArrowUpRight,
  TrendingDown,
  FileText,
  Info,
  CheckCircle2,
  Database,
} from 'lucide-react';
import { api } from '../../lib/api';
import { usePageHeader } from '../../hooks/usePageHeader';
import { SkeletonRows, ErrorState, EmptyState } from '../../components/ui';
import type {
  MemoryQueryResponse,
  DurationDistribution,
  ProductivityMetric,
  DelayReasonRow,
  ScheduleResponse,
} from '../../types';

export default function ExecutiveExecutionInsights() {
  usePageHeader(
    'Execution Insights & Institutional Memory',
    'Empirical durations, discipline bottlenecks, recurring delay root causes, and low-sample warnings.',
    '/executive/insights'
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('all');

  // Queries
  const { data: memoryData, isLoading: memoryLoading, error: memoryError } = useQuery<MemoryQueryResponse>({
    queryKey: ['memory-query', 'all'],
    queryFn: () => api.queryMemory({ query_type: 'all' }),
  });

  const { data: scheduleData, isLoading: scheduleLoading, error: scheduleError } = useQuery<ScheduleResponse>({
    queryKey: ['schedule'],
    queryFn: () => api.getSchedule(),
  });

  const durationDists = memoryData?.duration_distribution ?? [];
  const productivities = memoryData?.productivity ?? [];
  const delayReasons = memoryData?.delay_reasons ?? [];

  // Filtered duration distributions
  const filteredDistributions = useMemo(() => {
    return durationDists.filter((d) => {
      if (selectedDiscipline !== 'all') {
        const prefix = selectedDiscipline.slice(0, 3).toUpperCase();
        if (!d.activity_type.startsWith(prefix)) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return d.activity_type.toLowerCase().includes(q);
      }
      return true;
    });
  }, [durationDists, selectedDiscipline, searchQuery]);

  // Bottleneck detection: where actual mean days > planned mean days
  const bottlenecks = useMemo(() => {
    return durationDists
      .filter((d) => d.actual_mean_days !== null && d.actual_mean_days > d.planned_mean_days)
      .map((d) => ({
        ...d,
        overrunPct: Math.round(((d.actual_mean_days! - d.planned_mean_days) / d.planned_mean_days) * 100),
      }))
      .sort((a, b) => b.overrunPct - a.overrunPct);
  }, [durationDists]);

  if (memoryError || scheduleError) {
    return <ErrorState error={memoryError || scheduleError} />;
  }

  return (
    <div className="w-full max-w-[1280px] mx-auto flex flex-col gap-6 font-sans">
      {/* ── Context Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-hair">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted mb-1">
            <span className="font-semibold text-fg">INSTITUTIONAL MEMORY ENGINE</span>
            <span>·</span>
            <span>EMPIRICAL CALIBRATION</span>
          </div>
          <h1 className="text-h1 font-semibold tracking-tight text-heading">
            Execution Insights &amp; Lessons
          </h1>
          <p className="mt-1 text-body text-muted leading-relaxed">
            What can management learn from actual execution? Empirical duration distributions, trade bottlenecks, recurring delay root causes, and explicit sample size reliability.
          </p>
        </div>

        <div className="flex items-center gap-2 text-label font-mono">
          <span className="px-2.5 py-1 rounded-full bg-surface text-fg font-medium border border-hair">
            {durationDists.length} Activity Types Profiled
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface text-ok font-medium border border-hair">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Field Actuals
          </span>
        </div>
      </div>

      {/* ── Sample Size Invariant Notice ── */}
      <div className="p-4 rounded-lg border border-hair bg-raised text-body flex items-start gap-3">
        <Info size={18} className="text-fg shrink-0 mt-0.5" />
        <div className="text-xs text-muted leading-relaxed">
          <strong className="font-semibold text-fg">Empirical Truth &amp; Low Sample Warning:</strong> All figures below are derived from verified activity completions in the current project database, strictly separated from external benchmark reference corpus tables. When completed sample size is small (less than 3 activities), an explicit <span className="text-warn font-bold">Low Sample (&lt; 3)</span> badge warns against over-indexing on preliminary trends.
        </div>
      </div>

      {/* ── Top Summary Strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Identified Bottlenecks */}
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs">
          <span className="text-label font-mono text-muted uppercase tracking-wider block mb-1">
            Systematic Trade Overruns
          </span>
          <div className="text-3xl font-extrabold text-danger font-mono">
            {bottlenecks.length} Types
          </div>
          <span className="text-xs text-muted mt-1 block">
            Actual duration exceeds planned duration
          </span>
        </div>

        {/* Top Delay Reason */}
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs">
          <span className="text-label font-mono text-muted uppercase tracking-wider block mb-1">
            Top Recurring Delay Cause
          </span>
          <div className="text-xl font-extrabold text-fg font-mono truncate">
            {delayReasons[0]?.reason ?? 'None logged'}
          </div>
          <span className="text-xs text-danger mt-1 block font-mono">
            {delayReasons[0] ? `${delayReasons[0].days_lost} days lost (${delayReasons[0].frequency} events)` : '—'}
          </span>
        </div>

        {/* Knowledge Rules */}
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs">
          <span className="text-label font-mono text-muted uppercase tracking-wider block mb-1">
            Discipline Productivity Profiles
          </span>
          <div className="text-3xl font-extrabold text-heading font-mono">
            {productivities.length}
          </div>
          <span className="text-xs text-muted mt-1 block">Empirically measured trades</span>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-hair bg-raised">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-muted" />
            <input
              type="text"
              placeholder="Search activity type pattern (e.g. PIP-SPL)…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-surface text-fg border border-hair rounded pl-8 pr-3 py-1.5 text-xs w-[240px] focus:outline-none focus:border-fg"
            />
          </div>

          <div className="flex items-center gap-1.5 text-label font-mono">
            <Layers size={14} className="text-muted" />
            <span className="text-muted">Discipline:</span>
            <select
              value={selectedDiscipline}
              onChange={(e) => setSelectedDiscipline(e.target.value)}
              className="bg-surface text-fg border border-hair rounded px-2 py-1 text-xs focus:outline-none"
            >
              <option value="all">All Disciplines</option>
              <option value="civil">Civil (CIV)</option>
              <option value="piping">Piping (PIP)</option>
              <option value="electrical">Electrical (ELE)</option>
              <option value="instrumentation">Instrumentation (INS)</option>
            </select>
          </div>
        </div>

        <span className="text-xs font-mono text-muted">
          Showing {filteredDistributions.length} types
        </span>
      </div>

      {/* ── Duration Variance Table ── */}
      <div className="border border-hair rounded-lg bg-raised overflow-hidden shadow-xs flex flex-col">
        <div className="p-4 border-b border-hair bg-surface/50 flex items-center justify-between">
          <div>
            <h3 className="text-body font-semibold text-heading">
              Planned vs Actual Durations by Activity Type
            </h3>
            <span className="text-label text-muted">
              Comparing authored duration against measured execution speed, with explicit sample count.
            </span>
          </div>
        </div>

        {memoryLoading ? (
          <SkeletonRows rows={5} />
        ) : filteredDistributions.length === 0 ? (
          <EmptyState title="No activity type distributions found">
            No memory profiles match the selected trade or search term.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-body">
              <thead>
                <tr className="border-b border-hair bg-surface text-label font-mono text-muted uppercase">
                  <th className="py-3 px-4">Activity Type Pattern</th>
                  <th className="py-3 px-3 font-mono text-right">Total Acts</th>
                  <th className="py-3 px-3 font-mono text-right">Completed (Actuals)</th>
                  <th className="py-3 px-3 font-mono text-right">Planned Mean</th>
                  <th className="py-3 px-3 font-mono text-right">Actual Mean</th>
                  <th className="py-3 px-3 font-mono text-right">Variance (%)</th>
                  <th className="py-3 px-3 text-center">Reliability Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair text-xs">
                {filteredDistributions.map((d) => {
                  const isLowSample = d.actuals_count < 3;
                  const diff =
                    d.actual_mean_days !== null
                      ? d.actual_mean_days - d.planned_mean_days
                      : null;
                  const pct =
                    diff !== null
                      ? Math.round((diff / d.planned_mean_days) * 100)
                      : null;

                  return (
                    <tr key={d.activity_type} className="hover:bg-selected/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-fg">
                        {d.activity_type}
                      </td>

                      <td className="py-3 px-3 font-mono text-right text-muted">
                        {d.count}
                      </td>

                      <td className="py-3 px-3 font-mono text-right font-semibold text-fg">
                        {d.actuals_count}
                      </td>

                      <td className="py-3 px-3 font-mono text-right text-muted">
                        {d.planned_mean_days.toFixed(1)}d
                      </td>

                      <td className="py-3 px-3 font-mono text-right font-bold text-fg">
                        {d.actual_mean_days !== null ? `${d.actual_mean_days.toFixed(1)}d` : '—'}
                      </td>

                      <td className="py-3 px-3 font-mono text-right text-xs">
                        {pct === null ? (
                          <span className="text-muted">—</span>
                        ) : pct > 0 ? (
                          <span className="text-danger font-bold">+{pct}%</span>
                        ) : pct < 0 ? (
                          <span className="text-ok font-bold">{pct}%</span>
                        ) : (
                          <span className="text-muted">0%</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center">
                        {d.actuals_count === 0 ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface border border-hair text-muted">
                            NO ACTUALS
                          </span>
                        ) : isLowSample ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-warn/10 text-warn border border-warn/30 font-bold">
                            LOW SAMPLE (&lt; 3)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-ok/10 text-ok border border-ok/30 font-bold">
                            CALIBRATED (n={d.actuals_count})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Recurring Delay Causes & Bottlenecks Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recurring Delay Causes */}
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col gap-3">
          <div className="pb-3 border-b border-hair">
            <h3 className="text-body font-semibold text-heading">
              Recurring Delay Root Causes
            </h3>
            <span className="text-label text-muted">
              Identified from field notes, daily logs, and accepted delay records.
            </span>
          </div>

          {delayReasons.length === 0 ? (
            <div className="py-6 text-center text-muted font-mono text-xs">
              No recurring delay records logged in institutional memory.
            </div>
          ) : (
            <div className="divide-y divide-hair text-xs">
              {delayReasons.map((dr, i) => (
                <div key={i} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-semibold text-heading block">{dr.reason}</span>
                    <span className="text-[11px] text-muted font-mono block mt-0.5">
                      Affected Activities: {dr.affected_activities.join(', ')}
                    </span>
                  </div>
                  <div className="text-right shrink-0 font-mono">
                    <span className="text-danger font-bold block text-sm">+{dr.days_lost}d lost</span>
                    <span className="text-muted text-[11px] block">{dr.frequency} occurrences</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Systematic Trade Bottlenecks */}
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col gap-3">
          <div className="pb-3 border-b border-hair">
            <h3 className="text-body font-semibold text-heading">
              Systematic Trade Bottlenecks
            </h3>
            <span className="text-label text-muted">
              Activity types exceeding planned durations with highest historical overrun.
            </span>
          </div>

          {bottlenecks.length === 0 ? (
            <div className="py-6 text-center text-muted font-mono text-xs">
              No trade bottlenecks detected. Execution is tracking at or ahead of planned durations.
            </div>
          ) : (
            <div className="divide-y divide-hair text-xs">
              {bottlenecks.slice(0, 5).map((b, i) => (
                <div key={i} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-bold text-fg font-mono block">{b.activity_type}</span>
                    <span className="text-muted text-[11px] block">
                      Planned: {b.planned_mean_days.toFixed(1)}d · Actual: {b.actual_mean_days?.toFixed(1)}d
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-danger/10 text-danger border border-danger/30">
                      +{b.overrunPct}% Overrun
                    </span>
                    <span className="text-[10px] text-muted font-mono block mt-0.5">
                      Sample: {b.actuals_count} acts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
