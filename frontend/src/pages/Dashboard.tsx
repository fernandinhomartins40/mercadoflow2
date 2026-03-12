import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import MetricsCard from '../components/dashboard/MetricsCard';
import SalesChart from '../components/dashboard/SalesChart';
import { useMarketData } from '../hooks/useMarketData';
import {
  ProductPairInsight,
  ProductPerformance,
  PromotionImpact,
  SeasonalityPoint,
  SeasonalProductCollection,
} from '../types/analytics.types';

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatCompact = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));

const formatSignedPercent = (value?: number | null) => {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toFixed(1)}%`;
};

const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(0)}%`;
const formatQuantity = (value?: number | null) => Number(value || 0).toFixed(0);

const FALLBACK_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
  <rect width="320" height="320" rx="32" fill="#f3ece5"/>
  <rect x="52" y="52" width="216" height="216" rx="28" fill="#fffaf6" stroke="#ead9ca" stroke-width="8"/>
  <circle cx="112" cy="120" r="22" fill="#ff6a00" opacity="0.85"/>
  <path d="M88 210l42-46c8-9 23-9 31 0l18 20 23-26c8-9 23-9 31 0l35 38" fill="none" stroke="#1a1411" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="160" y="272" text-anchor="middle" fill="#6c5443" font-size="26" font-family="Segoe UI, Arial, sans-serif">Sem imagem</text>
</svg>
`)}`;

const mapTurnoverLabel = (value?: string | null) => {
  switch ((value || '').toUpperCase()) {
    case 'HIGH':
      return 'Giro alto';
    case 'MEDIUM':
      return 'Giro médio';
    default:
      return 'Giro baixo';
  }
};

const pickHighest = (rows: SeasonalityPoint[] = []) =>
  [...rows].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0];

const pickLowest = (rows: SeasonalityPoint[] = []) =>
  [...rows]
    .filter((row) => Number(row.revenue || 0) > 0)
    .sort((a, b) => Number(a.revenue || 0) - Number(b.revenue || 0))[0];

