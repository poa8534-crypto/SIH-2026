/**
 * The audit trail must never attribute a system decision to a person.
 *
 * `auto_applied === false` was rendered as "Confirmed by planner". It only
 * means "not written automatically", and the system emits rows that fit that
 * without anyone confirming anything: `source_conflict` (two sources
 * disagreed) and `actual_finish_withheld` (D-015 — no source named the date).
 *
 * Measured on a clean `scripts\demo_reset.ps1` state, before any planner has
 * touched anything: 275 audit rows, every one `source = "matching"`, and 67 of
 * them (50 source_conflict + 17 actual_finish_withheld) had auto_applied
 * false — so 67 rows claimed a confirmation that had not happened.
 */
import { describe, expect, it } from 'vitest';
import { auditActor, auditActorLabel, auditActorShort } from '../lib/audit';

describe('who decided an audit record', () => {
  it('credits a planner only when the planner path wrote it', () => {
    const rec = { source: 'planner_review', auto_applied: false };
    expect(auditActor(rec)).toBe('planner');
    expect(auditActorLabel(rec)).toBe('Confirmed by planner');
    expect(auditActorShort(rec)).toBe('planner');
  });

  it('calls an automatic write automatic', () => {
    const rec = { source: 'matching', auto_applied: true };
    expect(auditActor(rec)).toBe('auto');
    expect(auditActorLabel(rec)).toBe('Auto');
  });

  it('does not call a source conflict a planner confirmation', () => {
    // The exact shape of the 50 rows on a clean reset.
    const rec = { source: 'matching', auto_applied: false };
    expect(auditActor(rec)).toBe('recorded');
    expect(auditActorLabel(rec)).toBe('Recorded, not applied');
    expect(auditActorLabel(rec)).not.toMatch(/planner/i);
  });

  it('does not call a withheld finish a planner confirmation', () => {
    // The other 17. Same shape; D-015 declined to write the date.
    const rec = { source: 'matching', auto_applied: false };
    expect(auditActorShort(rec)).toBe('noted');
    expect(auditActorShort(rec)).not.toBe('planner');
  });

  it('an extraction-time row is never a planner confirmation', () => {
    expect(auditActor({ source: 'extraction', auto_applied: false })).toBe('recorded');
    expect(auditActor({ source: 'ingest', auto_applied: false })).toBe('recorded');
  });

  it('a planner confirmation that was also auto-applied still reads as planner', () => {
    expect(auditActor({ source: 'planner_review', auto_applied: true })).toBe('planner');
  });

  it('survives a record with no source at all', () => {
    // Older rows, or a response shape that omits it: fall back to the flag,
    // and never to "planner".
    expect(auditActor({ auto_applied: true })).toBe('auto');
    expect(auditActor({ auto_applied: false })).toBe('recorded');
    expect(auditActor({ source: null, auto_applied: null })).toBe('recorded');
  });
});
