import React, { useEffect, useMemo, useState } from 'react';
import { Bot, ClipboardCheck, CreditCard, Database, Globe2, Home, Palette, Receipt, Sparkles, UserSquare2, Users } from 'lucide-react';
import Button from '../common/Button';
import WorkspaceSidebar, { WorkspaceNavSection } from './WorkspaceSidebar';
import WorkspaceTopbar from './WorkspaceTopbar';
import { useLocation } from 'react-router-dom';
import { useSuperAdminAuth } from '../../context/SuperAdminAuthContext';
import { useDesktopSidebarMode } from '../../hooks/useDesktopSidebarMode';
import { FEATURE_OFFER_TEMPLATES_ENABLED, FEATURE_STATE_PRICES_ENABLED } from '../../config/features';

const TITLES: Record<string, { title: string; subtitle: string; section: string }> = {
  '/super-admin': { title: 'Visão geral', subtitle: 'Resumo da plataforma, das contas e da base de dados', section: 'Controle' },
  '/super-admin/saas': { title: 'Contas e acesso', subtitle: 'Contas, usuários, vencimentos e liberações manuais', section: 'Controle' },
  '/super-admin/catalogo': { title: 'Catálogo global', subtitle: 'Base central de produtos, ajustes manuais e revisão da qualidade', section: 'Dados' },
  '/super-admin/precos-estaduais': { title: 'Preços estaduais', subtitle: 'Comparação dos preços praticados entre estados e fontes oficiais', section: 'Dados' },
  '/super-admin/crawler': { title: 'Crawler', subtitle: 'Coletas, reparos e atualização de dados dos supermercados', section: 'Dados' },
  '/super-admin/ofertas': { title: 'Templates de ofertas', subtitle: 'Base visual compartilhada para as contas da plataforma', section: 'Dados' },
  '/super-admin/confere': { title: 'Confere', subtitle: 'App grátis de conferência: leitura de notas, créditos e pagamentos', section: 'Conteúdo' },
  '/super-admin/temas': { title: 'Temas de encarte', subtitle: 'Fundos, selos e áreas que o editor dos mercados usa para montar as artes', section: 'Conteúdo' },
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

  const header = useMemo(() => {
    if (TITLES[location.pathname]) return TITLES[location.pathname];
    const prefix = Object.keys(TITLES).find((key) => key !== '/super-admin' && location.pathname.startsWith(`${key}/`));
    return prefix ? TITLES[prefix] : TITLES['/super-admin'];
  }, [location.pathname]);

  const navSections: WorkspaceNavSection[] = [
    {
      title: 'Controle',
      items: [
        { to: '/super-admin', label: 'Visão geral', hint: 'Saúde da plataforma', icon: Home, exact: true },
        { to: '/super-admin/saas', label: 'Contas e usuários', hint: 'Mercados e acessos', icon: Users },
      ],
    },
    {
      title: 'Comercial',
      items: [
        { to: '/super-admin/clientes', label: 'Clientes', hint: 'Ficha, saude e follow-ups', icon: UserSquare2 },
        { to: '/super-admin/assinaturas', label: 'Assinaturas', hint: 'Planos, precos e contratos', icon: CreditCard },
        { to: '/super-admin/cobranca', label: 'Cobranca', hint: 'Inadimplencia e regua', icon: Receipt },
      ],
    },
    {
      title: 'Dados',
      items: [
        { to: '/super-admin/catalogo', label: 'Catálogo global', hint: 'Base central de produtos', icon: Database },
        { to: '/super-admin/precos-estaduais', label: 'Preços estaduais', hint: 'Comparação entre estados', icon: Globe2 },
        { to: '/ofertas?workspace=super-admin', label: 'Templates de ofertas', hint: 'Base visual por conta', icon: Sparkles },
        { to: '/super-admin/crawler', label: 'Crawler', hint: 'Coleta e reparo de dados', icon: Bot },
      ],
    },
    {
      title: 'Conteúdo',
      items: [
        { to: '/super-admin/temas', label: 'Temas de encarte', hint: 'Fundos, selos e áreas com IA', icon: Palette },
        { to: '/super-admin/confere', label: 'Confere', hint: 'Leitura de notas e créditos', icon: ClipboardCheck },
      ],
    },
  ].map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.to === '/super-admin/precos-estaduais') {
        return FEATURE_STATE_PRICES_ENABLED;
      }
      if (item.to === '/ofertas?workspace=super-admin') {
        return FEATURE_OFFER_TEMPLATES_ENABLED;
      }
      return true;
    }),
  }));

  return (
    <div
      className={desktopPinned
        ? 'workspace-root super-admin-workspace lg-canvas min-h-screen overflow-x-hidden'
        : 'workspace-root super-admin-workspace lg-canvas flex min-h-screen flex-col overflow-x-hidden'}
    >
      <WorkspaceSidebar
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        desktopPinned={desktopPinned}
        desktopWidthClassName="w-64"
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
      />

      <main className={desktopPinned
        ? 'workspace-shell-main flex min-h-screen min-w-0 flex-col overflow-x-hidden pl-64'
        : 'workspace-shell-main flex min-h-screen min-w-0 flex-col overflow-x-hidden'}
      >
        <WorkspaceTopbar
          section={header.section}
          title={header.title}
          onToggleSidebar={() => setSidebarOpen((current) => !current)}
          showMenuToggle={!desktopPinned}
          actionSlot={<Button className="min-w-[104px]" variant="secondary" onClick={() => logout()}>Sair</Button>}
        />

        <div className="workspace-shell-content flex min-h-0 flex-1 overflow-x-hidden px-4 pb-8 pt-4 sm:px-6 sm:pt-6 lg:px-8">
          <div className="workspace-stage flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden">{children}</div>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminLayout;
