import React, { useState, useMemo } from 'react';
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
  Users,
  Radio,
  TrendingUp,
  FileText,
  Menu,
  X,
} from 'lucide-react';
import { api, errorDetail } from './lib/api';
import { useTheme } from './hooks/useTheme';
import { PageHeaderContext, type PageHeader } from './hooks/usePageHeader';
import { AskNavisChat } from './components/AskNavisChat';
import { LiveNotificationToast } from './components/LiveNotificationToast';
import Reconcile from './pages/Reconcile';
import Schedule from './pages/Schedule';
import Ingest from './pages/Ingest';
import Field from './pages/Field';
import Memory from './pages/Memory';
import Raid from './pages/Raid';
import Delay from './pages/Delay';
import Home from './pages/Home';
import Workforce from './pages/Workforce';
import CaptureHealth from './pages/CaptureHealth';
import FieldReports from './pages/FieldReports';
import FieldClarifications from './pages/FieldClarifications';
import FieldProfile from './pages/FieldProfile';
import { FieldWorkspaceShell } from './pages/field/FieldWorkspaceShell';
import CrewScreen from './pages/field/CrewScreen';
import { ConnectivityProvider } from './hooks/useConnectivity';
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
import ExecutiveWorkforce from './pages/executive/Workforce';
import { SessionContext } from './hooks/useSession';
import {
  ROLE_PROFILES,
  clearRole,
  readRole,
  writeRole,
  type Role,
} from './lib/role';
import { BrandMark, Button, ErrorState } from './components/ui';

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
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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

  const currentNav = navItems.find((item) =>
    item.end ? location.pathname === item.path : location.pathname.startsWith(item.path)
  );
  const forThisRoute = pageHeader?.path === location.pathname ? pageHeader : null;
  const title = forThisRoute?.title ?? currentNav?.label ?? '';
  const subtitle = forThisRoute?.subtitle ?? '';

  const { data: reviewQueueData } = useQuery({
    queryKey: ['reviewQueue'],
    queryFn: () => api.getReviewQueue('pending'),
    staleTime: 5000,
  });

  const pendingFieldCount = useMemo(() => {
    if (!Array.isArray(reviewQueueData)) return 0;
    return reviewQueueData.filter((i) => i.match_method === 'agent_turn').length;
  }, [reviewQueueData]);

  const renderNavLinks = (onItemClick?: () => void) => (
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
            onClick={onItemClick}
            className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-body font-medium transition-colors ${
              active
                ? 'bg-white/12 text-white font-semibold ring-1 ring-white/10'
                : 'text-slate-300 hover:bg-white/8 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </div>
            {item.path === '/reconcile' && pendingFieldCount > 0 && (
              <span className="font-mono text-label font-bold bg-amber-400/15 text-amber-200 px-2 py-0.5 rounded-full shrink-0">
                {pendingFieldCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const renderFooter = () => (
    <div className="p-4 border-t border-white/10 bg-black/10 flex flex-col gap-2">
      <div className="flex items-center justify-between text-label text-slate-400">
        <span>Data Date</span>
        <span
          className={`font-mono font-medium ${headerError ? 'text-red-300' : 'text-white'}`}
          title={headerError ? errorDetail(headerError) : undefined}
        >
          {headerError ? 'unavailable' : headerLoading ? '…' : scheduleData?.data_date}
        </span>
      </div>

      <div className="pt-2 border-t border-hair/50 flex flex-col gap-1">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-label text-slate-300 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>

        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-label text-slate-300 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
        >
          <LogOut size={14} />
          <span>Switch role</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full h-[100dvh] max-h-[100dvh] w-full bg-surface text-fg overflow-hidden font-sans">
      {/* Persistent Left Navigation Sidebar for Desktop/Tablet */}
      <aside className="hidden md:flex w-[248px] flex-shrink-0 bg-sidebar border-r border-white/10 flex-col z-10 shadow-[8px_0_30px_rgba(2,8,23,0.08)]">
        {/* Project & Engine Identity */}
        <div className="px-5 pt-5 pb-4 border-b border-white/10">
          <BrandMark inverse />
          <h1
            className={`mt-4 text-body font-semibold leading-tight truncate ${
              headerError ? 'text-red-300' : 'text-white'
            }`}
            title={headerError ? errorDetail(headerError) : projectName}
          >
            {headerError ? 'Project unavailable' : projectName}
          </h1>
          <p className="mt-1 text-label text-slate-400 truncate">
            {roleLabel}
          </p>
        </div>

        {renderNavLinks()}
        {renderFooter()}
      </aside>

      {/* Mobile Slide-Out Drawer Overlay */}
      {isMobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-sidebar border-r border-white/10 flex flex-col justify-between shadow-2xl z-50 animate-in slide-in-from-left duration-200">
            <div className="px-5 pt-5 pb-4 border-b border-white/10 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <BrandMark inverse />
                <h1
                  className={`mt-4 text-body font-semibold leading-tight truncate ${
                    headerError ? 'text-red-300' : 'text-white'
                  }`}
                  title={headerError ? errorDetail(headerError) : projectName}
                >
                  {headerError ? 'Project unavailable' : projectName}
                </h1>
                <p className="mt-1 text-label text-slate-400 truncate">
                  {roleLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                className="p-2 rounded-md text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close navigation"
              >
                <X size={18} />
              </button>
            </div>

            {renderNavLinks(() => setIsMobileNavOpen(false))}
            {renderFooter()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden bg-surface">
        {/* Compact Contextual Header */}
        <header className="h-16 shrink-0 border-b border-hair flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 bg-raised max-w-full">
          <div className="min-w-0 flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              className="md:hidden p-1.5 -ml-1 rounded-md text-muted hover:text-heading hover:bg-selected transition-colors cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0 flex items-center gap-2">
              <span className="hidden md:inline-flex h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
              <h2 className="text-body font-medium text-heading truncate md:text-muted">
                {title}
              </h2>
              {subtitle && (
                <span className="text-label text-muted truncate hidden sm:inline md:hidden">
                  · {subtitle}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {headerError && (
              <ErrorState error={headerError} mode="bare" className="max-w-[180px] sm:max-w-[360px]" />
            )}
            <button
              type="button"
              onClick={() => setIsChatOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-selected hover:bg-secondary text-body text-accent font-semibold transition-colors cursor-pointer"
              title="Ask NAVIS Assistant"
              aria-label="Ask NAVIS"
            >
              <Sparkles size={13} className="text-accent" />
              <span className="hidden sm:inline">Ask NAVIS</span>
            </button>
            <span className="hidden md:inline-flex items-center gap-1.5 text-label font-mono text-muted bg-secondary px-3 py-2 rounded-lg">
              <span>Baseline</span>
              <span className="text-heading font-semibold">{scheduleData?.baseline?.name ?? 'Not supplied'}</span>
            </span>
          </div>
        </header>

        <PageHeaderContext.Provider value={setPageHeader}>
          <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y p-4 md:p-6 lg:p-8 w-full max-w-full min-w-0">{children}</main>
        </PageHeaderContext.Provider>
      </div>

      <AskNavisChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        role={location.pathname.startsWith('/executive') ? 'executive' : 'planner'}
      />
      <LiveNotificationToast />
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
  // Manpower (D-117/D-118). Placed after the capture screens and before the
  // analysis ones, because the register is an input to Delay Analysis: an
  // attendance shortfall is the evidence behind a MANPOWER classification.
  { path: '/workforce', label: 'Workforce', icon: Users },
  { path: '/capture-health', label: 'Capture Health', icon: Radio },
  { path: '/raid', label: 'Risk & Exposure', icon: ShieldAlert },
  { path: '/delay', label: 'Delay Analysis', icon: Scale },
  { path: '/memory', label: 'Project Knowledge', icon: Database },
];

/* Senior Management 9 analytical governance workspaces:
   Overview, Milestones, Progress, Risks & Delays, Forecasts, Workforce,
   Execution Insights, Reports, and Data Confidence.
   Strictly read-only; schedule mutation and review queues remain with the PM.
   Workforce is aggregate manpower governance (D-120) — no muster control and
   no commit button, both of which belong to the roles below this one. */
const EXECUTIVE_NAV: NavItem[] = [
  { path: '/executive', label: 'Overview', icon: LayoutDashboard, end: true },
  { path: '/executive/milestones', label: 'Milestones', icon: CalendarDays },
  { path: '/executive/progress', label: 'Progress', icon: LineChart },
  { path: '/executive/risks', label: 'Risks & Delays', icon: ShieldAlert },
  { path: '/executive/forecasts', label: 'Forecasts', icon: TrendingUp },
  { path: '/executive/workforce', label: 'Workforce', icon: Users },
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
        <ConnectivityProvider role="field">
        <FieldWorkspaceShell>
          <Routes>
            <Route path="/field" element={<Field />} />
            <Route path="/field/report" element={<Navigate to="/field" replace />} />
            <Route path="/field/reports" element={<FieldReports />} />
            <Route path="/field/crew" element={<CrewScreen />} />
            <Route path="/field/reports/ledger" element={<Navigate to="/field/reports" replace />} />
            <Route path="/field/clarifications" element={<FieldClarifications />} />
            <Route path="/field/profile" element={<FieldProfile />} />
            <Route path="*" element={<Navigate to="/field" replace />} />
          </Routes>
        </FieldWorkspaceShell>
        </ConnectivityProvider>
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
            <Route path="/executive/workforce" element={<ExecutiveWorkforce />} />
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
          <Route path="/workforce" element={<Workforce />} />
          <Route path="/capture-health" element={<CaptureHealth />} />
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
