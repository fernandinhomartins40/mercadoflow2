import api from './api';
import type {
  ArtBrand, ArtCampaign, ArtProduct, ArtTheme, PlatformAiSettings, PublicCampaign, Regions, SuggestionGroup,
  ThemeSuggestion,
} from '../types/art.types';

const market = (marketId: string) => `/v1/markets/${marketId}/art`;
const admin = '/v1/super-admin/art';

const form = (file: Blob, name = 'file', filename = 'imagem.png') => {
  const data = new FormData();
  data.append(name, file, filename);
  return data;
};
const multipart = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 };

/** Mensagem de erro que o backend mandou, ou um texto padrão. */
export const apiMessage = (error: unknown, fallback: string) => {
  const response = (error as { response?: { status?: number; data?: { message?: string } } })?.response;
  // Só erro de validação (4xx) traz mensagem escrita para o usuário; 5xx é genérica.
  if (response?.status && response.status < 500 && response.data?.message) return response.data.message;
  if (response?.status === 413) return 'O arquivo é grande demais para enviar.';
  return fallback;
};

export const artService = {
  themes: async (marketId: string): Promise<ArtTheme[]> => (await api.get(`${market(marketId)}/themes`)).data ?? [],
  brand: async (marketId: string): Promise<ArtBrand> => (await api.get(`${market(marketId)}/brand`)).data,
  saveBrand: async (marketId: string, brand: Partial<ArtBrand>): Promise<ArtBrand> =>
    (await api.put(`${market(marketId)}/brand`, brand)).data,
  uploadLogo: async (marketId: string, file: File): Promise<ArtBrand> =>
    (await api.post(`${market(marketId)}/brand/logo`, form(file, 'file', file.name), multipart)).data,
  removeLogo: async (marketId: string): Promise<ArtBrand> => (await api.delete(`${market(marketId)}/brand/logo`)).data,
  searchProducts: async (marketId: string, q: string): Promise<ArtProduct[]> =>
    (await api.get(`${market(marketId)}/products`, { params: { q } })).data ?? [],
  suggestions: async (marketId: string): Promise<SuggestionGroup[]> =>
    (await api.get(`${market(marketId)}/suggestions`, { timeout: 60000 })).data ?? [],
  /** Foto de outro site passando pelo nosso domínio (o canvas exige mesma origem). */
  proxiedImage: async (marketId: string, url: string): Promise<Blob> =>
    (await api.get(`${market(marketId)}/image`, { params: { url }, responseType: 'blob' })).data,
  campaigns: async (marketId: string): Promise<ArtCampaign[]> => (await api.get(`${market(marketId)}/campaigns`)).data ?? [],
  campaign: async (marketId: string, id: string): Promise<ArtCampaign> =>
    (await api.get(`${market(marketId)}/campaigns/${id}`)).data,
  createCampaign: async (marketId: string, body: Partial<ArtCampaign>): Promise<ArtCampaign> =>
    (await api.post(`${market(marketId)}/campaigns`, body)).data,
  saveCampaign: async (marketId: string, id: string, body: Partial<ArtCampaign>): Promise<ArtCampaign> =>
    (await api.put(`${market(marketId)}/campaigns/${id}`, body)).data,
  duplicateCampaign: async (marketId: string, id: string): Promise<ArtCampaign> =>
    (await api.post(`${market(marketId)}/campaigns/${id}/duplicate`)).data,
  deleteCampaign: async (marketId: string, id: string) => { await api.delete(`${market(marketId)}/campaigns/${id}`); },
  publish: async (marketId: string, id: string, files: Array<{ format: string; blob: Blob }>): Promise<ArtCampaign> => {
    const data = new FormData();
    files.forEach((f, i) => {
      data.append('files', f.blob, `${f.format}-${i}.jpg`);
      data.append('formats', f.format);
    });
    return (await api.post(`${market(marketId)}/campaigns/${id}/publish`, data, multipart)).data;
  },
  unpublish: async (marketId: string, id: string): Promise<ArtCampaign> =>
    (await api.post(`${market(marketId)}/campaigns/${id}/unpublish`)).data,
  publicCampaign: async (slug: string): Promise<PublicCampaign> => (await api.get(`/v1/public/encartes/${slug}`)).data,
};

export const artAdminService = {
  meta: async (): Promise<{ occasions: string[] }> => (await api.get(`${admin}/meta`)).data,
  aiSettings: async (): Promise<PlatformAiSettings> => (await api.get(`${admin}/ai-settings`)).data,
  saveAiSettings: async (body: { apiKey?: string; model?: string }): Promise<PlatformAiSettings> =>
    (await api.put(`${admin}/ai-settings`, body)).data,
  removeAiKey: async (): Promise<PlatformAiSettings> => (await api.delete(`${admin}/ai-settings/key`)).data,
  testAi: async (): Promise<{ ok: boolean; message: string; latencyMs: number }> =>
    (await api.post(`${admin}/ai-settings/test`, {}, { timeout: 60000 })).data,
  themes: async (): Promise<ArtTheme[]> => (await api.get(`${admin}/themes`)).data ?? [],
  theme: async (id: string): Promise<ArtTheme> => (await api.get(`${admin}/themes/${id}`)).data,
  createTheme: async (body: { name?: string; occasion?: string }): Promise<ArtTheme> =>
    (await api.post(`${admin}/themes`, body)).data,
  updateTheme: async (id: string, body: Partial<ArtTheme>): Promise<ArtTheme> =>
    (await api.patch(`${admin}/themes/${id}`, body)).data,
  deleteTheme: async (id: string) => { await api.delete(`${admin}/themes/${id}`); },
  uploadSeal: async (id: string, file: File): Promise<ArtTheme> =>
    (await api.post(`${admin}/themes/${id}/seal`, form(file, 'file', file.name), multipart)).data,
  removeSeal: async (id: string): Promise<ArtTheme> => (await api.delete(`${admin}/themes/${id}/seal`)).data,
  uploadBackground: async (id: string, format: string, file: File): Promise<ArtTheme> =>
    (await api.post(`${admin}/themes/${id}/formats/${format}/background`, form(file, 'file', file.name), multipart)).data,
  saveRegions: async (id: string, format: string, regions: Regions, analysis?: unknown): Promise<ArtTheme> =>
    (await api.put(`${admin}/themes/${id}/formats/${format}/regions`, { regions, analysis })).data,
  deleteFormat: async (id: string, format: string): Promise<ArtTheme> =>
    (await api.delete(`${admin}/themes/${id}/formats/${format}`)).data,
  suggest: async (id: string, body: { format: string; image: string; candidates: unknown[] }): Promise<ThemeSuggestion> =>
    (await api.post(`${admin}/themes/${id}/suggest`, body, { timeout: 90000 })).data,
};
