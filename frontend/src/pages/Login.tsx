import React, { useState } from 'react';
import { HardHat, ClipboardCheck, LineChart, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';
import { ROLE_PROFILES, type Role } from '../lib/role';

interface LoginProps {
  onPick: (role: Role) => void;
}

interface RoleCardData {
  id: Role;
  category: string;
  title: string;
  description: string;
  meta: string;
  icon: typeof HardHat;
}

const ROLES_DATA: RoleCardData[] = [
  {
    id: 'field',
    category: 'SITE CAPTURE & MOBILE',
    title: 'Field Supervisor',
    description: 'Report site progress and answer planner questions.',
    meta: 'ACTIVE SITE: RIG PAD-04 · 2 PENDING QUESTIONS',
    icon: HardHat,
  },
  {
    id: 'planner',
    category: 'CONTROLS & SCHEDULING',
    title: 'Planner / Project Manager',
    description: 'Review evidence and manage the project schedule.',
    meta: 'BASELINE: PRIMAVERA P6 REV-08 · 3 ITEMS PENDING REVIEW',
    icon: ClipboardCheck,
  },
  {
    id: 'executive',
    category: 'EXECUTIVE OVERSIGHT',
    title: 'Senior Management',
    description: 'Understand schedule exposure and evidence coverage.',
    meta: 'PORTFOLIO: SECTOR 04 · EARNED VALUE & FLOAT VARIANCE',
    icon: LineChart,
  },
];

export default function Login({ onPick }: LoginProps) {
  const [selected, setSelected] = useState<Role>('planner');

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] dark:bg-[#0b0f19] text-slate-800 dark:text-slate-200 font-sans flex flex-col justify-between p-6 sm:p-10">
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-[1240px] bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
          
          {/* Left Column: Progress Intel & Live Sync Telemetry */}
          <div className="lg:col-span-7 p-8 sm:p-12 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-200/80 dark:border-slate-800/80 bg-gradient-to-br from-white to-slate-50/50 dark:from-[#111827] dark:to-[#0f172a]/50">
            <div>
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white font-mono text-[11px] font-semibold tracking-wider uppercase shadow-sm">
                Progress Intel
              </div>

              {/* Title & Subtitle */}
              <h1 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
                Field reality. Verified against the plan.
              </h1>
              <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
                NAVIS bridges what actually happens in the field with the Primavera P6 schedule baseline — every voice log, photo and quantity reconciled against the activity it belongs to.
              </p>

              {/* Live Synchronization Telemetry Card */}
              <div className="mt-8 border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white/70 dark:bg-slate-900/60 shadow-sm backdrop-blur-sm">
                {/* Card Header */}
                <div className="flex items-center justify-between font-mono text-[11px] text-slate-500 dark:text-slate-400 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-bold tracking-wider text-slate-700 dark:text-slate-300">
                    SYNCHRONIZATION // PIPELINE_04A
                  </span>
                  <span className="tracking-wide">
                    LATENCY: 18MS · COORD: 27°29&apos;N 95°18&apos;E
                  </span>
                </div>

                {/* Dual Node Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-11 items-center gap-3 my-4">
                  {/* Node 1: In-Field */}
                  <div className="md:col-span-5 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 bg-slate-50/50 dark:bg-slate-800/40">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                      <Zap size={12} className="text-amber-500" />
                      NODE_01: IN-FIELD / VOICE LOG #1884
                    </div>
                    <div className="mt-2 text-xs sm:text-sm font-medium italic text-slate-900 dark:text-slate-100 line-clamp-2">
                      &ldquo;Pad-04 concrete cure verified. Rebar inspection signed.&rdquo;
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[10px] font-semibold">
                        VOL: +3.2%
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[10px] font-semibold">
                        GPS PAD-04
                      </span>
                    </div>
                  </div>

                  {/* Connector: Verified Variance */}
                  <div className="md:col-span-1 flex flex-col items-center justify-center my-1 md:my-0">
                    <span className="font-mono text-[8px] font-extrabold text-blue-600 dark:text-blue-400 tracking-wider text-center uppercase leading-tight">
                      VERIFIED<br />VARIANCE
                    </span>
                    <div className="w-8 border-t-2 border-dashed border-blue-400 dark:border-blue-500 mt-1 hidden md:block" />
                  </div>

                  {/* Node 2: P6 Baseline */}
                  <div className="md:col-span-5 border border-blue-200 dark:border-blue-900/50 rounded-lg p-3.5 bg-blue-50/30 dark:bg-blue-950/20">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                      <CheckCircle2 size={12} className="text-blue-600 dark:text-blue-400" />
                      P6 BASELINE // REV-08
                    </div>
                    <div className="mt-2 text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                      ACT-4100 Concrete Po...
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Early Finish: Synchronized (0.0d Float Variance)
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 font-mono text-[10px] font-semibold">
                        EARNED VALUE: 100%
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 font-mono text-[10px] font-semibold">
                        P6 TD: W-09
                      </span>
                    </div>
                  </div>
                </div>

                {/* Buffer Integrity Progress */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between font-mono text-[10px] text-slate-500 dark:text-slate-400 mb-1.5">
                    <span className="font-semibold uppercase tracking-wider">
                      WBS 04.02.01 SCHEDULING BUFFER INTEGRITY
                    </span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      98.4% NOMINAL ALIGNMENT
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: '98.4%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Telemetry Status */}
            <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-slate-500">
              <span>ENGINE: NAVIS-CORE V4.8 · ORACLE P6 COMPATIBLE</span>
              <span className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Continuous Telemetry Stream Live
              </span>
            </div>
          </div>

          {/* Right Column: Demo Workspace Selector */}
          <div className="lg:col-span-5 p-8 sm:p-10 flex flex-col justify-between bg-white dark:bg-[#111827]">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Choose your demo workspace
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Choose the role you want to see the project as. Select your operational role to enter the synchronized site environment.
              </p>

              {/* Radio Selection Cards */}
              <div className="mt-6 flex flex-col gap-3">
                {ROLES_DATA.map((item) => {
                  const isSelected = selected === item.id;
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelected(item.id)}
                      onDoubleClick={() => onPick(item.id)}
                      className={`relative cursor-pointer rounded-xl p-4 transition-all duration-150 border text-left ${
                        isSelected
                          ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/20 dark:bg-blue-950/20 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="block font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            {item.category}
                          </span>
                          <div className="flex items-center gap-2">
                            <Icon
                              size={17}
                              className={`shrink-0 ${
                                isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'
                              }`}
                            />
                            <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
                              {item.title}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {item.description}
                          </p>
                          <div className="mt-2.5 font-mono text-[10px] text-slate-400 uppercase tracking-tight">
                            {item.meta}
                          </div>
                        </div>

                        {/* Custom Radio Button */}
                        <div
                          className={`h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'border-blue-600 bg-blue-600'
                              : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                          }`}
                        >
                          {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Enter Workspace Button */}
              <button
                type="button"
                onClick={() => onPick(selected)}
                className="mt-6 w-full py-3.5 px-5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl shadow-sm hover:shadow transition-all duration-150 text-sm flex items-center justify-center gap-2 group cursor-pointer"
              >
                <span>Enter workspace</span>
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-1"
                />
              </button>
            </div>

            {/* Footnote */}
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
              <div className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                DEMO ACCESS PROFILES
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                No credentials required — every profile runs on the same sandboxed site dataset.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Bar Indicator */}
      <div className="max-w-[1240px] w-full mx-auto mt-4 px-2 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span>READ-WRITE SANDBOX</span>
        <span>SIH 2026 // NATIONAL FINALS CANDIDATE</span>
      </div>
    </div>
  );
}
