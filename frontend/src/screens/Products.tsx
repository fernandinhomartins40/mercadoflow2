import React, { useEffect, useMemo, useState } from 'react';
import { formatDecimal } from '../utils/formatters';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { marketService } from '../services/market.service';
import { analyticsService } from '../services/analytics.service';
import { useAuth } from '../context/AuthContext';
import { useShoppingList } from '../hooks/useShoppingList';
import Button from '../components/common/Button';
import ShoppingListButton from '../components/common/ShoppingListButton';
import ProductImage from '../components/product/ProductImage';
import { ProductPerformance } from '../types/analytics.types';
import {
  AlertTriangle, Search, TrendingUp, TrendingDown, Minus,
  ShoppingCart, Zap, Map, ArrowRight, RefreshCw, Plus,
} from 'lucide-react';
import { ActionHub, Forest, PagedBox, PageHero, PanelTitle, Thumb } from '../components/flow/Flow';
import ProductAttention, { attentionList, type Why } from './produtos/ProductAttention';
import TractionList from './produtos/TractionList';
import { useMarketData } from '../hooks/useMarketData';
import { useCached } from '../hooks/useCached';
import { History, ListChecks, MessageCircleQuestion, Package } from 'lucide-react';
import { Combine as HxCombine, Package as HxPackage, TrendingUp as HxTrendingUp, Zap as HxZap } from 'lucide-react';

const fmtMoney = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-base)',
  color: 'var(--text-primary)',
};

