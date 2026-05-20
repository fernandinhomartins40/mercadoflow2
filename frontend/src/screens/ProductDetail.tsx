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
import PageHeader from '../components/layout/PageHeader';
import { Section, DataRow, Stat, Chip, Empty, RailCard, StatGrid } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useShoppingList } from '../hooks/useShoppingList';
import { marketService } from '../services/market.service';
import {
  ProductBranchPerformance,
  ProductDashboard,
  ProductPairInsight,
  ProductPriceEvent,
  ProductPromotionWindow,
  SeasonalityPoint,
} from '../types/analytics.types';

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

/* ─── RailCard: filial ─── */
const BranchCard: React.FC<{ branch: ProductBranchPerformance; maxRevenue: number }> = ({ branch, maxRevenue }) => (
  <RailCard
    kicker="PDV"
    title={branch.branchName}
    badge={<Chip variant="success">{fmt.pct((branch.promoRevenueShare || 0) * 100)} promo</Chip>}
    footer={`Preço médio ${fmt.money(branch.averagePrice)} · Última venda em ${fmt.date(branch.lastSoldAt)}`}
  >
    <div className="grid grid-cols-2 gap-2">
      <div>
        <p className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>Receita</p>
        <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt.money(branch.revenue)}</strong>
      </div>
      <div>
        <p className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>Quantidade</p>
        <strong className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt.qty(branch.quantitySold)}</strong>
      </div>
    </div>
    <ProgressBar pct={(Number(branch.revenue || 0) / Math.max(maxRevenue, 1)) * 100} />
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
    {/* imagens do par */}
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-3" style={{ background: 'var(--surface-soft)' }}>
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg p-1" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
        <ProductImage src={pair.antecedentImageUrl} alt={pair.antecedentName || 'Produto'} className="h-full w-full object-contain" />
      </div>
      <span className="text-center text-sm font-bold" style={{ color: 'var(--text-soft)' }}>+</span>
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg p-1" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
        <ProductImage src={pair.consequentImageUrl} alt={pair.consequentName || 'Produto'} className="h-full w-full object-contain" />
      </div>
    </div>
    {/* dados */}
    <div className="flex flex-col gap-2.5 p-3">
      <div className="flex flex-wrap gap-1.5">
        <Chip variant="success">Lift {Number(pair.lift || 0).toFixed(2)}</Chip>
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
              { label: 'Preço base',     value: fmt.money(w.baselinePrice) },
              { label: 'Preço promo',    value: fmt.money(w.promoPrice) },
              { label: 'Desconto',       value: fmt.signedPct(-Math.abs(Number(w.discountPercent || 0))) },
              { label: 'Lift de receita', value: fmt.signedPct(w.revenueLiftPercent) },
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
  const branchPerformance  = dashboard?.branchPerformance || [];
  const weekdaySeasonality = dashboard?.weekdaySeasonality || [];
  const relatedPairs       = dashboard?.relatedPairs || [];
  const priceTimeline      = dashboard?.priceTimeline;

  const priceEvents = useMemo(
    () => [...(dashboard?.priceEvents || [])].sort((a, b) => new Date(b.eventAt || 0).getTime() - new Date(a.eventAt || 0).getTime()),
    [dashboard],
  );
  const promotionWindows = useMemo(
    () => [...(dashboard?.promotionWindows || [])].sort((a, b) => new Date(b.startAt || 0).getTime() - new Date(a.startAt || 0).getTime()),
    [dashboard],
  );

  const bestBranch     = useMemo(() => branchPerformance[0], [branchPerformance]);
  const bestWeekday    = useMemo(() => [...weekdaySeasonality].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0], [weekdaySeasonality]);
  const weakestWeekday = useMemo(() => [...weekdaySeasonality].filter((r) => Number(r.revenue || 0) > 0).sort((a, b) => Number(a.revenue || 0) - Number(b.revenue || 0))[0], [weekdaySeasonality]);
  const strongestPair  = useMemo(() => [...relatedPairs].sort((a, b) => Number(b.lift || 0) - Number(a.lift || 0))[0], [relatedPairs]);

  const addCurrentProductToList = async () => {
    if (!overview) return;
    await addItem({ productId: overview.productId, quantityTarget: Math.max(1, Math.round(Number(overview.salesVelocity || 0) || 1)), sourceTag: 'PRODUTO', reasonSummary: `Adicionar ${overview.name} à lista.` });
  };

  const firstPrice = Number(priceTimeline?.firstObservedPrice || 0);
  const lastPrice  = Number(priceTimeline?.lastObservedPrice || 0);
  const deltaPrice = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const maxBranchRev      = Math.max(...branchPerformance.map((r) => Number(r.revenue || 0)), 1);
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
          {/* imagem */}
          <div className="flex items-center justify-center overflow-hidden rounded-xl p-4 lg:aspect-square" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
            <ProductImage src={overview.imageUrl} alt={overview.name} className="max-h-full max-w-full object-contain" />
          </div>

          {/* copy */}
          <div className="flex flex-col gap-4">
            <PageHeader
              title={overview.name}
              subtitle="Painel de desempenho — receita, preço, sazonalidade e compra casada."
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

            {/* chips de metadado */}
            <div className="flex flex-wrap gap-2">
              <Chip>{compactLabel(overview.category)}</Chip>
              <Chip>GTIN {overview.ean || '--'}</Chip>
              <Chip>Última venda {fmt.date(overview.lastSoldAt)}</Chip>
            </div>

            {/* resumo rápido inline */}
            <div className="grid gap-2 sm:grid-cols-3">
              <DataRow label="Receita no período" value={fmt.money(overview.revenue)} />
              <DataRow label="Giro diário"         value={`${Number(overview.salesVelocity || 0).toFixed(1)}/dia`} />
              <DataRow label="Promo share"          value={fmt.pct((overview.promoRevenueShare || 0) * 100)} />
            </div>
          </div>
        </div>

        {/* ── KPIs ── */}
        <StatGrid cols={4}>
          <MetricsCard title="Receita"         value={fmt.money(overview.revenue)}       icon="R$" />
          <MetricsCard title="Preço médio"     value={fmt.money(overview.averagePrice)}  icon="PM" />
          <MetricsCard title="Transações"      value={fmt.qty(overview.transactionCount)} icon="NF" />
          <MetricsCard title="Índice de preço" value={`${Number(overview.priceIndex || 0).toFixed(2)}x`} icon="PX" />
        </StatGrid>

        {/* ── Insights rápidos ── */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Melhor dia"   value={bestWeekday?.label || '--'}    sub={bestWeekday ? fmt.money(bestWeekday.revenue) : 'Sem dados'} variant="success" />
          <Stat label="Dia mais fraco" value={weakestWeekday?.label || '--'} sub={weakestWeekday ? fmt.money(weakestWeekday.revenue) : 'Sem comparação'} />
          <Stat label="PDV mais forte" value={bestBranch?.branchName || '--'} sub={bestBranch ? `${fmt.qty(bestBranch.quantitySold)} unidades` : 'Sem PDV dominante'} />
          <Stat label="Compra casada"  value={strongestPair ? `Lift ${Number(strongestPair.lift || 0).toFixed(2)}` : '--'} sub={strongestPair ? `${strongestPair.antecedentName} + ${strongestPair.consequentName}` : 'Sem associação forte'} />
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

        {/* ── Filiais e PDVs ── */}
        <Section kicker="Filiais e PDVs" title="Onde este item vende melhor" subtitle="Priorize abastecimento e negociação nas unidades com melhor retorno.">
          {branchPerformance.length === 0
            ? <Empty>Sem distribuição por PDV neste período.</Empty>
            : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {branchPerformance.map((b) => (
                  <BranchCard key={b.branchId || b.branchName} branch={b} maxRevenue={maxBranchRev} />
                ))}
              </div>
            )}
        </Section>

        {/* ── Sazonalidade ── */}
        <Section kicker="Sazonalidade" title="Quando este item ganha ou perde tração" subtitle="Os dias mais fortes e fracos indicam quando reforçar compra ou revisar espaço.">
          {weekdaySeasonality.length === 0
            ? <Empty>Sem sazonalidade suficiente neste período.</Empty>
            : (
              <div className="flex gap-4 overflow-x-auto pb-2">
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
              <div className="flex gap-4 overflow-x-auto pb-2">
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
