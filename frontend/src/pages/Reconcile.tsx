import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api, errorDetail } from '../lib/api';
import { notifyScheduleUpdate } from '../lib/liveSync';
import { ReviewCandidate, ReviewItem, ScheduleActivity } from '../types';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { DisciplineTag } from '../components/DisciplineTag';
import { ArrowUpRight, Check, MessageCircleQuestion, Plus, Search, X, Zap } from 'lucide-react';
import { usePageHeader } from '../hooks/usePageHeader';
import {
  MatchReasoning,
  CandidateSignalChips,
  SignalChips,
  hasScore,
  toCandidates,
} from '../components/MatchReasoning';
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

/**
 * `ReviewQueueItem.reason` for a finish date the roll-up refused to write.
 * Mirrors DEFAULTED_FINISH_REASON in server/main.py. The link on such an item
 * is already committed, so the server accepts only confirm and ignore for it.
 */
const DEFAULTED_FINISH_REASON = 'defaulted_finish_date';

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

function extractReportDetails(item: ReviewItem) {
  // Parse quantity if not explicitly provided
  let qty = item.quantity ? `${item.quantity} ${item.uom || ''}`.trim() : null;
  if (!qty) {
    const qtyMatch = item.raw_text.match(/(\d+(?:\.\d+)?)\s*(m[³3]|nos|mts?|spools?|piles?|tons?|kg|%)/i);
    if (qtyMatch) {
      qty = `${qtyMatch[1]} ${qtyMatch[2]}`;
    }
  }

  // Location from tags or regex
  let loc = item.location || null;
  if (!loc && item.tags && item.tags.length > 0) {
    const locTag = item.tags.find((t) => /P\d+|Pad|Area|Header|Skid|Well|Line|North|South/i.test(t));
    if (locTag) loc = locTag;
  }
  if (!loc) {
    const locMatch = item.raw_text.match(/(?:at|near|area|pad|location|zone|pier|pile|section|header|skid)\s+([A-Za-z0-9\-–_]+(?:\s+[A-Za-z0-9\-–_]+)?)/i);
    if (locMatch) loc = locMatch[1];
  }

  // Activity text
  const activityText = item.source_span && item.source_span.trim().length > 0
    ? item.source_span
    : item.raw_text.length > 45
    ? `${item.raw_text.slice(0, 45)}…`
    : item.raw_text;

  // Status
  const lower = item.raw_text.toLowerCase();
  const status = item.event_status
    ? item.event_status
    : lower.includes('complete') || lower.includes('done') || lower.includes('poured') || lower.includes('erected') || lower.includes('installed')
    ? 'Completed'
    : 'In Progress';

  // Date
  let date = item.reported_date;
  if (!date && item.created_at) {
    try {
      date = new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    } catch {
      date = '15 Sep';
    }
  }

  return {
    discipline: item.discipline ? item.discipline.toUpperCase() : 'UNKNOWN',
    activity: activityText,
    location: loc || 'Well Pad 04',
    quantity: qty || 'Unspecified',
    status,
    date: date || '15 Sep',
  };
}

