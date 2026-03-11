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
        <section className="dashboard-command-grid reveal">
          <article className="dashboard-command-card">
            <div className="dashboard-command-copy">
              <span className="pill">Compra casada</span>
              <h1 className="dashboard-command-title">Use pares reais de carrinho para vender melhor.</h1>
              <p className="dashboard-command-text">
                Em vez de adivinhar combinacoes, a tela destaca os pares que sustentam exposicao, combo e sugestao de venda com confianca e lift medidos.
              </p>
              <div className="hero-chip-row">
                <span className="hero-chip">{rules.length} pares avaliados</span>
                <span className="hero-chip">Confianca media {formatPercent(averageConfidence * 100)}</span>
                <span className="hero-chip">{totalOccurrences} ocorrencias somadas</span>
              </div>
            </div>

            <div className="dashboard-command-showcase">
              <article className="dashboard-glow-card">
                <span className="section-kicker">Par com maior lift</span>
                <strong>
                  {strongestRule
                    ? `${(strongestRule.antecedentNames || strongestRule.antecedent || []).join(', ')} + ${(strongestRule.consequentNames || strongestRule.consequent || []).join(', ')}`
                    : 'Sem par dominante'}
                </strong>
                <p>
                  {strongestRule
                    ? `${strongestRule.pairCount} compras em conjunto e confianca de ${formatPercent(strongestRule.confidence * 100)}.`
                    : 'Assim que a cesta ganhar densidade, o par campeao aparece aqui com contexto de uso.'}
                </p>
              </article>

              <div className="dashboard-command-mosaic">
                <article className="dashboard-mini-tile">
                  <span>Lift</span>
                  <strong>{strongestRule ? strongestRule.lift.toFixed(2) : '0.00'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Confianca</span>
                  <strong>{strongestRule ? formatPercent(strongestRule.confidence * 100) : '0.0%'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Acao sugerida</span>
                  <strong>{strongestRule ? actionHint(strongestRule) : '--'}</strong>
                </article>
              </div>
            </div>
          </article>

          <aside className="dashboard-priority-rail">
            <article className="dashboard-priority-card">
              <span className="section-kicker">Fonte de leitura</span>
              <h3>Escolha velocidade ou processamento vivo.</h3>
              <p>Cache noturno para consulta rapida. Analise ao vivo quando precisar validar uma mudanca recente de comportamento.</p>
            </article>
            <article className="dashboard-priority-card">
              <span className="section-kicker">Uso pratico</span>
              <h3>Transforme par forte em exposicao e combo.</h3>
              <p>Os primeiros pares servem melhor para caixa, gondola lateral, ponta e comunicacao de compra conjunta.</p>
            </article>
          </aside>
        </section>

        <section className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <div className="metric-card metric-card-default reveal">
            <div className="metric-card-top"><span className="metric-card-title">Pares avaliados</span><span className="metric-card-icon">PR</span></div>
            <strong className="metric-card-value">{rules.length}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">regras retornadas no recorte</span></div>
          </div>
          <div className="metric-card metric-card-warning reveal">
            <div className="metric-card-top"><span className="metric-card-title">Confianca media</span><span className="metric-card-icon">CF</span></div>
            <strong className="metric-card-value">{formatPercent(averageConfidence * 100)}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">forca media das relacoes</span></div>
          </div>
          <div className="metric-card metric-card-danger reveal">
            <div className="metric-card-top"><span className="metric-card-title">Lift maximo</span><span className="metric-card-icon">LF</span></div>
            <strong className="metric-card-value">{strongestRule ? strongestRule.lift.toFixed(2) : '0.00'}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">maior impulso de combinacao</span></div>
          </div>
          <div className="metric-card metric-card-default reveal">
            <div className="metric-card-top"><span className="metric-card-title">Origem</span><span className="metric-card-icon">FG</span></div>
            <strong className="metric-card-value">{useCached ? 'Cache' : 'Ao vivo'}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">modo atual da analise</span></div>
          </div>
        </section>

        <div className="dashboard-page-grid">
          <section className="analytics-panel reveal dashboard-form-panel">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Origem</span>
                <h3>Escolha entre analise ao vivo e cache noturno</h3>
              </div>
            </div>
            <label className="toggle-row">
              <input type="checkbox" checked={useCached} onChange={(e) => setUseCached(e.target.checked)} />
              <span>{useCached ? 'Usando cache noturno' : 'Usando analise ao vivo'}</span>
            </label>
          </section>

          <aside className="dashboard-side-stack">
            <section className="analytics-panel reveal dashboard-note-card">
              <span className="section-kicker">Como agir</span>
              <h3>Leia lift junto com confianca.</h3>
              <div className="dashboard-quick-list">
                <div className="dashboard-quick-item">
                  <strong>Lift alto</strong>
                  <span>Bom candidato para exposicao conjunta e sugestao de venda.</span>
                </div>
                <div className="dashboard-quick-item">
                  <strong>Confianca alta</strong>
                  <span>Sinal mais estavel para orientar combo e abordagem de caixa.</span>
                </div>
                <div className="dashboard-quick-item">
                  <strong>Ocorrencia baixa</strong>
                  <span>Vale monitorar mais antes de transformar em regra operacional fixa.</span>
                </div>
              </div>
            </section>
          </aside>
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
