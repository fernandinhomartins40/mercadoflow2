import api from './api';
import type { DepartmentsReport, LocatedProduct, StoreInsight, StorePlan } from '../types/storeMap.types';

const base = (marketId: string) => `/v1/markets/${marketId}/store-map`;

export const storeMapService = {
  async getPlan(marketId: string): Promise<StorePlan | null> {
    const response = await api.get(base(marketId));
    return response.data?.plan ?? null;
  },

  async savePlan(marketId: string, plan: StorePlan): Promise<StorePlan> {
    const response = await api.put(base(marketId), plan);
    return response.data?.plan;
  },

  async getDepartments(marketId: string): Promise<DepartmentsReport> {
    const response = await api.get(`${base(marketId)}/departments`);
    return response.data;
  },

  async getInsights(marketId: string): Promise<StoreInsight[]> {
    const response = await api.get(`${base(marketId)}/insights`);
    return response.data || [];
  },

  async locate(marketId: string, q: string): Promise<LocatedProduct[]> {
    const response = await api.get(`${base(marketId)}/locate`, { params: { q } });
    return response.data || [];
  },
};

export default storeMapService;
