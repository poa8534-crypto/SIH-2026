import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, Layers, ShieldAlert, Sparkles, Umbrella } from 'lucide-react';
import { api } from '../lib/api';
import { usePageHeader } from '../hooks/usePageHeader';
import { EmptyState, ErrorState, Panel, Skeleton } from '../components/ui';
import { DISCIPLINE_AXIS, DISCIPLINE_ORDER } from '../config';
import {
  DelayReasonRow,
  DurationDistribution,
  KnowledgeRule,
  KnowledgeRulesResponse,
  ProductivityMetric,
} from '../types';
import { TenderEstimator } from '../components/TenderEstimator';

/**
 * Institutional memory — the half of the problem statement most teams skip.
 *
 * Every number on this screen is read from GET /memory/query, which computes
 * over actual execution data captured by the pipeline. Nothing here comes from
 * the baseline plan except the planned figures it is compared against, and
 * nothing is estimated client-side: where the API has no answer the section
 * says so in words rather than drawing an empty chart.
 */

/**
 * Said in words, per the constraint against empty charts.
 *
 * This used to be a left-aligned block of its own while every other "nothing
 * here yet" on the screen was centred; it is the shared `EmptyState` now, so
 * an empty Memory screen reads the same way as an empty queue.
 */
function NoData({ children }: { children: React.ReactNode }) {
  return <EmptyState>{children}</EmptyState>;
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`text-label font-medium uppercase tracking-[0.05em] text-heading px-3 py-3 whitespace-nowrap ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

// ── 1. Planned vs actual duration ───────────────────────────────────────────

interface Overrun extends DurationDistribution {
  actual_mean_days: number;
  deltaDays: number;
  deltaPct: number;
}

/** Completed activities before a mean is worth comparing against a plan.
 *
 *  Three, the same bar `server/main.py :: MIN_ACTUALS_FOR_ESTIMATE` and
 *  `server/productivity.py :: MIN_COMPARABLES` apply. This table used to sort
 *  by delta and put `CIV-PLT +29.0d · +483%` at the top of the screen off ONE
 *  completed activity — the single largest number on the page, and an
 *  anecdote. Rows below the bar keep their counts, which are facts, and say
 *  "insufficient evidence" where the delta was. See D-094. */
const MIN_ACTUALS_FOR_DELTA = 3;

function PlannedVsActual({ rows }: { rows: DurationDistribution[] }) {
  const { withActuals, thin, withoutActuals } = useMemo(() => {
    const ok: Overrun[] = [];
    const weak: DurationDistribution[] = [];
    let missing = 0;
    for (const r of rows) {
      if (r.actual_mean_days === null || r.planned_mean_days === 0) {
        missing += 1;
        continue;
      }
      if (r.actuals_count < MIN_ACTUALS_FOR_DELTA) {
        weak.push(r);
        continue;
      }
      const deltaDays = r.actual_mean_days - r.planned_mean_days;
      ok.push({
        ...r,
        actual_mean_days: r.actual_mean_days,
        deltaDays,
        deltaPct: (deltaDays / r.planned_mean_days) * 100,
      });
    }
    weak.sort((a, b) => b.actuals_count - a.actuals_count);
    // Worst overrun first.
    ok.sort((a, b) => b.deltaPct - a.deltaPct);
    return { withActuals: ok, thin: weak, withoutActuals: missing };
  }, [rows]);

  if (withActuals.length === 0 && thin.length === 0) {
    return <NoData>No activity type has both an actual start and finish yet.</NoData>;
  }

  if (withActuals.length === 0) {
    return (
      <NoData>
        No activity type has {MIN_ACTUALS_FOR_DELTA} completed activities yet.
        {' '}{thin.length} {thin.length === 1 ? 'type has' : 'types have'} one or
        two, which is too few to compare against the plan.
      </NoData>
    );
  }

  return (
    <>
      <div className="overflow-auto max-h-[420px]">
        <table className="w-full border-collapse tabular-nums">
          <thead className="sticky top-0 bg-raised">
            <tr className="border-b border-hair">
              <Th>Activity type</Th>
              <Th right>Planned avg</Th>
              <Th right>Actual avg</Th>
              <Th right>Delta</Th>
              <Th right>Completed</Th>
            </tr>
          </thead>
          <tbody>
            {withActuals.map((r) => {
              const late = r.deltaDays > 0;
              const flat = Math.abs(r.deltaDays) < 0.05;
              return (
                <tr key={r.activity_type} className="border-b border-hair last:border-0 even:bg-surface hover:bg-selected transition-colors">
                  <td className="px-3 py-3 font-mono text-body text-fg whitespace-nowrap">
                    {r.activity_type}
                  </td>
                  <td className="px-3 py-3 font-mono text-body text-muted text-right">
                    {r.planned_mean_days.toFixed(1)}d
                  </td>
                  <td className="px-3 py-3 font-mono text-body text-fg text-right">
                    {r.actual_mean_days.toFixed(1)}d
                  </td>
                  <td
                    className={`px-3 py-3 font-mono text-body text-right ${
                      flat ? 'text-muted' : late ? 'text-danger' : 'text-accent'
                    }`}
                  >
                    {flat
                      ? '0d · 0%'
                      : `${late ? '+' : ''}${r.deltaDays.toFixed(1)}d · ${
                          late ? '+' : ''
                        }${r.deltaPct.toFixed(0)}%`}
                  </td>
                  <td className="px-3 py-3 font-mono text-body text-muted text-right">
                    {r.actuals_count}/{r.count}
                  </td>
                </tr>
              );
            })}
            {thin.map((r) => (
              <tr
                key={r.activity_type}
                className="border-b border-hair last:border-0 even:bg-surface"
              >
                <td className="px-3 py-3 font-mono text-body text-muted whitespace-nowrap">
                  {r.activity_type}
                </td>
                <td className="px-3 py-3 font-mono text-body text-muted text-right">
                  {r.planned_mean_days.toFixed(1)}d
                </td>
                <td className="px-3 py-3 font-mono text-body text-muted text-right">
                  —
                </td>
                <td
                  className="px-3 py-3 text-label text-muted text-right"
                  colSpan={1}
                >
                  insufficient evidence
                </td>
                <td className="px-3 py-3 font-mono text-body text-muted text-right">
                  {r.actuals_count}/{r.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {withoutActuals > 0 && (
        <p className="px-3 py-3 border-t border-hair text-label text-muted">
          {withoutActuals} further activity type
          {withoutActuals === 1 ? '' : 's'} have no completed activity yet and are
          not listed.
        </p>
      )}
    </>
  );
}

// ── 2. Slip by discipline ───────────────────────────────────────────────────

function SlipByDiscipline({ rows }: { rows: ProductivityMetric[] }) {
  const bars = useMemo(() => {
    const byName = new Map(rows.map((r) => [r.discipline, r]));
    return DISCIPLINE_ORDER.map((d) => {
      const m = byName.get(d);
      const slip =
        m && m.average_actual_days !== null
          ? m.average_actual_days - m.average_planned_days
          : null;
      return { discipline: d, metric: m, slip };
    });
  }, [rows]);

  const maxAbs = Math.max(
    1,
    ...bars.map((b) => (b.slip === null ? 0 : Math.abs(b.slip)))
  );

  return (
    <div className="p-4 flex flex-col gap-3">
      {bars.map((b) => (
        <div key={b.discipline} className="flex items-center gap-3">
          <div className="w-24 shrink-0 text-body text-fg text-right">
            {DISCIPLINE_AXIS[b.discipline] ?? b.discipline}
          </div>

          {b.slip === null ? (
            <div className="flex-1 text-label text-muted italic">
              no completed activities yet
            </div>
          ) : (
            <div className="flex-1 bg-hair h-2 rounded-full relative overflow-hidden">
              <div
                className={`h-full absolute top-0 rounded-full ${
                  b.slip > 0 ? 'bg-danger left-0' : 'bg-accent right-0'
                }`}
                style={{ width: `${(Math.abs(b.slip) / maxAbs) * 100}%` }}
              />
            </div>
          )}

          <div
            className={`w-16 shrink-0 font-mono text-body text-right ${
              b.slip === null
                ? 'text-muted'
                : b.slip > 0
                  ? 'text-danger'
                  : b.slip < 0
                    ? 'text-accent'
                    : 'text-muted'
            }`}
          >
            {b.slip === null
              ? '—'
              : `${b.slip > 0 ? '+' : ''}${b.slip.toFixed(1)}d`}
          </div>
          <div className="w-14 shrink-0 font-mono text-label text-muted text-right">
            {b.metric ? `${b.metric.completed}/${b.metric.total_activities}` : ''}
          </div>
        </div>
      ))}
      <p className="text-label text-muted leading-relaxed border-t border-hair pt-2">
        Average actual duration minus average planned duration, over completed
        activities only. The right-hand figure is how many of that discipline&rsquo;s
        activities have completed.
      </p>
    </div>
  );
}

// ── 3. Delay causes ─────────────────────────────────────────────────────────

function DelayCauses({ rows }: { rows: DelayReasonRow[] }) {
  if (rows.length === 0) {
    return (
      <NoData>
        No delay causes have been recorded yet. Causes are recognised from the
        wording of ingested field reports, so they appear only once a report
        names one.
      </NoData>
    );
  }
  return (
    <>
      <table className="w-full border-collapse tabular-nums">
        <thead>
          <tr className="border-b border-hair">
            <Th>Cause</Th>
            {/* One occurrence is one field report naming this cause for one
                activity — not one audit row. A single spreadsheet row writes
                two or three audit records, and counting those reported one
                observation as three. See server/raid.py:delay_evidence. */}
            <Th right>Reports</Th>
            <Th right>Days lost</Th>
            <Th>Affected</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.reason} className="border-b border-hair last:border-0 even:bg-surface hover:bg-selected transition-colors">
              <td className="px-3 py-3 text-body text-fg capitalize">{r.reason}</td>
              <td className="px-3 py-3 font-mono text-body text-fg text-right">
                {r.frequency}
              </td>
              <td
                className={`px-3 py-3 font-mono text-body text-right ${
                  r.days_lost > 0 ? 'text-danger' : 'text-muted'
                }`}
              >
                {r.days_lost}d
              </td>
              <td className="px-3 py-3 font-mono text-label text-muted">
                {r.affected_activities.join(', ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-3 border-t border-hair text-label text-muted leading-relaxed">
        Days lost is the finish slip of the affected activities, attributed to
        this cause. Where an activity records more than one cause, its slip is
        counted against each, so treat these as an upper bound.
      </p>
    </>
  );
}

// ── 4. Suggested duration ───────────────────────────────────────────────────

function SuggestedDurationPanel({
  types,
}: {
  types: DurationDistribution[];
}) {
  const [activityType, setActivityType] = useState<string>('');

  // Default to the worst overrun among types that can actually produce a
  // suggestion. The raw worst overrun on this dataset is a single-activity
  // outlier, which lands the panel on "insufficient evidence" — a poor first
  // impression of the section that closes the loop. The bar is the same one
  // the table and the backend apply (D-094), so this cannot select a type the
  // endpoint will then refuse to estimate.
  const defaultType = useMemo(() => {
    const scored = types
      .filter((t) => t.actuals_count >= MIN_ACTUALS_FOR_DELTA && t.planned_mean_days > 0)
      .map((t) => ({
        type: t.activity_type,
        pct: ((t.actual_mean_days as number) - t.planned_mean_days) / t.planned_mean_days,
      }))
      .sort((a, b) => b.pct - a.pct);
    return scored[0]?.type ?? types[0]?.activity_type ?? '';
  }, [types]);

  const selected = activityType || defaultType;

  const { data, isLoading, error } = useQuery({
    queryKey: ['memory', 'suggested', selected],
    queryFn: () =>
      api.queryMemory({ query_type: 'suggested_duration', activity_type: selected }),
    enabled: Boolean(selected),
  });

  const s = data?.suggested_duration ?? null;
  const hasRecommendation = s !== null && s.median_actual_days !== null;

  return (
    <div className="p-4 flex-1 flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="font-mono text-label uppercase tracking-wider text-muted">
          Activity type
        </span>
        <select
          value={selected}
          onChange={(e) => setActivityType(e.target.value)}
          className="rounded-sm w-full bg-raised border border-hair text-fg text-body px-3 py-3 transition-colors focus:outline-none focus:border-accent"
        >
          {types.map((t) => (
            <option key={t.activity_type} value={t.activity_type}>
              {t.activity_type} — {t.actuals_count} of {t.count} completed
            </option>
          ))}
        </select>
      </label>

      {isLoading && <Skeleton height="h-20" />}

      {error && <ErrorState error={error} />}

      {!isLoading && !error && s === null && (
        <NoData>No activity of this type exists in the baseline.</NoData>
      )}

      {!isLoading && !error && s !== null && (
        <>
          {/* Recommendation against baseline, so the difference is obvious. */}
          <div className="border border-accent bg-selected rounded-lg overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-hair">
              <div className="p-4 flex flex-col items-center text-center gap-1">
                <span className="font-mono text-label uppercase tracking-wider text-muted">
                  Baseline planned
                </span>
                <span className="font-mono text-h2 text-muted">
                  {s.median_planned_days}d
                </span>
              </div>
              <div className="p-4 flex flex-col items-center text-center gap-1">
                <span className="font-mono text-label uppercase tracking-wider text-accent">
                  Suggested
                </span>
                {hasRecommendation ? (
                  <span className="font-mono text-h2 text-fg">
                    {s.median_actual_days}d
                  </span>
                ) : (
                  <span className="font-mono text-body text-muted">not yet</span>
                )}
              </div>
            </div>
            {hasRecommendation && (
              <div className="px-3 py-3 border-t border-hair flex items-center justify-between font-mono text-label">
                <span className="text-muted">P80</span>
                <span className="text-fg">{s.p80_actual_days}d</span>
              </div>
            )}
          </div>

          <p className="text-body text-fg leading-relaxed">{s.recommendation}</p>

          <p className="text-label text-muted leading-relaxed border-t border-hair pt-3 mt-auto">
            {hasRecommendation ? (
              <>
                Based on <span className="text-fg font-mono">{s.actuals_count}</span>{' '}
                completed activit{s.actuals_count === 1 ? 'y' : 'ies'} of{' '}
                <span className="font-mono">{s.sample_size}</span> of this type in the
                baseline. Confirmed actual durations only.
              </>
            ) : (
              <>
                <span className="font-mono">{s.actuals_count}</span> of{' '}
                <span className="font-mono">{s.sample_size}</span> activities of this
                type have actual dates. A suggestion needs at least two.
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}

// ── Knowledge Base View ─────────────────────────────────────────────────────

function KnowledgeBaseView() {
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const { data: kbData, isLoading, error } = useQuery<KnowledgeRulesResponse>({
    queryKey: ['knowledge-rules'],
    queryFn: api.getKnowledgeRules,
  });

  if (isLoading) return <Skeleton height="h-64" className="w-full" />;
  if (error || !kbData) return <ErrorState error={error ?? new Error('Failed to load rules')} />;

  const rules = kbData.rules.filter(
    (r) => selectedCat === 'all' || r.category === selectedCat
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Category Pills Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-raised border border-hair rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedCat('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCat === 'all' ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            All Domain Rules ({kbData.total_rules})
          </button>
          <button
            onClick={() => setSelectedCat('environmental')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCat === 'environmental' ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            Environmental & Weather ({kbData.categories.environmental ?? 0})
          </button>
          <button
            onClick={() => setSelectedCat('engineering')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCat === 'engineering' ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            Engineering Specs ({kbData.categories.engineering ?? 0})
          </button>
          <button
            onClick={() => setSelectedCat('dcma_quality')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCat === 'dcma_quality' ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            DCMA 14-Point Standards ({kbData.categories.dcma_quality ?? 0})
          </button>
          <button
            onClick={() => setSelectedCat('logistics')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCat === 'logistics' ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            Logistics & Permits ({kbData.categories.logistics ?? 0})
          </button>
          <button
            onClick={() => setSelectedCat('contractor')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCat === 'contractor' ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            Contractor Benchmarks ({kbData.categories.contractor ?? 0})
          </button>
        </div>

        <span className="text-xs text-muted font-mono flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Active Enforced Guardrails
        </span>
      </div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="border border-hair rounded-xl p-5 bg-raised shadow-xs flex flex-col justify-between gap-4"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase bg-surface text-muted border border-hair">
                  {rule.id}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    rule.severity === 'critical'
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {rule.severity}
                </span>
              </div>
              <h4 className="font-semibold text-body text-heading mb-1.5">
                {rule.title}
              </h4>
              <p className="text-xs text-muted leading-relaxed">
                {rule.description}
              </p>
            </div>

            <div className="pt-3 border-t border-hair flex flex-col gap-2 text-xs">
              <div className="bg-surface rounded-lg p-2.5 border border-hair">
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted block mb-1">
                  Schedule Audit Trigger:
                </span>
                <span className="text-fg">{rule.condition_trigger}</span>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/40 rounded-lg p-2.5 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-300">
                <span className="text-[10px] uppercase font-mono tracking-wider text-blue-600 dark:text-blue-400 block mb-1">
                  Enforced AI Prescription:
                </span>
                <span>{rule.impact_recommendation}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Memory() {
  usePageHeader('Memory', 'What past durations say about the ones still planned.', '/memory');
  const [activeTab, setActiveTab] = useState<'historical' | 'estimator' | 'knowledge'>('historical');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['memory', 'all'],
    queryFn: () => api.queryMemory({ query_type: 'all' }),
  });

  if (error) {
    return (
      <ErrorState
        error={error}
        mode="full"
        title="Error loading project memory"
        onRetry={() => refetch()}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-[1280px] mx-auto w-full grid grid-cols-12 gap-4">
        <Skeleton height="h-72" className="col-span-8" />
        <Skeleton height="h-72" className="col-span-4" />
        <Skeleton height="h-56" className="col-span-6" />
        <Skeleton height="h-56" className="col-span-6" />
      </div>
    );
  }

  const durations = data?.duration_distribution ?? [];
  const productivity = data?.productivity ?? [];
  const delays = data?.delay_reasons ?? [];

  return (
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-5">
      {/* Navigation View Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-hair pb-4">
        <div>
          <p className="text-body text-muted max-w-2xl leading-relaxed">
            {activeTab === 'historical'
              ? 'Execution metrics computed from verified site diaries and field measurements against baseline plans.'
              : activeTab === 'estimator'
              ? 'Empirical duration forecasts and delay buffer calibration for upcoming project tenders.'
              : 'Institutional domain rules, environmental weather constraints, and DCMA schedule standards enforced by NAVIS AI.'}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-hair bg-raised p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('historical')}
            className={`px-3 py-1.5 text-label font-medium rounded-md transition-colors ${
              activeTab === 'historical'
                ? 'bg-selected text-fg shadow-xs'
                : 'text-muted hover:text-fg'
            }`}
          >
            Historical Benchmarks
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('estimator')}
            className={`px-3 py-1.5 text-label font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'estimator'
                ? 'bg-selected text-accent font-semibold shadow-xs'
                : 'text-muted hover:text-fg'
            }`}
          >
            <span>Tender Estimator</span>
            <span className="px-1.5 py-0.2 rounded text-label bg-accent/20 text-accent font-mono">v2</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('knowledge')}
            className={`px-3 py-1.5 text-label font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'knowledge'
                ? 'bg-selected text-accent font-semibold shadow-xs'
                : 'text-muted hover:text-fg'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
            <span>Knowledge Base</span>
            <span className="px-1.5 py-0.2 rounded text-label bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono">7</span>
          </button>
        </div>
      </div>

      {activeTab === 'historical' ? (
        <div className="grid grid-cols-12 gap-4">
          <Panel title="Planned vs actual duration" span="col-span-8">
            <PlannedVsActual rows={durations} />
          </Panel>

          <Panel title="Suggested duration" span="col-span-4">
            <SuggestedDurationPanel types={durations} />
          </Panel>

          <Panel title="Slip by discipline" span="col-span-6">
            <SlipByDiscipline rows={productivity} />
          </Panel>

          <Panel title="Delay causes" span="col-span-6">
            <DelayCauses rows={delays} />
          </Panel>
        </div>
      ) : activeTab === 'estimator' ? (
        <TenderEstimator durations={durations} />
      ) : (
        <KnowledgeBaseView />
      )}

      {data && (
        <p className="font-mono text-label uppercase tracking-wider text-muted text-right">
          Computed {new Date(data.computed_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
