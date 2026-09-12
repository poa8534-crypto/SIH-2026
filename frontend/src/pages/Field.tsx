import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { api, errorDetail } from '../lib/api';
import { generateUUID } from '../lib/uuid';
import { AgentTurnResponse, Discipline } from '../types';
import { SPEECH_LANGUAGES, useSpeech } from '../hooks/useSpeech';
import { SUPERVISOR, WORK_FRONTS, agentContext } from '../config';
import { Button } from '../components/ui';
import { CardRow, Message, Stage, clockTime, longDate } from './field/shared';
import { ContextBlock } from './field/ContextBlock';
import { TextInput } from './field/TextInput';
import {
  MicUnavailable,
  NotUnderstood,
  ServerUnreachable,
} from './field/FallbackStates';
import { IdleStage } from './field/IdleStage';
import { ListeningStage } from './field/ListeningStage';
import { TranscriptStage } from './field/TranscriptStage';
import { ConversationStage } from './field/ConversationStage';
import { SubmittedStage } from './field/SubmittedStage';
import ReportStudio from './field/ReportStudio';

/**
 * QUESTION:  What happened on site?
 * ACTION:    Say it — the assistant turns it into a structured update.
 *
 * Field supervisor screen — the "time agent" the problem statement mandates.
 *
 * One conversation at a time, driven by POST /agent/turn, which is stateful
 * slot-filling. The session id is generated once and reused for the whole
 * conversation; a submit or a cancel starts a new one.
 *
 * The supervisor never chooses an activity. The matching engine does, server
 * side, and the card reports what it chose and how sure it is.
 *
 * This component owns every piece of state and every handler. The seven stages
 * are rendered by components under `./field/` — the file was 1000 lines with
 * all seven inline. The split is structural; behaviour is unchanged. See D-031.
 */

