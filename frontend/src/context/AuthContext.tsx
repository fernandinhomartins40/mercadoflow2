import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { isOffersAppPath, resolveOffersWorkspace } from '../lib/offersApp';
import authService, { TeamRole } from '../services/auth.service';
import { clearCached } from '../hooks/useCached';

interface AuthState {
  teamRole?: TeamRole | null;
  twoFactorEnabled?: boolean;
  /** S1: falta aceitar a versão vigente dos documentos legais. */
  legalAcceptanceRequired?: boolean;
  role: string | null;
  marketId: string | null;
  userId: string | null;
  email: string | null;
  name: string | null;
}

interface AuthContextValue extends AuthState {
  /** Devolve o desafio quando a conta pede o código do aplicativo (duas etapas). */
  login: (email: string, password: string, keepConnected?: boolean) => Promise<string | null>;
  loginSecondStep: (challenge: string, code: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Registra o aceite da versão vigente (tela de aceite do painel e do Bipaê). */
  acceptLegal: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [state, setState] = useState<AuthState>({
    role: null,
    marketId: null,
    userId: null,
    email: null,
    name: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const shouldSkipForWorkspace =
        location.pathname.startsWith('/super-admin')
        || (isOffersAppPath(location.pathname) && resolveOffersWorkspace(location.search) === 'super-admin');

      if (shouldSkipForWorkspace) {
        setState({
          role: null,
          marketId: null,
          userId: null,
          email: null,
          name: null,
        });
        setLoading(false);
        return;
      }
      try {
        const me = await authService.me();
        setState({
          role: me.role,
          marketId: me.marketId,
          userId: me.userId,
          email: me.email,
          name: me.name,
          teamRole: me.teamRole ?? null,
          twoFactorEnabled: !!me.twoFactorEnabled,
          legalAcceptanceRequired: !!me.legalAcceptanceRequired,
        });
      } catch {
        setState({
          role: null,
          marketId: null,
          userId: null,
          email: null,
          name: null,
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [location.pathname, location.search]);

  const applyMe = (me: Awaited<ReturnType<typeof authService.me>>) => {
    setState({
      role: me.role,
      marketId: me.marketId,
      userId: me.userId,
      email: me.email,
      name: me.name,
      teamRole: me.teamRole ?? null,
      twoFactorEnabled: !!me.twoFactorEnabled,
      legalAcceptanceRequired: !!me.legalAcceptanceRequired,
    });
  };

  const loadMe = async () => {
    applyMe(await authService.me());
  };

  const acceptLegal = async () => {
    applyMe(await authService.acceptLegal());
  };

  const login = async (email: string, password: string, keepConnected = false) => {
    const response = await authService.login(email, password, keepConnected);
    if (response.mfaRequired && response.mfaChallenge) {
      return response.mfaChallenge;
    }
    await loadMe();
    return null;
  };

  const loginSecondStep = async (challenge: string, code: string) => {
    await authService.loginSecondStep(challenge, code);
    await loadMe();
  };

  const logout = async () => {
    await authService.logout();
    clearCached();
    setState({ role: null, marketId: null, userId: null, email: null, name: null });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, loginSecondStep, refresh: loadMe, acceptLegal, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return ctx;
};
