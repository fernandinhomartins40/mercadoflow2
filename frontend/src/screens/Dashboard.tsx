import React, { useMemo } from 'react';
import Layout from '../components/layout/Layout';
import { buildOffersUrl } from '../lib/offersApp';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHero from '../components/dashboard/PageHero';
import SalesChart from '../components/dashboard/SalesChart';
import ButtonLink from '../components/common/ButtonLink';
import ShoppingListButton from '../components/common/ShoppingListButton';
import ProductShowcaseCard from '../components/product/ProductShowcaseCard';
import ProductImage from '../components/product/ProductImage';
import { useMarketData } from '../hooks/useMarketData';
import { useShoppingList } from '../hooks/useShoppingList';
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
  const prefix = numeric > 0 ?'+' : '';
  return `${prefix}${numeric.toFixed(1)}%`;
};

const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(0)}%`;
const formatQuantity = (value?: number | null) => Number(value || 0).toFixed(0);

const seasonalStatusLabel = (value?: string | null) => {
  switch ((value || '').toUpperCase()) {
    case 'CURRENT':
      return 'Em andamento';
    case 'UPCOMING':
      return 'Próxima janela';
    case 'RECENT':
      return 'Último ciclo';
    default:
      return 'Sazonalidade';
  }
};

const seasonalStatusTone = (value?: string | null) => {
  switch ((value || '').toUpperCase()) {
    case 'CURRENT':
      return 'positive';
    case 'UPCOMING':
      return 'neutral';
    default:
      return 'soft';
  }
};

const compactLabel = (value?: string | null) => {
  if (!value) return 'Sem categoria';
  const normalized = value.replace(/\s*>\s*/g, ' > ').trim();
  return normalized.length > 64 ?`${normalized.slice(0, 61)}...` : normalized;
};

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

const recommendedQuantity = (product: ProductPerformance) => {
  const velocity = Number(product.salesVelocity || 0);
  if (velocity >= 8) return 24;
  if (velocity >= 4) return 12;
  if (velocity >= 2) return 6;
  return 3;
};

const ProductRailCard: React.FC<{
  product: ProductPerformance;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  footerValue?: string;
  inList: boolean;
  onAdd: () => Promise<void>;
}> = ({ product, primaryLabel, primaryValue, secondaryLabel, secondaryValue, footerValue, inList, onAdd }) => {
  const trendValue = Number(product.revenueTrendPercentage || 0);
  const trendTone = trendValue > 0 ?'positive' : trendValue < 0 ?'negative' : 'neutral';

  return (
    <ProductShowcaseCard
      title={product.name}
      subtitle={compactLabel(product.category)}
      imageUrl={product.imageUrl}
      imageAlt={product.name}
      href={`/app/produtos/${product.productId}`}
      badges={
        <>
          <span className="sales-pill soft">{mapTurnoverLabel(product.turnoverBand)}</span>
          <span className={`sales-pill ${trendTone}`}>{formatSignedPercent(product.revenueTrendPercentage)}</span>
        </>
      }
      metrics={[
        { label: primaryLabel, value: primaryValue },
        { label: secondaryLabel, value: secondaryValue },
      ]}
      footer={footerValue}
      actions={<ShoppingListButton inList={inList} onAdd={onAdd} />}
    />
  );
};

const PromotionRailCard: React.FC<{ item: PromotionImpact; inList: boolean; onAdd: () => Promise<void> }> = ({ item, inList, onAdd }) => (
  <ProductShowcaseCard
    className="promo"
    title={item.name}
    subtitle={compactLabel(item.category)}
    imageUrl={item.imageUrl}
    imageAlt={item.name}
    href={`/app/produtos/${item.productId}`}
    badges={<span className="sales-pill positive">Lift {formatPercent(item.revenueLiftPercent)}</span>}
    metrics={[
      { label: 'Preço base', value: formatMoney(item.baselinePrice) },
      { label: 'Preço promo', value: formatMoney(item.promoAveragePrice) },
    ]}
    footer={`Volume em promoção: ${formatQuantity(item.promoQuantity)}`}
    actions={<ShoppingListButton inList={inList} onAdd={onAdd} />}
  />
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
      <div className="sales-product-stats compact pair">
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
  sourceTag: string;
  productIds: Set<string>;
  onAddProduct: (product: ProductPerformance, sourceTag: string, reasonSummary: string) => Promise<void>;
}> = ({ title, subtitle, products, metricMode, sourceTag, productIds, onAddProduct }) => {
  const getMetrics = (product: ProductPerformance) => {
    switch (metricMode) {
      case 'restock':
        return {
          primaryLabel: 'Giro diário',
          primaryValue: `${Number(product.salesVelocity || 0).toFixed(1)}/dia`,
          secondaryLabel: 'Transações',
          secondaryValue: formatCompact(product.transactionCount),
          footerValue: `Receita ${formatMoney(product.revenue)}`,
          reasonSummary: `Reforçar compra de ${product.name}. Giro atual de ${Number(product.salesVelocity || 0).toFixed(1)}/dia.`,
        };
      case 'low':
        return {
          primaryLabel: 'Receita',
          primaryValue: formatMoney(product.revenue),
          secondaryLabel: 'Quantidade',
          secondaryValue: formatQuantity(product.quantitySold),
          footerValue: `${formatQuantity(product.salesDays)} dias com venda`,
          reasonSummary: `Item sob análise. Comprar ${product.name} com cautela antes de ampliar estoque.`,
        };
      case 'promotionCandidate':
        return {
          primaryLabel: 'Receita',
          primaryValue: formatMoney(product.revenue),
          secondaryLabel: 'Share promo',
          secondaryValue: formatPercent(Number(product.promoRevenueShare || 0) * 100),
          footerValue: `Preço médio ${formatMoney(product.averagePrice)}`,
          reasonSummary: `Avaliar ${product.name} para ação promocional sem depender de desconto excessivo.`,
        };
      default:
        return {
          primaryLabel: 'Receita',
          primaryValue: formatMoney(product.revenue),
          secondaryLabel: 'Quantidade',
          secondaryValue: formatQuantity(product.quantitySold),
          footerValue: `Giro ${Number(product.salesVelocity || 0).toFixed(1)}/dia`,
          reasonSummary: `Manter compra regular de ${product.name}.`,
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
      {products.length === 0 ?(
        <div className="sales-empty-card">Sem produtos suficientes para esta leitura.</div>
      ) : (
        <div className="sales-rail">
          {products.map((product) => {
            const metrics = getMetrics(product);
            return (
              <ProductRailCard
                key={product.productId}
                product={product}
                primaryLabel={metrics.primaryLabel}
                primaryValue={metrics.primaryValue}
                secondaryLabel={metrics.secondaryLabel}
                secondaryValue={metrics.secondaryValue}
                footerValue={metrics.footerValue}
                inList={productIds.has(product.productId)}
                onAdd={() => onAddProduct(product, sourceTag, metrics.reasonSummary)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
};

const PromotionRailSection: React.FC<{
  title: string;
  subtitle: string;
  items: PromotionImpact[];
  productIds: Set<string>;
  onAddProduct: (item: PromotionImpact) => Promise<void>;
}> = ({ title, subtitle, items, productIds, onAddProduct }) => (
  <section className="sales-section reveal">
    <div className="sales-section-head">
      <div>
        <span className="section-kicker">Promoções</span>
        <h2>{title}</h2>
      </div>
      <p>{subtitle}</p>
    </div>
    {items.length === 0 ?(
      <div className="sales-empty-card">Sem produtos com resposta promocional relevante.</div>
    ) : (
      <div className="sales-rail">
        {items.map((item) => (
          <PromotionRailCard key={item.productId} item={item} inList={productIds.has(item.productId)} onAdd={() => onAddProduct(item)} />
        ))}
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
    {items.length === 0 ?(
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

const SeasonalRailSection: React.FC<{
  collection: SeasonalProductCollection;
  productIds: Set<string>;
  onAddProduct: (product: ProductPerformance, sourceTag: string, reasonSummary: string) => Promise<void>;
}> = ({ collection, productIds, onAddProduct }) => (
  <section className="sales-section reveal">
    <div className="sales-section-head sales-seasonal-head">
      <div>
        <span className="section-kicker">Calendário comercial</span>
        <h2>{collection.title}</h2>
      </div>
      <div className="sales-seasonal-head-meta">
        <span className={`sales-pill ${seasonalStatusTone(collection.status)}`}>{collection.proximityLabel || seasonalStatusLabel(collection.status)}</span>
        {collection.periodLabel ?<span className="sales-pill soft">{collection.periodLabel}</span> : null}
      </div>
    </div>

    <p className="sales-seasonal-copy">
      {collection.subtitle || 'Produtos que ganham força nesta janela do calendário comercial.'}
    </p>

    <div className="sales-seasonal-metrics">
      <div>
        <span>Receita da janela</span>
        <strong>{formatMoney(collection.totalRevenue)}</strong>
      </div>
      <div>
        <span>Compras registradas</span>
        <strong>{formatQuantity(collection.totalTransactions)}</strong>
      </div>
      <div>
        <span>Itens vendidos</span>
        <strong>{formatQuantity(collection.totalQuantity)}</strong>
      </div>
    </div>

    {collection.products.length === 0 ?(
      <div className="sales-empty-card">Sem produtos suficientes para esta janela sazonal.</div>
    ) : (
      <div className="sales-rail">
        {collection.products.map((product) => (
          <ProductRailCard
            key={product.productId}
            product={product}
            primaryLabel="Receita"
            primaryValue={formatMoney(product.revenue)}
            secondaryLabel="Quantidade"
            secondaryValue={formatQuantity(product.quantitySold)}
            footerValue={`Giro ${Number(product.salesVelocity || 0).toFixed(1)}/dia`}
            inList={productIds.has(product.productId)}
            onAdd={() => onAddProduct(product, 'SAZONALIDADE', `Preparar ${product.name} para ${collection.title}.`)}
          />
        ))}
      </div>
    )}
  </section>
);

const Dashboard: React.FC = () => {
  const { dashboard, loading, error } = useMarketData();
  const { addItem, productIds } = useShoppingList();

  const strongestWeekday = useMemo(() => pickHighest(dashboard?.weekdaySeasonality || []), [dashboard?.weekdaySeasonality]);
  const weakestWeekday = useMemo(() => pickLowest(dashboard?.weekdaySeasonality || []), [dashboard?.weekdaySeasonality]);
  const strongestHour = useMemo(() => pickHighest(dashboard?.hourlySeasonality || []), [dashboard?.hourlySeasonality]);
  const strongestMonth = useMemo(() => pickHighest(dashboard?.monthlySeasonality || []), [dashboard?.monthlySeasonality]);
  const featuredProduct = useMemo(
    () => dashboard?.topProducts?.[0] || dashboard?.replenishmentCandidates?.[0] || dashboard?.topTurnoverProducts?.[0],
    [dashboard?.replenishmentCandidates, dashboard?.topProducts, dashboard?.topTurnoverProducts]
  );
  const lowPerformance = dashboard?.slowMovers || [];
  const lowestSellers = dashboard?.lowTurnoverProducts || dashboard?.slowMovers || [];
  const promotionDrivenPairs = useMemo(() => {
    const promoNames = new Set((dashboard?.promotionHighlights || []).map((item) => item.name));
    return (dashboard?.topPairs || []).filter(
      (pair) => promoNames.has(pair.antecedentName || '') || promoNames.has(pair.consequentName || '')
    );
  }, [dashboard?.topPairs, dashboard?.promotionHighlights]);

  const addProductToList = async (product: ProductPerformance, sourceTag: string, reasonSummary: string) => {
    await addItem({
      productId: product.productId,
      quantityTarget: recommendedQuantity(product),
      sourceTag,
      reasonSummary,
    });
  };

  const addPromotionToList = async (item: PromotionImpact) => {
    await addItem({
      productId: item.productId,
      quantityTarget: 3,
      sourceTag: 'PROMOÇÃO',
      reasonSummary: `Avaliar ${item.name} em ação promocional. Lift de ${Number(item.revenueLiftPercent || 0).toFixed(0)}%.`,
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="page analytics-page">
          <div className="sales-empty-card">Carregando painel...</div>
        </div>
      </Layout>
    );
  }

  if (error || !dashboard) {
    return (
      <Layout>
        <div className="page analytics-page">
          <div className="sales-empty-card">{error || 'Não foi possível carregar o painel.'}</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page analytics-page sales-dashboard-page">
        <PageHero
          className="sales-dashboard-hero-grid"
          articleClassName="sales-command-card"
          copyClassName="sales-dashboard-command-copy"
          featureClassName="sales-dashboard-featured"
          asideClassName="sales-hero-side"
          visualFirst
          badge="Painel geral de vendas"
          title="Decisões de compra, exposição e promoção com foco no produto."
          description="O painel prioriza os itens do catálogo, mostra o que vende melhor, o que precisa de reposição, o que pode entrar em promoção e o que merece ajuste de exposição."
          feature={
            <div className="sales-dashboard-hero-image-shell">
              <div className="sales-dashboard-hero-image-frame">
                <ProductImage
                  src={featuredProduct?.imageUrl}
                  alt={featuredProduct?.name || 'Produto destaque'}
                  className="sales-dashboard-hero-image"
                />
              </div>
            </div>
          }
          actions={
            <div className="sales-dashboard-actions">
              <ButtonLink to="/app/produtos">Abrir análise por produto</ButtonLink>
              {featuredProduct ?(
                <ButtonLink variant="secondary" to={buildOffersUrl('/ofertas', 'admin', `productId=${featuredProduct.productId}`)}>
                  Criar oferta do líder
                </ButtonLink>
              ) : null}
              <ButtonLink variant="secondary" to="/app/lista-compras">
                Ir para lista de compras
              </ButtonLink>
            </div>
          }
        />

        <div className="metrics-grid analytics-metrics-grid sales-metric-strip">
          <MetricsCard title="Faturamento" value={formatMoney(dashboard.totalRevenue)} icon="R$" />
          <MetricsCard title="Ticket médio" value={formatMoney(dashboard.averageTicket)} icon="TM" />
          <MetricsCard title="Transações" value={formatCompact(dashboard.totalTransactions)} icon="NF" />
          <MetricsCard title="Produtos ativos" value={formatCompact(dashboard.activeProducts)} icon="PD" />
        </div>

        <ProductRailSection
          title="Ranking de produtos mais vendidos"
          subtitle="Itens que mais puxam o faturamento e merecem compra consistente e boa exposição."
          products={dashboard.topProducts || []}
          metricMode="revenue"
          sourceTag="PAINEL_GERAL"
          productIds={productIds}
          onAddProduct={addProductToList}
        />

        <ProductRailSection
          title="Produtos que pedem reposição"
          subtitle="Itens com giro forte e risco maior de faltar na área de vendas se a compra não acompanhar."
          products={dashboard.replenishmentCandidates || []}
          metricMode="restock"
          sourceTag="REPOSIÇÃO"
          productIds={productIds}
          onAddProduct={addProductToList}
        />

        <ProductRailSection
          title="Produtos menos vendidos"
          subtitle="Itens com tração fraca que pedem revisão antes de ocupar mais espaço em estoque ou gôndola."
          products={lowestSellers}
          metricMode="low"
          sourceTag="CAUTELA"
          productIds={productIds}
          onAddProduct={addProductToList}
        />

        <PairRailSection
          title="Produtos que mais vendem juntos"
          subtitle="Use estas combinações para montar compra casada, exposição cruzada e reforço de categoria."
          items={dashboard.topPairs || []}
        />

        <ProductRailSection
          title={`Reforçar compra no melhor dia: ${strongestWeekday?.label || 'sem leitura'}`}
          subtitle="Itens que merecem reforço de estoque no dia mais forte da semana."
          products={(dashboard.topProducts || []).slice(0, 10)}
          metricMode="restock"
          sourceTag="MELHOR_DIA"
          productIds={productIds}
          onAddProduct={addProductToList}
        />

        <ProductRailSection
          title={`Revisar no dia mais fraco: ${weakestWeekday?.label || 'sem leitura'}`}
          subtitle="Itens para rever compra ou espaço no dia mais fraco."
          products={lowPerformance.slice(0, 10)}
          metricMode="low"
          sourceTag="DIA_FRACO"
          productIds={productIds}
          onAddProduct={addProductToList}
        />

        <PromotionRailSection
          title="Produtos que performaram melhor em promoção"
          subtitle="Itens que responderam melhor à redução de preço e entregaram ganho de volume ou receita."
          items={dashboard.promotionHighlights || []}
          productIds={productIds}
          onAddProduct={addPromotionToList}
        />

        <PairRailSection
          title="Promoções que puxaram outras vendas"
          subtitle="Quando o item em promoção ajuda a vender outro produto, vale repensar compra e exposição em conjunto."
          items={promotionDrivenPairs}
        />

        {(dashboard.seasonalCollections || []).map((collection) => (
          <SeasonalRailSection
            key={collection.key}
            collection={collection}
            productIds={productIds}
            onAddProduct={addProductToList}
          />
        ))}

        <ProductRailSection
          title="Itens com espaço para entrar em promoção"
          subtitle="Produtos com boa receita, mas ainda com share promocional controlado para testar novas ações."
          products={dashboard.promotionCandidates || []}
          metricMode="promotionCandidate"
          sourceTag="PROMOÇÃO"
          productIds={productIds}
          onAddProduct={addProductToList}
        />

        <section className="sales-section reveal">
          <div className="sales-section-head">
            <div>
              <span className="section-kicker">Resumo do calendário</span>
              <h2>Onde o ano mais pressiona a compra</h2>
            </div>
            <p>O mês mais forte ajuda a antecipar pedido, espaço e negociação com fornecedor.</p>
          </div>
          <div className="sales-calendar-summary-card">
            <div>
              <span>Mês mais forte</span>
              <strong>{strongestMonth?.label || '--'}</strong>
            </div>
            <div>
              <span>Receita</span>
              <strong>{strongestMonth ?formatMoney(strongestMonth.revenue) : 'R$ 0,00'}</strong>
            </div>
            <div>
              <span>Quantidade</span>
              <strong>{strongestMonth ?formatQuantity(strongestMonth.quantity) : '0'}</strong>
            </div>
            <div>
              <span>Transações</span>
              <strong>{strongestMonth ?formatQuantity(strongestMonth.transactions) : '0'}</strong>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default Dashboard;