export default function Field() {
  const queryClient = useQueryClient();
  const speech = useSpeech();

  const [sessionId, setSessionId] = useState(() => generateUUID());
  const [stage, setStage] = useState<Stage>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draftTranscript, setDraftTranscript] = useState('');
  const [typed, setTyped] = useState('');
  const [turn, setTurn] = useState<AgentTurnResponse | null>(null);
  const [thinking, setThinking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [workFront, setWorkFront] = useState<string>(WORK_FRONTS[0]);
  const [discipline, setDiscipline] = useState<Discipline>(SUPERVISOR.discipline);
  const [shift, setShift] = useState<string>(SUPERVISOR.shift);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);
  const [isReportFlowOpen, setIsReportFlowOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<'progress' | 'material' | 'delay' | 'inspection' | null>(null);
  const [successToast, setSuccessToast] = useState<{ message: string; reference: string } | null>(null);
  const threadEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!successToast) return;
    const t = setTimeout(() => setSuccessToast(null), 5000);
    return () => clearTimeout(t);
  }, [successToast]);

  // The review queue is not rendered here — the "Needs Your Response" and
  // "Recent Updates" blocks read their own endpoints — but this screen has
  // always warmed and polled this key, and the planner surfaces share the
  // cache entry. Kept so the split changes no network behaviour. The derived
  // `myUpdates` and `clarificationCount` that used to sit here were computed
  // and never rendered; they are gone.
  useQuery({
    queryKey: ['reviewQueue'],
    queryFn: () => api.getReviewQueue('pending'),
  });

  useEffect(() => {
    // Optional call: scrollIntoView is missing in jsdom and in some older
    // mobile browsers, and a missing convenience must not break the thread.
    threadEnd.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, thinking, stage]);

  // Any recording failure returns to idle, where the quiet fallback states
  // live. Without this a permission denied mid-recording left the supervisor
  // staring at a listening panel that would never hear anything.
  useEffect(() => {
    if (speech.failure && stage === 'listening') setStage('idle');
  }, [speech.failure, stage]);

  /**
   * Abandon whatever is in progress and start clean.
   *
   * Nothing is written: the agent only proposes until CONFIRM & SUBMIT, so
   * walking away from a half-finished conversation leaves no trace. A new
   * session id means the server treats the next message as a fresh start
   * rather than resuming the abandoned slots.
   */
  const resetSession = () => {
    speech.cancel();
    setSessionId(generateUUID());
    setMessages([]);
    setTurn(null);
    setDraftTranscript('');
    setTyped('');
    setAttachments([]);
    setOfflineMessage(null);
    setServerError(null);
    setStage('idle');
  };

  const send = async (text: string, opts: { confirm?: boolean } = {}) => {
    const clean = text.trim();
    if (!clean && !opts.confirm) return;

    if (isOffline) {
      try {
        const raw = window.localStorage.getItem('navis.field.offline_queue');
        const existing = raw ? JSON.parse(raw) : [];
        existing.unshift({
          id: `OFF-${Date.now()}`,
          text: clean,
          attachments,
          timestamp: new Date().toISOString(),
          workFront,
          discipline,
          shift,
        });
        window.localStorage.setItem('navis.field.offline_queue', JSON.stringify(existing));
      } catch {
        /* ignore localStorage restrictions */
      }
      setOfflineMessage('✓ Saved on device · Will sync when connection returns.');
      setTyped('');
      setAttachments([]);
      return;
    }

    if (clean) {
      setMessages((m) => [...m, { from: 'supervisor', text: clean, at: clockTime() }]);
    }
    setStage('conversation');
    setThinking(true);
    setServerError(null);
    setOfflineMessage(null);

    try {
      // Context travels as structured request data, never as a fake
      // supervisor message: the transcript has to stay a record of what a
      // person actually said.
      const res = await api.agentTurn({
        session_id: sessionId,
        message: clean,
        confirm: opts.confirm ?? false,
        context: agentContext(workFront, discipline),
      });
      setTurn(res);
      setMessages((m) => [
        ...m,
        { from: 'assistant', text: res.agent_message, at: clockTime() },
      ]);

      if (res.event_created) {
        setReference(res.review_item_id ?? res.linked_event_id);
        setStage('submitted');
        queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
      } else if (res.awaiting_confirmation) {
        setStage('ready');
      }
      setTyped('');
      setAttachments([]);
    } catch (e) {
      // No offline storage: never claim it was saved, and keep his text.
      setServerError(errorDetail(e));
      if (clean) setTyped(clean);
      setMessages((m) => m.filter((msg) => !(msg.from === 'supervisor' && msg.text === clean)));
      setStage(messages.length === 0 ? 'idle' : 'conversation');
    } finally {
      setThinking(false);
    }
  };

  const editRow = (key: CardRow['key']) => {
    const prompts: Record<CardRow['key'], string> = {
      activity: 'Which activity is this? Describe it again in your own words.',
      status: 'What is the correct status?',
      date: 'What is the correct date?',
      quantity: 'What is the correct quantity?',
    };
    // Corrections go back through the agent as another turn — the supervisor
    // never edits a schedule field directly, and never picks an activity from
    // a list.
    setMessages((m) => [...m, { from: 'assistant', text: prompts[key], at: clockTime() }]);
    setStage('conversation');
    setTurn(null);
  };

  const micBlocked = !speech.supported || speech.failure === 'denied';

  /**
   * The agent returns a closed set as one human sentence — "Finished, In
   * progress, Delayed, Blocked, or Not started". Splitting it into chips is
   * presentation only: a chip sends exactly the word the supervisor would
   * otherwise have typed, through the same POST /agent/turn.
   */
  const suggestions = useMemo<string[]>(() => {
    if (stage !== 'conversation' || !turn) return [];
    const fromServer = (turn.choices ?? '')
      .replace(/,?\s+or\s+/gi, ', ')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    if (fromServer.length > 0) return fromServer;
    // The date slot has no server-side set, but these two cover most reports
    // and the slot parser already understands both words.
    return turn.pending_slots.includes('date') ? ['Today', 'Yesterday'] : [];
  }, [stage, turn]);

  /** The one open question: the last thing the assistant asked. */
  const currentQuestion = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].from === 'assistant') return messages[i].text;
    }
    return null;
  }, [messages]);

  /** Echoed under the question so the answer being corrected stays in view. */
  const lastSaid = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].from === 'supervisor') return messages[i].text;
    }
    return null;
  }, [messages]);

  /**
   * Slots already filled, as read-only chips. This is what replaces scrolling
   * back through a transcript to find out what the agent thinks it has.
   */
  const collected = useMemo<{ label: string; value: string }[]>(() => {
    const slots = turn?.slots;
    if (!slots) return [];
    const out: { label: string; value: string }[] = [];
    if (slots.activity_id) out.push({ label: 'Activity', value: slots.activity_id });
    if (turn.discipline_label)
      out.push({ label: 'Discipline', value: turn.discipline_label });
    if (slots.location) out.push({ label: 'Location', value: slots.location });
    if (turn.status_label) out.push({ label: 'Status', value: turn.status_label });
    if (slots.date) out.push({ label: 'Date', value: longDate(slots.date) });
    if (slots.quantity !== null) {
      out.push({
        label: 'Quantity',
        value: `${slots.quantity}${
          slots.planned_quantity !== null ? ` of ${slots.planned_quantity}` : ''
        }`,
      });
    }
    return out;
  }, [turn]);

  // ── Sub-views ─────────────────────────────────────────────────────────────

  // ── Render ────────────────────────────────────────────────────────────────

  /** Whichever fallback panel applies, or null when the mic path is fine. */
  const fallback = micBlocked ? (
    <MicUnavailable />
  ) : speech.failure === 'no-speech' ? (
    <NotUnderstood
      onRecordAgain={() => {
        speech.clearFailure();
        speech.start();
        setStage('listening');
      }}
      onType={() => speech.clearFailure()}
    />
  ) : null;

  const serverErrorBox = serverError ? (
    <ServerUnreachable detail={serverError} onRetry={() => send(typed)} />
  ) : null;

  const textInput = (
    <TextInput
      value={typed}
      onChange={setTyped}
      onSend={() => send(typed)}
      disabled={!typed.trim() || thinking}
      grow={micBlocked}
    />
  );

  const contextBlock = (
    <ContextBlock
      workFront={workFront}
      onWorkFront={setWorkFront}
      discipline={discipline}
      onDiscipline={setDiscipline}
      shift={shift}
      onShift={setShift}
    />
  );

  return (
    <div className="w-full bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 pb-8 sm:px-6 lg:gap-6 lg:px-8 lg:py-8">
        {stage === 'idle' && (
          <>
            {successToast && (
              <div className="w-full mb-1">
                <div className="p-3 rounded-xl border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between shadow-xs transition-all animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-700 dark:text-emerald-300">✓ {successToast.message}</span>
                    <span>·</span>
                    <span className="font-mono font-bold text-heading">{successToast.reference}</span>
                    <span className="hidden sm:inline text-muted">· Sent for planner review</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSuccessToast(null)}
                    className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 p-1 rounded-md cursor-pointer"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
            <IdleStage
              fallback={fallback}
              onStart={() => {
                speech.clearFailure();
                speech.start();
                setStage('listening');
              }}
              composerValue={typed}
              onComposerChange={setTyped}
              onSend={() => send(typed)}
              onOpenSubmissionFlow={() => {
                if (typed.trim()) setIsReportFlowOpen(true);
              }}
              selectedPreset={selectedPreset}
              onSelectPreset={setSelectedPreset}
              submitting={thinking || submitting}
              attachments={attachments}
              onAddAttachment={(name) => setAttachments((prev) => [...prev, name])}
              onRemoveAttachment={(idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
              serverError={serverErrorBox}
              contextBlock={contextBlock}
              discipline={discipline}
              isOffline={isOffline}
              offlineMessage={offlineMessage}
            />
          </>
        )}

        {stage === 'listening' && (
          <ListeningStage
            elapsed={speech.elapsed}
            transcript={speech.transcript}
            silent={speech.silent}
            onStop={() => {
              speech.stop();
              setDraftTranscript(speech.transcript);
              setStage('transcript');
            }}
            onCancel={() => {
              speech.cancel();
              setStage('idle');
            }}
          />
        )}

        {stage === 'transcript' && (
          <TranscriptStage
            draft={draftTranscript}
            onDraft={setDraftTranscript}
            onUse={() => send(draftTranscript)}
            onRecordAgain={() => {
              setDraftTranscript('');
              speech.clearFailure();
              speech.start();
              setStage('listening');
            }}
          />
        )}

        {(stage === 'conversation' || stage === 'ready' || stage === 'card') && (
          <ConversationStage
            stage={stage}
            turn={turn}
            thinking={thinking}
            collected={collected}
            currentQuestion={currentQuestion}
            lastSaid={lastSaid}
            suggestions={suggestions}
            fallback={fallback}
            serverError={serverErrorBox}
            submitting={submitting}
            textInput={textInput}
            threadEndRef={threadEnd}
            onClose={resetSession}
            onSend={send}
            onReview={() => setStage('card')}
            onStartVoice={() => {
              speech.clearFailure();
              speech.start();
              setStage('listening');
            }}
            onEditRow={editRow}
            onSubmit={async () => {
              setSubmitting(true);
              await send('', { confirm: true });
              setSubmitting(false);
            }}
            onCancel={resetSession}
          />
        )}

        {stage === 'submitted' && (
          <SubmittedStage reference={reference} turn={turn} onReturn={resetSession} />
        )}
      </div>

      <ReportStudio
        mode="overlay"
        isOpen={isReportFlowOpen}
        onClose={() => setIsReportFlowOpen(false)}
        onSuccess={(ref) => {
          setIsReportFlowOpen(false);
          setTyped('');
          setAttachments([]);
          setSelectedPreset(null);
          setSuccessToast({
            message: 'Site update submitted',
            reference: ref,
          });
          queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
          queryClient.invalidateQueries({ queryKey: ['fieldReports'] });
        }}
        initialReport={typed}
        initialAttachments={attachments.map((name) => ({
          name,
          type: name.match(/\.(jpg|jpeg|png)$/i) ? 'photo' : 'file',
        }))}
        initialWorkFront={workFront}
        initialDiscipline={discipline}
        initialPreset={selectedPreset}
      />
    </div>
  );
}
