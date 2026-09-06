import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  ListTodo,
  CalendarDays,
  Upload,
  Database,
  Sun,
  Moon,
  LogOut,
  LineChart,
  ShieldAlert,
  FileSearch,
  Scale,
  Sparkles,
  TrendingUp,
  FileText,
} from 'lucide-react';
import { api, errorDetail } from './lib/api';
import { useTheme } from './hooks/useTheme';
import { PageHeaderContext, type PageHeader } from './hooks/usePageHeader';
import { AskNavisChat } from './components/AskNavisChat';
import Reconcile from './pages/Reconcile';
import Schedule from './pages/Schedule';
import Ingest from './pages/Ingest';
import Field from './pages/Field';
import Memory from './pages/Memory';
import Raid from './pages/Raid';
import Delay from './pages/Delay';
import Home from './pages/Home';
import FieldReports from './pages/FieldReports';
import FieldClarifications from './pages/FieldClarifications';
import FieldProfile from './pages/FieldProfile';
import ReportStudio from './pages/field/ReportStudio';
import UpdatesLedger from './pages/field/UpdatesLedger';
import { FieldWorkspaceShell } from './pages/field/FieldWorkspaceShell';
import { FieldNav } from './components/FieldNav';
import { FIELD_ROLE, PLANNER_ROLE } from './config';
import Login from './pages/Login';
import ExecutiveOverview from './pages/executive/Overview';
import ExecutiveMilestones from './pages/executive/Milestones';
import ExecutiveProgress from './pages/executive/Progress';
import ExecutiveRisksDelays from './pages/executive/RisksDelays';
import ExecutiveForecasts from './pages/executive/Forecasts';
import ExecutiveExecutionInsights from './pages/executive/ExecutionInsights';
import ExecutiveManagementReports from './pages/executive/ManagementReports';
import ExecutiveDataConfidence from './pages/executive/DataConfidence';
import { SessionContext } from './hooks/useSession';
import {
  ROLE_PROFILES,
  clearRole,
  readRole,
  writeRole,
  type Role,
} from './lib/role';
import { Button, ErrorState } from './components/ui';

// Placeholder route components

