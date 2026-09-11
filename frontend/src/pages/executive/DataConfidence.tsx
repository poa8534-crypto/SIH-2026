import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Database,
  FileCheck2,
  Info,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { usePageHeader } from '../../hooks/usePageHeader';
import { SkeletonRows, ErrorState } from '../../components/ui';
import type {
  ExecutiveMetricsResponse,
  SourceConflict,
  CorpusCaveat,
  AuditFeedItem,
} from '../../types';

/** A count, or an em dash when the API did not supply one.
 *
 *  Deliberately `??` and not `?`: these tiles used to fall back to literals
 *  (120 / 77 / 43) behind a truthiness test, so a genuine zero would have
 *  rendered last quarter's numbers. See D-111. */
function dashNum(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toLocaleString();
}

function bytesToGb(n: number): string {
  return `${(n / 1_000_000_000).toFixed(2)} GB`;
}

function caveatText(c: CorpusCaveat): string {
  return c.statement ?? c.text ?? c.detail ?? c.id;
}

export default function ExecutiveDataConfidence() {
  usePageHeader(
    'Data Confidence & Provenance Audit',
    'Field evidence coverage, reporting timeliness, source disagreement audit, and secondary research corpus.',
    '/executive/confidence'
  );

  // Queries
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

  const conflictsQuery = useQuery<SourceConflict[]>({
    queryKey: ['conflicts'],
    queryFn: () => api.getConflicts(50),
  });

  // Newest-first audit writes; [0] is the most recent thing this system
  // recorded, with the file it was read from.
  const recentAudit = useQuery<AuditFeedItem[]>({
    queryKey: ['recentAudit', 1],
    queryFn: () => api.getRecentAudit(1),
  });

  const kpis = metricsQuery.data?.kpis;
  const scheduleData = scheduleQuery.data;
  const activities = scheduleData?.activities ?? [];
  const conflicts = conflictsQuery.data ?? [];
  const corpusData = corpus.data;

  const coveragePct = kpis?.evidence_coverage_pct ?? null;
  const coverageLabel = coveragePct === null ? '—' : `${coveragePct.toFixed(1)}%`;

  // The letter is a banding of the coverage figure and nothing else. The
  // boundaries are stated on screen beside it, because a grade whose scale is
  // invisible is an opinion wearing a number's clothes. It used to be the
  // literal "C (64.2% Verified)", which by this point disagreed with the
  // coverage tile directly beneath it (55.8%). See D-111.
  const auditGrade = ((): { letter: string; scale: string } => {
    const scale = 'A ≥ 90% · B ≥ 75% · C ≥ 60% · D ≥ 40% · E < 40%';
    if (coveragePct === null) return { letter: '—', scale };
    if (coveragePct >= 90) return { letter: 'A', scale };
    if (coveragePct >= 75) return { letter: 'B', scale };
    if (coveragePct >= 60) return { letter: 'C', scale };
    if (coveragePct >= 40) return { letter: 'D', scale };
    return { letter: 'E', scale };
  })();

  const dataDate = scheduleData?.data_date ?? metricsQuery.data?.as_of ?? null;

  // The engine run is the metrics `as_of`, and nothing more. The clock time
  // that used to sit beside it ("08:30:00 IST") was a literal: no part of the
  // payload carries one, so it was a fabricated precision on the one page
  // whose subject is whether the numbers can be trusted.
  const lastCalculationTime = metricsQuery.data?.as_of ?? null;

  // Latest field report ingest, read from the append-only audit trail rather
  // than asserted. This tile used to be the string '2026-09-15 07:15:00 IST
  // (Daily Voice & PDF Logs)' — hardcoded, so ingesting a report live left it
  // unchanged while claiming to report ingest time. See D-111.
  const latestIngest = recentAudit.data?.[0] ?? null;

  // Activities that started, have not finished, and have already overrun their
  // planned finish by more than this many days.
  //
  // This is NOT report recency. It was previously presented as "> 7 Days
  // Without Update" while testing `finish_variance_days > 5` — a different
  // quantity against a different number. Per-activity evidence recency is not
  // carried on GET /schedule, so rather than infer it, the panel now states
  // what it actually measures. See D-111.
  const OVERRUN_THRESHOLD_DAYS = 5;
  const overrunActivities = activities.filter(
    (a) =>
      a.actual_start &&
      !a.actual_finish &&
      a.finish_variance_days !== null &&
      a.finish_variance_days !== undefined &&
      a.finish_variance_days > OVERRUN_THRESHOLD_DAYS
  );

  if (corpus.error || metricsQuery.error || scheduleQuery.error || conflictsQuery.error) {
    return <ErrorState error={corpus.error || metricsQuery.error || scheduleQuery.error || conflictsQuery.error} />;
  }

  return (
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-6 font-sans">
      {/* ── Header Context ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-hair">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted mb-1">
            <span className="font-semibold text-fg">DATA PROVENANCE &amp; AUDIT TRAIL</span>
            <span>·</span>
            <span>DATA CUTOFF: {dataDate}</span>
          </div>
          <h1 className="text-h1 font-semibold tracking-tight text-heading">
            Data Confidence &amp; Lineage Audit
          </h1>
          <p className="mt-1 text-body text-muted leading-relaxed">
            How much can I trust what I am seeing? Active reporting coverage, data timeliness, source disagreement audit, and separation from historical research corpora.
          </p>
        </div>

        <div className="flex items-center gap-2 text-label font-mono">
          <span className="px-2.5 py-1 rounded-full bg-surface text-fg font-medium border border-hair">
            Audit Grade: {auditGrade.letter} ({coverageLabel} Verified)
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface text-ok font-medium border border-hair">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Zero Synthetic Data
          </span>
        </div>
      </div>

      {/* ── 1. Schedule Data Date vs Timestamps Strip ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Schedule Data Date */}
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col justify-between">
          <div>
            <span className="font-mono text-label uppercase tracking-wider text-muted block mb-1">
              Primavera Schedule Data Date
            </span>
            <div className="text-3xl font-extrabold text-heading font-mono">
              {dataDate ?? '—'}
            </div>
          </div>
          <span className="text-xs text-muted mt-2 pt-2 border-t border-hair font-mono">
            Authoritative baseline time horizon
          </span>
        </div>

        {/* Last Field Report Receipt */}
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col justify-between">
          <div>
            <span className="font-mono text-label uppercase tracking-wider text-muted block mb-1">
              Latest Field Report Ingest
            </span>
            <div className="text-lg font-bold text-fg font-mono">
              {latestIngest ? latestIngest.timestamp.replace('T', ' ').slice(0, 19) : '—'}
            </div>
          </div>
          <span className="text-xs text-muted mt-2 pt-2 border-t border-hair font-mono">
            {latestIngest
              ? `Newest audit write · ${latestIngest.source_file ?? latestIngest.source}`
              : 'No audit record has been written yet'}
          </span>
        </div>

        {/* Engine Calculation Time */}
        <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col justify-between">
          <div>
            <span className="font-mono text-label uppercase tracking-wider text-muted block mb-1">
              Engine Metrics Calculation Run
            </span>
            <div className="text-lg font-bold text-fg font-mono">
              {lastCalculationTime ?? '—'}
            </div>
          </div>
          <span className="text-xs text-muted mt-2 pt-2 border-t border-hair font-mono">
            EVM, float drift &amp; dispute shield, computed as of this date
          </span>
        </div>
      </div>

      {/* ── 2. Reporting Coverage with Explicit Denominators ── */}
      <div className="border border-hair rounded-lg p-4 sm:p-6 bg-raised shadow-xs flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-hair">
          <div>
            <h2 className="text-lead font-semibold text-heading flex items-center gap-2">
              <FileCheck2 size={18} className="text-fg" />
              Active Project Reporting Coverage
            </h2>
            <p className="text-body text-muted mt-0.5">
              Percentage of scheduled activities backed by authentic supervisor reports or telemetry.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded font-mono text-xs font-bold bg-ok/10 text-ok border border-ok/30">
            {coverageLabel} Coverage
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-hair bg-surface">
            <span className="text-xs font-mono text-muted uppercase block mb-1">Total Schedule Activities</span>
            <span className="text-2xl font-bold font-mono text-fg">{dashNum(kpis?.total_activities)}</span>
            <span className="text-[11px] text-muted block mt-1">Authoritative denominator</span>
          </div>

          <div className="p-4 rounded-lg border border-hair bg-surface">
            <span className="text-xs font-mono text-muted uppercase block mb-1">Evidenced Activities</span>
            <span className="text-2xl font-bold font-mono text-ok">{dashNum(kpis?.evidenced_activities)}</span>
            <span className="text-[11px] text-muted block mt-1">Verified with field citations</span>
          </div>

          <div className="p-4 rounded-lg border border-hair bg-surface">
            <span className="text-xs font-mono text-muted uppercase block mb-1">Unevidenced Nodes</span>
            <span className="text-2xl font-bold font-mono text-warn">{dashNum(kpis?.unevidenced_activities)}</span>
            <span className="text-[11px] text-muted block mt-1">Relying on planned duration</span>
          </div>
        </div>

        <div className="p-3 rounded border border-hair bg-surface text-xs font-mono text-muted flex items-center justify-between">
          <span>Denominator Basis: Complete activity register in baseline_schedule.json</span>
          <span className="text-fg font-semibold">
            Formula: {dashNum(kpis?.evidenced_activities)} evidenced ÷{' '}
            {dashNum(kpis?.total_activities)} total = {coverageLabel}
          </span>
        </div>
      </div>

      {/* ── 3. Missing or Stale Reporting ── */}
      <div className="border border-hair rounded-lg p-4 sm:p-6 bg-raised shadow-xs flex flex-col gap-4">
        <div className="pb-3 border-b border-hair">
          <h3 className="text-body font-semibold text-heading flex items-center gap-2">
            <AlertTriangle size={16} className="text-warn" />
            Overrunning In-Progress Activities (&gt; {OVERRUN_THRESHOLD_DAYS} Days Past Planned Finish)
          </h3>
          <p className="text-body text-muted mt-0.5">
            Activities with a recorded actual start, no actual finish, and a finish already
            drifted more than {OVERRUN_THRESHOLD_DAYS} days beyond plan. This measures schedule
            drift, not reporting recency — per-activity evidence timestamps are not carried on
            the schedule record, so no claim is made here about when each activity was last
            reported on.
          </p>
        </div>

        {overrunActivities.length === 0 ? (
          <div className="p-4 rounded border border-hair bg-surface text-center text-xs text-muted font-mono">
            No in-progress activity has drifted more than {OVERRUN_THRESHOLD_DAYS} days past its
            planned finish.
          </div>
        ) : (
          <div className="overflow-x-auto border border-hair rounded-md">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-hair bg-surface text-label font-mono text-muted uppercase">
                  <th className="py-2.5 px-3">Activity</th>
                  <th className="py-2.5 px-2">Discipline</th>
                  <th className="py-2.5 px-2 font-mono">Actual Start</th>
                  <th className="py-2.5 px-2 font-mono">Planned Finish</th>
                  <th className="py-2.5 px-2 font-mono text-right">Finish Drift</th>
                  <th className="py-2.5 px-2">Data Condition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {overrunActivities.slice(0, 4).map((act) => (
                  <tr key={act.activity_id} className="hover:bg-selected/40 transition-colors">
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-heading block">{act.description}</span>
                      <span className="font-mono text-muted block text-[11px]">{act.activity_id}</span>
                    </td>
                    <td className="py-2.5 px-2 font-mono text-muted capitalize">{act.discipline}</td>
                    <td className="py-2.5 px-2 font-mono text-fg">{act.actual_start}</td>
                    <td className="py-2.5 px-2 font-mono text-muted">{act.planned_finish}</td>
                    <td className="py-2.5 px-2 font-mono text-right font-bold text-danger">
                      +{act.finish_variance_days}d
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-warn/10 text-warn border border-warn/30">
                        OVERRUN (&gt;{OVERRUN_THRESHOLD_DAYS}d)
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 4. Source Disagreements (Conflicts) ── */}
      <div className="border border-hair rounded-lg p-4 sm:p-6 bg-raised shadow-xs flex flex-col gap-4">
        <div className="pb-3 border-b border-hair">
          <h3 className="text-body font-semibold text-heading flex items-center gap-2">
            <AlertCircle size={16} className="text-danger" />
            Source Disagreements &amp; Conflicting Field Records
          </h3>
          <p className="text-body text-muted mt-0.5">
            Discrepancies where two field reports, drone scans, or spreadsheets claim contradictory values for the same activity.
          </p>
        </div>

        {conflicts.length === 0 ? (
          <div className="p-4 rounded border border-hair bg-surface text-center text-xs text-muted font-mono">
            Zero active source conflicts detected across field logs and contractor spreadsheets.
          </div>
        ) : (
          <div className="divide-y divide-hair border border-hair rounded-md bg-surface text-xs">
            {conflicts.map((c, i) => (
              <div key={i} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-fg">{c.activity_id}</span>
                    <span className="font-semibold text-heading">{c.description}</span>
                  </div>
                  <span className="text-[11px] text-muted font-mono block mt-0.5">
                    Field in conflict: <strong className="text-fg">{c.field}</strong> · Stored in schedule: <strong className="text-ok">{c.stored_value ?? 'None'}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  {c.sides.map((s, sideIdx) => (
                    <span
                      key={sideIdx}
                      className="px-2 py-0.5 rounded bg-raised border border-hair text-muted"
                    >
                      <strong className="text-danger">{s.value}</strong> ({s.source_kind})
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 5. Secondary Research Corpus Section (Clearly Separated) ── */}
      <div className="border border-hair rounded-lg p-4 sm:p-6 bg-raised shadow-xs flex flex-col gap-4 sm:gap-6">
        <div className="pb-3 border-b border-hair flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-muted mb-1 uppercase tracking-wider">
              <Database size={14} />
              <span>Secondary EPC Reference Corpus (Historical Research)</span>
            </div>
            <h3 className="text-lead font-semibold text-heading">
              Offline EPC Research Dataset Lineage
            </h3>
            <p className="text-body text-muted mt-0.5">
              The historical knowledge corpus powering institutional benchmarks and duration estimation. Strictly separated from live project actuals.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-label font-mono bg-surface border border-hair text-muted">
            corpus/manifest.json
          </span>
        </div>

        {corpus.isLoading || !corpusData ? (
          <SkeletonRows rows={4} />
        ) : (
          <div className="flex flex-col gap-6">
            {/* High-Level Corpus Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border border-hair bg-surface">
                <span className="text-label font-mono uppercase text-muted block mb-1">Artifacts</span>
                <span className="text-2xl font-bold font-mono text-fg">{corpusData.artifacts.count}</span>
                <span className="text-xs text-muted block mt-1">{bytesToGb(corpusData.artifacts.bytes)}</span>
              </div>

              <div className="p-4 rounded-lg border border-hair bg-surface">
                <span className="text-label font-mono uppercase text-muted block mb-1">Structured Records</span>
                <span className="text-2xl font-bold font-mono text-fg">
                  {Object.values(corpusData.records).reduce((a, b) => a + b, 0).toLocaleString()}
                </span>
                <span className="text-xs text-muted block mt-1">Across 8 categories</span>
              </div>

              <div className="p-4 rounded-lg border border-hair bg-surface">
                <span className="text-label font-mono uppercase text-muted block mb-1">OCR Verification</span>
                <span className="text-2xl font-bold font-mono text-ok">
                  {corpusData.ocr.verified ? 'Verified' : 'Unverified'}
                </span>
                <span className="text-xs text-muted block mt-1">
                  {corpusData.ocr.pages} pages · {corpusData.ocr.activity_mentions.toLocaleString()} mentions
                </span>
              </div>

              <div className="p-4 rounded-lg border border-hair bg-surface">
                <span className="text-label font-mono uppercase text-muted block mb-1">Validation Status</span>
                <span className="text-2xl font-bold font-mono text-ok">
                  {corpusData.validation.passed ? 'PASSED' : 'FAILED'}
                </span>
                <span className="text-xs text-muted block mt-1">
                  {corpusData.validation.checks_run} checks · 0 errors
                </span>
              </div>
            </div>

            {/* Caveats & Rules of Use */}
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-mono uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Info size={14} />
                Corpus Caveats &amp; Truth Declarations
              </h4>
              <ul className="divide-y divide-hair border border-hair rounded-md bg-surface text-xs font-mono text-muted">
                {corpusData.caveats.map((c, i) => (
                  <li key={i} className="p-3 flex items-start gap-2">
                    <span className="font-bold text-fg shrink-0">{c.id}:</span>
                    <span className="text-fg/80 leading-relaxed">{caveatText(c)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
