import React from 'react';
import { MicOff, WifiOff } from 'lucide-react';
import { Button } from '../../components/ui';

/**
 * The three ways this screen can fail, kept deliberately unalike.
 *
 * Collapsing them into one "something went wrong" panel would hide the only
 * thing that matters to a supervisor holding a phone on site: whether the
 * session is still alive, and whether anything reached the server.
 */

/** No microphone at all. Quiet and neutral — typing is the whole answer. */
export function MicUnavailable() {
  return (
    <div className="border border-hair bg-raised rounded-lg px-5 py-5 flex flex-col items-center gap-2 text-center">
      <span className="w-16 h-16 rounded-full bg-surface border border-hair flex items-center justify-center">
        <MicOff size={26} className="text-muted" />
      </span>
      <span className="text-h3 font-semibold text-heading mt-1">
        Microphone unavailable
      </span>
      <span className="text-lead text-muted">Typing works just as well.</span>
    </div>
  );
}

/** The mic worked, the recording did not. The session is still live. */
export function NotUnderstood({
  onRecordAgain,
  onType,
}: {
  onRecordAgain: () => void;
  onType: () => void;
}) {
  return (
    <div className="border border-warn bg-raised rounded-lg px-5 py-5 flex flex-col items-center gap-3 text-center">
      <span className="self-end flex items-center gap-2 rounded-full bg-selected px-3 py-1 text-label font-medium uppercase tracking-[0.05em] text-accent">
        <span className="w-2 h-2 rounded-full bg-accent" />
        Active
      </span>
      <span className="w-16 h-16 rounded-full bg-selected flex items-center justify-center">
        <MicOff size={26} className="text-warn" />
      </span>
      <span className="text-h3 font-semibold leading-7 text-heading">
        We couldn&rsquo;t understand that recording
      </span>
      <span className="text-lead text-muted">
        Try speaking again, or type your response.
      </span>
      <div className="w-full flex flex-col gap-2 mt-1">
        <Button variant="primary" block onClick={onRecordAgain}>
          Record Again
        </Button>
        <Button variant="secondary" block onClick={onType}>
          Type Response
        </Button>
      </div>
    </div>
  );
}

/** The server never answered. Nothing was written, and his text is kept. */
export function ServerUnreachable({
  detail,
  onRetry,
}: {
  detail: string;
  onRetry: () => void;
}) {
  return (
    <div className="border border-danger-line bg-danger-bg rounded-lg px-5 py-5 flex flex-col items-center gap-3 text-center">
      <span className="w-16 h-16 rounded-full bg-raised border border-danger-line flex items-center justify-center">
        <WifiOff size={26} className="text-danger" />
      </span>
      <span className="text-h3 font-semibold leading-7 text-danger">
        Could not reach the server — try again
      </span>
      <span className="text-lead text-danger">This update was not saved.</span>
      <span className="font-mono text-label text-danger opacity-80 break-all">
        {detail}
      </span>
      <Button variant="primary" block onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
