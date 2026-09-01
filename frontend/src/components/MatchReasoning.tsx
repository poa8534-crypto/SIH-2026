import React from 'react';

/**
 * Why the matcher chose what it chose.
 *
 * This is the product's differentiator and until now it was rendered nowhere:
 * `rationale` (deterministic feature names, per D-003 — never LLM prose),
 * `margin` (top-1 minus top-2) and `match_method` are all persisted and were
 * all invisible.
 *
 * The component is deliberately honest about missing data. GET /review-queue
 * does not yet project these three fields (see the note on `ReviewItem` in
 * types.ts), so on Reconcile it renders the "not supplied" line rather than an
 * empty box that reads like a bug or, worse, a fabricated score. On Ingest,
 * where GET /jobs/{id} does supply them, it renders the real values.
 */

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
  const hasMargin = typeof margin === 'number';

  return (
    <div className={`flex flex-col gap-3 ${className}`.trim()}>
      <div className="flex flex-wrap items-baseline gap-5">
        <Figure label="Score">{(confidence * 100).toFixed(1)}%</Figure>
        <Figure label="Margin over next">
          {hasMargin ? (
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
          /* Not an empty state and not a zero — a statement about the API.
             Nothing here is ever invented client-side. */
          <span className="text-body text-muted leading-relaxed">
            GET /review-queue does not return{' '}
            <span className="font-mono text-fg">rationale</span>,{' '}
            <span className="font-mono text-fg">margin</span> or{' '}
            <span className="font-mono text-fg">match_method</span> yet. They are
            recorded on the linked event and already returned by GET /jobs/
            {'{id}'} — see the Ingest screen&rsquo;s Why column.
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
