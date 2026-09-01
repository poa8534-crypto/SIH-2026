import React from 'react';
import { ArrowRight, Check, Cpu, Mic, X } from 'lucide-react';
import { AgentTurnResponse } from '../../types';
import { Button } from '../../components/ui';
import { StructuredCard } from './StructuredCard';
import { CardRow, Stage } from './shared';

/**
 * QUESTION:  What does the assistant still need from me?
 * ACTION:    Answer the one open question — then confirm the proposal.
 *
 * Covers the conversation, ready and card stages: they share the session
 * header, the collected-slot chips and the input row, and differ only in what
 * sits between them.
 */
export function ConversationStage({
  stage,
  turn,
  thinking,
  collected,
  currentQuestion,
  lastSaid,
  suggestions,
  fallback,
  serverError,
  submitting,
  textInput,
  threadEndRef,
  onClose,
  onSend,
  onReview,
  onStartVoice,
  onEditRow,
  onSubmit,
  onCancel,
}: {
  stage: Extract<Stage, 'conversation' | 'ready' | 'card'>;
  turn: AgentTurnResponse | null;
  thinking: boolean;
  collected: { label: string; value: string }[];
  currentQuestion: string | null;
  lastSaid: string | null;
  suggestions: string[];
  fallback: React.ReactNode;
  serverError: React.ReactNode;
  submitting: boolean;
  textInput: React.ReactNode;
  threadEndRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onSend: (text: string) => void;
  onReview: () => void;
  onStartVoice: () => void;
  onEditRow: (key: CardRow['key']) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      {/* Without this there was no way out of a conversation: if the agent
          stalled on a slot, idle was unreachable for the rest of the session. */}
      <div className="flex items-center justify-between border-b border-hair pb-3">
        <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
          Data Entry Session
        </span>
        <Button variant="ghost" size="xs" onClick={onClose} aria-label="Close session">
          Close
          <X size={14} />
        </Button>
      </div>

      {/* What the agent has captured so far, as read-only chips, so the
          filled slots are visible without scrolling back through talk. */}
      {stage === 'conversation' && collected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {collected.map((c) => (
            <span
              key={c.label}
              className="rounded-full bg-selected text-accent px-3 py-1 text-label font-medium"
            >
              <span className="uppercase tracking-[0.05em] opacity-80">{c.label}</span>{' '}
              {c.value}
            </span>
          ))}
        </div>
      )}

      {stage === 'conversation' && lastSaid && (
        <div className="flex flex-col gap-1">
          <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
            Supervisor
          </span>
          <p className="text-lead leading-6 text-fg">{lastSaid}</p>
        </div>
      )}

      {/* One slot prompt at a time, with the closed set the agent returned
          rendered as tappable chips. A supervisor answering on site needs the
          open question, not a scrollback of the exchange. */}
      {stage === 'conversation' && currentQuestion && !thinking && (
        <div className="border border-hair bg-raised rounded-lg px-5 py-5 flex flex-col gap-4">
          <span className="flex items-center gap-2 text-label font-semibold uppercase tracking-[0.05em] text-accent">
            <Cpu size={14} />
            NAVIS Assistant
          </span>
          <p className="text-h3 leading-7 font-semibold text-heading">{currentQuestion}</p>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((sug) => (
                <Button
                  key={sug}
                  variant="secondary"
                  shape="pill"
                  onClick={() => onSend(sug)}
                  disabled={thinking}
                >
                  {sug}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {thinking && (
        <div className="border border-hair bg-raised rounded-lg px-5 py-4 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
          <span className="text-lead text-muted">NAVIS Assistant is thinking…</span>
        </div>
      )}
      <div ref={threadEndRef} />

      {serverError}

      {stage === 'ready' && turn && (
        <div className="border border-hair bg-raised rounded-lg px-5 py-5 flex flex-col gap-4">
          <span className="flex items-center gap-2">
            <Check size={16} className="text-accent" />
            <span className="text-label font-semibold uppercase tracking-[0.05em] text-accent">
              READY TO DRAFT
            </span>
          </span>
          <p className="text-lead leading-6 text-fg">
            I have enough to prepare the update.
          </p>
          <Button variant="primary" block onClick={onReview}>
            Review Structured Update
            <ArrowRight size={18} />
          </Button>
        </div>
      )}

      {stage === 'card' && turn && (
        <>
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-2 text-label font-semibold uppercase tracking-[0.05em] text-accent">
              <Cpu size={14} />
              NAVIS Assistant
            </span>
            <p className="text-lead leading-6 text-fg">
              Got it. I&rsquo;ve extracted the structured data from your update.
              Please review it below.
            </p>
          </div>
          <StructuredCard
            slots={turn.slots}
            confidence={turn.confidence}
            outcome={turn.match_outcome}
            submitting={submitting}
            onEdit={onEditRow}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        </>
      )}

      {stage === 'conversation' && (
        <div className="flex flex-col gap-2">
          {fallback}
          {textInput}
          {!fallback && (
            <Button variant="secondary" block onClick={onStartVoice}>
              <Mic size={18} />
              Answer by voice
            </Button>
          )}
        </div>
      )}
    </>
  );
}
