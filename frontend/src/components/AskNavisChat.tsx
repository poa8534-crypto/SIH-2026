import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Bot,
  X,
  Send,
  Sparkles,
  RotateCcw,
  Copy,
  Check,
  ExternalLink,
  PlusCircle,
  AlertCircle,
} from 'lucide-react';
import { api, errorDetail } from '../lib/api';
import type { ChatAction, ChatResponse } from '../types';
import { Button } from './ui';

interface Message {
  id: string;
  from: 'user' | 'navis';
  text: string;
  citations?: string[];
  actions?: ChatAction[];
  at: string;
}

interface AskNavisChatProps {
  isOpen: boolean;
  onClose: () => void;
  role: 'field' | 'planner' | 'executive';
  onInsertDraft?: (text: string) => void;
}

const STARTER_PROMPTS: Record<string, string[]> = {
  field: [
    'How do I report spool erection?',
    'What was the status of my last report?',
    'Do I have any clarifications from the planner?',
    'How to report rain delay or weather hold?',
  ],
  planner: [
    'Why did NAVIS link the report to this activity?',
    'Which activities are driving the critical path variance?',
    'What is our historical productivity for piping?',
    'Show top delay reasons across the project',
  ],
  executive: [
    'What is our projected completion date?',
    'Where is our biggest exposure right now?',
    'How reliable is our progress data?',
    'Summarize current schedule performance',
  ],
};

const EXECUTIVE_DESTINATION_PROMPTS: Record<string, string[]> = {
  '/executive/milestones': [
    'Which commitments are likely to slip beyond contract date?',
    'What is the driving predecessor for the Piping milestone?',
    'Are there any contractual milestones slipping?',
    'Explain the total float on Civil scope complete',
  ],
  '/executive/progress': [
    'Which discipline has the lowest schedule performance index?',
    'Explain the difference between activity counts and earned value',
    'How many unevidenced activities are in progress?',
    'Show cumulative earned value vs planned value',
  ],
  '/executive/risks': [
    'What are our top 3 accepted RAID exposure risks?',
    'Summarize contractor delay notices under FIDIC 20.1',
    'How many days of employer delay are currently claimable?',
    'Are there any active source telemetry conflicts?',
  ],
  '/executive/forecasts': [
    'Explain the logic-driven completion finish vs baseline finish',
    'Which critical path activities drive the logic finish date?',
    'What happens to the finish date if monsoon delay increases by 10 days?',
    'Is the completion forecast based on Monte Carlo simulation?',
  ],
  '/executive/insights': [
    'Which trades are systematically exceeding planned durations?',
    'What is the most frequent delay cause recorded across field notes?',
    'Which activity types have low sample size warnings?',
    'How does actual piping duration compare to planned duration?',
  ],
  '/executive/reports': [
    "Draft an executive summary for today's review meeting",
    'What are the key data confidence caveats to mention?',
    'Summarize milestone slippages for the board review',
    'List open contractor delay notices for review',
  ],
  '/executive/confidence': [
    'What is our reporting evidence coverage percentage and denominator?',
    'Which in-progress activities are stale (> 7 days without update)?',
    'Are there conflicting progress claims between drone and field logs?',
    'How is the offline research corpus separated from live project data?',
  ],
  '/executive': [
    'What is our projected completion date?',
    'Where is our biggest exposure right now?',
    'How reliable is our progress data?',
    'Summarize current schedule performance',
  ],
};

