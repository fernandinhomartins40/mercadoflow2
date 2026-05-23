import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/product/ProductImage';
import Button from '../components/common/Button';
import { useMarketData } from '../hooks/useMarketData';
import { useAlerts } from '../hooks/useAlerts';
import { useAuth } from '../context/AuthContext';
import { AlertItem, AlertType } from '../types/alert.types';
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
  Zap,
  PackageSearch,
  Tag,
  Link2,
  Heart,
  BarChart2,
  XCircle,
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

// ── Alert type config ─────────────────────────────────────────────────────────

const ALERT_TYPE_CFG: Record<AlertType, {
  icon: React.ReactNode;
  accentClass: string;        // border-l color
  bgClass: string;            // card background when unread
  label: string;
  labelStyle: React.CSSProperties;
  ctas: (alert: AlertItem) => { label: string; to: string }[];
}> = {
  ZERO_SALES: {
    icon: <XCircle className="h-4 w-4 text-red-500" />,
    accentClass: 'border-l-red-500',
    bgClass: 'bg-red-50',
    label: 'Sem vendas',
    labelStyle: { background: '#fee2e2', color: '#991b1b' },
    ctas: (a) => [
      ...(a.productId ? [{ label: 'Ver produto', to: `/app/produtos/${a.productId}` }] : []),
      { label: 'Criar promoção', to: '/app/promocoes' },
    ],
  },
  LOW_STOCK: {
    icon: <ShoppingCart className="h-4 w-4 text-orange-500" />,
    accentClass: 'border-l-orange-500',
    bgClass: 'bg-orange-50',
    label: 'Reposição',
    labelStyle: { background: '#ffedd5', color: '#9a3412' },
    ctas: (a) => [
      { label: 'Pedido inteligente', to: '/app/lista-compras' },
      ...(a.productId ? [{ label: 'Ver produto', to: `/app/produtos/${a.productId}` }] : []),
    ],
  },
  DEMAND_SPIKE: {
    icon: <Zap className="h-4 w-4 text-orange-600" />,
    accentClass: 'border-l-orange-600',
    bgClass: 'bg-orange-50',
    label: 'Pico de demanda',
    labelStyle: { background: '#fed7aa', color: '#7c2d12' },
    ctas: (a) => [
      { label: 'Pedido urgente', to: '/app/lista-compras' },
      ...(a.productId ? [{ label: 'Ver produto', to: `/app/produtos/${a.productId}` }] : []),
    ],
  },
  HIGH_PERFORMING: {
    icon: <TrendingUp className="h-4 w-4 text-green-600" />,
    accentClass: 'border-l-green-500',
    bgClass: 'bg-green-50',
    label: 'Em alta',
    labelStyle: { background: '#dcfce7', color: '#14532d' },
    ctas: (a) => [
      ...(a.productId ? [{ label: 'Ver produto', to: `/app/produtos/${a.productId}` }] : []),
      { label: 'Pedido inteligente', to: '/app/lista-compras' },
    ],
  },
  SLOW_MOVING: {
    icon: <TrendingDown className="h-4 w-4 text-red-500" />,
    accentClass: 'border-l-red-400',
    bgClass: 'bg-red-50',
    label: 'Giro baixo',
    labelStyle: { background: '#fee2e2', color: '#991b1b' },
    ctas: (a) => [
      ...(a.productId ? [{ label: 'Ver produto', to: `/app/produtos/${a.productId}` }] : []),
      { label: 'Criar promoção', to: '/app/promocoes' },
    ],
  },
  HEALTH_CRITICAL: {
    icon: <Heart className="h-4 w-4 text-red-600" />,
    accentClass: 'border-l-red-600',
    bgClass: 'bg-red-50',
    label: 'Crítico',
    labelStyle: { background: '#fecaca', color: '#7f1d1d' },
    ctas: (a) => [
      ...(a.productId ? [{ label: 'Analisar produto', to: `/app/produtos/${a.productId}` }] : []),
      { label: 'Ver promoções', to: '/app/promocoes' },
    ],
  },
  MOMENTUM_REVERSAL: {
    icon: <BarChart2 className="h-4 w-4 text-amber-500" />,
    accentClass: 'border-l-amber-500',
    bgClass: 'bg-amber-50',
    label: 'Desacelerando',
    labelStyle: { background: '#fef3c7', color: '#92400e' },
    ctas: (a) => [
      ...(a.productId ? [{ label: 'Ver produto', to: `/app/produtos/${a.productId}` }] : []),
      { label: 'Ajustar pedido', to: '/app/lista-compras' },
    ],
  },
  PROMOTION_OPPORTUNITY: {
    icon: <Tag className="h-4 w-4 text-violet-600" />,
    accentClass: 'border-l-violet-500',
    bgClass: 'bg-violet-50',
    label: 'Promoção',
    labelStyle: { background: '#ede9fe', color: '#4c1d95' },
    ctas: (a) => [
      { label: 'Criar campanha', to: '/app/promocoes' },
      ...(a.productId ? [{ label: 'Ver produto', to: `/app/produtos/${a.productId}` }] : []),
    ],
  },
  BASKET_OPPORTUNITY: {
    icon: <Link2 className="h-4 w-4 text-blue-600" />,
    accentClass: 'border-l-blue-500',
    bgClass: 'bg-blue-50',
    label: 'Combo',
    labelStyle: { background: '#dbeafe', color: '#1e3a8a' },
    ctas: (a) => [
      { label: 'Ver combos', to: '/app/produtos' },
      ...(a.productId ? [{ label: 'Ver produto', to: `/app/produtos/${a.productId}` }] : []),
    ],
  },
  EXPIRATION_RISK: {
    icon: <Clock className="h-4 w-4 text-amber-600" />,
    accentClass: 'border-l-amber-600',
    bgClass: 'bg-amber-50',
    label: 'Vencimento',
    labelStyle: { background: '#fef3c7', color: '#92400e' },
    ctas: (a) => [
      { label: 'Criar promoção', to: '/app/promocoes' },
      ...(a.productId ? [{ label: 'Ver produto', to: `/app/produtos/${a.productId}` }] : []),
    ],
  },
  PRICE_ABOVE_MARKET: {
    icon: <PackageSearch className="h-4 w-4 text-slate-600" />,
    accentClass: 'border-l-slate-400',
    bgClass: 'bg-slate-50',
    label: 'Preço alto',
    labelStyle: { background: '#f1f5f9', color: '#334155' },
    ctas: (a) => [
      ...(a.productId ? [{ label: 'Ver produto', to: `/app/produtos/${a.productId}` }] : []),
    ],
  },
};

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const PRIORITY_BADGE: Record<string, React.CSSProperties> = {
  URGENT: { background: '#fecaca', color: '#7f1d1d' },
  HIGH:   { background: '#fee2e2', color: '#991b1b' },
  MEDIUM: { background: '#fef3c7', color: '#92400e' },
  LOW:    { background: 'var(--surface-muted)', color: 'var(--text-muted)' },
};

