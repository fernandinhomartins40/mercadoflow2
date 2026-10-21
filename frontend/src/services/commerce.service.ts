import api from './api';

/** MercadoFlow Vendas (docs/PROPOSTA-MERCADOFLOW-VENDAS.md): portal de vendas, compras da loja e superadmin. */

export type SellerKind = 'INDUSTRIA' | 'DISTRIBUIDOR';
export type SalesMode = 'DIRETO' | 'DISTRIBUIDOR' | 'MISTO';
export type OrderStatus = 'ENVIADO' | 'CONFIRMADO' | 'FATURADO' | 'ENTREGUE' | 'RECUSADO' | 'CANCELADO';
export type Audience = 'TODAS' | 'VENDEM' | 'NAO_VENDEM' | 'RUPTURA';

export interface SellerMe {
  id: string;
  kind: SellerKind;
  cnpj: string;
  legal_name: string;
  trade_name: string | null;
  name: string;
  status: 'EM_ANALISE' | 'ATIVO' | 'SUSPENSO' | 'ENCERRADO';
  status_reason: string | null;
  industry_id: string | null;
  sales_mode: SalesMode;
  service_ufs: string[];
  service_cities: string[];
  min_order_cents: number;
  payment_terms: string | null;
  delivery_terms: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  monthly_fee_cents: number;
  order_fee_pct: number;
  attested_at: string | null;
  termsVersion: string;
  access: boolean;
}

export interface SellerProduct {
  id: string;
  gtin: string;
  name: string;
  brand: string | null;
  owner: boolean;
  unit_type: string;
  units_per_pack: number | null;
  min_quantity: number;
  multiple_of: number;
  base_price: number;
  in_stock: boolean;
  status: 'PENDENTE' | 'ATIVO' | 'PAUSADO' | 'NEGADO';
  status_note: string | null;
}

export interface Tier { minQty: number; unitPrice: number }

export interface PriceList {
  id: string;
  name: string;
  priority: number;
  audience: 'TODAS' | 'NOMINAL';
  scope_ufs: string[];
  scope_cities: string[];
  valid_from: string;
  valid_until: string | null;
  status: 'ATIVA' | 'PAUSADA';
  items_count: number;
  items: { gtin: string; unit_price: number; tiers: Tier[]; name: string | null }[];
  markets: { id: string; name: string }[];
}

export interface Agreement {
  id: string;
  distributor_seller_id: string | null;
  distributor_status: string | null;
  distributor_cnpj: string;
  distributor_name: string;
  exclusivity: 'EXCLUSIVO' | 'NAO_EXCLUSIVO';
  block_other_sellers: boolean;
  scope_ufs: string[];
  scope_cities: string[];
  scope_brands: string[];
  scope_gtins: string[];
  starts_on: string;
  ends_on: string | null;
  status: 'ATIVO' | 'ENCERRADO';
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
}

export interface Distribution {
  salesMode: SalesMode;
  attestedAt: string | null;
  attestedBy: string | null;
  termsVersion: string;
  agreements: Agreement[];
  directAccounts: { id: string; cnpj: string; label: string | null; created_at: string }[];
}

export interface Client {
  id: string;
  name: string;
  city: string | null;
  uf: string | null;
  authorized: boolean;
  orders: number | null;
  last_order_at: string | null;
  total_cents: number | null;
}

export interface CampaignRow {
  id: string;
  number: string;
  title: string;
  target_type: 'PUBLICO' | 'NOMINAL';
  target: { ufs?: string[]; cities?: string[]; audience?: Audience } | null;
  valid_from: string;
  valid_until: string;
  status: 'RASCUNHO' | 'ENVIADA' | 'ENCERRADA' | 'CANCELADA';
  created_at: string;
  sent_at: string | null;
  items: number;
  delivered: number;
  ordered: number;
}

export interface CampaignPreview {
  tooSmall: boolean;
  minStores?: number;
  reach?: number;
  direct?: number;
  viaDistributor?: number;
  byDistributor?: Record<string, number>;
  barred?: Record<string, number>;
}

export interface Campaign extends CampaignRow {
  message: string | null;
  stats: CampaignPreview | null;
  items_list?: never;
  targets: { id: string; name: string }[];
  results?: {
    byStatus: { status: string; channel: string; n: number }[];
    orders: { number: string; status: OrderStatus; total_cents: number; created_at: string; market_name: string; city: string | null; uf: string | null; fulfilled_by: string }[];
  };
}

