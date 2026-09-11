import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sliders,
  RotateCcw,
  Info,
} from 'lucide-react';
import { api } from '../../lib/api';
import { usePageHeader } from '../../hooks/usePageHeader';
import { pluralise } from '../../lib/units';
import { PROJECT } from '../../config';
import { SkeletonRows, ErrorState } from '../../components/ui';
import type { ExecutiveMetricsResponse } from '../../types';

export default function ExecutiveForecasts() {
  usePageHeader(
    'Completion Forecasts & Scenario Modeling',
    'Deterministic CPM completion outlook, critical drivers, and exploratory what-if levers.',
    '/executive/forecasts'
  );

  // What-If Scenario State
  const [weatherDelayDays, setWeatherDelayDays] = useState(0);
  const [vendorLeadDays, setVendorLeadDays] = useState(0);
  const [productivityShiftPct, setProductivityShiftPct] = useState(0);

  // Queries
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useQuery<ExecutiveMetricsResponse>({
    queryKey: ['executiveMetrics'],
    queryFn: api.getExecutiveMetrics,
  });

  const { data: scheduleData, error: scheduleError } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.getSchedule(),
  });

  const forecast = metrics?.completion_forecast;
  const criticalDrivers = metrics?.critical_drivers ?? [];
  const dataDate = scheduleData?.data_date ?? metrics?.as_of ?? PROJECT.dataDate;

  // Total net simulated slip
  // Productivity shift: -20% productivity adds days; +20% reduces days
  const productivityDaysAdjustment = useMemo(() => {
    if (productivityShiftPct === 0) return 0;
    // Applied to remaining critical activities (assume ~30 days remaining)
    const baseRemaining = 30;
    const factor = 1 / (1 + productivityShiftPct / 100);
    return Math.round(baseRemaining * (factor - 1));
  }, [productivityShiftPct]);

  const totalSimulatedSlip = weatherDelayDays + vendorLeadDays + productivityDaysAdjustment;

  const simulatedFinish = useMemo(() => {
    if (!forecast?.logic_finish) return null;
    const d = new Date(`${forecast.logic_finish}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + totalSimulatedSlip);
    return d.toISOString().slice(0, 10);
  }, [forecast?.logic_finish, totalSimulatedSlip]);

  const resetScenario = () => {
    setWeatherDelayDays(0);
    setVendorLeadDays(0);
    setProductivityShiftPct(0);
  };

  const isScenarioActive = weatherDelayDays !== 0 || vendorLeadDays !== 0 || productivityShiftPct !== 0;

  const applyScenario = (weather: number, vendor: number, productivity: number) => {
    setWeatherDelayDays(weather);
    setVendorLeadDays(vendor);
    setProductivityShiftPct(productivity);
  };

  const scenarioName = !isScenarioActive
    ? 'Current logic'
    : weatherDelayDays === 10 && vendorLeadDays === 0 && productivityShiftPct === 0
    ? 'Monsoon hold'
    : weatherDelayDays === 0 && vendorLeadDays === 20 && productivityShiftPct === 0
    ? 'Vendor disruption'
    : weatherDelayDays === 0 && vendorLeadDays === 0 && productivityShiftPct === 15
    ? 'Recovery plan'
    : 'Custom scenario';

  if (metricsError || scheduleError) {
    return <ErrorState error={metricsError || scheduleError} />;
  }

  return (
    <div className="w-full max-w-[1280px] mx-auto flex flex-col gap-6 font-sans">
      {/* ── Context Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-hair">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted mb-1">
            <span className="font-semibold text-fg">
              {scheduleData?.project ?? 'Active project'}
            </span>
            <span>·</span>
            <span>DATA CUTOFF: {dataDate}</span>
          </div>
          <h1 className="text-h1 font-semibold tracking-tight text-heading">
            Completion Forecasts &amp; Scenario Modeling
          </h1>
          <p className="mt-1 text-body text-muted leading-relaxed">
            When might the project finish, and what could change that? Logic-driven completion outlook alongside baseline dates and exploratory management levers.
          </p>
        </div>

        <div className="flex items-center gap-2 text-label font-mono">
          <span className="px-2.5 py-1 rounded-full bg-surface text-fg font-medium border border-hair">
            Deterministic Forward Pass
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface text-ok font-medium border border-hair">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Exploratory Simulation Only
          </span>
        </div>
      </div>

      {/* ── Modeling Notice ── */}
      <div className="p-4 rounded-lg border border-hair bg-raised text-body flex items-start gap-3">
        <Info size={18} className="text-fg shrink-0 mt-0.5" />
        <div className="text-xs text-muted leading-relaxed">
          <strong className="font-semibold text-fg">Methodology &amp; Truth-in-Modeling Notice:</strong> Dates presented reflect deterministic forward-pass CPM logic computed across uncompleted critical activities. They are strictly not Monte Carlo probabilistic outcomes or P80/P90 distributions. What-if scenario levers are temporary in-memory exploratory simulations and cannot mutate or overwrite the official Primavera schedule baseline.
        </div>
      </div>

      {/* ── Completion Outlook Strip ── */}
      {metricsLoading ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Baseline Finish */}
          <div className="border border-hair rounded-lg p-4 sm:p-5 bg-raised shadow-xs">
            <span className="text-label font-mono text-muted uppercase tracking-wider block mb-1">
              Baseline Finish (Contractual)
            </span>
            <div className="text-2xl font-extrabold text-fg font-mono">
              {forecast?.baseline_finish ?? '—'}
            </div>
            <span className="text-xs text-muted mt-1 block">{scheduleData?.baseline?.name ?? 'Active baseline'} authored</span>
          </div>

          {/* Current Logic Finish */}
          <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs">
            <span className="text-label font-mono text-muted uppercase tracking-wider block mb-1">
              Current Logic Finish
            </span>
            <div className="text-2xl font-extrabold text-danger font-mono">
              {forecast?.logic_finish ?? '—'}
            </div>
            <span className="text-xs text-danger mt-1 block">
              {forecast?.variance_days ? `+${forecast.variance_days} days variance` : 'On schedule'}
            </span>
          </div>

          {/* Simulated Scenario Finish */}
          <div className="border border-hair rounded-lg p-5 bg-surface border-fg/30 shadow-xs">
            <span className="text-label font-mono text-muted uppercase tracking-wider block mb-1">
              Simulated Scenario Finish
            </span>
            <div className="text-2xl font-extrabold text-fg font-mono">
              {simulatedFinish ?? '—'}
            </div>
            <span className="text-xs text-muted mt-1 block">
              {totalSimulatedSlip !== 0
                ? `${totalSimulatedSlip > 0 ? '+' : ''}${totalSimulatedSlip}d from current logic`
                : 'Matches current logic finish'}
            </span>
          </div>

          {/* Net Variance */}
          <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs">
            <span className="text-label font-mono text-muted uppercase tracking-wider block mb-1">
              Total Baseline Slip
            </span>
            <div className="text-2xl font-extrabold text-danger font-mono">
              {forecast?.variance_days !== undefined
                ? `+${forecast.variance_days + totalSimulatedSlip}d`
                : '—'}
            </div>
            <span className="text-xs text-muted mt-1 block">Cumulative completion delay</span>
          </div>
        </div>
      )}

      {/* ── What-If Scenario Exploration Simulator ── */}
      <div className="border border-hair rounded-lg p-4 sm:p-6 bg-raised shadow-xs flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-hair">
          <div>
            <h2 className="text-lead font-semibold text-heading flex items-center gap-2">
              <Sliders size={18} className="text-fg" />
              What-If Management Lever Simulator
            </h2>
            <p className="text-body text-muted mt-0.5">
              Simulate operational levers against uncompleted critical path activities with immediate baseline comparison.
            </p>
          </div>

          {isScenarioActive && (
            <button
              type="button"
              onClick={resetScenario}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono border border-hair bg-surface hover:bg-selected text-fg transition-colors"
            >
              <RotateCcw size={13} />
              <span>Reset to Baseline</span>
            </button>
          )}
        </div>

        <div>
          <div className="mb-2 text-label font-semibold uppercase tracking-wide text-muted">Named scenarios</div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { name: 'Current logic', detail: 'No added impact', values: [0, 0, 0] },
              { name: 'Monsoon hold', detail: '+10 weather days', values: [10, 0, 0] },
              { name: 'Vendor disruption', detail: '+20 vendor days', values: [0, 20, 0] },
              { name: 'Recovery plan', detail: '+15% productivity', values: [0, 0, 15] },
            ].map((scenario) => (
              <button
                key={scenario.name}
                type="button"
                onClick={() => applyScenario(...(scenario.values as [number, number, number]))}
                className={`min-h-14 rounded-xl px-3 py-2 text-left ring-1 ring-inset transition-colors ${
                  scenarioName === scenario.name
                    ? 'bg-selected text-fg ring-focus'
                    : 'bg-surface text-muted ring-hair hover:bg-selected/50 hover:text-fg'
                }`}
              >
                <span className="block text-sm font-semibold">{scenario.name}</span>
                <span className="block text-label">{scenario.detail}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sliders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Lever 1: Weather Buffer */}
          <div className="p-4 rounded-lg border border-hair bg-surface flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label htmlFor="weather-slider" className="text-xs font-mono font-bold text-fg uppercase">
                Weather / Monsoon Hold
              </label>
              <span className="font-mono text-xs font-bold text-danger">
                +{weatherDelayDays} Days
              </span>
            </div>
            <input
              id="weather-slider"
              type="range"
              min="0"
              max="30"
              step="1"
              value={weatherDelayDays}
              onChange={(e) => setWeatherDelayDays(parseInt(e.target.value, 10))}
              className="w-full accent-fg h-1.5 bg-hair rounded-lg cursor-pointer"
            />
            <span className="text-[11px] text-muted">
              Simulates severe rainfall halt on active civil foundation works.
            </span>
          </div>

          {/* Lever 2: Material / Vendor Delivery Delay */}
          <div className="p-4 rounded-lg border border-hair bg-surface flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label htmlFor="vendor-slider" className="text-xs font-mono font-bold text-fg uppercase">
                Vendor Delivery Delay
              </label>
              <span className="font-mono text-xs font-bold text-danger">
                +{vendorLeadDays} Days
              </span>
            </div>
            <input
              id="vendor-slider"
              type="range"
              min="0"
              max="45"
              step="1"
              value={vendorLeadDays}
              onChange={(e) => setVendorLeadDays(parseInt(e.target.value, 10))}
              className="w-full accent-fg h-1.5 bg-hair rounded-lg cursor-pointer"
            />
            <span className="text-[11px] text-muted">
              Simulates supply chain lag in valve spools and pump sets.
            </span>
          </div>

          {/* Lever 3: Productivity Shift */}
          <div className="p-4 rounded-lg border border-hair bg-surface flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label htmlFor="prod-slider" className="text-xs font-mono font-bold text-fg uppercase">
                Productivity Adjustment
              </label>
              <span
                className={`font-mono text-xs font-bold ${
                  productivityShiftPct > 0
                    ? 'text-ok'
                    : productivityShiftPct < 0
                    ? 'text-danger'
                    : 'text-fg'
                }`}
              >
                {productivityShiftPct > 0 ? `+${productivityShiftPct}%` : `${productivityShiftPct}%`}
              </span>
            </div>
            <input
              id="prod-slider"
              type="range"
              min="-20"
              max="20"
              step="5"
              value={productivityShiftPct}
              onChange={(e) => setProductivityShiftPct(parseInt(e.target.value, 10))}
              className="w-full accent-fg h-1.5 bg-hair rounded-lg cursor-pointer"
            />
            <span className="text-[11px] text-muted">
              Overtime / crew acceleration (-20% slows, +20% accelerates).
            </span>
          </div>
        </div>

        {/* Simulation Summary Box */}
        <div className="p-4 rounded-lg border border-hair bg-surface/50 text-xs font-mono flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-muted">Simulated Completion Delta:</span>
            <span className="font-bold text-fg text-sm">
              {totalSimulatedSlip > 0 ? `+${totalSimulatedSlip} Days` : totalSimulatedSlip < 0 ? `${totalSimulatedSlip} Days` : '0 Days'}
            </span>
          </div>
          <span className="text-muted">
            {isScenarioActive ? 'Scenario active — Reset available' : 'Baseline state matching Primavera P6 model'}
          </span>
        </div>
      </div>

      {/* ── Critical Path Drivers Section ── */}
      <div className="border border-hair rounded-lg bg-raised overflow-hidden shadow-xs flex flex-col">
        <div className="p-4 border-b border-hair bg-surface/50 flex items-center justify-between">
          <div>
            <h3 className="text-body font-semibold text-heading">
              Critical Path Drivers of Completion
            </h3>
            <span className="text-label text-muted">
              Uncompleted or slipped activities dictating the overall project logic finish.
            </span>
          </div>
          <span className="text-xs font-mono text-muted">
            {pluralise(criticalDrivers.length, 'Driving Activity', 'Driving Activities')}
          </span>
        </div>

        {metricsLoading ? (
          <SkeletonRows rows={4} />
        ) : criticalDrivers.length === 0 ? (
          <div className="p-8 text-center text-muted font-mono text-sm">
            No critical drivers identified. Schedule logic is currently unconstrained.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-body">
              <thead>
                <tr className="border-b border-hair bg-surface text-label font-mono text-muted uppercase">
                  <th className="py-3 px-4">Activity</th>
                  <th className="py-3 px-3">Discipline</th>
                  <th className="py-3 px-3 font-mono">Planned Finish</th>
                  <th className="py-3 px-3 font-mono">Actual / Early Finish</th>
                  <th className="py-3 px-3 font-mono text-right">Variance</th>
                  <th className="py-3 px-3">Driving Delay Cause &amp; Citation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair text-xs">
                {criticalDrivers.map((act) => (
                  <tr key={act.activity_id} className="hover:bg-selected/40 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-semibold text-heading block">{act.description}</span>
                      <span className="font-mono text-muted block mt-0.5">{act.activity_id}</span>
                    </td>

                    <td className="py-3 px-3 font-mono text-muted capitalize">
                      {act.discipline}
                    </td>

                    <td className="py-3 px-3 font-mono text-muted">
                      {act.planned_finish ?? '—'}
                    </td>

                    <td className="py-3 px-3 font-mono text-fg font-semibold">
                      {act.actual_finish ?? act.planned_finish ?? '—'}
                    </td>

                    <td className="py-3 px-3 font-mono text-right font-bold text-danger text-sm">
                      {act.finish_variance_days ? `+${act.finish_variance_days}d` : '0d'}
                    </td>

                    <td className="py-3 px-3">
                      {act.driving_delay ? (
                        <div>
                          <span className="text-fg font-medium block">{act.driving_delay}</span>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-muted">
                            <span>{act.driving_delay_category ?? 'GENERAL'}</span>
                            <span>·</span>
                            <span>{act.driving_delay_source ?? 'Field Log'}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted font-mono">No cause recorded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
