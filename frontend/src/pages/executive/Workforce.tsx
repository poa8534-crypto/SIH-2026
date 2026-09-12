import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Gauge,
  Radio,
  TrendingDown,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { usePageHeader } from '../../hooks/usePageHeader';
import {
  DataTableShell,
  DisclosureNotice,
  ErrorState,
  MetricCard,
  PageIntro,
  SkeletonRows,
  StatusBadge,
} from '../../components/ui';

/**
 * Senior Management's manpower workspace.
 *
 * READ-ONLY, AND AGGREGATE ONLY
 * -----------------------------
 * `lib/role.ts`: this role gets "trend, exception and forecast — never the
 * review queue, and nothing to approve". So there is no muster control here,
 * no commit button and no crew roster. Everything is a roll-up, and the only
 * per-row detail is the contractor — which is a governance subject, not a
 * transaction.
 *
 * THE FOUR QUESTIONS THIS ROLE ACTUALLY ASKS
 * ------------------------------------------
 *   Are we fielding the manpower we are paying for?    attendance vs contracted
 *   Which contractor is not?                           reliability ranking
 *   Is the manpower we have pointed at the right work? utilisation and headroom
 *   Is the data behind all of that trustworthy?        musters and their sample
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * It will not rank a contractor on a sample too thin to support a ranking, it
 * will not show a percentage against a zero denominator, and it will not
 * present a nominal supply figure as a measured one. An executive acting on a
 * fabricated number does more damage than one acting on an absent one, because
 * the absent one prompts a question.
 */

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function mondayOfThisWeek(): string {
  const d = new Date();
  return new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export default function ExecutiveWorkforce() {
  usePageHeader(
    'Workforce & Utilisation',
    'Manpower fielded against contracted, contractor reliability, and where capacity is going',
    '/executive/workforce'
  );

  const start = isoDaysAgo(29);
  const end = isoDaysAgo(0);
  const weekStart = useMemo(mondayOfThisWeek, []);

  const summary = useQuery({
    queryKey: ['attendance', 'summary', start, end],
    queryFn: () => api.getAttendanceSummary({ start, end }),
  });
  const capacity = useQuery({
    queryKey: ['capacity', weekStart],
    queryFn: () =>
      api.getCapacity({
        start: weekStart,
        end: new Date(new Date(weekStart).getTime() + 27 * 86_400_000)
          .toISOString()
          .slice(0, 10),
      }),
  });
  const board = useQuery({
    queryKey: ['allocation-board', weekStart],
    queryFn: () => api.getAllocationBoard({ week_start: weekStart, weeks: 4 }),
  });

  if (summary.isLoading) return <SkeletonRows rows={6} />;
  if (summary.error) return <ErrorState error={summary.error} />;
  if (!summary.data) return null;

  const t = summary.data.totals;

  // Utilisation across the whole 4-week horizon. Supply is what the crews can
  // field; committed is what they have been pointed at. The difference is not
  // idleness on its own — it is capacity that has not been allocated, which is
  // a management decision rather than a workforce failure, and the copy says
  // so rather than calling it waste.
  const caps = capacity.data ?? [];
  const supply = caps.reduce((a, c) => a + c.supply_man_days, 0);
  const committed = caps.reduce((a, c) => a + c.committed_man_days, 0);
  const utilisation = supply > 0 ? (committed / supply) * 100 : null;
  const anyNominal = caps.some((c) => c.basis === 'nominal');
  const overcommitted = caps.filter((c) => c.overcommitted);

  const measuredContractors = summary.data.by_contractor.filter(
    (c) => c.sample_sufficient
  );
  const worst = measuredContractors[0];

  return (
    <div className="flex flex-col gap-6">
      <PageIntro
        eyebrow="Governance"
        title="Workforce & Utilisation"
        description="Manpower fielded against manpower contracted, across the last 30 days — and whether the capacity that exists is pointed at the work that needs it."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Manpower fielded"
          value={t.attendance_pct === null ? '—' : `${t.attendance_pct.toFixed(1)}%`}
          detail={`${t.present.toLocaleString()} of ${t.planned_strength.toLocaleString()} contracted heads, 30 days`}
          tone={
            t.attendance_pct === null
              ? 'default'
              : t.attendance_pct >= 90
                ? 'ok'
                : t.attendance_pct >= 80
                  ? 'warn'
                  : 'danger'
          }
          icon={<Users size={15} />}
        />
        <MetricCard
          label="Man-days lost to shortfall"
          value={t.shortfall.toLocaleString()}
          detail="Contracted heads that did not turn up"
          tone={t.shortfall > 0 ? 'warn' : 'ok'}
          icon={<TrendingDown size={15} />}
        />
        <MetricCard
          label="Capacity committed"
          value={utilisation === null ? '—' : `${utilisation.toFixed(0)}%`}
          detail={
            capacity.isLoading
              ? 'Loading…'
              : anyNominal
                ? 'Part-nominal: some crews have too few musters to measure'
                : 'Of measured supply over the next four weeks'
          }
          tone={
            utilisation === null
              ? 'default'
              : utilisation > 100
                ? 'danger'
                : utilisation >= 60
                  ? 'ok'
                  : 'warn'
          }
          icon={<Gauge size={15} />}
        />
        <MetricCard
          label="Weakest contractor"
          value={
            worst && worst.attendance_pct !== null
              ? `${worst.attendance_pct.toFixed(1)}%`
              : '—'
          }
          detail={
            worst
              ? String(worst.contractor)
              : 'No contractor has enough musters to rank'
          }
          tone={worst?.reliable === false ? 'warn' : 'default'}
          icon={<Building2 size={15} />}
        />
      </div>

      <DisclosureNotice summary="What these figures are, and what they are not">
        <p>
          <strong className="text-heading">Manpower fielded</strong> is present
          heads over the strength each crew was contracted to field that day,
          snapshotted onto the muster when it was taken. Days with nothing
          contracted — rest days on the site calendar — carry no percentage and
          are excluded from every denominator here.
        </p>
        <p className="mt-2">
          <strong className="text-heading">Capacity committed</strong> is not a
          measure of idleness. Uncommitted capacity is capacity that has not
          been allocated, which is a planning decision; it becomes waste only if
          there is unmet demand elsewhere in the same week.
        </p>
        <p className="mt-2">
          A contractor is <strong className="text-heading">ranked only on five
          musters or more</strong>. Anyone below that is listed as not measured,
          not as a poor performer.
        </p>
      </DisclosureNotice>

      {overcommitted.length > 0 && (
        <section className="rounded-xl bg-warn/10 p-4 ring-1 ring-warn/30">
          <h3 className="text-body font-semibold text-warn">
            {overcommitted.length} crew
            {overcommitted.length === 1 ? '' : 's'} committed beyond what they
            can field
          </h3>
          <p className="mt-1 text-label leading-5 text-muted">
            Committed man-days exceed the crew's own supply over the next four
            weeks. Either the commitment or the crew size is wrong, and the
            schedule is currently relying on the optimistic one.
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-label">
            {overcommitted.map((c) => (
              <li key={c.crew_id} className="text-fg">
                {c.name} ({c.discipline.replace('_', ' ')}) —{' '}
                {c.committed_man_days} committed against {c.supply_man_days}{' '}
                available
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-lead font-semibold text-heading">
          Contractor performance
        </h3>
        <p className="text-label text-muted">
          Did each contractor field the strength they contracted to field, over
          the last 30 days?
        </p>
        <DataTableShell>
          <table className="w-full min-w-[680px] text-body">
            <thead className="bg-secondary text-label uppercase tracking-[0.06em] text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Contractor</th>
                <th className="px-4 py-2.5 text-right font-semibold">Crews</th>
                <th className="px-4 py-2.5 text-right font-semibold">Musters</th>
                <th className="px-4 py-2.5 text-right font-semibold">Fielded</th>
                <th className="px-4 py-2.5 text-right font-semibold">Shortfall</th>
                <th className="px-4 py-2.5 text-left font-semibold">Assessment</th>
              </tr>
            </thead>
            <tbody>
              {summary.data.by_contractor.map((c) => (
                <tr key={String(c.contractor)} className="border-t border-hair">
                  <td className="px-4 py-2.5 font-medium text-heading">
                    {c.contractor}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.crews}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.musters}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {c.attendance_pct === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      `${c.attendance_pct.toFixed(1)}%`
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {c.shortfall}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.reliable === null ? (
                      <StatusBadge tone="neutral">Not measured</StatusBadge>
                    ) : c.reliable ? (
                      <StatusBadge tone="ok">Meeting commitment</StatusBadge>
                    ) : (
                      <StatusBadge tone="warn">Below commitment</StatusBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-lead font-semibold text-heading">
          Where the shortfall is
        </h3>
        <p className="text-label text-muted">
          By discipline, worst first. This is the bottleneck list.
        </p>
        <DataTableShell>
          <table className="w-full min-w-[620px] text-body">
            <thead className="bg-secondary text-label uppercase tracking-[0.06em] text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Discipline</th>
                <th className="px-4 py-2.5 text-right font-semibold">Contracted</th>
                <th className="px-4 py-2.5 text-right font-semibold">Fielded</th>
                <th className="px-4 py-2.5 text-right font-semibold">Shortfall</th>
                <th className="px-4 py-2.5 text-left font-semibold">
                  Largest absence reason
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.data.by_discipline.map((d) => {
                const top = Object.entries(d.absence_reasons)[0];
                return (
                  <tr key={String(d.discipline)} className="border-t border-hair">
                    <td className="px-4 py-2.5 font-medium text-heading">
                      {String(d.discipline).replace('_', ' ')}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {d.planned_strength}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {d.attendance_pct === null
                        ? '—'
                        : `${d.attendance_pct.toFixed(1)}%`}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        d.shortfall > 0 ? 'font-semibold text-warn' : ''
                      }`}
                    >
                      {d.shortfall}
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {top ? `${top[0].replace('_', ' ')} (${top[1]})` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTableShell>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-lead font-semibold text-heading">
          Four-week outlook
        </h3>
        <p className="text-label text-muted">
          Supply against what has actually been committed, per week.
          {board.data && board.data.demand_not_derivable.length > 0 && (
            <>
              {' '}Demand is shown only where a productivity norm exists —{' '}
              {board.data.demand_not_derivable.length} activities have none and
              contribute nothing rather than a guess.
            </>
          )}
        </p>
        {board.isLoading && <SkeletonRows rows={3} />}
        {board.error && <ErrorState error={board.error} />}
        {board.data && (
          <DataTableShell>
            <table className="w-full min-w-[620px] text-body">
              <thead className="bg-secondary text-label uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Week</th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Supply (man-days)
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold">Committed</th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Uncommitted
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Derivable demand
                  </th>
                </tr>
              </thead>
              <tbody>
                {board.data.weeks_detail.map((w) => (
                  <tr key={w.week_start} className="border-t border-hair">
                    <td className="px-4 py-2.5 font-medium text-heading">
                      {w.week_start}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {w.total_supply.toFixed(0)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {w.total_committed.toFixed(0)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {(w.total_supply - w.total_committed).toFixed(0)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {w.total_demand > 0 ? (
                        w.total_demand.toFixed(0)
                      ) : (
                        <span className="text-muted">not derivable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        )}
      </section>

      <p className="flex items-center gap-2 text-label text-muted">
        <Radio size={13} />
        Reporting timeliness and device reachability are on the Data Confidence
        workspace.
      </p>
    </div>
  );
}
