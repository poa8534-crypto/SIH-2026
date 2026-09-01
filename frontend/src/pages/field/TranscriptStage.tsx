import React from 'react';
import { NeedsYourResponse, RecentUpdates } from '../../components/FieldContextBlocks';
import { Button } from '../../components/ui';

/**
 * QUESTION:  Did it hear me correctly?
 * ACTION:    Use this transcript.
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
    <>
      <div className="border border-hair bg-raised rounded-lg px-5 py-5 flex flex-col gap-4">
        <div>
          <h1 className="text-h3 font-semibold text-heading">Check your transcript</h1>
          <p className="text-lead text-muted mt-1 leading-6">
            Check this before sending — speech recognition can mishear equipment
            numbers.
          </p>
        </div>
        <textarea
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          rows={5}
          className="rounded-sm w-full bg-raised border border-hair text-fg text-lead leading-6 p-4 transition-colors focus:outline-none focus:border-accent resize-none"
        />
        <Button variant="primary" block onClick={onUse} disabled={!draft.trim()}>
          Use This Transcript
        </Button>
        <Button variant="secondary" block onClick={onRecordAgain}>
          Record Again
        </Button>
      </div>

      <NeedsYourResponse dimmed />
      <RecentUpdates dimmed title="My Recent Updates" />
    </>
  );
}
