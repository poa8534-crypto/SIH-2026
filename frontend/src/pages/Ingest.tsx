import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Check,
  Database,
  FileSpreadsheet,
  FileText,
  Info,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { api, errorDetail } from '../lib/api';
import { BaselineImportResponse, ExtractedEvent, JobResponse } from '../types';
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
 * INGEST — TWO-CHANNEL DATA PIPELINE
 *
 * Channel 1: Field Progress Reports (heterogeneous site progress: DPRs, spreadsheets, OCR)
 * Channel 2: Baseline Schedule Import (Primavera P6 XML/XER baseline import & dry-run validation)
 */

const FIELD_ACCEPTED_EXTENSIONS = ['.txt', '.xlsx', '.csv', '.pdf', '.png', '.jpg', '.jpeg'] as const;
const FIELD_ACCEPTED_LABEL = '.pdf, .xlsx, .csv, .txt, .png, .jpg';

const BASELINE_ACCEPTED_EXTENSIONS = ['.xml', '.xer', '.json'] as const;
const BASELINE_ACCEPTED_LABEL = '.xml (Primavera PMXML), .xer (Primavera XER), .json';

const TRACE_BEAT = 130;

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

function formatBytes(n: number): string {
  return `${n.toLocaleString()} bytes`;
}

function positionOf(ev: ExtractedEvent): string {
  if (ev.source_line !== null) return `L${ev.source_line}`;
  if (ev.source_row !== null) return `R${ev.source_row}`;
  return '—';
}

// ── Pipeline trace ──────────────────────────────────────────────────────────

type TraceLine = { label: string; detail: React.ReactNode };

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
    <Panel title="Pipeline Execution Trace">
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
              <span className="w-[84px] shrink-0 text-fg tracking-wider font-semibold">{line.label}</span>
              <span className="text-muted">{line.detail}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── Outcome ─────────────────────────────────────────────────────────────────

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

type FieldStatus =
  | { kind: 'idle' }
  | { kind: 'rejected'; message: string }
  | { kind: 'uploading'; filename: string }
  | { kind: 'duplicate'; filename: string; jobId: string }
  | { kind: 'error'; detail: string }
  | { kind: 'done'; job: JobResponse; bytes: number };

type BaselineStatus =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string }
  | { kind: 'error'; detail: string }
  | { kind: 'done'; response: BaselineImportResponse; isDryRun: boolean };

