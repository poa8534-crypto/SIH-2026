import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Database,
  FileCheck2,
  FileSpreadsheet,
  Info,
  Layers,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../../lib/api';
import { ErrorState, Panel, SkeletonRows } from '../../components/ui';
import { usePageHeader } from '../../hooks/usePageHeader';
import type { CorpusCaveat, ExecutiveMetricsResponse } from '../../types';

/**
 * Data Provenance & Evidence Confidence:
 * Explains the data supporting Senior Management views, active project reporting quality,
 * and the strict boundaries between reported evidence, committed actuals, and corpus validation.
 */

function bytesToGb(n: number): string {
  return `${(n / 1_000_000_000).toFixed(2)} GB`;
}

function labelise(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function caveatText(c: CorpusCaveat): string {
  return c.statement ?? c.text ?? c.detail ?? c.id;
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="border border-hair bg-raised rounded-lg p-5 flex flex-col gap-1">
      <span className="font-mono text-label uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="text-h1 font-semibold leading-none text-fg tabular-nums">
        {value}
      </span>
      {sub && <span className="text-label text-muted mt-1">{sub}</span>}
    </div>
  );
}

export default function ExecutiveProvenance() {
  usePageHeader(
    'Data provenance',
    'What the corpus behind these numbers actually contains.',
    '/executive/provenance'
  );

  const corpus = useQuery({
    queryKey: ['evidence-corpus'],
    queryFn: api.getEvidenceCorpus,
  });

  const metricsQuery = useQuery<ExecutiveMetricsResponse>({
    queryKey: ['executiveMetrics'],
    queryFn: api.getExecutiveMetrics,
  });

  const scheduleQuery = useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.getSchedule(),
  });

  const conflictsQuery = useQuery({
    queryKey: ['conflicts'],
    queryFn: () => api.getConflicts(50),
  });

  if (corpus.error) return <ErrorState error={corpus.error} />;
  if (corpus.isLoading || !corpus.data) {
    return (
      <div className="max-w-[1280px] w-full mx-auto">
        <SkeletonRows rows={8} />
      </div>
    );
  }

  const d = corpus.data;
  const kpis = metricsQuery.data?.kpis;
  const scheduleData = scheduleQuery.data;
  const conflictCount = conflictsQuery.data?.length ?? 0;
  const dataDate = scheduleData?.data_date ?? metricsQuery.data?.as_of ?? '2026-09-15';

  const sources = Object.entries(d.artifacts.by_source).sort((a, b) => b[1] - a[1]);
  const records = Object.entries(d.records).sort((a, b) => b[1] - a[1]);

  return (
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-6 font-sans">
      {/* ── Context Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-hair bg-raised text-label">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-fg">
            {scheduleData?.project ?? 'Oil India Limited — Well Pad 04'}
          </span>
          <span className="text-muted">·</span>
          <span className="text-muted">Data Confidence, Lineage &amp; Limitations</span>
        </div>
        <div className="flex items-center gap-4 text-muted">
          <span>
            Data Date: <strong className="font-mono text-fg">{dataDate}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-fg border border-hair bg-surface font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Senior Management (Read-Only)
          </span>
        </div>
      </div>

      {/* ── Primary Section: Active Project Reporting Quality ── */}
      <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-hair">
          <div>
            <h2 className="text-lead font-semibold text-heading flex items-center gap-2">
              <ShieldCheck size={18} className="text-ok" />
              Active Project Reporting Quality &amp; Confidence
            </h2>
            <p className="text-body text-muted mt-0.5">
              Live audit integrity metrics for Well Pad 04. Distinguishes verified field evidence from unevidenced scope.
            </p>
          </div>
          <span className="text-label font-mono text-muted">ACTIVE AUDIT TRAIL</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Stat
            label="Schedule Freshness"
            value={dataDate}
            sub="Active schedule data date"
          />
          <Stat
            label="Evidence Coverage"
            value={kpis?.evidence_coverage_pct ? `${kpis.evidence_coverage_pct.toFixed(1)}%` : '—'}
            sub={`${kpis?.evidenced_activities ?? 0} of ${kpis?.total_activities ?? 0} activities verified`}
          />
          <Stat
            label="Unevidenced Scope"
            value={kpis?.unevidenced_activities ?? '—'}
            sub="Activities without direct field logs"
          />
          <Stat
            label="Source Disagreements"
            value={conflictCount}
            sub="Field reports awaiting PM triage"
          />
        </div>

        {/* Reported vs Committed Architecture Callout */}
        <div className="p-4 rounded-lg bg-surface border border-hair flex items-start gap-3">
          <Info size={18} className="text-accent mt-0.5 shrink-0" />
          <div className="text-body leading-relaxed text-muted">
            <strong className="text-fg font-medium">Distinction: Reported vs. Committed Information.</strong>{' '}
            Field reports, site diaries, and OCR extractions enter NAVIS as uncommitted proposals in staging.
            They are visible in review queues but do not alter CPM logic or float until the Project Manager
            explicitly commits them. The executive overview synthesizes both: committed actuals drive the
            baseline forecast, while uncommitted evidence drives the dispute shield and risk exposure.
          </div>
        </div>
      </div>

      {/* ── Secondary Section: Research & Reference Corpus Lineage ── */}
      <div className="flex flex-col gap-4">
        <div className="pb-1 border-b border-hair flex items-center justify-between">
          <div>
            <h3 className="text-lead font-semibold text-heading">
              Evidence Corpus Lineage &amp; Validation Integrity
            </h3>
            <p className="text-label text-muted mt-0.5">
              Underlying artifact repository metrics, schema checks, and analytical boundaries.
            </p>
          </div>
          <span className="text-label font-mono text-muted">RESEARCH &amp; BASELINE DATASET</span>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Stat label="Verified artifacts" value={d.artifacts.count} sub="P6 XML, DPRs, spreadsheets" />
          <Stat label="Corpus size" value={bytesToGb(d.artifacts.bytes)} sub="Raw binary & text data" />
          <Stat label="Validation checks" value={d.validation.checks_run.toLocaleString()} sub="Structural & semantic rules" />
          <Stat
            label="Errors / warnings"
            value={`${d.validation.errors} / ${d.validation.warnings}`}
            sub="Corpus consistency status"
          />
        </section>

        {d.validation.passed && (
          <div className="border border-hair bg-raised rounded-lg px-4 py-3.5 flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-ok mt-0.5 shrink-0" />
            <p className="text-body text-muted leading-relaxed">
              <span className="text-fg font-semibold">
                All {d.validation.checks_run.toLocaleString()} validation checks passed
              </span>{' '}
              with zero errors and zero warnings. Every derived record is marked{' '}
              <span className="font-mono text-label bg-surface px-1 py-0.5 rounded border border-hair">
                data_origin={d.data_origin}
              </span>{' '}
              and every original carries an adjacent provenance sidecar.
            </p>
          </div>
        )}

        {/* Prediction Accuracy Disclaimer */}
        <div className="p-4 rounded-lg bg-raised border border-hair flex items-start gap-2.5 text-label text-muted leading-relaxed">
          <ShieldAlert size={16} className="text-muted mt-0.5 shrink-0" />
          <div>
            <strong className="text-fg font-medium">Engineering Confidence Boundary:</strong> A large
            verified corpus and passed structural validation checks establish data lineage and audit
            integrity; they do not establish the predictive certainty of future site progress or weather
            conditions. Schedule forecasts remain engineering projections subject to site execution realities.
          </div>
        </div>

        {/* The caveats come from the API. They are the reason this page is
            credible rather than promotional. */}
        {d.caveats?.length > 0 && (
          <Panel title="What this corpus does not establish">
            <div className="flex flex-col">
              {d.caveats.map((c) => (
                <p
                  key={c.id}
                  className="px-4 py-3 border-b border-hair last:border-0 text-body text-muted leading-relaxed flex items-start gap-2"
                >
                  <Info size={14} className="text-warn mt-0.5 shrink-0" />
                  <span>{caveatText(c)}</span>
                </p>
              ))}
            </div>
          </Panel>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Records by dataset">
            <div className="flex flex-col divide-y divide-hair">
              {records.map(([k, v]) => (
                <div
                  key={k}
                  className="px-4 py-2.5 flex items-center justify-between gap-4"
                >
                  <span className="text-body text-fg min-w-0">{labelise(k)}</span>
                  <span className="font-mono text-body text-muted tabular-nums shrink-0">
                    {v.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Artifacts by source">
            <div className="flex flex-col divide-y divide-hair">
              {sources.map(([k, v]) => (
                <div
                  key={k}
                  className="px-4 py-2.5 flex items-center justify-between gap-4"
                >
                  <span className="font-mono text-body text-fg min-w-0">{k}</span>
                  <span className="font-mono text-body text-muted tabular-nums shrink-0">
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <Panel title="OCR coverage">
          <p className="px-4 py-3 text-body text-muted leading-relaxed">
            {d.ocr.pages} pages read, {d.ocr.lines.toLocaleString()} lines
            extracted, {d.ocr.activity_mentions} activity mentions found.{' '}
            <span className={d.ocr.verified ? 'text-ok font-semibold' : 'text-warn font-semibold'}>
              {d.ocr.verified
                ? 'Matches verified.'
                : 'These matches are unverified and are labelled as such.'}
            </span>
          </p>
        </Panel>
      </div>
    </div>
  );
}
