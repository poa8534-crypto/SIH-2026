/**
 * localStorage that cannot take the app down.
 *
 * `localStorage` is not always there and not always writable:
 *
 *   - Safari private browsing throws on `setItem` once the (zero) quota is hit;
 *   - a browser set to block site data throws on plain `getItem`;
 *   - some embedded and test runtimes expose a `localStorage` global that is
 *     `undefined`, so even reading a property off it throws a TypeError.
 *
 * `useDevice` read and wrote it unguarded, inside an effect that runs on every
 * mount of the shell. Any of the above meant a `TypeError` during render and a
 * white screen — the whole app, not one feature. `useTheme` already wrapped its
 * own access in a try/catch for exactly this reason; this module is that
 * defence in one place, so the next hook cannot forget it.
 *
 * Every function is total: a read returns `null` when storage is unavailable,
 * and a write reports whether it persisted rather than throwing. Callers decide
 * what a failed write means — for a preference, the answer is usually "keep it
 * in memory for this session and carry on".
 */

/** Read a key. `null` when absent, or when storage cannot be read at all. */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a key. Returns false when it could not be persisted. */
export function writeStored(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Remove a key. Returns false when storage could not be written. */
export function removeStored(key: string): boolean {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
