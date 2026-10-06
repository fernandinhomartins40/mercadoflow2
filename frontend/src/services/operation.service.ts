import api from './api';

/** Números da operação no Início (GET /analytics/operation). */

export type OperationPeriod = 'dia' | 'semana' | 'mes';

export interface OperationMetric {
  key: 'vendas' | 'clientes' | 'ticket' | 'itens';
  value: number;
  previous: number;
  change: number | null;
}

export interface OperationPoint { label: string; current: number; reference: number }

export interface OperationDepartment { name: string; revenue: number; previous: number; change: number | null; share: number }

export interface OperationProduct {
  productId: string;
  name: string;
  imageUrl: string | null;
  revenue: number;
  previous: number;
  change: number | null;
}

export interface OperationPanel {
  period: OperationPeriod;
  /** true quando já há venda hoje; senão o painel mostra o último dia com venda. */
  today: boolean;
  referenceDate: string;
  lastSaleAt: string | null;
  windowStart: string;
  windowEnd: string;
  comparisonLabel: string;
  seriesReferenceLabel: string;
  metrics: OperationMetric[];
  series: OperationPoint[];
  departments: OperationDepartment[];
  topProducts: OperationProduct[];
  rising: OperationProduct[];
  falling: OperationProduct[];
  margin: { percent: number | null; coverage: number };
}

export const operationService = {
  async get(marketId: string, period: OperationPeriod): Promise<OperationPanel> {
    const response = await api.get(`/v1/markets/${marketId}/analytics/operation`, { params: { period } });
    return response.data;
  },
};