export interface CampaignDetail extends Omit<Campaign, 'items'> {
  items: { gtin: string; unit_price: number; min_quantity: number; name: string | null; base_price: number | null; unit_type: string | null }[];
}

export interface OrderItem {
  id: string;
  gtin: string;
  name: string;
  unit_type: string;
  units_per_pack: number | null;
  quantity: number;
  quantity_confirmed: number | null;
  unit_price: number;
  price_source: 'BASE' | 'TABELA' | 'CAMPANHA';
  subtotal_cents: number;
}

export interface OrderEvent { actor_side: 'LOJA' | 'VENDEDOR' | 'SISTEMA'; from_status: string | null; to_status: OrderStatus; note: string | null; at: string }

export interface OrderRow {
  id: string;
  number: string;
  status: OrderStatus;
  total_cents: number;
  channel: 'DIRETO' | 'DISTRIBUIDOR';
  created_at: string;
  nfe_number: string | null;
  items: number;
  campaign_number: string | null;
  market_name?: string;
  city?: string | null;
  uf?: string | null;
  seller_name?: string;
  seller_kind?: SellerKind;
  campaign_title?: string | null;
}

export interface Order extends Omit<OrderRow, 'items'> {
  market_id: string;
  seller_id: string;
  payment_terms: string | null;
  delivery_terms: string | null;
  notes: string | null;
  status_reason: string | null;
  fee_cents: number | null;
  supplier_order_id: string | null;
  items: OrderItem[];
  events: OrderEvent[];
  market_cnpj?: string;
  street?: string | null;
  street_number?: string | null;
  neighborhood?: string | null;
  postal_code?: string | null;
  seller_contact?: string | null;
  seller_email?: string | null;
  seller_phone?: string | null;
}

export interface CatalogItem {
  gtin: string;
  name: string;
  brand: string | null;
  unit_type: string;
  units_per_pack: number | null;
  min_quantity: number;
  multiple_of: number;
  in_stock: boolean;
  unit_price: number;
  price_source: 'BASE' | 'TABELA';
  tiers: Tier[];
  image_url?: string | null;
}

export interface MarketSeller {
  id: string;
  kind: SellerKind;
  name: string;
  min_order_cents: number;
  payment_terms: string | null;
  delivery_terms: string | null;
  products: number;
  consent: 'AUTORIZADA' | 'BLOQUEADA' | null;
}

export interface Offer extends Omit<CatalogItem, 'price_source'> {
  seller_id: string;
  seller_name: string;
  seller_kind: SellerKind;
}

export interface InboxCampaign {
  id: string;
  status: 'ENTREGUE' | 'VISTA' | 'PEDIDO' | 'RECUSADA';
  channel: 'DIRETO' | 'DISTRIBUIDOR';
  distributor_name: string | null;
  channel_reason: string;
  delivered_at: string;
  decided_at: string | null;
  campaign_id: string;
  number: string;
  title: string;
  message: string | null;
  valid_from: string;
  valid_until: string;
  seller_id: string;
  seller_name: string;
  seller_kind: SellerKind;
  open: boolean;
  fulfilled_by: string | null;
  fulfilled_min_order_cents: number | null;
  items: { gtin: string; unit_price: number; min_quantity: number; name: string | null; brand: string | null; unit_type: string | null; units_per_pack: number | null; multiple_of: number | null }[];
}

export interface MarketPreferences {
  receiveCampaigns: boolean;
  stores: number;
  consents: { seller_id: string; status: 'AUTORIZADA' | 'BLOQUEADA'; changed_at: string; seller_name: string; seller_kind: SellerKind }[];
}

export type OrderResult = (Order & { kind: 'PEDIDO' }) | { kind: 'RASCUNHO_FORNECEDOR'; supplierOrderId: string | null; distributorName: string };

const S = '/v1/seller';

