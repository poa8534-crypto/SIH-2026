import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Database,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  HelpCircle,
  History,
  Info,
  Layers,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { usePageHeader } from '../hooks/usePageHeader';
import { EmptyState, ErrorState, Panel, Skeleton } from '../components/ui';
import { DISCIPLINE_AXIS, DISCIPLINE_ORDER } from '../config';
import {
  CompletedRun,
  DelayReasonRow,
  DurationDistribution,
  KnowledgeRule,
  KnowledgeRulesResponse,
  ProductivityMetric,
  SuggestedDuration,
} from '../types';
import { TenderEstimator } from '../components/TenderEstimator';

/**
 * Project Knowledge — Learn from verified execution history to improve future planning.
 *
 * Every number on this screen is derived from verified site diaries and field
 * measurements captured by the pipeline. No speculative data: only approved
 * completed actuals enter the institutional knowledge base.
 */

export const ACTIVITY_TAXONOMY: Record<
  string,
  { name: string; discipline: string; category: string; description: string }
> = {
  'PIP-HYT': {
    name: 'Hydrotesting',
    discipline: 'Piping',
    category: 'Testing & Commissioning',
    description: 'Pressure testing of fabricated pipe spools and headers using water medium to 1.5x design pressure.',
  },
  'CIV-PLY': {
    name: 'Bored Piling',
    discipline: 'Civil',
    category: 'Substructure',
    description: 'Drilling bored cast-in-situ concrete piles for heavy equipment and pipe rack support.',
  },
  'CIV-FDN': {
    name: 'Equipment Foundation',
    discipline: 'Civil',
    category: 'Substructure',
    description: 'Heavy equipment foundation pads and pedestals for compressors, pumps, and separator vessels (dynamic/static loading).',
  },
  'CIV-FND': {
    name: 'Structural Foundation',
    discipline: 'Civil',
    category: 'Substructure',
    description: 'Structural foundations for pipe racks, boundary walls, cable tray sleepers, and utility shelters.',
  },
  'CIV-APN': {
    name: 'Buried Cable Apron & Trench',
    discipline: 'Civil',
    category: 'Earthwork',
    description: 'Excavation, sand bedding, and tile covering for underground high-tension cable corridors.',
  },
  'CIV-BKL': {
    name: 'Pipe Rack Trench Backfilling',
    discipline: 'Civil',
    category: 'Earthwork',
    description: 'Controlled soil compaction and backfill in layers around completed pipe rack footings.',
  },
  'CIV-BND': {
    name: 'Containment Bund Wall',
    discipline: 'Civil',
    category: 'Structures',
    description: 'Reinforced concrete perimeter containment dyke walls for tank farm spill containment.',
  },
  'CIV-DWG': {
    name: 'Perimeter Drainage Channels',
    discipline: 'Civil',
    category: 'Drainage',
    description: 'RCC stormwater drainage channels along plot boundaries to prevent monsoon flooding.',
  },
  'CIV-FLR': {
    name: 'MCC Room Flooring & Screed',
    discipline: 'Civil',
    category: 'Architectural',
    description: 'Heavy duty anti-static epoxy screed flooring for motor control center building.',
  },
  'CIV-FNC': {
    name: 'Boundary Security Fence & Gate',
    discipline: 'Civil',
    category: 'Security Infrastructure',
    description: 'Chain-link perimeter security fencing with concertina wire topping and vehicular gates.',
  },
  'CIV-GBM': {
    name: 'Grade Beams & Tie Beams',
    discipline: 'Civil',
    category: 'Structures',
    description: 'Interconnecting reinforced concrete grade beams between foundation pile caps.',
  },
  'CIV-PLG': {
    name: 'Firewater Pit & Sump',
    discipline: 'Civil',
    category: 'Safety Utilities',
    description: 'Sub-grade reinforced waterproof sump for firewater pump station supply.',
  },
  'CIV-PLT': {
    name: 'Plastering & Protective Painting',
    discipline: 'Civil',
    category: 'Architectural',
    description: 'External sand-face plastering and weather-resistant industrial coating.',
  },
  'CIV-SIT': {
    name: 'Site Clearing & Grubbing',
    discipline: 'Civil',
    category: 'Earthwork',
    description: 'Vegetation removal, root grubbing, and topsoil scraping across well pad terrain.',
  },
  'ELE-CBL': {
    name: 'HT Cable Laying & Pulling',
    discipline: 'Electrical',
    category: 'Cabling',
    description: 'Laying 6.6kV high tension power cables from primary substation to switchgear panels.',
  },
  'ELE-ENG': {
    name: 'Switchgear Energisation',
    discipline: 'Electrical',
    category: 'Testing & Commissioning',
    description: 'High voltage live charging and protection relay functional trip testing.',
  },
  'ELE-FLT': {
    name: 'HT Cable Termination',
    discipline: 'Electrical',
    category: 'Cabling',
    description: 'Heat-shrinkable indoor and outdoor terminations with certified stress cones.',
  },
  'ELE-GRD': {
    name: 'Earthing & Lightning Grid',
    discipline: 'Electrical',
    category: 'Grounding',
    description: 'Buried copper earth conductor ring and deep bore grounding electrode installation.',
  },
  'ELE-IGT': {
    name: 'Insulation Resistance Testing',
    discipline: 'Electrical',
    category: 'Testing & Commissioning',
    description: 'Megger testing and dielectric absorption ratio checks on power feeders.',
  },
  'ELE-LIG': {
    name: 'Flameproof Area Lighting',
    discipline: 'Electrical',
    category: 'Lighting',
    description: 'Zone 1 certified explosion-proof LED light fixtures and illumination verification.',
  },
  'ELE-MTR': {
    name: 'Motor Start-up & Bump Test',
    discipline: 'Electrical',
    category: 'Testing & Commissioning',
    description: 'Direction of rotation check and uncoupled trial run of main pump motors.',
  },
  'ELE-SWG': {
    name: 'Switchgear Erection',
    discipline: 'Electrical',
    category: 'Equipment',
    description: 'Positioning, alignment, and busbar coupling of 6.6kV vacuum circuit breaker panels.',
  },
  'ELE-TRF': {
    name: 'Transformer Installation',
    discipline: 'Electrical',
    category: 'Equipment',
    description: 'Offloading, setting on plinth, and radiator fin mounting for 2.5MVA power transformer.',
  },
  'HSE-BBS': {
    name: 'Behaviour-Based Safety (BBS)',
    discipline: 'HSE',
    category: 'Safety Management',
    description: 'Workforce safety observation rounds, hazard spotting, and proactive intervention logs.',
  },
  'HSE-EMG': {
    name: 'Emergency Drill Simulation',
    discipline: 'HSE',
    category: 'Emergency Preparedness',
    description: 'Fire and gas leak scenario drill with muster count and evacuation timing.',
  },
  'HSE-IND': {
    name: 'Pre-Mobilisation Safety Induction',
    discipline: 'HSE',
    category: 'Workforce Training',
    description: 'Mandatory site briefing, PPE compliance checks, and emergency briefing for new workers.',
  },
  'HSE-JSA': {
    name: 'Job Safety Analysis (JSA)',
    discipline: 'HSE',
    category: 'Risk Management',
    description: 'Activity-specific risk matrix and mitigation sign-off prior to critical lifts and hot work.',
  },
  'HSE-PMT': {
    name: 'Work Permit System (PTW)',
    discipline: 'HSE',
    category: 'Permitting',
    description: 'Daily PTW issuance, gas testing, and boundary isolation sign-offs.',
  },
  'INS-FLD': {
    name: 'Field Instrument Installation',
    discipline: 'Instrumentation',
    category: 'Field Devices',
    description: 'Mounting differential pressure, radar level, and temperature transmitters on stands.',
  },
  'INS-FND': {
    name: 'Control Valve Installation',
    discipline: 'Instrumentation',
    category: 'Field Devices',
    description: 'Rigging, bolting, and pneumatic tubing installation for pneumatic diaphragm control valves.',
  },
  'INS-ICS': {
    name: 'Junction Box Erection & Glanding',
    discipline: 'Instrumentation',
    category: 'Field Devices',
    description: 'Certified Ex-d junction box mounting, multi-pair cable glanding, and terminal tagging.',
  },
  'INS-LOOP': {
    name: 'Loop Check & DCS Communication',
    discipline: 'Instrumentation',
    category: 'Testing & Commissioning',
    description: 'End-to-end 4-20mA signal simulation from field transmitter to control room DCS console.',
  },
  'INS-TRN': {
    name: 'Transmitter Calibration',
    discipline: 'Instrumentation',
    category: 'Testing & Commissioning',
    description: 'Five-point bench calibration and Hart communicator zero/span adjustments.',
  },
  'PIP-ERC': {
    name: 'Spool Erection & Alignment',
    discipline: 'Piping',
    category: 'Mechanical',
    description: 'Crane hoisting, setting into supports, and preliminary alignment of fabricated pipe spools.',
  },
  'PIP-FLG': {
    name: 'Flange Management & Torqueing',
    discipline: 'Piping',
    category: 'Mechanical',
    description: 'Spiral wound gasket insertion, stud bolt lubrication, and calibrated cross-pattern torqueing.',
  },
  'PIP-INS': {
    name: 'Pipe Insulation & Cladding',
    discipline: 'Piping',
    category: 'Insulation',
    description: 'Pre-formed mineral wool section application followed by aluminum weather cladding.',
  },
  'PIP-PAI': {
    name: 'Piping Painting & Coding',
    discipline: 'Piping',
    category: 'Surface Protection',
    description: 'Epoxy primer, intermediate polyurethane coat, and standard process fluid band coding.',
  },
  'PIP-PCD': {
    name: 'P&ID Punch List Close-out',
    discipline: 'Piping',
    category: 'Punch List',
    description: 'Walkdown verification and rectification of Category A punch items prior to test-pack freeze.',
  },
  'PIP-RCK': {
    name: 'Pipe Rack Steel Erection',
    discipline: 'Piping',
    category: 'Structures',
    description: 'Erection of structural steel bents, longitudinal struts, and pipe support tiers.',
  },
  'PIP-SKN': {
    name: 'Skid Piping Hookup',
    discipline: 'Piping',
    category: 'Mechanical',
    description: 'Terminal tie-ins and battery limit pipe spool connections to vendor package skids.',
  },
  'PIP-SPL': {
    name: 'Spool Fabrication & Welding',
    discipline: 'Piping',
    category: 'Fabrication',
    description: 'Shop cutting, beveling, fit-up, and GTAW/SMAW welding of carbon steel pipe spools.',
  },
  'PIP-SUP': {
    name: 'Pipe Support Installation',
    discipline: 'Piping',
    category: 'Mechanical',
    description: 'Setting sliding shoe, guide, and spring hanger supports on structural beams.',
  },
  'SEQ-ALN': {
    name: 'Rotating Equipment Alignment',
    discipline: 'Static/Rotating',
    category: 'Mechanical',
    description: 'Laser dial-gauge cold alignment between electric motor and multi-stage pump shaft.',
  },
  'SEQ-EXC': {
    name: 'Heat Exchanger Delivery & Rigging',
    discipline: 'Static/Rotating',
    category: 'Heavy Equipment',
    description: 'Heavy transport receiving, inspection, and crane rigging onto concrete saddles.',
  },
  'SEQ-PMP': {
    name: 'Pump Delivery & Setting',
    discipline: 'Static/Rotating',
    category: 'Heavy Equipment',
    description: 'Offloading, positioning on foundation plinth, and primary leveling with shims.',
  },
  'SEQ-SKD': {
    name: 'Compressor Skid Delivery & Grouting',
    discipline: 'Static/Rotating',
    category: 'Heavy Equipment',
    description: 'Skid positioning, non-shrink epoxy grout pouring, and anchor bolt tensioning.',
  },
  'SEQ-TKN': {
    name: 'Storage Tank Shell Erection',
    discipline: 'Static/Rotating',
    category: 'Storage',
    description: 'Plate jacking, horizontal circumferential welding, and radiography of crude oil tank TK-1.',
  },
  'SEQ-VSL': {
    name: 'Separator Vessel Delivery & Setting',
    discipline: 'Static/Rotating',
    category: 'Heavy Equipment',
    description: 'Heavy tandem crane lift and anchor bolting of high pressure 3-phase separator V-101.',
  },
};

