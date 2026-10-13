import api from './api';

/** Integração com ERPs: a loja autoriza, revoga e acompanha; o superadmin cadastra e homologa. */

export interface IntegrationPartner {
  partnerId: string;
  name: string;
  website: string | null;
  /** Sistema da mesma empresa (Bipae): pode receber os escopos da casa. */
  firstParty: boolean;
  /** Escopos que este parceiro pode receber. */
  availableScopes: string[];
  lastSalesAt: string | null;
  homologated: boolean;
  suspended: boolean;
  authorized: boolean;
  scopes: string[];
  authorizedAt: string | null;
  authorizedBy: string | null;
  lastStockAt: string | null;
  lastPricesAt: string | null;
  lastCostsAt: string | null;
  lastCallAt: string | null;
  /** A troca está em dia: o ERP recebe as entradas prontas. */
  receivesInbound: boolean;
}

export interface IntegrationsOverview {
  partners: IntegrationPartner[];
  scopes: Record<string, string>;
  reciprocityDays: number;
  requests: { erpName: string; vendorEmail: string | null; createdAt: string; emailed: boolean }[];
}

/** O pedido de conexão aberto pelo sistema parceiro, antes do dono aprovar. */
export interface ConnectPreview {
  partnerId: string;
  partnerName: string;
  website: string | null;
  firstParty: boolean;
  status: 'PENDENTE' | 'APROVADO' | 'RECUSADO' | 'EXPIRADO' | 'INDISPONIVEL';
  storeName: string | null;
  cnpj: string | null;
  cnpjMatches: boolean;
  marketCnpj: string | null;
  scopes: Record<string, string>;
  connectedMarketId: string | null;
}

export interface PartnerCall {
  at: string;
  partner: string;
  method: string;
  path: string;
  items: number;
  accepted: number;
  rejected: number;
  status: number;
  dryRun: boolean;
}

export interface AdminPartner {
  id: string;
  name: string;
  contactEmail: string | null;
  website: string | null;
  clientId: string;
  status: 'REGISTRADO' | 'HOMOLOGADO' | 'SUSPENSO';
  publicListing: boolean;
  firstParty: boolean;
  /** Desconto no plano para loja que é cliente ativo deste parceiro (só o da casa). */
  planDiscountPercent: number;
  activeCustomers: number;
  accountsCreated: number;
  webhook: boolean;
  createdAt: string;
  markets: number;
  lastCallAt: string | null;
  checklist: Record<string, boolean>;
}

export interface PartnerCredentials { partnerId: string; clientId: string; clientSecret: string; aviso: string }

const base = (marketId: string) => `/v1/markets/${marketId}/integrations`;

export const integrationsService = {
  overview: (marketId: string) => api.get<IntegrationsOverview>(base(marketId)).then((r) => r.data),
  lookup: (marketId: string, clientId: string) =>
    api.get<{ partnerId: string; name: string; website: string | null; status: string }>(`${base(marketId)}/lookup`, { params: { clientId } }).then((r) => r.data),
  authorize: (marketId: string, partnerId: string, scopes: string[]) =>
    api.post(`${base(marketId)}/partners/${partnerId}/authorize`, { scopes }).then((r) => r.data),
  revoke: (marketId: string, partnerId: string) => api.post(`${base(marketId)}/partners/${partnerId}/revoke`).then((r) => r.data),
  log: (marketId: string, partnerId?: string) => api.get<PartnerCall[]>(`${base(marketId)}/log`, { params: { partnerId } }).then((r) => r.data),
  requestErp: (marketId: string, b: { erpName: string; vendorEmail?: string; note?: string }) =>
    api.post<{ ok: boolean; emailed: boolean }>(`${base(marketId)}/erp-request`, b).then((r) => r.data),
  connectPreview: (marketId: string, code: string) =>
    api.get<ConnectPreview>(`${base(marketId)}/connect/${encodeURIComponent(code)}`).then((r) => r.data),
  connectApprove: (marketId: string, code: string, scopes: string[]) =>
    api.post<{ ok: boolean; scopes: string[]; returnUrl: string | null }>(`${base(marketId)}/connect/${encodeURIComponent(code)}`, { scopes }).then((r) => r.data),
  connectRefuse: (marketId: string, code: string) =>
    api.post<{ ok: boolean; returnUrl: string | null }>(`${base(marketId)}/connect/${encodeURIComponent(code)}/refuse`).then((r) => r.data),
};

const SA = '/v1/super-admin/partners';
export const partnersAdmin = {
  list: () => api.get<AdminPartner[]>(SA).then((r) => r.data),
  create: (b: { name: string; contactEmail?: string; website?: string }) => api.post<PartnerCredentials>(SA, b).then((r) => r.data),
  rotate: (id: string) => api.post<PartnerCredentials>(`${SA}/${id}/rotate-secret`).then((r) => r.data),
  status: (id: string, status: AdminPartner['status'], publicListing?: boolean) =>
    api.post(`${SA}/${id}/status`, { status, publicListing }).then((r) => r.data),
  firstParty: (id: string, firstParty: boolean) => api.post(`${SA}/${id}/first-party`, { firstParty }).then((r) => r.data),
  planDiscount: (id: string, percent: number) =>
    api.post<{ ok: boolean; percent: number; repriced: number }>(`${SA}/${id}/plan-discount`, { percent }).then((r) => r.data),
};

export const publicPartners = () => api.get<{ name: string; website: string | null }[]>('/v1/public/partners').then((r) => r.data);

/** Escopos que só o sistema da mesma empresa (Bipae) recebe. */
export const FIRST_PARTY_SCOPES = ['sales:write', 'catalog:read', 'insights:read', 'promotions:read', 'confere:use'];

export interface ConnectPublicInfo {
  partnerName: string;
  firstParty: boolean;
  status: ConnectPreview['status'];
  storeName: string | null;
  cnpj: string | null;
  ownerEmail: string | null;
}

/** Link "Conectar ao MercadoFlow" antes do login. */
export const connectPublicInfo = (code: string) =>
  api.get<ConnectPublicInfo>(`/v1/public/partners/connect/${encodeURIComponent(code)}`).then((r) => r.data);
