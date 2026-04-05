import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useSuperAdminAuth } from './context/SuperAdminAuthContext';
import { buildOffersUrl, resolveOffersWorkspace } from './lib/offersApp';

const Login = lazy(() => import('./screens/Login'));
const Dashboard = lazy(() => import('./screens/Dashboard'));
const Products = lazy(() => import('./screens/Products'));
const ProductDetail = lazy(() => import('./screens/ProductDetail'));
const MarketBasket = lazy(() => import('./screens/MarketBasket'));
const Alerts = lazy(() => import('./screens/Alerts'));
const PDVs = lazy(() => import('./screens/PDVs'));
const Campaigns = lazy(() => import('./screens/Campaigns'));
const DemandForecast = lazy(() => import('./screens/DemandForecast'));
const Settings = lazy(() => import('./screens/Settings'));
const ShoppingListPage = lazy(() => import('./screens/ShoppingList'));
const OfferDesigner = lazy(() => import('./screens/OfferDesigner'));
const Landing = lazy(() => import('./screens/Landing'));
const PublicAgentDownload = lazy(() => import('./screens/PublicAgentDownload'));
const AgentDownload = lazy(() => import('./screens/AgentDownload'));
const AdminCatalog = lazy(() => import('./screens/AdminCatalog'));
const SuperAdminLogin = lazy(() => import('./screens/SuperAdminLogin'));
const SuperAdminDashboard = lazy(() => import('./screens/SuperAdminDashboard'));
const SuperAdminUsers = lazy(() => import('./screens/SuperAdminUsers'));
const SuperAdminCatalogManager = lazy(() => import('./screens/SuperAdminCatalogManager'));
const SuperAdminCrawlerConfig = lazy(() => import('./screens/SuperAdminCrawlerConfig'));
const SuperAdminCrawlerRunDetails = lazy(() => import('./screens/SuperAdminCrawlerRunDetails'));
const StatePriceComparison = lazy(() => import('./screens/StatePriceComparison'));

const PageLoader = () => (
  <div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">
    Carregando...
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userId, loading } = useAuth();
  if (loading) {
    return <PageLoader />;
  }
  if (!userId) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const secure = (element: React.ReactNode) => <ProtectedRoute>{element}</ProtectedRoute>;

const SuperAdminProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userId, role, loading } = useSuperAdminAuth();
  if (loading) {
    return <PageLoader />;
  }
  if (!userId || role !== 'SUPER_ADMIN') {
    return <Navigate to="/super-admin/login" replace />;
  }
  return <>{children}</>;
};

const secureSuperAdmin = (element: React.ReactNode) => <SuperAdminProtectedRoute>{element}</SuperAdminProtectedRoute>;

const OffersAppProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const auth = useAuth();
  const superAdminAuth = useSuperAdminAuth();
  const workspace = resolveOffersWorkspace(location.search);
  const isSuperAdminMode = workspace === 'super-admin';
  const loading = isSuperAdminMode ? superAdminAuth.loading : auth.loading;

  if (loading) {
    return <PageLoader />;
  }

  if (isSuperAdminMode) {
    if (!superAdminAuth.userId || superAdminAuth.role !== 'SUPER_ADMIN') {
      return <Navigate to="/super-admin/login" replace />;
    }
  } else if (!auth.userId) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const secureOffers = (element: React.ReactNode) => <OffersAppProtectedRoute>{element}</OffersAppProtectedRoute>;

const OffersWorkspaceRedirect: React.FC<{ targetPath: string; workspace: 'admin' | 'super-admin' }> = ({ targetPath, workspace }) => {
  const location = useLocation();
  return <Navigate to={buildOffersUrl(targetPath, workspace, location.search)} replace />;
};

const OffersSheetRedirect: React.FC<{ sheet: 'campaigns' | 'media'; defaultWorkspace?: 'admin' | 'super-admin' }> = ({ sheet, defaultWorkspace = 'admin' }) => {
  const location = useLocation();
  const workspace = location.search ? resolveOffersWorkspace(location.search) : defaultWorkspace;
  const params = new URLSearchParams(location.search);
  params.set('sheet', sheet);
  return <Navigate to={buildOffersUrl('/ofertas', workspace, params.toString())} replace />;
};

