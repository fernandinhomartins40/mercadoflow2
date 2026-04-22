import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/product/ProductImage';
import { useMarketData } from '../hooks/useMarketData';
import { useShoppingList } from '../hooks/useShoppingList';
import { useAuth } from '../context/AuthContext';
import {
  ProductPerformance,
  SeasonalityPoint,
} from '../types/analytics.types';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ShoppingCart,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Map,
} from 'lucide-react';

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatCompact = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));

const formatSignedPercent = (value?: number | null) => {
  const n = Number(value || 0);
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

const getDayOfWeek = () =>
  new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

const ragColor = (value: number, good: number, bad: number) => {
  if (value >= good) return 'emerald';
  if (value >= bad) return 'amber';
  return 'red';
};

const TrendIcon: React.FC<{ value: number }> = ({ value }) => {
  if (value > 1) return <TrendingUp className="h-4 w-4 text-emerald-600" />;
  if (value < -1) return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
};

const KPICard: React.FC<{ label: string; value: string; change?: number; rag: 'emerald' | 'amber' | 'red' }> = ({ label, value, change, rag }) => {
  const border = rag === 'emerald' ? 'border-l-emerald-500' : rag === 'amber' ? 'border-l-amber-500' : 'border-l-red-500';
  const dot = rag === 'emerald' ? 'bg-emerald-500' : rag === 'amber' ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className={`rounded-xl border border-gray-100 bg-white p-4 shadow-sm border-l-4 ${border}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {change !== undefined && (
        <div className="mt-1 flex items-center gap-1">
          <TrendIcon value={change} />
          <span className={`text-sm font-medium ${change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-500' : 'text-gray-400'}`}>
            {formatSignedPercent(change)} vs semana passada
          </span>
        </div>
      )}
    </div>
  );
};

