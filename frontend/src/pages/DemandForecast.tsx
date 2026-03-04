import React, { useEffect, useState } from 'react';
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

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <div>
            <span className="pill">Previsao de demanda</span>
            <h1 className="page-title">Tendencia por dia e dia da semana</h1>
            <p className="page-subtitle">
              A previsao considera historico diario, padrao por dia da semana e tendencia recente de volume.
            </p>
          </div>
          <div className="page-actions">
            <label style={{ color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
              Dias:
              <input
                className="input"
                type="number"
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value))))}
                style={{ width: 90 }}
              />
            </label>
            <Button variant="secondary" onClick={load} disabled={loading}>
              Atualizar
            </Button>
          </div>
        </div>

        <div className="card">
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

          {loading ? (
            <p>Carregando...</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Data</th>
                  <th>Qtd prevista</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ color: 'var(--muted)' }}>
                      Nenhuma previsao disponivel.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr key={`${row.productId}-${row.forecastDate}-${idx}`}>
                      <td>{row.productName || row.productId}</td>
                      <td>{row.forecastDate ? new Date(row.forecastDate).toLocaleDateString('pt-BR') : '-'}</td>
                      <td>{Number(row.predictedQuantity || 0).toFixed(3)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default DemandForecast;
