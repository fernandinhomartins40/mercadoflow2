import api from './api';

/** MercadoFlow Indústria: portal da indústria e área do superadmin. */

export type Feature = 'SELLOUT' | 'PRECO' | 'RUPTURA' | 'PROMO' | 'SELLIN' | 'HORA' | 'CATEGORIA' | 'EXPORTACAO';

export const FEATURE_LABEL: Record<Feature, string> = {
  SELLOUT: 'Venda (unidades e faturamento)',
  PRECO: 'Preço praticado',
  RUPTURA: 'Possível ruptura',
  PROMO: 'Promoções',
  SELLIN: 'Entradas (sell-in)',
  HORA: 'Venda por hora',
  CATEGORIA: 'Participação na categoria',
  EXPORTACAO: 'Exportação',
};

export interface IndustryMe {
  id: string;
  name: string;
  legal_name: string;
  cnpj: string;
  status: 'EM_ANALISE' | 'ATIVA' | 'SUSPENSA' | 'ENCERRADA';
  status_reason?: string | null;
  access: boolean;
  message?: string;
  approvedProducts: number;
  contract: null | {
    number: string; plan: string; plan_name: string; features: Feature[]; scope_ufs: string[]; scope_cities: string[];
    allow_neighborhood: boolean; gtin_limit: number; starts_on: string; ends_on: string;
  };
}

export interface ProductLine { gtin: string; name?: string; units: number; revenue: number; prev_units: number; growthPercent: number | null }
export interface CityMove { uf: string; city_code: string; city: string; units: number; prev_units: number; growthPercent: number | null }
export interface RuptureAlert { week_start: string; gtin: string; name?: string; uf: string; city: string; stores_before: number; stores_now: number; stores_stopped: number }

export interface Overview {
  industry: string;
  plan: string;
  features: Feature[];
  publishDelayMinutes: number;
  week: { units: number; revenue: number; prev_units: number; prev_revenue: number };
  weekGrowthPercent: number | null;
  last24h?: { units: number; revenue: number; last_hour: string | null };
  products: ProductLine[];
  citiesUp: CityMove[];
  citiesDown: CityMove[];
  cities: number;
  alerts?: RuptureAlert[];
}

export interface Place {
  uf: string; city_code: string; city: string | null; neighborhood?: string;
  units: number; revenue: number; prev_units: number; growthPercent: number | null;
  avgPrice: number | null; min_price: number | null; max_price: number | null; promoSharePercent: number | null;
  avg_stores: number | null; universe: number | null; distributionPercent: number | null; days_published: number;
}
export interface MapResult { level: 'UF' | 'CIDADE' | 'BAIRRO'; days: number; neighborhoodAllowed: boolean; places: Place[] }

export interface SeriesPoint { period: string; units: number; revenue: number; min_price: number | null; max_price: number | null; avgPrice: number | null; promoSharePercent: number | null; stores: number }
export interface ProductDetail {
  gtin: string; name: string; grain: 'day' | 'week'; series: SeriesPoint[];
  cities: { uf: string; city_code: string; city: string; units: number; revenue: number; min_price: number | null; max_price: number | null }[];
  sellIn?: { period: string; units: number; stores: number }[];
}
export interface PortfolioItem { gtin: string; product_name: string | null; brand: string | null; status: string; requested_at: string; decided_at: string | null; decision_note: string | null }
export interface CategoryPlace { category: string; level: string; uf: string; city: string | null; week_start: string; sharePercent: number; products: { gtin: string; name: string; sharePercent: number }[] }
export interface CoveragePlace { level: string; uf: string; region: string; city_code: string; city: string | null; storesRange: string }

export const industryService = {
  me: () => api.get<IndustryMe>('/v1/industry/me').then((r) => r.data),
  overview: () => api.get<Overview>('/v1/industry/overview').then((r) => r.data),
  map: (p: { level?: string; uf?: string; cityCode?: string; gtin?: string; days?: number }) =>
    api.get<MapResult>('/v1/industry/map', { params: p }).then((r) => r.data),
  product: (gtin: string, p: { uf?: string; cityCode?: string; grain?: string; days?: number }) =>
    api.get<ProductDetail>(`/v1/industry/products/${gtin}`, { params: p }).then((r) => r.data),
  hourly: (gtin?: string) => api.get<{ until: string; delayMinutes: number; hours: { hour: string; units: number; revenue: number }[] }>('/v1/industry/hourly', { params: { gtin } }).then((r) => r.data),
  category: (uf?: string) => api.get<{ places: CategoryPlace[] }>('/v1/industry/category', { params: { uf } }).then((r) => r.data),
  coverage: () => api.get<{ places: CoveragePlace[]; scopeUfs: string[]; scopeCities: string[] }>('/v1/industry/coverage').then((r) => r.data),
  portfolio: () => api.get<PortfolioItem[]>('/v1/industry/products').then((r) => r.data),
  request: (gtins: string[]) => api.post<{ received: number; invalid: string[] }>('/v1/industry/products/requests', { gtins }).then((r) => r.data),
  exportUrl: (level: string, days: number) => `${api.defaults.baseURL}/v1/industry/export.csv?level=${level}&days=${days}`,
};

