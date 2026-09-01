import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Discipline } from '../../types';
import { DISCIPLINES, WORK_FRONTS } from '../../config';
import { SectionTitle } from '../../components/ui';

/**
 * Work front and discipline — the structured context sent with every agent
 * turn. Collapsed it states the two values; open it edits them.
 */
export function ContextBlock({
  open,
  onToggle,
  workFront,
  onWorkFront,
  discipline,
  onDiscipline,
}: {
  open: boolean;
  onToggle: () => void;
  workFront: string;
  onWorkFront: (v: string) => void;
  discipline: Discipline;
  onDiscipline: (v: Discipline) => void;
}) {
  return (
    <div className="border border-hair bg-raised rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-selected transition-colors"
      >
        <SectionTitle>Current Context</SectionTitle>
        {open ? (
          <ChevronUp size={18} className="text-accent" />
        ) : (
          <ChevronDown size={18} className="text-accent" />
        )}
      </button>
      {open ? (
        <div className="px-4 pb-5 pt-4 flex flex-col gap-4 border-t border-hair">
          <label className="flex flex-col gap-2">
            <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
              Work front
            </span>
            <select
              value={workFront}
              onChange={(e) => onWorkFront(e.target.value)}
              className="rounded-sm bg-raised border border-hair text-fg text-lead px-4 py-3 transition-colors focus:outline-none focus:border-accent"
            >
              {WORK_FRONTS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
              Discipline
            </span>
            <select
              value={discipline}
              onChange={(e) => onDiscipline(e.target.value as Discipline)}
              className="rounded-sm bg-raised border border-hair text-fg text-lead px-4 py-3 transition-colors focus:outline-none focus:border-accent"
            >
              {DISCIPLINES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="px-4 pb-4 pt-4 flex flex-col gap-2 border-t border-hair">
          <div className="flex justify-between gap-3 text-lead">
            <span className="text-muted">Work front</span>
            <span className="text-fg text-right">{workFront}</span>
          </div>
          <div className="flex justify-between gap-3 text-lead">
            <span className="text-muted">Discipline</span>
            <span className="text-fg text-right">
              {DISCIPLINES.find((d) => d.value === discipline)?.label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
