import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Send,
  ArrowLeft,
  Calendar,
  RotateCcw,
  Bot,
  AlertTriangle,
} from 'lucide-react';
import { api, errorDetail } from '../../lib/api';
import { agentContext, DISCIPLINES, PROJECT, WORK_FRONTS } from '../../config';
import type { AgentTurnResponse, Discipline } from '../../types';

/**
 * Report Progress Studio — a wide-screen front end for POST /agent/turn.
 *
 * WHAT THIS FILE USED TO DO, AND WHY IT MATTERED.
 *
 * Everything on this screen was static. It reported a fixed sentence about a
 * fixed activity (`ACT-PIP-201-04`, an id that exists in no baseline this
 * project ships), ignored the one field a supervisor could actually edit, and
 * ended in:
 *
 *     } catch {
 *       // In case of offline/network, show success locally
 *       setSubmitted(true);
 *     }
 *
 * so pulling the network cable produced "Dispatched to Project Controls".
 * That is the worst failure this codebase could contain: a supervisor is told
 * their work was recorded when nothing left the browser, and the record they
 * believe exists is the one nobody goes looking for. It also asserted a
 * 98.4% confidence figure, a GPS-verified geo-stamped photograph, torque logs
 * "attached automatically", and linkage into "Primavera P6 Rev-08 baseline
 * staging" — none of which exist anywhere in this repository. There is no
 * EXIF reader, no photo store, and no P6 write path; the schedule is only
 * ever changed by a planner through POST /review/{id}/resolve (D-009).
 *
 * WHAT IT DOES NOW.
 *
 * It sends what the supervisor actually typed, and it shows success only when
 * the server says it persisted something. `event_created` comes back true
 * only after `_create_event_from_slots` has committed a LinkedEvent and a
 * review item; anything else — a thrown request, a refused connection, a turn
 * that still has an open slot — keeps the draft on screen and states the
 * failure. Every figure rendered below comes from the response: the
 * confidence is the matcher's, the activity is the one the matcher chose, and
 * where the server has no answer the screen says so. See D-091.
 */

type Message = { from: 'supervisor' | 'assistant'; text: string; at: string };

const clockTime = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** A submission is only real when the server says it wrote something AND
 *  hands back the row it wrote. Either half alone is not persistence. */
function persistedReference(turn: AgentTurnResponse): string | null {
  if (!turn.event_created) return null;
  return turn.review_item_id ?? turn.linked_event_id ?? null;
}