const ProductImage: React.FC<{ src?: string | null; alt: string; className?: string }> = ({ src, alt, className }) => {
  const [broken, setBroken] = useState(false);
  const imageSrc = !broken && src ? src : FALLBACK_IMAGE;

  return (
    <img
      className={className}
      src={imageSrc}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
};

const ProductRailCard: React.FC<{
  product: ProductPerformance;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  tertiaryLabel?: string;
  tertiaryValue?: string;
}> = ({ product, primaryLabel, primaryValue, secondaryLabel, secondaryValue, tertiaryLabel, tertiaryValue }) => {
  const trendValue = Number(product.revenueTrendPercentage || 0);
  const trendTone = trendValue > 0 ? 'positive' : trendValue < 0 ? 'negative' : 'neutral';

  return (
    <Link className="sales-product-card" to={`/app/produtos/${product.productId}`}>
      <div className="sales-product-media-shell">
        <ProductImage src={product.imageUrl} alt={product.name} className="sales-product-media" />
      </div>
      <div className="sales-product-body">
        <div className="sales-product-badges">
          <span className="sales-pill soft">{mapTurnoverLabel(product.turnoverBand)}</span>
          <span className={`sales-pill ${trendTone}`}>{formatSignedPercent(product.revenueTrendPercentage)}</span>
        </div>
        <h3>{product.name}</h3>
        <p>{product.category || 'Sem categoria'}</p>
        <div className="sales-product-stats">
          <div>
            <span>{primaryLabel}</span>
            <strong>{primaryValue}</strong>
          </div>
          <div>
            <span>{secondaryLabel}</span>
            <strong>{secondaryValue}</strong>
          </div>
          {tertiaryLabel && tertiaryValue ? (
            <div>
              <span>{tertiaryLabel}</span>
              <strong>{tertiaryValue}</strong>
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
};

const PromotionRailCard: React.FC<{ item: PromotionImpact }> = ({ item }) => (
  <article className="sales-product-card promo">
    <div className="sales-product-media-shell">
      <ProductImage src={item.imageUrl} alt={item.name} className="sales-product-media" />
    </div>
    <div className="sales-product-body">
      <div className="sales-product-badges">
        <span className="sales-pill positive">Lift {formatPercent(item.revenueLiftPercent)}</span>
        <span className="sales-pill soft">{item.category || 'Sem categoria'}</span>
      </div>
      <h3>{item.name}</h3>
      <p>{item.category || 'Sem categoria'}</p>
      <div className="sales-product-stats">
        <div>
          <span>Preço base</span>
          <strong>{formatMoney(item.baselinePrice)}</strong>
        </div>
        <div>
          <span>Preço promo</span>
          <strong>{formatMoney(item.promoAveragePrice)}</strong>
        </div>
        <div>
          <span>Volume</span>
          <strong>{formatQuantity(item.promoQuantity)}</strong>
        </div>
      </div>
    </div>
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
        <span className="sales-pill positive">Lift {pair.lift.toFixed(2)}</span>
        <span className="sales-pill soft">{pair.pairCount} cestas</span>
      </div>
      <h3>{pair.antecedentName || 'Produto A'}</h3>
      <p>{pair.consequentName || 'Produto B'}</p>
      <div className="sales-product-stats pair">
        <div>
          <span>Confiança</span>
          <strong>{formatPercent(pair.confidence * 100)}</strong>
        </div>
        <div>
          <span>Suporte</span>
          <strong>{formatPercent(pair.support * 100)}</strong>
        </div>
      </div>
    </div>
  </article>
);

const ProductRailSection: React.FC<{
  title: string;
  subtitle: string;
  products: ProductPerformance[];
  metricMode: 'revenue' | 'restock' | 'low' | 'promotionCandidate';
}> = ({ title, subtitle, products, metricMode }) => {
  const getMetrics = (product: ProductPerformance) => {
    switch (metricMode) {
      case 'restock':
        return {
          primaryLabel: 'Giro diário',
          primaryValue: `${Number(product.salesVelocity || 0).toFixed(1)}/dia`,
          secondaryLabel: 'Transações',
          secondaryValue: formatCompact(product.transactionCount),
          tertiaryLabel: 'Receita',
          tertiaryValue: formatMoney(product.revenue),
        };
      case 'low':
        return {
          primaryLabel: 'Receita',
          primaryValue: formatMoney(product.revenue),
          secondaryLabel: 'Quantidade',
          secondaryValue: formatQuantity(product.quantitySold),
          tertiaryLabel: 'Dias com venda',
          tertiaryValue: formatQuantity(product.salesDays),
        };
      case 'promotionCandidate':
        return {
          primaryLabel: 'Receita',
          primaryValue: formatMoney(product.revenue),
          secondaryLabel: 'Promo share',
          secondaryValue: formatPercent(Number(product.promoRevenueShare || 0) * 100),
          tertiaryLabel: 'Preço médio',
          tertiaryValue: formatMoney(product.averagePrice),
        };
      default:
        return {
          primaryLabel: 'Receita',
          primaryValue: formatMoney(product.revenue),
          secondaryLabel: 'Quantidade',
          secondaryValue: formatQuantity(product.quantitySold),
          tertiaryLabel: 'Giro',
          tertiaryValue: `${Number(product.salesVelocity || 0).toFixed(1)}/dia`,
        };
    }
  };

  return (
    <section className="sales-section reveal">
      <div className="sales-section-head">
        <div>
          <span className="section-kicker">Inteligência de vendas</span>
          <h2>{title}</h2>
        </div>
        <p>{subtitle}</p>
      </div>
      {products.length === 0 ? (
        <div className="sales-empty-card">Sem produtos suficientes para esta leitura.</div>
      ) : (
        <div className="sales-rail">
          {products.map((product) => {
            const metrics = getMetrics(product);
            return <ProductRailCard key={product.productId} product={product} {...metrics} />;
          })}
        </div>
      )}
    </section>
  );
};

const PromotionRailSection: React.FC<{ title: string; subtitle: string; items: PromotionImpact[] }> = ({ title, subtitle, items }) => (
  <section className="sales-section reveal">
    <div className="sales-section-head">
      <div>
        <span className="section-kicker">Promoções</span>
        <h2>{title}</h2>
      </div>
      <p>{subtitle}</p>
    </div>
    {items.length === 0 ? (
      <div className="sales-empty-card">Sem produtos com resposta promocional relevante.</div>
    ) : (
      <div className="sales-rail">
        {items.map((item) => <PromotionRailCard key={item.productId} item={item} />)}
      </div>
    )}
  </section>
);

const PairRailSection: React.FC<{ title: string; subtitle: string; items: ProductPairInsight[] }> = ({ title, subtitle, items }) => (
  <section className="sales-section reveal">
    <div className="sales-section-head">
      <div>
        <span className="section-kicker">Venda combinada</span>
        <h2>{title}</h2>
      </div>
      <p>{subtitle}</p>
    </div>
    {items.length === 0 ? (
      <div className="sales-empty-card">Sem combinações fortes neste período.</div>
    ) : (
      <div className="sales-rail pairs">
        {items.map((pair) => (
          <PairRailCard key={`${pair.antecedentId}-${pair.consequentId}`} pair={pair} />
        ))}
      </div>
    )}
  </section>
);

const SeasonalRailSection: React.FC<{ collection: SeasonalProductCollection }> = ({ collection }) => (
  <ProductRailSection
    title={collection.title}
    subtitle={`${collection.subtitle || 'Produtos que ganham força nesse período.'} ${collection.periodLabel ? `Janela analisada: ${collection.periodLabel}.` : ''}`.trim()}
    products={collection.products || []}
    metricMode="revenue"
  />
);

const Dashboard: React.FC = () => {
  const { dashboard, loading, error } = useMarketData();

  const strongestWeekday = useMemo(() => pickHighest(dashboard?.weekdaySeasonality || []), [dashboard?.weekdaySeasonality]);
  const weakestWeekday = useMemo(() => pickLowest(dashboard?.weekdaySeasonality || []), [dashboard?.weekdaySeasonality]);
  const strongestMonth = useMemo(() => pickHighest(dashboard?.monthlySeasonality || []), [dashboard?.monthlySeasonality]);
  const strongestHour = useMemo(() => pickHighest(dashboard?.hourlySeasonality || []), [dashboard?.hourlySeasonality]);

  const heroProduct = useMemo(
    () => dashboard?.topProducts?.[0] || dashboard?.replenishmentCandidates?.[0] || dashboard?.topTurnoverProducts?.[0],
    [dashboard]
  );

  const replenishmentCandidates = dashboard?.replenishmentCandidates || dashboard?.topTurnoverProducts || [];
  const lowPerformance = dashboard?.slowMovers || [];
  const lowestSellers = dashboard?.lowTurnoverProducts || dashboard?.slowMovers || [];
  const promotionCandidates = dashboard?.promotionCandidates || [];
  const promotionHighlights = dashboard?.promotionHighlights || [];
  const topPairs = dashboard?.topPairs || [];
  const seasonalCollections = dashboard?.seasonalCollections || [];

  const promotionDrivenPairs = useMemo(() => {
    const promotedIds = new Set((promotionHighlights || []).map((item) => item.productId));
    return topPairs.filter((pair) => promotedIds.has(pair.antecedentId || '') || promotedIds.has(pair.consequentId || '')).slice(0, 10);
  }, [promotionHighlights, topPairs]);

  if (loading) {
    return (
      <Layout>
        <div className="page analytics-page sales-intelligence-dashboard">
          <div className="sales-empty-card">Carregando painel de vendas...</div>
        </div>
      </Layout>
    );
  }

  if (error || !dashboard) {
    return (
      <Layout>
        <div className="page analytics-page sales-intelligence-dashboard">
          <div className="sales-empty-card">{error || 'Painel indisponível.'}</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page analytics-page sales-intelligence-dashboard">
        <section className="sales-hero reveal">
          <article className="sales-hero-product">
            <div className="sales-hero-media-wrap">
              <ProductImage src={heroProduct?.imageUrl} alt={heroProduct?.name || 'Produto destaque'} className="sales-hero-media" />
            </div>
            <div className="sales-hero-copy">
              <span className="pill">Painel geral de vendas</span>
              <h1>Decisões de compra, exposição e promoção com foco no produto.</h1>
              <p>
                O painel agora prioriza os itens do catálogo, mostra o que vende melhor, o que precisa de reposição,
                o que trava espaço e o que pode puxar faturamento com promoção ou exposição conjunta.
              </p>
              <div className="sales-hero-featured-card">
                <div>
                  <span className="section-kicker">Produto líder do período</span>
                  <h2>{heroProduct?.name || 'Sem destaque consolidado'}</h2>
                </div>
                <div className="sales-hero-featured-metrics">
                  <div>
                    <span>Receita</span>
                    <strong>{formatMoney(heroProduct?.revenue)}</strong>
                  </div>
                  <div>
                    <span>Quantidade</span>
                    <strong>{formatQuantity(heroProduct?.quantitySold)}</strong>
                  </div>
                  <div>
                    <span>Giro</span>
                    <strong>{Number(heroProduct?.salesVelocity || 0).toFixed(1)}/dia</strong>
                  </div>
                </div>
              </div>
              <div className="hero-inline-actions">
                <Link className="button" to="/app/produtos">Abrir análise por produto</Link>
                <Link className="button secondary" to="/app/campanhas">Ver promoções</Link>
              </div>
            </div>
          </article>

          <aside className="sales-hero-side">
            <SalesChart
              className="sales-hero-chart"
              data={(dashboard.salesTrend || []).map((point) => ({ date: point.date, revenue: Number(point.revenue || 0) }))}
              kicker="Ritmo do faturamento"
              title="Curva diária de vendas"
              panelCopy="Acompanhe a cadência do faturamento para decidir compra, reposição e calendário comercial."
              calloutLabel="Último dia"
            />

            <div className="sales-insight-grid">
              <div className="sales-insight-card">
                <span>Melhor dia</span>
                <strong>{strongestWeekday?.label || '--'}</strong>
                <small>{formatMoney(strongestWeekday?.revenue)}</small>
              </div>
              <div className="sales-insight-card">
                <span>Dia mais fraco</span>
                <strong>{weakestWeekday?.label || '--'}</strong>
                <small>{formatMoney(weakestWeekday?.revenue)}</small>
              </div>
              <div className="sales-insight-card">
                <span>Melhor mês</span>
                <strong>{strongestMonth?.label || '--'}</strong>
                <small>{formatMoney(strongestMonth?.revenue)}</small>
              </div>
              <div className="sales-insight-card">
                <span>Hora mais forte</span>
                <strong>{strongestHour?.label || '--'}</strong>
                <small>{formatCompact(dashboard.totalTransactions)} transações</small>
              </div>
            </div>
          </aside>
        </section>

        <div className="metrics-grid analytics-metrics-grid sales-metric-strip">
          <MetricsCard title="Faturamento" value={formatMoney(dashboard.totalRevenue)} icon="R$" />
          <MetricsCard title="Ticket médio" value={formatMoney(dashboard.averageTicket)} icon="TM" />
          <MetricsCard title="Transações" value={formatCompact(dashboard.totalTransactions)} icon="NF" />
          <MetricsCard title="SKUs ativos" value={formatCompact(dashboard.activeProducts)} icon="SKU" />
        </div>

        <ProductRailSection
          title="Ranking de produtos mais vendidos"
          subtitle="Itens que mais puxam o faturamento e merecem compra consistente e boa exposição."
          products={dashboard.topProducts || []}
          metricMode="revenue"
        />

        <ProductRailSection
          title="Produtos com menor saída"
          subtitle="Itens com pouca tração no período. Revise espaço em gôndola, preço e sortimento."
          products={lowestSellers}
          metricMode="low"
        />

        <ProductRailSection
          title="Produtos que pedem maior reposição"
          subtitle="Itens com giro forte e risco maior de faltar na área de vendas se a compra não acompanhar."
          products={replenishmentCandidates}
          metricMode="restock"
        />

        <PairRailSection
          title="Produtos que mais vendem juntos"
          subtitle="Use estas combinações para posicionar os itens próximos e aumentar o valor da cesta."
          items={topPairs.slice(0, 10)}
        />

        <ProductRailSection
          title={`Reforçar no dia mais forte${strongestWeekday ? `: ${strongestWeekday.label}` : ''}`}
          subtitle="Use os campeões de faturamento para abastecer melhor a operação na janela com maior demanda."
          products={(dashboard.topProducts || []).slice(0, 10)}
          metricMode="revenue"
        />

        <ProductRailSection
          title={`Revisar no dia mais fraco${weakestWeekday ? `: ${weakestWeekday.label}` : ''}`}
          subtitle="Itens com baixa reação em dias fracos tendem a consumir espaço sem retorno e pedem ajuste de mix."
          products={lowPerformance}
          metricMode="low"
        />

        <PromotionRailSection
          title="Produtos que performaram melhor em promoção"
          subtitle="Aqui ficam os itens que responderam melhor à redução de preço e entregaram ganho de volume ou receita."
          items={promotionHighlights}
        />

        <PairRailSection
          title="Promoções que puxaram outras vendas"
          subtitle="Combinações em que pelo menos um dos itens já mostrou boa reação promocional. Útil para ofertas casadas."
          items={promotionDrivenPairs}
        />

        <ProductRailSection
          title="Produtos sugeridos para a próxima promoção"
          subtitle="Itens com boa base de venda e espaço para aumentar faturamento quando entram em ação promocional."
          products={promotionCandidates}
          metricMode="promotionCandidate"
        />

        <ProductRailSection
          title={`Planejar compra para ${strongestMonth?.label || 'o pico do ano'}`}
          subtitle="Itens com giro forte que merecem compra mais agressiva quando a janela sazonal mais forte se aproxima."
          products={dashboard.topTurnoverProducts || []}
          metricMode="restock"
        />

        {seasonalCollections.map((collection) => (
          <SeasonalRailSection key={collection.key} collection={collection} />
        ))}
      </div>
    </Layout>
  );
};

export default Dashboard;
