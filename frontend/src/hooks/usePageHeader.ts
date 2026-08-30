import { createContext, useContext, useEffect } from 'react';

export type PageHeader = {
  /** Rendered as the headline in the top bar. */
  title: string;
  /** One line under the title. Keep it to a sentence. */
  subtitle: string;
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
 * Call it once, unconditionally, at the top of a page component. On unmount
 * the header is cleared, so a route that has not adopted this hook falls back
 * to the shell's default rather than inheriting the previous page's title.
 */
export function usePageHeader(title: string, subtitle: string) {
  const publish = useContext(PageHeaderContext);

  useEffect(() => {
    if (!publish) return; // rendered outside DesktopShell, e.g. in a test
    publish({ title, subtitle });
    return () => publish(null);
  }, [publish, title, subtitle]);
}
