import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, errorDetail } from '../lib/api';
import { ReviewItem, ScheduleActivity } from '../types';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { DisciplineTag } from '../components/DisciplineTag';
import { AlertCircle, Check, MessageCircleQuestion, Plus, X, ArrowRight } from 'lucide-react';
import { usePageHeader } from '../hooks/usePageHeader';

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
            <span className="bg-mark text-mark-fg rounded-sm px-0.5">
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
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle size={32} className="text-danger mb-4" />
        <div className="font-mono text-fg mb-2">Error loading review queue</div>
        <div className="text-muted text-sm mb-6 max-w-md">
          {errorDetail(queueError)}
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['reviewQueue'] })}
          className="px-5 py-3 bg-accent text-accent-fg hover:bg-accent-hover font-mono uppercase text-xs rounded-[8px] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (queueLoading) {
    return (
      <div className="flex h-full w-full opacity-50">
        <div className="w-[38%] border-r border-hair flex flex-col">
          <div className="h-10 border-b border-hair" />
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-selected rounded-[8px] animate-pulse" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6 space-y-6">
          <div className="h-24 bg-selected rounded-[10px] animate-pulse" />
          <div className="h-32 bg-selected rounded-[10px] animate-pulse" />
        </div>
      </div>
    );
  }

  if (sortedQueue.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-raised border border-hair rounded-[10px]">
        <Check size={48} className="text-hair mb-4" />
        <div className="font-mono text-fg text-lg tracking-widest uppercase mb-2">Queue Clear</div>
        <div className="text-muted font-mono text-xs">
          {resolvedCount > 0 
            ? `${resolvedCount} item${resolvedCount === 1 ? '' : 's'} resolved this session.` 
            : 'No pending items.'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-raised border border-hair rounded-[10px] relative overflow-hidden">
      {/* Toast Notifications */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="bg-fg text-surface px-4 py-3 rounded-[10px] border border-hair font-mono text-[12px] max-w-md pointer-events-auto flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
            <Check size={14} className="mt-0.5 shrink-0" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* LEFT PANE - QUEUE */}
      <div className="w-[38%] flex-shrink-0 border-r border-hair flex flex-col bg-raised z-10">
        <div className="h-10 border-b border-hair flex items-center px-4 justify-between bg-raised sticky top-0">
          <span className="text-[16px] font-semibold uppercase tracking-[0.05em] text-heading">Review Queue</span>
          <span className="bg-selected text-accent px-2 py-0.5 rounded-full font-mono text-[11px]">
            {sortedQueue.length} PENDING
          </span>
        </div>
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
                  <span className="font-mono text-[11px] text-muted uppercase">{item.priority}</span>
                  <ConfidenceBadge value={item.confidence} />
                </div>
                <div className="text-[14px] text-fg mb-2 line-clamp-1" title={item.raw_text}>
                  {item.raw_text}
                </div>
                <div className="flex justify-between items-center mt-1">
                  {suggAct ? (
                    <DisciplineTag discipline={suggAct.discipline} />
                  ) : (
                    <span className="font-mono text-[11px] text-muted border border-hair px-2 rounded-full">UNKNOWN</span>
                  )}
                  <span className="font-mono text-[11px] text-muted">
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="h-8 border-t border-hair flex items-center px-4 gap-4 text-[11px] font-mono text-muted uppercase bg-raised">
          <span><kbd className="border border-strong bg-raised text-fg px-1 rounded-[4px]">↑↓</kbd> or <kbd className="border border-strong bg-raised text-fg px-1 rounded-[4px]">j/k</kbd> Nav</span>
          <span><kbd className="border border-strong bg-raised text-fg px-1 rounded-[4px]">Enter</kbd> Confirm</span>
          <span><kbd className="border border-strong bg-raised text-fg px-1 rounded-[4px]">A</kbd> Ask</span>
        </div>
      </div>

      {/* RIGHT PANE - DETAIL */}
      <div className="flex-1 flex flex-col bg-raised overflow-hidden relative">
        {selectedItem ? (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              
              {/* Section 1: SOURCE EVIDENCE */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[16px] font-semibold uppercase tracking-[0.05em] text-heading">Source Evidence</span>
                  <span className="font-mono text-[11px] bg-selected text-accent px-2 py-0.5 rounded-full">
                    REASON: {selectedItem.reason.toUpperCase()}
                  </span>
                </div>
                <div className="p-4 bg-surface border border-hair rounded-[10px] font-mono text-[14px] leading-relaxed text-fg">
                  <HighlightedText text={selectedItem.raw_text} highlight={selectedItem.source_span} />
                </div>
              </section>

              {/* Section 2: EXTRACTED */}
              <section>
                <span className="text-[16px] font-semibold uppercase tracking-[0.05em] text-heading mb-2 block">Extracted Metadata</span>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[12px] font-mono">
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
                <span className="text-[16px] font-semibold uppercase tracking-[0.05em] text-heading mb-3 block">Candidate Activities</span>
                <div className="space-y-2">
                  {candidates.map((actId, idx) => {
                    const act = activityMap.get(actId);
                    const isSuggested = actId === selectedItem.suggested_activity_id;
                    const isSelected = actId === selectedCandidate;
                    
                    return (
                      <div 
                        key={actId}
                        onClick={() => setSelectedCandidate(actId)}
                        className={`p-4 border rounded-[10px] cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-accent bg-selected'
                            : 'border-hair bg-raised hover:bg-selected'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-[12px] bg-selected text-accent px-2 py-0.5 rounded-full">
                              {idx + 1}
                            </span>
                            <span className={`font-mono text-[14px] font-bold ${isSelected ? 'text-fg' : 'text-muted'}`}>
                              {actId}
                            </span>
                            {isSuggested && (
                              <span className="font-mono text-[11px] text-warn border border-current px-2 rounded-full uppercase">Suggested</span>
                            )}
                          </div>
                          {act && <DisciplineTag discipline={act.discipline} />}
                        </div>
                        
                        {act ? (
                          <>
                            <div className="text-[14px] text-fg mb-3">{act.description}</div>
                            <div className="flex gap-6 font-mono text-[11px] text-muted">
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
                          <div className="text-[14px] text-danger font-mono italic">
                            {scheduleError
                              ? `Schedule unavailable — ${errorDetail(scheduleError)}`
                              : 'Activity details not found in schedule baseline.'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {candidates.length === 0 && (
                    <div className="p-4 border border-hair rounded-[10px] text-muted font-mono text-[12px] text-center bg-surface">
                      NO CANDIDATES IDENTIFIED
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Section 4: ACTIONS */}
            <div className="absolute bottom-0 left-0 right-0 bg-raised border-t border-hair p-4 z-20">
              {actionError && (
                <div className="mb-3 px-3 py-3 border border-danger-line bg-danger-bg text-danger font-mono text-[12px] rounded-[8px] flex items-center gap-2">
                  <AlertCircle size={12} />
                  {actionError}
                </div>
              )}
              
              {askMode ? (
                <div className="flex gap-2 items-center">
                  <input
                    id="ask-question-input"
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask the supervisor about this report..."
                    className="rounded-[8px] flex-1 bg-raised border border-hair px-3 py-3 font-mono text-[14px] text-fg focus:outline-none focus:border-accent transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAsk();
                      if (e.key === 'Escape') setAskMode(false);
                    }}
                    disabled={clarifyMutation.isPending}
                  />
                  <button
                    onClick={handleAsk}
                    disabled={clarifyMutation.isPending}
                    className="rounded-[8px] bg-raised border border-accent text-accent px-5 py-3 font-bold font-mono text-[12px] uppercase hover:bg-selected disabled:opacity-50 transition-colors"
                  >
                    {clarifyMutation.isPending ? 'Sending...' : 'Send Question'}
                  </button>
                  <button
                    onClick={() => setAskMode(false)}
                    disabled={clarifyMutation.isPending}
                    className="rounded-[8px] bg-raised border border-accent text-accent px-5 py-3 font-bold font-mono text-[12px] uppercase hover:bg-selected transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : newMode ? (
                <div className="flex gap-2 items-center">
                  <input
                    id="new-desc-input"
                    type="text"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Enter short description for new activity..."
                    className="rounded-[8px] flex-1 bg-raised border border-hair px-3 py-3 font-mono text-[14px] text-fg focus:outline-none focus:border-accent transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleNew();
                      if (e.key === 'Escape') setNewMode(false);
                    }}
                    disabled={resolveMutation.isPending}
                  />
                  <button 
                    onClick={handleNew}
                    disabled={resolveMutation.isPending}
                    className="rounded-[8px] bg-accent text-accent-fg px-5 py-3 font-bold font-mono text-[12px] uppercase hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    {resolveMutation.isPending ? 'Processing...' : 'Save Activity'}
                  </button>
                  <button 
                    onClick={() => setNewMode(false)}
                    disabled={resolveMutation.isPending}
                    className="rounded-[8px] bg-raised border border-accent text-accent px-5 py-3 font-bold font-mono text-[12px] uppercase hover:bg-selected transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirm}
                      disabled={!selectedCandidate || resolveMutation.isPending}
                      className="rounded-[8px] bg-accent text-accent-fg px-5 py-3 font-bold font-mono text-[12px] uppercase flex items-center gap-2 hover:bg-accent-hover disabled:opacity-50 transition-colors"
                    >
                      <Check size={14} />
                      Confirm Match
                    </button>
                    <button
                      onClick={() => setNewMode(true)}
                      disabled={resolveMutation.isPending}
                      className="rounded-[8px] bg-raised border border-accent text-accent px-5 py-3 font-bold font-mono text-[12px] uppercase flex items-center gap-2 hover:bg-selected disabled:opacity-50 transition-colors"
                    >
                      <Plus size={14} />
                      Mark New [N]
                    </button>
                    {/* Fourth action. It asks rather than resolves, so the
                        item stays in the queue and stays selected. */}
                    <button
                      onClick={() => setAskMode(true)}
                      disabled={resolveMutation.isPending || clarifyMutation.isPending}
                      className="rounded-[8px] bg-raised border border-accent text-accent px-5 py-3 font-bold font-mono text-[12px] uppercase flex items-center gap-2 hover:bg-selected disabled:opacity-50 transition-colors"
                    >
                      <MessageCircleQuestion size={14} />
                      Ask Supervisor [A]
                    </button>
                  </div>
                  <button
                    onClick={handleReject}
                    disabled={resolveMutation.isPending}
                    className="rounded-[8px] bg-raised border border-danger-line text-danger hover:bg-danger-bg px-5 py-3 font-bold font-mono text-[12px] uppercase flex items-center gap-2 disabled:opacity-50 transition-colors"
                  >
                    <X size={14} />
                    Reject [R]
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center font-mono text-muted text-[12px] uppercase tracking-wider">
            Select an item from the queue
          </div>
        )}
      </div>
    </div>
  );
}
