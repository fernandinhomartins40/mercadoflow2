import axios, { AxiosHeaders } from 'axios';
import { getOffersWorkspaceLoginRoute, isOffersAppPath, resolveOffersWorkspace } from '../lib/offersApp';
import { IS_GESTAO_APP, absolutizeApiPaths, getSessionToken, setSessionToken } from '../lib/nativeApp';

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
  // App MercadoFlow Gestão: a sessão vai pelo cabeçalho Authorization, não por cookie.
  withCredentials: !IS_GESTAO_APP,
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

  const token = IS_GESTAO_APP ? getSessionToken() : null;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  config.headers = headers;
  return config;
});

/** Login e segunda etapa (código do autenticador) devolvem o token da sessão. */
const SESSION_ROUTES = ['/v1/auth/login', '/v1/auth/login/2fa'];

if (IS_GESTAO_APP) {
  api.interceptors.response.use(
    async (response) => {
      const url = response.config?.url ?? '';
      if (SESSION_ROUTES.includes(url) && typeof response.data?.token === 'string' && response.data.token) {
        await setSessionToken(response.data.token);
      } else if (url === '/v1/auth/logout') {
        await setSessionToken(null);
      }
      if (response.data && typeof response.data === 'object' && !(response.data instanceof Blob)) {
        absolutizeApiPaths(response.data);
      }
      return response;
    },
    async (error) => {
      // Sessão vencida ou revogada (o /me recusa o token): esquece o token para o login abrir limpo.
      if (error.response?.status === 401 && error.config?.url === '/v1/auth/me') {
        await setSessionToken(null);
      }
      return Promise.reject(error);
    },
  );
}

/** Mensagens do tratador global que são técnicas ou genéricas: nesses casos vale o `userMessage`. */
const GENERIC_SERVER_MESSAGES = new Set(['Requisicao invalida', 'Unexpected server error', 'Recurso inexistente']);

/**
 * Frase que a tela mostra quando a chamada falha. As telas exibem `error.message`;
 * sem isto o dono via "timeout of 30000ms exceeded", "Network Error",
 * "Request failed with status code 502" ou "validation_error: Validation failed for argument [0]...".
 */
const friendlyErrorMessage = (error: any): string | null => {
  const response = error.response;
  if (!response) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || /timeout/i.test(error.message ?? '')) {
      return 'Demorou mais que o normal para responder. Tente de novo em instantes.';
    }
    if (error.code === 'ERR_CANCELED') return null;
    return 'Sem conexão com o MercadoFlow. Confira a internet e tente de novo.';
  }
  const data = response.data && typeof response.data === 'object' ? response.data : {};
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  const userMessage = typeof data.userMessage === 'string' ? data.userMessage.trim() : '';
  const errorField = typeof data.error === 'string' ? data.error.trim() : '';
  // Erro de validação: `message` traz a exceção do Spring; `userMessage` diz qual campo falhou.
  if (data.error === 'validation_error' && userMessage) return userMessage;
  if (message && !GENERIC_SERVER_MESSAGES.has(message)) return message;
  if (userMessage) return userMessage;
  // Alguns endpoints devolvem só { error: "frase pronta" } (ex.: pareamento do agente, pagamento).
  if (errorField && /\s/.test(errorField)) return errorField;
  if (response.status >= 500) {
    return 'O MercadoFlow está com instabilidade agora. Tente de novo em alguns minutos.';
  }
  if (response.status === 404) return 'Não encontramos o que você procurou.';
  if (response.status === 429) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  return null;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const friendly = friendlyErrorMessage(error);
    if (friendly) {
      error.message = friendly;
    }
    // Papel da equipe sem permissão para a ação: a frase vem pronta.
    if (error.response?.status === 403 && typeof error.response?.data?.userMessage === 'string') {
      error.message = error.response.data.userMessage;
    }
    // Conta só para consulta (pagamento em aberto): a frase vem pronta e a faixa do topo se atualiza.
    if (error.response?.status === 402 && typeof error.response?.data?.userMessage === 'string') {
      error.message = error.response.data.userMessage;
      window.dispatchEvent(new Event('mf:subscription-changed'));
    }
    if (error.response?.status === 401) {
      const requestUrl: string = error.config?.url ?? '';
      if (requestUrl.includes('/v1/auth/me') || requestUrl.includes('/v1/super-admin/auth/me')) {
        return Promise.reject(error);
      }
      // /parear-agente autentica sozinha no próprio fluxo: redirecionar para
      // /login perderia o código de pareamento que veio na query string.
      // Páginas abertas (encarte do cliente, indústria, conectar ERP, documentação):
      // um 401 nelas nunca pode mandar o visitante para o login.
      const publicPaths = ['/', '/login', '/register', '/esqueci-senha', '/redefinir-senha', '/aceitar-convite', '/download-agente', '/parear-agente', '/super-admin/login', '/para-industria', '/conectar', '/desenvolvedores'];
      const publicPrefixes = ['/encarte/'];
      const path = window.location.pathname.replace(/\/+$/, '') || '/';
      const isPublic = publicPaths.includes(path) || publicPrefixes.some((p) => window.location.pathname.startsWith(p));
      if (!isPublic) {
        if (window.location.pathname === '/confere' || window.location.pathname.startsWith('/confere/')) {
          // O Confere tem entrada própria (PWA): sessão vencida volta para ela.
          if (window.location.pathname !== '/confere/') window.location.href = '/confere/';
        } else if (isOffersAppPath(window.location.pathname)) {
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
