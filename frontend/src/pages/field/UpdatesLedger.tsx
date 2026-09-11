import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Plus,
  Search,
  Check,
  AlertCircle,
  FileText,
  Mic,
  MapPin,
} from 'lucide-react';
import { PROJECT } from '../../config';

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
  location: string;
  source: string;
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
    ref: 'EVT-2026-0915-0842',
    logId: 'LOG #8931',
    activityId: 'PIP-ERC-1031',
    title: 'Spool erection completed on Rack P1',
    package: 'Spool Erection · Piping Pkg 04',
    timestamp: 'Today, 15 Sep · 08:42',
    submittedAt: '15 Sep 2026 at 08:42 IST',
    supervisor: 'Field Supervisor (Piping)',
    status: 'PENDING_REVIEW',
    questionsCount: 1,
    rawNote: 'P-201 spool erection is complete on Rack P1. 12 studs torqued to specification.',
    audioDuration: '0:04s',
    location: 'Well Pad 04 · Sector A',
    source: 'Voice Audio Transcription',
    schedule: {
      matchedActivity: 'Spool Erection — Rack P1',
      wbs: '1.2.4',
      wbsName: 'Well Pad Process Manifold Piping Subassembly',
      reportedWorkDate: '14 September 2026',
      shift: 'Day (07:00 - 17:00)',
      progressFrom: 85,
      progressTo: 100,
      equipmentTag: 'P-201',
      spec: 'ASTM A106 Grade B (Sch 40)',
      workfront: 'Piping Package 04',
      module: 'Well Pad 04 Plinth',
    },
    pendingQuestion: {
      planner: 'Planning Engineer',
      text: 'Planning Engineer requested hydrotest pressure hold chart confirmation before recording 100% milestone.',
    },
    impact: {
      daysDelta: 4,
      unlockedActivity: 'PIP-TEST-1040 (Hydrostatic Pressure Hold)',
    },
  },
  {
    id: 'up-2',
    ref: 'EVT-2026-0914-1615',
    logId: 'LOG #8930',
    activityId: 'ELE-CAB-2042',
    title: 'Cable pulling from Substation 02 to Compressor Skid C-101',
    package: 'Cable Pulling & Termination · Electrical',
    timestamp: '14 Sep 2026 · 16:15',
    submittedAt: '14 Sep 2026 at 16:15 IST',
    supervisor: 'Field Supervisor (Electrical)',
    status: 'REVIEWED',
    acceptedInP6: true,
    rawNote: 'Completed 450m 11kV cable pull between Substation 02 and Skid C-101. Megger insulation test passed.',
    audioDuration: '0:12s',
    location: 'Substation 02 Trench',
    source: 'Voice Audio Transcription',
    schedule: {
      matchedActivity: '11kV Cable Pull & Megger Test',
      wbs: '1.3.2',
      wbsName: 'Medium Voltage Power Distribution Feeders',
      reportedWorkDate: '14 September 2026',
      shift: 'Day (07:00 - 17:00)',
      progressFrom: 40,
      progressTo: 100,
      equipmentTag: 'FD-11KV-02',
      spec: '3C x 300 sq mm XLPE Armoured',
      workfront: 'Electrical Pkg 02',
      module: 'Compressor Yard',
    },
    impact: {
      daysDelta: 0,
      unlockedActivity: 'ELE-TERM-2045 (Switchgear Cold Terminations)',
    },
  },
  {
    id: 'up-3',
    ref: 'EVT-2026-0914-1130',
    logId: 'LOG #8928',
    activityId: 'CIV-FND-1011',
    title: 'Structural Foundation Pad-04 anchor bolt grouting',
    package: 'Equipment Substructure · Civil/Structural',
    timestamp: '14 Sep 2026 · 11:30',
    submittedAt: '14 Sep 2026 at 11:30 IST',
    supervisor: 'Field Supervisor (Civil)',
    status: 'REVIEWED',
    acceptedInP6: true,
    rawNote: 'Non-shrink epoxy grout poured for all 16 anchor bolts on Pad-04 foundation plate.',
    audioDuration: '0:08s',
    location: 'Pad-04 Plinth',
    source: 'Terminal Quick-Log',
    schedule: {
      matchedActivity: 'Anchor Bolt High-Strength Grouting',
      wbs: '1.1.2',
      wbsName: 'Heavy Compressor Pedestal Foundation',
      reportedWorkDate: '13 September 2026',
      shift: 'Day (07:00 - 17:00)',
      progressFrom: 60,
      progressTo: 100,
      equipmentTag: 'F-PAD-04',
      spec: 'SikaGrout 214 Free-Flowing',
      workfront: 'Civil Works 01',
      module: 'Pad 04 Plinth',
    },
    impact: {
      daysDelta: 2,
      unlockedActivity: 'CIV-CURE-1015 (Curing & Load Handover)',
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
    <div className="w-full max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 pb-28 md:pb-8 font-sans">
      {/* Top Header Bar */}
      <div className="pb-5 border-b border-hair">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-muted mb-2">
              <span className="font-medium text-heading">
                NAVIS
              </span>
              <span>/</span>
              <span>Field</span>
              <span>/</span>
              <span>Audit Ledger</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-raised border border-hair text-fg font-mono text-[10px] font-medium uppercase">
                {PROJECT.code}
              </span>
              <span className="text-xs text-muted font-medium">
                • Field Supervisor
              </span>
              <span className="text-xs text-muted font-mono">
                DATA DATE: {PROJECT.dataDate}
              </span>
            </div>
            <h1 className="mt-3 text-xl sm:text-2xl font-semibold tracking-tight text-heading">
              My Updates
            </h1>
            <p className="mt-1 text-sm text-muted">
              Audit trail of field submissions, planner verifications, and baseline schedule adjustments.
            </p>
          </div>

          <Link
            to="/field/report"
            className="px-3.5 py-2 rounded-md bg-fg text-surface text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-xs"
          >
            <Plus size={14} />
            <span>New Report</span>
          </Link>
        </div>
      </div>

      {/* Main Master-Detail Split Grid */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Filterable List (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by activity, package, tag..."
              className="w-full pl-8 pr-3 py-2 rounded-md border border-hair bg-surface text-xs text-fg placeholder:text-muted focus:outline-none focus:border-fg shadow-xs transition-colors"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-raised border border-hair rounded-lg">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
                filter === 'ALL'
                  ? 'bg-surface text-heading shadow-xs'
                  : 'text-muted hover:text-fg'
              }`}
            >
              All ({SAMPLE_UPDATES.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('PENDING')}
              className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
                filter === 'PENDING'
                  ? 'bg-surface text-heading shadow-xs'
                  : 'text-muted hover:text-fg'
              }`}
            >
              Pending (1)
            </button>
            <button
              type="button"
              onClick={() => setFilter('REVIEWED')}
              className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
                filter === 'REVIEWED'
                  ? 'bg-surface text-heading shadow-xs'
                  : 'text-muted hover:text-fg'
              }`}
            >
              Reviewed (2)
            </button>
          </div>

          {/* List Cards */}
          <div className="flex flex-col gap-2">
            {filteredUpdates.map((item) => {
              const isSelected = item.id === selected.id;
              const isPending = item.status === 'PENDING_REVIEW';
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`cursor-pointer rounded-lg p-3 transition-colors border text-left flex flex-col gap-1.5 ${
                    isSelected
                      ? 'border-hair bg-selected ring-1 ring-hair'
                      : 'border-hair bg-surface hover:bg-raised'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium text-fg">
                      {item.activityId}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-medium uppercase tracking-wider ${
                        isPending
                          ? 'text-warn bg-raised border border-hair'
                          : 'text-ok bg-raised border border-hair'
                      }`}
                    >
                      {isPending ? 'PENDING' : 'REVIEWED'}
                    </span>
                  </div>

                  <div className="text-xs font-medium text-heading leading-snug">
                    {item.title}
                  </div>
                  <div className="text-[11px] text-muted truncate">
                    {item.package}
                  </div>

                  <div className="pt-1.5 border-t border-hair flex items-center justify-between text-[10px] font-mono text-muted">
                    <span>{item.timestamp}</span>
                    {item.questionsCount && (
                      <span className="text-warn font-medium">
                        {item.questionsCount} Question
                      </span>
                    )}
                    {item.acceptedInP6 && (
                      <span className="text-ok font-medium flex items-center gap-1">
                        <Check size={11} /> Committed
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Detail Pane (8 cols) */}
        <div className="lg:col-span-8 border border-hair rounded-xl bg-surface p-5 sm:p-6 shadow-xs flex flex-col gap-5">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-hair">
            <div>
              <div className="font-mono text-xs text-muted">
                {selected.ref} · {selected.logId}
              </div>
              <h2 className="mt-1 text-lg font-semibold text-heading">
                {selected.title}
              </h2>
              <div className="mt-1 text-xs text-muted font-mono">
                Submitted by {selected.supervisor} · {selected.submittedAt}
              </div>
            </div>

            <span
              className={`px-2.5 py-1 rounded-full font-mono text-xs font-medium uppercase tracking-wider ${
                selected.status === 'PENDING_REVIEW'
                  ? 'text-warn bg-raised border border-hair'
                  : 'text-ok bg-raised border border-hair'
              }`}
            >
              {selected.status === 'PENDING_REVIEW' ? 'PENDING REVIEW' : 'REVIEWED & COMMITTED'}
            </span>
          </div>

          {/* Section: Submitted Field Note */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-mono text-muted">
              <span className="font-medium uppercase tracking-wider">
                SUBMITTED FIELD NOTE
              </span>
              <span>Raw Input</span>
            </div>

            <div className="p-3.5 rounded-lg bg-raised border border-hair font-medium italic text-fg text-sm">
              &ldquo;{selected.rawNote}&rdquo;
            </div>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="px-2 py-1 rounded-md bg-raised border border-hair text-muted flex items-center gap-1 text-[11px]">
                <Mic size={12} className="text-muted" /> Audio transcribed ({selected.audioDuration})
              </span>
              <span className="px-2 py-1 rounded-md bg-raised border border-hair text-muted flex items-center gap-1 text-[11px]">
                <MapPin size={12} className="text-muted" /> {selected.location}
              </span>
              <span className="px-2 py-1 rounded-md bg-raised border border-hair text-muted flex items-center gap-1 text-[11px]">
                <FileText size={12} className="text-muted" /> Source: {selected.source}
              </span>
            </div>
          </div>

          {/* Section: Extracted Schedule Parameters */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-mono text-muted">
              <span className="font-medium uppercase tracking-wider">
                EXTRACTED SCHEDULE PARAMETERS
              </span>
              <span>Deterministic Match</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="border border-hair rounded-lg p-3 bg-raised">
                <span className="font-mono text-[10px] font-medium text-muted uppercase tracking-wider block mb-1">
                  Matched Activity
                </span>
                <span className="px-1.5 py-0.5 rounded bg-surface border border-hair font-mono font-medium text-[11px] text-fg inline-block mb-1">
                  {selected.activityId}
                </span>
                <div className="font-medium text-heading">
                  {selected.schedule.matchedActivity}
                </div>
              </div>

              <div className="border border-hair rounded-lg p-3 bg-raised">
                <span className="font-mono text-[10px] font-medium text-muted uppercase tracking-wider block mb-1">
                  WBS Breakdown
                </span>
                <div className="font-mono font-medium text-xs text-heading">
                  {selected.schedule.wbs}
                </div>
                <div className="text-muted text-[11px] mt-0.5">
                  {selected.schedule.wbsName}
                </div>
              </div>

              <div className="border border-hair rounded-lg p-3 bg-raised">
                <span className="font-mono text-[10px] font-medium text-muted uppercase tracking-wider block mb-1">
                  Reported Work Date
                </span>
                <div className="font-medium text-xs text-heading">
                  {selected.schedule.reportedWorkDate}
                </div>
                <div className="font-mono text-[11px] text-muted mt-0.5">
                  {selected.schedule.shift}
                </div>
              </div>

              <div className="border border-hair rounded-lg p-3 bg-raised">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] font-medium text-muted uppercase tracking-wider">
                    Physical % Complete
                  </span>
                  <span className="font-mono text-xs font-medium text-fg">
                    {selected.schedule.progressFrom}% → {selected.schedule.progressTo}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface border border-hair rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-fg rounded-full"
                    style={{ width: `${selected.schedule.progressTo}%` }}
                  />
                </div>
                <div className="font-mono text-[10px] text-muted mt-1.5">
                  Previous milestone: {selected.schedule.progressFrom}%
                </div>
              </div>

              <div className="border border-hair rounded-lg p-3 bg-raised">
                <span className="font-mono text-[10px] font-medium text-muted uppercase tracking-wider block mb-1">
                  Equipment / Tag
                </span>
                <div className="font-mono font-medium text-xs text-heading">
                  {selected.schedule.equipmentTag}
                </div>
                <div className="font-mono text-[11px] text-muted mt-0.5">
                  {selected.schedule.spec}
                </div>
              </div>

              <div className="border border-hair rounded-lg p-3 bg-raised">
                <span className="font-mono text-[10px] font-medium text-muted uppercase tracking-wider block mb-1">
                  Workfront / Module
                </span>
                <div className="font-medium text-xs text-heading">
                  {selected.schedule.workfront}
                </div>
                <div className="font-mono text-[11px] text-muted mt-0.5">
                  {selected.schedule.module}
                </div>
              </div>
            </div>
          </div>

          {/* Alert Banner: Awaiting Planner Verification */}
          {selected.pendingQuestion && (
            <div className="border border-hair bg-raised rounded-lg p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle size={16} className="text-warn shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-xs text-heading">
                      Awaiting Planner Verification
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-surface border border-hair text-warn font-mono text-[9px] font-medium uppercase">
                      ACTION PENDING
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted leading-relaxed">
                    {selected.pendingQuestion.text}
                  </p>
                </div>
              </div>

              <Link
                to="/field/clarifications"
                className="shrink-0 px-3 py-1.5 rounded-md bg-fg text-surface font-medium text-xs hover:opacity-90 transition-opacity flex items-center gap-1 shadow-xs"
              >
                <span>Open planner question</span>
                <ArrowRight size={12} />
              </Link>
            </div>
          )}

          {/* Section: Review Outcome & Baseline Impact */}
          <div className="pt-3 border-t border-hair flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-muted">
              <span className="font-medium uppercase tracking-wider">
                REVIEW OUTCOME & BASELINE IMPACT
              </span>
              <span>Schedule Linkage</span>
            </div>

            <div className="text-xs text-muted leading-relaxed">
              <span className="font-medium text-heading">
                • Pending Review — Schedule baseline has not been updated yet.
              </span>{' '}
              Once reviewed by the Planning Engineer, this activity will advance schedule activity{' '}
              <code className="font-mono text-fg">{selected.activityId}</code> by{' '}
              <strong className="text-ok">+{selected.impact.daysDelta}d delta</strong> and unlock downstream activity{' '}
              <code className="font-mono text-muted">{selected.impact.unlockedActivity}</code>.
            </div>

            <div className="mt-0.5 text-[11px] text-muted italic">
              ⓘ The schedule changes strictly after formal planner approval. Unverified submissions remain in staging.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
