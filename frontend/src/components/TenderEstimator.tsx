import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Panel, Skeleton, ErrorState } from './ui';
import { DurationDistribution, TenderEstimateResponse } from '../types';
import { DISCIPLINE_ORDER } from '../config';

interface Props {
  durations: DurationDistribution[];
}

export function TenderEstimator({ durations }: Props) {
  const [discipline, setDiscipline] = useState<string>('piping');
  const [activityType, setActivityType] = useState<string>('PIP-SPL');
  const [targetQuantity, setTargetQuantity] = useState<string>('50');
  const [uom, setUom] = useState<string>('spools');
  const [siteCondition, setSiteCondition] = useState<string>('monsoon_upper_assam');
  const [copied, setCopied] = useState<boolean>(false);

  // Filter duration distribution by current discipline
  const availableTypes = durations.filter(
    (d) => d.activity_type.toLowerCase().startsWith(discipline.slice(0, 3).toLowerCase())
  );

  const queryPayload = {
    discipline,
    activity_type: activityType || undefined,
    target_quantity: targetQuantity ? parseFloat(targetQuantity) : undefined,
    uom: uom || undefined,
    site_condition: siteCondition,
  };

  const { data: estimate, isLoading, error, refetch } = useQuery<TenderEstimateResponse>({
    queryKey: ['tender-estimate', discipline, activityType, targetQuantity, uom, siteCondition],
    queryFn: () => api.estimateTender(queryPayload),
  });

  const handleCopyXml = () => {
    if (estimate?.pmxml_snippet) {
      navigator.clipboard.writeText(estimate.pmxml_snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadXml = () => {
    if (!estimate?.pmxml_snippet) return;
    const blob = new Blob([estimate.pmxml_snippet], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${estimate.activity_type}_calibrated_p6.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Scope Parameters Bar */}
      <div className="bg-raised border border-hair rounded-lg p-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 mb-4 border-b border-hair gap-2">
          <div>
            <h3 className="text-lead font-semibold text-heading tracking-wide">
              Future Project Estimator (Tender Intelligence)
            </h3>
            <p className="text-label text-muted mt-1">
              Calibrate future EPC bids against empirical historical productivity and delay records.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded text-label font-mono bg-accent/15 text-accent border border-accent/30">
              FIDIC Cl. 8.4 Calibrated
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Discipline */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label uppercase tracking-wider text-muted font-medium">
              Discipline
            </label>
            <select
              value={discipline}
              onChange={(e) => {
                const newDisc = e.target.value;
                setDiscipline(newDisc);
                const matching = durations.find((d) =>
                  d.activity_type.toLowerCase().startsWith(newDisc.slice(0, 3).toLowerCase())
                );
                if (matching) setActivityType(matching.activity_type);
              }}
              className="bg-surface border border-hair rounded px-3 py-2 text-body text-fg focus:outline-none focus:border-accent"
            >
              {DISCIPLINE_ORDER.map((d) => (
                <option key={d} value={d}>
                  {d.replace('_', ' ').toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Activity Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label uppercase tracking-wider text-muted font-medium">
              Activity Scope Type
            </label>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              className="bg-surface border border-hair rounded px-3 py-2 text-body text-fg focus:outline-none focus:border-accent"
            >
              {availableTypes.length > 0 ? (
                availableTypes.map((t) => (
                  <option key={t.activity_type} value={t.activity_type}>
                    {t.activity_type} ({t.actuals_count} actuals)
                  </option>
                ))
              ) : (
                <option value={`${discipline.slice(0, 3).toUpperCase()}-SCOPE`}>
                  {discipline.toUpperCase()} General
                </option>
              )}
            </select>
          </div>

          {/* Quantity */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label uppercase tracking-wider text-muted font-medium">
              Scope Quantity
            </label>
            <input
              type="number"
              min="1"
              value={targetQuantity}
              onChange={(e) => setTargetQuantity(e.target.value)}
              placeholder="e.g. 50"
              className="bg-surface border border-hair rounded px-3 py-2 text-body text-fg focus:outline-none focus:border-accent tabular-nums"
            />
          </div>

          {/* Unit of Measurement */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label uppercase tracking-wider text-muted font-medium">
              Unit (UOM)
            </label>
            <input
              type="text"
              value={uom}
              onChange={(e) => setUom(e.target.value)}
              placeholder="spools / m3 / m"
              className="bg-surface border border-hair rounded px-3 py-2 text-body text-fg focus:outline-none focus:border-accent"
            />
          </div>

          {/* Site Environment & Season */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label uppercase tracking-wider text-muted font-medium">
              Operating Condition
            </label>
            <select
              value={siteCondition}
              onChange={(e) => setSiteCondition(e.target.value)}
              className="bg-surface border border-hair rounded px-3 py-2 text-body text-fg focus:outline-none focus:border-accent"
            >
              <option value="standard">Standard Dry Season (1.0x)</option>
              <option value="monsoon_upper_assam">Upper Assam Monsoon (+35%, assumed)</option>
              <option value="remote_drill_site">Remote Well Site (+20%, assumed)</option>
            </select>
            {/* The multiplier is a planning convention, not something this
                system measured. It is labelled at the point of choice as well
                as on the result, because a reader who never scrolls down would
                otherwise take it for a fitted figure. */}
            <p className="text-label text-muted leading-relaxed">
              These allowances are assumptions applied to the measured
              durations, not factors fitted to this project&rsquo;s records.
            </p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-12 gap-4">
          <Skeleton height="h-36" className="col-span-12" />
          <Skeleton height="h-64" className="col-span-12" />
        </div>
      )}

      {error && <ErrorState error={error} onRetry={() => refetch()} />}

      {estimate && !isLoading && !error && !estimate.evidence_sufficient && (
        /* NO NUMBER IS BETTER THAN AN INVENTED ONE.
         *
         * This panel used to show a full P10/P50/P90 spread in every case: with
         * one completed activity the backend produced actual x 0.8 / x 1.3, and
         * with none it produced planned x 0.85 / 1.15 / 1.45 — three multipliers
         * with no derivation, rendered here in the same typography as a measured
         * figure. A tender duration is a number someone prices work against.
         * See D-094. */
        <div className="bg-raised border border-warn/40 rounded-lg p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-label uppercase font-mono tracking-wider text-warn font-semibold">
              Insufficient evidence
            </span>
            <span className="text-label font-mono text-muted">
              {estimate.actuals_count} of {estimate.minimum_actuals_required} completed
              activities needed
            </span>
          </div>
          <p className="text-body text-fg leading-relaxed">{estimate.evidence_note}</p>
          {estimate.baseline_days_p50 !== null && (
            <p className="text-label text-muted">
              The baseline plans {estimate.baseline_days_p50}d for this work.
              That is what was planned, not what it has taken, and it is not
              scaled into an estimate here.
            </p>
          )}
        </div>
      )}

      {estimate && !isLoading && !error && estimate.evidence_sufficient && (
        <>
          {/* Three-Point Duration Distribution Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* P10 Card */}
            <div className="bg-raised border border-hair rounded-lg p-4 flex flex-col justify-between">
              <div>
                <span className="text-label uppercase font-mono tracking-wider text-muted">
                  P10 Aggressive
                </span>
                <div className="text-h2 font-mono font-bold text-fg mt-2 tabular-nums">
                  {estimate.calibrated_days_p10}d
                </div>
              </div>
              <p className="text-label text-muted mt-3">
                The fastest end of what this project has actually done, over{' '}
                {estimate.actuals_count} completed activities.
              </p>
            </div>

            {/* P50 Card (Recommended Baseline) */}
            <div className="bg-selected border-2 border-accent rounded-lg p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-accent text-raised text-label px-2.5 py-0.5 font-bold uppercase tracking-wider">
                Recommended
              </div>
              <div>
                <span className="text-label uppercase font-mono tracking-wider text-accent font-semibold">
                  P50 Tender Baseline
                </span>
                <div className="text-h1 font-mono font-bold text-fg mt-2 tabular-nums">
                  {estimate.recommended_tender_duration}d
                </div>
              </div>
              <div className="text-label text-fg/80 mt-3 flex items-center justify-between border-t border-hair pt-2">
                <span>Base: {estimate.calibrated_days_p50}d</span>
                <span className="text-accent font-mono">
                  +{estimate.total_contingency_days}d buffer
                </span>
              </div>
              <p className="text-label text-muted mt-2 leading-relaxed">
                {estimate.contingency_basis}
              </p>
            </div>

            {/* P90 Card */}
            <div className="bg-raised border border-hair rounded-lg p-4 flex flex-col justify-between">
              <div>
                <span className="text-label uppercase font-mono tracking-wider text-muted">
                  P90 Conservative
                </span>
                <div className="text-h2 font-mono font-bold text-fg mt-2 tabular-nums">
                  {estimate.calibrated_days_p90}d
                </div>
              </div>
              {/* Was "90% confidence threshold covering extreme weather",
                  which describes a fitted distribution. This is an order
                  statistic over a handful of activities. */}
              <p className="text-label text-muted mt-3">
                The slowest end of the same {estimate.actuals_count} activities.
                An extreme observed, not a confidence level.
              </p>
            </div>

            {/* Productivity Benchmark */}
            <div className="bg-raised border border-hair rounded-lg p-4 flex flex-col justify-between">
              <div>
                <span className="text-label uppercase font-mono tracking-wider text-muted">
                  Historical Productivity
                </span>
                <div className="text-h2 font-mono font-bold text-fg mt-2 tabular-nums">
                  {estimate.historical_productivity_rate !== null
                    ? `${estimate.historical_productivity_rate}`
                    : '—'}
                  <span className="text-label text-muted font-normal ml-1.5">
                    {estimate.productivity_uom || 'units/day'}
                  </span>
                </div>
              </div>
              <p className="text-label text-muted mt-3">
                {estimate.historical_productivity_rate !== null
                  ? `Mean rate over completed activities carrying a measured quantity.`
                  : `Not enough completed activities carry a measured quantity.`}
              </p>
            </div>
          </div>

          {/* Historical Risk Matrix & Primavera PMXML Export */}
          <div className="grid grid-cols-12 gap-4">
            {/* Risk Factor Breakdown */}
            <div className="col-span-12 lg:col-span-7">
              <Panel title="Empirical Risk & Delay Attribution Matrix">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-hair text-label uppercase tracking-wider text-muted font-medium">
                        <th className="px-4 py-3">Risk Factor</th>
                        <th className="px-4 py-3 text-center">Times observed</th>
                        <th className="px-4 py-3 text-right">Worst impact</th>
                        <th className="px-4 py-3">Contractual Mitigation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hair">
                      {estimate.risk_factors.map((rf, idx) => (
                        <tr key={idx} className="hover:bg-raised/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-body text-fg">
                            {rf.risk_type}
                            {/* Was "Observed N times on past OIL projects" —
                                this system has never seen another project.
                                `basis` says where the count came from. */}
                            <div className="text-label text-muted mt-0.5">
                              {rf.basis}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {/* A count, not a percentage. The percentage was
                                frequency x 15 floored at 20%. */}
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-label font-mono bg-warn/15 text-warn border border-warn/30">
                              {rf.historical_frequency}
                              {rf.probability_pct !== null && ` · ${rf.probability_pct}%`}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-body text-fg tabular-nums whitespace-nowrap">
                            +{rf.impact_days} days
                          </td>
                          <td className="px-4 py-3 text-label text-muted leading-relaxed">
                            {rf.mitigation}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>

            {/* Primavera XML Schedule Export */}
            <div className="col-span-12 lg:col-span-5">
              <Panel title="Primavera P6 Calibrated Baseline Export">
                <div className="flex flex-col h-full gap-4">
                  <p className="text-label text-muted leading-relaxed">
                    Pre-calibrated Oracle Primavera P6 XML snippet. Inject into corporate tender schedules with realistic durations:
                  </p>
                  <pre className="bg-surface border border-hair rounded p-3 font-mono text-label text-fg overflow-x-auto max-h-[220px] leading-relaxed">
                    {estimate.pmxml_snippet}
                  </pre>
                  <div className="flex items-center gap-3 pt-2 mt-auto">
                    <button
                      type="button"
                      onClick={handleCopyXml}
                      className="flex-1 bg-raised hover:bg-selected border border-hair text-fg text-body font-medium py-2 px-3 rounded transition-colors"
                    >
                      {copied ? '✓ Copied XML' : 'Copy PMXML'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadXml}
                      className="flex-1 bg-accent hover:bg-accent/90 text-white text-body font-medium py-2 px-3 rounded transition-colors shadow-sm"
                    >
                      Download P6 Snippet
                    </button>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
