import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import MetricsCard from '../components/dashboard/MetricsCard';
import PanelSection from '../components/dashboard/PanelSection';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';

interface ForecastRow {
  forecastDate: string;
  productId: string;
  productName: string;
  predictedQuantity: number;
}

const DemandForecast: React.FC = () => {
  const { marketId } = useAuth();
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const data = await marketService.getDemandForecast(marketId, days);
      setRows((data || []).sort((a: ForecastRow, b: ForecastRow) => Number(b.predictedQuantity || 0) - Number(a.predictedQuantity || 0)));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar previsão');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [marketId, days]);

  const strongest = rows[0];
  const totalPredicted = useMemo(() => rows.reduce((sum, row) => sum + Number(row.predictedQuantity || 0), 0), [rows]);
  const metrics = [
    { title: 'Horizonte', value: `${days} dias`, icon: 'HZ', caption: 'janela ativa da previsão' },
    { title: 'Linhas previstas', value: rows.length, icon: 'LP', variant: 'warning' as const, caption: 'combinações produto x dia' },
    { title: 'Total previsto', value: totalPredicted.toFixed(2), icon: 'TP', variant: 'danger' as const, caption: 'volume consolidado do recorte' },
    { title: 'Maior pico', value: strongest ? Number(strongest.predictedQuantity || 0).toFixed(3) : '0.000', icon: 'PK', caption: 'pressão máxima encontrada' },
  ];

  return (
    <Layout>
      <div className="page analytics-page">
        <section className="dashboard-command-grid reveal">
          <article className="dashboard-command-card">
            <div className="dashboard-command-copy">
              <span className="pill">Previsão de demanda</span>
              <h1 className="dashboard-command-title">Antecipe volume antes do pico chegar na operação.</h1>
              <p className="dashboard-command-text">
                Esta leitura organiza a pressão de demanda por prioridade, para o time agir em compra, reposição e equipe sem esperar a ruptura aparecer no caixa.
              </p>
              <div className="hero-chip-row">
                <span className="hero-chip">Horizonte de {days} dias</span>
                <span className="hero-chip">{rows.length} combinações previstas</span>
                <span className="hero-chip">Total previsto {totalPredicted.toFixed(2)}</span>
              </div>
            </div>

            <div className="dashboard-command-showcase">
              <article className="dashboard-glow-card">
                <span className="section-kicker">Maior pressão prevista</span>
                <strong>{strongest?.productName || 'Sem previsão dominante'}</strong>
                <p>
                  {strongest
                    ? `Esperado para ${new Date(strongest.forecastDate).toLocaleDateString('pt-BR')} com ${Number(strongest.predictedQuantity || 0).toFixed(3)} unidades.`
                    : 'Quando houver base suficiente, o item mais pressionado aparece aqui com prioridade.'}
                </p>
              </article>

              <div className="dashboard-command-mosaic">
                <article className="dashboard-mini-tile">
                  <span>Quantidade prevista</span>
                  <strong>{strongest ? Number(strongest.predictedQuantity || 0).toFixed(3) : '0.000'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Dia do pico</span>
                  <strong>{strongest?.forecastDate ? new Date(strongest.forecastDate).toLocaleDateString('pt-BR') : '--'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Linhas previstas</span>
                  <strong>{rows.length}</strong>
                </article>
              </div>
            </div>
          </article>

          <aside className="dashboard-priority-rail">
            <article className="dashboard-priority-card">
              <span className="section-kicker">Uso recomendado</span>
              <h3>Encurte o horizonte quando precisar agir rápido.</h3>
              <p>Janelas curtas ajudam na reposição imediata. Janelas maiores servem melhor para compra e preparação de time.</p>
            </article>
            <article className="dashboard-priority-card">
              <span className="section-kicker">Leitura prática</span>
              <h3>Trate o topo da lista como fila de atenção.</h3>
              <p>Os primeiros itens são os que mais pressionam estoque e operação no recorte selecionado.</p>
            </article>
          </aside>
        </section>

        <section className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          {metrics.map((metric) => (
            <MetricsCard
              key={metric.title}
              title={metric.title}
              value={metric.value}
              icon={metric.icon}
              variant={metric.variant}
              caption={metric.caption}
            />
          ))}
        </section>

        <div className="dashboard-page-grid">
          <PanelSection className="dashboard-form-panel" kicker="Horizonte" title="Ajuste a janela de previsão">
            <div className="dashboard-form-stack">
              <input
                className="input"
                type="number"
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value))))}
              />
              <Button variant="secondary" onClick={load} disabled={loading}>Atualizar</Button>
            </div>
          </PanelSection>

          <aside className="dashboard-side-stack">
            <PanelSection className="dashboard-note-card" kicker="Como usar" title="Transforme previsão em ação operacional.">
              <div className="dashboard-quick-list">
                <div className="dashboard-quick-item">
                  <strong>Compra</strong>
                  <span>Use o topo da lista para priorizar reposição e pedido antes do pico.</span>
                </div>
                <div className="dashboard-quick-item">
                  <strong>Equipe</strong>
                  <span>Picos concentrados pedem reforço de atendimento e abastecimento nos dias certos.</span>
                </div>
                <div className="dashboard-quick-item">
                  <strong>Revisão</strong>
                  <span>Se o item previsto parece estranho, compare com o histórico do produto antes de agir.</span>
                </div>
              </div>
            </PanelSection>
          </aside>
        </div>

        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        {loading ? (
          <div className="card">Carregando...</div>
        ) : (
          <div className="analytics-card-grid forecast-grid">
            {rows.length === 0 ? (
              <div className="analytics-panel"><div className="panel-empty">Nenhuma previsão disponível.</div></div>
            ) : (
              rows.map((row, idx) => (
                <article key={`${row.productId}-${row.forecastDate}-${idx}`} className="forecast-card reveal">
                  <div className="forecast-card-top">
                    <span className="rank-pill">#{idx + 1}</span>
                    <span>{new Date(row.forecastDate).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <h3>{row.productName || row.productId}</h3>
                  <strong>{Number(row.predictedQuantity || 0).toFixed(3)}</strong>
                  <div className="progress-track"><div className="progress-fill amber" style={{ width: `${Math.min(Number(row.predictedQuantity || 0) * 12, 100)}%` }} /></div>
                  <span className="forecast-caption">Quantidade prevista para o dia.</span>
                </article>
              ))
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default DemandForecast;
