import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api, errorDetail } from '../lib/api';
import { ScheduleActivity } from '../types';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { DisciplineTag } from '../components/DisciplineTag';
import { ArrowUpRight, Check, MessageCircleQuestion, Plus, X } from 'lucide-react';
import { usePageHeader } from '../hooks/usePageHeader';
import { MatchReasoning, SignalChips } from '../components/MatchReasoning';
import {
  Button,
  EmptyState,
  ErrorState,
  PanelHeader,
  SectionTitle,
  Skeleton,
} from '../components/ui';

/**
 * QUESTION:  Is this the right activity for this report, and why does the
 *            matcher think so?
 * ACTION:    Confirm the match.
 *
 * The detail pane is ordered to answer that question without scrolling: the
 * worker's words, then the reasoning, then the candidates. The "Extracted
 * Metadata" grid that used to sit in the middle was deleted — a truncated UUID
 * that identifies nothing to a planner, a third rendering of the same
 * confidence figure, and a timestamp already in the queue row. See D-031.
 */

const PRIORITY_WEIGHT: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function HighlightedText({ text, highlight }: { text: string; highlight: string | null }) {
  if (!highlight || !text.includes(highlight)) {
    return <span>{text}</span>;
  }
  
  const parts = text.split(highlight);
  return (
    <span>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <span className="bg-mark text-mark-fg px-1">
              {highlight}
            </span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="border border-strong bg-raised text-fg px-1 rounded-sm">{children}</kbd>
  );
}

