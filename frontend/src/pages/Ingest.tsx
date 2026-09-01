import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Check,
  FileText,
  Info,
  Upload,
} from 'lucide-react';
import { api, errorDetail } from '../lib/api';
import { ExtractedEvent, JobResponse } from '../types';
import { isDiscipline } from '../config';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { DisciplineTag } from '../components/DisciplineTag';
import { usePageHeader } from '../hooks/usePageHeader';
import {
  Button,
  EmptyState,
  ErrorState,
  Panel,
  PanelHeader,
  SkeletonRows,
} from '../components/ui';

/**
 * QUESTION:  What did the system just do with my file?
 * ACTION:    Go deal with the events that need a human.
 *
 * Every number on this screen comes from the POST /ingest response and the
 * follow-up GET /jobs/{id}. The event table's Why column renders
 * `LinkedEventResponse.rationale` — the matcher's own deterministic feature
 * names, per D-003 — so a confidence figure is never shown without the reason
 * behind it. See D-031.
 */

/** The only two the drop zone accepts. Narrower than the server, on purpose. */
const ACCEPTED_EXTENSIONS = ['.txt', '.xlsx'] as const;
const ACCEPTED_LABEL = '.txt and .xlsx';

/**
 * Milliseconds between trace lines.
 *
 * Was 550, which put 1.65s of manufactured delay on the one moment the whole
 * screen exists for — and by its own comment the data was already complete
 * before the first line appeared. At 130 the four stages still resolve in
 * order, which is the only thing the stagger was for, in under 400ms total.
 */
const TRACE_BEAT = 130;

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

function formatBytes(n: number): string {
  return `${n.toLocaleString()} bytes`;
}

/** Where in the source this event was found. */
function positionOf(ev: ExtractedEvent): string {
  if (ev.source_line !== null) return `L${ev.source_line}`;
  if (ev.source_row !== null) return `R${ev.source_row}`;
  return '—';
}

// ── Pipeline trace ──────────────────────────────────────────────────────────

type TraceLine = { label: string; detail: React.ReactNode };

/**
 * The four stages of one ingest, revealed one at a time.
 *
 * Every number comes from the POST /ingest response and the follow-up
 * GET /jobs/{id}; nothing here is computed optimistically or estimated. The
 * stagger is presentational only — the data is already complete before the
 * first line appears, so a slow render can never show a number that later
 * turns out to be wrong.
 */
