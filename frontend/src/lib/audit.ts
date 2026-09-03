/**
 * How an audit record came to exist.
 *
 * `auto_applied` was read as a two-state flag — true meant the matcher wrote
 * it, false meant a planner confirmed it. False does not mean that. It means
 * "not written automatically", and the system produces plenty of rows that fit
 * that description without anyone confirming anything: a `source_conflict` row
 * noting that two sources disagreed, and an `actual_finish_withheld` row
 * recording a finish date the system deliberately declined to write (D-015).
 *
 * On a clean `scripts\demo_reset.ps1` state — zero planner actions, every row
 * `source = "matching"` — 67 of the 275 audit records rendered as "Confirmed by
 * planner". The audit trail is the product's evidence for who decided what, so
 * a label that attributes a system decision to a human is the one thing it
 * must never do.
 *
 * `source` is the field that actually answers the question. `_write_audit` in
 * `server/main.py` sets it to "planner_review" on the review-resolve path and
 * to "matching" / "extraction" everywhere else, and it is already on both
 * audit response shapes.
 */

/** Rows written by a person adjudicating a review item. */
const PLANNER_SOURCES = new Set(['planner_review']);

export type AuditActor = 'planner' | 'auto' | 'recorded';

export function auditActor(record: {
  source?: string | null;
  auto_applied?: boolean | null;
}): AuditActor {
  if (record.source && PLANNER_SOURCES.has(record.source)) return 'planner';
  if (record.auto_applied) return 'auto';
  // The system looked at this and chose not to write it: a source conflict, or
  // a finish withheld because no source named the date.
  return 'recorded';
}

/** Full label, for the audit drawer. */
export function auditActorLabel(record: {
  source?: string | null;
  auto_applied?: boolean | null;
}): string {
  switch (auditActor(record)) {
    case 'planner':
      return 'Confirmed by planner';
    case 'auto':
      return 'Auto';
    default:
      return 'Recorded, not applied';
  }
}

/** One word, for the dense Recent Activity list on Home. */
export function auditActorShort(record: {
  source?: string | null;
  auto_applied?: boolean | null;
}): string {
  switch (auditActor(record)) {
    case 'planner':
      return 'planner';
    case 'auto':
      return 'auto';
    default:
      return 'noted';
  }
}
