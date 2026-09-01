import React from 'react';
import { ReviewCandidate } from '../types';

/**
 * Why the matcher chose what it chose.
 *
 * `rationale` (deterministic feature names, per D-003 — never LLM prose),
 * `margin` (top-1 minus top-2) and `match_method` are persisted on the linked
 * event and are now projected by GET /review-queue as well as GET /jobs/{id},
 * so this renders real values on Reconcile rather than explaining their
 * absence. See D-042.
 *
 * Nothing here is ever computed client-side. Where a value is genuinely
 * missing — a row ingested before per-candidate scores were serialised — it is
 * reported as missing, never substituted.
 */

/**
 * Normalise `ReviewItem.alternatives` to candidate objects.
 *
 * The field is `Array<ReviewCandidate | string>`: the server's
 * `alternative_candidates()` reads both shapes because rows written before
 * per-candidate scores were serialised hold bare ids, and the client mirrors
 * that tolerance. A bare id yields `score: 0` and no rationale, which the UI
 * shows as "no score sent" rather than as a zero.
 */
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

export function SignalChips({ rationale }: { rationale: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {rationale.map((r) => (
        <span
          key={r}
          title="Feature the matcher recorded as firing for this candidate"
          className="font-mono text-label bg-selected text-accent px-2 py-1 rounded-full leading-none"
        >
          {r}
        </span>
      ))}
    </div>
  );
}

export function MatchReasoning({
  confidence,
  margin,
  matchMethod,
  rationale,
  className = '',
}: {
  confidence: number;
  margin?: number;
  matchMethod?: string;
  rationale?: string[];
  className?: string;
}) {
  const hasSignals = Array.isArray(rationale) && rationale.length > 0;

  return (
    <div className={`flex flex-col gap-3 ${className}`.trim()}>
      <div className="flex flex-wrap items-baseline gap-5">
        <Figure label="Score">{(confidence * 100).toFixed(1)}%</Figure>
        <Figure label="Margin over next">
          {typeof margin === 'number' ? (
            margin.toFixed(3)
          ) : (
            <span className="text-muted">—</span>
          )}
        </Figure>
        <Figure label="Method">
          {matchMethod ?? <span className="text-muted">—</span>}
        </Figure>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-label uppercase tracking-wider text-muted">
          Signals that fired
        </span>
        {hasSignals ? (
          <SignalChips rationale={rationale} />
        ) : (
          <span className="text-body text-muted">
            No signals recorded for this decision.
          </span>
        )}
      </div>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-label uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="font-mono text-h3 text-fg leading-none">{children}</span>
    </div>
  );
}
