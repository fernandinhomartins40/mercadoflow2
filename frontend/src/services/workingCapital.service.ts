import api from './api';

/* ─── Capital de giro ─── */

export type CapitalStatus = 'INVEST' | 'MANTER' | 'REDUZIR' | 'LIQUIDAR';

export interface CapitalMetric {
  productId: string;
  name: string;
  category?: string | null;
  ean?: string | null;
  imageUrl?: string | null;
  revenue: number;
  quantitySold: number;
  grossMarginValue?: number | null;
  grossMarginPercent?: number | null;
  unitCost?: number | null;
  unitPrice?: number | null;
  /** PURCHASE_HISTORY | SUPPLIER_ORDER | MARGIN_ESTIMATE */
  costSource?: string | null;
  dailyVelocity: number;
  demandCv?: number | null;
  abcClass: string;
  xyzClass: string;
  revenueShare: number;
  revenueCumulativeShare: number;
  inventoryUnits?: number | null;
  inventoryValue?: number | null;
  /** 0..1 — quanto o estoque estimado merece crédito. */
  inventoryConfidence?: number | null;
  inventoryReason?: string | null;
  coverageDays?: number | null;
  gmroi?: number | null;
  reorderPointUnits?: number | null;
  suggestedOrderUnits?: number | null;
  suggestedOrderValue?: number | null;
  momentumScore?: number | null;
  stagnationRisk?: number | null;
  capitalStatus: CapitalStatus;
  capitalReason: string;
  priorityScore: number;
  lastSaleDate?: string | null;
}

export interface PurchaseLine {
  productId: string;
  name: string;
  category?: string | null;
  ean?: string | null;
  imageUrl?: string | null;
  units: number;
  value: number;
  unitCost?: number | null;
  unitPrice?: number | null;
  gmroi?: number | null;
  marginPercent?: number | null;
  dailyVelocity?: number | null;
  coverageDays?: number | null;
  abcClass: string;
  xyzClass: string;
  capitalStatus: CapitalStatus;
  reason: string;
  inventoryUnits?: number | null;
  inventoryConfidence?: number | null;
  stagnationRisk?: number | null;
  momentumScore?: number | null;
  funded: boolean;
}

export interface PortfolioSummary {
  productCount: number;
  totalInventoryValue: number;
  healthyCapital: number;
  frozenCapital: number;
  frozenCapitalPercent: number;
  portfolioGmroi?: number | null;
  investCount: number;
  manterCount: number;
  reduzirCount: number;
  liquidarCount: number;
  classACount: number;
  classBCount: number;
  classCCount: number;
}

export interface PurchasePlan {
  budget?: number | null;
  allocatedValue: number;
  remainingBudget?: number | null;
  totalNeededValue: number;
  expectedMargin: number;
  expectedReturnPercent?: number | null;
  frozenCapital: number;
  selected: PurchaseLine[];
  deferred: PurchaseLine[];
  frozen: PurchaseLine[];
  summary: PortfolioSummary;
}

/* ─── Inteligência de promoções ─── */

export interface HaloTarget {
  productId: string;
  name: string;
  liftPercent: number;
  incrementalRevenue: number;
}

export interface TrafficDriver {
  productId: string;
  driverName: string;
  affectedProducts: number;
  totalIncrementalRevenue: number;
  averageLiftPercent: number;
  topTargets: HaloTarget[];
}

export interface HaloEffect {
  driverProductId: string;
  driverName: string;
  targetProductId: string;
  targetName: string;
  targetPromoVelocity: number;
  targetNormalVelocity: number;
  haloLiftPercent: number;
  incrementalRevenue: number;
  coOccurrenceCount: number;
  promoDaysObserved: number;
  confidence: number;
  windowDays: number;
}

export interface SeasonalIndex {
  periodType: 'DOW' | 'MONTH';
  periodIndex: number;
  periodLabel: string;
  seasonalIndex: number;
  observations: number;
  confidence: number;
  reliable: boolean;
  windowDays: number;
}

export interface PromoCandidate {
  productId: string;
  name: string;
  category?: string | null;
  imageUrl?: string | null;
  objective: 'TRACAO' | 'LIQUIDACAO';
  score: number;
  reason: string;
  currentPrice?: number | null;
  suggestedDiscountPercent?: number | null;
  marginPercent?: number | null;
  dailyVelocity?: number | null;
  coverageDays?: number | null;
  capitalAtRisk?: number | null;
  expectedIncrementalRevenue?: number | null;
  affectedProducts: number;
  topTargets: HaloTarget[];
}

export interface PromoRecommendations {
  traction: PromoCandidate[];
  clearance: PromoCandidate[];
}

/* ─── Chamadas ─── */

const base = (marketId: string) => `/v1/markets/${marketId}`;

const getPortfolio = async (marketId: string, windowDays = 90): Promise<CapitalMetric[]> => {
  const { data } = await api.get<CapitalMetric[]>(`${base(marketId)}/capital/portfolio`, {
    params: { windowDays },
  });
  return data;
};

const getPurchasePlan = async (
  marketId: string,
  budget?: number | null,
  windowDays = 90,
): Promise<PurchasePlan> => {
  const { data } = await api.get<PurchasePlan>(`${base(marketId)}/capital/purchase-plan`, {
    params: { ...(budget && budget > 0 ? { budget } : {}), windowDays },
  });
  return data;
};

const getTrafficDrivers = async (marketId: string, windowDays = 180): Promise<TrafficDriver[]> => {
  const { data } = await api.get<TrafficDriver[]>(
    `${base(marketId)}/promo-intelligence/traffic-drivers`,
    { params: { windowDays } },
  );
  return data;
};

const getHaloEffects = async (marketId: string, windowDays = 180): Promise<HaloEffect[]> => {
  const { data } = await api.get<HaloEffect[]>(`${base(marketId)}/promo-intelligence/halo`, {
    params: { windowDays },
  });
  return data;
};

const getSeasonality = async (
  marketId: string,
  productId?: string | null,
  windowDays = 365,
): Promise<SeasonalIndex[]> => {
  const { data } = await api.get<SeasonalIndex[]>(
    `${base(marketId)}/promo-intelligence/seasonality`,
    { params: { ...(productId ? { productId } : {}), windowDays } },
  );
  return data;
};

const getPromoRecommendations = async (
  marketId: string,
  windowDays = 180,
): Promise<PromoRecommendations> => {
  const { data } = await api.get<PromoRecommendations>(
    `${base(marketId)}/promo-intelligence/recommendations`,
    { params: { windowDays } },
  );
  return data;
};

export default {
  getPortfolio,
  getPurchasePlan,
  getTrafficDrivers,
  getHaloEffects,
  getSeasonality,
  getPromoRecommendations,
};
