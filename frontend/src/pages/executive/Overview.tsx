import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, ErrorState, Panel, SkeletonRows } from '../../components/ui';
import { DisciplineTag } from '../../components/DisciplineTag';
import { usePageHeader } from '../../hooks/usePageHeader';
import type { Discipline, EvmFigures } from '../../types';

/**
 * Senior Management: is the project on time, and what is going to hurt us?
 *
 * ROADMAP §3.3 is strict about what this role gets — aggregates, exceptions
 * and trend, never a review queue and never transaction detail. So there are
 * no per-event rows here and nothing to approve: an executive who can approve
 * an update bypasses the single accountable owner of the plan.
 *
 * Every number is computed server-side and read here. Nothing on this page is
 * derived in the browser except sorting, which is what ROADMAP §8 means by
 * "no metric computed by an LLM, no arithmetic on a dashboard".
 */

/** SPI shown as a band, not a bare ratio. ROADMAP §8 on confidence display. */
function spiBand(spi: number | null): { label: string; tone: string } {
  if (spi === null) return { label: 'No baseline value', tone: 'text-muted' };
  if (spi >= 0.95) return { label: 'On plan', tone: 'text-ok' };
  if (spi >= 0.85) return { label: 'Slipping', tone: 'text-warn' };
  return { label: 'Behind', tone: 'text-danger' };
}

function Figure({
  label,
  value,
  sub,
  tone = 'text-fg',
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="border border-hair bg-raised rounded-lg p-5 flex flex-col gap-1 min-w-0">
      <span className="font-mono text-label uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className={`text-h1 font-semibold leading-none tabular-nums ${tone}`}>
        {value}
      </span>
      {sub && <span className="text-label text-muted leading-relaxed">{sub}</span>}
    </div>
  );
}

export default function ExecutiveOverview() {
  usePageHeader(
    'Project Control — Executive',
    'Schedule health, exposure and forecast. Read-only.',
    '/executive'
  );

  const evm = useQuery({ queryKey: ['evm'], queryFn: api.getEvm });
  const schedule = useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.getSchedule(),
  });
  const conflicts = useQuery({
    queryKey: ['conflicts'],
    queryFn: () => api.getConflicts(50),
  });

  const project = evm.data?.project;
  const band = spiBand(project?.spi ?? null);

  /** The activities dragging the finish date, worst first. */
  const worst = useMemo(() => {
    const acts = schedule.data?.activities ?? [];
    return [...acts]
      .filter((a) => (a.finish_variance_days ?? 0) > 0)
      .sort((a, b) => (b.finish_variance_days ?? 0) - (a.finish_variance_days ?? 0))
      .slice(0, 8);
  }, [schedule.data]);

  const disciplines = useMemo(() => {
    const by = evm.data?.by_discipline ?? {};
    return Object.entries(by).sort(
      ([, a], [, b]) => (a.spi ?? 99) - (b.spi ?? 99)
    ) as [string, EvmFigures][];
  }, [evm.data]);

  if (evm.error) {
    return <ErrorState error={evm.error} />;
  }

  return (
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-4">
      {/* The headline the server itself flags as unsafe on this dataset. It is
          shown, not hidden, and it is shown WITH the reason — an executive
          reading 0.43 without knowing 64 activities have no evidence at all
          would draw a conclusion the data does not support. */}
      {evm.data && project && project.percent_source_counts.no_evidence_floor > 0 && (
        <div className="border border-danger-line bg-danger-bg rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={14} className="text-danger mt-0.5 shrink-0" />
          <p className="text-body text-fg leading-relaxed">
            <span className="font-semibold">
              SPI understates progress on this dataset.
            </span>{' '}
            <span className="text-muted">
              {project.percent_source_counts.no_evidence_floor} of{' '}
              {project.activity_count} activities are scored at 0% because no
              source has reported on them yet — not because work has stopped.
              Earned value counts only what a field report actually evidenced.
            </span>
          </p>
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Figure
          label="Schedule performance"
          value={
            evm.isLoading ? '—' : project?.spi === null ? 'n/a' : project?.spi?.toFixed(2)
          }
          sub={band.label}
          tone={band.tone}
        />
        <Figure
          label="Earned / planned"
          value={
            evm.isLoading
              ? '—'
              : `${Math.round(project?.earned_value ?? 0)}/${Math.round(
                  project?.planned_value ?? 0
                )}`
          }
          sub="Duration-weighted work units"
        />
        <Figure
          label="Activities evidenced"
          value={
            evm.isLoading
              ? '—'
              : (project?.activity_count ?? 0) -
                (project?.percent_source_counts.no_evidence_floor ?? 0)
          }
          sub={`of ${project?.activity_count ?? 0} in the baseline`}
        />
        <Figure
          label="Source conflicts"
          value={conflicts.isLoading ? '—' : conflicts.data?.length ?? 0}
          sub="Two sources disagree on one field"
          tone={(conflicts.data?.length ?? 0) > 0 ? 'text-warn' : 'text-fg'}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Panel title="Where the schedule is slipping" span="lg:col-span-3">
          {evm.isLoading ? (
            <SkeletonRows rows={6} />
          ) : disciplines.length === 0 ? (
            <EmptyState>No discipline breakdown available.</EmptyState>
          ) : (
            <div className="flex flex-col">
              {disciplines.map(([name, f]) => {
                const b = spiBand(f.spi);
                const pct = f.spi === null ? 0 : Math.min(f.spi, 1) * 100;
                return (
                  <div
                    key={name}
                    className="px-4 py-3 border-b border-hair last:border-0 flex items-center gap-4"
                  >
                    <span className="w-14 shrink-0">
                      <DisciplineTag discipline={name as Discipline} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block h-1.5 bg-selected rounded-full overflow-hidden">
                        <span
                          className={`block h-full rounded-full ${
                            b.tone === 'text-ok'
                              ? 'bg-ok'
                              : b.tone === 'text-warn'
                                ? 'bg-warn'
                                : 'bg-danger'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    </span>
                    <span
                      className={`font-mono text-body tabular-nums w-12 text-right shrink-0 ${b.tone}`}
                    >
                      {f.spi === null ? 'n/a' : f.spi.toFixed(2)}
                    </span>
                    <span className="font-mono text-label text-muted w-24 text-right shrink-0 tabular-nums">
                      {f.percent_source_counts.no_evidence_floor} unevidenced
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Biggest finish slips" span="lg:col-span-2">
          {schedule.isLoading ? (
            <SkeletonRows rows={6} />
          ) : worst.length === 0 ? (
            <EmptyState>No activity is finishing later than planned.</EmptyState>
          ) : (
            <div className="flex flex-col">
              {worst.map((a) => (
                <div
                  key={a.activity_id}
                  className="px-4 py-3 border-b border-hair last:border-0 flex items-start gap-3"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block font-mono text-label text-muted">
                      {a.activity_id}
                    </span>
                    <span className="block text-body text-fg line-clamp-1">
                      {a.description}
                    </span>
                  </span>
                  <span className="font-mono text-body text-danger tabular-nums shrink-0">
                    +{a.finish_variance_days}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/executive/exposure"
          className="font-mono text-label uppercase tracking-wider text-accent flex items-center gap-1 hover:underline"
        >
          Exposure register <ArrowRight size={12} />
        </Link>
        <Link
          to="/executive/provenance"
          className="font-mono text-label uppercase tracking-wider text-accent flex items-center gap-1 hover:underline"
        >
          Where the data came from <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
