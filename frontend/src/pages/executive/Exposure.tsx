import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Info,
  Layers,
  Scale,
  Search,
  ShieldAlert,
  User,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, ErrorState, Panel, SkeletonRows } from '../../components/ui';
import { usePageHeader } from '../../hooks/usePageHeader';
import type { ExecutiveMetricsResponse, RaidItem, RaidKind } from '../../types';

/**
 * Senior Management Exposure:
 * Strategic risk oversight, commercial exposure, and unresolved source conflicts.
 *
 * Read-only per system governance rules: Senior Management does not edit actuals,
 * close risks, or bypass the Project Manager.
 */

const KIND_TONE: Record<string, string> = {
  risk: 'text-warn bg-warn/10 border-warn/30',
  issue: 'text-danger bg-danger/10 border-danger/30',
  action: 'text-accent bg-accent/10 border-accent/30',
  decision: 'text-muted bg-surface border-hair',
};

const KIND_LABEL: Record<string, string> = {
  risk: 'Risk',
  issue: 'Issue',
  action: 'Action',
  decision: 'Decision',
};

export default function ExecutiveExposure() {
  usePageHeader(
    'Exposure',
    'Top risks, open issues and unresolved source conflicts.',
    '/executive/exposure'
  );

  const [selectedItem, setSelectedItem] = useState<RaidItem | null>(null);
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { data: scheduleData } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.getSchedule(),
  });

  const { data: metrics } = useQuery<ExecutiveMetricsResponse>({
    queryKey: ['executiveMetrics'],
    queryFn: api.getExecutiveMetrics,
  });

  const raid = useQuery({ queryKey: ['raid'], queryFn: () => api.getRaid() });
  const conflicts = useQuery({
    queryKey: ['conflicts'],
    queryFn: () => api.getConflicts(50),
  });

  const items = raid.data ?? [];
  const conflictList = conflicts.data ?? [];
  const financial = metrics?.financial;
  const dataDate = scheduleData?.data_date ?? metrics?.as_of ?? '2026-09-15';

  // Filtered and ranked RAID items
  const ranked = useMemo(() => {
    let filtered = [...items];
    if (kindFilter !== 'all') {
      filtered = filtered.filter((r) => r.kind === kindFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.owner ?? '').toLowerCase().includes(q) ||
          (r.category ?? '').toLowerCase().includes(q)
      );
    }
    return filtered.sort((a, b) => (b.exposure ?? 0) - (a.exposure ?? 0));
  }, [items, kindFilter, searchQuery]);

  // Overdue count check against schedule data date
  const overdueCount = useMemo(() => {
    return items.filter((r) => {
      if (r.status !== 'open' || !r.due_date) return false;
      return r.due_date < dataDate;
    }).length;
  }, [items, dataDate]);

  const highExposureCount = useMemo(() => {
    return items.filter((r) => (r.exposure ?? 0) >= 10).length;
  }, [items]);

  return (
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-6 font-sans">
      {/* ── Context Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-hair bg-raised text-label">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-fg">
            {scheduleData?.project ?? 'Oil India Limited — Well Pad 04'}
          </span>
          <span className="text-muted">·</span>
          <span className="text-muted">Management Risk &amp; Contractual Exposure</span>
        </div>
        <div className="flex items-center gap-4 text-muted">
          <span>
            Data Date: <strong className="font-mono text-fg">{dataDate}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-fg border border-hair bg-surface font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Senior Management (Read-Only)
          </span>
        </div>
      </div>

      {/* ── Commercial Exposure Framework ── */}
      <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-hair mb-4">
          <div className="flex items-center gap-2">
            <Scale size={18} className="text-fg" />
            <h3 className="text-lead font-semibold text-heading">
              Commercial Exposure &amp; Financial Contract Terms
            </h3>
          </div>
          <span className="font-mono text-label text-muted">
            FIDIC 1999 CLAUSES 8.4 &amp; 8.7
          </span>
        </div>

        {financial?.available && financial.contract_value_cr !== null ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-surface border border-hair">
              <span className="text-label text-muted font-mono block">Contract Baseline</span>
              <span className="text-2xl font-bold font-mono text-fg mt-1 block">
                ₹{financial.contract_value_cr.toFixed(2)} Cr
              </span>
              <span className="text-label text-muted mt-1 block">Operator supplied value</span>
            </div>
            <div className="p-4 rounded-lg bg-surface border border-hair">
              <span className="text-label text-muted font-mono block">Employer Claim Exposure</span>
              <span className="text-2xl font-bold font-mono text-fg mt-1 block">
                {financial.employer_claim_cr !== null
                  ? `₹${financial.employer_claim_cr.toFixed(2)} Cr`
                  : '0.00 Cr'}
              </span>
              <span className="text-label text-muted mt-1 block">Compensable delay entitlement</span>
            </div>
            <div className="p-4 rounded-lg bg-surface border border-hair">
              <span className="text-label text-muted font-mono block">Contractor LD Risk</span>
              <span className="text-2xl font-bold font-mono text-warn mt-1 block">
                {financial.contractor_ld_risk_cr !== null
                  ? `₹${financial.contractor_ld_risk_cr.toFixed(2)} Cr`
                  : '0.00 Cr'}
              </span>
              <span className="text-label text-muted mt-1 block">
                {financial.ld_pct_per_week}% / week, capped at {financial.ld_cap_pct}%
              </span>
            </div>
            <div className="p-4 rounded-lg bg-surface border border-hair">
              <span className="text-label text-muted font-mono block">Prolongation Rate</span>
              <span className="text-2xl font-bold font-mono text-fg mt-1 block">
                {financial.prolongation_lakhs_per_day !== null
                  ? `₹${financial.prolongation_lakhs_per_day} L/d`
                  : '—'}
              </span>
              <span className="text-label text-muted mt-1 block">Site overhead assumption</span>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-surface border border-hair flex items-start gap-3">
            <Info size={18} className="text-muted mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-fg text-body block">
                Commercial inputs not supplied
              </span>
              <p className="text-label text-muted mt-0.5 leading-relaxed">
                No contract sum or commercial rate was provided in the baseline schedule. NAVIS avoids
                speculating on monetary damages; commercial headlines are omitted and exposure is
                tracked objectively through float erosion, critical slip days, and notice deadlines.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Exposure Summary Metrics Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-hair bg-raised">
          <span className="text-label text-muted block font-mono">Accepted RAID Items</span>
          <span className="text-3xl font-extrabold text-heading font-mono mt-1 block">
            {items.length}
          </span>
          <span className="text-label text-muted mt-0.5 block">Permanent register entries</span>
        </div>
        <div className="p-4 rounded-lg border border-hair bg-raised">
          <span className="text-label text-muted block font-mono">High Exposure Items</span>
          <span className="text-3xl font-extrabold text-warn font-mono mt-1 block">
            {highExposureCount}
          </span>
          <span className="text-label text-muted mt-0.5 block">Exposure index ≥ 10.0</span>
        </div>
        <div className="p-4 rounded-lg border border-hair bg-raised">
          <span className="text-label text-muted block font-mono">Overdue Items</span>
          <span className="text-3xl font-extrabold text-danger font-mono mt-1 block">
            {overdueCount}
          </span>
          <span className="text-label text-muted mt-0.5 block">Past due date as of {dataDate}</span>
        </div>
        <div className="p-4 rounded-lg border border-hair bg-raised">
          <span className="text-label text-muted block font-mono">Unresolved Source Conflicts</span>
          <span className="text-3xl font-extrabold text-fg font-mono mt-1 block">
            {conflictList.length}
          </span>
          <span className="text-label text-muted mt-0.5 block">Contradictory field updates</span>
        </div>
      </div>

      {/* ── Main Two-Section Layout: Accepted RAID Register + Source Conflicts ── */}
      <div className="grid grid-cols-1 gap-6">
        {/* Panel 1: Accepted RAID Register */}
        <Panel
          title="Accepted Governance Register (RAID)"
          badge={items.length}
          right={
            <span className="text-label text-muted font-mono">
              Click row to inspect read-only details
            </span>
          }
        >
          {/* Controls Bar */}
          <div className="px-4 py-3 border-b border-hair bg-raised/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              {['all', 'risk', 'issue', 'action', 'decision'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={`px-2.5 py-1 rounded text-label font-medium capitalize transition-colors ${
                    kindFilter === k
                      ? 'bg-selected text-fg font-semibold border border-hair'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  {k === 'all' ? `All (${items.length})` : `${k}s`}
                </button>
              ))}
            </div>
            <div className="relative min-w-[200px]">
              <Search size={13} className="absolute left-2.5 top-2.5 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by title, owner..."
                className="w-full pl-8 pr-2.5 py-1 text-label rounded bg-surface border border-hair text-fg placeholder:text-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {raid.isLoading ? (
            <SkeletonRows rows={5} />
          ) : raid.error ? (
            <ErrorState error={raid.error} mode="bare" className="px-4 py-4" />
          ) : ranked.length === 0 ? (
            <EmptyState>
              No risks, issues, actions or decisions have been accepted into the register yet.
              Candidates detected from field reports remain proposals until a Project Manager
              adjudicates them.
            </EmptyState>
          ) : (
            <div className="divide-y divide-hair">
              {ranked.map((r) => {
                const isOverdue = r.status === 'open' && r.due_date && r.due_date < dataDate;
                const isSelected = selectedItem?.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedItem(r)}
                    className={`px-4 py-3.5 flex items-start gap-3.5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-selected' : 'hover:bg-raised'
                    }`}
                  >
                    <span
                      className={`font-mono text-label uppercase px-2 py-0.5 rounded-full border text-center shrink-0 ${
                        KIND_TONE[r.kind] ?? 'text-muted bg-surface border-hair'
                      }`}
                    >
                      {r.kind}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-body text-fg">{r.title}</span>
                        {r.status === 'closed' && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono uppercase bg-ok/10 text-ok border border-ok/30">
                            Closed
                          </span>
                        )}
                        {isOverdue && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono uppercase bg-danger/10 text-danger border border-danger/30">
                            Overdue
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-4 text-label font-mono text-muted flex-wrap">
                        {r.owner && (
                          <span className="flex items-center gap-1 text-fg">
                            <User size={12} className="text-muted" />
                            {r.owner}
                          </span>
                        )}
                        {r.due_date && (
                          <span className={isOverdue ? 'text-danger font-semibold' : ''}>
                            Due {r.due_date}
                          </span>
                        )}
                        {r.category && <span>Category: {r.category}</span>}
                        {r.linked_activity_ids?.length > 0 && (
                          <span>
                            Linked: {r.linked_activity_ids.slice(0, 3).join(', ')}
                            {r.linked_activity_ids.length > 3 ? '…' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {typeof r.exposure === 'number' && (
                        <div>
                          <span className="font-mono text-body font-bold text-fg tabular-nums">
                            {r.exposure.toFixed(1)}
                          </span>
                          <span className="text-[10px] uppercase font-mono text-muted block">
                            Exposure
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Panel 2: Source Conflicts */}
        <Panel title="Unresolved Source Conflicts" badge={conflictList.length}>
          {conflicts.isLoading ? (
            <SkeletonRows rows={5} />
          ) : conflicts.error ? (
            <ErrorState error={conflicts.error} mode="bare" className="px-4 py-4" />
          ) : conflictList.length === 0 ? (
            <EmptyState>No source disagreements outstanding.</EmptyState>
          ) : (
            <>
              <div className="p-4 border-b border-hair bg-raised/40 flex items-start gap-2.5 text-body text-muted leading-relaxed">
                <ShieldAlert size={16} className="text-warn mt-0.5 shrink-0" />
                <div>
                  <strong className="text-fg font-medium">Data Integrity Notice:</strong> Source
                  conflicts represent contradictory updates from distinct field reports (e.g.
                  conflicting start dates or progress quantities for the same activity). NAVIS isolates
                  these contradictions rather than silently overwriting records. Until reconciled by
                  the Project Manager, they reduce statistical confidence in reported performance.
                </div>
              </div>
              <div className="divide-y divide-hair max-h-[380px] overflow-y-auto">
                {conflictList.slice(0, 30).map((c, i) => (
                  <div
                    key={`${c.activity_id}-${c.field}-${i}`}
                    className="px-4 py-3 flex items-start gap-4 text-body hover:bg-raised/30 transition-colors"
                  >
                    <span className="font-mono font-bold text-fg w-32 shrink-0">
                      {c.activity_id}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-heading block">
                        Conflicting Field: <code className="text-label text-fg bg-surface px-1.5 py-0.5 rounded border border-hair">{c.field}</code>
                      </span>
                      <div className="mt-0.5 text-label font-mono text-muted">
                        Stored Value: <span className="text-fg">{String(c.stored_value ?? '—')}</span>
                      </div>
                    </div>
                    <span className="text-label font-mono text-warn uppercase bg-warn/10 px-2 py-0.5 rounded border border-warn/30 shrink-0">
                      Triage Pending
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* ── Read-Only Detail Drawer for Selected Item ── */}
      {selectedItem && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex justify-end"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="w-full max-w-[500px] h-full bg-surface border-l border-hair p-6 flex flex-col gap-5 shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-hair">
              <div>
                <span
                  className={`font-mono text-label uppercase px-2 py-0.5 rounded-full border ${
                    KIND_TONE[selectedItem.kind] ?? 'text-muted bg-surface border-hair'
                  }`}
                >
                  {selectedItem.kind}
                </span>
                <h2 className="text-h2 font-semibold text-heading mt-2">
                  {selectedItem.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="p-1 rounded text-muted hover:text-fg hover:bg-raised transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4 text-body">
              <div className="p-3 rounded-lg border border-hair bg-raised flex flex-col gap-1">
                <span className="text-label uppercase tracking-wider text-muted font-mono">
                  Governance Notice
                </span>
                <p className="text-label text-muted leading-relaxed">
                  Read-only management view. Item status, mitigation plans, and closure decisions
                  are managed exclusively by the Project Manager in the working register.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono text-label">
                <div className="p-3 rounded border border-hair bg-surface">
                  <span className="text-muted block">Status</span>
                  <span className="text-fg font-bold uppercase mt-1 block">
                    {selectedItem.status}
                  </span>
                </div>
                <div className="p-3 rounded border border-hair bg-surface">
                  <span className="text-muted block">Exposure Index</span>
                  <span className="text-fg font-bold mt-1 block">
                    {selectedItem.exposure !== null ? selectedItem.exposure.toFixed(1) : '—'}
                  </span>
                </div>
                <div className="p-3 rounded border border-hair bg-surface">
                  <span className="text-muted block">Responsible Owner</span>
                  <span className="text-fg font-bold mt-1 block">
                    {selectedItem.owner || 'Unassigned'}
                  </span>
                </div>
                <div className="p-3 rounded border border-hair bg-surface">
                  <span className="text-muted block">Due Date</span>
                  <span className="text-fg font-bold mt-1 block">
                    {selectedItem.due_date || 'No deadline'}
                  </span>
                </div>
              </div>

              {selectedItem.description && (
                <div>
                  <span className="text-label uppercase tracking-wider text-muted font-mono block mb-1">
                    Description &amp; Context
                  </span>
                  <p className="text-body text-fg leading-relaxed whitespace-pre-wrap p-3 rounded bg-surface border border-hair">
                    {selectedItem.description}
                  </p>
                </div>
              )}

              {selectedItem.linked_activity_ids?.length > 0 && (
                <div>
                  <span className="text-label uppercase tracking-wider text-muted font-mono block mb-1">
                    Linked Schedule Activities
                  </span>
                  <div className="flex flex-wrap gap-1.5 font-mono text-label">
                    {selectedItem.linked_activity_ids.map((act) => (
                      <span
                        key={act}
                        className="px-2 py-0.5 rounded bg-raised border border-hair text-fg"
                      >
                        {act}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedItem.source_note && (
                <div className="text-label font-mono text-muted border-t border-hair pt-3">
                  Source: {selectedItem.source_note}
                </div>
              )}
            </div>

            <div className="mt-auto pt-4 border-t border-hair flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 rounded bg-raised hover:bg-selected border border-hair text-fg text-body transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
