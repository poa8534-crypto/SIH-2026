import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check } from 'lucide-react';
import { api, errorDetail } from '../lib/api';
import { Clarification } from '../types';

/**
 * Questions the Planning Engineer put back about this supervisor's own
 * reports.
 *
 * Answering hands the item back to the planner. It writes no schedule data,
 * confirms no match and creates no activity — the planner still decides.
 */

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString([], {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
}

function Card({ item }: { item: Clarification; key?: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
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

  return (
    <section className="border border-hair bg-raised">
      <div className="px-3 py-2 border-b border-hair flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted">{item.reference}</span>
        <span
          className={`font-mono text-[9px] uppercase tracking-wider ${
            answered ? 'text-ok' : 'text-warn'
          }`}
        >
          {answered ? 'Answered' : 'Awaiting your response'}
        </span>
      </div>

      <div className="px-3 py-2.5 border-b border-hair flex flex-col gap-1">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
          Your update
        </span>
        <span className="text-[12px] text-fg leading-snug">{item.original_text}</span>
      </div>

      <div className="px-3 py-2.5 border-b border-hair flex flex-col gap-1">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
          Question from {item.asked_by}
        </span>
        <span className="text-[12px] text-fg leading-snug">{item.question}</span>
        <span className="font-mono text-[9px] text-muted">{when(item.asked_at)}</span>
      </div>

      {answered ? (
        <div className="px-3 py-2.5 flex flex-col gap-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
            Your response
          </span>
          {/* Read-only once sent. */}
          <span className="text-[12px] text-fg leading-snug">
            {item.response ?? draft}
          </span>
          <span className="flex items-center gap-1.5 mt-1 text-ok font-mono text-[10px]">
            <Check size={12} />
            Response sent to Planning Engineer
          </span>
        </div>
      ) : (
        <div className="px-3 py-2.5 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Type your response"
            className="w-full bg-surface border border-hair text-fg text-[12px] p-2 focus:outline-none focus:border-accent resize-none"
          />
          {send.error && (
            <span className="font-mono text-[10px] text-danger">
              {errorDetail(send.error)}
            </span>
          )}
          <button
            onClick={() => send.mutate()}
            disabled={!draft.trim() || send.isPending}
            className="w-full bg-accent text-accent-fg font-mono text-[10px] uppercase tracking-wider py-2.5 disabled:opacity-50"
          >
            {send.isPending ? 'Sending…' : 'Send response'}
          </button>
        </div>
      )}
    </section>
  );
}

export default function FieldClarifications() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['clarifications'],
    queryFn: () => api.getClarifications(false),
  });

  const items = data ?? [];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
      <div>
        <h1 className="text-[18px] text-fg">Clarifications</h1>
        <p className="text-[11px] text-muted mt-0.5">
          Questions the Planning Engineer asked about your reports.
        </p>
      </div>

      {error ? (
        <div className="border border-danger-line bg-danger-bg px-3 py-2.5 flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0 text-danger" />
          <span className="font-mono text-[10px] text-danger">{errorDetail(error)}</span>
        </div>
      ) : isLoading ? (
        <div className="space-y-2 opacity-50">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 bg-raised animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="border border-hair bg-raised py-10 px-4 text-center">
          <div className="text-[13px] text-fg">No questions right now</div>
          <div className="text-[11px] text-muted mt-1 leading-relaxed">
            When the Planning Engineer needs something clarified about one of
            your reports, it will appear here.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <Card key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
