import React from 'react';
import Layout from '../components/layout/Layout';
import MetricsCard from '../components/dashboard/MetricsCard';
import SalesChart from '../components/dashboard/SalesChart';
import AlertsList from '../components/dashboard/AlertsList';
import { useMarketData } from '../hooks/useMarketData';

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Ainda não recebida';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Ainda não recebida';
  return date.toLocaleString('pt-BR');
};

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
        <MetricsCard title="Notas recebidas" value={dashboard.totalInvoices || 0} />
        <MetricsCard title="Recebidas 24h" value={dashboard.invoicesLast24h || 0} />
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 20 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Ingestão do coletor</h3>
          <div style={{ color: 'var(--muted)', marginBottom: 12 }}>
            Última nota processada: <strong>{formatDateTime(dashboard.lastInvoiceProcessedAt)}</strong>
          </div>
          {(dashboard.recentInvoices || []).length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>
              Nenhuma nota recebida ainda. Se o desktop mostrar envios com sucesso, este bloco deve atualizar em seguida.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {(dashboard.recentInvoices || []).map((invoice: any) => (
                <li
                  key={invoice.id}
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      NF {invoice.numero || '-'} {invoice.serie ? `/ Série ${invoice.serie}` : ''}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      Chave: {invoice.chaveNFe}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      Emissão: {formatDateTime(invoice.dataEmissao)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600 }}>
                      R$ {Number(invoice.valorTotal || 0).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      Recebida: {formatDateTime(invoice.processedAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <AlertsList alerts={dashboard.recentAlerts || []} />
      </div>
    </Layout>
  );
};

export default Dashboard;
