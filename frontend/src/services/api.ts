import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const serverMessage = error.response?.data?.message;
    const serverError = error.response?.data?.error;
    if (typeof serverMessage === 'string' && serverMessage.trim()) {
      error.message = serverError ? `${serverError}: ${serverMessage}` : serverMessage;
    }
    if (error.response?.status === 401) {
      const requestUrl: string = error.config?.url ?? '';
      if (requestUrl.includes('/v1/auth/me') || requestUrl.includes('/v1/super-admin/auth/me')) {
        return Promise.reject(error);
      }
      const publicPaths = ['/', '/login', '/download-agente', '/super-admin/login'];
      const isPublic = publicPaths.includes(window.location.pathname);
      if (!isPublic) {
        if (window.location.pathname.startsWith('/super-admin')) {
          window.location.href = '/super-admin/login';
        } else {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
