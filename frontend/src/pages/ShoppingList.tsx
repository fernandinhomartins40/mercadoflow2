import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHero from '../components/dashboard/PageHero';
import Button from '../components/common/Button';
import ButtonLink from '../components/common/ButtonLink';
import ShoppingListButton from '../components/common/ShoppingListButton';
import ProductImage from '../components/product/ProductImage';
import ProductShowcaseCard from '../components/product/ProductShowcaseCard';
import { useMarketData } from '../hooks/useMarketData';
import { useShoppingList } from '../hooks/useShoppingList';
import { ProductPairInsight, ProductPerformance, ShoppingListItem } from '../types/analytics.types';

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatQuantity = (value?: number | null) => Number(value || 0).toFixed(0);

const compactLabel = (value?: string | null) => {
  if (!value) return 'Sem categoria';
  const normalized = value.replace(/\s*>\s*/g, ' > ').trim();
  return normalized.length > 68 ?`${normalized.slice(0, 65)}...` : normalized;
};


const suggestedQuantity = (product: ProductPerformance) => {
  const velocity = Number(product.salesVelocity || 0);
  if (velocity >= 8) return 24;
  if (velocity >= 4) return 12;
  if (velocity >= 2) return 6;
  return 3;
};

const ShoppingListItemCard: React.FC<{
  item: ShoppingListItem;
  onToggle: (checked: boolean) => Promise<void>;
  onUpdate: (payload: { quantityTarget?: number; note?: string }) => Promise<void>;
  onRemove: () => Promise<void>;
}> = ({ item, onToggle, onUpdate, onRemove }) => {
  const [quantity, setQuantity] = useState(String(item.quantityTarget || 1));
  const [note, setNote] = useState(item.note || '');

  return (
    <article className={`shopping-list-item-card ${item.checked ?'is-checked' : ''}`}>
      <div className="shopping-list-item-media">
        <div className="shopping-list-item-frame">
          <ProductImage src={item.imageUrl} alt={item.name} className="shopping-list-item-image" />
        </div>
      </div>

      <div className="shopping-list-item-body">
        <div className="shopping-list-item-head">
          <div>
            <span className="section-kicker">{item.sourceTag.replace(/_/g, ' ')}</span>
            <h3>{item.name}</h3>
            <p>{compactLabel(item.category)}</p>
          </div>
          <label className="shopping-list-check">
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(event) => void onToggle(event.target.checked)}
            />
            <span>{item.checked ?'Comprado' : 'Pendente'}</span>
          </label>
        </div>

        {item.reasonSummary ?<div className="shopping-list-reason">{item.reasonSummary}</div> : null}

        <div className="shopping-list-item-controls">
          <label>
            <span>Quantidade alvo</span>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              onBlur={() => void onUpdate({ quantityTarget: Math.max(1, Number(quantity || 1)) })}
            />
          </label>
          <label className="shopping-list-note-field">
            <span>Observação</span>
            <textarea
              className="input shopping-list-note-input"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onBlur={() => void onUpdate({ note })}
              placeholder="Ex.: reforçar compra antes do fim de semana"
            />
          </label>
        </div>

        <div className="shopping-list-item-actions">
          <ButtonLink variant="secondary" to={`/app/produtos/${item.productId}`}>Abrir produto</ButtonLink>
          <Button type="button" variant="secondary" onClick={() => void onRemove()}>Remover</Button>
        </div>
      </div>
    </article>
  );
};

const SuggestionCard: React.FC<{
  product: ProductPerformance;
  inList: boolean;
  label: string;
  meta: string;
  reasonSummary: string;
  onAdd: () => Promise<void>;
}> = ({ product, inList, label, meta, reasonSummary, onAdd }) => (
  <ProductShowcaseCard
    className="shopping-suggestion-card"
    title={product.name}
    subtitle={compactLabel(product.category)}
    imageUrl={product.imageUrl}
    imageAlt={product.name}
    href={`/app/produtos/${product.productId}`}
    badges={<span className="sales-pill soft">{label}</span>}
    metrics={[
      { label: 'Receita', value: formatMoney(product.revenue) },
      { label: 'Giro', value: `${Number(product.salesVelocity || 0).toFixed(1)}/dia` },
    ]}
    footer={meta}
    actions={<ShoppingListButton inList={inList} onAdd={onAdd} />}
  />
);

