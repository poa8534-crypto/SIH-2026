import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Mic, StopCircle } from 'lucide-react';
import { api } from '../lib/api';
import { Clarification } from '../types';
import { PLANNER } from '../config';
import { useSpeech } from '../hooks/useSpeech';
import { Button, EmptyState, ErrorState, SkeletonRows } from '../components/ui';

/**
 * Questions the Planning Engineer put back about this supervisor's own
 * reports.
 *
 * Answering hands the item back to the planner. It writes no schedule data,
 * confirms no match and creates no activity — the planner still decides.
 *
 * A response can be spoken. That goes through the same transcript-review step
 * an update does, and for the same reason: speech mishears equipment numbers,
 * and a misheard answer to a clarification is worse than no answer at all.
 */

const FILTERS = ['All', 'Needs Response', 'Answered'] as const;
type Filter = (typeof FILTERS)[number];

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
}

function Card({ item }: { item: Clarification; key?: string }) {
  const queryClient = useQueryClient();
  const speech = useSpeech();
  const [draft, setDraft] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [sent, setSent] = useState(false);

  const send = useMutation({
    mutationFn: () => api.answerClarification(item.id, draft.trim()),
    onSuccess: () => {
      setSent(true);
      queryClient.invalidateQueries({ queryKey: ['clarifications'] });
      queryClient.invalidateQueries({ queryKey: ['fieldReports'] });
    },
  });

  const answered = item.answered || sent;
  const micBlocked = !speech.supported || speech.failure === 'denied';

  return (
    <section className="border border-hair bg-raised rounded-lg overflow-hidden">
      {/* Not a PanelHeader: neither side of this row is a section title. It
          uses the same px-4 py-3 the header primitive does. */}
      <div className="px-4 py-3 border-b border-hair flex items-center justify-between gap-3">
        <span className="font-mono text-label text-muted">{item.reference}</span>
        <span
          className={`rounded-full bg-selected px-3 py-1 text-label font-medium uppercase tracking-[0.05em] shrink-0 ${
            answered ? 'text-accent' : 'text-warn'
          }`}
        >
          {answered ? 'Answered' : 'Needs Response'}
        </span>
      </div>

      <div className="px-4 py-4 border-b border-hair">
        <span className="text-lead text-fg leading-6">{item.original_text}</span>
      </div>

      <div className="px-4 py-4 border-b border-hair flex flex-col gap-2">
        <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
          Question from Planning
        </span>
        <span className="text-lead text-fg leading-6">{item.question}</span>
        <span className="text-label text-muted mt-0.5">
          {item.asked_by} · {PLANNER.role} | Sent {when(item.asked_at)}
        </span>
      </div>

      {answered ? (
        <div className="px-4 py-4 flex flex-col gap-2">
          <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
            Your response
          </span>
          {/* Read-only once sent. */}
          <span className="text-lead text-fg leading-6">
            {item.response ?? draft}
          </span>
          <span className="flex items-center gap-2 mt-1 text-accent text-body">
            <Check size={16} />
            Response sent to Planning Engineer
          </span>
        </div>
      ) : speech.listening ? (
        <div className="relative px-4 py-4 flex flex-col items-center gap-3">
          {/* Same live treatment as the field home: accent rule, red dot. */}
          <span className="absolute top-0 left-0 w-full h-1 bg-accent" aria-hidden />
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-danger rounded-full animate-pulse" />
            <span className="text-label font-semibold uppercase tracking-[0.05em] text-danger">
              Listening
            </span>
          </span>
          <span className="text-h3 text-fg text-center leading-7 min-h-[36px]">
            {speech.transcript || (
              <span className="text-muted text-lead">Speak now…</span>
            )}
          </span>
          {speech.silent && (
            <span className="text-body text-muted">still listening…</span>
          )}
          <Button
            variant="primary"
            block
            onClick={() => {
              speech.stop();
              setDraft(speech.transcript);
              setReviewing(true);
            }}
          >
            <StopCircle size={18} />
            Stop &amp; process
          </Button>
          <Button variant="ghost" block onClick={() => speech.cancel()}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="px-4 py-4 flex flex-col gap-3">
          <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
            Your response
          </span>
          {reviewing && (
            <span className="text-label text-muted leading-relaxed">
              Check this before sending — speech recognition can mishear
              equipment numbers.
            </span>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Type your response here..."
            className="rounded-sm w-full bg-raised border border-hair text-fg text-lead leading-6 p-4 transition-colors focus:outline-none focus:border-accent resize-none"
          />
          {send.error && <ErrorState error={send.error} />}
          <div className="flex gap-2">
            {!micBlocked && (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  speech.clearFailure();
                  speech.start();
                  setReviewing(false);
                }}
              >
                <Mic size={18} />
                Record Response
              </Button>
            )}
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => send.mutate()}
              disabled={!draft.trim() || send.isPending}
            >
              {send.isPending ? 'Sending…' : 'Send Response'}
            </Button>
          </div>
          {micBlocked && (
            <span className="text-body text-muted">
              Microphone unavailable. Typing works just as well.
            </span>
          )}
        </div>
      )}

      <p className="px-4 py-4 border-t border-hair text-label text-muted leading-relaxed">
        Your response will be returned to the Planning Engineer for review.
      </p>
    </section>
  );
}

export default function FieldClarifications() {
  const [filter, setFilter] = useState<Filter>('All');

  const { data, isLoading, error } = useQuery({
    queryKey: ['clarifications'],
    queryFn: () => api.getClarifications(false),
  });

  const items = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => ({
    needsResponse: items.filter((i) => !i.answered).length,
    answered: items.filter((i) => i.answered).length,
    total: items.length,
  }), [items]);

  const shown = useMemo(() => {
    if (filter === 'Needs Response') return items.filter((i) => !i.answered);
    if (filter === 'Answered') return items.filter((i) => i.answered);
    return items;
  }, [items, filter]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
      <h1 className="text-h2 font-semibold leading-8 text-heading">Clarifications</h1>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Needs Response', value: counts.needsResponse, tone: 'text-warn' },
          { label: 'Answered', value: counts.answered, tone: 'text-accent' },
          { label: 'Total', value: counts.total, tone: 'text-fg' },
        ].map((c) => (
          <div key={c.label} className="border border-hair bg-raised rounded-lg p-3">
            <div className={`font-mono text-h2 font-semibold leading-none ${c.tone}`}>{c.value}</div>
            <div className="text-label font-medium uppercase tracking-[0.05em] text-muted mt-1.5">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <Button
            key={f}
            variant="secondary"
            shape="pill"
            active={filter === f}
            className="shrink-0"
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} />
      ) : isLoading ? (
        <SkeletonRows rows={2} height="h-28" padded={false} />
      ) : items.length === 0 ? (
        <div className="border border-hair bg-raised rounded-lg">
          <EmptyState title="No questions right now">
            When the Planning Engineer needs something clarified about one of
            your reports, it will appear here.
          </EmptyState>
        </div>
      ) : shown.length === 0 ? (
        <EmptyState>Nothing under &ldquo;{filter}&rdquo;.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((item) => (
            <Card key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
