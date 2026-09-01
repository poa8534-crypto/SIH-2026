import React from 'react';
import { Check } from 'lucide-react';
import { NeedsYourResponse, RecentUpdates } from '../../components/FieldContextBlocks';
import { Button } from '../../components/ui';

/**
 * QUESTION:  Did it go through, and what happens now?
 * ACTION:    Return home.
 */
export function SubmittedStage({
  reference,
  onReturn,
}: {
  reference: string | null;
  onReturn: () => void;
}) {
  return (
    <>
      <div className="border border-hair bg-raised rounded-lg px-5 py-8 flex flex-col items-center text-center gap-3">
        <span className="w-16 h-16 rounded-full bg-selected flex items-center justify-center">
          <Check size={30} className="text-accent" />
        </span>
        <h1 className="text-h2 font-semibold text-heading mt-1">Update submitted</h1>
        {reference && (
          <p className="w-full rounded-sm border border-hair bg-surface px-3 py-2 font-mono text-label text-muted break-all">
            Report reference: {reference}
          </p>
        )}
        <p className="text-lead text-fg">Sent for Planning Engineer review.</p>
        <p className="text-lead text-muted">The project schedule has not been changed.</p>
        <Button variant="primary" block className="mt-2" onClick={onReturn}>
          Return Home
        </Button>
      </div>

      <NeedsYourResponse />
      <RecentUpdates />
    </>
  );
}
