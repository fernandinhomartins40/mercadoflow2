import api from './api';

export interface StatePriceStats {
  totalProducts: number;
  totalObservations: number;
  totalSources: number;
  totalStates: number;
  latestObservedAt?: string | null;
}

export interface StatePriceSource {
  id: string;
  provider: string;
  name: string;
  stateCode?: string | null;
  serviceName?: string | null;
  serviceUrl?: string | null;
  coverageStates?: string | null;
  notes?: string | null;
  active: boolean;
  observationCount: number;
  latestObservedAt?: string | null;
}

export interface StatePriceProductSummary {
  productId: string;
  gtin?: string | null;
  productName: string;
  brand?: string | null;
  category?: string | null;
  packageDescription?: string | null;
  unit?: string | null;
  observationCount: number;
  sourceCount: number;
  stateCount: number;
  lowestPrice: string;
  highestPrice: string;
  averagePrice: string;
  bestState?: string | null;
  bestCity?: string | null;
  bestStore?: string | null;
  bestSourceName?: string | null;
  bestSourceProvider?: string | null;
  bestPrice?: string | null;
  bestObservedAt?: string | null;
  worstState?: string | null;
  worstCity?: string | null;
  worstStore?: string | null;
  worstSourceName?: string | null;
  worstSourceProvider?: string | null;
  worstPrice?: string | null;
  worstObservedAt?: string | null;
  latestObservedAt?: string | null;
}

export interface StatePriceObservation {
  observationId: string;
  sourceId: string;
  sourceProvider: string;
  sourceName: string;
  serviceUrl?: string | null;
  productId: string;
  providerProductId: string;
  observedGtin?: string | null;
  productName: string;
  normalizedName: string;
  brand?: string | null;
  category?: string | null;
  packageDescription?: string | null;
  unit?: string | null;
  observedState: string;
  observedCity?: string | null;
  observedStore?: string | null;
  observedStoreId?: string | null;
  sourceUrl?: string | null;
  price: string;
  currency: string;
  observedAt: string;
}

export interface StatePriceProductDetail {
  summary: StatePriceProductSummary;
  observations: StatePriceObservation[];
}

export interface StatePriceImportObservation {
  productName: string;
  gtin?: string;
  brand?: string;
  category?: string;
  packageDescription?: string;
  unit?: string;
  observedState: string;
  observedCity?: string;
  observedStore?: string;
  observedStoreId?: string;
  providerProductId?: string;
  sourceUrl?: string;
  price: string | number;
  currency?: string;
  observedAt?: string;
  rawPayload?: string;
}

export interface StatePriceImportRequest {
  provider: string;
  name?: string;
  stateCode?: string;
  serviceName?: string;
  serviceUrl?: string;
  coverageStates?: string;
  notes?: string;
  observations: StatePriceImportObservation[];
}

export interface StatePriceImportResponse {
  sourceId: string;
  provider: string;
  name: string;
  createdProducts: number;
  importedObservations: number;
  skippedObservations: number;
  errors: number;
  latestObservedAt?: string | null;
}

export interface PageResponse<T> {
  content: T[];
  totalPages: number;
  totalElements: number;
  number: number;
  size: number;
}

export const statePriceService = {
  async getStats() {
    const response = await api.get<StatePriceStats>('/v1/state-prices/stats');
    return response.data;
  },

  async listSources() {
    const response = await api.get<StatePriceSource[]>('/v1/state-prices/sources');
    return response.data;
  },

  async listStates() {
    const response = await api.get<string[]>('/v1/state-prices/states');
    return response.data;
  },

  async searchProducts(params: { search?: string; state?: string; provider?: string; page?: number; size?: number }) {
    const response = await api.get<PageResponse<StatePriceProductSummary>>('/v1/state-prices/products', {
      params: {
        search: params.search || undefined,
        state: params.state || undefined,
        provider: params.provider || undefined,
        page: params.page ?? 0,
        size: params.size ?? 20,
      },
    });
    return response.data;
  },

  async getProductDetail(productId: string) {
    const response = await api.get<StatePriceProductDetail>(`/v1/state-prices/products/${productId}`);
    return response.data;
  },

  async importObservations(payload: StatePriceImportRequest) {
    const response = await api.post<StatePriceImportResponse>('/v1/state-prices/import', payload);
    return response.data;
  },
};