const PRIORITY_LABEL: Record<string, string> = { URGENT: 'Urgente', HIGH: 'Alto', MEDIUM: 'Atenção', LOW: 'Info' };

// ── Metric chips ──────────────────────────────────────────────────────────────

const MetricChip: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <span
    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold"
    style={highlight
      ? { background: '#fee2e2', color: '#991b1b' }
      : { background: 'var(--surface-muted)', color: 'var(--text-soft)' }}
  >
    <span style={{ color: 'var(--text-soft)', fontWeight: 400 }}>{label}</span> {value}
  </span>
);

const AlertMetricChips: React.FC<{ alert: AlertItem }> = ({ alert }) => {
  const m = alert.metadata;
  if (!m) return null;
  const chips: React.ReactNode[] = [];

  if (alert.type === 'ZERO_SALES' && m.daysSilent) {
    chips.push(<MetricChip key="ds" label="Dias sem venda" value={String(m.daysSilent)} highlight />);
    if (m.previousTransactions) chips.push(<MetricChip key="pt" label="Transações anteriores" value={String(m.previousTransactions)} />);
  }
  if ((alert.type === 'LOW_STOCK' || alert.type === 'DEMAND_SPIKE') && m.salesVelocity) {
    chips.push(<MetricChip key="sv" label="Giro" value={`${(m.salesVelocity as number).toFixed(1)} un./dia`} highlight />);
    if (m.velocityRatio) chips.push(<MetricChip key="vr" label="vs. portfólio" value={`${(m.velocityRatio as number).toFixed(1)}×`} />);
    if (m.momentumScore) chips.push(<MetricChip key="ms" label="Momentum" value={(m.momentumScore as number).toFixed(2)} />);
  }
  if ((alert.type === 'SLOW_MOVING' || alert.type === 'HEALTH_CRITICAL') && m.revenueTrend !== undefined) {
    chips.push(<MetricChip key="rt" label="Tendência receita" value={`${(m.revenueTrend as number).toFixed(1)}%`} highlight />);
    if (m.healthScore !== undefined) chips.push(<MetricChip key="hs" label="Health" value={`${(m.healthScore as number).toFixed(0)}/100`} highlight={(m.healthScore as number) < 25} />);
    if (m.velocityRatio !== undefined) chips.push(<MetricChip key="vr" label="Giro vs. média" value={`${((m.velocityRatio as number) * 100).toFixed(0)}%`} />);
  }
  if (alert.type === 'MOMENTUM_REVERSAL' && m.momentumScore) {
    chips.push(<MetricChip key="ms" label="Momentum" value={(m.momentumScore as number).toFixed(2)} highlight={(m.momentumScore as number) < 0.7} />);
    if (m.salesVelocity) chips.push(<MetricChip key="sv" label="Giro atual" value={`${(m.salesVelocity as number).toFixed(1)} un./dia`} />);
  }
  if (alert.type === 'PROMOTION_OPPORTUNITY' && m.priceAboveBaselinePercent) {
    chips.push(<MetricChip key="pa" label="Preço acima base" value={`+${(m.priceAboveBaselinePercent as number).toFixed(1)}%`} highlight />);
    if (m.revenueTrend !== undefined) chips.push(<MetricChip key="rt" label="Queda receita" value={`${(m.revenueTrend as number).toFixed(1)}%`} />);
    if (m.promoRevenueShare !== undefined) chips.push(<MetricChip key="ps" label="Receita promo" value={`${((m.promoRevenueShare as number) * 100).toFixed(0)}%`} />);
  }
  if (alert.type === 'BASKET_OPPORTUNITY' && m.lift) {
    chips.push(<MetricChip key="li" label="Lift" value={`${(m.lift as number).toFixed(1)}×`} highlight />);
    if (m.antecedentName) chips.push(<MetricChip key="an" label="Acompanha" value={String(m.antecedentName)} />);
    if (m.consequentTrend !== undefined) chips.push(<MetricChip key="ct" label="Tendência" value={`${(m.consequentTrend as number).toFixed(1)}%`} />);
  }
  if (alert.type === 'HIGH_PERFORMING' && m.revenueTrend !== undefined) {
    chips.push(<MetricChip key="rt" label="Crescimento" value={`+${(m.revenueTrend as number).toFixed(1)}%`} highlight />);
    if (m.salesVelocity) chips.push(<MetricChip key="sv" label="Giro" value={`${(m.salesVelocity as number).toFixed(1)} un./dia`} />);
    if (m.momentumScore) chips.push(<MetricChip key="ms" label="Momentum" value={(m.momentumScore as number).toFixed(2)} />);
  }

  if (chips.length === 0) return null;
  return <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div>;
};

