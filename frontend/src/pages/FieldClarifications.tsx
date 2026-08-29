import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Mic, StopCircle } from 'lucide-react';
import { api, errorDetail } from '../lib/api';
import { Clarification } from '../types';
import { PLANNER } from '../config';
import { useSpeech } from '../hooks/useSpeech';

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
    <section className="border border-hair bg-raised">
      <div className="px-3 py-2 border-b border-hair flex items-center justify-between">
        <span className="font-mono text-[12px] text-muted">{item.reference}</span>
        <span
          className={`font-mono text-[11px] uppercase tracking-wider ${
            answered ? 'text-ok' : 'text-warn'
          }`}
        >
          {answered ? 'Answered' : 'Needs Response'}
        </span>
      </div>

      <div className="px-3 py-2.5 border-b border-hair">
        <span className="text-[14px] text-fg leading-snug">{item.original_text}</span>
      </div>

      <div className="px-3 py-2.5 border-b border-hair flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
          Question From Planning
        </span>
        <span className="text-[14px] text-fg leading-snug">{item.question}</span>
        <span className="font-mono text-[11px] text-muted mt-0.5">
          {item.asked_by} · {PLANNER.role} | Sent {when(item.asked_at)}
        </span>
      </div>

      {answered ? (
        <div className="px-3 py-2.5 flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Your Response
          </span>
          {/* Read-only once sent. */}
          <span className="text-[14px] text-fg leading-snug">
            {item.response ?? draft}
          </span>
          <span className="flex items-center gap-1.5 mt-1 text-ok font-mono text-[12px]">
            <Check size={12} />
            Response sent to Planning Engineer
          </span>
        </div>
      ) : speech.listening ? (
        <div className="px-3 py-3 flex flex-col items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-danger rounded-full animate-pulse" />
            <span className="font-mono text-[12px] uppercase tracking-wider text-danger">
              Listening
            </span>
          </span>
          <span className="text-[15px] text-fg text-center leading-snug min-h-[36px]">
            {speech.transcript || (
              <span className="text-muted text-[14px]">Speak now…</span>
            )}
          </span>
          {speech.silent && (
            <span className="font-mono text-[12px] text-muted">listening…</span>
          )}
          <button
            onClick={() => {
              speech.stop();
              setDraft(speech.transcript);
              setReviewing(true);
            }}
            className="rounded-[8px] w-full bg-accent text-accent-fg font-mono text-[12px] uppercase tracking-wider py-2.5 flex items-center justify-center gap-2"
          >
            <StopCircle size={14} />
            Stop &amp; Process
          </button>
          <button
            onClick={() => speech.cancel()}
            className="rounded-[8px] font-mono text-[12px] uppercase tracking-wider text-muted hover:text-fg"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="px-3 py-2.5 flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Your Response
          </span>
          {reviewing && (
            <span className="text-[12px] text-muted leading-relaxed">
              Check this before sending — speech recognition can mishear
              equipment numbers.
            </span>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Type your response here..."
            className="rounded-[8px] w-full bg-surface border border-hair text-fg text-[14px] p-2 focus:outline-none focus:border-accent resize-none"
          />
          {send.error && (
            <span className="font-mono text-[12px] text-danger">
              {errorDetail(send.error)}
            </span>
          )}
          <div className="flex gap-2">
            {!micBlocked && (
              <button
                onClick={() => {
                  speech.clearFailure();
                  speech.start();
                  setReviewing(false);
                }}
                className="rounded-[8px] flex-1 border border-hair text-fg font-mono text-[12px] uppercase tracking-wider py-2.5 flex items-center justify-center gap-1.5 hover:border-strong"
              >
                <Mic size={14} />
                Record Response
              </button>
            )}
            <button
              onClick={() => send.mutate()}
              disabled={!draft.trim() || send.isPending}
              className="rounded-[8px] flex-1 bg-accent text-accent-fg font-mono text-[12px] uppercase tracking-wider py-2.5 disabled:opacity-50"
            >
              {send.isPending ? 'Sending…' : 'Send Response'}
            </button>
          </div>
          {micBlocked && (
            <span className="text-[12px] text-muted">
              Microphone unavailable. Typing works just as well.
            </span>
          )}
        </div>
      )}

      <p className="px-3 py-2 border-t border-hair text-[12px] text-muted leading-relaxed">
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
      <h1 className="text-[20px] text-fg">Clarifications</h1>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Needs Response', value: counts.needsResponse, tone: 'text-warn' },
          { label: 'Answered', value: counts.answered, tone: 'text-ok' },
          { label: 'Total', value: counts.total, tone: 'text-fg' },
        ].map((c) => (
          <div key={c.label} className="border border-hair bg-raised p-2.5">
            <div className={`font-mono text-[24px] leading-none ${c.tone}`}>{c.value}</div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-muted mt-1">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-[8px] shrink-0 px-2.5 py-1 border font-mono text-[12px] uppercase tracking-wider ${
              filter === f
                ? 'border-accent text-accent bg-selected'
                : 'border-hair text-muted hover:text-fg'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error ? (
        <div className="border border-danger-line bg-danger-bg px-3 py-2.5 flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0 text-danger" />
          <span className="font-mono text-[12px] text-danger">{errorDetail(error)}</span>
        </div>
      ) : isLoading ? (
        <div className="space-y-2 opacity-50">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 bg-raised animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="border border-hair bg-raised py-10 px-4 text-center">
          <div className="text-[15px] text-fg">No questions right now</div>
          <div className="text-[14px] text-muted mt-1 leading-relaxed">
            When the Planning Engineer needs something clarified about one of
            your reports, it will appear here.
          </div>
        </div>
      ) : shown.length === 0 ? (
        <div className="py-8 text-center text-[14px] text-muted">
          Nothing under &ldquo;{filter}&rdquo;.
        </div>
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
