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
  AlertTriangle, Search, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight,
  ShoppingCart, Zap, Map, ArrowRight, RefreshCw, Plus,
} from 'lucide-react';
import { ActionHub, Forest, PageHero, PanelTitle, Thumb } from '../components/flow/Flow';
import ProductAttention, { attentionList } from './produtos/ProductAttention';
import { useMarketData } from '../hooks/useMarketData';
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
  const [pageData, setPageData] = useState<{ content: ProductPerformance[]; totalPages: number; totalElements: number; number: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [size] = useState(20);
  const [category, setCategory] = useState('');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [selected, setSelected] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'REVENUE' | 'QUANTITY' | 'TRANSACTIONS' | 'PRICE' | 'TURNOVER' | 'TREND' | 'PROMO' | 'NAME'>('REVENUE');
  const querySearch = searchParams.get('search') || '';

  const products = useMemo(() => pageData?.content || [], [pageData]);
  const current = products.find((x) => x.productId === selected) ?? products[0] ?? null;
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
        <form onSubmit={(e) => { e.preventDefault(); const n = new URLSearchParams(searchParams); setPage(0); searchInput.trim() ? n.set('search', searchInput.trim()) : n.delete('search'); setSearchParams(n); }} className="flex w-full gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-soft)' }} />
            <input className="input pl-9 sm:w-72" placeholder="Buscar produto..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <Button type="submit">Buscar</Button>
          {querySearch && <Button variant="ghost" type="button" onClick={() => { setSearchInput(''); setPage(0); const n = new URLSearchParams(searchParams); n.delete('search'); setSearchParams(n); }}>Limpar</Button>}
        </form>
        <input className="input sm:w-52" placeholder="Filtrar categoria" value={category} onChange={(e) => { setPage(0); setCategory(e.target.value); }} />
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
        <div className="fx-split wide-left">
          <ul className="fx-card fx-card-pad flex flex-col gap-2" style={{ listStyle: 'none', margin: 0 }}>
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
          {current && (
            <Forest as="aside" aria-label="Produto selecionado" style={{ position: 'sticky', top: 84 }}>
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
    return `${formatDecimal(lift, 1)}× mais provável de serem comprados juntos do que separados — vale destacar na gôndola.`;
  if (pairs >= 20)
    return `Já foram comprados juntos ${pairs} vezes — um dos combos mais frequentes da loja.`;
  return `Aparecem juntos em ${Math.round(conf * 100)}% das cestas — teste posicionamento próximo por 30 dias.`;
}

const STRENGTH_CFG = {
  hot: {
    label: 'Top combo',
    accent: '#16a34a',
    badgeBg: '#dcfce7',
    badgeText: '#15803d',
    connectorBg: '#16a34a',
    metricColor: '#15803d',
    photoBorder: '#bbf7d0',
  },
  warm: {
    label: 'Boa dupla',
    accent: '#d97706',
    badgeBg: '#fef3c7',
    badgeText: '#92400e',
    connectorBg: '#d97706',
    metricColor: '#92400e',
    photoBorder: '#fde68a',
  },
  cool: {
    label: 'Par emergente',
    accent: '#6366f1',
    badgeBg: '#eef2ff',
    badgeText: '#4338ca',
    connectorBg: '#6366f1',
    metricColor: '#4338ca',
    photoBorder: '#c4b5fd',
  },
} as const;

// Mini foto de produto com fallback de iniciais
const ComboProductPhoto: React.FC<{ src?: string | null; name: string; size?: number; borderColor: string; accentColor: string }> = ({ src, name, size = 72, borderColor, accentColor }) => {
  const [broken, setBroken] = React.useState(false);
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return src && !broken ? (
    <img src={src} alt={name} onError={() => setBroken(true)} loading="lazy"
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: 10, background: '#fff', padding: 5, border: `1.5px solid ${borderColor}` }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: 10, background: '#f8fafc', border: `1.5px solid ${borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: size * 0.26, fontWeight: 700, color: accentColor }}>{initials || '?'}</span>
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
  const deduped = useMemo((): BasketRule[] => {
    const seenKeys: string[] = [];
    const seenRules: BasketRule[] = [];
    rules.forEach((r) => {
      const ids = [(r.antecedent || [])[0] || '', (r.consequent || [])[0] || ''];
      ids.sort();
      const key = ids.join('|');
      const existingIdx = seenKeys.indexOf(key);
      if (existingIdx === -1) {
        seenKeys.push(key);
        seenRules.push(r);
      } else if (Number(r.confidence) > Number(seenRules[existingIdx].confidence)) {
        seenRules[existingIdx] = r;
      }
    });
    return seenRules;
  }, [rules]);

  const filtered = useMemo(() =>
    filter === 'all' ? deduped : deduped.filter((r) => comboStrength(r) === filter),
  [deduped, filter]);

  const hotCount  = useMemo(() => deduped.filter((r) => comboStrength(r) === 'hot').length,  [deduped]);
  const warmCount = useMemo(() => deduped.filter((r) => comboStrength(r) === 'warm').length, [deduped]);
  const topRule   = deduped[0];
  const maxPairs  = useMemo(() => deduped.reduce((m, r) => Math.max(m, Number(r.pairCount || 0)), 1), [deduped]);

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
            { key: 'all',  label: 'Todos',       count: deduped.length, activeBg: STRENGTH_CFG.hot.badgeBg,  activeColor: 'var(--text-primary)' },
            { key: 'hot',  label: 'Top combos',  count: hotCount,       activeBg: STRENGTH_CFG.hot.badgeBg,  activeColor: STRENGTH_CFG.hot.badgeText },
            { key: 'warm', label: 'Boas duplas', count: warmCount,      activeBg: STRENGTH_CFG.warm.badgeBg, activeColor: STRENGTH_CFG.warm.badgeText },
          ] as const).map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)}
              className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
              style={filter === f.key
                ? { background: f.activeBg, color: f.activeColor, border: `1px solid ${f.activeColor}33` }
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

            // Barra dinâmica: vermelho < 30%, amarelo 30-65%, verde > 65%
            const barColor = barPct >= 66 ? '#22c55e' : barPct >= 31 ? '#f59e0b' : '#ef4444';

            return (
              <article key={idx} className="flex flex-col rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

                {/* header neutro com badge colorido */}
                <div className="flex items-center justify-between px-4 pt-3 pb-2"
                  style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-soft)' }}>#{idx + 1}</span>
                  <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{ background: cfg.badgeBg, color: cfg.badgeText }}>
                    {cfg.label}
                  </span>
                </div>

                {/* par visual: foto + conector + foto */}
                <div className="flex items-center justify-center gap-2 px-4 py-4">
                  <div className="flex flex-col items-center gap-1.5" style={{ flex: 1, maxWidth: 88 }}>
                    <ComboProductPhoto src={imgA} name={nameA} size={72} borderColor={cfg.photoBorder} accentColor={cfg.accent} />
                    <p className="text-center text-[11px] font-semibold leading-tight line-clamp-2"
                      style={{ color: 'var(--text-primary)' }}>{nameA}</p>
                  </div>

                  {/* conector com cor do tier */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-black"
                      style={{ background: cfg.connectorBg, color: '#fff' }}>+</div>
                    <span className="text-[10px] font-bold whitespace-nowrap rounded-full px-2 py-0.5"
                      style={{ background: cfg.badgeBg, color: cfg.badgeText }}>
                      {Math.round(conf * 100)}% juntos
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1.5" style={{ flex: 1, maxWidth: 88 }}>
                    <ComboProductPhoto src={imgB} name={nameB} size={72} borderColor={cfg.photoBorder} accentColor={cfg.accent} />
                    <p className="text-center text-[11px] font-semibold leading-tight line-clamp-2"
                      style={{ color: 'var(--text-primary)' }}>{nameB}</p>
                  </div>
                </div>

                {/* métricas: fundo neutro, valores coloridos */}
                <div className="grid grid-cols-3 mx-4 mb-3 rounded-lg overflow-hidden"
                  style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
                  <div className="flex flex-col items-center py-2.5 px-1">
                    <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Cestas</span>
                    <span className="mt-0.5 text-base font-black" style={{ color: 'var(--text-primary)' }}>{pairs}</span>
                  </div>
                  <div className="flex flex-col items-center py-2.5 px-1"
                    style={{ borderLeft: '1px solid var(--border-soft)', borderRight: '1px solid var(--border-soft)' }}>
                    <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Afinidade</span>
                    <span className="mt-0.5 text-base font-black" style={{ color: cfg.metricColor }}>{formatDecimal(lift, 1)}x</span>
                  </div>
                  <div className="flex flex-col items-center py-2.5 px-1">
                    <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Juntos</span>
                    <span className="mt-0.5 text-base font-black" style={{ color: cfg.metricColor }}>{Math.round(conf * 100)}%</span>
                  </div>
                </div>

                {/* barra dinâmica: vermelho/amarelo/verde por frequência relativa */}
                <div className="px-4 pb-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px]" style={{ color: 'var(--text-soft)' }}>Frequência relativa</span>
                    <span className="text-[10px] font-bold" style={{ color: barColor }}>{barPct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(barPct, 3)}%`, background: barColor }} />
                  </div>
                </div>

                {/* insight */}
                <div className="px-4 pt-1.5 pb-3">
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-soft)' }}>{insight}</p>
                </div>

                {/* CTAs */}
                <div className="flex gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--border-soft)' }}>
                  <Link to="/app/mapa-loja"
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold no-underline transition hover:opacity-80"
                    style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}>
                    <Map className="h-3.5 w-3.5" /> Organizar loja
                  </Link>
                  <Link to="/app/promocoes"
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold no-underline transition hover:opacity-80"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
                    Promoção <ArrowRight className="h-3.5 w-3.5" />
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
  const maxQty = useMemo(() => rows.reduce((m, r) => Math.max(m, Number(r.predictedQuantity || 0)), 1), [rows]);
  const grouped = useMemo((): [string, ForecastRow[]][] => {
    const keys: string[] = [];
    const buckets: ForecastRow[][] = [];
    rows.forEach((r) => {
      const idx = keys.indexOf(r.forecastDate);
      if (idx === -1) { keys.push(r.forecastDate); buckets.push([r]); }
      else { buckets[idx].push(r); }
    });
    const pairs: [string, ForecastRow[]][] = keys.map((k, i) => [k, buckets[i]]);
    pairs.sort(([a], [b]) => a.localeCompare(b));
    return pairs;
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
          { label: 'Volume estimado', value: `${formatDecimal(totalPredicted, 0)} un` },
          { label: 'Maior demanda', value: rows[0] ? `${formatDecimal(Number(rows[0].predictedQuantity), 0)} un` : '—', sub: rows[0]?.productName, highlight: true },
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
                          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-soft)' }}>Intervalo: {formatDecimal(Number(row.confidenceLow), 0)}–{formatDecimal(Number(row.confidenceHigh), 0)} un</p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{formatDecimal(Number(row.predictedQuantity || 0), 0)} un</span>
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

type ProductsTab = 'atencao' | 'desempenho' | 'combos' | 'previsao';

const Products: React.FC = () => {
  const { marketId } = useAuth();
  const [tab, setTab] = useState<ProductsTab>('atencao');
  const { dashboard } = useMarketData();
  const attention = useMemo(() => attentionList(dashboard), [dashboard]);
  const low = attention.filter((a) => a.why === 'acabando').length;
  const down = attention.filter((a) => a.why === 'caindo').length;

  const TABS: Array<{ key: ProductsTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { key: 'atencao', label: 'Pedem atenção', icon: <AlertTriangle className="h-4 w-4" />, badge: attention.length || undefined },
    { key: 'desempenho', label: 'Todos os produtos', icon: <TrendingUp className="h-4 w-4" /> },
    { key: 'combos', label: 'Combos', icon: <ShoppingCart className="h-4 w-4" /> },
    { key: 'previsao', label: 'Previsão', icon: <Zap className="h-4 w-4" /> },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <PageHero
          title={tab === 'atencao' && attention.length > 0
            ? <>Entenda cada produto. <mark>{attention.length} {attention.length === 1 ? 'pede' : 'pedem'} atenção.</mark></>
            : <>Entenda cada produto. <mark>Decida o próximo passo.</mark></>}
          subtitle={tab === 'atencao' && attention.length > 0
            ? [low ? `${low} acabando` : '', down ? `${down} vendendo menos` : '', 'um de cada vez, com o motivo e o que fazer'].filter(Boolean).join(' · ')
            : 'Desempenho, combos e previsão de demanda de tudo o que a loja vende.'}
          side={<ActionHub icon={HxPackage} actions={[{ label: 'Ver desempenho', icon: HxTrendingUp, onClick: () => setTab('desempenho') }, { label: 'Explorar combos', icon: HxCombine, onClick: () => setTab('combos') }, { label: 'Prever a demanda', icon: HxZap, onClick: () => setTab('previsao') }]} />} />

        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} fit label="Seções da tela" />

        {tab === 'atencao' && <ProductAttention items={attention} />}
        {tab === 'desempenho' && <DesempenhoTab />}
        {tab === 'combos' && marketId && <CombosTab marketId={marketId} />}
        {tab === 'previsao' && marketId && <PrevisaoTab marketId={marketId} />}
      </div>
    </Layout>
  );
};

export default Products;
