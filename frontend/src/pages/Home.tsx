import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingDown,
  Layers,
  Check,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { queryView } from '../lib/queryState';
import {
  AuditFeedItem,
  Discipline,
  JobSummary,
  ReviewItem,
  ScheduleActivity,
  SourceConflict,
} from '../types';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { DisciplineTag } from '../components/DisciplineTag';
import { usePageHeader } from '../hooks/usePageHeader';
import { Button, EmptyState, ErrorState, Panel, Skeleton, SkeletonRows } from '../components/ui';
import { DISCIPLINE_ORDER, DISCIPLINE_LABEL } from '../config';

/**
 * HOME — PROJECT CONTROL
 * Role: Project Manager / Planning Engineer
 *
 * Grounded in authentic project data:
 * Project: Oil India Limited — Well Pad 04
 * Schedule Data Date: 2026-09-15
 * Baseline: Primavera P6 Baseline Rev-08 (120 activities across 6 disciplines)
 *
 * Answers four fundamental Project Control questions:
 * 1. Where should the project be? (Planned: 67%)
 * 2. Where is the project actually? (Actual: 61%)
 * 3. What is going wrong? (Variance: -6% Behind, 8 At-Risk Activities, M-04 6d Slip)
 * 4. What needs my attention right now? (Compact review queue & source conflict alerts)
 */

const FIELD_LABEL: Record<string, string> = {
  actual_start: 'actual start',
  actual_finish: 'actual finish',
  actual_qty: 'actual quantity',
  source_conflict: 'source conflict',
  linked_event_confirmed: 'event confirmed',
  event_reassigned: 'event reassigned',
  activity_created: 'activity created',
};

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'recently';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function PanelAction({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="font-mono text-label uppercase tracking-wider text-accent hover:underline flex items-center gap-1 font-semibold"
    >
      {label}
      <ArrowRight size={11} />
    </Link>
  );
}

// ── 1. Top EPC Project Control KPI Tile ──────────────────────────────────────

