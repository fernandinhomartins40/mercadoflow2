import {
  ClipboardList,
  Factory,
  ShieldCheck,
  CreditCard,
  Database,
  Globe2,
  Home,
  Map,
  Plug,
  Megaphone,
  PackageSearch,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { FEATURE_STATE_PRICES_ENABLED } from './features';

/**
 * Arquitetura de informação do mercado: cada área da doca responde a UMA
 * pergunta do dono (docs/PROPOSTA-PAINEL-3-PASSOS.md).
 *  - Início: como está a loja?        - Decidir: o que eu faço agora?
 *  - Comprar: o que peço e para quem?  - Produtos: como vai este produto?
 *  - Vender: como vendo mais?
 * "Loja" (caixas, assinatura, equipe, conta) é de configurar uma vez: fica no
 * menu do avatar, fora da doca. A doca, o mapa e as trilhas leem daqui.
 */

export interface DestinationPage {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Outras rotas que pertencem a esta página (ex.: detalhe do produto). */
  alsoMatches?: string[];
  exact?: boolean;
  adminOnly?: boolean;
  /** Só para o dono da conta (equipe). */
  ownerOnly?: boolean;
}

export interface Destination {
  key: 'inicio' | 'decidir' | 'comprar' | 'produtos' | 'vender' | 'loja';
  label: string;
  /** Uma linha: para que serve o destino. */
  hint: string;
  icon: LucideIcon;
  pages: DestinationPage[];
  /** Fora da doca (fica no menu do avatar e no mapa). */
  inDock?: boolean;
}

export const DESTINATIONS: Destination[] = [
  {
    key: 'inicio',
    label: 'Início',
    hint: 'Como está a loja',
    icon: Home,
    inDock: true,
    pages: [
      { to: '/app', label: 'Início', icon: Home, exact: true, alsoMatches: ['/app/rede', '/app/clientes'] },
    ],
  },
  {
    key: 'decidir',
    label: 'Decidir',
    hint: 'O que fazer agora',
    icon: Sparkles,
    inDock: true,
    pages: [
      { to: '/app/decidir', label: 'Decidir', icon: Sparkles, alsoMatches: ['/app/copiloto', '/app/inteligencia'] },
    ],
  },
  {
    key: 'comprar',
    label: 'Comprar',
    hint: 'Pedidos e fornecedores',
    icon: ShoppingCart,
    inDock: true,
    pages: [
      { to: '/app/lista-compras', label: 'Pedidos', icon: ShoppingCart },
      { to: '/app/compras-digitais', label: 'Indústrias e distribuidores', icon: Factory },
    ],
  },
  {
    key: 'produtos',
    label: 'Produtos',
    hint: 'Como vai cada produto',
    icon: PackageSearch,
    inDock: true,
    pages: [
      { to: '/app/produtos', label: 'Produtos', icon: PackageSearch, alsoMatches: ['/app/produtos/'] },
      { to: '/app/contar', label: 'Contar estoque', icon: ClipboardList },
    ],
  },
  {
    key: 'vender',
    label: 'Vender',
    hint: 'Ofertas, encartes e planta da loja',
    icon: Tag,
    inDock: true,
    pages: [
      { to: '/app/promocoes', label: 'Ofertas', icon: Megaphone, alsoMatches: ['/app/encartes', '/app/encartes/'] },
      { to: '/app/mapa-loja', label: 'Planta da loja', icon: Map },
    ],
  },
  {
    key: 'loja',
    label: 'Loja',
    hint: 'Caixas, ERP, assinatura e conta',
    icon: Store,
    pages: [
      { to: '/app/pdvs', label: 'Caixas e agente', icon: Store, alsoMatches: ['/app/download-agente'] },
      { to: '/app/assinatura', label: 'Assinatura e planos', icon: CreditCard, alsoMatches: ['/app/planos'] },
      { to: '/app/equipe', label: 'Equipe', icon: Users, ownerOnly: true },
      { to: '/app/integracoes', label: 'Integrações (ERP)', icon: Plug },
      { to: '/app/vendedores', label: 'Vendedores e campanhas', icon: ShieldCheck, ownerOnly: true },
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
export const visiblePages = (destination: Destination, isAdmin: boolean, isOwner = true) =>
  destination.pages.filter((page) => (!page.adminOnly || isAdmin) && (!page.ownerOnly || isOwner || isAdmin));

/** Destino e página ativos para a rota atual (o Início é o padrão). */
export const resolveLocation = (pathname: string) => {
  for (const destination of DESTINATIONS) {
    const page = destination.pages.find((p) => pageMatches(p, pathname));
    if (page) return { destination, page };
  }
  return { destination: DESTINATIONS[0], page: DESTINATIONS[0].pages[0] };
};

/** Nomes de telas que moram dentro de outra página do menu. */
const TITLES: [RegExp, string][] = [
  [/^\/app\/rede$/, 'Semana da loja'],
  [/^\/app\/clientes$/, 'Clientes'],
  [/^\/app\/perguntar$/, 'Perguntar ao Tino'],
  [/^\/app\/encartes(\/|$)/, 'Encartes'],
  [/^\/app\/planos$/, 'Planos'],
  [/^\/app\/download-agente$/, 'Programa do caixa'],
  [/^\/app\/produtos\/.+/, 'Produto'],
];

/** Nome da tela atual, como aparece no título da página. */
export const pageTitle = (pathname: string) =>
  TITLES.find(([re]) => re.test(pathname))?.[1] ?? resolveLocation(pathname).page.label;
