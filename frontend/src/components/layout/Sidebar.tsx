import React from 'react';
import {
  Bell,
  Database,
  Globe2,
  Home,
  Link2,
  Map,
  Megaphone,
  PackageSearch,
  Settings,
  ShoppingCart,
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
      title: 'Hoje',
      items: [
        { to: '/app', label: 'Painel do dia', hint: 'O que precisa da sua atenção agora', icon: Home, exact: true },
        { to: '/app/alertas', label: 'Alertas', hint: 'Sinais que pedem ação imediata', icon: Bell },
      ],
    },
    {
      title: 'Produtos',
      items: [
        { to: '/app/produtos', label: 'Catálogo', hint: 'Como seus produtos estão vendendo', icon: PackageSearch },
        { to: '/app/cesta', label: 'Combos', hint: 'Produtos que vendem juntos', icon: Link2 },
        { to: '/app/lista-compras', label: 'Pedido inteligente', hint: 'Compra guiada por vendas reais', icon: ShoppingCart },
      ],
    },
    {
      title: 'Estratégia',
      items: [
        { to: '/app/campanhas', label: 'Promoções', hint: 'Resultado das suas ações promocionais', icon: Megaphone },
        { to: '/app/mapa-loja', label: 'Mapa da loja', hint: 'Organize produtos para vender mais', icon: Map },
        { to: '/app/previsao-demanda', label: 'Previsão', hint: 'Antecipe a demanda dos próximos dias', icon: TrendingUp },
      ],
    },
    {
      title: 'Configuração',
      items: [
        ...(isAdmin ? [{ to: '/app/admin/catalogo', label: 'Catálogo global', hint: 'Base consolidada de produtos', icon: Database }] : []),
        ...(isAdmin ? [{ to: '/app/admin/precos-estaduais', label: 'Preços estaduais', hint: 'Comparação entre estados', icon: Globe2 }] : []),
        { to: '/app/pdvs', label: 'PDVs e agente', hint: 'Caixas, filiais e coletor local', icon: Store },
        { to: '/app/configuracoes', label: 'Conta', hint: 'Acessos e integrações', icon: Settings },
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
      brandSubtitle="Inteligência para seu mercado"
      userKicker="Workspace atual"
      userName={name || 'Usuário logado'}
      userEmail={email || 'Conta sem e-mail visível'}
      userChips={[
        { label: role === 'ADMIN' ? 'Administrador' : 'Operação' },
        { label: 'MercadoFlow', subtle: true },
      ]}
      sections={sections}
      supportKicker="Fluxo recomendado"
      supportTitle="Comece pelo Painel do dia"
      supportText="Veja o que precisa de atenção, analise seus produtos e tome decisões com dados reais."
      footer={footer}
    />
  );
};

export default Sidebar;
