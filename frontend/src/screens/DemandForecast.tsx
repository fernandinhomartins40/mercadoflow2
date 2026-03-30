import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHeader from '../components/layout/PageHeader';
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

  return (
    <Layout>
      <div className="page analytics-page">
        <PageHeader
          title="Previsão de demanda"
          subtitle="Antecipe volume e reforce o estoque antes do pico."
          actions={
            <div className="filters-inline">
              <input
                className="input"
                type="number"
                value={days}
                style={{ width: 100 }}
                onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value))))}
              />
              <Button variant="secondary" onClick={load} disabled={loading}>Atualizar</Button>
            </div>
          }
        />

        <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <MetricsCard title="Horizonte" value={`${days} dias`} icon="HZ" />
          <MetricsCard title="Linhas previstas" value={rows.length} icon="LP" variant="warning" />
          <MetricsCard title="Total previsto" value={totalPredicted.toFixed(0)} icon="TP" variant="danger" />
          <MetricsCard title="Maior pico" value={strongest ? Number(strongest.predictedQuantity || 0).toFixed(1) : '0'} icon="PK" />
        </div>

        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        {loading ? (
          <div className="panel-empty">Carregando...</div>
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
                  <strong>{Number(row.predictedQuantity || 0).toFixed(1)} un</strong>
                  <div className="progress-track"><div className="progress-fill amber" style={{ width: `${Math.min(Number(row.predictedQuantity || 0) * 12, 100)}%` }} /></div>
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
