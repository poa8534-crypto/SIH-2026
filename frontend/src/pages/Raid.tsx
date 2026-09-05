/**
 * The RAID register, and the adjudication step that fills it.
 *
 * Grounded in authentic project data:
 * Project: Oil India Limited — Well Pad 04
 *
 * The system proposes candidates detected from audit evidence and daily reports;
 * the Planning Engineer adjudicates whether to accept them into the permanent register.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Clock, Filter, Flame, Search, ShieldAlert } from 'lucide-react';

import { api } from '../lib/api';
import { usePageHeader } from '../hooks/usePageHeader';
import type { RaidCandidate, RaidItem } from '../types';
import {
  Button,
  EmptyState,
  ErrorState,
  Panel,
  SkeletonRows,
} from '../components/ui';

const KIND_LABEL: Record<string, string> = {
  risk: 'Risk',
  issue: 'Issue',
  action: 'Action',
  decision: 'Decision',
};

function KindTag({ kind }: { kind: string }) {
  const isRisk = kind === 'risk';
  const isIssue = kind === 'issue';
  return (
    <span
      className={`px-2 py-0.5 border rounded-full text-label uppercase tracking-[0.05em] shrink-0 font-mono ${
        isRisk
          ? 'border-warn/40 text-warn bg-warn/10'
          : isIssue
          ? 'border-danger/40 text-danger bg-danger/10'
          : 'border-hair text-muted'
      }`}
    >
      {KIND_LABEL[kind] ?? kind}
    </span>
  );
}

function candidateKey(c: RaidCandidate): string {
  return `${c.source_kind ?? ''}:${c.source_id ?? ''}:${c.title}`;
}

function CandidateRow({
  candidate,
  onAccept,
  busy,
}: {
  candidate: RaidCandidate;
  onAccept: (c: RaidCandidate) => void;
  busy: boolean;
}) {
  return (
    <div className="px-4 py-3.5 border-b border-hair last:border-0 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-selected transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <KindTag kind={candidate.kind} />
          <span className="text-lead font-medium text-heading">{candidate.title}</span>
        </div>
        <p className="mt-1 text-body text-fg leading-relaxed">{candidate.description}</p>
        <div className="mt-1.5 flex items-center gap-3 flex-wrap text-label font-mono uppercase text-muted">
          {candidate.occurrences !== null && (
            <span className="bg-surface border border-hair px-2 py-0.5 rounded">
              {candidate.occurrences} report{candidate.occurrences === 1 ? '' : 's'}
            </span>
          )}
          {candidate.days_lost !== null && (
            <span className="text-danger font-semibold bg-danger-bg/40 border border-danger/30 px-2 py-0.5 rounded">
              {candidate.days_lost}d lost
            </span>
          )}
          {candidate.linked_activity_ids.map((id) => (
            <span key={id} className="text-fg bg-surface border border-hair px-2 py-0.5 rounded">
              Activity: {id}
            </span>
          ))}
        </div>
        {candidate.source_note && (
          <p className="mt-1.5 text-label text-muted italic font-mono">{candidate.source_note}</p>
        )}
      </div>
      <div className="shrink-0 self-end sm:self-center">
        <Button
          variant="primary"
          onClick={() => onAccept(candidate)}
          disabled={busy}
        >
          Accept into register
        </Button>
      </div>
    </div>
  );
}

function RegisterRow({
  item,
  onClose,
  busy,
}: {
  item: RaidItem;
  onClose: (item: RaidItem) => void;
  busy: boolean;
}) {
  const closed = item.status === 'closed';
  return (
    <div className="px-4 py-3.5 border-b border-hair last:border-0 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-selected transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <KindTag kind={item.kind} />
          <span className="text-lead font-medium text-heading">{item.title}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-label uppercase tracking-[0.05em] font-mono ${
              closed
                ? 'border border-hair text-muted bg-surface'
                : 'border border-ok text-ok bg-ok/10 font-semibold'
            }`}
          >
            {item.status}
          </span>
        </div>
        {item.description && (
          <p className="mt-1 text-body text-fg leading-relaxed">{item.description}</p>
        )}
        <div className="mt-1.5 flex items-center gap-3 flex-wrap text-label font-mono uppercase text-muted">
          {item.owner ? (
            <span>Owner: <strong className="text-fg">{item.owner}</strong></span>
          ) : (
            <span className="text-muted">Unassigned owner</span>
          )}
          {item.impact_days !== null && (
            <span className="text-warn font-semibold">
              {item.impact_days}d impact
            </span>
          )}
          {item.probability !== null && (
            <span>p {(item.probability * 100).toFixed(0)}%</span>
          )}
          {item.exposure !== null && (
            <span className="text-danger font-semibold bg-danger-bg/40 border border-danger/30 px-2 py-0.5 rounded">
              exposure {item.exposure}d
            </span>
          )}
          {item.linked_activity_ids.map((id) => (
            <span key={id} className="text-fg bg-surface border border-hair px-2 py-0.5 rounded">
              {id}
            </span>
          ))}
          {item.due_date && (
            <span>Due: {item.due_date}</span>
          )}
        </div>
      </div>
      {!closed && (
        <div className="shrink-0 self-end sm:self-center">
          <Button variant="secondary" onClick={() => onClose(item)} disabled={busy}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Raid() {
  usePageHeader(
    'Exposure register',
    'Risks, issues, actions and decisions this project has accepted.',
    '/raid'
  );

  const qc = useQueryClient();
  const [acting, setActing] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const register = useQuery({ queryKey: ['raid'], queryFn: () => api.getRaid() });
  const candidates = useQuery({
    queryKey: ['raidCandidates'],
    queryFn: () => api.getRaidCandidates(),
  });

  const accept = useMutation({
    mutationFn: (c: RaidCandidate) =>
      api.createRaidItem({
        kind: c.kind,
        title: c.title,
        description: c.description,
        category: c.category,
        linked_activity_ids: c.linked_activity_ids,
        ...(c.kind === 'risk' && c.days_lost !== null
          ? { impact_days: c.days_lost }
          : {}),
        source_kind: c.source_kind,
        source_id: c.source_id,
        source_note: c.source_note,
      }),
    onSettled: () => {
      setActing(null);
      qc.invalidateQueries({ queryKey: ['raid'] });
      qc.invalidateQueries({ queryKey: ['raidCandidates'] });
    },
  });

  const close = useMutation({
    mutationFn: (item: RaidItem) =>
      api.updateRaidItem(item.id, {
        status: 'closed',
        date_closed: new Date().toISOString().slice(0, 10),
      }),
    onSettled: () => {
      setActing(null);
      qc.invalidateQueries({ queryKey: ['raid'] });
    },
  });

  const items = register.data ?? [];
  const proposals = candidates.data ?? [];
  const acceptedTitles = new Set(items.map((i) => i.title));
  const open = proposals.filter((c) => !c.committed && !acceptedTitles.has(c.title));

  // Filtered register items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q) ?? false;
        const matchAct = item.linked_activity_ids.some((id) => id.toLowerCase().includes(q));
        if (!matchTitle && !matchDesc && !matchAct) return false;
      }
      return true;
    });
  }, [items, statusFilter, kindFilter, searchQuery]);

  return (
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-5 pb-8">
      {/* Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-raised border border-hair rounded-lg">
        <div>
          <span className="font-semibold text-heading text-body block">
            Oil India Limited — Well Pad 04 · Exposure Register
          </span>
          <span className="text-label text-muted">
            Formal RAID ledger for contractual risk adjudication and float exposure.
          </span>
        </div>
        <div className="flex items-center gap-3 text-label font-mono">
          <div className="px-2.5 py-1 bg-surface border border-hair rounded">
            <span className="text-muted">Proposals: </span>
            <span className="text-warn font-semibold">{open.length}</span>
          </div>
          <div className="px-2.5 py-1 bg-surface border border-hair rounded">
            <span className="text-muted">Committed: </span>
            <span className="text-fg font-semibold">{items.length}</span>
          </div>
        </div>
      </div>

      {/* 1. DETECTED CANDIDATES */}
      <Panel
        title="Detected candidates"
        badge={open.length}
        action={
          <span className="text-label font-mono uppercase text-muted">
            proposals · not in the register
          </span>
        }
      >
        <div className="px-4 py-2.5 flex items-start gap-2.5 text-body text-muted border-b border-hair bg-surface/30">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
          <span>
            Derived from the audit trail — recurring causes the system has
            already seen. Nothing here counts until you accept it, and
            accepting is the only way a row reaches the register.
          </span>
        </div>
        {candidates.isLoading ? (
          <SkeletonRows rows={3} />
        ) : candidates.error ? (
          <ErrorState error={candidates.error} mode="bare" className="px-4 py-4" />
        ) : open.length === 0 ? (
          <EmptyState icon={Check} title="Nothing outstanding">
            Every candidate the system has detected has been adjudicated.
          </EmptyState>
        ) : (
          open.map((c) => (
            <CandidateRow
              key={candidateKey(c)}
              candidate={c}
              busy={acting === candidateKey(c)}
              onAccept={(cand) => {
                setActing(candidateKey(cand));
                accept.mutate(cand);
              }}
            />
          ))
        )}
        {accept.error && (
          <ErrorState error={accept.error} mode="bare" className="px-4 py-3" />
        )}
      </Panel>

      {/* 2. COMMITTED REGISTER */}
      <Panel
        title="Register"
        badge={items.length}
        action={
          <div className="flex items-center gap-2">
            <span className="text-label font-mono text-muted">
              {filteredItems.length} of {items.length} shown
            </span>
          </div>
        }
      >
        {/* Register Filters */}
        <div className="p-3 border-b border-hair bg-surface/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <Search size={14} className="text-muted shrink-0" />
            <input
              type="text"
              placeholder="Search register by title, description, or activity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-raised border border-hair rounded px-2.5 py-1 text-label font-mono text-fg placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-label font-mono">
              {(['all', 'open', 'closed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2 py-0.5 rounded text-[11px] uppercase transition-colors ${
                    statusFilter === st
                      ? 'bg-selected text-fg font-semibold border border-hair'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="bg-raised border border-hair rounded px-2 py-0.5 text-label font-mono text-fg focus:outline-none focus:border-accent"
            >
              <option value="all">All Kinds</option>
              <option value="risk">Risk</option>
              <option value="issue">Issue</option>
              <option value="action">Action</option>
              <option value="decision">Decision</option>
            </select>
          </div>
        </div>

        {register.isLoading ? (
          <SkeletonRows rows={3} />
        ) : register.error ? (
          <ErrorState error={register.error} mode="bare" className="px-4 py-4" />
        ) : items.length === 0 ? (
          <EmptyState icon={Clock} title="The register is empty">
            Accept a candidate above. Nothing is added automatically — that is
            the design, not a gap.
          </EmptyState>
        ) : filteredItems.length === 0 ? (
          <EmptyState title="No matching entries">
            No register entries match the current status or search filter.
          </EmptyState>
        ) : (
          filteredItems.map((item) => (
            <RegisterRow
              key={item.id}
              item={item}
              busy={acting === item.id}
              onClose={(i) => {
                setActing(i.id);
                close.mutate(i);
              }}
            />
          ))
        )}
        {close.error && (
          <ErrorState error={close.error} mode="bare" className="px-4 py-3" />
        )}
      </Panel>
    </div>
  );
}
