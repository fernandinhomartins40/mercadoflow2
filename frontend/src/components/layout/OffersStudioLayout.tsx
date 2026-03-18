import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Database, Home, LogOut, Menu, Sparkles, Users } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { useSuperAdminAuth } from '../../context/SuperAdminAuthContext';
import WorkspaceSidebar, { WorkspaceNavSection } from './WorkspaceSidebar';

const OFFERS_PINNED_SIDEBAR_QUERY = '(min-width: 1024px)';

type OffersStudioLayoutMode = 'admin' | 'super-admin';

function getInitialMatch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(OFFERS_PINNED_SIDEBAR_QUERY).matches;
}

const OffersStudioLayout: React.FC<{ children: React.ReactNode; mode?: OffersStudioLayoutMode }> = ({
  children,
  mode = 'admin',
}) => {
  const { logout } = useAuth();
  const superAdminAuth = useSuperAdminAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState<boolean>(getInitialMatch);
  const isSuperAdminMode = mode === 'super-admin';
  const logoutAction = isSuperAdminMode ? superAdminAuth.logout : logout;

  const superAdminSections = useMemo<WorkspaceNavSection[]>(() => ([
    {
      title: 'Controle',
      items: [
        { to: '/super-admin', label: 'Visão geral', hint: 'Saúde da plataforma', icon: Home, exact: true },
        { to: '/super-admin/saas', label: 'Contas e acesso', hint: 'Contas e usuários', icon: Users },
      ],
    },
    {
      title: 'Dados',
      items: [
        { to: '/super-admin/catalogo', label: 'Catálogo global', hint: 'Base central de produtos', icon: Database },
        { to: '/super-admin/ofertas', label: 'Estúdio de ofertas', hint: 'Templates visuais por conta', icon: Sparkles },
        { to: '/super-admin/crawler', label: 'Crawler', hint: 'Coleta e reparo de dados', icon: Bot },
      ],
    },
  ]), []);

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
        ? 'workspace-root offers-studio-layout h-[100dvh] box-border overflow-hidden bg-[linear-gradient(180deg,#fcf8f3_0%,#f3ebe3_100%)]'
        : 'workspace-root offers-studio-layout flex h-[100dvh] box-border flex-col overflow-hidden bg-[linear-gradient(180deg,#fcf8f3_0%,#f3ebe3_100%)]'}
    >
      {isSuperAdminMode ? (
        <WorkspaceSidebar
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          desktopPinned={sidebarPinned}
          collapsed={sidebarPinned}
          desktopWidthClassName="w-[96px]"
          brandMark="SA"
          brandTitle="Super Admin"
          brandSubtitle="Estúdio central de ofertas"
          userKicker="Sessão ativa"
          userName={superAdminAuth.name || 'Super Administrador'}
          userEmail={superAdminAuth.email || 'Conta principal da plataforma'}
          userChips={[
            { label: 'Acesso total' },
            { label: 'Templates', subtle: true },
          ]}
          sections={superAdminSections}
          footer={
            sidebarPinned ? (
              <button
                type="button"
                className="inline-flex h-12 w-full items-center justify-center rounded-[18px] border border-[rgba(87,51,30,0.12)] bg-white text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.06)] transition hover:bg-[rgba(255,247,240,0.92)]"
                onClick={() => void logoutAction()}
                aria-label="Sair"
                title="Sair"
              >
                <LogOut className="h-4 w-4" strokeWidth={2.1} />
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-[rgba(87,51,30,0.12)] bg-white px-4 text-sm font-semibold text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.06)] transition hover:bg-[rgba(255,247,240,0.92)]"
                onClick={() => void logoutAction()}
              >
                <LogOut className="h-4 w-4" strokeWidth={2.1} />
                Sair
              </button>
            )
          }
        />
      ) : (
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
                className="inline-flex h-12 w-full items-center justify-center rounded-[18px] border border-[rgba(87,51,30,0.12)] bg-white text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.06)] transition hover:bg-[rgba(255,247,240,0.92)]"
                onClick={() => void logoutAction()}
                aria-label="Sair"
                title="Sair"
              >
                <LogOut className="h-4 w-4" strokeWidth={2.1} />
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-[rgba(87,51,30,0.12)] bg-white px-4 text-sm font-semibold text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.06)] transition hover:bg-[rgba(255,247,240,0.92)]"
                onClick={() => void logoutAction()}
              >
                <LogOut className="h-4 w-4" strokeWidth={2.1} />
                Sair
              </button>
            )
          }
        />
      )}

      <main className={`offers-studio-layout-main h-full min-h-0 min-w-0 overflow-hidden ${sidebarPinned ? 'pl-[96px]' : 'pt-14'}`}>
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

        <div className={sidebarPinned ? 'h-full p-4 lg:p-6' : 'h-full px-4 pb-4 sm:px-5'}>{children}</div>
      </main>
    </div>
  );
};

export default OffersStudioLayout;
