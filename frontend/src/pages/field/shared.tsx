import React from 'react';
import { AgentTurnResponse, SlotState } from '../../types';

/**
 * Types and formatters shared by the /field stage components.
 *
 * Field.tsx was a single 1000-line component holding seven stages. The stages
 * now live one per file under this directory; the route component keeps ALL
 * state and every handler, and passes them down. Behaviour is unchanged — the
 * split is structural. See D-031.
 */

export type Stage =
  | 'idle'
  | 'listening'
  | 'transcript'
  | 'conversation'
  // Every slot is filled and the proposal is ready, but the supervisor
  // has not asked to see it yet. The mockup makes this a deliberate beat
  // rather than jumping straight to the card.
  | 'ready'
  | 'card'
  | 'submitted';

export interface Message {
  from: 'supervisor' | 'assistant';
  text: string;
  at: string;
}

export interface CardRow {
  key: 'activity' | 'status' | 'date' | 'quantity';
  label: string;
  value: string;
}

/** Props every stage needs to render the shared conversational chrome. */
export interface StageShared {
  turn: AgentTurnResponse | null;
  slots?: SlotState;
}

export const STATUS_LABEL: Record<string, string> = {
  completed: 'Finished',
  in_progress: 'In progress',
  delayed: 'Delayed',
  not_started: 'Not started',
};

export function clockTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Fixed month names rather than toLocaleDateString: current ICU renders
// September as "Sept", and the mockup reads "14 Sep 2026".
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function longDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Waveform ────────────────────────────────────────────────────────────────

/** Seven bars, staggered, as in the listening mockup. */
const BAR_HEIGHTS = [16, 32, 48, 24, 40, 32, 20];

export function Waveform() {
  return (
    <div className="flex justify-center items-center h-16 gap-1 w-full">
      {BAR_HEIGHTS.map((h, i) => (
        <span
          key={i}
          className="w-[4px] bg-accent origin-center"
          style={{
            height: `${h}px`,
            animation: 'navis-wave 1s infinite ease-in-out',
            animationDelay: `${i * 0.14}s`,
          }}
        />
      ))}
      <style>{`@keyframes navis-wave{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}`}</style>
    </div>
  );
}
