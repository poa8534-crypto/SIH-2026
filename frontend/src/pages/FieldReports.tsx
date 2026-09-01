import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, EmptyState, ErrorState, PanelHeader, SkeletonRows } from '../components/ui';

/**
 * This supervisor's own submission history.
 *
 * Scoped server-side to updates submitted through the agent, so another
 * reporter's work can never appear here. No search, no evidence column, no
 * attachments — none of those exist in this product.
 */

// The mockup's four chips, in its order. 'Needs Response' is the chip
// label; the API's status value for the same thing is 'Needs Information'.
const FILTERS = ['All', 'Processing', 'Needs Response', 'Confirmed'] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_TONE: Record<string, string> = {
  Confirmed: 'text-accent',
  'Needs Information': 'text-warn',
  Processing: 'text-muted',
  Rejected: 'text-danger',
};

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString([], {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
}

export default function FieldReports() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('All');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['fieldReports'],
    queryFn: () => api.getFieldReports(),
  });

  const reports = data ?? [];
  const counts = useMemo(() => ({
    total: reports.length,
    processing: reports.filter((r) => r.status === 'Processing').length,
    needsResponse: reports.filter((r) => r.status === 'Needs Information').length,
  }), [reports]);

  const shown = useMemo(() => {
    if (filter === 'All') return reports;
    if (filter === 'Needs Response') {
      return reports.filter((r) => r.status === 'Needs Information');
    }
    return reports.filter((r) => r.status === filter);
  }, [reports, filter]);

  const open = reports.find((r) => r.id === openId) ?? null;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
      <div>
        <h1 className="text-h2 font-semibold leading-8 text-heading">My reports</h1>
        <p className="text-lead text-muted mt-1 leading-6">
          Updates you have submitted, newest first.
        </p>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Total', value: counts.total, tone: 'text-fg' },
          { label: 'Processing', value: counts.processing, tone: 'text-fg' },
          { label: 'Needs Response', value: counts.needsResponse, tone: 'text-warn' },
        ].map((c) => (
          <div key={c.label} className="border border-hair bg-raised rounded-lg p-3">
            <div className={`font-mono text-h2 font-semibold leading-none ${c.tone}`}>{c.value}</div>
            <div className="text-label font-medium uppercase tracking-[0.05em] text-muted mt-1.5">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
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
        <SkeletonRows rows={3} height="h-16" padded={false} />
      ) : reports.length === 0 ? (
        <div className="border border-hair bg-raised rounded-lg">
          <EmptyState
            title="No reports yet"
            action={
              <Button variant="primary" block onClick={() => navigate('/field')}>
                Create first report
              </Button>
            }
          >
            Your submitted updates will appear here.
          </EmptyState>
        </div>
      ) : shown.length === 0 ? (
        <EmptyState>No reports with status &ldquo;{filter}&rdquo;.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((r) => (
            <button
              key={r.id}
              onClick={() => setOpenId(openId === r.id ? null : r.id)}
              className="rounded-lg border border-hair bg-raised p-4 text-left flex flex-col gap-2 hover:bg-selected transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-label text-muted">{r.reference}</span>
                <span
                  className={`rounded-full bg-selected px-3 py-1 text-label font-medium uppercase tracking-[0.05em] shrink-0 ${
                    STATUS_TONE[r.status] ?? 'text-muted'
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <span className="text-lead text-fg leading-6">{r.raw_text}</span>
              {r.matched_activity_id && (
                <span className="font-mono text-label text-accent">
                  {r.matched_activity_id}
                  {r.matched_activity_description
                    ? ` · ${r.matched_activity_description}`
                    : ''}
                </span>
              )}
              <span className="text-label text-muted">{when(r.submitted_at)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Detail */}
      {open && (
        <section className="border border-hair bg-raised rounded-lg overflow-hidden">
          <PanelHeader
            title="Report details"
            right={<span className="font-mono text-label text-fg shrink-0">{open.reference}</span>}
          />
          <Detail label="Original text">{open.raw_text}</Detail>
          <Detail label="Work front">
            {open.location ?? open.discipline_label ?? '—'}
          </Detail>
          <Detail label="Matched activity">
            {open.matched_activity_id ? (
              <>
                <span className="font-mono">{open.matched_activity_id}</span>
                {open.matched_activity_description && (
                  <span className="block text-muted">
                    {open.matched_activity_description}
                  </span>
                )}
              </>
            ) : (
              'No matching activity — flagged for Planning Engineer'
            )}
          </Detail>
          {open.clarification_question && (
            <>
              <Detail label="Question from Planning">
                {open.clarification_question}
              </Detail>
              {!open.clarification_response && (
                <div className="px-4 pb-4">
                  <Button
                    variant="primary"
                    block
                    onClick={() => navigate('/field/clarifications')}
                  >
                    Respond now
                  </Button>
                </div>
              )}
            </>
          )}
          <p className="px-4 py-4 border-t border-hair text-label text-muted leading-relaxed">
            Every submitted update requires Planning Engineer confirmation before
            project data changes.
          </p>
        </section>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 border-b border-hair flex flex-col gap-2">
      <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
        {label}
      </span>
      <span className="text-lead text-fg leading-6">{children}</span>
    </div>
  );
}
