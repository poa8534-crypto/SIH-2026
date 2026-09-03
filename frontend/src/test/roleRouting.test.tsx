/**
 * The signed-in role decides which application you see. Nothing else does.
 *
 * `App` used to route on `role === 'field' || device === 'mobile'`, so a narrow
 * window — or the "Force Mobile View" button, which every desktop role had —
 * rendered the Field Supervisor's routes and header for a Project Manager or
 * for Senior Management while `navis.role` was unchanged. That is not a
 * responsive layout; it is one person being shown another person's
 * application, labelled as them.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from '../App';
import { api } from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      getSchedule: vi.fn(),
      getReviewQueue: vi.fn(),
      getConflicts: vi.fn(),
      getAuditRecent: vi.fn(),
      getJobs: vi.fn(),
      getEvm: vi.fn(),
      getRaid: vi.fn(),
      getRaidCandidates: vi.fn(),
      getCorpus: vi.fn(),
      getFieldReports: vi.fn(),
      getFieldClarifications: vi.fn(),
      getFieldNotifications: vi.fn(),
      getMemory: vi.fn(),
    },
  };
});

const SCHEDULE = {
  project: 'OIL Well-Site Duliajan',
  data_date: '2026-09-15',
  total_activities: 120,
  activities_with_actuals: 67,
  activities_completed: 38,
  activities: [],
};

function renderApp() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  );
}

/** Emulate a phone-width window, the way a projector or a real handset would. */
function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    configurable: true,
    writable: true,
  });
  window.dispatchEvent(new Event('resize'));
}

const realWidth = window.innerWidth;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  (api.getSchedule as ReturnType<typeof vi.fn>).mockResolvedValue(SCHEDULE);
  for (const fn of Object.values(api)) {
    if (typeof fn === 'function' && 'mockResolvedValue' in fn) {
      const mock = fn as ReturnType<typeof vi.fn>;
      if (mock.getMockImplementation() === undefined) mock.mockResolvedValue([]);
    }
  }
  (api.getSchedule as ReturnType<typeof vi.fn>).mockResolvedValue(SCHEDULE);
});

afterEach(() => {
  setViewport(realWidth);
  window.localStorage.clear();
});

describe('the role decides the application, the viewport never does', () => {
  it('shows the picker when no role is chosen', () => {
    renderApp();
    expect(screen.getByText(/choose the role you want to see/i)).toBeInTheDocument();
  });

  it('shows the picker even on a deep link with ?view=field', () => {
    // ?view=field only ever forced a shell; it was never a role, and the
    // picker renders before the router.
    window.history.pushState({}, '', '/schedule?view=field');
    renderApp();
    expect(screen.getByText(/choose the role you want to see/i)).toBeInTheDocument();
    window.history.pushState({}, '', '/');
  });

  it('keeps a Project Manager on the planner application at phone width', () => {
    window.localStorage.setItem('navis.role', 'planner');
    setViewport(375);
    renderApp();

    expect(screen.getByText('Project Manager')).toBeInTheDocument();
    // "Reconcile" is both a nav item and a panel action on Home.
    expect(screen.getAllByText('Reconcile').length).toBeGreaterThan(0);
    // The regression: this is the field lane's header label.
    expect(screen.queryByText('Field Supervisor')).not.toBeInTheDocument();
  });

  it('keeps Senior Management on the executive application at phone width', () => {
    window.localStorage.setItem('navis.role', 'executive');
    setViewport(375);
    renderApp();

    expect(screen.getByText('Senior Management')).toBeInTheDocument();
    expect(screen.getByText('Exposure')).toBeInTheDocument();
    expect(screen.queryByText('Field Supervisor')).not.toBeInTheDocument();
  });

  it('honours a stale mobile override without changing the role', () => {
    // A browser that used the old Force Mobile View button still has this key.
    window.localStorage.setItem('navis.role', 'planner');
    window.localStorage.setItem('view_override', 'mobile');
    renderApp();

    expect(screen.getByText('Project Manager')).toBeInTheDocument();
    expect(screen.queryByText('Field Supervisor')).not.toBeInTheDocument();
  });

  it('gives the Field Supervisor the field application', () => {
    window.localStorage.setItem('navis.role', 'field');
    renderApp();

    expect(screen.getByText('Field Supervisor')).toBeInTheDocument();
    // ...and none of the planner's screens.
    expect(screen.queryByText('Reconcile')).not.toBeInTheDocument();
    expect(screen.queryByText('Ingest')).not.toBeInTheDocument();
  });

  it('offers no control that switches application without switching role', () => {
    window.localStorage.setItem('navis.role', 'planner');
    renderApp();

    expect(screen.queryByText(/force mobile view/i)).not.toBeInTheDocument();
    // The old PLANNER | FIELD pill in the header bar.
    expect(screen.queryByRole('button', { name: /^field$/i })).not.toBeInTheDocument();
    // What remains is the honest one.
    expect(screen.getByText(/switch role/i)).toBeInTheDocument();
  });

  it('offers Senior Management no planner or field control either', () => {
    window.localStorage.setItem('navis.role', 'executive');
    renderApp();

    expect(screen.queryByText(/force mobile view/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^field$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^planner$/i })).not.toBeInTheDocument();
  });
});
