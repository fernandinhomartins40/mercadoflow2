import api from './api';

/** -1 significa "sem teto" em qualquer limite vindo do backend. */
export const UNLIMITED = -1;

export const isUnlimited = (value?: number | null) => Number(value) === UNLIMITED;

export const formatLimit = (value?: number | null) =>
  isUnlimited(value) ? 'Ilimitado' : new Intl.NumberFormat('pt-BR').format(Number(value || 0));

/* ─── Tipos ─── */

export type PlanCode = 'FREE' | 'ESSENCIAL' | 'PROFISSIONAL' | 'REDE';

/** Preço mensal formatado; -1 significa "sob consulta". */
export const formatPrice = (cents?: number | null) => {
  if (cents == null || cents < 0) return 'Sob consulta';
  if (cents === 0) return 'Gratuito';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
};

export interface PlanDescriptor {
  code: PlanCode;
  name: string;
  monthlyPriceCents: number;
  monthlyInvoices: number;
  /** Lojas na rede, contando a matriz. */
  branches: number;
  /** Teto de PDVs numa mesma loja. */
  pdvsPerBranch: number;
  /** Teto de PDVs somando todas as lojas. */
  pdvs: number;
  seats: number;
  historyDays: number;
  fullInsights: boolean;
  custom?: boolean;
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
  pdvCount: number;
  pdvLimit: number;
  branchCount: number;
  branchLimit: number;
  parentMarketId?: string | null;
  parentMarketName?: string | null;
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
  essencialMarkets: number;
  profissionalMarkets: number;
  redeMarkets: number;
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
  branchLimit: number;
  branchCount: number;
  pdvsPerBranchLimit: number;
  historyDays: number;
  fullInsights: boolean;
}

/** Loja de uma rede. */
export interface NetworkMember {
  marketId: string;
  name: string;
  branchLabel?: string | null;
  cnpj?: string | null;
  headquarters: boolean;
  pdvCount: number;
  seatCount: number;
  createdAt?: string | null;
}

/** Empresa com várias contas soltas sob o mesmo CNPJ raiz. */
export interface SuspectedNetwork {
  cnpjRoot: string;
  accountCount: number;
  unlinkedCount: number;
  totalPdvs: number;
  accounts: NetworkMember[];
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
    branchLimit?: number | null;
    pdvPerBranchLimit?: number | null;
    pdvLimit?: number | null;
    seatLimit?: number | null;
    customPriceCents?: number | null;
    unlimited?: boolean;
    reason?: string;
  },
): Promise<SubscriptionRow> => {
  const { data } = await api.patch<SubscriptionRow>(`${adminBase}/${marketId}/limits`, payload);
  return data;
};

/* ─── Rede ─── */

const getNetwork = async (marketId: string): Promise<NetworkMember[]> => {
  const { data } = await api.get<NetworkMember[]>(`${adminBase}/${marketId}/network`);
  return data;
};

const getSuspectedNetworks = async (): Promise<SuspectedNetwork[]> => {
  const { data } = await api.get<SuspectedNetwork[]>(`${adminBase}/suspected-networks`);
  return data;
};

/** Vincula uma conta solta como filial da matriz — formaliza a rede. */
const attachBranch = async (parentMarketId: string, branchMarketId: string): Promise<SubscriptionRow> => {
  const { data } = await api.post<SubscriptionRow>(`${adminBase}/${parentMarketId}/branches`, {
    branchMarketId,
  });
  return data;
};

const detachBranch = async (branchMarketId: string): Promise<SubscriptionRow> => {
  const { data } = await api.delete<SubscriptionRow>(`${adminBase}/branches/${branchMarketId}`);
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

/* ─── Cobrança (Stripe) ─── */

export interface BillingStatus {
  /** Falso quando o Stripe não está configurado: a UI cai para "falar com o comercial". */
  checkoutEnabled: boolean;
  essencialAvailable: boolean;
  profissionalAvailable: boolean;
}

const getBillingStatus = async (marketId: string): Promise<BillingStatus> => {
  const { data } = await api.get<BillingStatus>(`/v1/markets/${marketId}/billing/status`);
  return data;
};

/** Devolve a URL do Checkout do Stripe para redirecionar o cliente. */
const startCheckout = async (marketId: string, plan: PlanCode): Promise<string> => {
  const { data } = await api.post<{ url: string }>(`/v1/markets/${marketId}/billing/checkout`, {
    plan,
  });
  return data.url;
};

/** Portal do Stripe: trocar cartão, mudar de plano ou cancelar. */
const openBillingPortal = async (marketId: string): Promise<string> => {
  const { data } = await api.post<{ url: string }>(`/v1/markets/${marketId}/billing/portal`);
  return data.url;
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
  getNetwork,
  getSuspectedNetworks,
  attachBranch,
  detachBranch,
  getHistory,
  getMarketUsage,
  getBillingStatus,
  startCheckout,
  openBillingPortal,
  getPublicPlans,
};
