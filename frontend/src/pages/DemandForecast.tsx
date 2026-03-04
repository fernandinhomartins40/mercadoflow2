import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
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
      setError(err?.message || 'Erro ao carregar previsao');
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

  return (
    <Layout>
      <div className="page analytics-page">
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Previsao de demanda</span>
            <h1 className="analytics-hero-title">Antecipe volume e prepare operacao antes do pico chegar.</h1>
            <p className="analytics-hero-text">
              A leitura abaixo mostra previsoes ja ordenadas por pressao de demanda, priorizando os produtos que podem exigir reposicao, compra ou ajuste de equipe.
            </p>
            <div className="hero-chip-row">
              <span className="hero-chip">Horizonte de {days} dias</span>
              <span className="hero-chip">{rows.length} combinacoes previstas</span>
              <span className="hero-chip">Total previsto {totalPredicted.toFixed(2)}</span>
            </div>
          </div>
          <div className="analytics-hero-board single-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">Maior pressao prevista</span>
              <h3>{strongest?.productName || 'Sem previsao dominante'}</h3>
              <strong>{strongest ? Number(strongest.predictedQuantity || 0).toFixed(3) : '0.000'}</strong>
              <p>{strongest ? `Esperado para ${new Date(strongest.forecastDate).toLocaleDateString('pt-BR')}` : 'Quando houver base suficiente, o produto mais pressionado aparece aqui.'}</p>
            </div>
          </div>
        </section>

        <div className="analytics-panel filter-bar reveal">
          <div className="filter-bar-copy">
            <span className="section-kicker">Horizonte</span>
            <h3>Ajuste a janela de previsao</h3>
          </div>
          <div className="filter-bar-controls">
            <input
              className="input"
              type="number"
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value))))}
              style={{ maxWidth: 120 }}
            />
            <Button variant="secondary" onClick={load} disabled={loading}>Atualizar</Button>
          </div>
        </div>

        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        {loading ? (
          <div className="card">Carregando...</div>
        ) : (
          <div className="analytics-card-grid forecast-grid">
            {rows.length === 0 ? (
              <div className="analytics-panel"><div className="panel-empty">Nenhuma previsao disponivel.</div></div>
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
