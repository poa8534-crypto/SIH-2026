import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Send,
  ArrowLeft,
  Calendar,
  RotateCcw,
  AlertTriangle,
  Search,
  Loader2,
} from 'lucide-react';
import { api, ApiError, errorDetail } from '../../lib/api';
import {
  agentContext,
  DISCIPLINES,
  PROJECT,
  rememberDiscipline,
  savedDiscipline,
  WORK_FRONTS,
} from '../../config';
import type { AgentTurnResponse, Discipline } from '../../types';

/**
 * Report Progress Studio — a front end for POST /agent/turn, with explicit
 * states.
 *
 * WHY THE STATES ARE EXPLICIT.
 *
 * This screen used to have two: "no response yet" and "a response arrived".
 * Any 200 opened the interpretation panel, so "I love pizza" — which the
 * server refuses outright as `not_a_progress_report` — rendered under the
 * heading "NAVIS understood", beside a discipline chip reading Civil, because
 * the form defaulted to the first entry in the list and sent it as context. A
 * refusal looked like a result, and a value nobody had chosen looked like an
 * extraction. See D-095.
 *
 * The states below are the ones the server can actually put a draft into:
 *
 *   draft                nothing checked; only the composer is live
 *   checking             a request is in flight
 *   invalid              the server refused it as not a progress report
 *   needs_clarification  relevant, but a required slot is still open
 *   unmatched            relevant and complete, but no activity matched
 *   ready                complete and matched; submission is enabled
 *   submitting           the confirm turn is in flight
 *   submitted            the server returned a persisted row id
 *
 * A request FAILURE is deliberately not one of them. It is tracked separately,
 * so a dropped connection returns the draft to the state it was already in
 * rather than destroying the interpretation — and so that, on a confirm, the
 * difference between "the server said no" and "we never heard back" can be
 * stated rather than guessed at.
 */

type Phase =
  | 'draft'
  | 'checking'
  | 'invalid'
  | 'needs_clarification'
  | 'unmatched'
  | 'ready'
  | 'submitting'
  | 'submitted';

type Failure = {
  /** `confirmed` — the server answered. `uncertain` — we never heard back. */
  kind: 'confirmed' | 'uncertain';
  message: string;
};

type Exchange = { from: 'you' | 'navis'; text: string };

/** A submission is real only when the server says it wrote something AND
 *  hands back the row it wrote. Either half alone is not persistence. */
function persistedReference(turn: AgentTurnResponse): string | null {
  if (!turn.event_created) return null;
  return turn.review_item_id ?? turn.linked_event_id ?? null;
}

/**
 * Which state a response puts the draft into.
 *
 * `not_a_progress_report` is the server's own outcome value and is never
 * shown to a supervisor. The readable sentence is `agent_message`, which says
 * what was wrong and gives examples of what a report looks like.
 */
function phaseFor(turn: AgentTurnResponse): Phase {
  if (turn.match_outcome === 'not_a_progress_report') return 'invalid';
  if (!turn.awaiting_confirmation) return 'needs_clarification';
  if (!turn.slots?.activity_id) return 'unmatched';
  return 'ready';
}

