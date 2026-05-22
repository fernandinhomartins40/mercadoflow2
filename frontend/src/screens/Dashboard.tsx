import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/product/ProductImage';
import Button from '../components/common/Button';
import { useMarketData } from '../hooks/useMarketData';
import { useShoppingList } from '../hooks/useShoppingList';
import { useAlerts } from '../hooks/useAlerts';
import { useAuth } from '../context/AuthContext';
import { ProductPerformance } from '../types/analytics.types';
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
  Activity,
  Bell,
  Clock,
  Eye,
  ChevronDown,
  ChevronUp,
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
  if (value >= good) return 'green';
  if (value >= bad) return 'amber';
  return 'red';
};

const TrendIcon: React.FC<{ value: number }> = ({ value }) => {
  if (value > 1) return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
  if (value < -1) return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5" style={{ color: 'var(--text-soft)' }} />;
};

const KPICard: React.FC<{ label: string; value: string; change?: number; color: 'green' | 'amber' | 'red' | 'blue' | 'purple' }> = ({ label, value, change, color }) => {
  const colorMap = {
    green:  { bg: 'bg-green-500',  sub: 'text-green-100' },
    amber:  { bg: 'bg-amber-500',  sub: 'text-amber-100' },
    red:    { bg: 'bg-red-500',    sub: 'text-red-100' },
    blue:   { bg: 'bg-blue-500',   sub: 'text-blue-100' },
    purple: { bg: 'bg-violet-500', sub: 'text-violet-100' },
  };
  const c = colorMap[color];
  return (
    <div className={`flex flex-col gap-2 rounded-xl p-4 ${c.bg}`}>
      <span className={`text-[0.65rem] font-semibold uppercase tracking-widest ${c.sub}`}>{label}</span>
      <p className={`text-2xl font-bold tracking-tight text-white`}>{value}</p>
      {change !== undefined && (
        <span className={`text-xs font-medium ${c.sub}`}>{formatSignedPercent(change)} vs semana passada</span>
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
  const styleMap = {
    critical: { wrap: 'border-red-200 bg-red-50',    iconBg: 'bg-red-100',   iconColor: 'text-red-500' },
    warning:  { wrap: 'border-amber-200 bg-amber-50', iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
    positive: { wrap: 'border-green-200 bg-green-50', iconBg: 'bg-green-100', iconColor: 'text-green-600' },
  };
  const s = styleMap[severity];
  const Icon = severity === 'positive' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${s.wrap}`}>
      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${s.iconBg}`}>
        <Icon className={`h-4 w-4 ${s.iconColor}`} />
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h4>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>{description}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link
              key={a.to} to={a.to}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold no-underline transition hover:opacity-80"
              style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
            >
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
    <Link
      to={`/app/produtos/${product.productId}`}
      className="flex items-center gap-3 rounded-lg p-2 no-underline transition"
      style={{ ['--tw-bg-opacity' as any]: 1 }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-soft)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: 'var(--surface-muted)', color: 'var(--text-soft)' }}
      >
        {rank}
      </span>
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-soft)' }}>
        <ProductImage src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{product.name}</p>
        <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{formatMoney(product.revenue)}</p>
      </div>
      <div className="flex items-center gap-1">
        <TrendIcon value={trend} />
        <span className={`text-xs font-medium ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : ''}`} style={!trend ? { color: 'var(--text-soft)' } : {}}>
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
      <div className="relative flex h-24 w-full items-end justify-center">
        <div className="w-5 rounded-t-sm bg-green-500 transition-all" style={{ height: `${Math.max(pct, 4)}%` }} />
      </div>
      <span className="text-[10px] font-medium" style={{ color: 'var(--text-soft)' }}>{label}</span>
    </div>
  );
};

