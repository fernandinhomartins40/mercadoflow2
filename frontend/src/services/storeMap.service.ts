import api from './api';
import type { DepartmentsReport, LocatedProduct, ShelfProduct, StoreInsight, StorePlan } from '../types/storeMap.types';

const base = (marketId: string) => `/v1/markets/${marketId}/store-map`;

export const storeMapService = {
  /** Planta e o nome/foto dos produtos já colocados nas prateleiras. */
  async getPlan(marketId: string): Promise<{ plan: StorePlan | null; products: Record<string, ShelfProduct> }> {
    const response = await api.get(base(marketId));
    return { plan: response.data?.plan ?? null, products: response.data?.products ?? {} };
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

  /** Produto bipado: 404 quando o código não está no cadastro. */
  async byBarcode(marketId: string, code: string): Promise<LocatedProduct> {
    return (await api.get(`${base(marketId)}/barcode`, { params: { code } })).data;
  },
};

export default storeMapService;
