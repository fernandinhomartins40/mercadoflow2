import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import MetricsCard from '../components/dashboard/MetricsCard';
import ShoppingListButton from '../components/common/ShoppingListButton';
import SalesChart from '../components/dashboard/SalesChart';
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
  if (!value) return 'VariaÃ§Ã£o de preÃ§o';
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
      return status || 'NÃ£o classificada';
  }
};

const compactLabel = (value?: string | null) => {
  if (!value) return 'Sem categoria';
  const normalized = value.replace(/\s*>\s*/g, ' > ').trim();
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
};

const FALLBACK_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
  <rect width="320" height="320" rx="32" fill="#f3ece5"/>
  <rect x="52" y="52" width="216" height="216" rx="28" fill="#fff" stroke="#ead9ca" stroke-width="8"/>
  <circle cx="112" cy="120" r="22" fill="#ff6a00" opacity="0.85"/>
  <path d="M88 210l42-46c8-9 23-9 31 0l18 20 23-26c8-9 23-9 31 0l35 38" fill="none" stroke="#1a1411" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="160" y="272" text-anchor="middle" fill="#6c5443" font-size="26" font-family="Segoe UI, Arial, sans-serif">Sem imagem</text>
</svg>
`)}`;

const ProductImage: React.FC<{ src?: string | null; alt: string; className?: string }> = ({ src, alt, className }) => {
  const [broken, setBroken] = useState(false);
  const imageSrc = !broken && src ? src : FALLBACK_IMAGE;

  return <img className={className} src={imageSrc} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
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
      PreÃ§o mÃ©dio {formatMoney(branch.averagePrice)} â€¢ Ãšltima venda em {formatDate(branch.lastSoldAt)}
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
        <span>Ticket mÃ©dio</span>
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
          <span>ConfianÃ§a</span>
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
        setError('Produto nÃ£o encontrado');
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
      reasonSummary: `Adicionar ${overview.name} à lista a partir do painel do produto.`,
    });
  };

  const firstObservedPrice = Number(priceTimeline?.firstObservedPrice || 0);
  const lastObservedPrice = Number(priceTimeline?.lastObservedPrice || 0);
  const timelineDeltaPercent = firstObservedPrice > 0 ? ((lastObservedPrice - firstObservedPrice) / firstObservedPrice) * 100 : 0;
  const maxBranchRevenue = Math.max(...branchPerformance.map((row) => Number(row.revenue || 0)), 1);
  const maxSeasonalityRevenue = Math.max(...weekdaySeasonality.map((row) => Number(row.revenue || 0)), 1);

  const renderPriceEvents = (rows: ProductPriceEvent[]) => {
    if (rows.length === 0) {
      return <div className="panel-empty">Sem eventos relevantes de variaÃ§Ã£o de preÃ§o no perÃ­odo.</div>;
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
                  <span>PreÃ§o anterior</span>
                  <strong>{formatMoney(event.oldPrice)}</strong>
                </div>
                <div>
                  <span>Novo preÃ§o</span>
                  <strong>{formatMoney(event.newPrice)}</strong>
                </div>
                <div>
                  <span>VariaÃ§Ã£o</span>
                  <strong>{formatSignedPercent(event.deltaPercent)}</strong>
                </div>
                <div>
                  <span>ConfianÃ§a</span>
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
      return <div className="panel-empty">Nenhuma janela promocional detectada no perÃ­odo.</div>;
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
                <span>PreÃ§o base</span>
                <strong>{formatMoney(window.baselinePrice)}</strong>
              </div>
              <div>
                <span>PreÃ§o promo</span>
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
          <div className="sales-empty-card">{error || 'Painel do produto indisponÃ­vel.'}</div>
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
                Este painel mostra se vale comprar mais, expor melhor, usar promoÃ§Ã£o ou aproximar este item de outros
                produtos para aumentar faturamento com base nas vendas reais.
              </p>

              <div className="hero-chip-row">
                <span className="hero-chip">{compactLabel(overview.category)}</span>
                <span className="hero-chip">GTIN {overview.ean || '--'}</span>
                <span className="hero-chip">Ãšltima venda em {formatDate(overview.lastSoldAt)}</span>
              </div>

              <div className="sales-hero-featured-card">
                <div>
                  <span className="section-kicker">Resumo do item</span>
                  <h2>{formatMoney(overview.revenue)} no perÃ­odo</h2>
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
                <Link className="button secondary" to="/app/produtos">Voltar para produtos</Link>
                <Link className="button secondary" to="/app/alertas">Abrir alertas</Link>
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
                <small>{weakestWeekday ? formatMoney(weakestWeekday.revenue) : 'Sem comparaÃ§Ã£o suficiente'}</small>
              </article>
              <article className="sales-insight-card product-detail-insight-card">
                <span>PDV mais forte</span>
                <strong>{bestBranch?.branchName || '--'}</strong>
                <small>{bestBranch ? `${formatQuantity(bestBranch.quantitySold)} unidades` : 'Sem PDV dominante'}</small>
              </article>
              <article className="sales-insight-card product-detail-insight-card">
                <span>Compra casada</span>
                <strong>{strongestPair ? `Lift ${Number(strongestPair.lift || 0).toFixed(2)}` : '--'}</strong>
                <small>{strongestPair ? `${strongestPair.antecedentName} + ${strongestPair.consequentName}` : 'Sem associaÃ§Ã£o forte'}</small>
              </article>
            </div>
          </aside>
        </section>

        <div className="metrics-grid analytics-metrics-grid sales-metric-strip">
          <MetricsCard title="Receita" value={formatMoney(overview.revenue)} icon="R$" />
          <MetricsCard title="PreÃ§o mÃ©dio" value={formatMoney(overview.averagePrice)} icon="PM" />
          <MetricsCard title="TransaÃ§Ãµes" value={formatQuantity(overview.transactionCount)} icon="NF" />
          <MetricsCard title="Ãndice de preÃ§o" value={`${Number(overview.priceIndex || 0).toFixed(2)}x`} icon="PX" />
        </div>

        <div className="analytics-grid analytics-grid-main product-detail-overview-grid">
          <SalesChart
            data={(dashboard.salesTrend || []).map((point) => ({ date: point.date, revenue: Number(point.revenue || 0) }))}
            kicker="Desempenho do produto"
            title="Curva diÃ¡ria de faturamento"
            panelCopy="A linha mostra o ritmo real de venda deste item ao longo do perÃ­odo."
            calloutLabel="Ãšltimo faturamento diÃ¡rio"
          />

          <section className="sales-section reveal product-detail-summary-section">
            <div className="sales-section-head">
              <div>
                <span className="section-kicker">Leitura rÃ¡pida</span>
                <h2>O que decidir agora</h2>
              </div>
              <p>Uma leitura direta para compra, exposiÃ§Ã£o e preÃ§o sem depender de texto longo.</p>
            </div>

            <div className="product-detail-summary-grid">
              <article className="product-detail-summary-card">
                <span className="section-kicker">Compra</span>
                <strong>{Number(overview.salesVelocity || 0).toFixed(1)}/dia</strong>
                <p>{Number(overview.salesVelocity || 0) >= 1 ? 'Mantenha reposiÃ§Ã£o mais curta para nÃ£o perder venda.' : 'Pode comprar com mais cautela.'}</p>
              </article>
              <article className="product-detail-summary-card">
                <span className="section-kicker">PreÃ§o</span>
                <strong>{formatSignedPercent(timelineDeltaPercent)}</strong>
                <p>VariaÃ§Ã£o do preÃ§o atual contra o primeiro preÃ§o observado no perÃ­odo.</p>
              </article>
              <article className="product-detail-summary-card">
                <span className="section-kicker">PromoÃ§Ã£o</span>
                <strong>{formatPercent((overview.promoRevenueShare || 0) * 100)}</strong>
                <p>ParticipaÃ§Ã£o de receita quando este item estava em aÃ§Ã£o promocional.</p>
              </article>
              <article className="product-detail-summary-card">
                <span className="section-kicker">Mix</span>
                <strong>{strongestPair ? Number(strongestPair.lift || 0).toFixed(2) : '--'}</strong>
                <p>{strongestPair ? 'HÃ¡ sinal de venda casada relevante para exposiÃ§Ã£o conjunta.' : 'Ainda sem compra casada forte o suficiente.'}</p>
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
            <p>Use este trilho para priorizar abastecimento e negociaÃ§Ã£o nas unidades com melhor retorno.</p>
          </div>

          {branchPerformance.length === 0 ? (
            <div className="sales-empty-card">Sem distribuiÃ§Ã£o por PDV neste perÃ­odo.</div>
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
              <h2>Quando este item ganha ou perde traÃ§Ã£o</h2>
            </div>
            <p>Os dias mais fortes e mais fracos indicam quando vale reforÃ§ar compra ou revisar espaÃ§o.</p>
          </div>

          {weekdaySeasonality.length === 0 ? (
            <div className="sales-empty-card">Sem sazonalidade suficiente neste perÃ­odo.</div>
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
            kicker="InteligÃªncia de preÃ§o"
            title="Linha do tempo de preÃ§o"
            panelCopy="A linha acompanha a evoluÃ§Ã£o do preÃ§o mÃ©dio ponderado e ajuda a enxergar alta, queda e janelas promocionais."
            calloutLabel="Ãšltimo preÃ§o observado"
            formatter={formatMoney}
          />

          <section className="sales-section reveal product-detail-summary-section">
            <div className="sales-section-head">
              <div>
                <span className="section-kicker">Resumo de preÃ§o</span>
                <h2>Como o item estÃ¡ posicionado</h2>
              </div>
              <p>Baseline, preÃ§o atual e intensidade promocional em um bloco curto.</p>
            </div>

            <div className="product-detail-summary-grid">
              <article className="product-detail-summary-card">
                <span className="section-kicker">PreÃ§o base</span>
                <strong>{formatMoney(overview.baselinePrice)}</strong>
                <p>ReferÃªncia mÃ©dia sem promoÃ§Ã£o para comparar com o preÃ§o corrente.</p>
              </article>
              <article className="product-detail-summary-card">
                <span className="section-kicker">PreÃ§o atual</span>
                <strong>{formatMoney(lastObservedPrice || overview.averagePrice)}</strong>
                <p>Ãšltimo valor observado no histÃ³rico calculado do produto.</p>
              </article>
              <article className="product-detail-summary-card">
                <span className="section-kicker">Janelas promo</span>
                <strong>{priceTimeline?.detectedPromotionWindows || 0}</strong>
                <p>PerÃ­odos detectados automaticamente como promoÃ§Ã£o neste recorte.</p>
              </article>
              <article className="product-detail-summary-card">
                <span className="section-kicker">Maior queda</span>
                <strong>{formatSignedPercent(priceTimeline?.maxDecreasePercent)}</strong>
                <p>Melhor reduÃ§Ã£o de preÃ§o observada no perÃ­odo analisado.</p>
              </article>
            </div>
          </section>
        </div>

        <div className="analytics-grid analytics-grid-main">
          <section className="analytics-panel reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Eventos de preÃ§o</span>
                <h3>Movimentos relevantes de alta e queda</h3>
              </div>
            </div>
            {renderPriceEvents(priceEvents)}
          </section>

          <section className="analytics-panel reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">PromoÃ§Ãµes</span>
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
            <p>Use estas relaÃ§Ãµes para decidir proximidade na gÃ´ndola, combo e oportunidade de promoÃ§Ã£o cruzada.</p>
          </div>

          {relatedPairs.length === 0 ? (
            <div className="sales-empty-card">Nenhuma associaÃ§Ã£o forte encontrada para este item.</div>
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

