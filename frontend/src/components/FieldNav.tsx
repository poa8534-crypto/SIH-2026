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
  { to: '/field/reports', label: 'Reports', end: false, icon: FileText },
  {
    to: '/field/clarifications',
    label: 'Clarifications',
    end: false,
    icon: MessageCircleQuestion,
  },
  { to: '/field/profile', label: 'Profile', end: false, icon: User },
];

export function FieldNav() {
  const { data } = useQuery({
    queryKey: ['clarifications', 'unanswered'],
    queryFn: () => api.getClarifications(true),
  });
  const unanswered = data?.length ?? 0;

  return (
    <nav className="shrink-0 h-16 border-t border-hair bg-raised flex items-stretch gap-1 px-2 py-1.5">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `flex-1 min-w-0 flex flex-col items-center justify-center gap-1 rounded-[8px] transition-colors ${
              isActive ? 'bg-selected text-accent' : 'text-muted hover:bg-selected'
            }`
          }
        >
          <span className="relative">
            <tab.icon size={20} strokeWidth={2} />
            {tab.label === 'Clarifications' && unanswered > 0 && (
              <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 bg-accent text-accent-fg rounded-full text-[10px] font-semibold flex items-center justify-center">
                {unanswered}
              </span>
            )}
          </span>
          <span className="text-[12px] font-medium leading-4 truncate max-w-full px-0.5">
            {tab.label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