export default function ReportStudio() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── The draft. Nothing here is cleared by a failure. ──
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [report, setReport] = useState('');
  const [workDate, setWorkDate] = useState<string>(PROJECT.dataDate);
  const [workFront, setWorkFront] = useState<string>(WORK_FRONTS[0]);
  const [discipline, setDiscipline] = useState<Discipline>(DISCIPLINES[0].value);

  const [messages, setMessages] = useState<Message[]>([]);
  const [turn, setTurn] = useState<AgentTurnResponse | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [submittedTurn, setSubmittedTurn] = useState<AgentTurnResponse | null>(null);

  const slots = turn?.slots;
  const readyToSend = Boolean(turn?.awaiting_confirmation);

  /** One turn. `confirm` commits; without it the agent only proposes. */
  const send = async (text: string, opts: { confirm?: boolean } = {}) => {
    const clean = text.trim();
    if (!clean && !opts.confirm) return;

    setBusy(true);
    setFailure(null);
    if (clean) {
      setMessages((m) => [...m, { from: 'supervisor', text: clean, at: clockTime() }]);
    }

    try {
      const res = await api.agentTurn({
        session_id: sessionId,
        message: clean,
        confirm: opts.confirm ?? false,
        context: { ...agentContext(workFront, discipline), data_date: workDate },
      });
      setTurn(res);
      setMessages((m) => [
        ...m,
        { from: 'assistant', text: res.agent_message, at: clockTime() },
      ]);
      setReply('');

      const reference = persistedReference(res);
      if (opts.confirm) {
        if (reference) {
          setSubmittedRef(reference);
          setSubmittedTurn(res);
          queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
          queryClient.invalidateQueries({ queryKey: ['fieldReports'] });
        } else {
          // The server answered, and the answer was no. `agent_message` says
          // what is still missing; the draft stays exactly where it is.
          setFailure(
            'Not submitted — the server did not record this update. ' +
              res.agent_message
          );
        }
      }
    } catch (e) {
      // There is no offline queue in this system. Saying "saved" here would
      // be a lie, so the failure is named and the text is kept.
      setFailure(errorDetail(e));
      if (clean) {
        setMessages((m) =>
          m.filter((msg) => !(msg.from === 'supervisor' && msg.text === clean))
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setSessionId(crypto.randomUUID());
    setReport('');
    setMessages([]);
    setTurn(null);
    setReply('');
    setFailure(null);
    setSubmittedRef(null);
    setSubmittedTurn(null);
  };

  /** Closed-set answers the agent offered, rendered as one-tap chips. Each
   *  chip sends exactly the word the supervisor would have typed. */
  const choices = useMemo<string[]>(() => {
    if (!turn?.choices) return [];
    return turn.choices
      .replace(/,?\s+or\s+/gi, ', ')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
  }, [turn?.choices]);

  return (
    <div className="w-full max-w-[1380px] mx-auto p-4 sm:p-6 lg:p-8 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-hair">
        <div className="flex items-center gap-2 text-xs font-mono text-muted">
          <Link to="/field" className="flex items-center gap-1 hover:text-fg transition-colors">
            <ArrowLeft size={14} /> Back to Field Voice OS
          </Link>
          <span>/</span>
          <span className="text-heading font-medium">Report Progress Studio</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="px-2 py-0.5 rounded bg-raised border border-hair text-fg font-medium">
            {PROJECT.code}
          </span>
          <span className="px-2 py-0.5 rounded bg-raised border border-hair text-muted">
            DATA DATE {PROJECT.dataDate}
          </span>
        </div>
      </div>

      {submittedRef && submittedTurn ? (
        /* Reached only from a response carrying event_created AND a row id. */
        <div className="mt-12 max-w-xl mx-auto border border-hair bg-raised rounded-xl p-8 text-center shadow-xs">
          <div className="h-12 w-12 rounded-full bg-surface border border-hair text-ok flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={28} />
          </div>
          <h2 className="text-xl font-semibold text-heading">
            Sent for planner review
          </h2>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            Recorded as <strong className="font-mono text-fg">{submittedRef}</strong>
            {submittedTurn.slots?.activity_id && (
              <>
                {' '}against{' '}
                <strong className="font-mono text-fg">{submittedTurn.slots.activity_id}</strong>
              </>
            )}
            {submittedTurn.activity_description && (
              <> — {submittedTurn.activity_description}</>
            )}
            .
          </p>
          <p className="mt-2 text-xs text-muted leading-relaxed">
            The schedule has not been changed. A Planning Engineer has to
            resolve this item before any actual date is written to it.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/field/reports')}
              className="px-4 py-2 rounded-md bg-fg text-surface text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              View in My Updates
            </button>
            <button
              type="button"
              onClick={startOver}
              className="px-4 py-2 rounded-md border border-hair bg-surface hover:bg-raised text-sm font-medium text-fg transition-colors cursor-pointer"
            >
              Submit Another Report
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ── Left: the report, and what the server made of it ── */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-heading">
                  Report Progress
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-raised border border-hair text-muted font-mono text-[10px] font-medium uppercase">
                  {turn ? 'STEP 2 OF 2' : 'STEP 1 OF 2'}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">
                Describe what happened on site. Nothing is written to the
                schedule from this screen.
              </p>
            </div>

            {/* Step 1 — the supervisor's own words */}
            <div className="border border-hair rounded-xl p-5 bg-surface shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-hair">
                <div className="flex items-center gap-2.5">
                  <span className="h-6 w-6 rounded-full bg-raised border border-hair text-muted font-mono text-xs font-semibold flex items-center justify-center">
                    1
                  </span>
                  <span className="text-sm font-semibold text-heading">
                    Your report
                  </span>
                </div>
              </div>

              <textarea
                value={report}
                onChange={(e) => setReport(e.target.value)}
                rows={3}
                placeholder="What work was done? e.g. “Poured 40 m3 on the raft at Pad-04” or “24”-P-1001-A1A hydrotest complete”"
                aria-label="What work was done"
                className="w-full rounded-md border border-hair bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-muted focus:outline-none focus:border-fg transition-colors resize-y font-sans"
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
                    Work front
                  </span>
                  <select
                    value={workFront}
                    onChange={(e) => setWorkFront(e.target.value)}
                    aria-label="Work front"
                    className="rounded-md border border-hair bg-surface px-2 py-1.5 text-fg focus:outline-none focus:border-fg transition-colors"
                  >
                    {WORK_FRONTS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
                    Discipline
                  </span>
                  <select
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value as Discipline)}
                    aria-label="Discipline"
                    className="rounded-md border border-hair bg-surface px-2 py-1.5 text-fg focus:outline-none focus:border-fg transition-colors"
                  >
                    {DISCIPLINES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
                    Reported work date
                  </span>
                  <div className="flex items-center gap-1.5 rounded-md border border-hair bg-surface px-2 py-1.5">
                    <Calendar size={13} className="text-muted shrink-0" />
                    <input
                      type="date"
                      value={workDate}
                      onChange={(e) => setWorkDate(e.target.value)}
                      aria-label="Reported work date"
                      className="bg-transparent border-0 p-0 text-fg focus:ring-0 w-full text-xs font-mono"
                    />
                  </div>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={busy || !report.trim()}
                  onClick={() => send(report)}
                  className="px-4 py-2 rounded-md bg-fg text-surface font-medium text-xs shadow-xs transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer"
                >
                  {busy ? 'Sending…' : turn ? 'Send again' : 'Parse this report'}
                </button>
                <span className="text-[11px] text-muted">
                  The matcher runs on the server. Nothing is stored yet.
                </span>
              </div>
            </div>

            {/* Step 2 — strictly what came back */}
            <div className="border border-hair rounded-xl p-5 bg-surface shadow-xs flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-hair">
                <div className="flex items-center gap-2.5">
                  <span className="h-6 w-6 rounded-full bg-fg text-surface font-mono text-xs font-semibold flex items-center justify-center">
                    2
                  </span>
                  <span className="text-sm font-semibold text-heading">
                    NAVIS understood
                  </span>
                </div>
                {/* The matcher's own figure, or nothing. */}
                {turn && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-raised border border-hair text-fg font-mono text-[11px] font-medium">
                    {turn.confidence > 0
                      ? `${(turn.confidence * 100).toFixed(1)}% match confidence`
                      : 'no confidence reported'}
                    {turn.match_outcome && ` · ${turn.match_outcome}`}
                  </div>
                )}
              </div>

              {!turn ? (
                <p className="text-sm text-muted">
                  Nothing parsed yet. Write the report above and send it — this
                  panel fills in from the server's reply, not before.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Chip label="Discipline" value={turn.discipline_label} />
                    <Chip label="Equipment / tag" value={slots?.tags?.join(', ') || null} />
                    <Chip label="Parsed status" value={turn.status_label} />
                    <Chip label="Reported date" value={slots?.date ?? null} />
                    <Chip
                      label="Quantity"
                      value={
                        slots?.quantity !== null && slots?.quantity !== undefined
                          ? `${slots.quantity}${slots.uom ? ` ${slots.uom}` : ''}`
                          : null
                      }
                    />
                    <Chip label="Location" value={slots?.location ?? null} />
                  </div>

                  <div className="border border-hair rounded-lg p-4 bg-raised flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-heading">
                      {turn.activity_description ?? 'No activity matched'}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                      <span className="px-2 py-0.5 rounded bg-surface border border-hair text-muted font-medium">
                        ACTIVITY ID: {slots?.activity_id ?? '—'}
                      </span>
                    </div>
                    {slots?.quantity_over_planned && (
                      <p className="text-[11px] text-warn">
                        Reported quantity exceeds the planned quantity on this
                        activity. The planner will see this flagged.
                      </p>
                    )}
                    {turn.pending_slots.length > 0 && (
                      <p className="text-[11px] text-muted">
                        Still needed: {turn.pending_slots.join(', ')}. Answer in
                        the assistant panel.
                      </p>
                    )}
                  </div>
                </>
              )}

              {failure && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-lg border border-hair bg-raised px-3.5 py-3 text-xs text-danger"
                >
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-heading">Not submitted</div>
                    <p className="mt-0.5 leading-relaxed">{failure}</p>
                    <p className="mt-1 leading-relaxed text-muted">
                      Your report is still on this screen. Nothing was sent and
                      nothing was stored anywhere.
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={busy || !readyToSend}
                  onClick={() => send('', { confirm: true })}
                  className="px-4 py-2 rounded-md bg-fg text-surface font-medium text-xs shadow-xs transition-opacity hover:opacity-90 active:opacity-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={13} />
                  <span>{busy ? 'Submitting…' : 'Send to planner review'}</span>
                </button>
                <button
                  type="button"
                  onClick={startOver}
                  className="px-3.5 py-2 rounded-md border border-hair bg-surface hover:bg-raised text-fg font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw size={13} />
                  <span>Start over</span>
                </button>
                {!readyToSend && (
                  <span className="text-[11px] text-muted">
                    {turn
                      ? 'The server has not said this is complete yet.'
                      : 'Parse a report first.'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted italic">
                * The schedule changes strictly after formal planner approval.
              </p>
            </div>
          </div>

          {/* ── Right: the real transcript ── */}
          <div className="lg:col-span-4 border border-hair rounded-xl bg-surface shadow-xs overflow-hidden flex flex-col h-[680px]">
            <div className="p-3.5 border-b border-hair flex items-center justify-between bg-raised">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-surface border border-hair text-fg flex items-center justify-center">
                  <Bot size={15} />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-heading leading-tight">
                    Field Update Assistant
                  </h2>
                  <div className="text-[10px] font-mono text-muted">
                    {messages.length === 0
                      ? 'No turns yet'
                      : `${messages.length} message${messages.length === 1 ? '' : 's'} this session`}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 p-3.5 overflow-y-auto flex flex-col gap-2.5 text-xs">
              {messages.length === 0 && (
                <p className="text-muted text-center mt-8 leading-relaxed text-xs">
                  The assistant answers here once you send a report. Every line
                  in this thread is a real request and a real reply.
                </p>
              )}
              {messages.map((msg, idx) => {
                const isUser = msg.from === 'supervisor';
                return (
                  <div
                    key={idx}
                    className={`flex flex-col ${isUser ? 'items-end self-end' : 'items-start self-start'} max-w-[90%]`}
                  >
                    <div className="flex items-center gap-1 mb-1 text-[10px] font-mono text-muted">
                      <span>{isUser ? 'You' : 'NAVIS'}</span>
                      <span>{msg.at}</span>
                    </div>
                    <div
                      className={`rounded-lg p-2.5 leading-relaxed text-xs ${
                        isUser
                          ? 'bg-fg text-surface font-medium'
                          : 'bg-raised border border-hair text-fg'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })}

              {choices.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {choices.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={busy}
                      onClick={() => send(c)}
                      className="px-2 py-1 rounded-md border border-hair bg-surface hover:bg-raised text-[11px] font-mono text-fg transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(reply);
              }}
              className="p-2.5 border-t border-hair bg-surface"
            >
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Reply or clarify details..."
                  className="w-full py-2 pl-2.5 pr-9 rounded-md border border-hair bg-surface text-xs text-fg placeholder:text-muted focus:outline-none focus:border-fg"
                />
                <button
                  type="submit"
                  title="Send message"
                  disabled={busy || !reply.trim()}
                  className="absolute right-1 p-1 bg-fg text-surface rounded hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40"
                >
                  <Send size={12} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** One parsed field. An empty slot prints an em dash: the agent not having
 *  read a value is a different thing from the value being blank. */
function Chip({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border border-hair rounded-lg p-2.5 bg-raised">
      <span className="font-mono text-[10px] font-medium text-muted uppercase tracking-wider block mb-0.5">
        {label}
      </span>
      <span
        className={`font-mono text-xs font-medium ${
          value ? 'text-fg' : 'text-muted'
        }`}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}
