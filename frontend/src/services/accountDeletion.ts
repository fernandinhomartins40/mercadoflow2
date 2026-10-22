import api from './api';

/** "Excluir minha conta" (LGPD-03): pedir, ver o estado e desistir. */

export interface DeletionStatus {
  pending: boolean;
  graceDays: number;
  scope?: 'USER' | 'STORE';
  requestedAt?: string | number;
  scheduledFor?: string | number;
  userMessage?: string;
}

export const accountDeletion = {
  status: () => api.get<DeletionStatus>('/v1/me/account-deletion').then((r) => r.data),
  request: (password: string) => api.post<DeletionStatus>('/v1/me/account-deletion', { password }).then((r) => r.data),
  cancel: () => api.delete<DeletionStatus>('/v1/me/account-deletion').then((r) => r.data),
  /** Pela tela de login: o pedido derruba a sessão, então confere e-mail e senha. */
  cancelFromLogin: (email: string, password: string) =>
    api.post<DeletionStatus>('/v1/auth/account-deletion/cancel', { email, password }).then((r) => r.data),
};

/** Login recusado porque a conta está marcada para exclusão (a tela oferece "Desistir"). */
export const isDeletionPending = (err: unknown) =>
  (err as { response?: { data?: { state?: string } } })?.response?.data?.state === 'DELETION_PENDING';

export const deletionErrorText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { userMessage?: string } } })?.response?.data?.userMessage || fallback;

export const formatDay = (iso?: string | number) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
