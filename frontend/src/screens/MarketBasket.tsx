import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { analyticsService } from '../services/analytics.service';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, ShoppingCart, Zap, TrendingUp, Map, RefreshCw } from 'lucide-react';

interface BasketRule {
  antecedent?: string[];
  consequent?: string[];
  antecedentNames?: string[];
  consequentNames?: string[];
  support: number;
  confidence: number;
  lift: number;
  leverage?: number | null;
  pairCount: number;
}

// Classifica a força do combo para uso nas ações sugeridas
function comboStrength(rule: BasketRule): 'strong' | 'moderate' | 'mild' {
  const pairs = Number(rule.pairCount || 0);
  const lift = Number(rule.lift || 0);
  const conf = Number(rule.confidence || 0);
  if (pairs >= 20 && lift >= 1.5) return 'strong';
  if (pairs >= 8 || conf >= 0.35) return 'moderate';
  return 'mild';
}

const STRENGTH_CONFIG = {
  strong: {
    label: 'Tração forte',
    tip: 'Posicione lado a lado na loja e crie combo de preço',
    badgeStyle: { background: 'var(--surface-success)', color: 'var(--brand-700)' },
    barColor: 'var(--brand-500)',
  },
  moderate: {
    label: 'Boa afinidade',
    tip: 'Destaque na gôndola ou encarte juntos',
    badgeStyle: { background: 'var(--surface-warning)', color: '#92400e' },
    barColor: '#f59e0b',
  },
  mild: {
    label: 'Relação emergente',
    tip: 'Acompanhe nos próximos 30 dias',
    badgeStyle: { background: 'var(--surface-muted)', color: 'var(--text-muted)' },
    barColor: '#94a3b8',
  },
} as const;

