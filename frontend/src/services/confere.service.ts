import api from './api';
import type {
  AdminAccount, AdminOrder, ConfereCertificate, ConfereCheck, ConfereDocument, ConfereOrder, ConferePlan, ConfereSettings,
  ConfereStats, ConfereStatus, DocumentSummary, ItemCount, LedgerEntry, ReadResult,
} from '../types/confere.types';

const base = (marketId: string) => `/v1/markets/${marketId}/confere`;
const multipart = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 90000 };

export const confereService = {
  status: async (m: string): Promise<ConfereStatus> => (await api.get(`${base(m)}/status`)).data,
  acceptTerms: async (m: string, version: string): Promise<ConfereStatus> => (await api.post(`${base(m)}/terms`, { version })).data,
  /** A busca pode levar até ~1 minuto (Sefaz ou Meu Danfe). */
  read: async (m: string, accessKey: string): Promise<ReadResult> =>
    (await api.post(`${base(m)}/read`, { accessKey }, { timeout: 120000 })).data,
  upload: async (m: string, file: Blob, name = 'nota.xml'): Promise<ReadResult> => {
    const data = new FormData();
    data.append('file', file, name);
    return (await api.post(`${base(m)}/upload`, data, multipart)).data;
  },
  documents: async (m: string): Promise<DocumentSummary[]> => (await api.get(`${base(m)}/documents`)).data ?? [],
  document: async (m: string, id: string): Promise<ConfereDocument> => (await api.get(`${base(m)}/documents/${id}`)).data,
  saveCheck: async (m: string, id: string, body: { counts: Record<string, ItemCount>; blind: boolean; finish?: boolean; restart?: boolean; summary?: unknown }): Promise<ConfereCheck> =>
    (await api.put(`${base(m)}/documents/${id}/check`, body)).data,
  saveCertificate: async (m: string, file: File, password: string, uf: string): Promise<ConfereCertificate> => {
    const data = new FormData();
    data.append('file', file, file.name);
    data.append('password', password);
    if (uf) data.append('uf', uf);
    return (await api.post(`${base(m)}/certificate`, data, multipart)).data;
  },
  removeCertificate: async (m: string) => { await api.delete(`${base(m)}/certificate`); },
  sync: async (m: string): Promise<string> => (await api.post(`${base(m)}/sync`, {}, { timeout: 180000 })).data?.message,
  ledger: async (m: string): Promise<LedgerEntry[]> => (await api.get(`${base(m)}/ledger`)).data ?? [],
  orders: async (m: string): Promise<ConfereOrder[]> => (await api.get(`${base(m)}/orders`)).data ?? [],
  order: async (m: string, id: string): Promise<ConfereOrder> => (await api.get(`${base(m)}/orders/${id}`)).data,
  createOrder: async (m: string, planId: string, method: 'PIX' | 'STRIPE'): Promise<ConfereOrder> =>
    (await api.post(`${base(m)}/orders`, { planId, method })).data,
};

const admin = '/v1/super-admin/confere';

export const confereAdminService = {
  settings: async (): Promise<ConfereSettings> => (await api.get(`${admin}/settings`)).data,
  save: async (body: Partial<ConfereSettings> & { meuDanfeApiKey?: string }): Promise<ConfereSettings> =>
    (await api.put(`${admin}/settings`, body, { timeout: 60000 })).data,
  test: async (): Promise<{ ok: boolean; message: string }> => (await api.post(`${admin}/settings/test`, {}, { timeout: 60000 })).data,
  stats: async (): Promise<ConfereStats> => (await api.get(`${admin}/stats`)).data,
  plans: async (): Promise<ConferePlan[]> => (await api.get(`${admin}/plans`)).data ?? [],
  createPlan: async (p: Omit<ConferePlan, 'id'>): Promise<ConferePlan[]> => (await api.post(`${admin}/plans`, p)).data,
  updatePlan: async (id: string, p: Omit<ConferePlan, 'id'>): Promise<ConferePlan[]> => (await api.put(`${admin}/plans/${id}`, p)).data,
  deletePlan: async (id: string): Promise<ConferePlan[]> => (await api.delete(`${admin}/plans/${id}`)).data,
  orders: async (status?: string): Promise<AdminOrder[]> => (await api.get(`${admin}/orders`, { params: { status } })).data ?? [],
  confirm: async (id: string) => { await api.post(`${admin}/orders/${id}/confirm`); },
  cancel: async (id: string) => { await api.post(`${admin}/orders/${id}/cancel`); },
  accounts: async (): Promise<AdminAccount[]> => (await api.get(`${admin}/accounts`)).data ?? [],
  adjust: async (marketId: string, delta: number, note: string) => {
    await api.post(`${admin}/accounts/${marketId}/adjust`, { delta, note });
  },
};

export const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
