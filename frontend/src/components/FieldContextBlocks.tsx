import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Info, RefreshCw, TriangleAlert } from 'lucide-react';
import { api, errorDetail } from '../lib/api';
import { FieldReport } from '../types';

/**
 * "Needs Your Response" and "Recent Updates", shown below the input.
 *
 * These persist across idle, listening, transcript review and
 * speech-not-understood, and dim while recording. That is deliberate in the
 * mockups: the supervisor keeps sight of his pending clarification and his
 * recent submissions while he is speaking, rather than losing the page he was
 * looking at the moment he taps the microphone.
 */

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  Confirmed: <CheckCircle2 size={12} className="text-ok" />,
  Processing: <RefreshCw size={12} className="text-muted" />,
  'Needs Information': <Info size={12} className="text-warn" />,
  Rejected: <TriangleAlert size={12} className="text-danger" />,
};

/** The mockup's short status wording, which differs from the API's. */
const STATUS_SHORT: Record<string, string> = {
  Confirmed: 'Confirmed',
  Processing: 'Processing',
  'Needs Information': 'Needs Info',
  Rejected: 'Rejected',
};

export function NeedsYourResponse({ dimmed = false }: { dimmed?: boolean }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['clarifications', 'unanswered'],
    queryFn: () => api.getClarifications(true),
  });

  const item = data?.[0];

  // Nothing outstanding is the common case; showing an empty card every time
  // would push the recent updates off the screen for no reason.
  if (!error && !isLoading && !item) return null;

  return (
    <section
      className={`border border-hair bg-raised transition-opacity ${
        dimmed ? 'opacity-50 pointer-events-none' : ''
      }`}
      aria-hidden={dimmed}
    >
      <div className="px-3 py-2 border-b border-hair flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
          Needs Your Response
        </span>
        {data && data.length > 0 && (
          <span className="bg-accent text-accent-fg font-mono text-[11px] px-1.5 py-0.5">
            {data.length} {data.length === 1 ? 'Question' : 'Questions'}
          </span>
        )}
      </div>

      {error ? (
        <div className="px-3 py-3 flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0 text-danger" />
          <span className="font-mono text-[12px] text-danger">{errorDetail(error)}</span>
        </div>
      ) : isLoading ? (
        <div className="p-4">
          <div className="h-10 bg-surface animate-pulse" />
        </div>
      ) : item ? (
        <div className="px-3 py-2.5 flex flex-col gap-1.5">
          <span className="font-mono text-[12px] text-muted">{item.reference}</span>
          <span className="text-[14px] text-fg leading-snug">
            &ldquo;{item.question}&rdquo;
          </span>
          <Link
            to="/field/clarifications"
            className="mt-1 self-start border border-accent text-accent font-mono text-[12px] uppercase tracking-wider px-3 py-1.5"
          >
            Answer Question
          </Link>
        </div>
      ) : null}
    </section>
  );
}

export function RecentUpdates({
  dimmed = false,
  title = 'Recent Updates',
}: {
  dimmed?: boolean;
  title?: string;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['fieldReports'],
    queryFn: () => api.getFieldReports(),
  });

  const recent: FieldReport[] = (data ?? []).slice(0, 3);

  return (
    <section
      className={`border border-hair transition-opacity ${
        dimmed ? 'opacity-50 pointer-events-none' : ''
      }`}
      aria-hidden={dimmed}
    >
      <div className="px-3 py-2 border-b border-hair font-mono text-[11px] uppercase tracking-wider text-muted">
        {title}
      </div>

      {error ? (
        <div className="px-3 py-3 flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0 text-danger" />
          <span className="font-mono text-[12px] text-danger">{errorDetail(error)}</span>
        </div>
      ) : isLoading ? (
        <div className="p-4 space-y-2 opacity-50">
          {[0, 1].map((i) => (
            <div key={i} className="h-7 bg-raised animate-pulse" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="px-3 py-5 text-center text-[14px] text-muted leading-relaxed">
          Nothing submitted yet. Updates you send appear here with their review
          status.
        </div>
      ) : (
        <div className="flex flex-col">
          {recent.map((r) => (
            <div
              key={r.id}
              className="px-3 py-2 border-b border-hair last:border-0 flex items-center justify-between gap-3"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] text-fg truncate">{r.raw_text}</span>
                <span className="font-mono text-[11px] text-muted mt-0.5">
                  {when(r.submitted_at)}
                </span>
              </div>
              <span className="flex items-center gap-1 shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted">
                {STATUS_ICON[r.status]}
                {STATUS_SHORT[r.status] ?? r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
