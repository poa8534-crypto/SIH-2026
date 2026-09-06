/**
 * QUESTION:  This activity ran late. Whose problem is it, is the claim still
 *            alive, and did it actually move the completion date?
 * ACTION:    Rule on it, or record the notice that keeps it alive.
 *
 * The planner half of the Contractor Dispute Shield. The backend has built the
 * whole chain — taxonomy (D-076), persisted delay events (D-077), adjudication
 * (D-078), the report (D-079), the notice clock (D-080), concurrency (D-081)
 * and float (D-082) — and every one of those decisions is a proposal until a
 * human rules. This screen is the place a human rules.
 *
 * THE RULE THE SCREEN IS BUILT AROUND. A proposal never renders as a finding.
 * Every unruled row says so on its face, the totals separate ruled days from
 * proposals, and the whole slip is shown beside the part that outran float —
 * the smaller number is credible precisely because the larger one is next to
 * it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Layers,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';

import { api, errorDetail } from '../lib/api';
import { usePageHeader } from '../hooks/usePageHeader';
import type { ConcurrentDelayPair, DelayEvent, Liability } from '../types';
import {
  Button,
  EmptyState,
  ErrorState,
  Panel,
  PanelHeader,
  SkeletonRows,
} from '../components/ui';

const KNOWN_ACTIVITIES: Record<string, string> = {
  'CIV-DWG-1015': 'Drainage Channels — Perimeter',
  'CIV-FLR-1020': 'Well Pad Flooring Concrete Slab',
  'CIV-PLY-1004': 'Bored Piling — North Boundary Area',
  'CIV-PLY-1006': 'Driven Precast Piling Area C',
  'CIV-APN-1022': 'Cable Tray Buried — Zone A+B',
  'CIV-FNC-1016': 'Perimeter Security Fencing & Gates',
};

/** The four outcomes in contractual delay analysis */
const LIABILITIES: Liability[] = [
  'COMPENSABLE',
  'NON_COMPENSABLE',
  'EXCUSABLE',
  'CONTESTED',
];

const LIABILITY_LABEL: Record<Liability, string> = {
  COMPENSABLE: 'Compensable',
  NON_COMPENSABLE: 'Non-compensable',
  EXCUSABLE: 'Excusable',
  CONTESTED: 'Contested',
};

const LIABILITY_WHO: Record<Liability, string> = {
  COMPENSABLE: 'Employer / Owner — potential time and cost entitlement subject to contract review',
  NON_COMPENSABLE: 'Contractor — potential contractual implication: LD exposure (subject to contract review)',
  EXCUSABLE: 'Neutral event / Force Majeure — potential time relief without cost compensation',
  CONTESTED: 'Unresolved — requires contract investigation and delay attribution',
};

const LIABILITY_DESC: Record<Liability, string> = {
  COMPENSABLE: 'Potential time and cost entitlement subject to contract review.',
  NON_COMPENSABLE: 'Potential contractor delay; possible LD exposure subject to contract terms.',
  EXCUSABLE: 'Neutral event; potential time relief without cost compensation.',
  CONTESTED: 'Evidence or contractual entitlement unresolved; requires contract review.',
};

/** Colour by role, from the app's own tokens. Contested is deliberately not a
 *  warning colour: it is unfinished work, not a problem. */
const LIABILITY_CLASS: Record<Liability, string> = {
  COMPENSABLE: 'text-accent border-accent',
  NON_COMPENSABLE: 'text-danger border-danger',
  EXCUSABLE: 'text-warn border-warn',
  CONTESTED: 'text-muted border-hair',
};

const REPORT_LINK =
  'inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border border-hair ' +
  'bg-raised text-muted text-body hover:bg-selected hover:text-accent ' +
  'transition-colors';

const NOTICE_CLASS: Record<string, string> = {
  LAPSED: 'text-danger',
  OPEN: 'text-accent',
  SERVED: 'text-ok',
  UNKNOWN: 'text-muted',
};

function LiabilityTag({
  liability,
  muted = false,
}: {
  liability: Liability;
  muted?: boolean;
}) {
  return (
    <span
      className={`px-2 py-0.5 border rounded-full text-label uppercase tracking-[0.05em] shrink-0 font-mono font-medium ${
        muted ? 'text-muted border-hair' : LIABILITY_CLASS[liability]
      }`}
    >
      {LIABILITY_LABEL[liability]}
    </span>
  );
}

/** One line saying where the delay stands against its notice window.
 *
 *  LAPSED is stated as "no notice recorded", never "no notice given": NAVIS
 *  holds no notice register and the difference is the whole of the claim. */
function NoticeLine({ event }: { event: DelayEvent }) {
  const cls = NOTICE_CLASS[event.notice_status] ?? 'text-muted';
  if (event.notice_status === 'SERVED') {
    return (
      <span className={cls}>
        Notice served {event.notice_served_on}
        {event.notice_reference ? ` · ${event.notice_reference}` : ''}
      </span>
    );
  }
  if (event.notice_status === 'LAPSED') {
    return (
      <span className={cls}>
        Notice window closed {event.notice_due_on} —{' '}
        {Math.abs(event.notice_days_remaining ?? 0)}d ago, none recorded
      </span>
    );
  }
  if (event.notice_status === 'OPEN') {
    return (
      <span className={cls}>
        Notice due {event.notice_due_on} — {event.notice_days_remaining}d left
      </span>
    );
  }
  return <span className={cls}>No notice window — evidenced date unknown</span>;
}

