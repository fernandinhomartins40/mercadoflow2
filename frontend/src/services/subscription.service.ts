import api from './api';

/** -1 significa "sem teto" em qualquer limite vindo do backend. */
export const UNLIMITED = -1;

export const isUnlimited = (value?: number | null) => Number(value) === UNLIMITED;

export const formatLimit = (value?: number | null) =>
  isUnlimited(value) ? 'Ilimitado' : new Intl.NumberFormat('pt-BR').format(Number(value || 0));

/* ─── Tipos ─── */

export type PlanCode = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface PlanDescriptor {
  code: PlanCode;
  name: string;
  monthlyInvoices: number;
  pdvs: number;
  seats: number;
  historyDays: number;
  fullInsights: boolean;
  marketCount?: number;
  free?: boolean;
  highlights?: string[];
}

export interface SubscriptionRow {
  marketId: string;
  marketName: string;
  cnpj?: string | null;
  contactEmail?: string | null;
  planCode: PlanCode;
  planName: string;
  billingStatus?: string | null;
  active: boolean;
  unlimited: boolean;
  invoiceLimit: number;
  invoicesUsed: number;
  invoicesRejected: number;
  /** -1 quando o plano não tem teto. */
  usagePercent: number;
  limitReached: boolean;
  seatCount: number;
  seatLimit: number;
  pdvLimit: number;
  createdAt?: string | null;
  planChangedAt?: string | null;
  lastIngestAt?: string | null;
  trialEndsAt?: string | null;
  accessExpiresAt?: string | null;
}

export interface SubscriptionMetrics {
  totalMarkets: number;
  activeMarkets: number;
  freeMarkets: number;
  proMarkets: number;
  enterpriseMarkets: number;
  marketsAtLimit: number;
  marketsNearLimit: number;
  invoicesThisCycle: number;
  invoicesRejectedThisCycle: number;
  conversionRatePercent: number;
}

export interface SubscriptionOverview {
  metrics: SubscriptionMetrics;
  plans: PlanDescriptor[];
  subscriptions: SubscriptionRow[];
  upgradeCandidates: SubscriptionRow[];
}

export interface SubscriptionEvent {
  id: string;
  eventType: string;
  fromPlan?: string | null;
  toPlan?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  actorEmail?: string | null;
  createdAt: string;
}

/** Consumo do próprio mercado — alimenta o medidor na interface do cliente. */
export interface MarketUsage {
  planCode: PlanCode;
  planName: string;
  cycleStart: string;
  cycleEnd: string;
  invoiceLimit: number;
  invoicesUsed: number;
  invoicesRejected: number;
  invoicesRemaining: number;
  usagePercent: number;
  limitReached: boolean;
  nearLimit: boolean;
  limitReachedAt?: string | null;
  pdvLimit: number;
  pdvCount: number;
  seatLimit: number;
  seatCount: number;
  historyDays: number;
  fullInsights: boolean;
}

/** Envelope das listas de inteligência recortadas por plano. */
export interface GatedList<T> {
  items: T[];
  totalAvailable: number;
  hiddenCount: number;
  truncated: boolean;
  planCode: PlanCode;
  planName: string;
  upgradeMessage?: string | null;
}

/* ─── Super admin ─── */

const adminBase = '/v1/super-admin/subscriptions';

const getOverview = async (): Promise<SubscriptionOverview> => {
  const { data } = await api.get<SubscriptionOverview>(`${adminBase}/overview`);
  return data;
};

const changePlan = async (marketId: string, plan: PlanCode, reason?: string): Promise<SubscriptionRow> => {
  const { data } = await api.patch<SubscriptionRow>(`${adminBase}/${marketId}/plan`, { plan, reason });
  return data;
};

const changeStatus = async (marketId: string, status: string, reason?: string): Promise<SubscriptionRow> => {
  const { data } = await api.patch<SubscriptionRow>(`${adminBase}/${marketId}/status`, { status, reason });
  return data;
};

const updateLimits = async (
  marketId: string,
  payload: {
    invoiceLimit?: number | null;
    pdvLimit?: number | null;
    seatLimit?: number | null;
    unlimited?: boolean;
    reason?: string;
  },
): Promise<SubscriptionRow> => {
  const { data } = await api.patch<SubscriptionRow>(`${adminBase}/${marketId}/limits`, payload);
  return data;
};

const getHistory = async (marketId: string): Promise<SubscriptionEvent[]> => {
  const { data } = await api.get<SubscriptionEvent[]>(`${adminBase}/${marketId}/history`);
  return data;
};

/* ─── Mercado ─── */

const getMarketUsage = async (marketId: string): Promise<MarketUsage> => {
  const { data } = await api.get<MarketUsage>(`/v1/markets/${marketId}/billing/usage`);
  return data;
};

/* ─── Público ─── */

const getPublicPlans = async (): Promise<PlanDescriptor[]> => {
  const { data } = await api.get<PlanDescriptor[]>('/v1/plans');
  return data;
};

export default {
  getOverview,
  changePlan,
  changeStatus,
  updateLimits,
  getHistory,
  getMarketUsage,
  getPublicPlans,
};
