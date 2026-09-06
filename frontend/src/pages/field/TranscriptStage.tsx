import React from 'react';
import { RotateCcw, Send } from 'lucide-react';
import { NeedsYourResponse, RecentUpdates } from '../../components/FieldContextBlocks';

/**
 * Post-recording review:
 * Transcribed text inside composer, with [Redo] and [Submit Update].
 */
export function TranscriptStage({
  draft,
  onDraft,
  onUse,
  onRecordAgain,
}: {
  draft: string;
  onDraft: (v: string) => void;
  onUse: () => void;
  onRecordAgain: () => void;
}) {
  return (
    <div className="w-full max-w-[780px] mx-auto py-2 sm:py-3 px-3 sm:px-4 flex flex-col gap-4">
      <div className="border border-hair bg-raised rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-heading">Check your transcript</h1>
          <p className="text-xs sm:text-sm text-muted mt-0.5 leading-relaxed">
            Check this before sending — speech recognition can mishear equipment numbers.
          </p>
        </div>

        <textarea
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          rows={4}
          aria-label="Transcript draft"
          className="w-full rounded-xl border border-hair bg-surface p-3 text-sm text-heading placeholder:text-muted focus:outline-none focus:border-accent resize-y leading-relaxed"
        />

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-1 border-t border-hair/60">
          <button
            type="button"
            onClick={onUse}
            disabled={!draft.trim()}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-accent hover:opacity-90 active:opacity-95 text-accent-fg font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={13} />
            <span>Submit Update</span>
            <span className="sr-only">Use This Transcript</span>
          </button>
          <button
            type="button"
            onClick={onRecordAgain}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-hair bg-surface hover:bg-selected text-heading font-medium text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw size={13} />
            <span>Redo</span>
            <span className="sr-only">Record Again</span>
          </button>
        </div>
      </div>

      <NeedsYourResponse dimmed />
      <RecentUpdates dimmed title="My Recent Updates" />
    </div>
  );
}

