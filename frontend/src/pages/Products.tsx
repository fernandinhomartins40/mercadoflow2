import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import ProductTable from '../components/products/ProductTable';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import Button from '../components/common/Button';
import { ProductPerformance } from '../types/analytics.types';

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

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <div>
            <span className="pill">Performance de produtos</span>
            <h1 className="page-title">Ranking, giro e elasticidade</h1>
            <p className="page-subtitle">
              Analise receita, volume, velocidade de venda, tendência e participação promocional de cada produto do mercado.
            </p>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ color: 'var(--muted)' }}>
              {totalElements} produto{totalElements === 1 ? '' : 's'} analisado{totalElements === 1 ? '' : 's'} neste mercado.
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="input"
                placeholder="Filtrar por categoria"
                value={category}
                onChange={(e) => {
                  setPage(0);
                  setCategory(e.target.value);
                }}
                style={{ maxWidth: 240 }}
              />
              <select
                className="input"
                value={sortBy}
                onChange={(e) => {
                  setPage(0);
                  setSortBy(e.target.value as any);
                }}
                style={{ maxWidth: 240 }}
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

          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          {loading ? <p>Carregando...</p> : <ProductTable products={products} />}

          {!loading && pageData && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 10, flexWrap: 'wrap' }}>
              <div style={{ color: 'var(--muted)' }}>
                Pagina {pageData.number + 1} de {Math.max(totalPages, 1)}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}>
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={totalPages === 0 || page >= totalPages - 1}
                >
                  Proxima
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Products;
