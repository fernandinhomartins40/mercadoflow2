import React, { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import { analyticsService } from '../services/analytics.service';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';

const MarketBasket: React.FC = () => {
  const { marketId } = useAuth();
  const [rules, setRules] = useState<any[]>([]);
  const [useCached, setUseCached] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!marketId) return;
      const data = useCached
        ? await marketService.getCachedMarketBasket(marketId)
        : await analyticsService.getMarketBasket(marketId);
      setRules(data || []);
    };
    load();
  }, [marketId, useCached]);

  return (
    <Layout>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Cesta de mercado</h3>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted)' }}>
            <input type="checkbox" checked={useCached} onChange={(e) => setUseCached(e.target.checked)} />
            Usar cache
          </label>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Antecedente</th>
              <th>Consequente</th>
              <th>Suporte</th>
              <th>Confiança</th>
              <th>Lift</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, idx) => (
              <tr key={idx}>
                <td>{(rule.antecedentNames || rule.antecedent || []).join(', ')}</td>
                <td>{(rule.consequentNames || rule.consequent || []).join(', ')}</td>
                <td>{Number(rule.support || 0).toFixed(3)}</td>
                <td>{Number(rule.confidence || 0).toFixed(3)}</td>
                <td>{Number(rule.lift || 0).toFixed(2)}</td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--muted)' }}>
                  Nenhuma regra encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
};

export default MarketBasket;
