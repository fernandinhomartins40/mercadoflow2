import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHeader from '../components/layout/PageHeader';
import { analyticsService } from '../services/analytics.service';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';

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

const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(1)}%`;

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
        setError(err?.message || 'Erro ao carregar compra casada');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [marketId, useCached]);

  const strongestRule = rules[0];
  const averageConfidence = useMemo(
    () => (rules.length ? rules.reduce((sum, rule) => sum + Number(rule.confidence || 0), 0) / rules.length : 0),
    [rules]
  );
  const totalOccurrences = useMemo(
    () => rules.reduce((sum, rule) => sum + Number(rule.pairCount || 0), 0),
    [rules]
  );

  const actionHint = (rule: BasketRule) => {
    if (Number(rule.lift || 0) >= 2.2) return 'Expor lado a lado';
    if (Number(rule.confidence || 0) >= 0.45) return 'Cross-sell no caixa';
    return 'Monitorar';
  };

  return (
    <Layout>
      <div className="page analytics-page">
        <PageHeader
          title="Compra casada"
          subtitle="Pares de produtos que os clientes compram juntos."
          actions={
            <label className="toggle-inline">
              <input type="checkbox" checked={useCached} onChange={(e) => setUseCached(e.target.checked)} />
              {useCached ? 'Cache noturno' : 'Análise ao vivo'}
            </label>
          }
        />

        <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <MetricsCard title="Pares" value={rules.length} icon="PR" />
          <MetricsCard title="Confiança média" value={formatPercent(averageConfidence * 100)} icon="CF" variant="warning" />
          <MetricsCard title="Lift máximo" value={strongestRule ? strongestRule.lift.toFixed(2) : '0.00'} icon="LF" variant="danger" />
          <MetricsCard title="Ocorrências" value={totalOccurrences} icon="PX" />
        </div>

        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        {loading ? (
          <div className="panel-empty">Carregando...</div>
        ) : (
          <div className="analytics-card-grid pair-grid-dense">
            {rules.length === 0 ? (
              <div className="analytics-panel"><div className="panel-empty">Nenhuma regra encontrada.</div></div>
            ) : (
              rules.map((rule, idx) => (
                <article key={`${idx}-${rule.lift}`} className="pair-spotlight-card reveal">
                  <div className="pair-spotlight-top">
                    <span className="rank-pill">#{idx + 1}</span>
                    <span className="status-pill positive">Lift {Number(rule.lift || 0).toFixed(2)}</span>
                  </div>
                  <h3>{(rule.antecedentNames || rule.antecedent || []).join(', ')}</h3>
                  <div className="pair-arrow">combina com</div>
                  <h4>{(rule.consequentNames || rule.consequent || []).join(', ')}</h4>
                  <div className="mini-metric-grid dual">
                    <div><span>Confiança</span><strong>{formatPercent(Number(rule.confidence || 0) * 100)}</strong></div>
                    <div><span>Suporte</span><strong>{formatPercent(Number(rule.support || 0) * 100)}</strong></div>
                    <div><span>Cestas</span><strong>{rule.pairCount || 0}</strong></div>
                    <div><span>Ação</span><strong>{actionHint(rule)}</strong></div>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default MarketBasket;