export default function ReportStudio() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── The draft. Nothing here is cleared by a failure. ──
  const [report, setReport] = useState('');
  const [workDate, setWorkDate] = useState<string>(PROJECT.dataDate);
  const [workFront, setWorkFront] = useState<string>(WORK_FRONTS[0]);
  // No arbitrary default. A remembered choice is a legitimate one; the first
  // entry in the list is not.
  const [discipline, setDiscipline] = useState<Discipline | ''>(
    () => savedDiscipline() ?? ''
  );

  const [phase, setPhase] = useState<Phase>('draft');
  const [turn, setTurn] = useState<AgentTurnResponse | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [answer, setAnswer] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [submittedTurn, setSubmittedTurn] = useState<AgentTurnResponse | null>(null);
  /** True between an edit that invalidated a checked report and the next
   *  check. `turn` is cleared by that edit, so it cannot carry this. */
  const [edited, setEdited] = useState(false);

  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  /** Monotonic request counter. A reply whose number is not the latest is
   *  discarded: the draft moved on while it was in flight. */
  const seqRef = useRef(0);

  /** Everything that changes what the server would be asked. */
  const draftKey = useMemo(
    () => [report.trim(), workDate, workFront, discipline].join(' '),
    [report, workDate, workFront, discipline]
  );
  /** The draft the current interpretation was computed from. */
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const draftKeyRef = useRef(draftKey);
  draftKeyRef.current = draftKey;
  const interpretationIsCurrent = checkedKey !== null && checkedKey === draftKey;

  /**
   * Editing invalidates the interpretation, and starts a fresh session.
   *
   * The new session id is the important half. Slots accumulate server-side
   * across turns and are never overwritten once set, so re-checking an edited
   * report on the same session would answer about the old one — the
   * discipline the previous text implied, the date the previous turn
   * resolved. Only the composer is live again until the supervisor checks.
   */
  useEffect(() => {
    if (checkedKey === null || checkedKey === draftKey) return;
    setPhase('draft');
    setTurn(null);
    setExchanges([]);
    setAnswer('');
    setFailure(null);
    setCheckedKey(null);
    setEdited(true);
    setSessionId(crypto.randomUUID());
    seqRef.current += 1; // any reply still in flight is now stale
  }, [draftKey, checkedKey]);

  const send = useCallback(
    async (message: string, opts: { confirm?: boolean } = {}) => {
      const confirm = opts.confirm ?? false;
      const text = message.trim();
      if (!text && !confirm) return;

      const seq = ++seqRef.current;
      const keyAtSend = draftKey;

      setFailure(null);
      setPhase(confirm ? 'submitting' : 'checking');
      if (text) setExchanges((e) => [...e, { from: 'you', text }]);

      try {
        const res = await api.agentTurn({
          session_id: sessionId,
          message: text,
          confirm,
          context: {
            ...agentContext(workFront, discipline || null),
            data_date: workDate,
          },
        });

        // The draft moved on, or a newer request was sent. Either way this
        // answer describes something no longer on screen.
        if (seq !== seqRef.current || keyAtSend !== draftKeyRef.current) {
          setPhase('draft');
          return;
        }

        setTurn(res);
        setCheckedKey(keyAtSend);
        setEdited(false);
        setExchanges((e) => [...e, { from: 'navis', text: res.agent_message }]);
        setAnswer('');

        if (!confirm) {
          setPhase(phaseFor(res));
          return;
        }

        const reference = persistedReference(res);
        if (reference) {
          setSubmittedRef(reference);
          setSubmittedTurn(res);
          setPhase('submitted');
          if (discipline) rememberDiscipline(discipline);
          queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
          queryClient.invalidateQueries({ queryKey: ['fieldReports'] });
        } else {
          // The server answered, and the answer was no. Its own message says
          // what is still missing.
          setPhase(phaseFor(res));
          setFailure({
            kind: 'confirmed',
            message: `Not submitted — the server did not record this update. ${res.agent_message}`,
          });
        }
      } catch (e) {
        if (seq !== seqRef.current || keyAtSend !== draftKeyRef.current) {
          setPhase('draft');
          return;
        }

        // An ApiError means the server answered and refused, so nothing was
        // written. Anything else means the request never got a reply — and on
        // a CONFIRM that is genuinely ambiguous, because the write may have
        // committed before the connection dropped. Saying "nothing was
        // stored" there would be a guess, and the wrong one some of the time.
        const answered = e instanceof ApiError;
        setFailure({
          kind: confirm && !answered ? 'uncertain' : 'confirmed',
          message: errorDetail(e),
        });
        if (text) {
          setExchanges((ex) =>
            ex.filter((m) => !(m.from === 'you' && m.text === text))
          );
        }
        // Back to where the draft already was, never forward.
        setPhase(turn ? phaseFor(turn) : 'draft');
      }
    },
    [draftKey, sessionId, workFront, workDate, discipline, queryClient, turn]
  );

  const startOver = () => {
    setSessionId(crypto.randomUUID());
    seqRef.current += 1;
    setReport('');
    setPhase('draft');
    setTurn(null);
    setExchanges([]);
    setAnswer('');
    setFailure(null);
    setCheckedKey(null);
    setEdited(false);
    setSubmittedRef(null);
    setSubmittedTurn(null);
  };

  /** Closed-set answers the agent offered, as one-tap chips. Each sends
   *  exactly the word the supervisor would otherwise have typed. */
  const choices = useMemo<string[]>(() => {
    if (!turn?.choices) return [];
    return turn.choices
      .replace(/,?\s+or\s+/gi, ', ')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
  }, [turn?.choices]);

  const busy = phase === 'checking' || phase === 'submitting';
  const canCheck = report.trim().length > 0 && !busy;
  // Only the current draft, only an eligible response, never mid-request.
  const canSubmit =
    (phase === 'ready' || phase === 'unmatched') &&
    interpretationIsCurrent &&
    !busy;
  const slots = turn?.slots;

  if (submittedRef && submittedTurn) {
    return (
      <Shell>
        <div className="mt-12 max-w-xl mx-auto border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 rounded-2xl p-8 text-center shadow-sm">
          <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Sent for planner review
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Recorded as <strong className="font-mono">{submittedRef}</strong>
            {submittedTurn.slots?.activity_id ? (
              <>
                {' '}against{' '}
                <strong className="font-mono">{submittedTurn.slots.activity_id}</strong>
                {submittedTurn.activity_description && (
                  <> — {submittedTurn.activity_description}</>
                )}
              </>
            ) : (
              <> with no activity matched — flagged for a planner to place</>
            )}
            .
          </p>
          <p className="mt-2 text-xs text-slate-500 leading-relaxed">
            The schedule has not been changed. A Planning Engineer has to
            resolve this item before any actual date is written to it.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <button
              onClick={() => navigate('/field/reports')}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all"
            >
              View in My Updates
            </button>
            <button
              onClick={startOver}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 transition-all"
            >
              Submit Another Report
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* pb-40 so the fixed action bar and the mobile bottom nav never cover
          the last field. */}
      <div className="mt-6 flex flex-col gap-6 max-w-3xl pb-40 md:pb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Report Progress
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Describe what happened on site — work done, or what stopped it.
            Nothing is written to the schedule from this screen.
          </p>
        </div>

        {/* ── The composer. Always live, and on an untouched form the only
               thing on the page. ── */}
        <section className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="h-6 w-6 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-mono text-xs font-bold flex items-center justify-center">
              1
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              Your report
            </span>
          </div>

          <textarea
            value={report}
            onChange={(e) => setReport(e.target.value)}
            rows={3}
            placeholder="What happened on site? e.g. “Poured 40 m3 on the raft at Pad-04”, or “No access to the north pad since Tuesday”"
            aria-label="What happened on site"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Work front
              </span>
              <select
                value={workFront}
                onChange={(e) => setWorkFront(e.target.value)}
                aria-label="Work front"
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 text-slate-900 dark:text-white"
              >
                {WORK_FRONTS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Discipline
              </span>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value as Discipline | '')}
                aria-label="Discipline"
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 text-slate-900 dark:text-white"
              >
                {/* Not a default. The form does not decide a supervisor's
                    trade for them; the agent asks if it needs one. */}
                <option value="">Select discipline</option>
                {DISCIPLINES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Reported work date
              </span>
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2">
                <Calendar size={13} className="text-slate-400 shrink-0" />
                <input
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  aria-label="Reported work date"
                  className="bg-transparent border-0 p-0 text-slate-900 dark:text-white focus:ring-0 w-full"
                />
              </div>
            </label>
          </div>
        </section>

        {/* ── Below here appears only once there is something real to show ── */}

        {phase === 'checking' && (
          <StatusPanel
            tone="neutral"
            icon={<Loader2 size={16} className="animate-spin" />}
            title="Checking your report"
          >
            Reading it against the schedule. Nothing is stored yet.
          </StatusPanel>
        )}

        {phase === 'invalid' && turn && (
          /* A refusal, not a result. The old screen opened the interpretation
             panel here and rendered extracted values for text the server had
             just declined to read. */
          <StatusPanel
            tone="warn"
            icon={<AlertTriangle size={16} />}
            title="This does not look like a site report"
          >
            <p className="leading-relaxed">{turn.agent_message}</p>
            <p className="mt-2 text-[11px] opacity-80">
              Nothing was stored, and nothing was inferred from it — no
              activity, and no discipline beyond what you selected above.
            </p>
          </StatusPanel>
        )}

        {(phase === 'needs_clarification' ||
          phase === 'unmatched' ||
          phase === 'ready') &&
          turn && (
            <section className="border border-blue-200/80 dark:border-blue-900/60 rounded-2xl p-4 sm:p-5 bg-blue-50/20 dark:bg-blue-950/10 shadow-sm flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-blue-600 text-white font-mono text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {/* Was "NAVIS understood", which claims comprehension.
                        This is a proposal for a person to check. */}
                    {phase === 'needs_clarification'
                      ? 'A few details needed'
                      : 'Review your report'}
                  </span>
                </div>
                {phase !== 'needs_clarification' && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 font-mono text-[10px] font-bold">
                    {turn.confidence > 0
                      ? `${(turn.confidence * 100).toFixed(1)}% match confidence`
                      : 'no confidence reported'}
                  </div>
                )}
              </div>

              {/* Clarification lives here now, not in a chat panel bolted to
                  the side of the screen. */}
              {phase === 'needs_clarification' && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                    {turn.agent_message}
                  </p>
                  {choices.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {choices.map((c) => (
                        <button
                          key={c}
                          type="button"
                          disabled={busy}
                          onClick={() => send(c)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 bg-white dark:bg-slate-900 text-xs font-mono text-slate-700 dark:text-slate-300 transition-colors cursor-pointer disabled:opacity-40"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      send(answer);
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Type your answer…"
                      aria-label="Answer the question"
                      className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="submit"
                      disabled={busy || !answer.trim()}
                      className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-40"
                      title="Send answer"
                    >
                      <Send size={15} />
                    </button>
                  </form>
                </div>
              )}

              {/* What was read, and where each value came from. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Chip
                  label="Discipline"
                  value={turn.discipline_label}
                  source={discipline ? 'you selected' : 'read from your report'}
                />
                <Chip
                  label="Work front"
                  value={slots?.location ?? null}
                  source="you selected"
                />
                <Chip
                  label="Reported date"
                  value={slots?.date ?? null}
                  source={
                    slots?.date === workDate ? 'you selected' : 'read from your report'
                  }
                />
                <Chip
                  label="Equipment / tag"
                  value={slots?.tags?.join(', ') || null}
                  source="read from your report"
                />
                <Chip
                  label="Status"
                  value={turn.status_label}
                  source="read from your report"
                />
                <Chip
                  label="Quantity"
                  value={
                    slots?.quantity !== null && slots?.quantity !== undefined
                      ? `${slots.quantity}${slots.uom ? ` ${slots.uom}` : ''}`
                      : null
                  }
                  source="read from your report"
                />
              </div>

              {phase === 'unmatched' ? (
                /* Relevant, complete, and nothing matched. Submitting is still
                   the right move: the server files it with a null activity,
                   reason `no_match`, at high priority, so a planner places it.
                   Discarding it would lose the report. */
                <StatusPanel
                  tone="warn"
                  icon={<Search size={16} />}
                  title="No matching activity found"
                >
                  <p className="leading-relaxed">
                    Your report is clear, but nothing in the current schedule
                    matches it. Add detail above and check again, or send it as
                    it is — a planner will place it against the right activity.
                  </p>
                </StatusPanel>
              ) : phase === 'ready' ? (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 flex flex-col gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {turn.activity_description ?? 'No activity matched'}
                  </h3>
                  <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs font-semibold self-start">
                    {slots?.activity_id ?? '—'}
                  </span>
                  {slots?.quantity_over_planned && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Reported quantity exceeds the planned quantity on this
                      activity. The planner will see this flagged.
                    </p>
                  )}
                </div>
              ) : null}

              <p className="text-[11px] text-slate-500 leading-relaxed">
                To correct anything, edit the fields above — the report is then
                checked again before it can be sent.
              </p>
            </section>
          )}

        {failure && (
          <div
            role="alert"
            className={`flex items-start gap-2 rounded-xl border px-3.5 py-3 text-xs ${
              failure.kind === 'uncertain'
                ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                : 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
            }`}
          >
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">
                {failure.kind === 'uncertain' ? 'Could not confirm' : 'Not submitted'}
              </div>
              <p className="mt-0.5 leading-relaxed">{failure.message}</p>
              {failure.kind === 'uncertain' ? (
                <>
                  {/* The request left the browser and no reply came back, so
                      the write may have committed. Retry is safe: the server
                      files one submission per session and hands back the
                      existing row on a repeat. */}
                  <p className="mt-1 leading-relaxed opacity-90">
                    Your update may or may not have been recorded. Retrying is
                    safe — it cannot create a second copy.
                  </p>
                  <button
                    type="button"
                    onClick={() => send('', { confirm: true })}
                    disabled={busy}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-40"
                  >
                    Retry
                  </button>
                </>
              ) : (
                <p className="mt-1 leading-relaxed opacity-80">
                  Your report is still on this screen. Nothing was stored.
                </p>
              )}
            </div>
          </div>
        )}

        {exchanges.length > 0 && (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer select-none">
              Conversation with NAVIS ({exchanges.length})
            </summary>
            <div className="mt-2 flex flex-col gap-1.5 font-mono">
              {exchanges.map((m, i) => (
                <div key={i}>
                  <span className="text-slate-400">
                    {m.from === 'you' ? 'You' : 'NAVIS'}:{' '}
                  </span>
                  {m.text}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* ── Actions. Fixed above the mobile bottom nav, and clear of the
             on-screen keyboard's safe area. ── */}
      <div className="fixed bottom-[4.25rem] md:bottom-6 left-0 right-0 z-20 md:static px-4 md:px-0">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-lg md:shadow-none px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canCheck}
            onClick={() => send(report)}
            className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold text-sm shadow-sm transition-all disabled:opacity-40 cursor-pointer"
          >
            {phase === 'checking'
              ? 'Checking…'
              : interpretationIsCurrent
                ? 'Check again'
                : 'Check report'}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => send('', { confirm: true })}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={15} />
            <span>
              {phase === 'submitting'
                ? 'Submitting…'
                : phase === 'unmatched'
                  ? 'Send for a planner to place'
                  : 'Send to planner review'}
            </span>
          </button>
          {edited && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <RotateCcw size={12} /> Report edited — check it again
            </span>
          )}
          {!turn && !edited && phase === 'draft' && (
            <span className="text-[11px] text-slate-400">
              Write a report, then check it.
            </span>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[1380px] mx-auto p-4 sm:p-6 lg:p-8 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
          <Link
            to="/field"
            className="flex items-center gap-1 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft size={14} /> Back to Field Voice OS
          </Link>
          <span>/</span>
          <span className="text-slate-800 dark:text-slate-200 font-semibold">
            Report Progress Studio
          </span>
        </div>
        <div className="hidden sm:flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold">
            {PROJECT.code}
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            DATA DATE {PROJECT.dataDate}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

function StatusPanel({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'neutral' | 'warn';
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const skin =
    tone === 'warn'
      ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300';
  return (
    <section className={`rounded-2xl border px-4 py-3.5 text-xs ${skin}`}>
      <div className="flex items-center gap-2 font-bold text-sm">
        {icon}
        <span>{title}</span>
      </div>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

/** One proposed value, and where it came from.
 *
 *  A value the supervisor chose and a value the parser read out of their
 *  sentence are different kinds of claim, and only the second one can be wrong
 *  in a way they would want to correct. An unfilled slot prints an em dash:
 *  the agent not having read a value is not the same as the value being
 *  blank. */
function Chip({
  label,
  value,
  source,
}: {
  label: string;
  value: string | null;
  source: 'you selected' | 'read from your report';
}) {
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-900">
      <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
        {label}
      </span>
      <span
        className={`font-mono text-xs font-bold block ${
          value ? 'text-slate-900 dark:text-white' : 'text-slate-400'
        }`}
      >
        {value ?? '—'}
      </span>
      {value && (
        <span className="text-[10px] text-slate-400 mt-0.5 block">{source}</span>
      )}
    </div>
  );
}