// ── Superadmin ─────────────────────────────────────────────────────────────

export interface IndustryRow {
  id: string; cnpj: string; legal_name: string; trade_name: string | null; status: string; created_at: string;
  approved: number; pending: number; contract_status: string | null; plan: string | null; last_access: string | null; users: number;
}
export interface Contract {
  id: string; industry_id: string; number: string; plan: string; features: Feature[]; scope_ufs: string[]; scope_cities: string[];
  allow_neighborhood: boolean; gtin_limit: number; base_fee_cents: number; price_per_gtin_cents: number; discount_pct: number;
  billing_day: number; starts_on: string; ends_on: string; status: string; status_reason: string | null; signed_document_ref: string | null;
  preview_approved_at: string | null; preview_approved_by: string | null; activated_at: string | null; notes: string | null;
  approved_gtins?: number; industry_name?: string;
}
export interface IndustryDetail {
  id: string; cnpj: string; legal_name: string; trade_name: string | null; status: string; status_reason: string | null;
  gs1_prefixes: string[]; brands: string[]; contact_name: string | null; contact_email: string | null; contact_phone: string | null; notes: string | null;
  users: { id: string; email: string; name: string; is_active: boolean; last_login_at: string | null }[];
  contracts: Contract[];
  events: { actor: string; action: string; detail: string; at: string }[];
  portfolioSummary: { status: string; classification: string; n: number }[];
}
export interface AdminPortfolioItem {
  id: string; gtin: string; product_name: string | null; brand: string | null; status: string; classification: 'VERDE' | 'AMARELO' | 'VERMELHO';
  classification_reason: string; evidence_type: string | null; evidence_ref: string | null; requested_by: string | null; requested_at: string;
  decided_by: string | null; decision_note: string | null; owned_by: string | null;
}
export interface Plan { code: string; name: string; description: string; base_fee_cents: number; price_per_gtin_cents: number; features: Feature[]; max_ufs: number | null; max_cities: number | null }
export interface Policy {
  minStoresPerCell: number; maxStoreShare: number; secondarySuppression: boolean; neighborhoodEnabled: boolean; hourlyEnabled: boolean;
  publishDelayMinutes: number; categoryMinBrands: number; categoryMaxBrandShare: number; maxQueriesPerDay: number; updatedAt: string; updatedBy: string | null;
}
export interface Bill { contractId: string; number: string; industryId: string; industry: string; month: string; gtins: number; baseCents: number; gtinCents: number; discountCents: number; amountCents: number; activeFraction: number }
export interface IndustryInvoice { id: string; contract_id: string; industry_id: string; number: string; month: string; gtins_billed: number; amount_cents: number; status: string; due_date: string; invoice_url: string | null; paid_at: string | null }

