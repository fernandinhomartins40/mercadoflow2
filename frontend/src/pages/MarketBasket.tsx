import React, { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import { analyticsService } from '../services/analytics.service';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';

const MarketBasket: React.FC = () => {
  const { marketId } = useAuth();
  const [rules, setRules] = useState<any[]>([]);
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

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <div>
            <span className="pill">Compra casada</span>
            <h1 className="page-title">Produtos que vendem juntos</h1>
            <p className="page-subtitle">
              Use lift, confiança e número de ocorrências para decidir exposição conjunta, kits e ações promocionais.
            </p>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted)' }}>
            <input type="checkbox" checked={useCached} onChange={(e) => setUseCached(e.target.checked)} />
            Usar cache noturno
          </label>
        </div>

        <div className="card">
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          {loading ? (
            <p>Carregando...</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Produto A</th>
                  <th>Produto B</th>
                  <th>Ocorrencias</th>
                  <th>Suporte</th>
                  <th>Confianca</th>
                  <th>Lift</th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ color: 'var(--muted)' }}>
                      Nenhuma regra encontrada.
                    </td>
                  </tr>
                ) : (
                  rules.map((rule, idx) => (
                    <tr key={idx}>
                      <td>{(rule.antecedentNames || rule.antecedent || []).join(', ')}</td>
                      <td>{(rule.consequentNames || rule.consequent || []).join(', ')}</td>
                      <td>{rule.pairCount || 0}</td>
                      <td>{(Number(rule.support || 0) * 100).toFixed(2)}%</td>
                      <td>{(Number(rule.confidence || 0) * 100).toFixed(2)}%</td>
                      <td>{Number(rule.lift || 0).toFixed(2)}</td>
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

export default MarketBasket;
