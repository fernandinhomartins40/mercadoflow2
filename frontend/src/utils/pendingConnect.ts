/**
 * "Conectar ao MercadoFlow" aberto por um sistema parceiro (Bipae) antes de o
 * dono entrar: o pedido fica guardado e, depois do login ou do cadastro, a
 * pessoa volta direto para a tela de aprovação.
 */

const KEY = 'mf_pending_connect';

export interface PendingConnect {
  code: string;
  cnpj?: string;
  email?: string;
  storeName?: string;
}

export const savePendingConnect = (p: PendingConnect) => {
  try { sessionStorage.setItem(KEY, JSON.stringify(p)); } catch { /* sem storage, segue sem lembrar */ }
};

export const readPendingConnect = (): PendingConnect | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : null;
    return p && typeof p.code === 'string' && p.code.startsWith('mfx_') ? p : null;
  } catch {
    return null;
  }
};

export const clearPendingConnect = () => {
  try { sessionStorage.removeItem(KEY); } catch { /* nada */ }
};

/** Para onde ir depois de entrar: a aprovação pendente, ou o caminho de sempre. */
export const afterLoginPath = (fallback: string) => {
  const p = readPendingConnect();
  return p ? `/conectar?code=${encodeURIComponent(p.code)}` : fallback;
};
