import api from './api';

/**
 * Custo, preço e estoque que o dono informa nas decisões (promover, liquidar,
 * comprar) e quanto do que a loja vende já tem custo e estoque conhecidos.
 * Ver docs/PROPOSTA-DECISOES-E-INTEGRACAO.md.
 */

export interface KnownInputs {
  productId: string;
  name: string;
  unitCost: number | null;
  /** PURCHASE (nota/Confere) | MANUAL | ERP | ERP_RECEIPT | ORDER */
  costSource: string | null;
  costAt: string | null;
  /** Preço médio vendido nos últimos 30 dias. */
  averageSalePrice: number | null;
  /** Preço de tabela enviado pelo ERP. */
  officialPrice: number | null;
  stockUnits: number | null;
  stockCountedAt: string | null;
  /** Nota de entrada com este produto que ainda não foi conferida. */
  pendingNfe: { issuedAt: string; supplier: string } | null;
}

export interface InputLine {
  productId: string;
  unitCost?: number | null;
  actionPrice?: number | null;
  stockUnits?: number | null;
}

export interface CostCoverage {
  revenue: number;
  products: number;
  products_with_cost: number;
  /** 0..1, pelo faturamento de 90 dias. */
  costShare: number;
  stockShare: number;
  bySource: { source: string; products: number }[];
  /** Notas de entrada (60 dias) que o Confere trouxe e ninguém conferiu. */
  pendingNfe: number;
}

export const COST_SOURCE_LABEL: Record<string, string> = {
  PURCHASE: 'da nota de entrada',
  PURCHASE_HISTORY: 'da nota de entrada',
  MANUAL: 'informado por você',
  ERP: 'enviado pelo ERP',
  ERP_RECEIPT: 'da entrada no ERP',
  ORDER: 'do último pedido',
  CONFERE: 'conferido no Confere',
  SUPPLIER_ORDER: 'do último pedido',
};

export const decisionInputsService = {
  known: (marketId: string, productIds: string[]) =>
    api.get<KnownInputs[]>(`/v1/markets/${marketId}/decision-inputs`, { params: { productIds: productIds.slice(0, 200).join(',') } }).then((r) => r.data),
  save: (marketId: string, items: InputLine[], recommendationId?: string) =>
    api.post<{ costs: number; counts: number; recommendations: number }>(`/v1/markets/${marketId}/decision-inputs`, { recommendationId, items }).then((r) => r.data),
  coverage: (marketId: string) => api.get<CostCoverage>(`/v1/markets/${marketId}/analytics/cost-coverage`).then((r) => r.data),
};

/** Margem sobre o preço de venda, em %. Null sem os dois valores. */
export function marginOf(cost: number | null | undefined, price: number | null | undefined): number | null {
  if (cost == null || price == null || !(price > 0) || !(cost > 0)) return null;
  return ((price - cost) / price) * 100;
}

/** "4,79" ou "4.79" → 4.79; vazio → null. */
export function parseMoney(v: string): number | null {
  const s = v.trim().replace(/\s|R\$/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}

export function moneyInput(n: number | null | undefined): string {
  return n == null ? '' : n.toFixed(2).replace('.', ',');
}
