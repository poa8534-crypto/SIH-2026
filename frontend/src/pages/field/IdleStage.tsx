import React from 'react';
import { Link } from 'react-router-dom';
import {
  Mic,
  ShieldCheck,
  MessageSquare,
  Wrench,
  Truck,
  AlertTriangle,
  Bot,
  CheckCircle2
} from 'lucide-react';
import { NeedsYourResponse, RecentUpdates } from '../../components/FieldContextBlocks';

export function IdleStage({
  fallback,
  onStart,
  textInput,
  serverError,
  contextBlock,
}: {
  /** The mic-unavailable or not-understood panel, when one applies. */
  fallback: React.ReactNode;
  onStart: () => void;
  textInput: React.ReactNode;
  serverError: React.ReactNode;
  contextBlock: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-[920px] mx-auto py-6 px-4 sm:px-6 flex flex-col gap-6">
      {/* Centered Top Heading Card */}
      <div className="text-center flex flex-col items-center">
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-900 text-blue-700 dark:text-blue-300 font-mono text-[11px] font-bold uppercase tracking-wider mb-4 shadow-xs">
          <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
          FIELD VOICE OS · GOOD AFTERNOON, J. GOGOI
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          What happened on site today?
        </h1>
        <p className="mt-2 text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-xl">
          Dictate or note down work log, deliveries, inspections, and blockages.
        </p>
      </div>

      {fallback ?? (
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 bg-white dark:bg-slate-900 shadow-sm flex flex-col items-center gap-6 text-center">
          <button
            type="button"
            onClick={onStart}
            className="group w-full max-w-md py-4 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer"
          >
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Mic size={20} />
            </div>
            <div className="flex flex-col text-left">
              <span className="leading-tight">Tap &amp; Speak</span>
              <span className="text-[11px] font-normal text-blue-100">
                Describe what happened on site
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Structured Text Input Component */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-slate-900 shadow-sm">
        {textInput}
      </div>

      {serverError}
      {contextBlock}

      {/* 4 Quick Action Cards in 2x2 Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <Link
          to="/field/clarifications"
          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 dark:hover:border-blue-500 transition-all flex items-center justify-between gap-3 group shadow-xs"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <MessageSquare size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">
                Answer planner queries
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Pre-baseline technical holds
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-mono text-[10px] font-bold shrink-0">
            2 urgent
          </span>
        </Link>

        <Link
          to="/field/report"
          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 dark:hover:border-blue-500 transition-all flex items-center gap-3 group shadow-xs"
        >
          <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Wrench size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">
              Report Rig Mod 12 progress
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Verify spool erection &amp; torque logs
            </div>
          </div>
        </Link>

        <Link
          to="/field/reports"
          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 dark:hover:border-blue-500 transition-all flex items-center gap-3 group shadow-xs"
        >
          <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Truck size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">
              Log materials &amp; deliveries
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Pipe spools, valves &amp; fittings
            </div>
          </div>
        </Link>

        <Link
          to="/field"
          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 dark:hover:border-blue-500 transition-all flex items-center gap-3 group shadow-xs"
        >
          <div className="h-10 w-10 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">
              Flag site delay / weather hold
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Monsoon shutdown &amp; equipment hold
            </div>
          </div>
        </Link>
      </div>

      <NeedsYourResponse />
      <RecentUpdates />

      {/* Footer Disclaimer & Assistant Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200/80 dark:border-slate-800 text-xs text-slate-500">
        <p className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-blue-600 shrink-0" />
          <span>Every submitted update requires Planning Engineer confirmation before schedule changes.</span>
        </p>

        <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Field Update Assistant | ONLINE
        </div>
      </div>
    </div>
  );
}
