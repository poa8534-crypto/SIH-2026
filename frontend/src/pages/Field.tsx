import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  Pencil,
  Send,
  StopCircle,
} from 'lucide-react';
import { api, errorDetail } from '../lib/api';
import { AgentTurnResponse, Discipline, ReviewItem, SlotState } from '../types';
import { SPEECH_LANGUAGES, useSpeech } from '../hooks/useSpeech';
import { PROJECT, SUPERVISOR, WORK_FRONTS, agentContext } from '../config';

/**
 * Field supervisor screen — the "time agent" the problem statement mandates.
 *
 * One conversation at a time, driven by POST /agent/turn, which is stateful
 * slot-filling. The session id is generated once and reused for the whole
 * conversation; a submit or a cancel starts a new one.
 *
 * The supervisor never chooses an activity. The matching engine does, server
 * side, and the card reports what it chose and how sure it is.
 */

type Stage =
  | 'idle'
  | 'listening'
  | 'transcript'
  | 'conversation'
  | 'card'
  | 'submitted';

interface Message {
  from: 'supervisor' | 'assistant';
  text: string;
  at: string;
}



// Substituted for the mockup's "Crew" / "Workers on site": no crew entity
// exists in this system, and discipline is a real field the extractor reads.
const DISCIPLINE_OPTIONS: { value: Discipline; label: string }[] = [
  { value: 'civil', label: 'Civil' },
  { value: 'piping', label: 'Piping' },
  { value: 'static_equipment', label: 'Static Equipment' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'instrumentation', label: 'Instrumentation' },
  { value: 'hse', label: 'HSE' },
];

const STATUS_LABEL: Record<string, string> = {
  completed: 'Finished',
  in_progress: 'In progress',
  delayed: 'Delayed',
  not_started: 'Not started',
};

function clockTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Fixed month names rather than toLocaleDateString: current ICU renders
// September as "Sept", and the mockup reads "14 Sep 2026".
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function longDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Waveform ────────────────────────────────────────────────────────────────

/** Seven bars, staggered, as in the listening mockup. */
const BAR_HEIGHTS = [16, 32, 48, 24, 40, 32, 20];

