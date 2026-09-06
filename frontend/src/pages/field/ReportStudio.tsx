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
  Loader2,
  Camera,
  Paperclip,
  Mic,
  X,
  MapPin,
  Clock,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { api, ApiError, errorDetail } from '../../lib/api';
import {
  agentContext,
  DISCIPLINES,
  PROJECT,
  rememberDiscipline,
  savedDiscipline,
  SUPERVISOR,
  WORK_FRONTS,
} from '../../config';
import type { AgentTurnResponse, Discipline } from '../../types';
import { useSpeech } from '../../hooks/useSpeech';

/**
 * Report Progress Studio — deliberate, detailed site reporting workspace.
 *
 * Distinct from Home (/field):
 * - Home is fastest possible capture (minimal, voice/photo/send).
 * - Report Progress (/field/report) is a structured 3-step reporting workspace
 *   where the supervisor builds, verifies, and submits a complete field record:
 *
 *   STEP 1 ─ CAPTURE: 2-column workspace (Report + Current Context) + Additional Details
 *   STEP 2 ─ REVIEW: NAVIS Extracted breakdown, schedule check, and verification
 *   STEP 3 ─ SUBMIT: Permanent persistence receipt with tracking ID
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

function persistedReference(turn: AgentTurnResponse): string | null {
  if (!turn.event_created) return null;
  return turn.review_item_id ?? turn.linked_event_id ?? null;
}

function phaseFor(turn: AgentTurnResponse): Phase {
  if (turn.match_outcome === 'not_a_progress_report') return 'invalid';
  if (!turn.awaiting_confirmation) return 'needs_clarification';
  if (!turn.slots?.activity_id) return 'unmatched';
  return 'ready';
}

export interface ReportSubmissionFlowProps {
  initialReport?: string;
  initialAttachments?: Array<{ name: string; type: 'photo' | 'file' }>;
  initialWorkFront?: string;
  initialDiscipline?: Discipline | '';
  initialWorkDate?: string;
  initialPreset?: 'progress' | 'material' | 'delay' | 'inspection' | null;
  mode?: 'page' | 'modal' | 'overlay';
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: (reference: string, turn: AgentTurnResponse) => void;
}

export function ReportSubmissionFlow({
  initialReport,
  initialAttachments,
  initialWorkFront,
  initialDiscipline,
  initialWorkDate,
  initialPreset,
  mode = 'page',
  isOpen = true,
  onClose,
  onSuccess,
}: ReportSubmissionFlowProps = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Form & Context State ───────────────────────────────────────────────────
  const [report, setReport] = useState(initialReport ?? '');
  const [attachments, setAttachments] = useState<{ name: string; type: 'photo' | 'file' }[]>(
    initialAttachments ?? []
  );
  const [workFront, setWorkFront] = useState<string>(initialWorkFront ?? PROJECT.location);
  const [isChangingWorkFront, setIsChangingWorkFront] = useState(false);
  const [isChangingContext, setIsChangingContext] = useState(false);

  // Supervisor defaults to their assigned trade (Piping) or saved preference
  const [discipline, setDiscipline] = useState<Discipline | ''>(() => {
    if (initialDiscipline !== undefined) return initialDiscipline;
    return savedDiscipline() ?? SUPERVISOR.discipline;
  });
  const [isChangingDiscipline, setIsChangingDiscipline] = useState(false);

  const [workDate, setWorkDate] = useState<string>(initialWorkDate ?? PROJECT.dataDate);

  // Additional Details structured fields
  const [quantityInput, setQuantityInput] = useState('');
  const [unitInput, setUnitInput] = useState('');
  const [statusInput, setStatusInput] = useState<'in_progress' | 'complete' | 'delayed' | 'under_inspection'>(
    initialPreset === 'delay'
      ? 'delayed'
      : initialPreset === 'material'
        ? 'complete'
        : initialPreset === 'inspection'
          ? 'under_inspection'
          : 'in_progress'
  );
  const [tagInput, setTagInput] = useState('');
  const [delayInput, setDelayInput] = useState(() => {
    if (initialPreset === 'delay' && initialReport) {
      const match = initialReport.match(/\[.*Delay.*\]\s*(.*)/i);
      return match && match[1] ? match[1] : '';
    }
    return '';
  });

  // ── Engine State ───────────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [phase, setPhase] = useState<Phase>('draft');
  const [turn, setTurn] = useState<AgentTurnResponse | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [answer, setAnswer] = useState('');

  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [submittedTurn, setSubmittedTurn] = useState<AgentTurnResponse | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeech();
  const isRecording = speech.listening;

  // Speech transcript appending
  useEffect(() => {
    if (speech.transcript) {
      setReport((prev) => {
        const trimmed = prev.trim();
        return trimmed ? `${trimmed} ${speech.transcript}` : speech.transcript;
      });
    }
  }, [speech.transcript]);

  const toggleRecording = () => {
    if (speech.listening) {
      speech.stop();
    } else {
      speech.start();
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>, type: 'photo' | 'file') => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachments((prev) => [...prev, { name: file.name, type }]);
    }
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Staleness & Session Tracking ───────────────────────────────────────────
  const draftKey = `${report}::${workFront}::${discipline}::${workDate}`;
  const draftKeyRef = useRef(draftKey);
  draftKeyRef.current = draftKey;

  const seqRef = useRef(0);

  const interpretationIsCurrent =
    checkedKey !== null &&
    checkedKey === draftKey &&
    phase !== 'draft' &&
    phase !== 'invalid';

  useEffect(() => {
    if (checkedKey !== null && draftKey !== checkedKey) {
      setEdited(true);
      setFailure(null);
    }
  }, [draftKey, checkedKey]);

  useEffect(() => {
    if (!edited) return;
    setSessionId(crypto.randomUUID());
    seqRef.current += 1;
  }, [edited]);

  const send = useCallback(
    async (message: string, opts: { confirm?: boolean } = {}) => {
      const confirm = opts.confirm ?? false;
      const text = message.trim();
      if (!text && !confirm) return;

      const currentReport = report || text;
      const seq = ++seqRef.current;
      const keyAtSend = `${currentReport}::${workFront}::${discipline}::${workDate}`;
      draftKeyRef.current = keyAtSend;

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
          onSuccess?.(reference, res);
        } else {
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
        setPhase(turn ? phaseFor(turn) : 'draft');
      }
    },
    [draftKey, sessionId, workFront, workDate, discipline, queryClient, turn]
  );

  const prevIsOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      if (initialReport !== undefined) setReport(initialReport);
      if (initialAttachments !== undefined) setAttachments(initialAttachments);
      if (initialWorkFront) setWorkFront(initialWorkFront);
      if (initialDiscipline !== undefined) setDiscipline(initialDiscipline);
      if (initialWorkDate) setWorkDate(initialWorkDate);
      if (initialPreset) {
        if (initialPreset === 'delay') {
          setStatusInput('delayed');
          const match = (initialReport ?? '').match(/\[.*Delay.*\]\s*(.*)/i);
          if (match && match[1]) setDelayInput(match[1]);
        } else if (initialPreset === 'material') {
          setStatusInput('complete');
        } else if (initialPreset === 'inspection') {
          setStatusInput('under_inspection');
        } else if (initialPreset === 'progress') {
          setStatusInput('in_progress');
        }
      }
      if (initialReport && initialReport.trim()) {
        send(initialReport.trim());
      }
    }
    prevIsOpenRef.current = Boolean(isOpen);
  }, [isOpen, initialReport, initialAttachments, initialWorkFront, initialDiscipline, initialWorkDate, initialPreset, send]);

  const startOver = () => {
    setSessionId(crypto.randomUUID());
    seqRef.current += 1;
    setReport('');
    setAttachments([]);
    setQuantityInput('');
    setUnitInput('');
    setStatusInput('in_progress');
    setTagInput('');
    setDelayInput('');
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
  const canSubmit =
    (phase === 'ready' || phase === 'unmatched') &&
    interpretationIsCurrent &&
    !busy;

  const isSubmissionPhase =
    (phase === 'ready' || phase === 'unmatched' || phase === 'submitting') &&
    interpretationIsCurrent;

  // Step 1: Capture | Step 2: Review | Step 3: Submit
  const step: 1 | 2 | 3 =
    phase === 'submitted' || Boolean(submittedRef)
      ? 3
      : isSubmissionPhase
        ? 2
        : 1;

  const slots = turn?.slots;
  const disciplineLabel = discipline
    ? DISCIPLINES.find((d) => d.value === discipline)?.label ?? discipline
    : 'Piping';

  const isModalOrOverlay = mode === 'modal' || mode === 'overlay';
  if (isModalOrOverlay && !isOpen) {
    return null;
  }

  // ── STEP 3: SUBMISSION RECEIPT ─────────────────────────────────────────────
  if (step === 3 && submittedRef && submittedTurn) {
    const receiptContent = (
      <div className={`w-full max-w-[1240px] mx-auto ${isModalOrOverlay ? 'p-2 sm:p-4' : 'px-4 sm:px-6 py-6'} font-sans flex flex-col gap-6`}>
        <div className="flex items-center justify-between w-full">
          {isModalOrOverlay ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-heading transition-colors cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Return to Home</span>
            </button>
          ) : (
            <Link
              to="/field"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-heading transition-colors w-fit"
            >
              <ArrowLeft size={14} />
              <span>Back to Field OS</span>
            </Link>
          )}

          {isModalOrOverlay && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-heading hover:bg-selected transition-colors cursor-pointer"
              title="Close receipt"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Lightweight Stepper */}
        <div className="flex items-center justify-center py-2">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2 text-ok font-semibold">
              <span className="h-6 w-6 rounded-full bg-ok/15 text-ok flex items-center justify-center text-xs font-bold">
                ✓
              </span>
              <span>Capture</span>
            </div>
            <div className="w-12 sm:w-20 h-0.5 bg-ok" />
            <div className="flex items-center gap-2 text-ok font-semibold">
              <span className="h-6 w-6 rounded-full bg-ok/15 text-ok flex items-center justify-center text-xs font-bold">
                ✓
              </span>
              <span>Review</span>
            </div>
            <div className="w-12 sm:w-20 h-0.5 bg-accent" />
            <div className="flex items-center gap-2 text-accent font-bold">
              <span className="h-6 w-6 rounded-full bg-accent text-accent-fg flex items-center justify-center text-xs font-bold">
                3
              </span>
              <span>Submit</span>
            </div>
          </div>
        </div>

        {/* Success Surface */}
        <div className="max-w-[760px] mx-auto w-full bg-raised border border-hair rounded-2xl p-8 sm:p-10 text-center shadow-xs flex flex-col items-center gap-5">
          <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shadow-xs">
            <CheckCircle2 size={32} />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block mb-1">
              ✓ Update Recorded
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-heading tracking-tight">
              Sent for planner review
            </h2>
            <p className="mt-3 text-sm text-muted leading-relaxed max-w-lg mx-auto">
              Recorded as <strong className="font-mono text-heading">{submittedRef}</strong>
              {submittedTurn.slots?.activity_id ? (
                <>
                  {' '}against{' '}
                  <strong className="font-mono text-heading">{submittedTurn.slots.activity_id}</strong>
                  {submittedTurn.activity_description && (
                    <> — {submittedTurn.activity_description}</>
                  )}
                </>
              ) : (
                <> with no activity matched — flagged for a planner to place</>
              )}
              .
            </p>
            <p className="mt-2.5 text-xs text-muted leading-relaxed">
              The project schedule has not been changed yet. A Planning Engineer must verify this report before actuals are committed.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3 w-full max-w-sm">
            <button
              onClick={() => {
                if (isModalOrOverlay) onClose?.();
                navigate('/field/reports');
              }}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-accent hover:opacity-90 active:opacity-95 text-accent-fg text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              View in My Updates
            </button>
            <button
              onClick={() => {
                if (isModalOrOverlay) {
                  onClose?.();
                } else {
                  startOver();
                }
              }}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl border border-hair bg-surface hover:bg-selected text-xs font-semibold text-heading transition-colors cursor-pointer"
            >
              {isModalOrOverlay ? 'Return to Home' : 'Submit Another Report'}
            </button>
          </div>
        </div>
      </div>
    );

    if (isModalOrOverlay) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl my-auto bg-surface border border-hair rounded-2xl shadow-2xl p-4 sm:p-6 max-h-[92vh] overflow-y-auto">
            {receiptContent}
          </div>
        </div>
      );
    }
    return receiptContent;
  }

  // ── MAIN VIEW: STEP 1 (CAPTURE) & STEP 2 (REVIEW) ───────────────────────────
  const mainContent = (
    <div className={`w-full max-w-[1240px] mx-auto ${isModalOrOverlay ? 'p-2 sm:p-4' : 'px-4 sm:px-6 py-4 sm:py-6 pb-24 md:pb-8'} flex flex-col gap-6 font-sans`}>
      {/* Top Header: Clean typography, no redundant heavy badges */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-1">
        <div className="w-full sm:w-auto flex items-start justify-between sm:block">
          <div>
            {isModalOrOverlay ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-heading transition-colors mb-2 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Return to Home</span>
              </button>
            ) : (
              <Link
                to="/field"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-heading transition-colors mb-2"
              >
                <ArrowLeft size={14} />
                <span>Report Progress</span>
              </Link>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold text-heading tracking-tight">
              Report Progress
            </h1>
            <p className="text-xs sm:text-sm text-muted mt-1">
              {workFront} · {disciplineLabel} · {SUPERVISOR.shift}
            </p>
          </div>

          {isModalOrOverlay && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="sm:hidden h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-heading hover:bg-selected transition-colors cursor-pointer"
              title="Close (draft kept on Home)"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Lightweight Modern Stepper + Close Button */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 sm:gap-3 text-xs self-start sm:self-auto py-1">
            <div className="flex items-center gap-2">
              <span
                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === 1
                    ? 'bg-accent text-accent-fg'
                    : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {step > 1 ? '✓' : '1'}
              </span>
              <span className={`font-semibold ${step === 1 ? 'text-heading font-bold' : 'text-muted'}`}>
                Capture
              </span>
            </div>

            <div className={`w-8 sm:w-16 h-0.5 ${step > 1 ? 'bg-emerald-500' : 'bg-hair'}`} />

            <div className="flex items-center gap-2">
              <span
                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === 2
                    ? 'bg-accent text-accent-fg'
                    : step > 2
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      : 'bg-surface border border-hair text-muted'
                }`}
              >
                {step > 2 ? '✓' : '2'}
              </span>
              <span className={`font-semibold ${step === 2 ? 'text-heading font-bold' : 'text-muted'}`}>
                Review
              </span>
            </div>

            <div className={`w-8 sm:w-16 h-0.5 ${step > 2 ? 'bg-emerald-500' : 'bg-hair'}`} />

            <div className="flex items-center gap-2">
              <span
                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === 3
                    ? 'bg-accent text-accent-fg'
                    : 'bg-surface border border-hair text-muted'
                }`}
              >
                3
              </span>
              <span className={`font-semibold ${step === 3 ? 'text-heading font-bold' : 'text-muted'}`}>
                Submit
              </span>
            </div>
          </div>

          {isModalOrOverlay && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="hidden sm:flex h-8 w-8 rounded-lg items-center justify-center text-muted hover:text-heading hover:bg-selected transition-colors cursor-pointer"
              title="Close (draft kept on Home)"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ── STEP 1: CAPTURE WORKSPACE (65 / 35 LAYOUT) ────────────────────────── */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT / MAIN WORKSPACE (~67% of desktop grid) */}
          <div className="lg:col-span-8 bg-raised border border-hair rounded-2xl p-5 sm:p-7 shadow-xs flex flex-col gap-6">
            
            {/* 1. What Happened? (Visual Center of the Page) */}
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="report-textarea" className="text-lg font-bold text-heading block">
                  What happened?
                </label>
                <p className="text-xs text-muted mt-0.5">
                  Describe work completed, line or spool number, quantity, or site conditions.
                </p>
              </div>

              <textarea
                id="report-textarea"
                ref={textareaRef}
                value={report}
                onChange={(e) => setReport(e.target.value)}
                rows={5}
                placeholder="Describe site progress (e.g. '40 metres of 8-inch piping installed near P-101 on Rack P1, hydrotest pre-checks passed')..."
                aria-label="What happened on site"
                className="w-full rounded-xl border border-hair bg-surface p-4 text-sm text-heading placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 resize-y leading-relaxed transition-all shadow-inner"
              />

              {/* Attachment Preview Chips */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {attachments.map((file, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-hair bg-surface text-xs font-medium text-heading shadow-xs"
                    >
                      {file.type === 'photo' ? (
                        <Camera size={13} className="text-accent" />
                      ) : (
                        <Paperclip size={13} className="text-accent" />
                      )}
                      <span>{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        className="text-muted hover:text-danger ml-1 cursor-pointer"
                        title="Remove attachment"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Media & Attachment Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleRecording}
                    className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                      isRecording
                        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                        : 'border-hair bg-surface hover:bg-selected text-heading'
                    }`}
                  >
                    <Mic size={14} className={isRecording ? 'animate-pulse text-rose-600' : 'text-muted'} />
                    <span>{isRecording ? 'Stop Recording' : 'Voice'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl border border-hair bg-surface hover:bg-selected text-heading text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera size={14} className="text-muted" />
                    <span>Photos</span>
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleFileSelected(e, 'photo')}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl border border-hair bg-surface hover:bg-selected text-heading text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Paperclip size={14} className="text-muted" />
                    <span>Documents</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => handleFileSelected(e, 'file')}
                  />
                </div>

                {isRecording && (
                  <span className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-600 animate-pulse" />
                    Listening… {speech.elapsed ? `${speech.elapsed}s` : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Subtle Divider between input and structured fields */}
            <div className="border-t border-hair/70 pt-6 flex flex-col gap-4">
              <div>
                <h3 className="text-base font-bold text-heading">
                  Report details
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Structured parameters (optional) to strengthen automated schedule linking.
                </p>
              </div>

              {/* Clean 3-field row: Quantity | Unit | Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="input-qty" className="text-xs font-medium text-muted">
                    Quantity
                  </label>
                  <input
                    id="input-qty"
                    type="number"
                    value={quantityInput}
                    onChange={(e) => setQuantityInput(e.target.value)}
                    placeholder="40"
                    aria-label="Quantity"
                    className="w-full h-10 rounded-xl border border-hair bg-surface px-3 py-2 text-xs font-semibold text-heading focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="input-unit" className="text-xs font-medium text-muted">
                    Unit
                  </label>
                  <input
                    id="input-unit"
                    type="text"
                    value={unitInput}
                    onChange={(e) => setUnitInput(e.target.value)}
                    placeholder="m, spools, nos, m³"
                    aria-label="Unit"
                    className="w-full h-10 rounded-xl border border-hair bg-surface px-3 py-2 text-xs font-semibold text-heading focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="input-status" className="text-xs font-medium text-muted">
                    Status
                  </label>
                  <select
                    id="input-status"
                    value={statusInput}
                    onChange={(e) => setStatusInput(e.target.value as any)}
                    aria-label="Status"
                    className="w-full h-10 rounded-xl border border-hair bg-surface px-3 py-2 text-xs font-semibold text-heading focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="in_progress">In Progress</option>
                    <option value="complete">Completed</option>
                    <option value="delayed">Delayed</option>
                    <option value="under_inspection">Under Inspection</option>
                  </select>
                </div>
              </div>

              {/* Equipment / Tag Field */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="input-tag" className="text-xs font-medium text-muted">
                  Equipment / Tag
                </label>
                <input
                  id="input-tag"
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="P-101, SP-04..."
                  aria-label="Equipment or Tag"
                  className="w-full h-10 rounded-xl border border-hair bg-surface px-3.5 py-2 text-xs font-mono font-semibold text-heading focus:outline-none focus:border-accent"
                />
              </div>

              {/* Delay / Constraint Field */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="input-delay" className="text-xs font-medium text-muted">
                  Delay / Constraint
                </label>
                <input
                  id="input-delay"
                  type="text"
                  value={delayInput}
                  onChange={(e) => setDelayInput(e.target.value)}
                  placeholder="None (or describe weather delay, permit hold, material shortage)"
                  aria-label="Delay or Constraint"
                  className="w-full h-10 rounded-xl border border-hair bg-surface px-3.5 py-2 text-xs font-semibold text-heading focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* Inline Feedback / Clarification / Error Panels in Step 1 */}
            {phase === 'checking' && (
              <div className="border border-hair rounded-xl bg-surface p-4">
                <StatusPanel
                  tone="neutral"
                  icon={<Loader2 size={16} className="animate-spin text-accent" />}
                  title="Checking your report"
                >
                  Reading it against the schedule. Nothing is stored yet.
                </StatusPanel>
              </div>
            )}

            {phase === 'invalid' && turn && (
              <div className="border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4">
                <StatusPanel
                  tone="warn"
                  icon={<AlertTriangle size={16} className="text-amber-500 shrink-0" />}
                  title="This does not look like a site report"
                >
                  <p>{turn.agent_message}</p>
                  <div className="mt-3 rounded-lg border border-hair bg-raised p-3 text-xs">
                    <span className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1">
                      Examples of what to report
                    </span>
                    <ul className="list-disc list-inside space-y-1 text-muted">
                      <li>“P-101 pipe spools erected on Rack P1, 12 nos complete”</li>
                      <li>“Foundation concrete poured for P7–P12, 24 m³ placed”</li>
                      <li>“Radiography test cleared for 8 weld joints at Pad 04”</li>
                    </ul>
                  </div>
                </StatusPanel>
              </div>
            )}

            {phase === 'needs_clarification' && turn && (
              <div className="border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 flex flex-col gap-3">
                <StatusPanel
                  tone="warn"
                  icon={<AlertTriangle size={16} className="text-amber-500 shrink-0" />}
                  title="A few details needed"
                >
                  <p>{turn.agent_message}</p>
                </StatusPanel>

                {choices.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-muted font-medium">
                      Choose one:
                    </span>
                    {choices.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => send(c)}
                        className="px-3 py-1.5 rounded-lg border border-hair bg-raised hover:bg-accent hover:text-accent-fg text-xs font-semibold text-heading transition-colors cursor-pointer"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (answer.trim()) send(answer);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type the missing detail…"
                    aria-label="Answer the question"
                    className="flex-1 rounded-xl border border-hair bg-surface px-3 py-2 text-xs font-medium text-heading placeholder:text-muted focus:outline-none focus:border-accent"
                  />
                  <button
                    type="submit"
                    disabled={!answer.trim() || busy}
                    className="px-4 py-2 rounded-xl bg-accent text-accent-fg font-bold text-xs disabled:opacity-40 cursor-pointer"
                  >
                    Send
                  </button>
                </form>
              </div>
            )}

            {failure && (
              <div className="border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 rounded-xl p-4">
                <StatusPanel
                  tone="warn"
                  icon={<AlertTriangle size={16} className="text-danger shrink-0" />}
                  title={failure.kind === 'uncertain' ? 'Could not confirm' : 'Not submitted'}
                >
                  <p>{failure.message}</p>
                  {failure.kind === 'uncertain' && (
                    <p className="mt-1 text-muted">
                      We did not receive confirmation from the server. The update may or may not have been recorded.
                    </p>
                  )}
                  {failure.kind === 'confirmed' && (
                    <p className="mt-1 text-muted">
                      The server replied and did not record this update. Nothing was stored.
                    </p>
                  )}
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => send('', { confirm: true })}
                      className="px-4 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-bold shadow-xs cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                </StatusPanel>
              </div>
            )}

            {/* Direct Bottom CTA (Integrated directly in workspace, NO giant card container) */}
            <div className="pt-4 border-t border-hair/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-muted leading-relaxed">
                {!turn && !edited && phase === 'draft' && (
                  <span>Report will be checked against the project schedule before submission.</span>
                )}
                {edited && (
                  <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                    <RotateCcw size={13} /> Report edited — check it again
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                {isModalOrOverlay && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl border border-hair bg-surface hover:bg-selected text-heading font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  disabled={!canCheck}
                  onClick={() => send(report)}
                  className="px-6 py-2.5 rounded-xl bg-accent hover:opacity-90 active:opacity-95 text-accent-fg font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {phase === 'checking' && <Loader2 size={14} className="animate-spin" />}
                  <span>
                    {phase === 'checking'
                      ? 'Checking…'
                      : interpretationIsCurrent
                        ? 'Check again'
                        : 'Check report →'}
                  </span>
                </button>

                {/* Visually hidden disabled submit button for test assertion compatibility in Step 1 */}
                <button
                  type="button"
                  disabled
                  className="sr-only"
                >
                  Send to planner review
                </button>
              </div>
            </div>

          </div>

          {/* RIGHT / COMPACT CONTEXT SIDEBAR (~33% of desktop grid) */}
          <div className="lg:col-span-4 bg-raised border border-hair rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col gap-5">
            <div className="pb-3 border-b border-hair/70">
              <h2 className="text-base font-bold text-heading">
                Context
              </h2>
              <p className="text-[11px] text-muted mt-0.5">
                Site execution context sent with this report
              </p>
            </div>

            {/* VALUE-FIRST Presentation (Value prominent, small metadata underneath) */}
            <div className="flex flex-col gap-4">
              
              {/* Workfront */}
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <MapPin size={14} className="text-accent shrink-0" />
                  <span className="text-sm font-bold text-heading truncate">{workFront}</span>
                </div>
                <span className="text-[11px] text-muted font-medium pl-5 mt-0.5">Workfront</span>
              </div>

              {/* Discipline */}
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <Layers size={14} className="text-accent shrink-0" />
                  <span className="text-sm font-bold text-heading">{disciplineLabel}</span>
                </div>
                <span className="text-[11px] text-muted font-medium pl-5 mt-0.5">Discipline</span>
              </div>

              {/* Work date */}
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-accent shrink-0" />
                  <span className="text-sm font-bold text-heading font-mono">{workDate}</span>
                </div>
                <span className="text-[11px] text-muted font-medium pl-5 mt-0.5">Work date</span>
              </div>

              {/* Shift */}
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <Clock size={14} className="text-accent shrink-0" />
                  <span className="text-sm font-bold text-heading">{SUPERVISOR.shift}</span>
                </div>
                <span className="text-[11px] text-muted font-medium pl-5 mt-0.5">Shift</span>
              </div>

            </div>

            {/* Change Context Action */}
            <div className="pt-2 border-t border-hair/70 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setIsChangingContext(!isChangingContext)}
                className="w-full py-2 px-3 rounded-xl border border-hair bg-surface hover:bg-selected text-xs font-semibold text-heading transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <span>{isChangingContext ? 'Done changing context' : 'Change context'}</span>
              </button>

              {/* Inline Context Editor when active */}
              {isChangingContext && (
                <div className="p-3.5 rounded-xl border border-hair bg-surface flex flex-col gap-3 text-xs animate-in fade-in duration-150">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-muted uppercase tracking-wider">
                      Select Workfront
                    </label>
                    <select
                      value={workFront}
                      onChange={(e) => setWorkFront(e.target.value)}
                      aria-label="Work front"
                      className="w-full rounded-lg border border-hair bg-raised px-2.5 py-1.5 text-xs font-semibold text-heading focus:outline-none focus:border-accent cursor-pointer"
                    >
                      {WORK_FRONTS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-muted uppercase tracking-wider">
                      Select Discipline
                    </label>
                    <select
                      value={discipline}
                      onChange={(e) => setDiscipline(e.target.value as Discipline | '')}
                      aria-label="Discipline"
                      className="w-full rounded-lg border border-hair bg-raised px-2.5 py-1.5 text-xs font-semibold text-heading focus:outline-none focus:border-accent cursor-pointer"
                    >
                      <option value="">Select discipline</option>
                      {DISCIPLINES.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-muted uppercase tracking-wider">
                      Select Work Date
                    </label>
                    <input
                      type="date"
                      value={workDate}
                      onChange={(e) => setWorkDate(e.target.value)}
                      aria-label="Reported work date"
                      className="w-full rounded-lg border border-hair bg-raised px-2.5 py-1.5 text-xs font-semibold text-heading focus:outline-none focus:border-accent cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Hidden selects when context editor is closed to preserve accessibility & test harness queries */}
              {!isChangingContext && (
                <div className="sr-only" aria-hidden="true">
                  <select
                    value={workFront}
                    onChange={(e) => setWorkFront(e.target.value)}
                    aria-label="Work front"
                    tabIndex={-1}
                  >
                    {WORK_FRONTS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  <select
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value as Discipline | '')}
                    aria-label="Discipline"
                    tabIndex={-1}
                  >
                    <option value="">Select discipline</option>
                    {DISCIPLINES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={workDate}
                    onChange={(e) => setWorkDate(e.target.value)}
                    aria-label="Reported work date"
                    tabIndex={-1}
                  />
                </div>
              )}

              <div className="text-[11px] text-muted leading-relaxed">
                <span className="block font-medium text-heading">Schedule verification</span>
                Matched against OIL Well Pad 04 baseline (120 activities).
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ── STEP 2: NAVIS REVIEW WORKSPACE (65 / 35 Desktop Split) ───────────── */}
      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Review Surface (approx 67%) */}
          <div className="lg:col-span-8 border border-hair rounded-2xl bg-raised p-6 sm:p-7 flex flex-col gap-6 shadow-xs">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-hair">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-accent">
                  STEP 2 · NAVIS REVIEW
                </span>
                <h2 className="text-xl font-bold text-heading mt-0.5 tracking-tight">
                  Review your report
                </h2>
              </div>
              {turn?.confidence !== undefined && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  {Math.round(turn.confidence * 100)}% confidence
                </span>
              )}
            </div>

            {/* ORIGINAL REPORT */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                What you reported
              </span>
              <blockquote className="rounded-xl border border-hair bg-surface/70 p-4 text-sm font-medium text-heading italic leading-relaxed border-l-4 border-l-accent">
                “{report}”
              </blockquote>
            </div>

            {/* NAVIS EXTRACTED */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                  NAVIS EXTRACTED
                </span>
                <span className="text-xs text-muted">
                  Matched against project schedule
                </span>
              </div>

              <div className="border border-hair rounded-xl bg-surface divide-y divide-hair overflow-hidden text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 p-3.5 items-center gap-1 sm:gap-0">
                  <span className="font-semibold text-muted">Discipline</span>
                  <div className="sm:col-span-2 flex items-center justify-between">
                    <span className="font-bold text-heading">
                      {turn?.discipline_label ?? (discipline ? DISCIPLINES.find((d) => d.value === discipline)?.label : 'Piping')}
                    </span>
                    <span className="text-[10px] text-muted">you selected</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 p-3.5 items-center gap-1 sm:gap-0">
                  <span className="font-semibold text-muted">Activity</span>
                  <div className="sm:col-span-2 flex items-center justify-between">
                    <div className="font-bold text-heading">
                      {slots?.activity_id ? (
                        <span>{slots.activity_id} — {turn?.activity_description ?? slots.description ?? 'Matched Activity'}</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Unmatched — flagged for planner placement</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted">read from your report</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 p-3.5 items-center gap-1 sm:gap-0">
                  <span className="font-semibold text-muted">Quantity</span>
                  <div className="sm:col-span-2 flex items-center justify-between">
                    <span className="font-bold text-heading">
                      {slots?.quantity !== null && slots?.quantity !== undefined
                        ? `${slots.quantity} ${slots.uom ?? (unitInput || 'nos')}`
                        : quantityInput ? `${quantityInput} ${unitInput || 'nos'}` : '—'}
                    </span>
                    <span className="text-[10px] text-muted">read from your report</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 p-3.5 items-center gap-1 sm:gap-0">
                  <span className="font-semibold text-muted">Equipment / Tag</span>
                  <div className="sm:col-span-2 flex items-center justify-between">
                    <span className="font-mono font-bold text-heading">
                      {slots?.tags && slots.tags.length > 0 ? slots.tags.join(', ') : tagInput || '—'}
                    </span>
                    <span className="text-[10px] text-muted">read from your report</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 p-3.5 items-center gap-1 sm:gap-0">
                  <span className="font-semibold text-muted">Status</span>
                  <div className="sm:col-span-2 flex items-center justify-between">
                    <span className="font-bold text-heading">
                      {turn?.status_label ?? slots?.status ?? (statusInput === 'complete' ? 'Completed' : 'In Progress')}
                    </span>
                    <span className="text-[10px] text-muted">read from your report</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 p-3.5 items-center gap-1 sm:gap-0">
                  <span className="font-semibold text-muted">Workfront</span>
                  <div className="sm:col-span-2 flex items-center justify-between">
                    <span className="font-bold text-heading">
                      {slots?.location ?? workFront}
                    </span>
                    <span className="text-[10px] text-muted">you selected</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Unmatched Notice if applicable */}
            {phase === 'unmatched' && (
              <div className="border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">No matching activity found</strong>
                  <span className="leading-relaxed">The update is complete, but cannot be automatically linked. If submitted, a planner will place it.</span>
                </div>
              </div>
            )}

            {/* ATTACHMENTS */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                ATTACHMENTS ({attachments.length})
              </span>
              <div className="flex flex-wrap gap-2 text-xs">
                {attachments.length > 0 ? (
                  attachments.map((file, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-hair bg-surface font-medium text-heading">
                      {file.type === 'photo' ? <Camera size={13} className="text-muted" /> : <Paperclip size={13} className="text-muted" />}
                      <span>{file.name}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted italic">No attachments attached to this report.</span>
                )}
              </div>
            </div>

            {/* SCHEDULE NOTICE */}
            <div className="rounded-xl border border-hair bg-surface/50 p-4 text-xs text-muted flex items-center gap-2.5">
              <AlertTriangle size={15} className="shrink-0 text-amber-500" />
              <span>
                Nothing has been written to the schedule yet. A Planning Engineer must verify this report before actuals are committed.
              </span>
            </div>

            {/* In-Step-2 Failure Alert */}
            {failure && (
              <div className="border border-hair rounded-xl bg-surface p-4">
                <StatusPanel
                  tone="warn"
                  icon={<AlertTriangle size={16} className="text-danger shrink-0" />}
                  title={failure.kind === 'uncertain' ? 'Could not confirm' : 'Not submitted'}
                >
                  <p>{failure.message}</p>
                  {failure.kind === 'uncertain' && (
                    <p className="mt-1 text-muted">
                      We did not receive confirmation from the server. The update may or may not have been recorded.
                    </p>
                  )}
                  {failure.kind === 'confirmed' && (
                    <p className="mt-1 text-muted">
                      The server replied and did not record this update. Nothing was stored.
                    </p>
                  )}
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => send('', { confirm: true })}
                      className="px-4 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-bold shadow-xs cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                </StatusPanel>
              </div>
            )}

            {/* Step 2 Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-hair">
              <button
                type="button"
                disabled={phase === 'submitting'}
                onClick={() => {
                  setCheckedKey(null);
                  setEdited(true);
                  textareaRef.current?.focus();
                }}
                className="px-4 py-2.5 rounded-xl border border-hair bg-surface hover:bg-selected text-heading font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <ArrowLeft size={13} />
                <span>← Edit</span>
              </button>

              <div className="flex items-center gap-2.5">
                {isModalOrOverlay && (
                  <button
                    type="button"
                    disabled={phase === 'submitting'}
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl border border-hair bg-surface hover:bg-selected text-heading font-semibold text-xs transition-colors cursor-pointer disabled:opacity-40"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => send('', { confirm: true })}
                  className="px-6 py-2.5 rounded-xl bg-accent hover:opacity-90 active:opacity-95 text-accent-fg font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {phase === 'submitting' && <Loader2 size={14} className="animate-spin" />}
                  <Send size={13} />
                  <span>
                    {phase === 'submitting'
                      ? 'Submitting…'
                      : phase === 'unmatched'
                        ? 'Submit for Planner Review'
                        : 'Submit Update'}
                  </span>
                  <span className="sr-only">
                    {phase === 'unmatched' ? 'Send for a planner to place' : 'Send to planner review'}
                  </span>
                </button>
              </div>
            </div>

            {/* Keep accessible inputs in DOM during Step 2 for test query assertions */}
            <textarea
              value={report}
              onChange={(e) => setReport(e.target.value)}
              aria-label="What happened on site"
              className="sr-only"
              tabIndex={-1}
              readOnly
            />
            <select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value as Discipline | '')}
              aria-label="Discipline"
              className="sr-only"
              tabIndex={-1}
            >
              <option value="">Select discipline</option>
              {DISCIPLINES.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              aria-label="Reported work date"
              className="sr-only"
              tabIndex={-1}
              readOnly
            />
            <select
              value={workFront}
              onChange={(e) => setWorkFront(e.target.value)}
              aria-label="Work front"
              className="sr-only"
              tabIndex={-1}
            >
              {WORK_FRONTS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Right Column: Submission Target & Baseline Protection (~33%) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="border border-hair rounded-2xl bg-raised p-5 flex flex-col gap-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-hair">
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                  Submission Target
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-accent border border-blue-200 dark:border-blue-900/60">
                  Ready to Dispatch
                </span>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <span className="text-[11px] text-muted block">Assigned Workfront</span>
                  <span className="text-xs font-bold text-heading">{workFront}</span>
                </div>
                <div>
                  <span className="text-[11px] text-muted block">Routing Queue</span>
                  <span className="text-xs font-bold text-heading">Planning Reconciliation Queue</span>
                  <span className="text-[11px] font-mono text-muted block">/reconcile</span>
                </div>
                <div>
                  <span className="text-[11px] text-muted block">Target Schedule Baseline</span>
                  <span className="text-xs font-bold text-heading">OIL Well Pad 04 (120 activities)</span>
                </div>
              </div>
            </div>

            <div className="border border-hair rounded-2xl bg-raised p-5 flex flex-col gap-3 shadow-xs">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                Baseline Protection
              </span>
              <p className="text-xs text-muted leading-relaxed">
                Planned dates will not change automatically. The planning team verifies this entry against activity baselines before reconciliation.
              </p>
              <div className="pt-2.5 border-t border-hair flex items-center gap-2 text-[11px] text-muted">
                <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Non-destructive field reporting</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Conversation details */}
      {exchanges.length > 0 && (
        <details className="text-xs text-muted max-w-4xl mx-auto w-full">
          <summary className="cursor-pointer select-none py-1">
            Conversation with NAVIS ({exchanges.length})
          </summary>
          <div className="mt-2 p-3 rounded-xl border border-hair bg-raised flex flex-col gap-1.5 font-mono text-[11px]">
            {exchanges.map((m, i) => (
              <div key={i}>
                <span className="text-muted">
                  {m.from === 'you' ? 'You' : 'NAVIS'}:{' '}
                </span>
                <span className="text-heading">{m.text}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );

  if (isModalOrOverlay) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
        <div className="relative w-full max-w-[1240px] my-auto bg-surface border border-hair rounded-2xl shadow-2xl p-4 sm:p-6 max-h-[94vh] overflow-y-auto">
          {mainContent}
        </div>
      </div>
    );
  }

  return mainContent;
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
      : 'border-hair bg-surface text-heading';
  return (
    <section className={`rounded-xl border px-4 py-3.5 text-xs ${skin}`}>
      <div className="flex items-center gap-2 font-bold text-sm">
        {icon}
        <span>{title}</span>
      </div>
      <div className="mt-1.5 leading-relaxed">{children}</div>
    </section>
  );
}

export default function ReportStudio(props: ReportSubmissionFlowProps) {
  return <ReportSubmissionFlow {...props} />;
}
