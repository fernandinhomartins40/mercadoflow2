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
      title: 'VisÃ£o do negÃ³cio',
      items: [
        { to: '/app', label: 'Painel geral', hint: 'Resumo diÃ¡rio e prioridades', icon: Home, exact: true },
        { to: '/app/produtos', label: 'Produtos', hint: 'Giro, tendÃªncia e elasticidade', icon: PackageSearch },
        { to: '/app/alertas', label: 'Alertas', hint: 'Sinais que pedem aÃ§Ã£o imediata', icon: Bell },
      ],
    },
    {
      title: 'AnÃ¡lise e operaÃ§Ã£o',
      items: [
        { to: '/app/cesta', label: 'Compra casada', hint: 'Combos e afinidade de itens', icon: Link2 },
        { to: '/app/lista-compras', label: 'Lista de compras', hint: 'Compra guiada por venda e sazonalidade', icon: ShoppingCart },
        { to: '/ofertas?workspace=admin', label: 'EstÃºdio de ofertas', hint: 'Criar encartes e peÃ§as promocionais', icon: Sparkles },
        { to: '/app/previsao-demanda', label: 'PrevisÃ£o', hint: 'Planejamento de demanda', icon: TrendingUp },
        { to: '/app/campanhas', label: 'Campanhas', hint: 'Impacto antes, durante e depois', icon: Megaphone },
        { to: '/app/pdvs', label: 'PDVs', hint: 'Origem operacional das vendas', icon: Store },
      ],
    },
    {
      title: 'ConfiguraÃ§Ã£o',
      items: [
        ...(isAdmin ? [{ to: '/app/admin/catalogo', label: 'CatÃ¡logo global', hint: 'Base consolidada de produtos', icon: Database }] : []),
        { to: '/app/download-agente', label: 'Download do agente', hint: 'InstalaÃ§Ã£o do coletor local', icon: Download },
        { to: '/app/configuracoes', label: 'ConfiguraÃ§Ãµes', hint: 'Acesso e integraÃ§Ãµes', icon: Settings },
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
      brandSubtitle="Painel operacional para decisÃ£o no varejo"
      userKicker="Workspace atual"
      userName={name || 'UsuÃ¡rio logado'}
      userEmail={email || 'Conta sem e-mail visÃ­vel'}
      userChips={[
        { label: role === 'ADMIN' ? 'Administrador' : 'OperaÃ§Ã£o' },
        { label: 'MercadoFlow', subtle: true },
      ]}
      sections={sections}
      supportKicker="Fluxo recomendado"
      supportTitle="Comece em Produtos e feche em Alertas"
      supportText="O caminho mais simples para ler o negÃ³cio Ã© analisar o item, validar a compra e sÃ³ depois agir no operacional."
      footer={footer}
    />
  );
};

export default Sidebar;
