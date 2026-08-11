import api from './api';

/**
 * Configuração da IA do mercado (BYOK — Bring Your Own Key).
 *
 * A plataforma não fornece chave: cada mercado usa a própria conta no provedor.
 * Como quase todos os provedores do catálogo têm camada gratuita, o cliente
 * consegue operar sem pagar nada — e a cota dele nunca é dividida com outros
 * mercados.
 *
 * A chave em claro NUNCA volta do servidor. O máximo que se recebe é `keyHint`,
 * os últimos 4 caracteres.
 */

export type AiProviderId =
  | 'CEREBRAS' | 'GROQ' | 'NVIDIA_NIM' | 'OPENROUTER'
  | 'GEMINI' | 'OPENAI' | 'CUSTOM';

export interface AiProviderOption {
  id: AiProviderId;
  nome: string;
  /** Tem camada gratuita — o cliente pode usar sem pagar. */
  gratuito: boolean;
  urlPadrao?: string | null;
  modeloPadrao?: string | null;
  /** Só o endpoint próprio exige que o cliente informe a URL. */
  exigeUrl: boolean;
}

export interface AiCredential {
  id: string;
  provider: AiProviderId;
  providerLabel: string;
  hasFreeTier: boolean;
  baseUrl?: string | null;
  model?: string | null;
  /** Últimos 4 caracteres da chave, para o usuário reconhecê-la. */
  keyHint?: string | null;
  enabled: boolean;
  /** Ordem na cadeia de fallback; menor é tentado primeiro. */
  priority: number;
  lastCheckAt?: string | null;
  lastCheckOk?: boolean | null;
  lastCheckError?: string | null;
}

export interface AiUsageSummary {
  periodoDias: number;
  chamadas: number;
  tokensEntrada: number;
  tokensSaida: number;
  porResultado: Record<string, { chamadas: number; tokensEntrada: number; tokensSaida: number }>;
  /** Há credencial habilitada e o servidor sabe decifrá-la. */
  configurado: boolean;
  /** O servidor tem chave mestra de criptografia. Sem ela, o BYOK fica off. */
  criptografiaDisponivel: boolean;
}

export interface SaveCredentialInput {
  provider: AiProviderId;
  /** Vazio numa credencial existente preserva a chave já cadastrada. */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  priority?: number;
}

const base = (marketId: string) => `/v1/markets/${marketId}/ai`;

export const aiService = {
  listProviders: async (marketId: string): Promise<AiProviderOption[]> => {
    const { data } = await api.get(`${base(marketId)}/providers`);
    return data;
  },

  listCredentials: async (marketId: string): Promise<AiCredential[]> => {
    const { data } = await api.get(`${base(marketId)}/credentials`);
    return data;
  },

  saveCredential: async (
    marketId: string,
    input: SaveCredentialInput,
  ): Promise<AiCredential> => {
    const { data } = await api.put(`${base(marketId)}/credentials`, input);
    return data;
  },

  /** Faz uma chamada real e mínima ao provedor para validar a chave. */
  testCredential: async (marketId: string, credentialId: string): Promise<AiCredential> => {
    const { data } = await api.post(`${base(marketId)}/credentials/${credentialId}/test`);
    return data;
  },

  setEnabled: async (marketId: string, credentialId: string, enabled: boolean): Promise<void> => {
    await api.post(`${base(marketId)}/credentials/${credentialId}/enabled`, { enabled });
  },

  deleteCredential: async (marketId: string, credentialId: string): Promise<void> => {
    await api.delete(`${base(marketId)}/credentials/${credentialId}`);
  },

  usage: async (marketId: string): Promise<AiUsageSummary> => {
    const { data } = await api.get(`${base(marketId)}/usage`);
    return data;
  },
};