function Waveform() {
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

// ── Structured card ─────────────────────────────────────────────────────────

interface CardRow {
  key: 'activity' | 'status' | 'date' | 'quantity';
  label: string;
  value: string;
}

function StructuredCard({
  slots,
  confidence,
  outcome,
  onEdit,
  onSubmit,
  onCancel,
  submitting,
}: {
  slots: SlotState;
  confidence: number;
  outcome: string | null;
  onEdit: (key: CardRow['key']) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  // Whatever MatchingEngine returned, never a hardcoded id. The two
  // no-result cases are named differently because they mean different things:
  // the matcher found nothing, versus it has not run to completion.
  const activity = slots.activity_id
    ? `${slots.activity_id}${
        slots.activity_description ? ` · ${slots.activity_description}` : ''
      }`
    : outcome
      ? 'No matching activity — flagged for Planning Engineer'
      : 'Awaiting Planning Engineer confirmation';

  const quantity =
    slots.quantity !== null
      ? `${slots.quantity}${
          slots.planned_quantity !== null ? ` of ${slots.planned_quantity}` : ''
        }${slots.uom ? ` ${slots.uom}` : ''}`
      : 'Not stated';

  const rows: CardRow[] = [
    // Editable as the supervisor's own interpretation of what happened. The
    // validated schedule id underneath is not his to change, and there is no
    // activity picker anywhere in this screen.
    { key: 'activity', label: 'ACTIVITY', value: activity },
    { key: 'status', label: 'STATUS', value: STATUS_LABEL[slots.status ?? ''] ?? '—' },
    { key: 'date', label: 'DATE', value: longDate(slots.date) },
    { key: 'quantity', label: 'QUANTITY', value: quantity },
  ];

  return (
    <section className="border border-hair bg-raised">
      <div className="px-4 py-2 border-b border-hair">
        <h2 className="font-mono text-[9px] uppercase tracking-wider text-muted">
          Structured update
        </h2>
      </div>

      <div className="flex flex-col">
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex justify-between items-start px-4 py-3 border-b border-hair"
          >
            <div className="flex flex-col gap-1 pr-4 min-w-0">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
                {r.label}
              </span>
              <span className="text-[13px] text-fg break-words">{r.value}</span>
            </div>
            <button
              onClick={() => onEdit(r.key)}
              aria-label={`Correct ${r.label.toLowerCase()}`}
              className="p-1 text-accent hover:bg-selected shrink-0 mt-1"
            >
              <Pencil size={14} />
            </button>
          </div>
        ))}

        {slots.quantity_over_planned && (
          <div className="px-4 py-2 border-b border-hair">
            <span className="font-mono text-[9px] uppercase tracking-wider text-warn">
              Completed exceeds the planned total — the Planning Engineer will
              check this
            </span>
          </div>
        )}

        {/* No pencil: confidence is computed by the matching engine and is not
            the supervisor's to change. */}
        <div className="flex justify-between items-start px-4 py-3">
          <div className="flex flex-col gap-1 pr-4">
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
              Confidence
            </span>
            <span className="text-[13px] text-fg font-mono">
              {(confidence * 100).toFixed(1)}%
            </span>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted mt-1 shrink-0">
            {outcome === 'AUTO_LINK' ? 'strong match' : 'planner confirms'}
          </span>
        </div>
      </div>

      <div className="p-4 border-t border-hair flex flex-col gap-3">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="w-full bg-accent text-accent-fg font-mono text-[11px] uppercase tracking-wider py-4 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Confirm & submit'}
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          className="self-center font-mono text-[10px] uppercase tracking-wider text-muted hover:text-fg disabled:opacity-50"
        >
          Cancel
        </button>
        <p className="text-[10px] text-muted leading-relaxed text-center">
          Submitting confirms the report information only. The Planning Engineer
          must review it before any project data changes.
        </p>
      </div>
    </section>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Field() {
  const queryClient = useQueryClient();
  const speech = useSpeech();

  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [stage, setStage] = useState<Stage>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draftTranscript, setDraftTranscript] = useState('');
  const [typed, setTyped] = useState('');
  const [turn, setTurn] = useState<AgentTurnResponse | null>(null);
  const [thinking, setThinking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [workFront, setWorkFront] = useState<string>(WORK_FRONTS[0]);
  const [discipline, setDiscipline] = useState<Discipline>(SUPERVISOR.discipline);
  const threadEnd = useRef<HTMLDivElement>(null);

  const {
    data: queue,
    isLoading: queueLoading,
    error: queueError,
  } = useQuery({
    queryKey: ['reviewQueue'],
    queryFn: () => api.getReviewQueue('pending'),
  });

  /** This supervisor's own submissions, newest first. */
  const myUpdates = useMemo<ReviewItem[]>(() => {
    if (!queue) return [];
    return [...queue]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 6);
  }, [queue]);

  const clarificationCount = useMemo(
    () => (queue ?? []).filter((i) => i.reason === 'no_match').length,
    [queue]
  );

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

  const resetSession = () => {
    setSessionId(crypto.randomUUID());
    setMessages([]);
    setTurn(null);
    setDraftTranscript('');
    setTyped('');
    setServerError(null);
    setStage('idle');
  };


  const send = async (text: string, opts: { confirm?: boolean } = {}) => {
    const clean = text.trim();
    if (!clean && !opts.confirm) return;

    if (clean) {
      setMessages((m) => [...m, { from: 'supervisor', text: clean, at: clockTime() }]);
    }
    setStage('conversation');
    setThinking(true);
    setServerError(null);

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
        setStage('card');
      }
      setTyped('');
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

  // ── Sub-views ─────────────────────────────────────────────────────────────

  const contextBlock = (
    <div className="border border-hair bg-raised">
      <button
        onClick={() => setContextOpen((v) => !v)}
        className="w-full px-3 py-2 flex items-center justify-between"
      >
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
          Current context
        </span>
        {contextOpen ? (
          <ChevronUp size={14} className="text-muted" />
        ) : (
          <ChevronDown size={14} className="text-muted" />
        )}
      </button>
      {contextOpen ? (
        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-hair pt-2">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
              Work front
            </span>
            <select
              value={workFront}
              onChange={(e) => setWorkFront(e.target.value)}
              className="bg-surface border border-hair text-fg text-[12px] px-2 py-1.5"
            >
              {WORK_FRONTS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
              Discipline
            </span>
            <select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value as Discipline)}
              className="bg-surface border border-hair text-fg text-[12px] px-2 py-1.5"
            >
              {DISCIPLINE_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="px-3 pb-2 flex flex-col gap-0.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted">Work front:</span>
            <span className="text-fg">{workFront}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted">Discipline:</span>
            <span className="text-fg">
              {DISCIPLINE_OPTIONS.find((d) => d.value === discipline)?.label}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  const textInput = (grow: boolean) => (
    <div className="relative flex items-center">
      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') send(typed);
        }}
        placeholder={grow ? 'Type your update' : 'Or type your update'}
        className={`w-full bg-surface border border-hair text-fg placeholder:text-muted px-3 pr-10 focus:outline-none focus:border-accent ${
          grow ? 'py-4 text-[14px]' : 'py-3 text-[13px]'
        }`}
      />
      <button
        onClick={() => send(typed)}
        disabled={!typed.trim() || thinking}
        aria-label="Send"
        className="absolute right-2 p-1 text-accent disabled:opacity-40"
      >
        <Send size={16} />
      </button>
    </div>
  );

  const micUnavailableBox = (
    <div className="border border-hair bg-raised p-4 flex flex-col items-center gap-1.5 text-center">
      <MicOff size={20} className="text-muted" />
      <span className="text-[13px] text-fg">Microphone unavailable</span>
      <span className="text-[11px] text-muted">Typing works just as well.</span>
    </div>
  );

  const notUnderstoodBox = (
    <div className="border border-hair bg-raised p-4 flex flex-col items-center gap-2 text-center">
      <span className="text-[13px] text-fg">We couldn&rsquo;t understand that recording</span>
      <span className="text-[11px] text-muted">Try speaking again, or type your response.</span>
      <div className="flex gap-2 mt-1">
        <button
          onClick={() => {
            speech.clearFailure();
            speech.start();
            setStage('listening');
          }}
          className="border border-hair px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-fg hover:border-strong"
        >
          Record again
        </button>
        <button
          onClick={() => speech.clearFailure()}
          className="border border-accent px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-accent"
        >
          Type response
        </button>
      </div>
    </div>
  );

  const serverErrorBox = serverError && (
    <div className="border border-danger-line bg-danger-bg p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <AlertCircle size={12} className="mt-0.5 shrink-0 text-danger" />
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] text-danger">
            Could not reach the server — try again
          </span>
          <span className="font-mono text-[10px] text-danger opacity-80">
            This update was not saved. {serverError}
          </span>
        </div>
      </div>
      <button
        onClick={() => send(typed)}
        className="self-start border border-danger-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-danger"
      >
        Retry
      </button>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full bg-surface overflow-hidden">
      {/* Context sub-header */}
      <div className="shrink-0 px-4 py-1.5 bg-raised border-b border-hair flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted">{workFront}</span>
        <div className="flex items-center gap-1">
          {SPEECH_LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => speech.setLang(l.code)}
              className={`font-mono text-[10px] px-1.5 py-0.5 border ${
                speech.lang === l.code
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {stage === 'idle' && (
          <>
            <div>
              <h1 className="text-[20px] text-fg">Good afternoon, {SUPERVISOR.name.split(' ')[0]}</h1>
              <p className="text-[12px] text-muted mt-0.5">
                Report progress for the work fronts you supervise.
              </p>
            </div>

            {micBlocked ? (
              micUnavailableBox
            ) : speech.failure === 'no-speech' ? (
              notUnderstoodBox
            ) : (
              <button
                onClick={() => {
                  speech.clearFailure();
                  speech.start();
                  setStage('listening');
                }}
                className="w-full bg-accent text-accent-fg p-8 flex flex-col items-center justify-center gap-4 active:opacity-90"
              >
                <span className="w-16 h-16 border border-current/40 flex items-center justify-center">
                  <Mic size={28} />
                </span>
                <span className="flex flex-col items-center gap-0.5">
                  <span className="text-[18px]">Tap &amp; Speak</span>
                  <span className="text-[12px] opacity-90">
                    Describe what happened on site
                  </span>
                </span>
              </button>
            )}

            {textInput(micBlocked)}
            {serverErrorBox}
            {contextBlock}
          </>
        )}

        {stage === 'listening' && (
          <div className="border border-hair bg-raised p-4 flex flex-col items-center gap-3">
            <div className="w-full flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-danger rounded-full animate-pulse" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-danger">
                  Listening
                </span>
              </span>
              <span className="font-mono text-[16px] text-fg">{mmss(speech.elapsed)}</span>
            </div>

            <Waveform />

            <div className="min-h-[80px] flex flex-col items-center justify-center text-center w-full gap-1">
              <p className="text-[18px] text-fg leading-snug">
                {speech.transcript ? `“${speech.transcript}”` : (
                  <span className="text-muted text-[13px]">Speak now…</span>
                )}
              </p>
              {/* A pause does not end the recording, so say so rather than
                  leaving him wondering whether it stopped. */}
              {speech.silent && (
                <span className="font-mono text-[10px] text-muted">listening…</span>
              )}
            </div>

            <button
              onClick={() => {
                speech.stop();
                setDraftTranscript(speech.transcript);
                setStage('transcript');
              }}
              className="w-full bg-accent text-accent-fg font-mono text-[11px] uppercase tracking-wider py-4 flex items-center justify-center gap-2"
            >
              <StopCircle size={16} />
              Stop &amp; process
            </button>
            <button
              onClick={() => {
                speech.cancel();
                setStage('idle');
              }}
              className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-fg"
            >
              Cancel
            </button>
          </div>
        )}

        {stage === 'transcript' && (
          <div className="flex flex-col gap-3">
            <div>
              <h1 className="text-[18px] text-fg">Check your transcript</h1>
              <p className="text-[11px] text-muted mt-1 leading-relaxed">
                Check this before sending — speech recognition can mishear
                equipment numbers.
              </p>
            </div>
            <textarea
              value={draftTranscript}
              onChange={(e) => setDraftTranscript(e.target.value)}
              rows={5}
              className="w-full bg-raised border border-hair text-fg text-[14px] p-3 focus:outline-none focus:border-accent resize-none"
            />
            <button
              onClick={() => send(draftTranscript)}
              disabled={!draftTranscript.trim()}
              className="w-full bg-accent text-accent-fg font-mono text-[11px] uppercase tracking-wider py-4 disabled:opacity-50"
            >
              Use this transcript
            </button>
            <button
              onClick={() => {
                setDraftTranscript('');
                speech.clearFailure();
                speech.start();
                setStage('listening');
              }}
              className="w-full border border-hair font-mono text-[10px] uppercase tracking-wider text-fg py-3 hover:border-strong"
            >
              Record again
            </button>
          </div>
        )}

        {(stage === 'conversation' || stage === 'card') && (
          <>
            <div className="flex flex-col gap-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${
                    m.from === 'supervisor' ? 'items-end' : 'items-start'
                  }`}
                >
                  <span
                    className={`font-mono text-[9px] uppercase tracking-wider mb-1 ${
                      m.from === 'supervisor' ? 'text-muted' : 'text-accent'
                    }`}
                  >
                    {m.from === 'supervisor' ? 'Supervisor' : 'NAVIS Assistant'}
                  </span>
                  <div
                    className={`max-w-[85%] border px-3 py-2 text-[13px] leading-relaxed ${
                      m.from === 'supervisor'
                        ? 'border-hair bg-surface text-fg'
                        : 'border-hair bg-raised text-fg'
                    }`}
                  >
                    {m.text}
                  </div>
                  <span className="font-mono text-[9px] text-muted mt-1">{m.at}</span>
                </div>
              ))}

              {/* Options for a closed-set question, in human labels. */}
              {turn?.choices && !thinking && stage === 'conversation' && (
                <span className="text-[11px] text-muted -mt-2">
                  {turn.choices}
                </span>
              )}

              {thinking && (
                <span className="font-mono text-[10px] text-muted">
                  NAVIS Assistant is speaking…
                </span>
              )}
              <div ref={threadEnd} />
            </div>

            {serverErrorBox}

            {stage === 'card' && turn && (
              <>
                <div className="flex items-center gap-1.5">
                  <Check size={12} className="text-ok" />
                  <span className="font-mono text-[9px] uppercase tracking-wider text-ok">
                    Ready to draft
                  </span>
                </div>
                <StructuredCard
                  slots={turn.slots}
                  confidence={turn.confidence}
                  outcome={turn.match_outcome}
                  submitting={submitting}
                  onEdit={editRow}
                  onSubmit={async () => {
                    setSubmitting(true);
                    await send('', { confirm: true });
                    setSubmitting(false);
                  }}
                  onCancel={resetSession}
                />
              </>
            )}

            {stage === 'conversation' && (
              <div className="flex flex-col gap-2">
                {speech.failure === 'no-speech' && notUnderstoodBox}
                {textInput(micBlocked)}
                {!micBlocked && (
                  <button
                    onClick={() => {
                      speech.clearFailure();
                      speech.start();
                      setStage('listening');
                    }}
                    className="w-full border border-hair py-3 font-mono text-[10px] uppercase tracking-wider text-fg flex items-center justify-center gap-2 hover:border-strong"
                  >
                    <Mic size={14} />
                    Answer by voice
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {stage === 'submitted' && (
          <div className="flex flex-col items-center text-center gap-3 py-8">
            <Check size={28} className="text-ok" />
            <h1 className="text-[18px] text-fg">Update submitted</h1>
            {reference && (
              <p className="font-mono text-[10px] text-muted break-all">
                Report reference: {reference}
              </p>
            )}
            <p className="text-[12px] text-fg">Sent for Planning Engineer review.</p>
            <p className="text-[11px] text-muted">
              The project schedule has not been changed.
            </p>
            <button
              onClick={resetSession}
              className="mt-2 border border-hair px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-fg hover:border-strong"
            >
              Return home
            </button>
          </div>
        )}

        {/* MY RECENT UPDATES — this supervisor's own submissions only. */}
        {(stage === 'idle' || stage === 'submitted') && (
          <section className="border border-hair mt-1">
            <div className="px-3 py-2 border-b border-hair font-mono text-[9px] uppercase tracking-wider text-muted">
              My recent updates
            </div>
            {queueError ? (
              <div className="px-3 py-4 flex items-start gap-2">
                <AlertCircle size={12} className="mt-0.5 shrink-0 text-danger" />
                <span className="font-mono text-[10px] text-danger">
                  {errorDetail(queueError)}
                </span>
              </div>
            ) : queueLoading ? (
              <div className="p-3 space-y-2 opacity-50">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-8 bg-raised animate-pulse" />
                ))}
              </div>
            ) : myUpdates.length === 0 ? (
              <div className="py-6 text-center text-[10px] text-muted leading-relaxed px-4">
                Nothing submitted yet. Updates you send appear here with their
                review status.
              </div>
            ) : (
              <div className="flex flex-col">
                {myUpdates.map((item) => (
                  <div
                    key={item.id}
                    className="px-3 py-2.5 border-b border-hair last:border-0 flex flex-col gap-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12px] text-fg leading-snug">{item.raw_text}</span>
                      <span
                        className={`font-mono text-[9px] uppercase tracking-wider shrink-0 ${
                          item.status === 'resolved'
                            ? 'text-ok'
                            : item.reason === 'no_match'
                              ? 'text-warn'
                              : 'text-muted'
                        }`}
                      >
                        {item.status === 'resolved'
                          ? 'Confirmed'
                          : item.reason === 'no_match'
                            ? 'Needs info'
                            : 'Processing'}
                      </span>
                    </div>
                    {/* The matched activity — his sentence became a real
                        schedule activity, which is the point worth showing. */}
                    {item.suggested_activity_id && (
                      <span className="font-mono text-[10px] text-accent">
                        {item.suggested_activity_id}
                      </span>
                    )}
                    <span className="font-mono text-[9px] text-muted">
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="px-3 py-2 border-t border-hair text-[10px] text-muted leading-relaxed">
              Every submitted update requires Planning Engineer confirmation
              before project data changes.
            </p>
          </section>
        )}
      </main>

    </div>
  );
}
