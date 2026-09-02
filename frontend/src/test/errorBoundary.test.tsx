/**
 * A boundary that has never caught anything is not known to be a boundary.
 *
 * The failure this exists for is specific: a render throw with nothing above it
 * unmounts the whole React tree and leaves a blank page — no message, no reload
 * affordance. `useDevice` touching an unavailable `localStorage` was exactly
 * that, and it took the entire app down rather than one panel. That bug is
 * fixed; the class of bug is not, and a demo is the worst place to find the
 * next one.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ErrorBoundary } from '../components/ErrorBoundary';

/** React logs caught errors to the console by design; that noise is not a failure. */
const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => quiet.mockClear());

function Boom({ fail }: { fail: boolean }) {
  if (fail) throw new TypeError('localStorage is not available');
  return <p>the real screen</p>;
}

describe('ErrorBoundary', () => {
  it('renders children untouched when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Boom fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('the real screen')).toBeTruthy();
  });

  it('catches a render throw instead of blanking the page', () => {
    render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/This screen failed to render/)).toBeTruthy();
  });

  it('shows the actual error, not a friendly nothing', () => {
    // The person reading this is a developer or a presenter mid-demo.
    // "Something went wrong" would cost them the one useful piece of information.
    render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/TypeError/)).toBeTruthy();
    expect(screen.getByText(/localStorage is not available/)).toBeTruthy();
  });

  it('offers a way back that does not require reloading', () => {
    // The fault is controlled from OUTSIDE the render on purpose. A component
    // that throws once and then succeeds never reaches the boundary at all:
    // React retries a failed render, the retry passes, and nothing is caught.
    // So the failure has to persist across retries, and then be cleared before
    // the child is asked to render again.
    let failing = true;
    function Flaky() {
      if (failing) throw new Error('transient');
      return <p>recovered</p>;
    }

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    failing = false;
    fireEvent.click(screen.getByText('Try again without reloading'));

    // A transient failure in one panel should not cost the whole session.
    expect(screen.getByText('recovered')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
