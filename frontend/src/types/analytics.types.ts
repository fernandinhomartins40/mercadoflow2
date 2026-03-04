export interface ProductPerformance {
  productId: string;
  ean?: string | null;
  name: string;
  category?: string | null;
  revenue: number;
  quantitySold: number;
  averagePrice: number;
  transactionCount: number;
  salesDays: number;
  salesVelocity: number;
  promoRevenue: number;
  promoQuantity: number;
  normalRevenue: number;
  normalQuantity: number;
  baselinePrice: number;
  promoAveragePrice: number;
  normalAveragePrice: number;
  promoRevenueShare: number;
  priceIndex: number;
  revenueTrendPercentage?: number | null;
  lastSoldAt?: string | null;
  turnoverBand: string;
}

export interface ProductPairInsight {
  antecedentId?: string | null;
  consequentId?: string | null;
  antecedentName?: string | null;
  consequentName?: string | null;
  support: number;
  confidence: number;
  lift: number;
  pairCount: number;
}

export interface SeasonalityPoint {
  key: string;
  label: string;
  revenue: number;
  quantity: number;
  transactions: number;
  averageTicket: number;
}

export interface PromotionImpact {
  productId: string;
  name: string;
  category?: string | null;
  baselinePrice: number;
  promoAveragePrice: number;
  normalAveragePrice: number;
  promoRevenue: number;
  normalRevenue: number;
  promoQuantity: number;
  normalQuantity: number;
  quantityLiftPercent: number;
  revenueLiftPercent: number;
}

export interface CampaignImpact {
  campaignId: string;
  name: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  status: string;
  durationDays: number;
  beforeRevenue: number;
  duringRevenue: number;
  afterRevenue: number;
  beforeTransactions: number;
  duringTransactions: number;
  afterTransactions: number;
  beforeAverageTicket: number;
  duringAverageTicket: number;
  afterAverageTicket: number;
  revenueLiftPercent: number;
  transactionLiftPercent: number;
}

export interface RecentInvoice {
  id: string;
  chaveNFe: string;
  numero?: string | null;
  serie?: string | null;
  valorTotal: number;
  dataEmissao?: string | null;
  processedAt?: string | null;
}

export interface AlertItem {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  isRead: boolean;
  productId?: string | null;
  createdAt: string;
}

export interface SalesTrendPoint {
  date: string;
  revenue: number;
}

export interface MarketCockpit {
  totalRevenue: number;
  averageTicket: number;
  totalTransactions: number;
  activeProducts: number;
  growthPercentage: number;
  promoRevenueShare: number;
  campaignsRunning: number;
  topProducts: ProductPerformance[];
  slowMovers: ProductPerformance[];
  topTurnoverProducts: ProductPerformance[];
  lowTurnoverProducts: ProductPerformance[];
  topPairs: ProductPairInsight[];
  weekdaySeasonality: SeasonalityPoint[];
  hourlySeasonality: SeasonalityPoint[];
  monthlySeasonality: SeasonalityPoint[];
  promotionHighlights: PromotionImpact[];
  campaignImpacts: CampaignImpact[];
  salesTrend: SalesTrendPoint[];
  recentInvoices: RecentInvoice[];
  recentAlerts: AlertItem[];
}
