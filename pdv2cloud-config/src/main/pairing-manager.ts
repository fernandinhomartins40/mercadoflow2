import os from 'os';
import logger from './logger';

/**
 * Cliente do pareamento por QR Code do Agente Mercado Flow.
 *
 * O agente inicia a sessão, exibe o QR/link e faz long-poll até o usuário
 * aprovar no celular. A chave de API chega direto aqui — nunca é digitada nem
 * exibida em tela — e o segredo do agente, que prova quem somos ao resgatá-la,
 * fica apenas em memória neste processo.
 */

export interface PairingStart {
  userCode: string;
  pairingUrl: string;
  qrCode: string | null;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface PairingClaim {
  status: 'PENDING' | 'APPROVED' | 'CONSUMED' | 'EXPIRED' | 'CANCELLED';
  apiKey?: string;
  marketId?: string;
  marketName?: string;
  pdvId?: string;
  pdvName?: string;
}

/** Segredo em memória: some se o app fechar, invalidando o pareamento pendente. */
let activeSecret: string | null = null;
let activeUserCode: string | null = null;

const normalizeApiUrl = (value: string) => value.replace(/\/+$/, '');

export const startPairing = async (apiUrl: string): Promise<PairingStart> => {
  const base = normalizeApiUrl(apiUrl);
  const response = await fetch(`${base}/api/v1/agent-pairing/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname: os.hostname() }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao iniciar pareamento (HTTP ${response.status})`);
  }

  const data = await response.json();
  activeSecret = data.agentSecret;
  activeUserCode = data.userCode;

  logger.info('Pareamento iniciado', { userCode: data.userCode });

  return {
    userCode: data.userCode,
    pairingUrl: data.pairingUrl,
    qrCode: data.qrCode || null,
    expiresAt: data.expiresAt,
    expiresInSeconds: data.expiresInSeconds,
  };
};

/**
 * Consulta o status. Enquanto PENDING o wizard segue perguntando; ao virar
 * APPROVED devolve a chave uma única vez.
 */
export const claimPairing = async (apiUrl: string): Promise<PairingClaim> => {
  if (!activeSecret || !activeUserCode) {
    throw new Error('Nenhum pareamento em andamento. Gere um novo QR Code.');
  }

  const base = normalizeApiUrl(apiUrl);
  const response = await fetch(`${base}/api/v1/agent-pairing/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userCode: activeUserCode, agentSecret: activeSecret }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar pareamento (HTTP ${response.status})`);
  }

  const data = (await response.json()) as PairingClaim;

  if (data.status === 'APPROVED') {
    // A chave já foi entregue: o segredo perdeu a serventia e sai da memória.
    logger.info('Pareamento aprovado e chave recebida', { pdvName: data.pdvName });
    activeSecret = null;
    activeUserCode = null;
  } else if (data.status !== 'PENDING') {
    activeSecret = null;
    activeUserCode = null;
  }

  return data;
};

export const cancelPairing = async (apiUrl: string): Promise<void> => {
  if (!activeUserCode) {
    return;
  }
  const base = normalizeApiUrl(apiUrl);
  const userCode = activeUserCode;
  activeSecret = null;
  activeUserCode = null;

  try {
    await fetch(`${base}/api/v1/agent-pairing/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userCode }),
    });
  } catch (err) {
    logger.debug('Falha ao cancelar pareamento (ignorado)', err);
  }
};

export const hasActivePairing = () => Boolean(activeSecret && activeUserCode);
