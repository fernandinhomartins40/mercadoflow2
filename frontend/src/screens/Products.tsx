import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import { useShoppingList } from '../hooks/useShoppingList';
import Button from '../components/common/Button';
import ShoppingListButton from '../components/common/ShoppingListButton';
import ProductImage from '../components/product/ProductImage';
import { ProductPerformance } from '../types/analytics.types';
import { Search, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react';

const formatMoney = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));

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

  useEffect(() => { setSearchInput(querySearch); }, [querySearch]);
  useEffect(() => { setPage(0); }, [querySearch]);

  useEffect(() => {
    const load = async () => {
      if (!marketId) { setLoading(false); return; }
      setLoading(true);
      try {
        const data = await marketService.getProductPerformance(marketId, page, size, category || undefined, querySearch || undefined, sortBy);
        setPageData(data);
        setError(null);
      } catch (err: any) {
        setError(err?.message || 'Erro ao carregar produtos');
        setPageData(null);
      } finally { setLoading(false); }
    };
    load();
  }, [marketId, page, size, category, querySearch, sortBy]);

  const statusLabel = (band?: string | null) => {
    switch ((band || '').toUpperCase()) {
      case 'HIGH': return { text: 'Vende muito', style: { background: 'var(--surface-success)', color: 'var(--brand-700)' } };
      case 'MEDIUM': return { text: 'Vende bem', style: { background: 'var(--surface-warning)', color: '#92400e' } };
      default: return { text: 'Vende pouco', style: { background: 'var(--surface-danger)', color: '#991b1b' } };
    }
  };

  const TrendIcon: React.FC<{ value: number }> = ({ value }) => {
    if (value > 1) return <TrendingUp className="h-3.5 w-3.5 text-green-600" />;
    if (value < -1) return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
    return <Minus className="h-3.5 w-3.5" style={{ color: 'var(--text-soft)' }} />;
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    setPage(0);
    searchInput.trim() ? next.set('search', searchInput.trim()) : next.delete('search');
    setSearchParams(next);
  };

  const handleAddProduct = async (product: ProductPerformance) => {
    await addItem({
      productId: product.productId,
      quantityTarget: Math.max(1, Math.round(Number(product.salesVelocity || 0) || 1)),
      sourceTag: 'PRODUTOS',
      reasonSummary: `Adicionar ${product.name} à lista.`,
    });
  };

  const sortOptions = [
    { key: 'REVENUE', label: 'Receita' },
    { key: 'QUANTITY', label: 'Quantidade' },
    { key: 'TURNOVER', label: 'Velocidade' },
    { key: 'TREND', label: 'Tendência' },
    { key: 'NAME', label: 'Nome' },
  ] as const;

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border-strong)',
    background: 'var(--surface-base)',
    color: 'var(--text-primary)',
  };

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Produtos</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Como seus produtos estão vendendo — {totalElements} produtos encontrados
          </p>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-soft)' }} />
              <input
                className="h-10 rounded-lg pl-9 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-green-500/20"
                style={{ ...inputStyle, width: 240 }}
                placeholder="Buscar produto..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Button type="submit">Buscar</Button>
            {querySearch && (
              <Button variant="ghost" type="button" onClick={() => { setSearchInput(''); setPage(0); const n = new URLSearchParams(searchParams); n.delete('search'); setSearchParams(n); }}>
                Limpar
              </Button>
            )}
          </form>
          <input
            className="h-10 rounded-lg px-3 text-sm outline-none transition focus:ring-2 focus:ring-green-500/20"
            style={{ ...inputStyle, width: 180 }}
            placeholder="Filtrar categoria"
            value={category}
            onChange={(e) => { setPage(0); setCategory(e.target.value); }}
          />
        </div>

        {/* Sort pills */}
        <div className="flex flex-wrap gap-3">
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => { setPage(0); setSortBy(opt.key as any); }}
              className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
              style={
                sortBy === opt.key
                  ? { border: '1px solid var(--brand-600)', background: 'var(--surface-success)', color: 'var(--brand-700)' }
                  : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }
              }
            >
              {opt.label}
            </button>
          ))}
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        {/* Product grid */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
            <p style={{ color: 'var(--text-muted)' }}>Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => {
              const status = statusLabel(product.turnoverBand);
              const trend = Number(product.revenueTrendPercentage || 0);
              return (
                <article
                  key={product.productId}
                  onClick={() => navigate(`/app/produtos/${product.productId}`)}
                  className="flex cursor-pointer flex-col rounded-xl transition hover:-translate-y-0.5"
                  style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
                >
                  {/* Image — transparent, no fill */}
                  <div className="flex h-40 items-center justify-center overflow-hidden rounded-t-xl p-4">
                    <ProductImage src={product.imageUrl} alt={product.name} className="max-h-full max-w-full object-contain" />
                  </div>
                  {/* Body */}
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={status.style}>
                        {status.text}
                      </span>
                      <div className="flex items-center gap-1">
                        <TrendIcon value={trend} />
                        <span
                          className={`text-xs font-medium ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : ''}`}
                          style={!trend ? { color: 'var(--text-soft)' } : {}}
                        >
                          {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <h3 className="line-clamp-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{product.name}</h3>
                    <p className="line-clamp-1 text-xs" style={{ color: 'var(--text-soft)' }}>{product.category || 'Sem categoria'}</p>
                    <div className="mt-auto grid grid-cols-2 gap-2 border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
                      <div>
                        <span className="text-[10px]" style={{ color: 'var(--text-soft)' }}>Receita</span>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{formatMoney(product.revenue)}</p>
                      </div>
                      <div>
                        <span className="text-[10px]" style={{ color: 'var(--text-soft)' }}>Vendas/dia</span>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{Number(product.salesVelocity || 0).toFixed(1)}/dia</p>
                      </div>
                    </div>
                    {product.healthScore != null && (
                      <div className="mt-1">
                        <div className="mb-0.5 flex items-center justify-between">
                          <span className="text-[10px]" style={{ color: 'var(--text-soft)' }}>Saúde</span>
                          <span className="text-[10px] font-semibold" style={{ color: Number(product.healthScore) >= 60 ? 'var(--brand-700)' : Number(product.healthScore) >= 35 ? '#92400e' : '#991b1b' }}>
                            {Number(product.healthScore).toFixed(0)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, Number(product.healthScore))}%`,
                              background: Number(product.healthScore) >= 60 ? 'var(--brand-500)' : Number(product.healthScore) >= 35 ? '#f59e0b' : '#ef4444',
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="mt-1 flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <ShoppingListButton inList={productIds.has(product.productId)} onAdd={() => handleAddProduct(product)} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && pageData && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-40"
              style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Página <strong>{pageData.number + 1}</strong> de <strong>{totalPages}</strong>
            </span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-40"
              style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Products;
