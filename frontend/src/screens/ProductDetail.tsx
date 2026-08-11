import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { buildOffersUrl } from '../lib/offersApp';
import { FEATURE_OFFER_TEMPLATES_ENABLED } from '../config/features';
import MetricsCard from '../components/dashboard/MetricsCard';
import ButtonLink from '../components/common/ButtonLink';
import ShoppingListButton from '../components/common/ShoppingListButton';
import SalesChart from '../components/dashboard/SalesChart';
import ProductImage from '../components/product/ProductImage';
import ProductSpecSheet from '../components/product/ProductSpecSheet';
import PageHeader from '../components/layout/PageHeader';
import { Section, DataRow, Stat, Chip, Empty, RailCard, StatGrid } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useShoppingList } from '../hooks/useShoppingList';
import { marketService } from '../services/market.service';
import {
  ProductPdvPerformance,
  ProductDashboard,
  ProductPairInsight,
  ProductPriceEvent,
  ProductPromotionWindow,
  ProductSeasonalPerformance,
  ProductPurchaseSignal,
  SeasonalityPoint,
} from '../types/analytics.types';
import { AlertTriangle, TrendingUp, TrendingDown, Minus, ShoppingCart, Calendar, Zap, Clock } from 'lucide-react';

/* ─── Formatadores ─── */
const fmt = {
  money: (v?: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0)),
  pct: (v?: number | null) => `${Number(v || 0).toFixed(1)}%`,
  signedPct: (v?: number | null) => {
    const n = Number(v || 0);
    return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
  },
  qty: (v?: number | null) => Number(v || 0).toFixed(0),
  date: (v?: string | null) => {
    if (!v) return '--';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '--' : d.toLocaleDateString('pt-BR');
  },
  datetime: (v?: string | null) => {
    if (!v) return '--';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '--' : d.toLocaleString('pt-BR');
  },
};

const compactLabel = (v?: string | null) => {
  if (!v) return 'Sem categoria';
  const s = v.replace(/\s*>\s*/g, ' > ').trim();
  return s.length > 72 ? `${s.slice(0, 69)}...` : s;
};

const triggerLabel = (v?: string | null) =>
  (v || 'Variação de preço')
    .toLowerCase().split('_')
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ');

const promoStatusLabel = (s?: string | null) => {
  switch ((s || '').toUpperCase()) {
    case 'CONFIRMED': return 'Confirmada';
    case 'CLOSED': return 'Encerrada';
    case 'SUSPECTED': return 'Suspeita';
    default: return s || 'Não classificada';
  }
};

