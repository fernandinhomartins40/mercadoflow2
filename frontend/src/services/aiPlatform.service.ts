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
  layer: 'TEMPLATE' | 'JEV' | 'FLASH' | 'PRO' | 'VOZ' | 'CANAL';
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

export interface AiFallbackRow {
  task: string;
  position: number;
  provider: 'DEEPSEEK' | 'OPENROUTER';
  model: string;
  inputPriceUsdM: number;
  outputPriceUsdM: number;
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AiOverview {
  settings: AiSettingsRow;
  providers: AiProviderRow[];
  routes: AiRouteRow[];
  fallbacks: AiFallbackRow[];
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

export interface WhatsAppConfig {
  templateName: string;
  templateLang: string;
  verifyTokenSet: boolean;
  appSecretSet: boolean;
  appSecretHint: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const aiAdminService = {
  whatsapp: async (): Promise<WhatsAppConfig> => (await api.get(`${admin}/whatsapp`)).data,
  saveFallback: async (task: string, position: number, body: Partial<AiFallbackRow>): Promise<AiFallbackRow[]> =>
    (await api.put(`${admin}/routes/${task}/fallbacks/${position}`, body)).data,
  removeFallback: async (task: string, position: number): Promise<AiFallbackRow[]> =>
    (await api.delete(`${admin}/routes/${task}/fallbacks/${position}`)).data,
  notifyWhatsapp: async (marketId: string): Promise<{ enviadas: number }> => (await api.post(`${admin}/whatsapp/notify/${marketId}`, {})).data,
  saveWhatsapp: async (body: { templateName?: string; templateLang?: string; verifyToken?: string; appSecret?: string }): Promise<WhatsAppConfig> =>
    (await api.put(`${admin}/whatsapp`, body)).data,
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
  /** Reserva paga: transcrição do áudio no servidor (o áudio não é guardado). */
  transcribe: async (marketId: string, audio: Blob): Promise<{ ok: boolean; texto: string | null; aviso: string | null; creditosUsados: number }> =>
    (await api.post(`/v1/markets/${marketId}/copilot/voice/transcribe`, audio, {
      headers: { 'Content-Type': (audio.type || 'audio/webm').split(';')[0] }, timeout: 45000,
    })).data,
  /** Comando que a lista fixa não reconheceu: o Jev escolhe a ação da tela. */
  command: async (marketId: string, contexto: 'CONFERENCIA' | 'RESUMO', texto: string): Promise<{ acao: string | null; confianca: number; origem: string }> =>
    (await api.post(`/v1/markets/${marketId}/copilot/voice/command`, { contexto, texto }, { timeout: 8000 })).data,
};

// ── Agentes do Copiloto (F3) ───────────────────────────────────────────────

export type DecisionStatus = 'PENDENTE' | 'INFORMATIVA' | 'SILENCIADA' | 'APROVADA' | 'RECUSADA' | 'EXPIRADA';

export interface CopilotDecision {
  id: string;
  agent: 'GERENTE' | 'COMPRAS' | 'RECEBIMENTO' | string;
  kind: 'PEDIDO' | 'MENSAGEM_FORNECEDOR' | 'AVISO' | string;
  scopeKey: string | null;
  title: string;
  body: string;
  numbers: Record<string, unknown>;
  payload: Record<string, unknown>;
  impact: number | null;
  level: number;
  urgent: boolean;
  status: DecisionStatus;
  funnel: { julgamento?: 'JEV' | 'REGRA'; vale?: boolean; urgente?: boolean; probabilidadeVale?: number; confianca?: number };
  explanation: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  result: { executado?: boolean; noPedido?: number; semFornecedor?: number; jaDecididas?: number; aceitas?: number; encarteUrl?: string; whatsappUrl?: string; mensagem?: string } | null;
}

export interface CopilotInbox {
  pendentes: number;
  avisos: number;
  urgentes: number;
  decisoes: CopilotDecision[];
}

export interface CopilotAgentSettings {
  agent: string;
  label: string;
  enabled: boolean;
  level: number;
  dailyLimit: number;
  minImpact: number;
}

export interface CopilotPrefs {
  quietStart: string;
  quietEnd: string;
  whatsappPhone: string | null;
  whatsappOptIn: boolean;
}

export interface CopilotLesson {
  id: string;
  scope: string;
  scopeKey: string;
  topic: string;
  text: string;
  weight: number;
  updatedAt: string;
}

export const copilotAgentsService = {
  inbox: async (marketId: string, view: 'abertas' | 'decididas' | 'silenciadas' = 'abertas'): Promise<CopilotInbox> =>
    (await api.get(`/v1/markets/${marketId}/copilot/decisions`, { params: { view } })).data,
  approve: async (marketId: string, id: string): Promise<CopilotDecision> =>
    (await api.post(`/v1/markets/${marketId}/copilot/decisions/${id}/approve`, {})).data,
  refuse: async (marketId: string, id: string, motivo?: string): Promise<CopilotDecision> =>
    (await api.post(`/v1/markets/${marketId}/copilot/decisions/${id}/refuse`, { motivo })).data,
  explain: async (marketId: string, id: string): Promise<{ texto: string; ia: boolean; doCache: boolean; aviso: string | null }> =>
    (await api.post(`/v1/markets/${marketId}/copilot/decisions/${id}/explain`, {}, { timeout: 90000 })).data,
  agents: async (marketId: string): Promise<{ agentes: CopilotAgentSettings[]; preferencias: CopilotPrefs; licoes: CopilotLesson[] }> =>
    (await api.get(`/v1/markets/${marketId}/copilot/agents`)).data,
  saveAgent: async (marketId: string, agent: string, body: Partial<CopilotAgentSettings>): Promise<CopilotAgentSettings[]> =>
    (await api.put(`/v1/markets/${marketId}/copilot/agents/${agent}`, body)).data,
  savePrefs: async (marketId: string, body: Partial<CopilotPrefs>): Promise<CopilotPrefs> =>
    (await api.put(`/v1/markets/${marketId}/copilot/prefs`, body)).data,
  run: async (marketId: string): Promise<{ signals: number; afterMemory: number; jevCalls: number; created: number; silenced: number }> =>
    (await api.post(`/v1/markets/${marketId}/copilot/agents/run`, {}, { timeout: 60000 })).data,
};

// ── Servidor MCP (F4) ──────────────────────────────────────────────────────

export interface McpKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  createdBy: string | null;
  lastUsedAt: string | null;
  calls: number;
  revokedAt: string | null;
}

export const mcpService = {
  list: async (marketId: string): Promise<{ chaves: McpKeyRow[]; ferramentas: string[] }> =>
    (await api.get(`/v1/markets/${marketId}/copilot/mcp-keys`)).data,
  create: async (marketId: string, nome: string): Promise<{ key: McpKeyRow; secret: string }> =>
    (await api.post(`/v1/markets/${marketId}/copilot/mcp-keys`, { nome })).data,
  revoke: async (marketId: string, id: string): Promise<McpKeyRow[]> =>
    (await api.delete(`/v1/markets/${marketId}/copilot/mcp-keys/${id}`)).data,
};
