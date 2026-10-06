import api from './api';

/**
 * Tração por produto (quanto ele puxa a venda de outros, medido no cupom) e a
 * completude do histórico (quanto das notas já chegou ao servidor).
 * Ver docs/AUDITORIA-ANALISES.md.
 */

export interface TractionPartner { productId: string; name: string; baskets: number; lift: number }

export interface ProductTraction {
  productId: string;
  name: string;
  imageUrl: string | null;
  category: string | null;
  /** Cupons com o produto na janela (90 dias, só dias completos). */
  baskets: number;
  totalBaskets: number;
  ownRevenue: number;
  /** R$ a mais nos OUTROS itens do cupom, contra cupons do mesmo tamanho sem ele. */
  liftPerBasket: number;
  liftTotal: number;
  zScore: number | null;
  /** Efeito positivo e estatisticamente firme (z >= 2). */
  significant: boolean;
  strongPartners: number;
  partners: TractionPartner[];
  completeDays: number;
  computedAt: string;
}

export interface DataCompleteness {
  share90: number;
  share180: number;
  share365: number;
  gaps: Array<{ from: string; to: string; days: number }>;
}

export const tractionService = {
  async list(marketId: string, onlyPositive = true, limit = 20): Promise<ProductTraction[]> {
    const { data } = await api.get(`/v1/markets/${marketId}/analytics/traction`, { params: { onlyPositive, limit } });
    return data;
  },
  async forProduct(marketId: string, productId: string): Promise<ProductTraction | null> {
    const res = await api.get(`/v1/markets/${marketId}/analytics/traction/${productId}`);
    return res.status === 204 ? null : res.data;
  },
  async completeness(marketId: string): Promise<DataCompleteness> {
    const { data } = await api.get(`/v1/markets/${marketId}/analytics/data-completeness`);
    return data;
  },
};
