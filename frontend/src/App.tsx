import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useSuperAdminAuth } from './context/SuperAdminAuthContext';
import { buildOffersUrl, resolveOffersWorkspace } from './lib/offersApp';
import { FEATURE_OFFER_TEMPLATES_ENABLED, FEATURE_STATE_PRICES_ENABLED } from './config/features';

const Login = lazy(() => import('./screens/Login'));
const IndustryHome = lazy(() => import('./screens/industria/IndustryHome'));
const IndustryMap = lazy(() => import('./screens/industria/IndustryMap'));
const IndustryProducts = lazy(() => import('./screens/industria/IndustryProducts'));
const IndustryCategory = lazy(() => import('./screens/industria/IndustryCategory'));
const IndustryAccount = lazy(() => import('./screens/industria/IndustryAccount'));
const SuperAdminIndustries = lazy(() => import('./screens/SuperAdminIndustries'));
const SuperAdminIndustryData = lazy(() => import('./screens/SuperAdminIndustryData'));
const SuperAdminIndustryBilling = lazy(() => import('./screens/SuperAdminIndustryBilling'));
const ForgotPassword = lazy(() => import('./screens/ForgotPassword'));
const ResetPassword = lazy(() => import('./screens/ResetPassword'));
const Register = lazy(() => import('./screens/Register'));
const Dashboard = lazy(() => import('./screens/Dashboard'));
const Decide = lazy(() => import('./screens/Decide'));
const DataChat = lazy(() => import('./screens/DataChat'));
const NetworkView = lazy(() => import('./screens/NetworkView'));
const CustomerIntelligence = lazy(() => import('./screens/CustomerIntelligence'));
const Products = lazy(() => import('./screens/Products'));
const ProductDetail = lazy(() => import('./screens/ProductDetail'));
const PDVs = lazy(() => import('./screens/PDVs'));
const Settings = lazy(() => import('./screens/Settings'));
const ShoppingListPage = lazy(() => import('./screens/ShoppingList'));
const OfferDesigner = lazy(() => import('./screens/OfferDesigner'));
const ArtStudio = lazy(() => import('./screens/ArtStudio'));
const PublicEncarte = lazy(() => import('./screens/PublicEncarte'));
const SuperAdminArtThemes = lazy(() => import('./screens/SuperAdminArtThemes'));
const ConfereApp = lazy(() => import('./screens/ConfereApp'));
const SuperAdminConfere = lazy(() => import('./screens/SuperAdminConfere'));
const SuperAdminAi = lazy(() => import('./screens/SuperAdminAi'));
const Landing = lazy(() => import('./screens/Landing'));
const PublicAgentDownload = lazy(() => import('./screens/PublicAgentDownload'));
const AgentPairing = lazy(() => import('./screens/AgentPairing'));
const AgentDownload = lazy(() => import('./screens/AgentDownload'));
const AdminCatalog = lazy(() => import('./screens/AdminCatalog'));
const SuperAdminLogin = lazy(() => import('./screens/SuperAdminLogin'));
const SuperAdminDashboard = lazy(() => import('./screens/SuperAdminDashboard'));
const SuperAdminUsers = lazy(() => import('./screens/SuperAdminUsers'));
const SuperAdminSubscriptions = lazy(() => import('./screens/SuperAdminSubscriptions'));
const SuperAdminCustomers = lazy(() => import('./screens/SuperAdminCustomers'));
const SuperAdminCollections = lazy(() => import('./screens/SuperAdminCollections'));
const Plans = lazy(() => import('./screens/Plans'));
const MySubscription = lazy(() => import('./screens/MySubscription'));
const Team = lazy(() => import('./screens/Team'));
const AcceptInvite = lazy(() => import('./screens/AcceptInvite'));
const SuperAdminCatalogManager = lazy(() => import('./screens/SuperAdminCatalogManager'));
const SuperAdminCrawlerConfig = lazy(() => import('./screens/SuperAdminCrawlerConfig'));
const SuperAdminCrawlerRunDetails = lazy(() => import('./screens/SuperAdminCrawlerRunDetails'));
const StatePriceComparison = lazy(() => import('./screens/StatePriceComparison'));
const StoreMap = lazy(() => import('./screens/StoreMap'));
const Promocoes = lazy(() => import('./screens/Promocoes'));

