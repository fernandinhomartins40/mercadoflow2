import api from './api';
import { isOffersAppPath, resolveOffersWorkspace, type OffersWorkspaceMode } from '../lib/offersApp';
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

const inferOffersWorkspace = (): OffersWorkspaceMode => {
  if (typeof window === 'undefined') {
    return 'admin';
  }

  return (
    isOffersAppPath(window.location.pathname) &&
    resolveOffersWorkspace(window.location.search) === 'super-admin'
  )
    ? 'super-admin'
    : 'admin';
};

const resolveWorkspaceMode = (
  workspace: OffersWorkspaceMode | (() => OffersWorkspaceMode),
) => (typeof workspace === 'function' ? workspace() : workspace);

const offersBasePath = (
  marketId: string,
  workspace: OffersWorkspaceMode | (() => OffersWorkspaceMode),
) =>
  resolveWorkspaceMode(workspace) === 'super-admin'
    ? `/v1/super-admin/markets/${marketId}/offers`
    : `/v1/markets/${marketId}/offers`;

export const createOffersService = (
  workspace: OffersWorkspaceMode | (() => OffersWorkspaceMode) = inferOffersWorkspace,
) => ({
  async getOverview(marketId: string) {
    const response = await api.get<OfferOverview>(`${offersBasePath(marketId, workspace)}/overview`);
    return response.data;
  },

  async searchCatalog(marketId: string, query?: string, limit = 20) {
    const response = await api.get<OfferCatalogProduct[]>(`${offersBasePath(marketId, workspace)}/catalog-search`, {
      params: { q: query?.trim() || undefined, limit },
    });
    return response.data;
  },

  async getCatalogSelection(marketId: string, ids: string[]) {
    const params = new URLSearchParams();
    ids.forEach((id) => params.append('ids', id));
    const response = await api.get<OfferCatalogProduct[]>(`${offersBasePath(marketId, workspace)}/catalog-selection`, {
      params,
    });
    return response.data;
  },

  async getTemplates(marketId: string) {
    const response = await api.get<OfferTemplate[]>(`${offersBasePath(marketId, workspace)}/templates`);
    return response.data;
  },

  async getMarketProfile(marketId: string) {
    const response = await api.get<OfferMarketProfile>(`${offersBasePath(marketId, workspace)}/profile`);
    return response.data;
  },

  async updateMarketProfile(marketId: string, payload: OfferMarketProfilePayload) {
    const response = await api.put<OfferMarketProfile>(`${offersBasePath(marketId, workspace)}/profile`, payload);
    return response.data;
  },

  async uploadMarketProfileLogo(marketId: string, slot: 'PRIMARY' | 'SECONDARY', file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<OfferAssetUploadResult>(`${offersBasePath(marketId, workspace)}/profile/logo`, formData, {
      params: { slot },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async uploadTemplateAsset(marketId: string, purpose: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<OfferAssetUploadResult>(`${offersBasePath(marketId, workspace)}/assets`, formData, {
      params: { purpose },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async getTemplate(marketId: string, templateId: string) {
    const response = await api.get<OfferTemplate>(`${offersBasePath(marketId, workspace)}/templates/${templateId}`);
    return response.data;
  },

  async createTemplate(marketId: string, payload: OfferTemplatePayload) {
    const response = await api.post<OfferTemplate>(`${offersBasePath(marketId, workspace)}/templates`, payload);
    return response.data;
  },

  async updateTemplate(marketId: string, templateId: string, payload: OfferTemplatePayload) {
    const response = await api.patch<OfferTemplate>(`${offersBasePath(marketId, workspace)}/templates/${templateId}`, payload);
    return response.data;
  },

  async getTemplateVariants(marketId: string, templateId: string) {
    const response = await api.get<OfferTemplateVariant[]>(`${offersBasePath(marketId, workspace)}/templates/${templateId}/variants`);
    return response.data;
  },

  async createTemplateVariant(marketId: string, templateId: string, payload: OfferTemplateVariantPayload) {
    const response = await api.post<OfferTemplateVariant>(`${offersBasePath(marketId, workspace)}/templates/${templateId}/variants`, payload);
    return response.data;
  },

  async updateTemplateVariant(marketId: string, variantId: string, payload: OfferTemplateVariantPayload) {
    const response = await api.patch<OfferTemplateVariant>(`${offersBasePath(marketId, workspace)}/variants/${variantId}`, payload);
    return response.data;
  },

  async validateTemplate(marketId: string, templateId: string) {
    const response = await api.get<OfferTemplateValidation>(`${offersBasePath(marketId, workspace)}/templates/${templateId}/validate`);
    return response.data;
  },

  async previewTemplate(marketId: string, payload: OfferPreviewPayload) {
    const response = await api.post<OfferTemplatePreview>(`${offersBasePath(marketId, workspace)}/preview`, payload);
    return response.data;
  },

  async autoFillTemplate(marketId: string, payload: OfferPreviewPayload) {
    const response = await api.post<OfferTemplatePreview>(`${offersBasePath(marketId, workspace)}/auto-fill`, payload);
    return response.data;
  },

  async removeBackground(marketId: string, payload: OfferBackgroundRemovalPayload) {
    const response = await api.post<OfferBackgroundRemovalResult>(`${offersBasePath(marketId, workspace)}/remove-background`, payload);
    return response.data;
  },

  async getBrandKits(marketId: string) {
    const response = await api.get<OfferBrandKit[]>(`${offersBasePath(marketId, workspace)}/brand-kits`);
    return response.data;
  },

  async createBrandKit(marketId: string, payload: OfferBrandKitPayload) {
    const response = await api.post<OfferBrandKit>(`${offersBasePath(marketId, workspace)}/brand-kits`, payload);
    return response.data;
  },

  async updateBrandKit(marketId: string, kitId: string, payload: OfferBrandKitPayload) {
    const response = await api.patch<OfferBrandKit>(`${offersBasePath(marketId, workspace)}/brand-kits/${kitId}`, payload);
    return response.data;
  },

  async getCampaignKits(marketId: string) {
    const response = await api.get<OfferCampaignKit[]>(`${offersBasePath(marketId, workspace)}/campaign-kits`);
    return response.data;
  },

  async createCampaignKit(marketId: string, payload: OfferCampaignKitPayload) {
    const response = await api.post<OfferCampaignKit>(`${offersBasePath(marketId, workspace)}/campaign-kits`, payload);
    return response.data;
  },

  async updateCampaignKit(marketId: string, kitId: string, payload: OfferCampaignKitPayload) {
    const response = await api.patch<OfferCampaignKit>(`${offersBasePath(marketId, workspace)}/campaign-kits/${kitId}`, payload);
    return response.data;
  },

  async getJobs(marketId: string) {
    const response = await api.get<OfferGenerationJob[]>(`${offersBasePath(marketId, workspace)}/jobs`);
    return response.data;
  },

  async createJob(marketId: string, payload: OfferCreateJobPayload) {
    const response = await api.post<OfferGenerationJob>(`${offersBasePath(marketId, workspace)}/jobs`, payload);
    return response.data;
  },

  async getJob(marketId: string, jobId: string) {
    const response = await api.get<OfferGenerationJob>(`${offersBasePath(marketId, workspace)}/jobs/${jobId}`);
    return response.data;
  },

  async updateJob(marketId: string, jobId: string, payload: OfferCreateJobPayload) {
    const response = await api.patch<OfferGenerationJob>(`${offersBasePath(marketId, workspace)}/jobs/${jobId}`, payload);
    return response.data;
  },

  async cloneJob(marketId: string, jobId: string) {
    const response = await api.post<OfferGenerationJob>(`${offersBasePath(marketId, workspace)}/jobs/${jobId}/clone`);
    return response.data;
  },

  async deleteJob(marketId: string, jobId: string) {
    await api.delete(`${offersBasePath(marketId, workspace)}/jobs/${jobId}`);
  },

  async getJobOutputs(marketId: string, jobId: string) {
    const response = await api.get<OfferRenderOutput[]>(`${offersBasePath(marketId, workspace)}/jobs/${jobId}/outputs`);
    return response.data;
  },

  async publishJob(marketId: string, jobId: string, payload: OfferPublishPayload) {
    const response = await api.post<OfferRenderOutput[]>(`${offersBasePath(marketId, workspace)}/jobs/${jobId}/publish`, payload);
    return response.data;
  },
});

export type OffersServiceClient = ReturnType<typeof createOffersService>;

export const offersService = createOffersService();
