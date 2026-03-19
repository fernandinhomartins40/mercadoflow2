import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSuperAdminAuth } from '../context/SuperAdminAuthContext';
import {
  buildOffersUrl,
  getOffersWorkspaceHomeRoute,
  resolveOffersWorkspace,
  type OffersWorkspaceMode,
} from '../lib/offersApp';

export type OffersAppSession = {
  workspace: OffersWorkspaceMode;
  isSuperAdminMode: boolean;
  marketId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  dashboardHref: string;
  buildUrl: (pathname: string, search?: string) => string;
  logout: () => Promise<void>;
};

export const useOffersAppSession = (): OffersAppSession => {
  const location = useLocation();
  const auth = useAuth();
  const superAdmin = useSuperAdminAuth();
  const workspace = resolveOffersWorkspace(location.search);
  const isSuperAdminMode = workspace === 'super-admin';

  return {
    workspace,
    isSuperAdminMode,
    marketId: isSuperAdminMode ? '' : auth.marketId || '',
    userId: isSuperAdminMode ? superAdmin.userId || '' : auth.userId || '',
    userName: isSuperAdminMode ? superAdmin.name || 'Super Administrador' : auth.name || 'Usuario logado',
    userEmail: isSuperAdminMode ? superAdmin.email || 'Conta principal da plataforma' : auth.email || 'Conta autenticada',
    role: isSuperAdminMode ? superAdmin.role || 'SUPER_ADMIN' : auth.role || '',
    dashboardHref: getOffersWorkspaceHomeRoute(workspace),
    buildUrl: (pathname: string, search?: string) => buildOffersUrl(pathname, workspace, search),
    logout: isSuperAdminMode ? superAdmin.logout : auth.logout,
  };
};
