import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  FileText,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { Button, EmptyState, ErrorState, SkeletonRows } from '../components/ui';
import { useTranslation } from '../lib/i18n';

/**
 * Field Supervisor — My Updates
 *
 * Tracks submitted site updates, their schedule match, and review status.
 * Actions are required only when Planning requests clarification.
 */

const FILTERS = ['All', 'Processing', 'Needs Response', 'Confirmed'] as const;
type Filter = (typeof FILTERS)[number];

function statusBadge(status: string) {
  switch (status) {
    case 'Confirmed':
      return {
        label: 'Confirmed',
        cls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
        dot: 'bg-emerald-500',
      };
    case 'Needs Information':
    case 'Needs Response':
      return {
        label: 'Needs Response',
        cls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
        dot: 'bg-amber-500',
      };
    case 'Rejected':
      return {
        label: 'Rejected',
        cls: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
        dot: 'bg-rose-500',
      };
    case 'Processing':
    default:
      return {
        label: 'Processing',
        cls: 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60',
        dot: 'bg-blue-500',
      };
  }
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString([], {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function justTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function TimelineItem({
  title,
  time,
  detail,
  isLast = false,
  status = 'complete',
}: {
  title: string;
  time: string;
  detail: string;
  isLast?: boolean;
  status?: 'complete' | 'active' | 'pending';
}) {
  return (
    <div className="flex items-start gap-3 relative">
      {!isLast && (
        <div
          className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${
            status === 'complete' ? 'bg-emerald-500/40' : 'bg-hair'
          }`}
        />
      )}
      <div
        className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 z-10 text-xs font-bold ${
          status === 'complete'
            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
            : status === 'active'
              ? 'bg-accent text-accent-fg border border-accent ring-4 ring-accent/15'
              : 'bg-surface border border-hair text-muted'
        }`}
      >
        {status === 'complete' ? '✓' : '•'}
      </div>
      <div className="flex-1 pb-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-heading">{title}</span>
          <span className="text-[11px] font-mono text-muted">{time}</span>
        </div>
        <p className="text-xs text-muted mt-0.5 leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}

export default function FieldReports() {
  const navigate = useNavigate();
  const { lang, t, tVal } = useTranslation();
  const [filter, setFilter] = useState<Filter>('All');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['fieldReports'],
    queryFn: () => api.getFieldReports(),
  });

  const reports = data ?? [];
  const counts = useMemo(
    () => ({
      total: reports.length,
      processing: reports.filter((r) => r.status === 'Processing').length,
      needsResponse: reports.filter((r) => r.status === 'Needs Information').length,
      confirmed: reports.filter((r) => r.status === 'Confirmed').length,
    }),
    [reports]
  );

  const shown = useMemo(() => {
    if (filter === 'All') return reports;
    if (filter === 'Needs Response') {
      return reports.filter((r) => r.status === 'Needs Information');
    }
    return reports.filter((r) => r.status === filter);
  }, [reports, filter]);

  const open = reports.find((r) => r.id === openId) ?? null;

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 sm:py-6 flex flex-col gap-5 max-w-[1200px] mx-auto w-full font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-hair/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-heading tracking-tight">
            {lang === 'en-IN' ? (
              'My Updates'
            ) : (
              <>
                <span className="sr-only">My Updates</span>
                <span>{t('my_updates_title', 'My Updates')}</span>
              </>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-1 leading-relaxed">
            {t('my_updates_sub', 'Track your submitted field updates and respond when action is required.')}
          </p>
        </div>

        {/* Compact Summary Row */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-hair text-xs text-muted">
            <span className="font-bold text-heading font-mono">{counts.total}</span>
            <span>{counts.total === 1 ? 'update' : 'updates'}</span>
          </span>

          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/40 text-xs text-blue-700 dark:text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="font-bold font-mono">{counts.processing}</span>
            <span>processing</span>
          </span>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs ${
              counts.needsResponse > 0
                ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 font-semibold'
                : 'bg-surface border border-hair text-muted'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                counts.needsResponse > 0 ? 'bg-amber-500' : 'bg-muted/40'
              }`}
            ></span>
            <span className="font-bold font-mono">{counts.needsResponse}</span>
            <span>{counts.needsResponse === 1 ? 'needs response' : 'need response'}</span>
          </span>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const active = filter === f;
          const count =
            f === 'All'
              ? counts.total
              : f === 'Processing'
                ? counts.processing
                : f === 'Needs Response'
                  ? counts.needsResponse
                  : counts.confirmed;
          const labelMap: Record<Filter, string> = {
            All: t('all', 'All'),
            Processing: t('filter_processing', 'Processing'),
            'Needs Response': t('needs_response', 'Needs Response'),
            Confirmed: t('filter_confirmed', 'Confirmed'),
          };
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                active
                  ? 'bg-accent/10 text-accent border border-accent/30 shadow-xs'
                  : 'bg-surface text-muted hover:text-heading hover:bg-selected border border-hair'
              }`}
            >
              <span>{lang === 'en-IN' ? f : (
                <>
                  <span className="sr-only">{f}</span>
                  <span>{labelMap[f] || f}</span>
                </>
              )}</span>
              <span
                className={`font-mono text-[11px] px-1.5 py-0.2 rounded-full ${
                  active ? 'bg-accent text-accent-fg' : 'bg-raised text-muted'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {error ? (
        <ErrorState error={error} />
      ) : isLoading ? (
        <SkeletonRows rows={3} height="h-20" padded={false} />
      ) : reports.length === 0 ? (
        <div className="border border-hair bg-raised rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center gap-4 max-w-lg mx-auto w-full my-4 shadow-xs">
          <div className="h-12 w-12 rounded-full bg-blue-50 dark:bg-blue-950/50 text-accent flex items-center justify-center">
            <FileText size={24} />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-heading">
              {lang === 'en-IN' ? (
                'No reports yet'
              ) : (
                <>
                  <span className="sr-only">No reports yet</span>
                  <span>{t('no_reports_yet', 'No reports yet')}</span>
                </>
              )}
            </h3>
            <p className="text-xs sm:text-sm text-muted mt-1 leading-relaxed">
              {t('reports_appear_here', 'Your submitted updates will appear here.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/field')}
            className="px-5 py-2.5 rounded-xl bg-accent hover:opacity-90 active:opacity-95 text-accent-fg text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            Report from Home
            <span className="sr-only">create first report</span>
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted border border-hair rounded-2xl bg-raised">
          No updates with status &ldquo;{filter}&rdquo;.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((r) => {
            const badge = statusBadge(r.status);
            const isOpen = openId === r.id;
            return (
              <div
                key={r.id}
                onClick={() => setOpenId(isOpen ? null : r.id)}
                className={`rounded-2xl border transition-all p-4 sm:p-5 cursor-pointer flex flex-col gap-2.5 shadow-xs ${
                  isOpen
                    ? 'bg-selected/60 border-accent/40 ring-1 ring-accent/20'
                    : 'bg-raised border-hair hover:bg-selected/40 hover:border-accent/20'
                }`}
              >
                {/* Metadata & Status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-mono text-xs text-muted">
                    <span>Update #{r.reference}</span>
                    <span>·</span>
                    <span>{when(r.submitted_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.cls}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
                      <span>{lang === 'en-IN' ? badge.label : tVal(badge.label)}</span>
                    </span>
                    <ChevronRight
                      size={15}
                      className={`text-muted transition-transform ${
                        isOpen ? 'rotate-90 text-heading' : ''
                      }`}
                    />
                  </div>
                </div>

                {/* Primary: What was reported */}
                <div className="text-sm sm:text-base font-semibold text-heading leading-relaxed">
                  {r.raw_text}
                </div>

                {/* Secondary: Matched Activity & Context */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5 text-xs">
                  {r.matched_activity_id ? (
                    <div className="flex items-center gap-1.5 font-mono text-accent">
                      <span className="font-bold px-1.5 py-0.5 rounded bg-accent/10">
                        {r.matched_activity_id}
                      </span>
                      {r.matched_activity_description && (
                        <span className="font-sans text-muted font-medium">
                          · {r.matched_activity_description}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      Unmatched · Flagged for planner placement
                    </span>
                  )}
                  <span className="text-hair">|</span>
                  <span className="text-muted font-medium">
                    {r.location ?? r.discipline_label ?? 'OIL Well Pad 04'}
                  </span>
                </div>

                {/* Actionable Prompt if Needs Information */}
                {r.status === 'Needs Information' && r.clarification_question && (
                  <div className="mt-1.5 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-start gap-2">
                      <AlertCircle
                        size={15}
                        className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-amber-900 dark:text-amber-200 block">
                          Planning asked:
                        </span>
                        <span className="text-amber-800 dark:text-amber-300 italic">
                          “{r.clarification_question}”
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const targetId = r.review_item_id ?? r.reference;
                        navigate(`/field/clarifications${targetId ? `?item=${encodeURIComponent(targetId)}` : ''}`);
                      }}
                      className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-colors shrink-0 cursor-pointer self-start sm:self-auto"
                    >
                      Respond
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Update Detail Drawer / Slideout */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-surface border-l border-hair shadow-2xl h-full flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-hair flex items-center justify-between sticky top-0 bg-surface/95 backdrop-blur-xs z-10">
              <div>
                <span className="text-[11px] font-mono text-muted uppercase tracking-wider block">
                  Update #{open.reference}
                </span>
                <h2 className="text-lg font-bold text-heading mt-0.5">
                  Update Details
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-heading hover:bg-selected transition-colors cursor-pointer"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-5 flex flex-col gap-5 flex-1">
              {/* Status Header Chip */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-hair bg-raised">
                <span className="text-xs text-muted font-medium">Status</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                    statusBadge(open.status).cls
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${statusBadge(open.status).dot}`}></span>
                  <span>{statusBadge(open.status).label}</span>
                </span>
              </div>

              {/* What you reported */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                  What you reported
                </span>
                <blockquote className="p-4 rounded-xl border border-hair bg-raised text-heading text-sm font-medium italic leading-relaxed border-l-4 border-l-accent">
                  “{open.raw_text}”
                </blockquote>
              </div>

              {/* Context Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl border border-hair bg-raised">
                  <span className="text-[11px] text-muted block">Submitted</span>
                  <span className="text-xs font-bold text-heading mt-0.5 block">
                    {when(open.submitted_at)}
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-hair bg-raised">
                  <span className="text-[11px] text-muted block">Workfront</span>
                  <span className="text-xs font-bold text-heading mt-0.5 block">
                    {open.location ?? 'Well Pad 04 · Sector A'}
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-hair bg-raised">
                  <span className="text-[11px] text-muted block">Discipline</span>
                  <span className="text-xs font-bold text-heading mt-0.5 block">
                    {open.discipline_label ?? 'Piping'}
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-hair bg-raised">
                  <span className="text-[11px] text-muted block">Shift</span>
                  <span className="text-xs font-bold text-heading mt-0.5 block">
                    Day Shift (06:00 - 18:00)
                  </span>
                </div>
              </div>

              {/* Schedule Link */}
              <div className="p-4 rounded-xl border border-hair bg-raised flex flex-col gap-2">
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                  Schedule Link
                </span>
                {open.matched_activity_id ? (
                  <div>
                    <span className="font-mono text-xs font-bold text-accent px-2 py-0.5 rounded bg-accent/10 inline-block mb-1">
                      {open.matched_activity_id}
                    </span>
                    <span className="text-xs font-bold text-heading block">
                      {open.matched_activity_description ?? 'Matched Activity'}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    No matching activity found — flagged for Planning Engineer to place
                  </span>
                )}
              </div>

              {/* Actionable Question from Planning */}
              {open.clarification_question && (
                <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 flex flex-col gap-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle
                      size={16}
                      className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
                    />
                    <div>
                      <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                        Question from Planning
                      </span>
                      <span className="text-xs text-amber-800 dark:text-amber-300 italic mt-0.5 block">
                        “{open.clarification_question}”
                      </span>
                    </div>
                  </div>
                  {!open.clarification_response && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = open.review_item_id ?? open.reference;
                        navigate(`/field/clarifications${targetId ? `?item=${encodeURIComponent(targetId)}` : ''}`);
                      }}
                      className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer text-center"
                    >
                      Respond to Planning
                    </button>
                  )}
                </div>
              )}

              {/* Status History Timeline */}
              <div className="p-4 rounded-xl border border-hair bg-raised flex flex-col gap-3">
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                  Status Timeline
                </span>
                <div className="pt-2 flex flex-col">
                  <TimelineItem
                    title="Update submitted"
                    time={justTime(open.submitted_at)}
                    detail="Logged by Field Supervisor"
                    status="complete"
                  />
                  <TimelineItem
                    title="NAVIS extracted details"
                    time={justTime(open.submitted_at)}
                    detail="Identified work scope, quantity and discipline"
                    status="complete"
                  />
                  <TimelineItem
                    title="Schedule linked"
                    time={justTime(open.submitted_at)}
                    detail={
                      open.matched_activity_id
                        ? `Matched to ${open.matched_activity_id}`
                        : 'Flagged for planner placement'
                    }
                    status="complete"
                  />
                  <TimelineItem
                    title={
                      open.status === 'Confirmed'
                        ? 'Confirmed'
                        : open.status === 'Needs Information'
                          ? 'Clarification Requested'
                          : 'Processing'
                    }
                    time={justTime(open.submitted_at)}
                    detail={
                      open.status === 'Confirmed'
                        ? 'Planning Engineer approved and committed actuals'
                        : open.status === 'Needs Information'
                          ? 'Waiting for clarification response'
                          : 'In review by Planning Engineer'
                    }
                    isLast
                    status={open.status === 'Confirmed' ? 'complete' : 'active'}
                  />
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-hair bg-surface/95 backdrop-blur-xs flex items-center justify-between gap-3 sticky bottom-0">
              <button
                type="button"
                onClick={() => navigate('/field/reports/ledger')}
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>View audit trail</span>
                <ArrowRight size={13} />
              </button>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="px-4 py-2 rounded-xl border border-hair bg-surface hover:bg-selected text-xs font-semibold text-heading transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
