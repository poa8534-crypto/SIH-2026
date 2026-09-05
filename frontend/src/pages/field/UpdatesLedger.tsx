import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FileImage,
  CheckCircle2,
  Clock,
  ArrowRight,
  Plus,
  Radio,
  Search,
  Check,
  AlertCircle
} from 'lucide-react';

interface UpdateItem {
  id: string;
  ref: string;
  logId: string;
  activityId: string;
  title: string;
  package: string;
  timestamp: string;
  submittedAt: string;
  supervisor: string;
  status: 'PENDING_REVIEW' | 'REVIEWED';
  questionsCount?: number;
  acceptedInP6?: boolean;
  rawNote: string;
  audioDuration: string;
  geoVerified: string;
  deviceId: string;
  photo: {
    name: string;
    size: string;
    description: string;
    exifTime: string;
  };
  schedule: {
    matchedActivity: string;
    wbs: string;
    wbsName: string;
    reportedWorkDate: string;
    shift: string;
    progressFrom: number;
    progressTo: number;
    equipmentTag: string;
    spec: string;
    workfront: string;
    module: string;
  };
  pendingQuestion?: {
    planner: string;
    text: string;
  };
  impact: {
    daysDelta: number;
    unlockedActivity: string;
  };
}

const SAMPLE_UPDATES: UpdateItem[] = [
  {
    id: 'up-1',
    ref: 'REF-2026-0915-0842',
    logId: 'LOG #8931',
    activityId: 'ACT-PIP-201-04',
    title: 'P-201 spool erection completed',
    package: 'Spool Erection · Piping Pkg 04',
    timestamp: 'Today, 15 Sep · 08:42 AM',
    submittedAt: '15 Sep 2026 at 08:42 AM',
    supervisor: 'J. Gogoi',
    status: 'PENDING_REVIEW',
    questionsCount: 1,
    rawNote: 'P-201 spool erection is complete.',
    audioDuration: '0:04s',
    geoVerified: 'Lat 27.3592° N, Long 95.3197° E (Well-Site Pad 04)',
    deviceId: 'iPad-Pro-FL-04',
    photo: {
      name: 'IMG_8821_joint.jpg',
      size: '2.4 MB',
      description: 'Flange joint alignment and gasket seating verification view',
      exifTime: '15-09-2026 08:39:12 IST',
    },
    schedule: {
      matchedActivity: 'Spool Erection — P-201',
      wbs: '3.2.1',
      wbsName: 'Well Pad Process Manifold Piping Subassembly',
      reportedWorkDate: '14 September 2026',
      shift: 'Shift B (06:00 - 18:00)',
      progressFrom: 85,
      progressTo: 100,
      equipmentTag: 'P-201',
      spec: 'ASTM A106 Grade B (Sch 40)',
      workfront: 'Piping Package 04',
      module: 'Rig Module 12-Hydro',
    },
    pendingQuestion: {
      planner: 'Planner M. Al-Hassan',
      text: 'Planner M. Al-Hassan flagged a technical question regarding hydrostatic pressure hold before approving the schedule milestone.',
    },
    impact: {
      daysDelta: 4,
      unlockedActivity: 'ACT-PIP-201-05 (Pre-comm Flushing)',
    },
  },
  {
    id: 'up-2',
    ref: 'REF-2026-0914-1615',
    logId: 'LOG #8930',
    activityId: 'ACT-ELE-101-08',
    title: 'Cable pulling from Substation 02 to Compressor Skid C-101',
    package: 'Cable Pulling & Termination · Electrical',
    timestamp: '14 Sep 2026 · 16:15 PM',
    submittedAt: '14 Sep 2026 at 16:15 PM',
    supervisor: 'J. Gogoi',
    status: 'REVIEWED',
    acceptedInP6: true,
    rawNote: 'Completed 450m 11kV cable pull between Substation 02 and Skid C-101. Megger insulation test passed.',
    audioDuration: '0:12s',
    geoVerified: 'Lat 27.3588° N, Long 95.3204° E (Substation 02 Trench)',
    deviceId: 'iPad-Pro-FL-04',
    photo: {
      name: 'IMG_8819_cable_tray.jpg',
      size: '3.1 MB',
      description: 'Cable ladder tray clamping and earth continuity test tags',
      exifTime: '14-09-2026 16:10:04 IST',
    },
    schedule: {
      matchedActivity: '11kV Cable Pull & Megger Test',
      wbs: '4.1.3',
      wbsName: 'Medium Voltage Power Distribution Feeders',
      reportedWorkDate: '14 September 2026',
      shift: 'Shift A (07:00 - 19:00)',
      progressFrom: 40,
      progressTo: 100,
      equipmentTag: 'FD-11KV-02',
      spec: '3C x 300 sq mm XLPE Armoured',
      workfront: 'Electrical Pkg 02',
      module: 'Compressor Yard',
    },
    impact: {
      daysDelta: 0,
      unlockedActivity: 'ACT-ELE-101-09 (Switchgear Cold Terminations)',
    },
  },
  {
    id: 'up-3',
    ref: 'REF-2026-0914-1130',
    logId: 'LOG #8928',
    activityId: 'ACT-CIV-004-12',
    title: 'Structural Foundation Pad-04 anchor bolt grouting',
    package: 'Equipment Substructure · Civil/Structural',
    timestamp: '14 Sep 2026 · 11:30 AM',
    submittedAt: '14 Sep 2026 at 11:30 AM',
    supervisor: 'J. Gogoi',
    status: 'REVIEWED',
    acceptedInP6: true,
    rawNote: 'Non-shrink epoxy grout poured for all 16 anchor bolts on Pad-04 foundation plate.',
    audioDuration: '0:08s',
    geoVerified: 'Lat 27.3595° N, Long 95.3190° E (Pad-04 Plinth)',
    deviceId: 'iPad-Pro-FL-04',
    photo: {
      name: 'IMG_8814_grouting.jpg',
      size: '2.8 MB',
      description: 'Cube test mold sampling and grout flow cone measurement view',
      exifTime: '14-09-2026 11:24:45 IST',
    },
    schedule: {
      matchedActivity: 'Anchor Bolt High-Strength Grouting',
      wbs: '2.4.2',
      wbsName: 'Heavy Compressor Pedestal Foundation',
      reportedWorkDate: '13 September 2026',
      shift: 'Shift B (06:00 - 18:00)',
      progressFrom: 60,
      progressTo: 100,
      equipmentTag: 'F-PAD-04',
      spec: 'SikaGrout 214 Free-Flowing',
      workfront: 'Civil Works 01',
      module: 'Pad 04 Plinth',
    },
    impact: {
      daysDelta: 2,
      unlockedActivity: 'ACT-CIV-004-13 (Curing & Load Handover)',
    },
  },
];

