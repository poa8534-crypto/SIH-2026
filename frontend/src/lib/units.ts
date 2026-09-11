/**
 * Unit and count formatting for screens a non-technical reader signs off on.
 *
 * Two defects this exists to stop, both found in the Senior Management sweep
 * (D-111) and both live at the time:
 *
 * 1. **"1 Days".** Five call sites interpolated a raw count straight into a
 *    hardcoded plural — `{dispute.contractor_delay_days} Days`. With the
 *    contractor delay at exactly 1 day, every executive screen read "1 Days".
 *    It is small, and it is on the first tile a judge looks at.
 *
 * 2. **Fractional pieces.** The discipline table rendered
 *    `totalInstalledQty.toLocaleString()` with no rounding, so a rolled-up
 *    count of discrete items printed as "1,446.94 / 1,693 nos" and
 *    "182.856 / 371 nos". You cannot install 0.94 of a flange. The quantity is
 *    fractional because percent-complete rollup accrues partial credit; the
 *    display must not imply the partial item is real.
 *
 * Rounding policy is per UOM rather than global, because the right answer
 * differs by dimension: a count of pieces has no decimals, a length or a
 * volume legitimately does. `qty` keeps one decimal for continuous units and
 * drops to whole numbers for discrete ones, and never invents precision the
 * source did not carry.
 */

/** UOMs that count discrete objects — these can never be fractional on screen. */
const DISCRETE_UOMS = new Set(['nos', 'no', 'ea', 'each', 'pcs', 'pc', 'set', 'sets', 'lot']);

/**
 * `n` followed by a unit that agrees with it.
 *
 * `plural` defaults to `singular + 's'`, which covers "day"/"days" and
 * "event"/"events"; pass it explicitly for anything irregular.
 */
export function pluralise(n: number, singular: string, plural?: string): string {
  return `${n} ${Math.abs(n) === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** "1 Day" / "0 Days" / "41 Days" — the title-case form the KPI tiles use. */
export function days(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return pluralise(n, 'Day');
}

/** Signed day delta for a variance chip: "+14d", "-1d", "0d". */
export function signedDays(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n > 0 ? '+' : ''}${n}d`;
}

/**
 * A quantity formatted for its unit of measure.
 *
 * Discrete units round to whole numbers; everything else keeps at most one
 * decimal and drops a trailing ".0" so a clean figure stays clean.
 */
export function qty(value: number | null | undefined, uom?: string | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const unit = (uom ?? '').trim().toLowerCase();
  if (DISCRETE_UOMS.has(unit)) {
    return Math.round(value).toLocaleString();
  }
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
