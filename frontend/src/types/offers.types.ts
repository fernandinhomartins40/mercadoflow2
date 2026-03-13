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

export interface OfferTemplate {
  id: string;
  templateKey?: string | null;
  name: string;
  description?: string | null;
  channel: string;
  canvasWidth: number;
  canvasHeight: number;
  designJson: string;
  previewImageUrl?: string | null;
  active: boolean;
  systemTemplate: boolean;
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
  bindingJson: string;
}

export interface OfferGenerationJob {
  id: string;
  templateId?: string | null;
  templateName: string;
  name: string;
  status: string;
  outputType: string;
  generationMode: string;
  productCount: number;
  pageCount: number;
  templateSnapshotJson: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  items: OfferGenerationJobItem[];
}

export interface OfferOverview {
  templatesCount: number;
  jobsCount: number;
  queuedJobs: number;
  templates: OfferTemplate[];
  recentJobs: OfferGenerationJob[];
  replenishmentSuggestions: ProductPerformance[];
  seasonalSuggestions: ProductPerformance[];
  promotionSuggestions: PromotionImpact[];
  pairSuggestions: ProductPairInsight[];
}

