import { useEffect, useState } from 'react';

const DESKTOP_SIDEBAR_QUERY = '(min-width: 1537px) and (min-height: 861px)';

function getInitialMatch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(DESKTOP_SIDEBAR_QUERY).matches;
}

export function useDesktopSidebarMode(): boolean {
  const [isDesktopSidebar, setIsDesktopSidebar] = useState<boolean>(getInitialMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(DESKTOP_SIDEBAR_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktopSidebar(event.matches);
    };

    setIsDesktopSidebar(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return isDesktopSidebar;
}
