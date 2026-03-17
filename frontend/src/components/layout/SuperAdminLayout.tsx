import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Database, Home, Users } from 'lucide-react';
import Button from '../common/Button';
import WorkspaceSidebar, { WorkspaceNavSection } from './WorkspaceSidebar';
import WorkspaceTopbar from './WorkspaceTopbar';
import { useLocation } from 'react-router-dom';
import { useSuperAdminAuth } from '../../context/SuperAdminAuthContext';
import { useDesktopSidebarMode } from '../../hooks/useDesktopSidebarMode';

const TITLES: Record<string, { title: string; subtitle: string; section: string }> = {
  '/super-admin': { title: 'Visão geral', subtitle: 'Resumo da plataforma, das contas e da base de dados', section: 'Controle' },
  '/super-admin/saas': { title: 'Contas e acesso', subtitle: 'Contas, usuários, vencimentos e liberações manuais', section: 'Controle' },
  '/super-admin/catalogo': { title: 'Catálogo global', subtitle: 'Base central de produtos, ajustes manuais e revisão da qualidade', section: 'Dados' },
  '/super-admin/crawler': { title: 'Crawler', subtitle: 'Coletas, reparos e atualização de dados dos supermercados', section: 'Dados' },
};

const SuperAdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { logout, name, email } = useSuperAdminAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const desktopPinned = useDesktopSidebarMode();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (desktopPinned) {
      setSidebarOpen(false);
    }
  }, [desktopPinned]);

  const header = useMemo(() => TITLES[location.pathname] || TITLES['/super-admin'], [location.pathname]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    [],
  );

  const navSections: WorkspaceNavSection[] = [
    {
      title: 'Controle',
      items: [
        { to: '/super-admin', label: 'Visão geral', hint: 'Saúde da plataforma', icon: Home, exact: true },
        { to: '/super-admin/saas', label: 'Contas e acesso', hint: 'Contas, usuários e vencimentos', icon: Users },
      ],
    },
    {
      title: 'Dados',
      items: [
        { to: '/super-admin/catalogo', label: 'Catálogo global', hint: 'Base central de produtos', icon: Database },
        { to: '/super-admin/crawler', label: 'Crawler', hint: 'Coleta e reparo de dados', icon: Bot },
      ],
    },
  ];

  return (
    <div
      className={desktopPinned
        ? 'workspace-root super-admin-workspace grid min-h-screen grid-cols-[304px_minmax(0,1fr)] items-start gap-7 overflow-x-hidden bg-[radial-gradient(circle_at_top,#fff7f0_0%,#f8efe6_45%,#f1e6dc_100%)] p-7'
        : 'workspace-root super-admin-workspace flex min-h-screen flex-col gap-5 overflow-x-hidden bg-[radial-gradient(circle_at_top,#fff7f0_0%,#f8efe6_45%,#f1e6dc_100%)] p-4 sm:p-5'}
    >
      <WorkspaceSidebar
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        desktopPinned={desktopPinned}
        desktopWidthClassName="w-[304px]"
        brandMark="SA"
        brandTitle="Super Admin"
        brandSubtitle="Controle central da plataforma"
        userKicker="Sessão ativa"
        userName={name || 'Super Administrador'}
        userEmail={email || 'Conta principal da plataforma'}
        userChips={[
          { label: 'Acesso total' },
          { label: 'Conta principal', subtle: true },
        ]}
        sections={navSections}
        supportKicker="Fluxo sugerido"
        supportTitle="Revise contas, acompanhe o crawler e valide o catálogo"
        supportText="Essa ordem reduz erro operacional e deixa a manutenção diária mais simples."
        footer={<Button className="w-full" variant="secondary" onClick={() => logout()}>Sair</Button>}
      />

      <main className="workspace-shell-main flex min-h-[calc(100dvh-24px)] min-w-0 flex-col gap-5 overflow-x-hidden md:min-h-[calc(100dvh-56px)]">
        <WorkspaceTopbar
          section={header.section}
          title={header.title}
          subtitle={header.subtitle}
          onToggleSidebar={() => setSidebarOpen((current) => !current)}
          showMenuToggle={!desktopPinned}
          desktopPinned={desktopPinned}
          userName={name || 'Super Admin'}
          userSubtitle="Controle da plataforma"
          userInitial={(name || 'S').trim().charAt(0).toUpperCase()}
          badges={
            <>
              <span className="inline-flex min-h-9 items-center justify-center rounded-full bg-[rgba(255,106,0,0.12)] px-4 text-sm font-semibold text-[color:var(--accent-strong)]">
                Super admin
              </span>
              <span className="inline-flex min-h-9 items-center justify-center rounded-full bg-[rgba(47,23,11,0.06)] px-4 text-sm font-semibold text-[color:var(--text-muted)]">
                Atualizado em {todayLabel}
              </span>
            </>
          }
          actionSlot={<Button className="min-w-[104px]" variant="secondary" onClick={() => logout()}>Sair</Button>}
        />

        <div className="workspace-shell-content workspace-stage flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden">{children}</div>
      </main>
    </div>
  );
};

export default SuperAdminLayout;
