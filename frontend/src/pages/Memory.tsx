import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { usePageHeader } from '../hooks/usePageHeader';
import { EmptyState, ErrorState, Panel, Skeleton } from '../components/ui';
import { DISCIPLINE_AXIS, DISCIPLINE_ORDER } from '../config';
import {
  DelayReasonRow,
  DurationDistribution,
  ProductivityMetric,
} from '../types';

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

function PlannedVsActual({ rows }: { rows: DurationDistribution[] }) {
  const { withActuals, withoutActuals } = useMemo(() => {
    const ok: Overrun[] = [];
    let missing = 0;
    for (const r of rows) {
      if (r.actual_mean_days === null || r.planned_mean_days === 0) {
        missing += 1;
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
    // Worst overrun first.
    ok.sort((a, b) => b.deltaPct - a.deltaPct);
    return { withActuals: ok, withoutActuals: missing };
  }, [rows]);

  if (withActuals.length === 0) {
    return <NoData>No activity type has both an actual start and finish yet.</NoData>;
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

// ── 3. Recurring delay causes ───────────────────────────────────────────────

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
            <Th right>Occurrences</Th>
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
  // outlier, which lands the panel on "not enough data" — a poor first
  // impression of the section that closes the loop.
  const defaultType = useMemo(() => {
    const scored = types
      .filter((t) => t.actuals_count >= 2 && t.planned_mean_days > 0)
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

// ── Page ────────────────────────────────────────────────────────────────────

export default function Memory() {
  usePageHeader('Memory', 'What past durations say about the ones still planned.', '/memory');
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
    /* The shell's <main> already scrolls; this used to add a second one. */
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-4">
        <div className="mb-1">
          <p className="text-body text-muted max-w-3xl leading-relaxed">
            These patterns are computed from actual execution data the system
            captured from field reports and discipline spreadsheets — not from
            the baseline plan. The baseline appears only as the figure each
            actual is measured against.
          </p>
        </div>

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

          <Panel title="Recurring delay causes" span="col-span-6">
            <DelayCauses rows={delays} />
          </Panel>
        </div>

        {data && (
          <p className="font-mono text-label uppercase tracking-wider text-muted text-right">
            Computed {new Date(data.computed_at).toLocaleString()}
          </p>
        )}
    </div>
  );
}
