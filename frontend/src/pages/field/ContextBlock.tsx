import React, { useState } from 'react';
import { Check, Edit3, Settings2 } from 'lucide-react';
import { Discipline } from '../../types';
import { DISCIPLINES, WORK_FRONTS } from '../../config';

export const SHIFTS = [
  'Day Shift (06:00 - 18:00)',
  'Night Shift (18:00 - 06:00)',
  'General Shift (08:00 - 17:00)',
] as const;

export type Shift = (typeof SHIFTS)[number];

/**
 * Quick-editable context block: Workfront, Discipline, and Shift.
 * Allows quick [Change] inline toggles without burying details in heavy accordions.
 */
export function ContextBlock({
  workFront,
  onWorkFront,
  discipline,
  onDiscipline,
  shift = 'Day Shift (06:00 - 18:00)',
  onShift,
}: {
  open?: boolean;
  onToggle?: () => void;
  workFront: string;
  onWorkFront: (v: string) => void;
  discipline: Discipline;
  onDiscipline: (v: Discipline) => void;
  shift?: string;
  onShift?: (v: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const disciplineObj = DISCIPLINES.find((d) => d.value === discipline);

  return (
    <div className="border border-hair bg-raised rounded-xl p-3 sm:px-4 sm:py-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-heading uppercase tracking-wider text-[11px] flex items-center gap-1.5 shrink-0">
            <Settings2 size={13} className="text-accent shrink-0" />
            <span>Current Context</span>
          </span>
          <span className="text-muted font-normal">|</span>
          <span className="text-fg font-medium flex items-center flex-wrap gap-1.5">
            <span className="text-heading font-semibold">{workFront}</span>
            <span className="text-muted">·</span>
            <span className="text-heading font-semibold">{disciplineObj?.label ?? discipline}</span>
            <span className="text-muted">·</span>
            <span className="text-muted">{shift}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0 ml-auto"
        >
          <Edit3 size={11} />
          <span>{isEditing ? 'Done' : 'Change'}</span>
        </button>
      </div>

      {isEditing && (
        <div className="mt-3 pt-3 border-t border-hair grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Workfront */}
          <div className="p-2.5 rounded-lg border border-hair bg-surface flex flex-col gap-1">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
              Workfront
            </span>
            <select
              value={workFront}
              onChange={(e) => onWorkFront(e.target.value)}
              className="w-full text-xs py-1 px-1.5 rounded border border-hair bg-raised text-heading focus:outline-none focus:border-accent cursor-pointer"
            >
              {WORK_FRONTS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>

          {/* Discipline */}
          <div className="p-2.5 rounded-lg border border-hair bg-surface flex flex-col gap-1">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
              Discipline
            </span>
            <select
              value={discipline}
              onChange={(e) => onDiscipline(e.target.value as Discipline)}
              className="w-full text-xs py-1 px-1.5 rounded border border-hair bg-raised text-heading focus:outline-none focus:border-accent cursor-pointer"
            >
              {DISCIPLINES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Shift */}
          <div className="p-2.5 rounded-lg border border-hair bg-surface flex flex-col gap-1">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
              Shift
            </span>
            {onShift ? (
              <select
                value={shift}
                onChange={(e) => onShift(e.target.value)}
                className="w-full text-xs py-1 px-1.5 rounded border border-hair bg-raised text-heading focus:outline-none focus:border-accent cursor-pointer"
              >
                {SHIFTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-semibold text-heading truncate">{shift}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

