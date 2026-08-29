import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { api, errorDetail } from '../lib/api';
import { FieldReport } from '../types';

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
  Confirmed: 'text-ok',
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
        <h1 className="text-[20px] text-fg">My Reports</h1>
        <p className="text-[14px] text-muted mt-0.5">
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
          <div key={c.label} className="border border-hair bg-raised p-2.5">
            <div className={`font-mono text-[24px] leading-none ${c.tone}`}>{c.value}</div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-muted mt-1">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
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
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 bg-raised animate-pulse" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="border border-hair bg-raised py-10 px-4 text-center flex flex-col items-center gap-2">
          <div className="text-[15px] text-fg">No reports yet</div>
          <div className="text-[14px] text-muted">
            Your submitted updates will appear here.
          </div>
          <button
            onClick={() => navigate('/field')}
            className="rounded-[8px] mt-2 bg-accent text-accent-fg font-mono text-[12px] uppercase tracking-wider px-4 py-2.5"
          >
            Create First Report
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="py-8 text-center text-[14px] text-muted">
          No reports with status &ldquo;{filter}&rdquo;.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((r) => (
            <button
              key={r.id}
              onClick={() => setOpenId(openId === r.id ? null : r.id)}
              className="rounded-[8px] border border-hair bg-raised p-4 text-left flex flex-col gap-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-[12px] text-muted">{r.reference}</span>
                <span
                  className={`font-mono text-[11px] uppercase tracking-wider shrink-0 ${
                    STATUS_TONE[r.status] ?? 'text-muted'
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <span className="text-[14px] text-fg leading-snug">{r.raw_text}</span>
              {r.matched_activity_id && (
                <span className="font-mono text-[12px] text-accent">
                  {r.matched_activity_id}
                  {r.matched_activity_description
                    ? ` · ${r.matched_activity_description}`
                    : ''}
                </span>
              )}
              <span className="font-mono text-[11px] text-muted">
                {when(r.submitted_at)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Detail */}
      {open && (
        <section className="border border-hair bg-surface">
          <div className="px-3 py-2 border-b border-hair flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
              Report details
            </span>
            <span className="font-mono text-[12px] text-fg">{open.reference}</span>
          </div>
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
                <div className="px-3 pb-3">
                  <button
                    onClick={() => navigate('/field/clarifications')}
                    className="rounded-[8px] w-full bg-accent text-accent-fg font-mono text-[12px] uppercase tracking-wider py-2.5"
                  >
                    Respond Now
                  </button>
                </div>
              )}
            </>
          )}
          <p className="px-3 py-2 border-t border-hair text-[12px] text-muted leading-relaxed">
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
    <div className="px-3 py-2.5 border-b border-hair flex flex-col gap-1">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="text-[14px] text-fg leading-snug">{children}</span>
    </div>
  );
}
