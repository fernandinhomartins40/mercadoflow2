import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import MetricsCard from '../components/dashboard/MetricsCard';
import ButtonLink from '../components/common/ButtonLink';
import ShoppingListButton from '../components/common/ShoppingListButton';
import SalesChart from '../components/dashboard/SalesChart';
import ProductImage from '../components/product/ProductImage';
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

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(1)}%`;

const formatSignedPercent = (value?: number | null) => {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toFixed(1)}%`;
};

const formatQuantity = (value?: number | null) => Number(value || 0).toFixed(0);

const formatDate = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleDateString('pt-BR');
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('pt-BR');
};

const formatTriggerType = (value?: string | null) => {
  if (!value) return 'VariaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o de preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o';
  return value
    .toLowerCase()
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
};

const mapPromotionStatus = (status?: string | null) => {
  switch ((status || '').toUpperCase()) {
    case 'CONFIRMED':
      return 'Confirmada';
    case 'CLOSED':
      return 'Encerrada';
    case 'SUSPECTED':
      return 'Suspeita';
    default:
      return status || 'NÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o classificada';
  }
};

const compactLabel = (value?: string | null) => {
  if (!value) return 'Sem categoria';
  const normalized = value.replace(/\s*>\s*/g, ' > ').trim();
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
};

const BranchRailCard: React.FC<{ branch: ProductBranchPerformance; maxRevenue: number }> = ({ branch, maxRevenue }) => (
  <article className="product-detail-rail-card">
    <div className="product-detail-rail-head">
      <div>
        <span className="section-kicker">PDV</span>
        <h3>{branch.branchName}</h3>
      </div>
      <span className="sales-pill positive">{formatPercent((branch.promoRevenueShare || 0) * 100)} promo</span>
    </div>

    <div className="sales-product-stats compact">
      <div>
        <span>Receita</span>
        <strong>{formatMoney(branch.revenue)}</strong>
      </div>
      <div>
        <span>Quantidade</span>
        <strong>{formatQuantity(branch.quantitySold)}</strong>
      </div>
    </div>

    <div className="progress-track">
      <div
        className="progress-fill solid-pink"
        style={{ width: `${Math.max(16, (Number(branch.revenue || 0) / Math.max(maxRevenue, 1)) * 100)}%` }}
      />
    </div>

    <div className="sales-card-foot">
      PreÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©dio {formatMoney(branch.averagePrice)} ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ ÃƒÆ’Ã†â€™Ãƒâ€¦Ã‚Â¡ltima venda em {formatDate(branch.lastSoldAt)}
    </div>
  </article>
);

const SeasonalityRailCard: React.FC<{ point: SeasonalityPoint; maxRevenue: number }> = ({ point, maxRevenue }) => (
  <article className="product-detail-rail-card seasonality">
    <div className="product-detail-rail-head">
      <div>
        <span className="section-kicker">Janela</span>
        <h3>{point.label}</h3>
      </div>
      <span className="sales-pill soft">{point.transactions} compras</span>
    </div>

    <div className="sales-product-stats compact">
      <div>
        <span>Receita</span>
        <strong>{formatMoney(point.revenue)}</strong>
      </div>
      <div>
        <span>Ticket mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©dio</span>
        <strong>{formatMoney(point.averageTicket)}</strong>
      </div>
    </div>

    <div className="progress-track">
      <div
        className="progress-fill solid-blue"
        style={{ width: `${Math.max(14, (Number(point.revenue || 0) / Math.max(maxRevenue, 1)) * 100)}%` }}
      />
    </div>

    <div className="sales-card-foot">Quantidade vendida: {formatQuantity(point.quantity)}</div>
  </article>
);

const PairRailCard: React.FC<{ pair: ProductPairInsight }> = ({ pair }) => (
  <article className="sales-pair-card">
    <div className="sales-pair-media">
      <div className="sales-pair-media-item">
        <ProductImage src={pair.antecedentImageUrl} alt={pair.antecedentName || 'Produto'} className="sales-pair-image" />
      </div>
      <div className="sales-pair-connector">+</div>
      <div className="sales-pair-media-item">
        <ProductImage src={pair.consequentImageUrl} alt={pair.consequentName || 'Produto'} className="sales-pair-image" />
      </div>
    </div>
    <div className="sales-pair-body">
      <div className="sales-product-badges">
        <span className="sales-pill positive">Lift {Number(pair.lift || 0).toFixed(2)}</span>
        <span className="sales-pill soft">{pair.pairCount || 0} cestas</span>
      </div>
      <h3>{pair.antecedentName || 'Produto principal'}</h3>
      <p>{pair.consequentName || 'Produto relacionado'}</p>
      <div className="sales-product-stats compact pair">
        <div>
          <span>ConfianÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§a</span>
          <strong>{formatPercent((pair.confidence || 0) * 100)}</strong>
        </div>
        <div>
          <span>Suporte</span>
          <strong>{formatPercent((pair.support || 0) * 100)}</strong>
        </div>
      </div>
    </div>
  </article>
);

