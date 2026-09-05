import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Mic,
  ShieldCheck,
  MessageSquare,
  Wrench,
  Truck,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../../lib/api';
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
  const { data: clarifications } = useQuery({
    queryKey: ['clarifications', 'unanswered'],
    queryFn: () => api.getClarifications(true),
  });
  const unanswered = clarifications?.length ?? 0;

  return (
    <div className="w-full max-w-[880px] mx-auto py-6 px-4 sm:px-6 flex flex-col gap-6">
      {/* Centered Top Heading */}
      <div className="text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface border border-hair text-muted font-mono text-[11px] font-medium uppercase tracking-wider mb-3">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          Field Voice · Sector A · Digboi Well #4
        </div>

        <h1 className="text-h1 font-semibold text-heading tracking-tight">
          What happened on site today?
        </h1>
        <p className="mt-1 text-body text-muted max-w-lg leading-relaxed">
          Dictate or record progress, material arrivals, inspections, and site constraints.
        </p>
      </div>

      {fallback ?? (
        <div className="border border-hair rounded-lg p-6 bg-raised shadow-xs flex flex-col items-center gap-4 text-center">
          <button
            type="button"
            onClick={onStart}
            className="w-full max-w-sm py-3.5 px-5 rounded-lg bg-fg hover:opacity-90 active:opacity-95 text-surface font-medium text-body shadow-xs transition-all flex items-center justify-center gap-3 cursor-pointer min-h-[48px]"
          >
            <div className="h-8 w-8 rounded-full bg-surface/20 flex items-center justify-center shrink-0">
              <Mic size={18} />
            </div>
            <div className="flex flex-col text-left">
              <span className="leading-tight font-semibold">Tap &amp; Speak</span>
              <span className="text-label text-surface/80">
                Describe what happened on site
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Structured Text Input Component */}
      <div className="border border-hair rounded-lg p-4 bg-raised shadow-xs">
        {textInput}
      </div>

      {serverError}
      {contextBlock}

      {/* 4 Quick Action Cards in 2x2 Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          to="/field/clarifications"
          className="p-3.5 min-h-[56px] rounded-lg border border-hair bg-raised hover:bg-selected transition-colors flex items-center justify-between gap-3 group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-md bg-surface border border-hair text-fg flex items-center justify-center shrink-0">
              <MessageSquare size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-body font-semibold text-heading leading-tight truncate">
                Answer planner queries
              </div>
              <div className="text-label text-muted truncate">
                Pre-baseline technical questions
              </div>
            </div>
          </div>
          {unanswered > 0 && (
            <span className="px-2 py-0.5 rounded-full border border-warn/30 bg-warn/10 text-warn font-mono text-[10px] font-bold shrink-0">
              {unanswered} pending
            </span>
          )}
        </Link>

        <Link
          to="/field/report"
          className="p-3.5 min-h-[56px] rounded-lg border border-hair bg-raised hover:bg-selected transition-colors flex items-center gap-3 group"
        >
          <div className="h-9 w-9 rounded-md bg-surface border border-hair text-fg flex items-center justify-center shrink-0">
            <Wrench size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-body font-semibold text-heading leading-tight truncate">
              Report work progress
            </div>
            <div className="text-label text-muted truncate">
              Erection, hydrotest &amp; installations
            </div>
          </div>
        </Link>

        <Link
          to="/field/report"
          className="p-3.5 min-h-[56px] rounded-lg border border-hair bg-raised hover:bg-selected transition-colors flex items-center gap-3 group"
        >
          <div className="h-9 w-9 rounded-md bg-surface border border-hair text-fg flex items-center justify-center shrink-0">
            <Truck size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-body font-semibold text-heading leading-tight truncate">
              Log materials &amp; deliveries
            </div>
            <div className="text-label text-muted truncate">
              Pipe spools, valves &amp; fittings
            </div>
          </div>
        </Link>

        <Link
          to="/field/report"
          className="p-3.5 min-h-[56px] rounded-lg border border-hair bg-raised hover:bg-selected transition-colors flex items-center gap-3 group"
        >
          <div className="h-9 w-9 rounded-md bg-surface border border-hair text-fg flex items-center justify-center shrink-0">
            <AlertTriangle size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-body font-semibold text-heading leading-tight truncate">
              Flag site delay / constraint
            </div>
            <div className="text-label text-muted truncate">
              Monsoon shutdown &amp; equipment hold
            </div>
          </div>
        </Link>
      </div>

      <NeedsYourResponse />
      <RecentUpdates />

      {/* Footer Disclaimer & Assistant Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-hair text-label text-muted">
        <p className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-fg shrink-0" />
          <span>Every submitted update requires Planning Engineer confirmation before schedule changes.</span>
        </p>

        <div className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-ok">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          Field Update Assistant · Online
        </div>
      </div>
    </div>
  );
}
