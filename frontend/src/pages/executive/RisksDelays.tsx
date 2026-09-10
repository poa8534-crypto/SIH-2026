import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldAlert,
  AlertTriangle,
  Scale,
  FileSearch,
  Filter,
  Layers,
  ChevronRight,
  Clock,
  CheckCircle2,
  FileCheck2,
  Info,
  User,
  Calendar,
} from 'lucide-react';
import { api } from '../../lib/api';
import { usePageHeader } from '../../hooks/usePageHeader';
import { SkeletonRows, ErrorState, EmptyState } from '../../components/ui';
import type {
  Discipline,
  ExecutiveMetricsResponse,
  RaidItem,
  DelayAttribution,
  SourceConflict,
} from '../../types';

export default function ExecutiveRisksDelays() {
  usePageHeader(
    'Risks & Delay Exposure',
    'Accepted project risks, classified delay events, contractual notice compliance, and dispute liability.',
    '/executive/risks'
  );

  const [activeTab, setActiveTab] = useState<'raid' | 'delays' | 'conflicts'>('raid');
  const [riskLevelFilter, setRiskLevelFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRaidItem, setSelectedRaidItem] = useState<RaidItem | null>(null);

  // Queries
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useQuery<ExecutiveMetricsResponse>({
    queryKey: ['executiveMetrics'],
    queryFn: api.getExecutiveMetrics,
  });

  const { data: raidItems, isLoading: raidLoading, error: raidError } = useQuery<RaidItem[]>({
    queryKey: ['raid'],
    queryFn: () => api.getRaid(),
  });

  const { data: delayAttribution, isLoading: delayLoading, error: delayError } = useQuery<DelayAttribution>({
    queryKey: ['delay-attribution'],
    queryFn: () => api.getDelayAttribution(),
  });

  const { data: conflicts, isLoading: conflictsLoading, error: conflictsError } = useQuery<SourceConflict[]>({
    queryKey: ['conflicts'],
    queryFn: () => api.getConflicts(50),
  });

  const dispute = metrics?.dispute_shield;
  const financial = metrics?.financial;

  // Filtered RAID items
  const filteredRaid = useMemo(() => {
    if (!raidItems) return [];
    return raidItems.filter((item) => {
      if (statusFilter !== 'all' && item.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      if (riskLevelFilter !== 'all') {
        const exposure = item.exposure ?? ((item.probability || 0) * (item.impact_days || 0));
        if (riskLevelFilter === 'high' && exposure < 10) return false;
        if (riskLevelFilter === 'medium' && (exposure < 3 || exposure >= 10)) return false;
        if (riskLevelFilter === 'low' && exposure >= 3) return false;
      }
      return true;
    });
  }, [raidItems, statusFilter, riskLevelFilter]);

  if (metricsError || raidError || delayError || conflictsError) {
    return <ErrorState error={metricsError || raidError || delayError || conflictsError} />;
  }

  return (
    <div className="w-full max-w-[1280px] mx-auto flex flex-col gap-6 font-sans">
      {/* ── Context Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-hair">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted mb-1">
            <span className="font-semibold text-fg">FIDIC 1999 SUITE</span>
            <span>·</span>
            <span>CLAUSE 20.1 (NOTICES) &amp; CLAUSE 8.4 (EOT)</span>
          </div>
          <h1 className="text-h1 font-semibold tracking-tight text-heading">
            Risks &amp; Delay Exposure
          </h1>
          <p className="mt-1 text-body text-muted leading-relaxed">
            What threatens delivery, and who owns the response? Accepted RAID register, classified delay events, contractual notice compliance, and source information discrepancies.
          </p>
        </div>

        <div className="flex items-center gap-2 text-label font-mono">
          <span className="px-2.5 py-1 rounded-full bg-surface text-fg font-medium border border-hair">
            Exposure
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface text-ok font-medium border border-hair">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Senior Management Read-Only
          </span>
        </div>
      </div>

      {/* ── Strategic Dispute Shield Exposure Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Employer Delay Days */}
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col justify-between">
          <div>
            <span className="font-mono text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">
              Employer Delay (EOT Claimable)
            </span>
            <div className="text-3xl font-extrabold text-fg font-mono">
              {dispute ? `${dispute.employer_delay_days} Days` : '—'}
            </div>
          </div>
          <div className="mt-3 text-xs text-muted pt-3 border-t border-hair font-mono">
            {financial?.available && financial.employer_claim_cr !== null
              ? `₹${financial.employer_claim_cr.toFixed(2)} Cr prolongation claim`
              : 'No claim value — no contract sum supplied'}
          </div>
        </div>

        {/* Contractor Delay Days */}
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col justify-between">
          <div>
            <span className="font-mono text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">
              Contractor Delay (Culpable)
            </span>
            <div className="text-3xl font-extrabold text-danger font-mono">
              {dispute ? `${dispute.contractor_delay_days} Days` : '—'}
            </div>
          </div>
          <div className="mt-3 text-xs text-muted pt-3 border-t border-hair font-mono">
            {financial?.available && financial.contractor_ld_risk_cr !== null
              ? `₹${financial.contractor_ld_risk_cr.toFixed(2)} Cr LD Risk`
              : 'Liquidated damages unpriced'}
          </div>
        </div>

        {/* Contested Delays */}
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col justify-between">
          <div>
            <span className="font-mono text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">
              Contested / Unadjudicated
            </span>
            <div className="text-3xl font-extrabold text-warn font-mono">
              {dispute ? `${dispute.contested_delay_days} Days` : '—'}
            </div>
          </div>
          <div className="mt-3 text-xs text-muted pt-3 border-t border-hair font-mono">
            Requires Project Manager ruling
          </div>
        </div>

        {/* Notice Compliance */}
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col justify-between">
          <div>
            <span className="font-mono text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">
              FIDIC 28-Day Notice Compliance
            </span>
            <div className="text-3xl font-extrabold text-ok font-mono">
              {dispute?.notice_compliance_pct !== null && dispute?.notice_compliance_pct !== undefined
                ? `${dispute.notice_compliance_pct.toFixed(0)}%`
                : '—'}
            </div>
          </div>
          <div className="mt-3 text-xs text-muted pt-3 border-t border-hair font-mono">
            {dispute?.notice_served_count ?? 0} served · {dispute?.notice_lapsed_count ?? 0} lapsed
          </div>
        </div>
      </div>

      {/* ── Section Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-hair pb-1 text-sm font-medium overflow-x-auto whitespace-nowrap">
        <button
          type="button"
          onClick={() => setActiveTab('raid')}
          className={`px-4 py-2 rounded-t-md font-mono text-xs transition-colors flex items-center gap-2 ${
            activeTab === 'raid'
              ? 'bg-raised text-heading border-t border-x border-hair font-semibold'
              : 'text-muted hover:text-fg'
          }`}
        >
          <ShieldAlert size={14} />
          Accepted RAID Register ({raidItems?.length ?? 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('delays')}
          className={`px-4 py-2 rounded-t-md font-mono text-xs transition-colors flex items-center gap-2 ${
            activeTab === 'delays'
              ? 'bg-raised text-heading border-t border-x border-hair font-semibold'
              : 'text-muted hover:text-fg'
          }`}
        >
          <Scale size={14} />
          Delay Attribution Matrix ({delayAttribution?.events?.length ?? 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('conflicts')}
          className={`px-4 py-2 rounded-t-md font-mono text-xs transition-colors flex items-center gap-2 ${
            activeTab === 'conflicts'
              ? 'bg-raised text-heading border-t border-x border-hair font-semibold'
              : 'text-muted hover:text-fg'
          }`}
        >
          <FileSearch size={14} />
          Source Disagreements ({conflicts?.length ?? 0})
        </button>
      </div>

      {/* ── Tab 1: Accepted RAID Register ── */}
      {activeTab === 'raid' && (
        <div className="flex flex-col gap-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-hair bg-raised">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-label font-mono">
                <Filter size={14} className="text-muted" />
                <span className="text-muted">Exposure Tier:</span>
                <select
                  value={riskLevelFilter}
                  onChange={(e) => setRiskLevelFilter(e.target.value as typeof riskLevelFilter)}
                  className="bg-surface text-fg border border-hair rounded px-2 py-1 text-xs focus:outline-none"
                >
                  <option value="all">All Exposures</option>
                  <option value="high">High Exposure (&gt; 10d)</option>
                  <option value="medium">Medium Exposure (3–10d)</option>
                  <option value="low">Low Exposure (&lt; 3d)</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-label font-mono">
                <span className="text-muted">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-surface text-fg border border-hair rounded px-2 py-1 text-xs focus:outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>

            <span className="text-xs font-mono text-muted">
              {filteredRaid.length} Accepted Items (PM-governed)
            </span>
          </div>

          {/* RAID Table */}
          {raidLoading ? (
            <SkeletonRows rows={5} />
          ) : filteredRaid.length === 0 ? (
            <EmptyState title="No RAID items found">
              No accepted risk, assumption, issue, or decision records meet the selected filter criteria.
            </EmptyState>
          ) : (
            <div className="border border-hair rounded-lg bg-raised overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-body">
                  <thead>
                    <tr className="border-b border-hair bg-surface text-label font-mono text-muted uppercase">
                      <th className="py-3 px-4">Item ID &amp; Title</th>
                      <th className="py-3 px-3">Kind</th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3 font-mono text-right">Probability</th>
                      <th className="py-3 px-3 font-mono text-right">Impact Days</th>
                      <th className="py-3 px-3 font-mono text-right">Exposure</th>
                      <th className="py-3 px-3">Owner</th>
                      <th className="py-3 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hair">
                    {filteredRaid.map((item) => {
                      const prob = item.probability !== null && item.probability !== undefined ? `${(item.probability * 100).toFixed(0)}%` : '—';
                      const exp = item.exposure ?? ((item.probability || 0) * (item.impact_days || 0));
                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedRaidItem(item)}
                          className="hover:bg-selected/50 transition-colors cursor-pointer"
                        >
                          <td className="py-3 px-4">
                            <span className="font-semibold text-heading block">{item.title}</span>
                            <span className="font-mono text-label text-muted block mt-0.5">
                              {item.id}
                              {item.linked_activity_ids?.length > 0 && (
                                <> · Linked Acts: {item.linked_activity_ids.join(', ')}</>
                              )}
                            </span>
                          </td>

                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded font-mono text-xs uppercase bg-surface border border-hair text-fg">
                              {item.kind}
                            </span>
                          </td>

                          <td className="py-3 px-3 font-mono text-xs text-muted">
                            {item.category ?? 'General'}
                          </td>

                          <td className="py-3 px-3 font-mono text-right text-xs">
                            {prob}
                          </td>

                          <td className="py-3 px-3 font-mono text-right text-xs font-semibold">
                            {item.impact_days !== null ? `${item.impact_days}d` : '—'}
                          </td>

                          <td className="py-3 px-3 font-mono text-right text-xs font-bold text-danger">
                            {exp ? `${exp.toFixed(1)}d` : '—'}
                          </td>

                          <td className="py-3 px-3 text-xs text-muted font-medium">
                            {item.owner ?? 'Unassigned'}
                          </td>

                          <td className="py-3 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                item.status.toLowerCase() === 'open' || item.status.toLowerCase() === 'active'
                                  ? 'border-danger/30 bg-danger/10 text-danger'
                                  : 'border-hair bg-surface text-muted'
                              }`}
                            >
                              {item.status.toUpperCase()}
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
      )}

      {/* ── Tab 2: Delay Attribution Matrix ── */}
      {activeTab === 'delays' && (
        <div className="flex flex-col gap-4">
          <div className="p-3 rounded-lg border border-hair bg-raised text-xs text-muted leading-relaxed font-mono flex items-center justify-between">
            <span>
              Causal delay taxonomy mapped to Primavera activities. Total Events: {delayAttribution?.total_events ?? 0} ({delayAttribution?.adjudicated_events ?? 0} Adjudicated by PM).
            </span>
            <span className="text-fg font-semibold">
              Notice Window: 28 Days
            </span>
          </div>

          {delayLoading ? (
            <SkeletonRows rows={5} />
          ) : !delayAttribution?.events || delayAttribution.events.length === 0 ? (
            <EmptyState title="No classified delay events">
              There are currently no classified schedule delay events in the repository.
            </EmptyState>
          ) : (
            <div className="border border-hair rounded-lg bg-raised overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-body">
                  <thead>
                    <tr className="border-b border-hair bg-surface text-label font-mono text-muted uppercase">
                      <th className="py-3 px-4">Delay Event &amp; Activity</th>
                      <th className="py-3 px-3">Taxonomy Category</th>
                      <th className="py-3 px-3">Liability Classification</th>
                      <th className="py-3 px-3 font-mono text-right">Schedule Impact</th>
                      <th className="py-3 px-3 font-mono">Notice Status</th>
                      <th className="py-3 px-3">Source Citation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hair text-xs">
                    {delayAttribution.events.map((evt, idx) => {
                      const isEmployer = evt.liability_effective?.includes('EMPLOYER');
                      const isContractor = evt.liability_effective?.includes('CONTRACTOR');
                      return (
                        <tr key={idx} className="hover:bg-selected/40 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-semibold text-heading block">{evt.phrase}</span>
                            <span className="font-mono text-muted block mt-0.5">{evt.activity_id}</span>
                          </td>

                          <td className="py-3 px-3 font-mono text-muted">
                            {evt.category ?? 'UNCATEGORIZED'}
                          </td>

                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${
                                isEmployer
                                  ? 'border-fg/30 bg-surface text-fg'
                                  : isContractor
                                  ? 'border-danger/30 bg-danger/10 text-danger'
                                  : 'border-warn/30 bg-warn/10 text-warn'
                              }`}
                            >
                              {evt.liability_effective ?? 'UNADJUDICATED'}
                            </span>
                          </td>

                          <td className="py-3 px-3 font-mono text-right font-bold text-danger text-sm">
                            {evt.impact_days ? `+${evt.impact_days}d` : '—'}
                          </td>

                          <td className="py-3 px-3 font-mono">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                evt.notice_status === 'SERVED'
                                  ? 'bg-ok/10 text-ok'
                                  : evt.notice_status === 'LAPSED'
                                  ? 'bg-danger/10 text-danger'
                                  : 'bg-surface text-muted border border-hair'
                              }`}
                            >
                              {evt.notice_status}
                            </span>
                          </td>

                          <td className="py-3 px-3 font-mono text-muted text-[11px]">
                            {evt.source_file ? `${evt.source_file}:${evt.source_row ?? ''}` : 'Daily Log'}
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
      )}

      {/* ── Tab 3: Source Conflicts (Information Confidence) ── */}
      {activeTab === 'conflicts' && (
        <div className="flex flex-col gap-4">
          <div className="p-3 rounded-lg border border-hair bg-raised text-xs text-muted leading-relaxed font-mono">
            <strong>Information Integrity Notice:</strong> These items represent conflicting telemetry or progress reports across data sources (e.g. drone scan vs supervisor daily log). They reflect information confidence and measurement uncertainty, not approved contractual delays.
          </div>

          {conflictsLoading ? (
            <SkeletonRows rows={4} />
          ) : !conflicts || conflicts.length === 0 ? (
            <div className="border border-hair rounded-lg p-8 bg-raised text-center flex flex-col items-center justify-center">
              <CheckCircle2 size={28} className="text-ok mb-2" />
              <h3 className="text-body font-semibold text-heading">No Source Disagreements</h3>
              <p className="text-label text-muted mt-1 max-w-[420px]">
                All field reports, spreadsheets, and telemetry align on activity values. No contested data fields detected.
              </p>
            </div>
          ) : (
            <div className="border border-hair rounded-lg bg-raised overflow-hidden shadow-xs">
              <div className="divide-y divide-hair">
                {conflicts.map((c, i) => (
                  <div key={i} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-fg">{c.activity_id}</span>
                        <span className="text-muted">·</span>
                        <span className="font-semibold text-heading truncate">{c.description}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted font-mono flex items-center gap-3">
                        <span>Field in dispute: <strong className="text-fg">{c.field}</strong></span>
                        <span>·</span>
                        <span>Schedule holds: <strong className="text-ok">{c.stored_value ?? 'None'}</strong></span>
                      </div>
                    </div>

                    {/* Conflicting Sides */}
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                      {c.sides.map((s, sideIdx) => (
                        <div
                          key={sideIdx}
                          className="px-2.5 py-1 rounded bg-surface border border-hair text-muted flex items-center gap-1.5"
                        >
                          <span className="capitalize font-semibold text-fg">{s.source_kind}:</span>
                          <span className="text-danger font-bold">{s.value}</span>
                          <span className="text-[10px] text-muted">({s.source_file ?? 'field'})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
