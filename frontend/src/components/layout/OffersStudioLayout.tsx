import React, { useEffect, useState } from 'react';
import { LogOut, Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';

const OFFERS_PINNED_SIDEBAR_QUERY = '(min-width: 1024px)';

function getInitialMatch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(OFFERS_PINNED_SIDEBAR_QUERY).matches;
}

const OffersStudioLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState<boolean>(getInitialMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(OFFERS_PINNED_SIDEBAR_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setSidebarPinned(event.matches);
      if (event.matches) {
        setSidebarOpen(false);
      }
    };

    setSidebarPinned(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return (
    <div
      className={sidebarPinned
        ? 'workspace-root offers-studio-layout grid h-[100dvh] box-border grid-cols-[96px_minmax(0,1fr)] gap-6 overflow-hidden bg-[radial-gradient(circle_at_top,#fff7f0_0%,#f8efe6_45%,#f1e6dc_100%)] p-6'
        : 'workspace-root offers-studio-layout flex h-[100dvh] box-border flex-col gap-4 overflow-hidden bg-[radial-gradient(circle_at_top,#fff7f0_0%,#f8efe6_45%,#f1e6dc_100%)] p-4'}
    >
      <Sidebar
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        desktopPinned={sidebarPinned}
        collapsed={sidebarPinned}
        desktopWidthClassName="w-[96px]"
        footer={
          sidebarPinned ? (
            <button
              type="button"
              className="inline-flex h-12 w-full items-center justify-center rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.06)] text-[rgba(255,235,220,0.9)] transition hover:bg-[rgba(255,255,255,0.12)]"
              onClick={() => void logout()}
              aria-label="Sair"
              title="Sair"
            >
              <LogOut className="h-4 w-4" strokeWidth={2.1} />
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.06)] px-4 text-sm font-semibold text-[rgba(255,235,220,0.9)] transition hover:bg-[rgba(255,255,255,0.12)]"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" strokeWidth={2.1} />
              Sair
            </button>
          )
        }
      />

      <main className={`offers-studio-layout-main h-full min-w-0 min-h-0 overflow-hidden ${sidebarPinned ? '' : 'pt-14'}`}>
        {!sidebarPinned ? (
          <button
            type="button"
            className="fixed left-4 top-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-[rgba(87,51,30,0.12)] bg-white text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.08)] transition hover:-translate-y-px hover:bg-[rgba(255,247,240,0.92)]"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu lateral"
          >
            <Menu className="h-4 w-4" strokeWidth={2.2} />
          </button>
        ) : null}

        {children}
      </main>
    </div>
  );
};

export default OffersStudioLayout;