const App: React.FC = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/super-admin/login" element={<SuperAdminLogin />} />
        <Route path="/" element={<Landing />} />
        <Route path="/download-agente" element={<PublicAgentDownload />} />
        <Route path="/baixar-agente" element={<Navigate to="/download-agente" replace />} />

        <Route path="/app" element={secure(<Dashboard />)} />
        <Route path="/app/produtos" element={secure(<Products />)} />
        <Route path="/app/produtos/:productId" element={secure(<ProductDetail />)} />
        <Route path="/app/cesta" element={secure(<MarketBasket />)} />
        <Route path="/app/alertas" element={secure(<Alerts />)} />
        <Route path="/app/lista-compras" element={secure(<ShoppingListPage />)} />
        <Route path="/app/ofertas" element={<OffersWorkspaceRedirect targetPath="/ofertas" workspace="admin" />} />
        <Route path="/app/ofertas/campanhas" element={<OffersSheetRedirect sheet="campaigns" defaultWorkspace="admin" />} />
        <Route path="/app/ofertas/inicio" element={<OffersSheetRedirect sheet="campaigns" defaultWorkspace="admin" />} />
        <Route path="/app/ofertas/modelos" element={<OffersWorkspaceRedirect targetPath="/ofertas" workspace="admin" />} />
        <Route path="/app/ofertas/designer" element={<OffersWorkspaceRedirect targetPath="/ofertas" workspace="admin" />} />
        <Route path="/app/ofertas/jobs" element={<OffersSheetRedirect sheet="media" defaultWorkspace="admin" />} />
        <Route path="/app/pdvs" element={secure(<PDVs />)} />
        <Route path="/app/campanhas" element={secure(<Campaigns />)} />
        <Route path="/app/previsao-demanda" element={secure(<DemandForecast />)} />
        <Route path="/app/configuracoes" element={secure(<Settings />)} />
        <Route path="/app/download-agente" element={secure(<AgentDownload />)} />
        <Route path="/app/admin/catalogo" element={secure(<AdminCatalog />)} />
        <Route path="/app/precos-estaduais" element={<Navigate to="/app/admin/precos-estaduais" replace />} />
        <Route path="/app/admin/precos-estaduais" element={secure(<StatePriceComparison />)} />

        <Route path="/super-admin" element={secureSuperAdmin(<SuperAdminDashboard />)} />
        <Route path="/super-admin/saas" element={secureSuperAdmin(<SuperAdminUsers />)} />
        <Route path="/super-admin/usuarios" element={<Navigate to="/super-admin/saas" replace />} />
        <Route path="/super-admin/catalogo" element={secureSuperAdmin(<SuperAdminCatalogManager />)} />
        <Route path="/super-admin/precos-estaduais" element={secureSuperAdmin(<StatePriceComparison />)} />
        <Route path="/super-admin/ofertas" element={<OffersWorkspaceRedirect targetPath="/ofertas" workspace="super-admin" />} />
        <Route path="/super-admin/crawler" element={secureSuperAdmin(<SuperAdminCrawlerConfig />)} />
        <Route path="/super-admin/crawler/runs/:runId" element={secureSuperAdmin(<SuperAdminCrawlerRunDetails />)} />

        <Route path="/ofertas" element={secureOffers(<OfferDesigner />)} />
        <Route path="/ofertas/campanhas" element={secureOffers(<OffersSheetRedirect sheet="campaigns" />)} />
        <Route path="/ofertas/jobs" element={secureOffers(<OffersSheetRedirect sheet="media" />)} />

        <Route path="/produtos" element={<Navigate to="/app/produtos" replace />} />
        <Route path="/cesta" element={<Navigate to="/app/cesta" replace />} />
        <Route path="/alertas" element={<Navigate to="/app/alertas" replace />} />
        <Route path="/lista-compras" element={<Navigate to="/app/lista-compras" replace />} />
        <Route path="/pdvs" element={<Navigate to="/app/pdvs" replace />} />
        <Route path="/campanhas" element={<Navigate to="/app/campanhas" replace />} />
        <Route path="/previsao-demanda" element={<Navigate to="/app/previsao-demanda" replace />} />
        <Route path="/configuracoes" element={<Navigate to="/app/configuracoes" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default App;
