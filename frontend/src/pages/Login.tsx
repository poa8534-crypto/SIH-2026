import React, { useState } from 'react';
import { HardHat, ClipboardCheck, LineChart, ArrowRight, ShieldCheck, Database, FileSpreadsheet, Check, Sun, Moon } from 'lucide-react';
import { ROLE_PROFILES, type Role } from '../lib/role';
import { Button } from '../components/ui';
import { useTheme } from '../hooks/useTheme';

interface LoginProps {
  onPick: (role: Role) => void;
}

interface RoleCardData {
  id: Role;
  category: string;
  title: string;
  description: string;
  responsibility: string;
  icon: typeof HardHat;
}

const ROLES_DATA: RoleCardData[] = [
  {
    id: 'planner',
    category: 'Controls & Scheduling',
    title: 'Project Manager / Planner',
    description: 'Reviews evidence matches and commits verified actual dates to the P6 baseline schedule.',
    responsibility: 'Sole role accountable for schedule commits · 120 baseline activities',
    icon: ClipboardCheck,
  },
  {
    id: 'field',
    category: 'Site Progress Capture',
    title: 'Field Supervisor',
    description: 'Reports daily site execution via voice or text, provides photo proof, and answers planner queries.',
    responsibility: 'Site front reporting · Cannot alter planned dates or commit to schedule',
    icon: HardHat,
  },
  {
    id: 'executive',
    category: 'Governance & Oversight',
    title: 'Senior Management',
    description: 'Monitors overall schedule exposure, EVM trends, critical path health, and data provenance.',
    responsibility: 'Read-only analytics and forecasts · No review queue access',
    icon: LineChart,
  },
];

