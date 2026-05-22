import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/product/ProductImage';
import { useAuth } from '../context/AuthContext';
import { marketService } from '../services/market.service';
import { ProductPromoEffectiveness, PromoWindowSummary } from '../types/analytics.types';
import {
  TrendingUp, TrendingDown, Minus, Zap, AlertTriangle,
  ChevronDown, ChevronUp, ArrowRight, RefreshCw, BarChart2, Tag,
} from 'lucide-react';

/* ─── Formatadores ─── */
const fmtMoney = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
const fmtPct = (v?: number | null, sign = true) => {
  const n = Number(v || 0);
  return `${sign && n > 0 ? '+' : ''}${n.toFixed(1)}%`;
};
const fmtQty = (v?: number | null) => Number(v || 0).toFixed(1);

/* ─── Configuração visual por classificação ─── */
const CLASS_CONFIG: Record<string, {
  bg: string; border: string; text: string; badge: string;
  icon: React.FC<any>; scoreColor: string;
}> = {
  BOOSTER: {
    bg: 'var(--surface-success)', border: 'var(--border-success)',
    text: 'var(--brand-700)', badge: 'var(--brand-600)',
    icon: Zap, scoreColor: 'var(--brand-500)',
  },
  REVENUE_LOSS: {
    bg: '#fff7ed', border: '#fed7aa',
    text: '#9a3412', badge: '#ea580c',
    icon: AlertTriangle, scoreColor: '#f97316',
  },
  BACKFIRE: {
    bg: '#fef2f2', border: '#fecaca',
    text: '#991b1b', badge: '#dc2626',
    icon: TrendingDown, scoreColor: '#ef4444',
  },
  NEUTRAL: {
    bg: 'var(--surface-soft)', border: 'var(--border-soft)',
    text: 'var(--text-primary)', badge: 'var(--text-soft)',
    icon: Minus, scoreColor: '#94a3b8',
  },
  INSUFFICIENT_DATA: {
    bg: 'var(--surface-muted)', border: 'var(--border-soft)',
    text: 'var(--text-muted)', badge: 'var(--text-muted)',
    icon: Minus, scoreColor: '#cbd5e1',
  },
};

const DEFAULT_CFG = CLASS_CONFIG.NEUTRAL;

/* ─── Score ring ─── */
const ScoreRing: React.FC<{ score: number; color: string; size?: number }> = ({ score, color, size = 52 }) => {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="shrink-0 -rotate-90">
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--surface-muted)" strokeWidth="5" />
      <circle
        cx="24" cy="24" r={r} fill="none"
        stroke={color} strokeWidth="5"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
      />
      <text
        x="24" y="24"
        textAnchor="middle" dominantBaseline="central"
        className="rotate-90 origin-center"
        style={{ fontSize: '11px', fontWeight: 700, fill: color, transform: 'rotate(90deg)', transformOrigin: '24px 24px' }}
      >
        {score}
      </text>
    </svg>
  );
};