export function AskNavisChat({
  isOpen,
  onClose,
  role,
  onInsertDraft,
}: AskNavisChatProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  /**
   * Focus moves in on open and BACK OUT on close.
   *
   * Without the second half, dismissing the panel drops focus onto the
   * document body: a keyboard or screen-reader user is returned to the top of
   * the page rather than to the "Ask NAVIS" button they opened it from, and
   * the reporting form they were part-way through is several tab stops away.
   * The element that had focus when the panel opened is the one to restore.
   * See D-095.
   */
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (isOpen) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
    const previous = restoreFocusRef.current;
    restoreFocusRef.current = null;
    // Only if it is still in the document — the trigger may have unmounted
    // while the panel was open.
    if (previous && document.contains(previous)) previous.focus();
    return undefined;
  }, [isOpen]);

  // Scroll to bottom
  useEffect(() => {
    if (isOpen) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  /* HOOKS BEFORE THE EARLY RETURN.
   *
   * `useLocation` and this `useMemo` used to sit below `if (!isOpen) return
   * null`, so the component ran a different number of hooks open than closed.
   * React tolerates that until the panel actually toggles, and then throws
   * "Rendered more hooks than during the previous render" and tears down the
   * tree — which on the field workspace takes an in-progress report draft
   * with it. Nothing caught it because the existing tests render the panel
   * either open or closed, never both. See D-095. */
  const location = useLocation();

  const starters = useMemo(() => {
    if (role === 'executive') {
      const pathname = location.pathname;
      const matchedKey = Object.keys(EXECUTIVE_DESTINATION_PROMPTS).find((p) =>
        p === '/executive' ? pathname === '/executive' : pathname.startsWith(p)
      );
      if (matchedKey && EXECUTIVE_DESTINATION_PROMPTS[matchedKey]) {
        return EXECUTIVE_DESTINATION_PROMPTS[matchedKey];
      }
    }
    return STARTER_PROMPTS[role] ?? STARTER_PROMPTS.planner;
  }, [role, location.pathname]);

  if (!isOpen) return null;

  const clockTime = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || loading) return;

    const userMsgId = crypto.randomUUID();
    const userMsg: Message = {
      id: userMsgId,
      from: 'user',
      text: query,
      at: clockTime(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const res: ChatResponse = await api.askChat({
        question: query,
        role,
      });

      const navisMsg: Message = {
        id: crypto.randomUUID(),
        from: 'navis',
        text: res.answer,
        citations: res.citations,
        actions: res.suggested_actions,
        at: clockTime(),
      };

      setMessages((prev) => [...prev, navisMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        from: 'navis',
        text: `Unable to reach conversational assistant: ${errorDetail(err)}. Local deterministic project data is still active in your workspace.`,
        citations: [],
        at: clockTime(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAction = (action: ChatAction) => {
    if (action.type === 'insert_draft' && action.text) {
      if (onInsertDraft) {
        onInsertDraft(action.text);
      } else {
        // Fallback: copy to clipboard and navigate to report studio
        navigator.clipboard.writeText(action.text);
        navigate('/field/report');
      }
      onClose();
    } else if (action.type === 'link' && action.url) {
      navigate(action.url);
      onClose();
    }
  };


  return (
    <div
      role="dialog"
      aria-label="Ask NAVIS Assistant"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px] transition-opacity duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-full sm:max-w-md md:max-w-[460px] h-full bg-surface border-l border-hair flex flex-col shadow-2xl animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 shrink-0 px-4 border-b border-hair flex items-center justify-between bg-raised">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-fg text-surface flex items-center justify-center font-bold text-label shadow-xs">
              <Bot size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-body font-semibold text-heading leading-none">
                  Ask NAVIS
                </h2>
                <span className="px-1.5 py-0.5 rounded bg-surface border border-hair text-[10px] font-mono uppercase text-muted">
                  {role}
                </span>
              </div>
              <p className="text-[11px] text-muted leading-tight mt-0.5">
                Read-only grounded assistant
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="icon"
                size="sm"
                onClick={() => setMessages([])}
                title="Clear conversation"
              >
                <RotateCcw size={15} />
              </Button>
            )}
            <Button
              variant="icon"
              size="sm"
              onClick={onClose}
              title="Close panel (Esc)"
              aria-label="Close Ask NAVIS"
            >
              <X size={18} />
            </Button>
          </div>
        </div>

        {/* Content Thread */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-xs font-sans">
          {messages.length === 0 ? (
            <div className="my-auto flex flex-col items-center text-center p-4">
              <div className="h-12 w-12 rounded-full bg-raised border border-hair flex items-center justify-center text-fg mb-3 shadow-xs">
                <Sparkles size={22} className="text-accent" />
              </div>
              <h3 className="text-sm font-semibold text-heading">
                How can NAVIS assist you?
              </h3>
              <p className="mt-1 text-xs text-muted max-w-xs leading-relaxed">
                Ask questions about project progress, activity lookups, delay
                causes, or draft preparation. Grounded strictly in active data.
              </p>

              <div className="mt-6 w-full flex flex-col gap-2">
                <div className="text-[10px] font-mono text-muted uppercase tracking-wider text-left pl-1">
                  Suggested inquiries
                </div>
                {starters.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="p-2.5 rounded-lg border border-hair bg-raised hover:bg-selected text-left text-xs text-fg transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <span>{prompt}</span>
                    <Send
                      size={12}
                      className="text-muted group-hover:text-fg shrink-0 ml-2 transition-colors opacity-60 group-hover:opacity-100"
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.from === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    isUser ? 'items-end self-end' : 'items-start self-start'
                  } max-w-[92%]`}
                >
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] font-mono text-muted">
                    <span>{isUser ? 'You' : 'NAVIS'}</span>
                    <span>·</span>
                    <span>{msg.at}</span>
                  </div>

                  <div
                    className={`rounded-xl p-3.5 leading-relaxed text-xs ${
                      isUser
                        ? 'bg-fg text-surface font-medium shadow-xs'
                        : 'bg-raised border border-hair text-fg shadow-xs'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.text}</div>

                    {/* Citations */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-hair/60 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono text-muted uppercase">
                          Sources:
                        </span>
                        {msg.citations.map((c, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded bg-surface border border-hair font-mono text-[10px] text-muted font-medium"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-hair/60 flex flex-wrap gap-2">
                        {msg.actions.map((act, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleAction(act)}
                            className="px-2.5 py-1.5 rounded-md bg-surface hover:bg-selected border border-hair text-heading text-[11px] font-medium transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            {act.type === 'insert_draft' ? (
                              <PlusCircle size={13} className="text-ok" />
                            ) : (
                              <ExternalLink size={13} className="text-accent" />
                            )}
                            <span>{act.label}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Copy Control for NAVIS messages */}
                    {!isUser && (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.text, msg.id)}
                          className="flex items-center gap-1 text-[10px] text-muted hover:text-fg transition-colors"
                          title="Copy text"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check size={11} className="text-ok" />
                              <span className="text-ok">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={11} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {loading && (
            <div className="flex flex-col items-start self-start max-w-[90%]">
              <div className="flex items-center gap-1.5 mb-1 text-[10px] font-mono text-muted">
                <span>NAVIS</span>
                <span>·</span>
                <span>Thinking…</span>
              </div>
              <div className="rounded-xl p-3.5 bg-raised border border-hair text-muted flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
                <span>Retrieving project data…</span>
              </div>
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {/* Read-Only Disclaimer */}
        <div className="px-4 py-1.5 bg-surface border-t border-hair/60 flex items-center gap-1.5 text-[10px] text-muted">
          <AlertCircle size={11} className="text-muted shrink-0" />
          <span>
            Read-only assistant. NAVIS never modifies baseline or actuals
            without human confirmation.
          </span>
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3 border-t border-hair bg-raised flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about ${role === 'field' ? 'reporting, work status...' : role === 'planner' ? 'delays, activities, matching...' : 'progress, exposure, forecast...'} `}
            disabled={loading}
            className="flex-1 rounded-md border border-hair bg-surface px-3 py-2 text-xs text-fg placeholder:text-muted focus:outline-none focus:border-fg transition-colors font-sans"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="h-8 px-3 rounded-md bg-fg text-surface font-medium text-xs shadow-xs transition-opacity hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            <Send size={13} />
            <span className="hidden sm:inline">Ask</span>
          </button>
        </form>
      </div>
    </div>
  );
}
