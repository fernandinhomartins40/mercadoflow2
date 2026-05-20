import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Boxes,
  FileImage,
  LayoutTemplate,
  LogOut,
  Menu,
  Sparkles,
  X,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useOffersAppSession } from '../../hooks/useOffersAppSession';
import { cn } from '../../lib/cn';

const OFFERS_PINNED_SIDEBAR_QUERY = '(min-width: 1024px)';

function getInitialMatch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(OFFERS_PINNED_SIDEBAR_QUERY).matches;
}

const OffersStudioLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { buildUrl, dashboardHref, isSuperAdminMode, logout, userEmail, userName } = useOffersAppSession();
  const [navOpen, setNavOpen] = useState(false);
  const [navPinned, setNavPinned] = useState<boolean>(getInitialMatch);
  const isEditorRoute = location.pathname === '/ofertas';
  const showAppRail = !isEditorRoute;

  const navItems = useMemo(
    () => (isSuperAdminMode
      ? [
          { to: buildUrl('/ofertas'), label: 'Templates', icon: LayoutTemplate, exact: true },
        ]
      : [
          { to: buildUrl('/ofertas'), label: 'Criar encarte', icon: Sparkles, exact: true },
          { to: buildUrl('/ofertas/campanhas'), label: 'Meus encartes', icon: Boxes },
          { to: buildUrl('/ofertas/jobs'), label: 'Arquivos prontos', icon: FileImage },
        ]),
    [buildUrl, isSuperAdminMode],
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(OFFERS_PINNED_SIDEBAR_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setNavPinned(event.matches);
      if (event.matches) {
        setNavOpen(false);
      }
    };

    setNavPinned(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div className="workspace-root offers-studio-layout h-[100dvh] box-border overflow-hidden" style={{ background: 'var(--surface-soft)' }}>
      {!navPinned && showAppRail ? (
        <button
          type="button"
          className={cn(
            'fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition duration-200',
            navOpen ? 'visible opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={() => setNavOpen(false)}
          aria-label="Fechar menu do modulo"
        />
      ) : null}

      {showAppRail ? (
        <aside
          className={cn(
            'offers-app-rail',
            navPinned ? 'offers-app-rail-desktop' : 'offers-app-rail-mobile',
            navPinned || navOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-[110%] opacity-0',
          )}
        >
          <div className="offers-app-brand">
            <div className="offers-app-brand-mark">{isSuperAdminMode ? 'SA' : 'MF'}</div>
            <div className="offers-app-brand-copy">
              <strong>Ofertas</strong>
              <span>{isSuperAdminMode ? 'Templates da plataforma' : 'Campanhas do mercado'}</span>
            </div>
            {!navPinned ? (
              <button
                type="button"
                className="offers-app-close"
                onClick={() => setNavOpen(false)}
                aria-label="Fechar menu do modulo"
              >
                <X className="h-4 w-4" strokeWidth={2.2} />
              </button>
            ) : null}
          </div>

          <nav className="offers-app-nav">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) => cn('offers-app-nav-item', isActive && 'active')}
              >
                <item.icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="offers-app-rail-footer">
            <NavLink to={dashboardHref} className="offers-app-utility">
              <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.1} />
              <span>Voltar</span>
            </NavLink>
            <button type="button" className="offers-app-utility" onClick={() => void logout()}>
              <LogOut className="h-[18px] w-[18px]" strokeWidth={2.1} />
              <span>Sair</span>
            </button>
          </div>
        </aside>
      ) : null}

      <main className={cn('offers-studio-layout-main h-full min-h-0 min-w-0 w-full overflow-hidden', showAppRail && navPinned ? 'pl-[96px]' : '', showAppRail && !navPinned ? 'pt-14' : '')}>
        {!navPinned && showAppRail ? (
          <button
            type="button"
            className="fixed left-4 top-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-xl transition hover:-translate-y-px"
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
            onClick={() => setNavOpen(true)}
            aria-label="Abrir menu do modulo"
          >
            <Menu className="h-4 w-4" strokeWidth={2.2} />
          </button>
        ) : null}

        <div className={cn(
          'flex h-full min-h-0 w-full flex-col overflow-hidden',
          showAppRail ? (navPinned ? 'p-3 lg:p-4' : 'px-4 pb-4 sm:px-5') : 'p-0',
        )}>
          <div
            className={cn('offers-app-body w-full', showAppRail ? 'rounded-2xl' : '')}
            style={showAppRail ? { border: '1px solid var(--border-soft)', background: 'var(--surface-base)' } : {}}
          >
            {showAppRail ? (
              <div className="offers-app-floating-session">
                <span className="offers-app-session-role">{isSuperAdminMode ? 'Super admin' : 'Admin'}</span>
                <strong>{userName}</strong>
                <small>{userEmail}</small>
              </div>
            ) : null}
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default OffersStudioLayout;