export default function Reconcile() {
  usePageHeader('Reconcile', 'Field reports the matcher could not link on its own.', '/reconcile');
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [askMode, setAskMode] = useState(false);
  const [question, setQuestion] = useState('');
  const [resolvedCount, setResolvedCount] = useState(0);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Set once a destructive key is pressed; the second press commits. */
  const [rejectArmed, setRejectArmed] = useState(false);
  /**
   * What the last resolve actually did, so the success state can link
   * straight to the schedule row it wrote rather than leaving the planner to
   * navigate and search for it.
   */
  const [lastResolved, setLastResolved] = useState<{
    activityId: string | null;
    message: string;
  } | null>(null);
  const queueRef = useRef<HTMLDivElement>(null);

  // Home links here as ?item=<review item id>; Ingest as ?event=<linked event
  // id>, which is the only id an extracted event knows about itself.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepItem = searchParams.get('item');
  const deepEvent = searchParams.get('event');

  const addToast = (message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const { data: scheduleData, error: scheduleError } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.getSchedule(undefined, false),
  });

  const { data: queue, isLoading: queueLoading, error: queueError } = useQuery({
    queryKey: ['reviewQueue'],
    queryFn: () => api.getReviewQueue('pending'),
  });

  const activityMap = useMemo(() => {
    const map = new Map<string, ScheduleActivity>();
    if (scheduleData?.activities) {
      scheduleData.activities.forEach((act) => map.set(act.activity_id, act));
    }
    return map;
  }, [scheduleData]);

  /**
   * Queue order, frozen while the planner has an item open.
   *
   * The queue refetches every 3 seconds. Re-sorting on every refetch meant a
   * higher-priority item arriving mid-ingest would reorder the list under the
   * cursor while the planner was reading a row — so the row they were about to
   * click moved. `orderRef` records the sequence the first time it is computed
   * for a given selection and keeps new items appended at the end until the
   * planner has nothing selected, at which point the true sort takes over.
   */
  const orderRef = useRef<string[] | null>(null);

  const sortedQueue = useMemo(() => {
    if (!queue) return [];
    const ranked = [...queue].sort((a, b) => {
      const pA = PRIORITY_WEIGHT[a.priority] || 0;
      const pB = PRIORITY_WEIGHT[b.priority] || 0;
      if (pA !== pB) return pB - pA; // Descending priority
      return a.confidence - b.confidence; // Ascending confidence
    });

    if (selectedId === null) {
      orderRef.current = ranked.map((i) => i.id);
      return ranked;
    }

    const frozen = orderRef.current;
    if (!frozen) {
      orderRef.current = ranked.map((i) => i.id);
      return ranked;
    }

    // Known ids keep their frozen positions; anything that arrived since is
    // appended in ranked order rather than inserted into the middle.
    const rank = new Map<string, number>(frozen.map((id, i) => [id, i] as const));
    return [...ranked].sort((a, b) => {
      const ra = rank.get(a.id);
      const rb = rank.get(b.id);
      if (ra === undefined && rb === undefined) return 0;
      if (ra === undefined) return 1;
      if (rb === undefined) return -1;
      return ra - rb;
    });
  }, [queue, selectedId]);

  const selectedItem = useMemo(() => {
    return sortedQueue.find((item) => item.id === selectedId) || null;
  }, [sortedQueue, selectedId]);

  const candidates = useMemo(() => {
    if (!selectedItem) return [];
    const alts = selectedItem.alternatives || [];
    const sugg = selectedItem.suggested_activity_id;
    // Deduplicate and ensure suggested is first if it exists
    const uniqueIds = Array.from(new Set(sugg ? [sugg, ...alts] : alts));
    return uniqueIds;
  }, [selectedItem]);

  /**
   * Selection: an explicit deep link wins, then the first item in the queue.
   *
   * `?event=` is resolved against `linked_event_id` because that is the only
   * id the Ingest screen's extracted events know about themselves. The param
   * is cleared once consumed so a later manual selection is not overridden by
   * a stale URL.
   */
  useEffect(() => {
    if (!deepItem && !deepEvent) return;
    const target = deepItem
      ? sortedQueue.find((i) => i.id === deepItem)
      : sortedQueue.find((i) => i.linked_event_id === deepEvent);
    if (!target) return;
    setSelectedId(target.id);
    document.getElementById(`queue-item-${target.id}`)?.scrollIntoView({ block: 'nearest' });
    const next = new URLSearchParams(searchParams);
    next.delete('item');
    next.delete('event');
    setSearchParams(next, { replace: true });
  }, [deepItem, deepEvent, sortedQueue, searchParams, setSearchParams]);

  // Auto-select first item in queue
  useEffect(() => {
    if (sortedQueue.length > 0 && !selectedItem && !deepItem && !deepEvent) {
      setSelectedId(sortedQueue[0].id);
    }
  }, [sortedQueue, selectedItem, deepItem, deepEvent]);

  // Auto-select suggested candidate when item changes
  useEffect(() => {
    if (selectedItem) {
      setNewMode(false);
      setAskMode(false);
      setQuestion('');
      setActionError(null);
      setRejectArmed(false);
      const sugg = selectedItem.suggested_activity_id;
      const alts = selectedItem.alternatives || [];
      if (sugg) {
        setSelectedCandidate(sugg);
      } else if (alts.length > 0) {
        setSelectedCandidate(alts[0]);
      } else {
        setSelectedCandidate(null);
      }
    }
  }, [selectedItem?.id]);

  const resolveMutation = useMutation({
    mutationFn: (variables: {
      id: string;
      body: Parameters<typeof api.resolveReview>[1];
      /** Which activity the planner acted on, for the success link. */
      activityId: string | null;
    }) => api.resolveReview(variables.id, variables.body),
    onSuccess: (data, variables) => {
      setResolvedCount((prev) => prev + 1);
      setLastResolved({ activityId: variables.activityId, message: data.message });
      addToast(
        `${data.message} • alias entries: ${data.alias_entries_created}, audit records: ${data.audit_records_created}`
      );
      queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      setActionError(null);
      setNewMode(false);
      setNewDesc('');
      
      // Auto-select next item
      const currentIndex = sortedQueue.findIndex((i) => i.id === selectedId);
      if (currentIndex !== -1 && currentIndex + 1 < sortedQueue.length) {
        setSelectedId(sortedQueue[currentIndex + 1].id);
      } else {
        setSelectedId(null);
      }
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setActionError(error.detail);
      } else {
        setActionError('An unexpected error occurred.');
      }
    },
  });

  /**
   * Asking is not resolving. The server leaves the item pending, so this does
   * not count toward resolvedCount and does not advance to the next item —
   * the planner stays on the row they just asked about.
   */
  const clarifyMutation = useMutation({
    mutationFn: (variables: { id: string; question: string }) =>
      api.askClarification(variables.id, { question: variables.question }),
    onSuccess: (data) => {
      addToast(`Question sent to the supervisor • ${data.reference}`);
      queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
      // The field screens read the same question off /field/clarifications.
      queryClient.invalidateQueries({ queryKey: ['clarifications'] });
      setActionError(null);
      setAskMode(false);
      setQuestion('');
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setActionError(error.detail);
      } else {
        setActionError('An unexpected error occurred.');
      }
    },
  });

  const handleAsk = () => {
    if (!selectedItem) return;
    if (!askMode) {
      setAskMode(true);
      return;
    }
    if (!question.trim()) {
      setActionError('A question is required to ask the supervisor.');
      return;
    }
    clarifyMutation.mutate({ id: selectedItem.id, question: question.trim() });
  };

  const handleConfirm = () => {
    if (!selectedItem || !selectedCandidate) return;
    resolveMutation.mutate({
      id: selectedItem.id,
      body: { action: 'confirm', activity_id: selectedCandidate },
      activityId: selectedCandidate,
    });
  };

  const handleNew = () => {
    if (!selectedItem) return;
    if (!newMode) {
      setNewMode(true);
      return;
    }
    if (!newDesc.trim()) {
      setActionError('Description is required for new activity.');
      return;
    }
    resolveMutation.mutate({
      id: selectedItem.id,
      body: { action: 'new_activity', new_description: newDesc },
      activityId: null,
    });
  };

  /**
   * Reject is irreversible and used to fire on a single unguarded `r`.
   *
   * The first call arms it and the button relabels; the second commits.
   * Changing item, pressing Escape, or any other action disarms it.
   */
  const handleReject = () => {
    if (!selectedItem) return;
    if (!rejectArmed) {
      setRejectArmed(true);
      return;
    }
    setRejectArmed(false);
    resolveMutation.mutate({
      id: selectedItem.id,
      body: { action: 'reject' },
      activityId: null,
    });
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The old guard checked INPUT and TEXTAREA only, so a focused button —
      // which is what you have immediately after clicking any action — let
      // every shortcut through, including the destructive ones. Anything
      // focusable and interactive, and anything contenteditable, now swallows
      // the shortcut. A modifier chord is never a shortcut either.
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(el.tagName))
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIndex = sortedQueue.findIndex((i) => i.id === selectedId);
        if (currentIndex < sortedQueue.length - 1) {
          setSelectedId(sortedQueue[currentIndex + 1].id);
          document.getElementById(`queue-item-${sortedQueue[currentIndex + 1].id}`)?.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = sortedQueue.findIndex((i) => i.id === selectedId);
        if (currentIndex > 0) {
          setSelectedId(sortedQueue[currentIndex - 1].id);
          document.getElementById(`queue-item-${sortedQueue[currentIndex - 1].id}`)?.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index >= 0 && index < candidates.length) {
          setSelectedCandidate(candidates[index]);
        }
      } else if (e.key === 'Enter' && !newMode && !askMode) {
        // Confirm writes an actual date to the schedule. It is no longer a
        // single keystroke away from a stray Enter: the key focuses and
        // highlights the primary action, and the planner presses it.
        e.preventDefault();
        document.getElementById('confirm-match')?.focus();
      } else if (e.key === 'n') {
        e.preventDefault();
        setAskMode(false);
        setNewMode(true);
        // Focus the input in the next tick
        setTimeout(() => document.getElementById('new-desc-input')?.focus(), 50);
      } else if (e.key === 'r') {
        // Arms the reject; the button relabels and a second press commits.
        e.preventDefault();
        handleReject();
      } else if (e.key === 'a') {
        e.preventDefault();
        setNewMode(false);
        setAskMode(true);
        setTimeout(() => document.getElementById('ask-question-input')?.focus(), 50);
      } else if (e.key === 'Escape') {
        setNewMode(false);
        setAskMode(false);
        setRejectArmed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sortedQueue, selectedId, candidates, newMode, askMode, rejectArmed, handleConfirm, handleReject]);

  if (queueError) {
    return (
      <ErrorState
        error={queueError}
        mode="full"
        title="Error loading review queue"
        onRetry={() => queryClient.invalidateQueries({ queryKey: ['reviewQueue'] })}
      />
    );
  }

  if (queueLoading) {
    return (
      <div className="flex h-full w-full">
        <div className="w-[38%] border-r border-hair flex flex-col">
          <div className="h-10 border-b border-hair" />
          <div className="p-4 flex flex-col gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} height="h-12" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-5 flex flex-col gap-5">
          <Skeleton height="h-24" />
          <Skeleton height="h-32" />
        </div>
      </div>
    );
  }

  if (sortedQueue.length === 0) {
    return (
      /* This used to replace the whole split view with a Check icon painted in
         `text-hair` — the lowest-contrast token in the palette — over mono
         uppercase, which read as a crash rather than as success. It keeps the
         panel chrome, uses the accent, and offers the next step: the schedule
         row the last confirm actually wrote. */
      <div className="h-full flex items-center justify-center bg-raised border border-hair rounded-lg">
        <div className="flex flex-col items-center text-center gap-4 px-5 py-8 max-w-md">
          <span className="w-16 h-16 rounded-full bg-selected flex items-center justify-center">
            <Check size={30} className="text-accent" />
          </span>
          <div className="flex flex-col gap-2">
            <h2 className="text-h2 font-semibold text-heading">Queue clear</h2>
            <p className="text-body text-muted leading-relaxed">
              {resolvedCount > 0
                ? `Every extracted event has been matched or resolved. ${resolvedCount} item${
                    resolvedCount === 1 ? '' : 's'
                  } resolved this session.`
                : 'Every extracted event has been matched or resolved.'}
            </p>
          </div>
          <div className="w-full flex flex-col gap-2">
            {lastResolved?.activityId && (
              <Button
                variant="primary"
                size="sm"
                to={`/schedule?activity=${encodeURIComponent(lastResolved.activityId)}`}
              >
                See {lastResolved.activityId} on the schedule
                <ArrowUpRight size={12} />
              </Button>
            )}
            <Button variant="secondary" size="sm" to="/ingest">
              Ingest another report
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-raised border border-hair rounded-lg relative overflow-hidden">
      {/* Toast Notifications */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="bg-fg text-surface px-4 py-3 rounded-lg border border-hair font-mono text-label max-w-md pointer-events-auto flex items-start gap-2 animate-toast-in">
            <Check size={14} className="mt-0.5 shrink-0" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* LEFT PANE - QUEUE */}
      <div className="w-[38%] flex-shrink-0 border-r border-hair flex flex-col bg-raised z-10">
        <PanelHeader
          title="Review Queue"
          right={
            <span className="bg-selected text-accent px-2 py-1 rounded-full font-mono text-label shrink-0">
              {sortedQueue.length} PENDING
            </span>
          }
        />
        <div className="flex-1 overflow-y-auto" ref={queueRef}>
          {sortedQueue.map((item) => {
            const isSelected = item.id === selectedId;
            const suggAct = item.suggested_activity_id ? activityMap.get(item.suggested_activity_id) : null;
            return (
              <div
                key={item.id}
                id={`queue-item-${item.id}`}
                onClick={() => setSelectedId(item.id)}
                className={`border-b border-hair p-4 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-selected border-l-2 border-l-accent'
                    : 'border-l-2 border-l-transparent hover:bg-selected'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-label text-muted uppercase">{item.priority}</span>
                  <ConfidenceBadge value={item.confidence} />
                </div>
                <div className="text-body text-fg mb-2 line-clamp-1" title={item.raw_text}>
                  {item.raw_text}
                </div>
                <div className="flex justify-between items-center mt-1">
                  {suggAct ? (
                    <DisciplineTag discipline={suggAct.discipline} />
                  ) : (
                    <span className="font-mono text-label text-muted border border-hair px-2 rounded-full">UNKNOWN</span>
                  )}
                  <span className="font-mono text-label text-muted">
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {/* Every bound key appears here. `N` and `R` were bound and undocumented,
            and `R` rejected irreversibly on one press. */}
        <div className="shrink-0 border-t border-hair flex flex-wrap items-center px-4 py-2 gap-x-3 gap-y-1 text-label font-mono text-muted uppercase bg-raised">
          <span><Key>↑↓</Key> <Key>j/k</Key> Nav</span>
          <span><Key>1-9</Key> Pick</span>
          <span><Key>Enter</Key> Focus confirm</span>
          <span><Key>N</Key> New</span>
          <span><Key>A</Key> Ask</span>
          {/* The key and its double-press, without repeating the action word:
              the Reject button sits directly below and names it, and
              reconcile.test.tsx asserts that "Reject" resolves to exactly one
              element. */}
          <span title="Reject — press twice"><Key>R</Key> ×2</span>
          <span><Key>Esc</Key> Cancel</span>
        </div>
      </div>

      {/* RIGHT PANE - DETAIL */}
      <div className="flex-1 flex flex-col bg-raised overflow-hidden relative">
        {selectedItem ? (
          <>
            {/* Evidence and reasoning sit side by side and above the fold: the
                planner's question is "is this the right activity, and why does
                the matcher think so", and both halves of that are answerable
                without scrolling. */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
              <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <SectionTitle>What the supervisor said</SectionTitle>
                    <span className="font-mono text-label bg-selected text-accent px-2 py-1 rounded-full shrink-0">
                      {selectedItem.reason.toUpperCase()}
                    </span>
                  </div>
                  <div className="p-4 bg-surface border border-hair rounded-lg font-mono text-body leading-relaxed text-fg">
                    <HighlightedText text={selectedItem.raw_text} highlight={selectedItem.source_span} />
                  </div>
                  {selectedItem.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-label uppercase tracking-wider text-muted">
                        Tags
                      </span>
                      {selectedItem.tags.map((t) => (
                        <span
                          key={t}
                          className="font-mono text-label bg-selected text-accent px-2 py-1 rounded-full leading-none"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 min-w-0">
                  <SectionTitle>Why the matcher chose this</SectionTitle>
                  <div className="p-4 bg-surface border border-hair rounded-lg">
                    <MatchReasoning
                      confidence={selectedItem.confidence}
                      margin={selectedItem.margin}
                      matchMethod={selectedItem.match_method}
                      rationale={selectedItem.rationale}
                    />
                  </div>
                </div>
              </section>

              <section className="pb-24">
                <SectionTitle className="mb-3">Candidate Activities</SectionTitle>
                <div className="flex flex-col gap-2">
                  {candidates.map((actId, idx) => {
                    const act = activityMap.get(actId);
                    const isSuggested = actId === selectedItem.suggested_activity_id;
                    const isSelected = actId === selectedCandidate;
                    
                    return (
                      <div 
                        key={actId}
                        onClick={() => setSelectedCandidate(actId)}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-accent bg-selected'
                            : 'border-hair bg-raised hover:bg-selected'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2 gap-3">
                          <div className="flex items-center gap-3 flex-wrap min-w-0">
                            <span className="font-mono text-label bg-selected text-accent px-2 py-1 rounded-full">
                              {idx + 1}
                            </span>
                            <span className={`font-mono text-body font-bold ${isSelected ? 'text-fg' : 'text-muted'}`}>
                              {actId}
                            </span>
                            {isSuggested && (
                              /* Accent, not warn: this is the matcher's top pick,
                                 not a warning, and warn means "medium
                                 confidence" two inches away on ConfidenceBadge. */
                              <span className="font-mono text-label text-accent border border-current px-2 rounded-full uppercase">
                                Top match
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {/* The score belongs on the candidate it scores.
                                Only the top candidate has one: the queue
                                endpoint returns a single confidence for the
                                item, and no per-candidate score exists in any
                                response. Ranks 2+ say so rather than reusing
                                the top candidate's number, which would be a
                                fabricated figure. */}
                            {isSuggested ? (
                              <span className="font-mono text-body">
                                <ConfidenceBadge value={selectedItem.confidence} />
                              </span>
                            ) : (
                              <span
                                className="font-mono text-label text-muted"
                                title="GET /review-queue returns one confidence for the item, not a score per candidate"
                                >
                                no score sent
                              </span>
                            )}
                            {act && <DisciplineTag discipline={act.discipline} />}
                          </div>
                        </div>
                        
                        {act ? (
                          <>
                            <div className="text-body text-fg mb-3">{act.description}</div>
                            {isSuggested &&
                              Array.isArray(selectedItem.rationale) &&
                              selectedItem.rationale.length > 0 && (
                                <div className="mb-3 flex flex-col gap-1">
                                  <span className="font-mono text-label uppercase tracking-wider text-muted">
                                    Signals that fired
                                  </span>
                                  <SignalChips rationale={selectedItem.rationale} />
                                </div>
                              )}
                            <div className="flex gap-5 font-mono text-label text-muted">
                              <div className="flex flex-col">
                                <span className="text-muted mb-0.5">PLANNED START</span>
                                <span>{act.planned_start || 'N/A'}</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-muted mb-0.5">PLANNED FINISH</span>
                                <span>{act.planned_finish || 'N/A'}</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-muted mb-0.5">QUANTITY</span>
                                <span className="text-fg">{act.planned_qty} {act.uom}</span>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="text-body text-danger font-mono italic">
                            {scheduleError
                              ? `Schedule unavailable — ${errorDetail(scheduleError)}`
                              : 'Activity details not found in schedule baseline.'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {candidates.length === 0 && (
                    <div className="border border-hair rounded-lg bg-surface">
                      <EmptyState>No candidates identified.</EmptyState>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Section 4: ACTIONS */}
            <div className="absolute bottom-0 left-0 right-0 bg-raised border-t border-hair p-4 z-20">
              {/* After a confirm, the schedule row it wrote used to be two
                  navigations and a search away. */}
              {lastResolved?.activityId && (
                <div className="mb-3 flex items-center justify-between gap-3 border border-hair bg-surface rounded-lg px-3 py-2">
                  <span className="text-body text-muted min-w-0 truncate">
                    Wrote <span className="font-mono text-fg">{lastResolved.activityId}</span>
                  </span>
                  <Button
                    variant="secondary"
                    size="xs"
                    to={`/schedule?activity=${encodeURIComponent(lastResolved.activityId)}`}
                  >
                    See it on the schedule
                    <ArrowUpRight size={12} />
                  </Button>
                </div>
              )}
              {actionError && (
                <ErrorState error={new Error(actionError)} className="mb-3" />
              )}
              
              {askMode ? (
                <div className="flex gap-2 items-center">
                  <input
                    id="ask-question-input"
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask the supervisor about this report..."
                    className="rounded-sm flex-1 bg-raised border border-hair px-3 py-3 font-mono text-body text-fg focus:outline-none focus:border-accent transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAsk();
                      if (e.key === 'Escape') setAskMode(false);
                    }}
                    disabled={clarifyMutation.isPending}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleAsk}
                    disabled={clarifyMutation.isPending}
                  >
                    {clarifyMutation.isPending ? 'Sending…' : 'Send Question'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAskMode(false)}
                    disabled={clarifyMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              ) : newMode ? (
                <div className="flex gap-2 items-center">
                  <input
                    id="new-desc-input"
                    type="text"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Enter short description for new activity..."
                    className="rounded-sm flex-1 bg-raised border border-hair px-3 py-3 font-mono text-body text-fg focus:outline-none focus:border-accent transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleNew();
                      if (e.key === 'Escape') setNewMode(false);
                    }}
                    disabled={resolveMutation.isPending}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleNew}
                    disabled={resolveMutation.isPending}
                  >
                    {resolveMutation.isPending ? 'Processing…' : 'Save Activity'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setNewMode(false)}
                    disabled={resolveMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <Button
                      id="confirm-match"
                      variant="primary"
                      size="sm"
                      onClick={handleConfirm}
                      disabled={!selectedCandidate || resolveMutation.isPending}
                    >
                      <Check size={14} />
                      Confirm Match
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setNewMode(true)}
                      disabled={resolveMutation.isPending}
                    >
                      <Plus size={14} />
                      Mark New [N]
                    </Button>
                    {/* Fourth action. It asks rather than resolves, so the
                        item stays in the queue and stays selected. */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setAskMode(true)}
                      disabled={resolveMutation.isPending || clarifyMutation.isPending}
                    >
                      <MessageCircleQuestion size={14} />
                      Ask Supervisor [A]
                    </Button>
                  </div>
                  {/* Two presses. The first arms and relabels; the second
                      commits. Reject is irreversible and used to fire on a
                      single unguarded keystroke. */}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleReject}
                    disabled={resolveMutation.isPending}
                    title={rejectArmed ? 'Press again to reject' : undefined}
                    className={rejectArmed ? 'bg-danger-bg' : ''}
                  >
                    <X size={14} />
                    {rejectArmed ? 'Press again to reject' : 'Reject [R]'}
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState>Select an item from the queue.</EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