const ActionCard: React.FC<{
  severity: 'critical' | 'warning' | 'positive';
  title: string;
  description: string;
  actions: { label: string; to: string }[];
}> = ({ severity, title, description, actions }) => {
  const border = severity === 'critical' ? 'border-l-red-500' : severity === 'warning' ? 'border-l-amber-500' : 'border-l-emerald-500';
  const iconColor = severity === 'critical' ? 'text-red-500' : severity === 'warning' ? 'text-amber-500' : 'text-emerald-500';
  const Icon = severity === 'positive' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm border-l-4 ${border}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link key={a.to} to={a.to} className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 no-underline transition hover:bg-gray-100">
              {a.label} <ArrowRight className="h-3 w-3" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

const ProductRow: React.FC<{ product: ProductPerformance; rank: number }> = ({ product, rank }) => {
  const trend = Number(product.revenueTrendPercentage || 0);
  return (
    <Link to={`/app/produtos/${product.productId}`} className="flex items-center gap-3 rounded-lg p-2 no-underline transition hover:bg-gray-50">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">{rank}</span>
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-gray-50">
        <ProductImage src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
        <p className="text-xs text-gray-500">{formatMoney(product.revenue)}</p>
      </div>
      <div className="flex items-center gap-1">
        <TrendIcon value={trend} />
        <span className={`text-xs font-medium ${trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-500' : 'text-gray-400'}`}>
          {formatSignedPercent(trend)}
        </span>
      </div>
    </Link>
  );
};

const WeekBar: React.FC<{ label: string; value: number; maxValue: number }> = ({ label, value, maxValue }) => {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex h-28 w-full items-end justify-center">
        <div className="w-4 rounded-t bg-emerald-500 transition-all" style={{ height: `${Math.max(pct, 4)}%` }} />
      </div>
      <span className="text-[10px] font-medium text-gray-500">{label}</span>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const { name } = useAuth();
  const { dashboard, loading, error } = useMarketData();
  const { productIds: _ids } = useShoppingList();

  const growth = Number(dashboard?.growthPercentage || 0);
  const topProducts = dashboard?.topProducts || [];
  const slowMovers = dashboard?.slowMovers || [];
  const replenish = dashboard?.replenishmentCandidates || [];

  const actions = useMemo(() => {
    const result: { severity: 'critical' | 'warning' | 'positive'; title: string; description: string; actions: { label: string; to: string }[] }[] = [];
    if (slowMovers.length > 0) {
      const names = slowMovers.slice(0, 2).map((p) => p.name).join(', ');
      result.push({
        severity: 'critical',
        title: `${slowMovers.length} produtos com vendas muito baixas`,
        description: `${names} e outros precisam de revisão. Considere promoção ou reposicionamento.`,
        actions: [{ label: 'Ver produtos', to: '/app/produtos' }, { label: 'Criar promoção', to: '/app/campanhas' }],
      });
    }
    if (replenish.length > 0) {
      const names = replenish.slice(0, 2).map((p) => p.name).join(', ');
      result.push({
        severity: 'warning',
        title: `${replenish.length} produtos pedem reposição`,
        description: `${names} estão com giro forte. Aumente o pedido para não faltar.`,
        actions: [{ label: 'Ver pedido inteligente', to: '/app/lista-compras' }],
      });
    }
    if (topProducts.length > 0 && Number(topProducts[0].revenueTrendPercentage || 0) > 0) {
      result.push({
        severity: 'positive',
        title: `${topProducts[0].name} está em alta!`,
        description: `Vendas subiram ${formatSignedPercent(topProducts[0].revenueTrendPercentage)}. Garanta estoque e boa exposição.`,
        actions: [{ label: 'Ver detalhes', to: `/app/produtos/${topProducts[0].productId}` }],
      });
    }
    return result;
  }, [slowMovers, replenish, topProducts]);

  const weekData = useMemo(() => {
    const days = dashboard?.weekdaySeasonality || [];
    const maxRevenue = Math.max(...days.map((d) => Number(d.revenue || 0)), 1);
    return { days, maxRevenue };
  }, [dashboard?.weekdaySeasonality]);

  const summaryText = useMemo(() => {
    if (!dashboard) return '';
    const parts: string[] = [];
    parts.push(`Seu mercado faturou ${formatMoney(dashboard.totalRevenue)} no período`);
    if (growth > 0) parts.push(`com crescimento de ${growth.toFixed(1)}%`);
    else if (growth < 0) parts.push(`com queda de ${Math.abs(growth).toFixed(1)}%`);
    parts.push(`em ${formatCompact(dashboard.totalTransactions)} transações.`);
    if (actions.length > 0) parts.push(`${actions.length} item${actions.length > 1 ? 's' : ''} precisa${actions.length > 1 ? 'm' : ''} da sua atenção.`);
    return parts.join(' ');
  }, [dashboard, growth, actions.length]);

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-sm text-gray-500">Carregando seu painel...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !dashboard) {
    return (
      <Layout>
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
            <p className="mt-2 text-sm text-red-600">{error || 'Não foi possível carregar o painel.'}</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{getGreeting()}, {name || 'gestor'}!</h1>
          <p className="mt-1 text-sm capitalize text-gray-500">{getDayOfWeek()}</p>
          <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-emerald-800">{summaryText}</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard label="Faturamento" value={formatMoney(dashboard.totalRevenue)} change={growth} rag={ragColor(growth, 0, -5)} />
          <KPICard label="Ticket médio" value={formatMoney(dashboard.averageTicket)} rag="emerald" />
          <KPICard label="Transações" value={formatCompact(dashboard.totalTransactions)} rag="emerald" />
          <KPICard label="Produtos ativos" value={formatCompact(dashboard.activeProducts)} rag={Number(dashboard.activeProducts || 0) > 50 ? 'emerald' : 'amber'} />
        </div>

        {/* Actions */}
        {actions.length > 0 && (
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Ações do dia ({actions.length})
            </h2>
            <div className="flex flex-col gap-3">
              {actions.map((a, i) => <ActionCard key={i} {...a} />)}
            </div>
          </div>
        )}

        {/* Two columns */}
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Vendas da semana</h3>
            <p className="text-xs text-gray-500">Faturamento por dia</p>
            {weekData.days.length > 0 ? (
              <div className="mt-4 grid grid-cols-7 gap-2">
                {weekData.days.map((day) => (
                  <WeekBar key={day.label} label={day.label?.slice(0, 3) || ''} value={Number(day.revenue || 0)} maxValue={weekData.maxRevenue} />
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">Sem dados de sazonalidade semanal.</p>
            )}
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Mais vendidos</h3>
                <Link to="/app/produtos" className="text-xs font-medium text-emerald-600 no-underline hover:text-emerald-700">
                  Ver todos <ArrowRight className="inline h-3 w-3" />
                </Link>
              </div>
              <div className="mt-3 flex flex-col">
                {topProducts.slice(0, 5).map((p, i) => <ProductRow key={p.productId} product={p} rank={i + 1} />)}
                {topProducts.length === 0 && <p className="py-4 text-center text-sm text-gray-400">Sem dados.</p>}
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Precisam de atenção</h3>
                <Link to="/app/alertas" className="text-xs font-medium text-red-500 no-underline hover:text-red-600">
                  Ver alertas <ArrowRight className="inline h-3 w-3" />
                </Link>
              </div>
              <div className="mt-3 flex flex-col">
                {slowMovers.slice(0, 5).map((p, i) => <ProductRow key={p.productId} product={p} rank={i + 1} />)}
                {slowMovers.length === 0 && <p className="py-4 text-center text-sm text-gray-400">Todos os produtos em dia!</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { to: '/app/lista-compras', icon: ShoppingCart, title: 'Pedido inteligente', sub: 'Compra guiada por dados' },
            { to: '/app/cesta', icon: Sparkles, title: 'Combos', sub: 'Produtos que vendem juntos' },
            { to: '/app/campanhas', icon: TrendingUp, title: 'Promoções', sub: 'Crie e meça campanhas' },
            { to: '/app/mapa-loja', icon: Map, title: 'Mapa da loja', sub: 'Organize para vender mais' },
          ].map((link) => (
            <Link key={link.to} to={link.to} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm no-underline transition hover:border-emerald-200 hover:shadow-md">
              <link.icon className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">{link.title}</p>
                <p className="text-xs text-gray-500">{link.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