export const sellerService = {
  me: () => api.get<SellerMe>(`${S}/me`).then((r) => r.data),
  dashboard: () => api.get<{ orders: { status: OrderStatus; n: number; cents: number }[]; products: { status: string; n: number }[]; activeCampaigns: number; clients: number; last30Cents: number }>(`${S}/dashboard`).then((r) => r.data),
  saveProfile: (b: Record<string, unknown>) => api.put<SellerMe>(`${S}/profile`, b).then((r) => r.data),
  products: () => api.get<SellerProduct[]>(`${S}/products`).then((r) => r.data),
  saveProduct: (b: Record<string, unknown>) => api.post<SellerProduct>(`${S}/products`, b).then((r) => r.data),
  pauseProduct: (gtin: string, paused: boolean) => api.post<SellerProduct>(`${S}/products/${gtin}/pause`, { paused }).then((r) => r.data),
  removeProduct: (gtin: string) => api.delete(`${S}/products/${gtin}`).then((r) => r.data),
  priceLists: () => api.get<PriceList[]>(`${S}/price-lists`).then((r) => r.data),
  savePriceList: (id: string | null, b: Record<string, unknown>) =>
    (id ? api.put<PriceList[]>(`${S}/price-lists/${id}`, b) : api.post<PriceList[]>(`${S}/price-lists`, b)).then((r) => r.data),
  deletePriceList: (id: string) => api.delete<PriceList[]>(`${S}/price-lists/${id}`).then((r) => r.data),
  distribution: () => api.get<Distribution>(`${S}/distribution`).then((r) => r.data),
  salesMode: (salesMode: SalesMode, acceptTerms: boolean) => api.post<Distribution>(`${S}/distribution/sales-mode`, { salesMode, acceptTerms }).then((r) => r.data),
  saveAgreement: (id: string | null, b: Record<string, unknown>) =>
    (id ? api.put<Distribution>(`${S}/distribution/agreements/${id}`, b) : api.post<Distribution>(`${S}/distribution/agreements`, b)).then((r) => r.data),
  endAgreement: (id: string) => api.post<Distribution>(`${S}/distribution/agreements/${id}/end`).then((r) => r.data),
  addDirectAccount: (b: { cnpj: string; label?: string }) => api.post<Distribution>(`${S}/distribution/direct-accounts`, b).then((r) => r.data),
  removeDirectAccount: (id: string) => api.delete<Distribution>(`${S}/distribution/direct-accounts/${id}`).then((r) => r.data),
  clients: () => api.get<Client[]>(`${S}/clients`).then((r) => r.data),
  campaigns: () => api.get<CampaignRow[]>(`${S}/campaigns`).then((r) => r.data),
  campaign: (id: string) => api.get<CampaignDetail>(`${S}/campaigns/${id}`).then((r) => r.data),
  saveCampaign: (id: string | null, b: Record<string, unknown>) =>
    (id ? api.put<CampaignDetail>(`${S}/campaigns/${id}`, b) : api.post<CampaignDetail>(`${S}/campaigns`, b)).then((r) => r.data),
  previewCampaign: (id: string) => api.post<CampaignPreview>(`${S}/campaigns/${id}/preview`).then((r) => r.data),
  sendCampaign: (id: string) => api.post<CampaignDetail>(`${S}/campaigns/${id}/send`).then((r) => r.data),
  closeCampaign: (id: string) => api.post<CampaignDetail>(`${S}/campaigns/${id}/close`).then((r) => r.data),
  orders: (status?: string) => api.get<OrderRow[]>(`${S}/orders`, { params: { status } }).then((r) => r.data),
  ordersByDistributors: () => api.get<(OrderRow & { distributor_name: string })[]>(`${S}/orders/by-distributors`).then((r) => r.data),
  order: (id: string) => api.get<Order>(`${S}/orders/${id}`).then((r) => r.data),
  confirm: (id: string, items: { id: string; quantityConfirmed: number }[], note?: string) => api.post<Order>(`${S}/orders/${id}/confirm`, { items, note }).then((r) => r.data),
  refuse: (id: string, reason: string) => api.post<Order>(`${S}/orders/${id}/refuse`, { reason }).then((r) => r.data),
  invoice: (id: string, nfeNumber: string, nfeKey?: string) => api.post<Order>(`${S}/orders/${id}/invoice`, { nfeNumber, nfeKey }).then((r) => r.data),
  delivered: (id: string) => api.post<Order>(`${S}/orders/${id}/delivered`).then((r) => r.data),
};

const M = (marketId: string) => `/v1/markets/${marketId}/commerce`;

