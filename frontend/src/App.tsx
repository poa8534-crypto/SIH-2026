import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Smartphone, LayoutDashboard, ListTodo, CalendarDays, Upload, Database, Sun, Moon } from 'lucide-react';
import { api, errorDetail } from './lib/api';
import { useDevice } from './hooks/useDevice';
import { useTheme } from './hooks/useTheme';
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

// Placeholder route components

function DesktopShell({ children }: { children: React.ReactNode }) {
  const { setOverride } = useDevice();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const {
    data: scheduleData,
    isLoading: headerLoading,
    error: headerError,
  } = useQuery({
    queryKey: ['schedule', 'header'],
    queryFn: () => api.getSchedule(undefined, false),
    retry: false,
  });

  const navItems = [
    { path: '/home', label: 'Home', icon: LayoutDashboard },
    { path: '/reconcile', label: 'Reconcile', icon: ListTodo },
    { path: '/schedule', label: 'Schedule', icon: CalendarDays },
    { path: '/ingest', label: 'Ingest', icon: Upload },
    { path: '/memory', label: 'Memory', icon: Database },
  ];

  return (
    <div className="flex h-screen w-full bg-surface text-muted overflow-hidden font-sans">
      <div className="w-[200px] flex-shrink-0 border-r border-hair flex flex-col">
        <div className="h-12 border-b border-hair flex items-center px-4 font-bold tracking-tighter text-fg uppercase text-[14px]">
          EPC OPERATIONS
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-4 py-1.5 text-[14px] uppercase font-mono ${
                  active ? 'bg-selected text-fg border-r-2 border-accent' : 'hover:text-fg hover:bg-raised'
                }`}
              >
                <div className={`w-2 h-2 border ${active ? 'border-accent' : 'border-strong'}`}></div>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-hair">
          <div className="text-[12px] font-mono uppercase mb-1 text-muted">Data Date</div>
          <div
            className={`font-mono ${headerError ? 'text-danger' : 'text-fg'}`}
            title={headerError ? errorDetail(headerError) : undefined}
          >
            {headerError ? 'unavailable' : headerLoading ? '…' : scheduleData?.data_date}
          </div>
          
          <button
            onClick={() => setOverride('mobile')}
            className="rounded-[8px] mt-4 flex items-center gap-2 text-[12px] font-mono uppercase text-muted hover:text-fg transition-colors"
          >
            <Smartphone size={12} />
            Force Mobile View
          </button>
          
          <button
            onClick={toggleTheme}
            className="rounded-[8px] mt-2 flex items-center gap-2 text-[12px] font-mono uppercase text-muted hover:text-fg transition-colors"
          >
            {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-surface">
        <header className="h-12 border-b border-hair flex items-center justify-between px-6">
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <span className="text-fg uppercase font-bold text-[14px]">
                {scheduleData ? scheduleData.project : headerLoading ? 'Loading…' : 'Project unavailable'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
             {headerError && (
               <span className="font-mono text-[11px] text-danger max-w-[420px] truncate" title={errorDetail(headerError)}>
                 {errorDetail(headerError)}
               </span>
             )}
             <div className="flex bg-raised p-0.5 rounded-[8px] border border-hair">
               <div className="px-2 py-1 text-[11px] font-bold bg-accent text-accent-fg rounded-sm cursor-pointer">PLANNER</div>
               <div className="px-2 py-1 text-[11px] font-bold text-muted hover:text-fg cursor-pointer" onClick={() => setOverride('mobile')}>FIELD</div>
             </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function MobileShell({ children }: { children: React.ReactNode }) {
  const { setOverride } = useDevice();
  const { theme, toggleTheme } = useTheme();
  
  return (
    <div className="flex flex-col h-screen w-full bg-surface text-muted overflow-hidden font-sans">
      <header className="h-12 border-b border-hair flex items-center justify-between px-4 bg-surface">
        <span className="flex items-center gap-2">
          <span className="w-6 h-6 bg-accent text-accent-fg flex items-center justify-center font-bold text-[14px]">
            N
          </span>
          <span className="font-bold tracking-tighter text-fg uppercase text-[14px]">NAVIS</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="rounded-[8px] text-muted hover:text-fg p-1 transition-colors"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={() => setOverride('desktop')}
            className="rounded-[8px] text-muted hover:text-fg p-1 transition-colors"
            title="Force Desktop View"
          >
            <Monitor size={16} />
          </button>
          <span className="w-7 h-7 border border-hair bg-raised text-fg flex items-center justify-center font-mono text-[12px]">
            RK
          </span>
        </div>
      </header>
      {/* min-h-0 so the field screen owns its own scrolling rather than
          nesting a second scroll container inside this one. */}
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {children}
      </main>
      <FieldNav />
    </div>
  );
}

export default function App() {
  const { device } = useDevice();

  if (device === 'mobile') {
    return (
      <BrowserRouter>
        <MobileShell>
          {/* Four real routes, each its own page. The bottom nav lives in
              the shell so it is identical everywhere. */}
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

  return (
    <BrowserRouter>
      <DesktopShell>
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