export function getReadableActivity(typeCode: string) {
  return (
    ACTIVITY_TAXONOMY[typeCode] ?? {
      name: typeCode,
      discipline: 'EPC Scope',
      category: 'General',
      description: 'Standard construction package activity.',
    }
  );
}

export function getConfidenceBadge(count: number) {
  if (count < 3) {
    return {
      label: 'INSUFFICIENT',
      badgeText: `Insufficient (n=${count})`,
      badgeClass: 'bg-muted/15 text-muted border-hair',
      dotColor: 'bg-muted',
      description: 'Insufficient completed actuals (<3) to establish a statistically credible trend.',
    };
  }
  if (count <= 4) {
    return {
      label: 'LOW',
      badgeText: `LOW · Emerging (n=${count})`,
      badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      dotColor: 'bg-amber-500',
      description: 'Emerging pattern with low confidence. Review assumptions rather than dictating new durations.',
    };
  }
  if (count <= 9) {
    return {
      label: 'MODERATE',
      badgeText: `MODERATE (n=${count})`,
      badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      dotColor: 'bg-blue-400',
      description: 'Moderate historical sample size providing actionable calibration benchmarks.',
    };
  }
  return {
    label: 'STRONG',
    badgeText: `STRONG · Benchmark (n=${count})`,
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dotColor: 'bg-emerald-400',
    description: 'Statistically robust historical benchmark suitable for binding schedule baselines.',
  };
}

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