export default function UpdatesLedger() {
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'REVIEWED'>('ALL');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>('up-1');

  const filteredUpdates = useMemo(() => {
    return SAMPLE_UPDATES.filter((item) => {
      if (filter === 'PENDING' && item.status !== 'PENDING_REVIEW') return false;
      if (filter === 'REVIEWED' && item.status !== 'REVIEWED') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.activityId.toLowerCase().includes(q) ||
          item.ref.toLowerCase().includes(q) ||
          item.package.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [filter, search]);

  const selected = SAMPLE_UPDATES.find((u) => u.id === selectedId) ?? SAMPLE_UPDATES[0];

  return (
    <div className="w-full max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 font-sans">
      {/* Top Header Bar */}
      <div className="pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-2">
              <span className="font-bold text-slate-700 dark:text-slate-300">
                NAVIS // SITE-04
              </span>
              <span>/</span>
              <span>Report</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono text-[10px] font-bold uppercase">
                OIL WELL-SITE DULIAJAN
              </span>
              <span className="text-xs text-slate-500 font-medium">
                • Field Supervisor
              </span>
              <span className="text-xs text-slate-500 font-mono">
                📅 Data Date: 15 Sep 2026
              </span>
              <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Live Telemetry Linked
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              My Updates
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Audit trail of field submissions, planner verifications, and baseline schedule adjustments.
            </p>
          </div>

          <Link
            to="/field/report"
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm shadow-sm transition-all flex items-center gap-2"
          >
            <Plus size={16} />
            <span>New Report</span>
          </Link>
        </div>
      </div>

      {/* Main Master-Detail Split Grid */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Filterable List (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Search Box */}
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter updates by tag, activity..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl">
            <button
              onClick={() => setFilter('ALL')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                filter === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              All ({SAMPLE_UPDATES.length})
            </button>
            <button
              onClick={() => setFilter('PENDING')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                filter === 'PENDING'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Pending (1)
            </button>
            <button
              onClick={() => setFilter('REVIEWED')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                filter === 'REVIEWED'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Reviewed (2)
            </button>
          </div>

          {/* List Cards */}
          <div className="flex flex-col gap-2.5">
            {filteredUpdates.map((item) => {
              const isSelected = item.id === selected.id;
              const isPending = item.status === 'PENDING_REVIEW';
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`cursor-pointer rounded-xl p-4 transition-all duration-150 border text-left flex flex-col gap-2 ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/20 dark:bg-blue-950/20 shadow-sm ring-1 ring-blue-600/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
                      {item.activityId}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider ${
                        isPending
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          : 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900'
                      }`}
                    >
                      {isPending ? 'PENDING REVIEW' : 'REVIEWED'}
                    </span>
                  </div>

                  <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    {item.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {item.package}
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>{item.timestamp}</span>
                    {item.questionsCount && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 font-bold">
                        {item.questionsCount} Question
                      </span>
                    )}
                    {item.acceptedInP6 && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <Check size={12} /> Accepted in P6
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Detail Pane (8 cols) */}
        <div className="lg:col-span-8 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm flex flex-col gap-6">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="font-mono text-xs text-slate-400">
                {selected.ref} · {selected.logId}
              </div>
              <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                {selected.title}
              </h2>
              <div className="mt-1 text-xs text-slate-500 font-mono">
                Submitted by Field Supervisor <strong>{selected.supervisor}</strong> · {selected.submittedAt}
              </div>
            </div>

            <span
              className={`px-3 py-1 rounded-full font-mono text-xs font-bold uppercase tracking-wider ${
                selected.status === 'PENDING_REVIEW'
                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
              }`}
            >
              {selected.status === 'PENDING_REVIEW' ? 'PENDING REVIEW' : 'REVIEWED & ACCEPTED'}
            </span>
          </div>

          {/* Section: Submitted Field Note */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="font-bold uppercase tracking-wider">
                SUBMITTED FIELD NOTE
              </span>
              <span>Unedited Raw Input</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 font-medium italic text-slate-800 dark:text-slate-200 text-base">
              &ldquo;{selected.rawNote}&rdquo;
            </div>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                🎙 Voice note transcribed ({selected.audioDuration})
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                🌐 Geo-verified: {selected.geoVerified}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                📱 Device ID: {selected.deviceId}
              </span>
            </div>

            {/* Photo Attachment Card */}
            <div className="mt-2 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-12 w-12 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-900 shrink-0">
                  <FileImage size={24} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white truncate">
                      {selected.photo.name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {selected.photo.size}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                    {selected.photo.description}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                    📅 Exif Timestamp: {selected.photo.exifTime}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Extracted Schedule Parameters */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="font-bold uppercase tracking-wider">
                EXTRACTED SCHEDULE PARAMETERS
              </span>
              <span className="text-blue-600 dark:text-blue-400">
                ✨ AI Parsed & Entity Matched
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-white dark:bg-slate-900">
                <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Matched Activity
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono font-bold text-[11px] inline-block mb-1">
                  {selected.activityId}
                </span>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  {selected.schedule.matchedActivity}
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-white dark:bg-slate-900">
                <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  WBS Breakdown
                </span>
                <div className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                  {selected.schedule.wbs}
                </div>
                <div className="text-slate-500 text-[11px] mt-0.5">
                  {selected.schedule.wbsName}
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-white dark:bg-slate-900">
                <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Reported Work Date
                </span>
                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  📅 {selected.schedule.reportedWorkDate}
                </div>
                <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                  {selected.schedule.shift}
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Physical % Complete
                  </span>
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                    {selected.schedule.progressFrom}% → {selected.schedule.progressTo}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-blue-600 rounded-full"
                    style={{ width: `${selected.schedule.progressTo}%` }}
                  />
                </div>
                <div className="font-mono text-[10px] text-slate-400 mt-2">
                  Previous Baseline milestone: {selected.schedule.progressFrom}%
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-white dark:bg-slate-900">
                <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Equipment / Tag
                </span>
                <div className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                  {selected.schedule.equipmentTag}
                </div>
                <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                  {selected.schedule.spec}
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-white dark:bg-slate-900">
                <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Workfront / Module
                </span>
                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  {selected.schedule.workfront}
                </div>
                <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                  {selected.schedule.module}
                </div>
              </div>
            </div>
          </div>

          {/* Alert Banner: Awaiting Planner Verification */}
          {selected.pendingQuestion && (
            <div className="border border-amber-300 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-amber-900 dark:text-amber-200">
                      Awaiting Planner Verification
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-200/70 dark:bg-amber-900 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-bold uppercase">
                      ACTION PENDING
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    {selected.pendingQuestion.text}
                  </p>
                </div>
              </div>

              <Link
                to="/field/clarifications"
                className="shrink-0 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5"
              >
                <span>Open planner question</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          )}

          {/* Section: Review Outcome & Baseline Impact */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="font-bold uppercase tracking-wider">
                REVIEW OUTCOME & BASELINE IMPACT
              </span>
              <span>Primavera P6 Linkage</span>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <span className="font-bold text-slate-900 dark:text-white">
                • Pending Review — Schedule baseline has not been updated yet.
              </span>{' '}
              Once reviewed by Project Controls, this activity will advance Primavera P6 baseline{' '}
              <code className="font-mono text-blue-600 dark:text-blue-400">{selected.activityId}</code> by{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">+{selected.impact.daysDelta}d delta</strong> and unlock downstream activity{' '}
              <code className="font-mono text-slate-700 dark:text-slate-300">{selected.impact.unlockedActivity}</code>.
            </div>

            <div className="mt-1 text-[11px] text-slate-400 italic">
              ⓘ The schedule changes strictly after formal planner approval. Unverified submissions remain in staging.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
