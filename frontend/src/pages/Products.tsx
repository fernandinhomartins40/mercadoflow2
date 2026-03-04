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
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Performance de produtos</span>
            <h1 className="analytics-hero-title">Veja quem puxa margem, quem trava capital e quem responde a preço.</h1>
            <p className="analytics-hero-text">
              Esta visão troca a tabela fria por um mosaico de produtos, combinando receita, giro, tendência, share promocional, último sinal de venda e acesso direto ao painel do item.
            </p>
            <div className="hero-chip-row">
              <span className="hero-chip">{totalElements} produtos conhecidos</span>
              <span className="hero-chip">Giro médio {avgVelocity.toFixed(2)}/dia</span>
              <span className="hero-chip">Share promo médio {formatPercent(avgPromoShare * 100)}</span>
              {querySearch ? <span className="hero-chip">Busca ativa: {querySearch}</span> : null}
            </div>
          </div>
          <div className="analytics-hero-board single-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">{querySearch ? 'Melhor correspondência' : 'Produto em destaque na página'}</span>
              <h3>{(searchLead || leadProduct)?.name || 'Sem produto destacado'}</h3>
              <strong>{(searchLead || leadProduct) ? formatMoney((searchLead || leadProduct)?.revenue) : 'R$ 0.00'}</strong>
              <p>{(searchLead || leadProduct) ? `${bandLabel((searchLead || leadProduct)?.turnoverBand)} | Tendência ${formatPercent((searchLead || leadProduct)?.revenueTrendPercentage)} | Share promo ${formatPercent(((searchLead || leadProduct)?.promoRevenueShare || 0) * 100)}` : 'A ordenação escolhida passa a destacar o produto certo aqui.'}</p>
              {(searchLead || leadProduct) ? (
                <button
                  className="button hero-inline-button"
                  onClick={() => navigate(`/app/produtos/${(searchLead || leadProduct)?.productId}`)}
                >
                  Abrir dashboard do produto
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <div className="analytics-panel filter-bar reveal">
          <div className="filter-bar-copy">
            <span className="section-kicker">Filtro analítico</span>
            <h3>Procure o item e abra sua leitura por filiais</h3>
          </div>
          <div className="filter-bar-controls">
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
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Products;
