import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useSuperAdminAuth } from './context/SuperAdminAuthContext';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Products = lazy(() => import('./pages/Products'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const MarketBasket = lazy(() => import('./pages/MarketBasket'));
const Alerts = lazy(() => import('./pages/Alerts'));
const PDVs = lazy(() => import('./pages/PDVs'));
const Campaigns = lazy(() => import('./pages/Campaigns'));
const DemandForecast = lazy(() => import('./pages/DemandForecast'));
const Settings = lazy(() => import('./pages/Settings'));
const ShoppingListPage = lazy(() => import('./pages/ShoppingList'));
const OffersDashboard = lazy(() => import('./pages/OffersDashboard'));
const OfferTemplates = lazy(() => import('./pages/OfferTemplates'));
const OfferDesigner = lazy(() => import('./pages/OfferDesigner'));
const OfferJobs = lazy(() => import('./pages/OfferJobs'));
const Landing = lazy(() => import('./pages/Landing'));
const PublicAgentDownload = lazy(() => import('./pages/PublicAgentDownload'));
const AgentDownload = lazy(() => import('./pages/AgentDownload'));
const AdminCatalog = lazy(() => import('./pages/AdminCatalog'));
const SuperAdminLogin = lazy(() => import('./pages/SuperAdminLogin'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));
const SuperAdminUsers = lazy(() => import('./pages/SuperAdminUsers'));
const SuperAdminCatalogManager = lazy(() => import('./pages/SuperAdminCatalogManager'));
const SuperAdminCrawlerConfig = lazy(() => import('./pages/SuperAdminCrawlerConfig'));
const SuperAdminCrawlerRunDetails = lazy(() => import('./pages/SuperAdminCrawlerRunDetails'));

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
        <Route path="/app/ofertas" element={secure(<OfferDesigner />)} />
        <Route path="/app/ofertas/inicio" element={secure(<OffersDashboard />)} />
        <Route path="/app/ofertas/modelos" element={secure(<OfferTemplates />)} />
        <Route path="/app/ofertas/designer" element={secure(<OfferDesigner />)} />
        <Route path="/app/ofertas/jobs" element={secure(<OfferJobs />)} />
        <Route path="/app/pdvs" element={secure(<PDVs />)} />
        <Route path="/app/campanhas" element={secure(<Campaigns />)} />
        <Route path="/app/previsao-demanda" element={secure(<DemandForecast />)} />
        <Route path="/app/configuracoes" element={secure(<Settings />)} />
        <Route path="/app/download-agente" element={secure(<AgentDownload />)} />
        <Route path="/app/admin/catalogo" element={secure(<AdminCatalog />)} />

        <Route path="/super-admin" element={secureSuperAdmin(<SuperAdminDashboard />)} />
        <Route path="/super-admin/saas" element={secureSuperAdmin(<SuperAdminUsers />)} />
        <Route path="/super-admin/usuarios" element={<Navigate to="/super-admin/saas" replace />} />
        <Route path="/super-admin/catalogo" element={secureSuperAdmin(<SuperAdminCatalogManager />)} />
        <Route path="/super-admin/crawler" element={secureSuperAdmin(<SuperAdminCrawlerConfig />)} />
        <Route path="/super-admin/crawler/runs/:runId" element={secureSuperAdmin(<SuperAdminCrawlerRunDetails />)} />

        <Route path="/produtos" element={<Navigate to="/app/produtos" replace />} />
        <Route path="/cesta" element={<Navigate to="/app/cesta" replace />} />
        <Route path="/alertas" element={<Navigate to="/app/alertas" replace />} />
        <Route path="/lista-compras" element={<Navigate to="/app/lista-compras" replace />} />
        <Route path="/ofertas" element={<Navigate to="/app/ofertas" replace />} />
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
