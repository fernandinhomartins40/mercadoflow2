import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import Button from '../components/common/Button';
import { ProductPerformance } from '../types/analytics.types';

const formatMoney = (value?: number | null) => `R$ ${Number(value || 0).toFixed(2)}`;
const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(1)}%`;

const Products: React.FC = () => {
  const { marketId } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pageData, setPageData] = useState<{ content: ProductPerformance[]; totalPages: number; totalElements: number; number: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [size] = useState(20);
  const [category, setCategory] = useState('');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [sortBy, setSortBy] = useState<'REVENUE' | 'QUANTITY' | 'TRANSACTIONS' | 'PRICE' | 'TURNOVER' | 'TREND' | 'PROMO' | 'NAME'>('REVENUE');
  const querySearch = searchParams.get('search') || '';

  const products = useMemo(() => pageData?.content || [], [pageData]);
  const totalPages = pageData?.totalPages ?? 0;
  const totalElements = pageData?.totalElements ?? 0;
  const leadProduct = products[0];
  const searchLead = querySearch ? products[0] : null;
  const highlightProduct = searchLead || leadProduct;
  const avgVelocity = products.length ? products.reduce((sum, product) => sum + Number(product.salesVelocity || 0), 0) / products.length : 0;
  const avgPromoShare = products.length ? products.reduce((sum, product) => sum + Number(product.promoRevenueShare || 0), 0) / products.length : 0;

  useEffect(() => {
    setSearchInput(querySearch);
  }, [querySearch]);

  useEffect(() => {
    setPage(0);
  }, [querySearch]);

  useEffect(() => {
    const load = async () => {
      if (!marketId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await marketService.getProductPerformance(
          marketId,
          page,
          size,
          category || undefined,
          querySearch || undefined,
          sortBy
        );
        setPageData(data);
        setError(null);
      } catch (err: any) {
        setError(err?.message || 'Erro ao carregar produtos');
        setPageData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [marketId, page, size, category, querySearch, sortBy]);

  const bandLabel = (value?: string | null) => {
    switch (value) {
      case 'HIGH': return 'Giro alto';
      case 'MEDIUM': return 'Giro médio';
      default: return 'Giro baixo';
    }
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    const normalized = searchInput.trim();
    setPage(0);
    if (normalized) {
      next.set('search', normalized);
    } else {
      next.delete('search');
    }
    setSearchParams(next);
  };

  return (
    <Layout>
      <div className="page analytics-page">
        <section className="dashboard-command-grid reveal">
          <article className="dashboard-command-card">
            <div className="dashboard-command-copy">
              <span className="pill">Performance de produtos</span>
              <h1 className="dashboard-command-title">Decida por produto sem navegar em uma grade burocratica.</h1>
              <p className="dashboard-command-text">
                Este mapa coloca primeiro o item que gira, o que segura receita, o que depende de promocao e o que precisa de leitura por filial antes de consumir mais capital.
              </p>
              <div className="hero-chip-row">
                <span className="hero-chip">{totalElements} produtos conhecidos</span>
                <span className="hero-chip">Giro médio {avgVelocity.toFixed(2)}/dia</span>
                <span className="hero-chip">Share promo médio {formatPercent(avgPromoShare * 100)}</span>
                {querySearch ? <span className="hero-chip">Busca ativa: {querySearch}</span> : null}
              </div>
            </div>

            <div className="dashboard-command-showcase">
              <article className="dashboard-glow-card">
                <span className="section-kicker">{querySearch ? 'Melhor correspondência' : 'Produto em destaque'}</span>
                <strong>{highlightProduct?.name || 'Sem produto destacado'}</strong>
                <p>
                  {highlightProduct
                    ? `${bandLabel(highlightProduct.turnoverBand)} | Tendência ${formatPercent(highlightProduct.revenueTrendPercentage)} | Share promo ${formatPercent((highlightProduct.promoRevenueShare || 0) * 100)}`
                    : 'A ordenação escolhida passa a destacar aqui o item que merece a primeira leitura.'}
                </p>
                {highlightProduct ? (
                  <button className="button hero-inline-button" onClick={() => navigate(`/app/produtos/${highlightProduct.productId}`)}>
                    Abrir dashboard do produto
                  </button>
                ) : null}
              </article>

              <div className="dashboard-command-mosaic">
                <article className="dashboard-mini-tile">
                  <span>Receita do destaque</span>
                  <strong>{highlightProduct ? formatMoney(highlightProduct.revenue) : 'R$ 0.00'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Última venda</span>
                  <strong>{highlightProduct?.lastSoldAt ? new Date(highlightProduct.lastSoldAt).toLocaleDateString('pt-BR') : '--'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Faixa de giro</span>
                  <strong>{bandLabel(highlightProduct?.turnoverBand)}</strong>
                </article>
              </div>
            </div>
          </article>

          <aside className="dashboard-priority-rail">
            <article className="dashboard-priority-card">
              <span className="section-kicker">Leitura recomendada</span>
              <h3>Comece pela pergunta do time.</h3>
              <p>Busca quando ja existe um GTIN ou nome específico. Ordenação por receita, giro ou tendência quando o problema ainda precisa ser descoberto.</p>
            </article>
            <article className="dashboard-priority-card">
              <span className="section-kicker">Ação mais comum</span>
              <h3>Abra o dashboard do item certo, não de varios.</h3>
              <p>Esta tela serve para priorizar. A investigação detalhada continua no painel individual do produto.</p>
            </article>
          </aside>
        </section>

        <section className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <div className="metric-card metric-card-default reveal">
            <div className="metric-card-top"><span className="metric-card-title">Produtos no recorte</span><span className="metric-card-icon">PD</span></div>
            <strong className="metric-card-value">{totalElements}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">universo conhecido desta consulta</span></div>
          </div>
          <div className="metric-card metric-card-warning reveal">
            <div className="metric-card-top"><span className="metric-card-title">Giro médio</span><span className="metric-card-icon">GR</span></div>
            <strong className="metric-card-value">{avgVelocity.toFixed(2)}/dia</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">velocidade media da página</span></div>
          </div>
          <div className="metric-card metric-card-danger reveal">
            <div className="metric-card-top"><span className="metric-card-title">Share promo</span><span className="metric-card-icon">SP</span></div>
            <strong className="metric-card-value">{formatPercent(avgPromoShare * 100)}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">participação media de promo</span></div>
          </div>
          <div className="metric-card metric-card-default reveal">
            <div className="metric-card-top"><span className="metric-card-title">Ordenação ativa</span><span className="metric-card-icon">OR</span></div>
            <strong className="metric-card-value">{sortBy}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">critério que domina o ranking</span></div>
          </div>
        </section>

        <div className="dashboard-page-grid">
          <section className="analytics-panel reveal dashboard-form-panel">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Filtro analítico</span>
                <h3>Procure o item e reorganize o ranking</h3>
              </div>
            </div>
            <div className="dashboard-form-stack">
              <form className="product-search-form" onSubmit={handleSearchSubmit}>
                <input
                  className="input"
                  placeholder="Buscar por nome ou GTIN"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                <Button type="submit">Buscar</Button>
                {querySearch ? (
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setPage(0);
                      const next = new URLSearchParams(searchParams);
                      next.delete('search');
                      setSearchParams(next);
                    }}
                  >
                    Limpar
                  </Button>
                ) : null}
              </form>
              <input
                className="input"
                placeholder="Filtrar por categoria"
                value={category}
                onChange={(e) => {
                  setPage(0);
                  setCategory(e.target.value);
                }}
              />
              <select
                className="input"
                value={sortBy}
                onChange={(e) => {
                  setPage(0);
                  setSortBy(e.target.value as any);
                }}
              >
                <option value="REVENUE">Ordenar por receita</option>
                <option value="QUANTITY">Ordenar por quantidade</option>
                <option value="TRANSACTIONS">Ordenar por transações</option>
                <option value="PRICE">Ordenar por preço médio</option>
                <option value="TURNOVER">Ordenar por giro</option>
                <option value="TREND">Ordenar por tendência</option>
                <option value="PROMO">Ordenar por share promocional</option>
                <option value="NAME">Ordenar por nome</option>
              </select>
            </div>
          </section>

          <aside className="dashboard-side-stack">
            <section className="analytics-panel reveal dashboard-note-card">
              <span className="section-kicker">Como ler esta tela</span>
              <h3>Escolha o critério antes de comparar produtos.</h3>
              <div className="dashboard-quick-list">
                <div className="dashboard-quick-item">
                  <strong>Receita</strong>
                  <span>Ajuda a identificar peso financeiro e defender margem.</span>
                </div>
                <div className="dashboard-quick-item">
                  <strong>Giro e tendência</strong>
                  <span>Mostram risco de capital parado ou mudança recente de comportamento.</span>
                </div>
                <div className="dashboard-quick-item">
                  <strong>Share promo</strong>
                  <span>Aponta quando a venda do item depende demais de desconto.</span>
                </div>
              </div>
            </section>
          </aside>
        </div>

        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        {loading ? (
          <div className="card">Carregando...</div>
        ) : (
          <div className="analytics-card-grid product-mosaic-grid">
            {products.length === 0 ? (
              <div className="analytics-panel"><div className="panel-empty">Nenhum produto encontrado neste recorte.</div></div>
            ) : (
              products.map((product) => (
                <article
                  key={product.productId}
                  className={`product-mosaic-card ${String(product.turnoverBand || '').toLowerCase()} reveal is-clickable`}
                  onClick={() => navigate(`/app/produtos/${product.productId}`)}
                >
                  <div className="product-mosaic-head">
                    <div>
                      <span className="section-kicker">{product.category || 'Sem categoria'}</span>
                      <h3>{product.name}</h3>
                    </div>
                    <span className={`status-pill ${String(product.turnoverBand || '').toLowerCase()}`}>{bandLabel(product.turnoverBand)}</span>
                  </div>

                  <div className="product-mosaic-metrics">
                    <div>
                      <span>Receita</span>
                      <strong>{formatMoney(product.revenue)}</strong>
                    </div>
                    <div>
                      <span>Quantidade</span>
                      <strong>{Number(product.quantitySold || 0).toFixed(2)}</strong>
                    </div>
                    <div>
                      <span>Preço médio</span>
                      <strong>{formatMoney(product.averagePrice)}</strong>
                    </div>
                    <div>
                      <span>Transações</span>
                      <strong>{product.transactionCount || 0}</strong>
                    </div>
                  </div>

                  <div className="product-progress-block">
                    <div className="progress-row">
                      <span>Giro</span>
                      <strong>{Number(product.salesVelocity || 0).toFixed(2)}/dia</strong>
                    </div>
                    <div className="progress-track"><div className="progress-fill mint" style={{ width: `${Math.min(Number(product.salesVelocity || 0) * 8, 100)}%` }} /></div>
                  </div>

                  <div className="product-progress-block">
                    <div className="progress-row">
                      <span>Share promocional</span>
                      <strong>{formatPercent((product.promoRevenueShare || 0) * 100)}</strong>
                    </div>
                    <div className="progress-track"><div className="progress-fill orange" style={{ width: `${Math.min(Number(product.promoRevenueShare || 0) * 100, 100)}%` }} /></div>
                  </div>

                  <div className="product-card-foot">
                    <span>Tendência {formatPercent(product.revenueTrendPercentage)}</span>
                    <span>Última venda {product.lastSoldAt ? new Date(product.lastSoldAt).toLocaleDateString('pt-BR') : '--'}</span>
                    <span>GTIN {product.ean || '--'}</span>
                  </div>
                  <div className="product-card-link">Abrir dashboard do produto</div>
                </article>
              ))
            )}
          </div>
        )}

        {!loading && pageData && (
          <div className="analytics-panel pager-panel reveal">
            <div>
              <span className="section-kicker">Navegação</span>
              <h3>Página {pageData.number + 1} de {Math.max(totalPages, 1)}</h3>
            </div>
            <div className="pager-actions">
              <Button variant="secondary" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}>
                Anterior
              </Button>
              <Button variant="secondary" onClick={() => setPage((p) => p + 1)} disabled={totalPages === 0 || page >= totalPages - 1}>
                Proxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Products;
