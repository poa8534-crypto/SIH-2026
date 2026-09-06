import React, { useState } from 'react';
import { ReviewCandidate } from '../types';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Why NAVIS did not auto-link this report.
 *
 * Replaces contradictory "Why the matcher chose this" with an authoritative
 * Auto-Link Decision summary displaying:
 * - Result: NO MATCH (or manual decision required)
 * - Best candidate score (e.g. 39.5%)
 * - Auto-link threshold (77.5% tau_high)
 * - Margin over runner-up in readable points (e.g. 1.9 pts instead of 0.019)
 * - Clear, human-readable reasons
 * - Collapsible technical signals inspector
 */

/** Normalise `ReviewItem.alternatives` to candidate objects. */
export function toCandidates(
  alternatives: Array<ReviewCandidate | string>
): ReviewCandidate[] {
  return alternatives.map((a, i) =>
    typeof a === 'string'
      ? { activity_id: a, rank: i + 1, score: 0, rationale: [], description: null }
      : a
  );
}

/** True when this candidate carries a real score of its own. */
export function hasScore(c: ReviewCandidate): boolean {
  return c.score > 0;
}

export interface HumanSignal {
  type: 'ok' | 'fail' | 'warn';
  label: string;
  tooltip: string;
}

export function humanizeSignal(signal: string): HumanSignal {
  switch (signal) {
    case 'within_planned_window':
      return { type: 'ok', label: '✓ Date window', tooltip: 'Activity falls within reported date window' };
    case 'tag_line_match':
    case 'tag_full_match':
      return { type: 'ok', label: '✓ Tag match', tooltip: 'Exact equipment tag / line number match' };
    case 'discipline_match':
      return { type: 'ok', label: '✓ Discipline', tooltip: 'Discipline matches field supervisor reporting' };
    case 'high_fuzzy_similarity':
    case 'high_embedding_similarity':
      return { type: 'ok', label: '✓ Text match', tooltip: 'Strong scope description similarity' };
    case 'quantity_within_planned':
      return { type: 'ok', label: '✓ Qty aligned', tooltip: 'Reported quantity consistent with planned scope' };
    case 'uom_compatible':
      return { type: 'ok', label: '✓ UOM valid', tooltip: 'Unit of measure compatible' };
    case 'area_match':
      return { type: 'ok', label: '✓ Area match', tooltip: 'Physical work location aligns' };
    case 'planner_confirmed_alias':
      return { type: 'ok', label: '✓ Alias match', tooltip: 'Matches prior planner-confirmed alias' };
    case 'predecessor_not_startable':
      return { type: 'fail', label: '✕ Logic block', tooltip: 'Predecessor activities not yet complete' };
    case 'uom_conflict':
      return { type: 'fail', label: '✕ UOM mismatch', tooltip: 'Unit of measure conflict' };
    case 'discipline_conflict':
      return { type: 'fail', label: '✕ Discipline clash', tooltip: 'Discipline conflicts with activity scope' };
    case 'below_tau_low':
      return { type: 'fail', label: '✕ Low score', tooltip: 'Score falls below confidence floor' };
    case 'margin_too_small':
      return { type: 'warn', label: '~ Close margin', tooltip: 'Top candidate margin below separation threshold' };
    case 'weak_evidence':
      return { type: 'warn', label: '~ Weak evidence', tooltip: 'Sparse correlation evidence in field report' };
    default:
      return { type: 'warn', label: `~ ${signal.replace(/_/g, ' ')}`, tooltip: signal };
  }
}

/** Human-readable signal chips for candidate cards */
export function CandidateSignalChips({ rationale = [] }: { rationale?: string[] }) {
  const hasDate = rationale.includes('within_planned_window');
  const hasTag = rationale.includes('tag_line_match') || rationale.includes('tag_full_match');
  const hasText = rationale.includes('high_fuzzy_similarity') || rationale.includes('high_embedding_similarity');

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {hasDate ? (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-ok/10 text-ok border border-ok/30" title="Activity falls within reported date window">
          ✓ Date window
        </span>
      ) : (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface text-muted border border-hair" title="Outside scheduled date window">
          ~ Date off-window
        </span>
      )}

      {hasTag ? (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-ok/10 text-ok border border-ok/30" title="Equipment tag match">
          ✓ Tag match
        </span>
      ) : (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface text-muted border border-hair" title="No matching equipment tag">
          ✕ No tag
        </span>
      )}

      {hasText ? (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-ok/10 text-ok border border-ok/30" title="Strong description alignment">
          ✓ Description
        </span>
      ) : (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-warn/10 text-warn border border-warn/30" title="Weak description similarity">
          ~ Weak text
        </span>
      )}
    </div>
  );
}

/** Legacy raw signal chips retained for technical inspector */
export function SignalChips({ rationale }: { rationale: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {rationale.map((r) => (
        <span
          key={r}
          title="Feature the matcher recorded as firing for this candidate"
          className="font-mono text-label bg-selected text-accent px-2 py-0.5 rounded-full leading-none"
        >
          {r}
        </span>
      ))}
    </div>
  );
}

export interface MatchReasoningProps {
  confidence: number;
  margin?: number;
  matchMethod?: string;
  rationale?: string[];
  reason?: string;
  bestCandidateScore?: number;
  runnerUpScore?: number;
  autoLinkThreshold?: number;
  className?: string;
}

