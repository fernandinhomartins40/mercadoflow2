import api from './api';
import {
  OfferAssetUploadResult,
  OfferBackgroundRemovalResult,
  OfferBrandKit,
  OfferCampaignKit,
  OfferCatalogProduct,
  OfferGenerationJob,
  OfferMarketProfile,
  OfferOverview,
  OfferRenderOutput,
  OfferTemplate,
  OfferTemplatePreview,
  OfferTemplateValidation,
  OfferTemplateVariant,
} from '../types/offers.types';

export interface OfferTemplatePayload {
  name: string;
  description?: string;
  channel?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  schemaVersion?: number;
  masterTemplateKey?: string;
  defaultVariantKey?: string;
  brandKitId?: string | null;
  campaignKitId?: string | null;
  designJson?: string;
  active?: boolean;
}

export interface OfferTemplateVariantPayload {
  variantKey?: string;
  name: string;
  canvasWidth?: number;
  canvasHeight?: number;
  variantJson?: string;
  previewImageUrl?: string;
  active?: boolean;
}

export interface OfferBrandKitPayload {
  kitKey?: string;
  name: string;
  description?: string;
  tokensJson?: string;
  assetsJson?: string;
  active?: boolean;
}

export interface OfferCampaignKitPayload {
  kitKey?: string;
  name: string;
  description?: string;
  seasonKey?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  tokensJson?: string;
  assetsJson?: string;
  active?: boolean;
}

export interface OfferPreviewPayload {
  templateId: string;
  variantKey?: string | null;
  brandKitId?: string | null;
  campaignKitId?: string | null;
  renderOptionsJson?: string;
  productIds: string[];
}

export interface OfferMarketProfilePayload {
  footerContent?: string | null;
  footerLegalText?: string | null;
  primaryLogoUrl?: string | null;
  secondaryLogoUrl?: string | null;
}

export interface OfferCreateJobPayload {
  templateId: string;
  name?: string;
  outputType?: string;
  generationMode?: string;
  variantKey?: string | null;
  publishTargetsJson?: string;
  renderOptionsJson?: string;
  productIds: string[];
}

export interface OfferPublishPayload {
  variantKeys?: string[];
  outputTypes?: string[];
  publishTargets?: string[];
  renderOptionsJson?: string;
}

export interface OfferBackgroundRemovalPayload {
  productId?: string | null;
  imageUrl?: string | null;
  imageStorageKey?: string | null;
}

