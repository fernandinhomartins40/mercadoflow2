import api from './api';

/**
 * Visão de rede: comparar filiais, transferir estoque, ver divergência de preço.
 *
 * O `marketId` é sempre o da MATRIZ; as filiais são derivadas no backend. A UI
 * nunca informa qual filial consultar — senão bastaria trocar o id na URL para
 * ler os números de outra rede.
 */

export interface BranchSummary {
  marketId: string;
  name: string;
  isHeadquarters: boolean;
  revenue: number;
  products: number;
  inventoryValue: number;
  frozenValue: number;
  frozenPercent?: number | null;
}

export interface BranchMetric {
  marketId: string;
  branchName: string;
  dailyVelocity?: number | null;
  coverageDays?: number | null;
  unitPrice?: number | null;
  inventoryUnits?: number | null;
  capitalStatus?: string | null;
}

export interface ProductAcrossBranches {
  productId: string;
  productName: string;
  branches: BranchMetric[];
  /** Quanto a melhor filial vende a mais que a pior, em %. */
  spreadPercent?: number | null;
}

export interface TransferSuggestion {
  productId: string;
  productName: string;
  fromMarketId: string;
  fromBranch: string;
  toMarketId: string;
  toBranch: string;
  suggestedUnits: number;
  estimatedValue?: number | null;
  fromCoverageDays?: number | null;
  toCoverageDays?: number | null;
  reason: string;
}

export interface PriceDivergence {
  productId: string;
  productName: string;
  cheapestBranch: string;
  cheapestPrice: number;
  priciestBranch: string;
  priciestPrice: number;
  differencePercent?: number | null;
}

export interface NetworkStatus {
  /** Este mercado tem filiais. Sem isso a UI não mostra a seção. */
  rede: boolean;
  filiais: number;
}

const base = (marketId: string) => `/v1/markets/${marketId}/network`;

export const networkService = {
  status: async (marketId: string): Promise<NetworkStatus> => {
    const { data } = await api.get(`${base(marketId)}/status`);
    return data;
  },

  branches: async (marketId: string): Promise<BranchSummary[]> => {
    const { data } = await api.get(`${base(marketId)}/branches`);
    return data;
  },

  products: async (marketId: string, limit = 30): Promise<ProductAcrossBranches[]> => {
    const { data } = await api.get(`${base(marketId)}/products`, { params: { limit } });
    return data;
  },

  transfers: async (marketId: string, limit = 20): Promise<TransferSuggestion[]> => {
    const { data } = await api.get(`${base(marketId)}/transfers`, { params: { limit } });
    return data;
  },

  priceDivergences: async (marketId: string, limit = 20): Promise<PriceDivergence[]> => {
    const { data } = await api.get(`${base(marketId)}/price-divergences`, { params: { limit } });
    return data;
  },
};

/* ─── Resumo semanal ─── */

export interface WeeklyDigest {
  id: string;
  semanaDe: string;
  semanaAte: string;
  resumo: string;
  numeros: Record<string, any>;
  /** TRUE quando o texto é do sistema, não de um modelo de IA. */
  textoDoSistema: boolean;
  provedor?: string | null;
  geradoEm: string;
}

export const weeklyDigestService = {
  list: async (marketId: string): Promise<WeeklyDigest[]> => {
    const { data } = await api.get(`/v1/markets/${marketId}/intelligence/weekly`);
    return data;
  },

  /** Gera agora, para quem não quer esperar a próxima segunda-feira. */
  generate: async (marketId: string): Promise<WeeklyDigest | { gerado: false; motivo: string }> => {
    const { data } = await api.post(`/v1/markets/${marketId}/intelligence/weekly/generate`);
    return data;
  },
};
