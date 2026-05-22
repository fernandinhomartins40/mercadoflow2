export type AlertType =
  | 'LOW_STOCK'
  | 'HIGH_PERFORMING'
  | 'SLOW_MOVING'
  | 'EXPIRATION_RISK'
  | 'PROMOTION_OPPORTUNITY'
  | 'DEMAND_SPIKE'
  | 'MOMENTUM_REVERSAL'
  | 'BASKET_OPPORTUNITY'
  | 'ZERO_SALES'
  | 'PRICE_ABOVE_MARKET'
  | 'HEALTH_CRITICAL';

export type AlertPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface AlertMetadata {
  // velocity / stock signals
  salesVelocity?: number;
  portfolioMeanVelocity?: number;
  velocityRatio?: number;
  momentumScore?: number;
  zScore?: number;
  // revenue / trend signals
  revenueTrend?: number;
  revenue14d?: number;
  revenue30d?: number;
  healthScore?: number;
  turnoverBand?: string;
  // price signals
  priceIndex?: number;
  priceAboveBaselinePercent?: number;
  baselinePrice?: number;
  averagePrice?: number;
  promoRevenueShare?: number;
  // silent product
  daysSilent?: number;
  previousTransactions?: number;
  // basket signals
  lift?: number;
  confidence?: number;
  support?: number;
  pairCount?: number;
  antecedentProductId?: string;
  antecedentName?: string;
  consequentProductId?: string;
  consequentName?: string;
  antecedentTrend?: number;
  consequentTrend?: number;
  // fallback
  [key: string]: unknown;
}

export interface AlertItem {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  priority: AlertPriority;
  isRead: boolean;
  productId?: string | null;
  productName?: string | null;
  productEan?: string | null;
  productImage?: string | null;
  createdAt: string;
  metadata?: AlertMetadata | null;
}