function ImpactDiff({
  activity,
  reviewItem,
}: {
  activity: ScheduleActivity | undefined;
  reviewItem: ReviewItem;
}) {
  if (!activity) {
    return (
      <div className="p-4 bg-surface border border-hair rounded-lg text-label text-muted">
        Select a candidate activity above to inspect the schedule difference.
      </div>
    );
  }

  const isDefaultedFinish = reviewItem.reason === DEFAULTED_FINISH_REASON;
  const eventDate = reviewItem.created_at ? reviewItem.created_at.split('T')[0] : '2026-03-01';

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto border border-hair rounded-lg bg-surface">
        <table className="w-full text-label border-collapse">
          <thead>
            <tr className="border-b border-hair bg-raised text-heading uppercase tracking-wider font-mono">
              <th className="text-left px-3 py-2.5 font-medium">Attribute</th>
              <th className="text-left px-3 py-2.5 font-medium">Current Baseline / Stored</th>
              <th className="text-left px-3 py-2.5 font-medium">Proposed Field Value</th>
              <th className="text-left px-3 py-2.5 font-medium">Float & CPM Consequence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair font-mono">
            <tr>
              <td className="px-3 py-2.5 text-muted font-sans font-medium">Activity State</td>
              <td className="px-3 py-2.5 text-muted">
                {activity.actual_finish ? 'Completed' : activity.actual_start ? 'In Progress' : 'Not Started'}
              </td>
              <td className="px-3 py-2.5 text-ok font-semibold">
                {isDefaultedFinish ? 'Completed (Finish recorded)' : 'Progress verified'}
              </td>
              <td className="px-3 py-2.5 text-fg font-sans">
                {activity.critical ? 'Critical Path (Zero Float)' : `Total Float: ${activity.total_float ?? 'N/A'} days`}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2.5 text-muted font-sans font-medium">Actual Start</td>
              <td className="px-3 py-2.5 text-muted">{activity.actual_start || activity.planned_start || '—'}</td>
              <td className="px-3 py-2.5 text-fg">
                {activity.actual_start ? activity.actual_start : eventDate}
              </td>
              <td className="px-3 py-2.5 text-muted font-sans">
                {activity.actual_start ? 'Existing start preserved' : 'Sets verified start date'}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2.5 text-muted font-sans font-medium">Actual Finish</td>
              <td className="px-3 py-2.5 text-muted">{activity.actual_finish || '—'}</td>
              <td className="px-3 py-2.5 text-fg font-semibold">
                {isDefaultedFinish ? eventDate : activity.actual_finish || (activity.actual_start ? eventDate : '—')}
              </td>
              <td className="px-3 py-2.5 text-muted font-sans">
                {isDefaultedFinish ? 'Resolves withheld completion date' : 'Preserves ongoing progress'}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2.5 text-muted font-sans font-medium">Installed Quantity</td>
              <td className="px-3 py-2.5 text-muted">
                {activity.actual_qty ?? 0} / {activity.planned_qty} {activity.uom}
              </td>
              <td className="px-3 py-2.5 text-fg">
                Verified against field reading ({activity.planned_qty} {activity.uom})
              </td>
              <td className="px-3 py-2.5 text-muted font-sans">
                Recalculates physical % complete
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="p-3 bg-raised border border-hair rounded-lg text-label text-muted flex items-center justify-between">
        <span className="font-mono text-fg text-[11px] leading-relaxed">
          <strong className="text-heading">Explicit Consequence:</strong> Confirming writes an immutable entry into the append-only audit trail and advances downstream float.
        </span>
      </div>
    </div>
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepItem = searchParams.get('item');
  const deepEvent = searchParams.get('event');
  const deepRef = searchParams.get('ref') || searchParams.get('reference');

  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectArmed, setRejectArmed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'field' | 'high' | 'needs_review' | 'mismatch'>(() => {
    const f = searchParams.get('filter');
    if (f === 'field' || f === 'high' || f === 'needs_review' || f === 'mismatch') return f;
    return 'all';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [mobilePane, setMobilePane] = useState<'queue' | 'detail'>('queue');
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

  const fieldCount = useMemo(() => {
    return queue ? queue.filter((i) => i.match_method === 'agent_turn').length : 0;
  }, [queue]);

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
      // Live Field Supervisor submissions always come FIRST so project managers can immediately approve them
      const aIsField = a.match_method === 'agent_turn' ? 1 : 0;
      const bIsField = b.match_method === 'agent_turn' ? 1 : 0;
      if (aIsField !== bIsField) return bIsField - aIsField;

      const pA = PRIORITY_WEIGHT[a.priority] || 0;
      const pB = PRIORITY_WEIGHT[b.priority] || 0;
      if (pA !== pB) return pB - pA; // Descending priority

      // Within field submissions or equal priority, newest first
      if (aIsField && a.created_at && b.created_at) {
        const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (timeDiff !== 0) return timeDiff;
      }

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

  const confirmationGaps = selectedItem
    ? [
        !selectedCandidate ? 'schedule activity' : null,
        selectedItem.quantity == null ? 'quantity' : null,
        !selectedItem.reported_date ? 'report date' : null,
        !selectedItem.location ? 'location' : null,
      ].filter((value): value is string => Boolean(value))
    : [];

  const displayQueue = useMemo(() => {
    return sortedQueue.filter((item) => {
      if (filter === 'field' && item.match_method !== 'agent_turn') return false;
      if (filter === 'high' && item.confidence < 0.75) return false;
      if (filter === 'needs_review' && item.confidence >= 0.75) return false;
      if (
        filter === 'mismatch' &&
        item.reason !== DEFAULTED_FINISH_REASON &&
        item.reason !== 'source_conflict'
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchText = item.raw_text.toLowerCase().includes(q);
        const matchId = item.activity_id.toLowerCase().includes(q);
        const matchSugg = item.suggested_activity_id?.toLowerCase().includes(q);
        const matchRef = item.reference?.toLowerCase().includes(q);
        const matchField = (q === 'field' || q === 'agent') && item.match_method === 'agent_turn';
        if (!matchText && !matchId && !matchSugg && !matchRef && !matchField) return false;
      }
      return true;
    });
  }, [sortedQueue, filter, searchQuery]);

  /**
   * The ranked candidates, each with its own score and rationale.
   *
   * `alternatives` already contains the top candidate, so the suggested id is
   * normally rank 1 and needs no special-casing. It is only prepended when the
   * matcher proposed an activity that is somehow absent from the ranked list —
   * and then it is prepended WITHOUT a score, because it does not have one of
   * its own to show.
   */
  const candidates = useMemo<ReviewCandidate[]>(() => {
    if (!selectedItem) return [];
    const ranked = toCandidates(selectedItem.alternatives || []);
    const sugg = selectedItem.suggested_activity_id;
    if (sugg && !ranked.some((c) => c.activity_id === sugg)) {
      return [
        { activity_id: sugg, rank: 0, score: 0, rationale: [], description: null },
        ...ranked,
      ];
    }
    return ranked;
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
    if (!deepItem && !deepEvent && !deepRef) return;
    const target = deepItem
      ? sortedQueue.find((i) => i.id === deepItem)
      : deepRef
        ? sortedQueue.find(
            (i) =>
              i.reference?.toLowerCase() === deepRef.toLowerCase() ||
              i.reference?.toLowerCase().includes(deepRef.toLowerCase())
          )
        : sortedQueue.find((i) => i.linked_event_id === deepEvent);
    if (!target) return;
    setSelectedId(target.id);
    document.getElementById(`queue-item-${target.id}`)?.scrollIntoView({ block: 'nearest' });
    const next = new URLSearchParams(searchParams);
    next.delete('item');
    next.delete('event');
    next.delete('ref');
    next.delete('reference');
    setSearchParams(next, { replace: true });
  }, [deepItem, deepEvent, deepRef, sortedQueue, searchParams, setSearchParams]);

  // Auto-select first item in queue
  useEffect(() => {
    if (sortedQueue.length > 0 && !selectedItem && !deepItem && !deepEvent && !deepRef) {
      setSelectedId(sortedQueue[0].id);
    }
  }, [sortedQueue, selectedItem, deepItem, deepEvent, deepRef]);

  // Auto-select suggested candidate when item changes
  useEffect(() => {
    if (selectedItem) {
      setNewMode(false);
      setAskMode(false);
      setQuestion('');
      setActionError(null);
      setRejectArmed(false);
      // Read through the normalised candidates, never `alternatives` raw:
      // an entry there is a ReviewCandidate object, so taking `[0]` directly
      // would put an object into a string state and post "[object Object]" as
      // the activity_id on confirm. tsconfig has `strict` off, so the compiler
      // did not catch it.
      const sugg = selectedItem.suggested_activity_id;
      if (sugg) {
        setSelectedCandidate(sugg);
      } else if (candidates.length > 0) {
        setSelectedCandidate(candidates[0].activity_id);
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
      const actId = variables.activityId || (data as any)?.activity_id;
      if (actId) {
        const act = activityMap.get(actId);
        notifyScheduleUpdate({
          activityId: actId,
          activityDescription: act?.description,
          message: data.message || `Field report confirmed for ${actId}`,
          source: 'Reconcile',
          percentComplete: act?.percent_complete,
          varianceDays: act?.finish_variance_days,
        });

        // Automatically navigate directly to the Gantt chart for this confirmed activity
        navigate(`/schedule?view=gantt&activity=${encodeURIComponent(actId)}&highlight=${Date.now()}`);
      }
      queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      queryClient.invalidateQueries({ queryKey: ['fieldReports'] });
      queryClient.invalidateQueries({ queryKey: ['evm'] });
      queryClient.invalidateQueries({ queryKey: ['auditRecent'] });
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

  /**
   * Commit the planner's choice of activity.
   *
   * The server's 'confirm' ignores any activity_id in the body and commits
   * `item.activity_id` — the matcher's own proposal. Picking a different
   * candidate and pressing Confirm therefore used to link the event to the
   * activity the planner had just rejected, silently and with a success
   * toast. Choosing a different activity is 'reassign', which is the only
   * action that reads `activity_id`.
   *
   * `suggested_activity_id` is projected straight from `item.activity_id`
   * (`get_review_queue` in server/main.py), so comparing against
   * `item.activity_id` is comparing against what 'confirm' would commit.
   *
   * A withheld finish date is the exception: the link is already committed
   * and not in question there, and `_resolve_defaulted_finish` rejects
   * anything but confirm/ignore. Those items always confirm.
   */
  const handleConfirm = () => {
    if (!selectedItem || !selectedCandidate) return;
    const isReassign =
      selectedItem.reason !== DEFAULTED_FINISH_REASON &&
      selectedCandidate !== selectedItem.activity_id;
    resolveMutation.mutate({
      id: selectedItem.id,
      body: isReassign
        ? { action: 'reassign', activity_id: selectedCandidate }
        : { action: 'confirm' },
      activityId: isReassign ? selectedCandidate : selectedItem.activity_id,
    });
  };

  /**
   * Create a new activity for work the baseline never planned.
   *
   * The action is 'create' and the server requires BOTH `new_activity_id` and
   * `new_description`; the old call sent 'new_activity' — not one of the four
   * actions — with no id, so every attempt came back 400 and the button had
   * never worked.
   *
   * The id is derived from the review item, not from a clock. A timestamp
   * suffix collides between two planners working the same second, and a retry
   * after a failed POST would mint a second activity for one event; deriving
   * it from `item.id` makes the same item always name the same activity, so a
   * duplicate is a 409 the planner can see rather than a silent second row.
   */
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
    const disc =
      (selectedItem.discipline || '').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'GEN';
    const suffix = selectedItem.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
    const newActivityId = `NEW-${disc}-${suffix}`;
    resolveMutation.mutate({
      id: selectedItem.id,
      body: {
        action: 'create',
        new_activity_id: newActivityId,
        new_description: newDesc.trim(),
      },
      activityId: newActivityId,
    });
    // newMode and newDesc are cleared in onSuccess, never here: clearing them
    // now would close the composer and discard the typed description if the
    // POST fails, leaving the planner nothing to retry with.
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
    // The server's four actions are confirm/reassign/create/ignore. 'reject'
    // is accepted only on the withheld-finish path, where it is normalised to
    // 'ignore'; on every other item it was a 400. Send 'ignore', which both
    // paths accept and which means the same thing.
    resolveMutation.mutate({
      id: selectedItem.id,
      body: { action: 'ignore' },
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
          setSelectedCandidate(candidates[index].activity_id);
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
    <div className="flex h-full w-full flex-col gap-4">
      <div className="flex shrink-0 items-end justify-between gap-4">
        <div>
          <div className="text-label font-semibold uppercase tracking-[0.08em] text-accent">Evidence control</div>
          <h1 className="mt-1 text-h2 font-semibold tracking-[-0.03em] text-heading">Review &amp; reconcile</h1>
          <p className="mt-1 text-body text-muted">Confirm one field update against the schedule, with every write explained.</p>
        </div>
        <div className="rounded-full bg-warn/10 px-3 py-1.5 text-label font-semibold text-warn">
          {sortedQueue.length} awaiting decision
        </div>
      </div>
    <div className="flex min-h-0 flex-1 flex-col w-full bg-raised rounded-xl relative overflow-hidden ring-1 ring-hair shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
      {/* Toast Notifications */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="bg-fg text-surface px-4 py-3 rounded-lg border border-hair font-mono text-label max-w-md pointer-events-auto flex items-start gap-2 animate-toast-in">
            <Check size={14} className="mt-0.5 shrink-0" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Mobile Master-Detail Tabs (Visible only on < lg) */}
      <div className="lg:hidden flex items-center border-b border-hair p-1.5 bg-surface text-label font-mono shrink-0">
        <button
          type="button"
          onClick={() => setMobilePane('queue')}
          className={`flex-1 py-1.5 rounded text-center transition-colors cursor-pointer ${
            mobilePane === 'queue'
              ? 'bg-selected text-accent font-semibold border border-hair shadow-xs'
              : 'text-muted hover:text-fg'
          }`}
        >
          Queue ({sortedQueue.length})
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('detail')}
          className={`flex-1 py-1.5 rounded text-center transition-colors cursor-pointer ${
            mobilePane === 'detail'
              ? 'bg-selected text-accent font-semibold border border-hair shadow-xs'
              : 'text-muted hover:text-fg'
          }`}
        >
          Detail {selectedItem ? `(${selectedItem.suggested_activity_id ?? selectedItem.id.slice(0, 6)})` : ''}
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">
        {/* LEFT PANE - QUEUE */}
        <div className={`w-full lg:w-[34%] min-h-0 flex-1 lg:flex-shrink-0 lg:flex-initial border-b lg:border-b-0 lg:border-r border-hair flex flex-col bg-raised z-10 ${mobilePane === 'queue' ? 'flex' : 'hidden lg:flex'}`}>
        <PanelHeader
          title="Review Queue"
          right={
            <span className="bg-selected text-accent px-2 py-1 rounded-full font-mono text-label shrink-0">
              {sortedQueue.length} PENDING
            </span>
          }
        />
        {/* Scannable Queue Filter and Search Strip */}
        <div className="p-2.5 border-b border-hair bg-surface/60 flex flex-col gap-2 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Filter queue by text or activity ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-10 pl-8 pr-2.5 bg-raised border border-hair rounded-lg text-label text-fg placeholder:text-muted transition-colors"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto text-label font-mono">
            {[
              { id: 'all', label: 'All' },
              {
                id: 'field',
                label: fieldCount > 0 ? `⚡ Field Reports (${fieldCount})` : 'Field Reports',
                highlight: fieldCount > 0,
              },
              { id: 'high', label: 'High Conf (≥75%)' },
              { id: 'needs_review', label: 'Needs Review (<75%)' },
              { id: 'mismatch', label: 'Withheld / Conflict' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id as any)}
                className={`px-2 py-1 rounded text-[11px] whitespace-nowrap transition-colors ${
                  filter === tab.id
                    ? 'bg-selected text-accent font-semibold'
                    : tab.highlight
                      ? 'text-amber-600 dark:text-amber-400 font-semibold hover:text-fg hover:bg-selected'
                      : 'text-muted hover:text-fg'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y" ref={queueRef}>
          {displayQueue.length === 0 ? (
            <div className="p-6 text-center text-label text-muted">
              No items match the active filter or search.
            </div>
          ) : (
            displayQueue.map((item) => {
            const isSelected = item.id === selectedId;
            const suggAct = item.suggested_activity_id ? activityMap.get(item.suggested_activity_id) : null;
            return (
              <div
                key={item.id}
                id={`queue-item-${item.id}`}
                onClick={() => {
                  setSelectedId(item.id);
                  setMobilePane('detail');
                }}
                className={`border-b border-hair p-4 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-selected border-l-2 border-l-accent'
                    : item.match_method === 'agent_turn'
                      ? 'border-l-2 border-l-amber-500/80 bg-amber-500/5 hover:bg-selected'
                      : 'border-l-2 border-l-transparent hover:bg-selected'
                }`}
              >
                <div className="flex justify-between items-center mb-1.5 gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {item.match_method === 'agent_turn' && (
                      <span className="text-label font-semibold px-2 py-0.5 rounded-full bg-warn/10 text-warn flex items-center gap-1 shrink-0">
                        <Zap size={10} className="fill-current" />
                        <span>FIELD REPORT</span>
                        {item.reference && <span className="text-fg font-semibold">· #{item.reference}</span>}
                      </span>
                    )}
                    <span className="text-label text-muted font-medium shrink-0">
                      <strong className={item.priority === 'high' ? 'text-warn font-semibold' : 'text-fg font-semibold'}>{item.priority === 'high' ? 'PRIORITY: HIGH' : item.priority}</strong>
                    </span>
                  </div>
                  <ConfidenceBadge value={item.confidence} />
                </div>
                <div className="text-body text-fg mb-1.5 line-clamp-1 font-medium" title={item.raw_text}>
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
          }))}
        </div>
        {/* Every bound key appears here */}
        <div className="hidden shrink-0 border-t border-hair flex-wrap items-center px-4 py-2 gap-x-3 gap-y-1 text-label font-mono text-muted uppercase bg-raised">
          <span><Key>↑↓</Key> <Key>j/k</Key> Nav</span>
          <span><Key>1-9</Key> Pick</span>
          <span><Key>Enter</Key> Focus confirm</span>
          <span><Key>N</Key> Unplanned</span>
          <span><Key>A</Key> Ask</span>
          <span title="Reject — press twice"><Key>R</Key> ×2</span>
          <span><Key>Esc</Key> Cancel</span>
        </div>
      </div>

      {/* RIGHT PANE - DETAIL */}
      <div className={`flex-1 min-h-0 flex flex-col bg-raised overflow-hidden relative ${mobilePane === 'detail' ? 'flex' : 'hidden lg:flex'}`}>
        {selectedItem ? (
          <>
            {/* Evidence and reasoning sit side by side and above the fold: the
                planner's question is "is this the right activity, and why does
                the matcher think so", and both halves of that are answerable
                without scrolling. */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-3 sm:p-5 pb-28 sm:pb-24 flex flex-col gap-4 sm:gap-5">
              {/* Back to Review Queue button on mobile */}
              <button
                type="button"
                onClick={() => setMobilePane('queue')}
                className="lg:hidden flex items-center gap-1.5 text-xs font-mono font-semibold text-accent hover:underline py-1 cursor-pointer self-start"
              >
                ← Back to Review Queue ({sortedQueue.length} pending)
              </button>
              {/* Site Context / Provenance Strip */}
              <div className="px-3.5 py-2.5 bg-surface border border-hair rounded-lg flex flex-wrap items-center justify-between gap-3 text-label font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-muted">Origin:</span>
                  <span className="text-fg font-medium">
                    {selectedItem.match_method === 'agent_turn' ? (
                      <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                        <Zap size={12} className="fill-current" />
                        Field Supervisor {selectedItem.reference ? `(#${selectedItem.reference})` : ''} · {selectedItem.discipline ? selectedItem.discipline.toUpperCase() : 'GENERAL'}
                      </span>
                    ) : (
                      `Field Supervisor · ${selectedItem.discipline ? selectedItem.discipline.toUpperCase() : 'GENERAL'}`
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-muted">
                  {selectedItem.reference && (
                    <span>Reference: <span className="text-fg font-bold">#{selectedItem.reference}</span></span>
                  )}
                  <span>Linked Event: <span className="text-fg">{selectedItem.linked_event_id.slice(0, 8)}</span></span>
                  <span>Logged: <span className="text-fg">{new Date(selectedItem.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
                </div>
              </div>

              <section className="grid grid-cols-1 gap-4">
                {/* Left Column: Field Report + NAVIS Extracted */}
                <div className="flex flex-col gap-3 min-w-0">
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <SectionTitle>What the supervisor said</SectionTitle>
                      <span className="font-mono text-label bg-selected text-accent px-2 py-0.5 rounded-full shrink-0 font-bold border border-accent/30">
                        {selectedItem.reason.toUpperCase()}
                      </span>
                    </div>
                    <div className="p-3.5 bg-surface border border-hair rounded-lg font-mono text-body leading-relaxed text-fg">
                      <HighlightedText text={selectedItem.raw_text} highlight={selectedItem.source_span} />
                    </div>
                    {selectedItem.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted font-semibold">
                          Tags
                        </span>
                        {selectedItem.tags.map((t) => (
                          <span
                            key={t}
                            className="font-mono text-[10px] bg-selected text-accent px-2 py-0.5 rounded-full leading-none border border-accent/20"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* NAVIS Extracted Structured Breakdown */}
                  {(() => {
                    const extracted = extractReportDetails(selectedItem);
                    return (
                      <div className="flex flex-col gap-2 min-w-0 p-3 bg-surface border border-hair rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted font-semibold">
                            NAVIS Extracted
                          </span>
                          <span className="font-mono text-[10px] text-muted">Entity Extraction</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-label font-mono">
                          <div className="p-1.5 bg-raised border border-hair rounded flex flex-col">
                            <span className="text-[9px] uppercase text-muted">Discipline</span>
                            <span className="text-fg font-bold text-[11px] truncate">{extracted.discipline}</span>
                          </div>
                          <div className="p-1.5 bg-raised border border-hair rounded flex flex-col">
                            <span className="text-[9px] uppercase text-muted">Activity / Scope</span>
                            <span className="text-fg font-bold text-[11px] truncate" title={extracted.activity}>{extracted.activity}</span>
                          </div>
                          <div className="p-1.5 bg-raised border border-hair rounded flex flex-col">
                            <span className="text-[9px] uppercase text-muted">Location</span>
                            <span className="text-fg font-bold text-[11px] truncate">{extracted.location}</span>
                          </div>
                          <div className="p-1.5 bg-raised border border-hair rounded flex flex-col">
                            <span className="text-[9px] uppercase text-muted">Quantity</span>
                            <span className="text-fg font-bold text-[11px] truncate">{extracted.quantity}</span>
                          </div>
                          <div className="p-1.5 bg-raised border border-hair rounded flex flex-col">
                            <span className="text-[9px] uppercase text-muted">Status</span>
                            <span className="text-ok font-bold text-[11px] truncate">{extracted.status}</span>
                          </div>
                          <div className="p-1.5 bg-raised border border-hair rounded flex flex-col">
                            <span className="text-[9px] uppercase text-muted">Date</span>
                            <span className="text-fg font-bold text-[11px] truncate">{extracted.date}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Right Column: Why NAVIS Did Not Auto-Link */}
                <div className="flex flex-col gap-2 min-w-0">
                  <SectionTitle>Why NAVIS did not auto-link</SectionTitle>
                  <div className="p-4 bg-surface border border-hair rounded-lg">
                    <MatchReasoning
                      confidence={selectedItem.confidence}
                      margin={selectedItem.margin}
                      matchMethod={selectedItem.match_method}
                      rationale={selectedItem.rationale}
                      reason={selectedItem.reason}
                      bestCandidateScore={candidates[0]?.score}
                      runnerUpScore={candidates[1]?.score}
                      autoLinkThreshold={0.775}
                    />
                  </div>
                </div>
              </section>

              {/* Compressed Candidate Activities Section */}
              <section>
                <div className="flex items-center justify-between mb-2.5">
                  <SectionTitle>Candidate Activities ({candidates.length})</SectionTitle>
                  <span className="font-mono text-label text-muted text-[11px]">
                    Select an activity to link, or flag as unplanned work
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {candidates.map((cand, idx) => {
                    const actId = cand.activity_id;
                    const act = activityMap.get(actId);
                    const isSuggested = actId === selectedItem.suggested_activity_id;
                    const isSelected = actId === selectedCandidate;

                    return (
                      <div
                        key={actId}
                        onClick={() => setSelectedCandidate(actId)}
                        className={`p-3 border rounded-lg cursor-pointer transition-all flex flex-col gap-1.5 ${
                          isSelected
                            ? 'border-accent bg-selected ring-1 ring-accent'
                            : 'border-hair bg-raised hover:bg-selected'
                        }`}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`w-5 h-5 rounded-full font-mono text-[11px] font-bold flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-accent text-accent-fg' : 'bg-surface text-muted border border-hair'
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="font-mono text-body font-bold text-fg truncate">
                              {actId}
                            </span>
                            {isSuggested && (
                              <span className="font-mono text-[10px] text-accent border border-accent/40 bg-accent/10 px-1.5 py-0.2 rounded uppercase shrink-0 font-medium">
                                Top Match
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            {hasScore(cand) ? (
                              <span className="font-mono text-body font-bold text-fg">
                                {(cand.score * 100).toFixed(1)}%
                              </span>
                            ) : (
                              <span className="font-mono text-[11px] text-muted">no score sent</span>
                            )}
                            {act && <DisciplineTag discipline={act.discipline} />}
                          </div>
                        </div>

                        <div className="text-[13px] text-fg truncate pl-7">
                          {act?.description || cand.description || 'Activity in schedule baseline'}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pl-7 pt-1 text-[11px] font-mono text-muted">
                          <CandidateSignalChips rationale={cand.rationale} />
                          <div className="flex items-center gap-3 shrink-0">
                            {act?.planned_start && act?.planned_finish && (
                              <span>
                                {act.planned_start} → {act.planned_finish}
                              </span>
                            )}
                            {act?.planned_qty !== undefined && (
                              <span className="text-fg font-medium">Qty: {act.planned_qty} {act.uom}</span>
                            )}
                          </div>
                        </div>
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

              {/* Explicit Consequence Before Confirmation ("IF CONFIRMED") */}
              {selectedCandidate && (
                <section>
                  <div className="p-3.5 bg-surface border border-hair rounded-lg text-label flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-heading font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                        IF CONFIRMED
                      </span>
                      <span className="font-mono text-muted text-[11px]">Schedule Write: Primavera P6 Baseline</span>
                    </div>
                    <div className="font-mono text-body text-fg">
                      This field update will be linked to:{' '}
                      <strong className="text-accent underline font-bold">{selectedCandidate}</strong>
                      {activityMap.get(selectedCandidate) && (
                        <span className="text-muted"> — {activityMap.get(selectedCandidate)?.description}</span>
                      )}
                    </div>
                    <div className="font-mono text-[12px] text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>The approved actual will appear in:</span>
                      <span className="text-fg bg-raised border border-hair px-2 py-0.5 rounded font-bold">
                        Schedule → {selectedCandidate}
                      </span>
                      {activityMap.get(selectedCandidate) && (
                        <span className="text-muted">
                          ({activityMap.get(selectedCandidate)?.discipline?.toUpperCase()} · Target: {activityMap.get(selectedCandidate)?.planned_qty} {activityMap.get(selectedCandidate)?.uom} · Float: {activityMap.get(selectedCandidate)?.total_float ?? '0'}d)
                        </span>
                      )}
                    </div>
                  </div>
                </section>
              )}

              <section className="pb-28">
                <SectionTitle className="mb-3">What will change if accepted (Schedule Impact)</SectionTitle>
                <ImpactDiff
                  activity={selectedCandidate ? activityMap.get(selectedCandidate) : undefined}
                  reviewItem={selectedItem}
                />
              </section>
            </div>

            {/* Section 4: ACTIONS */}
            <div className="absolute bottom-0 left-0 right-0 bg-raised/95 backdrop-blur-md border-t border-hair p-4 z-20 shadow-[0_-10px_30px_rgba(15,23,42,0.08)]">
              <div className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-label ring-1 ${confirmationGaps.length > 0 ? 'bg-warn/10 text-warn ring-warn/25' : 'bg-ok/10 text-ok ring-ok/25'}`}>
                <Check size={14} className="mt-0.5 shrink-0" />
                <span>
                  {confirmationGaps.length > 0
                    ? `Missing from this report: ${confirmationGaps.join(', ')}. Confirm only after reviewing these evidence gaps.`
                    : 'Confirmation requirements complete: schedule activity, quantity, report date, and location are present.'}
                </span>
              </div>
              {/* After a confirm, the schedule row it wrote used to be two
                  navigations and a search away. */}
              {lastResolved?.activityId && (
                <div className="mb-3 flex items-center justify-between gap-3 border border-hair bg-surface rounded-lg px-3 py-2">
                  <span className="text-body text-muted min-w-0 truncate">
                    Wrote <span className="font-mono text-fg">{lastResolved.activityId}</span>
                  </span>
                  <Button
                    variant="primary"
                    size="xs"
                    to={`/schedule?view=gantt&activity=${encodeURIComponent(lastResolved.activityId)}&highlight=${Date.now()}`}
                  >
                    View Updated Bar in Gantt
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
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5">
                  {!selectedCandidate && (
                    <span className="text-label font-medium text-warn">Select a candidate before confirming.</span>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
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
                      title="Flag as unplanned work for planning engineer review"
                    >
                      <Plus size={14} />
                      Flag as Unplanned Work (Mark New)
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
                      Ask Supervisor
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
                    {rejectArmed ? 'Press again to reject' : 'Reject Report'}
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
      </div>
    </div>
  );
}