/* ════════════════════════════════════════════════════════════
   ABA 1 — DESEMPENHO (catálogo de produtos)
════════════════════════════════════════════════════════════ */
const DesempenhoTab: React.FC = () => {
  const { marketId } = useAuth();
  const { addItem, productIds } = useShoppingList();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const [size] = useState(20);
  const [category, setCategory] = useState('');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [selected, setSelected] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'REVENUE' | 'QUANTITY' | 'TRANSACTIONS' | 'PRICE' | 'TURNOVER' | 'TREND' | 'PROMO' | 'NAME'>('REVENUE');
  const querySearch = searchParams.get('search') || '';

  useEffect(() => { setSearchInput(querySearch); }, [querySearch]);
  useEffect(() => { setPage(0); }, [querySearch]);

  // Guardado por 2 minutos: voltar à lista ou à página anterior não espera de novo.
  const perf = useCached<{ content: ProductPerformance[]; totalPages: number; totalElements: number; number: number }>(
    marketId ? `desempenho:${marketId}:${page}:${size}:${category}:${querySearch}:${sortBy}` : null,
    () => marketService.getProductPerformance(marketId!, page, size, category || undefined, querySearch || undefined, sortBy),
    2 * 60_000,
  );
  const pageData = perf.data ?? null;
  const loading = perf.loading;
  const error = perf.error && !pageData ? 'Erro ao carregar produtos' : null;

  const products = useMemo(() => pageData?.content || [], [pageData]);
  const current = products.find((x) => x.productId === selected) ?? products[0] ?? null;
  const totalPages = pageData?.totalPages ?? 0;
  const totalElements = pageData?.totalElements ?? 0;

  // Badge reflects current momentum + trend, not just historical turnover band
  const statusLabel = (p: ProductPerformance) => {
    const trend = Number(p.revenueTrendPercentage || 0);
    const momentum = Number(p.momentumScore || 0);
    const band = (p.turnoverBand || '').toUpperCase();

    // Spike: strong positive trend right now
    if (trend >= 20 || (trend >= 10 && momentum > 1.2))
      return { text: 'Em alta', style: { background: '#dcfce7', color: '#166534' } };

    // Accelerating: momentum above 1 even if trend modest
    if (momentum >= 1.15 && trend >= 0)
      return { text: 'Acelerando', style: { background: '#d1fae5', color: '#065f46' } };

    // Steady high performer
    if (band === 'HIGH' && trend > -10)
      return { text: 'Alto giro', style: { background: 'var(--surface-success)', color: 'var(--brand-700)' } };

    // Medium band or high band losing speed but not crashing
    if (band === 'MEDIUM' || (band === 'HIGH' && trend <= -10))
      return { text: 'Giro médio', style: { background: 'var(--surface-warning)', color: '#92400e' } };

    // Declining: active downtrend
    if (trend <= -20 || (trend < -10 && momentum < 0.8))
      return { text: 'Em queda', style: { background: '#fee2e2', color: '#991b1b' } };

    // Decelerating but not crashing
    if (momentum < 0.85 && momentum > 0)
      return { text: 'Desacelerando', style: { background: '#fef3c7', color: '#92400e' } };

    // True low / no signal
    return { text: 'Baixo giro', style: { background: 'var(--surface-muted)', color: 'var(--text-muted)' } };
  };

  const TrendIcon: React.FC<{ value: number }> = ({ value }) => {
    if (value > 3) return <TrendingUp className="h-3.5 w-3.5 text-green-600" />;
    if (value < -3) return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
    return <Minus className="h-3.5 w-3.5" style={{ color: 'var(--text-soft)' }} />;
  };

  const sortOptions = [
    { key: 'REVENUE', label: 'Receita' }, { key: 'QUANTITY', label: 'Quantidade' },
    { key: 'TURNOVER', label: 'Velocidade' }, { key: 'TREND', label: 'Tendência' }, { key: 'NAME', label: 'Nome' },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={(e) => { e.preventDefault(); const n = new URLSearchParams(searchParams); setPage(0); searchInput.trim() ? n.set('search', searchInput.trim()) : n.delete('search'); setSearchParams(n); }} className="flex w-full gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-soft)' }} />
            <input className="input pl-9 sm:w-72" aria-label="Buscar produto" placeholder="Buscar produto..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <Button type="submit">Buscar</Button>
          {querySearch && <Button variant="ghost" type="button" onClick={() => { setSearchInput(''); setPage(0); const n = new URLSearchParams(searchParams); n.delete('search'); setSearchParams(n); }}>Limpar</Button>}
        </form>
        <input className="input sm:w-52" aria-label="Filtrar categoria" placeholder="Filtrar categoria" value={category} onChange={(e) => { setPage(0); setCategory(e.target.value); }} />
        <p className="ml-auto text-sm" style={{ color: 'var(--text-muted)' }}>{totalElements} produtos</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {sortOptions.map((opt) => (
          <button key={opt.key} type="button" onClick={() => { setPage(0); setSortBy(opt.key as any); }}
            className="rounded-full px-4 py-2 text-[14px] font-semibold transition"
            style={sortBy === opt.key
              ? { border: '1px solid var(--fx-forest)', background: 'var(--fx-forest)', color: '#fff' }
              : { border: '1px solid var(--fx-line-2)', background: '#fff', color: 'var(--fx-ink-2)' }}>
            {opt.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>
      ) : products.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}><p style={{ color: 'var(--text-muted)' }}>Nenhum produto encontrado.</p></div>
      ) : (
        <div className="fx-split wide-left even">
          <div className="fx-card fx-card-pad fx-col">
          <PagedBox page={page} pages={Math.max(1, totalPages)} total={totalElements} size={size} onPage={setPage} label="produtos" resetKey={`${category}:${querySearch}:${sortBy}`}>
          <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {/* Lista, não grade de cartões: comparar dezenas de produtos exige
                ler as mesmas colunas de relance, não rolar fotos. */}
            {products.map((product) => {
              const status = statusLabel(product);
              const trend = Number(product.revenueTrendPercentage || 0);
              const on = current?.productId === product.productId;
              return (
                <li key={product.productId}>
                  <button type="button" onClick={() => setSelected(product.productId)} aria-current={on || undefined}
                    className={`fx-row ${on ? 'selected' : ''}`} style={{ flexWrap: 'wrap' }}>
                    <Thumb name={product.name || ''} src={product.imageUrl} size={48} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate" style={{ fontSize: 15.5 }}>{product.name}</b>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px]" style={{ color: 'var(--fx-muted)' }}>
                        <span className="fx-chip" style={{ ...status.style, fontSize: 12, padding: '1px 9px' }}>{status.text}</span>
                        {product.category || 'Sem categoria'}
                      </span>
                    </span>
                    <span className="grid grid-cols-3 gap-4 text-right" style={{ minWidth: 0 }}>
                      <span><small className="block text-[12px]" style={{ color: 'var(--fx-muted)' }}>90 dias</small><b className="fx-num text-[14.5px]">{fmtMoney(product.revenue)}</b></span>
                      <span><small className="block text-[12px]" style={{ color: 'var(--fx-muted)' }}>por dia</small><b className="fx-num text-[14.5px]">{formatDecimal(Number(product.salesVelocity || 0), 1)} un.</b></span>
                      <span><small className="block text-[12px]" style={{ color: 'var(--fx-muted)' }}>tendência</small>
                        <b className="fx-num inline-flex items-center gap-1 text-[14.5px]" style={{ color: trend > 3 ? 'var(--fx-green)' : trend < -3 ? 'var(--fx-red)' : 'var(--fx-muted)' }}><TrendIcon value={trend} />{trend > 0 ? '+' : ''}{formatDecimal(trend, 1)}%</b></span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          </PagedBox>
          </div>
          {current && (
            <Forest as="aside" aria-label="Produto selecionado" className="fx-sticky" key={current.productId}>
              <PanelTitle icon={Package} title="Detalhe do produto" sub="O que as vendas dizem sobre ele" />
              <div className="flex items-center gap-4" style={{ marginTop: 20 }}>
                <Thumb name={current.name || ''} src={current.imageUrl} size={84} />
                <div className="min-w-0">
                  <span className="fx-chip lime" style={{ marginBottom: 6 }}>{statusLabel(current).text}</span>
                  <h3 style={{ margin: 0, fontSize: 'clamp(20px, 2vw, 26px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.15 }}>{current.name}</h3>
                  <p className="fx-muted" style={{ margin: '4px 0 0' }}>{current.category || 'Sem categoria'}</p>
                </div>
              </div>
              <div className="fx-kpis" style={{ marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                <div className="fx-kpi"><span>Receita em 90 dias</span><b style={{ fontSize: 22 }}>{fmtMoney(current.revenue)}</b></div>
                <div className="fx-kpi"><span>Vende por dia</span><b style={{ fontSize: 22 }}>{formatDecimal(Number(current.salesVelocity || 0), 1)}</b><small>unidades</small></div>
                <div className="fx-kpi"><span>Tendência</span><b style={{ fontSize: 22, color: Number(current.revenueTrendPercentage || 0) < -3 ? 'var(--fx-red)' : 'var(--fx-green)' }}>{Number(current.revenueTrendPercentage || 0) > 0 ? '+' : ''}{formatDecimal(Number(current.revenueTrendPercentage || 0), 1)}%</b></div>
              </div>
              <div style={{ marginTop: 22 }}>
                <ActionHub icon={Package} onForest label="O que fazer com este produto" actions={[
                  productIds.has(current.productId)
                    ? { label: 'Já está na lista', icon: ListChecks, to: '/app/lista-compras' }
                    : { label: 'Adicionar à lista', icon: Plus, onClick: () => { void addItem({ productId: current.productId, quantityTarget: Math.max(1, Math.round(Number(current.salesVelocity || 0) || 1)), sourceTag: 'PRODUTOS', reasonSummary: `Adicionar ${current.name} à lista.` }); } },
                  { label: 'Ver histórico', icon: History, to: `/app/produtos/${current.productId}` },
                  { label: 'Perguntar sobre ele', icon: MessageCircleQuestion, to: `/app/perguntar?q=${encodeURIComponent(`Como está vendendo ${current.name}?`)}` },
                ]} />
              </div>
            </Forest>
          )}
        </div>
      )}

    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL — CATÁLOGO
════════════════════════════════════════════════════════════ */

type ProductsFilter = 'tracao' | 'todos' | Why;

const FILTER_LABEL: Record<ProductsFilter, string> = {
  tracao: 'Puxam venda', todos: 'Todos', acabando: 'Acabando', caindo: 'Vendendo menos', subindo: 'Em alta', parado: 'Parados',
};

/**
 * Produtos: uma lista só com busca. Os filtros (acabando, vendendo menos, em
 * alta, parados) mostram um produto de cada vez com o motivo e a ação; combos
 * e previsão ficam na ficha de cada produto.
 */
const Products: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const { dashboard } = useMarketData();
  const attention = useMemo(() => attentionList(dashboard), [dashboard]);
  const count = (w: Why) => attention.filter((a) => a.why === w).length;
  // Abre em quem puxa a venda: é a decisão central (onde pôr o capital).
  const filter = (params.get('filtro') as ProductsFilter) || 'tracao';
  const setFilter = (f: ProductsFilter) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (f === 'tracao') next.delete('filtro'); else next.set('filtro', f);
    return next;
  }, { replace: true });
  const low = count('acabando');
  const down = count('caindo');

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <PageHero
          title={<>Como vai <mark>cada produto.</mark></>}
          subtitle={[low ? `${low} acabando` : '', down ? `${down} vendendo menos` : ''].filter(Boolean).join(' · ')
            ? <>{[low ? `${low} acabando` : '', down ? `${down} vendendo menos` : ''].filter(Boolean).join(' · ')}. O que fazer com eles está em <a href="/app/decidir">Decidir</a>.</>
            : 'Busque um produto para ver venda, preço, tração e estoque.'}
          side={<ActionHub icon={HxPackage} actions={[
            { label: `Acabando${low ? ` (${low})` : ''}`, icon: HxZap, onClick: () => setFilter('acabando') },
            { label: `Vendendo menos${down ? ` (${down})` : ''}`, icon: HxTrendingUp, onClick: () => setFilter('caindo') },
            { label: 'Puxam venda', icon: HxCombine, onClick: () => setFilter('tracao') },
          ]} />} />

        <div className="fx-filters" role="group" aria-label="Filtrar produtos">
          {(['tracao', 'todos', 'acabando', 'caindo', 'subindo', 'parado'] as ProductsFilter[]).map((f) => {
            const n = f === 'todos' || f === 'tracao' ? 0 : count(f as Why);
            if (f !== 'todos' && f !== 'tracao' && n === 0) return null;
            return <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{FILTER_LABEL[f]}{n > 0 ? ` (${n})` : ''}</button>;
          })}
        </div>

        {filter === 'tracao' ? <TractionList /> : filter === 'todos' ? <DesempenhoTab /> : <ProductAttention items={attention.filter((a) => a.why === filter)} />}
      </div>
    </Layout>
  );
};

export default Products;
