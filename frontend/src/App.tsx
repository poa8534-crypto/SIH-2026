import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Smartphone, ListTodo, CalendarDays, Upload, Database, Sun, Moon } from 'lucide-react';
import { api } from './lib/api';
import { useDevice } from './hooks/useDevice';
import { useTheme } from './hooks/useTheme';
import Reconcile from './pages/Reconcile';

// Placeholder route components
const FieldAgent = () => <div className="p-4 text-sm font-mono">Field Agent View (Mobile)</div>;
const Schedule = () => <div className="p-4 text-sm font-mono">Schedule View</div>;
const Ingest = () => <div className="p-4 text-sm font-mono">Ingest View</div>;
const Memory = () => <div className="p-4 text-sm font-mono">Memory View</div>;

function DesktopShell({ children }: { children: React.ReactNode }) {
  const { setOverride } = useDevice();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const { data: scheduleData } = useQuery({
    queryKey: ['schedule', 'header'],
    queryFn: () => api.getSchedule(undefined, false),
    retry: false,
  });

  const navItems = [
    { path: '/reconcile', label: 'Reconcile', icon: ListTodo },
    { path: '/schedule', label: 'Schedule', icon: CalendarDays },
    { path: '/ingest', label: 'Ingest', icon: Upload },
    { path: '/memory', label: 'Memory', icon: Database },
  ];

  return (
    <div className="flex h-screen w-full bg-surface text-muted overflow-hidden font-sans">
      <div className="w-[200px] flex-shrink-0 border-r border-hair flex flex-col">
        <div className="h-12 border-b border-hair flex items-center px-4 font-bold tracking-tighter text-fg uppercase text-[12px]">
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
                className={`flex items-center gap-2 px-4 py-1.5 text-[11px] uppercase font-mono ${
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
          <div className="text-[10px] font-mono uppercase mb-1 text-muted">Data Date</div>
          <div className="text-fg font-mono">{scheduleData?.data_date || 'N/A'}</div>
          
          <button
            onClick={() => setOverride('mobile')}
            className="mt-4 flex items-center gap-2 text-[10px] font-mono uppercase text-muted hover:text-fg transition-colors"
          >
            <Smartphone size={12} />
            Force Mobile View
          </button>
          
          <button
            onClick={toggleTheme}
            className="mt-2 flex items-center gap-2 text-[10px] font-mono uppercase text-muted hover:text-fg transition-colors"
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
              <span className="text-fg uppercase font-bold text-[12px]">
                {scheduleData ? scheduleData.project : 'Loading...'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex bg-raised p-0.5 rounded border border-hair">
               <div className="px-2 py-1 text-[9px] font-bold bg-accent text-accent-fg rounded-sm cursor-pointer">PLANNER</div>
               <div className="px-2 py-1 text-[9px] font-bold text-muted hover:text-fg cursor-pointer" onClick={() => setOverride('mobile')}>FIELD</div>
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
        <span className="font-bold tracking-tighter text-fg uppercase text-[12px]">Field Agent</span>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="text-muted hover:text-fg p-1 transition-colors"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={() => setOverride('desktop')}
            className="text-muted hover:text-fg p-1 transition-colors"
            title="Force Desktop View"
          >
            <Monitor size={16} />
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const { device } = useDevice();

  if (device === 'mobile') {
    return (
      <BrowserRouter>
        <MobileShell>
          <Routes>
            <Route path="/" element={<FieldAgent />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MobileShell>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <DesktopShell>
        <Routes>
          <Route path="/reconcile" element={<Reconcile />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/ingest" element={<Ingest />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/" element={<Navigate to="/reconcile" replace />} />
          <Route path="*" element={<Navigate to="/reconcile" replace />} />
        </Routes>
      </DesktopShell>
    </BrowserRouter>
  );
}
