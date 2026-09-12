import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Radio, Timer, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api';

/**
 * Reporting timeliness and device reachability, for the governance lane.
 *
 * WHY IT LIVES ON DATA CONFIDENCE
 * -------------------------------
 * Every forecast, every EVM figure and every delay ruling in NAVIS rests on
 * actuals arriving. This panel says how late they actually arrived and whether
 * anything stopped arriving at all — which is precisely what a Data Confidence
 * workspace is for, and it is the one number on that page that was previously
 * unanswerable.
 *
 * Read-only and aggregate, like the rest of the Senior Management lane
 * (`lib/role.ts`): a per-device queue is a planner's operational concern and
 * is on `/capture-health`, not here.
 */
export function CaptureTimeliness() {
  const lag = useQuery({
    queryKey: ['reporting-lag', 30],
    queryFn: () => api.getReportingLag(30),
  });
  const health = useQuery({
    queryKey: ['link-health'],
    queryFn: () => api.getLinkHealth(),
  });

  if (lag.isLoading) return null;
  // A governance page should lose a panel rather than a page when one of its
  // several sources is down.
  if (lag.error || !lag.data) return null;

  const silent = lag.data.silent_disciplines;

  return (
    <section className="rounded-xl bg-raised p-5 ring-1 ring-hair/80">
      <div className="flex items-center gap-2">
        <Timer size={16} className="text-accent" />
        <h3 className="text-lead font-semibold text-heading">
          Reporting timeliness
        </h3>
      </div>
      <p className="mt-1 text-label leading-5 text-muted">
        How long actual progress took to reach this system, over the last{' '}
        {lag.data.window_days} days. Computed from data NAVIS was already
        storing — the day work was reported for, against the moment its row was
        written — so it covers the whole corpus retroactively.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-secondary p-3">
          <p className="text-label text-muted">Median capture lag</p>
          <p className="mt-1 font-mono text-h3 font-semibold text-heading">
            {lag.data.median_lag_hours === null
              ? '—'
              : `${lag.data.median_lag_hours} h`}
          </p>
          <p className="text-label text-muted">
            across {lag.data.events} linked events
          </p>
        </div>
        <div className="rounded-lg bg-secondary p-3">
          <p className="text-label text-muted">Disciplines gone quiet</p>
          <p
            className={`mt-1 font-mono text-h3 font-semibold ${
              silent.length ? 'text-warn' : 'text-ok'
            }`}
          >
            {silent.length}
          </p>
          <p className="text-label text-muted">
            {silent.length ? silent.join(', ') : 'all disciplines reporting'}
          </p>
        </div>
        <div className="rounded-lg bg-secondary p-3">
          <p className="text-label text-muted">Devices reaching the server</p>
          <p className="mt-1 font-mono text-h3 font-semibold text-heading">
            {health.data ? `${health.data.online}/${health.data.total}` : '—'}
          </p>
          <p className="text-label text-muted">
            {health.data?.queued_submissions
              ? `${health.data.queued_submissions} updates held on devices`
              : 'nothing held offline'}
          </p>
        </div>
      </div>

      {silent.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-warn/10 p-3 ring-1 ring-warn/30">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />
          <p className="text-label leading-5 text-fg">
            {silent.length === 1 ? 'One discipline has' : `${silent.length} disciplines have`}{' '}
            filed nothing for three days or more. Forecasts covering{' '}
            {silent.join(', ')} are running on data at least that old — and
            whether that is a work problem or a connectivity problem is
            answered on the planner&rsquo;s Capture Health screen.
          </p>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-body">
          <thead className="text-label uppercase tracking-[0.06em] text-muted">
            <tr>
              <th className="py-2 text-left font-semibold">Discipline</th>
              <th className="py-2 text-right font-semibold">Events</th>
              <th className="py-2 text-right font-semibold">Median lag</th>
              <th className="py-2 text-right font-semibold">Last heard</th>
            </tr>
          </thead>
          <tbody>
            {lag.data.rows.map((r) => (
              <tr key={r.discipline} className="border-t border-hair">
                <td className="py-2 font-medium text-heading">
                  {r.discipline.replace('_', ' ')}
                </td>
                <td className="py-2 text-right tabular-nums">{r.events}</td>
                <td className="py-2 text-right tabular-nums">
                  {r.median_lag_hours === null ? '—' : `${r.median_lag_hours} h`}
                </td>
                <td
                  className={`py-2 text-right tabular-nums ${
                    (r.days_since_last_report ?? 0) >= 3 ? 'text-warn' : 'text-muted'
                  }`}
                >
                  {r.days_since_last_report === null
                    ? '—'
                    : r.days_since_last_report === 0
                      ? 'today'
                      : `${r.days_since_last_report}d ago`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-label text-muted">
        <Radio size={12} />
        A degraded link never lowers a confidence score. Dropping a supervisor
        to text-only removes an assist, not a guarantee.
      </p>
    </section>
  );
}
