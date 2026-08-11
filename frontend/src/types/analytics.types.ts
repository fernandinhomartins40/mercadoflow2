export interface ProductPerformance {
  productId: string;
  ean?: string | null;
  name: string;
  category?: string | null;
  imageUrl?: string | null;
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
  momentumScore?: number | null;  // EMA(7)/SMA(28) ratio — >1 accelerating
  healthScore?: number | null;    // composite 0-100
}

export interface ProductPdvPerformance {
  pdvId?: string | null;
  pdvName: string;
  revenue: number;
  quantitySold: number;
  averagePrice: number;
  transactionCount: number;
  promoRevenueShare: number;
  lastSoldAt?: string | null;
}

export interface ProductPairInsight {
  antecedentId?: string | null;
  consequentId?: string | null;
  antecedentName?: string | null;
  consequentName?: string | null;
  antecedentImageUrl?: string | null;
  consequentImageUrl?: string | null;
  support: number;
  confidence: number;
  lift: number;
  leverage?: number | null;
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
  imageUrl?: string | null;
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

export interface SeasonalProductCollection {
  key: string;
  title: string;
  subtitle?: string | null;
  periodLabel?: string | null;
  proximityLabel?: string | null;
  status?: string | null;
  totalRevenue?: number | null;
  totalQuantity?: number | null;
  totalTransactions?: number | null;
  products: ProductPerformance[];
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
  replenishmentCandidates: ProductPerformance[];
  promotionCandidates: ProductPerformance[];
  topPairs: ProductPairInsight[];
  weekdaySeasonality: SeasonalityPoint[];
  hourlySeasonality: SeasonalityPoint[];
  monthlySeasonality: SeasonalityPoint[];
  promotionHighlights: PromotionImpact[];
  seasonalCollections: SeasonalProductCollection[];
  campaignImpacts: CampaignImpact[];
  salesTrend: SalesTrendPoint[];
  recentInvoices: RecentInvoice[];
  recentAlerts: AlertItem[];
}

export interface ProductSeasonalPerformance {
  key: string;
  title: string;
  status: 'CURRENT' | 'UPCOMING' | 'RECENT' | string;
  proximityLabel: string;
  periodLabel: string;
  revenue: number;
  quantity: number;
  transactions: number;
  indexVsBaseline: number;
  signal: 'HIGH_SEASON' | 'LOW_SEASON' | 'NEUTRAL' | string;
}

export interface StockProjectionPeriod {
  label: string;
  key: string;
  upliftFactor: number;
  action: string;
  daysUntil: string;
}

export interface ProductPurchaseSignal {
  decision: 'BUY' | 'HOLD' | 'REDUCE' | 'CAUTION' | string;
  decisionLabel: string;
  decisionReason: string;
  salesVelocity: number;
  suggestedOrderDays: number;
  suggestedQuantity: number;
  daysWithoutSale: number;
  projections: StockProjectionPeriod[];
}

export interface ProductSpecAttribute {
  label: string;
  value: string;
  group?: 'MEDIDAS' | 'COMPOSICAO' | 'CONSERVACAO' | 'GERAL' | string;
}

/** Ficha tecnica vinda do catalogo enriquecido (product_enrichments). */
export interface ProductSpecSheet {
  description?: string | null;
  nutritionTableHtml?: string | null;
  ingredients?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  ncm?: string | null;
  unit?: string | null;
  packageDescription?: string | null;
  provider?: string | null;
  sourceLicense?: string | null;
  attributes?: ProductSpecAttribute[];
  hasContent?: boolean;
}

export interface ProductDashboard {
  overview: ProductPerformance;
  specSheet?: ProductSpecSheet | null;
  salesTrend: SalesTrendPoint[];
  weekdaySeasonality: SeasonalityPoint[];
  pdvPerformance: ProductPdvPerformance[];
  relatedPairs: ProductPairInsight[];
  priceTimeline?: ProductPriceTimeline | null;
  priceEvents?: ProductPriceEvent[];
  promotionWindows?: ProductPromotionWindow[];
  seasonalPerformance?: ProductSeasonalPerformance[];
  purchaseSignal?: ProductPurchaseSignal | null;
}

export interface ProductPriceTimelinePoint {
  date: string;
  weightedAveragePrice: number;
  medianPrice: number;
  minPrice: number;
  maxPrice: number;
  stdDevPrice: number;
  madPrice: number;
  totalQuantity: number;
  totalRevenue: number;
  transactionCount: number;
}

export interface ProductPriceTimeline {
  dynamicThresholdPercent: number;
  firstObservedPrice: number;
  lastObservedPrice: number;
  firstVariationAt?: string | null;
  lastVariationAt?: string | null;
  maxIncreasePercent: number;
  maxDecreasePercent: number;
  detectedPromotionWindows: number;
  points: ProductPriceTimelinePoint[];
}

export interface ProductPriceEvent {
  id: string;
  eventAt: string;
  oldPrice: number;
  newPrice: number;
  deltaAmount: number;
  deltaPercent: number;
  direction: 'UP' | 'DOWN' | string;
  baselinePrice: number;
  dynamicThresholdPercent: number;
  confidenceScore: number;
  triggerType: string;
}

export interface ProductPromotionWindow {
  id: string;
  startAt: string;
  endAt?: string | null;
  baselinePrice: number;
  promoPrice: number;
  discountPercent: number;
  quantityLiftPercent: number;
  revenueLiftPercent: number;
  dynamicThresholdPercent: number;
  confidenceScore: number;
  status: 'SUSPECTED' | 'CONFIRMED' | 'CLOSED' | string;
}

export interface PromoWindowSummary {
  startAt?: string | null;
  endAt?: string | null;
  durationDays: number;
  discountPercent: number;
  qtyLiftPercent: number;
  revenueLiftPercent: number;
  promoRevenue: number;
  normalRevenueEquivalent: number;
  outcome: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | string;
}

export interface ProductPromoEffectiveness {
  productId: string;
  name: string;
  category?: string | null;
  imageUrl?: string | null;
  baselinePrice?: number | null;
  avgPromoPrice?: number | null;
  avgDiscountPercent?: number | null;
  normalDailyQty?: number | null;
  promoDailyQty?: number | null;
  normalDailyRevenue?: number | null;
  promoDailyRevenue?: number | null;
  qtyLiftPercent?: number | null;
  revenueLiftPercent?: number | null;
  priceElasticity?: number | null;
  totalPromoRevenue?: number | null;
  totalNormalRevenue?: number | null;
  totalPromoQty?: number | null;
  totalNormalQty?: number | null;
  promoDays: number;
  normalDays: number;
  promoWindowCount: number;
  effectivenessScore: number;
  classification: 'BOOSTER' | 'REVENUE_LOSS' | 'BACKFIRE' | 'NEUTRAL' | 'INSUFFICIENT_DATA' | string;
  classificationLabel: string;
  insight: string;
  windows: PromoWindowSummary[];
}

export interface PurchasePriceHistory {
  id: string;
  productId: string;
  productName: string;
  shoppingListItemId?: string | null;
  quantityPurchased: number;
  unitCost: number;
  unitSalePrice?: number | null;
  marginPercent?: number | null;
  supplierName?: string | null;
  note?: string | null;
  purchasedAt: string;
  previousUnitCost?: number | null;
  costDeltaPercent?: number | null;
  costTrend: 'UP' | 'DOWN' | 'STABLE' | 'FIRST' | string;
}

export interface ShoppingListItem {
  id: string;
  productId: string;
  ean?: string | null;
  name: string;
  category?: string | null;
  brand?: string | null;
  imageUrl?: string | null;
  quantityTarget: number;
  note?: string | null;
  sourceTag: string;
  reasonSummary?: string | null;
  checked: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ShoppingListOverview {
  totalItems: number;
  checkedItems: number;
  pendingItems: number;
  items: ShoppingListItem[];
}

export interface Supplier {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  email?: string | null;
  telefone?: string | null;
  logradouro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  situacaoCadastral?: string | null;
  cnaePrincipal?: string | null;
  descricaoCnae?: string | null;
  porte?: string | null;
}

export interface SupplierOrderItem {
  id: string;
  supplierOrderId: string;
  productId: string;
  productName: string;
  productCategory?: string | null;
  imageUrl?: string | null;
  quantityRequested: number;
  quantityReceived?: number | null;
  unitType: string;
  unitsPerPack?: number | null;
  unitCost: number;
  unitSalePrice?: number | null;
  marginPercent?: number | null;
  subtotal: number;
  note?: string | null;
  createdAt?: string | null;
}

export interface SupplierOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierFantasia?: string | null;
  supplierCnpj?: string | null;
  status: 'RASCUNHO' | 'ENVIADO' | 'ENTREGUE' | 'CANCELADO';
  statusLabel: string;
  orderNumber: string;
  orderDate: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  totalValue: number;
  notes?: string | null;
  itemCount: number;
  items: SupplierOrderItem[];
  canEdit: boolean;
  canSend: boolean;
  canReceive: boolean;
  canCancel: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/* ─── Central de Inteligência ─── */

/**
 * Oportunidade de negócio, independente da fonte que a detectou.
 * Unifica alertas, vereditos de capital e candidatos a promoção.
 */
export interface Opportunity {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  productId?: string | null;
  productName?: string | null;
  productImage?: string | null;
  priorityScore: number;
  estimatedImpactValue?: number | null;
  source: 'ALERTA' | 'CAPITAL' | 'PROMOCAO';
  evidence?: Record<string, any> | null;
}

export interface FeedSummary {
  total: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  totalEstimatedImpact: number;
}

export interface IntelligenceFeed {
  opportunities: Opportunity[];
  summary: FeedSummary;
  totalAvailable: number;
}

/* ─── Opportunity / Recommendation Engine ─── */

export type OpportunityStatus =
  | 'NOVA' | 'VISTA' | 'EM_ACAO' | 'CONCLUIDA' | 'DESCARTADA' | 'EXPIRADA';

export interface OpportunityItem {
  id: string;
  type: string;
  source: string;
  status: OpportunityStatus;
  title: string;
  description?: string | null;
  productId?: string | null;
  productName?: string | null;
  productImage?: string | null;
  evidence?: Record<string, any> | null;
  expectedImpactValue?: number | null;
  confidence?: number | null;
  priorityScore: number;
  /** Quantas rodadas do detector reencontraram a mesma situação. */
  detectionCount: number;
  firstDetectedAt?: string | null;
  lastDetectedAt?: string | null;
  expiresAt?: string | null;
  /**
   * Texto escrito pela IA que o mercado configurou (BYOK). Ausente quando não
   * há chave cadastrada ou o job ainda não interpretou — nesse caso a tela usa
   * `description`, que é o texto determinístico do próprio sistema.
   */
  aiInsight?: string | null;
}

export type RecommendationStatus = 'PROPOSTA' | 'ACEITA' | 'REJEITADA' | 'EXECUTADA';

export type RecommendationAction =
  | 'COMPRAR' | 'PROMOVER' | 'LIQUIDAR' | 'AJUSTAR_PRECO' | 'REPOSICIONAR' | 'INVESTIGAR';

export interface RecommendationItem {
  id: string;
  opportunityId: string;
  actionType: RecommendationAction;
  status: RecommendationStatus;
  title: string;
  rationale?: string | null;
  /** Como o número foi obtido — permite discordar com fundamento. */
  calculationTrace?: string | null;
  parameters?: Record<string, any> | null;
  evidence?: Record<string, any> | null;
  confidence?: number | null;
  expectedImpactValue?: number | null;
  productId?: string | null;
  productName?: string | null;
  productImage?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt?: string | null;
}

/* ─── Feedback loop (Fase 8) ─── */

export type OutcomeVerdict = 'ACERTOU' | 'PARCIAL' | 'ERROU' | 'SEM_DADOS';

export interface OutcomeItem {
  id: string;
  recommendationId: string;
  recommendationTitle: string;
  actionType: string;
  verdict?: OutcomeVerdict | null;
  productId?: string | null;
  productName?: string | null;
  predictedValue?: number | null;
  actualValue?: number | null;
  deltaValue?: number | null;
  deltaPercent?: number | null;
  horizonDays: number;
  measuredAt?: string | null;
  notes?: string | null;
}

/** Acurácia do Holt-Winters — antes da Fase 8, nunca havia sido medida. */
export interface ForecastAccuracySummary {
  observations: number;
  products: number;
  /** Erro percentual absoluto médio. */
  mape?: number | null;
  mae?: number | null;
  confidenceIntervalCoverage?: number | null;
  interpretation: string;
}

export interface OutcomesResponse {
  resultados: OutcomeItem[];
  porTipoDeAcao: Record<string, Record<string, number>>;
  acuraciaPrevisao: ForecastAccuracySummary;
}
