import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, ClipboardCheck, HardHat, LineChart, Moon, ShieldCheck, Sun } from 'lucide-react';
import { api } from '../lib/api';
import { type Role } from '../lib/role';
import { BrandMark, Button } from '../components/ui';
import { useTheme } from '../hooks/useTheme';

interface LoginProps { onPick: (role: Role) => void }

const ROLES = [
  {
    id: 'field' as const,
    label: 'Field Supervisor',
    meta: 'Capture verified site progress',
    description: 'Report work by voice, text, or photo and answer planning questions.',
    icon: HardHat,
  },
  {
    id: 'planner' as const,
    label: 'Project Manager / Planner',
    meta: 'Review evidence and control the plan',
    description: 'Resolve field updates, protect the baseline, and manage schedule exposure.',
    icon: ClipboardCheck,
  },
  {
    id: 'executive' as const,
    label: 'Senior Management',
    meta: 'See project risk at decision speed',
    description: 'Monitor progress, milestones, forecasts, and data confidence.',
    icon: LineChart,
  },
];

export default function Login({ onPick }: LoginProps) {
  const [selected, setSelected] = useState<Role>('field');
  const { theme, setTheme } = useTheme();
  const { data: schedule } = useQuery({
    queryKey: ['schedule', 'entry'],
    queryFn: () => api.getSchedule(undefined, false),
    retry: false,
  });
  const activities = schedule?.activities?.length ?? 120;

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-surface px-4 py-4 text-fg sm:px-6 sm:py-6 lg:p-8">
      <header className="mx-auto flex w-full max-w-[1160px] items-center justify-between">
        <BrandMark />
        <div className="flex items-center rounded-lg bg-raised p-1 ring-1 ring-hair" role="radiogroup" aria-label="Theme">
          {(['light', 'dark'] as const).map((item) => {
            const active = theme === item;
            const Icon = item === 'light' ? Sun : Moon;
            return (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(item)}
                className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 text-label font-semibold transition-colors ${active ? 'bg-selected text-accent' : 'text-muted hover:text-heading'}`}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{item === 'light' ? 'Light' : 'Dark'}</span>
              </button>
            );
          })}
        </div>
      </header>

      <main className="mx-auto mt-5 grid w-full max-w-[1160px] overflow-hidden rounded-2xl bg-raised shadow-[0_24px_70px_rgba(4,15,35,0.14)] ring-1 ring-hair lg:mt-8 lg:min-h-[620px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="order-2 flex flex-col justify-between bg-sidebar p-6 text-white lg:order-1 lg:p-10">
          <div>
            <div className="inline-flex items-center rounded-full bg-white/10 px-3 py-1.5 text-label font-semibold text-blue-100">
              SIH26122 · Oil India Limited
            </div>
            <h1 className="mt-6 max-w-xl text-[36px] font-semibold leading-[1.08] tracking-[-0.04em] sm:text-[44px]">
              Field reality, converted into decisions.
            </h1>
            <p className="mt-4 max-w-lg text-lead leading-7 text-slate-300">
              NAVIS connects site evidence to schedule impact, with a human in control of every committed change.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              ['01', 'Capture', 'Voice, text and photo evidence from site'],
              ['02', 'Verify', 'Explainable matching with planner review'],
              ['03', 'Decide', 'Schedule impact and executive visibility'],
            ].map(([step, title, copy]) => (
              <div key={step} className="flex gap-3 border-t border-white/10 pt-3">
                <span className="font-mono text-label text-blue-300">{step}</span>
                <div>
                  <div className="text-body font-semibold text-white">{title}</div>
                  <div className="mt-0.5 text-label leading-5 text-slate-400">{copy}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-label text-slate-400">
            <span className="flex items-center gap-1.5"><ShieldCheck size={15} className="text-blue-300" /> Append-only audit trail</span>
            <span>{activities} baseline activities</span>
            <span>{schedule?.data_date ? `Data date ${schedule.data_date}` : 'Live project context'}</span>
          </div>
        </section>

        <section className="order-1 flex flex-col p-5 sm:p-7 lg:order-2 lg:p-10">
          <div>
            <div className="text-label font-semibold uppercase tracking-[0.08em] text-accent">Choose workspace</div>
            <h2 className="mt-2 text-h2 font-semibold tracking-[-0.03em] text-heading">How are you working today?</h2>
            <p className="mt-2 text-body leading-6 text-muted">Each role opens a focused workflow with the right permissions.</p>
          </div>

          <div className="mt-6 flex flex-col gap-3" role="radiogroup" aria-label="Workspace role">
            {ROLES.map((role) => {
              const active = selected === role.id;
              const Icon = role.icon;
              return (
                <button
                  key={role.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(role.id)}
                  onDoubleClick={() => onPick(role.id)}
                  className={`group flex min-h-[92px] w-full items-start gap-4 rounded-xl p-4 text-left transition-all ${active ? 'bg-selected ring-2 ring-accent' : 'bg-secondary/55 ring-1 ring-hair hover:bg-secondary'}`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-accent text-white' : 'bg-raised text-muted ring-1 ring-hair'}`}>
                    <Icon size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-lead font-semibold text-heading">{role.label}</span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${active ? 'bg-accent text-white' : 'ring-1 ring-strong'}`}>
                        {active && <Check size={13} strokeWidth={3} />}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-label font-semibold text-accent">{role.meta}</span>
                    <span className="mt-1 block text-label leading-5 text-muted">{role.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <Button variant="primary" size="md" block className="mt-5 min-h-12 rounded-lg" onClick={() => onPick(selected)}>
            Enter {ROLES.find((role) => role.id === selected)?.label}
            <ArrowRight size={17} />
          </Button>

          <p className="mt-4 text-center text-label text-muted">
            {schedule?.project ?? 'Active project'} · Local pilot environment
          </p>
        </section>
      </main>
    </div>
  );
}
