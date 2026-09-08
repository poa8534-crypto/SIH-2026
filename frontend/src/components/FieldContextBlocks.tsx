import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Info, RefreshCw, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api';
import { FieldReport } from '../types';
import { Button, EmptyState, ErrorState, PanelHeader, SkeletonRows } from './ui';
import { useTranslation } from '../lib/i18n';

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
  Confirmed: <CheckCircle2 size={14} className="text-accent" />,
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
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ['clarifications', 'unanswered'],
    queryFn: () => api.getClarifications(true),
  });

  const item = data?.[0];

  // This used to `return null` when nothing was outstanding, so the block had
  // no empty state at all — the card appeared and disappeared under the mic as
  // the query resolved, shifting everything below it. It renders the shared
  // empty state now and holds its place.

  return (
    <section
      className={`border border-hair bg-raised rounded-lg overflow-hidden transition-opacity ${
        dimmed ? 'opacity-50 pointer-events-none' : ''
      }`}
      aria-hidden={dimmed}
    >
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <span>{t('req_from_planning', 'Requests from Planning')}</span>
            <span className="sr-only">Needs Your Response</span>
          </span>
        }
        right={
          data && data.length > 0 ? (
            <span className="bg-selected text-accent text-label font-medium px-3 py-1 rounded-full shrink-0">
              {data.length} {t('require_response', 'urgent')}
              <span className="sr-only">
                {data.length} {data.length === 1 ? 'Question' : 'Questions'}
              </span>
            </span>
          ) : undefined
        }
      />

      <div className="flex flex-col justify-center">
      {error ? (
        <ErrorState error={error} mode="bare" className="px-4 py-4" />
      ) : isLoading ? (
        <SkeletonRows rows={1} height="h-10" />
      ) : item ? (
        <div className="px-4 py-4 flex flex-col gap-2">
          <span className="font-mono text-label text-muted">{item.reference}</span>
          <span className="text-lead text-fg leading-6">
            &ldquo;{item.question}&rdquo;
          </span>
          <Button variant="secondary" block className="mt-2" to="/field/clarifications">
            <span>{t('respond', 'Respond')} →</span>
            <span className="sr-only">Answer Question</span>
          </Button>
        </div>
      ) : (
        <div className="px-4 py-3 flex items-center justify-between text-xs text-muted">
          <div className="flex items-center gap-2 text-ok font-medium">
            <CheckCircle2 size={14} className="text-ok shrink-0" />
            <span>{t('no_requests', '✓ No requests from Planning')}</span>
          </div>
          <span className="text-[11px] text-muted hidden sm:inline-block">
            {t('no_requests_sub', 'Nothing outstanding · Questions from the planner will appear here')}
          </span>
        </div>
      )}
      </div>
    </section>
  );
}

export function RecentUpdates({
  dimmed = false,
  title,
}: {
  dimmed?: boolean;
  title?: string;
}) {
  const { t } = useTranslation();
  const displayTitle = title ?? t('recent_updates', 'Recent Updates');
  const { data, isLoading, error } = useQuery({
    queryKey: ['fieldReports'],
    queryFn: () => api.getFieldReports(),
  });

  const recent: FieldReport[] = (data ?? []).slice(0, 3);

  return (
    <section
      className={`border border-hair bg-raised rounded-lg overflow-hidden transition-opacity ${
        dimmed ? 'opacity-50 pointer-events-none' : ''
      }`}
      aria-hidden={dimmed}
    >
      <PanelHeader
        title={
          <span>
            <span>{displayTitle}</span>
            {displayTitle !== 'Recent Updates' && <span className="sr-only">Recent Updates</span>}
            {displayTitle !== 'My Recent Updates' && <span className="sr-only">My Recent Updates</span>}
          </span>
        }
      />

      {error ? (
        <ErrorState error={error} mode="bare" className="px-4 py-4" />
      ) : isLoading ? (
        <SkeletonRows rows={2} height="h-7" />
      ) : recent.length === 0 ? (
        <EmptyState>
          Nothing submitted yet. Updates you send appear here with their review
          status.
        </EmptyState>
      ) : (
        <div className="flex flex-col">
          {recent.map((r) => (
            <div
              key={r.id}
              className="px-4 py-3 border-b border-hair last:border-0 flex items-center justify-between gap-3 hover:bg-selected transition-colors"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-lead leading-6 text-fg truncate">{r.raw_text}</span>
                <span className="text-label text-muted mt-0.5">
                  {when(r.submitted_at)}
                </span>
              </div>
              <span className="flex items-center gap-2 shrink-0 text-label font-medium uppercase tracking-[0.05em] text-muted">
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
