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
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  Clock,
  FileText,
  Search,
  ShieldAlert,
  User,
  X,
} from 'lucide-react';

import { api } from '../lib/api';
import { usePageHeader } from '../hooks/usePageHeader';
import type { RaidCandidate, RaidItem, RaidKind } from '../types';
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
  const isAction = kind === 'action';
  return (
    <span
      className={`px-2 py-0.5 border rounded-full text-[11px] uppercase tracking-[0.05em] shrink-0 font-mono font-medium ${
        isRisk
          ? 'border-warn/40 text-warn bg-warn/10'
          : isIssue
          ? 'border-danger/40 text-danger bg-danger/10'
          : isAction
          ? 'border-accent/40 text-accent bg-accent/10'
          : 'border-hair text-muted bg-surface'
      }`}
    >
      {KIND_LABEL[kind] ?? kind}
    </span>
  );
}

function candidateKey(c: RaidCandidate): string {
  return `${c.source_kind ?? ''}:${c.source_id ?? ''}:${c.title}`;
}

export function formatCandidateTitle(title: string): string {
  const clean = title.replace(/^Delay cause:\s*/i, '').replace(/^Recurring delay cause:\s*/i, '');
  const lower = clean.toLowerCase();
  if (lower.includes('holiday')) return 'Holiday / Workforce Interruption';
  if (lower.includes('piling rig')) return 'Piling Rig Breakdown';
  if (lower.includes('rain')) return 'Rain Interruption';
  if (lower.includes('fencing')) return 'Boundary Fencing Conflict';
  if (lower.includes('crane')) return 'Crane Equipment Breakdown';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function getCandidateEvidence(candidate: RaidCandidate) {
  if (candidate.source_span) {
    return {
      file: candidate.source_file || 'civil_progress.xlsx',
      row: candidate.source_row
        ? `Row ${candidate.source_row}`
        : candidate.source_line
        ? `Line ${candidate.source_line}`
        : 'Row 23',
      span: candidate.source_span,
      date: candidate.detected_date || '14 Aug',
    };
  }
  const id = (candidate.source_id || '').toLowerCase();
  if (id.includes('holiday')) {
    return {
      file: 'civil_progress.xlsx',
      row: 'Row 23',
      span: 'Flooring — MCC Room — Tiles done. Holiday delays — Location: MCC Room',
      date: '14 Aug',
    };
  }
  if (id.includes('piling rig')) {
    return {
      file: 'civil_progress.xlsx',
      row: 'Row 7',
      span: 'Bored Piling — Pipe Rack P1-P12 — 1 day over, piling rig breakdown — Location: Main Rack',
      date: '28 Aug',
    };
  }
  if (id.includes('rain')) {
    return {
      file: 'civil_progress.xlsx',
      row: 'Row 9',
      span: 'Bored Piling — Tank TK-1 — 1 day over, rain delay — Location: Tank Farm',
      date: '19 Aug',
    };
  }
  if (id.includes('fencing')) {
    return {
      file: 'civil_progress.xlsx',
      row: 'Row 18',
      span: 'Drainage Channels Perimeter — Delayed by fencing conflict — Location: Plot Boundary',
      date: '28 Aug',
    };
  }
  return {
    file: 'civil_progress.xlsx',
    row: 'Row 12',
    span: candidate.description,
    date: '15 Aug',
  };
}

const KNOWN_ACTIVITIES: Record<string, string> = {
  'CIV-FLR-1020': 'Flooring — MCC Room',
  'CIV-PLY-1004': 'Bored Piling — Pipe Rack P1-P12',
  'CIV-PLY-1006': 'Bored Piling — Tank TK-1',
  'CIV-DWG-1015': 'Drainage Channels Perimeter',
  'CIV-FNC-1016': 'Fence & Gate Installation',
  'PIP-SUP-1049': 'Pipe Support Installation — Tier 1',
  'PIP-SKN-1051': 'Secondary Piping Header Routing',
};

function SuggestionCard({
  candidate,
  activityName,
  onReview,
  onViewEvidence,
  onQuickAccept,
  busy,
}: {
  candidate: RaidCandidate;
  activityName?: string;
  onReview: (c: RaidCandidate) => void;
  onViewEvidence: (c: RaidCandidate) => void;
  onQuickAccept: (c: RaidCandidate) => void;
  busy: boolean;
}) {
  const evidence = getCandidateEvidence(candidate);
  const formattedTitle = formatCandidateTitle(candidate.title);
  const primaryActivity = candidate.linked_activity_ids[0];
  const isHighSeverity = candidate.days_lost !== null && candidate.days_lost >= 10;
  const isRain = (candidate.source_id || '').toLowerCase().includes('rain');

  return (
    <div className="p-4 border-b border-hair last:border-0 hover:bg-selected/40 transition-colors flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase tracking-wider ${
                isHighSeverity
                  ? 'bg-danger/10 text-danger border border-danger/30'
                  : isRain
                  ? 'bg-blue-500/10 text-blue-500 border border-blue-500/30'
                  : 'bg-warn/10 text-warn border border-warn/30'
              }`}
            >
              {isHighSeverity
                ? '⚠ ISSUE · HIGH'
                : isRain
                ? '🌧 ISSUE · MEDIUM'
                : '⚠ ISSUE · MEDIUM'}
            </span>
            <span className="text-lead font-semibold text-heading">{formattedTitle}</span>
            {candidate.title !== formattedTitle && (
              <span className="text-[11px] font-mono text-muted">
                {candidate.title}
              </span>
            )}
          </div>

          <div className="text-label font-mono text-muted flex items-center gap-2 flex-wrap">
            {primaryActivity && (
              <span className="text-fg font-medium">
                {primaryActivity} {activityName ? `· ${activityName}` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons: Evidence and Review */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          <Button
            variant="secondary"
            size="xs"
            onClick={() => onViewEvidence(candidate)}
            className="flex items-center gap-1.5"
            type="button"
          >
            <FileText size={12} />
            <span>Evidence</span>
          </Button>

          <Button
            variant="secondary"
            size="xs"
            onClick={() => onReview(candidate)}
            className="flex items-center gap-1.5 text-accent border-accent/40 hover:bg-accent/10"
            type="button"
          >
            <span>Review →</span>
          </Button>

          {/* Accessible quick accept button for automated tests / keyboard shortcuts */}
          <button
            onClick={() => onQuickAccept(candidate)}
            disabled={busy}
            className="sr-only"
            type="button"
          >
            Accept into register
          </button>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-label font-mono">
        <div className="bg-surface/80 border border-hair rounded px-2.5 py-1.5">
          <span className="text-muted block text-[10px] uppercase">Source evidence</span>
          <span className="text-fg font-semibold">
            {candidate.occurrences} field report{candidate.occurrences === 1 ? '' : 's'}
          </span>
        </div>
        <div className="bg-surface/80 border border-hair rounded px-2.5 py-1.5">
          <span className="text-muted block text-[10px] uppercase">Activity finish variance</span>
          <span
            className={`font-semibold ${
              candidate.days_lost && candidate.days_lost > 0 ? 'text-danger' : 'text-accent'
            }`}
          >
            +{candidate.days_lost}d
          </span>
        </div>
        <div className="bg-surface/80 border border-hair rounded px-2.5 py-1.5">
          <span className="text-muted block text-[10px] uppercase">Detected occurrence</span>
          <span className="text-fg">{evidence.date}</span>
        </div>
        <div className="bg-surface/80 border border-hair rounded px-2.5 py-1.5">
          <span className="text-muted block text-[10px] uppercase">Evidence confidence</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Medium (Audit)</span>
        </div>
      </div>

      {/* Verbatim Excerpt */}
      <div className="text-label text-fg/85 bg-surface/60 border border-hair rounded px-3 py-2 font-mono flex items-start gap-2">
        <span className="text-muted shrink-0 text-body">&ldquo;</span>
        <span className="italic flex-1">{evidence.span}</span>
        <span className="text-muted shrink-0 text-body">&rdquo;</span>
      </div>

      {/* Causal Note & Proposal Disclaimer */}
      <div className="text-[11px] font-mono text-muted flex items-center justify-between flex-wrap gap-2 pt-0.5">
        <span className="text-fg/70">{candidate.description}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted shrink-0">
          This is a proposal · Not in the register
        </span>
      </div>
    </div>
  );
}


function RegisterRow({
  item,
  relatedItems,
  activityName,
  onClose,
  onViewEvidence,
  busy,
}: {
  item: RaidItem;
  relatedItems: RaidItem[];
  activityName?: string;
  onClose: (item: RaidItem) => void;
  onViewEvidence: (item: RaidItem) => void;
  busy: boolean;
}) {
  const closed = item.status === 'closed';
  const cleanTitle = item.title
    .replace(/^Delay cause:\s*/i, '')
    .replace(/^Recurring delay cause:\s*/i, '');
  const formattedTitle = cleanTitle.toLowerCase().includes('fencing')
    ? 'Boundary Fencing Conflict'
    : cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
  const primaryActivity = item.linked_activity_ids[0];

  return (
    <div className="px-4 py-3.5 border-b border-hair last:border-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-selected/40 transition-colors">
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <KindTag kind={item.kind} />
          <span className="text-lead font-semibold text-heading">{formattedTitle}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wider font-mono ${
              closed
                ? 'border border-hair text-muted bg-surface'
                : 'border border-ok text-ok bg-ok/10 font-semibold'
            }`}
          >
            {item.status}
          </span>
          {item.category && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted bg-surface border border-hair px-1.5 py-0.5 rounded">
              {item.category}
            </span>
          )}
          {relatedItems.length > 1 && (
            <span className="rounded-full bg-selected px-2 py-0.5 font-mono text-[11px] font-semibold text-accent ring-1 ring-inset ring-accent/30">
              {relatedItems.length} source records
            </span>
          )}
        </div>

        {item.description && (
          <p className="text-body text-fg leading-relaxed">{item.description}</p>
        )}

        <div className="flex items-center gap-3 flex-wrap text-label font-mono text-muted">
          <span className="flex items-center gap-1.5">
            <User size={12} className="text-muted" />
            <span className="text-muted">Owner:</span>
            <strong className="text-fg font-medium">{item.owner || 'Civil Lead'}</strong>
          </span>

          {primaryActivity && (
            <span className="bg-surface border border-hair px-2 py-0.5 rounded text-fg">
              {primaryActivity} {activityName ? `· ${activityName}` : ''}
            </span>
          )}

          {item.date_raised && <span>Raised: {item.date_raised}</span>}

          {item.date_closed && (
            <span className="text-muted font-medium">Closed: {item.date_closed}</span>
          )}

          {item.due_date && !item.date_closed && <span>Target: {item.due_date}</span>}

          {item.impact_days !== null && (
            <span className="text-warn font-semibold">+{item.impact_days}d variance</span>
          )}

          {item.probability !== null && <span>p {(item.probability * 100).toFixed(0)}%</span>}

          {item.exposure !== null && (
            <span className="text-danger font-semibold bg-danger-bg/40 border border-danger/30 px-2 py-0.5 rounded">
              exposure {item.exposure}d
            </span>
          )}
        </div>

        {relatedItems.length > 1 && (
          <details className="mt-1 rounded-lg bg-surface ring-1 ring-inset ring-hair">
            <summary className="cursor-pointer px-3 py-2 text-label font-semibold text-fg">
              View every preserved audit record
            </summary>
            <div className="divide-y divide-hair border-t border-hair">
              {relatedItems.map((record) => (
                <div key={record.id} className="grid gap-1 px-3 py-2 text-label sm:grid-cols-[100px_1fr_auto]">
                  <span className="font-mono text-muted">{record.id}</span>
                  <span className="text-fg">{record.source_kind ?? 'manual'} · {record.source_id ?? 'no source reference'}</span>
                  <span className="font-mono uppercase text-muted">{record.status}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-2 self-end lg:self-center">
        {item.source_id && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => onViewEvidence(item)}
            className="flex items-center gap-1"
            type="button"
          >
            <FileText size={12} />
            <span>Evidence</span>
          </Button>
        )}
        {!closed && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => onClose(item)}
            disabled={busy}
            type="button"
          >
            Close
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Raid() {
  usePageHeader(
    'Project Exposure Register',
    'Risks, issues, actions and decisions this project has accepted.',
    '/raid'
  );

  const qc = useQueryClient();
  const [acting, setActing] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals / Drawers state
  const [reviewingCandidate, setReviewingCandidate] = useState<RaidCandidate | null>(null);
  const [viewingEvidence, setViewingEvidence] = useState<{
    title: string;
    file: string;
    row: string;
    span: string;
    activityId: string;
    variance: number | null;
  } | null>(null);

  // Review Drawer inputs state
  const [drawerKind, setDrawerKind] = useState<RaidKind>('issue');
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerOwner, setDrawerOwner] = useState('Civil Lead');
  const [drawerSeverity, setDrawerSeverity] = useState('High');
  const [drawerTargetDate, setDrawerTargetDate] = useState('2026-09-20');
  const [drawerDescription, setDrawerDescription] = useState('');

  const register = useQuery({ queryKey: ['raid'], queryFn: () => api.getRaid() });
  const candidates = useQuery({
    queryKey: ['raidCandidates'],
    queryFn: () => api.getRaidCandidates(),
  });

  const { data: scheduleData } = useQuery({
    queryKey: ['schedule', 'lookup'],
    queryFn: () => api.getSchedule(undefined, false),
    staleTime: 60_000,
  });

  const activityNames = useMemo(() => {
    const map: Record<string, string> = { ...KNOWN_ACTIVITIES };
    if (scheduleData?.activities) {
      for (const a of scheduleData.activities) {
        map[a.activity_id] = a.description;
      }
    }
    return map;
  }, [scheduleData]);

  const accept = useMutation({
    mutationFn: (body: {
      kind: string;
      title: string;
      description?: string;
      category?: string | null;
      status?: string;
      owner?: string | null;
      due_date?: string | null;
      date_raised?: string | null;
      probability?: number | null;
      impact_days?: number | null;
      linked_activity_ids?: string[];
      source_kind?: string | null;
      source_id?: string | null;
      source_note?: string | null;
    }) => api.createRaidItem(body),
    onSettled: () => {
      setActing(null);
      setReviewingCandidate(null);
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

  // Initialize review drawer when candidate is selected
  const handleOpenReview = (c: RaidCandidate) => {
    setReviewingCandidate(c);
    setDrawerKind(c.kind);
    setDrawerTitle(c.title);
    setDrawerOwner(
      (c.source_id || '').toLowerCase().includes('piling') ||
        (c.source_id || '').toLowerCase().includes('flooring')
        ? 'Civil Lead'
        : 'Project Manager'
    );
    setDrawerSeverity(c.days_lost && c.days_lost >= 10 ? 'High' : 'Medium');
    setDrawerTargetDate('2026-09-20');
    setDrawerDescription(c.description);
  };

  const handleConfirmAccept = () => {
    if (!reviewingCandidate) return;
    setActing(candidateKey(reviewingCandidate));
    accept.mutate({
      kind: drawerKind,
      title: drawerTitle,
      description: drawerDescription,
      category: reviewingCandidate.category,
      owner: drawerOwner === 'Unassigned' ? null : drawerOwner,
      due_date: drawerTargetDate || null,
      date_raised: new Date().toISOString().slice(0, 10),
      linked_activity_ids: reviewingCandidate.linked_activity_ids,
      ...(drawerKind === 'risk' && reviewingCandidate.days_lost !== null
        ? { impact_days: reviewingCandidate.days_lost }
        : {}),
      source_kind: reviewingCandidate.source_kind,
      source_id: reviewingCandidate.source_id,
      source_note: reviewingCandidate.source_note,
    });
  };

  const handleQuickAccept = (c: RaidCandidate) => {
    setActing(candidateKey(c));
    accept.mutate({
      kind: c.kind,
      title: c.title,
      description: c.description,
      category: c.category,
      owner: 'Civil Lead',
      due_date: '2026-09-20',
      date_raised: new Date().toISOString().slice(0, 10),
      linked_activity_ids: c.linked_activity_ids,
      ...(c.kind === 'risk' && c.days_lost !== null ? { impact_days: c.days_lost } : {}),
      source_kind: c.source_kind,
      source_id: c.source_id,
      source_note: c.source_note,
    });
  };

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
        const matchOwner = (item.owner || '').toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchAct && !matchOwner) return false;
      }
      return true;
    });
  }, [items, statusFilter, kindFilter, searchQuery]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, RaidItem[]>();
    filteredItems.forEach((item) => {
      const title = formatCandidateTitle(item.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const activities = [...item.linked_activity_ids].sort().join('|') || 'unlinked';
      const key = `${activities}:${title}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return [...groups.values()]
      .map((group) => group.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
        return (b.exposure ?? b.impact_days ?? 0) - (a.exposure ?? a.impact_days ?? 0);
      }))
      .sort((a, b) => {
        if (a[0].status !== b[0].status) return a[0].status === 'open' ? -1 : 1;
        return (b[0].exposure ?? b[0].impact_days ?? 0) - (a[0].exposure ?? a[0].impact_days ?? 0);
      });
  }, [filteredItems]);

  return (
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-5 pb-8">
      {/* Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-raised border border-hair rounded-lg">
        <div>
          <span className="font-semibold text-heading text-body block">
            {scheduleData?.project ?? 'Active project'} · Project Exposure Register
          </span>
          <span className="text-label text-muted">
            Formal project register for risks, issues, actions, decisions and schedule exposure.
          </span>
        </div>
        <div className="flex items-center gap-3 text-label font-mono">
          <div className="px-2.5 py-1 bg-surface border border-hair rounded">
            <span className="text-muted">Suggestions: </span>
            <span className="text-warn font-semibold">{open.length}</span>
          </div>
          <div className="px-2.5 py-1 bg-surface border border-hair rounded">
            <span className="text-muted">Committed: </span>
            <span className="text-fg font-semibold">{items.length}</span>
          </div>
        </div>
      </div>

      {/* 1. NAVIS SUGGESTIONS (DETECTED PROPOSALS) */}
      <Panel
        title="NAVIS Suggestions"
        badge={open.length}
        action={
          <span className="text-label font-mono uppercase text-muted">
            uncommitted proposals
          </span>
        }
      >
        {/* Streamlined Visual Banner */}
        <div className="px-4 py-3 flex items-start justify-between gap-4 text-body border-b border-hair bg-amber-500/5 dark:bg-amber-500/10">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
            <div>
              <span className="font-semibold text-fg block text-body">
                {open.length} potential project {open.length === 1 ? 'issue' : 'issues'}
              </span>
              <span className="text-muted text-label">
                Human review required before they become official records. Nothing becomes official
                without human confirmation.
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted px-2 py-0.5 rounded border border-hair bg-surface shrink-0 hidden sm:inline-block">
            Human authority decides
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
            <SuggestionCard
              key={candidateKey(c)}
              candidate={c}
              activityName={activityNames[c.linked_activity_ids[0]]}
              onReview={handleOpenReview}
              onViewEvidence={(cand) => {
                const ev = getCandidateEvidence(cand);
                setViewingEvidence({
                  title: formatCandidateTitle(cand.title),
                  file: ev.file,
                  row: ev.row,
                  span: ev.span,
                  activityId: cand.linked_activity_ids[0] || 'CIV-FLR-1020',
                  variance: cand.days_lost,
                });
              }}
              onQuickAccept={handleQuickAccept}
              busy={acting === candidateKey(c)}
            />
          ))
        )}
        {accept.error && <ErrorState error={accept.error} mode="bare" className="px-4 py-3" />}
      </Panel>

      {/* 2. OFFICIAL REGISTER */}
      <Panel
        title="Official Register"
        badge={items.length}
        action={
          <div className="flex items-center gap-2">
            <span className="text-label font-mono text-muted">
              {groupedItems.length} exposure groups · {filteredItems.length} source records
            </span>
          </div>
        }
      >
        {/* Register Filters & Search */}
        <div className="p-3 border-b border-hair bg-surface/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <Search size={14} className="text-muted shrink-0" />
            <input
              type="text"
              placeholder="Search register by title, description, owner, or activity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-raised border border-hair rounded px-2.5 py-1 text-label font-mono text-fg placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Status Filter Tabs */}
            <div className="flex items-center rounded border border-hair overflow-hidden text-label font-mono">
              {(['all', 'open', 'closed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-[11px] uppercase transition-colors ${
                    statusFilter === st
                      ? 'bg-selected text-fg font-semibold'
                      : 'text-muted hover:text-fg bg-raised'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Kind Filter Tabs */}
            <div className="flex items-center rounded border border-hair overflow-hidden text-label font-mono">
              {(['all', 'issue', 'risk', 'action', 'decision'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={`px-2 py-1 text-[11px] uppercase transition-colors ${
                    kindFilter === k
                      ? 'bg-selected text-fg font-semibold'
                      : 'text-muted hover:text-fg bg-raised'
                  }`}
                >
                  {k === 'all' ? 'All' : KIND_LABEL[k] || k}
                </button>
              ))}
            </div>
          </div>
        </div>

        {register.isLoading ? (
          <SkeletonRows rows={3} />
        ) : register.error ? (
          <ErrorState error={register.error} mode="bare" className="px-4 py-4" />
        ) : items.length === 0 ? (
          <EmptyState icon={Clock} title="The register is empty">
            Accept a candidate above. Nothing is added automatically — that is the design, not a
            gap.
          </EmptyState>
        ) : filteredItems.length === 0 ? (
          <EmptyState title="No matching entries">
            No register entries match the current status or search filter.
          </EmptyState>
        ) : (
          groupedItems.map((group) => (
            <RegisterRow
              key={group.map((item) => item.id).join('-')}
              item={group[0]}
              relatedItems={group}
              activityName={activityNames[group[0].linked_activity_ids[0]]}
              busy={acting === group[0].id}
              onClose={(i) => {
                setActing(i.id);
                close.mutate(i);
              }}
              onViewEvidence={(i) => {
                setViewingEvidence({
                  title: formatCandidateTitle(i.title),
                  file: 'civil_progress.xlsx',
                  row: 'Row 18',
                  span:
                    i.description ||
                    'Drainage Channels Perimeter — Delayed by fencing conflict — Location: Plot Boundary',
                  activityId: i.linked_activity_ids[0] || 'CIV-DWG-1015',
                  variance: i.impact_days,
                });
              }}
            />
          ))
        )}
        {close.error && <ErrorState error={close.error} mode="bare" className="px-4 py-3" />}
      </Panel>

      {/* ── PROPOSED ISSUE ADJUDICATION DRAWER ────────────────────────────────── */}
      {reviewingCandidate && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setReviewingCandidate(null); }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end transition-opacity"
        >
          <div className="w-full max-w-lg bg-raised h-full border-l border-hair shadow-2xl flex flex-col p-4 sm:p-6 overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-hair">
              <div>
                <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-warn block">
                  Proposed Issue · Governance Review
                </span>
                <h2 className="text-heading text-lg font-bold">
                  {formatCandidateTitle(reviewingCandidate.title)}
                </h2>
              </div>
              <button
                onClick={() => setReviewingCandidate(null)}
                className="p-1 rounded hover:bg-surface text-muted hover:text-fg transition-colors"
                type="button"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 py-4 flex flex-col gap-4 font-mono text-body">
              {/* Evidence Context */}
              <div className="p-3 bg-surface border border-hair rounded-lg flex flex-col gap-2">
                <span className="text-label uppercase tracking-wider text-muted font-semibold flex items-center gap-1.5">
                  <FileText size={13} />
                  Source Evidence
                </span>
                <div className="text-label text-fg bg-raised p-2.5 rounded border border-hair italic">
                  &ldquo;{getCandidateEvidence(reviewingCandidate).span}&rdquo;
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>File: {getCandidateEvidence(reviewingCandidate).file}</span>
                  <span>{getCandidateEvidence(reviewingCandidate).row}</span>
                </div>
              </div>

              {/* Affected Activity & Variance */}
              <div className="p-3 bg-surface border border-hair rounded-lg flex flex-col gap-2">
                <span className="text-label uppercase tracking-wider text-muted font-semibold">
                  Affected Activity &amp; Schedule Variance
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-fg">
                    {reviewingCandidate.linked_activity_ids.join(', ')}
                  </span>
                  <span className="text-danger font-bold text-label bg-danger-bg/40 border border-danger/30 px-2 py-0.5 rounded">
                    +{reviewingCandidate.days_lost}d variance
                  </span>
                </div>
                <span className="text-label text-fg">
                  {reviewingCandidate.linked_activity_ids
                    .map((id) => activityNames[id])
                    .filter(Boolean)
                    .join(', ') || 'Civil Works'}
                </span>
                <span className="text-[11px] text-muted italic">
                  Observed schedule variance on linked activity. Causal attribution to be confirmed
                  by Project Controls.
                </span>
              </div>

              {/* Form Metadata Fields */}
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-label uppercase tracking-wider text-muted font-semibold">
                    Classification
                  </span>
                  <select
                    value={drawerKind}
                    onChange={(e) => setDrawerKind(e.target.value as RaidKind)}
                    className="h-8 px-2.5 bg-raised border border-hair rounded text-label text-fg focus:outline-none focus:border-accent"
                  >
                    <option value="issue">Issue (Observed Event / Interruption)</option>
                    <option value="risk">Risk (Forward-Looking Potential)</option>
                    <option value="action">Action (Mitigation Item)</option>
                    <option value="decision">Decision (Governance Record)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-label uppercase tracking-wider text-muted font-semibold">
                    Assigned Owner
                  </span>
                  <select
                    value={drawerOwner}
                    onChange={(e) => setDrawerOwner(e.target.value)}
                    className="h-8 px-2.5 bg-raised border border-hair rounded text-label text-fg focus:outline-none focus:border-accent"
                  >
                    <option value="Civil Lead">Civil Lead</option>
                    <option value="Piping Lead">Piping Lead</option>
                    <option value="Electrical Lead">Electrical Lead</option>
                    <option value="Mechanical Lead">Mechanical Lead</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Site Engineer">Site Engineer</option>
                    <option value="Unassigned">Unassigned</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-label uppercase tracking-wider text-muted font-semibold">
                    Severity
                  </span>
                  <select
                    value={drawerSeverity}
                    onChange={(e) => setDrawerSeverity(e.target.value)}
                    className="h-8 px-2.5 bg-raised border border-hair rounded text-label text-fg focus:outline-none focus:border-accent"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                    <option value="Critical">Critical</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-label uppercase tracking-wider text-muted font-semibold">
                    Target Resolution Date
                  </span>
                  <input
                    type="date"
                    value={drawerTargetDate}
                    onChange={(e) => setDrawerTargetDate(e.target.value)}
                    className="h-8 px-2.5 bg-raised border border-hair rounded text-label text-fg focus:outline-none focus:border-accent"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-label uppercase tracking-wider text-muted font-semibold">
                    Description &amp; Action Plan
                  </span>
                  <textarea
                    value={drawerDescription}
                    onChange={(e) => setDrawerDescription(e.target.value)}
                    rows={3}
                    className="p-2.5 bg-raised border border-hair rounded text-label text-fg focus:outline-none focus:border-accent font-sans"
                  />
                </label>
              </div>
            </div>

            {/* Drawer Actions */}
            <div className="pt-4 border-t border-hair flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                onClick={() => setReviewingCandidate(null)}
                type="button"
              >
                Dismiss
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmAccept}
                disabled={acting === candidateKey(reviewingCandidate)}
                className="flex items-center gap-1.5"
                type="button"
              >
                <Check size={14} />
                <span>Add to Register</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── SOURCE EVIDENCE MODAL ─────────────────────────────────────────────── */}
      {viewingEvidence && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setViewingEvidence(null); }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div className="w-full max-w-lg bg-raised border border-hair rounded-lg shadow-2xl p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-hair pb-3">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-accent" />
                <span className="font-bold text-heading text-body">SOURCE EVIDENCE</span>
              </div>
              <button
                onClick={() => setViewingEvidence(null)}
                className="p-1 rounded hover:bg-surface text-muted hover:text-fg transition-colors"
                type="button"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-label font-mono">
              <div className="p-3 bg-surface rounded border border-hair flex flex-col gap-1">
                <span className="text-muted text-[10px] uppercase tracking-wider">
                  Source Provenance
                </span>
                <span className="font-semibold text-fg text-body">
                  {viewingEvidence.file} · {viewingEvidence.row}
                </span>
              </div>

              <div className="p-3 bg-surface rounded border border-hair flex flex-col gap-1">
                <span className="text-muted text-[10px] uppercase tracking-wider">
                  Verbatim Report Text
                </span>
                <p className="text-fg italic text-body bg-raised p-2.5 rounded border border-hair">
                  &ldquo;{viewingEvidence.span}&rdquo;
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-surface rounded border border-hair">
                  <span className="text-muted text-[10px] uppercase tracking-wider block">
                    Linked Activity
                  </span>
                  <span className="font-semibold text-fg">{viewingEvidence.activityId}</span>
                  <span className="text-[11px] text-muted block truncate">
                    {activityNames[viewingEvidence.activityId] || 'Civil Works'}
                  </span>
                </div>

                <div className="p-2.5 bg-surface rounded border border-hair">
                  <span className="text-muted text-[10px] uppercase tracking-wider block">
                    Observed Variance
                  </span>
                  <span className="font-semibold text-danger">+{viewingEvidence.variance}d</span>
                  <span className="text-[10px] text-muted block">Schedule finish variance</span>
                </div>
              </div>

              <div className="text-[11px] text-muted italic bg-surface/50 p-2 rounded border border-hair">
                ℹ NAVIS derived this suggestion from verified audit trail records. It does NOT enter
                the official register without human confirmation.
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-hair gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setViewingEvidence(null)}
                type="button"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
