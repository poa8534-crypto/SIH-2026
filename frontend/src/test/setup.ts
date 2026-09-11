import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

/**
 * jsdom has neither of these. Providing them lets the field screen render its
 * normal states; the microphone-unavailable path is asserted separately by
 * removing the constructor again.
 */
class FakeRecognition {
  lang = 'en-IN';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: unknown = null;
  onerror: unknown = null;
  onend: unknown = null;
  onstart: unknown = null;
  start() {}
  stop() {}
  abort() {}
}

(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

/**
 * Node 26 ships an experimental `localStorage` global that is inert unless the
 * process was started with `--localstorage-file`. Vitest copies Node's globals
 * onto the jsdom window, so that inert getter shadows jsdom's real Storage and
 * `window.localStorage` reads back as `undefined` — which crashed every suite
 * whose setup or teardown calls `window.localStorage.clear()`.
 *
 * The role, the view override, the speech language and the saved discipline
 * are all localStorage-backed, so a test environment without it is not a test
 * environment for this application. Install a real in-memory Storage when the
 * platform failed to provide one. See D-103.
 */
if (typeof window !== 'undefined' && !window.localStorage) {
  const makeStorage = (): Storage => {
    let store = new Map<string, string>();
    return {
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (k: string) => (store.has(String(k)) ? store.get(String(k))! : null),
      setItem: (k: string, v: string) => void store.set(String(k), String(v)),
      removeItem: (k: string) => void store.delete(String(k)),
      clear: () => void (store = new Map()),
    } as Storage;
  };

  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(window, name, {
      value: makeStorage(),
      configurable: true,
      writable: true,
    });
  }
}
