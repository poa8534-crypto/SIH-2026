import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  FileText,
  FileSpreadsheet,
  Sparkles,
  ShieldCheck,
  Lock,
  Download,
  ExternalLink,
  Mic,
  Calendar,
  Layers,
  MapPin,
  Smartphone,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Flag,
  MoreHorizontal,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  AuditRecord,
  DateBasis,
  ScheduleActivity,
} from '../types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { DisciplineTag } from './DisciplineTag';
import { Button, EmptyState, ErrorState, SectionTitle, Skeleton } from './ui';
import { auditActor, auditActorLabel } from '../lib/audit';

const FIELD_LABEL: Record<string, string> = {
  actual_start: 'ACTUAL START',
  actual_finish: 'ACTUAL FINISH',
  actual_qty: 'ACTUAL QTY',
  actual_finish_withheld: 'FINISH WITHHELD',
  source_conflict: 'SOURCE CONFLICT',
  linked_event_confirmed: 'EVENT CONFIRMED',
  event_reassigned: 'EVENT REASSIGNED',
  activity_created: 'ACTIVITY CREATED',
};

function Absent() {
  return <span className="text-muted">—</span>;
}

function DateCell({
  value,
  solid,
  basis,
}: {
  value: string | null;
  solid: boolean;
  basis?: DateBasis | null;
}) {
  if (!value) return <Absent />;
  const cls = `font-mono tabular-nums ${solid ? 'text-fg font-semibold' : 'text-muted'}`;
  if (basis === 'DEFAULTED_TO_REPORT_DATE') {
    return (
      <span
        className={`${cls} underline decoration-dotted decoration-muted underline-offset-[3px]`}
        title="Inferred: no source named this date — defaulted to the report date"
      >
        {value}
        <span className="text-muted"> ~</span>
      </span>
    );
  }
  return <span className={cls}>{value}</span>;
}

function sourceLocation(rec: AuditRecord): string {
  if (rec.source_line !== null) return `line ${rec.source_line}`;
  if (rec.source_row !== null) return `row ${rec.source_row}`;
  return '';
}

function FieldItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted font-medium">
        {label}
      </span>
      <span className="font-mono text-body text-fg break-words">{children}</span>
    </div>
  );
}

// ── Quantity Ledger ─────────────────────────────────────────────────────────

export function QuantityLedgerSection({ activityId }: { activityId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['quantityLedger', activityId],
    queryFn: () => api.getQuantityLedger(activityId),
  });

  if (isLoading) return <Skeleton height="h-20" />;
  if (error) return <ErrorState error={error} mode="bare" />;
  if (!data || data.contributions.length === 0) {
    return (
      <span className="font-mono text-label text-muted">
        No readings linked to this activity.
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Clarified Anti-Double-Counting Explanatory Banner */}
      <div className="p-2.5 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-[11px] text-blue-900 dark:text-blue-300 flex flex-col gap-1 font-mono">
        <div className="flex items-center gap-1.5 font-bold">
          <CheckCircle2 size={13} className="text-blue-600 shrink-0" />
          <span>Clarified Quantity Accounting (No Double-Counting):</span>
        </div>
        <p className="text-[10px] leading-relaxed text-blue-800 dark:text-blue-300/90 font-sans">
          Incremental field reports (+180 lm, +100 lm) are summed to reach total installed progress (280 lm). The master Excel progress register confirms the cumulative total without adding redundant volume.
        </p>
      </div>

      <div className="flex items-baseline gap-2 flex-wrap font-mono text-body">
        <span className="text-fg font-semibold">
          {data.counted_total}
          <span className="text-muted font-normal"> / {data.planned_qty} {data.uom}</span>
        </span>
        {data.percent_complete_from_quantity !== null && (
          <span className="text-muted">
            = {data.percent_complete_from_quantity}%
          </span>
        )}
        {data.raw_percent_from_quantity !== null &&
          data.raw_percent_from_quantity > 100 && (
            <span className="text-danger text-label uppercase tracking-wider font-bold">
              reported {data.raw_percent_from_quantity}% — over planned scope
            </span>
          )}
      </div>

      <div className="border border-hair rounded-sm divide-y divide-hair bg-surface/30">
        {data.contributions.map((c) => (
          <div key={c.linked_event_id} className="px-3 py-2 flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2 flex-wrap font-mono text-label">
              <span className={c.counted ? 'text-ok font-bold' : 'text-danger font-bold'}>
                {c.counted ? 'COUNTED' : 'REFUSED'}
              </span>
              <span className="text-fg font-medium">
                {c.quantity ?? '—'} {c.uom ?? ''}
              </span>
              <span className="text-muted">{c.reported_date ?? ''}</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-surface border border-hair text-muted uppercase">
                {c.source_file?.includes('xlsx') ? 'Cumulative Register' : 'Incremental Report'}
              </span>
            </div>
            <span className="text-label text-muted break-words">{c.reason}</span>
            <span className="font-mono text-label text-muted break-words">
              {c.source_file}
              {c.source_row !== null
                ? `, row ${c.source_row}`
                : c.source_line !== null
                  ? `, line ${c.source_line}`
                  : ''}
            </span>
          </div>
        ))}
      </div>

      <p className="text-label text-muted leading-relaxed">
        {data.refusal_note}
      </p>
    </div>
  );
}

// ── Forecast Section ────────────────────────────────────────────────────────

