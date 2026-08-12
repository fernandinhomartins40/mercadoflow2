import api from './api';
import type { OpportunityFeed } from '../types/analytics.types';

export const marketService = {
  /**
   * Feed da Central de Inteligência: oportunidades priorizadas unificando
   * alertas, capital de giro e candidatos a promoção.
   */
  async getIntelligenceFeed(marketId: string, limit = 30) {
    const response = await api.get(`/v1/markets/${marketId}/intelligence/feed`, {
      params: { limit },
    });
    return response.data;
  },

  /* ─── Oportunidades e recomendações (com ciclo de vida) ─── */

  /**
   * O feed e o que o plano não deixa ver.
   *
   * Desde 12/08/2026 a resposta é um objeto, não uma lista: os tipos que
   * antecipam o futuro ficam no plano pago e vêm CONTADOS, para a tela poder
   * dizer o que o upgrade destravaria em vez de simplesmente omitir.
   */
  async getOpportunities(marketId: string, all = false): Promise<OpportunityFeed> {
    const response = await api.get(`/v1/markets/${marketId}/opportunities`, {
      params: { all },
    });
    // Tolera o formato antigo (lista pura) para não quebrar durante o deploy,
    // em que frontend e backend convivem por alguns segundos.
    const data = response.data;
    return Array.isArray(data)
      ? { oportunidades: data, bloqueadasPorTipo: {}, totalBloqueadas: 0, impactoBloqueado: 0 }
      : data;
  },

  async getPendingRecommendations(marketId: string) {
    const response = await api.get(`/v1/markets/${marketId}/opportunities/recommendations`);
    return response.data;
  },

  async getDecisionHistory(marketId: string) {
    const response = await api.get(`/v1/markets/${marketId}/opportunities/recommendations/history`);
    return response.data;
  },

  async markOpportunitiesSeen(marketId: string, ids: string[]) {
    const response = await api.post(`/v1/markets/${marketId}/opportunities/seen`, ids);
    return response.data;
  },

  async dismissOpportunity(marketId: string, opportunityId: string, reason?: string) {
    const response = await api.post(
      `/v1/markets/${marketId}/opportunities/${opportunityId}/dismiss`,
      { reason },
    );
    return response.data;
  },

  async decideRecommendation(
    marketId: string,
    recommendationId: string,
    decision: 'ACEITA' | 'REJEITADA' | 'EXECUTADA',
    note?: string,
  ) {
    const response = await api.post(
      `/v1/markets/${marketId}/opportunities/recommendations/${recommendationId}/decide`,
      { decision, note },
    );
    return response.data;
  },

  async getOutcomes(marketId: string) {
    const response = await api.get(`/v1/markets/${marketId}/opportunities/outcomes`);
    return response.data;
  },

  async detectOpportunitiesNow(marketId: string) {
    const response = await api.post(`/v1/markets/${marketId}/opportunities/detect`);
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

  async recordPurchase(
    marketId: string,
    payload: {
      productId: string;
      shoppingListItemId?: string;
      quantityPurchased?: number;
      unitCost: number;
      unitSalePrice?: number;
      supplierName?: string;
      note?: string;
    }
  ) {
    const response = await api.post(`/v1/markets/${marketId}/purchase-history`, payload);
    return response.data;
  },

  async getPurchaseHistory(marketId: string, productId: string) {
    const response = await api.get(`/v1/markets/${marketId}/purchase-history/${productId}`);
    return response.data;
  },

  async getPromoEffectiveness(marketId: string, days = 180) {
    const response = await api.get(`/v1/markets/${marketId}/analytics/promo-effectiveness`, { params: { days } });
    return response.data;
  },

  async getProductPromoEffectiveness(marketId: string, productId: string, days = 180) {
    const response = await api.get(`/v1/markets/${marketId}/analytics/promo-effectiveness/${productId}`, { params: { days } });
    return response.data;
  },

  async searchProductCatalog(
    marketId: string,
    search: string,
    page = 0,
    size = 12
  ) {
    const params: any = { page, size };
    if (search && search.trim()) params.search = search.trim();
    const response = await api.get(`/v1/markets/${marketId}/analytics/products/performance`, { params });
    return response.data;
  },

  async getSuppliers(marketId: string) {
    const response = await api.get(`/v1/markets/${marketId}/suppliers`);
    return response.data;
  },

  async saveSupplier(marketId: string, payload: {
    cnpj: string; razaoSocial: string; nomeFantasia?: string;
    email?: string; telefone?: string; logradouro?: string;
    municipio?: string; uf?: string; cep?: string;
    situacaoCadastral?: string; cnaePrincipal?: string;
    descricaoCnae?: string; porte?: string;
  }) {
    const response = await api.post(`/v1/markets/${marketId}/suppliers`, payload);
    return response.data;
  },

  async deleteSupplier(marketId: string, supplierId: string) {
    await api.delete(`/v1/markets/${marketId}/suppliers/${supplierId}`);
  },

  async lookupCnpj(marketId: string, cnpj: string) {
    const digits = cnpj.replace(/\D/g, '');
    const response = await api.get(`/v1/markets/${marketId}/suppliers/cnpj-lookup/${digits}`);
    return response.data;
  },

  async listSupplierOrders(marketId: string, status?: string) {
    const params: any = {};
    if (status) params.status = status;
    const response = await api.get(`/v1/markets/${marketId}/supplier-orders`, { params });
    return response.data;
  },

  async getSupplierOrder(marketId: string, orderId: string) {
    const response = await api.get(`/v1/markets/${marketId}/supplier-orders/${orderId}`);
    return response.data;
  },

  async createSupplierOrder(marketId: string, payload: { supplierId: string; notes?: string }) {
    const response = await api.post(`/v1/markets/${marketId}/supplier-orders`, payload);
    return response.data;
  },

  async addSupplierOrderItem(
    marketId: string,
    orderId: string,
    payload: {
      productId: string;
      quantityRequested: number;
      unitType?: string;
      unitsPerPack?: number;
      unitCost: number;
      unitSalePrice?: number;
      note?: string;
    }
  ) {
    const response = await api.post(`/v1/markets/${marketId}/supplier-orders/${orderId}/items`, payload);
    return response.data;
  },

  async updateSupplierOrderItem(
    marketId: string,
    orderId: string,
    itemId: string,
    payload: {
      quantityRequested?: number;
      unitType?: string;
      unitsPerPack?: number;
      unitCost?: number;
      unitSalePrice?: number;
      note?: string;
    }
  ) {
    const response = await api.patch(`/v1/markets/${marketId}/supplier-orders/${orderId}/items/${itemId}`, payload);
    return response.data;
  },

  async removeSupplierOrderItem(marketId: string, orderId: string, itemId: string) {
    await api.delete(`/v1/markets/${marketId}/supplier-orders/${orderId}/items/${itemId}`);
  },

  async sendSupplierOrder(marketId: string, orderId: string) {
    const response = await api.post(`/v1/markets/${marketId}/supplier-orders/${orderId}/send`);
    return response.data;
  },

  async receiveSupplierOrder(
    marketId: string,
    orderId: string,
    payload?: { items?: Array<{ itemId: string; quantityReceived: number }>; receivedAt?: string }
  ) {
    const response = await api.post(`/v1/markets/${marketId}/supplier-orders/${orderId}/receive`, payload || {});
    return response.data;
  },

  async cancelSupplierOrder(marketId: string, orderId: string, reason?: string) {
    const response = await api.post(`/v1/markets/${marketId}/supplier-orders/${orderId}/cancel`, { reason });
    return response.data;
  },

  async deleteSupplierOrder(marketId: string, orderId: string) {
    await api.delete(`/v1/markets/${marketId}/supplier-orders/${orderId}`);
  },
};