function PipelineTrace({ lines }: { lines: TraceLine[] }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    if (lines.length === 0) return;
    const timers = lines.map((_l, i) =>
      setTimeout(() => setShown((s) => Math.max(s, i + 1)), i * TRACE_BEAT)
    );
    return () => timers.forEach(clearTimeout);
  }, [lines]);

  if (lines.length === 0) return null;

  return (
    <Panel title="Pipeline">
      <div className="p-4 flex flex-col gap-2">
        {lines.map((line, i) => {
          const visible = i < shown;
          return (
            <div
              key={line.label}
              className={`flex items-baseline gap-3 font-mono text-body transition-all duration-300 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
              }`}
            >
              <Check
                size={12}
                className={`shrink-0 self-center ${visible ? 'text-ok' : 'text-transparent'}`}
              />
              <span className="w-[76px] shrink-0 text-fg tracking-wider">{line.label}</span>
              <span className="text-muted">{line.detail}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── Outcome ─────────────────────────────────────────────────────────────────

/** AUTO-LINKED rows carry a link through to that activity on the Schedule. */
function Outcome({ ev }: { ev: ExtractedEvent }) {
  if (ev.decision === 'AUTO_LINK' && ev.activity_id) {
    return (
      <Link
        to={`/schedule?activity=${encodeURIComponent(ev.activity_id)}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 font-mono text-label text-ok hover:underline"
      >
        <span className="uppercase">Auto-linked</span>
        <span className="text-fg">{ev.activity_id}</span>
        <ArrowUpRight size={10} className="shrink-0" />
      </Link>
    );
  }
  if (ev.decision === 'NEW_ACTIVITY') {
    return (
      <span className="font-mono text-label uppercase text-warn">Flagged as new</span>
    );
  }
  if (ev.decision === 'REJECTED') {
    return <span className="font-mono text-label uppercase text-muted">Rejected</span>;
  }
  // These are the rows that need a human, and they were the only outcome with
  // no way through to the screen that deals with them. Reconcile resolves
  // `?event=` against the queue's `linked_event_id`.
  return (
    <Link
      to={`/reconcile?event=${encodeURIComponent(ev.id)}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 font-mono text-label text-accent hover:underline"
    >
      <span className="uppercase">Sent to review</span>
      <ArrowUpRight size={10} className="shrink-0" />
    </Link>
  );
}

/**
 * The matcher's reasoning, as it recorded it.
 *
 * `rationale` is a list of deterministic feature names (D-003 — never LLM
 * prose), `margin` is top-1 minus top-2, and `match_method` is which path
 * produced the answer. All three are already on `LinkedEventResponse` and none
 * of them was rendered anywhere in the product before this.
 */
function Reasoning({ ev }: { ev: ExtractedEvent }) {
  if (ev.rationale.length === 0 && !ev.match_method) {
    return <span className="font-mono text-label text-muted italic">no signals recorded</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {ev.rationale.map((r) => (
          <span
            key={r}
            className="font-mono text-label bg-selected text-accent px-2 rounded-full"
            title="Feature the matcher recorded as firing for this event"
          >
            {r}
          </span>
        ))}
      </div>
      <div className="font-mono text-label text-muted">
        {ev.match_method}
        {ev.margin > 0 && (
          <>
            {' · margin '}
            <span className="text-fg">{ev.margin.toFixed(3)}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

type Status =
  | { kind: 'idle' }
  | { kind: 'rejected'; message: string }
  | { kind: 'uploading'; filename: string }
  | { kind: 'duplicate'; filename: string; jobId: string }
  | { kind: 'error'; detail: string }
  | { kind: 'done'; job: JobResponse; bytes: number };

export default function Ingest() {
  usePageHeader('Ingest', 'Load a daily progress report or a discipline spreadsheet.', '/ingest');
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.listJobs(50),
  });

  const upload = useCallback(
    async (file: File) => {
      const ext = extensionOf(file.name);
      if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
        setStatus({
          kind: 'rejected',
          message: `${file.name} is not an accepted file type. This screen accepts ${ACCEPTED_LABEL} only.`,
        });
        return;
      }

      setStatus({ kind: 'uploading', filename: file.name });
      try {
        const res = await api.ingestFile(file);

        // The server answers a duplicate with 200 and an explanatory message
        // rather than an error, returning the ORIGINAL job's id. That is the
        // signal: content already ingested, nothing written a second time.
        if (res.message.startsWith('Duplicate upload ignored')) {
          setStatus({ kind: 'duplicate', filename: file.name, jobId: res.job_id });
          return;
        }

        // Every trace number comes from here, not from the upload response.
        const job = await api.getJob(res.job_id);
        setStatus({ kind: 'done', job, bytes: file.size });
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['schedule'] });
        queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
      } catch (e) {
        setStatus({
          kind: 'error',
          detail: errorDetail(e),
        });
      }
    },
    [queryClient]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  const job = status.kind === 'done' ? status.job : null;

  const traceLines = useMemo<TraceLine[]>(() => {
    if (!job || status.kind !== 'done') return [];
    return [
      {
        label: 'PARSED',
        detail: (
          <>
            <span className="text-fg">{job.filename}</span> · {formatBytes(status.bytes)}
          </>
        ),
      },
      {
        label: 'EXTRACTED',
        detail: (
          <>
            <span className="text-fg">{job.event_count}</span> progress event
            {job.event_count === 1 ? '' : 's'}
          </>
        ),
      },
      {
        label: 'MATCHED',
        detail: (
          <>
            <span className="text-fg">{job.linked_count}</span> auto-linked ·{' '}
            <span className="text-fg">{job.review_count}</span> sent to review
          </>
        ),
      },
      {
        label: 'WRITTEN',
        detail: (
          <>
            <span className="text-fg">{job.activities_updated}</span> activit
            {job.activities_updated === 1 ? 'y' : 'ies'} updated ·{' '}
            <span className="text-fg">{job.audit_records_created}</span> audit record
            {job.audit_records_created === 1 ? '' : 's'}
          </>
        ),
      },
    ];
  }, [job, status]);

  const events = job?.events ?? [];
  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          (a.source_line ?? a.source_row ?? 0) - (b.source_line ?? b.source_row ?? 0)
      ),
    [events]
  );

  return (
    /* The shell's <main> already scrolls; this used to add a second one. */
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-5">
        {/* DROP ZONE */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          className={`border border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
            dragging ? 'border-accent bg-selected' : 'border-strong bg-raised hover:bg-selected'
          }`}
        >
          <Upload size={20} className={dragging ? 'text-accent' : 'text-muted'} />
          <div className="font-mono text-body text-fg">
            Drop a file here, or click to browse
          </div>
          <div className="font-mono text-label text-muted uppercase tracking-wider">
            Accepts {ACCEPTED_LABEL} only
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            className="rounded-sm hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = '';
            }}
          />
        </div>

        {/* STATES */}
        {status.kind === 'rejected' && (
          <ErrorState error={new Error(status.message)} />
        )}

        {status.kind === 'error' && <ErrorState error={new Error(status.detail)} />}

        {/* A duplicate is the guard working, not a failure — styled as
            information rather than as an error. */}
        {status.kind === 'duplicate' && (
          <div className="border border-hair bg-raised rounded-lg px-3 py-3 font-mono text-label flex items-start gap-2">
            <Info size={12} className="mt-0.5 shrink-0 text-accent" />
            <span className="text-muted">
              <span className="text-fg">This file has already been ingested.</span> Identical
              content was matched by hash against job{' '}
              <span className="text-fg">{status.jobId}</span>, so nothing was read a second
              time. This is what stops the same progress being counted twice and inflating
              the schedule.
            </span>
          </div>
        )}

        {status.kind === 'uploading' && (
          <div className="border border-hair bg-raised rounded-lg px-3 py-3 font-mono text-label text-muted flex items-center gap-2">
            <FileText size={12} className="shrink-0" />
            Reading {status.filename}…
          </div>
        )}

        {/* PIPELINE TRACE */}
        {job && <PipelineTrace lines={traceLines} />}

        {/* The one number on this screen that is a task rather than a fact.
            It was previously readable only as body text inside the MATCHED
            trace line, with no way to act on it. */}
        {job && job.review_count > 0 && (
          <div className="border border-hair bg-raised rounded-lg px-4 py-3 flex items-center justify-between gap-4">
            <span className="flex items-baseline gap-3 min-w-0">
              <span className="font-mono text-h2 text-warn leading-none">
                {job.review_count}
              </span>
              <span className="text-body text-muted">
                event{job.review_count === 1 ? '' : 's'} the matcher could not link
                on its own
              </span>
            </span>
            <Button variant="primary" size="sm" to="/reconcile">
              Reconcile
              <ArrowUpRight size={12} />
            </Button>
          </div>
        )}

        {/* Parsed but nothing extractable — a real outcome, worth naming. */}
        {job && job.event_count === 0 && (
          <div className="border border-hair bg-raised rounded-lg px-3 py-3 font-mono text-label flex items-start gap-2">
            <Info size={12} className="mt-0.5 shrink-0 text-warn" />
            <span className="text-muted">
              <span className="text-fg">No progress events were extracted.</span> The file
              parsed without error, but nothing in it matched a reportable progress
              statement. Nothing was written to the schedule.
            </span>
          </div>
        )}

        {/* EVENT TABLE */}
        {job && sortedEvents.length > 0 && (
          <section className="border border-hair bg-raised rounded-lg overflow-hidden">
            <PanelHeader
              title="Extracted events"
              right={
                <span className="font-mono text-label text-muted shrink-0">
                  {sortedEvents.length} from {job.filename}
                </span>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-hair">
                    {['Pos', 'Raw text', 'Extracted', 'Conf', 'Why', 'Outcome'].map((h) => (
                      <th
                        key={h}
                        className="text-left text-label font-medium uppercase tracking-[0.05em] text-heading px-3 py-3 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedEvents.map((ev) => (
                    <tr key={ev.id} className="border-b border-hair last:border-0 align-top even:bg-surface hover:bg-selected transition-colors">
                      <td className="px-3 py-3 font-mono text-label text-muted whitespace-nowrap">
                        {positionOf(ev)}
                      </td>
                      <td className="px-3 py-3 text-body text-fg min-w-[280px] max-w-[420px]">
                        {ev.raw_text}
                      </td>
                      <td className="px-3 py-3 min-w-[220px]">
                        <div className="flex flex-wrap items-center gap-2">
                          {isDiscipline(ev.discipline) ? (
                            <DisciplineTag discipline={ev.discipline} />
                          ) : (
                            <span className="font-mono text-label text-muted border border-hair px-2 rounded-full uppercase">
                              {ev.discipline || 'unknown'}
                            </span>
                          )}
                          {ev.tags.map((t) => (
                            <span
                              key={t}
                              className="font-mono text-label bg-selected text-accent px-2 rounded-full"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                        <div className="mt-1 font-mono text-label text-muted space-x-2">
                          {ev.asserted_start && (
                            <span>
                              start <span className="text-fg">{ev.asserted_start}</span>
                            </span>
                          )}
                          {ev.asserted_finish && (
                            <span>
                              finish <span className="text-fg">{ev.asserted_finish}</span>
                            </span>
                          )}
                          {ev.quantity !== null && (
                            <span>
                              qty{' '}
                              <span className="text-fg">
                                {ev.quantity}
                                {ev.uom ? ` ${ev.uom}` : ''}
                              </span>
                            </span>
                          )}
                          {!ev.asserted_start &&
                            !ev.asserted_finish &&
                            ev.quantity === null && <span className="italic">no date or quantity</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <ConfidenceBadge value={ev.confidence} />
                      </td>
                      {/* A confidence number with no reason beside it is not
                          auditable. This is the matcher's own record. */}
                      <td className="px-3 py-3 min-w-[200px]">
                        <Reasoning ev={ev} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <Outcome ev={ev} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* HISTORY */}
        <section className="border border-hair bg-raised rounded-lg overflow-hidden">
          <PanelHeader title="Previously ingested" />
          {historyError ? (
            <ErrorState error={historyError} mode="bare" className="px-3 py-4" />
          ) : historyLoading ? (
            <SkeletonRows rows={3} height="h-5" />
          ) : !history || history.length === 0 ? (
            <EmptyState>
              No files have been ingested yet. Drop a .txt or .xlsx above and it
              will appear here.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-hair">
                    {['File', 'Ingested', 'Events', 'Linked', 'Review', 'Status'].map((h) => (
                      <th
                        key={h}
                        className="text-left text-label font-medium uppercase tracking-[0.05em] text-heading px-3 py-3 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((j) => (
                    <tr key={j.id} className="border-b border-hair last:border-0 even:bg-surface hover:bg-selected transition-colors">
                      <td className="px-3 py-3 font-mono text-label text-fg whitespace-nowrap">
                        {j.filename}
                      </td>
                      <td className="px-3 py-3 font-mono text-label text-muted whitespace-nowrap">
                        {new Date(j.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 font-mono text-label text-fg">
                        {j.event_count}
                      </td>
                      <td className="px-3 py-3 font-mono text-label text-fg">
                        {j.linked_count}
                      </td>
                      <td className="px-3 py-3 font-mono text-label text-muted">
                        {j.review_count}
                      </td>
                      <td className="px-3 py-3 font-mono text-label whitespace-nowrap">
                        {j.status === 'completed' ? (
                          <span className="text-muted">{j.status}</span>
                        ) : (
                          <span className="text-danger">
                            {j.status}
                            {j.error_message ? ` — ${j.error_message}` : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
    </div>
  );
}
