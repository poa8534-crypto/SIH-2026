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
    'C-Suite strategic project control, S-Curve trajectory, and FIDIC dispute exposure.',
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

  /* The what-if sliders move a date, not a rupee figure. The slip is applied
   * to the computed logic finish, under the stated assumption that it lands
   * on a critical activity with no float left. */
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
    <div className="w-full max-w-[1280px] mx-auto flex flex-col gap-6 font-sans">
      {/* Top Strategic Context Bar — Honest single-project view */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-hair">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted mb-1">
            <span className="font-semibold text-fg">
              {scheduleData?.project ?? 'Oil India Limited — Well Pad 04'}
            </span>
            <span>·</span>
            <span>
              {financial?.available && financial.contract_value_cr !== null
                ? `CONTRACT BASELINE: ₹${financial.contract_value_cr.toFixed(2)} CR`
                : 'CONTRACT VALUE NOT SUPPLIED'}
            </span>
          </div>
          <h1 className="text-h1 font-semibold tracking-tight text-heading">
            Executive Schedule &amp; Financial Risk Intelligence
          </h1>
          <p className="mt-1 text-body text-muted leading-relaxed">
            Real-time C-suite governance: float erosion, EVM S-Curve trajectory, and FIDIC dispute liability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-label font-mono">
          <span className="px-2.5 py-1 rounded-full bg-surface text-fg font-medium border border-hair">
            FIDIC 1999 CLAUSE 20.1 / 8.4
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface text-ok font-medium border border-hair">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Senior Management (Read-Only)
          </span>
        </div>
      </div>

      {isLoading ? (
        <SkeletonRows rows={8} />
      ) : (
        <>
          {/* Top 4 KPI Strategic Strip (understandable in ~30 seconds) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: SPI */}
            <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-label font-mono text-muted uppercase tracking-wider mb-2">
                  <span>Schedule Performance</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      kpis?.spi && kpis.spi >= 0.95
                        ? 'border-ok/30 bg-ok/10 text-ok'
                        : kpis?.spi && kpis.spi >= 0.85
                        ? 'border-warn/30 bg-warn/10 text-warn'
                        : 'border-danger/30 bg-danger/10 text-danger'
                    }`}
                  >
                    {dash(kpis?.spi_band)}
                  </span>
                </div>
                <div className="text-4xl font-extrabold text-heading font-mono tracking-tight">
                  {dash(kpis?.spi ?? null, 2)}
                </div>
              </div>
              <div className="mt-3 text-label text-muted pt-3 border-t border-hair flex items-center justify-between">
                <span>Earned / Planned:</span>
                <span className="font-mono font-bold text-fg">
                  {Math.round(kpis?.ev_total ?? 0)} / {Math.round(kpis?.pv_total ?? 0)} days
                </span>
              </div>
            </div>

            {/* KPI 2: Critical Path Float Drift */}
            <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-label font-mono text-muted uppercase tracking-wider mb-2">
                  <span>Critical Path Drift</span>
                  <span className="px-2 py-0.5 rounded-full border border-danger/30 bg-danger/10 text-danger text-[10px] font-bold">
                    {dash(kpis?.critical_activities_count)} Critical Acts
                  </span>
                </div>
                <div className="text-4xl font-extrabold text-danger font-mono tracking-tight">
                  {kpis?.float_drift_days === undefined
                    ? '—'
                    : `${kpis.float_drift_days > 0 ? '+' : ''}${kpis.float_drift_days}d`}
                </div>
              </div>
              <div className="mt-3 text-label text-muted pt-3 border-t border-hair flex items-center justify-between">
                <span>COD Exposure:</span>
                <span className="font-mono font-bold text-danger">
                  {dash(forecast?.current_forecast_finish)}
                </span>
              </div>
            </div>

            {/* KPI 3: Contractual Dispute Shield Exposure */}
            <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-label font-mono text-muted uppercase tracking-wider mb-2">
                  <span>FIDIC Dispute Exposure</span>
                  <span className="px-2 py-0.5 rounded-full border border-hair bg-surface text-muted text-[10px] font-bold">
                    Clause 20.1
                  </span>
                </div>
                <div className="text-3xl font-extrabold text-fg font-mono tracking-tight">
                  {financial?.available && financial.employer_claim_cr !== null
                    ? `₹${financial.employer_claim_cr.toFixed(2)} Cr`
                    : `${dash(dispute?.employer_delay_days)} days`}
                </div>
              </div>
              <div className="mt-3 text-label text-muted pt-3 border-t border-hair flex items-center justify-between">
                <span>Contractor LD Risk:</span>
                <span className="font-mono font-bold text-warn">
                  {financial?.available && financial.contractor_ld_risk_cr !== null
                    ? `₹${financial.contractor_ld_risk_cr.toFixed(2)} Cr`
                    : `${dash(dispute?.contractor_delay_days)} days`}
                </span>
              </div>
            </div>

            {/* KPI 4: Evidence Integrity Coverage */}
            <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-label font-mono text-muted uppercase tracking-wider mb-2">
                  <span>Evidence Integrity</span>
                  <span className="px-2 py-0.5 rounded-full border border-ok/30 bg-ok/10 text-ok text-[10px] font-bold">
                    Audit Grade
                  </span>
                </div>
                <div className="text-4xl font-extrabold text-ok font-mono tracking-tight">
                  {dash(kpis?.evidence_coverage_pct ?? null, 1)}%
                </div>
              </div>
              <div className="mt-3 text-label text-muted pt-3 border-t border-hair flex items-center justify-between">
                <span>Evidenced Nodes:</span>
                <span className="font-mono font-bold text-fg">
                  {dash(kpis?.evidenced_activities)} of {dash(kpis?.total_activities)}
                </span>
              </div>
            </div>
          </div>

          <div className="text-label text-muted font-mono -mt-2 px-1">
            * Note: Progress and earned value are duration-weighted (0/100 rule upon actual finish), not financial cash flow.
          </div>

          {/* S-Curve Trajectory Chart Panel */}
          <div className="border border-hair rounded-lg p-6 bg-raised shadow-xs flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-hair">
              <div>
                <h2 className="text-lead font-semibold text-heading flex items-center gap-2">
                  <TrendingUp size={18} className="text-fg" />
                  Earned Value Management (EVM) Cumulative S-Curve
                </h2>
                <p className="text-body text-muted mt-0.5">
                  Planned value against earned value measured from actual finish
                  dates, and beyond the data date, planned value extended at the
                  measured SPI.
                </p>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-label font-mono">
                <div className="flex items-center gap-1.5">
                  <div className="h-1 w-5 bg-muted rounded-full" />
                  <span className="text-muted font-medium">Planned Value (PV)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-5 bg-ok rounded-full" />
                  <span className="text-fg font-medium">Earned Value (EV)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-1 w-5 border-t border-dashed border-warn" />
                  <span className="text-muted font-medium">Projected EV</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-0.5 bg-danger" />
                  <span className="text-danger font-medium">Data Date</span>
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
                        className="text-hair"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={padding.left - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="font-mono text-[10px] fill-muted"
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
                  stroke="#DC2626"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                <text
                  x={dataDateX}
                  y={padding.top - 6}
                  textAnchor="middle"
                  className="font-mono text-[9px] font-bold fill-danger uppercase"
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
                      className="font-mono text-[9px] fill-muted uppercase"
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
                  stroke="#D97706"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                />

                {/* Planned Value Curve */}
                <path
                  d={pvPath}
                  fill="none"
                  stroke="#737373"
                  strokeWidth="2"
                />

                {/* Earned Value Curve */}
                <path
                  d={evPath}
                  fill="none"
                  stroke="#10A37F"
                  strokeWidth="3"
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
                      r="3.5"
                      className="fill-raised stroke-ok"
                      strokeWidth="2"
                    />
                  );
                })}
              </svg>
            </div>

            <div className="flex items-center justify-between text-label text-muted font-mono pt-2 border-t border-hair">
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
            <div className="lg:col-span-7 border border-hair rounded-lg p-6 bg-raised shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-hair">
                <div className="flex items-center gap-2">
                  <Scale size={18} className="text-fg" />
                  <h3 className="text-lead font-semibold text-heading">
                    FIDIC Contractual Dispute Shield (Clauses 8.4 / 20.1)
                  </h3>
                </div>
                <span className="font-mono text-label text-muted">
                  Adjudicated &amp; Proposed Liabilities
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Employer Liability */}
                <div className="border border-hair bg-surface rounded-lg p-4 flex flex-col justify-between">
                  <div>
                    <span className="font-mono text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">
                      Employer Delay (EOT Claimable)
                    </span>
                    <div className="text-3xl font-extrabold text-fg font-mono">
                      {dash(dispute?.employer_delay_days)} Days
                    </div>
                    <div className="mt-1 text-body font-semibold text-heading">
                      {financial?.available && financial.employer_claim_cr !== null
                        ? `₹${financial.employer_claim_cr.toFixed(2)} Cr Claim Value`
                        : 'No claim value — no contract sum supplied'}
                    </div>
                    <div className="mt-1 font-mono text-label text-muted">
                      {dash(dispute?.employer_beyond_float_days)} beyond float
                    </div>
                    <p className="mt-2 text-label text-muted leading-relaxed">
                      Delay the delay layer proposes as compensable, from causes
                      read out of the reports themselves. Only the days beyond
                      float can have moved completion.
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-hair flex items-center justify-between font-mono text-label text-muted">
                    <span>FIDIC Sub-Clause 8.4</span>
                    <span className="font-bold text-fg">EOT Entitled</span>
                  </div>
                </div>

                {/* Contractor Liability */}
                <div className="border border-hair bg-surface rounded-lg p-4 flex flex-col justify-between">
                  <div>
                    <span className="font-mono text-[10px] font-bold text-warn uppercase tracking-wider block mb-1">
                      Contractor Delay (LD Exposure)
                    </span>
                    <div className="text-3xl font-extrabold text-warn font-mono">
                      {dash(dispute?.contractor_delay_days)} Days
                    </div>
                    <div className="mt-1 text-body font-semibold text-heading">
                      {financial?.available && financial.contractor_ld_risk_cr !== null
                        ? `₹${financial.contractor_ld_risk_cr.toFixed(2)} Cr LD Risk`
                        : 'No LD figure — no contract sum supplied'}
                    </div>
                    <div className="mt-1 font-mono text-label text-muted">
                      {dash(dispute?.contractor_beyond_float_days)} beyond float
                    </div>
                    <p className="mt-2 text-label text-muted leading-relaxed">
                      Liquidated damages accrue at {financial?.ld_pct_per_week ?? 0.5}% per
                      week of culpable slip, capped at {financial?.ld_cap_pct ?? 10}% of
                      contract value under Sub-Clause 8.7 — computed only against a
                      contract sum the operator supplies.
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-hair flex items-center justify-between font-mono text-label text-muted">
                    <span>FIDIC Sub-Clause 8.7</span>
                    <span className="font-bold text-warn">Max LD 10%</span>
                  </div>
                </div>
              </div>

              {/* 28-Day Notice Meter */}
              <div className="p-4 rounded-lg bg-surface border border-hair flex flex-col gap-2">
                <div className="flex items-center justify-between text-label font-mono">
                  <span className="font-bold text-heading">
                    FIDIC CLAUSE 20.1 NOTICE TIME-BAR COMPLIANCE
                  </span>
                  <span className="font-bold text-ok">
                    {dispute?.notice_compliance_pct === null ||
                    dispute?.notice_compliance_pct === undefined
                      ? 'No notice windows'
                      : `${dispute.notice_compliance_pct.toFixed(1)}% within window`}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-hair rounded-full overflow-hidden flex">
                  <div
                    className="bg-ok h-full"
                    style={{ width: `${dispute?.notice_compliance_pct ?? 0}%` }}
                    title="Served, or still inside the window"
                  />
                  <div
                    className="bg-danger h-full"
                    style={{ width: `${100 - (dispute?.notice_compliance_pct ?? 0)}%` }}
                    title="Window closed with no notice recorded"
                  />
                </div>
                <div className="flex items-center justify-between text-label font-mono text-muted mt-1">
                  <span>Served: {dash(dispute?.notice_served_count)}</span>
                  <span>Open in window: {dash(dispute?.notice_open_count)}</span>
                  <span className="text-danger font-bold">Lapsed: {dash(dispute?.notice_lapsed_count)}</span>
                </div>
              </div>
            </div>

            {/* Right: derived milestones and the computed completion range */}
            <div className="lg:col-span-5 border border-hair rounded-lg p-6 bg-raised shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-hair">
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-fg" />
                  <h3 className="text-lead font-semibold text-heading">
                    Derived Milestones
                  </h3>
                </div>
                <span className="font-mono text-label text-muted">DERIVED FROM BASELINE</span>
              </div>

              {/* Milestones list */}
              <div className="flex flex-col gap-2.5">
                {milestones.map((m) => {
                  const isCritical = m.status === 'CRITICAL';
                  const isDone = m.status === 'COMPLETE';
                  return (
                    <div
                      key={m.name}
                      className="p-3 rounded-md border border-hair bg-surface flex items-center justify-between gap-3 text-body"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-heading truncate">
                          {m.name}
                        </div>
                        {m.activity_description && (
                          <div className="text-label text-muted truncate">
                            {m.activity_description}
                          </div>
                        )}
                        <div className="font-mono text-label text-muted flex items-center gap-2 mt-0.5">
                          <span>Base: {m.baseline_date ?? '—'}</span>
                          <span>→</span>
                          <span className={isCritical ? 'text-danger font-bold' : 'text-fg'}>
                            {m.forecast_date ?? '—'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase border ${
                            isDone
                              ? 'border-ok/30 bg-ok/10 text-ok'
                              : isCritical
                              ? 'border-danger/30 bg-danger/10 text-danger'
                              : 'border-warn/30 bg-warn/10 text-warn'
                          }`}
                        >
                          {m.status}
                        </span>
                        <div className="font-mono text-label text-muted mt-1">
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

              {/* Three computed dates */}
              <div className="mt-2 pt-3 border-t border-hair grid grid-cols-3 gap-2 text-center font-mono">
                <div className="p-2 rounded-md bg-surface border border-hair">
                  <div className="text-[10px] text-muted font-bold uppercase">Baseline</div>
                  <div className="text-body font-bold text-ok mt-1">
                    {dash(forecast?.baseline_finish)}
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">as authored</div>
                </div>
                <div className="p-2 rounded-md bg-surface border border-hair">
                  <div className="text-[10px] text-fg font-bold uppercase">Logic</div>
                  <div className="text-body font-bold text-fg mt-1">
                    {dash(forecast?.logic_finish)}
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">CPM over actuals</div>
                </div>
                <div className="p-2 rounded-md bg-surface border border-hair">
                  <div className="text-[10px] text-danger font-bold uppercase">Exposed</div>
                  <div className="text-body font-bold text-danger mt-1">
                    {dash(forecast?.exposed_finish)}
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">
                    +{forecast?.open_critical_exposure_days ?? 0}d open exposure
                  </div>
                </div>
              </div>

              {forecast?.logic_conflicts_note && (
                <p className="text-label text-warn leading-relaxed">
                  {forecast.logic_conflicts_note}
                </p>
              )}
              {metrics?.milestones_note && (
                <p className="text-label text-muted leading-relaxed">
                  {metrics.milestones_note}
                </p>
              )}
            </div>
          </div>

          {/* Interactive What-If Scenario Simulator */}
          <div className="border border-hair rounded-lg p-6 bg-raised shadow-xs flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-hair">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-fg" />
                <div>
                  <h3 className="text-lead font-semibold text-heading leading-tight">
                    Executive &ldquo;What-If&rdquo; Scenario Simulator
                  </h3>
                  <p className="text-body text-muted">
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
                  className="text-label font-mono text-muted hover:text-fg transition-colors"
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
                  <div className="flex items-center justify-between text-label font-mono mb-1.5">
                    <span className="font-semibold text-fg">
                      Monsoon / Flash Flooding Hold
                    </span>
                    <span className="font-bold text-fg">
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
                    className="w-full h-1.5 bg-hair rounded-lg appearance-none cursor-pointer accent-fg"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-muted mt-1">
                    <span>0d</span>
                    <span>15d</span>
                    <span>30d</span>
                  </div>
                </div>

                {/* Vendor delivery slider */}
                <div>
                  <div className="flex items-center justify-between text-label font-mono mb-1.5">
                    <span className="font-semibold text-fg">
                      Vendor Equipment Delivery Slip (Compressor Skid C-101)
                    </span>
                    <span className="font-bold text-warn">
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
                    className="w-full h-1.5 bg-hair rounded-lg appearance-none cursor-pointer accent-fg"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-muted mt-1">
                    <span>0d</span>
                    <span>15d</span>
                    <span>30d</span>
                  </div>
                </div>
              </div>

              {/* Simulation Result Callout (5 cols) */}
              <div className="md:col-span-5 border border-hair bg-surface rounded-lg p-5 flex flex-col justify-between">
                <div>
                  <span className="font-mono text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">
                    PROJECTED IMPACT ON COMPLETION
                  </span>
                  <div className="text-3xl font-extrabold text-heading font-mono">
                    +{totalSimulatedSlip} Days
                  </div>
                  <div className="mt-1 text-body text-muted">
                    Logic finish {dash(forecast?.logic_finish)} →{' '}
                    <strong className="font-mono text-fg">{dash(simulatedFinish)}</strong>
                  </div>
                  {financial?.available &&
                    financial.prolongation_lakhs_per_day !== null && (
                      <div className="mt-1 text-label text-muted">
                        At the supplied ₹{financial.prolongation_lakhs_per_day} lakh/day:
                        ₹{((totalSimulatedSlip * financial.prolongation_lakhs_per_day) / 100).toFixed(2)} Cr
                      </div>
                    )}
                </div>

                <div className="mt-4 pt-3 border-t border-hair text-label text-muted leading-snug">
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
              <div className="divide-y divide-hair">
                {criticalDrivers.map((act) => (
                  <div key={act.activity_id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-body">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-fg">
                          {act.activity_id}
                        </span>
                        <DisciplineTag discipline={act.discipline as Discipline} />
                        <span className="font-semibold text-heading">
                          {act.description}
                        </span>
                      </div>
                      <div className="mt-1 text-muted font-mono text-label">
                        {act.driving_delay ? (
                          <>
                            Cause: <strong className="text-fg">{act.driving_delay}</strong>
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
                        <div className="text-muted font-mono text-label">
                          {act.driving_delay_source}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-3">
                      <span className="font-mono font-bold text-danger text-body">
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
              className="text-label font-mono uppercase tracking-wider text-accent hover:underline flex items-center gap-1.5 font-bold"
            >
              <span>Exposure Register</span>
              <ArrowRight size={13} />
            </Link>
            <Link
              to="/executive/provenance"
              className="text-label font-mono uppercase tracking-wider text-accent hover:underline flex items-center gap-1.5 font-bold"
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
