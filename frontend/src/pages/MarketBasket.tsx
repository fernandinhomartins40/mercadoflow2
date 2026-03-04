import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
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
  const averageConfidence = useMemo(() => rules.length ? rules.reduce((sum, rule) => sum + Number(rule.confidence || 0), 0) / rules.length : 0, [rules]);
  const totalOccurrences = useMemo(() => rules.reduce((sum, rule) => sum + Number(rule.pairCount || 0), 0), [rules]);

  const actionHint = (rule: BasketRule) => {
    if (Number(rule.lift || 0) >= 2.2) return 'Expor lado a lado e testar kit leve.';
    if (Number(rule.confidence || 0) >= 0.45) return 'Sinal claro para cross-sell no caixa.';
    return 'Manter monitoramento para nova confirmacao.';
  };

  return (
    <Layout>
      <div className="page analytics-page">
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Compra casada</span>
            <h1 className="analytics-hero-title">Os pares que realmente se atraem no carrinho.</h1>
            <p className="analytics-hero-text">
              Em vez de uma grade fria, a leitura abaixo destaca pares com sustentacao, confianca e lift para apoiar exposicao, combo e sugestao de venda.
            </p>
            <div className="hero-chip-row">
              <span className="hero-chip">{rules.length} pares avaliados</span>
              <span className="hero-chip">Confianca media {formatPercent(averageConfidence * 100)}</span>
              <span className="hero-chip">{totalOccurrences} ocorrencias somadas</span>
            </div>
          </div>
          <div className="analytics-hero-board single-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">Par com maior lift</span>
              <h3>{strongestRule ? `${(strongestRule.antecedentNames || strongestRule.antecedent || []).join(', ')} + ${(strongestRule.consequentNames || strongestRule.consequent || []).join(', ')}` : 'Sem par dominante'}</h3>
              <strong>{strongestRule ? strongestRule.lift.toFixed(2) : '0.00'}</strong>
              <p>{strongestRule ? `${strongestRule.pairCount} compras em conjunto e confianca de ${formatPercent(strongestRule.confidence * 100)}` : 'Assim que a cesta ganhar densidade, o par campeao aparece aqui.'}</p>
            </div>
          </div>
        </section>

        <div className="analytics-panel filter-bar reveal">
          <div className="filter-bar-copy">
            <span className="section-kicker">Origem</span>
            <h3>Escolha entre analise ao vivo e cache noturno</h3>
          </div>
          <label className="toggle-row">
            <input type="checkbox" checked={useCached} onChange={(e) => setUseCached(e.target.checked)} />
            <span>{useCached ? 'Usando cache noturno' : 'Usando analise ao vivo'}</span>
          </label>
        </div>

        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        {loading ? (
          <div className="card">Carregando...</div>
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
                    <div><span>Confianca</span><strong>{formatPercent(Number(rule.confidence || 0) * 100)}</strong></div>
                    <div><span>Suporte</span><strong>{formatPercent(Number(rule.support || 0) * 100)}</strong></div>
                    <div><span>Ocorrencias</span><strong>{rule.pairCount || 0}</strong></div>
                    <div><span>Acao</span><strong>{actionHint(rule)}</strong></div>
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
