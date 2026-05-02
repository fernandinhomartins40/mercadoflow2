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

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  marketName: string;
  marketCnpj?: string;
}

export interface RegisterResponse {
  userId: string;
  marketId: string;
  status: string;
  message: string;
}

const authService = {
  async login(email: string, password: string, keepConnected = false): Promise<LoginResponse> {
    const response = await api.post('/v1/auth/login', { email, password, keepConnected });
    return response.data;
  },

  async register(payload: RegisterRequest): Promise<RegisterResponse> {
    const response = await api.post('/v1/auth/register', payload);
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