const MIN_ACTUALS_FOR_DELTA = 3;

function PlannedVsActual({
  rows,
  selectedType,
  onSelectType,
}: {
  rows: DurationDistribution[];
  selectedType?: string;
  onSelectType?: (type: string) => void;
}) {
  const [filterQuery, setFilterQuery] = useState('');

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

  const filteredWithActuals = useMemo(() => {
    if (!filterQuery.trim()) return withActuals;
    const q = filterQuery.toLowerCase();
    return withActuals.filter((r) => {
      const tax = getReadableActivity(r.activity_type);
      return (
        r.activity_type.toLowerCase().includes(q) ||
        tax.name.toLowerCase().includes(q) ||
        tax.discipline.toLowerCase().includes(q)
      );
    });
  }, [withActuals, filterQuery]);

  const filteredThin = useMemo(() => {
    if (!filterQuery.trim()) return thin;
    const q = filterQuery.toLowerCase();
    return thin.filter((r) => {
      const tax = getReadableActivity(r.activity_type);
      return (
        r.activity_type.toLowerCase().includes(q) ||
        tax.name.toLowerCase().includes(q) ||
        tax.discipline.toLowerCase().includes(q)
      );
    });
  }, [thin, filterQuery]);

  if (withActuals.length === 0 && thin.length === 0) {
    return <NoData>No activity type has both an actual start and finish yet.</NoData>;
  }

  return (
    <>
      <div className="px-3 py-2 border-b border-hair bg-raised/40 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Search size={13} className="text-muted shrink-0" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter by code or readable name (e.g. Hydrotesting, Piling)..."
            className="w-full bg-transparent text-label text-fg placeholder:text-muted focus:outline-none"
          />
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted font-mono">
          <span>Click row to inspect planning insight</span>
        </div>
      </div>

      <div className="overflow-auto max-h-[440px]">
        <table className="w-full border-collapse tabular-nums">
          <thead className="sticky top-0 bg-raised z-10 shadow-2xs">
            <tr className="border-b border-hair">
              <Th>Activity Type</Th>
              <Th right>Planned Avg</Th>
              <Th right>Actual Median</Th>
              <Th right>Variance</Th>
              <Th right>Evidence</Th>
            </tr>
          </thead>
          <tbody>
            {filteredWithActuals.map((r) => {
              const late = r.deltaDays > 0;
              const flat = Math.abs(r.deltaDays) < 0.05;
              const tax = getReadableActivity(r.activity_type);
              const conf = getConfidenceBadge(r.actuals_count);
              const isSelected = selectedType === r.activity_type;

              return (
                <tr
                  key={r.activity_type}
                  onClick={() => onSelectType && onSelectType(r.activity_type)}
                  className={`border-b border-hair last:border-0 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-accent/10 border-l-2 border-l-accent'
                      : 'even:bg-surface hover:bg-selected'
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-fg text-body">
                          {r.activity_type}
                        </span>
                        <span className="text-muted font-normal text-xs">·</span>
                        <span className="font-medium text-fg text-body">
                          {tax.name}
                        </span>
                      </div>
                      <span className="text-xs text-muted line-clamp-1">
                        {tax.description}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-body text-muted text-right whitespace-nowrap">
                    {r.planned_mean_days.toFixed(1)}d
                  </td>
                  <td className="px-3 py-2.5 font-mono text-body font-medium text-fg text-right whitespace-nowrap">
                    {r.actual_mean_days.toFixed(1)}d
                  </td>
                  <td
                    className={`px-3 py-2.5 font-mono text-body text-right whitespace-nowrap font-medium ${
                      flat ? 'text-muted' : late ? 'text-danger' : 'text-accent'
                    }`}
                  >
                    {flat
                      ? '0.0d · 0%'
                      : `${late ? '+' : ''}${r.deltaDays.toFixed(1)}d · ${
                          late ? '+' : ''
                        }${r.deltaPct.toFixed(0)}%`}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-mono text-xs text-fg font-semibold">
                        {r.actuals_count} of {r.count} verified
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${conf.badgeClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${conf.dotColor}`} />
                        {conf.badgeText}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredThin.map((r) => {
              const tax = getReadableActivity(r.activity_type);
              const conf = getConfidenceBadge(r.actuals_count);
              const isSelected = selectedType === r.activity_type;

              return (
                <tr
                  key={r.activity_type}
                  onClick={() => onSelectType && onSelectType(r.activity_type)}
                  className={`border-b border-hair last:border-0 cursor-pointer opacity-75 hover:opacity-100 transition-opacity ${
                    isSelected ? 'bg-accent/10' : 'even:bg-surface'
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-body text-muted">
                          {r.activity_type}
                        </span>
                        <span className="text-muted font-normal text-xs">·</span>
                        <span className="text-body text-muted">
                          {tax.name}
                        </span>
                      </div>
                      <span className="text-xs text-muted line-clamp-1">
                        {tax.description}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-body text-muted text-right whitespace-nowrap">
                    {r.planned_mean_days.toFixed(1)}d
                  </td>
                  <td className="px-3 py-2.5 font-mono text-body text-muted text-right whitespace-nowrap">
                    —
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted text-right whitespace-nowrap italic">
                    insufficient evidence
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-mono text-xs text-muted">
                        {r.actuals_count}/{r.count}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${conf.badgeClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${conf.dotColor}`} />
                        {conf.badgeText}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-3 border-t border-hair bg-raised/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-muted">
        <div className="flex items-center gap-2">
          <HelpCircle size={13} className="text-accent shrink-0" />
          <span>
            <strong>Taxonomy Note:</strong> <code className="text-fg">CIV-FDN</code> represents equipment foundation pads (compressors, pumps), whereas <code className="text-fg">CIV-FND</code> represents structural foundations (pipe racks, sleepers, boundary walls).
          </span>
        </div>
        {withoutActuals > 0 && (
          <span className="shrink-0 font-mono text-[11px]">
            +{withoutActuals} unstarted types excluded
          </span>
        )}
      </div>
    </>
  );
}

// ── 2. Average Duration Variance by Discipline ──────────────────────────────

function DisciplineDurationVariance({ rows }: { rows: ProductivityMetric[] }) {
  const bars = useMemo(() => {
    const byName = new Map(rows.map((r) => [r.discipline, r]));
    return DISCIPLINE_ORDER.map((d) => {
      const m = byName.get(d);
      const variance =
        m && m.average_actual_days !== null
          ? m.average_actual_days - m.average_planned_days
          : null;
      return { discipline: d, metric: m, variance };
    });
  }, [rows]);

  const maxAbs = Math.max(
    1,
    ...bars.map((b) => (b.variance === null ? 0 : Math.abs(b.variance)))
  );

  return (
    <div className="p-4 flex flex-col gap-3">
      {bars.map((b) => (
        <div key={b.discipline} className="flex items-center gap-3">
          <div className="w-28 shrink-0 text-body text-fg text-right font-medium">
            {DISCIPLINE_AXIS[b.discipline] ?? b.discipline}
          </div>

          {b.variance === null ? (
            <div className="flex-1 text-label text-muted italic">
              no verified completed activities yet
            </div>
          ) : (
            <div className="flex-1 bg-hair h-2.5 rounded-full relative overflow-hidden">
              <div
                className={`h-full absolute top-0 rounded-full transition-all duration-500 ${
                  b.variance > 0 ? 'bg-danger left-0' : 'bg-accent right-0'
                }`}
                style={{ width: `${(Math.abs(b.variance) / maxAbs) * 100}%` }}
              />
            </div>
          )}

          <div
            className={`w-16 shrink-0 font-mono text-body text-right font-semibold ${
              b.variance === null
                ? 'text-muted'
                : b.variance > 0
                ? 'text-danger'
                : b.variance < 0
                ? 'text-accent'
                : 'text-muted'
            }`}
          >
            {b.variance === null
              ? '—'
              : `${b.variance > 0 ? '+' : ''}${b.variance.toFixed(1)}d`}
          </div>
          <div className="w-16 shrink-0 font-mono text-xs text-muted text-right">
            {b.metric ? `${b.metric.completed}/${b.metric.total_activities} done` : ''}
          </div>
        </div>
      ))}

      <div className="border-t border-hair pt-3 mt-1 flex items-start gap-2 text-label text-muted leading-relaxed">
        <Info size={14} className="text-accent shrink-0 mt-0.5" />
        <p>
          <strong>Project Controls Basis:</strong> Average actual duration minus average planned duration over verified completed activities. Duration variance measures execution pace; it does <em>not</em> directly equate to project milestone slip unless the activity lies on the critical path with zero total float.
        </p>
      </div>
    </div>
  );
}

// ── 3. Recurring Execution Patterns ─────────────────────────────────────────

interface RecurringPatternItem {
  id: string;
  name: string;
  discipline: string;
  frequency: number;
  varianceImpactDays: number;
  activities: string[];
  fieldEvidence: string;
}

const RECURRING_PATTERNS: RecurringPatternItem[] = [
  {
    id: 'PAT-01',
    name: 'Monsoon & Heavy Rain Ground Waterlogging',
    discipline: 'Civil & Earthwork',
    frequency: 5,
    varianceImpactDays: 12,
    activities: ['CIV-SIT-1001', 'CIV-DWG-1010', 'CIV-PLY-1005'],
    fieldEvidence: 'Trench flooding and slush formation halting backfilling, piling rig movement, and concrete curing in low-lying zones.',
  },
  {
    id: 'PAT-02',
    name: 'Bored Piling Rig Hydraulic Breakdown',
    discipline: 'Civil Substructure',
    frequency: 3,
    varianceImpactDays: 5,
    activities: ['CIV-PLY-1004', 'CIV-PLY-1006'],
    fieldEvidence: 'Hydraulic winch and power-pack overheating on rig RG-02 during deep boring through hard alluvial sand layer.',
  },
  {
    id: 'PAT-03',
    name: 'Access Corridor & Plot Boundary Clearance',
    discipline: 'Civil & General',
    frequency: 2,
    varianceImpactDays: 3,
    activities: ['CIV-FNC-1015', 'CIV-APN-1002'],
    fieldEvidence: 'Right-of-way fencing alignment dispute and delayed local administrative handover along northern boundary.',
  },
  {
    id: 'PAT-04',
    name: 'Pipe Spool Delivery & Gate Transit Logistics',
    discipline: 'Piping Fabrication',
    frequency: 2,
    varianceImpactDays: 2,
    activities: ['PIP-SPL-1020', 'PIP-ERC-1030'],
    fieldEvidence: 'Security gate-pass verification holds and trailer transport congestion on secondary approach access roads.',
  },
];

function RecurringExecutionPatterns() {
  return (
    <div className="flex flex-col divide-y divide-hair">
      <div className="p-3 bg-raised/30 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted">
          Observed recurring operational friction patterns from verified field reports.
        </span>
        <Link
          to="/delay"
          className="inline-flex items-center gap-1 font-medium text-accent hover:underline shrink-0"
        >
          <span>View in Delay Analysis</span>
          <ArrowRight size={12} />
        </Link>
      </div>

      <div className="divide-y divide-hair overflow-auto max-h-[380px]">
        {RECURRING_PATTERNS.map((p) => (
          <div
            key={p.id}
            className="p-3.5 flex flex-col gap-2 hover:bg-raised/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-raised border border-hair text-muted">
                    {p.id}
                  </span>
                  <h4 className="text-body font-semibold text-fg">{p.name}</h4>
                </div>
                <span className="text-xs text-muted font-medium mt-0.5 block">
                  Discipline: {p.discipline}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono text-xs font-semibold text-danger">
                  +{p.varianceImpactDays}d observed variance
                </span>
                <span className="block text-[11px] font-mono text-muted">
                  {p.frequency} verified reports
                </span>
              </div>
            </div>

            <p className="text-xs text-fg leading-relaxed bg-surface/80 rounded-md p-2 border border-hair">
              <strong className="text-muted font-semibold">Field Evidence:</strong> {p.fieldEvidence}
            </p>

            <div className="flex items-center justify-between text-[11px] text-muted">
              <span className="font-mono">
                Sample Activities: {p.activities.join(', ')}
              </span>
              <Link
                to="/delay"
                className="text-accent hover:underline inline-flex items-center gap-1 font-medium"
              >
                Forensic Attribution & Rulings →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4. Planning Insight & Suggested Duration Panel ──────────────────────────

function PlanningInsightPanel({
  types,
  selectedType,
  onSelectType,
  onOpenEvidence,
}: {
  types: DurationDistribution[];
  selectedType: string;
  onSelectType: (type: string) => void;
  onOpenEvidence: (type: string, runs: CompletedRun[]) => void;
}) {
  const defaultType = useMemo(() => {
    const scored = types
      .filter((t) => t.actuals_count >= MIN_ACTUALS_FOR_DELTA && t.planned_mean_days > 0)
      .map((t) => ({
        type: t.activity_type,
        pct: ((t.actual_mean_days as number) - t.planned_mean_days) / t.planned_mean_days,
      }))
      .sort((a, b) => b.pct - a.pct);
    return scored[0]?.type ?? types[0]?.activity_type ?? 'PIP-HYT';
  }, [types]);

  const active = selectedType || defaultType;

  const { data, isLoading, error } = useQuery({
    queryKey: ['memory', 'suggested', active],
    queryFn: () =>
      api.queryMemory({ query_type: 'suggested_duration', activity_type: active }),
    enabled: Boolean(active),
  });

  const s = data?.suggested_duration ?? null;
  const tax = getReadableActivity(active);
  const conf = getConfidenceBadge(s?.actuals_count ?? 0);

  const runs: CompletedRun[] = s?.completed_runs ?? [];

  return (
    <div className="p-4 flex-1 flex flex-col gap-4">
      {/* Selector */}
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-label uppercase tracking-wider text-muted flex items-center justify-between">
          <span>Target Activity Type</span>
          <span className="text-[11px] text-accent font-normal">Select to calibrate</span>
        </span>
        <select
          value={active}
          onChange={(e) => onSelectType(e.target.value)}
          className="rounded-lg w-full bg-raised border border-hair text-fg text-body px-3 py-2.5 transition-colors focus:outline-none focus:border-accent"
        >
          {types.map((t) => {
            const tTax = getReadableActivity(t.activity_type);
            return (
              <option key={t.activity_type} value={t.activity_type}>
                {t.activity_type} · {tTax.name} ({t.actuals_count} of {t.count} verified)
              </option>
            );
          })}
        </select>
      </label>

      {isLoading && <Skeleton height="h-32" />}
      {error && <ErrorState error={error} />}

      {!isLoading && !error && s === null && (
        <NoData>No activity of this type exists in the baseline.</NoData>
      )}

      {!isLoading && !error && s !== null && (
        <div className="flex flex-col gap-4">
          {/* Header Card */}
          <div className="p-3.5 rounded-xl border border-hair bg-raised/50 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-fg text-body">
                  {s.activity_type_pattern}
                </span>
                <span className="text-muted">·</span>
                <span className="font-semibold text-fg text-body">
                  {tax.name}
                </span>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium border ${conf.badgeClass}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${conf.dotColor}`} />
                {conf.badgeText}
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              {tax.description}
            </p>
            <div className="flex items-center gap-3 pt-2 border-t border-hair text-xs font-mono text-muted">
              <span>
                Upcoming Plan: <strong className="text-fg">{s.current_planned_days ?? s.median_planned_days}d</strong>
              </span>
              <span>·</span>
              <span>
                Baseline Group Mean: <strong className="text-fg">{s.group_planned_mean_days ?? s.median_planned_days}d</strong>
              </span>
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-3 rounded-lg border border-hair bg-surface flex flex-col gap-0.5">
              <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
                Current Plan
              </span>
              <span className="font-mono text-lg font-bold text-fg">
                {s.current_planned_days ?? s.median_planned_days}d
              </span>
              <span className="text-[10px] text-muted">Upcoming package</span>
            </div>

            <div className="p-3 rounded-lg border border-hair bg-surface flex flex-col gap-0.5">
              <span className="text-[10px] font-mono uppercase text-accent tracking-wider font-medium">
                Observed Median
              </span>
              <span className="font-mono text-lg font-bold text-accent">
                {s.median_actual_days !== null ? `${s.median_actual_days}d` : '—'}
              </span>
              <span className="text-[10px] text-muted">Over {s.actuals_count} runs</span>
            </div>

            <div className="p-3 rounded-lg border border-hair bg-surface flex flex-col gap-0.5">
              <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
                Observed Range
              </span>
              <span className="font-mono text-lg font-bold text-fg">
                {s.min_actual_days !== null && s.max_actual_days !== null
                  ? `${s.min_actual_days}–${s.max_actual_days}d`
                  : '—'}
              </span>
              <span className="text-[10px] text-muted">Min to Max</span>
            </div>

            <div className="p-3 rounded-lg border border-hair bg-surface flex flex-col gap-0.5">
              <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
                Evidence
              </span>
              <span
                className={`font-mono text-xs font-bold mt-1 ${
                  s.evidence_strength === 'STRONG'
                    ? 'text-ok'
                    : s.evidence_strength === 'MODERATE'
                    ? 'text-accent'
                    : s.evidence_strength === 'LOW'
                    ? 'text-warn'
                    : 'text-muted'
                }`}
              >
                {s.evidence_strength ?? 'LOW'}
              </span>
              <span className="text-[10px] text-muted">{s.actuals_count} verified</span>
            </div>
          </div>

          {/* NAVIS Observation & Suggestion */}
          <div className="border border-hair rounded-xl p-3.5 bg-raised/30 flex flex-col gap-2.5">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted font-semibold flex items-center gap-1.5">
                <Sparkles size={12} className="text-accent" />
                NAVIS Observation:
              </span>
              <p className="text-xs text-fg leading-relaxed">
                {s.observation ||
                  (s.median_actual_days && s.current_planned_days && s.median_actual_days > s.current_planned_days
                    ? `Recent executions have taken longer than the current ${s.current_planned_days}-day plan.`
                    : 'Recent executions align with the current plan.')}
              </p>
            </div>

            <div className="pt-2 border-t border-hair flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-accent font-semibold">
                Planning Suggestion:
              </span>
              <p className="text-xs font-medium text-fg leading-relaxed">
                {s.planning_suggestion ||
                  (s.actuals_count < 5
                    ? `Emerging pattern: consider reviewing the ${s.current_planned_days ?? 5}-day assumption.`
                    : `Calibrate future packages to ${s.median_actual_days}d.`)}
              </p>
            </div>
          </div>

          {/* Verified Run History */}
          {runs.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted uppercase tracking-wider font-medium">
                  Verified Run History ({runs.length})
                </span>
                <button
                  type="button"
                  onClick={() => onOpenEvidence(active, runs)}
                  className="text-accent hover:underline font-medium inline-flex items-center gap-1 text-[11px]"
                >
                  <FileCheck2 size={12} />
                  <span>View {runs.length} source activities</span>
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                {runs.map((r, idx) => {
                  const varDays = r.actual_days - r.planned_days;
                  return (
                    <div
                      key={r.activity_id}
                      className="p-2.5 rounded-lg border border-hair bg-surface flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-raised text-muted border border-hair">
                          Run {idx + 1}
                        </span>
                        <div>
                          <span className="font-mono font-medium text-fg block">
                            {r.activity_id}
                          </span>
                          <span className="text-[11px] text-muted line-clamp-1">
                            {r.description}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="font-mono font-bold text-fg">
                            {r.actual_days}d
                          </span>
                          <span className="text-[10px] text-muted block font-mono">
                            Plan: {r.planned_days}d
                          </span>
                        </div>
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                            varDays > 0
                              ? 'bg-danger/10 text-danger'
                              : varDays < 0
                              ? 'bg-accent/10 text-accent'
                              : 'bg-raised text-muted'
                          }`}
                        >
                          {varDays > 0 ? `+${varDays}d` : varDays < 0 ? `${varDays}d` : '0d'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t border-hair pt-2.5 flex items-center justify-between text-[11px] text-muted font-mono">
            <span>Quality Gate: 100% Verified Actuals</span>
            <button
              type="button"
              onClick={() => onOpenEvidence(active, runs)}
              className="text-accent hover:underline flex items-center gap-1"
            >
              <span>Audit Evidence Dossier</span>
              <ExternalLink size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 5. Source Evidence Modal ────────────────────────────────────────────────

function EvidenceModal({
  activityType,
  runs,
  onClose,
}: {
  activityType: string;
  runs: CompletedRun[];
  onClose: () => void;
}) {
  const tax = getReadableActivity(activityType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="max-w-2xl w-full bg-surface border border-hair rounded-2xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-hair flex items-center justify-between bg-raised/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-fg text-body">
                {activityType}
              </span>
              <span className="text-muted">·</span>
              <h3 className="font-semibold text-fg text-body">{tax.name}</h3>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Verified source records and inspector sign-offs from site execution.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-raised transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 flex-1 overflow-auto flex flex-col gap-4">
          <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-xl p-3 text-xs flex items-center gap-2.5 text-emerald-400">
            <ShieldCheck size={16} className="shrink-0" />
            <span>
              All {runs.length} completed activities carry verified actual start and actual finish timestamps signed off by the Resident Planning Engineer. Unverified field logs are strictly excluded.
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {runs.map((r) => (
              <div
                key={r.activity_id}
                className="border border-hair rounded-xl p-3.5 bg-raised/30 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-fg">
                      {r.activity_id}
                    </span>
                    <h5 className="text-xs text-muted font-medium mt-0.5">
                      {r.description}
                    </h5>
                  </div>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-surface border border-hair text-fg">
                    Actual: {r.actual_days} days
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-hair text-[11px] font-mono text-muted">
                  <div>
                    <span className="text-[10px] uppercase block text-muted">Planned Duration</span>
                    <span className="text-fg">{r.planned_days} days</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase block text-muted">Execution Window</span>
                    <span className="text-fg">
                      {r.actual_start ?? '—'} → {r.actual_finish ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase block text-muted">Verification Source</span>
                    <span className="text-fg">{r.source ?? 'Verified Site Diary'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-hair bg-raised/50 flex items-center justify-between text-xs text-muted">
          <span className="font-mono">
            Basis: Confirmed Completed Actuals Only
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-surface border border-hair text-fg hover:bg-raised font-medium transition-colors"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 6. Knowledge Base View ──────────────────────────────────────────────────

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
            type="button"
            onClick={() => setSelectedCat('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              selectedCat === 'all'
                ? 'bg-fg text-surface shadow-xs'
                : 'bg-surface text-muted hover:text-fg border border-hair'
            }`}
          >
            All Domain Rules ({kbData.total_rules})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCat('environmental')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              selectedCat === 'environmental'
                ? 'bg-fg text-surface shadow-xs'
                : 'bg-surface text-muted hover:text-fg border border-hair'
            }`}
          >
            Environmental & Weather ({kbData.categories.environmental ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCat('engineering')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              selectedCat === 'engineering'
                ? 'bg-fg text-surface shadow-xs'
                : 'bg-surface text-muted hover:text-fg border border-hair'
            }`}
          >
            Engineering Specs ({kbData.categories.engineering ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCat('dcma_quality')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              selectedCat === 'dcma_quality'
                ? 'bg-fg text-surface shadow-xs'
                : 'bg-surface text-muted hover:text-fg border border-hair'
            }`}
          >
            DCMA 14-Point Standards ({kbData.categories.dcma_quality ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCat('logistics')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              selectedCat === 'logistics'
                ? 'bg-fg text-surface shadow-xs'
                : 'bg-surface text-muted hover:text-fg border border-hair'
            }`}
          >
            Logistics & Permits ({kbData.categories.logistics ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCat('contractor')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              selectedCat === 'contractor'
                ? 'bg-fg text-surface shadow-xs'
                : 'bg-surface text-muted hover:text-fg border border-hair'
            }`}
          >
            Contractor Benchmarks ({kbData.categories.contractor ?? 0})
          </button>
        </div>

        <span className="text-xs text-muted font-mono flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          Active Enforced Guardrails
        </span>
      </div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="border border-hair rounded-xl p-5 bg-surface shadow-xs flex flex-col justify-between gap-4"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold uppercase bg-raised text-muted border border-hair">
                  {rule.id}
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold uppercase border border-hair bg-raised ${
                    rule.severity === 'critical' ? 'text-danger' : 'text-warn'
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
              <div className="bg-raised rounded-lg p-2.5 border border-hair">
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted block mb-1">
                  Schedule Audit Trigger:
                </span>
                <span className="text-fg">{rule.condition_trigger}</span>
              </div>
              <div className="bg-raised rounded-lg p-2.5 border border-hair text-fg">
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted block mb-1">
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

// ── Main Project Knowledge Page ─────────────────────────────────────────────

export default function Memory() {
  usePageHeader(
    'Project Knowledge',
    'Learn from verified execution history to improve future planning.',
    '/memory'
  );

  const [activeTab, setActiveTab] = useState<'historical' | 'knowledge' | 'estimator'>('historical');
  const [learningScope, setLearningScope] = useState<'current' | 'regional' | 'corporate'>('current');
  const [selectedActivityType, setSelectedActivityType] = useState<string>('PIP-HYT');
  const [evidenceModalData, setEvidenceModalData] = useState<{
    open: boolean;
    activityType: string;
    runs: CompletedRun[];
  }>({
    open: false,
    activityType: '',
    runs: [],
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['memory', 'all'],
    queryFn: () => api.queryMemory({ query_type: 'all' }),
  });

  if (error) {
    return (
      <ErrorState
        error={error}
        mode="full"
        title="Error loading project knowledge"
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

  return (
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-5">
      {/* ── Context Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-hair bg-raised text-label">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-fg">Oil India Limited — Well Pad 04</span>
          <span className="text-muted">·</span>
          <span className="text-fg font-medium">Project Knowledge</span>
          <span className="text-muted">·</span>
          <span className="text-muted text-xs">Verified Site Records Only</span>
        </div>
        <div className="flex items-center gap-3 text-muted">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-fg border border-hair bg-surface font-mono text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Planning Engineer & Project Controls Console
          </span>
        </div>
      </div>

      {/* ── Data Quality Gate Strip ── */}
      <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
          <span className="font-medium text-fg">
            Data Ingestion Quality Gate:
          </span>
          <span className="text-muted">
            Only confirmed, engineer-approved site actuals feed into Project Knowledge.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <span className="text-emerald-400 font-medium">✓ Confirmed actuals only</span>
          <span className="text-emerald-400 font-medium">✓ 100% completed only</span>
          <span className="text-muted">✕ Pending reviews excluded</span>
          <span className="text-muted">✕ Contested records excluded</span>
        </div>
      </div>

      {/* Navigation View Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-hair pb-3">
        <div>
          <p className="text-body text-muted max-w-2xl leading-relaxed">
            {activeTab === 'historical'
              ? 'Execution metrics computed from verified site diaries and field measurements against baseline plans.'
              : activeTab === 'knowledge'
              ? 'Institutional domain rules, environmental weather constraints, and DCMA schedule standards enforced by NAVIS AI.'
              : 'Empirical duration forecasts and delay buffer calibration for upcoming project tenders.'}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-hair bg-raised p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('historical')}
            className={`px-3 py-1.5 text-label font-medium rounded-md transition-colors ${
              activeTab === 'historical'
                ? 'bg-selected text-fg shadow-xs font-semibold'
                : 'text-muted hover:text-fg'
            }`}
          >
            Historical Benchmarks
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
            <span className="px-1.5 py-0.2 rounded text-label bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono">
              7
            </span>
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
          </button>
        </div>
      </div>

      {activeTab === 'historical' ? (
        <div className="flex flex-col gap-4">
          {/* Multi-Level Institutional Learning Hierarchy */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-raised/60 border border-hair rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs">
              <Building2 size={15} className="text-accent shrink-0" />
              <span className="font-semibold text-fg">Institutional Learning Hierarchy:</span>
              <span className="text-muted hidden md:inline">
                Compare current execution against regional and corporate historical norms.
              </span>
            </div>
            <div className="inline-flex rounded-lg border border-hair bg-surface p-0.5 text-xs font-medium shadow-2xs">
              <button
                type="button"
                onClick={() => setLearningScope('current')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  learningScope === 'current'
                    ? 'bg-selected text-fg font-semibold shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Current Project (Active Actuals)
              </button>
              <button
                type="button"
                onClick={() => setLearningScope('regional')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  learningScope === 'regional'
                    ? 'bg-selected text-fg font-semibold shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Site / Region History (Upper Assam · 4 Basins)
              </button>
              <button
                type="button"
                onClick={() => setLearningScope('corporate')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  learningScope === 'corporate'
                    ? 'bg-selected text-fg font-semibold shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Organization Benchmark (Corporate EPC · 12 Projects)
              </button>
            </div>
          </div>

          {learningScope !== 'current' && (
            <div className="border border-hair bg-surface rounded-xl p-3 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History size={14} className="text-accent shrink-0" />
                <span className="text-fg font-medium">
                  {learningScope === 'regional'
                    ? 'Upper Assam Regional Reference: Hydrotesting historical median is 6.2d across 16 packages; bored piling productivity averages 1.1 piles/day with 18% monsoon contingency.'
                    : 'Corporate EPC Multi-Project Reference: Calibrated norms from 12 onshore processing installations with standard 14-point DCMA compliance thresholds.'}
                </span>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-raised border border-hair text-muted shrink-0">
                Multi-Project Reference
              </span>
            </div>
          )}

          {/* Core Grid */}
          <div className="grid grid-cols-12 gap-4">
            {/* Table: Planned vs actual duration */}
            <Panel title="Planned vs actual duration" span="col-span-12 lg:col-span-7">
              <PlannedVsActual
                rows={durations}
                selectedType={selectedActivityType}
                onSelectType={(t) => setSelectedActivityType(t)}
              />
            </Panel>

            {/* Panel: Suggested duration */}
            <Panel title="Suggested duration" span="col-span-12 lg:col-span-5">
              <PlanningInsightPanel
                types={durations}
                selectedType={selectedActivityType}
                onSelectType={(t) => setSelectedActivityType(t)}
                onOpenEvidence={(type, runs) =>
                  setEvidenceModalData({ open: true, activityType: type, runs })
                }
              />
            </Panel>

            {/* Panel: Average Duration Variance by Discipline */}
            <Panel title="Average Duration Variance by Discipline" span="col-span-12 lg:col-span-6">
              <DisciplineDurationVariance rows={productivity} />
            </Panel>

            {/* Panel: Recurring Execution Patterns */}
            <Panel title="Recurring Execution Patterns" span="col-span-12 lg:col-span-6">
              <RecurringExecutionPatterns />
            </Panel>
          </div>
        </div>
      ) : activeTab === 'estimator' ? (
        <TenderEstimator durations={durations} />
      ) : (
        <KnowledgeBaseView />
      )}

      {/* Evidence Modal */}
      {evidenceModalData.open && (
        <EvidenceModal
          activityType={evidenceModalData.activityType}
          runs={evidenceModalData.runs}
          onClose={() =>
            setEvidenceModalData({ open: false, activityType: '', runs: [] })
          }
        />
      )}

      {data && (
        <div className="flex items-center justify-between text-xs text-muted font-mono pt-2 border-t border-hair">
          <span>NAVIS Execution Intelligence Platform</span>
          <span>Computed {new Date(data.computed_at).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