const PairSuggestionCard: React.FC<{
  pair: ProductPairInsight;
  onAddPair: () => Promise<void>;
}> = ({ pair, onAddPair }) => (
  <article className="shopping-pair-card">
    <div className="shopping-pair-media">
      <div className="shopping-pair-frame">
        <ProductImage src={pair.antecedentImageUrl} alt={pair.antecedentName || 'Produto'} className="shopping-pair-image" />
      </div>
      <div className="shopping-pair-plus">+</div>
      <div className="shopping-pair-frame">
        <ProductImage src={pair.consequentImageUrl} alt={pair.consequentName || 'Produto'} className="shopping-pair-image" />
      </div>
    </div>
    <div className="shopping-pair-body">
      <span className="sales-pill positive">Lift {Number(pair.lift || 0).toFixed(2)}</span>
      <h3>{pair.antecedentName || 'Produto principal'}</h3>
      <p>{pair.consequentName || 'Produto complementar'}</p>
      <div className="shopping-pair-stats">
        <span>{pair.pairCount || 0} cestas</span>
        <span>Confiança {Number((pair.confidence || 0) * 100).toFixed(0)}%</span>
      </div>
      <Button type="button" onClick={() => void onAddPair()}>
        Adicionar os dois
      </Button>
    </div>
  </article>
);

const ShoppingSuggestionsSection: React.FC<{
  title: string;
  subtitle: string;
  products: ProductPerformance[];
  productIds: Set<string>;
  onAdd: (product: ProductPerformance, sourceTag: string, reasonSummary: string) => Promise<void>;
  sourceTag: string;
  buildMeta: (product: ProductPerformance) => string;
  buildReason: (product: ProductPerformance) => string;
}> = ({ title, subtitle, products, productIds, onAdd, sourceTag, buildMeta, buildReason }) => (
  <section className="sales-section reveal">
    <div className="sales-section-head">
      <div>
        <span className="section-kicker">Sugestões inteligentes</span>
        <h2>{title}</h2>
      </div>
      <p>{subtitle}</p>
    </div>
    {products.length === 0 ?(
      <div className="sales-empty-card">Nenhum produto novo para sugerir nesta leitura.</div>
    ) : (
      <div className="shopping-suggestion-rail">
        {products.map((product) => (
          <SuggestionCard
            key={product.productId}
            product={product}
            inList={productIds.has(product.productId)}
            label={sourceTag.replace(/_/g, ' ')}
            meta={buildMeta(product)}
            reasonSummary={buildReason(product)}
            onAdd={() => onAdd(product, sourceTag, buildReason(product))}
          />
        ))}
      </div>
    )}
  </section>
);

