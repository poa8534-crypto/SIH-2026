import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AskNavisChat } from '../components/AskNavisChat';
import { api } from '../lib/api';

describe('AskNavisChat component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <MemoryRouter>
        <AskNavisChat isOpen={false} onClose={() => {}} role="planner" />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog, role badge, and starter prompts when isOpen is true', () => {
    render(
      <MemoryRouter>
        <AskNavisChat isOpen={true} onClose={() => {}} role="field" />
      </MemoryRouter>
    );
    expect(screen.getByRole('dialog', { name: /ask navis assistant/i })).toBeInTheDocument();
    expect(screen.getByText('field')).toBeInTheDocument();
    expect(screen.getByText('How do I report spool erection?')).toBeInTheDocument();
  });

  it('sends inquiry and renders grounded response with citations and actions', async () => {
    const spy = vi.spyOn(api, 'askChat').mockResolvedValue({
      answer: 'To report piping progress, specify spool number and quantity.',
      citations: ['PIP-ERC-1034', 'Sector A'],
      grounded: true,
      model_available: false,
      suggested_actions: [
        {
          type: 'insert_draft',
          label: 'Insert into report draft',
          text: 'Poured spool erection on 24-inch header at Sector A',
        },
      ],
    });

    const onInsertDraft = vi.fn();
    const onClose = vi.fn();

    render(
      <MemoryRouter>
        <AskNavisChat
          isOpen={true}
          onClose={onClose}
          role="field"
          onInsertDraft={onInsertDraft}
        />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(/ask about reporting/i);
    fireEvent.change(input, { target: { value: 'How do I report spool erection?' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(spy).toHaveBeenCalledWith({
      question: 'How do I report spool erection?',
      role: 'field',
    }));

    expect(await screen.findByText(/To report piping progress/i)).toBeInTheDocument();
    expect(screen.getByText('PIP-ERC-1034')).toBeInTheDocument();
    expect(screen.getByText('Sector A')).toBeInTheDocument();

    const actionBtn = screen.getByText('Insert into report draft');
    expect(actionBtn).toBeInTheDocument();
    fireEvent.click(actionBtn);

    expect(onInsertDraft).toHaveBeenCalledWith('Poured spool erection on 24-inch header at Sector A');
    expect(onClose).toHaveBeenCalled();
  });

  it('clears conversation when reset button is tapped', async () => {
    vi.spyOn(api, 'askChat').mockResolvedValue({
      answer: 'Projected completion outlook is on track.',
      citations: ['EVM Engine'],
      grounded: true,
      model_available: false,
      suggested_actions: [],
    });

    render(
      <MemoryRouter>
        <AskNavisChat isOpen={true} onClose={() => {}} role="executive" />
      </MemoryRouter>
    );

    const starter = screen.getByText('What is our projected completion date?');
    fireEvent.click(starter);

    expect(await screen.findByText(/Projected completion outlook is on track/i)).toBeInTheDocument();

    const clearBtn = screen.getByTitle('Clear conversation');
    fireEvent.click(clearBtn);

    expect(screen.queryByText(/Projected completion outlook is on track/i)).toBeNull();
    expect(screen.getByText('How can NAVIS assist you?')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <AskNavisChat isOpen={true} onClose={onClose} role="planner" />
      </MemoryRouter>
    );

    const closeBtn = screen.getByLabelText('Close Ask NAVIS');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
