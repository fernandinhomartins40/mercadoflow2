import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { isOffersAppPath, resolveOffersWorkspace } from '../lib/offersApp';
import authService from '../services/auth.service';

interface AuthState {
  role: string | null;
  marketId: string | null;
  userId: string | null;
  email: string | null;
  name: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string, keepConnected?: boolean) => Promise<void>;
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

  const login = async (email: string, password: string, keepConnected = false) => {
    await authService.login(email, password, keepConnected);
    const me = await authService.me();
    setState({
      role: me.role,
      marketId: me.marketId,
      userId: me.userId,
      email: me.email,
      name: me.name,
    });
  };

  const logout = async () => {
    await authService.logout();
    setState({ role: null, marketId: null, userId: null, email: null, name: null });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, loading }}>
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
