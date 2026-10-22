import api from './api';

export interface SuperAdminProfile {
  userId: string;
  role: string;
  marketId: string | null;
  email: string;
  name: string;
}

export interface SuperAdminLoginResponse {
  token: string | null;
  userId: string;
  role: string;
  marketId: string | null;
  /** Verificação em duas etapas ligada: falta o código do aplicativo. */
  mfaRequired?: boolean;
  mfaChallenge?: string;
}

const superAdminAuthService = {
  async login(email: string, password: string, keepConnected = false): Promise<SuperAdminLoginResponse> {
    const response = await api.post('/v1/super-admin/auth/login', { email, password, keepConnected });
    return response.data;
  },

  async loginSecondStep(challenge: string, code: string): Promise<SuperAdminLoginResponse> {
    const response = await api.post('/v1/super-admin/auth/login/2fa', { challenge, code });
    return response.data;
  },

  async me(): Promise<SuperAdminProfile> {
    const response = await api.get('/v1/super-admin/auth/me');
    return response.data;
  },

  async logout(): Promise<void> {
    await api.post('/v1/super-admin/auth/logout');
  },
};

export default superAdminAuthService;