export default function Ingest() {
  usePageHeader(
    'Data Ingest',
    'Import field progress reports or Primavera P6 baseline schedules.',
    '/ingest'
  );

  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<'field' | 'baseline'>('field');

  // Field Progress Channel State
  const [status, setStatus] = useState<FieldStatus>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Baseline Schedule Channel State
  const [baselineStatus, setBaselineStatus] = useState<BaselineStatus>({ kind: 'idle' });
  const [baselineDragging, setBaselineDragging] = useState(false);
  const [baselineDryRun, setBaselineDryRun] = useState(true);
  const [baselineReplace, setBaselineReplace] = useState(false);
  const [baselineNote, setBaselineNote] = useState('');
  const baselineInputRef = useRef<HTMLInputElement>(null);

  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.listJobs(50),
  });

  const uploadFieldFile = useCallback(
    async (file: File) => {
      const ext = extensionOf(file.name);
      if (!(FIELD_ACCEPTED_EXTENSIONS as readonly string[]).includes(ext as any)) {
        setStatus({
          kind: 'rejected',
          message: `${file.name} is not an accepted file type. This channel accepts ${FIELD_ACCEPTED_LABEL} only.`,
        });
        return;
      }

      setStatus({ kind: 'uploading', filename: file.name });
      try {
        const res = await api.ingestFile(file);

        if (res.message.startsWith('Duplicate upload ignored')) {
          setStatus({ kind: 'duplicate', filename: file.name, jobId: res.job_id });
          return;
        }

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

  const uploadBaselineFile = useCallback(
    async (file: File) => {
      const ext = extensionOf(file.name);
      if (!(BASELINE_ACCEPTED_EXTENSIONS as readonly string[]).includes(ext as any)) {
        setBaselineStatus({
          kind: 'error',
          detail: `${file.name} is not an accepted baseline format. Accepts ${BASELINE_ACCEPTED_LABEL} only.`,
        });
        return;
      }

      setBaselineStatus({ kind: 'uploading', filename: file.name });
      try {
        const res = await api.importSchedule(file, {
          dry_run: baselineDryRun,
          replace: baselineReplace,
          note: baselineNote.trim() || undefined,
        });

        setBaselineStatus({
          kind: 'done',
          response: res,
          isDryRun: baselineDryRun,
        });

        if (!baselineDryRun) {
          queryClient.invalidateQueries({ queryKey: ['schedule'] });
          queryClient.invalidateQueries({ queryKey: ['auditRecent'] });
        }
      } catch (e) {
        setBaselineStatus({
          kind: 'error',
          detail: errorDetail(e),
        });
      }
    },
    [baselineDryRun, baselineReplace, baselineNote, queryClient]
  );

  const onFieldDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFieldFile(file);
  };

  const onBaselineDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setBaselineDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadBaselineFile(file);
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
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-5 pb-8">
      {/* CHANNEL SELECTOR TABS */}
      <div className="border border-hair bg-raised rounded-lg p-1.5 flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => setChannel('field')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md font-mono text-label transition-colors ${
            channel === 'field'
              ? 'bg-selected text-heading font-semibold shadow-xs border border-hair'
              : 'text-muted hover:text-fg'
          }`}
        >
          <FileSpreadsheet size={15} />
          <span>Channel 1: Field Progress Reports</span>
        </button>
        <button
          type="button"
          onClick={() => setChannel('baseline')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md font-mono text-label transition-colors ${
            channel === 'baseline'
              ? 'bg-selected text-heading font-semibold shadow-xs border border-hair'
              : 'text-muted hover:text-fg'
          }`}
        >
          <Database size={15} />
          <span>Channel 2: Baseline Schedule Import (P6 XML / XER)</span>
        </button>
      </div>

      {channel === 'field' ? (
        <>
          {/* CHANNEL 1: FIELD PROGRESS REPORTS */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onFieldDrop}
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
            <Upload size={22} className={dragging ? 'text-accent' : 'text-muted'} />
            <div className="font-mono text-body text-fg">
              Drop field report here, or click to browse
            </div>
            <div className="font-mono text-label text-muted uppercase tracking-wider">
              Accepts {FIELD_ACCEPTED_LABEL}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={FIELD_ACCEPTED_EXTENSIONS.join(',')}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFieldFile(file);
                e.target.value = '';
              }}
            />
          </div>

          {/* FIELD STATES */}
          {status.kind === 'rejected' && (
            <ErrorState error={new Error(status.message)} />
          )}

          {status.kind === 'error' && <ErrorState error={new Error(status.detail)} />}

          {status.kind === 'duplicate' && (
            <div className="border border-hair bg-raised rounded-lg px-4 py-3 font-mono text-label flex items-start gap-2">
              <Info size={14} className="mt-0.5 shrink-0 text-accent" />
              <span className="text-muted leading-relaxed">
                <strong className="text-fg">Deduplication Safeguard:</strong> This file has already
                been ingested. Content was matched by cryptographic hash against job{' '}
                <span className="text-fg font-semibold">{status.jobId}</span>. Re-reading was suppressed
                to prevent double-counting progress and distorting the baseline schedule.
              </span>
            </div>
          )}

          {status.kind === 'uploading' && (
            <div className="border border-hair bg-raised rounded-lg px-4 py-3 font-mono text-label text-muted flex items-center gap-2">
              <FileText size={14} className="shrink-0 animate-pulse text-accent" />
              Reading &amp; extracting progress from {status.filename}…
            </div>
          )}

          {/* PIPELINE TRACE */}
          {job && <PipelineTrace lines={traceLines} />}

          {/* REVIEW BANNER */}
          {job && job.review_count > 0 && (
            <div className="border border-hair bg-raised rounded-lg px-4 py-3 flex items-center justify-between gap-4">
              <span className="flex items-baseline gap-3 min-w-0">
                <span className="font-mono text-h2 text-warn leading-none">
                  {job.review_count}
                </span>
                <span className="text-body text-muted">
                  event{job.review_count === 1 ? '' : 's'} require human planner decision
                </span>
              </span>
              <Button variant="primary" size="sm" to="/reconcile">
                Reconcile
                <ArrowUpRight size={12} />
              </Button>
            </div>
          )}

          {job && job.event_count === 0 && (
            <div className="border border-hair bg-raised rounded-lg px-4 py-3 font-mono text-label flex items-start gap-2">
              <Info size={14} className="mt-0.5 shrink-0 text-warn" />
              <span className="text-muted">
                <span className="text-fg font-medium">No progress events extracted:</span> File parsed
                successfully, but contained no recognized construction progress statements. Schedule
                baseline untouched.
              </span>
            </div>
          )}

          {/* EXTRACTED EVENTS TABLE */}
          {job && sortedEvents.length > 0 && (
            <section className="border border-hair bg-raised rounded-lg overflow-hidden">
              <PanelHeader
                title="Extracted progress events"
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
                      {['Pos', 'Raw text', 'Extracted metadata', 'Confidence', 'Matcher Rationale', 'Outcome'].map((h) => (
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

          {/* HISTORY TABLE */}
          <section className="border border-hair bg-raised rounded-lg overflow-hidden">
            <PanelHeader title="Previously ingested field files" />
            {historyError ? (
              <ErrorState error={historyError} mode="bare" className="px-3 py-4" />
            ) : historyLoading ? (
              <SkeletonRows rows={3} height="h-5" />
            ) : !history || history.length === 0 ? (
              <EmptyState>
                No files have been ingested yet. Drop a .txt, .pdf, or .xlsx above to start.
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
                            <span className="text-ok font-mono">{j.status}</span>
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
        </>
      ) : (
        <>
          {/* CHANNEL 2: BASELINE SCHEDULE IMPORT */}
          <div className="border border-hair bg-raised rounded-lg p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Database size={20} className="text-accent shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-heading text-body">
                  Primavera P6 Baseline Schedule Importer
                </h3>
                <p className="text-label text-muted leading-relaxed mt-0.5">
                  Import a full schedule baseline from Oracle Primavera P6 (PMXML or XER format) or NAVIS JSON.
                  A dry run validates network topology, WBS levels, and activity counts without touching the database.
                </p>
              </div>
            </div>

            {/* Import Controls */}
            <div className="p-4 bg-surface border border-hair rounded-lg flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-5">
                <label className="flex items-center gap-2 cursor-pointer font-mono text-label text-fg">
                  <input
                    type="checkbox"
                    checked={baselineDryRun}
                    onChange={(e) => setBaselineDryRun(e.target.checked)}
                    className="rounded-sm accent-accent"
                  />
                  <span>Validate only (Dry Run — writes nothing)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-mono text-label text-fg">
                  <input
                    type="checkbox"
                    checked={baselineReplace}
                    onChange={(e) => setBaselineReplace(e.target.checked)}
                    className="rounded-sm accent-danger"
                  />
                  <span className={baselineReplace ? 'text-danger font-semibold' : ''}>
                    Allow replacing active baseline (Explicit consent)
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-label text-muted">Revision Note:</span>
                <input
                  type="text"
                  placeholder="e.g. Primavera P6 rev 2.1 — March update"
                  value={baselineNote}
                  onChange={(e) => setBaselineNote(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-raised border border-hair rounded font-mono text-label text-fg placeholder:text-muted focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* Baseline Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setBaselineDragging(true);
              }}
              onDragLeave={() => setBaselineDragging(false)}
              onDrop={onBaselineDrop}
              onClick={() => baselineInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') baselineInputRef.current?.click();
              }}
              className={`border border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
                baselineDragging ? 'border-accent bg-selected' : 'border-strong bg-raised hover:bg-selected'
              }`}
            >
              <Upload size={22} className={baselineDragging ? 'text-accent' : 'text-muted'} />
              <div className="font-mono text-body text-fg">
                Drop Primavera .xml, .xer, or .json baseline file here
              </div>
              <div className="font-mono text-label text-muted uppercase tracking-wider">
                Accepts {BASELINE_ACCEPTED_LABEL}
              </div>
              <input
                ref={baselineInputRef}
                type="file"
                accept={BASELINE_ACCEPTED_EXTENSIONS.join(',')}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadBaselineFile(file);
                  e.target.value = '';
                }}
              />
            </div>

            {/* Baseline Status Feedback */}
            {baselineStatus.kind === 'uploading' && (
              <div className="border border-hair bg-raised rounded-lg px-4 py-3 font-mono text-label text-muted flex items-center gap-2">
                <Database size={14} className="shrink-0 animate-pulse text-accent" />
                Parsing and validating baseline: {baselineStatus.filename}…
              </div>
            )}

            {baselineStatus.kind === 'error' && (
              <ErrorState error={new Error(baselineStatus.detail)} />
            )}

            {baselineStatus.kind === 'done' && (
              <div className="border border-hair bg-raised rounded-lg p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {baselineStatus.isDryRun ? (
                      <ShieldCheck size={18} className="text-accent" />
                    ) : (
                      <Check size={18} className="text-ok" />
                    )}
                    <span className="font-semibold text-heading text-body">
                      {baselineStatus.isDryRun
                        ? 'Dry Run Validation Completed'
                        : 'Baseline Successfully Committed'}
                    </span>
                  </div>
                  <span className="font-mono text-label px-2 py-0.5 bg-selected rounded border border-hair text-muted">
                    {baselineStatus.isDryRun ? 'Dry Run Mode' : 'Committed Revision'}
                  </span>
                </div>

                <p className="font-mono text-body text-fg leading-relaxed">
                  {baselineStatus.response.message}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-label mt-2">
                  <div className="p-3 bg-surface border border-hair rounded">
                    <span className="text-muted block mb-1">ACTIVITIES IN FILE</span>
                    <span className="text-h2 font-semibold text-fg">
                      {baselineStatus.response.activities_in_file}
                    </span>
                  </div>
                  <div className="p-3 bg-surface border border-hair rounded">
                    <span className="text-muted block mb-1">NEW ACTIVITIES</span>
                    <span className="text-h2 font-semibold text-ok">
                      {baselineStatus.response.activities_created}
                    </span>
                  </div>
                  <div className="p-3 bg-surface border border-hair rounded">
                    <span className="text-muted block mb-1">ACTIVITIES UPDATED</span>
                    <span className="text-h2 font-semibold text-fg">
                      {baselineStatus.response.activities_updated}
                    </span>
                  </div>
                  <div className="p-3 bg-surface border border-hair rounded">
                    <span className="text-muted block mb-1">BASELINE REPLACED</span>
                    <span className="text-h2 font-semibold text-fg">
                      {baselineStatus.response.replaced ? 'YES' : 'NO'}
                    </span>
                  </div>
                </div>

                {baselineStatus.response.baseline && (
                  <div className="p-3 bg-surface border border-hair rounded font-mono text-label text-muted flex flex-col gap-1 mt-1">
                    <div>
                      <span className="text-muted">Revision: </span>
                      <span className="text-fg font-semibold">{baselineStatus.response.baseline.name}</span>
                      <span className="text-muted"> ({baselineStatus.response.baseline.filename})</span>
                    </div>
                    <div>
                      <span className="text-muted">SHA-256: </span>
                      <span className="text-fg">{baselineStatus.response.baseline.sha256}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 mt-2">
                  <Button variant="secondary" size="sm" to="/schedule">
                    View Baseline on Schedule
                    <ArrowUpRight size={12} />
                  </Button>
                </div>
              </div>
            )}

            {/* Baseline Policy Note */}
            <div className="p-3.5 bg-surface/50 border border-hair rounded-lg text-label font-mono text-muted leading-relaxed">
              <span className="text-fg font-semibold">Safe Baseline Policy:</span> Activities
              absent from the new file are left in place to preserve historic actuals and
              audit trails. Replacing updates planned dates, but never modifies verified actual dates or quantities.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
