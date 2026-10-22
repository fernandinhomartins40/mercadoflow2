import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { isOffersAppPath, resolveOffersWorkspace } from '../lib/offersApp';
import superAdminAuthService from '../services/superAdminAuth.service';

interface SuperAdminAuthState {
  role: string | null;
  userId: string | null;
  email: string | null;
  name: string | null;
}

interface SuperAdminAuthContextValue extends SuperAdminAuthState {
  /** Devolve o desafio quando falta o código do aplicativo (duas etapas); senão null. */
  login: (email: string, password: string, keepConnected?: boolean) => Promise<string | null>;
  loginSecondStep: (challenge: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const SuperAdminAuthContext = createContext<SuperAdminAuthContextValue | undefined>(undefined);

export const SuperAdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [state, setState] = useState<SuperAdminAuthState>({
    role: null,
    userId: null,
    email: null,
    name: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const shouldLoadForWorkspace =
        location.pathname.startsWith('/super-admin')
        || (isOffersAppPath(location.pathname) && resolveOffersWorkspace(location.search) === 'super-admin');

      if (!shouldLoadForWorkspace) {
        setState({ role: null, userId: null, email: null, name: null });
        setLoading(false);
        return;
      }
      try {
        const me = await superAdminAuthService.me();
        if (me.role === 'SUPER_ADMIN') {
          setState({
            role: me.role,
            userId: me.userId,
            email: me.email,
            name: me.name,
          });
        } else {
          setState({ role: null, userId: null, email: null, name: null });
        }
      } catch {
        setState({ role: null, userId: null, email: null, name: null });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [location.pathname, location.search]);

  const loadMe = async () => {
    const me = await superAdminAuthService.me();
    if (me.role !== 'SUPER_ADMIN') {
      throw new Error('Acesso negado ao painel Super Admin');
    }
    setState({
      role: me.role,
      userId: me.userId,
      email: me.email,
      name: me.name,
    });
  };

  const login = async (email: string, password: string, keepConnected = false) => {
    const response = await superAdminAuthService.login(email, password, keepConnected);
    if (response.mfaRequired && response.mfaChallenge) {
      return response.mfaChallenge;
    }
    await loadMe();
    return null;
  };

  const loginSecondStep = async (challenge: string, code: string) => {
    await superAdminAuthService.loginSecondStep(challenge, code);
    await loadMe();
  };

  const logout = async () => {
    await superAdminAuthService.logout();
    setState({ role: null, userId: null, email: null, name: null });
  };

  return (
    <SuperAdminAuthContext.Provider value={{ ...state, login, loginSecondStep, logout, loading }}>
      {children}
    </SuperAdminAuthContext.Provider>
  );
};

export const useSuperAdminAuth = () => {
  const ctx = useContext(SuperAdminAuthContext);
  if (!ctx) {
    throw new Error('useSuperAdminAuth deve ser usado dentro de SuperAdminAuthProvider');
  }
  return ctx;
};
