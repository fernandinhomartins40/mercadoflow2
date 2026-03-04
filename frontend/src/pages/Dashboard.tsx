import React from 'react';
import Layout from '../components/layout/Layout';
import MetricsCard from '../components/dashboard/MetricsCard';
import SalesChart from '../components/dashboard/SalesChart';
import AlertsList from '../components/dashboard/AlertsList';
import { useMarketData } from '../hooks/useMarketData';
import { CampaignImpact, ProductPerformance, PromotionImpact, SeasonalityPoint } from '../types/analytics.types';

const formatMoney = (value?: number | null) => `R$ ${Number(value || 0).toFixed(2)}`;
const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(1)}%`;
const formatDateTime = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('pt-BR');
};

const Dashboard: React.FC = () => {
  const { dashboard, loading, error } = useMarketData();

  if (loading) {
    return <Layout><div className="card">Carregando...</div></Layout>;
  }

  if (error || !dashboard) {
    return <Layout><div className="card">{error || 'Painel indisponivel'}</div></Layout>;
  }

  const renderProductList = (title: string, rows: ProductPerformance[], accent?: string) => (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {rows.length === 0 ? (
        <div style={{ color: 'var(--muted)' }}>Sem produtos suficientes neste periodo.</div>
      ) : (
        <div className="list">
          {rows.map((row, index) => (
            <div key={row.productId} className="list-item">
              <div className="list-index" style={accent ? { background: accent, color: 'white' } : undefined}>{index + 1}</div>
              <div style={{ flex: 1 }}>
                <strong>{row.name}</strong>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  Receita {formatMoney(row.revenue)} | Giro {Number(row.salesVelocity || 0).toFixed(2)}/dia | Tendencia {formatPercent(row.revenueTrendPercentage)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSeasonality = (title: string, rows: SeasonalityPoint[]) => (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {rows.length === 0 ? (
        <div style={{ color: 'var(--muted)' }}>Sem dados suficientes.</div>
      ) : (
        <div className="list">
          {rows.map((row) => (
            <div key={row.key} className="info-row">
              <span>{row.label}</span>
              <strong>{formatMoney(row.revenue)} | {row.transactions} vendas</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPromotionTable = (rows: PromotionImpact[]) => (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Preco normal vs promocional</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Base</th>
            <th>Preco promo</th>
            <th>Receita promo</th>
            <th>Lift volume</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ color: 'var(--muted)' }}>Nenhum produto com variacao de preco relevante.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.productId}>
                <td>{row.name}</td>
                <td>{formatMoney(row.baselinePrice)}</td>
                <td>{formatMoney(row.promoAveragePrice)}</td>
                <td>{formatMoney(row.promoRevenue)}</td>
                <td>{formatPercent(row.quantityLiftPercent)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const renderCampaignImpact = (rows: CampaignImpact[]) => (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Impacto das campanhas</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Campanha</th>
            <th>Status</th>
            <th>Antes</th>
            <th>Durante</th>
            <th>Depois</th>
            <th>Lift receita</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ color: 'var(--muted)' }}>Nenhuma campanha com periodo fechado para comparar.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.campaignId}>
                <td>
                  <div>{row.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{formatDateTime(row.startDate)} ate {formatDateTime(row.endDate)}</div>
                </td>
                <td>{row.status}</td>
                <td>{formatMoney(row.beforeRevenue)}</td>
                <td>{formatMoney(row.duringRevenue)}</td>
                <td>{formatMoney(row.afterRevenue)}</td>
                <td>{formatPercent(row.revenueLiftPercent)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <div>
            <span className="pill">Cockpit analitico</span>
            <h1 className="page-title">Decisoes orientadas por nota fiscal</h1>
            <p className="page-subtitle">
              Compare giro, sazonalidade, compra casada, elasticidade de preco e impacto de campanhas usando os dados reais capturados pelo agente.
            </p>
          </div>
        </div>

        <div className="metrics-grid">
          <MetricsCard title="Receita do periodo" value={formatMoney(dashboard.totalRevenue)} change={dashboard.growthPercentage} />
          <MetricsCard title="Ticket medio" value={formatMoney(dashboard.averageTicket)} />
          <MetricsCard title="Transacoes" value={dashboard.totalTransactions} />
          <MetricsCard title="Produtos ativos" value={dashboard.activeProducts} />
          <MetricsCard title="Share promocional" value={formatPercent((dashboard.promoRevenueShare || 0) * 100)} />
          <MetricsCard title="Campanhas em curso" value={dashboard.campaignsRunning} />
        </div>

        <div className="page-grid">
          <div className="list">
            <SalesChart data={(dashboard.salesTrend || []).map((point) => ({ date: point.date, revenue: Number(point.revenue || 0) }))} />
            {renderPromotionTable(dashboard.promotionHighlights || [])}
            {renderCampaignImpact(dashboard.campaignImpacts || [])}
          </div>

          <div className="list">
            {renderProductList('Top produtos', dashboard.topProducts || [], 'var(--accent-primary)')}
            {renderProductList('Produtos em desaceleracao', dashboard.slowMovers || [], 'var(--accent-secondary)')}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {renderProductList('Maior giro', dashboard.topTurnoverProducts || [], 'var(--accent-primary)')}
          {renderProductList('Menor giro', dashboard.lowTurnoverProducts || [], 'var(--accent-tertiary)')}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Compra casada</h3>
            {(dashboard.topPairs || []).length === 0 ? (
              <div style={{ color: 'var(--muted)' }}>Sem pares relevantes no periodo.</div>
            ) : (
              <div className="list">
                {(dashboard.topPairs || []).map((pair) => (
                  <div key={`${pair.antecedentId}-${pair.consequentId}`} className="info-row" style={{ display: 'block' }}>
                    <strong>{pair.antecedentName} + {pair.consequentName}</strong>
                    <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                      Lift {pair.lift.toFixed(2)} | Confianca {formatPercent(pair.confidence * 100)} | {pair.pairCount} compras juntas
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {renderSeasonality('Sazonalidade por dia da semana', dashboard.weekdaySeasonality || [])}
          {renderSeasonality('Sazonalidade por hora', dashboard.hourlySeasonality || [])}
          {renderSeasonality('Sazonalidade por mes', dashboard.monthlySeasonality || [])}
        </div>

        <div className="page-grid">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Ultimas notas recebidas</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Nota</th>
                  <th>Valor</th>
                  <th>Recebida em</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard.recentInvoices || []).length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ color: 'var(--muted)' }}>Nenhuma nota recebida.</td>
                  </tr>
                ) : (
                  dashboard.recentInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        NF {invoice.numero || '-'} {invoice.serie ? `/ ${invoice.serie}` : ''}
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{invoice.chaveNFe}</div>
                      </td>
                      <td>{formatMoney(invoice.valorTotal)}</td>
                      <td>{formatDateTime(invoice.processedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <AlertsList alerts={dashboard.recentAlerts || []} />
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