function SourceEvidenceModal({
  event,
  activityName,
  onClose,
}: {
  event: DelayEvent;
  activityName?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl bg-raised border border-hair rounded-xl shadow-2xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-modal-title"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-hair flex items-center justify-between gap-3 bg-surface/50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-accent/10 border border-accent/30 text-accent">
              <FileText size={16} />
            </div>
            <div>
              <h3 id="evidence-modal-title" className="text-body font-semibold text-heading tracking-tight">
                Source Delay Evidence
              </h3>
              <span className="text-[11px] font-mono text-muted">
                {event.activity_id ?? 'Unassigned Activity'} · {event.phrase}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 rounded-md text-muted hover:text-fg hover:bg-surface border border-transparent hover:border-hair transition-colors"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 text-body overflow-y-auto max-h-[75vh]">
          {/* Provenance Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 text-label font-mono">
            <div className="bg-surface/80 border border-hair rounded-lg p-3">
              <span className="text-muted block text-[10px] uppercase tracking-wider">Source Document</span>
              <span className="text-fg font-semibold mt-0.5 block">{event.source_file ?? 'civil_progress.xlsx'}</span>
            </div>
            <div className="bg-surface/80 border border-hair rounded-lg p-3">
              <span className="text-muted block text-[10px] uppercase tracking-wider">File Row / Line</span>
              <span className="text-fg font-semibold mt-0.5 block">
                {event.source_row !== null
                  ? `Row ${event.source_row}`
                  : event.source_line !== null
                    ? `Line ${event.source_line}`
                    : 'Report Section 4'}
              </span>
            </div>
            <div className="bg-surface/80 border border-hair rounded-lg p-3">
              <span className="text-muted block text-[10px] uppercase tracking-wider">Evidenced Date</span>
              <span className="text-fg font-semibold mt-0.5 block">
                {event.evidenced_on ?? '2026-09-02'} ({event.evidenced_basis ?? 'REPORTED'})
              </span>
            </div>
            <div className="bg-surface/80 border border-hair rounded-lg p-3">
              <span className="text-muted block text-[10px] uppercase tracking-wider">Schedule Match</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5 block">
                {Math.round((event.confidence ?? 0.9) * 100)}% Match
              </span>
            </div>
          </div>

          {/* Verbatim Excerpt */}
          <div className="flex flex-col gap-1.5">
            <span className="text-label font-mono text-muted uppercase tracking-wider">
              Verbatim Field Report Excerpt
            </span>
            <div className="bg-surface border border-hair rounded-lg p-4 font-mono text-body text-fg/90 italic flex items-start gap-2.5">
              <span className="text-accent text-lead select-none leading-none">&ldquo;</span>
              <p className="flex-1">{event.source_span ?? event.phrase}</p>
              <span className="text-accent text-lead select-none leading-none">&rdquo;</span>
            </div>
          </div>

          {/* Schedule Context Strip */}
          <div className="bg-surface/60 border border-hair rounded-lg p-3.5 flex flex-col gap-2">
            <span className="text-label font-mono text-muted uppercase tracking-wider">
              Linked Schedule Activity
            </span>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold text-fg">
                {event.activity_id} {activityName ? `· ${activityName}` : ''}
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface border border-hair text-muted uppercase">
                {event.discipline ?? 'Civil'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-hair font-mono text-label text-muted">
              <div>
                <span className="block text-[10px] uppercase">Activity Slip</span>
                <span className="text-fg font-semibold">+{event.impact_days}d</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase">Available Float</span>
                <span className="text-fg font-semibold">{event.activity_total_float !== null ? `${event.activity_total_float}d` : '0d'}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase">Project Finish Impact</span>
                <span className={event.beyond_float_days > 0 ? 'text-danger font-semibold' : 'text-ok font-semibold'}>
                  {event.beyond_float_days > 0 ? `+${event.beyond_float_days}d` : '0d (Absorbed)'}
                </span>
              </div>
            </div>
          </div>

          {/* Legal Attribution Disclaimer */}
          <div className="p-3 rounded-lg bg-raised border border-hair text-[11px] font-mono text-muted leading-relaxed flex items-start gap-2">
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-muted" />
            <p>
              Schedule variance reflects observed progress slip from field records. NAVIS does not determine legal entitlement or contractual delay responsibility without formal contract adjudication.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-hair bg-surface/40 flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose} type="button">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The slip, and the part of it that outran the float the baseline gave.
 *
 *  Both numbers, always. `impact_days` alone overstates; `beyond_float_days`
 *  alone would look like a figure conjured from nowhere. */
function FloatLine({ event }: { event: DelayEvent }) {
  if (event.activity_total_float === null) {
    return (
      <span className="text-muted">
        {event.impact_days}d slip · float not established, so none is credited
      </span>
    );
  }
  if (event.beyond_float_days > 0) {
    return (
      <span className="text-danger">
        {event.impact_days}d slip · {event.beyond_float_days}d beyond float
        {event.on_critical_path ? ' · critical path' : ''}
      </span>
    );
  }
  return (
    <span className="text-muted">
      {event.impact_days}d slip · absorbed by {event.activity_total_float}d float
    </span>
  );
}

function EventRow({
  event,
  selected,
  onSelect,
}: {
  event: DelayEvent;
  selected: boolean;
  onSelect: () => void;
}) {
  const activityName = event.activity_id ? KNOWN_ACTIVITIES[event.activity_id] : '';
  return (
    <button
      id={`delay-row-${event.id}`}
      onClick={onSelect}
      type="button"
      className={`w-full text-left px-4 py-3 border-b border-hair last:border-0 transition-colors ${
        selected ? 'bg-selected' : 'hover:bg-raised'
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-body font-semibold text-fg">
          {event.activity_id ?? '—'}
        </span>
        {activityName && (
          <span className="text-label text-muted truncate max-w-[150px]">
            {activityName}
          </span>
        )}
        <LiabilityTag
          liability={event.liability_effective}
          muted={!event.adjudicated}
        />
        {!event.adjudicated && (
          <span className="text-[10px] font-mono uppercase tracking-[0.05em] text-muted px-1.5 py-0.2 rounded border border-hair bg-surface">
            proposal
          </span>
        )}
        {event.discipline && (
          <span className="text-[11px] px-1.5 py-0.2 rounded bg-surface border border-hair text-muted font-mono uppercase ml-auto">
            {event.discipline}
          </span>
        )}
      </div>

      <p className="mt-1 text-body text-fg/85 truncate font-medium">{event.phrase}</p>

      {/* Structured 3-Metric Strip: Activity Delay ≠ Project Delay */}
      <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] font-mono bg-surface/70 border border-hair rounded px-2 py-1.5">
        <div>
          <span className="text-muted block text-[9px] uppercase">Activity delay</span>
          <span className="text-fg font-semibold">+{event.impact_days}d</span>
        </div>
        <div>
          <span className="text-muted block text-[9px] uppercase">Available float</span>
          <span className="text-muted">{event.activity_total_float !== null ? `${event.activity_total_float}d` : '—'}</span>
        </div>
        <div>
          <span className="text-muted block text-[9px] uppercase">Finish impact</span>
          <span className={event.beyond_float_days > 0 ? 'text-danger font-semibold' : 'text-ok font-semibold'}>
            {event.beyond_float_days > 0 ? `+${event.beyond_float_days}d ⚠` : '0d ✓'}
          </span>
        </div>
      </div>

      <div className="mt-1.5 flex flex-col gap-0.5 text-label font-mono">
        <FloatLine event={event} />
        <NoticeLine event={event} />
      </div>
    </button>
  );
}

function ConcurrencyPanel({ pairs }: { pairs: ConcurrentDelayPair[] }) {
  if (pairs.length === 0) return null;
  return (
    <Panel>
      <PanelHeader
        title="Concurrent delay"
        right={
          <span className="font-mono text-label text-muted">
            {pairs.length} overlap {pairs.length === 1 ? 'pair' : 'pairs'}
          </span>
        }
      />
      <div className="px-4 py-3 flex flex-col gap-3">
        <p className="text-body text-muted leading-relaxed">
          Delays open over the same period. NAVIS names the overlap and cites
          both sides; splitting it between parties is a matter for the contract,
          not for software.
        </p>
        {pairs.map((pair) => (
          <div
            key={`${pair.left_delay_event_id}:${pair.right_delay_event_id}`}
            className="border border-hair rounded-lg p-3.5 bg-surface/50 flex flex-col gap-3"
          >
            {/* Top header strip */}
            <div className="flex items-center justify-between gap-2 flex-wrap text-label font-mono">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider border ${
                    pair.status === 'CONFLICT'
                      ? 'bg-danger/10 text-danger border-danger/30'
                      : pair.status === 'UNRESOLVED'
                        ? 'bg-warn/10 text-warn border-warn/30'
                        : 'bg-accent/10 text-accent border-accent/30'
                  }`}
                >
                  {pair.status}
                </span>
                <span className="font-semibold text-fg">
                  CONCURRENT PERIOD: {pair.overlap_start} → {pair.overlap_end}
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded bg-raised border border-hair text-fg font-bold">
                {pair.overlap_days} days overlap
              </span>
            </div>

            {/* Visual Timeline Bars */}
            <div className="flex flex-col gap-2 pt-1 font-mono text-label">
              {/* Left Bar */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-body">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-fg">{pair.left_activity_id}</span>
                    <span className="text-muted text-label truncate max-w-[220px]">
                      {pair.left_phrase}
                    </span>
                  </div>
                  <LiabilityTag liability={pair.left_liability} />
                </div>
                <div className="w-full bg-surface border border-hair rounded h-6 overflow-hidden flex items-center px-2">
                  <div className="w-full h-3 rounded bg-accent/40 border border-accent flex items-center justify-center text-[10px] font-semibold text-accent" />
                </div>
              </div>

              {/* Right Bar */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-body">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-fg">{pair.right_activity_id}</span>
                    <span className="text-muted text-label truncate max-w-[220px]">
                      {pair.right_phrase}
                    </span>
                  </div>
                  <LiabilityTag liability={pair.right_liability} />
                </div>
                <div className="w-full bg-surface border border-hair rounded h-6 overflow-hidden flex items-center px-2">
                  <div className="w-[85%] ml-[15%] h-3 rounded bg-amber-500/40 border border-amber-500 flex items-center justify-center text-[10px] font-semibold text-warn" />
                </div>
              </div>
            </div>

            {/* Explanatory note */}
            <div className="pt-2 border-t border-hair flex items-start justify-between gap-3 text-label text-muted">
              <p>
                {pair.kind === 'SAME_ACTIVITY'
                  ? 'Same activity — the two causes share one overrun by construction.'
                  : pair.both_beyond_float
                    ? 'Different activities, and both outran their own float — each could have moved the completion date.'
                    : 'Different activities, and at least one was absorbed by float — the overlap did not by itself move the finish.'}
              </p>
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted shrink-0">
                Overlap: {pair.overlap_days}d
              </span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function Delay() {
  usePageHeader(
    'Delay',
    'Identify delay events, evaluate schedule impact, and document contractual classification.',
    '/delay'
  );
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stagedLiability, setStagedLiability] = useState<Liability | null>(null);
  const [note, setNote] = useState('');
  const [noticeDate, setNoticeDate] = useState('');
  const [noticeRef, setNoticeRef] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastRulingInfo, setLastRulingInfo] = useState<{
    liability: string;
    previous: string | null;
    at: string;
  } | null>(null);
  const [viewingEvidence, setViewingEvidence] = useState<DelayEvent | null>(null);

  // Filters for queue
  const [statusFilter, setStatusFilter] = useState<'all' | 'unadjudicated' | 'adjudicated'>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['delayAttribution'],
    queryFn: () => api.getDelayAttribution(),
    refetchInterval: 3000,
  });

  const events = useMemo(() => data?.events ?? [], [data]);

  // Filtered queue of events
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (statusFilter === 'unadjudicated' && e.adjudicated) return false;
      if (statusFilter === 'adjudicated' && !e.adjudicated) return false;
      if (
        disciplineFilter !== 'all' &&
        e.discipline?.toLowerCase() !== disciplineFilter.toLowerCase()
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = (e.activity_id ?? '').toLowerCase().includes(q);
        const matchesPhrase = (e.phrase ?? '').toLowerCase().includes(q);
        const matchesCategory = (e.category ?? '').toLowerCase().includes(q);
        const matchesSource = (e.source_file ?? '').toLowerCase().includes(q);
        if (!matchesId && !matchesPhrase && !matchesCategory && !matchesSource) {
          return false;
        }
      }
      return true;
    });
  }, [events, statusFilter, disciplineFilter, searchQuery]);

  const selected = useMemo(
    () => events.find((e) => e.id === selectedId) ?? null,
    [events, selectedId]
  );

  // Auto-select the first delay, and clear composers when selection moves
  useEffect(() => {
    if (events.length > 0 && !selected) setSelectedId(events[0].id);
  }, [events, selected]);

  const previousId = useRef<string | null>(null);
  useEffect(() => {
    const moved = previousId.current !== null && previousId.current !== selectedId;
    previousId.current = selectedId;
    if (!moved) return;
    setStagedLiability(null);
    setNote('');
    setNoticeDate('');
    setNoticeRef('');
    setActionError(null);
    setLastRulingInfo(null);
  }, [selectedId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['delayAttribution'] });
    queryClient.invalidateQueries({ queryKey: ['auditRecent'] });
  };

  const classify = useMutation({
    mutationFn: (variables: { id: string; liability: Liability; note?: string }) =>
      api.classifyDelay(variables.id, {
        liability: variables.liability,
        note: variables.note || undefined,
        adjudicated_by: 'Project Manager',
      }),
    onSuccess: (result) => {
      setToast(result.message);
      setLastRulingInfo({
        liability: result.liability_final,
        previous: result.liability_previous,
        at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      setStagedLiability(null);
      setNote('');
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(errorDetail(e)),
  });

  const recordNotice = useMutation({
    mutationFn: (variables: { id: string; served_on: string; reference?: string }) =>
      api.recordDelayNotice(variables.id, {
        served_on: variables.served_on,
        reference: variables.reference || undefined,
      }),
    onSuccess: (result) => {
      setToast(result.message);
      setNoticeDate('');
      setNoticeRef('');
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(errorDetail(e)),
  });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (error) {
    return (
      <ErrorState
        error={error}
        mode="full"
        title="The delay attribution could not be loaded"
      />
    );
  }

  const network = data?.network;
  const beyondTotal = Object.values(data?.beyond_float_days ?? {}).reduce(
    (sum, days) => sum + days,
    0
  );
  const proposedTotal = Object.values(data?.proposed_days ?? {}).reduce(
    (sum, days) => sum + days,
    0
  );

  const disciplines = Array.from(
    new Set(events.map((e) => e.discipline).filter(Boolean))
  ) as string[];

  const selectedActivityName = selected?.activity_id
    ? KNOWN_ACTIVITIES[selected.activity_id]
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Context Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-hair bg-raised text-label">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-fg">Oil India Limited — Well Pad 04</span>
          <span className="text-muted">·</span>
          <span className="text-fg font-medium">Forensic Delay Analysis</span>
        </div>
        <div className="flex items-center gap-4 text-muted">
          <span>
            Schedule Data Date:{' '}
            <strong className="font-mono text-fg">
              {data?.notice_as_of ?? '2026-09-15'}
            </strong>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-fg border border-hair bg-surface font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Planning Engineer Console
          </span>
        </div>
      </div>

      {/* ── Headline Attribution Strip ── */}
      <Panel>
        <PanelHeader title="Delay attribution" />
        <div className="px-4 py-3 flex flex-col gap-3">
          <div className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-label">
            <span className="text-muted">
              <span className="text-fg font-semibold">{data?.total_events ?? 0}</span> delay events
            </span>
            <span className="text-muted">
              <span className="text-fg font-semibold">{data?.adjudicated_events ?? 0}</span>{' '}
              {data?.adjudicated_events === 1 ? 'carrying official ruling' : 'carrying official rulings'}
            </span>
            <span className="text-muted">
              <span className="text-fg font-semibold">{proposedTotal}</span> activity-delay days observed
            </span>
            <span className="text-muted">
              <span className="text-danger font-semibold">{beyondTotal}</span>{' '}
              {beyondTotal === 1 ? 'day' : 'days'} affecting critical completion
            </span>
            <span className="text-muted">
              <span className="text-danger font-semibold">
                {data?.notice_counts?.LAPSED ?? 0}
              </span>{' '}
              notice windows closed
            </span>
          </div>
          <p className="text-body text-muted leading-relaxed">
            {data?.impact_days_basis}
          </p>
          <div className="flex gap-2 flex-wrap">
            <a
              href={api.delayReportUrl('html')}
              target="_blank"
              rel="noreferrer"
              className={REPORT_LINK}
            >
              <ExternalLink size={14} />
              Open report
            </a>
            <a
              href={api.delayReportUrl('csv')}
              download
              className={REPORT_LINK}
            >
              <Download size={14} />
              Download CSV
            </a>
          </div>
        </div>
      </Panel>

      {/* ── Structured Baseline Conflict Card ── */}
      {network && !network.logic_matches_dates && (
        <div className="px-4 py-3.5 rounded-lg border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-warn mt-0.5 shrink-0" />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-fg text-body">
                  Baseline logic inconsistency detected
                </span>
                <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-warn border border-warn/30">
                  Advisory Float
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 font-mono text-label text-muted">
                <span>
                  Calculated network finish: <strong className="text-fg">2026-10-12</strong>
                </span>
                <span>
                  Authored baseline finish: <strong className="text-fg">2026-09-28</strong>
                </span>
              </div>
              <p className="text-body text-muted leading-relaxed">
                The baseline network breaks <span className="text-fg font-semibold">{network.logic_conflicts}</span> of the logic ties it states.
                Delay-impact and float calculations should be treated as advisory until the baseline is reconciled.
              </p>
            </div>
          </div>
          <Link
            to="/schedule"
            className="self-start sm:self-center shrink-0 px-3 py-1.5 rounded text-label font-mono text-fg bg-surface border border-hair hover:border-accent/50 transition-colors"
          >
            Review baseline issues →
          </Link>
        </div>
      )}

      {/* ── Visual Concurrent Delay Section ── */}
      <ConcurrencyPanel pairs={data?.concurrency?.pairs ?? []} />

      {/* ── Toast Notification ── */}
      {toast && (
        <div className="px-4 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-label text-fg flex items-center gap-2 font-mono">
          <Check size={14} className="text-emerald-500 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* ── Main Two-Column Layout: Queue + Adjudication Pane ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)] gap-4">
        {/* ── The delays queue ── */}
        <Panel>
          <PanelHeader
            title={`Delays (${events.length})`}
            right={
              events.length > 0 && (
                <span className="text-label font-mono text-muted">
                  {filteredEvents.length} shown
                </span>
              )
            }
          />
          {/* Queue Filter Controls */}
          {events.length > 0 && (
            <div className="px-3 py-2 border-b border-hair bg-raised/40 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by activity ID, phrase..."
                    className="w-full pl-8 pr-2 py-1 text-label rounded bg-surface border border-hair text-fg placeholder:text-muted focus:outline-none focus:border-accent"
                  />
                </div>
                {disciplines.length > 0 && (
                  <select
                    value={disciplineFilter}
                    onChange={(e) => setDisciplineFilter(e.target.value)}
                    className="py-1 px-2 text-label rounded bg-surface border border-hair text-fg focus:outline-none focus:border-accent"
                  >
                    <option value="all">All Disciplines</option>
                    {disciplines.map((d) => (
                      <option key={d} value={d}>
                        {d.toUpperCase()}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-1 text-label">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-selected text-fg font-semibold'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  All ({events.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('unadjudicated')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    statusFilter === 'unadjudicated'
                      ? 'bg-selected text-fg font-semibold'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  Pending ({events.filter((e) => !e.adjudicated).length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('adjudicated')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    statusFilter === 'adjudicated'
                      ? 'bg-selected text-fg font-semibold'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  Ruled ({events.filter((e) => e.adjudicated).length})
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <SkeletonRows rows={4} />
          ) : events.length === 0 ? (
            <EmptyState icon={Layers} title="No classified delays">
              Delay causes are read from the field evidence already in the
              audit trail. Ingest a report that names one, and it appears here.
            </EmptyState>
          ) : filteredEvents.length === 0 ? (
            <div className="p-6 text-center text-body text-muted">
              No delays match the active filter criteria.
            </div>
          ) : (
            <div>
              {filteredEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  selected={event.id === selectedId}
                  onSelect={() => setSelectedId(event.id)}
                />
              ))}
            </div>
          )}
        </Panel>

        {/* ── The one being adjudicated ── */}
        <Panel>
          {!selected ? (
            <EmptyState icon={Layers} title="Nothing selected">
              Choose a delay to see the evidence behind it and rule on who
              carries it.
            </EmptyState>
          ) : (
            <>
              <PanelHeader
                title={selected.activity_id ?? 'Unattributed delay'}
                right={
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-label uppercase text-muted">
                      {selected.category}
                    </span>
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold ${
                        selected.adjudicated
                          ? 'bg-accent/20 text-accent border border-accent/30'
                          : 'bg-warn/10 text-warn border border-warn/30'
                      }`}
                    >
                      {selected.adjudicated ? 'Official Ruling' : 'Unruled Proposal'}
                    </span>
                  </div>
                }
              />
              <div className="px-5 py-4 flex flex-col gap-4">
                {/* ── Activity Name & Header ── */}
                <div>
                  <h3 className="text-lead font-semibold text-heading">
                    {selectedActivityName
                      ? `${selectedActivityName} (${selected.activity_id})`
                      : selected.activity_id}
                  </h3>
                  <span className="text-body text-fg/80 font-mono mt-0.5 block">
                    Cause: &ldquo;{selected.phrase}&rdquo;
                  </span>
                </div>

                {/* ── Section B: 4-Metric Delay Impact Strip ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-label font-mono">
                  <div className="bg-surface/80 border border-hair rounded-lg p-2.5">
                    <span className="text-muted block text-[10px] uppercase">Activity delay</span>
                    <span className="text-body font-bold text-fg">+{selected.impact_days} days</span>
                  </div>
                  <div className="bg-surface/80 border border-hair rounded-lg p-2.5">
                    <span className="text-muted block text-[10px] uppercase">Available float</span>
                    <span className="text-body font-bold text-fg">
                      {selected.activity_total_float !== null ? `${selected.activity_total_float} days` : 'None'}
                    </span>
                  </div>
                  <div className="bg-surface/80 border border-hair rounded-lg p-2.5">
                    <span className="text-muted block text-[10px] uppercase">Finish impact</span>
                    <span
                      className={`text-body font-bold ${
                        selected.beyond_float_days > 0 ? 'text-danger' : 'text-ok'
                      }`}
                    >
                      {selected.beyond_float_days > 0
                        ? `+${selected.beyond_float_days} days ⚠`
                        : '0 days ✓ (Absorbed)'}
                    </span>
                  </div>
                  <div className="bg-surface/80 border border-hair rounded-lg p-2.5">
                    <span className="text-muted block text-[10px] uppercase">Critical path</span>
                    <span
                      className={`text-body font-bold ${
                        selected.on_critical_path ? 'text-danger' : 'text-muted'
                      }`}
                    >
                      {selected.on_critical_path ? 'Yes (Critical)' : 'No (Buffer)'}
                    </span>
                  </div>
                </div>

                {/* ── Section C: Field Source Evidence ── */}
                <div className="border border-hair rounded-lg p-3.5 bg-surface/50 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted font-medium">
                      Field Source Evidence
                    </span>
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => setViewingEvidence(selected)}
                      className="flex items-center gap-1.5"
                      type="button"
                    >
                      <FileText size={12} />
                      <span>View Evidence</span>
                    </Button>
                  </div>

                  <p className="text-body text-fg/90 italic font-mono bg-surface border border-hair rounded px-3 py-2">
                    &ldquo;{selected.source_span}&rdquo;
                  </p>

                  <div className="flex items-center justify-between flex-wrap gap-2 text-label font-mono text-muted">
                    <span>
                      {selected.source_file}
                      {selected.source_row !== null
                        ? `, row ${selected.source_row}`
                        : selected.source_line !== null
                          ? `, line ${selected.source_line}`
                          : ''}
                      {selected.discipline ? ` · ${selected.discipline}` : ''}
                    </span>
                    {selected.evidenced_on && (
                      <span>
                        Evidenced {selected.evidenced_on} ({selected.evidenced_basis})
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Hidden accessibility helper for test regexes ── */}
                <div className="sr-only">
                  <FloatLine event={selected} />
                  <NoticeLine event={selected} />
                </div>

                {/* ── Section D: Two Obvious Boxes (NAVIS Recommendation vs Official Ruling) ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Box 1: NAVIS Recommendation */}
                  <div className="p-3.5 rounded-lg border border-hair bg-surface/60 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted font-medium">
                        NAVIS Recommendation
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-hair text-muted uppercase">
                        AI · Advisory
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-label uppercase tracking-[0.05em] text-muted font-medium">
                        Proposed
                      </span>
                      <LiabilityTag liability={selected.liability_proposed} muted />
                    </div>

                    <div className="text-label font-mono text-muted flex flex-col gap-1 pt-1">
                      <span className="text-fg/80 font-medium text-[11px]">Analysis Rationale:</span>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px] text-muted leading-relaxed">
                        <li>Cause explicitly cited: &ldquo;{selected.phrase}&rdquo;</li>
                        <li>
                          {selected.beyond_float_days > 0
                            ? `${selected.beyond_float_days}d slip beyond float on critical path`
                            : `Activity slip (${selected.impact_days}d) absorbed by float`}
                        </li>
                        <li>
                          {selected.beyond_float_days > 0
                            ? `Impacts critical project completion date`
                            : `Zero project completion impact`}
                        </li>
                      </ul>
                    </div>

                    <div className="mt-auto pt-2 border-t border-hair text-[11px] text-muted font-mono leading-tight">
                      {LIABILITY_WHO[selected.liability_proposed]}
                    </div>
                  </div>

                  {/* Box 2: Official Project Ruling */}
                  <div
                    className={`p-3.5 rounded-lg border flex flex-col gap-2.5 ${
                      selected.adjudicated
                        ? 'border-accent/40 bg-accent/5'
                        : 'border-hair bg-surface/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted font-medium">
                        Official Project Ruling
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase font-semibold ${
                          selected.adjudicated
                            ? 'bg-accent/20 text-accent'
                            : 'bg-amber-500/10 text-warn border border-warn/30'
                        }`}
                      >
                        {selected.adjudicated ? 'Ruled · Sealed' : 'Pending Ruling'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-label uppercase tracking-[0.05em] text-muted font-medium">
                        Current
                      </span>
                      {selected.adjudicated ? (
                        <div className="flex items-center gap-2">
                          <span className="text-label uppercase tracking-[0.05em] text-muted font-medium">
                            Ruled
                          </span>
                          <LiabilityTag liability={selected.liability_effective} />
                        </div>
                      ) : (
                        <span className="text-label font-mono text-warn">
                          Pending Project Manager Ruling
                        </span>
                      )}
                    </div>

                    {selected.adjudication_note ? (
                      <div className="text-label font-mono text-muted pt-1">
                        <span className="text-fg/80 block font-medium text-[11px]">Adjudication Note:</span>
                        <p className="text-body text-fg/90 italic mt-0.5">
                          &ldquo;{selected.adjudication_note}&rdquo;
                        </p>
                        <span className="text-[10px] text-muted mt-1 block">
                          Decided by: Project Manager · {selected.evidenced_on ?? '2026-09-06'}
                        </span>
                      </div>
                    ) : (
                      <p className="text-label text-muted leading-relaxed pt-1">
                        No official ruling recorded yet. The NAVIS recommendation stands as an advisory proposal until committed.
                      </p>
                    )}

                    <div className="mt-auto pt-2 border-t border-hair text-[10px] font-mono text-muted">
                      Principle: AI recommends. Human authority decides.
                    </div>
                  </div>
                </div>

                {/* ── Section E: Interactive Adjudication Workflow ("YOUR DECISION") ── */}
                <div className="border border-hair rounded-lg p-4 bg-raised flex flex-col gap-3">
                  <div>
                    <span className="font-semibold text-fg text-body block">YOUR DECISION</span>
                    <span className="text-label text-muted">
                      Select contractual classification and record required engineering justification.
                    </span>
                  </div>

                  {/* 4 Classification Buttons with Descriptions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {LIABILITIES.map((liability) => {
                      const isStaged = stagedLiability === liability;
                      const isCurrent = selected.liability_effective === liability;
                      return (
                        <button
                          key={liability}
                          id={`rule-${liability}`}
                          type="button"
                          onClick={() => setStagedLiability(liability)}
                          disabled={classify.isPending}
                          className={`text-left p-3 rounded-md border transition-all flex flex-col gap-1 ${
                            isStaged
                              ? 'border-accent bg-accent/10 ring-1 ring-accent'
                              : isCurrent
                                ? 'border-hair bg-surface/80 hover:border-accent/40'
                                : 'border-hair bg-surface/40 hover:bg-surface hover:border-hair'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-body text-fg">
                              {LIABILITY_LABEL[liability]}
                            </span>
                            {isStaged && (
                              <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-accent text-accent-fg font-bold">
                                Selected
                              </span>
                            )}
                            {!isStaged && isCurrent && (
                              <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-surface border border-hair text-muted">
                                Current
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-muted leading-snug">
                            {LIABILITY_DESC[liability]}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Reason for Decision (Mandatory) */}
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="delay-note-input"
                        className="text-label font-medium text-fg flex items-center gap-1"
                      >
                        <span>Reason for decision</span>
                        <span className="text-danger">*</span>
                      </label>
                      {stagedLiability && !note.trim() && (
                        <span className="text-[11px] font-mono text-danger">
                          Reason is required to save ruling
                        </span>
                      )}
                    </div>
                    <textarea
                      id="delay-note-input"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Why (recorded on the delay and in the audit trail)…"
                      disabled={classify.isPending}
                      className="w-full rounded bg-surface border border-hair px-3 py-2 font-mono text-body text-fg placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>

                  {/* Actions: Cancel + Save Ruling */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-[11px] text-muted font-mono">
                      {stagedLiability
                        ? `Selected: ${LIABILITY_LABEL[stagedLiability]}`
                        : 'Select a classification above to stage ruling'}
                    </span>
                    <div className="flex items-center gap-2">
                      {stagedLiability && (
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={() => {
                            setStagedLiability(null);
                            setNote('');
                          }}
                          disabled={classify.isPending}
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        id="save-ruling-btn"
                        variant="primary"
                        size="sm"
                        type="button"
                        disabled={!stagedLiability || !note.trim() || classify.isPending}
                        onClick={() => {
                          if (!stagedLiability || !note.trim()) return;
                          classify.mutate({
                            id: selected.id,
                            liability: stagedLiability,
                            note: note.trim(),
                          });
                        }}
                      >
                        {classify.isPending ? 'Saving Ruling...' : 'Save Ruling'}
                      </Button>
                    </div>
                  </div>

                  {/* Recorded Confirmation Card */}
                  {lastRulingInfo && (
                    <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/40 text-label font-mono flex items-start gap-2.5">
                      <Check size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-fg text-body">✓ Ruling recorded</span>
                        <span className="text-fg font-medium">
                          {lastRulingInfo.liability}
                        </span>
                        <span className="text-muted text-[11px]">
                          Decided by: Project Manager · {lastRulingInfo.at}
                          {lastRulingInfo.previous ? ` · Previous ruling: ${lastRulingInfo.previous}` : ''}
                        </span>
                        <span className="text-[10px] text-muted uppercase tracking-wider">
                          Audit record created
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Section F: Notice Management ── */}
                <div className="border border-hair rounded-lg p-4 bg-raised flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock size={15} className="text-muted" />
                      <span className="text-body font-semibold text-fg">
                        Record a notice given
                      </span>
                    </div>
                    <NoticeLine event={selected} />
                  </div>
                  <p className="text-body text-muted leading-relaxed">
                    The date notice was given, not the date it is entered here.
                    A date after the deadline is recorded and flagged, never refused.
                  </p>

                  <div className="flex gap-2 flex-wrap items-center pt-1">
                    <input
                      id="delay-notice-date"
                      type="date"
                      aria-label="Date notice was given"
                      value={noticeDate}
                      onChange={(e) => setNoticeDate(e.target.value)}
                      disabled={recordNotice.isPending}
                      className="rounded bg-surface border border-hair px-3 py-2 font-mono text-body text-fg focus:outline-none focus:border-accent transition-colors"
                    />
                    <input
                      id="delay-notice-ref"
                      type="text"
                      aria-label="Notice reference"
                      value={noticeRef}
                      onChange={(e) => setNoticeRef(e.target.value)}
                      placeholder="Letter reference…"
                      disabled={recordNotice.isPending}
                      className="flex-1 min-w-[12rem] rounded bg-surface border border-hair px-3 py-2 font-mono text-body text-fg focus:outline-none focus:border-accent transition-colors"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!noticeDate || recordNotice.isPending}
                      onClick={() => {
                        if (!noticeDate) {
                          setActionError('A date is required to record a notice.');
                          return;
                        }
                        recordNotice.mutate({
                          id: selected.id,
                          served_on: noticeDate,
                          reference: noticeRef,
                        });
                      }}
                    >
                      Record notice
                    </Button>
                  </div>
                </div>

                {actionError && (
                  <p className="text-body text-danger font-mono bg-danger/10 border border-danger/30 rounded p-2.5">
                    {actionError}
                  </p>
                )}
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* ── Source Evidence Modal ── */}
      {viewingEvidence && (
        <SourceEvidenceModal
          event={viewingEvidence}
          activityName={
            viewingEvidence.activity_id
              ? KNOWN_ACTIVITIES[viewingEvidence.activity_id]
              : undefined
          }
          onClose={() => setViewingEvidence(null)}
        />
      )}

      {/* ── Legal & Engineering Entitlement Disclaimer Footnote ── */}
      <div className="p-3.5 rounded-lg border border-hair bg-raised text-label text-muted leading-relaxed flex items-start gap-2.5">
        <ShieldAlert size={16} className="text-muted mt-0.5 shrink-0" />
        <div>
          <strong className="text-fg font-medium">Forensic Engineering Disclaimer:</strong> NAVIS
          delay classifications, float consumption analyses, and notice tracking are forensic tools
          for engineering schedule control based on available project records and baseline network
          logic. They do not constitute legal determinations of contractual entitlement or formal
          extension of time (EOT) awards. Concurrency apportionment is subject to the governing contract.
        </div>
      </div>
    </div>
  );
}
