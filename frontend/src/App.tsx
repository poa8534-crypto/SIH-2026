import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Smartphone, LayoutDashboard, ListTodo, CalendarDays, Upload, Database, Sun, Moon, LogOut, LineChart, ShieldAlert, FileSearch } from 'lucide-react';
import { api, errorDetail } from './lib/api';
import { useDevice } from './hooks/useDevice';
import { useTheme } from './hooks/useTheme';
import { PageHeaderContext, type PageHeader } from './hooks/usePageHeader';
import Reconcile from './pages/Reconcile';
import Schedule from './pages/Schedule';
import Ingest from './pages/Ingest';
import Field from './pages/Field';
import Memory from './pages/Memory';
import Home from './pages/Home';
import FieldReports from './pages/FieldReports';
import FieldClarifications from './pages/FieldClarifications';
import FieldProfile from './pages/FieldProfile';
import { FieldNav } from './components/FieldNav';
import { FIELD_ROLE, PLANNER_ROLE } from './config';
import Login from './pages/Login';
import ExecutiveOverview from './pages/executive/Overview';
import ExecutiveExposure from './pages/executive/Exposure';
import ExecutiveProvenance from './pages/executive/Provenance';
import {
  ROLE_PROFILES,
  clearRole,
  readRole,
  writeRole,
  type Role,
} from './lib/role';
import { Button, ErrorState } from './components/ui';

// Placeholder route components

type NavItem = { path: string; label: string; icon: typeof LayoutDashboard };