type NavItem = {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
};

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
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  // Whatever the current page published via usePageHeader. Null until the
  // page's effect runs, and for any route that has not adopted the hook.
  const [pageHeader, setPageHeader] = useState<PageHeader | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

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
  const currentNav = navItems.find((item) =>
    item.end ? location.pathname === item.path : location.pathname.startsWith(item.path)
  );
  const forThisRoute = pageHeader?.path === location.pathname ? pageHeader : null;
  const title = forThisRoute?.title ?? currentNav?.label ?? '';
  const subtitle = forThisRoute?.subtitle ?? '';

  return (
    <div className="flex h-screen w-full bg-surface text-fg overflow-hidden font-sans">
      {/* Persistent Left Navigation Sidebar (ChatGPT / Reference Structural Model) */}
      <aside className="w-[240px] flex-shrink-0 bg-sidebar border-r border-hair flex flex-col z-10">
        {/* Project & Engine Identity */}
        <div className="px-5 pt-5 pb-4 border-b border-hair/60">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-accent text-accent-fg flex items-center justify-center font-bold text-label">
              N
            </span>
            <span className="font-semibold text-heading text-body tracking-tight">
              NAVIS Engine
            </span>
          </div>
          <h1
            className={`mt-2 text-label font-medium leading-tight truncate ${
              headerError ? 'text-danger' : 'text-heading'
            }`}
            title={headerError ? errorDetail(headerError) : projectName}
          >
            {headerError ? 'Project unavailable' : projectName}
          </h1>
          <p className="text-label text-muted truncate">
            {roleLabel}
          </p>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto flex flex-col gap-0.5 px-3 py-3">
          {navItems.map((item) => {
            const active = item.end
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-body font-medium transition-colors ${
                  active
                    ? 'bg-raised text-heading border border-hair shadow-xs'
                    : 'text-muted hover:bg-selected hover:text-heading'
                }`}
              >
                <Icon size={16} strokeWidth={active ? 2.2 : 1.8} className="shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer: Operational Metadata & Controls */}
        <div className="p-4 border-t border-hair bg-sidebar/80 flex flex-col gap-2">
          <div className="flex items-center justify-between text-label text-muted">
            <span>Data Date</span>
            <span
              className={`font-mono font-medium ${headerError ? 'text-danger' : 'text-fg'}`}
              title={headerError ? errorDetail(headerError) : undefined}
            >
              {headerError ? 'unavailable' : headerLoading ? '…' : scheduleData?.data_date}
            </span>
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
              onClick={onSignOut}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-label text-muted hover:text-heading hover:bg-selected transition-colors"
            >
              <LogOut size={14} />
              <span>Switch role</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface">
        {/* Compact Contextual Header */}
        <header className="h-14 shrink-0 border-b border-hair flex items-center justify-between gap-4 px-6 bg-surface">
          <div className="min-w-0 flex items-baseline gap-3">
            <h2 className="text-body font-semibold text-heading truncate">
              {title}
            </h2>
            {subtitle && (
              <span className="text-label text-muted truncate hidden sm:inline">
                · {subtitle}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {headerError && (
              <ErrorState error={headerError} mode="bare" className="max-w-[360px]" />
            )}
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
            <span className="hidden md:inline-flex items-center gap-1.5 text-label font-mono text-muted bg-raised px-2.5 py-1 rounded-md border border-hair">
              <span>P6 Baseline</span>
              <span className="text-heading font-semibold">Rev-08</span>
            </span>
          </div>
        </header>

        <PageHeaderContext.Provider value={setPageHeader}>
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </PageHeaderContext.Provider>
      </div>

      <AskNavisChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        role={location.pathname.startsWith('/executive') ? 'executive' : 'planner'}
      />
    </div>
  );
}

function MobileShell({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const [isChatOpen, setIsChatOpen] = useState(false);

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
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsChatOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-hair bg-surface hover:bg-selected text-xs text-heading font-medium transition-colors cursor-pointer shadow-xs"
            title="Ask NAVIS Assistant"
            aria-label="Ask NAVIS"
          >
            <Sparkles size={13} className="text-accent" />
            <span>Ask NAVIS</span>
          </button>
          <Button variant="icon" onClick={toggleTheme} title="Toggle Theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
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

      <AskNavisChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        role="field"
      />
    </div>
  );
}

const PLANNER_NAV: NavItem[] = [
  { path: '/home', label: 'Overview', icon: LayoutDashboard },
  { path: '/reconcile', label: 'Review & Reconcile', icon: ListTodo },
  { path: '/schedule', label: 'Schedule', icon: CalendarDays },
  { path: '/ingest', label: 'Field Data', icon: Upload },
  { path: '/raid', label: 'Risk & Exposure', icon: ShieldAlert },
  { path: '/delay', label: 'Delay Analysis', icon: Scale },
  { path: '/memory', label: 'Project Knowledge', icon: Database },
];

/* Senior Management 8 analytical governance workspaces:
   Overview, Milestones, Progress, Risks & Delays, Forecasts,
   Execution Insights, Reports, and Data Confidence.
   Strictly read-only; schedule mutation and review queues remain with the PM. */
const EXECUTIVE_NAV: NavItem[] = [
  { path: '/executive', label: 'Overview', icon: LayoutDashboard, end: true },
  { path: '/executive/milestones', label: 'Milestones', icon: CalendarDays },
  { path: '/executive/progress', label: 'Progress', icon: LineChart },
  { path: '/executive/risks', label: 'Risks & Delays', icon: ShieldAlert },
  { path: '/executive/forecasts', label: 'Forecasts', icon: TrendingUp },
  { path: '/executive/insights', label: 'Execution Insights', icon: Sparkles },
  { path: '/executive/reports', label: 'Reports', icon: FileText },
  { path: '/executive/confidence', label: 'Data Confidence', icon: FileSearch },
];

export default function App() {
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
  // one built for it. The shell follows the ROLE and nothing else.
  //
  // It used to be `role === 'field' || device === 'mobile'`, so a narrow
  // window — or the Force Mobile View button, from any role — rendered the
  // field lane's routes and header for a Project Manager or for Senior
  // Management, while `navis.role` was unchanged. That is not a layout
  // choice; it is showing one person another person's application, with a
  // header that names them as the Field Supervisor. A viewport width must
  // never decide which role you are.
  // Everything the router can reach needs a way to sign out — the field
  // lane's Profile screen especially, which is nested inside <Routes> where a
  // prop cannot follow it.
  const session = { role, signOut };

  if (role === 'field') {
    return (
      <SessionContext.Provider value={session}>
      <BrowserRouter>
        <FieldWorkspaceShell>
          <Routes>
            <Route path="/field" element={<Field />} />
            <Route path="/field/report" element={<ReportStudio />} />
            <Route path="/field/reports" element={<FieldReports />} />
            <Route path="/field/reports/ledger" element={<UpdatesLedger />} />
            <Route path="/field/clarifications" element={<FieldClarifications />} />
            <Route path="/field/profile" element={<FieldProfile />} />
            <Route path="*" element={<Navigate to="/field" replace />} />
          </Routes>
        </FieldWorkspaceShell>
      </BrowserRouter>
      </SessionContext.Provider>
    );
  }

  if (role === 'executive') {
    return (
      <SessionContext.Provider value={session}>
      <BrowserRouter>
        <DesktopShell
          navItems={EXECUTIVE_NAV}
          roleLabel={ROLE_PROFILES.executive.title}
          onSignOut={signOut}
        >
          <Routes>
            <Route path="/executive" element={<ExecutiveOverview />} />
            <Route path="/executive/milestones" element={<ExecutiveMilestones />} />
            <Route path="/executive/progress" element={<ExecutiveProgress />} />
            <Route path="/executive/risks" element={<ExecutiveRisksDelays />} />
            <Route path="/executive/exposure" element={<Navigate to="/executive/risks" replace />} />
            <Route path="/executive/forecasts" element={<ExecutiveForecasts />} />
            <Route path="/executive/insights" element={<ExecutiveExecutionInsights />} />
            <Route path="/executive/reports" element={<ExecutiveManagementReports />} />
            <Route path="/executive/confidence" element={<ExecutiveDataConfidence />} />
            <Route path="/executive/provenance" element={<Navigate to="/executive/confidence" replace />} />
            {/* Anything else this role has no business opening returns to the
                overview rather than 404-ing into a planner screen. */}
            <Route path="*" element={<Navigate to="/executive" replace />} />
          </Routes>
        </DesktopShell>
      </BrowserRouter>
      </SessionContext.Provider>
    );
  }

  return (
    <SessionContext.Provider value={session}>
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
          <Route path="/raid" element={<Raid />} />
          <Route path="/delay" element={<Delay />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </DesktopShell>
    </BrowserRouter>
    </SessionContext.Provider>
  );
}
