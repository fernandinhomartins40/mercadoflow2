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
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const data = await marketService.getDemandForecast(marketId, days);
      setRows(data || []);
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

  return (
    <Layout>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Previsão de demanda</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

        {loading ? (
          <p>Carregando...</p>
        ) : (
          <table className="table" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Produto</th>
                <th>Qtd prevista</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ color: 'var(--muted)' }}>
                    Nenhuma previsão disponível (aguarde o job noturno ou verifique se há vendas agregadas).
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={`${r.productId}-${r.forecastDate}-${idx}`}>
                    <td>{r.forecastDate ? new Date(r.forecastDate).toLocaleDateString('pt-BR') : '-'}</td>
                    <td>{r.productName || r.productId}</td>
                    <td>{Number(r.predictedQuantity || 0).toFixed(3)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
};

export default DemandForecast;

