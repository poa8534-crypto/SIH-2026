import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  MapPin,
  Mic,
  MicOff,
  Pencil,
  Send,
  ShieldCheck,
  StopCircle,
  WifiOff,
  X,
} from 'lucide-react';
import { api, errorDetail } from '../lib/api';
import { AgentTurnResponse, Discipline, ReviewItem, SlotState } from '../types';
import { SPEECH_LANGUAGES, useSpeech } from '../hooks/useSpeech';
import { DISCIPLINES, SUPERVISOR, WORK_FRONTS, agentContext } from '../config';
import { NeedsYourResponse, RecentUpdates } from '../components/FieldContextBlocks';
import { Button, ErrorState, PanelHeader, SectionTitle } from '../components/ui';

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
  // Every slot is filled and the proposal is ready, but the supervisor
  // has not asked to see it yet. The mockup makes this a deliberate beat
  // rather than jumping straight to the card.
  | 'ready'
  | 'card'
  | 'submitted';

interface Message {
  from: 'supervisor' | 'assistant';
  text: string;
  at: string;
}



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
    <section className="border border-hair bg-raised rounded-lg overflow-hidden">
      <PanelHeader
        title={
          <>
            <Cpu size={18} className="text-accent shrink-0" />
            STRUCTURED UPDATE
          </>
        }
      />

      {/* One labelled row per extracted slot. Each is its own tap target for
          a correction, which goes back through the agent as another turn. */}
      <div className="flex flex-col">
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex justify-between items-start gap-4 px-4 py-4 border-b border-hair"
          >
            <div className="flex flex-col gap-2 min-w-0">
              <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
                {r.label}
              </span>
              <span className="text-lead leading-6 text-fg break-words">{r.value}</span>
            </div>
            <Button
              variant="icon"
              tone="accent"
              onClick={() => onEdit(r.key)}
              aria-label={`Correct ${r.label.toLowerCase()}`}
            >
              <Pencil size={16} />
            </Button>
          </div>
        ))}

        {slots.quantity_over_planned && (
          <div className="px-4 py-4 border-b border-hair flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-warn" />
            <span className="text-body leading-5 text-warn">
              Completed exceeds the planned total — the Planning Engineer will
              check this
            </span>
          </div>
        )}

        {/* No pencil: confidence is computed by the matching engine and is not
            the supervisor's to change. */}
        <div className="flex justify-between items-start gap-4 px-4 py-4">
          <div className="flex flex-col gap-2">
            <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
              Confidence
            </span>
            <span className="text-lead leading-6 font-mono text-accent">
              {(confidence * 100).toFixed(1)}%
            </span>
          </div>
          <span className="text-label font-medium uppercase tracking-[0.05em] text-muted mt-1 shrink-0">
            {outcome === 'AUTO_LINK' ? 'strong match' : 'planner confirms'}
          </span>
        </div>
      </div>

      <div className="px-4 py-5 border-t border-hair bg-surface flex flex-col gap-3">
        <Button variant="primary" block onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'CONFIRM & SUBMIT'}
        </Button>
        <Button variant="ghost" block onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <p className="text-label text-muted leading-relaxed text-center">
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
        setStage('ready');
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

  const contextBlock = (
    <div className="border border-hair bg-raised rounded-lg overflow-hidden">
      <button
        onClick={() => setContextOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-selected transition-colors"
      >
        <SectionTitle>Current Context</SectionTitle>
        {contextOpen ? (
          <ChevronUp size={18} className="text-accent" />
        ) : (
          <ChevronDown size={18} className="text-accent" />
        )}
      </button>
      {contextOpen ? (
        <div className="px-5 pb-5 pt-4 flex flex-col gap-4 border-t border-hair">
          <label className="flex flex-col gap-2">
            <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
              Work front
            </span>
            <select
              value={workFront}
              onChange={(e) => setWorkFront(e.target.value)}
              className="rounded-sm bg-raised border border-hair text-fg text-lead px-4 py-3 transition-colors focus:outline-none focus:border-accent"
            >
              {WORK_FRONTS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
              Discipline
            </span>
            <select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value as Discipline)}
              className="rounded-sm bg-raised border border-hair text-fg text-lead px-4 py-3 transition-colors focus:outline-none focus:border-accent"
            >
              {DISCIPLINES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="px-5 pb-4 pt-4 flex flex-col gap-2 border-t border-hair">
          <div className="flex justify-between gap-3 text-lead">
            <span className="text-muted">Work front</span>
            <span className="text-fg text-right">{workFront}</span>
          </div>
          <div className="flex justify-between gap-3 text-lead">
            <span className="text-muted">Discipline</span>
            <span className="text-fg text-right">
              {DISCIPLINES.find((d) => d.value === discipline)?.label}
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
        className="rounded-sm w-full bg-raised border border-hair text-fg text-lead placeholder:text-muted px-4 pr-12 py-3 transition-colors focus:outline-none focus:border-accent"
      />
      <Button
        variant="icon"
        tone="accent"
        onClick={() => send(typed)}
        disabled={!typed.trim() || thinking}
        aria-label="Send"
        className="absolute right-2"
      >
        <Send size={18} />
      </Button>
    </div>
  );

  /*
   * The four states below are deliberately unalike. Collapsing them into one
   * "something went wrong" panel would hide the only thing that matters to a
   * supervisor holding a phone on site: whether the session is still alive,
   * and whether anything reached the server.
   */

  /** No microphone at all. Quiet and neutral — typing is the whole answer. */
  const micUnavailableBox = (
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

  /** The mic worked, the recording did not. The session is still live. */
  const notUnderstoodBox = (
    <div className="border border-warn bg-raised rounded-lg px-5 py-5 flex flex-col items-center gap-3 text-center">
      <span className="self-end flex items-center gap-2 rounded-full bg-selected px-3 py-1 text-label font-medium uppercase tracking-[0.05em] text-accent">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
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
        <Button
          variant="primary"
          block
          onClick={() => {
            speech.clearFailure();
            speech.start();
            setStage('listening');
          }}
        >
          Record Again
        </Button>
        <Button variant="secondary" block onClick={() => speech.clearFailure()}>
          Type Response
        </Button>
      </div>
    </div>
  );

  /** The server never answered. Nothing was written, and his text is kept. */
  const serverErrorBox = serverError && (
    <div className="border border-danger-line bg-danger-bg rounded-lg px-5 py-5 flex flex-col items-center gap-3 text-center">
      <span className="w-16 h-16 rounded-full bg-raised border border-danger-line flex items-center justify-center">
        <WifiOff size={26} className="text-danger" />
      </span>
      <span className="text-h3 font-semibold leading-7 text-danger">
        Could not reach the server — try again
      </span>
      <span className="text-lead text-danger">This update was not saved.</span>
      <span className="font-mono text-label text-danger opacity-80 break-all">
        {serverError}
      </span>
      <Button variant="primary" block onClick={() => send(typed)}>
        Retry
      </Button>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full bg-surface overflow-hidden">
      {/* Context sub-header */}
      <div className="shrink-0 px-4 py-2 bg-raised border-b border-hair flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 min-w-0">
          <MapPin size={14} className="text-muted shrink-0" />
          <span className="text-body text-muted truncate">{workFront}</span>
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {SPEECH_LANGUAGES.map((l) => (
            <Button
              key={l.code}
              variant="secondary"
              size="sm"
              shape="pill"
              active={speech.lang === l.code}
              onClick={() => speech.setLang(l.code)}
            >
              {l.label}
            </Button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {stage === 'idle' && (
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

            {micBlocked ? (
              micUnavailableBox
            ) : speech.failure === 'no-speech' ? (
              notUnderstoodBox
            ) : (
              /* The one thing this screen is for. The mic itself is a 96px
                 circular primary fill, centred; the whole card is the tap
                 target so it stays reachable with gloves on. */
              <button
                onClick={() => {
                  speech.clearFailure();
                  speech.start();
                  setStage('listening');
                }}
                className="group border border-hair bg-raised rounded-lg px-5 py-8 flex flex-col items-center gap-5 text-center hover:bg-selected transition-colors"
              >
                <span className="w-24 h-24 rounded-full bg-accent text-accent-fg flex items-center justify-center group-hover:bg-accent-hover group-active:scale-95 transition-all">
                  <Mic size={36} />
                </span>
                <span className="flex flex-col items-center gap-1">
                  <span className="text-h3 font-semibold text-heading">
                    Tap &amp; Speak
                  </span>
                  <span className="text-lead text-muted">
                    Describe what happened on site
                  </span>
                </span>
              </button>
            )}

            {textInput(micBlocked)}
            {serverErrorBox}
            {contextBlock}
            <NeedsYourResponse />
            <RecentUpdates />
            <p className="flex items-start gap-2 text-label text-muted leading-relaxed">
              <ShieldCheck size={14} className="mt-px shrink-0" />
              Every submitted update requires Planning Engineer confirmation
              before project data changes.
            </p>
          </>
        )}

        {stage === 'listening' && (
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
                {mmss(speech.elapsed)}
              </span>
            </div>

            <Waveform />

            <div className="min-h-[80px] flex flex-col items-center justify-center text-center w-full gap-2">
              <p className="text-h3 leading-7 text-fg">
                {speech.transcript ? (
                  `“${speech.transcript}”`
                ) : (
                  <span className="text-muted text-lead">Speak now…</span>
                )}
              </p>
              {/* A pause does not end the recording, so say so rather than
                  leaving him wondering whether it stopped. */}
              {speech.silent && (
                <span className="text-body text-muted">still listening…</span>
              )}
            </div>

            <Button
              variant="primary"
              block
              onClick={() => {
                speech.stop();
                setDraftTranscript(speech.transcript);
                setStage('transcript');
              }}
            >
              <StopCircle size={18} />
              Stop &amp; Process
            </Button>
            <Button
              variant="ghost"
              block
              onClick={() => {
                speech.cancel();
                setStage('idle');
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Dimmed while recording: still in sight, not competing for it. */}
        {stage === 'listening' && (
          <>
            <NeedsYourResponse dimmed />
            <RecentUpdates dimmed />
          </>
        )}

        {stage === 'transcript' && (
          <>
            <div className="border border-hair bg-raised rounded-lg px-5 py-5 flex flex-col gap-4">
              <div>
                <h1 className="text-h3 font-semibold text-heading">
                  Check your transcript
                </h1>
                <p className="text-lead text-muted mt-1 leading-6">
                  Check this before sending — speech recognition can mishear
                  equipment numbers.
                </p>
              </div>
              <textarea
                value={draftTranscript}
                onChange={(e) => setDraftTranscript(e.target.value)}
                rows={5}
                className="rounded-sm w-full bg-raised border border-hair text-fg text-lead leading-6 p-4 transition-colors focus:outline-none focus:border-accent resize-none"
              />
              <Button
                variant="primary"
                block
                onClick={() => send(draftTranscript)}
                disabled={!draftTranscript.trim()}
              >
                Use This Transcript
              </Button>
              <Button
                variant="secondary"
                block
                onClick={() => {
                  setDraftTranscript('');
                  speech.clearFailure();
                  speech.start();
                  setStage('listening');
                }}
              >
                Record Again
              </Button>
            </div>

            <NeedsYourResponse dimmed />
            <RecentUpdates dimmed title="My Recent Updates" />
          </>
        )}

        {(stage === 'conversation' || stage === 'ready' || stage === 'card') && (
          <>
            {/* Without this there was no way out of a conversation: if the
                agent stalled on a slot, idle was unreachable for the rest of
                the session. */}
            <div className="flex items-center justify-between border-b border-hair pb-3">
              <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
                Data Entry Session
              </span>
              <Button
                variant="ghost"
                size="xs"
                onClick={resetSession}
                aria-label="Close session"
              >
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
                    <span className="uppercase tracking-[0.05em] opacity-80">
                      {c.label}
                    </span>{' '}
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

            {/* One slot prompt at a time, with the closed set the agent
                returned rendered as tappable chips. A supervisor answering on
                site needs the open question, not a scrollback of the exchange. */}
            {stage === 'conversation' && currentQuestion && !thinking && (
              <div className="border border-hair bg-raised rounded-lg px-5 py-5 flex flex-col gap-4">
                <span className="flex items-center gap-2 text-label font-semibold uppercase tracking-[0.05em] text-accent">
                  <Cpu size={14} />
                  NAVIS Assistant
                </span>
                <p className="text-h3 leading-7 font-semibold text-heading">
                  {currentQuestion}
                </p>
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((sug) => (
                      <Button
                        key={sug}
                        variant="secondary"
                        shape="pill"
                        onClick={() => send(sug)}
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
                <span className="text-lead text-muted">
                  NAVIS Assistant is thinking…
                </span>
              </div>
            )}
            <div ref={threadEnd} />

            {serverErrorBox}

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
                <Button variant="primary" block onClick={() => setStage('card')}>
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
                    Got it. I&rsquo;ve extracted the structured data from your
                    update. Please review it below.
                  </p>
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
                {micBlocked && micUnavailableBox}
                {textInput(micBlocked)}
                {!micBlocked && speech.failure !== 'no-speech' && (
                  <Button
                    variant="secondary"
                    block
                    onClick={() => {
                      speech.clearFailure();
                      speech.start();
                      setStage('listening');
                    }}
                  >
                    <Mic size={18} />
                    Answer by voice
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {stage === 'submitted' && (
          <>
            <div className="border border-hair bg-raised rounded-lg px-5 py-8 flex flex-col items-center text-center gap-3">
              <span className="w-16 h-16 rounded-full bg-selected flex items-center justify-center">
                <Check size={30} className="text-accent" />
              </span>
              <h1 className="text-h2 font-semibold text-heading mt-1">
                Update submitted
              </h1>
              {reference && (
                <p className="w-full rounded-sm border border-hair bg-surface px-3 py-2 font-mono text-label text-muted break-all">
                  Report reference: {reference}
                </p>
              )}
              <p className="text-lead text-fg">Sent for Planning Engineer review.</p>
              <p className="text-lead text-muted">
                The project schedule has not been changed.
              </p>
              <Button variant="primary" block className="mt-2" onClick={resetSession}>
                Return Home
              </Button>
            </div>

            <NeedsYourResponse />
            <RecentUpdates />
          </>
        )}
      </main>
    </div>
  );
}
