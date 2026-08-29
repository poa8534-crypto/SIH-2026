import { Discipline } from '../types';

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
 */
const DISCIPLINE_CONFIG: Record<Discipline, { label: string; color: string }> = {
  civil: { label: 'CIV', color: 'text-disc-civil' },
  piping: { label: 'PIP', color: 'text-disc-piping' },
  static_equipment: { label: 'SEQ', color: 'text-disc-seq' },
  electrical: { label: 'ELE', color: 'text-disc-ele' },
  instrumentation: { label: 'INS', color: 'text-disc-ins' },
  hse: { label: 'HSE', color: 'text-disc-hse' },
};

export function DisciplineTag({ discipline }: DisciplineTagProps) {
  const config = DISCIPLINE_CONFIG[discipline] || {
    label: discipline.substring(0, 3).toUpperCase(),
    color: 'text-muted',
  };

  return (
    <span
      className={`font-mono text-[11px] px-[4px] py-[1px] border border-current rounded-[4px] uppercase ${config.color}`}
    >
      {config.label}
    </span>
  );
}
