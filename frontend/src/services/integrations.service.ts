import api from './api';

/** Integração com ERPs: a loja autoriza, revoga e acompanha; o superadmin cadastra e homologa. */

export interface IntegrationPartner {
  partnerId: string;
  name: string;
  website: string | null;
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
};

const SA = '/v1/super-admin/partners';
export const partnersAdmin = {
  list: () => api.get<AdminPartner[]>(SA).then((r) => r.data),
  create: (b: { name: string; contactEmail?: string; website?: string }) => api.post<PartnerCredentials>(SA, b).then((r) => r.data),
  rotate: (id: string) => api.post<PartnerCredentials>(`${SA}/${id}/rotate-secret`).then((r) => r.data),
  status: (id: string, status: AdminPartner['status'], publicListing?: boolean) =>
    api.post(`${SA}/${id}/status`, { status, publicListing }).then((r) => r.data),
};

export const publicPartners = () => api.get<{ name: string; website: string | null }[]>('/v1/public/partners').then((r) => r.data);