const ProductDetail: React.FC = () => {
  const { marketId } = useAuth();
  const { addItem, productIds } = useShoppingList();
  const { productId } = useParams<{ productId: string }>();
  const [dashboard, setDashboard] = useState<ProductDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!marketId || !productId) {
        setLoading(false);
        setError('Produto nÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o encontrado');
        return;
      }

      setLoading(true);
      try {
        const data = await marketService.getProductDashboard(marketId, productId);
        setDashboard(data);
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

  const overview = dashboard?.overview;
  const branchPerformance = dashboard?.branchPerformance || [];
  const weekdaySeasonality = dashboard?.weekdaySeasonality || [];
  const relatedPairs = dashboard?.relatedPairs || [];
  const priceTimeline = dashboard?.priceTimeline;
  const priceEvents = useMemo(
    () => [...(dashboard?.priceEvents || [])].sort((a, b) => new Date(b.eventAt || 0).getTime() - new Date(a.eventAt || 0).getTime()),
    [dashboard]
  );
  const promotionWindows = useMemo(
    () => [...(dashboard?.promotionWindows || [])].sort((a, b) => new Date(b.startAt || 0).getTime() - new Date(a.startAt || 0).getTime()),
    [dashboard]
  );

  const bestBranch = useMemo(() => branchPerformance[0], [branchPerformance]);
  const bestWeekday = useMemo(
    () => [...weekdaySeasonality].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0],
    [weekdaySeasonality]
  );
  const weakestWeekday = useMemo(
    () => [...weekdaySeasonality].filter((row) => Number(row.revenue || 0) > 0).sort((a, b) => Number(a.revenue || 0) - Number(b.revenue || 0))[0],
    [weekdaySeasonality]
  );
  const strongestPair = useMemo(
    () => [...relatedPairs].sort((a, b) => Number(b.lift || 0) - Number(a.lift || 0))[0],
    [relatedPairs]
  );

  const addCurrentProductToList = async () => {
    if (!overview) return;
    await addItem({
      productId: overview.productId,
      quantityTarget: Math.max(1, Math.round(Number(overview.salesVelocity || 0) || 1)),
      sourceTag: 'PRODUTO',
      reasonSummary: `Adicionar ${overview.name} ÃƒÆ’Ã‚Â  lista a partir do painel do produto.`,
    });
  };

  const firstObservedPrice = Number(priceTimeline?.firstObservedPrice || 0);
  const lastObservedPrice = Number(priceTimeline?.lastObservedPrice || 0);
  const timelineDeltaPercent = firstObservedPrice > 0 ? ((lastObservedPrice - firstObservedPrice) / firstObservedPrice) * 100 : 0;
  const maxBranchRevenue = Math.max(...branchPerformance.map((row) => Number(row.revenue || 0)), 1);
  const maxSeasonalityRevenue = Math.max(...weekdaySeasonality.map((row) => Number(row.revenue || 0)), 1);

  const renderPriceEvents = (rows: ProductPriceEvent[]) => {
    if (rows.length === 0) {
      return <div className="panel-empty">Sem eventos relevantes de variaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o de preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o no perÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­odo.</div>;
    }

    return (
      <div className="price-event-list">
        {rows.slice(0, 6).map((event) => {
          const isDown = (event.direction || '').toUpperCase() === 'DOWN';
          return (
            <article key={event.id} className="price-event-item">
              <div>
                <span className={`status-pill ${isDown ? 'positive' : 'negative'}`}>{isDown ? 'Queda' : 'Alta'}</span>
                <h4>{formatTriggerType(event.triggerType)}</h4>
                <p>{formatDateTime(event.eventAt)}</p>
              </div>

              <div className="price-event-metrics">
                <div>
                  <span>PreÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o anterior</span>
                  <strong>{formatMoney(event.oldPrice)}</strong>
                </div>
                <div>
                  <span>Novo preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o</span>
                  <strong>{formatMoney(event.newPrice)}</strong>
                </div>
                <div>
                  <span>VariaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o</span>
                  <strong>{formatSignedPercent(event.deltaPercent)}</strong>
                </div>
                <div>
                  <span>ConfianÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§a</span>
                  <strong>{formatPercent(Number(event.confidenceScore || 0) * 100)}</strong>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const renderPromotionWindows = (rows: ProductPromotionWindow[]) => {
    if (rows.length === 0) {
      return <div className="panel-empty">Nenhuma janela promocional detectada no perÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­odo.</div>;
    }

    return (
      <div className="price-event-list">
        {rows.slice(0, 4).map((window) => (
          <article key={window.id} className="price-event-item promotion-window-item">
            <div>
              <span className="status-pill neutral">{mapPromotionStatus(window.status)}</span>
              <h4>Janela iniciada em {formatDate(window.startAt)}</h4>
              <p>Fim: {formatDateTime(window.endAt)}</p>
            </div>

            <div className="price-event-metrics">
              <div>
                <span>PreÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o base</span>
                <strong>{formatMoney(window.baselinePrice)}</strong>
              </div>
              <div>
                <span>PreÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o promo</span>
                <strong>{formatMoney(window.promoPrice)}</strong>
              </div>
              <div>
                <span>Desconto</span>
                <strong>{formatSignedPercent(-Math.abs(Number(window.discountPercent || 0)))}</strong>
              </div>
              <div>
                <span>Lift de receita</span>
                <strong>{formatSignedPercent(window.revenueLiftPercent)}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <Layout>
        <div className="page analytics-page product-detail-dashboard">
          <div className="sales-empty-card">Carregando painel do produto...</div>
        </div>
      </Layout>
    );
  }

  if (error || !dashboard || !overview) {
    return (
      <Layout>
        <div className="page analytics-page product-detail-dashboard">
          <div className="sales-empty-card">{error || 'Painel do produto indisponÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­vel.'}</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page analytics-page product-detail-dashboard">
        <section className="sales-hero reveal product-detail-hero">
          <article className="sales-hero-product product-detail-hero-product">
            <div className="sales-hero-media-wrap product-detail-media-wrap">
              <ProductImage src={overview.imageUrl} alt={overview.name} className="sales-hero-media product-detail-main-image" />
            </div>

            <div className="sales-hero-copy">
              <span className="pill">Produto em foco</span>
              <h1>{overview.name}</h1>
              <p>
                Este painel mostra se vale comprar mais, expor melhor, usar promoÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o ou aproximar este item de outros
                produtos para aumentar faturamento com base nas vendas reais.
              </p>

              <div className="hero-chip-row">
                <span className="hero-chip">{compactLabel(overview.category)}</span>
                <span className="hero-chip">GTIN {overview.ean || '--'}</span>
                <span className="hero-chip">ÃƒÆ’Ã†â€™Ãƒâ€¦Ã‚Â¡ltima venda em {formatDate(overview.lastSoldAt)}</span>
              </div>

              <div className="sales-hero-featured-card">
                <div>
                  <span className="section-kicker">Resumo do item</span>
                  <h2>{formatMoney(overview.revenue)} no perÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­odo</h2>
                </div>

                <div className="sales-hero-featured-metrics">
                  <div>
                    <span>Quantidade</span>
                    <strong>{formatQuantity(overview.quantitySold)}</strong>
                  </div>
                  <div>
                    <span>Giro</span>
                    <strong>{Number(overview.salesVelocity || 0).toFixed(1)}/dia</strong>
                  </div>
                  <div>
                    <span>Promo share</span>
                    <strong>{formatPercent((overview.promoRevenueShare || 0) * 100)}</strong>
                  </div>
                </div>
              </div>

              <div className="hero-inline-actions product-detail-actions">
                <ButtonLink variant="secondary" to="/app/produtos">Voltar para produtos</ButtonLink>
                <ButtonLink variant="secondary" to={`/app/ofertas/designer?productId=${overview.productId}`}>Criar oferta</ButtonLink>
                <ButtonLink variant="secondary" to="/app/alertas">Abrir alertas</ButtonLink>
                <ShoppingListButton
                  inList={overview ? productIds.has(overview.productId) : false}
                  onAdd={addCurrentProductToList}
                  stopPropagation={false}
                />
              </div>
            </div>
          </article>

          <aside className="sales-hero-side product-detail-hero-side">
            <div className="sales-insight-grid product-detail-insight-grid">
              <article className="sales-insight-card product-detail-insight-card">
                <span>Melhor dia</span>
                <strong>{bestWeekday?.label || '--'}</strong>
                <small>{bestWeekday ? formatMoney(bestWeekday.revenue) : 'Sem sazonalidade suficiente'}</small>
              </article>
              <article className="sales-insight-card product-detail-insight-card">
                <span>Dia mais fraco</span>
                <strong>{weakestWeekday?.label || '--'}</strong>
                <small>{weakestWeekday ? formatMoney(weakestWeekday.revenue) : 'Sem comparaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o suficiente'}</small>
              </article>
              <article className="sales-insight-card product-detail-insight-card">
                <span>PDV mais forte</span>
                <strong>{bestBranch?.branchName || '--'}</strong>
                <small>{bestBranch ? `${formatQuantity(bestBranch.quantitySold)} unidades` : 'Sem PDV dominante'}</small>
              </article>
              <article className="sales-insight-card product-detail-insight-card">
                <span>Compra casada</span>
                <strong>{strongestPair ? `Lift ${Number(strongestPair.lift || 0).toFixed(2)}` : '--'}</strong>
                <small>{strongestPair ? `${strongestPair.antecedentName} + ${strongestPair.consequentName}` : 'Sem associaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o forte'}</small>
              </article>
            </div>
          </aside>
        </section>

        <div className="metrics-grid analytics-metrics-grid sales-metric-strip">
          <MetricsCard title="Receita" value={formatMoney(overview.revenue)} icon="R$" />
          <MetricsCard title="PreÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©dio" value={formatMoney(overview.averagePrice)} icon="PM" />
          <MetricsCard title="TransaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âµes" value={formatQuantity(overview.transactionCount)} icon="NF" />
          <MetricsCard title="ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Ândice de preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o" value={`${Number(overview.priceIndex || 0).toFixed(2)}x`} icon="PX" />
        </div>

        <div className="analytics-grid analytics-grid-main product-detail-overview-grid">
          <SalesChart
            data={(dashboard.salesTrend || []).map((point) => ({ date: point.date, revenue: Number(point.revenue || 0) }))}
            kicker="Desempenho do produto"
            title="Curva diÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ria de faturamento"
            panelCopy="A linha mostra o ritmo real de venda deste item ao longo do perÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­odo."
            calloutLabel="ÃƒÆ’Ã†â€™Ãƒâ€¦Ã‚Â¡ltimo faturamento diÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡rio"
          />

          <section className="sales-section reveal product-detail-summary-section">
            <div className="sales-section-head">
              <div>
                <span className="section-kicker">Leitura rÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡pida</span>
                <h2>O que decidir agora</h2>
              </div>
              <p>Uma leitura direta para compra, exposiÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o e preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o sem depender de texto longo.</p>
            </div>

            <div className="product-detail-summary-grid">
              <article className="product-detail-summary-card">
                <span className="section-kicker">Compra</span>
                <strong>{Number(overview.salesVelocity || 0).toFixed(1)}/dia</strong>
                <p>{Number(overview.salesVelocity || 0) >= 1 ? 'Mantenha reposiÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o mais curta para nÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o perder venda.' : 'Pode comprar com mais cautela.'}</p>
              </article>
              <article className="product-detail-summary-card">
                <span className="section-kicker">PreÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o</span>
                <strong>{formatSignedPercent(timelineDeltaPercent)}</strong>
                <p>VariaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o do preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o atual contra o primeiro preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o observado no perÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­odo.</p>
              </article>
              <article className="product-detail-summary-card">
                <span className="section-kicker">PromoÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o</span>
                <strong>{formatPercent((overview.promoRevenueShare || 0) * 100)}</strong>
                <p>ParticipaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o de receita quando este item estava em aÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o promocional.</p>
              </article>
              <article className="product-detail-summary-card">
                <span className="section-kicker">Mix</span>
                <strong>{strongestPair ? Number(strongestPair.lift || 0).toFixed(2) : '--'}</strong>
                <p>{strongestPair ? 'HÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ sinal de venda casada relevante para exposiÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o conjunta.' : 'Ainda sem compra casada forte o suficiente.'}</p>
              </article>
            </div>
          </section>
        </div>

        <section className="sales-section reveal">
          <div className="sales-section-head">
            <div>
              <span className="section-kicker">Filiais e PDVs</span>
              <h2>Onde este item vende melhor</h2>
            </div>
            <p>Use este trilho para priorizar abastecimento e negociaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o nas unidades com melhor retorno.</p>
          </div>

          {branchPerformance.length === 0 ? (
            <div className="sales-empty-card">Sem distribuiÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o por PDV neste perÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­odo.</div>
          ) : (
            <div className="sales-rail product-detail-rail">
              {branchPerformance.map((branch) => (
                <BranchRailCard key={branch.branchId || branch.branchName} branch={branch} maxRevenue={maxBranchRevenue} />
              ))}
            </div>
          )}
        </section>

        <section className="sales-section reveal">
          <div className="sales-section-head">
            <div>
              <span className="section-kicker">Sazonalidade</span>
              <h2>Quando este item ganha ou perde traÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o</h2>
            </div>
            <p>Os dias mais fortes e mais fracos indicam quando vale reforÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ar compra ou revisar espaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o.</p>
          </div>

          {weekdaySeasonality.length === 0 ? (
            <div className="sales-empty-card">Sem sazonalidade suficiente neste perÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­odo.</div>
          ) : (
            <div className="sales-rail product-detail-rail">
              {weekdaySeasonality.map((point) => (
                <SeasonalityRailCard key={point.key} point={point} maxRevenue={maxSeasonalityRevenue} />
              ))}
            </div>
          )}
        </section>

        <div className="analytics-grid analytics-grid-main product-detail-price-grid">
          <SalesChart
            className="price-timeline-chart"
            data={(priceTimeline?.points || []).map((point) => ({ date: point.date, revenue: Number(point.weightedAveragePrice || 0) }))}
            kicker="InteligÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âªncia de preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o"
            title="Linha do tempo de preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o"
            panelCopy="A linha acompanha a evoluÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o do preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©dio ponderado e ajuda a enxergar alta, queda e janelas promocionais."
            calloutLabel="ÃƒÆ’Ã†â€™Ãƒâ€¦Ã‚Â¡ltimo preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o observado"
            formatter={formatMoney}
          />

          <section className="sales-section reveal product-detail-summary-section">
            <div className="sales-section-head">
              <div>
                <span className="section-kicker">Resumo de preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o</span>
                <h2>Como o item estÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ posicionado</h2>
              </div>
              <p>Baseline, preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o atual e intensidade promocional em um bloco curto.</p>
            </div>

            <div className="product-detail-summary-grid">
              <article className="product-detail-summary-card">
                <span className="section-kicker">PreÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o base</span>
                <strong>{formatMoney(overview.baselinePrice)}</strong>
                <p>ReferÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âªncia mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©dia sem promoÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o para comparar com o preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o corrente.</p>
              </article>
              <article className="product-detail-summary-card">
                <span className="section-kicker">PreÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o atual</span>
                <strong>{formatMoney(lastObservedPrice || overview.averagePrice)}</strong>
                <p>ÃƒÆ’Ã†â€™Ãƒâ€¦Ã‚Â¡ltimo valor observado no histÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³rico calculado do produto.</p>
              </article>
              <article className="product-detail-summary-card">
                <span className="section-kicker">Janelas promo</span>
                <strong>{priceTimeline?.detectedPromotionWindows || 0}</strong>
                <p>PerÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­odos detectados automaticamente como promoÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o neste recorte.</p>
              </article>
              <article className="product-detail-summary-card">
                <span className="section-kicker">Maior queda</span>
                <strong>{formatSignedPercent(priceTimeline?.maxDecreasePercent)}</strong>
                <p>Melhor reduÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o de preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o observada no perÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­odo analisado.</p>
              </article>
            </div>
          </section>
        </div>

        <div className="analytics-grid analytics-grid-main">
          <section className="analytics-panel reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Eventos de preÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o</span>
                <h3>Movimentos relevantes de alta e queda</h3>
              </div>
            </div>
            {renderPriceEvents(priceEvents)}
          </section>

          <section className="analytics-panel reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">PromoÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âµes</span>
                <h3>Janelas que impactaram este item</h3>
              </div>
            </div>
            {renderPromotionWindows(promotionWindows)}
          </section>
        </div>

        <section className="sales-section reveal">
          <div className="sales-section-head">
            <div>
              <span className="section-kicker">Compra casada</span>
              <h2>Itens que ajudam este produto a vender mais</h2>
            </div>
            <p>Use estas relaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âµes para decidir proximidade na gÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â´ndola, combo e oportunidade de promoÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o cruzada.</p>
          </div>

          {relatedPairs.length === 0 ? (
            <div className="sales-empty-card">Nenhuma associaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o forte encontrada para este item.</div>
          ) : (
            <div className="sales-rail pairs">
              {relatedPairs.map((pair) => (
                <PairRailCard key={`${pair.antecedentId || 'a'}-${pair.consequentId || 'b'}`} pair={pair} />
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
};

export default ProductDetail;

