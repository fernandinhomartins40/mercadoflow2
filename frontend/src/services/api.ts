import axios, { AxiosHeaders } from 'axios';
import { getOffersWorkspaceLoginRoute, isOffersAppPath, resolveOffersWorkspace } from '../lib/offersApp';

const AUTH_SCOPE_HEADER = 'X-Auth-Scope';

const shouldPreferSuperAdminScope = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.location.pathname.startsWith('/super-admin')
    || (isOffersAppPath(window.location.pathname) && resolveOffersWorkspace(window.location.search) === 'super-admin')
  );
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const headers = AxiosHeaders.from(config.headers);

  if (shouldPreferSuperAdminScope()) {
    headers.set(AUTH_SCOPE_HEADER, 'super-admin');
  } else {
    headers.delete(AUTH_SCOPE_HEADER);
  }

  config.headers = headers;
  return config;
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
      // /parear-agente autentica sozinha no próprio fluxo: redirecionar para
      // /login perderia o código de pareamento que veio na query string.
      const publicPaths = ['/', '/login', '/register', '/download-agente', '/parear-agente', '/super-admin/login'];
      const isPublic = publicPaths.includes(window.location.pathname);
      if (!isPublic) {
        if (isOffersAppPath(window.location.pathname)) {
          window.location.href = getOffersWorkspaceLoginRoute(window.location.search);
        } else if (window.location.pathname.startsWith('/super-admin')) {
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
