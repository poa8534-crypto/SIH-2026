import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Home, FileText, MessageCircleQuestion, User } from 'lucide-react';
import { api } from '../lib/api';

/**
 * The mobile bottom navigation, identical on every field screen.
 *
 * Real links, not selected-tab styling: each tab resolves to its own route and
 * its own page. The clarifications badge is the backend's unanswered count,
 * not a constant.
 */
const TABS = [
  { to: '/field', label: 'Home', end: true, icon: Home },
  { to: '/field/reports', label: 'Updates', end: false, icon: FileText },
  {
    to: '/field/clarifications',
    label: 'Questions',
    end: false,
    icon: MessageCircleQuestion,
  },
  { to: '/field/profile', label: 'Settings', end: false, icon: User },
];

export function FieldNav({ desktop = false }: { desktop?: boolean }) {
  const { data } = useQuery({
    queryKey: ['clarifications', 'unanswered'],
    queryFn: () => api.getClarifications(true),
  });
  const unanswered = data?.length ?? 0;

  return (
    <nav
      className={
        desktop
          ? 'hidden w-56 shrink-0 flex-col gap-1 border-r border-hair bg-raised p-3 lg:flex'
          : 'flex min-h-[68px] shrink-0 items-stretch gap-1 border-t border-hair bg-raised px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom,0px))] lg:hidden'
      }
      aria-label={desktop ? 'Field desktop navigation' : 'Field navigation'}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `${desktop ? 'min-h-12 w-full flex-row justify-start gap-3 px-3' : 'min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1'} flex rounded-lg transition-colors ${
              isActive ? 'bg-selected text-accent font-semibold' : 'text-muted hover:bg-secondary'
            }`
          }
        >
          <span className="relative">
            <tab.icon size={20} strokeWidth={2} />
            {tab.label === 'Questions' && unanswered > 0 && (
              <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 bg-accent text-accent-fg rounded-full text-label font-semibold flex items-center justify-center">
                {unanswered}
              </span>
            )}
          </span>
          <span className={`${desktop ? 'text-sm' : 'text-label'} whitespace-nowrap px-1 font-medium leading-4`}>
            {tab.label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