export default function Login({ onPick }: LoginProps) {
  const [selected, setSelected] = useState<Role>('planner');
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen w-full bg-surface text-fg font-sans flex flex-col justify-between p-6 sm:p-10">
      {/* Top Header Bar with NAVIS Brand & Theme Selector */}
      <div className="w-full max-w-[1180px] mx-auto mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-accent text-accent-fg flex items-center justify-center font-bold text-label shadow-xs">
            N
          </span>
          <span className="font-semibold text-heading text-body tracking-tight">
            NAVIS
          </span>
          <span className="text-label text-muted font-mono hidden sm:inline-block">
            // Project Controls &amp; Site Capture
          </span>
        </div>

        {/* Theme Selector Toggle */}
        <div className="flex items-center p-0.5 rounded-lg border border-hair bg-raised shadow-xs" role="radiogroup" aria-label="Theme selector">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`px-3 py-1.5 rounded-md text-label font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              theme === 'light'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'text-muted hover:text-heading'
            }`}
            title="Switch to Light Theme"
            aria-checked={theme === 'light'}
            role="radio"
          >
            <Sun size={13} />
            <span>Light</span>
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`px-3 py-1.5 rounded-md text-label font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              theme === 'dark'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'text-muted hover:text-heading'
            }`}
            title="Switch to Dark Theme"
            aria-checked={theme === 'dark'}
            role="radio"
          >
            <Moon size={13} />
            <span>Dark</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-[1180px] bg-raised border border-hair rounded-lg shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[600px]">
          
          {/* Left Column: Product Context & Core Purpose */}
          <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-hair bg-surface/30">
            <div>
              {/* Product Badge */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-accent text-accent-fg text-label font-medium">
                <span>SIH26122 · Oil India Limited</span>
              </div>

              {/* Title & Subtitle */}
              <h1 className="mt-5 text-h1 font-semibold tracking-tight text-heading leading-tight">
                Field reality. Verified against the plan.
              </h1>
              <p className="mt-3 text-body text-muted leading-relaxed max-w-xl">
                NAVIS connects heterogeneous field progress reports to L5/L6 schedule activities, supports human review of uncertain matches, records verified actual progress, and builds institutional memory.
              </p>

              {/* Authentic Schedule Baseline Context Card */}
              <div className="mt-8 border border-hair bg-raised rounded-lg p-5">
                <div className="flex items-center justify-between text-label font-medium text-muted pb-3 border-b border-hair">
                  <span className="font-semibold text-heading">Active Project Baseline</span>
                  <span className="font-mono">Data date: 2026-03-01</span>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-md bg-surface/60 border border-hair">
                    <div className="text-label text-muted">Project</div>
                    <div className="mt-1 font-semibold text-heading text-body truncate">
                      OIL Well Pad 04
                    </div>
                    <div className="mt-1 text-label text-muted">EPC Construction</div>
                  </div>

                  <div className="p-3 rounded-md bg-surface/60 border border-hair">
                    <div className="text-label text-muted">Baseline Scale</div>
                    <div className="mt-1 font-mono font-semibold text-heading text-body">
                      120 Activities
                    </div>
                    <div className="mt-1 text-label text-muted">L5/L6 Work packages</div>
                  </div>

                  <div className="p-3 rounded-md bg-surface/60 border border-hair">
                    <div className="text-label text-muted">Disciplines</div>
                    <div className="mt-1 font-semibold text-heading text-body">
                      6 Disciplines
                    </div>
                    <div className="mt-1 text-label text-muted">Civil, Piping, HSE, ...</div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-hair flex flex-col gap-2 text-label text-muted">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet size={14} className="text-muted shrink-0" />
                    <span>Heterogeneous Ingest: Daily reports (.txt), discipline spreadsheets (.xlsx), and site voice</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-ok shrink-0" />
                    <span>Explainable Matching: Exact tag search, BM25 keyword matching, and semantic embeddings</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Database size={14} className="text-muted shrink-0" />
                    <span>Institutional Memory: Queryable historical execution benchmarks to prevent recurring slips</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Context Notice */}
            <div className="mt-8 pt-4 border-t border-hair flex items-center justify-between text-label text-muted">
              <span>Zero-Math-Hallucination Policy</span>
              <span>Append-only Audit Log</span>
            </div>
          </div>

          {/* Right Column: Role Selector */}
          <div className="lg:col-span-5 p-8 sm:p-10 flex flex-col justify-between bg-raised">
            <div>
              <h2 className="text-h2 font-semibold tracking-tight text-heading">
                Select your role
              </h2>
              <p className="mt-1 text-body text-muted leading-relaxed">
                Choose the role you want to see. Each role has distinct workflows, access levels, and responsibilities.
              </p>

              {/* Role Cards */}
              <div className="mt-6 flex flex-col gap-3">
                {ROLES_DATA.map((item) => {
                  const isSelected = selected === item.id;
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelected(item.id)}
                      onDoubleClick={() => onPick(item.id)}
                      className={`cursor-pointer rounded-lg p-4 transition-colors border text-left ${
                        isSelected
                          ? 'border-strong bg-selected'
                          : 'border-hair bg-raised hover:bg-selected/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="block text-label font-medium text-muted mb-0.5">
                            {item.category}
                          </span>
                          <div className="flex items-center gap-2">
                            <Icon
                              size={16}
                              className={`shrink-0 ${
                                isSelected ? 'text-heading' : 'text-muted'
                              }`}
                            />
                            <span className="text-body font-semibold text-heading leading-tight">
                              {item.title}
                            </span>
                          </div>
                          <p className="mt-1 text-label text-muted leading-relaxed">
                            {item.description}
                          </p>
                          <div className="mt-2 text-label text-muted/80 font-mono">
                            {item.responsibility}
                          </div>
                        </div>

                        {/* Custom Radio Button */}
                        <div
                          className={`h-4 w-4 shrink-0 rounded-full border flex items-center justify-center mt-1 transition-colors ${
                            isSelected
                              ? 'border-accent bg-accent text-accent-fg'
                              : 'border-strong bg-surface'
                          }`}
                        >
                          {isSelected && <Check size={10} strokeWidth={3} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Enter Workspace Button */}
              <Button
                variant="primary"
                size="md"
                block
                className="mt-6"
                onClick={() => onPick(selected)}
              >
                <span>Enter workspace</span>
                <ArrowRight size={16} />
              </Button>
            </div>

            {/* Footnote */}
            <div className="mt-8 pt-4 border-t border-hair text-center">
              <div className="text-label text-muted font-medium">
                Prototype Demonstration
              </div>
              <p className="mt-0.5 text-label text-muted leading-relaxed">
                Role-specific navigation is for workflow evaluation. All endpoints run against the local pilot database.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Bar Indicator */}
      <div className="max-w-[1180px] w-full mx-auto mt-4 px-2 flex items-center justify-between text-label text-muted font-mono">
        <span>NAVIS PILOT ENGINE // OIL INDIA LIMITED</span>
        <span>SIH 2026</span>
      </div>
    </div>
  );
}
