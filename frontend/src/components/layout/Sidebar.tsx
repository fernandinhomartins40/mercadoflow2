import React from 'react';
import {
  Bell,
  Database,
  Download,
  Home,
  Link2,
  Megaphone,
  PackageSearch,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import WorkspaceSidebar, { WorkspaceNavSection } from './WorkspaceSidebar';

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
  desktopPinned: boolean;
  collapsed?: boolean;
  desktopWidthClassName?: string;
  footer?: React.ReactNode;
}

const Sidebar: React.FC<SidebarProps> = ({
  mobileOpen,
  onClose,
  desktopPinned,
  collapsed = false,
  desktopWidthClassName,
  footer,
}) => {
  const { role, name, email } = useAuth();
  const isAdmin = role === 'ADMIN';

  const sections: WorkspaceNavSection[] = [
    {
      title: 'Visão do negócio',
      items: [
        { to: '/app', label: 'Painel geral', hint: 'Resumo diário e prioridades', icon: Home, exact: true },
        { to: '/app/produtos', label: 'Produtos', hint: 'Giro, tendência e elasticidade', icon: PackageSearch },
        { to: '/app/alertas', label: 'Alertas', hint: 'Sinais que pedem ação imediata', icon: Bell },
      ],
    },
    {
      title: 'Análise e operação',
      items: [
        { to: '/app/cesta', label: 'Compra casada', hint: 'Combos e afinidade de itens', icon: Link2 },
        { to: '/app/lista-compras', label: 'Lista de compras', hint: 'Compra guiada por venda e sazonalidade', icon: ShoppingCart },
        { to: '/ofertas?workspace=admin', label: 'Estúdio de ofertas', hint: 'Criar encartes e peças promocionais', icon: Sparkles },
        { to: '/app/previsao-demanda', label: 'Previsão', hint: 'Planejamento de demanda', icon: TrendingUp },
        { to: '/app/campanhas', label: 'Campanhas', hint: 'Impacto antes, durante e depois', icon: Megaphone },
        { to: '/app/pdvs', label: 'PDVs', hint: 'Origem operacional das vendas', icon: Store },
      ],
    },
    {
      title: 'Configuração',
      items: [
        ...(isAdmin ? [{ to: '/app/admin/catalogo', label: 'Catálogo global', hint: 'Base consolidada de produtos', icon: Database }] : []),
        { to: '/app/download-agente', label: 'Download do agente', hint: 'Instalação do coletor local', icon: Download },
        { to: '/app/configuracoes', label: 'Configurações', hint: 'Acesso e integrações', icon: Settings },
      ],
    },
  ];

  return (
    <WorkspaceSidebar
      mobileOpen={mobileOpen}
      onClose={onClose}
      desktopPinned={desktopPinned}
      collapsed={collapsed}
      desktopWidthClassName={desktopWidthClassName}
      brandMark="MF"
      brandTitle="MercadoFlow"
      brandSubtitle="Painel operacional para decisão no varejo"
      userKicker="Workspace atual"
      userName={name || 'Usuário logado'}
      userEmail={email || 'Conta sem e-mail visível'}
      userChips={[
        { label: role === 'ADMIN' ? 'Administrador' : 'Operação' },
        { label: 'MercadoFlow', subtle: true },
      ]}
      sections={sections}
      supportKicker="Fluxo recomendado"
      supportTitle="Comece em Produtos e feche em Alertas"
      supportText="O caminho mais simples para ler o negócio é analisar o item, validar a compra e só depois agir no operacional."
      footer={footer}
    />
  );
};

export default Sidebar;
