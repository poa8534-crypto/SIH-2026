import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { ReviewItem, ScheduleActivity } from '../types';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { DisciplineTag } from '../components/DisciplineTag';
import { AlertCircle, Check, Plus, X, ArrowRight } from 'lucide-react';

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
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [newDesc, setNewDesc] = useState('');
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

  const { data: scheduleData } = useQuery({
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
      } else if (e.key === 'Enter' && !newMode) {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'n') {
        e.preventDefault();
        setNewMode(true);
        // Focus the input in the next tick
        setTimeout(() => document.getElementById('new-desc-input')?.focus(), 50);
      } else if (e.key === 'r') {
        e.preventDefault();
        handleReject();
      } else if (e.key === 'Escape' && newMode) {
        setNewMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sortedQueue, selectedId, candidates, newMode, handleConfirm, handleReject]);

  if (queueError) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle size={32} className="text-danger mb-4" />
        <div className="font-mono text-fg mb-2">Error loading review queue</div>
        <div className="text-muted text-sm mb-6 max-w-md">
          {queueError instanceof ApiError ? queueError.detail : 'Unknown error occurred'}
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['reviewQueue'] })}
          className="px-4 py-2 border border-hair hover:border-strong text-fg font-mono uppercase text-xs rounded transition-colors"
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
              <div key={i} className="h-12 bg-raised rounded animate-pulse" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6 space-y-6">
          <div className="h-24 bg-raised rounded animate-pulse" />
          <div className="h-32 bg-raised rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (sortedQueue.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-surface">
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
    <div className="flex h-full w-full bg-surface relative">
      {/* Toast Notifications */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="bg-fg text-surface px-4 py-3 rounded shadow-lg border border-hair font-mono text-[10px] max-w-md pointer-events-auto flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
            <Check size={14} className="mt-0.5 shrink-0" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* LEFT PANE - QUEUE */}
      <div className="w-[38%] flex-shrink-0 border-r border-hair flex flex-col bg-surface z-10">
        <div className="h-10 border-b border-hair flex items-center px-4 justify-between bg-surface sticky top-0">
          <span className="font-bold text-fg uppercase tracking-wider text-[10px]">Review Queue</span>
          <span className="bg-raised border border-hair px-1.5 py-0.5 rounded font-mono text-[9px] text-muted">
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
                className={`border-b border-hair p-3 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-selected border-l-2 border-l-accent'
                    : 'border-l-2 border-l-transparent hover:bg-raised'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-[9px] text-muted uppercase">{item.priority}</span>
                  <ConfidenceBadge value={item.confidence} />
                </div>
                <div className="text-[11px] text-fg mb-2 line-clamp-1" title={item.raw_text}>
                  {item.raw_text}
                </div>
                <div className="flex justify-between items-center mt-1">
                  {suggAct ? (
                    <DisciplineTag discipline={suggAct.discipline} />
                  ) : (
                    <span className="font-mono text-[9px] text-muted border border-hair px-1 rounded">UNKNOWN</span>
                  )}
                  <span className="font-mono text-[9px] text-muted">
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="h-8 border-t border-hair flex items-center px-4 gap-4 text-[9px] font-mono text-muted uppercase bg-surface">
          <span><kbd className="border border-strong bg-raised text-fg px-1 rounded">↑↓</kbd> or <kbd className="border border-strong bg-raised text-fg px-1 rounded">j/k</kbd> Nav</span>
          <span><kbd className="border border-strong bg-raised text-fg px-1 rounded">Enter</kbd> Confirm</span>
        </div>
      </div>

      {/* RIGHT PANE - DETAIL */}
      <div className="flex-1 flex flex-col bg-surface overflow-hidden relative">
        {selectedItem ? (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              
              {/* Section 1: SOURCE EVIDENCE */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] uppercase text-muted tracking-wider">Source Evidence</span>
                  <span className="font-mono text-[9px] text-fg border border-hair px-2 py-0.5 bg-raised rounded">
                    REASON: {selectedItem.reason.toUpperCase()}
                  </span>
                </div>
                <div className="p-4 bg-raised border border-hair font-mono text-[11px] leading-relaxed text-fg">
                  <HighlightedText text={selectedItem.raw_text} highlight={selectedItem.source_span} />
                </div>
              </section>

              {/* Section 2: EXTRACTED */}
              <section>
                <span className="font-mono text-[10px] uppercase text-muted tracking-wider mb-2 block">Extracted Metadata</span>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[10px] font-mono">
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
                <span className="font-mono text-[10px] uppercase text-muted tracking-wider mb-3 block">Candidate Activities</span>
                <div className="space-y-2">
                  {candidates.map((actId, idx) => {
                    const act = activityMap.get(actId);
                    const isSuggested = actId === selectedItem.suggested_activity_id;
                    const isSelected = actId === selectedCandidate;
                    
                    return (
                      <div 
                        key={actId}
                        onClick={() => setSelectedCandidate(actId)}
                        className={`p-3 border-2 cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-accent bg-selected'
                            : 'border-hair hover:border-strong bg-raised'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-[10px] border border-strong text-fg px-1.5 py-0.5 rounded">
                              {idx + 1}
                            </span>
                            <span className={`font-mono text-[12px] font-bold ${isSelected ? 'text-fg' : 'text-muted'}`}>
                              {actId}
                            </span>
                            {isSuggested && (
                              <span className="font-mono text-[9px] text-warn border border-current px-1 rounded uppercase">Suggested</span>
                            )}
                          </div>
                          {act && <DisciplineTag discipline={act.discipline} />}
                        </div>
                        
                        {act ? (
                          <>
                            <div className="text-[12px] text-fg mb-3">{act.description}</div>
                            <div className="flex gap-6 font-mono text-[9px] text-muted">
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
                          <div className="text-[11px] text-danger font-mono italic">Activity details not found in schedule baseline.</div>
                        )}
                      </div>
                    );
                  })}
                  {candidates.length === 0 && (
                    <div className="p-4 border border-hair text-muted font-mono text-[10px] text-center bg-raised">
                      NO CANDIDATES IDENTIFIED
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Section 4: ACTIONS */}
            <div className="absolute bottom-0 left-0 right-0 bg-surface border-t border-hair p-4 z-20">
              {actionError && (
                <div className="mb-3 px-3 py-2 border border-danger-line bg-danger-bg text-danger font-mono text-[10px] flex items-center gap-2">
                  <AlertCircle size={12} />
                  {actionError}
                </div>
              )}
              
              {newMode ? (
                <div className="flex gap-2 items-center">
                  <input
                    id="new-desc-input"
                    type="text"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Enter short description for new activity..."
                    className="flex-1 bg-raised border border-hair px-3 py-2 font-mono text-[11px] text-fg focus:outline-none focus:border-accent transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleNew();
                      if (e.key === 'Escape') setNewMode(false);
                    }}
                    disabled={resolveMutation.isPending}
                  />
                  <button 
                    onClick={handleNew}
                    disabled={resolveMutation.isPending}
                    className="bg-accent text-accent-fg px-4 py-2 font-bold font-mono text-[10px] uppercase hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    {resolveMutation.isPending ? 'Processing...' : 'Save Activity'}
                  </button>
                  <button 
                    onClick={() => setNewMode(false)}
                    disabled={resolveMutation.isPending}
                    className="border border-hair text-muted px-4 py-2 font-bold font-mono text-[10px] uppercase hover:text-fg hover:border-strong transition-colors"
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
                      className="bg-accent text-accent-fg px-4 py-2 font-bold font-mono text-[10px] uppercase flex items-center gap-2 hover:bg-accent-hover disabled:opacity-50 transition-colors"
                    >
                      <Check size={14} />
                      Confirm Match
                    </button>
                    <button
                      onClick={() => setNewMode(true)}
                      disabled={resolveMutation.isPending}
                      className="border border-hair text-muted px-4 py-2 font-bold font-mono text-[10px] uppercase flex items-center gap-2 hover:text-fg hover:border-strong disabled:opacity-50 transition-colors"
                    >
                      <Plus size={14} />
                      Mark New [N]
                    </button>
                  </div>
                  <button
                    onClick={handleReject}
                    disabled={resolveMutation.isPending}
                    className="border border-danger-line text-danger hover:bg-danger-bg px-4 py-2 font-bold font-mono text-[10px] uppercase flex items-center gap-2 disabled:opacity-50 transition-colors"
                  >
                    <X size={14} />
                    Reject [R]
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center font-mono text-muted text-[10px] uppercase tracking-wider">
            Select an item from the queue
          </div>
        )}
      </div>
    </div>
  );
}