const MarketBasket: React.FC = () => {
  const { marketId } = useAuth();
  const [rules, setRules] = useState<BasketRule[]>([]);
  const [useCached, setUseCached] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'strong' | 'moderate'>('all');

  const load = async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const data = useCached
        ? await marketService.getCachedMarketBasket(marketId)
        : await analyticsService.getMarketBasket(marketId);
      setRules(data || []);
      setError(null);
    } catch (err: any) {
      setRules([]);
      setError(err?.message || 'Erro ao carregar combos');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [marketId, useCached]);

  const maxPairCount = useMemo(() => Math.max(...rules.map(r => Number(r.pairCount || 0)), 1), [rules]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rules;
    return rules.filter(r => comboStrength(r) === filter);
  }, [rules, filter]);

  // Deduplica para exibição: mantém só A→B (não B→A) baseado no pair com mais confidence
  const dedupedForDisplay = useMemo(() => {
    const seen = new Set<string>();
    return filtered.filter(r => {
      const a = (r.antecedent || [])[0] || '';
      const b = (r.consequent || [])[0] || '';
      const key = [a, b].sort().join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filtered]);

  const strongCount = useMemo(() => rules.filter(r => comboStrength(r) === 'strong').length, [rules]);
  const topRule = rules[0];

  const insightText = () => {
    if (rules.length === 0) return 'Ainda não há dados suficientes. Continue registrando vendas para descobrir os combos do seu supermercado.';
    const nameA = (topRule.antecedentNames || [])[0] || 'Produto A';
    const nameB = (topRule.consequentNames || [])[0] || 'Produto B';
    const confPct = (Number(topRule.confidence || 0) * 100).toFixed(0);
    return `${nameA} e ${nameB} são comprados juntos em ${confPct}% das cestas — o combo mais frequente nos últimos 90 dias. ${strongCount > 0 ? `Há ${strongCount} combos com tração forte: posicione esses produtos próximos na gôndola para puxar a venda de ambos.` : ''}`;
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Produtos que vendem juntos
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Quais produtos puxam a venda de outros no mesmo cupom — últimos 90 dias
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}
            >
              <input type="checkbox" checked={useCached} onChange={(e) => setUseCached(e.target.checked)} className="accent-green-600" />
              {useCached ? 'Cache noturno' : 'Ao vivo'}
            </label>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-lg transition"
              style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Combos encontrados', value: rules.length, icon: ShoppingCart },
            { label: 'Tração forte', value: strongCount, icon: Zap, highlight: strongCount > 0 },
            {
              label: 'Maior co-ocorrência',
              value: topRule ? `${topRule.pairCount} cestas` : '—',
              sub: topRule ? `${(Number(topRule.confidence || 0) * 100).toFixed(0)}% juntos` : undefined,
              icon: TrendingUp,
            },
            {
              label: 'Melhor lift',
              value: rules.length > 0 ? `${Math.max(...rules.map(r => Number(r.lift || 0))).toFixed(1)}x` : '—',
              sub: 'acima do acaso',
              icon: TrendingUp,
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl p-4"
              style={{
                border: `1px solid ${(kpi as any).highlight ? 'var(--border-success)' : 'var(--border-soft)'}`,
                background: (kpi as any).highlight ? 'var(--surface-success)' : 'var(--surface-base)',
              }}
            >
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{kpi.label}</span>
              <p className="mt-1 text-2xl font-bold" style={{ color: (kpi as any).highlight ? 'var(--brand-700)' : 'var(--text-primary)' }}>{kpi.value}</p>
              {(kpi as any).sub && <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{(kpi as any).sub}</p>}
            </div>
          ))}
        </div>

        {/* Insight */}
        <div className="flex items-start gap-3 rounded-xl p-4" style={{ border: '1px solid var(--border-success)', background: 'var(--surface-success)' }}>
          <Zap className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--brand-600)' }} />
          <p className="text-sm" style={{ color: 'var(--brand-700)' }}>{insightText()}</p>
        </div>

        {/* Filtros */}
        {rules.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(['all', 'strong', 'moderate'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
                style={
                  filter === f
                    ? { background: 'var(--brand-500)', color: '#fff', border: '1px solid var(--brand-600)' }
                    : { border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }
                }
              >
                {f === 'all' ? 'Todos' : f === 'strong' ? 'Tração forte' : 'Boa afinidade'}
                {f !== 'all' && (
                  <span className="ml-1.5 opacity-70">
                    {f === 'strong' ? strongCount : rules.filter(r => comboStrength(r) === 'moderate').length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        {/* Lista de combos */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
          </div>
        ) : dedupedForDisplay.length === 0 ? (
          <div className="rounded-xl p-10 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
            <ShoppingCart className="mx-auto mb-3 h-8 w-8 opacity-30" style={{ color: 'var(--text-muted)' }} />
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Nenhum combo encontrado</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              São necessários pelo menos 3 cupons com os dois produtos juntos para aparecer aqui.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dedupedForDisplay.map((rule, idx) => {
              const nameA = (rule.antecedentNames || rule.antecedent || []).join(', ') || 'Produto A';
              const nameB = (rule.consequentNames || rule.consequent || []).join(', ') || 'Produto B';
              const confPct = (Number(rule.confidence || 0) * 100).toFixed(0);
              const pairPct = Math.round((Number(rule.pairCount || 0) / maxPairCount) * 100);
              const strength = comboStrength(rule);
              const cfg = STRENGTH_CONFIG[strength];

              return (
                <article
                  key={idx}
                  className="flex flex-col rounded-xl p-5"
                  style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
                >
                  {/* Badge + rank */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold" style={{ color: 'var(--text-soft)' }}>#{idx + 1}</span>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={cfg.badgeStyle}>
                      {cfg.label}
                    </span>
                  </div>

                  {/* Produtos */}
                  <div className="mt-3 flex flex-col gap-0.5">
                    <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{nameA}</p>
                    <p className="text-xs" style={{ color: 'var(--brand-600)' }}>puxa a compra de</p>
                    <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{nameB}</p>
                  </div>

                  {/* Barra de co-ocorrência */}
                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span>{rule.pairCount} cestas juntos</span>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{confPct}% das vezes</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(pairPct, 4)}%`, background: cfg.barColor }}
                      />
                    </div>
                  </div>

                  {/* Métricas secundárias */}
                  <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: 'var(--text-soft)' }}>
                    <span>Afinidade <strong style={{ color: 'var(--text-primary)' }}>{Number(rule.lift || 0).toFixed(1)}×</strong></span>
                    {rule.leverage != null && rule.leverage > 0 && (
                      <span style={{ color: 'var(--brand-600)' }}>
                        +{(rule.leverage * 100).toFixed(1)}% acima do acaso
                      </span>
                    )}
                  </div>

                  {/* Dica de ação */}
                  <p className="mt-2 text-xs italic" style={{ color: 'var(--text-muted)' }}>{cfg.tip}</p>

                  {/* Ações */}
                  <div className="mt-4 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: 'var(--border-soft)' }}>
                    <Link
                      to="/app/mapa-loja"
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold no-underline transition hover:opacity-80"
                      style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}
                    >
                      <Map className="h-3 w-3" /> Ver no mapa
                    </Link>
                    <Link
                      to="/app/campanhas"
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold no-underline transition hover:opacity-80"
                      style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}
                    >
                      Criar promoção <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default MarketBasket;
