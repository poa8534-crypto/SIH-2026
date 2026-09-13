import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Send a workspace's scroll container back to the top when the route changes.
 *
 * WHY THIS IS NOT THE BROWSER'S JOB
 * ---------------------------------
 * A full page load starts at the top. A client-side route change does not: the
 * document never navigates, so nothing resets. The scroll position that
 * survives belongs to the page the user just left.
 *
 * WHY <ScrollRestoration> DOES NOT APPLY
 * --------------------------------------
 * react-router's helper drives `window`, and in both shells `window` does not
 * scroll — `<div class="h-[100dvh] overflow-hidden">` pins the viewport and the
 * scrolling element is the inner `<main>`. The element has to be reset by hand,
 * which is what the returned ref is for. (It is also router-data-mode only, and
 * these shells use `<BrowserRouter>`.)
 *
 * `scrollTop = 0` rather than `scrollTo({behavior})`: the jump should be
 * instant, since a smooth scroll on a screen the user has not seen yet is
 * motion with nothing to read, and assigning the property works under jsdom
 * where `Element.prototype.scrollTo` is not implemented.
 *
 * Keyed on `pathname` alone. A change of `search` or `hash` is the same screen
 * re-querying itself or pointing at an anchor inside it, and throwing the
 * reader back to the top there would be the bug rather than the fix.
 */
export function useScrollReset<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = 0;
  }, [pathname]);

  return ref;
}
