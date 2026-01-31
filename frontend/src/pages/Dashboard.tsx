import React from 'react';
import Layout from '../components/layout/Layout';
import MetricsCard from '../components/dashboard/MetricsCard';
import SalesChart from '../components/dashboard/SalesChart';
import AlertsList from '../components/dashboard/AlertsList';
import { useMarketData } from '../hooks/useMarketData';

const Dashboard: React.FC = () => {
  const { dashboard, loading, error } = useMarketData();

  if (loading) {
    return <Layout><div className="card">Carregando...</div></Layout>;
  }
  if (error) {
    return <Layout><div className="card">{error}</div></Layout>;
  }

  return (
    <Layout>
      <div className="metrics-grid">
        <MetricsCard title="Vendas de hoje" value={`R$ ${Number(dashboard.todayRevenue || 0).toFixed(2)}`} />
        <MetricsCard title="Vendas do mês" value={`R$ ${Number(dashboard.totalRevenue || 0).toFixed(2)}`} change={dashboard.growthPercentage} />
        <MetricsCard title="Alertas pendentes" value={dashboard.unreadAlerts || 0} variant="warning" />
        <MetricsCard title="Produtos ativos" value={dashboard.activeProducts || 0} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 20 }}>
        <SalesChart data={(dashboard.salesTrend || []).map((p: any) => ({ date: p.date, revenue: Number(p.revenue) }))} />
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Produtos com maior receita</h3>
          <ul>
            {(dashboard.topSellers || []).map((item: any) => (
              <li key={item.productId} style={{ marginBottom: 8 }}>
                {item.name} - R$ {Number(item.revenue || 0).toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <AlertsList alerts={dashboard.recentAlerts || []} />
      </div>
    </Layout>
  );
};

export default Dashboard;