export function MatchReasoning({
  confidence,
  margin,
  matchMethod = 'hybrid',
  rationale = [],
  reason,
  bestCandidateScore,
  runnerUpScore,
  autoLinkThreshold = 0.775,
  className = '',
}: MatchReasoningProps) {
  const [showTechSignals, setShowTechSignals] = useState(false);

  // Normalise scores and margins
  const topScore = bestCandidateScore !== undefined && bestCandidateScore > 0
    ? bestCandidateScore
    : confidence;

  const topScorePct = (topScore * 100).toFixed(1);
  const thresholdPct = (autoLinkThreshold * 100).toFixed(1);

  // Margin calculation in readable percentage points
  let marginPts: number | null = null;
  if (typeof margin === 'number') {
    marginPts = margin * 100;
  } else if (bestCandidateScore !== undefined && runnerUpScore !== undefined && runnerUpScore > 0) {
    marginPts = (bestCandidateScore - runnerUpScore) * 100;
  }

  // Construct plain-English reasons
  const reasonsList: string[] = [];

  if (topScore < autoLinkThreshold) {
    reasonsList.push(`Match score too low (${topScorePct}% vs ${thresholdPct}% auto-link threshold)`);
  }

  if (marginPts !== null && marginPts < 3.0) {
    reasonsList.push(`Top candidates too close together (${marginPts.toFixed(1)} pts margin vs 3.0 pts required)`);
  }

  const hasTag = rationale.some((r) => r.includes('tag'));
  if (!hasTag) {
    reasonsList.push('No strong equipment/tag evidence identified in report');
  }

  if (rationale.includes('predecessor_not_startable')) {
    reasonsList.push('Predecessor activities not yet complete in schedule logic');
  }

  if (reason === 'defaulted_finish_date') {
    reasonsList.push('Finish date asserted, but cumulative physical progress is partial');
  }

  if (reason === 'source_conflict') {
    reasonsList.push('Conflicting updates reported across multiple site sources');
  }

  if (reasonsList.length === 0) {
    reasonsList.push('Description similarity insufficient for automated baseline modification');
  }

  return (
    <div className={`flex flex-col gap-3 font-mono ${className}`.trim()}>
      {/* Header and Decision Result */}
      <div className="flex items-center justify-between pb-2 border-b border-hair">
        <div className="flex items-center gap-2">
          <span className="text-h3 font-semibold text-heading tracking-tight font-sans">
            Auto-Link Decision
          </span>
        </div>
        <span className="font-mono text-label bg-selected text-accent px-2 py-0.5 rounded-full uppercase font-bold border border-accent/30">
          {reason === 'defaulted_finish_date' ? 'WITHHELD FINISH' : reason === 'source_conflict' ? 'CONFLICT' : 'NO MATCH'}
        </span>
      </div>

      {/* Decision Metric Figures in Percentage Points */}
      <div className="grid grid-cols-3 gap-2 p-2.5 bg-surface border border-hair rounded-lg text-label">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted font-medium mb-0.5">
            Best candidate
          </span>
          <span className="text-h3 font-bold text-fg leading-tight">
            {topScorePct}%
          </span>
          <span className="text-[10px] text-muted">match score</span>
        </div>
        <div className="flex flex-col border-x border-hair px-2">
          <span className="text-[10px] uppercase tracking-wider text-muted font-medium mb-0.5">
            Auto-link threshold
          </span>
          <span className="text-h3 font-bold text-fg leading-tight">
            {thresholdPct}%
          </span>
          <span className="text-[10px] text-muted">calibrated τ_high</span>
        </div>
        <div className="flex flex-col pl-1">
          <span className="text-[10px] uppercase tracking-wider text-muted font-medium mb-0.5">
            Margin over #2
          </span>
          <span className="text-h3 font-bold text-fg leading-tight">
            {marginPts !== null ? `${marginPts.toFixed(1)} pts` : '—'}
          </span>
          <span className="text-[10px] text-muted">runner-up delta</span>
        </div>
      </div>

      {/* Primary Decision Reasons */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">
          Why NAVIS did not auto-link:
        </span>
        <ul className="space-y-1">
          {reasonsList.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-label text-fg leading-snug">
              <span className="text-muted font-bold select-none">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Planner Adjudication Callout & Technical Signals Toggle */}
      <div className="pt-2 border-t border-hair flex items-center justify-between text-label">
        <span className="text-accent font-semibold text-[11px]">
          → Planner decision required
        </span>
        <button
          type="button"
          onClick={() => setShowTechSignals(!showTechSignals)}
          className="text-muted hover:text-fg text-[11px] underline flex items-center gap-1 transition-colors"
        >
          {showTechSignals ? (
            <>Hide technical signals <ChevronDown size={12} /></>
          ) : (
            <>View technical signals → <ChevronRight size={12} /></>
          )}
        </button>
      </div>

      {/* Collapsible Raw Machine Signals */}
      {showTechSignals && (
        <div className="p-3 bg-raised border border-hair rounded-lg flex flex-col gap-2 text-[11px] text-muted">
          <div className="grid grid-cols-2 gap-2 pb-2 border-b border-hair">
            <div>
              <span className="text-muted uppercase text-[9px] block">Event confidence:</span>
              <strong className="text-fg">{(confidence * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span className="text-muted uppercase text-[9px] block">Matching method:</span>
              <strong className="text-fg">{matchMethod}</strong>
            </div>
            <div>
              <span className="text-muted uppercase text-[9px] block">Raw margin:</span>
              <strong className="text-fg">{typeof margin === 'number' ? margin.toFixed(4) : '—'}</strong>
            </div>
            <div>
              <span className="text-muted uppercase text-[9px] block">Threshold point:</span>
              <strong className="text-fg">τ_high={autoLinkThreshold}</strong>
            </div>
          </div>
          <div>
            <span className="text-muted uppercase text-[9px] block mb-1">Fired feature signals:</span>
            {rationale && rationale.length > 0 ? (
              <SignalChips rationale={rationale} />
            ) : (
              <span className="italic text-muted">No raw feature signals recorded.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

