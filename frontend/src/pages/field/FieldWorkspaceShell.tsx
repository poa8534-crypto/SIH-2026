import React, { useState } from 'react';
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
import { AskNavisChat } from '../../components/AskNavisChat';

interface FieldWorkspaceShellProps {
  children: React.ReactNode;
}

export function FieldWorkspaceShell({ children }: FieldWorkspaceShellProps) {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useSession();
  const location = useLocation();
  const [isChatOpen, setIsChatOpen] = useState(false);

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
    <div className="flex h-screen w-full bg-surface text-fg overflow-hidden font-sans">
      {/* Desktop/Tablet Sidebar (hidden on small mobile screens) */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-hair bg-sidebar flex-col justify-between z-10">
        <div className="p-5 flex flex-col gap-5">
          {/* Brand Header */}
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-accent text-accent-fg flex items-center justify-center font-bold text-label">
              N
            </div>
            <div>
              <div className="font-semibold text-body tracking-tight text-heading leading-none">
                NAVIS Field
              </div>
              <div className="text-label font-medium text-muted mt-0.5">
                Site Capture OS
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="flex flex-col gap-0.5">
            <div className="text-label font-medium text-muted px-3 mb-1">
              Operations
            </div>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded-md text-body font-medium transition-colors ${
                    isActive
                      ? 'bg-raised text-heading border border-hair shadow-xs'
                      : 'text-muted hover:bg-selected hover:text-heading'
                  }`
                }
              >
                <div className="flex items-center gap-2.5">
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-label font-medium font-mono ${
                      item.badgeColor
                        ? item.badgeColor
                        : location.pathname === item.to
                        ? 'bg-selected text-heading'
                        : 'bg-surface text-muted border border-hair'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer: Supervisor Identity & Controls */}
        <div className="p-4 border-t border-hair bg-sidebar/80 flex flex-col gap-2">
          <div className="flex items-center gap-2.5 px-1 py-1">
            <div className="h-7 w-7 rounded-md bg-raised border border-hair text-heading flex items-center justify-center font-bold text-label">
              FS
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-body font-medium text-heading truncate">
                Site Supervisor
              </div>
              <div className="text-label text-muted truncate">
                {scheduleData?.project ? scheduleData.project : 'Oil India Limited'}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-hair/50 flex flex-col gap-1">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-label text-muted hover:text-heading hover:bg-selected transition-colors"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
            <button
              onClick={signOut}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-label text-muted hover:text-heading hover:bg-selected transition-colors"
            >
              <LogOut size={14} />
              <span>Switch role</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-surface">
        {/* Top Header Bar */}
        <header className="h-14 shrink-0 border-b border-hair bg-surface px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-body text-muted truncate">
            <MapPin size={15} className="text-heading shrink-0" />
            <span className="font-semibold text-heading truncate">
              {scheduleData?.project ?? 'Oil India Limited · Pad 04'}
            </span>
            <span>·</span>
            <span className="text-label text-muted">
              {FIELD_ROLE}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-raised border border-hair font-mono text-label text-muted">
              <Calendar size={13} className="text-muted" />
              <span>Data date: {scheduleData?.data_date ?? '2026-03-01'}</span>
            </div>

            <button
              type="button"
              onClick={() => setIsChatOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-hair bg-raised hover:bg-selected text-xs text-heading font-medium transition-colors cursor-pointer shadow-xs"
              title="Ask NAVIS Assistant"
              aria-label="Ask NAVIS"
            >
              <Sparkles size={13} className="text-accent" />
              <span>Ask NAVIS</span>
            </button>

            <button
              onClick={signOut}
              className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-hair text-label text-muted hover:text-heading hover:bg-selected"
            >
              <LogOut size={12} />
              <span>Switch role</span>
            </button>
          </div>
        </header>

        {/* Workspace Content View */}
        <main className="flex-1 overflow-y-auto min-h-0 bg-surface">
          {children}
        </main>

        {/* Mobile Bottom Nav (rendered only on small screens < md) */}
        <div className="md:hidden">
          <FieldNav />
        </div>
      </div>

      <AskNavisChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        role="field"
      />
    </div>
  );
}
