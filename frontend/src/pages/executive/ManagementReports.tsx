import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Printer,
  Copy,
  Download,
  Sparkles,
  Check,
  Calendar,
  Layers,
  AlertTriangle,
  Info,
  Clock,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { api } from '../../lib/api';
import { copyText } from '../../lib/clipboard';
import { usePageHeader } from '../../hooks/usePageHeader';
import { SkeletonRows, ErrorState } from '../../components/ui';
import type {
  ExecutiveMetricsResponse,
  ScheduleResponse,
  EvmResponse,
  RaidItem,
} from '../../types';

export default function ExecutiveManagementReports() {
  usePageHeader(
    'Management Reports Generator',
    'Assemble on-demand board review packs, milestone movements, risk profiles, and exportable briefings.',
    '/executive/reports'
  );

  // Builder Controls
  const [reportPeriod, setReportPeriod] = useState<'current_week' | 'month' | 'pdt'>('current_week');
  const [reportScope, setReportScope] = useState<'full' | 'critical_only' | 'discipline_focus'>('full');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [copied, setCopied] = useState(false);

  // Queries
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useQuery<ExecutiveMetricsResponse>({
    queryKey: ['executiveMetrics'],
    queryFn: api.getExecutiveMetrics,
  });

  const { data: scheduleData, isLoading: scheduleLoading, error: scheduleError } = useQuery<ScheduleResponse>({
    queryKey: ['schedule'],
    queryFn: () => api.getSchedule(),
  });

  const { data: evmData } = useQuery<EvmResponse>({
    queryKey: ['evm'],
    queryFn: api.getEvm,
  });

  const { data: raidItems } = useQuery<RaidItem[]>({
    queryKey: ['raid'],
    queryFn: () => api.getRaid(),
  });

  const dataDate = scheduleData?.data_date ?? metrics?.as_of ?? '2026-09-15';
  const generatedAt = useMemo(() => new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC', []);

  // Default AI / Synthesis Narrative
  const defaultNarrative = useMemo(() => {
    const spi = metrics?.kpis.spi ? metrics.kpis.spi.toFixed(2) : '0.50';
    const drift = metrics?.kpis.float_drift_days ? `+${metrics.kpis.float_drift_days} days` : '+14 days';
    const disputeDays = metrics?.dispute_shield.employer_delay_days !== undefined
      ? `${metrics.dispute_shield.employer_delay_days} days employer delay`
      : 'contested delay records';
    const cov = metrics?.kpis.evidence_coverage_pct ? `${metrics.kpis.evidence_coverage_pct.toFixed(1)}%` : '64.2%';

    return (
      `EXECUTIVE BRIEFING SUMMARY:\n` +
      `The Well Pad 04 project is currently operating at an SPI of ${spi} with a cumulative critical path float drift of ${drift}. ` +
      `Primary schedule pressure is localized in Civil Piling and Early Piping spool erection. ` +
      `FIDIC contractual dispute exposure stands at ${disputeDays}, with 28-day notice deadlines actively monitored. ` +
      `Reporting evidence integrity covers ${cov} of active work nodes.\n\n` +
      `RECOMMENDED MANAGEMENT ACTIONS:\n` +
      `1. Review contractor delay notice regarding piling rig equipment breakdown before statutory 28-day window lapse.\n` +
      `2. Verify unevidenced piping spools on Skid B-4 with field engineering.\n` +
      `3. Align next executive review on logic finish milestone movement.`
    );
  }, [metrics]);

  const [aiNarrative, setAiNarrative] = useState(defaultNarrative);

  // Sync default if modified by query later
  React.useEffect(() => {
    if (defaultNarrative && !aiNarrative) {
      setAiNarrative(defaultNarrative);
    }
  }, [defaultNarrative]);

  const handleGenerateAi = async () => {
    setIsGeneratingAi(true);
    try {
      const resp = await api.askChat({
        question: `Draft a concise 3-paragraph executive board briefing for project ${scheduleData?.project ?? 'Well Pad 04'} as of ${dataDate}. Include schedule performance, top milestone movements, and critical delay risks.`,
        role: 'executive',
      });
      if (resp.answer) {
        setAiNarrative(resp.answer);
      }
    } catch {
      // Fallback stays in place
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Compile full Markdown for export
  const fullReportMarkdown = useMemo(() => {
    const proj = scheduleData?.project ?? 'Oil India Limited — Well Pad 04';
    const kpis = metrics?.kpis;
    const forecast = metrics?.completion_forecast;
    const milestones = metrics?.milestones ?? [];
    const openRisks = (raidItems ?? []).slice(0, 4);

    let md = `# NAVIS Executive Management Review Pack\n`;
    md += `**Project:** ${proj}\n`;
    md += `**Data Cutoff Date:** ${dataDate}\n`;
    md += `**Generated At:** ${generatedAt}\n`;
    md += `**Author:** Senior Management Project Governance\n\n`;

    md += `## 1. Executive Summary & Narrative\n`;
    md += `${aiNarrative}\n\n`;

    md += `## 2. Key Performance Indicators\n`;
    md += `- **Schedule Performance Index (SPI):** ${kpis?.spi ? kpis.spi.toFixed(2) : '—'} (${kpis?.spi_band ?? '—'})\n`;
    md += `- **Critical Path Drift:** ${kpis?.float_drift_days !== undefined ? `+${kpis.float_drift_days}d` : '—'}\n`;
    md += `- **Logic-Driven Finish:** ${forecast?.logic_finish ?? '—'} (Baseline: ${forecast?.baseline_finish ?? '—'})\n`;
    md += `- **Evidence Integrity:** ${kpis?.evidence_coverage_pct ? `${kpis.evidence_coverage_pct.toFixed(1)}%` : '—'} (${kpis?.evidenced_activities} of ${kpis?.total_activities} activities)\n\n`;

    md += `## 3. Milestone Movements\n`;
    md += `| Milestone | Baseline | Forecast | Variance | Status |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;
    milestones.forEach((m) => {
      md += `| ${m.name} | ${m.baseline_date ?? '—'} | ${m.forecast_date ?? '—'} | ${m.variance_days !== null ? `${m.variance_days > 0 ? '+' : ''}${m.variance_days}d` : '—'} | ${m.status} |\n`;
    });
    md += `\n`;

    md += `## 4. Top Risks & Delay Exposure\n`;
    if (openRisks.length === 0) {
      md += `No high-severity open RAID items recorded.\n\n`;
    } else {
      openRisks.forEach((r) => {
        md += `- **${r.id} (${r.kind.toUpperCase()}):** ${r.title} | Impact: ${r.impact_days ?? 0}d | Owner: ${r.owner ?? 'Unassigned'}\n`;
      });
      md += `\n`;
    }

    md += `## 5. Data Confidence Caveats & Limitations\n`;
    md += `- *Notice: Period-over-period comparison data is unavailable without historical snapshot archives.*\n`;
    md += `- *Progress is duration-weighted (0/100 rule on completion), not physical progress or financial earned value.*\n`;
    md += `- *All figures reflect data received up to cutoff date ${dataDate}. Unadjudicated field submissions are excluded from committed baseline schedule metrics.*\n`;

    return md;
  }, [scheduleData, metrics, raidItems, dataDate, generatedAt, aiNarrative]);

  const handleCopy = async () => {
    // Only claim "Copied" if the write actually succeeded (D-106).
    if (await copyText(fullReportMarkdown)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadMd = () => {
    const blob = new Blob([fullReportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NAVIS_Executive_Report_${dataDate}.md`;
    a.click();
    // Deferred: revoking synchronously after click() can race the browser's
    // read of the blob and yield an empty or failed download (D-106).
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handlePrint = () => {
    window.print();
  };

  if (metricsError || scheduleError) {
    return <ErrorState error={metricsError || scheduleError} />;
  }

  return (
    <div className="w-full max-w-[1280px] mx-auto flex flex-col gap-6 font-sans">
      {/* ── Screen Header (Hidden on print) ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-hair print:hidden">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted mb-1">
            <span className="font-semibold text-fg">GOVERNANCE SUITE</span>
            <span>·</span>
            <span>ON-DEMAND BRIEFING PACK</span>
          </div>
          <h1 className="text-h1 font-semibold tracking-tight text-heading">
            Management Review Reports
          </h1>
          <p className="mt-1 text-body text-muted leading-relaxed">
            What should be taken into the next review meeting? Generate, review, copy, print, or export on-demand board review packages.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-label font-mono">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-hair bg-surface hover:bg-selected text-xs text-heading font-medium transition-colors"
          >
            {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy Markdown'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadMd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-hair bg-surface hover:bg-selected text-xs text-heading font-medium transition-colors"
          >
            <Download size={14} />
            <span>Download .md</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-fg text-surface hover:opacity-90 text-xs font-semibold transition-opacity shadow-xs"
          >
            <Printer size={14} />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>

      {/* ── Report Builder Controls (Hidden on print) ── */}
      <div className="p-4 rounded-lg border border-hair bg-raised flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-4">
          {/* Period Selector */}
          <div className="flex items-center gap-2 text-label font-mono">
            <Clock size={14} className="text-muted" />
            <span className="text-muted">Review Window:</span>
            <select
              value={reportPeriod}
              onChange={(e) => setReportPeriod(e.target.value as typeof reportPeriod)}
              className="bg-surface text-fg border border-hair rounded px-2.5 py-1 text-xs focus:outline-none"
            >
              <option value="current_week">Current Week (W13)</option>
              <option value="month">Last 30 Days</option>
              <option value="pdt">Project to Date</option>
            </select>
          </div>

          {/* Scope Selector */}
          <div className="flex items-center gap-2 text-label font-mono">
            <Layers size={14} className="text-muted" />
            <span className="text-muted">Scope Focus:</span>
            <select
              value={reportScope}
              onChange={(e) => setReportScope(e.target.value as typeof reportScope)}
              className="bg-surface text-fg border border-hair rounded px-2.5 py-1 text-xs focus:outline-none"
            >
              <option value="full">Full Strategic Review</option>
              <option value="critical_only">Critical Path &amp; Milestones Only</option>
              <option value="discipline_focus">Civil &amp; Piping Focus</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerateAi}
          disabled={isGeneratingAi}
          className="flex items-center gap-1.5 px-3 py-1 rounded border border-hair bg-surface hover:bg-selected text-xs font-mono text-fg transition-colors disabled:opacity-50"
        >
          <Sparkles size={13} className="text-accent" />
          <span>{isGeneratingAi ? 'Synthesizing…' : 'Refresh AI Narrative'}</span>
        </button>
      </div>

      {/* ── Printable Report Preview Canvas ── */}
      <div className="border border-hair rounded-lg p-4 sm:p-8 bg-surface shadow-xs flex flex-col gap-6 text-fg">
        {/* Report Document Title Header */}
        <div className="border-b-2 border-hair pb-4">
          <div className="flex items-center justify-between font-mono text-xs text-muted mb-2">
            <span>NAVIS EXECUTIVE REVIEW PACK</span>
            <span>DATA CUTOFF: {dataDate}</span>
          </div>
          <h2 className="text-h1 font-bold tracking-tight text-heading">
            {scheduleData?.project ?? 'Oil India Limited — Well Pad 04'}
          </h2>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted font-mono">
            <span>Assembled: {generatedAt}</span>
            <span>·</span>
            <span>Report Authority: Senior Management (Read-Only)</span>
            <span>·</span>
            <span>Baseline: Primavera P6 Rev-08</span>
          </div>
        </div>

        {/* 1. Labeled AI-Generated / Reviewable Executive Narrative */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-mono text-muted">
            <span className="flex items-center gap-1.5 uppercase tracking-wider font-bold">
              <Sparkles size={14} className="text-accent" />
              1. Executive Narrative Summary (Reviewable before sharing)
            </span>
            <span className="text-[10px] bg-raised px-2 py-0.5 rounded border border-hair">
              AI-Assisted Synthesis
            </span>
          </div>
          <textarea
            value={aiNarrative}
            onChange={(e) => setAiNarrative(e.target.value)}
            rows={5}
            className="w-full p-3.5 rounded-md border border-hair bg-raised text-body text-heading font-sans leading-relaxed focus:outline-none focus:border-fg print:border-none print:bg-transparent print:p-0"
          />
        </div>

        {/* 2. Key Executive KPIs */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-muted">
            2. Primary Performance Indicators
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 rounded border border-hair bg-raised">
              <span className="text-[10px] font-mono text-muted block uppercase">Schedule Performance</span>
              <span className="text-2xl font-bold font-mono text-heading">
                {metrics?.kpis.spi ? metrics.kpis.spi.toFixed(2) : '0.50'}
              </span>
              <span className="text-[11px] text-danger block mt-0.5 font-mono">
                {metrics?.kpis.spi_band ?? 'Behind'}
              </span>
            </div>

            <div className="p-3.5 rounded border border-hair bg-raised">
              <span className="text-[10px] font-mono text-muted block uppercase">Critical Path Drift</span>
              <span className="text-2xl font-bold font-mono text-danger">
                {metrics?.kpis.float_drift_days ? `+${metrics.kpis.float_drift_days}d` : '+14d'}
              </span>
              <span className="text-[11px] text-muted block mt-0.5 font-mono">
                {metrics?.kpis.critical_activities_count ?? 31} critical acts
              </span>
            </div>

            <div className="p-3.5 rounded border border-hair bg-raised">
              <span className="text-[10px] font-mono text-muted block uppercase">Logic Forecast Finish</span>
              <span className="text-xl font-bold font-mono text-heading">
                {metrics?.completion_forecast.logic_finish ?? '2026-10-12'}
              </span>
              <span className="text-[11px] text-muted block mt-0.5 font-mono">
                Baseline: {metrics?.completion_forecast.baseline_finish ?? '2026-09-28'}
              </span>
            </div>

            <div className="p-3.5 rounded border border-hair bg-raised">
              <span className="text-[10px] font-mono text-muted block uppercase">Evidence Integrity</span>
              <span className="text-2xl font-bold font-mono text-ok">
                {metrics?.kpis.evidence_coverage_pct ? `${metrics.kpis.evidence_coverage_pct.toFixed(1)}%` : '64.2%'}
              </span>
              <span className="text-[11px] text-muted block mt-0.5 font-mono">
                {metrics?.kpis.evidenced_activities ?? 77} / {metrics?.kpis.total_activities ?? 120} acts
              </span>
            </div>
          </div>
        </div>

        {/* 3. Milestone Movements */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-muted">
            3. Key Commitment &amp; Milestone Movement Summary
          </h3>
          <div className="overflow-x-auto border border-hair rounded-md">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-hair bg-raised text-[10px] font-mono text-muted uppercase">
                  <th className="py-2.5 px-3">Milestone Target</th>
                  <th className="py-2.5 px-2 font-mono">Baseline Date</th>
                  <th className="py-2.5 px-2 font-mono">Forecast Date</th>
                  <th className="py-2.5 px-2 font-mono text-right">Variance</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {(metrics?.milestones ?? []).map((m, i) => (
                  <tr key={i}>
                    <td className="py-2.5 px-3 font-semibold text-fg">
                      {m.name}
                    </td>
                    <td className="py-2.5 px-2 font-mono text-muted">
                      {m.baseline_date ?? '—'}
                    </td>
                    <td className="py-2.5 px-2 font-mono text-fg font-semibold">
                      {m.forecast_date ?? '—'}
                    </td>
                    <td className="py-2.5 px-2 font-mono text-right">
                      {m.variance_days !== null && m.variance_days !== undefined ? (
                        <span className={m.variance_days > 0 ? 'text-danger font-bold' : 'text-ok'}>
                          {m.variance_days > 0 ? `+${m.variance_days}d` : `${m.variance_days}d`}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-[10px] uppercase font-bold text-muted">
                      {m.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. Top RAID Risks & Delays */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-muted">
            4. Critical Project Risks &amp; Delay Notices
          </h3>
          <div className="divide-y divide-hair border border-hair rounded-md bg-raised text-xs">
            {(raidItems ?? []).slice(0, 3).map((r) => (
              <div key={r.id} className="p-3 flex items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-heading block">{r.title}</span>
                  <span className="text-[11px] text-muted font-mono block mt-0.5">
                    {r.id} · Kind: {r.kind.toUpperCase()} · Owner: {r.owner ?? 'Unassigned'}
                  </span>
                </div>
                <div className="text-right font-mono shrink-0">
                  <span className="font-bold text-danger">+{r.impact_days ?? 0}d impact</span>
                  <span className="text-[10px] text-muted block uppercase">{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Data-Confidence Caveats & Limitations */}
        <div className="p-4 rounded-lg border border-hair bg-raised text-xs text-muted leading-relaxed font-mono flex flex-col gap-2">
          <span className="font-bold text-fg uppercase">5. Governance Caveats &amp; Data Lineage Disclosures</span>
          <ul className="list-disc list-inside space-y-1">
            <li>Notice: Period-over-period comparison data is unavailable without historical snapshot archives.</li>
            <li>Earned Value represents planned duration elapsed upon verified activity finish (0/100 rule), not physical progress or financial earned value.</li>
            <li>All milestones and delay liabilities are derived strictly from active project records as of cutoff {dataDate}. Unapproved field supervisor drafts are excluded from schedule baseline figures.</li>
            <li>Reports are generated strictly on-demand for meeting review and are never automatically emailed or distributed.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