/* ─── Barra de progresso inline ─── */
const ProgressBar: React.FC<{ pct: number; color?: string }> = ({ pct, color = 'var(--brand-500)' }) => (
  <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(6, pct)}%`, background: color }} />
  </div>
);

/* ─── Purchase signal banner ─── */
const DECISION_CONFIG: Record<string, { bg: string; border: string; text: string; icon: React.FC<any> }> = {
  BUY:     { bg: 'var(--surface-success)', border: 'var(--border-success)', text: 'var(--brand-700)', icon: ShoppingCart },
  HOLD:    { bg: 'var(--surface-muted)',   border: 'var(--border-soft)',    text: 'var(--text-primary)', icon: Minus },
  REDUCE:  { bg: '#fff7ed',               border: '#fed7aa',               text: '#9a3412', icon: TrendingDown },
  CAUTION: { bg: '#fef2f2',               border: '#fecaca',               text: '#991b1b', icon: AlertTriangle },
};

const PurchaseSignalBanner: React.FC<{ signal: ProductPurchaseSignal }> = ({ signal }) => {
  const cfg = DECISION_CONFIG[signal.decision] ?? DECISION_CONFIG.HOLD;
  const Icon = cfg.icon;

  return (
    <div
      className="flex flex-col gap-4 rounded-xl p-5"
      style={{ border: `1px solid ${cfg.border}`, background: cfg.bg }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: cfg.border }}
        >
          <Icon className="h-5 w-5" style={{ color: cfg.text }} />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-base font-bold" style={{ color: cfg.text }}>{signal.decisionLabel}</p>
          <p className="text-sm" style={{ color: cfg.text, opacity: 0.85 }}>{signal.decisionReason}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 border-t pt-3" style={{ borderColor: cfg.border }}>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: cfg.text, opacity: 0.7 }}>Vendas atuais</p>
          <p className="text-lg font-bold" style={{ color: cfg.text }}>
            {Number(signal.salesVelocity || 0).toFixed(1)}<span className="text-sm font-normal"> un/dia</span>
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: cfg.text, opacity: 0.7 }}>Qtd. sugerida</p>
          <p className="text-lg font-bold" style={{ color: cfg.text }}>
            {fmt.qty(signal.suggestedQuantity)}<span className="text-sm font-normal"> un</span>
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: cfg.text, opacity: 0.7 }}>Cobrir</p>
          <p className="text-lg font-bold" style={{ color: cfg.text }}>
            {fmt.qty(signal.suggestedOrderDays)}<span className="text-sm font-normal"> dias</span>
          </p>
        </div>
      </div>

      {signal.daysWithoutSale > 0 && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
          style={{ background: cfg.border, color: cfg.text }}
        >
          <Clock className="h-4 w-4 shrink-0" />
          {signal.daysWithoutSale >= 30
            ? `Produto sem venda há ${signal.daysWithoutSale} dias — avalie retirada do mix`
            : signal.daysWithoutSale > 0
            ? `Última venda há ${signal.daysWithoutSale} dias`
            : 'Produto com venda recente'}
        </div>
      )}
    </div>
  );
};

/* ─── Seasonal performance card ─── */
const SIGNAL_CONFIG: Record<string, { bg: string; border: string; badge: string; label: string }> = {
  HIGH_SEASON: { bg: 'var(--surface-success)', border: 'var(--border-success)', badge: 'var(--brand-700)', label: 'Alta temporada' },
  LOW_SEASON:  { bg: '#fef2f2',               border: '#fecaca',               badge: '#991b1b',          label: 'Baixa temporada' },
  NEUTRAL:     { bg: 'var(--surface-base)',    border: 'var(--border-soft)',    badge: 'var(--text-soft)', label: 'Normal' },
};

const STATUS_LABEL: Record<string, string> = {
  CURRENT: 'Agora',
  UPCOMING: 'Em breve',
  RECENT: 'Recente',
};

const SeasonalCard: React.FC<{ season: ProductSeasonalPerformance }> = ({ season }) => {
  const cfg = SIGNAL_CONFIG[season.signal] ?? SIGNAL_CONFIG.NEUTRAL;

  return (
    <article
      className="flex min-w-[220px] flex-col gap-3 rounded-xl p-4"
      style={{ border: `1px solid ${cfg.border}`, background: cfg.bg }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{season.title}</p>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold" style={{ background: cfg.border, color: cfg.badge }}>
          {STATUS_LABEL[season.status] ?? season.status}
        </span>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{season.periodLabel}</p>

      <div className="flex items-center gap-2">
        {season.signal === 'HIGH_SEASON' ? (
          <TrendingUp className="h-4 w-4 shrink-0" style={{ color: cfg.badge }} />
        ) : season.signal === 'LOW_SEASON' ? (
          <TrendingDown className="h-4 w-4 shrink-0" style={{ color: cfg.badge }} />
        ) : (
          <Minus className="h-4 w-4 shrink-0" style={{ color: cfg.badge }} />
        )}
        <span className="text-xs font-semibold" style={{ color: cfg.badge }}>{cfg.label}</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {season.indexVsBaseline > 0 ? `${(season.indexVsBaseline * 100).toFixed(0)}% do baseline` : '—'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t pt-2" style={{ borderColor: cfg.border }}>
        <div>
          <p className="text-[0.65rem]" style={{ color: 'var(--text-soft)' }}>Receita</p>
          <strong className="text-sm" style={{ color: 'var(--text-primary)' }}>{fmt.money(season.revenue)}</strong>
        </div>
        <div>
          <p className="text-[0.65rem]" style={{ color: 'var(--text-soft)' }}>Vendas</p>
          <strong className="text-sm" style={{ color: 'var(--text-primary)' }}>{fmt.qty(season.quantity)} un</strong>
        </div>
      </div>

      {season.proximityLabel && (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>{season.proximityLabel}</p>
      )}
    </article>
  );
};

/* ─── Stock projection cards ─── */
const StockProjectionSection: React.FC<{ signal: ProductPurchaseSignal }> = ({ signal }) => {
  if (!signal.projections || signal.projections.length === 0) return null;
  return (
    <Section
      kicker="Projeção de estoque"
      title="Reforce o estoque nestas datas"
      subtitle="Janelas onde o giro esperado é maior — planeje a compra com antecedência."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {signal.projections.map((proj) => (
          <div
            key={proj.key}
            className="flex flex-col gap-2 rounded-xl p-4"
            style={{ border: '1px solid var(--border-success)', background: 'var(--surface-success)' }}
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 shrink-0" style={{ color: 'var(--brand-600)' }} />
              <p className="text-sm font-bold" style={{ color: 'var(--brand-700)' }}>{proj.label}</p>
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-soft)' }}>
              <Zap className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--brand-500)' }} />
              <span>Uplift esperado: <strong style={{ color: 'var(--brand-700)' }}>{proj.upliftFactor.toFixed(1)}×</strong></span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{proj.action}</p>
            <p className="text-xs italic font-medium" style={{ color: 'var(--brand-600)' }}>{proj.daysUntil}</p>
          </div>
        ))}
      </div>
    </Section>
  );
};

/* ─── RailCard: frente de caixa (PDV) ─── */
const PdvCard: React.FC<{ pdv: ProductPdvPerformance; maxRevenue: number }> = ({ pdv, maxRevenue }) => (
  <RailCard
    kicker="PDV"
    title={pdv.pdvName}
    badge={<Chip variant="success">{fmt.pct((pdv.promoRevenueShare || 0) * 100)} promo</Chip>}
    footer={`Preço médio ${fmt.money(pdv.averagePrice)} · Última venda em ${fmt.date(pdv.lastSoldAt)}`}
  >
    <div className="grid grid-cols-2 gap-2">
      <div>
        <p className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>Receita</p>
        <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt.money(pdv.revenue)}</strong>
      </div>
      <div>
        <p className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>Quantidade</p>
        <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt.qty(pdv.quantitySold)}</strong>
      </div>
    </div>
    <ProgressBar pct={(Number(pdv.revenue || 0) / Math.max(maxRevenue, 1)) * 100} />
  </RailCard>
);

/* ─── RailCard: sazonalidade ─── */
const SeasonalityCard: React.FC<{ point: SeasonalityPoint; maxRevenue: number }> = ({ point, maxRevenue }) => (
  <RailCard
    kicker="Janela"
    title={point.label}
    badge={<Chip>{point.transactions} compras</Chip>}
    footer={`Quantidade vendida: ${fmt.qty(point.quantity)}`}
  >
    <div className="grid grid-cols-2 gap-2">
      <div>
        <p className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>Receita</p>
        <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt.money(point.revenue)}</strong>
      </div>
      <div>
        <p className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>Ticket médio</p>
        <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt.money(point.averageTicket)}</strong>
      </div>
    </div>
    <ProgressBar pct={(Number(point.revenue || 0) / Math.max(maxRevenue, 1)) * 100} color="var(--info)" />
  </RailCard>
);

/* ─── RailCard: compra casada ─── */
const PairCard: React.FC<{ pair: ProductPairInsight }> = ({ pair }) => (
  <article
    className="flex min-w-[240px] max-w-[280px] flex-col gap-0 overflow-hidden rounded-xl"
    style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
  >
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-3" style={{ background: 'var(--surface-soft)' }}>
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg p-1" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
        <ProductImage src={pair.antecedentImageUrl} alt={pair.antecedentName || 'Produto'} className="h-full w-full object-contain" />
      </div>
      <span className="text-center text-sm font-bold" style={{ color: 'var(--text-soft)' }}>+</span>
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg p-1" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
        <ProductImage src={pair.consequentImageUrl} alt={pair.consequentName || 'Produto'} className="h-full w-full object-contain" />
      </div>
    </div>
    <div className="flex flex-col gap-2.5 p-3">
      <div className="flex flex-wrap gap-1.5">
        <Chip variant="success">Afinidade {Number(pair.lift || 0).toFixed(2)}</Chip>
        <Chip>{pair.pairCount || 0} cestas</Chip>
      </div>
      <div>
        <p className="text-[0.78rem] font-semibold leading-5" style={{ color: 'var(--text-primary)' }}>{pair.antecedentName || 'Produto principal'}</p>
        <p className="text-[0.75rem] leading-5" style={{ color: 'var(--text-muted)' }}>{pair.consequentName || 'Produto relacionado'}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t pt-2.5" style={{ borderColor: 'var(--border-soft)' }}>
        <div>
          <p className="text-[0.63rem]" style={{ color: 'var(--text-soft)' }}>Confiança</p>
          <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt.pct((pair.confidence || 0) * 100)}</strong>
        </div>
        <div>
          <p className="text-[0.63rem]" style={{ color: 'var(--text-soft)' }}>Suporte</p>
          <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt.pct((pair.support || 0) * 100)}</strong>
        </div>
      </div>
    </div>
  </article>
);

/* ─── Eventos de preço ─── */
const PriceEventList: React.FC<{ events: ProductPriceEvent[] }> = ({ events }) => {
  if (events.length === 0) return <Empty>Sem eventos relevantes de variação de preço no período.</Empty>;
  return (
    <div className="flex flex-col gap-3">
      {events.slice(0, 6).map((ev) => {
        const down = (ev.direction || '').toUpperCase() === 'DOWN';
        return (
          <div key={ev.id} className="flex flex-col gap-3 rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
            <div className="flex items-center gap-2">
              <Chip variant={down ? 'success' : 'danger'}>{down ? 'Queda' : 'Alta'}</Chip>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{triggerLabel(ev.triggerType)}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmt.datetime(ev.eventAt)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Preço anterior', value: fmt.money(ev.oldPrice) },
                { label: 'Novo preço',     value: fmt.money(ev.newPrice) },
                { label: 'Variação',       value: fmt.signedPct(ev.deltaPercent) },
                { label: 'Confiança',      value: fmt.pct(Number(ev.confidenceScore || 0) * 100) },
              ].map((row) => (
                <div key={row.label}>
                  <p className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>{row.label}</p>
                  <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{row.value}</strong>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ─── Janelas de promoção ─── */
const PromoWindowList: React.FC<{ windows: ProductPromotionWindow[] }> = ({ windows }) => {
  if (windows.length === 0) return <Empty>Nenhuma janela promocional detectada no período.</Empty>;
  return (
    <div className="flex flex-col gap-3">
      {windows.slice(0, 4).map((w) => (
        <div key={w.id} className="flex flex-col gap-3 rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
          <div className="flex items-center gap-2">
            <Chip>{promoStatusLabel(w.status)}</Chip>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Janela iniciada em {fmt.date(w.startAt)}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Fim: {fmt.datetime(w.endAt)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Preço base',      value: fmt.money(w.baselinePrice) },
              { label: 'Preço promo',     value: fmt.money(w.promoPrice) },
              { label: 'Desconto',        value: fmt.signedPct(-Math.abs(Number(w.discountPercent || 0))) },
              { label: 'Impacto na receita', value: fmt.signedPct(w.revenueLiftPercent) },
            ].map((row) => (
              <div key={row.label}>
                <p className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>{row.label}</p>
                <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{row.value}</strong>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════ */

const ProductDetail: React.FC = () => {
  const { marketId } = useAuth();
  const { addItem, productIds } = useShoppingList();
  const { productId } = useParams<{ productId: string }>();
  const [dashboard, setDashboard] = useState<ProductDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!marketId || !productId) { setLoading(false); setError('Produto não encontrado'); return; }
      setLoading(true);
      try {
        setDashboard(await marketService.getProductDashboard(marketId, productId));
        setError(null);
      } catch (err: any) {
        setDashboard(null);
        setError(err?.message || 'Erro ao carregar o painel do produto');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [marketId, productId]);

  const overview           = dashboard?.overview;
  const pdvPerformance  = dashboard?.pdvPerformance || [];
  const weekdaySeasonality = dashboard?.weekdaySeasonality || [];
  const relatedPairs       = dashboard?.relatedPairs || [];
  const priceTimeline      = dashboard?.priceTimeline;
  const seasonalPerformance = dashboard?.seasonalPerformance || [];
  const purchaseSignal     = dashboard?.purchaseSignal;

  const priceEvents = useMemo(
    () => [...(dashboard?.priceEvents || [])].sort((a, b) => new Date(b.eventAt || 0).getTime() - new Date(a.eventAt || 0).getTime()),
    [dashboard],
  );
  const promotionWindows = useMemo(
    () => [...(dashboard?.promotionWindows || [])].sort((a, b) => new Date(b.startAt || 0).getTime() - new Date(a.startAt || 0).getTime()),
    [dashboard],
  );

  const bestPdv     = useMemo(() => pdvPerformance[0], [pdvPerformance]);
  const bestWeekday    = useMemo(() => [...weekdaySeasonality].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0], [weekdaySeasonality]);
  const weakestWeekday = useMemo(() => [...weekdaySeasonality].filter((r) => Number(r.revenue || 0) > 0).sort((a, b) => Number(a.revenue || 0) - Number(b.revenue || 0))[0], [weekdaySeasonality]);
  const strongestPair  = useMemo(() => [...relatedPairs].sort((a, b) => Number(b.lift || 0) - Number(a.lift || 0))[0], [relatedPairs]);
  const highSeasonNow  = useMemo(() => seasonalPerformance.find(s => s.status === 'CURRENT' && s.signal === 'HIGH_SEASON'), [seasonalPerformance]);

  const addCurrentProductToList = async () => {
    if (!overview) return;
    await addItem({ productId: overview.productId, quantityTarget: Math.max(1, Math.round(Number(overview.salesVelocity || 0) || 1)), sourceTag: 'PRODUTO', reasonSummary: `Adicionar ${overview.name} à lista.` });
  };

  const firstPrice = Number(priceTimeline?.firstObservedPrice || 0);
  const lastPrice  = Number(priceTimeline?.lastObservedPrice || 0);
  const deltaPrice = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const maxPdvRev      = Math.max(...pdvPerformance.map((r) => Number(r.revenue || 0)), 1);
  const maxSeasonalityRev = Math.max(...weekdaySeasonality.map((r) => Number(r.revenue || 0)), 1);

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[300px] items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
          Carregando painel do produto...
        </div>
      </Layout>
    );
  }

  if (error || !dashboard || !overview) {
    return (
      <Layout>
        <Empty>{error || 'Painel do produto indisponível.'}</Empty>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">

        {/* ── Hero: imagem + dados principais ── */}
        <div className="grid gap-6 lg:grid-cols-[200px_1fr] lg:items-start">
          <div className="flex items-center justify-center overflow-hidden rounded-xl p-4 lg:aspect-square" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
            <ProductImage src={overview.imageUrl} alt={overview.name} className="max-h-full max-w-full object-contain" />
          </div>

          <div className="flex flex-col gap-4">
            <PageHeader
              title={overview.name}
              subtitle="Painel de desempenho — receita, sazonalidade, datas comemorativas e sinal de compra."
              actions={
                <>
                  <ButtonLink variant="secondary" to="/app/produtos">← Produtos</ButtonLink>
                  {FEATURE_OFFER_TEMPLATES_ENABLED
                    ? <ButtonLink variant="secondary" to={buildOffersUrl('/ofertas', 'admin', `productId=${overview.productId}`)}>Criar oferta</ButtonLink>
                    : null}
                  <ButtonLink variant="secondary" to="/app/alertas">Alertas</ButtonLink>
                  <ShoppingListButton inList={productIds.has(overview.productId)} onAdd={addCurrentProductToList} stopPropagation={false} />
                </>
              }
            />

            <div className="flex flex-wrap gap-2">
              <Chip>{compactLabel(overview.category)}</Chip>
              <Chip>GTIN {overview.ean || '--'}</Chip>
              <Chip>Última venda {fmt.date(overview.lastSoldAt)}</Chip>
              {highSeasonNow && (
                <Chip variant="success">Alta temporada: {highSeasonNow.title}</Chip>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <DataRow label="Receita no período" value={fmt.money(overview.revenue)} />
              <DataRow label="Vendas/dia"            value={`${Number(overview.salesVelocity || 0).toFixed(1)}/dia`} />
              <DataRow label="Participação em promo" value={fmt.pct((overview.promoRevenueShare || 0) * 100)} />
            </div>
          </div>
        </div>

        {/* ── Sinal de compra inteligente ── */}
        {purchaseSignal && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Decisão de compra
            </p>
            <PurchaseSignalBanner signal={purchaseSignal} />
          </div>
        )}

        {/* ── KPIs ── */}
        <StatGrid cols={4}>
          <MetricsCard title="Receita"         value={fmt.money(overview.revenue)}       icon="R$" />
          <MetricsCard title="Preço médio"     value={fmt.money(overview.averagePrice)}  icon="PM" />
          <MetricsCard title="Transações"      value={fmt.qty(overview.transactionCount)} icon="NF" />
          <MetricsCard title="Índice de preço" value={`${Number(overview.priceIndex || 0).toFixed(2)}x`} icon="PX" />
        </StatGrid>

        {/* ── Insights rápidos ── */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Melhor dia"    value={bestWeekday?.label || '--'}     sub={bestWeekday ? fmt.money(bestWeekday.revenue) : 'Sem dados'} variant="success" />
          <Stat label="Dia mais fraco" value={weakestWeekday?.label || '--'} sub={weakestWeekday ? fmt.money(weakestWeekday.revenue) : 'Sem comparação'} />
          <Stat label="PDV mais forte" value={bestPdv?.pdvName || '--'} sub={bestPdv ? `${fmt.qty(bestPdv.quantitySold)} unidades` : 'Sem PDV dominante'} />
          <Stat label="Compra casada"  value={strongestPair ? `Afinidade ${Number(strongestPair.lift || 0).toFixed(2)}` : '--'} sub={strongestPair ? `${strongestPair.antecedentName} + ${strongestPair.consequentName}` : 'Sem associação forte'} />
        </div>

        {/* ── Gráfico de vendas + Decisões ── */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <SalesChart
            data={(dashboard.salesTrend || []).map((p) => ({ date: p.date, revenue: Number(p.revenue || 0) }))}
            kicker="Desempenho do produto"
            title="Curva diária de faturamento"
            panelCopy="A linha mostra o ritmo real de venda deste item ao longo do período."
            calloutLabel="Último faturamento diário"
          />

          <Section kicker="Leitura rápida" title="O que decidir agora" subtitle="Compra, preço, promoção e mix em um bloco.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="Compra"    value={`${Number(overview.salesVelocity || 0).toFixed(1)}/dia`}     sub={Number(overview.salesVelocity || 0) >= 1 ? 'Mantenha reposição curta.' : 'Compre com cautela.'} />
              <Stat label="Preço"     value={fmt.signedPct(deltaPrice)}         sub="Variação no período" variant={deltaPrice > 5 ? 'danger' : deltaPrice < -5 ? 'success' : 'default'} />
              <Stat label="Promoção"  value={fmt.pct((overview.promoRevenueShare || 0) * 100)} sub="Participação em ação promo" />
              <Stat label="Mix"       value={strongestPair ? Number(strongestPair.lift || 0).toFixed(2) : '--'} sub={strongestPair ? 'Sinal de venda casada.' : 'Sem venda casada forte.'} />
            </div>
          </Section>
        </div>

        {/* ── Ficha técnica do catálogo enriquecido ── */}
        <ProductSpecSheet sheet={dashboard.specSheet} />

        {/* ── Datas comemorativas e sazonalidade ── */}
        <Section
          kicker="Datas comemorativas"
          title="Alta e baixa por época do ano"
          subtitle="Janelas onde este produto vende acima ou abaixo do ritmo normal — planeje compras e promoções com antecedência."
        >
          {seasonalPerformance.length === 0 ? (
            <Empty>Dados insuficientes para calcular desempenho sazonal. Continue registrando vendas.</Empty>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {seasonalPerformance.map((s) => (
                <SeasonalCard key={s.key} season={s} />
              ))}
            </div>
          )}
        </Section>

        {/* ── Projeções de estoque (se houver) ── */}
        {purchaseSignal && purchaseSignal.projections.length > 0 && (
          <StockProjectionSection signal={purchaseSignal} />
        )}

        {/* ── Desempenho por caixa (PDV) ── */}
        <Section kicker="Por caixa (PDV)" title="Em quais caixas este item vende melhor" subtitle="A leitura é por frente de caixa desta loja — útil para abastecimento e posicionamento no PDV.">
          {pdvPerformance.length === 0
            ? <Empty>Sem distribuição por PDV neste período.</Empty>
            : (
              <div className="flex gap-4 overflow-x-auto pb-4">
                {pdvPerformance.map((b) => (
                  <PdvCard key={b.pdvId || b.pdvName} pdv={b} maxRevenue={maxPdvRev} />
                ))}
              </div>
            )}
        </Section>

        {/* ── Sazonalidade por dia da semana ── */}
        <Section kicker="Sazonalidade semanal" title="Quando este item ganha ou perde tração" subtitle="Os dias mais fortes e fracos indicam quando reforçar compra ou revisar espaço.">
          {weekdaySeasonality.length === 0
            ? <Empty>Sem sazonalidade suficiente neste período.</Empty>
            : (
              <div className="flex gap-4 overflow-x-auto pb-4">
                {weekdaySeasonality.map((p) => (
                  <SeasonalityCard key={p.key} point={p} maxRevenue={maxSeasonalityRev} />
                ))}
              </div>
            )}
        </Section>

        {/* ── Gráfico de preço + Resumo de preço ── */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <SalesChart
            data={(priceTimeline?.points || []).map((p) => ({ date: p.date, revenue: Number(p.weightedAveragePrice || 0) }))}
            kicker="Inteligência de preço"
            title="Linha do tempo de preço"
            panelCopy="Evolução do preço médio ponderado — alta, queda e janelas promocionais."
            calloutLabel="Último preço observado"
            formatter={fmt.money}
          />

          <Section kicker="Resumo de preço" title="Como o item está posicionado" subtitle="Baseline, preço atual e intensidade promocional.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="Preço base"    value={fmt.money(overview.baselinePrice)}                        sub="Referência média sem promoção" />
              <Stat label="Preço atual"   value={fmt.money(lastPrice || overview.averagePrice)}            sub="Último valor observado" />
              <Stat label="Janelas promo" value={priceTimeline?.detectedPromotionWindows || 0}             sub="Períodos com promoção" />
              <Stat label="Maior queda"   value={fmt.signedPct(priceTimeline?.maxDecreasePercent)}         sub="Melhor redução no período" variant="success" />
            </div>
          </Section>
        </div>

        {/* ── Eventos de preço + Promoções ── */}
        <div className="grid gap-5 xl:grid-cols-2">
          <Section kicker="Eventos de preço" title="Movimentos relevantes de alta e queda">
            <PriceEventList events={priceEvents} />
          </Section>

          <Section kicker="Promoções" title="Janelas que impactaram este item">
            <PromoWindowList windows={promotionWindows} />
          </Section>
        </div>

        {/* ── Compra casada ── */}
        <Section kicker="Compra casada" title="Itens que ajudam este produto a vender mais" subtitle="Use estas relações para decidir proximidade na gôndola, combo e promoção cruzada.">
          {relatedPairs.length === 0
            ? <Empty>Nenhuma associação forte encontrada para este item.</Empty>
            : (
              <div className="flex gap-4 overflow-x-auto pb-4">
                {relatedPairs.map((pair) => (
                  <PairCard key={`${pair.antecedentId || 'a'}-${pair.consequentId || 'b'}`} pair={pair} />
                ))}
              </div>
            )}
        </Section>

      </div>
    </Layout>
  );
};

export default ProductDetail;