function DesktopShell({
  children,
  navItems,
  roleLabel,
  onSignOut,
}: {
  children: React.ReactNode;
  navItems: NavItem[];
  roleLabel: string;
  onSignOut: () => void;
}) {
  const { setOverride } = useDevice();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  // Whatever the current page published via usePageHeader. Null until the
  // page's effect runs, and for any route that has not adopted the hook.
  const [pageHeader, setPageHeader] = useState<PageHeader | null>(null);

  const {
    data: scheduleData,
    isLoading: headerLoading,
    error: headerError,
  } = useQuery({
    queryKey: ['schedule', 'header'],
    queryFn: () => api.getSchedule(undefined, false),
    retry: false,
  });

  const projectName = scheduleData
    ? scheduleData.project
    : headerLoading
      ? 'Loading…'
      : 'Project unavailable';

  // A header is used only while it belongs to the route being rendered. The
  // page publishes in a layout effect, so on a navigation the incoming title is
  // in place before the first paint and the bar never shows the nav label as an
  // intermediate value — which is what made Home flash "Home" -> "Project
  // Control" on every visit. A route that never publishes still falls back to
  // its nav label rather than inheriting the previous page's title.
  const currentNav = navItems.find((item) => location.pathname.startsWith(item.path));
  const forThisRoute = pageHeader?.path === location.pathname ? pageHeader : null;
  const title = forThisRoute?.title ?? currentNav?.label ?? '';
  const subtitle = forThisRoute?.subtitle ?? '';

  return (
    <div className="flex h-screen w-full bg-surface text-muted overflow-hidden font-sans">
      <div className="w-[240px] flex-shrink-0 border-r border-hair flex flex-col">
        {/* Project identity. The name is the real one off /schedule. */}
        <div className="px-4 pt-5 pb-4">
          <h1
            className={`text-h3 font-semibold leading-tight line-clamp-2 ${
              headerError ? 'text-danger' : 'text-heading'
            }`}
            title={headerError ? errorDetail(headerError) : projectName}
          >
            {headerError ? 'Project unavailable' : projectName}
          </h1>
          <p className="text-label font-medium leading-4 tracking-[0.05em] text-muted truncate">
            {roleLabel}
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto flex flex-col gap-1 py-2">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`mx-3 flex items-center gap-3 rounded-sm px-3 py-2 text-lead font-medium leading-6 transition-colors ${
                  active
                    ? 'bg-accent text-accent-fg'
                    : 'text-muted hover:bg-selected hover:text-fg'
                }`}
              >
                <Icon size={20} strokeWidth={2} className="shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-hair">
          <div className="text-label font-mono uppercase mb-1 text-muted">Data Date</div>
          <div
            className={`font-mono ${headerError ? 'text-danger' : 'text-fg'}`}
            title={headerError ? errorDetail(headerError) : undefined}
          >
            {headerError ? 'unavailable' : headerLoading ? '…' : scheduleData?.data_date}
          </div>

          <button
            onClick={() => setOverride('mobile')}
            className="mt-4 flex items-center gap-2 text-label font-mono uppercase text-muted hover:text-fg transition-colors"
          >
            <Smartphone size={12} />
            Force Mobile View
          </button>

          <button
            onClick={toggleTheme}
            className="mt-2 flex items-center gap-2 text-label font-mono uppercase text-muted hover:text-fg transition-colors"
          >
            {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>

          <button
            onClick={onSignOut}
            className="mt-2 flex items-center gap-2 text-label font-mono uppercase text-muted hover:text-fg transition-colors"
          >
            <LogOut size={12} />
            Switch Role
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-surface">
        <header className="h-16 shrink-0 border-b border-hair flex items-center justify-between gap-5 px-5">
          <div className="min-w-0">
            <h2 className="text-h2 font-semibold leading-9 tracking-[-0.01em] text-heading truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-body leading-5 text-muted truncate">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {headerError && (
              <ErrorState error={headerError} mode="bare" className="max-w-[420px]" />
            )}
            <div className="flex rounded-sm border border-hair overflow-hidden">
              <span className="px-3 py-2 font-mono text-label font-bold uppercase tracking-[0.05em] bg-accent text-accent-fg">
                Planner
              </span>
              <button
                onClick={() => setOverride('mobile')}
                className="px-3 py-2 font-mono text-label font-bold uppercase tracking-[0.05em] text-muted hover:bg-selected hover:text-fg transition-colors"
              >
                Field
              </button>
            </div>
          </div>
        </header>

        <PageHeaderContext.Provider value={setPageHeader}>
          <main className="flex-1 overflow-auto p-5">{children}</main>
        </PageHeaderContext.Provider>
      </div>
    </div>
  );
}

function MobileShell({ children }: { children: React.ReactNode }) {
  const { setOverride } = useDevice();
  const { theme, toggleTheme } = useTheme();

  // The same project identity the planner sidebar shows, off the same query
  // key, so the two shells cannot name the project differently. There is no
  // auth and no profile endpoint, so the second line is the role this surface
  // is for — never a person.
  const {
    data: scheduleData,
    isLoading: headerLoading,
    error: headerError,
  } = useQuery({
    queryKey: ['schedule', 'header'],
    queryFn: () => api.getSchedule(undefined, false),
    retry: false,
  });

  const projectName =
    headerError || !scheduleData
      ? headerLoading
        ? 'Loading…'
        : 'Project unavailable'
      : scheduleData.project;
  
  return (
    /* The field surface is a phone UI. Forcing it on a desktop — which the
       Planner|Field toggle and ?view=field both do — used to stretch a 96px
       microphone and 16px body copy across 1920px. It is capped at a phone
       width and centred instead, with the page ground behind it, so the same
       markup reads correctly on a handset and on a projector. */
    <div className="flex justify-center h-screen w-full bg-surface overflow-hidden">
      <div className="flex flex-col h-full w-full max-w-[520px] bg-surface text-muted overflow-hidden font-sans border-x border-hair">
      <header className="h-16 shrink-0 border-b border-hair flex items-center justify-between px-4 bg-raised">
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 shrink-0 rounded-sm bg-accent text-accent-fg flex items-center justify-center font-semibold text-lead">
            N
          </span>
          <span className="flex flex-col min-w-0">
            <span
              className={`text-lead font-semibold leading-5 truncate ${
                headerError ? 'text-danger' : 'text-heading'
              }`}
              title={headerError ? errorDetail(headerError) : projectName}
            >
              {projectName}
            </span>
            <span className="text-label font-medium leading-4 tracking-[0.05em] text-muted truncate">
              {FIELD_ROLE}
            </span>
          </span>
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="icon" onClick={toggleTheme} title="Toggle Theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
          <Button
            variant="icon"
            onClick={() => setOverride('desktop')}
            title="Force Desktop View"
          >
            <Monitor size={18} />
          </Button>
        </div>
      </header>
      {/* min-h-0 so the field screen owns its own scrolling rather than
          nesting a second scroll container inside this one. */}
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {children}
      </main>
      <FieldNav />
      </div>
    </div>
  );
}

const PLANNER_NAV: NavItem[] = [
  { path: '/home', label: 'Home', icon: LayoutDashboard },
  { path: '/reconcile', label: 'Reconcile', icon: ListTodo },
  { path: '/schedule', label: 'Schedule', icon: CalendarDays },
  { path: '/ingest', label: 'Ingest', icon: Upload },
  { path: '/memory', label: 'Memory', icon: Database },
];

/* Senior Management gets three destinations and no review queue. That absence
   is the design, not an omission: ROADMAP §3.3 keeps this role read-only so
   the plan keeps a single accountable owner. */
const EXECUTIVE_NAV: NavItem[] = [
  { path: '/executive', label: 'Overview', icon: LineChart },
  { path: '/executive/exposure', label: 'Exposure', icon: ShieldAlert },
  { path: '/executive/provenance', label: 'Data', icon: FileSearch },
];

export default function App() {
  const { device } = useDevice();
  const [role, setRole] = useState<Role | null>(() => readRole());

  const signIn = (next: Role) => {
    writeRole(next);
    setRole(next);
  };
  const signOut = () => {
    clearRole();
    setRole(null);
  };

  // No role chosen yet: the picker is the whole app. Rendered before the
  // router, so there is no route a signed-out visitor can deep-link past it.
  if (!role) {
    return <Login onPick={signIn} />;
  }

  // The Field Supervisor is a phone-first role, and the mobile shell is the
  // one built for it. A narrow viewport still forces it for everyone else,
  // which is what the existing device override is for.
  if (role === 'field' || device === 'mobile') {
    return (
      <BrowserRouter>
        <MobileShell>
          <Routes>
            <Route path="/field" element={<Field />} />
            <Route path="/field/reports" element={<FieldReports />} />
            <Route path="/field/clarifications" element={<FieldClarifications />} />
            <Route path="/field/profile" element={<FieldProfile />} />
            <Route path="*" element={<Navigate to="/field" replace />} />
          </Routes>
        </MobileShell>
      </BrowserRouter>
    );
  }

  if (role === 'executive') {
    return (
      <BrowserRouter>
        <DesktopShell
          navItems={EXECUTIVE_NAV}
          roleLabel={ROLE_PROFILES.executive.title}
          onSignOut={signOut}
        >
          <Routes>
            <Route path="/executive" element={<ExecutiveOverview />} />
            <Route path="/executive/exposure" element={<ExecutiveExposure />} />
            <Route path="/executive/provenance" element={<ExecutiveProvenance />} />
            {/* Anything else this role has no business opening returns to the
                overview rather than 404-ing into a planner screen. */}
            <Route path="*" element={<Navigate to="/executive" replace />} />
          </Routes>
        </DesktopShell>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <DesktopShell
        navItems={PLANNER_NAV}
        roleLabel={ROLE_PROFILES.planner.title}
        onSignOut={signOut}
      >
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/reconcile" element={<Reconcile />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/ingest" element={<Ingest />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </DesktopShell>
    </BrowserRouter>
  );
}