export const marketCommerceService = {
  sellers: (marketId: string) => api.get<MarketSeller[]>(`${M(marketId)}/sellers`).then((r) => r.data),
  catalog: (marketId: string, sellerId: string, q?: string) => api.get<CatalogItem[]>(`${M(marketId)}/sellers/${sellerId}/catalog`, { params: { q } }).then((r) => r.data),
  offers: (marketId: string, gtin: string) => api.get<Offer[]>(`${M(marketId)}/offers`, { params: { gtin } }).then((r) => r.data),
  campaigns: (marketId: string) => api.get<InboxCampaign[]>(`${M(marketId)}/campaigns`).then((r) => r.data),
  seen: (marketId: string, deliveryId: string) => api.post(`${M(marketId)}/campaigns/${deliveryId}/seen`).then((r) => r.data),
  refuse: (marketId: string, deliveryId: string, reason?: string) => api.post(`${M(marketId)}/campaigns/${deliveryId}/refuse`, { reason }).then((r) => r.data),
  orders: (marketId: string) => api.get<OrderRow[]>(`${M(marketId)}/orders`).then((r) => r.data),
  order: (marketId: string, id: string) => api.get<Order>(`${M(marketId)}/orders/${id}`).then((r) => r.data),
  createOrder: (marketId: string, b: { sellerId?: string; deliveryId?: string; items: { gtin: string; quantity: number }[]; notes?: string }) =>
    api.post<OrderResult>(`${M(marketId)}/orders`, b).then((r) => r.data),
  cancel: (marketId: string, id: string, reason?: string) => api.post<Order>(`${M(marketId)}/orders/${id}/cancel`, { reason }).then((r) => r.data),
  received: (marketId: string, id: string) => api.post<Order>(`${M(marketId)}/orders/${id}/received`).then((r) => r.data),
  preferences: (marketId: string) => api.get<MarketPreferences>(`${M(marketId)}/preferences`).then((r) => r.data),
  setReceive: (marketId: string, receiveCampaigns: boolean, wholeNetwork: boolean) =>
    api.put<MarketPreferences>(`${M(marketId)}/preferences`, { receiveCampaigns, wholeNetwork }).then((r) => r.data),
  setConsent: (marketId: string, sellerId: string, status: 'AUTORIZADA' | 'BLOQUEADA' | null, wholeNetwork: boolean) =>
    api.put<MarketPreferences>(`${M(marketId)}/consents/${sellerId}`, { status, wholeNetwork }).then((r) => r.data),
};

const SA = '/v1/super-admin/commerce';

export interface AdminSeller {
  id: string; kind: SellerKind; cnpj: string; legal_name: string; trade_name: string | null; status: SellerMe['status'];
  sales_mode: SalesMode; monthly_fee_cents: number; order_fee_pct: number; industry_id: string | null; created_at: string;
  products: number; pending_products: number; orders: number; users: number;
}

export interface AdminSellerDetail extends SellerMe {
  notes: string | null;
  users: { id: string; email: string; name: string; is_active: boolean; last_login_at: string | null; created_at: string }[];
  agreements: Agreement[];
  directAccounts: { cnpj: string; label: string | null }[];
  products: { id: string; gtin: string; name: string; brand: string | null; owner: boolean; base_price: number; status: SellerProduct['status']; status_note: string | null }[];
  events: { actor: string; action: string; detail: string; at: string }[];
}

export interface ChannelAlert {
  kind: 'NAO_DECLARADO' | 'SEM_EVIDENCIA';
  industry_id: string;
  industry_name: string;
  supplier_cnpj: string;
  supplier_name: string | null;
  stores?: number;
  products?: number;
  last_at?: string;
  starts_on?: string;
}

