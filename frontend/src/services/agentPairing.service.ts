import api from './api';

export interface PairingSessionInfo {
  userCode: string;
  hostname: string;
  status: string;
  expiresAt: string;
}

export interface PairingApprovalResult {
  status: string;
  marketName: string;
  pdvName: string;
  pdvId: string;
}

/**
 * Consulta o que sera pareado. Rota publica: a pagina precisa mostrar o
 * computador de origem antes mesmo de o usuario autenticar.
 */
const getSession = async (userCode: string): Promise<PairingSessionInfo> => {
  const { data } = await api.get<PairingSessionInfo>(
    `/v1/agent-pairing/session/${encodeURIComponent(userCode.trim().toUpperCase())}`,
  );
  return data;
};

/** Cria o PDV, emite a chave e libera o resgate pelo agente. Exige login. */
const approve = async (userCode: string, pdvName: string): Promise<PairingApprovalResult> => {
  const { data } = await api.post<PairingApprovalResult>('/v1/agent-pairing/approve', {
    userCode: userCode.trim().toUpperCase(),
    pdvName: pdvName.trim(),
  });
  return data;
};

export default { getSession, approve };
