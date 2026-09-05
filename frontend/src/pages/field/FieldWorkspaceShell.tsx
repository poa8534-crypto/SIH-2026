import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Home,
  FileText,
  MessageSquare,
  Settings,
  Sun,
  Moon,
  LogOut,
  MapPin,
  Calendar,
  Sparkles,
  Bot
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useSession } from '../../hooks/useSession';
import { api } from '../../lib/api';
import { FieldNav } from '../../components/FieldNav';
import { FIELD_ROLE } from '../../config';

interface FieldWorkspaceShellProps {
  children: React.ReactNode;
}

export function FieldWorkspaceShell({ children }: FieldWorkspaceShellProps) {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useSession();
  const location = useLocation();

  const { data: scheduleData } = useQuery({
    queryKey: ['schedule', 'header'],
    queryFn: () => api.getSchedule(undefined, false),
    retry: false,
  });

  const { data: clarifications } = useQuery({
    queryKey: ['clarifications', 'unanswered'],
    queryFn: () => api.getClarifications(true),
  });
  const unanswered = clarifications?.length ?? 2;

  const navItems = [
    { to: '/field', label: 'Home', icon: Home, end: true },
    { to: '/field/report', label: 'Report Progress', icon: Sparkles, badge: 'F1', end: false },
    { to: '/field/reports', label: 'My Updates', icon: FileText, badge: '14', end: false },
    {
      to: '/field/clarifications',
      label: 'Clarifications',
      icon: MessageSquare,
      badge: unanswered > 0 ? String(unanswered) : undefined,
      badgeColor: 'bg-rose-500 text-white',
      end: false,
    },
    { to: '/field/profile', label: 'Preferences', icon: Settings, end: false },
  ];

  return (
    <div className="flex h-screen w-full bg-[#f8fafc] dark:bg-[#0b0f19] text-slate-800 dark:text-slate-200 overflow-hidden font-sans">
      {/* Desktop/Tablet Sidebar (hidden on small mobile screens) */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex-col justify-between">
        <div className="p-5 flex flex-col gap-6">
          {/* Brand Header */}
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-lg shadow-sm">
              N
            </div>
            <div>
              <div className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white leading-none">
                NAVIS
              </div>
              <div className="font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase mt-0.5">
                FIELD OS
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="flex flex-col gap-1.5">
            <div className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1">
              OPERATIONS
            </div>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                <div className="flex items-center gap-2.5">
                  <item.icon size={17} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                      item.badgeColor
                        ? item.badgeColor
                        : location.pathname === item.to
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer: User Identity & Switch Role */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xs border border-blue-200 dark:border-blue-900">
              JG
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                J. Gogoi
              </div>
              <div className="font-mono text-[10px] text-slate-400 truncate">
                Sector 04 Field Lead
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-xs font-mono text-rose-600 hover:text-rose-700 transition-colors cursor-pointer"
            >
              <LogOut size={13} />
              <span>Switch Role</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-14 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-400 truncate">
            <MapPin size={14} className="text-blue-600 shrink-0" />
            <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
              OIL Well-Site Duliajan / Sector 04
            </span>
            <span>/</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {FIELD_ROLE}
            </span>
            <span className="hidden sm:inline text-slate-400">
              (J. Gogoi)
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-mono text-xs text-slate-600 dark:text-slate-300">
              <Calendar size={13} className="text-slate-400" />
              <span>DATA DATE: {scheduleData?.data_date ?? '15 SEP 2026'}</span>
            </div>

            <button
              onClick={signOut}
              className="md:hidden flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-600 dark:text-slate-300"
            >
              <LogOut size={12} />
              <span>Role</span>
            </button>
          </div>
        </header>

        {/* Workspace Content View */}
        <main className="flex-1 overflow-y-auto min-h-0 bg-[#f8fafc] dark:bg-[#0b0f19]">
          {children}
        </main>

        {/* Mobile Bottom Nav (rendered only on small screens < md) */}
        <div className="md:hidden">
          <FieldNav />
        </div>
      </div>
    </div>
  );
}
