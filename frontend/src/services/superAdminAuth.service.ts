import api from './api';

export interface SuperAdminProfile {
  userId: string;
  role: string;
  marketId: string | null;
  email: string;
  name: string;
}

export interface SuperAdminLoginResponse {
  token: string;
  userId: string;
  role: string;
  marketId: string | null;
}

const superAdminAuthService = {
  async login(email: string, password: string, keepConnected = false): Promise<SuperAdminLoginResponse> {
    const response = await api.post('/v1/super-admin/auth/login', { email, password, keepConnected });
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
