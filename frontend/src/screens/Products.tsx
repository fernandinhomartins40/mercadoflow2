import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { buildOffersUrl } from '../lib/offersApp';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import { useShoppingList } from '../hooks/useShoppingList';
import Button from '../components/common/Button';
import ShoppingListButton from '../components/common/ShoppingListButton';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHeader from '../components/layout/PageHeader';
import { ProductPerformance } from '../types/analytics.types';

const formatMoney = (value?: number | null) => `R$ ${Number(value || 0).toFixed(2)}`;
const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(1)}%`;

const Products: React.FC = () => {
  const { marketId } = useAuth();
  const { addItem, productIds } = useShoppingList();
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

  const handleAddProduct = async (product: ProductPerformance) => {
    await addItem({
      productId: product.productId,
      quantityTarget: Math.max(1, Math.round(Number(product.salesVelocity || 0) || 1)),
      sourceTag: 'PRODUTOS',
      reasonSummary: `Adicionar ${product.name} à lista a partir da consulta de produtos.`,
    });
  };

  return (
    <Layout>
      <div className="page analytics-page">
        <PageHeader
          title="Produtos"
          subtitle="Performance, giro e tendência por item do catálogo."
        />

        <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <MetricsCard title="Total" value={totalElements} icon="PD" />
          <MetricsCard title="Giro médio" value={`${avgVelocity.toFixed(2)}/dia`} icon="GR" variant="warning" />
          <MetricsCard title="Share promo" value={formatPercent(avgPromoShare * 100)} icon="SP" variant="danger" />
          <MetricsCard title="Ordenação" value={sortBy} icon="OR" />
        </div>

        {/* Filtros inline */}
        <div className="filters-inline" style={{ flexWrap: 'wrap', gap: 12 }}>
          <form className="product-search-form" onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="Buscar por nome ou GTIN"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ maxWidth: 280 }}
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
            placeholder="Categoria"
            value={category}
            onChange={(e) => {
              setPage(0);
              setCategory(e.target.value);
            }}
            style={{ maxWidth: 200 }}
          />
          <select
            className="input"
            value={sortBy}
            onChange={(e) => {
              setPage(0);
              setSortBy(e.target.value as any);
            }}
            style={{ maxWidth: 220 }}
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

        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        {loading ? (
          <div className="panel-empty">Carregando...</div>
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
                      <strong>{Number(product.quantitySold || 0).toFixed(0)}</strong>
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
                      <span>Share promo</span>
                      <strong>{formatPercent((product.promoRevenueShare || 0) * 100)}</strong>
                    </div>
                    <div className="progress-track"><div className="progress-fill orange" style={{ width: `${Math.min(Number(product.promoRevenueShare || 0) * 100, 100)}%` }} /></div>
                  </div>

                  <div className="product-card-foot">
                    <span>Tendência {formatPercent(product.revenueTrendPercentage)}</span>
                    <span>Última venda {product.lastSoldAt ? new Date(product.lastSoldAt).toLocaleDateString('pt-BR') : '--'}</span>
                  </div>
                  <div className="product-card-actions-row">
                    <div className="product-card-link">Abrir dashboard</div>
                    <div className="product-card-actions-inline">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(buildOffersUrl('/ofertas', 'admin', `productId=${product.productId}`));
                        }}
                      >
                        Criar oferta
                      </Button>
                      <ShoppingListButton inList={productIds.has(product.productId)} onAdd={() => handleAddProduct(product)} />
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        )}

        {!loading && pageData && (
          <div className="pager-actions admin-pager-actions">
            <span className="section-kicker">Página {pageData.number + 1} de {Math.max(totalPages, 1)}</span>
            <Button variant="secondary" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}>
              Anterior
            </Button>
            <Button variant="secondary" onClick={() => setPage((p) => p + 1)} disabled={totalPages === 0 || page >= totalPages - 1}>
              Próxima
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Products;
