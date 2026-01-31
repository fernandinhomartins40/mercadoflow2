import React, { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import { analyticsService } from '../services/analytics.service';
import { useAuth } from '../context/AuthContext';

const MarketBasket: React.FC = () => {
  const { marketId } = useAuth();
  const [rules, setRules] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!marketId) return;
      const data = await analyticsService.getMarketBasket(marketId);
      setRules(data);
    };
    load();
  }, [marketId]);

  return (
    <Layout>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Cesta de mercado</h3>
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
          </tbody>
        </table>
      </div>
    </Layout>
  );
};

export default MarketBasket;
