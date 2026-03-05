import React, { createContext, useContext, useEffect, useState } from 'react';
import superAdminAuthService from '../services/superAdminAuth.service';

interface SuperAdminAuthState {
  role: string | null;
  userId: string | null;
  email: string | null;
  name: string | null;
}

interface SuperAdminAuthContextValue extends SuperAdminAuthState {
  login: (email: string, password: string, keepConnected?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const SuperAdminAuthContext = createContext<SuperAdminAuthContextValue | undefined>(undefined);

export const SuperAdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SuperAdminAuthState>({
    role: null,
    userId: null,
    email: null,
    name: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
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
  }, []);

  const login = async (email: string, password: string, keepConnected = false) => {
    await superAdminAuthService.login(email, password, keepConnected);
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

  const logout = async () => {
    await superAdminAuthService.logout();
    setState({ role: null, userId: null, email: null, name: null });
  };

  return (
    <SuperAdminAuthContext.Provider value={{ ...state, login, logout, loading }}>
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
