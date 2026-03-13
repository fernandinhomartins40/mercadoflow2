import api from './api';

export const marketService = {
  async getDashboard(marketId: string, startDate?: string, endDate?: string) {
    const params: any = {};
    if (startDate && startDate.trim()) params.startDate = startDate.trim();
    if (endDate && endDate.trim()) params.endDate = endDate.trim();
    const response = await api.get(`/v1/markets/${marketId}/dashboard`, {
      params,
    });
    return response.data;
  },

  async getCockpit(marketId: string, startDate?: string, endDate?: string) {
    const params: any = {};
    if (startDate && startDate.trim()) params.startDate = startDate.trim();
    if (endDate && endDate.trim()) params.endDate = endDate.trim();
    const response = await api.get(`/v1/markets/${marketId}/analytics/cockpit`, {
      params,
    });
    return response.data;
  },

  async getProducts(marketId: string, page = 0, size = 20, category?: string, sortBy?: string) {
    const params: any = { page, size };
    if (category && category.trim()) params.category = category.trim();
    if (sortBy && sortBy.trim()) params.sortBy = sortBy.trim();
    const response = await api.get(`/v1/markets/${marketId}/products`, {
      params,
    });
    return response.data;
  },

  async getProductPerformance(
    marketId: string,
    page = 0,
    size = 20,
    category?: string,
    search?: string,
    sortBy?: string,
    startDate?: string,
    endDate?: string
  ) {
    const params: any = { page, size };
    if (category && category.trim()) params.category = category.trim();
    if (search && search.trim()) params.search = search.trim();
    if (sortBy && sortBy.trim()) params.sortBy = sortBy.trim();
    if (startDate && startDate.trim()) params.startDate = startDate.trim();
    if (endDate && endDate.trim()) params.endDate = endDate.trim();
    const response = await api.get(`/v1/markets/${marketId}/analytics/products/performance`, {
      params,
    });
    return response.data;
  },

  async getProductDashboard(marketId: string, productId: string, startDate?: string, endDate?: string) {
    const params: any = {};
    if (startDate && startDate.trim()) params.startDate = startDate.trim();
    if (endDate && endDate.trim()) params.endDate = endDate.trim();
    const response = await api.get(`/v1/markets/${marketId}/analytics/products/${productId}`, {
      params,
    });
    return response.data;
  },

  async getProductPriceTimeline(marketId: string, productId: string, startDate?: string, endDate?: string) {
    const params: any = {};
    if (startDate && startDate.trim()) params.startDate = startDate.trim();
    if (endDate && endDate.trim()) params.endDate = endDate.trim();
    const response = await api.get(`/v1/markets/${marketId}/analytics/products/${productId}/price-timeline`, {
      params,
    });
    return response.data;
  },

  async getProductPriceEvents(marketId: string, productId: string, startDate?: string, endDate?: string) {
    const params: any = {};
    if (startDate && startDate.trim()) params.startDate = startDate.trim();
    if (endDate && endDate.trim()) params.endDate = endDate.trim();
    const response = await api.get(`/v1/markets/${marketId}/analytics/products/${productId}/price-events`, {
      params,
    });
    return response.data;
  },

  async getProductPromotionWindows(marketId: string, productId: string, startDate?: string, endDate?: string) {
    const params: any = {};
    if (startDate && startDate.trim()) params.startDate = startDate.trim();
    if (endDate && endDate.trim()) params.endDate = endDate.trim();
    const response = await api.get(`/v1/markets/${marketId}/analytics/products/${productId}/promotion-windows`, {
      params,
    });
    return response.data;
  },

  async rebuildPriceIntelligence(marketId: string) {
    const response = await api.post(`/v1/markets/${marketId}/analytics/price-intelligence/rebuild`);
    return response.data;
  },

  async getAlerts(
    marketId: string,
    options?: { onlyUnread?: boolean; type?: string; priority?: string }
  ) {
    const params: any = {
      onlyUnread: options?.onlyUnread ?? false,
    };
    if (options?.type && options.type.trim()) params.type = options.type.trim();
    if (options?.priority && options.priority.trim()) params.priority = options.priority.trim();
    const response = await api.get(`/v1/markets/${marketId}/alerts`, {
      params,
    });
    return response.data;
  },

  async markAlertRead(marketId: string, alertId: string) {
    await api.post(`/v1/markets/${marketId}/alerts/${alertId}/read`);
  },

  async markAllAlertsRead(marketId: string) {
    const response = await api.post(`/v1/markets/${marketId}/alerts/read-all`);
    return response.data;
  },

  async getTopSellers(marketId: string, limit = 10, startDate?: string, endDate?: string) {
    const params: any = { limit };
    if (startDate && startDate.trim()) params.startDate = startDate.trim();
    if (endDate && endDate.trim()) params.endDate = endDate.trim();
    const response = await api.get(`/v1/markets/${marketId}/analytics/top-sellers`, {
      params,
    });
    return response.data;
  },

  async getMarketBasket(marketId: string, minSupport = 0.01, minConfidence = 0.5) {
    const response = await api.get(`/v1/markets/${marketId}/analytics/market-basket`, {
      params: { minSupport, minConfidence },
    });
    return response.data;
  },

  async getCachedMarketBasket(marketId: string) {
    const response = await api.get(`/v1/markets/${marketId}/analytics/market-basket/cached`);
    return response.data;
  },

  async getDemandForecast(marketId: string, days = 7) {
    const response = await api.get(`/v1/markets/${marketId}/analytics/demand-forecast`, { params: { days } });
    return response.data;
  },

  async getCampaignImpact(marketId: string) {
    const response = await api.get(`/v1/markets/${marketId}/analytics/campaign-impact`);
    return response.data;
  },

  async getPdvs(marketId: string) {
    const response = await api.get(`/v1/markets/${marketId}/pdvs`);
    return response.data;
  },

  async createPdv(marketId: string, payload: { name: string; serialNumber?: string }) {
    const response = await api.post(`/v1/markets/${marketId}/pdvs`, payload);
    return response.data;
  },

  async getCampaigns(marketId: string) {
    const response = await api.get(`/v1/markets/${marketId}/campaigns`);
    return response.data;
  },

  async createCampaign(
    marketId: string,
    payload: { name: string; description?: string; startDate?: string; endDate?: string }
  ) {
    const response = await api.post(`/v1/markets/${marketId}/campaigns`, payload);
    return response.data;
  },

  async getShoppingList(marketId: string) {
    const response = await api.get(`/v1/markets/${marketId}/shopping-list`);
    return response.data;
  },

  async addShoppingListItem(
    marketId: string,
    payload: { productId: string; quantityTarget?: number; note?: string; sourceTag?: string; reasonSummary?: string; checked?: boolean }
  ) {
    const response = await api.post(`/v1/markets/${marketId}/shopping-list/items`, payload);
    return response.data;
  },

  async updateShoppingListItem(
    marketId: string,
    itemId: string,
    payload: { quantityTarget?: number; note?: string; sourceTag?: string; reasonSummary?: string; checked?: boolean }
  ) {
    const response = await api.patch(`/v1/markets/${marketId}/shopping-list/items/${itemId}`, payload);
    return response.data;
  },

  async deleteShoppingListItem(marketId: string, itemId: string) {
    await api.delete(`/v1/markets/${marketId}/shopping-list/items/${itemId}`);
  },
};
