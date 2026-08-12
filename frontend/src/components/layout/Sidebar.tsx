import React from 'react';
import {
  CalendarDays,
  CreditCard,
  Database,
  Globe2,
  Home,
  Map,
  Megaphone,
  MessageSquare,
  PackageSearch,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import WorkspaceSidebar, { WorkspaceNavSection } from './WorkspaceSidebar';
import { FEATURE_STATE_PRICES_ENABLED } from '../../config/features';

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
        { to: '/app/inteligencia', label: 'Central de Inteligência', hint: 'Oportunidades priorizadas da sua loja', icon: Sparkles },
        { to: '/app/perguntar', label: 'Pergunte aos dados', hint: 'Tire dúvidas sobre a sua loja em português', icon: MessageSquare },
        { to: '/app/rede', label: 'Semana e rede', hint: 'Como foi sua semana e comparação entre lojas', icon: CalendarDays },
        { to: '/app/clientes', label: 'Clientes', hint: 'Quem volta à sua loja e o que traz de volta', icon: Users },
      ],
    },
    {
      title: 'Produtos',
      items: [
        { to: '/app/produtos', label: 'Catálogo', hint: 'Desempenho, combos e previsão', icon: PackageSearch },
        { to: '/app/lista-compras', label: 'Pedido inteligente', hint: 'Compra guiada por vendas reais', icon: ShoppingCart },
      ],
    },
    {
      title: 'Estratégia',
      items: [
        { to: '/app/promocoes', label: 'Promoções', hint: 'Campanhas e efetividade promocional', icon: Megaphone },
        { to: '/app/mapa-loja', label: 'Mapa da loja', hint: 'Organize produtos para vender mais', icon: Map },
      ],
    },
    {
      title: 'Configuração',
      items: [
        ...(isAdmin ? [{ to: '/app/admin/catalogo', label: 'Catálogo global', hint: 'Base consolidada de produtos', icon: Database }] : []),
        ...(isAdmin ? [{ to: '/app/admin/precos-estaduais', label: 'Preços estaduais', hint: 'Comparação entre estados', icon: Globe2 }] : []),
        { to: '/app/pdvs', label: 'PDVs e agente', hint: 'Caixas, filiais e coletor local', icon: Store },
        { to: '/app/planos', label: 'Plano e consumo', hint: 'Limites do plano e upgrade', icon: CreditCard },
        { to: '/app/configuracoes', label: 'Conta', hint: 'Acessos e integrações', icon: Settings },
      ],
    },
  ].map((section) => ({
    ...section,
    items: section.items.filter((item) => FEATURE_STATE_PRICES_ENABLED || item.to !== '/app/admin/precos-estaduais'),
  }));

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
