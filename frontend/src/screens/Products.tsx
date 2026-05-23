import React, { useEffect, useMemo, useState } from 'react';
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
  Search, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight,
  ShoppingCart, Zap, Map, ArrowRight, RefreshCw, Plus,
} from 'lucide-react';

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
    if (!marketId) { setLoading(false); return; }
    setLoading(true);
    marketService.getProductPerformance(marketId, page, size, category || undefined, querySearch || undefined, sortBy)
      .then((data) => { setPageData(data); setError(null); })
      .catch((err: any) => { setError(err?.message || 'Erro ao carregar produtos'); setPageData(null); })
      .finally(() => setLoading(false));
  }, [marketId, page, size, category, querySearch, sortBy]);

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
        <form onSubmit={(e) => { e.preventDefault(); const n = new URLSearchParams(searchParams); setPage(0); searchInput.trim() ? n.set('search', searchInput.trim()) : n.delete('search'); setSearchParams(n); }} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-soft)' }} />
            <input className="h-10 rounded-lg pl-9 pr-4 text-sm outline-none" style={{ ...inputStyle, width: 240 }} placeholder="Buscar produto..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <Button type="submit">Buscar</Button>
          {querySearch && <Button variant="ghost" type="button" onClick={() => { setSearchInput(''); setPage(0); const n = new URLSearchParams(searchParams); n.delete('search'); setSearchParams(n); }}>Limpar</Button>}
        </form>
        <input className="h-10 rounded-lg px-3 text-sm outline-none" style={{ ...inputStyle, width: 180 }} placeholder="Filtrar categoria" value={category} onChange={(e) => { setPage(0); setCategory(e.target.value); }} />
        <p className="ml-auto text-sm" style={{ color: 'var(--text-muted)' }}>{totalElements} produtos</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {sortOptions.map((opt) => (
          <button key={opt.key} type="button" onClick={() => { setPage(0); setSortBy(opt.key as any); }}
            className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
            style={sortBy === opt.key
              ? { border: '1px solid var(--brand-600)', background: 'var(--surface-success)', color: 'var(--brand-700)' }
              : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => {
            const status = statusLabel(product);
            const trend = Number(product.revenueTrendPercentage || 0);
            return (
              <article key={product.productId} onClick={() => navigate(`/app/produtos/${product.productId}`)}
                className="flex cursor-pointer flex-col rounded-xl transition hover:-translate-y-0.5"
                style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                <div className="flex h-40 items-center justify-center overflow-hidden rounded-t-xl p-4">
                  <ProductImage src={product.imageUrl} alt={product.name} className="max-h-full max-w-full object-contain" />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={status.style}>{status.text}</span>
                    <div className="flex items-center gap-1">
                      <TrendIcon value={trend} />
                      <span className={`text-xs font-medium ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : ''}`} style={!trend ? { color: 'var(--text-soft)' } : {}}>
                        {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <h3 className="line-clamp-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{product.name}</h3>
                  <p className="line-clamp-1 text-xs" style={{ color: 'var(--text-soft)' }}>{product.category || 'Sem categoria'}</p>
                  <div className="mt-auto grid grid-cols-2 gap-2 border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
                    <div><span className="text-[10px]" style={{ color: 'var(--text-soft)' }}>Receita</span><p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(product.revenue)}</p></div>
                    <div><span className="text-[10px]" style={{ color: 'var(--text-soft)' }}>Vendas/dia</span><p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{Number(product.salesVelocity || 0).toFixed(1)}/dia</p></div>
                    {product.momentumScore != null && (
                      <div className="col-span-2">
                        <span className="text-[10px]" style={{ color: 'var(--text-soft)' }}>Momentum</span>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                            <div className="h-full rounded-full transition-all" style={{
                              width: `${Math.min(100, Math.max(4, (Number(product.momentumScore) / 2) * 100))}%`,
                              background: Number(product.momentumScore) >= 1.1 ? '#22c55e' : Number(product.momentumScore) >= 0.85 ? '#f59e0b' : '#ef4444',
                            }} />
                          </div>
                          <span className="text-[11px] font-semibold shrink-0" style={{ color: Number(product.momentumScore) >= 1.1 ? '#166534' : Number(product.momentumScore) >= 0.85 ? '#92400e' : '#991b1b' }}>
                            {Number(product.momentumScore).toFixed(2)}×
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  {product.healthScore != null && (
                    <div className="mt-1">
                      <div className="mb-0.5 flex items-center justify-between">
                        <span className="text-[10px]" style={{ color: 'var(--text-soft)' }}>Saúde</span>
                        <span className="text-[10px] font-semibold" style={{ color: Number(product.healthScore) >= 60 ? 'var(--brand-700)' : Number(product.healthScore) >= 35 ? '#92400e' : '#991b1b' }}>{Number(product.healthScore).toFixed(0)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Number(product.healthScore))}%`, background: Number(product.healthScore) >= 60 ? 'var(--brand-500)' : Number(product.healthScore) >= 35 ? '#f59e0b' : '#ef4444' }} />
                      </div>
                    </div>
                  )}
                  <div className="mt-1 flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <ShoppingListButton inList={productIds.has(product.productId)} onAdd={async () => addItem({ productId: product.productId, quantityTarget: Math.max(1, Math.round(Number(product.salesVelocity || 0) || 1)), sourceTag: 'PRODUTOS', reasonSummary: `Adicionar ${product.name} à lista.` })} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && pageData && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button type="button" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-40" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Página <strong>{pageData.number + 1}</strong> de <strong>{totalPages}</strong></span>
          <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-40" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   ABA 2 — COMBOS (market basket)
════════════════════════════════════════════════════════════ */

interface BasketRule {
  antecedent?: string[]; consequent?: string[];
  antecedentNames?: string[]; consequentNames?: string[];
  antecedentImages?: (string | null)[]; consequentImages?: (string | null)[];
  support: number; confidence: number; lift: number;
  leverage?: number | null; pairCount: number;
}

// Classifica força do combo pelo volume absoluto de co-ocorrências e lift
function comboStrength(r: BasketRule): 'hot' | 'warm' | 'cool' {
  const pairs = Number(r.pairCount || 0);
  const lift  = Number(r.lift || 0);
  const conf  = Number(r.confidence || 0);
  if (pairs >= 20 && lift >= 1.5) return 'hot';
  if (pairs >= 8  || conf >= 0.3)  return 'warm';
  return 'cool';
}

// Traduz métricas estatísticas em orientações de gôndola
function comboInsight(r: BasketRule): string {
  const conf = Number(r.confidence || 0);
  const lift = Number(r.lift || 0);
  const pairs = Number(r.pairCount || 0);
  if (conf >= 0.5 && lift >= 2)
    return `Quem compra um, compra o outro em ${Math.round(conf * 100)}% das vezes — posicione lado a lado ou crie combo de preço.`;
  if (lift >= 2)
    return `${lift.toFixed(1)}× mais provável de serem comprados juntos do que separados — vale destacar na gôndola.`;
  if (pairs >= 20)
    return `Já foram comprados juntos ${pairs} vezes — um dos combos mais frequentes da loja.`;
  return `Aparecem juntos em ${Math.round(conf * 100)}% das cestas — teste posicionamento próximo por 30 dias.`;
}

const STRENGTH_CFG = {
  hot:  { label: '🔥 Top combo',        dot: '#22c55e', border: 'var(--border-success)', bg: 'var(--surface-success)', textColor: 'var(--brand-700)', barColor: '#22c55e' },
  warm: { label: '👍 Boa dupla',         dot: '#f59e0b', border: '#fde68a',              bg: '#fffbeb',                textColor: '#92400e',          barColor: '#f59e0b' },
  cool: { label: '📊 Par emergente',     dot: '#94a3b8', border: 'var(--border-soft)',   bg: 'var(--surface-base)',    textColor: 'var(--text-muted)', barColor: '#94a3b8' },
} as const;

// Mini foto de produto com fallback genérico
const ComboProductPhoto: React.FC<{ src?: string | null; name: string; size?: number }> = ({ src, name, size = 72 }) => {
  const [broken, setBroken] = React.useState(false);
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return src && !broken ? (
    <img src={src} alt={name} onError={() => setBroken(true)} loading="lazy"
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: 10, background: 'var(--surface-muted)', padding: 4 }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: 10, background: 'var(--surface-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: size * 0.28, fontWeight: 700, color: 'var(--text-soft)' }}>{initials || '?'}</span>
    </div>
  );
};

const CombosTab: React.FC<{ marketId: string }> = ({ marketId }) => {
  const [rules, setRules] = useState<BasketRule[]>([]);
  const [useCached, setUseCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'hot' | 'warm'>('all');

  const load = async () => {
    setLoading(true);
    try {
      const data = useCached
        ? await marketService.getCachedMarketBasket(marketId)
        : await analyticsService.getMarketBasket(marketId);
      setRules(data || []); setError(null);
    } catch (err: any) { setRules([]); setError(err?.message || 'Erro ao carregar combos'); }
    finally { setLoading(false); setLoaded(true); }
  };

  useEffect(() => { load(); }, [marketId, useCached]); // eslint-disable-line

  // Deduplica pares: só a direção com maior confidence fica
  const deduped = useMemo(() => {
    const seen = new Map<string, BasketRule>();
    rules.forEach((r) => {
      const key = [(r.antecedent || [])[0] || '', (r.consequent || [])[0] || ''].sort().join('|');
      const existing = seen.get(key);
      if (!existing || Number(r.confidence) > Number(existing.confidence)) seen.set(key, r);
    });
    return Array.from(seen.values());
  }, [rules]);

  const filtered = useMemo(() =>
    filter === 'all' ? deduped : deduped.filter((r) => comboStrength(r) === filter),
  [deduped, filter]);

  const hotCount  = useMemo(() => deduped.filter((r) => comboStrength(r) === 'hot').length,  [deduped]);
  const warmCount = useMemo(() => deduped.filter((r) => comboStrength(r) === 'warm').length, [deduped]);
  const topRule   = deduped[0];
  const maxPairs  = useMemo(() => Math.max(...deduped.map((r) => Number(r.pairCount || 0)), 1), [deduped]);

  return (
    <div className="flex flex-col gap-5">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={useCached} onChange={(e) => setUseCached(e.target.checked)} className="accent-green-600" />
          {useCached ? 'Cache noturno' : 'Ao vivo'}
        </label>
        <button type="button" onClick={load} disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition"
          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* KPIs */}
      {loaded && deduped.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Pares encontrados</span>
            <p className="mt-1 text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{deduped.length}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-soft)' }}>nos últimos 90 dias</p>
          </div>
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-success)', background: 'var(--surface-success)' }}>
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Top combos</span>
            <p className="mt-1 text-3xl font-bold" style={{ color: 'var(--brand-700)' }}>{hotCount}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-600)' }}>alta frequência + forte afinidade</p>
          </div>
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Par mais frequente</span>
            {topRule ? (
              <>
                <p className="mt-1 text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{topRule.pairCount}×</p>
                <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-soft)' }}>
                  {(topRule.antecedentNames || [])[0]} + {(topRule.consequentNames || [])[0]}
                </p>
              </>
            ) : <p className="mt-1 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>—</p>}
          </div>
        </div>
      )}

      {/* insight destaque */}
      {topRule && (
        <div className="flex items-start gap-3 rounded-xl p-4" style={{ border: '1px solid var(--border-success)', background: 'var(--surface-success)' }}>
          <Zap className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--brand-600)' }} />
          <p className="text-sm" style={{ color: 'var(--brand-700)' }}>
            <strong>{(topRule.antecedentNames || [])[0]}</strong> e <strong>{(topRule.consequentNames || [])[0]}</strong> são
            o par mais comprado junto da sua loja — {topRule.pairCount} cestas em 90 dias.
            {hotCount > 1 && ` Há mais ${hotCount - 1} combos quentes para explorar.`}
          </p>
        </div>
      )}

      {/* filtros */}
      {deduped.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'all',  label: 'Todos',          count: deduped.length },
            { key: 'hot',  label: '🔥 Top combos',  count: hotCount  },
            { key: 'warm', label: '👍 Boas duplas',  count: warmCount },
          ] as const).map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)}
              className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
              style={filter === f.key
                ? { background: 'var(--brand-500)', color: '#fff', border: '1px solid var(--brand-600)' }
                : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
              {f.label} <span className="ml-1 opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
          <ShoppingCart className="mx-auto mb-3 h-8 w-8 opacity-30" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {deduped.length === 0 ? 'Nenhum combo encontrado' : 'Nenhum combo nesta categoria'}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {deduped.length === 0
              ? 'São necessários pelo menos 3 cupons com os dois produtos juntos.'
              : 'Tente o filtro "Todos" para ver todos os pares.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((rule, idx) => {
            const nameA   = (rule.antecedentNames || [])[0] || 'Produto A';
            const nameB   = (rule.consequentNames || [])[0] || 'Produto B';
            const imgA    = (rule.antecedentImages || [])[0] ?? null;
            const imgB    = (rule.consequentImages || [])[0] ?? null;
            const conf    = Number(rule.confidence || 0);
            const lift    = Number(rule.lift || 0);
            const pairs   = Number(rule.pairCount || 0);
            const strength = comboStrength(rule);
            const cfg      = STRENGTH_CFG[strength];
            const barPct   = Math.round((pairs / maxPairs) * 100);
            const insight  = comboInsight(rule);

            return (
              <article key={idx} className="flex flex-col rounded-xl overflow-hidden"
                style={{ border: `1.5px solid ${cfg.border}`, background: cfg.bg }}>

                {/* header badge */}
                <div className="flex items-center justify-between px-4 pt-3 pb-0">
                  <span className="text-xs font-bold" style={{ color: 'var(--text-soft)' }}>#{idx + 1}</span>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ background: cfg.dot + '22', color: cfg.textColor, border: `1px solid ${cfg.dot}44` }}>
                    {cfg.label}
                  </span>
                </div>

                {/* par visual: foto + conector + foto */}
                <div className="flex items-center justify-center gap-3 px-4 py-4">
                  <div className="flex flex-col items-center gap-1.5" style={{ maxWidth: 80 }}>
                    <ComboProductPhoto src={imgA} name={nameA} size={72} />
                    <p className="text-center text-[11px] font-semibold leading-tight line-clamp-2"
                      style={{ color: 'var(--text-primary)' }}>{nameA}</p>
                  </div>

                  {/* conector central com % de confiança */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold"
                      style={{ background: cfg.dot, color: '#fff' }}>+</div>
                    <span className="text-[10px] font-semibold whitespace-nowrap"
                      style={{ color: cfg.textColor }}>{Math.round(conf * 100)}% juntos</span>
                  </div>

                  <div className="flex flex-col items-center gap-1.5" style={{ maxWidth: 80 }}>
                    <ComboProductPhoto src={imgB} name={nameB} size={72} />
                    <p className="text-center text-[11px] font-semibold leading-tight line-clamp-2"
                      style={{ color: 'var(--text-primary)' }}>{nameB}</p>
                  </div>
                </div>

                {/* métricas em linha */}
                <div className="grid grid-cols-3 divide-x border-t"
                  style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-base)' }}>
                  <div className="flex flex-col items-center py-2.5 px-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Cestas</span>
                    <span className="mt-0.5 text-base font-bold" style={{ color: 'var(--text-primary)' }}>{pairs}</span>
                  </div>
                  <div className="flex flex-col items-center py-2.5 px-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Afinidade</span>
                    <span className="mt-0.5 text-base font-bold" style={{ color: lift >= 2 ? 'var(--brand-700)' : 'var(--text-primary)' }}>{lift.toFixed(1)}×</span>
                  </div>
                  <div className="flex flex-col items-center py-2.5 px-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Juntos</span>
                    <span className="mt-0.5 text-base font-bold" style={{ color: 'var(--text-primary)' }}>{Math.round(conf * 100)}%</span>
                  </div>
                </div>

                {/* barra de frequência relativa */}
                <div className="px-4 pt-2 pb-1" style={{ background: 'var(--surface-base)' }}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px]" style={{ color: 'var(--text-soft)' }}>Frequência relativa ao par mais comum</span>
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>{barPct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(barPct, 3)}%`, background: cfg.barColor }} />
                  </div>
                </div>

                {/* insight de ação */}
                <div className="px-4 pt-2 pb-3" style={{ background: 'var(--surface-base)' }}>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-soft)' }}>{insight}</p>
                </div>

                {/* CTAs */}
                <div className="flex gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-base)' }}>
                  <Link to="/app/mapa-loja"
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold no-underline transition hover:opacity-80"
                    style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}>
                    <Map className="h-3 w-3" /> Organizar loja
                  </Link>
                  <Link to="/app/promocoes"
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold no-underline transition hover:opacity-80"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
                    Criar promoção <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   ABA 3 — PREVISÃO DE VENDAS
════════════════════════════════════════════════════════════ */

interface ForecastRow {
  forecastDate: string; productId: string; productName: string;
  predictedQuantity: number; confidenceLow?: number; confidenceHigh?: number;
  trendDirection?: 'UP' | 'DOWN' | 'STABLE';
}

const ForecastTrendIcon: React.FC<{ direction?: string }> = ({ direction }) => {
  if (direction === 'UP') return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
  if (direction === 'DOWN') return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5" style={{ color: 'var(--text-soft)' }} />;
};

const PrevisaoTab: React.FC<{ marketId: string }> = ({ marketId }) => {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await marketService.getDemandForecast(marketId, days);
      setRows((data || []).sort((a: ForecastRow, b: ForecastRow) => Number(b.predictedQuantity || 0) - Number(a.predictedQuantity || 0)));
      setError(null);
    } catch (err: any) { setError(err?.message || 'Erro ao carregar previsão'); setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [marketId, days]); // eslint-disable-line

  const totalPredicted = useMemo(() => rows.reduce((s, r) => s + Number(r.predictedQuantity || 0), 0), [rows]);
  const maxQty = useMemo(() => Math.max(...rows.map((r) => Number(r.predictedQuantity || 0)), 1), [rows]);
  const grouped = useMemo(() => {
    const map = new Map<string, ForecastRow[]>();
    rows.forEach((r) => { if (!map.has(r.forecastDate)) map.set(r.forecastDate, []); map.get(r.forecastDate)!.push(r); });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
            <button type="button" onClick={() => setDays((d) => Math.max(1, d - 1))} className="px-2 py-1.5 transition" style={{ color: 'var(--text-muted)' }}><Minus className="h-4 w-4" /></button>
            <span className="min-w-[3ch] text-center text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{days}</span>
            <button type="button" onClick={() => setDays((d) => Math.min(30, d + 1))} className="px-2 py-1.5 transition" style={{ color: 'var(--text-muted)' }}><Plus className="h-4 w-4" /></button>
          </div>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>dias</span>
          <button type="button" onClick={load} disabled={loading} className="flex h-9 w-9 items-center justify-center rounded-lg transition" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Produtos previstos', value: rows.length },
          { label: 'Volume estimado', value: `${totalPredicted.toFixed(0)} un` },
          { label: 'Maior demanda', value: rows[0] ? `${Number(rows[0].predictedQuantity).toFixed(0)} un` : '—', sub: rows[0]?.productName, highlight: true },
        ].map((k) => (
          <div key={k.label} className="rounded-xl p-4" style={{ border: `1px solid ${(k as any).highlight && rows[0] ? 'var(--border-success)' : 'var(--border-soft)'}`, background: (k as any).highlight && rows[0] ? 'var(--surface-success)' : 'var(--surface-base)' }}>
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{k.label}</span>
            <p className="mt-1 text-2xl font-bold" style={{ color: (k as any).highlight && rows[0] ? 'var(--brand-700)' : 'var(--text-primary)' }}>{k.value}</p>
            {(k as any).sub && <p className="text-xs truncate" style={{ color: 'var(--text-soft)' }}>{(k as any).sub}</p>}
          </div>
        ))}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}><p style={{ color: 'var(--text-muted)' }}>Nenhuma previsão disponível.</p></div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                <span className="rounded px-2 py-0.5 text-xs" style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                  {new Date(date).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <span className="text-xs font-normal" style={{ color: 'var(--text-soft)' }}>{items.length} produtos</span>
              </h3>
              <div className="flex flex-col gap-2">
                {items.map((row, idx) => {
                  const pct = (Number(row.predictedQuantity || 0) / maxQty) * 100;
                  return (
                    <div key={`${row.productId}-${idx}`} className="flex items-center gap-3 rounded-lg p-3" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: 'var(--surface-muted)', color: 'var(--text-soft)' }}>{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{row.productName || row.productId}</p>
                          <ForecastTrendIcon direction={row.trendDirection} />
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${Math.max(pct, 2)}%` }} />
                        </div>
                        {row.confidenceLow != null && row.confidenceHigh != null && (
                          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-soft)' }}>Intervalo: {Number(row.confidenceLow).toFixed(0)}–{Number(row.confidenceHigh).toFixed(0)} un</p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{Number(row.predictedQuantity || 0).toFixed(0)} un</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL — CATÁLOGO
════════════════════════════════════════════════════════════ */

type ProductsTab = 'desempenho' | 'combos' | 'previsao';

const Products: React.FC = () => {
  const { marketId } = useAuth();
  const [tab, setTab] = useState<ProductsTab>('desempenho');

  const TABS: Array<{ key: ProductsTab; label: string; icon: React.ReactNode }> = [
    { key: 'desempenho', label: 'Desempenho', icon: <TrendingUp className="h-4 w-4" /> },
    { key: 'combos', label: 'Combos', icon: <ShoppingCart className="h-4 w-4" /> },
    { key: 'previsao', label: 'Previsão', icon: <Zap className="h-4 w-4" /> },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Produtos</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Desempenho, combos e previsão de demanda</p>
        </div>

        <div className="flex gap-1 rounded-xl p-1 w-fit" style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)' }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
              style={tab === t.key
                ? { background: 'var(--surface-base)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                : { color: 'var(--text-muted)' }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === 'desempenho' && <DesempenhoTab />}
        {tab === 'combos' && marketId && <CombosTab marketId={marketId} />}
        {tab === 'previsao' && marketId && <PrevisaoTab marketId={marketId} />}
      </div>
    </Layout>
  );
};

export default Products;
