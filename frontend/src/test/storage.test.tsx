/**
 * localStorage must never be able to take the app down.
 *
 * `useDevice` read and wrote `localStorage` unguarded, inside an effect that
 * runs on every mount of the shell. In Safari private browsing, or a browser
 * set to block site data, that throws during render — a white screen for the
 * whole app, not a lost preference. It also broke three tests, which is how it
 * was noticed.
 *
 * These tests simulate the real failure modes rather than the jsdom symptom, so
 * the guard cannot regress into "works on my machine".
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import { readStored, writeStored, removeStored } from '../lib/storage';
import { useDevice } from '../hooks/useDevice';

/** Restores whatever the environment really had, after each case. */
let original: PropertyDescriptor | undefined;

beforeEach(() => {
  original = Object.getOwnPropertyDescriptor(window, 'localStorage');
});

afterEach(() => {
  if (original) Object.defineProperty(window, 'localStorage', original);
});

/** Every access throws — Safari private browsing, and blocked site data. */
function makeStorageThrow() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
  });
}

/** The global exists but is undefined — some embedded and test runtimes. */
function makeStorageUndefined() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: undefined,
  });
}

describe('storage helpers are total', () => {
  it('a read returns null rather than throwing', () => {
    makeStorageThrow();
    expect(readStored('view_override')).toBeNull();
  });

  it('a write reports failure rather than throwing', () => {
    makeStorageThrow();
    expect(writeStored('view_override', 'mobile')).toBe(false);
    expect(removeStored('view_override')).toBe(false);
  });

  it('an undefined localStorage is handled, not just a throwing one', () => {
    makeStorageUndefined();
    expect(readStored('view_override')).toBeNull();
    expect(writeStored('view_override', 'mobile')).toBe(false);
  });

  it('a working localStorage still round-trips', () => {
    // Installed explicitly. This runner has NO usable localStorage of its own —
    // Node exposes the global as undefined unless started with
    // --localstorage-file, and that is precisely why three tests were failing
    // before the guard existed. Asserting the happy path therefore needs a real
    // one, or this case would only ever prove the failure path twice.
    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });

    expect(writeStored('probe_key', 'value')).toBe(true);
    expect(readStored('probe_key')).toBe('value');
    expect(removeStored('probe_key')).toBe(true);
    expect(readStored('probe_key')).toBeNull();
  });
});

function Probe() {
  const { device, setOverride } = useDevice();
  return (
    <div>
      <span data-testid="device">{device}</span>
      <button onClick={() => setOverride('mobile')}>force mobile</button>
    </div>
  );
}

describe('useDevice survives unusable storage', () => {
  it('renders instead of throwing when every access fails', () => {
    makeStorageThrow();
    render(<Probe />);
    // Falls back to width detection rather than crashing the shell.
    expect(screen.getByTestId('device').textContent).toMatch(/mobile|desktop/);
  });

  it('the role toggle still works when nothing can be persisted', () => {
    makeStorageThrow();
    render(<Probe />);
    act(() => {
      fireEvent.click(screen.getByText('force mobile'));
    });
    // The in-memory override carries the session: the switch is not lost just
    // because the preference could not be saved for next time.
    expect(screen.getByTestId('device').textContent).toBe('mobile');
  });
});
