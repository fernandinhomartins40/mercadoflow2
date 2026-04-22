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
      case 'HIGH': return { text: 'Vende muito', color: 'bg-emerald-50 text-emerald-700' };
      case 'MEDIUM': return { text: 'Vende bem', color: 'bg-amber-50 text-amber-700' };
      default: return { text: 'Vende pouco', color: 'bg-red-50 text-red-700' };
    }
  };

  const TrendIcon: React.FC<{ value: number }> = ({ value }) => {
    if (value > 1) return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
    if (value < -1) return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
    return <Minus className="h-3.5 w-3.5 text-gray-400" />;
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
    { key: 'TURNOVER', label: 'Giro' },
    { key: 'TREND', label: 'Tendência' },
    { key: 'NAME', label: 'Nome' },
  ] as const;

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">Produtos</h1>
          <p className="text-sm text-gray-500">Como seus produtos estão vendendo — {totalElements} produtos encontrados</p>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className="h-10 rounded-lg border border-gray-200 bg-white pl-9 pr-4 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Buscar produto..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ width: 240 }}
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
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            placeholder="Filtrar categoria"
            value={category}
            onChange={(e) => { setPage(0); setCategory(e.target.value); }}
            style={{ width: 180 }}
          />
        </div>

        {/* Sort pills */}
        <div className="flex flex-wrap gap-2">
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => { setPage(0); setSortBy(opt.key as any); }}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                sortBy === opt.key
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        {/* Product grid */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
            <p className="text-gray-500">Nenhum produto encontrado.</p>
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
                  className="flex cursor-pointer flex-col rounded-xl border border-gray-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  {/* Image */}
                  <div className="flex h-40 items-center justify-center bg-gray-50 p-4">
                    <ProductImage src={product.imageUrl} alt={product.name} className="max-h-full max-w-full object-contain" />
                  </div>
                  {/* Body */}
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${status.color}`}>
                        {status.text}
                      </span>
                      <div className="flex items-center gap-1">
                        <TrendIcon value={trend} />
                        <span className={`text-xs font-medium ${trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">{product.name}</h3>
                    <p className="line-clamp-1 text-xs text-gray-400">{product.category || 'Sem categoria'}</p>
                    <div className="mt-auto grid grid-cols-2 gap-2 border-t border-gray-50 pt-2">
                      <div>
                        <span className="text-[10px] text-gray-400">Receita</span>
                        <p className="text-sm font-semibold text-gray-900">{formatMoney(product.revenue)}</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400">Giro</span>
                        <p className="text-sm font-semibold text-gray-900">{Number(product.salesVelocity || 0).toFixed(1)}/dia</p>
                      </div>
                    </div>
                    {/* Actions */}
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-600">
              Página <strong>{pageData.number + 1}</strong> de <strong>{totalPages}</strong>
            </span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:opacity-40"
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
