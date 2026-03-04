import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import Button from '../components/common/Button';
import { ProductPerformance } from '../types/analytics.types';

const formatMoney = (value?: number | null) => `R$ ${Number(value || 0).toFixed(2)}`;
const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(1)}%`;

const Products: React.FC = () => {
  const { marketId } = useAuth();
  const [pageData, setPageData] = useState<{ content: ProductPerformance[]; totalPages: number; totalElements: number; number: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [size] = useState(20);
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState<'REVENUE' | 'QUANTITY' | 'TRANSACTIONS' | 'PRICE' | 'TURNOVER' | 'TREND' | 'PROMO' | 'NAME'>('REVENUE');

  const products = useMemo(() => pageData?.content || [], [pageData]);
  const totalPages = pageData?.totalPages ?? 0;
  const totalElements = pageData?.totalElements ?? 0;
  const leadProduct = products[0];
  const avgVelocity = products.length ? products.reduce((sum, product) => sum + Number(product.salesVelocity || 0), 0) / products.length : 0;
  const avgPromoShare = products.length ? products.reduce((sum, product) => sum + Number(product.promoRevenueShare || 0), 0) / products.length : 0;

  useEffect(() => {
    const load = async () => {
      if (!marketId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await marketService.getProductPerformance(marketId, page, size, category || undefined, sortBy);
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
  }, [marketId, page, size, category, sortBy]);

  const bandLabel = (value?: string | null) => {
    switch (value) {
      case 'HIGH': return 'Giro alto';
      case 'MEDIUM': return 'Giro medio';
      default: return 'Giro baixo';
    }
  };

  return (
    <Layout>
      <div className="page analytics-page">
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Performance de produtos</span>
            <h1 className="analytics-hero-title">Veja quem puxa margem, quem trava capital e quem responde a preco.</h1>
            <p className="analytics-hero-text">
              Esta visao troca a tabela fria por um mosaico de produtos, combinando receita, giro, tendencia, share promocional e ultimo sinal de venda.
            </p>
            <div className="hero-chip-row">
              <span className="hero-chip">{totalElements} produtos conhecidos</span>
              <span className="hero-chip">Giro medio {avgVelocity.toFixed(2)}/dia</span>
              <span className="hero-chip">Share promo medio {formatPercent(avgPromoShare * 100)}</span>
            </div>
          </div>
          <div className="analytics-hero-board single-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">Produto em destaque na pagina</span>
              <h3>{leadProduct?.name || 'Sem produto destacado'}</h3>
              <strong>{leadProduct ? formatMoney(leadProduct.revenue) : 'R$ 0.00'}</strong>
              <p>{leadProduct ? `${bandLabel(leadProduct.turnoverBand)} | Tendencia ${formatPercent(leadProduct.revenueTrendPercentage)} | Share promo ${formatPercent((leadProduct.promoRevenueShare || 0) * 100)}` : 'A ordenacao escolhida passa a destacar o produto certo aqui.'}</p>
            </div>
          </div>
        </section>

        <div className="analytics-panel filter-bar reveal">
          <div className="filter-bar-copy">
            <span className="section-kicker">Filtro analitico</span>
            <h3>Refine o recorte sem cair em relatorio cru</h3>
          </div>
          <div className="filter-bar-controls">
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
              <option value="TRANSACTIONS">Ordenar por transacoes</option>
              <option value="PRICE">Ordenar por preco medio</option>
              <option value="TURNOVER">Ordenar por giro</option>
              <option value="TREND">Ordenar por tendencia</option>
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
                <article key={product.productId} className={`product-mosaic-card ${String(product.turnoverBand || '').toLowerCase()} reveal`}>
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
                      <span>Preco medio</span>
                      <strong>{formatMoney(product.averagePrice)}</strong>
                    </div>
                    <div>
                      <span>Transacoes</span>
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
                    <span>Tendencia {formatPercent(product.revenueTrendPercentage)}</span>
                    <span>Ultima venda {product.lastSoldAt ? new Date(product.lastSoldAt).toLocaleDateString('pt-BR') : '--'}</span>
                    <span>GTIN {product.ean || '--'}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        )}

        {!loading && pageData && (
          <div className="analytics-panel pager-panel reveal">
            <div>
              <span className="section-kicker">Navegacao</span>
              <h3>Pagina {pageData.number + 1} de {Math.max(totalPages, 1)}</h3>
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
