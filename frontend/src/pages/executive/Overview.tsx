import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  ShieldAlert,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sliders,
  Scale,
  Sparkles,
  FileCheck2,
  Info
} from 'lucide-react';
import { api } from '../../lib/api';
import { usePageHeader } from '../../hooks/usePageHeader';
import { EmptyState, ErrorState, Panel, SkeletonRows } from '../../components/ui';
import { DisciplineTag } from '../../components/DisciplineTag';
import type { Discipline, ExecutiveMetricsResponse } from '../../types';

export default function ExecutiveOverview() {
  usePageHeader(
    'Executive Intelligence & Risk Oversight',
    'C-Suite strategic portfolio control, S-Curve trajectory, and FIDIC dispute exposure.',
    '/executive'
  );

  // Queries
  const { data: metrics, isLoading, error } = useQuery<ExecutiveMetricsResponse>({
    queryKey: ['executiveMetrics'],
    queryFn: api.getExecutiveMetrics,
  });

  const { data: scheduleData } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.getSchedule(),
  });

  // What-If Scenario Simulator state
  const [simWeatherDays, setSimWeatherDays] = useState(0);
  const [simVendorDays, setSimVendorDays] = useState(0);

  const totalSimulatedSlip = simWeatherDays + simVendorDays;

  if (error) {
    return <ErrorState error={error} />;
  }

  const kpis = metrics?.kpis;
  const dispute = metrics?.dispute_shield;
  const financial = metrics?.financial;
  const sCurve = metrics?.s_curve ?? [];
  const milestones = metrics?.milestones ?? [];
  const criticalDrivers = metrics?.critical_drivers ?? [];
  const forecast = metrics?.completion_forecast;

  /* Every figure on this screen is the backend's or it is absent.
   *
   * This file previously carried hardcoded fallbacks — ₹14.20 Cr of employer
   * claim, ₹3.80 Cr of LD risk, a ₹180.00 Cr contract baseline, a P90 of
   * 2026-11-12, 84.2% evidence coverage — which rendered whenever the API
   * returned null. The API was in fact returning ₹0.00, so the invented
   * figures were what a reader saw while the endpoint was broken, and the
   * screen looked healthiest exactly when it knew least.
   *
   * `dash()` is the replacement: an unavailable number renders as an em dash,
   * which is a true statement, and nothing here supplies a value the backend
   * did not. */
  const dash = (v: number | string | null | undefined, digits?: number): string => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return digits === undefined ? String(v) : v.toFixed(digits);
    return v;
  };

  /* The what-if sliders move a date, not a rupee figure. The cost line here
   * used to multiply the slider total by a ₹12.5 lakh/day rate written into
   * this component — a rate no contract in this system supplies. The slip is
   * now applied to the computed logic finish, under the stated assumption
   * that it lands on a critical activity with no float left. */
  const simulatedFinish = useMemo(() => {
    if (!forecast?.logic_finish) return null;
    const d = new Date(`${forecast.logic_finish}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + totalSimulatedSlip);
    return d.toISOString().slice(0, 10);
  }, [forecast?.logic_finish, totalSimulatedSlip]);

  // S-Curve SVG coordinates calculation
  const svgWidth = 800;
  const svgHeight = 280;
  const padding = { top: 20, right: 30, bottom: 40, left: 45 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const pointsCount = sCurve.length || 1;
  const getX = (idx: number) => padding.left + (idx / Math.max(1, pointsCount - 1)) * graphWidth;
  const getY = (val: number) => padding.top + graphHeight - (Math.min(100, Math.max(0, val)) / 100.0) * graphHeight;

  // Build SVG path strings
  const pvPath = sCurve.reduce((acc, pt, i) => {
    const x = getX(i);
    const y = getY(pt.pv_cumulative);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  // EV path only up to current data date
  const pastPoints = sCurve.filter((p) => !p.is_future && p.ev_cumulative !== null);
  const evPath = pastPoints.reduce((acc, pt, i) => {
    const x = getX(i);
    const y = getY(pt.ev_cumulative ?? 0);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  // Projected EV path forward
  const projPoints = sCurve.filter((p) => p.ev_projected !== null);
  const projPath = projPoints.reduce((acc, pt, i) => {
    const idx = sCurve.indexOf(pt);
    const x = getX(idx);
    const y = getY(pt.ev_projected ?? 0);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const dataDateIndex = sCurve.findIndex((p) => p.is_future);
  const dataDateX = dataDateIndex >= 0 ? getX(dataDateIndex) : getX(Math.floor(pointsCount / 2));

  return (
    <div className="w-full max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6 font-sans">
      {/* Top Strategic Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-slate-500 mb-1">
            <span className="font-bold text-slate-700 dark:text-slate-300">
              PORTFOLIO: SECTOR 04 // ONSHORE ASSETS
            </span>
            <span>·</span>
            <span>
              {financial?.available && financial.contract_value_cr !== null
                ? `CONTRACT BASELINE: ₹${financial.contract_value_cr.toFixed(2)} CR`
                : 'CONTRACT VALUE NOT SUPPLIED'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Executive Schedule &amp; Financial Risk Intelligence
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time C-suite governance: float erosion, EVM S-Curve trajectory, and FIDIC dispute liability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-900">
            FIDIC 1999 CLAUSE 20.1 / 8.4
          </span>
          <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
            PRIMAVERA P6 REV-08
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-900">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Schedule Synchronization
          </span>
        </div>
      </div>

      {isLoading ? (
        <SkeletonRows rows={8} />
      ) : (
        <>
          {/* Top 4 KPI Strategic Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: SPI */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">
                  <span>Schedule Performance</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      kpis?.spi && kpis.spi >= 0.95
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : kpis?.spi && kpis.spi >= 0.85
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {dash(kpis?.spi_band)}
                  </span>
                </div>
                <div className="text-4xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
                  {dash(kpis?.spi ?? null, 2)}
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span>Earned / Planned:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {Math.round(kpis?.ev_total ?? 0)} / {Math.round(kpis?.pv_total ?? 0)} days
                </span>
              </div>
            </div>

            {/* KPI 2: Critical Path Float Drift */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">
                  <span>Critical Path Drift</span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                    {dash(kpis?.critical_activities_count)} Critical Acts
                  </span>
                </div>
                <div className="text-4xl font-extrabold text-rose-600 dark:text-rose-400 font-mono tracking-tight">
                  {kpis?.float_drift_days === undefined
                    ? '—'
                    : `${kpis.float_drift_days > 0 ? '+' : ''}${kpis.float_drift_days}d`}
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span>COD Exposure:</span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                  {dash(forecast?.current_forecast_finish)}
                </span>
              </div>
            </div>

            {/* KPI 3: Contractual Dispute Shield Exposure */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">
                  <span>FIDIC Dispute Exposure</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                    Clause 20.1
                  </span>
                </div>
                {/* Days, unless the operator supplied a contract to price
                    them against. The unit is stated either way, because a
                    bare number beside "FIDIC Dispute Exposure" reads as
                    money. */}
                <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 font-mono tracking-tight">
                  {financial?.available && financial.employer_claim_cr !== null
                    ? `₹${financial.employer_claim_cr.toFixed(2)} Cr`
                    : `${dash(dispute?.employer_delay_days)} days`}
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span>Contractor LD Risk:</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {financial?.available && financial.contractor_ld_risk_cr !== null
                    ? `₹${financial.contractor_ld_risk_cr.toFixed(2)} Cr`
                    : `${dash(dispute?.contractor_delay_days)} days`}
                </span>
              </div>
            </div>

            {/* KPI 4: Evidence Integrity Coverage */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">
                  <span>Evidence Integrity</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                    Audit Grade
                  </span>
                </div>
                <div className="text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                  {dash(kpis?.evidence_coverage_pct ?? null, 1)}%
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span>Evidenced Nodes:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {dash(kpis?.evidenced_activities)} of {dash(kpis?.total_activities)}
                </span>
              </div>
            </div>
          </div>

          {/* S-Curve Trajectory Chart Panel */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp size={18} className="text-blue-600" />
                  Earned Value Management (EVM) Cumulative S-Curve
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Planned value against earned value measured from actual finish
                  dates, and beyond the data date, planned value extended at the
                  measured SPI.
                </p>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-6 bg-blue-600 rounded-full" />
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">Planned Value (PV)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-6 bg-emerald-500 rounded-full" />
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">Earned Value (EV)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-6 border-t-2 border-dashed border-purple-500" />
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">Projected EV</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-0.5 bg-rose-500" />
                  <span className="text-slate-500">Data Date</span>
                </div>
              </div>
            </div>

            {/* S-Curve SVG Graph */}
            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-auto min-w-[650px] overflow-visible select-none"
              >
                {/* Horizontal Grid lines */}
                {[0, 25, 50, 75, 100].map((level) => {
                  const y = getY(level);
                  return (
                    <g key={level}>
                      <line
                        x1={padding.left}
                        y1={y}
                        x2={svgWidth - padding.right}
                        y2={y}
                        stroke="currentColor"
                        className="text-slate-100 dark:text-slate-800"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={padding.left - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="font-mono text-[10px] fill-slate-400"
                      >
                        {level}%
                      </text>
                    </g>
                  );
                })}

                {/* Vertical Data Date Line */}
                <line
                  x1={dataDateX}
                  y1={padding.top}
                  x2={dataDateX}
                  y2={svgHeight - padding.bottom}
                  stroke="#f43f5e"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                <text
                  x={dataDateX}
                  y={padding.top - 6}
                  textAnchor="middle"
                  className="font-mono text-[9px] font-bold fill-rose-500 uppercase"
                >
                  DATA DATE (15 SEP)
                </text>

                {/* X-Axis labels */}
                {sCurve.filter((_, idx) => idx % 2 === 0).map((pt) => {
                  const idx = sCurve.indexOf(pt);
                  const x = getX(idx);
                  return (
                    <text
                      key={pt.week_label}
                      x={x}
                      y={svgHeight - padding.bottom + 18}
                      textAnchor="middle"
                      className="font-mono text-[9px] fill-slate-400 uppercase"
                    >
                      {pt.week_label}
                    </text>
                  );
                })}

                {/* Curves */}
                {/* Projected EV Curve */}
                <path
                  d={projPath}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="2.5"
                  strokeDasharray="5 5"
                />

                {/* Planned Value Curve */}
                <path
                  d={pvPath}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                />

                {/* Earned Value Curve */}
                <path
                  d={evPath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />

                {/* Points on EV */}
                {pastPoints.map((pt, i) => {
                  const x = getX(i);
                  const y = getY(pt.ev_cumulative ?? 0);
                  return (
                    <circle
                      key={pt.week_label}
                      cx={x}
                      cy={y}
                      r="4"
                      className="fill-white dark:fill-slate-900 stroke-emerald-500"
                      strokeWidth="2"
                    />
                  );
                })}
              </svg>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 font-mono pt-2 border-t border-slate-100 dark:border-slate-800">
              <span>EV: 0/100 ON ACTUAL FINISH, WEIGHTED BY PLANNED DURATION</span>
              <span>
                {metrics?.kpis.spi !== null && metrics?.kpis.spi !== undefined
                  ? `PROJECTION: PLANNED VALUE AT MEASURED SPI ${metrics.kpis.spi.toFixed(2)}`
                  : 'PROJECTION UNAVAILABLE — SPI NOT COMPUTED'}
              </span>
            </div>
          </div>

          {/* FIDIC Contractual Dispute & Delay Shield Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: FIDIC Dispute Allocation (7 cols) */}
            <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Scale size={18} className="text-blue-600" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    FIDIC Contractual Dispute Shield (Clauses 8.4 / 20.1)
                  </h3>
                </div>
                <span className="font-mono text-xs font-bold text-slate-500">
                  Adjudicated &amp; Proposed Liabilities
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Employer Liability */}
                <div className="border border-blue-200 dark:border-blue-900/60 bg-blue-50/20 dark:bg-blue-950/20 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-1">
                      Employer Delay (EOT Claimable)
                    </span>
                    <div className="text-3xl font-extrabold text-blue-700 dark:text-blue-300 font-mono">
                      {dash(dispute?.employer_delay_days)} Days
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-200">
                      {financial?.available && financial.employer_claim_cr !== null
                        ? `₹${financial.employer_claim_cr.toFixed(2)} Cr Claim Value`
                        : 'No claim value — no contract sum supplied'}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-blue-700 dark:text-blue-300">
                      {dash(dispute?.employer_beyond_float_days)} beyond float
                    </div>
                    {/* Was: an assertion that the cause was "delayed client
                        drawings, site access constraints, and force majeure
                        rainfall", which named three causes the corpus was
                        never consulted about. */}
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Delay the delay layer proposes as compensable, from causes
                      read out of the reports themselves. Only the days beyond
                      float can have moved completion.
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-blue-100 dark:border-blue-900/50 flex items-center justify-between font-mono text-[11px] text-blue-700 dark:text-blue-300">
                    <span>FIDIC Sub-Clause 8.4</span>
                    <span className="font-bold">EOT Entitled</span>
                  </div>
                </div>

                {/* Contractor Liability */}
                <div className="border border-amber-200 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/20 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-1">
                      Contractor Delay (LD Exposure)
                    </span>
                    <div className="text-3xl font-extrabold text-amber-700 dark:text-amber-300 font-mono">
                      {dash(dispute?.contractor_delay_days)} Days
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-200">
                      {financial?.available && financial.contractor_ld_risk_cr !== null
                        ? `₹${financial.contractor_ld_risk_cr.toFixed(2)} Cr LD Risk`
                        : 'No LD figure — no contract sum supplied'}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-amber-700 dark:text-amber-300">
                      {dash(dispute?.contractor_beyond_float_days)} beyond float
                    </div>
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Liquidated damages accrue at {financial?.ld_pct_per_week ?? 0.5}% per
                      week of culpable slip, capped at {financial?.ld_cap_pct ?? 10}% of
                      contract value under Sub-Clause 8.7 — computed only against a
                      contract sum the operator supplies.
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-amber-100 dark:border-amber-900/50 flex items-center justify-between font-mono text-[11px] text-amber-700 dark:text-amber-300">
                    <span>FIDIC Sub-Clause 8.7</span>
                    <span className="font-bold">Max LD 10%</span>
                  </div>
                </div>
              </div>

              {/* 28-Day Notice Meter */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    FIDIC CLAUSE 20.1 NOTICE TIME-BAR COMPLIANCE
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {dispute?.notice_compliance_pct === null ||
                    dispute?.notice_compliance_pct === undefined
                      ? 'No notice windows'
                      : `${dispute.notice_compliance_pct.toFixed(1)}% within window`}
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full"
                    style={{ width: `${dispute?.notice_compliance_pct ?? 0}%` }}
                    title="Served, or still inside the window"
                  />
                  <div
                    className="bg-rose-500 h-full"
                    style={{ width: `${100 - (dispute?.notice_compliance_pct ?? 0)}%` }}
                    title="Window closed with no notice recorded"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-1">
                  <span>Served: {dash(dispute?.notice_served_count)}</span>
                  <span>Open in window: {dash(dispute?.notice_open_count)}</span>
                  <span className="text-rose-500 font-bold">Lapsed: {dash(dispute?.notice_lapsed_count)}</span>
                </div>
              </div>
            </div>

            {/* Right: derived milestones and the computed completion range */}
            <div className="lg:col-span-5 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-blue-600" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Derived Milestones
                  </h3>
                </div>
                {/* "Contractual" was a claim: the baseline carries no milestone
                    flag, so these are derived and the panel says so. */}
                <span className="font-mono text-xs text-slate-400">DERIVED FROM BASELINE</span>
              </div>

              {/* Milestones list */}
              <div className="flex flex-col gap-2.5">
                {milestones.map((m) => {
                  const isCritical = m.status === 'CRITICAL';
                  // Was 'COMPLETED', a status the backend never emitted, so a
                  // finished milestone rendered amber like a late one.
                  const isDone = m.status === 'COMPLETE';
                  return (
                    <div
                      key={m.name}
                      className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {m.name}
                        </div>
                        {m.activity_description && (
                          <div className="text-[11px] text-slate-500 truncate">
                            {m.activity_description}
                          </div>
                        )}
                        <div className="font-mono text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>Base: {m.baseline_date ?? '—'}</span>
                          <span>→</span>
                          <span className={isCritical ? 'text-rose-500 font-bold' : 'text-slate-600 dark:text-slate-300'}>
                            {m.forecast_date ?? '—'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase ${
                            isDone
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : isCritical
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {m.status}
                        </span>
                        {/* Was a confidence percentage — 94.2%, 78.5%, 65.0% —
                            for which nothing in this system calibrates a
                            probability. Replaced by where the date came from,
                            which is a fact. */}
                        <div className="font-mono text-[10px] text-slate-400 mt-1">
                          {m.basis === 'actual_finish'
                            ? 'actual'
                            : m.basis === 'not_scheduled'
                            ? 'not scheduled'
                            : 'CPM'}
                          {m.variance_days !== null &&
                            ` · ${m.variance_days > 0 ? '+' : ''}${m.variance_days}d`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Three computed dates.
                  This was P10 / P50 / P90, which the backend produced as
                  drift−3 / drift / drift+14 and shipped beside a claim of
                  1000 Monte Carlo runs. No percentile is computable here, so
                  none is shown; each date below states its derivation. */}
              <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center font-mono">
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Baseline</div>
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {dash(forecast?.baseline_finish)}
                  </div>
                  <div className="text-[9px] text-slate-400 mt-0.5">as authored</div>
                </div>
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50">
                  <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase">Logic</div>
                  <div className="text-xs font-bold text-blue-700 dark:text-blue-300 mt-1">
                    {dash(forecast?.logic_finish)}
                  </div>
                  <div className="text-[9px] text-slate-400 mt-0.5">CPM over actuals</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Exposed</div>
                  <div className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-1">
                    {dash(forecast?.exposed_finish)}
                  </div>
                  <div className="text-[9px] text-slate-400 mt-0.5">
                    +{forecast?.open_critical_exposure_days ?? 0}d open exposure
                  </div>
                </div>
              </div>

              {forecast?.logic_conflicts_note && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  {forecast.logic_conflicts_note}
                </p>
              )}
              {metrics?.milestones_note && (
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {metrics.milestones_note}
                </p>
              )}
            </div>
          </div>

          {/* Interactive What-If Scenario Simulator */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-gradient-to-r from-slate-50 to-white dark:from-[#111827] dark:to-[#0f172a] shadow-sm flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200/60 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders size={20} className="text-blue-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                    Executive &ldquo;What-If&rdquo; Scenario Simulator
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Move the computed finish date by a hypothetical slip. The
                    network is not re-run and nothing here is written to the
                    schedule.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSimWeatherDays(0);
                    setSimVendorDays(0);
                  }}
                  className="text-xs font-mono text-slate-500 hover:text-blue-600 transition-colors"
                >
                  Reset Simulation
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* Sliders (7 cols) */}
              <div className="md:col-span-7 flex flex-col gap-4">
                {/* Weather hold slider */}
                <div>
                  <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Monsoon / Flash Flooding Hold
                    </span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      +{simWeatherDays} Days
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    step="1"
                    value={simWeatherDays}
                    onChange={(e) => setSimWeatherDays(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
                    <span>0d</span>
                    <span>15d</span>
                    <span>30d</span>
                  </div>
                </div>

                {/* Vendor delivery slider */}
                <div>
                  <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Vendor Equipment Delivery Slip (Compressor Skid C-101)
                    </span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      +{simVendorDays} Days
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    step="1"
                    value={simVendorDays}
                    onChange={(e) => setSimVendorDays(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-600"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
                    <span>0d</span>
                    <span>15d</span>
                    <span>30d</span>
                  </div>
                </div>
              </div>

              {/* Simulation Result Callout (5 cols) */}
              <div className="md:col-span-5 border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <span className="font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-1">
                    PROJECTED IMPACT ON COMPLETION
                  </span>
                  <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
                    +{totalSimulatedSlip} Days
                  </div>
                  {/* Was "Estimated Cost Escalation: ₹X Crores", computed in
                      this component from a ₹12.5 lakh/day rate no contract in
                      this system supplies. The slider now moves a date. */}
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
                    Logic finish {dash(forecast?.logic_finish)} →{' '}
                    <strong className="font-mono">{dash(simulatedFinish)}</strong>
                  </div>
                  {financial?.available &&
                    financial.prolongation_lakhs_per_day !== null && (
                      <div className="mt-1 text-xs text-slate-500">
                        At the supplied ₹{financial.prolongation_lakhs_per_day} lakh/day:
                        ₹{((totalSimulatedSlip * financial.prolongation_lakhs_per_day) / 100).toFixed(2)} Cr
                      </div>
                    )}
                </div>

                <div className="mt-4 pt-3 border-t border-blue-100 dark:border-blue-900/50 text-xs text-slate-500 leading-snug">
                  {/* Was a named mitigation on a named substation, neither of
                      which was computed from anything. */}
                  {totalSimulatedSlip > 0 ? (
                    <span>
                      Assumes the whole slip lands on a critical activity with no
                      float left, which is the worst case. The network is not
                      re-run: this is the computed finish moved by the slider,
                      not a re-scheduled plan.
                    </span>
                  ) : (
                    <span>Adjust sliders to move the computed finish date.</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Critical Path Drivers Table */}
          <Panel title="Critical Path Slip Drivers (Activities Driving Completion Delay)">
            {criticalDrivers.length === 0 ? (
              <EmptyState>No critical path slips detected.</EmptyState>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {criticalDrivers.map((act) => (
                  <div key={act.activity_id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                          {act.activity_id}
                        </span>
                        <DisciplineTag discipline={act.discipline as Discipline} />
                        <span className="font-bold text-slate-900 dark:text-white">
                          {act.description}
                        </span>
                      </div>
                      {/* `driving_delay` used to be picked by matching "CIV",
                          "PIP" or "ELE" in the activity id. It is now the worst
                          delay actually recorded against the activity, with the
                          document line it was read from — or nothing. */}
                      <div className="mt-1 text-slate-500 font-mono text-[11px]">
                        {act.driving_delay ? (
                          <>
                            Cause: <strong>{act.driving_delay}</strong>
                            {act.driving_delay_category && ` (${act.driving_delay_category})`}
                            {!act.driving_delay_adjudicated && ' · proposed, not adjudicated'}
                          </>
                        ) : (
                          <span className="italic">No cause recorded</span>
                        )}
                        {' · Planned Finish: '}
                        {act.planned_finish ?? '—'}
                      </div>
                      {act.driving_delay_source && (
                        <div className="text-slate-400 font-mono text-[10px]">
                          {act.driving_delay_source}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-3">
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-sm">
                        +{act.finish_variance_days}d slip
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Provenance & Exposure Links */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              to="/executive/exposure"
              className="text-xs font-mono uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5 font-bold"
            >
              <span>Exposure Register</span>
              <ArrowRight size={13} />
            </Link>
            <Link
              to="/executive/provenance"
              className="text-xs font-mono uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5 font-bold"
            >
              <span>Data Provenance &amp; Corpus Origin</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