/* ─── Barra lift ─── */
const LiftBar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => {
  const pct = max > 0 ? Math.min(100, Math.max(0, (Math.abs(value) / max) * 100)) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 3)}%`, background: color }} />
    </div>
  );
};

/* ─── Linha da janela de promoção ─── */
const WindowRow: React.FC<{ w: PromoWindowSummary; idx: number }> = ({ w, idx }) => {
  const isPos = w.outcome === 'POSITIVE';
  const isNeg = w.outcome === 'NEGATIVE';
  return (
    <div
      className="flex flex-col gap-2 rounded-xl p-4"
      style={{
        border: `1px solid ${isPos ? 'var(--border-success)' : isNeg ? '#fecaca' : 'var(--border-soft)'}`,
        background: isPos ? 'var(--surface-success)' : isNeg ? '#fef2f2' : 'var(--surface-soft)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            Janela #{idx + 1} · {w.startAt || '—'}{w.endAt ? ` → ${w.endAt}` : ''} ({w.durationDays}d)
          </p>
          <p className="text-xs" style={{ color: 'var(--text-soft)' }}>Desconto: {fmtPct(w.discountPercent, false)}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold"
          style={{
            background: isPos ? 'var(--brand-500)' : isNeg ? '#ef4444' : '#94a3b8',
            color: '#fff',
          }}
        >
          {isPos ? 'Positivo' : isNeg ? 'Negativo' : 'Neutro'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Receita na promo', value: fmtMoney(w.promoRevenue) },
          { label: 'Receita sem promo', value: fmtMoney(w.normalRevenueEquivalent), sub: 'estimado' },
          { label: 'Lift quantidade', value: fmtPct(w.qtyLiftPercent), color: Number(w.qtyLiftPercent) >= 0 ? 'var(--brand-600)' : '#dc2626' },
          { label: 'Lift receita', value: fmtPct(w.revenueLiftPercent), color: Number(w.revenueLiftPercent) >= 0 ? 'var(--brand-600)' : '#dc2626' },
        ].map((cell) => (
          <div key={cell.label}>
            <p className="text-[0.62rem]" style={{ color: 'var(--text-soft)' }}>{cell.label}{cell.sub ? <span className="italic"> ({cell.sub})</span> : ''}</p>
            <p className="text-sm font-bold" style={{ color: (cell as any).color || 'var(--text-primary)' }}>{cell.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── Card de produto ─── */
const ProductCard: React.FC<{
  item: ProductPromoEffectiveness;
  maxQtyLift: number;
  maxRevLift: number;
}> = ({ item, maxQtyLift, maxRevLift }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = CLASS_CONFIG[item.classification] ?? DEFAULT_CFG;
  const Icon = cfg.icon;
  const hasWindows = item.windows && item.windows.length > 0;

  return (
    <article
      className="flex flex-col overflow-hidden rounded-2xl"
      style={{ border: `1px solid ${cfg.border}`, background: cfg.bg }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
          <ProductImage src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{item.category || 'Sem categoria'}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <ScoreRing score={item.effectivenessScore} color={cfg.scoreColor} />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span
              className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
              style={{ background: cfg.scoreColor, color: '#fff' }}
            >
              <Icon className="h-3 w-3" />
              {item.classificationLabel}
            </span>
            {item.avgDiscountPercent != null && (
              <span className="text-xs" style={{ color: cfg.text }}>
                <Tag className="inline h-3 w-3 mr-0.5" />
                {fmtPct(item.avgDiscountPercent, false)} de desconto médio
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Métricas principais */}
      {item.classification !== 'INSUFFICIENT_DATA' && (
        <div className="grid grid-cols-2 gap-3 border-t px-4 py-3 sm:grid-cols-4" style={{ borderColor: cfg.border }}>
          <div>
            <p className="text-[0.62rem] font-medium uppercase tracking-wider" style={{ color: cfg.text, opacity: 0.7 }}>Lift qtd.</p>
            <p className="text-lg font-bold" style={{ color: Number(item.qtyLiftPercent) >= 0 ? 'var(--brand-600)' : '#dc2626' }}>
              {fmtPct(item.qtyLiftPercent)}
            </p>
            <LiftBar value={Number(item.qtyLiftPercent)} max={maxQtyLift} color={Number(item.qtyLiftPercent) >= 0 ? 'var(--brand-500)' : '#ef4444'} />
          </div>
          <div>
            <p className="text-[0.62rem] font-medium uppercase tracking-wider" style={{ color: cfg.text, opacity: 0.7 }}>Lift receita</p>
            <p className="text-lg font-bold" style={{ color: Number(item.revenueLiftPercent) >= 0 ? 'var(--brand-600)' : '#dc2626' }}>
              {fmtPct(item.revenueLiftPercent)}
            </p>
            <LiftBar value={Number(item.revenueLiftPercent)} max={maxRevLift} color={Number(item.revenueLiftPercent) >= 0 ? 'var(--brand-500)' : '#ef4444'} />
          </div>
          <div>
            <p className="text-[0.62rem] font-medium uppercase tracking-wider" style={{ color: cfg.text, opacity: 0.7 }}>Giro/dia normal</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtQty(item.normalDailyQty)} un</p>
            <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{fmtMoney(item.normalDailyRevenue)}/dia</p>
          </div>
          <div>
            <p className="text-[0.62rem] font-medium uppercase tracking-wider" style={{ color: cfg.text, opacity: 0.7 }}>Giro/dia promo</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtQty(item.promoDailyQty)} un</p>
            <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{fmtMoney(item.promoDailyRevenue)}/dia</p>
          </div>
        </div>
      )}

      {/* Insight */}
      <div className="border-t px-4 py-3" style={{ borderColor: cfg.border }}>
        <p className="text-xs leading-relaxed" style={{ color: cfg.text }}>{item.insight}</p>
      </div>

      {/* Elasticidade + dias */}
      {item.classification !== 'INSUFFICIENT_DATA' && (
        <div className="flex flex-wrap items-center gap-4 border-t px-4 py-2.5 text-xs" style={{ borderColor: cfg.border, color: 'var(--text-soft)' }}>
          {item.priceElasticity != null && (
            <span>Elasticidade <strong style={{ color: 'var(--text-primary)' }}>{Number(item.priceElasticity).toFixed(2)}</strong></span>
          )}
          <span>{item.promoDays}d em promo · {item.normalDays}d normal</span>
          <span>{item.promoWindowCount} {item.promoWindowCount === 1 ? 'janela' : 'janelas'}</span>
          <Link
            to={`/app/produtos/${item.productId}`}
            className="ml-auto flex items-center gap-1 font-semibold no-underline hover:opacity-70"
            style={{ color: cfg.badge }}
          >
            Ver produto <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Expandir janelas */}
      {hasWindows && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between border-t px-4 py-2.5 text-xs font-semibold transition hover:opacity-80"
            style={{ borderColor: cfg.border, color: cfg.badge }}
          >
            <span>{expanded ? 'Ocultar' : 'Ver'} janelas de promoção ({item.windows.length})</span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {expanded && (
            <div className="flex flex-col gap-3 border-t px-4 pb-4 pt-3" style={{ borderColor: cfg.border }}>
              {item.windows.map((w, i) => (
                <WindowRow key={i} w={w} idx={i} />
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
};

/* ─── KPI card ─── */
const KpiCard: React.FC<{ label: string; value: React.ReactNode; sub?: string; highlight?: boolean }> = ({ label, value, sub, highlight }) => (
  <div
    className="flex flex-col gap-1 rounded-xl p-4"
    style={{
      border: `1px solid ${highlight ? 'var(--border-success)' : 'var(--border-soft)'}`,
      background: highlight ? 'var(--surface-success)' : 'var(--surface-base)',
    }}
  >
    <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
    <p className="text-2xl font-bold" style={{ color: highlight ? 'var(--brand-700)' : 'var(--text-primary)' }}>{value}</p>
    {sub && <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{sub}</p>}
  </div>
);

/* ═══════════════════════════════════════════════════════ */

const WINDOW_OPTIONS = [
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
  { label: '180 dias', value: 180 },
  { label: '365 dias', value: 365 },
];

const FILTER_OPTIONS = [
  { label: 'Todos', value: 'all' },
  { label: 'Efetivas', value: 'BOOSTER' },
  { label: 'Perda de receita', value: 'REVENUE_LOSS' },
  { label: 'Ineficazes', value: 'BACKFIRE' },
  { label: 'Sem efeito', value: 'NEUTRAL' },
];

const PromoEffectiveness: React.FC = () => {
  const { marketId } = useAuth();
  const [data, setData] = useState<ProductPromoEffectiveness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(180);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = async (d: number) => {
    if (!marketId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await marketService.getPromoEffectiveness(marketId, d);
      setData(result || []);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar análise');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(days); }, [marketId, days]);

  const withPromo = useMemo(() => data.filter(d => d.classification !== 'INSUFFICIENT_DATA'), [data]);
  const boosters  = useMemo(() => withPromo.filter(d => d.classification === 'BOOSTER'), [withPromo]);
  const losses    = useMemo(() => withPromo.filter(d => d.classification === 'REVENUE_LOSS'), [withPromo]);
  const backfires = useMemo(() => withPromo.filter(d => d.classification === 'BACKFIRE'), [withPromo]);
  const avgScore  = useMemo(() => withPromo.length > 0 ? Math.round(withPromo.reduce((s, d) => s + d.effectivenessScore, 0) / withPromo.length) : 0, [withPromo]);
  const avgQtyLift = useMemo(() => withPromo.length > 0 ? withPromo.reduce((s, d) => s + Number(d.qtyLiftPercent || 0), 0) / withPromo.length : 0, [withPromo]);
  const avgRevLift = useMemo(() => withPromo.length > 0 ? withPromo.reduce((s, d) => s + Number(d.revenueLiftPercent || 0), 0) / withPromo.length : 0, [withPromo]);

  const maxQtyLift = useMemo(() => Math.max(...data.map(d => Math.abs(Number(d.qtyLiftPercent || 0))), 1), [data]);
  const maxRevLift = useMemo(() => Math.max(...data.map(d => Math.abs(Number(d.revenueLiftPercent || 0))), 1), [data]);

  const filtered = useMemo(() => {
    let list = filter === 'all' ? data : data.filter(d => d.classification === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => d.name.toLowerCase().includes(q) || (d.category || '').toLowerCase().includes(q));
    }
    return list;
  }, [data, filter, search]);

  return (
    <Layout>
      <div className="flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Efetividade de promoções
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Analisa produto a produto se a promoção traciona volume e faturamento — baseado nas notas fiscais reais
            </p>
          </div>
          <div className="flex items-center gap-2">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDays(opt.value)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                style={
                  days === opt.value
                    ? { background: 'var(--brand-500)', color: '#fff', border: '1px solid var(--brand-600)' }
                    : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }
                }
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => load(days)}
              disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-lg transition"
              style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Promoções efetivas"
            value={boosters.length}
            sub={`de ${withPromo.length} analisadas`}
            highlight={boosters.length > 0}
          />
          <KpiCard
            label="Score médio"
            value={`${avgScore}/100`}
            sub="efetividade geral do mix promocional"
          />
          <KpiCard
            label="Lift médio de volume"
            value={<span style={{ color: avgQtyLift >= 0 ? 'var(--brand-600)' : '#dc2626' }}>{fmtPct(avgQtyLift)}</span>}
            sub="giro un/dia: promo vs. normal"
          />
          <KpiCard
            label="Lift médio de receita"
            value={<span style={{ color: avgRevLift >= 0 ? 'var(--brand-600)' : '#dc2626' }}>{fmtPct(avgRevLift)}</span>}
            sub="R$/dia: promo vs. normal"
          />
        </div>

        {/* Insight banner */}
        {!loading && withPromo.length > 0 && (
          <div
            className="flex items-start gap-3 rounded-xl p-4"
            style={{ border: '1px solid var(--border-success)', background: 'var(--surface-success)' }}
          >
            <BarChart2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--brand-600)' }} />
            <p className="text-sm" style={{ color: 'var(--brand-700)' }}>
              {boosters.length > 0
                ? `${boosters.length} produto${boosters.length > 1 ? 's' : ''} confirmados como promotores de volume${losses.length > 0 ? ` · ${losses.length} com desconto excessivo (receita cai apesar do volume subir)` : ''}${backfires.length > 0 ? ` · ${backfires.length} promoção${backfires.length > 1 ? 'ões' : ''} ineficaz${backfires.length > 1 ? 'es' : ''} (volume não sobe)` : ''}.`
                : `Nenhuma promoção com efeito positivo confirmado nos últimos ${days} dias. Revise profundidade de desconto e produtos selecionados.`}
            </p>
          </div>
        )}

        {/* Filtros + busca */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
                style={
                  filter === opt.value
                    ? { background: 'var(--brand-500)', color: '#fff', border: '1px solid var(--brand-600)' }
                    : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }
                }
              >
                {opt.label}
                {opt.value !== 'all' && (
                  <span className="ml-1.5 opacity-70">
                    {data.filter(d => d.classification === opt.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Buscar produto..."
            className="ml-auto h-9 rounded-lg px-3 text-sm outline-none"
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)', minWidth: '200px' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
        )}

        {/* Lista de produtos */}
        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Calculando efetividade de promoções...
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="rounded-xl p-12 text-center"
            style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
          >
            <Tag className="mx-auto mb-3 h-8 w-8 opacity-30" style={{ color: 'var(--text-muted)' }} />
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {data.length === 0 ? 'Nenhum produto com promoção detectada' : 'Nenhum produto nesta categoria'}
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {data.length === 0
                ? `São necessárias variações de preço abaixo de 95% do preço normal nos últimos ${days} dias.`
                : 'Tente outro filtro ou amplie o período de análise.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((item) => (
              <ProductCard
                key={item.productId}
                item={item}
                maxQtyLift={maxQtyLift}
                maxRevLift={maxRevLift}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default PromoEffectiveness;
