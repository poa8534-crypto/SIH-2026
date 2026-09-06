import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  X,
  Mic,
  StopCircle,
  Check,
  Send,
  MessageSquare,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { api } from '../lib/api';
import { Clarification } from '../types';
import { useSpeech } from '../hooks/useSpeech';
import { Button, ErrorState, SkeletonRows } from '../components/ui';

/**
 * Questions the Planning Engineer put back to this supervisor.
 *
 * Answering hands the item back to the planner. It writes no schedule data,
 * confirms no match and creates no activity — the planner still decides.
 *
 * Designed as a professional Actionable Work Queue / Inbox.
 */

const FILTERS = ['All', 'Needs Response', 'Answered'] as const;
type Filter = (typeof FILTERS)[number];

function when(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function FieldClarifications() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');
  const [activeClarification, setActiveClarification] = useState<Clarification | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [searchParams] = useSearchParams();
  const targetItemId = searchParams.get('item') ?? searchParams.get('respond');

  // Fetch all clarifications
  const { data, isLoading, error } = useQuery({
    queryKey: ['clarifications'],
    queryFn: () => api.getClarifications(false),
  });

  // Fetch schedule activities to display human-readable activity descriptions
  const { data: scheduleData } = useQuery({
    queryKey: ['schedule', 'index'],
    queryFn: () => api.getSchedule(undefined, false),
    staleTime: 60_000,
  });

  const activityNames = useMemo(() => {
    const map = new Map<string, string>();
    if (scheduleData?.activities) {
      for (const act of scheduleData.activities) {
        map.set(act.activity_id, act.description);
      }
    }
    return map;
  }, [scheduleData]);

  const items = useMemo(() => data ?? [], [data]);

  // Handle deep-link from URL query parameter (e.g. from My Updates)
  useEffect(() => {
    if (targetItemId && items.length > 0) {
      const match = items.find(
        (i) =>
          i.id === targetItemId ||
          i.reference === targetItemId ||
          i.review_item_id === targetItemId
      );
      if (match && !match.answered) {
        setActiveClarification(match);
      }
    }
  }, [targetItemId, items]);

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const counts = useMemo(() => {
    const needsResponse = items.filter((i) => !i.answered).length;
    const answered = items.filter((i) => i.answered).length;
    return {
      needsResponse,
      answered,
      total: items.length,
    };
  }, [items]);

  // Sort: Needs Response first (ordered by date asked), then Answered below (newest first)
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (!a.answered && b.answered) return -1;
      if (a.answered && !b.answered) return 1;
      const tA = new Date(a.asked_at).getTime() || 0;
      const tB = new Date(b.asked_at).getTime() || 0;
      return !a.answered ? tA - tB : tB - tA;
    });
  }, [items]);

  // Filter and search
  const filteredItems = useMemo(() => {
    let list = sortedItems;
    if (filter === 'Needs Response') {
      list = list.filter((i) => !i.answered);
    } else if (filter === 'Answered') {
      list = list.filter((i) => i.answered);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.question.toLowerCase().includes(q) ||
          i.original_text.toLowerCase().includes(q) ||
          (i.matched_activity_id && i.matched_activity_id.toLowerCase().includes(q)) ||
          (i.asked_by && i.asked_by.toLowerCase().includes(q)) ||
          (i.reference && i.reference.toLowerCase().includes(q))
      );
    }

    return list;
  }, [sortedItems, filter, search]);

  const unansweredItems = useMemo(
    () => filteredItems.filter((i) => !i.answered),
    [filteredItems]
  );
  const answeredItems = useMemo(
    () => filteredItems.filter((i) => i.answered),
    [filteredItems]
  );

  return (
    <div className="flex-1 overflow-y-auto bg-surface text-fg font-sans">
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
        {/* Toast feedback banner */}
        {toastMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-300 text-sm font-medium flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200 cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hair pb-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-heading">
                Clarifications
              </h1>
              {counts.needsResponse > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {counts.needsResponse} require your response
                </span>
              ) : counts.total > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                  <Check size={12} />
                  All caught up
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted mt-1">
              Questions from Planning about your submitted field updates.
            </p>
          </div>

          {/* Compact summary indicator */}
          <div className="text-xs text-muted font-medium flex items-center gap-2">
            <span>{counts.needsResponse} need response</span>
            <span className="text-hair">·</span>
            <span>{counts.answered} answered</span>
          </div>
        </div>

        {/* Controls: Segmented Filter Chips + Compact Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Segmented Filter Chips */}
          <div className="inline-flex items-center p-1 rounded-xl bg-surface border border-hair gap-1 shrink-0 overflow-x-auto">
            {FILTERS.map((f) => {
              const isActive = filter === f;
              const count =
                f === 'All'
                  ? counts.total
                  : f === 'Needs Response'
                  ? counts.needsResponse
                  : counts.answered;

              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200/80 dark:border-blue-800/80 shadow-xs'
                      : 'text-muted hover:text-heading hover:bg-selected border border-transparent'
                  }`}
                >
                  <span>{f}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                      isActive
                        ? 'bg-blue-200/60 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200'
                        : 'bg-raised text-muted border border-hair/80'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Compact Search Field */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clarifications..."
              aria-label="Search clarifications"
              className="w-full pl-9 pr-8 py-1.5 rounded-xl border border-hair bg-raised text-xs text-heading placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-heading cursor-pointer"
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Content Section */}
        {error ? (
          <ErrorState error={error} />
        ) : isLoading ? (
          <SkeletonRows rows={3} height="h-32" padded={false} />
        ) : items.length === 0 ? (
          /* Natural Centered Empty State when zero total items exist */
          <div className="py-20 sm:py-28 text-center max-w-md mx-auto flex flex-col items-center">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 shadow-xs">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-base font-bold text-heading mb-1.5">
              No clarifications needed
            </h3>
            <p className="text-sm text-muted leading-relaxed">
              Planning hasn&apos;t requested any additional information from your submitted updates.
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          /* Filtered empty state */
          <div className="py-16 text-center max-w-md mx-auto flex flex-col items-center text-muted">
            <MessageSquare size={28} className="text-muted/60 mb-2" />
            <p className="text-sm font-medium text-heading">
              No clarifications found
            </p>
            <p className="text-xs text-muted mt-0.5">
              {search
                ? `No results matching "${search}"`
                : `No items currently under "${filter}"`}
            </p>
          </div>
        ) : (
          /* Work Queue Cards */
          <div className="flex flex-col gap-6">
            {/* Needs Response Section */}
            {unansweredItems.length > 0 && (
              <div className="flex flex-col gap-3">
                {filter === 'All' && (
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 px-1">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Needs Response ({unansweredItems.length})
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-3.5">
                  {unansweredItems.map((item) => (
                    <NeedsResponseCard
                      key={item.id}
                      item={item}
                      activityName={
                        item.matched_activity_id
                          ? activityNames.get(item.matched_activity_id)
                          : undefined
                      }
                      onOpenRespond={() => setActiveClarification(item)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Answered Section */}
            {answeredItems.length > 0 && (
              <div className="flex flex-col gap-3">
                {filter === 'All' && unansweredItems.length > 0 && (
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted px-1 mt-2">
                    <span className="flex items-center gap-1.5">
                      <Check size={14} className="text-emerald-600" />
                      Answered ({answeredItems.length})
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-3.5">
                  {answeredItems.map((item) => (
                    <AnsweredCard
                      key={item.id}
                      item={item}
                      activityName={
                        item.matched_activity_id
                          ? activityNames.get(item.matched_activity_id)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slideout Respond Drawer */}
      {activeClarification && (
        <RespondDrawer
          item={activeClarification}
          activityName={
            activeClarification.matched_activity_id
              ? activityNames.get(activeClarification.matched_activity_id)
              : undefined
          }
          onClose={() => setActiveClarification(null)}
          onSuccess={() => {
            setActiveClarification(null);
            setToastMessage('Response sent to Planning Engineer');
            queryClient.invalidateQueries({ queryKey: ['clarifications'] });
            queryClient.invalidateQueries({ queryKey: ['fieldReports'] });
            queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
          }}
        />
      )}
    </div>
  );
}

/**
 * Card for clarifications that require supervisor action.
 */
function NeedsResponseCard({
  item,
  activityName,
  onOpenRespond,
}: {
  item: Clarification;
  activityName?: string;
  onOpenRespond: () => void;
}) {
  return (
    <article
      onClick={onOpenRespond}
      className="rounded-2xl border border-amber-200/80 dark:border-amber-900/50 bg-raised p-5 shadow-xs transition-all hover:border-amber-400/80 dark:hover:border-amber-600 flex flex-col gap-3.5 group cursor-pointer"
    >
      {/* Top status & reference bar */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          Needs response
        </span>
        <span className="font-mono text-[11px] text-muted">{item.reference}</span>
      </div>

      {/* Question from Planning (Prominent element) */}
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-heading leading-snug group-hover:text-amber-800 dark:group-hover:text-amber-300 transition-colors">
          {item.question}
        </h2>
      </div>

      {/* Related field update context */}
      <div className="rounded-xl border border-hair/70 bg-surface/70 p-3.5 flex flex-col gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
          Related Update
        </span>
        <p className="text-sm text-fg italic leading-relaxed">
          &ldquo;{item.original_text}&rdquo;
        </p>
        {item.matched_activity_id && (
          <div className="text-xs text-muted flex items-center gap-1.5 pt-1 border-t border-hair/50 mt-1">
            <FileText size={13} className="text-accent shrink-0" />
            <span className="font-mono font-medium text-heading">
              {item.matched_activity_id}
            </span>
            {activityName && <span>· {activityName}</span>}
          </div>
        )}
      </div>

      {/* Footer metadata & Respond CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 text-xs text-muted">
        <div className="flex items-center gap-1.5">
          <Clock size={13} className="shrink-0 text-muted" />
          <span>
            Asked by <strong className="text-heading font-medium">{item.asked_by}</strong> · Planning Engineer
          </span>
          <span className="text-hair">|</span>
          <span>{timeAgo(item.asked_at)}</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenRespond();
          }}
          className="px-4 py-2 rounded-xl bg-accent hover:opacity-90 active:opacity-95 text-accent-fg text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer self-stretch sm:self-auto"
        >
          <span>Respond</span>
        </button>
      </div>
    </article>
  );
}

/**
 * Card for already answered clarifications (traceability view).
 */
function AnsweredCard({
  item,
  activityName,
}: {
  item: Clarification;
  activityName?: string;
}) {
  return (
    <article className="rounded-2xl border border-hair bg-raised/70 p-5 shadow-xs flex flex-col gap-3 opacity-95">
      {/* Top status bar */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <Check size={12} />
          Answered
        </span>
        <span className="font-mono text-[11px] text-muted">{item.reference}</span>
      </div>

      {/* Question */}
      <div>
        <h3 className="text-sm sm:text-base font-semibold text-heading leading-snug">
          {item.question}
        </h3>
        <p className="text-xs text-muted mt-1">
          Regarding update: &ldquo;{item.original_text}&rdquo;
          {item.matched_activity_id && (
            <span className="ml-1 font-mono font-medium text-heading">
              ({item.matched_activity_id}{activityName ? ` · ${activityName}` : ''})
            </span>
          )}
        </p>
      </div>

      {/* Your response block */}
      <div className="rounded-xl border border-hair/80 bg-surface/60 p-3.5 flex flex-col gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
          Your Response
        </span>
        <p className="text-sm text-fg leading-relaxed">
          &ldquo;{item.response}&rdquo;
        </p>
      </div>

      {/* Traceability timestamp */}
      <div className="flex items-center justify-between text-[11px] text-muted pt-0.5">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 size={13} className="text-emerald-600" />
          <span>Response sent to Planning Engineer</span>
        </span>
        <span>{when(item.answered_at)}</span>
      </div>
    </article>
  );
}

/**
 * In-context Slideout Drawer for responding to a clarification.
 */
function RespondDrawer({
  item,
  activityName,
  onClose,
  onSuccess,
}: {
  item: Clarification;
  activityName?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const speech = useSpeech();
  const [draft, setDraft] = useState('');
  const [reviewing, setReviewing] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const send = useMutation({
    mutationFn: () => api.answerClarification(item.id, draft.trim()),
    onSuccess: () => {
      onSuccess();
    },
  });

  const micBlocked = !speech.supported || speech.failure === 'denied';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-lg bg-raised border-l border-hair shadow-2xl z-10 flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-hair flex items-center justify-between gap-3 bg-surface/60">
          <div>
            <h2 className="text-base font-bold text-heading">
              Respond to Planning
            </h2>
            <p className="text-xs text-muted font-mono mt-0.5">
              Ref: {item.reference}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-heading hover:bg-selected transition-colors cursor-pointer"
            title="Close drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Question Callout */}
          <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs text-amber-900 dark:text-amber-200 font-medium">
              <AlertCircle size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                Asked by <strong>{item.asked_by}</strong> · Planning Engineer
              </span>
            </div>
            <p className="text-base font-semibold text-heading leading-snug">
              {item.question}
            </p>
            <span className="text-[11px] text-muted">
              Sent {when(item.asked_at)} ({timeAgo(item.asked_at)})
            </span>
          </div>

          {/* Original Update Context */}
          <div className="p-4 rounded-xl border border-hair bg-surface/60 flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
              Original Field Report
            </span>
            <blockquote className="text-sm text-fg italic border-l-2 border-accent pl-3 my-0.5 leading-relaxed">
              &ldquo;{item.original_text}&rdquo;
            </blockquote>
            {item.matched_activity_id && (
              <div className="text-xs text-muted flex items-center gap-1.5 pt-1.5 border-t border-hair/60 mt-1">
                <span className="font-bold text-muted">Activity:</span>
                <span className="font-mono font-medium text-heading">
                  {item.matched_activity_id}
                </span>
                {activityName && <span>· {activityName}</span>}
              </div>
            )}
          </div>

          {/* Response Composer */}
          <div className="flex flex-col gap-2.5">
            <label
              htmlFor="clarification-response-input"
              className="text-xs font-semibold text-heading"
            >
              Your response
            </label>

            {speech.listening ? (
              <div className="p-4 rounded-xl border border-accent/40 bg-accent/5 flex flex-col items-center gap-3">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-danger rounded-full animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-danger">
                    Listening
                  </span>
                </span>
                <p className="text-sm text-heading text-center min-h-[40px] italic">
                  {speech.transcript || 'Speak now…'}
                </p>
                <div className="flex gap-2 w-full">
                  <Button
                    variant="primary"
                    block
                    onClick={() => {
                      speech.stop();
                      setDraft(speech.transcript);
                      setReviewing(true);
                    }}
                  >
                    <StopCircle size={15} />
                    Stop &amp; use text
                  </Button>
                  <Button variant="ghost" onClick={() => speech.cancel()}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <textarea
                  id="clarification-response-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={4}
                  placeholder="Type your response here..."
                  className="w-full rounded-xl border border-hair bg-surface p-3 text-sm text-heading placeholder:text-muted focus:outline-none focus:border-accent transition-colors resize-y leading-relaxed"
                />

                {reviewing && (
                  <p className="text-xs text-muted leading-relaxed">
                    Speech transcribed. Check details and equipment numbers before sending.
                  </p>
                )}

                {!micBlocked && (
                  <button
                    type="button"
                    onClick={() => {
                      speech.clearFailure();
                      speech.start();
                      setReviewing(false);
                    }}
                    className="self-start px-3 py-1.5 rounded-lg border border-hair bg-surface hover:bg-selected text-heading text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Mic size={14} className="text-accent" />
                    <span>Record voice response</span>
                  </button>
                )}
              </div>
            )}

            {send.error && <ErrorState error={send.error} />}

            <div className="p-3 rounded-xl border border-hair/60 bg-surface/40 flex items-start gap-2 text-xs text-muted mt-1">
              <ShieldCheck size={15} className="text-muted mt-0.5 shrink-0" />
              <span>
                Your response will be returned to the Planning Engineer for verification before any schedule actuals are committed.
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-hair bg-surface/80 flex items-center justify-end gap-2.5">
          <Button variant="ghost" onClick={onClose} disabled={send.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => send.mutate()}
            disabled={!draft.trim() || send.isPending}
            className="min-w-[130px]"
          >
            {send.isPending ? (
              'Sending…'
            ) : (
              <>
                <Send size={14} />
                Send Response
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
