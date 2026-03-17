import { ProductPairInsight, ProductPerformance, PromotionImpact } from './analytics.types';

export interface OfferCatalogProduct {
  productId: string;
  ean?: string | null;
  name: string;
  brand?: string | null;
  category?: string | null;
  unit?: string | null;
  packageDescription?: string | null;
  imageUrl?: string | null;
  currentPrice: number;
  baselinePrice: number;
  lastSoldAt?: string | null;
  productUrl?: string | null;
}

export interface OfferTemplateVariant {
  id: string;
  templateId?: string | null;
  variantKey: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  variantJson: string;
  previewImageUrl?: string | null;
  active: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface OfferBrandKit {
  id: string;
  kitKey?: string | null;
  name: string;
  description?: string | null;
  tokensJson: string;
  assetsJson: string;
  active: boolean;
  systemKit: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface OfferCampaignKit {
  id: string;
  kitKey?: string | null;
  name: string;
  description?: string | null;
  seasonKey?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  tokensJson: string;
  assetsJson: string;
  active: boolean;
  systemKit: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface OfferTemplate {
  id: string;
  templateKey?: string | null;
  name: string;
  description?: string | null;
  channel: string;
  canvasWidth: number;
  canvasHeight: number;
  schemaVersion?: number | null;
  masterTemplateKey?: string | null;
  defaultVariantKey?: string | null;
  brandKitId?: string | null;
  campaignKitId?: string | null;
  designJson: string;
  previewImageUrl?: string | null;
  active: boolean;
  systemTemplate: boolean;
  variants: OfferTemplateVariant[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface OfferGenerationJobItem {
  id: string;
  productId?: string | null;
  productName: string;
  productImageUrl?: string | null;
  productUnit?: string | null;
  currentPrice?: number | null;
  status: string;
  positionIndex: number;
  slotIndex?: number | null;
  zoneId?: string | null;
  bindingJson: string;
  resolvedBindingJson?: string | null;
}

export interface OfferRenderOutput {
  id: string;
  jobId?: string | null;
  templateId?: string | null;
  variantKey?: string | null;
  outputType: string;
  publishTarget?: string | null;
  status: string;
  fileUrl?: string | null;
  previewImageUrl?: string | null;
  errorMessage?: string | null;
  renderOptionsJson?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface OfferGenerationJob {
  id: string;
  templateId?: string | null;
  templateName: string;
  name: string;
  status: string;
  outputType: string;
  generationMode: string;
  variantKey?: string | null;
  productCount: number;
  pageCount: number;
  templateSnapshotJson: string;
  publishTargetsJson?: string | null;
  renderOptionsJson?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  items: OfferGenerationJobItem[];
  outputs: OfferRenderOutput[];
}

export interface OfferTemplateValidation {
  valid: boolean;
  layerCount: number;
  zoneCount: number;
  variantCount: number;
  messages: string[];
}

export interface OfferTemplatePreview {
  templateId: string;
  templateName: string;
  variantKey?: string | null;
  canvasWidth: number;
  canvasHeight: number;
  resolvedDesignJson: string;
  productIds: string[];
  warnings: string[];
}

export interface OfferBackgroundRemovalResult {
  sourceUrl: string;
  cleanedImageUrl: string;
  removed: boolean;
}

export interface OfferOverview {
  templatesCount: number;
  jobsCount: number;
  queuedJobs: number;
  templates: OfferTemplate[];
  recentJobs: OfferGenerationJob[];
  brandKits: OfferBrandKit[];
  campaignKits: OfferCampaignKit[];
  replenishmentSuggestions: ProductPerformance[];
  seasonalSuggestions: ProductPerformance[];
  promotionSuggestions: PromotionImpact[];
  pairSuggestions: ProductPairInsight[];
}
