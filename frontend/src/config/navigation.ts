import {
  CalendarDays,
  CreditCard,
  Database,
  Globe2,
  Map,
  Megaphone,
  Newspaper,
  PackageSearch,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  Sun,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { FEATURE_STATE_PRICES_ENABLED } from './features';

/**
 * Arquitetura de informação do mercado (R-14, D-021): 5 destinos em vez de 14
 * itens de menu. Cada destino agrupa as telas de um mesmo trabalho; a barra
 * inferior do celular e a lateral do desktop leem daqui.
 */

export interface DestinationPage {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Outras rotas que pertencem a esta página (ex.: detalhe do produto). */
  alsoMatches?: string[];
  exact?: boolean;
  adminOnly?: boolean;
}

export interface Destination {
  key: 'hoje' | 'comprar' | 'produtos' | 'vender' | 'loja';
  label: string;
  /** Uma linha: para que serve o destino. */
  hint: string;
  icon: LucideIcon;
  pages: DestinationPage[];
}

export const DESTINATIONS: Destination[] = [
  {
    key: 'hoje',
    label: 'Hoje',
    hint: 'Decisões e vendas do dia',
    icon: Sun,
    pages: [
      { to: '/app', label: 'Hoje', icon: Sun, exact: true },
      { to: '/app/inteligencia', label: 'Todas as decisões', icon: Sparkles },
      { to: '/app/rede', label: 'Semana e rede', icon: CalendarDays },
    ],
  },
  {
    key: 'comprar',
    label: 'Comprar',
    hint: 'Pedidos e fornecedores',
    icon: ShoppingCart,
    pages: [
      { to: '/app/lista-compras', label: 'Pedido inteligente', icon: ShoppingCart },
    ],
  },
  {
    key: 'produtos',
    label: 'Produtos',
    hint: 'Desempenho e clientes',
    icon: PackageSearch,
    pages: [
      { to: '/app/produtos', label: 'Catálogo', icon: PackageSearch, alsoMatches: ['/app/produtos/'] },
      { to: '/app/clientes', label: 'Clientes', icon: Users },
    ],
  },
  {
    key: 'vender',
    label: 'Vender',
    hint: 'Promoções, encartes e mapa da loja',
    icon: Tag,
    pages: [
      { to: '/app/promocoes', label: 'Promoções', icon: Megaphone },
      { to: '/app/encartes', label: 'Encartes', icon: Newspaper },
      { to: '/app/mapa-loja', label: 'Mapa da loja', icon: Map },
    ],
  },
  {
    key: 'loja',
    label: 'Loja',
    hint: 'Caixas, plano e conta',
    icon: Store,
    pages: [
      { to: '/app/pdvs', label: 'Caixas e agente', icon: Store, alsoMatches: ['/app/download-agente'] },
      { to: '/app/planos', label: 'Plano e consumo', icon: CreditCard },
      { to: '/app/configuracoes', label: 'Conta', icon: Settings },
      { to: '/app/admin/catalogo', label: 'Catálogo global', icon: Database, adminOnly: true },
      ...(FEATURE_STATE_PRICES_ENABLED
        ? [{ to: '/app/admin/precos-estaduais', label: 'Preços estaduais', icon: Globe2, adminOnly: true }]
        : []),
    ],
  },
];

const pageMatches = (page: DestinationPage, pathname: string) =>
  page.exact
    ? pathname === page.to
    : pathname === page.to
      || pathname.startsWith(`${page.to}/`)
      || (page.alsoMatches ?? []).some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p));

/** Páginas do destino visíveis para o papel do usuário. */
export const visiblePages = (destination: Destination, isAdmin: boolean) =>
  destination.pages.filter((page) => !page.adminOnly || isAdmin);

/** Destino e página ativos para a rota atual (o Hoje é o padrão). */
export const resolveLocation = (pathname: string) => {
  for (const destination of DESTINATIONS) {
    const page = destination.pages.find((p) => pageMatches(p, pathname));
    if (page) return { destination, page };
  }
  return { destination: DESTINATIONS[0], page: DESTINATIONS[0].pages[0] };
};
