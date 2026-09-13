/**
 * Picking a role starts at that role's home screen.
 *
 * The picker renders before <BrowserRouter>, so the router mounts at whatever
 * URL the browser is on — and a browser restoring a session reopens the last
 * one. Closing the tab on /reconcile and coming back dropped a Project Manager
 * straight onto Review & Reconcile as soon as they picked their role, which
 * reads as the app having ignored the click.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from '../App';
import { ROLE_PROFILES } from '../lib/role';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: new Proxy(
      {},
      {
        // Every screen behind the picker fetches something. The landing route
        // is what is under test, not what it renders, so each call resolves
        // empty rather than being stubbed one by one.
        get: () => vi.fn().mockResolvedValue([]),
      }
    ),
  };
});

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  // The browser reopened the tab where the user left it.
  window.history.replaceState(null, '', '/reconcile');
});

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('signing in lands on the role home, not the last URL', () => {
  it('sends the Project Manager to the overview, not back to Review & Reconcile', async () => {
    wrap();
    expect(window.location.pathname).toBe('/reconcile');

    fireEvent.click(await screen.findByText('Project Manager / Planner'));
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));

    await waitFor(() =>
      expect(window.location.pathname).toBe(ROLE_PROFILES.planner.home)
    );
    expect(window.location.pathname).toBe('/home');
  });

  it('sends Senior Management to the executive overview', async () => {
    wrap();
    fireEvent.click(await screen.findByText('Senior Management'));
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));

    await waitFor(() =>
      expect(window.location.pathname).toBe(ROLE_PROFILES.executive.home)
    );
  });

  it('sends the Field Supervisor to the field lane', async () => {
    wrap();
    fireEvent.click(await screen.findByText('Field Supervisor'));
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));

    await waitFor(() =>
      expect(window.location.pathname).toBe(ROLE_PROFILES.field.home)
    );
  });
});