const PageLoader = () => (
  <div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">
    Carregando...
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userId, teamRole, role, loading } = useAuth();
  if (loading) {
    return <PageLoader />;
  }
  if (!userId) {
    return <Navigate to="/login" replace />;
  }
  // Indústria tem portal próprio e nunca abre telas de mercado.
  if (role === 'INDUSTRY_USER') {
    return <Navigate to="/industria" replace />;
  }
  // Conferente usa só o Confere.
  if (teamRole === 'CONFERENTE') {
    return <Navigate to="/confere/" replace />;
  }
  return <>{children}</>;
};

const secure = (element: React.ReactNode) => <ProtectedRoute>{element}</ProtectedRoute>;

const IndustryRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userId, role, loading } = useAuth();
  if (loading) {
    return <PageLoader />;
  }
  if (!userId) {
    return <Navigate to="/login" replace />;
  }
  if (role !== 'INDUSTRY_USER') {
    return <Navigate to="/app" replace />;
  }
  return <>{children}</>;
};
const secureIndustry = (element: React.ReactNode) => <IndustryRoute>{element}</IndustryRoute>;

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

const disabledModuleRedirect = <Navigate to="/app" replace />;
const disabledSuperAdminModuleRedirect = <Navigate to="/super-admin" replace />;

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
        <Route path="/esqueci-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route path="/aceitar-convite" element={<AcceptInvite />} />
        <Route path="/register" element={<Register />} />
        <Route path="/super-admin/login" element={<SuperAdminLogin />} />
        <Route path="/" element={<Landing />} />
        <Route path="/download-agente" element={<PublicAgentDownload />} />
        <Route path="/baixar-agente" element={<Navigate to="/download-agente" replace />} />
        <Route path="/parear-agente" element={<AgentPairing />} />
        <Route path="/encarte/:slug" element={<PublicEncarte />} />
        <Route path="/confere/*" element={<ConfereApp />} />

        <Route path="/app" element={secure(<Dashboard />)} />
        <Route path="/app/decidir" element={secure(<Decide />)} />
        <Route path="/app/inteligencia" element={<Navigate to="/app/decidir" replace />} />
        <Route path="/app/perguntar" element={secure(<DataChat />)} />
        <Route path="/app/copiloto" element={<Navigate to="/app/decidir" replace />} />
        <Route path="/app/rede" element={secure(<NetworkView />)} />
        <Route path="/app/clientes" element={secure(<CustomerIntelligence />)} />
        <Route path="/app/produtos" element={secure(<Products />)} />
        <Route path="/app/produtos/:productId" element={secure(<ProductDetail />)} />
        <Route path="/app/cesta" element={<Navigate to="/app/produtos" replace />} />
        <Route path="/app/alertas" element={<Navigate to="/app" replace />} />
        <Route path="/app/lista-compras" element={secure(<ShoppingListPage />)} />
        <Route path="/app/pedidos" element={<Navigate to="/app/lista-compras" replace />} />
        <Route path="/app/mapa-loja" element={secure(<StoreMap />)} />
        <Route path="/app/encartes" element={secure(<ArtStudio />)} />
        <Route path="/app/encartes/:campaignId" element={secure(<ArtStudio />)} />
        <Route path="/app/ofertas" element={FEATURE_OFFER_TEMPLATES_ENABLED ? <OffersWorkspaceRedirect targetPath="/ofertas" workspace="admin" /> : disabledModuleRedirect} />
        <Route path="/app/ofertas/campanhas" element={FEATURE_OFFER_TEMPLATES_ENABLED ? <OffersSheetRedirect sheet="campaigns" defaultWorkspace="admin" /> : disabledModuleRedirect} />
        <Route path="/app/ofertas/inicio" element={FEATURE_OFFER_TEMPLATES_ENABLED ? <OffersSheetRedirect sheet="campaigns" defaultWorkspace="admin" /> : disabledModuleRedirect} />
        <Route path="/app/ofertas/modelos" element={FEATURE_OFFER_TEMPLATES_ENABLED ? <OffersWorkspaceRedirect targetPath="/ofertas" workspace="admin" /> : disabledModuleRedirect} />
        <Route path="/app/ofertas/designer" element={FEATURE_OFFER_TEMPLATES_ENABLED ? <OffersWorkspaceRedirect targetPath="/ofertas" workspace="admin" /> : disabledModuleRedirect} />
        <Route path="/app/ofertas/jobs" element={FEATURE_OFFER_TEMPLATES_ENABLED ? <OffersSheetRedirect sheet="media" defaultWorkspace="admin" /> : disabledModuleRedirect} />
        <Route path="/app/pdvs" element={secure(<PDVs />)} />
        <Route path="/app/campanhas" element={<Navigate to="/app/promocoes" replace />} />
        <Route path="/app/previsao-demanda" element={<Navigate to="/app/produtos" replace />} />
        <Route path="/app/promocoes" element={secure(<Promocoes />)} />
        <Route path="/app/configuracoes" element={secure(<Settings />)} />
        <Route path="/app/planos" element={secure(<Plans />)} />
        <Route path="/app/assinatura" element={secure(<MySubscription />)} />
        <Route path="/app/equipe" element={secure(<Team />)} />
        <Route path="/app/download-agente" element={secure(<AgentDownload />)} />
        <Route path="/app/admin/catalogo" element={secure(<AdminCatalog />)} />
        <Route path="/app/precos-estaduais" element={FEATURE_STATE_PRICES_ENABLED ? <Navigate to="/app/admin/precos-estaduais" replace /> : disabledModuleRedirect} />
        <Route path="/app/admin/precos-estaduais" element={FEATURE_STATE_PRICES_ENABLED ? secure(<StatePriceComparison />) : disabledModuleRedirect} />

        <Route path="/super-admin" element={secureSuperAdmin(<SuperAdminDashboard />)} />
        <Route path="/super-admin/saas" element={secureSuperAdmin(<SuperAdminUsers />)} />
        <Route path="/super-admin/assinaturas" element={secureSuperAdmin(<SuperAdminSubscriptions />)} />
        <Route path="/super-admin/clientes" element={secureSuperAdmin(<SuperAdminCustomers />)} />
        <Route path="/super-admin/cobranca" element={secureSuperAdmin(<SuperAdminCollections />)} />
        <Route path="/super-admin/usuarios" element={<Navigate to="/super-admin/saas" replace />} />
        <Route path="/super-admin/catalogo" element={secureSuperAdmin(<SuperAdminCatalogManager />)} />
        <Route path="/super-admin/precos-estaduais" element={FEATURE_STATE_PRICES_ENABLED ? secureSuperAdmin(<StatePriceComparison />) : disabledSuperAdminModuleRedirect} />
        <Route path="/super-admin/ofertas" element={FEATURE_OFFER_TEMPLATES_ENABLED ? <OffersWorkspaceRedirect targetPath="/ofertas" workspace="super-admin" /> : disabledSuperAdminModuleRedirect} />
        <Route path="/super-admin/crawler" element={secureSuperAdmin(<SuperAdminCrawlerConfig />)} />
        <Route path="/super-admin/temas" element={secureSuperAdmin(<SuperAdminArtThemes />)} />
        <Route path="/super-admin/confere" element={secureSuperAdmin(<SuperAdminConfere />)} />
        <Route path="/super-admin/industria" element={secureSuperAdmin(<SuperAdminIndustries />)} />
        <Route path="/super-admin/industria/dados" element={secureSuperAdmin(<SuperAdminIndustryData />)} />
        <Route path="/super-admin/industria/cobranca" element={secureSuperAdmin(<SuperAdminIndustryBilling />)} />
        <Route path="/industria" element={secureIndustry(<IndustryHome />)} />
        <Route path="/industria/mapa" element={secureIndustry(<IndustryMap />)} />
        <Route path="/industria/produtos" element={secureIndustry(<IndustryProducts />)} />
        <Route path="/industria/categoria" element={secureIndustry(<IndustryCategory />)} />
        <Route path="/industria/conta" element={secureIndustry(<IndustryAccount />)} />
        <Route path="/super-admin/ia" element={secureSuperAdmin(<SuperAdminAi />)} />
        <Route path="/super-admin/temas/:themeId" element={secureSuperAdmin(<SuperAdminArtThemes />)} />
        <Route path="/super-admin/crawler/runs/:runId" element={secureSuperAdmin(<SuperAdminCrawlerRunDetails />)} />

        <Route path="/ofertas" element={FEATURE_OFFER_TEMPLATES_ENABLED ? secureOffers(<OfferDesigner />) : disabledModuleRedirect} />
        <Route path="/ofertas/campanhas" element={FEATURE_OFFER_TEMPLATES_ENABLED ? secureOffers(<OffersSheetRedirect sheet="campaigns" />) : disabledModuleRedirect} />
        <Route path="/ofertas/jobs" element={FEATURE_OFFER_TEMPLATES_ENABLED ? secureOffers(<OffersSheetRedirect sheet="media" />) : disabledModuleRedirect} />

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
