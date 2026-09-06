import React from 'react';
import { StopCircle, X } from 'lucide-react';
import { NeedsYourResponse, RecentUpdates } from '../../components/FieldContextBlocks';
import { Waveform, mmss } from './shared';

/**
 * Recording flow state:
 * 🔴 Recording 00:18 · Tap to finish
 * [ Cancel ]
 */
export function ListeningStage({
  elapsed,
  transcript,
  silent,
  onStop,
  onCancel,
}: {
  elapsed: number;
  transcript: string;
  silent: boolean;
  onStop: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="w-full max-w-[780px] mx-auto py-2 sm:py-3 px-3 sm:px-4 flex flex-col gap-4">
      <div className="relative border border-hair bg-raised rounded-2xl overflow-hidden p-6 sm:p-7 flex flex-col items-center gap-5 text-center shadow-xs">
        {/* Accent rule across the top */}
        <span className="absolute top-0 left-0 w-full h-1 bg-accent" aria-hidden />

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-mono text-xs font-semibold">
          <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse" />
          <span>Recording</span>
          <span>{mmss(elapsed)}</span>
          <span className="sr-only">Listening</span>
        </div>

        <Waveform />

        <div className="min-h-[70px] flex flex-col items-center justify-center text-center w-full gap-1.5 px-4">
          <p className="text-base sm:text-lg font-medium leading-relaxed text-heading">
            {transcript ? (
              `“${transcript}”`
            ) : (
              <span className="text-muted text-sm">Speak now… dictating site update</span>
            )}
          </p>
          {silent && <span className="text-xs text-muted">still listening…</span>}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm pt-2">
          <button
            type="button"
            onClick={onStop}
            className="w-full py-3 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <StopCircle size={16} />
            <span>Tap to finish</span>
            <span className="sr-only">Stop & Process</span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto py-3 px-4 rounded-xl border border-hair bg-surface hover:bg-selected text-muted hover:text-heading font-medium text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <X size={14} />
            <span>Cancel</span>
          </button>
        </div>
      </div>

      {/* Dimmed while recording */}
      <NeedsYourResponse dimmed />
      <RecentUpdates dimmed />
    </div>
  );
}

