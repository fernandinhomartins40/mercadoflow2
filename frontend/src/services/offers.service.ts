import api from './api';

export const offersService = {
  async getOverview(marketId: string) {
    const response = await api.get(`/v1/markets/${marketId}/offers/overview`);
    return response.data;
  },

  async searchCatalog(marketId: string, query?: string, limit = 20) {
    const response = await api.get(`/v1/markets/${marketId}/offers/catalog-search`, {
      params: { q: query?.trim() || undefined, limit },
    });
    return response.data;
  },

  async getCatalogSelection(marketId: string, ids: string[]) {
    const params = new URLSearchParams();
    ids.forEach((id) => params.append('ids', id));
    const response = await api.get(`/v1/markets/${marketId}/offers/catalog-selection`, {
      params,
    });
    return response.data;
  },

  async getTemplates(marketId: string) {
    const response = await api.get(`/v1/markets/${marketId}/offers/templates`);
    return response.data;
  },

  async getTemplate(marketId: string, templateId: string) {
    const response = await api.get(`/v1/markets/${marketId}/offers/templates/${templateId}`);
    return response.data;
  },

  async createTemplate(marketId: string, payload: {
    name: string;
    description?: string;
    channel?: string;
    canvasWidth?: number;
    canvasHeight?: number;
    designJson?: string;
    active?: boolean;
  }) {
    const response = await api.post(`/v1/markets/${marketId}/offers/templates`, payload);
    return response.data;
  },

  async updateTemplate(marketId: string, templateId: string, payload: {
    name: string;
    description?: string;
    channel?: string;
    canvasWidth?: number;
    canvasHeight?: number;
    designJson?: string;
    active?: boolean;
  }) {
    const response = await api.patch(`/v1/markets/${marketId}/offers/templates/${templateId}`, payload);
    return response.data;
  },

  async getJobs(marketId: string) {
    const response = await api.get(`/v1/markets/${marketId}/offers/jobs`);
    return response.data;
  },

  async createJob(marketId: string, payload: {
    templateId: string;
    name?: string;
    outputType?: string;
    generationMode?: string;
    productIds: string[];
  }) {
    const response = await api.post(`/v1/markets/${marketId}/offers/jobs`, payload);
    return response.data;
  },
};

