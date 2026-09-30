import api from './api';

/** IA da plataforma (revenda de créditos): painel do superadmin e carteira do mercado. */

export interface AiProviderRow {
  provider: 'DEEPSEEK' | 'JEV' | 'OPENROUTER' | 'DEEPGRAM' | 'WHATSAPP';
  baseUrl: string;
  allowedBaseUrls: string[];
  configured: boolean;
  keyHint: string | null;
  enabled: boolean;
  priority: number;
  defaultModel: string | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckError: string | null;
  lastCheckMs: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AiSettingsRow {
  enabled: boolean;
  pilotOnly: boolean;
  dailyBudgetUsd: number;
  lowBalanceAlertUsd: number;
  defaultMonthlyCapCredits: number;
  usdBrl: number;
  pilotGrantCredits: number;
  encryptionReady: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AiRouteRow {
  task: string;
  label: string;
  layer: 'TEMPLATE' | 'JEV' | 'FLASH' | 'PRO';
  provider: string | null;
  model: string | null;
  maxContextTokens: number;
  maxOutputTokens: number;
  temperature: number;
  jevThreshold: number;
  creditsPerUse: number;
  inputPriceUsdM: number;
  outputPriceUsdM: number;
  shadow: boolean;
  enabled: boolean;
  notes: string | null;
}

export interface AiPilotRow { marketId: string; name: string; cnpj: string | null; balance: number; addedAt: string }
export interface AiPlanRow { id: string; name: string; credits: number; priceCents: number; active: boolean; sortOrder: number }
export interface AiOrderRow {
  id: string; marketId: string; marketName: string; credits: number; amountCents: number; status: 'PENDING' | 'PAID' | 'CANCELED';
  txid: string; pixPayload: string | null; pixQrPng: string | null; createdAt: string; paidAt: string | null;
}
export interface AiWallet { balance: number; monthlyCap: number | null; monthUsed: number; effectiveCap: number; monthStart: string }
export interface AiLedgerRow { delta: number; kind: string; task: string | null; note: string | null; createdAt: string }

export interface AiOverview {
  settings: AiSettingsRow;
  providers: AiProviderRow[];
  routes: AiRouteRow[];
  pilots: AiPilotRow[];
  plans: AiPlanRow[];
}

export interface AiTestResult { ok: boolean; message: string; latencyMs: number; balance: string | null }

export type ConsoleTask = 'CHAT' | 'EXPLAIN' | 'JEV';
export interface ConsoleResult {
  tarefa: string; portao: string; sucesso: boolean; resposta: unknown; camada: string; provedor: string | null;
  consultas?: string[]; oportunidade?: string; tokensEntrada?: number | null; tokensSaida?: number | null;
  custoUsd?: number; custoBrl?: number; tempoMs: number;
}

const admin = '/v1/super-admin/ai';

export const aiAdminService = {
  overview: async (): Promise<AiOverview> => (await api.get(`${admin}/overview`)).data,
  saveSettings: async (body: Partial<AiSettingsRow>): Promise<AiSettingsRow> => (await api.put(`${admin}/settings`, body)).data,
  saveProvider: async (provider: string, body: { apiKey?: string; baseUrl?: string; model?: string; enabled?: boolean; priority?: number }): Promise<AiProviderRow[]> =>
    (await api.put(`${admin}/providers/${provider}`, body)).data,
  removeKey: async (provider: string): Promise<AiProviderRow[]> => (await api.delete(`${admin}/providers/${provider}/key`)).data,
  test: async (provider: string): Promise<AiTestResult> => (await api.post(`${admin}/providers/${provider}/test`, {}, { timeout: 60000 })).data,
  saveRoute: async (task: string, body: Partial<AiRouteRow>): Promise<AiRouteRow[]> => (await api.put(`${admin}/routes/${task}`, body)).data,
  markets: async (q: string): Promise<Array<{ id: string; name: string; cnpj: string | null }>> =>
    (await api.get(`${admin}/markets`, { params: { q } })).data,
  addPilot: async (marketId: string): Promise<AiPilotRow[]> => (await api.post(`${admin}/pilots`, { marketId })).data,
  removePilot: async (marketId: string): Promise<AiPilotRow[]> => (await api.delete(`${admin}/pilots/${marketId}`)).data,
  wallet: async (marketId: string): Promise<{ wallet: AiWallet; ledger: AiLedgerRow[] }> => (await api.get(`${admin}/wallets/${marketId}`)).data,
  adjust: async (marketId: string, delta: number, note: string): Promise<AiWallet> =>
    (await api.post(`${admin}/wallets/${marketId}/adjust`, { delta, note })).data,
  setCap: async (marketId: string, monthlyCap: number | null): Promise<AiWallet> =>
    (await api.put(`${admin}/wallets/${marketId}/cap`, { monthlyCap })).data,
  savePlan: async (body: Partial<AiPlanRow>): Promise<AiPlanRow[]> => (await api.put(`${admin}/plans`, body)).data,
  orders: async (status?: string): Promise<AiOrderRow[]> => (await api.get(`${admin}/orders`, { params: { status } })).data,
  confirm: async (id: string) => { await api.post(`${admin}/orders/${id}/confirm`); },
  cancel: async (id: string) => { await api.post(`${admin}/orders/${id}/cancel`); },
  usage: async (days: number): Promise<Record<string, unknown>> => (await api.get(`${admin}/usage`, { params: { days } })).data,
  console: async (body: { marketId: string; task: ConsoleTask; input?: string; opportunityId?: string }): Promise<ConsoleResult> =>
    (await api.post(`${admin}/console`, body, { timeout: 120000 })).data,
  audit: async (): Promise<Array<{ actor: string; action: string; detail: string; createdAt: string }>> => (await api.get(`${admin}/audit`)).data,
};

export interface AiCreditsStatus {
  wallet: AiWallet;
  plans: AiPlanRow[];
  ledger: AiLedgerRow[];
  orders: AiOrderRow[];
  iaLiberada: boolean;
  aviso?: string;
}

export const aiCreditsService = {
  status: async (marketId: string): Promise<AiCreditsStatus> => (await api.get(`/v1/markets/${marketId}/ai-credits`)).data,
  createOrder: async (marketId: string, planId: string): Promise<AiOrderRow> =>
    (await api.post(`/v1/markets/${marketId}/ai-credits/orders`, { planId })).data,
  order: async (marketId: string, orderId: string): Promise<AiOrderRow> =>
    (await api.get(`/v1/markets/${marketId}/ai-credits/orders/${orderId}`)).data,
  explain: async (marketId: string, opportunityId: string): Promise<{ texto: string; ia: boolean; doCache: boolean }> =>
    (await api.post(`/v1/markets/${marketId}/opportunities/${opportunityId}/explain`, {}, { timeout: 90000 })).data,
};

export interface DailyBrief {
  day: string;
  text: string;
  items: Array<{ tipo: string; id: string; titulo: string; impacto: number | null }>;
}

/** Copiloto do lojista: resumo do dia em texto pronto (sem custo de IA). */
export const copilotService = {
  brief: async (marketId: string): Promise<DailyBrief> => (await api.get(`/v1/markets/${marketId}/copilot/brief`)).data,
  refreshBrief: async (marketId: string): Promise<DailyBrief> =>
    (await api.post(`/v1/markets/${marketId}/copilot/brief/refresh`, {})).data,
};
