import React from 'react';
import { Mic, ShieldCheck } from 'lucide-react';
import { NeedsYourResponse, RecentUpdates } from '../../components/FieldContextBlocks';

/**
 * QUESTION:  What do I need to report?
 * ACTION:    Tap and speak.
 */
export function IdleStage({
  fallback,
  onStart,
  textInput,
  serverError,
  contextBlock,
}: {
  /** The mic-unavailable or not-understood panel, when one applies. */
  fallback: React.ReactNode;
  onStart: () => void;
  textInput: React.ReactNode;
  serverError: React.ReactNode;
  contextBlock: React.ReactNode;
}) {
  return (
    <>
      <div>
        {/* No auth and no profile endpoint: the app does not know who
            is holding the phone, so it does not pretend to. */}
        <h1 className="text-h2 font-semibold leading-8 text-heading">
          Report an update
        </h1>
        <p className="text-lead text-muted mt-1 leading-6">
          Report progress for the work fronts you supervise.
        </p>
      </div>

      {fallback ?? (
        /* The one thing this screen is for. The mic itself is a 96px
           circular primary fill, centred; the whole card is the tap
           target so it stays reachable with gloves on. */
        <button
          onClick={onStart}
          className="group border border-hair bg-raised rounded-lg px-5 py-8 flex flex-col items-center gap-5 text-center hover:bg-selected transition-colors"
        >
          <span className="w-24 h-24 rounded-full bg-accent text-accent-fg flex items-center justify-center group-hover:bg-accent-hover group-active:scale-95 transition-all">
            <Mic size={36} />
          </span>
          <span className="flex flex-col items-center gap-1">
            <span className="text-h3 font-semibold text-heading">Tap &amp; Speak</span>
            <span className="text-lead text-muted">
              Describe what happened on site
            </span>
          </span>
        </button>
      )}

      {textInput}
      {serverError}
      {contextBlock}
      <NeedsYourResponse />
      <RecentUpdates />
      <p className="flex items-start gap-2 text-label text-muted leading-relaxed">
        <ShieldCheck size={14} className="mt-px shrink-0" />
        Every submitted update requires Planning Engineer confirmation before
        project data changes.
      </p>
    </>
  );
}
