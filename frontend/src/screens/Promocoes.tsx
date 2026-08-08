import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import ProductImage from '../components/product/ProductImage';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import { CampaignImpact, ProductPromoEffectiveness, PromoWindowSummary } from '../types/analytics.types';
import PromoIntelligenceTab from '../components/promo/PromoIntelligenceTab';
import {
  Plus, Calendar, TrendingUp, TrendingDown, Minus, Zap, AlertTriangle,
  ChevronDown, ChevronUp, ArrowRight, RefreshCw, BarChart2, Tag,
} from 'lucide-react';

/* ─── Formatadores ─── */
const fmtMoney = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
const fmtPct = (v?: number | null, sign = true) => {
  const n = Number(v || 0);
  return `${sign && n > 0 ? '+' : ''}${n.toFixed(1)}%`;
};
const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—');

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-base)',
  color: 'var(--text-primary)',
};

/* ─── Tipos internos ─── */
interface CampaignItem {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
}

/* ════════════════════════════════════════════════════════════
   ABA 1 — CAMPANHAS
════════════════════════════════════════════════════════════ */
const CampanhasTab: React.FC<{ marketId: string }> = ({ marketId }) => {
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [impacts, setImpacts] = useState<CampaignImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const bestImpact = useMemo(
    () => [...impacts].sort((a, b) => Number(b.revenueLiftPercent || 0) - Number(a.revenueLiftPercent || 0))[0],
    [impacts],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [campaigns, impactRows] = await Promise.all([
        marketService.getCampaigns(marketId),
        marketService.getCampaignImpact(marketId),
      ]);
      setItems(campaigns || []);
      setImpacts(impactRows || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar campanhas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [marketId]); // eslint-disable-line

  const create = async () => {
    if (!name.trim()) { setError('Informe o nome da promoção'); return; }
    await marketService.createCampaign(marketId, {
      name: name.trim(),
      description: description.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    setName(''); setDescription(''); setStartDate(''); setEndDate('');
    setShowForm(false);
    await load();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-3 flex-1">
          {[
            { label: 'Campanhas', value: items.length },
            { label: 'Com resultado', value: impacts.length },
            { label: 'Melhor resultado', value: bestImpact ? `+${Number(bestImpact.revenueLiftPercent || 0).toFixed(1)}%` : '—' },
          ].map((k) => (
            <div key={k.label} className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{k.label}</span>
              <p className="mt-1 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{k.value}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2 self-start">
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" /> Nova campanha
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-xl p-5" style={{ border: '1px solid var(--border-success)', background: 'var(--surface-success)' }}>
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Nova campanha promocional</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="h-10 rounded-lg px-3 text-sm outline-none" style={inputStyle} placeholder="Nome da campanha" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="h-10 rounded-lg px-3 text-sm outline-none" style={inputStyle} placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Data início</label>
              <input type="date" className="h-10 rounded-lg px-3 text-sm outline-none" style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Data fim</label>
              <input type="date" className="h-10 rounded-lg px-3 text-sm outline-none" style={inputStyle} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={create}>Criar campanha</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
          <Calendar className="mx-auto mb-3 h-8 w-8 opacity-20" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Nenhuma campanha cadastrada</p>
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>Crie uma campanha para acompanhar o impacto nas vendas.</p>
          <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Nova campanha</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((campaign) => {
            const impact = impacts.find((i) => i.campaignId === campaign.id);
            const lift = Number(impact?.revenueLiftPercent || 0);
            return (
              <article key={campaign.id} className="rounded-xl p-5" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{campaign.name}</h3>
                    {campaign.description && <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>{campaign.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" style={{ color: 'var(--text-soft)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtDate(campaign.startDate)} — {fmtDate(campaign.endDate)}</span>
                  </div>
                </div>
                {impact && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Antes', value: fmtMoney(impact.beforeRevenue), style: { background: 'var(--surface-soft)' } },
                      { label: 'Durante', value: fmtMoney(impact.duringRevenue), style: { background: 'var(--surface-success)' } },
                      { label: 'Depois', value: fmtMoney(impact.afterRevenue), style: { background: 'var(--surface-soft)' } },
                    ].map((col) => (
                      <div key={col.label} className="rounded-lg p-3" style={col.style}>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{col.label}</span>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{col.value}</p>
                      </div>
                    ))}
                    <div className="rounded-lg p-3" style={{ background: lift > 0 ? 'var(--surface-success)' : lift < 0 ? 'var(--surface-danger)' : 'var(--surface-soft)' }}>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Resultado</span>
                      <div className="flex items-center gap-1">
                        <TrendingUp className={`h-4 w-4 ${lift > 0 ? 'text-green-600' : 'text-red-500'}`} />
                        <p className={`text-sm font-bold ${lift > 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {lift > 0 ? '+' : ''}{lift.toFixed(1)}% vendas
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   ABA 2 — EFETIVIDADE
════════════════════════════════════════════════════════════ */

const CLASS_CONFIG: Record<string, { bg: string; border: string; text: string; badge: string; icon: React.FC<any>; scoreColor: string }> = {
  BOOSTER:          { bg: 'var(--surface-success)', border: 'var(--border-success)', text: 'var(--brand-700)', badge: 'var(--brand-600)', icon: Zap, scoreColor: 'var(--brand-500)' },
  REVENUE_LOSS:     { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412', badge: '#ea580c', icon: AlertTriangle, scoreColor: '#f97316' },
  BACKFIRE:         { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', badge: '#dc2626', icon: TrendingDown, scoreColor: '#ef4444' },
  NEUTRAL:          { bg: 'var(--surface-soft)', border: 'var(--border-soft)', text: 'var(--text-primary)', badge: 'var(--text-soft)', icon: Minus, scoreColor: '#94a3b8' },
  INSUFFICIENT_DATA:{ bg: 'var(--surface-muted)', border: 'var(--border-soft)', text: 'var(--text-muted)', badge: 'var(--text-muted)', icon: Minus, scoreColor: '#cbd5e1' },
};
const DEFAULT_CFG = CLASS_CONFIG.NEUTRAL;

const ScoreRing: React.FC<{ score: number; color: string; size?: number }> = ({ score, color, size = 52 }) => {
  const r = 20; const circ = 2 * Math.PI * r; const filled = (score / 100) * circ;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="shrink-0 -rotate-90">
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--surface-muted)" strokeWidth="5" />
      <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" />
      <text x="24" y="24" textAnchor="middle" dominantBaseline="central" style={{ fontSize: '11px', fontWeight: 700, fill: color, transform: 'rotate(90deg)', transformOrigin: '24px 24px' }}>{score}</text>
    </svg>
  );
};

const LiftBar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => {
  const pct = max > 0 ? Math.min(100, Math.max(0, (Math.abs(value) / max) * 100)) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 3)}%`, background: color }} />
    </div>
  );
};

const WindowRow: React.FC<{ w: PromoWindowSummary; idx: number }> = ({ w, idx }) => {
  const isPos = w.outcome === 'POSITIVE'; const isNeg = w.outcome === 'NEGATIVE';
  return (
    <div className="flex flex-col gap-2 rounded-xl p-4" style={{ border: `1px solid ${isPos ? 'var(--border-success)' : isNeg ? '#fecaca' : 'var(--border-soft)'}`, background: isPos ? 'var(--surface-success)' : isNeg ? '#fef2f2' : 'var(--surface-soft)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Janela #{idx + 1} · {w.startAt || '—'}{w.endAt ? ` → ${w.endAt}` : ''} ({w.durationDays}d)</p>
          <p className="text-xs" style={{ color: 'var(--text-soft)' }}>Desconto: {fmtPct(w.discountPercent, false)}</p>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold" style={{ background: isPos ? 'var(--brand-500)' : isNeg ? '#ef4444' : '#94a3b8', color: '#fff' }}>
          {isPos ? 'Positivo' : isNeg ? 'Negativo' : 'Neutro'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Receita na promo', value: fmtMoney(w.promoRevenue) },
          { label: 'Receita sem promo', value: fmtMoney(w.normalRevenueEquivalent), sub: 'estimado' },
          { label: 'Variação volume', value: fmtPct(w.qtyLiftPercent), color: Number(w.qtyLiftPercent) >= 0 ? 'var(--brand-600)' : '#dc2626' },
          { label: 'Variação receita', value: fmtPct(w.revenueLiftPercent), color: Number(w.revenueLiftPercent) >= 0 ? 'var(--brand-600)' : '#dc2626' },
        ].map((cell) => (
          <div key={cell.label}>
            <p className="text-[0.62rem]" style={{ color: 'var(--text-soft)' }}>{cell.label}{(cell as any).sub ? <span className="italic"> ({(cell as any).sub})</span> : ''}</p>
            <p className="text-sm font-bold" style={{ color: (cell as any).color || 'var(--text-primary)' }}>{cell.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const ProductCard: React.FC<{ item: ProductPromoEffectiveness; maxQtyLift: number; maxRevLift: number }> = ({ item, maxQtyLift, maxRevLift }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = CLASS_CONFIG[item.classification] ?? DEFAULT_CFG;
  const Icon = cfg.icon;
  const hasWindows = item.windows && item.windows.length > 0;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl" style={{ border: `1px solid ${cfg.border}`, background: cfg.bg }}>
      <div className="flex items-start gap-3 p-4">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
          <ProductImage src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{item.category || 'Sem categoria'}</p>
            </div>
            <ScoreRing score={item.effectivenessScore} color={cfg.scoreColor} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: cfg.scoreColor, color: '#fff' }}>
              <Icon className="h-3 w-3" />{item.classificationLabel}
            </span>
            {item.avgDiscountPercent != null && (
              <span className="text-xs" style={{ color: cfg.text }}><Tag className="inline h-3 w-3 mr-0.5" />{fmtPct(item.avgDiscountPercent, false)} de desconto médio</span>
            )}
          </div>
        </div>
      </div>
      {item.classification !== 'INSUFFICIENT_DATA' && (
        <div className="grid grid-cols-2 gap-3 border-t px-4 py-3 sm:grid-cols-4" style={{ borderColor: cfg.border }}>
          <div>
            <p className="text-[0.62rem] font-medium uppercase tracking-wider" style={{ color: cfg.text, opacity: 0.7 }}>Volume promo</p>
            <p className="text-lg font-bold" style={{ color: Number(item.qtyLiftPercent) >= 0 ? 'var(--brand-600)' : '#dc2626' }}>{fmtPct(item.qtyLiftPercent)}</p>
            <LiftBar value={Number(item.qtyLiftPercent)} max={maxQtyLift} color={Number(item.qtyLiftPercent) >= 0 ? 'var(--brand-500)' : '#ef4444'} />
          </div>
          <div>
            <p className="text-[0.62rem] font-medium uppercase tracking-wider" style={{ color: cfg.text, opacity: 0.7 }}>Receita promo</p>
            <p className="text-lg font-bold" style={{ color: Number(item.revenueLiftPercent) >= 0 ? 'var(--brand-600)' : '#dc2626' }}>{fmtPct(item.revenueLiftPercent)}</p>
            <LiftBar value={Number(item.revenueLiftPercent)} max={maxRevLift} color={Number(item.revenueLiftPercent) >= 0 ? 'var(--brand-500)' : '#ef4444'} />
          </div>
          <div>
            <p className="text-[0.62rem] font-medium uppercase tracking-wider" style={{ color: cfg.text, opacity: 0.7 }}>Vendas/dia normal</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{Number(item.normalDailyQty || 0).toFixed(1)} un</p>
            <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{fmtMoney(item.normalDailyRevenue)}/dia</p>
          </div>
          <div>
            <p className="text-[0.62rem] font-medium uppercase tracking-wider" style={{ color: cfg.text, opacity: 0.7 }}>Vendas/dia em promo</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{Number(item.promoDailyQty || 0).toFixed(1)} un</p>
            <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{fmtMoney(item.promoDailyRevenue)}/dia</p>
          </div>
        </div>
      )}
      <div className="border-t px-4 py-3" style={{ borderColor: cfg.border }}>
        <p className="text-xs leading-relaxed" style={{ color: cfg.text }}>{item.insight}</p>
      </div>
      {item.classification !== 'INSUFFICIENT_DATA' && (
        <div className="flex flex-wrap items-center gap-4 border-t px-4 py-2.5 text-xs" style={{ borderColor: cfg.border, color: 'var(--text-soft)' }}>
          {item.priceElasticity != null && <span>Elasticidade <strong style={{ color: 'var(--text-primary)' }}>{Number(item.priceElasticity).toFixed(2)}</strong></span>}
          <span>{item.promoDays}d em promo · {item.normalDays}d normal · {item.promoWindowCount} {item.promoWindowCount === 1 ? 'janela' : 'janelas'}</span>
          <Link to={`/app/produtos/${item.productId}`} className="ml-auto flex items-center gap-1 font-semibold no-underline hover:opacity-70" style={{ color: cfg.badge }}>
            Ver produto <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
      {hasWindows && (
        <>
          <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between border-t px-4 py-2.5 text-xs font-semibold transition hover:opacity-80" style={{ borderColor: cfg.border, color: cfg.badge }}>
            <span>{expanded ? 'Ocultar' : 'Ver'} janelas ({item.windows.length})</span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {expanded && (
            <div className="flex flex-col gap-3 border-t px-4 pb-4 pt-3" style={{ borderColor: cfg.border }}>
              {item.windows.map((w, i) => <WindowRow key={i} w={w} idx={i} />)}
            </div>
          )}
        </>
      )}
    </article>
  );
};

const WINDOW_OPTIONS = [{ label: '30d', value: 30 }, { label: '90d', value: 90 }, { label: '180d', value: 180 }, { label: '365d', value: 365 }];
const FILTER_OPTIONS = [
  { label: 'Todos', value: 'all' },
  { label: 'Efetivas', value: 'BOOSTER' },
  { label: 'Perda de receita', value: 'REVENUE_LOSS' },
  { label: 'Ineficazes', value: 'BACKFIRE' },
  { label: 'Sem efeito', value: 'NEUTRAL' },
];

const EfetividadeTab: React.FC<{ marketId: string }> = ({ marketId }) => {
  const [data, setData] = useState<ProductPromoEffectiveness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(180);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = async (d: number) => {
    setLoading(true); setError(null);
    try { setData(await marketService.getPromoEffectiveness(marketId, d) || []); }
    catch (err: any) { setError(err?.message || 'Erro ao carregar análise'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(days); }, [marketId, days]); // eslint-disable-line

  const withPromo = useMemo(() => data.filter((d) => d.classification !== 'INSUFFICIENT_DATA'), [data]);
  const boosters  = useMemo(() => withPromo.filter((d) => d.classification === 'BOOSTER'), [withPromo]);
  const losses    = useMemo(() => withPromo.filter((d) => d.classification === 'REVENUE_LOSS'), [withPromo]);
  const backfires = useMemo(() => withPromo.filter((d) => d.classification === 'BACKFIRE'), [withPromo]);
  const avgScore  = useMemo(() => withPromo.length > 0 ? Math.round(withPromo.reduce((s, d) => s + d.effectivenessScore, 0) / withPromo.length) : 0, [withPromo]);
  const avgQtyLift = useMemo(() => withPromo.length > 0 ? withPromo.reduce((s, d) => s + Number(d.qtyLiftPercent || 0), 0) / withPromo.length : 0, [withPromo]);
  const avgRevLift = useMemo(() => withPromo.length > 0 ? withPromo.reduce((s, d) => s + Number(d.revenueLiftPercent || 0), 0) / withPromo.length : 0, [withPromo]);
  const maxQtyLift = useMemo(() => Math.max(...data.map((d) => Math.abs(Number(d.qtyLiftPercent || 0))), 1), [data]);
  const maxRevLift = useMemo(() => Math.max(...data.map((d) => Math.abs(Number(d.revenueLiftPercent || 0))), 1), [data]);
  const filtered = useMemo(() => {
    let list = filter === 'all' ? data : data.filter((d) => d.classification === filter);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter((d) => d.name.toLowerCase().includes(q) || (d.category || '').toLowerCase().includes(q)); }
    return list;
  }, [data, filter, search]);

  return (
    <div className="flex flex-col gap-5">
      {/* Controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {WINDOW_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => setDays(opt.value)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
              style={days === opt.value
                ? { background: 'var(--brand-500)', color: '#fff', border: '1px solid var(--brand-600)' }
                : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
              {opt.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => load(days)} disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition"
          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Promoções efetivas', value: boosters.length, sub: `de ${withPromo.length} analisadas`, highlight: boosters.length > 0 },
          { label: 'Pontuação média', value: `${avgScore}/100`, sub: 'efetividade geral do mix' },
          { label: 'Variação de volume', value: <span style={{ color: avgQtyLift >= 0 ? 'var(--brand-600)' : '#dc2626' }}>{fmtPct(avgQtyLift)}</span>, sub: 'un./dia promo vs. normal' },
          { label: 'Variação de receita', value: <span style={{ color: avgRevLift >= 0 ? 'var(--brand-600)' : '#dc2626' }}>{fmtPct(avgRevLift)}</span>, sub: 'R$/dia promo vs. normal' },
        ].map((k, i) => (
          <div key={i} className="flex flex-col gap-1 rounded-xl p-4" style={{ border: `1px solid ${k.highlight ? 'var(--border-success)' : 'var(--border-soft)'}`, background: k.highlight ? 'var(--surface-success)' : 'var(--surface-base)' }}>
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{k.label}</span>
            <p className="text-2xl font-bold" style={{ color: k.highlight ? 'var(--brand-700)' : 'var(--text-primary)' }}>{k.value}</p>
            <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {!loading && withPromo.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl p-4" style={{ border: '1px solid var(--border-success)', background: 'var(--surface-success)' }}>
          <BarChart2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--brand-600)' }} />
          <p className="text-sm" style={{ color: 'var(--brand-700)' }}>
            {boosters.length > 0
              ? `${boosters.length} produto${boosters.length > 1 ? 's' : ''} confirmados como promotores de volume${losses.length > 0 ? ` · ${losses.length} com desconto excessivo` : ''}${backfires.length > 0 ? ` · ${backfires.length} promoção${backfires.length > 1 ? 'ões' : ''} ineficaz${backfires.length > 1 ? 'es' : ''}` : ''}.`
              : `Nenhuma promoção com efeito positivo nos últimos ${days} dias.`}
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => setFilter(opt.value)}
              className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
              style={filter === opt.value
                ? { background: 'var(--brand-500)', color: '#fff', border: '1px solid var(--brand-600)' }
                : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
              {opt.label}
              {opt.value !== 'all' && <span className="ml-1.5 opacity-70">{data.filter((d) => d.classification === opt.value).length}</span>}
            </button>
          ))}
        </div>
        <input type="text" placeholder="Buscar produto..." className="ml-auto h-9 rounded-lg px-3 text-sm outline-none"
          style={{ ...inputStyle, minWidth: '180px' }} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Calculando efetividade de promoções...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
          <Tag className="mx-auto mb-3 h-8 w-8 opacity-30" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {data.length === 0 ? 'Nenhum produto com promoção detectada' : 'Nenhum produto nesta categoria'}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {data.length === 0 ? `São necessárias variações de preço nos últimos ${days} dias.` : 'Tente outro filtro.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((item) => <ProductCard key={item.productId} item={item} maxQtyLift={maxQtyLift} maxRevLift={maxRevLift} />)}
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
════════════════════════════════════════════════════════════ */

type PromoTab = 'inteligencia' | 'campanhas' | 'efetividade';

const Promocoes: React.FC = () => {
  const { marketId } = useAuth();
  // Abre na inteligencia: o supermercadista precisa saber O QUE promover
  // antes de cadastrar a campanha.
  const [tab, setTab] = useState<PromoTab>('inteligencia');

  const TABS: Array<{ key: PromoTab; label: string; icon: React.ReactNode }> = [
    { key: 'inteligencia', label: 'O que promover', icon: <Zap className="h-4 w-4" /> },
    { key: 'campanhas', label: 'Campanhas', icon: <Calendar className="h-4 w-4" /> },
    { key: 'efetividade', label: 'Efetividade', icon: <BarChart2 className="h-4 w-4" /> },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Promoções</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Descubra o que promover, crie campanhas e meça se cada promoção realmente traciona vendas</p>
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

        {marketId && tab === 'inteligencia' && <PromoIntelligenceTab marketId={marketId} />}
        {marketId && tab === 'campanhas' && <CampanhasTab marketId={marketId} />}
        {marketId && tab === 'efetividade' && <EfetividadeTab marketId={marketId} />}
      </div>
    </Layout>
  );
};

export default Promocoes;
