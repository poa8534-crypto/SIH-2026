import { Discipline } from '../types';
import { DISCIPLINE_SHORT, isDiscipline } from '../config';

interface DisciplineTagProps {
  discipline: Discipline;
}

/**
 * One colour per discipline, resolved through --disc-* so each has a bright
 * variant for the dark theme and a darkened variant for the light one. The
 * previous single set was tuned for neither: static_equipment (#882255) sat
 * at 1.9:1 on the dark background and piping (#AA4499) at 2.8:1.
 *
 * The border is `currentColor`, so it tracks the text colour automatically.
 * Labels come from config so this file cannot fall out of step with the
 * filters and legends that render the same six.
 */
const DISCIPLINE_COLOR: Record<Discipline, string> = {
  civil: 'text-disc-civil',
  piping: 'text-disc-piping',
  static_equipment: 'text-disc-seq',
  electrical: 'text-disc-ele',
  instrumentation: 'text-disc-ins',
  hse: 'text-disc-hse',
};

export function DisciplineTag({ discipline }: DisciplineTagProps) {
  // A value outside the six is data this system did not produce. Say so with
  // a question mark rather than manufacturing a plausible three-letter code —
  // that is how a discipline nobody defined ends up looking official.
  const known = isDiscipline(discipline);
  const label = known ? DISCIPLINE_SHORT[discipline] : '?';
  const color = known ? DISCIPLINE_COLOR[discipline] : 'text-muted';

  return (
    <span
      title={known ? undefined : `Unrecognised discipline: ${discipline}`}
      className={`font-mono text-[11px] px-2 py-[1px] border border-current rounded-full uppercase ${color}`}
    >
      {label}
    </span>
  );
}
