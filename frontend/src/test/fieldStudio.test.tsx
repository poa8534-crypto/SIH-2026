import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ReportStudio from '../pages/field/ReportStudio';
import UpdatesLedger from '../pages/field/UpdatesLedger';
import { SessionContext } from '../hooks/useSession';
import { api } from '../lib/api';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={{ role: 'field', signOut: vi.fn() }}>
        <MemoryRouter>{ui}</MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>
  );
}

describe('ReportStudio', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders 2-step progress verification and photo attachment card', () => {
    wrap(<ReportStudio />);

    expect(screen.getByText('Report Progress')).toBeInTheDocument();
    expect(screen.getByText('STEP 1 OF 2')).toBeInTheDocument();
    expect(screen.getByText(/P-201 spool erection is complete/i)).toBeInTheDocument();
    expect(screen.getByText('IMG_8821_joint.jpg')).toBeInTheDocument();
    expect(screen.getByText(/GPS VERIFIED/i)).toBeInTheDocument();
    expect(screen.getByText(/NAVIS understood/i)).toBeInTheDocument();
    expect(screen.getAllByText(/ACT-PIP-201-04/).length).toBeGreaterThan(0);
    expect(screen.getByText('Field Update Assistant')).toBeInTheDocument();
  });

  it('sends interactive chat response to update assistant', () => {
    wrap(<ReportStudio />);

    const chatInput = screen.getByPlaceholderText(/Reply or provide additional site details/i);
    fireEvent.change(chatInput, { target: { value: 'Confirmed by QA Inspector Sharma' } });
    fireEvent.submit(chatInput.closest('form')!);

    expect(screen.getByText('Confirmed by QA Inspector Sharma')).toBeInTheDocument();
  });

  it('submits report to planner review', async () => {
    const turnSpy = vi.spyOn(api, 'agentTurn').mockResolvedValue({
      session_id: 's1',
      agent_message: 'Received',
      slots: {} as never,
      missing_slots: [],
      pending_slots: [],
      awaiting_confirmation: false,
      event_created: true,
      discipline: 'piping',
      discipline_label: 'Piping',
      status_label: 'Completed',
    } as never);

    wrap(<ReportStudio />);
    const submitBtn = screen.getByText(/Send to planner review/i);
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Dispatched to Project Controls')).toBeInTheDocument();
    expect(turnSpy).toHaveBeenCalled();
  });
});

describe('UpdatesLedger', () => {
  it('renders master-detail audit trail with photo Exif and 6 schedule parameters', () => {
    wrap(<UpdatesLedger />);

    expect(screen.getByText('My Updates')).toBeInTheDocument();
    expect(screen.getByText('OIL WELL-SITE DULIAJAN')).toBeInTheDocument();
    expect(screen.getAllByText('P-201 spool erection completed').length).toBeGreaterThan(0);
    expect(screen.getByText('SUBMITTED FIELD NOTE')).toBeInTheDocument();
    expect(screen.getByText('EXTRACTED SCHEDULE PARAMETERS')).toBeInTheDocument();
    expect(screen.getByText('Matched Activity')).toBeInTheDocument();
    expect(screen.getByText('WBS Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Physical % Complete')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Planner Verification')).toBeInTheDocument();
    expect(screen.getByText('REVIEW OUTCOME & BASELINE IMPACT')).toBeInTheDocument();
  });

  it('filters updates by status', () => {
    wrap(<UpdatesLedger />);

    fireEvent.click(screen.getByText(/Pending \(1\)/i));
    expect(screen.getAllByText('P-201 spool erection completed').length).toBeGreaterThan(0);
    expect(screen.queryByText('Cable pulling from Substation 02')).toBeNull();
  });
});
