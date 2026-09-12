import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LogOut, MapPin, Moon, Sparkles, Sun } from 'lucide-react';
import { api } from '../../lib/api';
import { useTheme } from '../../hooks/useTheme';
import { useSession } from '../../hooks/useSession';
import { useSpeech } from '../../hooks/useSpeech';
import { useTranslation } from '../../lib/i18n';
import { PROJECT } from '../../config';
import { AskNavisChat } from '../../components/AskNavisChat';
import { FieldNav } from '../../components/FieldNav';
import { BrandMark } from '../../components/ui';
import { LinkStatusPill } from '../../components/LinkStatus';

export function FieldWorkspaceShell({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useSession();
  const speech = useSpeech();
  const { t, lang, setLang, languages } = useTranslation();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { data: schedule } = useQuery({
    queryKey: ['schedule', 'header'],
    queryFn: () => api.getSchedule(undefined, false),
    retry: false,
  });

  const cycleLanguage = () => {
    const current = languages.findIndex((item) => item.code === lang);
    const next = languages[(current + 1) % languages.length];
    setLang(next.code);
    speech.setLang(next.code);
  };

  return (
    <div className="flex h-[100dvh] w-full items-stretch justify-center overflow-hidden bg-secondary p-0 sm:p-4 xl:p-6">
      <div data-field-workspace className="flex h-full w-full flex-col overflow-hidden bg-surface text-fg shadow-[0_24px_70px_rgba(2,8,23,0.22)] ring-1 ring-hair sm:max-w-3xl sm:rounded-2xl lg:max-w-[1440px]">
        <header className="shrink-0 bg-sidebar px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] text-white lg:flex lg:items-center lg:gap-5 lg:px-6 lg:py-4">
          <div className="flex items-center justify-between gap-3 lg:contents">
            <div className="lg:hidden lg:order-1">
              <BrandMark compact inverse />
            </div>
            <div className="hidden lg:order-1 lg:block">
              <BrandMark inverse />
            </div>
            <div className="flex items-center gap-1 lg:order-4">
              <button type="button" onClick={cycleLanguage} className="min-h-10 min-w-10 rounded-lg px-2 text-label font-semibold text-slate-200 hover:bg-white/10" title="Change language">
                {languages.find((item) => item.code === lang)?.short ?? 'EN'}
              </button>
              <button type="button" onClick={() => setIsChatOpen(true)} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10" aria-label={t('ask_navis', 'Ask NAVIS')}>
                <Sparkles size={18} />
              </button>
              <button type="button" onClick={toggleTheme} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10" aria-label="Toggle theme">
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button type="button" onClick={signOut} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10" aria-label={t('switch_role', 'Switch role')}>
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 lg:contents">
            <div className="flex min-w-0 items-center gap-2 text-label text-slate-300 lg:order-2 lg:flex-1 lg:pl-2">
              <MapPin size={14} className="shrink-0 text-blue-300" />
              <span className="truncate">{schedule?.project ?? PROJECT.location}</span>
            </div>
            <span className="lg:order-3">
              <LinkStatusPill />
            </span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <FieldNav desktop />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain bg-surface">{children}</main>
        </div>
        <FieldNav />
      </div>

      <AskNavisChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} role="field" />
    </div>
  );
}
