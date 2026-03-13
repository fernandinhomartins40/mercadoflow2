import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import MarketBasket from './pages/MarketBasket';
import Alerts from './pages/Alerts';
import PDVs from './pages/PDVs';
import Campaigns from './pages/Campaigns';
import DemandForecast from './pages/DemandForecast';
import Settings from './pages/Settings';
import ShoppingListPage from './pages/ShoppingList';
import OffersDashboard from './pages/OffersDashboard';
import OfferTemplates from './pages/OfferTemplates';
import OfferDesigner from './pages/OfferDesigner';
import OfferJobs from './pages/OfferJobs';
import Landing from './pages/Landing';
import PublicAgentDownload from './pages/PublicAgentDownload';
import AgentDownload from './pages/AgentDownload';
import AdminCatalog from './pages/AdminCatalog';
import SuperAdminLogin from './pages/SuperAdminLogin';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminUsers from './pages/SuperAdminUsers';
import SuperAdminCatalogManager from './pages/SuperAdminCatalogManager';
import SuperAdminCrawlerConfig from './pages/SuperAdminCrawlerConfig';
import SuperAdminCrawlerRunDetails from './pages/SuperAdminCrawlerRunDetails';
import { useAuth } from './context/AuthContext';
import { useSuperAdminAuth } from './context/SuperAdminAuthContext';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userId, loading } = useAuth();
  if (loading) {
    return <div className="card">Carregando...</div>;
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
    return <div className="card">Carregando...</div>;
  }
  if (!userId || role !== 'SUPER_ADMIN') {
    return <Navigate to="/super-admin/login" replace />;
  }
  return <>{children}</>;
};

const secureSuperAdmin = (element: React.ReactNode) => <SuperAdminProtectedRoute>{element}</SuperAdminProtectedRoute>;

const App: React.FC = () => {
  return (
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
      <Route path="/app/ofertas" element={secure(<OffersDashboard />)} />
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
  );
};

export default App;