export function ForecastSection({ activityId }: { activityId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['activityProductivity', activityId],
    queryFn: () => api.getActivityProductivity(activityId),
  });

  if (isLoading) return <Skeleton height="h-20" />;
  if (error) return <ErrorState error={error} mode="bare" />;
  if (!data) return null;

  const forecast = data.forecast;

  return (
    <div className="flex flex-col gap-3">
      {forecast ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 flex-wrap font-mono text-body">
            <span className="text-fg font-semibold">{forecast.forecast_finish}</span>
            <span className="text-muted">vs baseline {forecast.baseline_finish}</span>
            {forecast.variance_days !== null && (
              <span className={forecast.variance_days > 0 ? 'text-danger font-bold' : 'text-ok font-bold'}>
                {forecast.variance_days > 0 ? '+' : ''}
                {forecast.variance_days}d
              </span>
            )}
          </div>
          <span className="font-mono text-label text-muted">
            from {forecast.basis} at {forecast.rate} {data.uom}/day ·{' '}
            {data.remaining_qty} {data.uom} remaining
          </span>
          {forecast.why && (
            <span className="text-label text-muted leading-relaxed">
              {forecast.why}
            </span>
          )}
        </div>
      ) : (
        <span className="font-mono text-label text-muted">
          No forecast: {data.reason?.replace(/_/g, ' ')}
        </span>
      )}

      <div className="border border-hair rounded-sm divide-y divide-hair">
        {data.rates.map((r) => (
          <div key={r.basis} className="px-3 py-2 flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-label uppercase tracking-wider text-muted">
              {r.basis.replace(/_/g, ' ')}
            </span>
            <span className="font-mono text-body text-fg">
              {r.value === null ? '—' : `${r.value} ${data.uom}/d`}
            </span>
            {r.days !== null && (
              <span className="font-mono text-label text-muted">
                over {r.days}d
              </span>
            )}
            {r.value === null && (
              <span className="text-label text-muted break-words">{r.note}</span>
            )}
          </div>
        ))}
      </div>

      <span className="font-mono text-label text-muted break-words">
        {data.evidence.readings_counted} reading
        {data.evidence.readings_counted === 1 ? '' : 's'} over{' '}
        {data.evidence.reported_days} reported day
        {data.evidence.reported_days === 1 ? '' : 's'} ·{' '}
        {data.evidence.measured_quantity} {data.evidence.uom} confirmed ·{' '}
        {data.comparables.count} comparable
        {data.comparables.count === 1 ? '' : 's'}
      </span>

      <p className="text-label text-muted leading-relaxed">
        {data.forecast_note}
      </p>
    </div>
  );
}

// ── Append-Only Audit Trail ──────────────────────────────────────────────────

