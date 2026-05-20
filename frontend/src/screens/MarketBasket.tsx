import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { analyticsService } from '../services/analytics.service';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, Sparkles, Map } from 'lucide-react';

interface BasketRule {
  antecedent?: string[];
  consequent?: string[];
  antecedentNames?: string[];
  consequentNames?: string[];
  support: number;
  confidence: number;
  lift: number;
  pairCount: number;
}

const MarketBasket: React.FC = () => {
  const { marketId } = useAuth();
  const [rules, setRules] = useState<BasketRule[]>([]);
  const [useCached, setUseCached] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
    load();
  }, [marketId, useCached]);

  const totalOccurrences = useMemo(() => rules.reduce((s, r) => s + Number(r.pairCount || 0), 0), [rules]);

  const actionHint = (rule: BasketRule) => {
    if (Number(rule.lift || 0) >= 2.2) return 'Coloque próximos na loja';
    if (Number(rule.confidence || 0) >= 0.45) return 'Monte promoção combo';
    return 'Acompanhar';
  };

  const actionStyle = (rule: BasketRule): React.CSSProperties => {
    if (Number(rule.lift || 0) >= 2.2) return { background: 'var(--surface-success)', color: 'var(--brand-700)' };
    if (Number(rule.confidence || 0) >= 0.45) return { background: 'var(--surface-warning)', color: '#92400e' };
    return { background: 'var(--surface-soft)', color: 'var(--text-muted)' };
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Combos que vendem juntos</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Descubra quais produtos seus clientes levam juntos</p>
          </div>
          <label
            className="inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm"
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}
          >
            <input type="checkbox" checked={useCached} onChange={(e) => setUseCached(e.target.checked)} className="accent-green-600" />
            <span style={{ color: 'var(--text-primary)' }}>{useCached ? 'Cache noturno' : 'Análise ao vivo'}</span>
          </label>
        </div>

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Combos encontrados', value: rules.length, color: 'var(--text-primary)' },
            { label: 'Cestas analisadas', value: totalOccurrences, color: 'var(--text-primary)' },
            { label: 'Melhor combo', value: rules[0] ? `${(rules[0].confidence * 100).toFixed(0)}% juntos` : '—', color: 'var(--brand-700)' },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{kpi.label}</span>
              <p className="mt-1 text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* AI Insight */}
        <div className="flex items-start gap-3 rounded-xl p-4" style={{ border: '1px solid var(--border-success)', background: 'var(--surface-success)' }}>
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--brand-600)' }} />
          <p className="text-sm" style={{ color: 'var(--brand-700)' }}>
            {rules.length > 0
              ? `Encontramos ${rules.length} combos. O mais forte tem ${(rules[0].confidence * 100).toFixed(0)}% de chance de compra conjunta em ${rules[0].pairCount} cestas. Coloque esses produtos próximos na loja para aumentar vendas.`
              : 'Ainda não temos combos suficientes. Continue vendendo para gerar mais dados de cesta.'}
          </p>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        {/* Combo cards */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
            <p style={{ color: 'var(--text-muted)' }}>Nenhum combo encontrado.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rules.map((rule, idx) => {
              const nameA = (rule.antecedentNames || rule.antecedent || []).join(', ');
              const nameB = (rule.consequentNames || rule.consequent || []).join(', ');
              const confPct = (rule.confidence * 100).toFixed(0);
              return (
                <article key={idx} className="flex flex-col rounded-xl p-5" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                  <div className="flex items-center justify-between">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                      style={{ background: 'var(--surface-muted)', color: 'var(--text-soft)' }}
                    >
                      #{idx + 1}
                    </span>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={actionStyle(rule)}>
                      {actionHint(rule)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-col gap-1">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{nameA}</h3>
                    <span className="text-xs font-medium" style={{ color: 'var(--brand-600)' }}>combina com</span>
                    <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{nameB}</h4>
                  </div>
                  <div className="mt-4 rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      <strong>{confPct}%</strong> das vezes compram juntos
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      Apareceu em {rule.pairCount} cestas · Afinidade {rule.lift.toFixed(2)}x
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
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
                      style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}
                    >
                      Criar promoção combo <ArrowRight className="h-3 w-3" />
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