// ── Alert card ────────────────────────────────────────────────────────────────

const AlertCard: React.FC<{ alert: AlertItem; onMarkRead: (id: string) => void }> = ({ alert, onMarkRead }) => {
  const navigate = useNavigate();
  const cfg = ALERT_TYPE_CFG[alert.type] ?? ALERT_TYPE_CFG['LOW_STOCK'];
  const isUrgent = alert.priority === 'URGENT' || alert.priority === 'HIGH';

  return (
    <div
      className={`rounded-xl border-l-4 transition ${cfg.accentClass} ${alert.isRead ? 'opacity-50' : ''}`}
      style={{ border: '1px solid var(--border-soft)', borderLeftWidth: 4, background: alert.isRead ? 'var(--surface-soft)' : 'var(--surface-base)' }}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Product image or type icon */}
        {alert.productImage ? (
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-soft)' }}>
            <ProductImage src={alert.productImage} alt={alert.productName || ''} className="h-full w-full object-contain" />
          </div>
        ) : (
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${alert.isRead ? '' : cfg.bgClass}`}>
            {cfg.icon}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={PRIORITY_BADGE[alert.priority] ?? PRIORITY_BADGE['LOW']}>
              {PRIORITY_LABEL[alert.priority] ?? alert.priority}
            </span>
            <span className="rounded-md px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--text-soft)' }}>
              {cfg.label}
            </span>
            {!alert.isRead && isUrgent && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            )}
          </div>

          {alert.productName && (
            <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--text-soft)' }}>{alert.productName}</p>
          )}
          <h4 className="mt-0.5 text-sm font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{alert.title}</h4>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{alert.message}</p>

          <AlertMetricChips alert={alert} />

          {/* CTAs */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {cfg.ctas(alert).map((cta) => (
              <button
                key={cta.to}
                type="button"
                onClick={() => navigate(cta.to)}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition hover:opacity-80"
                style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
              >
                {cta.label} <ArrowRight className="h-3 w-3" />
              </button>
            ))}
            {!alert.isRead && (
              <button
                type="button"
                onClick={() => onMarkRead(alert.id)}
                className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition hover:opacity-70"
                style={{ color: 'var(--text-soft)' }}
              >
                <Eye className="h-3 w-3" /> Lido
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Alerts section (collapsible, in Dashboard) ────────────────────────────────

const AlertsSection: React.FC = () => {
  const { alerts, loading, onlyUnread, setOnlyUnread, refresh, markRead, markAllRead } = useAlerts();
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => [...alerts].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
  }), [alerts]);

  const unreadCount = alerts.filter((a) => !a.isRead).length;
  const urgentCount = alerts.filter((a) => a.priority === 'URGENT' || a.priority === 'HIGH').length;
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
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Alertas de desempenho</span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">{unreadCount} novos</span>
          )}
          {urgentCount > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">{urgentCount} urgente{urgentCount > 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-soft)' }}>{alerts.length} total</span>
          {expanded ? <ChevronUp className="h-4 w-4" style={{ color: 'var(--text-soft)' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-soft)' }} />}
        </div>
      </button>

      <div className={`overflow-hidden transition-all ${expanded ? 'max-h-[4000px]' : 'max-h-0'}`} style={{ borderTop: expanded ? '1px solid var(--border-soft)' : 'none' }}>
        <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyUnread(!onlyUnread)}
              className="rounded-full px-3 py-1 text-xs font-semibold transition"
              style={onlyUnread
                ? { border: '1px solid var(--brand-600)', background: 'var(--surface-success)', color: 'var(--brand-700)' }
                : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}
            >
              {onlyUnread ? 'Somente não lidos' : 'Todos'}
            </button>
            <Button variant="secondary" onClick={refresh} disabled={loading}>Atualizar</Button>
            <Button variant="ghost" onClick={markAllRead} disabled={loading || unreadCount === 0}>Marcar todos lidos</Button>
          </div>

          {loading ? (
            <div className="flex h-16 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl p-4" style={{ background: 'var(--surface-soft)' }}>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Todos os produtos em dia. Nenhum alerta pendente.</p>
            </div>
          ) : (
            <>
              {visible.map((alert) => (
                <AlertCard key={alert.id} alert={alert} onMarkRead={markRead} />
              ))}
              {sorted.length > 3 && !expanded && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="rounded-lg px-3 py-2 text-xs font-semibold transition hover:opacity-80"
                  style={{ background: 'var(--surface-soft)', color: 'var(--brand-600)' }}
                >
                  Ver mais {sorted.length - 3} alertas
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Tab: Painel ───────────────────────────────────────────────────────────────

const PainelTab: React.FC<{
  dashboard: NonNullable<ReturnType<typeof useMarketData>['dashboard']>;
}> = ({ dashboard }) => {
  const growth = Number(dashboard.growthPercentage || 0);
  const topProducts = dashboard.topProducts || [];
  const slowMovers = dashboard.slowMovers || [];

  const weekData = useMemo(() => {
    const days = dashboard.weekdaySeasonality || [];
    const maxRevenue = Math.max(...days.map((d) => Number(d.revenue || 0)), 1);
    return { days, maxRevenue };
  }, [dashboard.weekdaySeasonality]);

  return (
    <div className="flex flex-col gap-5">
      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard label="Faturamento" value={formatMoney(dashboard.totalRevenue)} change={growth} color={ragColor(growth, 0, -5) as any} />
        <KPICard label="Ticket médio" value={formatMoney(dashboard.averageTicket)} color="blue" />
        <KPICard label="Transações" value={formatCompact(dashboard.totalTransactions)} color="purple" />
        <KPICard label="Produtos ativos" value={formatCompact(dashboard.activeProducts)} color={Number(dashboard.activeProducts || 0) > 50 ? 'green' : 'amber'} />
      </div>

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
              <Link to="/app/produtos" className="text-xs font-medium text-red-500 no-underline hover:text-red-600">
                Ver catálogo <ArrowRight className="inline h-3 w-3" />
              </Link>
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
          { to: '/app/produtos',      icon: Sparkles,     title: 'Combos',             sub: 'Produtos que vendem juntos', color: 'bg-violet-50 border-violet-200 text-violet-600' },
          { to: '/app/promocoes',     icon: TrendingUp,   title: 'Promoções',          sub: 'Crie e meça campanhas', color: 'bg-green-50 border-green-200 text-green-600' },
          { to: '/app/mapa-loja',     icon: Map,          title: 'Mapa da loja',       sub: 'Organize para vender mais', color: 'bg-amber-50 border-amber-200 text-amber-600' },
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
  );
};

// ── Tab: Alertas ──────────────────────────────────────────────────────────────

const AlertasTab: React.FC = () => {
  const { alerts, loading, onlyUnread, setOnlyUnread, refresh, markRead, markAllRead } = useAlerts();

  const sorted = useMemo(() => [...alerts].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
  }), [alerts]);

  const unreadCount = alerts.filter((a) => !a.isRead).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOnlyUnread(!onlyUnread)}
          className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
          style={onlyUnread
            ? { border: '1px solid var(--brand-600)', background: 'var(--surface-success)', color: 'var(--brand-700)' }
            : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}
        >
          {onlyUnread ? 'Somente não lidos' : 'Todos'}
        </button>
        <Button variant="secondary" onClick={refresh} disabled={loading}>Atualizar</Button>
        <Button variant="ghost" onClick={markAllRead} disabled={loading || unreadCount === 0}>Marcar todos lidos</Button>
        <span className="ml-auto text-xs" style={{ color: 'var(--text-soft)' }}>{alerts.length} alerta{alerts.length !== 1 ? 's' : ''}</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl py-16" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
          <CheckCircle2 className="h-10 w-10 text-green-400" />
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Todos os produtos em dia. Nenhum alerta pendente.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onMarkRead={markRead} />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Tab switcher ──────────────────────────────────────────────────────────────

type DashTab = 'painel' | 'alertas';

const TabBar: React.FC<{
  active: DashTab;
  onChange: (t: DashTab) => void;
  unreadAlerts: number;
  urgentAlerts: number;
}> = ({ active, onChange, unreadAlerts, urgentAlerts }) => (
  <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'var(--surface-muted)', width: 'fit-content' }}>
    {([
      { key: 'painel',  label: 'Painel do dia', icon: Activity },
      { key: 'alertas', label: 'Alertas',       icon: Bell },
    ] as { key: DashTab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        className="relative inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all"
        style={active === key
          ? { background: 'var(--surface-base)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
          : { color: 'var(--text-soft)' }}
      >
        <Icon className="h-4 w-4" />
        {label}
        {key === 'alertas' && urgentAlerts > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {urgentAlerts}
          </span>
        )}
        {key === 'alertas' && urgentAlerts === 0 && unreadAlerts > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
            {unreadAlerts}
          </span>
        )}
      </button>
    ))}
  </div>
);

// ── Dashboard ─────────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const { name } = useAuth();
  const { dashboard, loading, error } = useMarketData();
  const { alerts } = useAlerts();
  const [tab, setTab] = useState<DashTab>('painel');

  const unreadAlerts = alerts.filter((a) => !a.isRead).length;
  const urgentAlerts = alerts.filter((a) => (a.priority === 'URGENT' || a.priority === 'HIGH') && !a.isRead).length;

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
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {getGreeting()}, {name || 'gestor'}!
            </h1>
            <p className="mt-0.5 text-sm capitalize" style={{ color: 'var(--text-soft)' }}>{getDayOfWeek()}</p>
          </div>
          <TabBar active={tab} onChange={setTab} unreadAlerts={unreadAlerts} urgentAlerts={urgentAlerts} />
        </div>

        {/* Tab content */}
        {tab === 'painel'  && <PainelTab dashboard={dashboard} />}
        {tab === 'alertas' && <AlertasTab />}
      </div>
    </Layout>
  );
};

export default Dashboard;