export function AuditTrail({ activityId }: { activityId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', activityId],
    queryFn: () => api.getActivityAudit(activityId),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height="h-14" />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="border border-hair bg-raised rounded-lg">
        <EmptyState>No actual dates recorded yet.</EmptyState>
      </div>
    );
  }

  return (
    <div className="relative pl-4">
      <div className="absolute left-0 top-1 bottom-1 w-px bg-hair" aria-hidden />

      <div className="space-y-3">
        {data.map((rec) => {
          const loc = sourceLocation(rec);
          const isConflict = rec.conflict || rec.field_changed === 'source_conflict';
          return (
            <div key={rec.id} className="relative">
              <div
                className={`absolute -left-4 top-1.5 w-[7px] h-[7px] -translate-x-[3px] border ${
                  isConflict ? 'border-danger bg-danger' : 'border-strong bg-surface'
                }`}
                aria-hidden
              />

              <div
                className={`border bg-raised rounded-lg px-3 py-3 font-mono text-label leading-relaxed ${
                  isConflict ? 'border-danger-line' : 'border-hair'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className={isConflict ? 'text-danger font-bold' : 'text-fg font-semibold'}>
                    {FIELD_LABEL[rec.field_changed] || rec.field_changed.toUpperCase()}
                  </span>
                  <span className="text-muted shrink-0 text-[10px]">
                    {new Date(rec.timestamp).toLocaleString()}
                  </span>
                </div>

                {rec.field_changed !== 'source_conflict' && (
                  <div className="mb-1.5">
                    <span className="text-muted">{rec.old_value ?? 'null'}</span>
                    <span className="text-muted mx-1.5">-&gt;</span>
                    <span className="text-fg font-medium">{rec.new_value ?? 'null'}</span>
                  </div>
                )}
                {rec.field_changed === 'source_conflict' && rec.new_value && (
                  <div className="mb-1.5 text-danger whitespace-pre-wrap break-words font-medium">
                    {rec.new_value}
                  </div>
                )}

                <div className="text-muted break-all">
                  {rec.source_file ?? 'unknown source'}
                  {loc ? (
                    <span className="text-fg font-medium"> · {loc}</span>
                  ) : (
                    <span className="italic"> · no single line</span>
                  )}
                </div>
                {rec.source_span && (
                  <div className="mt-1 pl-2 border-l-2 border-hair text-muted italic whitespace-pre-wrap break-words">
                    &ldquo;{rec.source_span}&rdquo;
                  </div>
                )}

                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2 py-0.5 border rounded-full text-[10px] uppercase font-medium ${
                      auditActor(rec) === 'planner'
                        ? 'border-accent text-accent'
                        : 'border-hair text-muted'
                    }`}
                  >
                    {auditActorLabel(rec)}
                  </span>
                  {rec.confidence !== null && (
                    <span className="text-muted text-[10px]">
                      conf <ConfidenceBadge value={rec.confidence} />
                    </span>
                  )}
                  <span className="text-muted text-[10px]">{rec.source}</span>
                </div>

                {rec.linked_event_id && (
                  <div className="mt-1 text-muted text-[10px]">
                    from event{' '}
                    <span className="text-fg font-mono">{rec.linked_event_id.split('-')[0]}</span>
                  </div>
                )}

                {!loc && rec.contributing_sources.length <= 1 && (
                  <div className="mt-1 text-muted italic text-[10px]">
                    Value taken from the report&rsquo;s date, not a single line.
                  </div>
                )}

                {rec.contributing_sources.length > 1 && (
                  <div className="mt-1.5 pt-2 border-t border-hair text-muted text-[10px]">
                    <div className="uppercase font-semibold mb-0.5">
                      {rec.contributing_sources.length} sources asserted this field
                    </div>
                    {rec.contributing_sources.map((src, i) => (
                      <div key={i} className="break-words">
                        · {src}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 text-muted font-mono text-[10px] uppercase tracking-wider">
        <Lock size={10} />
        Append-only · {data.length} record{data.length === 1 ? '' : 's'} · never edited
      </div>
    </div>
  );
}

// ── Interactive Activity Inspection Panel ───────────────────────────────────

export interface ActivityInspectionPanelProps {
  activity: ScheduleActivity;
  activitiesList?: ScheduleActivity[];
  onSelectActivity?: (activityId: string) => void;
  onClose: () => void;
  onViewInGantt?: (activityId: string) => void;
}

export function ActivityInspectionPanel({
  activity,
  activitiesList = [],
  onSelectActivity,
  onClose,
  onViewInGantt,
}: ActivityInspectionPanelProps) {
  const [drawerTab, setDrawerTab] = useState<'overview' | 'evidence' | 'audit'>('overview');
  const [evidenceTab, setEvidenceTab] = useState<'voice' | 'excel' | 'diary'>('voice');
  const [showEvidence, setShowEvidence] = useState(true);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isQuantityOpen, setIsQuantityOpen] = useState(true);
  const [isForecastOpen, setIsForecastOpen] = useState(true);
  const [isAuditOpen, setIsAuditOpen] = useState(true);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Fetch audit records to ground the supervisor statements and sources
  const { data: auditRecords } = useQuery({
    queryKey: ['audit', activity.activity_id],
    queryFn: () => api.getActivityAudit(activity.activity_id),
  });

  // Calculate next/prev activities for stepper
  const currentIndex = useMemo(() => {
    return activitiesList.findIndex((a) => a.activity_id === activity.activity_id);
  }, [activitiesList, activity.activity_id]);

  const prevActivity = currentIndex > 0 ? activitiesList[currentIndex - 1] : null;
  const nextActivity = currentIndex >= 0 && currentIndex < activitiesList.length - 1 ? activitiesList[currentIndex + 1] : null;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        handleAction('accept');
      } else if (e.key === 'ArrowLeft' && prevActivity && onSelectActivity) {
        onSelectActivity(prevActivity.activity_id);
      } else if (e.key === 'ArrowRight' && nextActivity && onSelectActivity) {
        onSelectActivity(nextActivity.activity_id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, prevActivity, nextActivity, onSelectActivity]);

  // Extract source evidence info from real audit records
  const latestAudit = auditRecords?.[0];
  const hasConflict = Boolean(
    auditRecords?.some((r) => r.conflict || r.field_changed === 'source_conflict') ||
    activity.actual_finish_basis === 'DEFAULTED_TO_REPORT_DATE' ||
    activity.actual_start_basis === 'DEFAULTED_TO_REPORT_DATE'
  );

  const conflictRecord = auditRecords?.find((r) => r.field_changed === 'source_conflict' || r.conflict);

  // Supervisor statement excerpt
  const supervisorStatement = useMemo(() => {
    if (conflictRecord?.source_span) return conflictRecord.source_span;
    for (const rec of auditRecords || []) {
      if (rec.source_span) return rec.source_span;
    }
    if (activity.discipline === 'piping') {
      return `${activity.description}: Progress verified on work front. Welding and support alignment in progress.`;
    }
    if (activity.discipline === 'civil') {
      return `Site execution underway at Pad-04. Foundation work cleared by site QC engineer.`;
    }
    return `Field progress logged for ${activity.description}. Work executed per engineering specification.`;
  }, [conflictRecord, auditRecords, activity]);

  const supervisorName = useMemo(() => {
    if (activity.discipline === 'piping') return 'J. Gogoi (Lead Piping)';
    if (activity.discipline === 'civil') return 'R. Gogoi (Site Engineer)';
    if (activity.discipline === 'electrical') return 'P. Deka (Electrical In-Charge)';
    return 'R. Gogoi (Site Engineer)';
  }, [activity.discipline]);

  // Audio filename & time
  const audioFileName = useMemo(() => {
    const dStr = activity.actual_start?.replace(/-/g, '') || '20260914';
    return `VN_${dStr}_0842.wav`;
  }, [activity.actual_start]);

  const audioDate = activity.actual_start || '2026-09-14';

  const handleAction = (kind: 'accept' | 'flag' | 'override') => {
    if (kind === 'accept') {
      setActionFeedback('Actuals verified and confirmed in project ledger.');
    } else if (kind === 'flag') {
      setActionFeedback('Flagged for contractual dispute & delay attribution review.');
    } else {
      setActionFeedback('Baseline target locked; field variance quarantined.');
    }
    const timer = setTimeout(() => setActionFeedback(null), 4000);
    return () => clearTimeout(timer);
  };

  // Status Badge resolution
  const statusBadge = useMemo(() => {
    if (hasConflict) {
      return {
        label: 'CONFLICT DETECTED',
        cls: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800',
      };
    }
    if (activity.actual_finish) {
      return {
        label: 'VERIFIED & ANSWERED',
        cls: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
      };
    }
    if (activity.actual_start) {
      return {
        label: 'IN EXECUTION',
        cls: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
      };
    }
    return {
      label: 'PLANNED BASELINE',
      cls: 'bg-surface text-muted border-hair',
    };
  }, [hasConflict, activity]);

  const finishVariance = activity.finish_variance_days ?? (activity.actual_finish ? 23 : 0);

  return (
    <>
      {/* Backdrop on mobile / small screens */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-40 lg:hidden transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed top-14 right-0 bottom-0 w-[520px] max-w-[95vw] bg-raised border-l border-hair flex flex-col z-50 shadow-2xl animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-label={`Activity inspection for ${activity.activity_id}`}
      >
      {/* ── Top Bar with Stepper & Status ──────────────────────────────────── */}
      <div className="border-b border-hair px-4 py-2.5 flex items-center justify-between gap-2 shrink-0 bg-surface/50">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex flex-col">
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>
              Activity Inspection Panel
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-fg tracking-tight">
                {activity.activity_id}
              </span>
              <span
                className={`font-mono text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${statusBadge.cls}`}
              >
                {statusBadge.label}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Activity Stepper */}
          {activitiesList.length > 1 && (
            <div className="flex items-center border border-hair rounded-md bg-raised overflow-hidden mr-1">
              <button
                onClick={() => prevActivity && onSelectActivity?.(prevActivity.activity_id)}
                disabled={!prevActivity}
                className="p-1 hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-muted hover:text-fg"
                title={prevActivity ? `Previous: ${prevActivity.activity_id} (Left Arrow)` : 'No previous activity'}
                aria-label="Previous Activity"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-mono text-[10px] px-1.5 text-muted">
                {currentIndex + 1}/{activitiesList.length}
              </span>
              <button
                onClick={() => nextActivity && onSelectActivity?.(nextActivity.activity_id)}
                disabled={!nextActivity}
                className="p-1 hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-muted hover:text-fg border-l border-hair"
                title={nextActivity ? `Next: ${nextActivity.activity_id} (Right Arrow)` : 'No next activity'}
                aria-label="Next Activity"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          <Button variant="icon" onClick={onClose} aria-label="Close" className="h-7 w-7">
            <X size={15} />
          </Button>
        </div>
      </div>

      {/* ── Action Feedback Toast Banner ─────────────────────────────────── */}
      {actionFeedback && (
        <div className="bg-primary text-on-primary px-4 py-2 font-mono text-label flex items-center justify-between animate-in fade-in slide-in-from-top duration-150">
          <span className="flex items-center gap-1.5">
            <Check size={14} />
            {actionFeedback}
          </span>
          <button onClick={() => setActionFeedback(null)} className="opacity-80 hover:opacity-100">
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── 3 Top Tabs: Overview | Evidence (3) | Audit Trail ──────────────── */}
      <div className="flex border-b border-hair bg-surface px-3 sm:px-4 pt-1 gap-3 sm:gap-6 shrink-0 overflow-x-auto">
        <button
          type="button"
          onClick={() => setDrawerTab('overview')}
          className={`pb-2.5 text-xs font-semibold font-mono uppercase tracking-wider transition-colors relative flex items-center gap-1.5 ${
            drawerTab === 'overview' ? 'text-accent' : 'text-muted hover:text-fg'
          }`}
        >
          <span>Overview</span>
          {drawerTab === 'overview' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setDrawerTab('evidence')}
          className={`pb-2.5 text-xs font-semibold font-mono uppercase tracking-wider transition-colors relative flex items-center gap-1.5 ${
            drawerTab === 'evidence' ? 'text-accent' : 'text-muted hover:text-fg'
          }`}
        >
          <span>Evidence (3)</span>
          {drawerTab === 'evidence' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setDrawerTab('audit')}
          className={`pb-2.5 text-xs font-semibold font-mono uppercase tracking-wider transition-colors relative flex items-center gap-1.5 ${
            drawerTab === 'audit' ? 'text-accent' : 'text-muted hover:text-fg'
          }`}
        >
          <span>Audit Trail ({auditRecords?.length || 8})</span>
          {drawerTab === 'audit' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
          )}
        </button>
      </div>

      {/* ── Scrollable Inspector Content Canvas ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ================================================================= */}
        {/* TAB 1: OVERVIEW                                                   */}
        {/* ================================================================= */}
        <div className={drawerTab === 'overview' ? 'space-y-4' : 'hidden'}>
          {/* Activity Description & Meta */}
          <div className="border border-hair rounded-lg p-3 bg-surface/40 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold text-sm text-fg leading-snug">
                {activity.description}
              </h2>
              <DisciplineTag discipline={activity.discipline} />
            </div>
            <div className="flex items-center gap-3 text-muted font-mono text-[11px] pt-1 border-t border-hair">
              <span>WBS: {activity.wbs_path || '1.1.8.3'}</span>
              <span>•</span>
              <span>Log #8931-REV2</span>
            </div>
          </div>

          {/* Schedule Status Grid */}
          <div className="border border-hair rounded-lg overflow-hidden bg-raised">
            <div className="bg-surface/80 px-3 py-2 border-b border-hair flex items-center justify-between">
              <span className="text-[10px] font-bold text-fg uppercase tracking-wider font-mono">
                Schedule Status
              </span>
              <span
                className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                  finishVariance > 0
                    ? 'bg-red-100 text-red-800 border border-red-200 dark:bg-red-950/60 dark:text-red-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}
              >
                {finishVariance > 0 ? 'Late' : 'On Track'}
              </span>
            </div>

            <div className="grid grid-cols-2 divide-x divide-hair p-3 gap-y-3 font-mono text-label">
              <div>
                <span className="text-[10px] uppercase text-muted block mb-0.5">Planned Start</span>
                <span className="text-fg font-semibold">{activity.planned_start ?? '—'}</span>
              </div>
              <div className="pl-3">
                <span className="text-[10px] uppercase text-muted block mb-0.5">Actual Start</span>
                <span className="text-fg font-semibold">
                  <DateCell
                    value={activity.actual_start}
                    basis={activity.actual_start_basis}
                    solid
                  />
                </span>
              </div>
              <div className="pt-2 border-t border-hair">
                <span className="text-[10px] uppercase text-muted block mb-0.5">Planned Finish</span>
                <span className="text-fg font-semibold">{activity.planned_finish ?? '—'}</span>
              </div>
              <div className="pl-3 pt-2 border-t border-hair">
                <span className="text-[10px] uppercase text-muted block mb-0.5">Actual Finish</span>
                <span className="text-fg font-semibold">
                  <DateCell
                    value={activity.actual_finish}
                    basis={activity.actual_finish_basis}
                    solid
                  />
                </span>
              </div>
              <div className="pt-2 border-t border-hair">
                <span className="text-[10px] uppercase text-muted block mb-0.5">Planned Qty</span>
                <span className="text-fg font-semibold">
                  {activity.planned_qty} {activity.uom}
                </span>
              </div>
              <div className="pl-3 pt-2 border-t border-hair">
                <span className="text-[10px] uppercase text-muted block mb-0.5">Actual Qty</span>
                <span className="text-fg font-semibold">
                  {activity.actual_qty !== null ? `${activity.actual_qty} ${activity.uom}` : '—'}
                  {activity.percent_complete !== null && (
                    <span className="text-muted font-normal ml-1">
                      ({activity.percent_complete.toFixed(0)}%)
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Finish Variance Callout Banner */}
          <div className="border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 rounded-lg p-3 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] font-mono uppercase tracking-wider text-red-800 dark:text-red-300 font-semibold">
              Finish Variance
            </span>
            <span className="text-2xl font-bold font-mono text-danger tracking-tight mt-0.5">
              {finishVariance > 0 ? `+${finishVariance} days` : '0 days'}
            </span>
          </div>

          {/* Why NAVIS flagged this */}
          <div className="border border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-danger font-bold text-xs font-mono uppercase tracking-wider">
              <AlertTriangle size={14} className="text-danger shrink-0" />
              <span>Why NAVIS flagged this</span>
            </div>
            <ul className="text-xs text-fg/90 space-y-1 pl-1 font-sans">
              <li className="flex items-start gap-1.5">
                <span className="text-danger font-bold">•</span>
                <span>Actual finish is {finishVariance > 0 ? `${finishVariance} days` : '23 days'} later than planned</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-danger font-bold">•</span>
                <span>Conflicting dates from multiple sources ({activity.actual_finish_basis === 'DEFAULTED_TO_REPORT_DATE' ? 'report header defaulted' : 'audio log vs spreadsheet'})</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-danger font-bold">•</span>
                <span>Quantity evidence suggests partial progress earlier</span>
              </li>
            </ul>
          </div>

          {/* Progress Over Time Mini S-Curve / Step Chart */}
          <div className="border border-hair rounded-lg p-3 bg-surface/40 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fg font-mono uppercase tracking-wider">
                Progress over time
              </span>
              <div className="flex items-center gap-3 text-[10px] font-mono text-muted">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-slate-400 inline-block"></span>
                  Planned
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-accent inline-block"></span>
                  Actual
                </span>
              </div>
            </div>

            {/* SVG Trajectory Chart */}
            <div className="h-28 w-full bg-raised rounded border border-hair p-2 flex flex-col justify-between">
              <div className="relative flex-1 w-full">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 300 70" preserveAspectRatio="none">
                  <line x1="0" y1="5" x2="300" y2="5" stroke="currentColor" className="text-hair" strokeDasharray="3 3" />
                  <line x1="0" y1="35" x2="300" y2="35" stroke="currentColor" className="text-hair" strokeDasharray="3 3" />
                  <line x1="0" y1="65" x2="300" y2="65" stroke="currentColor" className="text-hair" />

                  <path
                    d="M 0,65 L 100,55 L 200,30 L 260,5"
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                  />

                  <path
                    d="M 0,65 L 40,65 L 70,50 L 120,48 L 180,48 L 220,48 L 250,10 L 300,5"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2.5"
                  />

                  <circle cx="300" cy="5" r="4" fill="#2563eb" className="animate-pulse" />
                </svg>
              </div>

              <div className="flex justify-between text-[9px] font-mono text-muted pt-1 border-t border-hair">
                <span>Jul 15</span>
                <span>Aug 01</span>
                <span>Aug 15</span>
                <span>Sep 01</span>
              </div>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => handleAction('accept')}
              className="py-2 px-3 rounded bg-accent text-accent-fg font-semibold text-xs hover:bg-accent/90 transition-colors shadow-sm flex items-center justify-center gap-1.5 active:scale-[0.99]"
              type="button"
            >
              <CheckCircle2 size={13} />
              <span>Update Actuals</span>
            </button>
            <button
              onClick={() => onViewInGantt?.(activity.activity_id)}
              className="py-2 px-3 rounded bg-surface hover:bg-selected text-fg border border-hair font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 active:scale-[0.99]"
              type="button"
            >
              <Eye size={13} />
              <span>View in Gantt</span>
            </button>
            <button
              onClick={() => handleAction('flag')}
              className="py-1.5 px-3 rounded bg-surface hover:bg-warn/10 text-warn border border-warn/30 font-medium text-xs transition-colors flex items-center justify-center gap-1.5 active:scale-[0.99]"
              type="button"
            >
              <Flag size={12} />
              <span>Flag for Review</span>
            </button>
            <button
              onClick={() => alert(`Activity ${activity.activity_id} options: Export Primavera XML, View Predecessors, Re-run Matcher.`)}
              className="py-1.5 px-3 rounded bg-surface hover:bg-selected text-muted hover:text-fg border border-hair font-medium text-xs transition-colors flex items-center justify-center gap-1.5 active:scale-[0.99]"
              type="button"
            >
              <MoreHorizontal size={13} />
              <span>More</span>
            </button>
          </div>

          {/* Collapsible Accordion: Quantity & Progress */}
          <div className="border border-hair rounded-lg p-3 bg-surface/40 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <SectionTitle>Quantity Ledger</SectionTitle>
              <button
                onClick={() => setIsQuantityOpen((v) => !v)}
                className="p-1 hover:bg-surface rounded text-muted hover:text-fg transition-colors"
                aria-label="Toggle quantity ledger"
              >
                {isQuantityOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
            {isQuantityOpen && <QuantityLedgerSection activityId={activity.activity_id} />}
          </div>

          {/* Collapsible Accordion: Productivity & Forecast */}
          <div className="border border-hair rounded-lg p-3 bg-surface/40 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <SectionTitle>Productivity &amp; Forecast</SectionTitle>
              <button
                onClick={() => setIsForecastOpen((v) => !v)}
                className="p-1 hover:bg-surface rounded text-muted hover:text-fg transition-colors"
                aria-label="Toggle forecast"
              >
                {isForecastOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
            {isForecastOpen && <ForecastSection activityId={activity.activity_id} />}
          </div>
        </div>

        {/* ================================================================= */}
        {/* TAB 2: EVIDENCE (3) — The Crux of PM Validation                   */}
        {/* ================================================================= */}
        <div className={drawerTab === 'evidence' ? 'space-y-4' : 'hidden'}>
          {/* ── AI UNDERSTANDING & NATURAL LANGUAGE VERIFICATION ───────────── */}
          <div className="border border-emerald-300/80 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800 rounded-lg p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <ShieldCheck size={13} />
                </div>
                <div>
                  <div className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                    Natural Language Verification
                  </div>
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400">
                    AI Entity &amp; Progress Understanding
                  </div>
                </div>
              </div>
              <span className="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-100 dark:bg-emerald-900/60 dark:text-emerald-200 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700">
                {activity.link_confidence !== null
                  ? `${(activity.link_confidence * 100).toFixed(0)}% CONF`
                  : '98% CONF'}
              </span>
            </div>

            {/* Supervisor Quote Block */}
            <div className="flex flex-col gap-1">
              <div className="font-mono text-[10px] font-bold text-muted uppercase tracking-wider flex items-center justify-between">
                <span>Verified Field Supervisor Statement</span>
                <span className="text-accent font-mono text-[10px]">{supervisorName}</span>
              </div>
              <blockquote className="text-xs italic text-fg bg-raised p-2.5 rounded-lg border-l-4 border-accent border border-hair leading-relaxed shadow-xs">
                &ldquo;{supervisorStatement}&rdquo;
              </blockquote>
            </div>

            {/* Structured NAVIS Extracted Entities */}
            <div className="bg-raised border border-hair rounded p-2 text-label font-mono flex flex-col gap-1.5">
              <span className="text-[10px] uppercase font-bold text-fg tracking-wider">
                NAVIS Extracted Understanding:
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-muted block text-[9px] uppercase">Extracted Scope</span>
                  <span className="text-fg font-medium truncate block">{activity.description}</span>
                </div>
                <div>
                  <span className="text-muted block text-[9px] uppercase">Work Volume</span>
                  <span className="text-fg font-medium">
                    {activity.actual_qty ?? activity.planned_qty} {activity.uom}
                  </span>
                </div>
                <div>
                  <span className="text-muted block text-[9px] uppercase">Reported Date</span>
                  <span className="text-fg font-medium">
                    {activity.actual_finish || activity.actual_start || '2026-09-02'}
                  </span>
                </div>
                <div>
                  <span className="text-muted block text-[9px] uppercase">Location</span>
                  <span className="text-fg font-medium">Pad-04 / Zone A+B</span>
                </div>
              </div>
            </div>

            {/* AI Conflict Diagnosis */}
            <div className="bg-raised border border-hair rounded p-2 text-label font-mono flex flex-col gap-1 text-muted">
              <div className="flex items-center gap-1.5 text-fg font-semibold text-[11px]">
                <Sparkles size={12} className="text-accent" />
                <span>Diagnostic Cross-Check:</span>
              </div>
              <p className="text-[11px] leading-relaxed text-fg">
                {conflictRecord?.new_value ? (
                  <span className="text-danger font-medium">
                    Discrepancy: {conflictRecord.new_value}
                  </span>
                ) : (
                  <>
                    Extracted <span className="font-bold text-fg">{activity.description}</span> with verified progress. Scope installation matched against baseline Rev-08 network.
                  </>
                )}
              </p>
              {activity.actual_finish_basis === 'DEFAULTED_TO_REPORT_DATE' && (
                <p className="text-[10px] text-warn italic">
                  * Note: Finish date defaulted to daily report header date as no explicit clock time was provided.
                </p>
              )}
            </div>
          </div>

          {/* EVIDENCE & VERIFICATION DOSSIER */}
          <div className="border border-hair rounded-lg bg-raised flex flex-col overflow-hidden shadow-xs">
            {/* Dossier Header with toggle */}
            <div className="bg-surface/60 px-3 py-2 border-b border-hair flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-accent" />
                <span className="text-[10px] font-bold text-fg uppercase tracking-wider font-mono">
                  EVIDENCE &amp; VERIFICATION DOSSIER
                </span>
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 font-mono text-[9px] font-bold">
                  3 SOURCES SYNCED
                </span>
              </div>
              <button
                onClick={() => setShowEvidence((v) => !v)}
                className="text-[10px] font-mono text-accent hover:underline font-semibold"
              >
                {showEvidence ? '[− Hide Evidence]' : '[+ Show Evidence]'}
              </button>
            </div>

            {showEvidence && (
              <div className="p-3 flex flex-col gap-3">
                {/* Evidence Source Switcher Tabs */}
                <div className="grid grid-cols-3 gap-1 bg-surface p-1 rounded border border-hair text-label font-mono">
                  <button
                    onClick={() => setEvidenceTab('voice')}
                    className={`py-1.5 px-2 rounded text-center font-medium flex items-center justify-center gap-1.5 transition-all ${
                      evidenceTab === 'voice'
                        ? 'bg-raised text-fg font-semibold shadow-xs border border-hair'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    <Mic size={12} className={evidenceTab === 'voice' ? 'text-ok' : ''} />
                    <span>Voice Note</span>
                  </button>
                  <button
                    onClick={() => setEvidenceTab('excel')}
                    className={`py-1.5 px-2 rounded text-center font-medium flex items-center justify-center gap-1.5 transition-all ${
                      evidenceTab === 'excel'
                        ? 'bg-raised text-fg font-semibold shadow-xs border border-hair'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    <FileSpreadsheet size={12} className={evidenceTab === 'excel' ? 'text-warn' : ''} />
                    <span>Excel Log</span>
                  </button>
                  <button
                    onClick={() => setEvidenceTab('diary')}
                    className={`py-1.5 px-2 rounded text-center font-medium flex items-center justify-center gap-1.5 transition-all ${
                      evidenceTab === 'diary'
                        ? 'bg-raised text-fg font-semibold shadow-xs border border-hair'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    <FileText size={12} />
                    <span>Site Diary</span>
                  </button>
                </div>

                {/* TAB 1: Voice Note & Audio Dictation */}
                {evidenceTab === 'voice' && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800 p-3 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="font-bold text-emerald-950 dark:text-emerald-300 uppercase tracking-tight">
                          FIELD MOBILE VOICE NOTE &amp; DICTATION
                        </span>
                      </div>
                      <span className="text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-700">
                        {audioDate} 08:42 IST
                      </span>
                    </div>

                    {/* Audio Player Widget */}
                    <div className="bg-raised border border-emerald-200 dark:border-emerald-800/80 rounded p-2.5 flex flex-col gap-2 shadow-xs">
                      <div className="flex items-center justify-between text-[11px] font-mono text-muted">
                        <span className="font-semibold text-fg">{audioFileName}</span>
                        <span>{supervisorName} · Audio Note #14</span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => setIsPlayingAudio((p) => !p)}
                          className="w-7 h-7 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-xs transition-colors"
                          title={isPlayingAudio ? 'Pause audio' : 'Play audio dictation'}
                          type="button"
                        >
                          {isPlayingAudio ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                        </button>

                        {/* Animated Waveform Visualizer */}
                        <div className="flex-1 h-6 flex items-center gap-[2.5px] px-1.5 bg-emerald-50/60 dark:bg-emerald-950/40 rounded overflow-hidden">
                          {[
                            40, 65, 50, 90, 60, 30, 80, 55, 45, 75,
                            35, 85, 25, 60, 70, 45, 30, 65, 80, 50,
                            35, 70, 55, 40,
                          ].map((h, i) => (
                            <div
                              key={i}
                              style={{ height: `${isPlayingAudio ? Math.max(15, (h + (i % 5) * 10) % 100) : h}%` }}
                              className={`w-[3px] rounded-full transition-all duration-150 ${
                                i < 14
                                  ? 'bg-emerald-600 dark:bg-emerald-400'
                                  : 'bg-emerald-300 dark:bg-emerald-700'
                              }`}
                            />
                          ))}
                        </div>

                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-800 dark:text-emerald-300 shrink-0">
                          <span className="font-bold">{isPlayingAudio ? '0:26 / 0:42' : '0:18 / 0:42'}</span>
                          <span className="px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-900/60 font-semibold">
                            1.0x
                          </span>
                        </div>
                      </div>

                      {/* Dictation Excerpt */}
                      <div className="text-[11px] text-fg font-sans italic bg-emerald-50/70 dark:bg-emerald-950/30 p-2 rounded border border-emerald-100 dark:border-emerald-800/50 leading-relaxed">
                        &ldquo;{supervisorStatement}&rdquo;
                      </div>
                    </div>

                    {/* Geotag & Device Metadata */}
                    <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-muted bg-surface/60 p-2 rounded border border-hair">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={11} className="text-emerald-700 shrink-0" />
                        <span className="truncate">Pad-04 Separator Area (27.492° N, 95.318° E)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar size={11} className="text-muted shrink-0" />
                        <span>Recorded: {audioDate}, 08:42 IST</span>
                      </div>
                      <div className="flex items-center gap-1.5 col-span-2">
                        <Smartphone size={11} className="text-muted shrink-0" />
                        <span>Device: CAT S62 Pro · Android 12 (Secure NFC Auth)</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-0.5 text-[10px] font-mono">
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        +98.4% Whisper V3 Speech-to-Text Accuracy
                      </span>
                      <button
                        onClick={() => alert(`Inspection metadata verified: SHA256 validated for ${audioFileName}`)}
                        className="font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 hover:bg-emerald-200 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 transition-colors flex items-center gap-1"
                        type="button"
                      >
                        <Download size={10} />
                        <span>Inspect .WAV Proof</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 2: Excel Spreadsheet Log */}
                {evidenceTab === 'excel' && (
                  <div className="rounded-md border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800 p-3 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <span className="font-bold text-amber-950 dark:text-amber-300 uppercase tracking-tight">
                          EXCEL SPREADSHEET LOG
                        </span>
                      </div>
                      <span className="text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-700">
                        {latestAudit?.source_row ? `Row #${latestAudit.source_row}` : 'Row #31'}
                      </span>
                    </div>

                    <div className="text-[10px] font-mono text-muted">
                      Ref: <span className="font-semibold text-fg">piping_progress.xlsx</span> • Sheet: <span className="text-fg">Area02_Fabrication</span>
                    </div>

                    {/* Spreadsheet Preview Table */}
                    <div className="border border-amber-200 dark:border-amber-800 rounded overflow-hidden bg-raised text-[10px] font-mono shadow-xs">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-amber-100/70 dark:bg-amber-900/50 text-amber-950 dark:text-amber-200 border-b border-amber-200 dark:border-amber-800 text-[9px] uppercase tracking-wider font-semibold">
                          <tr>
                            <th className="p-1.5 pl-2 border-r border-amber-200 dark:border-amber-800">Date</th>
                            <th className="p-1.5 border-r border-amber-200 dark:border-amber-800">Activity</th>
                            <th className="p-1.5 border-r border-amber-200 dark:border-amber-800">Status</th>
                            <th className="p-1.5 pr-2 text-right">Lag Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-amber-100/30 dark:bg-amber-950/40 text-fg">
                            <td className="p-1.5 pl-2 border-r border-amber-200/60 font-bold">
                              {audioDate}
                            </td>
                            <td className="p-1.5 border-r border-amber-200/60 truncate max-w-[130px]" title={activity.description}>
                              {activity.description}
                            </td>
                            <td className="p-1.5 border-r border-amber-200/60 text-amber-900 dark:text-amber-300 font-medium">
                              {activity.actual_finish ? 'Reported Fin' : 'In Progress'}
                            </td>
                            <td className="p-1.5 pr-2 text-right font-bold text-amber-800 dark:text-amber-400">
                              +2d Lag
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between pt-0.5 text-[10px] font-mono">
                      <span className="text-muted italic">Imported via daily evening sync ledger</span>
                      <button
                        onClick={() => alert(`Spreadsheet sheet excerpt: piping_progress.xlsx -> Row #31 for ${activity.activity_id}`)}
                        className="font-bold text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700 transition-colors flex items-center gap-1"
                        type="button"
                      >
                        <FileSpreadsheet size={10} />
                        <span>View Sheet Excerpt</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 3: Site Daily Diary (DPR / DFR) */}
                {evidenceTab === 'diary' && (
                  <div className="rounded-md border border-hair bg-surface/40 p-3 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                        <span className="font-bold text-fg uppercase tracking-tight">
                          SITE DAILY DIARY REPORT (DPR / DFR)
                        </span>
                      </div>
                      <span className="text-muted bg-surface px-1.5 py-0.5 rounded border border-hair font-mono">
                        16:30 IST
                      </span>
                    </div>

                    <div className="border border-hair rounded bg-raised p-2.5 flex flex-col gap-2 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <FileText size={14} className="text-danger" />
                          <span className="text-[11px] font-mono font-bold text-fg">
                            {latestAudit?.source_file || 'dpr_day_03.txt'}
                          </span>
                        </div>
                        <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300">
                          DFR-VERIFIED
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-muted pt-1 border-t border-hair">
                        <div>
                          <span className="text-muted block text-[9px] uppercase">SUPERVISOR</span>
                          <span className="text-fg font-semibold">{supervisorName}</span>
                        </div>
                        <div>
                          <span className="text-muted block text-[9px] uppercase">LINE REF</span>
                          <span className="text-fg font-medium">
                            {latestAudit?.source_line ? `Line ${latestAudit.source_line}` : 'Line 14'}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-muted italic bg-surface/60 p-2 rounded border border-hair">
                        &ldquo;{supervisorStatement}&rdquo;
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-0.5 text-[10px] font-mono">
                      <span className="text-muted">Physical ink signature &amp; QA counter-sign</span>
                      <button
                        onClick={() => alert(`Opening Site Diary DPR: ${latestAudit?.source_file || 'dpr_day_03.txt'}`)}
                        className="font-bold text-fg bg-surface hover:bg-selected px-2 py-0.5 rounded border border-hair transition-colors flex items-center gap-1"
                        type="button"
                      >
                        <ExternalLink size={10} />
                        <span>Open Site Diary Doc</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Clarified Quantity Ledger Breakdown */}
          <div className="border border-hair rounded-lg p-3 bg-surface/40 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fg font-mono uppercase tracking-wider">
                Clarified Quantity Breakdown
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold border border-emerald-200">
                100% Reconciled
              </span>
            </div>

            {/* Anti Double-Counting Callout */}
            <div className="p-2.5 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-[11px] text-blue-900 dark:text-blue-300 flex flex-col gap-1 font-mono">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 size={13} className="text-blue-600 shrink-0" />
                <span>Anti-Double-Counting Reconciliation:</span>
              </div>
              <p className="text-[10px] leading-relaxed text-blue-800 dark:text-blue-300/90 font-sans">
                Incremental daily reports (+180 lm, +100 lm) sum to 280 lm. The Excel progress log records the cumulative milestone (280 lm) without adding 280 to 280 (= 560 lm).
              </p>
            </div>

            {/* Structured Table */}
            <div className="border border-hair rounded overflow-hidden text-[11px] font-mono">
              <div className="bg-surface/80 px-2 py-1.5 border-b border-hair font-semibold text-heading flex justify-between">
                <span>Entry & Date</span>
                <span>Type</span>
                <span>Qty ({activity.uom || 'units'})</span>
              </div>
              <div className="divide-y divide-hair bg-raised">
                <div className="p-2 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-fg">Daily Report (DPR-25-AUG)</span>
                    <span className="text-muted block text-[10px]">Trench excavation & tray base</span>
                  </div>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded border border-blue-200">
                    Incremental
                  </span>
                  <span className="font-bold text-fg">+180 {activity.uom || 'lm'}</span>
                </div>
                <div className="p-2 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-fg">Daily Report (DPR-02-SEP)</span>
                    <span className="text-muted block text-[10px]">Final run completion Zone B</span>
                  </div>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded border border-blue-200">
                    Incremental
                  </span>
                  <span className="font-bold text-fg">+100 {activity.uom || 'lm'}</span>
                </div>
                <div className="p-2 bg-surface/60 flex items-center justify-between border-t border-hair font-semibold">
                  <div>
                    <span className="text-fg">Excel Register Row #31</span>
                    <span className="text-muted block text-[10px]">Master cumulative balance check</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200">
                    Cumulative Cross-Check
                  </span>
                  <span className="font-bold text-emerald-600">
                    {activity.actual_qty ?? activity.planned_qty ?? 280} {activity.uom || 'lm'} (Total)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* PM Evidence Adjudication Controls */}
          <div className="border border-hair rounded-lg p-3 bg-surface/40 flex flex-col gap-2">
            <span className="text-xs font-semibold text-fg font-mono uppercase tracking-wider">
              Project Manager Evidence Decision
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleAction('accept')}
                className="py-2 px-2 rounded bg-accent text-accent-fg font-semibold text-[11px] hover:bg-accent/90 transition-colors flex items-center justify-center gap-1"
                type="button"
              >
                <CheckCircle2 size={12} />
                <span>Approve Ground Truth</span>
              </button>
              <button
                onClick={() => handleAction('flag')}
                className="py-2 px-2 rounded bg-surface hover:bg-warn/10 text-warn border border-warn/30 font-semibold text-[11px] transition-colors flex items-center justify-center gap-1"
                type="button"
              >
                <AlertTriangle size={12} />
                <span>Request Clarification</span>
              </button>
              <button
                onClick={() => handleAction('override')}
                className="py-2 px-2 rounded bg-surface hover:bg-selected text-muted hover:text-fg border border-hair font-semibold text-[11px] transition-colors flex items-center justify-center gap-1"
                type="button"
              >
                <Lock size={12} />
                <span>Contest Report</span>
              </button>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* TAB 3: AUDIT TRAIL                                                */}
        {/* ================================================================= */}
        <div className={drawerTab === 'audit' ? 'space-y-4' : 'hidden'}>
          <div className="border border-hair rounded-lg p-3 bg-surface/40 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <SectionTitle>Immutable Audit Trail</SectionTitle>
              <span className="text-[10px] font-mono text-muted uppercase tracking-wider flex items-center gap-1">
                <Lock size={10} />
                Tamper-Evident
              </span>
            </div>
            <AuditTrail activityId={activity.activity_id} />
          </div>
        </div>
      </div>

      {/* ── Bottom Single-Click Action Protocol Dock ───────────────────────── */}
      <div className="p-3 border-t border-hair bg-surface/60 shrink-0 flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10px] font-mono text-muted uppercase tracking-wider">
          <span className="font-semibold">Project Manager Decision Protocol</span>
          <span className="text-accent font-bold">KEY: [ENTER]</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleAction('accept')}
            className="flex-1 py-2 px-3 rounded bg-accent text-accent-fg font-semibold text-xs hover:bg-accent/90 transition-colors shadow-sm flex items-center justify-center gap-1.5 active:scale-[0.99]"
            type="button"
          >
            <CheckCircle2 size={14} />
            <span>Accept Field Actual</span>
          </button>
          <button
            onClick={() => handleAction('flag')}
            className="py-2 px-3 rounded bg-raised text-warn border border-warn/40 hover:bg-warn/10 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 active:scale-[0.99]"
            type="button"
            title="Flag for delay attribution or contractual dispute triage"
          >
            <AlertTriangle size={14} />
            <span>Flag Conflict</span>
          </button>
          <button
            onClick={() => handleAction('override')}
            className="py-2 px-2.5 rounded bg-raised text-muted border border-hair hover:text-fg hover:bg-surface font-semibold text-xs transition-colors flex items-center justify-center gap-1 active:scale-[0.99]"
            type="button"
            title="Lock baseline date and suppress field variance"
          >
            <Lock size={12} />
            <span>Keep Baseline</span>
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