export const commerceAdminService = {
  overview: () => api.get<{
    sellers: { kind: SellerKind; status: string; n: number }[];
    orders: { status: OrderStatus; n: number; cents: number; fee_cents: number }[];
    campaigns: { status: string; n: number }[];
    pendingProducts: number;
    stuckOrders: { number: string; status: string; total_cents: number; created_at: string; market_name: string; seller_name: string }[];
    monthlyFeesCents: number;
  }>(`${SA}/overview`).then((r) => r.data),
  sellers: () => api.get<AdminSeller[]>(`${SA}/sellers`).then((r) => r.data),
  seller: (id: string) => api.get<AdminSellerDetail>(`${SA}/sellers/${id}`).then((r) => r.data),
  create: (b: Record<string, unknown>) => api.post<AdminSellerDetail>(`${SA}/sellers`, b).then((r) => r.data),
  update: (id: string, b: Record<string, unknown>) => api.put<AdminSellerDetail>(`${SA}/sellers/${id}`, b).then((r) => r.data),
  status: (id: string, status: string, reason?: string) => api.post<AdminSellerDetail>(`${SA}/sellers/${id}/status`, { status, reason }).then((r) => r.data),
  createUser: (id: string, b: { email: string; name: string; password: string }) => api.post<AdminSellerDetail>(`${SA}/sellers/${id}/users`, b).then((r) => r.data),
  userActive: (id: string, userId: string, active: boolean) => api.post<AdminSellerDetail>(`${SA}/sellers/${id}/users/${userId}/active`, { active }).then((r) => r.data),
  pendingProducts: () => api.get<{ id: string; gtin: string; name: string; brand: string | null; base_price: number; created_at: string; seller_id: string; seller_name: string; claimed_by: string | null }[]>(`${SA}/products/pending`).then((r) => r.data),
  decideProduct: (id: string, approve: boolean, note?: string) => api.post(`${SA}/products/${id}/decide`, { approve, note }).then((r) => r.data),
  agreements: () => api.get<(Agreement & { industry_name: string; sales_mode: SalesMode })[]>(`${SA}/agreements`).then((r) => r.data),
  alerts: () => api.get<ChannelAlert[]>(`${SA}/alerts`).then((r) => r.data),
  stores: () => api.get<{ id: string; name: string; city: string | null; uf: string | null }[]>(`${SA}/stores`).then((r) => r.data),
  simulate: (marketId: string, gtin: string) => api.get<{
    store: { name: string; located: boolean; city: string; uf: string; receiveCampaigns: boolean };
    gtin: string;
    decisions: { seller: string; kind: SellerKind; owner: boolean; productStatus: string; allowed: boolean; channel: string | null; distributor: string | null; code: string; reason: string }[];
  }>(`${SA}/simulate`, { params: { marketId, gtin } }).then((r) => r.data),
};

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'amber' | 'green' | 'red' | 'gray' | 'lime' }> = {
  ENVIADO: { label: 'Aguardando o vendedor', tone: 'amber' },
  CONFIRMADO: { label: 'Confirmado', tone: 'lime' },
  FATURADO: { label: 'Faturado', tone: 'lime' },
  ENTREGUE: { label: 'Entregue', tone: 'green' },
  RECUSADO: { label: 'Recusado', tone: 'red' },
  CANCELADO: { label: 'Cancelado', tone: 'gray' },
};

export const AUDIENCE_LABEL: Record<Audience, string> = {
  TODAS: 'Todas as lojas da área',
  VENDEM: 'Lojas que vendem o produto',
  NAO_VENDEM: 'Lojas que não vendem o produto',
  RUPTURA: 'Lojas com possível ruptura',
};

export const BARRED_LABEL: Record<string, string> = {
  LOJA_NAO_RECEBE: 'Lojas que não recebem campanhas',
  LOJA_BLOQUEOU: 'Lojas que bloquearam a sua empresa',
  AUTORIZACAO_RETIRADA: 'Lojas que retiraram a autorização',
  FORA_DA_AREA: 'Fora da sua área de entrega',
  SEM_LOCALIZACAO: 'Lojas sem endereço cadastrado',
  AREA_EXCLUSIVA: 'Área exclusiva de outro distribuidor',
  SEM_DISTRIBUIDOR: 'Sem distribuidor seu na região',
  CANAIS_DIFERENTES: 'Produtos chegam por canais diferentes',
  VENDEDOR_INATIVO: 'Vendedor inativo',
};

export const brlCents = (c: number | null | undefined) =>
  c == null ? '—' : (Number(c) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const brlPrice = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });
export const qtyLabel = (q: number | null | undefined) => (q == null ? '—' : Number(q).toLocaleString('pt-BR', { maximumFractionDigits: 3 }));
export const cnpjLabel = (c: string | null | undefined) =>
  !c ? '—' : c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