export const offersService = {
  async getOverview(marketId: string) {
    const response = await api.get<OfferOverview>(`/v1/markets/${marketId}/offers/overview`);
    return response.data;
  },

  async searchCatalog(marketId: string, query?: string, limit = 20) {
    const response = await api.get<OfferCatalogProduct[]>(`/v1/markets/${marketId}/offers/catalog-search`, {
      params: { q: query?.trim() || undefined, limit },
    });
    return response.data;
  },

  async getCatalogSelection(marketId: string, ids: string[]) {
    const params = new URLSearchParams();
    ids.forEach((id) => params.append('ids', id));
    const response = await api.get<OfferCatalogProduct[]>(`/v1/markets/${marketId}/offers/catalog-selection`, {
      params,
    });
    return response.data;
  },

  async getTemplates(marketId: string) {
    const response = await api.get<OfferTemplate[]>(`/v1/markets/${marketId}/offers/templates`);
    return response.data;
  },

  async getMarketProfile(marketId: string) {
    const response = await api.get<OfferMarketProfile>(`/v1/markets/${marketId}/offers/profile`);
    return response.data;
  },

  async updateMarketProfile(marketId: string, payload: OfferMarketProfilePayload) {
    const response = await api.put<OfferMarketProfile>(`/v1/markets/${marketId}/offers/profile`, payload);
    return response.data;
  },

  async uploadMarketProfileLogo(marketId: string, slot: 'PRIMARY' | 'SECONDARY', file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<OfferAssetUploadResult>(`/v1/markets/${marketId}/offers/profile/logo`, formData, {
      params: { slot },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async uploadTemplateAsset(marketId: string, purpose: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<OfferAssetUploadResult>(`/v1/markets/${marketId}/offers/assets`, formData, {
      params: { purpose },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async getTemplate(marketId: string, templateId: string) {
    const response = await api.get<OfferTemplate>(`/v1/markets/${marketId}/offers/templates/${templateId}`);
    return response.data;
  },

  async createTemplate(marketId: string, payload: OfferTemplatePayload) {
    const response = await api.post<OfferTemplate>(`/v1/markets/${marketId}/offers/templates`, payload);
    return response.data;
  },

  async updateTemplate(marketId: string, templateId: string, payload: OfferTemplatePayload) {
    const response = await api.patch<OfferTemplate>(`/v1/markets/${marketId}/offers/templates/${templateId}`, payload);
    return response.data;
  },

  async getTemplateVariants(marketId: string, templateId: string) {
    const response = await api.get<OfferTemplateVariant[]>(`/v1/markets/${marketId}/offers/templates/${templateId}/variants`);
    return response.data;
  },

  async createTemplateVariant(marketId: string, templateId: string, payload: OfferTemplateVariantPayload) {
    const response = await api.post<OfferTemplateVariant>(`/v1/markets/${marketId}/offers/templates/${templateId}/variants`, payload);
    return response.data;
  },

  async updateTemplateVariant(marketId: string, variantId: string, payload: OfferTemplateVariantPayload) {
    const response = await api.patch<OfferTemplateVariant>(`/v1/markets/${marketId}/offers/variants/${variantId}`, payload);
    return response.data;
  },

  async validateTemplate(marketId: string, templateId: string) {
    const response = await api.get<OfferTemplateValidation>(`/v1/markets/${marketId}/offers/templates/${templateId}/validate`);
    return response.data;
  },

  async previewTemplate(marketId: string, payload: OfferPreviewPayload) {
    const response = await api.post<OfferTemplatePreview>(`/v1/markets/${marketId}/offers/preview`, payload);
    return response.data;
  },

  async autoFillTemplate(marketId: string, payload: OfferPreviewPayload) {
    const response = await api.post<OfferTemplatePreview>(`/v1/markets/${marketId}/offers/auto-fill`, payload);
    return response.data;
  },

  async removeBackground(marketId: string, payload: OfferBackgroundRemovalPayload) {
    const response = await api.post<OfferBackgroundRemovalResult>(`/v1/markets/${marketId}/offers/remove-background`, payload);
    return response.data;
  },

  async getBrandKits(marketId: string) {
    const response = await api.get<OfferBrandKit[]>(`/v1/markets/${marketId}/offers/brand-kits`);
    return response.data;
  },

  async createBrandKit(marketId: string, payload: OfferBrandKitPayload) {
    const response = await api.post<OfferBrandKit>(`/v1/markets/${marketId}/offers/brand-kits`, payload);
    return response.data;
  },

  async updateBrandKit(marketId: string, kitId: string, payload: OfferBrandKitPayload) {
    const response = await api.patch<OfferBrandKit>(`/v1/markets/${marketId}/offers/brand-kits/${kitId}`, payload);
    return response.data;
  },

  async getCampaignKits(marketId: string) {
    const response = await api.get<OfferCampaignKit[]>(`/v1/markets/${marketId}/offers/campaign-kits`);
    return response.data;
  },

  async createCampaignKit(marketId: string, payload: OfferCampaignKitPayload) {
    const response = await api.post<OfferCampaignKit>(`/v1/markets/${marketId}/offers/campaign-kits`, payload);
    return response.data;
  },

  async updateCampaignKit(marketId: string, kitId: string, payload: OfferCampaignKitPayload) {
    const response = await api.patch<OfferCampaignKit>(`/v1/markets/${marketId}/offers/campaign-kits/${kitId}`, payload);
    return response.data;
  },

  async getJobs(marketId: string) {
    const response = await api.get<OfferGenerationJob[]>(`/v1/markets/${marketId}/offers/jobs`);
    return response.data;
  },

  async createJob(marketId: string, payload: OfferCreateJobPayload) {
    const response = await api.post<OfferGenerationJob>(`/v1/markets/${marketId}/offers/jobs`, payload);
    return response.data;
  },

  async getJob(marketId: string, jobId: string) {
    const response = await api.get<OfferGenerationJob>(`/v1/markets/${marketId}/offers/jobs/${jobId}`);
    return response.data;
  },

  async updateJob(marketId: string, jobId: string, payload: OfferCreateJobPayload) {
    const response = await api.patch<OfferGenerationJob>(`/v1/markets/${marketId}/offers/jobs/${jobId}`, payload);
    return response.data;
  },

  async cloneJob(marketId: string, jobId: string) {
    const response = await api.post<OfferGenerationJob>(`/v1/markets/${marketId}/offers/jobs/${jobId}/clone`);
    return response.data;
  },

  async deleteJob(marketId: string, jobId: string) {
    await api.delete(`/v1/markets/${marketId}/offers/jobs/${jobId}`);
  },

  async getJobOutputs(marketId: string, jobId: string) {
    const response = await api.get<OfferRenderOutput[]>(`/v1/markets/${marketId}/offers/jobs/${jobId}/outputs`);
    return response.data;
  },

  async publishJob(marketId: string, jobId: string, payload: OfferPublishPayload) {
    const response = await api.post<OfferRenderOutput[]>(`/v1/markets/${marketId}/offers/jobs/${jobId}/publish`, payload);
    return response.data;
  },
};
