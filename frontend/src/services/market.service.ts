import api from './api';

export const marketService = {
  async getDashboard(marketId: string, startDate?: string, endDate?: string) {
    const response = await api.get(`/v1/markets/${marketId}/dashboard`, {
      params: { startDate, endDate },
    });
    return response.data;
  },

  async getProducts(marketId: string, page = 0, size = 20, category?: string) {
    const response = await api.get(`/v1/markets/${marketId}/products`, {
      params: { page, size, category },
    });
    return response.data;
  },

  async getAlerts(marketId: string, onlyUnread = false) {
    const response = await api.get(`/v1/markets/${marketId}/alerts`, {
      params: { onlyUnread },
    });
    return response.data;
  },

  async getTopSellers(marketId: string, limit = 10, startDate?: string, endDate?: string) {
    const response = await api.get(`/v1/markets/${marketId}/analytics/top-sellers`, {
      params: { limit, startDate, endDate },
    });
    return response.data;
  },

  async getMarketBasket(marketId: string, minSupport = 0.01, minConfidence = 0.5) {
    const response = await api.get(`/v1/markets/${marketId}/analytics/market-basket`, {
      params: { minSupport, minConfidence },
    });
    return response.data;
  },
};