const ShoppingListPage: React.FC = () => {
  const { dashboard, loading: dashboardLoading, error: dashboardError } = useMarketData();
  const { overview, items, productIds, loading, error, addItem, updateItem, removeItem } = useShoppingList();

  const seasonalLead = dashboard?.seasonalCollections?.[0] || null;
  const restockSuggestions = useMemo(
    () => (dashboard?.replenishmentCandidates || []).filter((product) => !productIds.has(product.productId)).slice(0, 10),
    [dashboard?.replenishmentCandidates, productIds]
  );
  const seasonalSuggestions = useMemo(
    () => (seasonalLead?.products || []).filter((product) => !productIds.has(product.productId)).slice(0, 10),
    [seasonalLead, productIds]
  );
  const promotionSuggestions = useMemo(
    () => (dashboard?.promotionCandidates || []).filter((product) => !productIds.has(product.productId)).slice(0, 10),
    [dashboard?.promotionCandidates, productIds]
  );
  const cautiousProducts = useMemo(
    () => (dashboard?.lowTurnoverProducts || []).slice(0, 6),
    [dashboard?.lowTurnoverProducts]
  );
  const pairSuggestions = useMemo(
    () => (dashboard?.topPairs || []).slice(0, 6),
    [dashboard?.topPairs]
  );

  const handleAddProduct = async (product: ProductPerformance, sourceTag: string, reasonSummary: string) => {
    await addItem({
      productId: product.productId,
      quantityTarget: suggestedQuantity(product),
      sourceTag,
      reasonSummary,
    });
  };

  const handleAddPair = async (pair: ProductPairInsight) => {
    if (pair.antecedentId) {
      await addItem({
        productId: pair.antecedentId,
        quantityTarget: 3,
        sourceTag: 'COMPRA_CASADA',
        reasonSummary: `Adicionar perto de ${pair.consequentName || 'item complementar'} para capturar venda conjunta.`,
      });
    }
    if (pair.consequentId) {
      await addItem({
        productId: pair.consequentId,
        quantityTarget: 3,
        sourceTag: 'COMPRA_CASADA',
        reasonSummary: `Item complementar de ${pair.antecedentName || 'produto principal'} em ${pair.pairCount || 0} cestas.`,
      });
    }
  };

  if (loading || dashboardLoading) {
    return (
      <Layout>
        <div className="page analytics-page">
          <div className="sales-empty-card">Carregando lista de compras...</div>
        </div>
      </Layout>
    );
  }

  if (error || dashboardError || !dashboard) {
    return (
      <Layout>
        <div className="page analytics-page">
          <div className="sales-empty-card">{error || dashboardError || 'Não foi possível carregar a lista de compras.'}</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page analytics-page shopping-list-page">
        <PageHero
          className="sales-dashboard-hero-grid"
          articleClassName="sales-command-card"
          copyClassName="sales-dashboard-command-copy"
          featureClassName="sales-dashboard-featured"
          asideClassName="sales-hero-side"
          badge="Lista de compras"
          title="Monte a compra com base no que vende, no calendário e no risco de ruptura."
          description="Esta página junta a lista ativa do mercado com sugestões automáticas de reposição, sazonalidade, promoção e venda combinada."
          actions={
            <div className="sales-dashboard-actions">
              <ButtonLink to="/app/produtos">Buscar produtos</ButtonLink>
              <ButtonLink variant="secondary" to="/app">
                Voltar ao painel
              </ButtonLink>
            </div>
          }
          feature={
            <div className="dashboard-glow-card">
              <span className="section-kicker">Próxima pressão do calendário</span>
              <strong>{seasonalLead?.title || 'Sem sazonalidade próxima'}</strong>
              <p>{seasonalLead?.subtitle || 'Assim que surgirem vendas sazonais consistentes, o painel passa a recomendar os itens mais fortes aqui.'}</p>
              <div className="hero-chip-row">
                <span className="hero-chip">{overview.pendingItems} itens pendentes</span>
                <span className="hero-chip">{overview.checkedItems} itens já fechados</span>
                {seasonalLead ? <span className="hero-chip">{seasonalLead.title}</span> : null}
              </div>
            </div>
          }
          aside={
            <div className="dashboard-priority-card">
              <span className="section-kicker">Como usar</span>
              <h3>Comece pela reposição e depois filtre o calendário.</h3>
              <p>O topo mostra o que não pode faltar agora. As seções seguintes ajudam a antecipar datas, promoções e posicionamento.</p>
            </div>
          }
        />

        <div className="metrics-grid analytics-metrics-grid sales-metric-strip">
          <MetricsCard title="Na lista" value={String(overview.totalItems)} icon="LC" />
          <MetricsCard title="Pendentes" value={String(overview.pendingItems)} icon="PD" />
          <MetricsCard title="Fechados" value={String(overview.checkedItems)} icon="OK" />
          <MetricsCard title="Reposição sugerida" value={String(restockSuggestions.length)} icon="RP" />
        </div>

        <section className="sales-section reveal">
          <div className="sales-section-head">
            <div>
              <span className="section-kicker">Lista ativa</span>
              <h2>Itens já separados para compra</h2>
            </div>
            <p>Atualize quantidade, marque o que já foi comprado e remova o que perdeu prioridade.</p>
          </div>
          {items.length === 0 ?(
            <div className="sales-empty-card">
              A lista ainda está vazia. Use os botões de produto ao longo do painel ou comece pelas sugestões abaixo.
            </div>
          ) : (
            <div className="shopping-list-grid">
              {items.map((item) => (
                <ShoppingListItemCard
                  key={item.id}
                  item={item}
                  onToggle={(checked) => updateItem(item.id, { checked })}
                  onUpdate={(payload) => updateItem(item.id, payload)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
            </div>
          )}
        </section>

        <ShoppingSuggestionsSection
          title="Reposição imediata"
          subtitle="Itens com giro forte e risco maior de faltar na área de vendas se a compra não acompanhar."
          products={restockSuggestions}
          productIds={productIds}
          sourceTag="REPOSIÇÃO"
          onAdd={handleAddProduct}
          buildMeta={(product) => `${formatMoney(product.revenue)} e ${Number(product.salesVelocity || 0).toFixed(1)}/dia`}
          buildReason={(product) => `Repor ${product.name} com prioridade. Giro atual de ${Number(product.salesVelocity || 0).toFixed(1)}/dia.`}
        />

        <ShoppingSuggestionsSection
          title={seasonalLead ?`Preparar ${seasonalLead.title}` : 'Preparar calendário'}
          subtitle={seasonalLead?.subtitle || 'Itens ligados à sazonalidade mais próxima do calendário comercial.'}
          products={seasonalSuggestions}
          productIds={productIds}
          sourceTag="SAZONALIDADE"
          onAdd={handleAddProduct}
          buildMeta={(product) => `${formatMoney(product.revenue)} no ciclo comparável`}
          buildReason={(product) => `Produto forte em ${seasonalLead?.title || 'sazonalidade próxima'} com base nas vendas do período comparável.`}
        />

        <ShoppingSuggestionsSection
          title="Produtos para puxar faturamento com promoção"
          subtitle="Itens que têm espaço para ação comercial e podem ganhar volume sem depender de desconto eterno."
          products={promotionSuggestions}
          productIds={productIds}
          sourceTag="PROMOÇÃO"
          onAdd={handleAddProduct}
          buildMeta={(product) => `Share promo ${Number((product.promoRevenueShare || 0) * 100).toFixed(0)}%`}
          buildReason={(product) => `Avaliar compra para ação promocional. Receita ${formatMoney(product.revenue)} com share promo controlado.`}
        />

        <section className="sales-section reveal">
          <div className="sales-section-head">
            <div>
              <span className="section-kicker">Venda combinada</span>
              <h2>Itens para comprar e expor juntos</h2>
            </div>
            <p>Pares com boa afinidade ajudam a puxar venda adicional quando entram juntos em loja, ponta ou exposição cruzada.</p>
          </div>
          {pairSuggestions.length === 0 ?(
            <div className="sales-empty-card">Ainda não há pares fortes suficientes para sugerir compra casada.</div>
          ) : (
            <div className="shopping-pair-rail">
              {pairSuggestions.map((pair) => (
                <PairSuggestionCard
                  key={`${pair.antecedentId}-${pair.consequentId}`}
                  pair={pair}
                  onAddPair={() => handleAddPair(pair)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="sales-section reveal">
          <div className="sales-section-head">
            <div>
              <span className="section-kicker">Compra com cautela</span>
              <h2>Itens que pedem revisão antes do próximo pedido</h2>
            </div>
            <p>Estes produtos têm baixa tração recente. Use esta faixa para não aumentar estoque parado sem necessidade.</p>
          </div>
          {cautiousProducts.length === 0 ?(
            <div className="sales-empty-card">Sem itens de baixa tração neste recorte.</div>
          ) : (
            <div className="shopping-suggestion-rail">
              {cautiousProducts.map((product) => (
                <ProductShowcaseCard
                  key={product.productId}
                  className="shopping-suggestion-card caution"
                  title={product.name}
                  subtitle={compactLabel(product.category)}
                  imageUrl={product.imageUrl}
                  imageAlt={product.name}
                  href={`/app/produtos/${product.productId}`}
                  badges={<span className="sales-pill soft">Revisar antes de comprar</span>}
                  metrics={[
                    { label: 'Receita', value: formatMoney(product.revenue) },
                    { label: 'Quantidade', value: formatQuantity(product.quantitySold) },
                  ]}
                  footer={`Giro ${Number(product.salesVelocity || 0).toFixed(1)}/dia • ${formatQuantity(product.salesDays)} dias com venda`}
                  actions={<ButtonLink variant="secondary" to={`/app/produtos/${product.productId}`}>Analisar produto</ButtonLink>}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
};

export default ShoppingListPage;