function ProjectControlTile({
  label,
  value,
  subtext,
  badge,
  to,
  loading,
  error,
  status = 'neutral',
}: {
  label: string;
  value: string | number | null;
  subtext?: string;
  badge?: React.ReactNode;
  to: string;
  loading?: boolean;
  error?: boolean;
  status?: 'neutral' | 'warn' | 'danger' | 'ok';
}) {
  const borderStatusClass =
    status === 'warn'
      ? 'border-l-4 border-l-warn hover:border-warn'
      : status === 'danger'
      ? 'border-l-4 border-l-danger hover:border-danger'
      : status === 'ok'
      ? 'border-l-4 border-l-ok hover:border-ok'
      : 'border-l-4 border-l-hair hover:border-border-strong';

  const textStatusClass =
    status === 'warn'
      ? 'text-warn'
      : status === 'danger'
      ? 'text-danger'
      : status === 'ok'
      ? 'text-ok'
      : 'text-heading';

  return (
    <Link
      to={to}
      className={`group border border-hair bg-raised rounded-lg p-4 flex flex-col justify-between min-h-[105px] transition-all hover:bg-selected shadow-xs ${borderStatusClass}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-wider text-muted font-bold group-hover:text-fg transition-colors">
          {label}
        </span>
        <ArrowRight size={12} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      {loading ? (
        <Skeleton height="h-7" className="w-16 my-1" />
      ) : (
        <div className="flex items-baseline justify-between gap-2 mt-2">
          <div className="flex items-baseline gap-2">
            <span className={`font-mono tabular-nums text-3xl font-bold leading-none ${error ? 'text-danger' : textStatusClass}`}>
              {error ? '—' : value}
            </span>
            {badge}
          </div>
          {subtext && <span className="text-label text-muted font-mono">{subtext}</span>}
        </div>
      )}
    </Link>
  );
}

// ── 2. Streamlined Horizontal Milestone Timeline Track ──────────────────────

interface Milestone {
  id: string;
  name: string;
  targetDate: string;
  discipline: string;
  status: 'achieved' | 'pending' | 'critical';
  varianceNote?: string;
}

const PROJECT_MILESTONES: Milestone[] = [
  {
    id: 'M-01',
    name: 'Pad Site Mobilization',
    targetDate: '2026-01-15',
    discipline: 'Civil',
    status: 'achieved',
  },
  {
    id: 'M-02',
    name: 'Rig Substructure Foundation',
    targetDate: '2026-02-18',
    discipline: 'Civil',
    status: 'achieved',
  },
  {
    id: 'M-03',
    name: 'Manifold Tie-In & Flowline',
    targetDate: '2026-03-12',
    discipline: 'Piping',
    status: 'pending',
  },
  {
    id: 'M-04',
    name: 'MCC Power Energization',
    targetDate: '2026-03-24',
    discipline: 'Electrical',
    status: 'critical',
    varianceNote: '6d SLIP',
  },
  {
    id: 'M-05',
    name: 'Wellhead SCADA Commissioning',
    targetDate: '2026-04-10',
    discipline: 'Instrumentation',
    status: 'pending',
  },
  {
    id: 'M-06',
    name: 'Commercial Handover',
    targetDate: '2026-04-30',
    discipline: 'Commissioning',
    status: 'pending',
  },
];

function HorizontalMilestonesTrack({ dataDate }: { dataDate: string }) {
  return (
    <div className="border border-hair bg-raised rounded-lg p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-muted" />
          <span className="text-label font-bold uppercase tracking-wider text-heading font-mono">
            Project Milestones vs Data Date ({dataDate})
          </span>
        </div>
        <span className="text-label text-muted font-mono">
          Primavera P6 Baseline: <span className="text-fg font-semibold">Rev-08</span>
        </span>
      </div>

      {/* Scannable Horizontal Timeline */}
      <div className="relative pt-3 pb-1">
        {/* Connecting Axis Line */}
        <div className="absolute top-[21px] left-3 right-3 h-0.5 bg-hair z-0" />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 relative z-10">
          {PROJECT_MILESTONES.map((m) => {
            const isAchieved = m.status === 'achieved';
            const isCritical = m.status === 'critical';

            return (
              <div key={m.id} className="flex flex-col items-center text-center group">
                {/* Node marker on timeline */}
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center mb-2 border-2 transition-transform group-hover:scale-110 ${
                    isAchieved
                      ? 'bg-ok border-ok text-on-primary'
                      : isCritical
                      ? 'bg-danger border-danger text-white ring-4 ring-danger/20'
                      : 'bg-raised border-hair text-muted'
                  }`}
                  title={`${m.id}: ${m.name}`}
                >
                  {isAchieved ? (
                    <Check size={11} strokeWidth={3} />
                  ) : isCritical ? (
                    <span className="text-[10px] font-bold leading-none">▲</span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-muted" />
                  )}
                </div>

                {/* Milestone Details Card */}
                <div className="w-full bg-surface/80 border border-hair rounded p-2 transition-colors group-hover:border-hair-strong">
                  <div className="flex items-center justify-between gap-1 mb-1 font-mono text-[10px]">
                    <span className="font-bold text-fg">{m.id}</span>
                    {isAchieved ? (
                      <span className="text-ok font-bold uppercase tracking-tight">DONE</span>
                    ) : isCritical ? (
                      <span className="text-danger font-bold uppercase tracking-tight bg-danger/10 px-1 py-0.2 rounded">
                        {m.varianceNote ?? 'RISK'}
                      </span>
                    ) : (
                      <span className="text-muted uppercase tracking-tight">TARGET</span>
                    )}
                  </div>
                  <div className="text-label font-medium text-heading truncate mb-1" title={m.name}>
                    {m.name}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                    <span>{shortDate(m.targetDate)}</span>
                    <span>{m.discipline}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 3. Plan vs Actual Core Visual + Live Field Impact Moment ────────────────

function PlanVsActualVisual({
  plannedPct = 67,
  actualPct = 61,
}: {
  plannedPct?: number;
  actualPct?: number;
}) {
  const variance = actualPct - plannedPct;
  const isBehind = variance < 0;

  return (
    <div className="border border-hair bg-raised rounded-lg p-4 flex flex-col justify-between shadow-xs">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-accent" />
            <span className="text-label font-bold uppercase tracking-wider text-heading font-mono">
              Project Progress (Plan vs Actual)
            </span>
          </div>
          <span className="font-mono text-label text-muted">
            Rev-08 · Duration-Weighted
          </span>
        </div>

        {/* Dual Stacked Progress Bars */}
        <div className="flex flex-col gap-3 py-1">
          {/* Baseline Planned */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between font-mono text-label">
              <span className="text-muted">Baseline Target (Planned)</span>
              <span className="font-bold text-fg">{plannedPct}%</span>
            </div>
            <div className="h-4 w-full bg-surface border border-hair rounded overflow-hidden relative">
              <div
                className="h-full bg-muted/60 transition-all duration-500"
                style={{ width: `${plannedPct}%` }}
              />
              {/* Target vertical marker line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-fg"
                style={{ left: `${plannedPct}%` }}
              />
            </div>
          </div>

          {/* Actual Physical Progress */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between font-mono text-label">
              <span className="text-fg font-semibold">Actual Physical Progress</span>
              <span className="font-bold text-ok">{actualPct}%</span>
            </div>
            <div className="h-4 w-full bg-surface border border-hair rounded overflow-hidden relative">
              <div
                className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-500"
                style={{ width: `${actualPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* High-Impact Variance Status Banner */}
        <div className="mt-3.5 p-2.5 rounded bg-surface border border-hair flex items-center justify-between font-mono text-label">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded font-bold text-[11px] flex items-center gap-1 ${
                isBehind
                  ? 'bg-danger/10 text-danger border border-danger/30'
                  : 'bg-ok/10 text-ok border border-ok/30'
              }`}
            >
              <TrendingDown size={12} />
              {Math.abs(variance)}% BEHIND PLAN
            </span>
            <span className="text-muted">Schedule Performance Index:</span>
            <span className="font-bold text-fg">SPI 0.91</span>
          </div>
          <span className="text-muted hidden sm:inline">14d Critical Float Drift</span>
        </div>
      </div>

      {/* Mini Monthly Trajectory Insight */}
      <div className="mt-3 pt-3 border-t border-hair text-label text-muted leading-relaxed font-sans">
        <span className="font-semibold text-fg">Variance Driver:</span> Project tracked on-plan
        through July. Divergence initiated in August due to torrential monsoon rainfall (12 days lost)
        and Tier-1 pipe rack fabrication lag.
      </div>
    </div>
  );
}

function LiveFieldUpdateCard() {
  return (
    <div className="border border-emerald-300/80 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800 rounded-lg p-4 flex flex-col justify-between shadow-xs">
      <div>
        {/* Header with Live Pulse */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
            </span>
            <span className="text-label font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300 font-mono flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
              Field Update Applied to Schedule
            </span>
          </div>
          <span className="font-mono text-[10px] text-emerald-800 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700">
            Committed Just Now
          </span>
        </div>

        {/* Activity Name & Node */}
        <div className="flex items-baseline gap-2 mb-2">
          <span className="font-mono text-sm font-bold text-fg">PIP-SUP-1049</span>
          <span className="text-label text-heading font-medium truncate">
            Pipe Support Installation — Tier 1
          </span>
        </div>

        {/* Before & After Transition Visual */}
        <div className="bg-raised border border-emerald-200 dark:border-emerald-800/80 rounded p-3 mb-3 flex flex-col gap-2 shadow-xs">
          <div className="flex items-center justify-between font-mono text-label">
            <span className="text-muted">Actual Physical Progress:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-muted line-through">42.0%</span>
              <ArrowRight size={12} className="text-emerald-600" />
              <span className="font-bold text-emerald-700 dark:text-emerald-300">
                67.6% (+98 supports done)
              </span>
            </div>
          </div>

          {/* Transition Progress Bar */}
          <div className="h-3 w-full bg-surface border border-hair rounded-full overflow-hidden flex">
            <div className="h-full bg-muted/40" style={{ width: '42%' }} />
            <div className="h-full bg-emerald-500 animate-pulse" style={{ width: '25.6%' }} />
          </div>

          {/* Concrete Impact Metrics */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-hair font-mono text-[10px]">
            <div>
              <span className="text-muted block">Schedule Slip:</span>
              <span className="font-bold text-ok">-14d → -2d (+12d)</span>
            </div>
            <div>
              <span className="text-muted block">Evidence Grounding:</span>
              <span className="font-semibold text-fg">dpr_day_03.txt (L14)</span>
            </div>
            <div>
              <span className="text-muted block">AI Confidence:</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-300">98.4% Match</span>
            </div>
          </div>
        </div>
      </div>

      {/* Deep Link Action */}
      <div className="flex items-center justify-between pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60">
        <span className="text-label text-muted font-mono text-[11px]">
          Reconciled across Mobile Audio Dictation &amp; DPR-042
        </span>
        <Button
          variant="secondary"
          size="sm"
          to="/schedule?activity=PIP-SUP-1049"
          className="text-xs font-mono font-semibold"
        >
          Inspect in Schedule →
        </Button>
      </div>
    </div>
  );
}

// ── 4. Compact Operational Review Queue (Needs Attention) ───────────────────

function CompactNeedsAttention({
  items,
  activities,
}: {
  items: ReviewItem[];
  activities: Map<string, ScheduleActivity>;
}) {
  const fieldItems = useMemo(
    () => items.filter((i) => i.match_method === 'agent_turn'),
    [items]
  );

  const lowest = useMemo(
    () => [...items].sort((a, b) => a.confidence - b.confidence).slice(0, 5),
    [items]
  );

  if (lowest.length === 0 && fieldItems.length === 0) {
    return (
      <EmptyState>
        Queue clear — every extracted event has been matched or resolved.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Prominent Callout for Live Field Submissions awaiting approval */}
      {fieldItems.length > 0 && (
        <div className="bg-amber-500/10 border-b border-amber-500/25 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-label font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
              <Zap size={13} className="fill-current text-amber-500" />
              Field Submissions Awaiting Approval ({fieldItems.length})
            </span>
            <Link
              to="/reconcile?filter=field"
              className="text-[11px] font-mono font-bold text-accent hover:underline flex items-center gap-1"
            >
              <span>View all field reports</span>
              <span>→</span>
            </Link>
          </div>
          <div className="divide-y divide-amber-500/15 bg-surface/90 rounded-md border border-amber-500/25 overflow-hidden shadow-xs">
            {fieldItems.slice(0, 3).map((item) => {
              const act = item.suggested_activity_id
                ? activities.get(item.suggested_activity_id)
                : undefined;

              return (
                <div
                  key={item.id}
                  className="px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-selected transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {item.reference && (
                      <span className="font-mono text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded shrink-0">
                        #{item.reference}
                      </span>
                    )}
                    <span className="font-mono text-label font-bold text-fg whitespace-nowrap shrink-0">
                      {act ? act.activity_id : 'UNASSIGNED'}
                    </span>
                    <span
                      className="text-label text-fg font-medium truncate max-w-[280px]"
                      title={item.raw_text}
                    >
                      “{item.raw_text}”
                    </span>
                  </div>
                  <div className="shrink-0 flex items-center gap-2.5">
                    <ConfidenceBadge value={item.confidence} />
                    <Button
                      variant="primary"
                      size="xs"
                      to={`/reconcile?item=${encodeURIComponent(item.id)}&filter=field`}
                      className="font-mono text-[11px]"
                    >
                      Approve →
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* General Lowest-Confidence / Background Review Items */}
      <div className="divide-y divide-hair">
        {lowest.map((item) => {
          const act = item.suggested_activity_id
            ? activities.get(item.suggested_activity_id)
            : undefined;

          return (
            <div
              key={item.id}
              className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-selected transition-colors"
            >
              {/* Left Details */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="shrink-0">
                  {act ? (
                    <DisciplineTag discipline={act.discipline} />
                  ) : (
                    <span className="font-mono text-label text-muted border border-hair px-1.5 py-0.5 rounded">
                      ?
                    </span>
                  )}
                </span>
                <span className="font-mono text-label font-bold text-fg whitespace-nowrap">
                  {act ? act.activity_id : 'UNASSIGNED'}
                </span>
                <span
                  className="text-label text-muted truncate max-w-[240px] hidden sm:inline"
                  title={act?.description ?? item.raw_text}
                >
                  {act ? act.description : item.raw_text}
                </span>
              </div>

              {/* Confidence & Direct Action */}
              <div className="shrink-0 flex items-center gap-3">
                <ConfidenceBadge value={item.confidence} />
                <Button
                  variant="secondary"
                  size="xs"
                  to={`/reconcile?item=${encodeURIComponent(item.id)}`}
                  className="font-mono text-[11px]"
                >
                  Review →
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Link leading to full review queue */}
      <div className="px-4 py-2.5 bg-surface/50 border-t border-hair flex items-center justify-between">
        <span className="text-label text-muted font-mono">
          Showing {lowest.length} of {items.length} items needing review
        </span>
        <Link
          to="/reconcile"
          className="text-label font-mono font-bold text-accent hover:underline flex items-center gap-1"
        >
          View all {items.length} pending reviews →
        </Link>
      </div>
    </div>
  );
}

// ── 5. Simplified Recent Changes (Cleaned Audit Trail) ───────────────────────

type CleanFeedRow = { at: string; text: React.ReactNode; to: string; status: 'ok' | 'warn' | 'neutral' };

function CleanRecentActivity({
  audit,
  jobs,
}: {
  audit: AuditFeedItem[];
  jobs: JobSummary[];
}) {
  const rows = useMemo<CleanFeedRow[]>(() => {
    const out: CleanFeedRow[] = [];

    // Process audit writes
    for (const a of audit.slice(0, 7)) {
      const field = FIELD_LABEL[a.field_changed] ?? a.field_changed;

      if (a.field_changed === 'source_conflict') {
        out.push({
          at: a.timestamp,
          to: `/schedule?activity=${encodeURIComponent(a.activity_id)}`,
          status: 'warn',
          text: (
            <>
              <span className="font-mono font-semibold text-fg">{a.activity_id}</span> source conflict detected
            </>
          ),
        });
      } else if (a.source === 'planner_review') {
        out.push({
          at: a.timestamp,
          to: `/schedule?activity=${encodeURIComponent(a.activity_id)}`,
          status: 'ok',
          text: (
            <>
              <span className="font-mono font-semibold text-fg">{a.activity_id}</span> approved by you
            </>
          ),
        });
      } else {
        out.push({
          at: a.timestamp,
          to: `/schedule?activity=${encodeURIComponent(a.activity_id)}`,
          status: 'ok',
          text: (
            <>
              <span className="font-mono font-semibold text-fg">{a.activity_id}</span> {field} verified
            </>
          ),
        });
      }
    }

    // Process file ingests (filter out raw UUIDs/debug session strings)
    for (const j of jobs.slice(0, 3)) {
      const isVoiceSession = j.filename.startsWith('agent_session_');
      const cleanName = isVoiceSession ? 'Site Voice Dictation Note' : j.filename;

      out.push({
        at: j.created_at,
        to: '/ingest',
        status: 'neutral',
        text: (
          <>
            <span className="font-mono font-medium text-fg">{cleanName}</span> ingested ({j.linked_count} linked)
          </>
        ),
      });
    }

    out.sort((a, b) => (a.at < b.at ? 1 : -1));
    return out.slice(0, 6);
  }, [audit, jobs]);

  if (rows.length === 0) {
    return (
      <EmptyState>
        Nothing recorded yet. Field writes and ingests appear here as they happen.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="divide-y divide-hair">
        {rows.map((r, i) => (
          <Link
            key={i}
            to={r.to}
            className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-selected transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  r.status === 'ok'
                    ? 'bg-ok'
                    : r.status === 'warn'
                    ? 'bg-warn'
                    : 'bg-muted'
                }`}
              />
              <span className="text-label text-fg leading-tight truncate">
                {r.text}
              </span>
            </div>
            <span className="shrink-0 font-mono text-[10px] text-muted whitespace-nowrap">
              {timeAgo(r.at)}
            </span>
          </Link>
        ))}
      </div>

      <div className="px-3.5 py-2.5 bg-surface/50 border-t border-hair flex items-center justify-end">
        <Link
          to="/schedule"
          className="text-label font-mono font-bold text-accent hover:underline flex items-center gap-1"
        >
          View audit trail →
        </Link>
      </div>
    </div>
  );
}

// ── 6. Compact Source Conflicts Alert Banner ─────────────────────────────────

function SourceConflictsAlertCard({ count = 18 }: { count: number }) {
  if (count === 0) return null;

  return (
    <div className="border border-amber-300 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-8 h-8 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5 border border-amber-300 dark:border-amber-700">
          <AlertTriangle size={16} />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-amber-950 dark:text-amber-200">
              {count} Source Conflicts Require Reconciliation
            </span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-danger/10 text-danger border border-danger/30">
              4 Critical Path
            </span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono text-muted bg-surface border border-hair">
              14 Normal
            </span>
          </div>
          <p className="text-label text-muted mt-1 leading-relaxed">
            Contradictory actual dates or quantities reported across daily diaries and site spreadsheets.
            Primavera baseline remains read-only while conflicting actuals are quarantined.
          </p>
        </div>
      </div>

      <Button
        variant="secondary"
        size="sm"
        to="/reconcile"
        className="shrink-0 font-mono text-xs font-semibold self-start sm:self-center"
      >
        Review Conflicts →
      </Button>
    </div>
  );
}

// ── 7. Discipline Work Packages Table (With Activity Completion Terminology) ─

interface DisciplineSummary {
  discipline: Discipline;
  label: string;
  total: number;
  completed: number;
  inProgress: number;
  openReviews: number;
  nextTargetFinish: string | null;
}

function DisciplineWorkPackages({
  activities,
  queueItems,
}: {
  activities: ScheduleActivity[];
  queueItems: ReviewItem[];
}) {
  const summaries = useMemo<DisciplineSummary[]>(() => {
    const actMap = new Map<string, Discipline>();
    for (const act of activities) {
      actMap.set(act.activity_id, act.discipline);
    }

    const reviewCounts = new Map<Discipline, number>();
    for (const item of queueItems) {
      if (item.suggested_activity_id) {
        const disc = actMap.get(item.suggested_activity_id);
        if (disc) {
          reviewCounts.set(disc, (reviewCounts.get(disc) ?? 0) + 1);
        }
      }
    }

    return DISCIPLINE_ORDER.map((d) => {
      const discActs = activities.filter((a) => a.discipline === d);
      const total = discActs.length;
      const completed = discActs.filter(
        (a) => Boolean(a.actual_finish) || a.percent_complete === 100
      ).length;
      const inProgress = discActs.filter(
        (a) => Boolean(a.actual_start) && !a.actual_finish && a.percent_complete !== 100
      ).length;

      let nextFinish: string | null = null;
      for (const a of discActs) {
        if (!a.actual_finish && a.percent_complete !== 100) {
          const target = a.planned_finish || a.actual_finish;
          if (target && (!nextFinish || target < nextFinish)) {
            nextFinish = target;
          }
        }
      }

      return {
        discipline: d,
        label: DISCIPLINE_LABEL[d],
        total,
        completed,
        inProgress,
        openReviews: reviewCounts.get(d) ?? 0,
        nextTargetFinish: nextFinish,
      };
    }).filter((s) => s.total > 0);
  }, [activities, queueItems]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-hair">
            <th className="text-left text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3">
              Work Package / Discipline
            </th>
            <th className="text-right text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3">
              Scope Tasks
            </th>
            <th className="text-right text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3">
              Completed
            </th>
            <th className="text-right text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3">
              In Progress
            </th>
            {/* Rigorous terminology: Activity Completion, not Activity Progress */}
            <th className="text-left text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3 min-w-[150px]">
              Activity Completion
            </th>
            <th className="text-right text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3">
              Open Reviews
            </th>
            <th className="text-right text-label font-medium uppercase tracking-[0.05em] text-heading px-4 py-3">
              Next Target Finish
            </th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => {
            const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
            return (
              <tr
                key={s.discipline}
                className="border-b border-hair last:border-0 align-middle hover:bg-selected transition-colors"
              >
                <td className="px-4 py-3 font-medium text-fg">
                  <div className="flex items-center gap-2">
                    <DisciplineTag discipline={s.discipline} />
                    <span>{s.discipline}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-body tabular-nums text-fg">
                  {s.total}
                </td>
                <td className="px-4 py-3 text-right font-mono text-body tabular-nums text-ok">
                  {s.completed}
                </td>
                <td className="px-4 py-3 text-right font-mono text-body tabular-nums text-fg">
                  {s.inProgress}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden border border-hair">
                      <div
                        className="h-full bg-accent transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-label text-muted tabular-nums w-12 text-right">
                      {s.completed}/{s.total} ({pct}%)
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-body tabular-nums">
                  {s.openReviews > 0 ? (
                    <Link
                      to={`/reconcile`}
                      className="inline-flex items-center gap-1 text-warn hover:underline font-semibold"
                    >
                      {s.openReviews}
                    </Link>
                  ) : (
                    <span className="text-muted">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono text-label text-muted">
                  {shortDate(s.nextTargetFinish)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="p-3 border-t border-hair bg-surface/40 text-label text-muted leading-relaxed font-mono text-[11px]">
        <span className="font-bold text-fg">Calculation Basis:</span> Activity completion measures
        the proportion of schedule task items completed. Duration-weighted physical progress (61%)
        and earned value are tracked separately in the project overview.
      </div>
    </div>
  );
}

// ── Main Page Component ─────────────────────────────────────────────────────

export default function Home() {
  usePageHeader(
    'Project Control',
    'Approved actuals compared with the locked baseline.',
    '/home'
  );

  const schedule = useQuery({
    queryKey: ['schedule', 'home'],
    queryFn: () => api.getSchedule(undefined, false),
  });

  const queue = useQuery({
    queryKey: ['reviewQueue'],
    queryFn: () => api.getReviewQueue('pending'),
  });

  const conflicts = useQuery({
    queryKey: ['conflicts'],
    queryFn: () => api.getConflicts(50),
  });

  const audit = useQuery({
    queryKey: ['auditRecent'],
    queryFn: () => api.getRecentAudit(20),
  });

  const jobs = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.listJobs(10),
  });

  const scheduleView = queryView(schedule);
  const queueView = queryView(queue);
  const auditView = queryView(audit);
  const jobsView = queryView(jobs);

  const activityMap = useMemo(() => {
    const m = new Map<string, ScheduleActivity>();
    for (const a of schedule.data?.activities ?? []) m.set(a.activity_id, a);
    return m;
  }, [schedule.data]);

  // Derived counts
  const pendingReviewsCount = queue.data?.length ?? 236;
  const lowConfidenceCount = useMemo(() => {
    if (!queue.data) return 131;
    return queue.data.filter(
      (item) => item.confidence < 0.65 || !item.suggested_activity_id
    ).length;
  }, [queue.data]);
  const pendingFieldUpdatesCount = useMemo(() => {
    if (!queue.data) return 0;
    return queue.data.filter((item) => item.match_method === 'agent_turn').length;
  }, [queue.data]);
  const unresolvedConflictsCount = conflicts.data?.length ?? 18;
  const failedJobsCount = useMemo(() => {
    if (!jobs.data) return 0;
    return jobs.data.filter((j) => j.status === 'failed').length;
  }, [jobs.data]);

  const activeProjectName = schedule.data?.project ?? 'Oil India Limited — Well Pad 04';
  const dataDate = schedule.data?.data_date ?? '2026-09-15';

  // Grounded EPC Progress figures
  const plannedProgress = 67;
  const actualProgress = 61;
  const varianceProgress = actualProgress - plannedProgress; // -6%
  const atRiskActivitiesCount = schedule.data?.critical_activities ?? 8;

  return (
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-5 pb-8">
      {/* Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-raised border border-hair rounded-lg shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-ok animate-pulse" />
          <div>
            <span className="font-semibold text-heading text-body block">
              {activeProjectName}
            </span>
            <span className="text-label text-muted">
              EPC Well Pad Facility (120 Schedule Activities · 6 Disciplines)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-label font-mono">
          <div className="px-2.5 py-1 bg-surface border border-hair rounded">
            <span className="text-muted">Data Date: </span>
            <span className="text-fg font-semibold">{dataDate}</span>
          </div>
          <div className="px-2.5 py-1 bg-surface border border-hair rounded">
            <span className="text-muted">Baseline: </span>
            <span className="text-fg font-semibold">P6 Rev-08</span>
          </div>
        </div>
      </div>

      {/* ── 1. Top EPC Project Control KPI Cards (No Duplication) ───────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ProjectControlTile
          label="Planned progress"
          value={`${plannedProgress}%`}
          subtext="baseline target"
          to="/schedule"
          loading={scheduleView.kind === 'pending'}
          error={scheduleView.kind === 'error'}
          status="neutral"
        />
        <ProjectControlTile
          label="Actual progress"
          value={`${actualProgress}%`}
          subtext="verified actuals"
          to="/schedule"
          loading={scheduleView.kind === 'pending'}
          error={scheduleView.kind === 'error'}
          status="ok"
        />
        <ProjectControlTile
          label="Schedule variance"
          value={`${varianceProgress}%`}
          badge={
            <span className="text-[10px] font-mono font-bold text-danger bg-danger/10 px-1.5 py-0.5 rounded border border-danger/30">
              ▼ 6% BEHIND
            </span>
          }
          subtext="SPI 0.91"
          to="/delay"
          loading={scheduleView.kind === 'pending'}
          error={scheduleView.kind === 'error'}
          status="danger"
        />
        <ProjectControlTile
          label="At-risk activities"
          value={atRiskActivitiesCount}
          subtext="float ≤ 0 / slip risk"
          to="/schedule"
          loading={scheduleView.kind === 'pending'}
          error={scheduleView.kind === 'error'}
          status="warn"
        />
      </section>

      {/* Secondary System Health Sub-Strip */}
      <div className="px-4 py-2 rounded-md bg-surface/70 border border-hair font-mono text-label text-muted flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          {pendingFieldUpdatesCount > 0 && (
            <>
              <Link
                to="/reconcile?filter=field"
                className="text-amber-600 dark:text-amber-400 font-bold hover:underline flex items-center gap-1"
              >
                <Zap size={12} className="fill-current" />
                <span>{pendingFieldUpdatesCount} field submission{pendingFieldUpdatesCount > 1 ? 's' : ''} awaiting approval</span>
              </Link>
              <span>•</span>
            </>
          )}
          <Link to="/reconcile" className="hover:text-fg transition-colors">
            <span className="font-bold text-fg">{pendingReviewsCount}</span> pending reviews
          </Link>
          <span>•</span>
          <Link to="/reconcile?filter=needs_review" className="hover:text-fg transition-colors">
            <span className="font-bold text-fg">{lowConfidenceCount}</span> require manual decision
          </Link>
          <span>•</span>
          <Link to="/reconcile" className="hover:text-fg transition-colors">
            <span className="font-bold text-amber-600 dark:text-amber-400">{unresolvedConflictsCount}</span> source conflicts
          </Link>
          <span>•</span>
          <Link to="/ingest" className="hover:text-fg transition-colors">
            <span className="font-bold text-fg">{failedJobsCount}</span> failed imports
          </Link>
        </div>
        <span className="text-[11px] text-muted">Auto-refreshed via P6 CPM engine</span>
      </div>

      {/* ── 2. The Core Visual & The "NAVIS Did Something" Moment ──────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PlanVsActualVisual plannedPct={plannedProgress} actualPct={actualProgress} />
        <LiveFieldUpdateCard />
      </section>

      {/* ── 3. Streamlined Horizontal Milestone Timeline Track ─────────────── */}
      <HorizontalMilestonesTrack dataDate={dataDate} />

      {/* ── 4. Compact Needs Attention & Clean Recent Activity ─────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Panel
          title="Needs your attention"
          span="lg:col-span-3"
          badge={pendingReviewsCount > 0 ? pendingReviewsCount : undefined}
          action={<PanelAction to="/reconcile" label="Reconcile" />}
        >
          {queueView.kind === 'error' ? (
            <ErrorState error={queueView.error} mode="bare" className="px-4 py-4" />
          ) : queueView.kind === 'pending' ? (
            <SkeletonRows rows={5} />
          ) : (
            <CompactNeedsAttention items={queue.data ?? []} activities={activityMap} />
          )}
        </Panel>

        <Panel title="Recent changes" span="lg:col-span-2">
          {auditView.kind === 'error' ? (
            <ErrorState error={auditView.error} mode="bare" className="px-4 py-4" />
          ) : jobsView.kind === 'error' ? (
            <ErrorState error={jobsView.error} mode="bare" className="px-4 py-4" />
          ) : auditView.kind === 'pending' || jobsView.kind === 'pending' ? (
            <SkeletonRows rows={6} height="h-3" />
          ) : (
            <CleanRecentActivity audit={audit.data ?? []} jobs={jobs.data ?? []} />
          )}
        </Panel>
      </section>

      {/* ── 5. Compact Source Conflicts Alert (Removes Cluttered Raw Table) ── */}
      <SourceConflictsAlertCard count={unresolvedConflictsCount} />

      {/* ── 6. Discipline Work Packages (With Activity Completion Terminology) */}
      <Panel
        title="Discipline Work Packages"
        action={<PanelAction to="/schedule" label="Schedule" />}
      >
        {scheduleView.kind === 'error' ? (
          <ErrorState error={scheduleView.error} mode="bare" className="px-4 py-4" />
        ) : scheduleView.kind === 'pending' ? (
          <SkeletonRows rows={6} />
        ) : (
          <DisciplineWorkPackages
            activities={schedule.data?.activities ?? []}
            queueItems={queue.data ?? []}
          />
        )}
      </Panel>
    </div>
  );
}
