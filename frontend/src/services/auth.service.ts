import api from './api';

export interface AuthProfile {
  userId: string;
  role: string;
  marketId: string;
  email: string;
  name: string;
}

export interface LoginResponse {
  token: string;
  userId: string;
  role: string;
  marketId: string;
}

const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await api.post('/v1/auth/login', { email, password });
    return response.data;
  },

  async me(): Promise<AuthProfile> {
    const response = await api.get('/v1/auth/me');
    return response.data;
  },

  async logout(): Promise<void> {
    await api.post('/v1/auth/logout');
  },
};

export default authService;
