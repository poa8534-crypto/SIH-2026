/**
 * Switching tabs must land you at the top of the new screen.
 *
 * A client-side route change does not reload the document, so nothing resets
 * the scroll position on its own: the offset that survives belongs to the page
 * the user just left. Scrolling to the bottom of Workforce and clicking
 * Schedule used to open Schedule already scrolled past its own heading, which
 * reads as a screen that failed to load.
 *
 * WHY THE HOOK IS TESTED RATHER THAN THE SHELL
 * --------------------------------------------
 * jsdom has no layout, so no element is ever actually scrollable and the real
 * `scrollTop` is pinned at 0 — rendering the whole shell would assert 0 === 0
 * and pass no matter what the code did. Defining the property on the node makes
 * the write observable, which is the only thing the hook is responsible for.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';

import { useScrollReset } from '../hooks/useScrollReset';

function Harness() {
  const ref = useScrollReset<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="scroller">
      <Link to="/workforce">Workforce</Link>
      <Link to="/schedule">Schedule</Link>
      {/* Same screen, different query: a filter change, not a navigation. */}
      <Link to="/workforce?discipline=piping">Filter</Link>
      <Routes>
        <Route path="/workforce" element={<p>workforce</p>} />
        <Route path="/schedule" element={<p>schedule</p>} />
      </Routes>
    </div>
  );
}

/** Render at /workforce and make the container's scrollTop observable. */
function mount(scrolledTo: number) {
  render(
    <MemoryRouter initialEntries={['/workforce']}>
      <Harness />
    </MemoryRouter>
  );
  const el = screen.getByTestId('scroller');
  Object.defineProperty(el, 'scrollTop', {
    value: scrolledTo,
    writable: true,
    configurable: true,
  });
  return el;
}

describe('a route change returns the workspace to the top', () => {
  it('resets the scroll container when the path changes', () => {
    const el = mount(820);
    fireEvent.click(screen.getByText('Schedule'));
    expect(screen.getByText('schedule')).toBeInTheDocument();
    expect(el.scrollTop).toBe(0);
  });

  it('leaves the position alone when only the query string changes', () => {
    const el = mount(820);
    fireEvent.click(screen.getByText('Filter'));
    // Still the same screen re-querying itself. Throwing the reader back to
    // the top here would be the bug, not the fix.
    expect(el.scrollTop).toBe(820);
  });
});