const SA = '/v1/super-admin/industry';
export const industryAdmin = {
  list: () => api.get<IndustryRow[]>(`${SA}/industries`).then((r) => r.data),
  get: (id: string) => api.get<IndustryDetail>(`${SA}/industries/${id}`).then((r) => r.data),
  create: (b: Record<string, unknown>) => api.post<IndustryDetail>(`${SA}/industries`, b).then((r) => r.data),
  update: (id: string, b: Record<string, unknown>) => api.put<IndustryDetail>(`${SA}/industries/${id}`, b).then((r) => r.data),
  status: (id: string, status: string, reason?: string) => api.post<IndustryDetail>(`${SA}/industries/${id}/status`, { status, reason }).then((r) => r.data),
  createUser: (id: string, b: { email: string; name: string; password: string }) => api.post<IndustryDetail>(`${SA}/industries/${id}/users`, b).then((r) => r.data),
  userActive: (id: string, userId: string, active: boolean) => api.post<IndustryDetail>(`${SA}/industries/${id}/users/${userId}/active`, { active }).then((r) => r.data),
  portfolio: (id: string, status?: string) => api.get<AdminPortfolioItem[]>(`${SA}/industries/${id}/portfolio`, { params: { status } }).then((r) => r.data),
  request: (id: string, b: { gtins?: string[]; brand?: string }) => api.post<{ received: number; saved: number; invalid: string[] }>(`${SA}/industries/${id}/portfolio`, b).then((r) => r.data),
  decide: (id: string, b: { gtins: string[]; decision: string; evidenceType?: string; evidenceRef?: string; note?: string }) =>
    api.post<{ done: number; errors: string[] }>(`${SA}/industries/${id}/portfolio/decide`, b).then((r) => r.data),
  suppressed: (id: string, days = 28) => api.get<{ byReason: { level: string; reason: string; cells: number }[]; samples: Record<string, unknown>[]; noData: { gtin: string; product_name: string }[] }>(`${SA}/industries/${id}/suppressed`, { params: { days } }).then((r) => r.data),
  audit: (id: string) => api.get<{ days: { day: string; queries: number; neighborhood_queries: number; distinct_filters: number; users: number; cells: number; flags: string[] }[]; recent: { at: string; user_email: string; endpoint: string; filters: string; cells_returned: number; preview: boolean }[] }>(`${SA}/industries/${id}/audit`).then((r) => r.data),
  plans: () => api.get<Plan[]>(`${SA}/plans`).then((r) => r.data),
  createContract: (id: string, b: Record<string, unknown>) => api.post<Contract>(`${SA}/industries/${id}/contracts`, b).then((r) => r.data),
  updateContract: (cid: string, b: Record<string, unknown>) => api.put<Contract>(`${SA}/contracts/${cid}`, b).then((r) => r.data),
  approvePreview: (cid: string) => api.post<Contract>(`${SA}/contracts/${cid}/preview-approve`).then((r) => r.data),
  activate: (cid: string) => api.post<Contract>(`${SA}/contracts/${cid}/activate`).then((r) => r.data),
  contractStatus: (cid: string, status: string, reason: string) => api.post<Contract>(`${SA}/contracts/${cid}/status`, { status, reason }).then((r) => r.data),
  previewOverview: (cid: string) => api.get<Overview>(`${SA}/contracts/${cid}/preview/overview`).then((r) => r.data),
  previewMap: (cid: string, p: { level?: string; days?: number; gtin?: string }) => api.get<MapResult>(`${SA}/contracts/${cid}/preview/map`, { params: p }).then((r) => r.data),
  policy: () => api.get<{ policy: Policy; history: { changed_at: string; changed_by: string; loosened: boolean; before: string; after: string }[] }>(`${SA}/policy`).then((r) => r.data),
  savePolicy: (b: Record<string, unknown>) => api.put<{ policy: Policy; history: { changed_at: string; changed_by: string; loosened: boolean; before: string; after: string }[] }>(`${SA}/policy`, b).then((r) => r.data),
  dataStatus: () => api.get<{
    stores: { id: string; name: string; cnpj: string | null; plan_type: string | null; neighborhood: string | null; city: string | null; city_code: string | null; uf: string | null; source: string | null; participation: string; last_sale: string | null }[];
    runs: { id: number; kind: string; started_at: string; finished_at: string | null; from_day: string; to_day: string; published: number | null; suppressed: number | null; stores: number | null; error: string | null }[];
    cells: { grain: string; published: number; suppressed: number }[];
    coverage: { level: string; uf: string; city: string | null; stores: number; published: boolean }[];
    pendingBackfill: number;
  }>(`${SA}/data/status`).then((r) => r.data),
  rebuild: (weeks: number, backfill = false) => api.post<{ from: string; to: string; gtins: number; published: number; suppressed: number; stores: number; millis: number }>(`${SA}/data/rebuild`, { weeks, backfill }, { timeout: 600000 }).then((r) => r.data),
  setLocation: (marketId: string, b: Record<string, unknown>) => api.put(`${SA}/data/locations/${marketId}`, b).then((r) => r.data),
  locationFromCnpj: (marketId: string) => api.post(`${SA}/data/locations/${marketId}/cnpj`).then((r) => r.data),
  billing: (month?: string) => api.get<{ month: string; totalCents: number; contracts: { bill: Bill; invoice: IndustryInvoice | null }[] }>(`${SA}/billing`, { params: { month } }).then((r) => r.data),
  revenue: () => api.get<{ monthlyRecurringCents: number; activeContracts: number; billedGtins: number; invoices: { status: string; n: number; cents: number }[]; renewals: { id: string; number: string; ends_on: string; industry: string }[] }>(`${SA}/revenue`).then((r) => r.data),
  invoices: (industryId?: string) => api.get<IndustryInvoice[]>(`${SA}/invoices`, { params: { industryId } }).then((r) => r.data),
  issue: (cid: string, month: string) => api.post<IndustryInvoice & { note: string }>(`${SA}/contracts/${cid}/invoices`, { month }).then((r) => r.data),
  paid: (id: string) => api.post(`${SA}/invoices/${id}/paid`).then((r) => r.data),
  cancel: (id: string) => api.post(`${SA}/invoices/${id}/cancel`).then((r) => r.data),
};

export const marketDataService = {
  get: (marketId: string) => api.get<{ participates: boolean; canLeave: boolean; freePlan: boolean; changedAt: string | null; located: boolean; city: string | null; uf: string | null }>(`/v1/markets/${marketId}/data-participation`).then((r) => r.data),
  set: (marketId: string, participate: boolean, reason?: string) => api.put(`/v1/markets/${marketId}/data-participation`, { participate, reason }).then((r) => r.data),
};

export const num = (v: number | null | undefined, d = 0) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d });
export const cents = (c: number | null | undefined) => c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const pct = (v: number | null | undefined) => v == null ? null : `${Number(v) > 0 ? '+' : ''}${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
export const errorText = (e: unknown, fallback = 'Não deu certo. Tente de novo.') => {
  const d = (e as { response?: { data?: { userMessage?: string; message?: string } } })?.response?.data;
  return d?.message && d.message !== 'Requisicao invalida' ? d.message : d?.userMessage || fallback;
};
export const dateBr = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};
