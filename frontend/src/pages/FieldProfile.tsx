import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sun, Moon, ShieldCheck } from 'lucide-react';
import { LANGUAGES, PROJECT, SUPERVISOR } from '../config';
import { api, errorDetail } from '../lib/api';
import { useSession } from '../hooks/useSession';
import { useSpeech } from '../hooks/useSpeech';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../lib/i18n';

/**
 * User Preferences and Configuration for Field Supervisor.
 *
 * Identity and site assignments are sourced from server schedule data and
 * `src/config.ts`. Displays settings first (Appearance, Language & Input)
 * while keeping read-only project metadata compact and secondary.
 */

export default function FieldProfile() {
  const navigate = useNavigate();
  const { signOut } = useSession();
  const speech = useSpeech();
  const { theme, setTheme } = useTheme();
  const { t, setLang } = useTranslation();

  // Project name and data date are the server's, off the same query key the
  // shells use.
  const { data: schedule, isLoading, error } = useQuery({
    queryKey: ['schedule', 'header'],
    queryFn: () => api.getSchedule(undefined, false),
    retry: false,
  });

  const fromServer = (value: string | undefined) =>
    error ? 'Unavailable' : isLoading ? '…' : (value ?? '—');

  return (
    <div className="flex-1 overflow-y-auto bg-surface text-fg font-sans">
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
        {/* Page Header */}
        <div className="border-b border-hair pb-5">
          <h1 className="text-2xl font-bold tracking-tight text-heading">
            {t('pref_title', 'Preferences')}
          </h1>
          <p className="text-sm text-muted mt-1">
            {t('pref_sub', 'Personalize how NAVIS works for you.')}
          </p>
        </div>

        {/* Compact User & Assignment Summary Card */}
        <div className="rounded-2xl border border-hair bg-raised p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-accent text-accent-fg flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
              FS
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-heading truncate">
                  {SUPERVISOR.role}
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-accent border border-blue-500/20 shrink-0">
                  Active
                </span>
              </div>
              <div
                className="text-xs text-muted mt-0.5 truncate"
                title={error ? errorDetail(error) : undefined}
              >
                {fromServer(schedule?.project)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-hair text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-surface border border-hair font-medium text-heading">
              {PROJECT.location}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-surface border border-hair font-medium text-heading">
              Piping
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-surface border border-hair font-medium text-muted">
              Shift: {SUPERVISOR.shift}
            </span>
          </div>
        </div>

        {/* Section 1: Appearance & Theme (Settings First) */}
        <section className="rounded-2xl border border-hair bg-raised p-5 shadow-xs flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-bold text-heading">
              {t('pref_theme', 'Appearance & Theme')}
            </h3>
            <p className="text-xs text-muted mt-0.5">
              {t('pref_theme_sub', 'Choose your interface theme. Updates apply instantly across all screens.')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-hair">
            <div>
              <span className="text-xs font-semibold text-heading block">
                {t('pref_theme', 'Interface Theme')}
              </span>
              <span className="text-[11px] text-muted">
                Currently using {theme === 'dark' ? 'Dark Navy' : 'NAVIS Blue & White'} mode
              </span>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-surface border border-hair gap-1 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  theme === 'light'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 shadow-xs'
                    : 'text-muted hover:text-heading border border-transparent'
                }`}
              >
                <Sun size={14} />
                <span>{t('light_mode', 'Light')}</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 shadow-xs'
                    : 'text-muted hover:text-heading border border-transparent'
                }`}
              >
                <Moon size={14} />
                <span>{t('dark_mode', 'Dark')}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Section 2: Language & Input */}
        <section className="rounded-2xl border border-hair bg-raised p-5 shadow-xs flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-bold text-heading">
              {t('pref_lang', 'Language & input')}
            </h3>
            <p className="text-xs text-muted mt-0.5">
              {t('pref_lang_sub', 'Configure spoken language for voice notes and text entry.')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-hair">
            <div>
              <span className="text-xs font-semibold text-heading block">
                {t('pref_lang', 'Preferred language for voice')}
              </span>
              <span className="text-[11px] text-muted">
                Preferred languages: {LANGUAGES.map((l) => l.label).join(', ')}
              </span>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-surface border border-hair gap-1 shrink-0 overflow-x-auto self-start sm:self-auto">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    speech.setLang(l.code);
                    setLang(l.code);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    speech.lang === l.code
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 shadow-xs'
                      : 'text-muted hover:text-heading border border-transparent'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-muted pt-1 border-t border-hair/60 leading-relaxed flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-accent shrink-0" />
            <span>
              {t('pref_lang_note', 'Speech recognition runs in the browser. Nothing is recorded or sent to a speech service.')}
            </span>
          </p>
        </section>

        {/* Section 3: Current Assignment Metadata (Compact 3-column grid) */}
        <section className="rounded-2xl border border-hair bg-raised p-5 shadow-xs flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-heading">
                {t('pref_assignment', 'Current assignment')}
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Read-only scheduling and project context.
              </p>
            </div>
            <span className="text-[10px] font-mono font-medium text-muted uppercase tracking-wider px-2 py-0.5 rounded-md bg-surface border border-hair">
              {t('read_only', 'Read-only')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-hair text-xs">
            <div className="p-3 rounded-xl bg-surface/70 border border-hair flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                {t('project', 'Project')}
              </span>
              <span className="font-semibold text-heading truncate">
                {fromServer(schedule?.project)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface/70 border border-hair flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Project code
              </span>
              <span className="font-mono font-semibold text-heading truncate">
                {PROJECT.code}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface/70 border border-hair flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                {t('work_front', 'Work front')}
              </span>
              <span className="font-semibold text-heading truncate">
                {PROJECT.location}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface/70 border border-hair flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                {t('discipline', 'Discipline')}
              </span>
              <span className="font-semibold text-heading truncate">
                Piping
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface/70 border border-hair flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                {t('shift', 'Shift')}
              </span>
              <span className="font-medium text-heading truncate">
                Shift: {SUPERVISOR.shift}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface/70 border border-hair flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                {t('data_date', 'Data date')}
              </span>
              <span className="font-mono font-semibold text-heading truncate">
                {fromServer(schedule?.data_date)}
              </span>
            </div>
          </div>
        </section>

        {/* Session Navigation Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/field')}
            className="px-4 py-2.5 rounded-xl border border-hair bg-raised hover:bg-selected text-xs font-semibold text-heading transition-colors cursor-pointer text-center"
          >
            {t('back_home', 'Back to home')}
          </button>
          <button
            type="button"
            onClick={signOut}
            className="px-4 py-2.5 rounded-xl bg-accent hover:opacity-90 active:opacity-95 text-accent-fg text-xs font-semibold shadow-xs transition-all cursor-pointer text-center"
          >
            {t('return_role', 'Return to role selection')}
          </button>
        </div>
      </div>
    </div>
  );
}
