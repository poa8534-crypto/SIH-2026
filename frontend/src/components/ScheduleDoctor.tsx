import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  Filter,
  Flame,
  Info,
  Layers,
  Percent,
  Search,
  ShieldAlert,
  Sliders,
  Sparkles,
  Umbrella,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { EmptyState, ErrorState, Panel, SkeletonRows } from './ui';
import { DisciplineTag } from './DisciplineTag';
import type { Discipline, ScheduleAuditFinding, ScheduleAuditResponse } from '../types';

export function ScheduleDoctor() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [showCalibratedModal, setShowCalibratedModal] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const { data: audit, isLoading, error, refetch } = useQuery<ScheduleAuditResponse>({
    queryKey: ['schedule-audit'],
    queryFn: api.getScheduleAudit,
  });

  const findings = audit?.findings ?? [];

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (selectedCategory !== 'all' && f.category !== selectedCategory) return false;
      if (selectedSeverity !== 'all' && f.severity !== selectedSeverity) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = f.activity_id?.toLowerCase().includes(q);
        const matchDesc = f.activity_description?.toLowerCase().includes(q);
        const matchCritique = f.critique_message.toLowerCase().includes(q);
        const matchRule = f.rule_reference?.toLowerCase().includes(q);
        if (!matchId && !matchDesc && !matchCritique && !matchRule) return false;
      }
      return true;
    });
  }, [findings, selectedCategory, selectedSeverity, searchQuery]);

  if (isLoading) {
    return (
      <div className="p-6">
        <SkeletonRows rows={6} />
      </div>
    );
  }

  if (error || !audit) {
    return <ErrorState error={error ?? new Error('Failed to load schedule audit')} />;
  }

  const score = audit.feasibility_score;
  const isCritical = score < 70;
  const isModerate = score >= 70 && score < 85;

  const handleCopyXml = () => {
    if (audit.calibrated_schedule_snippet) {
      navigator.clipboard.writeText(audit.calibrated_schedule_snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadXml = () => {
    if (!audit.calibrated_schedule_snippet) return;
    const blob = new Blob([audit.calibrated_schedule_snippet], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${audit.schedule_name.replace(/\s+/g, '_')}_calibrated_p6.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Top Banner: Feasibility Score & Health Summary */}
      <div className="bg-raised text-fg rounded-lg p-6 border border-hair">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-hair">
          <div className="flex items-start gap-4">
            <div
              className={`h-16 w-16 rounded-lg flex items-center justify-center font-mono font-bold text-2xl border ${
                isCritical
                  ? 'bg-danger-bg border-danger-line/60 text-danger'
                  : isModerate
                  ? 'bg-warn/10 border-warn/30 text-warn'
                  : 'bg-ok/10 border-ok/30 text-ok'
              }`}
            >
              {score}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-label font-medium px-2 py-0.5 rounded-sm bg-surface border border-hair text-muted">
                  AI Schedule Feasibility & Knowledge Auditor
                </span>
                <span
                  className={`text-label font-medium px-2 py-0.5 rounded-full border ${
                    isCritical
                      ? 'bg-danger-bg text-danger border-danger-line/60'
                      : isModerate
                      ? 'bg-warn/10 text-warn border-warn/30'
                      : 'bg-ok/10 text-ok border-ok/30'
                  }`}
                >
                  {audit.feasibility_band.replace('_', ' ')}
                </span>
              </div>
              <h2 className="text-h2 font-semibold tracking-tight mt-1 text-heading">
                {audit.schedule_name} · Feasibility Audit
              </h2>
              <p className="text-body text-muted mt-1 max-w-3xl">
                Auditing {audit.total_activities} activities against Upper Assam OIL historical durations (P50/P90), DCMA 14-point network logic, and monsoon weather risk.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowCalibratedModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-md bg-accent text-accent-fg hover:bg-accent-hover font-medium text-body transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              <span>Generate Calibrated Baseline (P6)</span>
            </button>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-raised hover:bg-selected text-fg text-body border border-hair transition-colors font-medium"
            >
              Re-Audit
            </button>
          </div>
        </div>

        {/* 4 Score Breakdown Pillars */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
          <div className="bg-surface border border-hair rounded-lg p-3.5">
            <div className="flex items-center justify-between text-label text-muted font-medium mb-1">
              <span>Empirical Realism</span>
              <span className="font-mono font-semibold text-heading">{audit.score_breakdown.empirical_realism}/100</span>
            </div>
            <div className="w-full bg-raised border border-hair h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-accent h-full rounded-full"
                style={{ width: `${audit.score_breakdown.empirical_realism}%` }}
              />
            </div>
            <p className="text-label text-muted mt-2">
              Vs. Historical P50/P90 durations
            </p>
          </div>

          <div className="bg-surface border border-hair rounded-lg p-3.5">
            <div className="flex items-center justify-between text-label text-muted font-medium mb-1">
              <span>DCMA Logic Quality</span>
              <span className="font-mono font-semibold text-heading">{audit.score_breakdown.dcma_logic}/100</span>
            </div>
            <div className="w-full bg-raised border border-hair h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-ok h-full rounded-full"
                style={{ width: `${audit.score_breakdown.dcma_logic}%` }}
              />
            </div>
            <p className="text-label text-muted mt-2">
              Open ends, leads, & float checks
            </p>
          </div>

          <div className="bg-surface border border-hair rounded-lg p-3.5">
            <div className="flex items-center justify-between text-label text-muted font-medium mb-1">
              <span>Weather Buffer</span>
              <span className="font-mono font-semibold text-heading">{audit.score_breakdown.weather_buffer}/100</span>
            </div>
            <div className="w-full bg-raised border border-hair h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-warn h-full rounded-full"
                style={{ width: `${audit.score_breakdown.weather_buffer}%` }}
              />
            </div>
            <p className="text-label text-muted mt-2">
              Assam monsoon (Jun 15 - Sep 15)
            </p>
          </div>

          <div className="bg-surface border border-hair rounded-lg p-3.5">
            <div className="flex items-center justify-between text-label text-muted font-medium mb-1">
              <span>Productivity Sanity</span>
              <span className="font-mono font-semibold text-heading">{audit.score_breakdown.productivity_sanity}/100</span>
            </div>
            <div className="w-full bg-raised border border-hair h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-accent h-full rounded-full"
                style={{ width: `${audit.score_breakdown.productivity_sanity}%` }}
              />
            </div>
            <p className="text-label text-muted mt-2">
              Daily rates vs historical peak
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-raised border border-hair rounded-xl p-4">
        {/* Category filter pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCategory === 'all'
                ? 'bg-accent text-white shadow-sm'
                : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            All Findings ({findings.length})
          </button>
          <button
            onClick={() => setSelectedCategory('duration_optimism')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCategory === 'duration_optimism'
                ? 'bg-accent text-white shadow-sm'
                : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            Duration Fantasy ({findings.filter((f) => f.category === 'duration_optimism').length})
          </button>
          <button
            onClick={() => setSelectedCategory('dcma_logic')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCategory === 'dcma_logic'
                ? 'bg-accent text-white shadow-sm'
                : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            DCMA Logic Traps ({findings.filter((f) => f.category === 'dcma_logic').length})
          </button>
          <button
            onClick={() => setSelectedCategory('monsoon_weather')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCategory === 'monsoon_weather'
                ? 'bg-accent text-white shadow-sm'
                : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            Monsoon Clashes ({findings.filter((f) => f.category === 'monsoon_weather').length})
          </button>
          <button
            onClick={() => setSelectedCategory('engineering_rule')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCategory === 'engineering_rule'
                ? 'bg-accent text-white shadow-sm'
                : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            Engineering Rules ({findings.filter((f) => f.category === 'engineering_rule').length})
          </button>
        </div>

        {/* Search input & severity selector */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
            <input
              type="text"
              placeholder="Search ID, text, rule..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface border border-hair text-xs text-fg focus:outline-none focus:border-accent"
            />
          </div>

          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-surface border border-hair text-xs text-fg focus:outline-none focus:border-accent"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical Only</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Findings Count Summary */}
      <div className="flex items-center justify-between text-xs text-muted font-mono px-1">
        <span>
          Showing {filteredFindings.length} of {findings.length} findings
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            {audit.summary.critical} Critical
          </span>
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            {audit.summary.high} High
          </span>
          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            {audit.summary.medium} Medium
          </span>
        </div>
      </div>

      {/* Findings Table */}
      {filteredFindings.length === 0 ? (
        <EmptyState>No schedule findings match your active filter.</EmptyState>
      ) : (
        <div className="border border-hair rounded-xl overflow-hidden bg-raised shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-hair bg-surface text-[11px] font-mono uppercase tracking-wider text-muted">
                  <th className="py-3 px-4">Severity & Rule</th>
                  <th className="py-3 px-4">Activity</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Planned vs Benchmark</th>
                  <th className="py-3 px-4">AI Critique & Prescription</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair text-xs">
                {filteredFindings.map((f) => {
                  const isCrit = f.severity === 'critical';
                  const isHigh = f.severity === 'high';
                  return (
                    <tr
                      key={f.id}
                      className="hover:bg-selected/40 transition-colors even:bg-surface/30"
                    >
                      {/* Severity & Rule */}
                      <td className="py-3.5 px-4 whitespace-nowrap align-top">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider w-fit ${
                              isCrit
                                ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                : isHigh
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                            }`}
                          >
                            {f.severity}
                          </span>
                          {f.rule_reference && (
                            <span className="text-[10px] font-mono text-muted">
                              {f.rule_reference}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Activity */}
                      <td className="py-3.5 px-4 align-top max-w-[240px]">
                        <div className="font-mono font-bold text-fg">
                          {f.activity_id || '—'}
                        </div>
                        <div className="text-muted text-[11px] line-clamp-2 mt-0.5">
                          {f.activity_description || 'General Schedule Logic'}
                        </div>
                        {f.discipline && (
                          <div className="mt-1.5">
                            <DisciplineTag discipline={f.discipline as Discipline} />
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 whitespace-nowrap align-top">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface text-fg text-[11px] font-medium border border-hair">
                          {f.category === 'duration_optimism' && <Clock className="h-3 w-3 text-rose-500" />}
                          {f.category === 'dcma_logic' && <Layers className="h-3 w-3 text-amber-500" />}
                          {f.category === 'monsoon_weather' && <Umbrella className="h-3 w-3 text-blue-500" />}
                          {f.category === 'engineering_rule' && <ShieldAlert className="h-3 w-3 text-purple-500" />}
                          {f.category === 'productivity_unrealistic' && <Percent className="h-3 w-3 text-orange-500" />}
                          {f.category.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>

                      {/* Planned vs Benchmark */}
                      <td className="py-3.5 px-4 whitespace-nowrap align-top font-mono">
                        <div className="text-rose-600 dark:text-rose-400 font-bold">
                          {f.planned_value || '—'}
                        </div>
                        <div className="text-muted text-[11px] mt-0.5">
                          Target: {f.benchmark_value || 'Standard'}
                        </div>
                        {f.variance_pct !== null && f.variance_pct !== undefined && (
                          <div className="text-[10px] font-bold text-rose-500 mt-1">
                            {f.variance_pct}% deviation
                          </div>
                        )}
                      </td>

                      {/* AI Critique & Recommendation */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="text-fg font-medium leading-relaxed">
                          {f.critique_message}
                        </div>
                        {f.calibrated_recommendation && (
                          <div className="mt-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-800 dark:text-blue-300 text-[11px] flex items-start gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                            <span>
                              <strong>Prescription:</strong> {f.calibrated_recommendation}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Calibrated Baseline Export Modal */}
      {showCalibratedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-raised border border-hair rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-hair">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-500" />
                <h3 className="font-bold text-lg text-heading">
                  AI-Calibrated Schedule Prescription (Oracle Primavera P6 XML)
                </h3>
              </div>
              <button
                onClick={() => setShowCalibratedModal(false)}
                className="text-muted hover:text-fg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-muted">
              This snippet applies empirical P50 historical durations, resolves open logic ties, and injects Upper Assam monsoon buffers. You can import this directly into Oracle Primavera P6 or NAVIS.
            </p>

            <div className="relative">
              <pre className="bg-surface border border-hair rounded-xl p-4 text-[11px] font-mono text-fg overflow-auto max-h-72 whitespace-pre">
                {audit.calibrated_schedule_snippet || 'No snippet generated'}
              </pre>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-hair">
              <button
                onClick={handleCopyXml}
                className="px-4 py-2 rounded-xl bg-surface hover:bg-selected text-fg text-xs font-medium border border-hair transition-colors"
              >
                {copied ? 'Copied to Clipboard!' : 'Copy XML'}
              </button>
              <button
                onClick={handleDownloadXml}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent/90 text-white text-xs font-medium shadow transition-colors"
              >
                <Download className="h-4 w-4" />
                Download P6 XML
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
