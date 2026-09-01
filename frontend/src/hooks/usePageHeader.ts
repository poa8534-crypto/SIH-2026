import { createContext, useContext, useLayoutEffect } from 'react';

export type PageHeader = {
  /** Rendered as the headline in the top bar. */
  title: string;
  /** One line under the title. Keep it to a sentence. */
  subtitle: string;
  /** The route this header belongs to. See below. */
  path: string;
};

/**
 * The shell owns the top bar, but only the page knows what it is called and
 * what it is for. Rather than the shell keeping a path -> title table that
 * has to be edited every time a route is added, each page declares its own
 * header and the shell renders whatever the current page published.
 *
 * The context value is the setter itself, so a page can publish without the
 * shell re-rendering anything it does not need to.
 */
export const PageHeaderContext = createContext<
  ((header: PageHeader | null) => void) | null
>(null);

/**
 * Publish this page's title and subtitle to the surrounding shell.
 *
 * Call it once, unconditionally, at the top of a page component.
 *
 * Two details stop the title flashing on navigation, which it used to do on
 * every route change and most visibly on Home ("Home" -> "Project Control"):
 *
 *  - `useLayoutEffect`, not `useEffect`, so the incoming page's title is set
 *    before the browser paints rather than one frame after it.
 *  - The header carries the path it belongs to, and there is no unmount
 *    cleanup. Clearing on unmount was the actual bug: React runs the outgoing
 *    page's cleanup before the incoming page's effect, so there was always a
 *    frame with no header, which fell back to the nav label. The shell now
 *    ignores a header whose `path` is not the current route, which gets the
 *    same protection — a route that never calls this hook does not inherit the
 *    previous page's title — without the blank frame.
 */
export function usePageHeader(title: string, subtitle: string, path: string) {
  const publish = useContext(PageHeaderContext);

  useLayoutEffect(() => {
    if (!publish) return; // rendered outside DesktopShell, e.g. in a test
    publish({ title, subtitle, path });
  }, [publish, title, subtitle, path]);
}
