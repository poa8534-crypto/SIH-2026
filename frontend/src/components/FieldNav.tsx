import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * The mobile bottom navigation, identical on every field screen.
 *
 * Real links, not selected-tab styling: each tab resolves to its own route and
 * its own page. The clarifications badge is the backend's unanswered count,
 * not a constant.
 */
const TABS = [
  { to: '/field', label: 'Home', end: true },
  { to: '/field/reports', label: 'Reports', end: false },
  { to: '/field/clarifications', label: 'Clarifications', end: false },
  { to: '/field/profile', label: 'Profile', end: false },
];

export function FieldNav() {
  const { data } = useQuery({
    queryKey: ['clarifications', 'unanswered'],
    queryFn: () => api.getClarifications(true),
  });
  const unanswered = data?.length ?? 0;

  return (
    <nav className="shrink-0 h-14 border-t border-hair bg-surface flex items-stretch">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 relative ${
              isActive
                ? 'text-fg border-t-2 border-accent -mt-px'
                : 'text-muted hover:text-fg'
            }`
          }
        >
          <span className="font-mono text-[11px] uppercase tracking-wider">
            {tab.label}
          </span>
          {tab.label === 'Clarifications' && unanswered > 0 && (
            <span className="absolute top-1.5 right-1/2 translate-x-[26px] min-w-[14px] h-[14px] px-1 bg-accent text-accent-fg font-mono text-[11px] flex items-center justify-center">
              {unanswered}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
