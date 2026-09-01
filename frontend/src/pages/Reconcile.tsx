import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, errorDetail } from '../lib/api';
import { ReviewItem, ScheduleActivity } from '../types';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { DisciplineTag } from '../components/DisciplineTag';
import { Check, MessageCircleQuestion, Plus, X } from 'lucide-react';
import { usePageHeader } from '../hooks/usePageHeader';
import {
  Button,
  EmptyState,
  ErrorState,
  PanelHeader,
  SectionTitle,
  Skeleton,
} from '../components/ui';

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

export default function Reconcile() {
  usePageHeader('Reconcile', 'Field reports the matcher could not link on its own.');
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
  const queueRef = useRef<HTMLDivElement>(null);

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

  const sortedQueue = useMemo(() => {
    if (!queue) return [];
    return [...queue].sort((a, b) => {
      const pA = PRIORITY_WEIGHT[a.priority] || 0;
      const pB = PRIORITY_WEIGHT[b.priority] || 0;
      if (pA !== pB) return pB - pA; // Descending priority
      return a.confidence - b.confidence; // Ascending confidence
    });
  }, [queue]);

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

  // Auto-select first item in queue
  useEffect(() => {
    if (sortedQueue.length > 0 && !selectedItem) {
      setSelectedId(sortedQueue[0].id);
    }
  }, [sortedQueue, selectedItem]);

  // Auto-select suggested candidate when item changes
  useEffect(() => {
    if (selectedItem) {
      setNewMode(false);
      setAskMode(false);
      setQuestion('');
      setActionError(null);
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
    }) => api.resolveReview(variables.id, variables.body),
    onSuccess: (data) => {
      setResolvedCount((prev) => prev + 1);
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
    });
  };

  const handleReject = () => {
    if (!selectedItem) return;
    resolveMutation.mutate({
      id: selectedItem.id,
      body: { action: 'reject' },
    });
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

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
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'n') {
        e.preventDefault();
        setAskMode(false);
        setNewMode(true);
        // Focus the input in the next tick
        setTimeout(() => document.getElementById('new-desc-input')?.focus(), 50);
      } else if (e.key === 'r') {
        e.preventDefault();
        handleReject();
      } else if (e.key === 'a') {
        e.preventDefault();
        setNewMode(false);
        setAskMode(true);
        setTimeout(() => document.getElementById('ask-question-input')?.focus(), 50);
      } else if (e.key === 'Escape' && (newMode || askMode)) {
        setNewMode(false);
        setAskMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sortedQueue, selectedId, candidates, newMode, askMode, handleConfirm, handleReject]);

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
      <div className="h-full flex items-center justify-center bg-raised border border-hair rounded-lg">
        <EmptyState icon={Check} title="Queue clear">
          {resolvedCount > 0
            ? `${resolvedCount} item${resolvedCount === 1 ? '' : 's'} resolved this session.`
            : 'No pending items.'}
        </EmptyState>
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
        <div className="h-8 border-t border-hair flex items-center px-4 gap-4 text-label font-mono text-muted uppercase bg-raised">
          <span><kbd className="border border-strong bg-raised text-fg px-1 rounded-sm">↑↓</kbd> or <kbd className="border border-strong bg-raised text-fg px-1 rounded-sm">j/k</kbd> Nav</span>
          <span><kbd className="border border-strong bg-raised text-fg px-1 rounded-sm">Enter</kbd> Confirm</span>
          <span><kbd className="border border-strong bg-raised text-fg px-1 rounded-sm">A</kbd> Ask</span>
        </div>
      </div>

      {/* RIGHT PANE - DETAIL */}
      <div className="flex-1 flex flex-col bg-raised overflow-hidden relative">
        {selectedItem ? (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-8">
              
              {/* Section 1: SOURCE EVIDENCE */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <SectionTitle>Source Evidence</SectionTitle>
                  <span className="font-mono text-label bg-selected text-accent px-2 py-1 rounded-full">
                    REASON: {selectedItem.reason.toUpperCase()}
                  </span>
                </div>
                <div className="p-4 bg-surface border border-hair rounded-lg font-mono text-body leading-relaxed text-fg">
                  <HighlightedText text={selectedItem.raw_text} highlight={selectedItem.source_span} />
                </div>
              </section>

              {/* Section 2: EXTRACTED */}
              <section>
                <SectionTitle className="mb-2">Extracted Metadata</SectionTitle>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-label font-mono">
                  <div className="flex justify-between border-b border-hair pb-1">
                    <span className="text-muted">ID</span>
                    <span className="text-fg">{selectedItem.id.split('-')[0]}...</span>
                  </div>
                  <div className="flex justify-between border-b border-hair pb-1">
                    <span className="text-muted">CREATED</span>
                    <span className="text-fg">{new Date(selectedItem.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-b border-hair pb-1">
                    <span className="text-muted">TAGS</span>
                    {selectedItem.tags.length > 0 ? (
                      <span className="text-fg">{selectedItem.tags.join(', ')}</span>
                    ) : (
                      <span className="text-muted">NONE FOUND</span>
                    )}
                  </div>
                  <div className="flex justify-between border-b border-hair pb-1">
                    <span className="text-muted">CONFIDENCE</span>
                    <span className="text-fg">{(selectedItem.confidence * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </section>

              {/* Section 3: CANDIDATE ACTIVITIES */}
              <section className="pb-24">
                <SectionTitle className="mb-3">Candidate Activities</SectionTitle>
                <div className="space-y-2">
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
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-label bg-selected text-accent px-2 py-1 rounded-full">
                              {idx + 1}
                            </span>
                            <span className={`font-mono text-body font-bold ${isSelected ? 'text-fg' : 'text-muted'}`}>
                              {actId}
                            </span>
                            {isSuggested && (
                              <span className="font-mono text-label text-warn border border-current px-2 rounded-full uppercase">Suggested</span>
                            )}
                          </div>
                          {act && <DisciplineTag discipline={act.discipline} />}
                        </div>
                        
                        {act ? (
                          <>
                            <div className="text-body text-fg mb-3">{act.description}</div>
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
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleReject}
                    disabled={resolveMutation.isPending}
                  >
                    <X size={14} />
                    Reject [R]
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
