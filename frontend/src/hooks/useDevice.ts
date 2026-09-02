import { useState, useEffect } from 'react';
import { readStored, removeStored, writeStored } from '../lib/storage';

type ViewMode = 'mobile' | 'desktop';

const STORAGE_KEY = 'view_override';

/**
 * The session's forced view, when storage could not hold it.
 *
 * Module scope rather than component state on purpose: `updateDevice` runs from
 * a `resize` listener and has to see the override `setOverride` just set,
 * without the two being in the same component. When `localStorage` works this
 * mirrors it; when it does not, this is the only copy and the toggle still
 * works for the length of the session.
 */
let sessionOverride: ViewMode | null = null;

function storedOverride(): ViewMode | null {
  const value = readStored(STORAGE_KEY);
  return value === 'mobile' || value === 'desktop' ? value : null;
}

export function useDevice() {
  const [device, setDevice] = useState<ViewMode>('desktop');

  useEffect(() => {
    const updateDevice = () => {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');

      let effectiveMode: ViewMode | null = null;

      if (viewParam === 'field') {
        effectiveMode = 'mobile';
      } else if (viewParam === 'planner') {
        effectiveMode = 'desktop';
      } else {
        // Storage first, then whatever this session set. The read is guarded:
        // an unavailable localStorage used to throw right here, inside an
        // effect that runs on every mount of the shell, and took the whole app
        // down with a white screen instead of degrading to width detection.
        effectiveMode = storedOverride() ?? sessionOverride;
      }

      if (!effectiveMode) {
        effectiveMode = window.innerWidth < 768 ? 'mobile' : 'desktop';
      }

      setDevice(effectiveMode);
    };

    updateDevice();
    window.addEventListener('resize', updateDevice);
    window.addEventListener('popstate', updateDevice);
    return () => {
      window.removeEventListener('resize', updateDevice);
      window.removeEventListener('popstate', updateDevice);
    };
  }, []);

  const setOverride = (mode: ViewMode | null) => {
    // The in-memory value is set first and unconditionally, so the
    // Planner/Field toggle works even where nothing can be persisted.
    // Persistence is the best-effort half: when it succeeds the choice
    // survives a reload, and when it fails the cost is the preference on the
    // next load, not the switch now.
    sessionOverride = mode;
    if (mode) {
      writeStored(STORAGE_KEY, mode);
    } else {
      removeStored(STORAGE_KEY);
    }
    window.dispatchEvent(new Event('resize'));
  };

  return { device, setOverride };
}
