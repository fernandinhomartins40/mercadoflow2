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
  support: number; confidence: number; lift: number;
  leverage?: number | null; pairCount: number;
}

function comboStrength(r: BasketRule): 'strong' | 'moderate' | 'mild' {
  const pairs = Number(r.pairCount || 0); const lift = Number(r.lift || 0); const conf = Number(r.confidence || 0);
  if (pairs >= 20 && lift >= 1.5) return 'strong';
  if (pairs >= 8 || conf >= 0.35) return 'moderate';
  return 'mild';
}

const STRENGTH_CFG = {
  strong:   { label: 'Tração forte',      tip: 'Posicione lado a lado na loja e crie combo de preço', badgeStyle: { background: 'var(--surface-success)', color: 'var(--brand-700)' }, barColor: 'var(--brand-500)' },
  moderate: { label: 'Boa afinidade',     tip: 'Destaque na gôndola ou encarte juntos',               badgeStyle: { background: 'var(--surface-warning)', color: '#92400e' }, barColor: '#f59e0b' },
  mild:     { label: 'Relação emergente', tip: 'Acompanhe nos próximos 30 dias',                       badgeStyle: { background: 'var(--surface-muted)', color: 'var(--text-muted)' }, barColor: '#94a3b8' },
} as const;

const CombosTab: React.FC<{ marketId: string }> = ({ marketId }) => {
  const [rules, setRules] = useState<BasketRule[]>([]);
  const [useCached, setUseCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'strong' | 'moderate'>('all');

  const load = async () => {
    setLoading(true);
    try {
      const data = useCached ? await marketService.getCachedMarketBasket(marketId) : await analyticsService.getMarketBasket(marketId);
      setRules(data || []); setError(null);
    } catch (err: any) { setRules([]); setError(err?.message || 'Erro ao carregar combos'); }
    finally { setLoading(false); setLoaded(true); }
  };

  useEffect(() => { load(); }, [marketId, useCached]); // eslint-disable-line

  const maxPairCount = useMemo(() => Math.max(...rules.map((r) => Number(r.pairCount || 0)), 1), [rules]);
  const filtered = useMemo(() => filter === 'all' ? rules : rules.filter((r) => comboStrength(r) === filter), [rules, filter]);
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    return filtered.filter((r) => { const key = [(r.antecedent || [])[0] || '', (r.consequent || [])[0] || ''].sort().join('|'); if (seen.has(key)) return false; seen.add(key); return true; });
  }, [filtered]);
  const strongCount = useMemo(() => rules.filter((r) => comboStrength(r) === 'strong').length, [rules]);
  const topRule = rules[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={useCached} onChange={(e) => setUseCached(e.target.checked)} className="accent-green-600" />
            {useCached ? 'Cache noturno' : 'Ao vivo'}
          </label>
          <button type="button" onClick={load} disabled={loading} className="flex h-9 w-9 items-center justify-center rounded-lg transition" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {loaded && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Combos encontrados', value: rules.length },
            { label: 'Tração forte', value: strongCount, highlight: strongCount > 0 },
            { label: 'Maior co-ocorrência', value: topRule ? `${topRule.pairCount} cestas` : '—', sub: topRule ? `${(Number(topRule.confidence || 0) * 100).toFixed(0)}% juntos` : undefined },
            { label: 'Melhor lift', value: rules.length > 0 ? `${Math.max(...rules.map((r) => Number(r.lift || 0))).toFixed(1)}×` : '—', sub: 'acima do acaso' },
          ].map((k, i) => (
            <div key={i} className="rounded-xl p-4" style={{ border: `1px solid ${(k as any).highlight ? 'var(--border-success)' : 'var(--border-soft)'}`, background: (k as any).highlight ? 'var(--surface-success)' : 'var(--surface-base)' }}>
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{k.label}</span>
              <p className="mt-1 text-2xl font-bold" style={{ color: (k as any).highlight ? 'var(--brand-700)' : 'var(--text-primary)' }}>{k.value}</p>
              {(k as any).sub && <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{(k as any).sub}</p>}
            </div>
          ))}
        </div>
      )}

      {rules.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl p-4" style={{ border: '1px solid var(--border-success)', background: 'var(--surface-success)' }}>
          <Zap className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--brand-600)' }} />
          <p className="text-sm" style={{ color: 'var(--brand-700)' }}>
            {rules.length === 0 ? 'Ainda não há dados suficientes.' : (() => {
              const nameA = (topRule.antecedentNames || [])[0] || 'Produto A';
              const nameB = (topRule.consequentNames || [])[0] || 'Produto B';
              const confPct = (Number(topRule.confidence || 0) * 100).toFixed(0);
              return `${nameA} e ${nameB} são comprados juntos em ${confPct}% das cestas.${strongCount > 0 ? ` Há ${strongCount} combos com tração forte.` : ''}`;
            })()}
          </p>
        </div>
      )}

      {rules.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(['all', 'strong', 'moderate'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
              style={filter === f ? { background: 'var(--brand-500)', color: '#fff', border: '1px solid var(--brand-600)' } : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
              {f === 'all' ? 'Todos' : f === 'strong' ? 'Tração forte' : 'Boa afinidade'}
              {f !== 'all' && <span className="ml-1.5 opacity-70">{f === 'strong' ? strongCount : rules.filter((r) => comboStrength(r) === 'moderate').length}</span>}
            </button>
          ))}
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>
      ) : deduped.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
          <ShoppingCart className="mx-auto mb-3 h-8 w-8 opacity-30" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Nenhum combo encontrado</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>São necessários pelo menos 3 cupons com os dois produtos juntos para aparecer aqui.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deduped.map((rule, idx) => {
            const nameA = (rule.antecedentNames || rule.antecedent || []).join(', ') || 'Produto A';
            const nameB = (rule.consequentNames || rule.consequent || []).join(', ') || 'Produto B';
            const confPct = (Number(rule.confidence || 0) * 100).toFixed(0);
            const pairPct = Math.round((Number(rule.pairCount || 0) / maxPairCount) * 100);
            const strength = comboStrength(rule);
            const cfg = STRENGTH_CFG[strength];
            return (
              <article key={idx} className="flex flex-col rounded-xl p-5" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold" style={{ color: 'var(--text-soft)' }}>#{idx + 1}</span>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={cfg.badgeStyle}>{cfg.label}</span>
                </div>
                <div className="mt-3 flex flex-col gap-0.5">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{nameA}</p>
                  <p className="text-xs" style={{ color: 'var(--brand-600)' }}>puxa a compra de</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{nameB}</p>
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>{rule.pairCount} cestas juntos</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{confPct}% das vezes</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pairPct, 4)}%`, background: cfg.barColor }} />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: 'var(--text-soft)' }}>
                  <span>Afinidade <strong style={{ color: 'var(--text-primary)' }}>{Number(rule.lift || 0).toFixed(1)}×</strong></span>
                  {rule.leverage != null && rule.leverage > 0 && <span style={{ color: 'var(--brand-600)' }}>+{(rule.leverage * 100).toFixed(1)}% acima do acaso</span>}
                </div>
                <p className="mt-2 text-xs italic" style={{ color: 'var(--text-muted)' }}>{cfg.tip}</p>
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: 'var(--border-soft)' }}>
                  <Link to="/app/mapa-loja" className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold no-underline transition hover:opacity-80" style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}>
                    <Map className="h-3 w-3" /> Ver no mapa
                  </Link>
                  <Link to="/app/promocoes" className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold no-underline transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
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
