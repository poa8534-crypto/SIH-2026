import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  ShieldAlert,
  Calendar,
  CalendarDays,
  AlertTriangle,
  ArrowRight,
  Sliders,
  Scale,
  Sparkles,
  LineChart as LineChartIcon,
  FileText,
  FileSearch,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { api } from '../../lib/api';
import { usePageHeader } from '../../hooks/usePageHeader';
import { days } from '../../lib/units';
import { ErrorState, SkeletonRows } from '../../components/ui';
import type { ExecutiveMetricsResponse } from '../../types';

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

  const dash = (v: number | string | null | undefined, digits?: number): string => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return digits === undefined ? String(v) : v.toFixed(digits);
    return v;
  };

  const simulatedFinish = useMemo(() => {
    if (!forecast?.logic_finish) return null;
    const d = new Date(`${forecast.logic_finish}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + totalSimulatedSlip);
    return d.toISOString().slice(0, 10);
  }, [forecast?.logic_finish, totalSimulatedSlip]);

  // S-Curve SVG coordinates calculation
  const svgWidth = 800;
  const svgHeight = 260;
  const padding = { top: 20, right: 30, bottom: 40, left: 45 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const pointsCount = sCurve.length || 1;
  const getX = (idx: number) => padding.left + (idx / Math.max(1, pointsCount - 1)) * graphWidth;
  const getY = (val: number) => padding.top + graphHeight - (Math.min(100, Math.max(0, val)) / 100.0) * graphHeight;

  const pvPath = sCurve.reduce((acc, pt, i) => {
    const x = getX(i);
    const y = getY(pt.pv_cumulative);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const pastPoints = sCurve.filter((p) => !p.is_future && p.ev_cumulative !== null);
  const evPath = pastPoints.reduce((acc, pt, i) => {
    const x = getX(i);
    const y = getY(pt.ev_cumulative ?? 0);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const projPoints = sCurve.filter((p) => p.ev_projected !== null);
  const projPath = projPoints.reduce((acc, pt, i) => {
    const idx = sCurve.indexOf(pt);
    const x = getX(idx);
    const y = getY(pt.ev_projected ?? 0);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const dataDateIndex = sCurve.findIndex((p) => p.is_future);
  const dataDateX = dataDateIndex >= 0 ? getX(dataDateIndex) : getX(Math.floor(pointsCount / 2));

  // Material Exceptions ranked by explainable basis
  const materialExceptions = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      basis: 'CRITICAL PATH SLIP' | 'EVIDENCE INTEGRITY GAP' | 'CONTRACTUAL DELAY NOTICE' | 'UNMITIGATED RISK';
      impact: string;
      description: string;
      link: string;
    }> = [];

    // 1. Critical path slippage
    if (criticalDrivers.length > 0) {
      const topDriver = criticalDrivers[0];
      list.push({
        id: topDriver.activity_id,
        title: topDriver.description,
        basis: 'CRITICAL PATH SLIP',
        impact: `+${topDriver.finish_variance_days}d completion drift`,
        description: topDriver.driving_delay
          ? `Driven by ${topDriver.driving_delay}. Directly impacts project logic finish.`
          : 'Pacing activity on the critical chain without recorded mitigation.',
        link: '/executive/forecasts',
      });
    }

    // 2. Schedule network logic conflicts
    if (forecast?.logic_conflicts && forecast.logic_conflicts > 0) {
      list.push({
        id: 'LOGIC-CONFLICTS',
        title: `${forecast.logic_conflicts} Broken Baseline Logic Ties`,
        basis: 'CRITICAL PATH SLIP',
        impact: `${forecast.variance_days ?? 0}d network drift`,
        description: 'Unresolved predecessor relationships in authored plan prevent deterministic CPM path closure.',
        link: '/executive/forecasts',
      });
    }

    // 3. Evidence gap
    if (kpis?.unevidenced_activities && kpis.unevidenced_activities > 0) {
      list.push({
        id: 'EVID-GAP',
        title: `${kpis.unevidenced_activities} Unverified Schedule Activities`,
        basis: 'EVIDENCE INTEGRITY GAP',
        impact: `${(100 - (kpis.evidence_coverage_pct || 0)).toFixed(1)}% unverified`,
        description: `${kpis.unevidenced_activities} activities rely on unconfirmed planned durations. Progress cannot be audited until supervisor logs are confirmed.`,
        link: '/executive/confidence',
      });
    }

    // 4. Contractual delay notice
    if (dispute?.notice_open_count && dispute.notice_open_count > 0) {
      list.push({
        id: 'FIDIC-20.1',
        title: `${dispute.notice_open_count} Pending FIDIC Clause 20.1 Notices`,
        basis: 'CONTRACTUAL DELAY NOTICE',
        impact: `${dispute.contested_delay_days} days contested`,
        description: `${dispute.notice_open_count} contractor delay events currently within the 28-day notice window requiring formal response.`,
        link: '/executive/risks',
      });
    }

    return list;
  }, [criticalDrivers, forecast, kpis, dispute]);

  // Jump Links to the other 7 analytical workspaces
  const workspaceLinks = [
    {
      title: 'Milestones',
      path: '/executive/milestones',
      icon: CalendarDays,
      description: 'Which commitments are likely to slip? Timeline, variance in days, and driving predecessors.',
    },
    {
      title: 'Progress',
      path: '/executive/progress',
      icon: LineChartIcon,
      description: 'Where is execution ahead or behind? Discipline comparisons, EVM curves, and record drill-down.',
    },
    {
      title: 'Risks & Delays',
      path: '/executive/risks',
      icon: ShieldAlert,
      description: 'What threatens delivery, and who owns the response? Accepted RAID items, delays, and notices.',
    },
    {
      title: 'Forecasts',
      path: '/executive/forecasts',
      icon: TrendingUp,
      description: 'When might the project finish? Logic-driven completion outlook and interactive scenario modeling.',
    },
    {
      title: 'Execution Insights',
      path: '/executive/insights',
      icon: Sparkles,
      description: 'What can management learn from actuals? Duration distributions, bottlenecks, and low-sample alerts.',
    },
    {
      title: 'Reports',
      path: '/executive/reports',
      icon: FileText,
      description: 'What should be taken into the meeting? On-demand review pack, editable AI narrative, and exports.',
    },
    {
      title: 'Data Confidence',
      path: '/executive/confidence',
      icon: FileSearch,
      description: 'How much can I trust what I am seeing? Data date freshness, coverage denominators, and conflict audit.',
    },
  ];

  return (
    <div className="w-full max-w-[1280px] mx-auto flex flex-col gap-6 font-sans">
      {/* ── Top Strategic Context Bar ── */}
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
          <span className="px-2.5 py-1 rounded-full bg-surface text-fg font-medium border border-hair">
            Exposure
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
          {/* ── Top 4 KPI Strategic Strip (understandable in ~30 seconds) ── */}
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
                {/* The label follows the value. With no contract sum there
                    is no LD figure to show, so this row used to print a count
                    of culpable delay days under the words "LD Risk" — two
                    different quantities behind one label, while the panel
                    below correctly said no liquidated damages were computed.
                    See D-111. */}
                <span>
                  {financial?.available && financial.contractor_ld_risk_cr !== null
                    ? 'Contractor LD Risk:'
                    : 'Contractor Culpable Delay:'}
                </span>
                <span className="font-mono font-bold text-warn">
                  {financial?.available && financial.contractor_ld_risk_cr !== null
                    ? `₹${financial.contractor_ld_risk_cr.toFixed(2)} Cr`
                    : days(dispute?.contractor_delay_days)}
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

          {/* ── Material Exceptions Panel (Ranked by Explainable Basis) ── */}
          <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-hair">
              <div>
                <h2 className="text-lead font-semibold text-heading flex items-center gap-2">
                  <AlertTriangle size={18} className="text-warn" />
                  Material Exceptions &amp; Required Management Attention
                </h2>
                <p className="text-body text-muted mt-0.5">
                  Actionable exceptions ranked strictly by schedule criticality, unevidenced exposure, and statutory notice deadlines.
                </p>
              </div>
              <span className="text-xs font-mono text-muted">
                {materialExceptions.length} Exceptions Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {materialExceptions.map((ex) => (
                <Link
                  key={ex.id}
                  to={ex.link}
                  className="p-4 rounded-lg border border-hair bg-surface hover:border-fg/40 transition-colors flex flex-col justify-between gap-3 group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-hair bg-raised text-muted uppercase">
                        {ex.basis}
                      </span>
                      <span className="font-mono text-xs font-bold text-danger">
                        {ex.impact}
                      </span>
                    </div>
                    <h3 className="text-body font-semibold text-heading group-hover:text-fg">
                      {ex.title}
                    </h3>
                    <p className="text-xs text-muted leading-relaxed mt-1">
                      {ex.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-hair/60 text-xs font-mono text-muted group-hover:text-heading">
                    <span>Inspect Supporting Evidence</span>
                    <ChevronRight size={14} />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* ── Jump Links to Analytical Workspaces ── */}
          <div className="border border-hair rounded-lg p-5 bg-raised shadow-xs flex flex-col gap-4">
            <div className="pb-3 border-b border-hair flex items-center justify-between">
              <div>
                <h2 className="text-lead font-semibold text-heading flex items-center gap-2">
                  <Layers size={18} className="text-fg" />
                  Executive Analytical Workspaces
                </h2>
                <p className="text-body text-muted mt-0.5">
                  Explore deep discipline breakdowns, forecasts, institutional memory, and review packs without modifying schedule data.
                </p>
              </div>
              <span className="text-xs font-mono text-muted">7 Workspaces</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {workspaceLinks.map((ws) => {
                const Icon = ws.icon;
                return (
                  <Link
                    key={ws.path}
                    to={ws.path}
                    className="p-3.5 rounded-lg border border-hair bg-surface hover:bg-selected/50 hover:border-fg/40 transition-all flex flex-col justify-between gap-2 group"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-fg font-semibold text-body mb-1">
                        <Icon size={16} className="text-muted group-hover:text-fg transition-colors" />
                        <span>{ws.title}</span>
                      </div>
                      <p className="text-xs text-muted leading-relaxed line-clamp-2">
                        {ws.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-mono text-muted group-hover:text-heading pt-2 border-t border-hair/50">
                      <span>Open workspace</span>
                      <ArrowRight size={12} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* ── S-Curve Trajectory Chart Panel ── */}
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

                <path d={projPath} fill="none" stroke="#D97706" strokeWidth="2" strokeDasharray="5 5" />
                <path d={pvPath} fill="none" stroke="#737373" strokeWidth="2" />
                <path d={evPath} fill="none" stroke="#10A37F" strokeWidth="3" strokeLinecap="round" />

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

          {/* ── FIDIC Contractual Dispute & Delay Shield Grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
                <div className="border border-hair bg-surface rounded-lg p-4 flex flex-col justify-between">
                  <div>
                    <span className="font-mono text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">
                      Employer Delay (EOT Claimable)
                    </span>
                    <div className="text-3xl font-extrabold text-fg font-mono">
                      {days(dispute?.employer_delay_days)}
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted pt-3 border-t border-hair font-mono">
                    {financial?.available && financial.employer_claim_cr !== null
                      ? `₹${financial.employer_claim_cr.toFixed(2)} Cr Prolongation Claim`
                      : 'No claim value — no contract sum supplied'}
                  </div>
                </div>

                <div className="border border-hair bg-surface rounded-lg p-4 flex flex-col justify-between">
                  <div>
                    <span className="font-mono text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">
                      Contractor Delay (Culpable)
                    </span>
                    <div className="text-3xl font-extrabold text-danger font-mono">
                      {days(dispute?.contractor_delay_days)}
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted pt-3 border-t border-hair font-mono">
                    {financial?.available && financial.contractor_ld_risk_cr !== null
                      ? `₹${financial.contractor_ld_risk_cr.toFixed(2)} Cr LD Risk`
                      : 'No liquidated damages computed'}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-hair bg-surface flex flex-col gap-2">
                <div className="flex items-center justify-between text-label font-mono">
                  <span className="text-muted">Clause 20.1 Statutory 28-Day Notice Compliance</span>
                  <span className="font-bold text-ok">
                    {dispute?.notice_compliance_pct !== null && dispute?.notice_compliance_pct !== undefined
                      ? `${dispute.notice_compliance_pct.toFixed(0)}%`
                      : '—'}
                  </span>
                </div>
                <div className="text-xs text-muted leading-relaxed font-mono">
                  {dispute?.notice_note ??
                    'Contractual notice windows are computed from evidenced delay dates.'}
                </div>
              </div>
            </div>

            {/* Right: Completion Outlook Range (5 cols) */}
            <div className="lg:col-span-5 border border-hair rounded-lg p-6 bg-raised shadow-xs flex flex-col justify-between">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-hair">
                  <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-fg" />
                    <h3 className="text-lead font-semibold text-heading">
                      Completion Range
                    </h3>
                  </div>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-hair text-muted">
                    Deterministic CPM
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="p-3 rounded-lg border border-hair bg-surface flex items-center justify-between">
                    <div>
                      <span className="text-xs text-muted font-mono uppercase block">Baseline</span>
                      <span className="text-[11px] text-muted">as authored</span>
                    </div>
                    <span className="text-base font-bold font-mono text-fg">
                      {forecast?.baseline_finish ?? '—'}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-hair bg-surface flex items-center justify-between">
                    <div>
                      <span className="text-xs text-muted font-mono uppercase block">Logic</span>
                      <span className="text-[11px] text-muted">CPM over actuals</span>
                    </div>
                    <span className="text-base font-bold font-mono text-danger">
                      {forecast?.logic_finish ?? '—'}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-hair bg-surface flex items-center justify-between">
                    <div>
                      <span className="text-xs text-muted font-mono uppercase block">Exposed</span>
                      <span className="text-[11px] text-muted">with critical risk</span>
                    </div>
                    <span className="text-base font-bold font-mono text-warn">
                      {forecast?.exposed_finish ?? '—'}
                    </span>
                  </div>
                </div>

                {forecast?.logic_conflicts !== undefined && forecast.logic_conflicts > 0 && (
                  <div className="p-3 rounded border border-danger/30 bg-danger/10 text-xs text-danger leading-relaxed font-mono">
                    {forecast.logic_conflicts_note ??
                      `${forecast.logic_conflicts} of the baseline's logic ties are broken by its own authored dates.`}
                  </div>
                )}
              </div>

              <div className="text-xs text-muted font-mono pt-3 border-t border-hair mt-4">
                Basis: {forecast?.basis ?? 'Three computed dates, not percentiles.'}
              </div>
            </div>
          </div>

          {/* ── Derived Milestones Summary ── */}
          <div className="border border-hair rounded-lg p-6 bg-raised shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-hair">
              <div>
                <h3 className="text-lead font-semibold text-heading flex items-center gap-2">
                  <CalendarDays size={18} className="text-fg" />
                  Derived Milestones
                </h3>
                <span className="text-body text-muted text-xs">
                  {metrics?.milestones_note ?? 'The baseline carries no milestone flag, so these are derived.'}
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-hair bg-surface text-muted">
                DERIVED FROM BASELINE
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {milestones.map((m) => (
                <div key={m.name} className="p-4 rounded-lg border border-hair bg-surface flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-heading text-sm">{m.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-raised text-muted uppercase">
                        {m.status}
                      </span>
                    </div>
                    {m.activity_description && (
                      <span className="text-xs text-muted block truncate font-mono">
                        {m.activity_id} · {m.activity_description}
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-hair flex items-center justify-between text-xs font-mono">
                    <span className="text-muted">{m.baseline_date ?? '—'} → {m.forecast_date ?? '—'}</span>
                    <span className="font-bold text-fg">
                      {m.basis === 'actual_finish' ? 'actual · ' : m.basis === 'not_scheduled' ? 'not scheduled · ' : 'CPM · '}
                      {m.variance_days !== null && m.variance_days !== undefined
                        ? `${m.variance_days > 0 ? '+' : ''}${m.variance_days}d`
                        : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Critical Path Drivers ── */}
          <div className="border border-hair rounded-lg p-6 bg-raised shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-hair">
              <div>
                <h3 className="text-lead font-semibold text-heading">
                  Critical Path Driving Activities
                </h3>
                <span className="text-body text-muted text-xs">
                  {metrics?.critical_drivers_note ?? 'Null means no cause is recorded.'}
                </span>
              </div>
            </div>

            <div className="divide-y divide-hair">
              {criticalDrivers.map((act) => (
                <div key={act.activity_id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-fg text-sm">{act.activity_id}</span>
                      <span className="text-muted">·</span>
                      <span className="font-semibold text-heading">{act.description}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted font-mono flex items-center gap-3">
                      <span>Planned: {act.planned_finish}</span>
                      <span>·</span>
                      <span>Actual: {act.actual_finish ?? 'In Progress'}</span>
                      <span>·</span>
                      <span className="text-danger font-bold">+{act.finish_variance_days}d slip</span>
                    </div>
                  </div>

                  <div className="text-xs font-mono">
                    {act.driving_delay ? (
                      <div className="text-right">
                        <span className="font-bold text-fg block">{act.driving_delay}</span>
                        <div className="text-muted text-[11px]">
                          {act.driving_delay_category && `(${act.driving_delay_category})`}
                          {!act.driving_delay_adjudicated && ' · proposed, not adjudicated'}
                        </div>
                        {act.driving_delay_source && (
                          <div className="text-muted font-mono text-[10px]">
                            {act.driving_delay_source}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted italic">No cause recorded</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── What-If Scenario Simulator ── */}
          <div className="border border-hair rounded-lg p-6 bg-raised shadow-xs flex flex-col gap-4">
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
                    className="w-full h-1.5 bg-hair rounded-lg appearance-none cursor-pointer accent-warn"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-muted mt-1">
                    <span>0d</span>
                    <span>15d</span>
                    <span>30d</span>
                  </div>
                </div>
              </div>

              {/* Simulation Output Card (5 cols) */}
              <div className="md:col-span-5 p-5 rounded-lg border border-hair bg-surface flex flex-col justify-between">
                <div>
                  <span className="text-label text-muted font-mono uppercase tracking-wider block mb-1">
                    Simulated Project Completion
                  </span>
                  <div className="text-3xl font-extrabold text-danger font-mono tracking-tight">
                    {simulatedFinish ?? '—'}
                  </div>
                  <div className="mt-2 text-xs font-mono text-muted">
                    Original Logic Finish: {forecast?.logic_finish ?? '—'} (+{totalSimulatedSlip}d hypothetical slip)
                  </div>
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
        </>
      )}
    </div>
  );
}
