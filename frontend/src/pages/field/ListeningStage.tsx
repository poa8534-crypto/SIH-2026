import React from 'react';
import { StopCircle } from 'lucide-react';
import { NeedsYourResponse, RecentUpdates } from '../../components/FieldContextBlocks';
import { Button } from '../../components/ui';
import { Waveform, mmss } from './shared';

/**
 * QUESTION:  Is it hearing me?
 * ACTION:    Stop and process.
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
    <>
      <div className="relative border border-hair bg-raised rounded-lg overflow-hidden px-5 py-5 flex flex-col items-center gap-4">
        {/* Accent rule across the top: this panel is the live one. */}
        <span className="absolute top-0 left-0 w-full h-1 bg-accent" aria-hidden />

        <div className="w-full flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-danger rounded-full animate-pulse" />
            <span className="text-label font-semibold uppercase tracking-[0.05em] text-danger">
              Listening
            </span>
          </span>
          <span className="font-mono text-h3 font-semibold text-accent">
            {mmss(elapsed)}
          </span>
        </div>

        <Waveform />

        <div className="min-h-[80px] flex flex-col items-center justify-center text-center w-full gap-2">
          <p className="text-h3 leading-7 text-fg">
            {transcript ? (
              `“${transcript}”`
            ) : (
              <span className="text-muted text-lead">Speak now…</span>
            )}
          </p>
          {/* A pause does not end the recording, so say so rather than
              leaving him wondering whether it stopped. */}
          {silent && <span className="text-body text-muted">still listening…</span>}
        </div>

        <Button variant="primary" block onClick={onStop}>
          <StopCircle size={18} />
          Stop &amp; Process
        </Button>
        <Button variant="ghost" block onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {/* Dimmed while recording: still in sight, not competing for it. */}
      <NeedsYourResponse dimmed />
      <RecentUpdates dimmed />
    </>
  );
}