const priorityConfig = (p: string) => {
  switch (p) {
    case 'HIGH': return {
      border: 'border-l-red-500',
      icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
      label: 'Urgente',
      labelStyle: { background: '#fee2e2', color: '#991b1b' } as React.CSSProperties,
    };
    case 'MEDIUM': return {
      border: 'border-l-amber-500',
      icon: <Clock className="h-4 w-4 text-amber-500" />,
      label: 'Atenção',
      labelStyle: { background: '#fef3c7', color: '#92400e' } as React.CSSProperties,
    };
    default: return {
      border: 'border-l-slate-300',
      icon: <Bell className="h-4 w-4" style={{ color: 'var(--text-soft)' }} />,
      label: 'Info',
      labelStyle: { background: 'var(--surface-muted)', color: 'var(--text-muted)' } as React.CSSProperties,
    };
  }
};

const AlertsSection: React.FC = () => {
  const { alerts, loading, onlyUnread, setOnlyUnread, refresh, markRead, markAllRead } = useAlerts();
  const [expanded, setExpanded] = useState(false);

  const sorted = [...alerts].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (order[a.priority as keyof typeof order] ?? 2) - (order[b.priority as keyof typeof order] ?? 2);
  });

  const unreadCount = alerts.filter((a) => !a.isRead).length;
  const highCount = alerts.filter((a) => a.priority === 'HIGH').length;
  const visible = expanded ? sorted : sorted.slice(0, 3);

  return (
    <div className="rounded-xl" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4" style={{ color: unreadCount > 0 ? '#d97706' : 'var(--text-soft)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Alertas</span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>
          )}
          {highCount > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">{highCount} urgente{highCount > 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-soft)' }}>{alerts.length} total</span>
          {expanded ? <ChevronUp className="h-4 w-4" style={{ color: 'var(--text-soft)' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-soft)' }} />}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 flex flex-col gap-3" style={{ borderColor: 'var(--border-soft)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyUnread(!onlyUnread)}
              className="rounded-full px-3 py-1 text-xs font-semibold transition"
              style={
                onlyUnread
                  ? { border: '1px solid var(--brand-600)', background: 'var(--surface-success)', color: 'var(--brand-700)' }
                  : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }
              }
            >
              {onlyUnread ? 'Somente não lidos' : 'Todos'}
            </button>
            <Button variant="secondary" onClick={refresh} disabled={loading}>Atualizar</Button>
            <Button variant="ghost" onClick={markAllRead} disabled={loading || alerts.length === 0}>Marcar todos lidos</Button>
          </div>

          {loading ? (
            <div className="flex h-16 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum alerta pendente. Tudo em ordem!</p>
            </div>
          ) : (
            <>
              {visible.map((alert) => {
                const cfg = priorityConfig(alert.priority);
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 rounded-lg border-l-4 p-3 transition ${cfg.border} ${alert.isRead ? 'opacity-50' : ''}`}
                    style={{ border: '1px solid var(--border-soft)', borderLeftWidth: 4, background: 'var(--surface-soft)' }}
                  >
                    {cfg.icon}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{alert.title}</h4>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={cfg.labelStyle}>{cfg.label}</span>
                        {!alert.isRead && <span className="h-2 w-2 rounded-full bg-green-500" />}
                      </div>
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{alert.message}</p>
                    </div>
                    {!alert.isRead && (
                      <button
                        type="button"
                        onClick={() => markRead(alert.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition hover:opacity-80"
                        style={{ background: 'var(--surface-base)', color: 'var(--text-muted)' }}
                      >
                        <Eye className="h-3 w-3" /> Lido
                      </button>
                    )}
                  </div>
                );
              })}
              {sorted.length > 3 && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="text-xs font-medium text-center"
                  style={{ color: 'var(--brand-600)' }}
                >
                  {expanded && visible.length === sorted.length ? '' : `Ver mais ${sorted.length - 3} alertas`}
                </button>
              )}
            </>
          )}
        </div>
      )}
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
        actions: [{ label: 'Ver produtos', to: '/app/produtos' }, { label: 'Criar promoção', to: '/app/promocoes' }],
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

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            <p className="mt-3 text-sm" style={{ color: 'var(--text-soft)' }}>Carregando painel...</p>
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
            <AlertTriangle className="mx-auto h-7 w-7 text-red-400" />
            <p className="mt-2 text-sm text-red-600">{error || 'Não foi possível carregar o painel.'}</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        {/* Greeting */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {getGreeting()}, {name || 'gestor'}!
            </h1>
            <p className="mt-0.5 text-sm capitalize" style={{ color: 'var(--text-soft)' }}>{getDayOfWeek()}</p>
          </div>
          {actions.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {actions.length} iten{actions.length > 1 ? 's' : ''} para atenção
            </span>
          )}
        </div>

        {/* KPI strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard label="Faturamento" value={formatMoney(dashboard.totalRevenue)} change={growth} color={ragColor(growth, 0, -5) as any} />
          <KPICard label="Ticket médio" value={formatMoney(dashboard.averageTicket)} color="blue" />
          <KPICard label="Transações" value={formatCompact(dashboard.totalTransactions)} color="purple" />
          <KPICard label="Produtos ativos" value={formatCompact(dashboard.activeProducts)} color={Number(dashboard.activeProducts || 0) > 50 ? 'green' : 'amber'} />
        </div>

        {/* Actions */}
        {actions.length > 0 && (
          <div className="flex flex-col gap-2">
            {actions.map((a, i) => <ActionCard key={i} {...a} />)}
          </div>
        )}

        {/* Alerts section (collapsible) */}
        <AlertsSection />

        {/* Two columns */}
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-500" />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Vendas da semana</h3>
            </div>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-soft)' }}>Faturamento por dia</p>
            {weekData.days.length > 0 ? (
              <div className="mt-4 grid grid-cols-7 gap-1.5">
                {weekData.days.map((day) => (
                  <WeekBar key={day.label} label={day.label?.slice(0, 3) || ''} value={Number(day.revenue || 0)} maxValue={weekData.maxRevenue} />
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm" style={{ color: 'var(--text-soft)' }}>Sem dados de sazonalidade semanal.</p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Mais vendidos</h3>
                <Link to="/app/produtos" className="text-xs font-medium text-green-600 no-underline hover:text-green-700">
                  Ver todos <ArrowRight className="inline h-3 w-3" />
                </Link>
              </div>
              <div className="mt-2 flex flex-col">
                {topProducts.slice(0, 5).map((p, i) => <ProductRow key={p.productId} product={p} rank={i + 1} />)}
                {topProducts.length === 0 && <p className="py-4 text-center text-sm" style={{ color: 'var(--text-soft)' }}>Sem dados.</p>}
              </div>
            </div>
            <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Precisam de atenção</h3>
                <span className="text-xs font-medium text-red-500">
                  Precisa de atenção
                </span>
              </div>
              <div className="mt-2 flex flex-col">
                {slowMovers.slice(0, 5).map((p, i) => <ProductRow key={p.productId} product={p} rank={i + 1} />)}
                {slowMovers.length === 0 && <p className="py-4 text-center text-sm" style={{ color: 'var(--text-soft)' }}>Todos os produtos em dia!</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { to: '/app/lista-compras', icon: ShoppingCart, title: 'Pedido inteligente', sub: 'Compra guiada por dados', color: 'bg-blue-50 border-blue-200 text-blue-600' },
            { to: '/app/produtos', icon: Sparkles, title: 'Combos', sub: 'Produtos que vendem juntos', color: 'bg-violet-50 border-violet-200 text-violet-600' },
            { to: '/app/promocoes', icon: TrendingUp, title: 'Promoções', sub: 'Crie e meça campanhas', color: 'bg-green-50 border-green-200 text-green-600' },
            { to: '/app/mapa-loja', icon: Map, title: 'Mapa da loja', sub: 'Organize para vender mais', color: 'bg-amber-50 border-amber-200 text-amber-600' },
          ].map((link) => (
            <Link key={link.to} to={link.to} className={`flex items-center gap-3 rounded-xl border p-3.5 no-underline transition hover:opacity-80 ${link.color}`}>
              <link.icon className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{link.title}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{link.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
