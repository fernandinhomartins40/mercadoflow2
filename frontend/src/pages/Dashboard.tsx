import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import MetricsCard from '../components/dashboard/MetricsCard';
import SalesChart from '../components/dashboard/SalesChart';
import AlertsList from '../components/dashboard/AlertsList';
import { useMarketData } from '../hooks/useMarketData';
import { CampaignImpact, ProductPerformance, ProductPairInsight, PromotionImpact, SeasonalityPoint } from '../types/analytics.types';

const formatMoney = (value?: number | null) => `R$ ${Number(value || 0).toFixed(2)}`;
const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(1)}%`;
const formatCompact = (value?: number | null) => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
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
    return <Layout><div className="card">{error || 'Painel indisponível'}</div></Layout>;
  }

  const leadProduct = dashboard.topProducts?.[0];
  const weakestProduct = dashboard.lowTurnoverProducts?.[0];
  const leadPair = dashboard.topPairs?.[0];
  const leadPromotion = dashboard.promotionHighlights?.[0];
  const hottestCampaign = [...(dashboard.campaignImpacts || [])].sort((a, b) => Number(b.revenueLiftPercent || 0) - Number(a.revenueLiftPercent || 0))[0];
  const highPriorityAlerts = (dashboard.recentAlerts || []).filter((alert) => alert.priority === 'HIGH').length;
  const hottestHour = [...(dashboard.hourlySeasonality || [])].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0];
  const strongestWeekday = [...(dashboard.weekdaySeasonality || [])].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0];

  const renderProductStrip = (title: string, subtitle: string, rows: ProductPerformance[], tone: 'mint' | 'orange' | 'amber') => (
    <div className={`analytics-panel product-strip ${tone} reveal`}>
      <div className="analytics-panel-head compact">
        <div>
          <span className="section-kicker">{subtitle}</span>
          <h3>{title}</h3>
        </div>
      </div>
          {rows.length === 0 ? (
            <div className="panel-empty">Sem dados suficientes neste período.</div>
          ) : (
            <div className="product-strip-list">
              {rows.map((row, index) => (
                <Link key={row.productId} to={`/app/produtos/${row.productId}`} className="product-strip-row is-link">
                  <div className="rank-pill">{index + 1}</div>
                  <div className="product-strip-copy">
                    <strong>{row.name}</strong>
                    <span>{row.category || 'Sem categoria'} | Giro {Number(row.salesVelocity || 0).toFixed(2)}/dia</span>
                  </div>
                  <div className="product-strip-metric">
                    <strong>{formatMoney(row.revenue)}</strong>
                    <span>{formatPercent(row.revenueTrendPercentage)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
    </div>
  );

  const renderSeasonalityCard = (title: string, rows: SeasonalityPoint[], tone: 'mint' | 'orange' | 'amber') => {
    const maxRevenue = Math.max(...rows.map((row) => Number(row.revenue || 0)), 1);

    return (
      <div className={`analytics-panel seasonality-card ${tone} reveal`}>
        <div className="analytics-panel-head compact">
          <div>
            <span className="section-kicker">Sazonalidade</span>
            <h3>{title}</h3>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="panel-empty">Sem dados suficientes.</div>
        ) : (
          <div className="signal-list">
            {rows.map((row) => (
              <div key={row.key} className="signal-row">
                <div>
                  <strong>{row.label}</strong>
                  <span>{row.transactions} vendas</span>
                </div>
                <div className="signal-bar-shell">
                  <div className="signal-bar-fill" style={{ width: `${(Number(row.revenue || 0) / maxRevenue) * 100}%` }} />
                </div>
                <strong>{formatCompact(row.revenue)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderPromotionCards = (rows: PromotionImpact[]) => (
    <div className="analytics-card-grid three-cols">
      {rows.length === 0 ? (
        <div className="analytics-panel reveal"><div className="panel-empty">Nenhum produto com variação de preço relevante.</div></div>
      ) : (
        rows.map((row) => (
          <div key={row.productId} className="analytics-panel promo-card reveal">
            <div className="analytics-panel-head compact">
              <div>
                <span className="section-kicker">Elasticidade de preço</span>
                <h3>{row.name}</h3>
              </div>
              <span className="status-pill positive">{formatPercent(row.quantityLiftPercent)}</span>
            </div>
            <div className="promo-metric-row">
              <div>
                <span>Preço base</span>
                <strong>{formatMoney(row.baselinePrice)}</strong>
              </div>
              <div>
                <span>Preço promo</span>
                <strong>{formatMoney(row.promoAveragePrice)}</strong>
              </div>
            </div>
            <div className="promo-metric-row compact-row">
              <div>
                <span>Receita promo</span>
                <strong>{formatMoney(row.promoRevenue)}</strong>
              </div>
              <div>
                <span>Volume promo</span>
                <strong>{Number(row.promoQuantity || 0).toFixed(2)}</strong>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderCampaignCards = (rows: CampaignImpact[]) => (
    <div className="analytics-card-grid three-cols">
      {rows.length === 0 ? (
        <div className="analytics-panel reveal"><div className="panel-empty">Nenhuma campanha com janela suficiente para comparar.</div></div>
      ) : (
        rows.slice(0, 6).map((row) => (
          <div key={row.campaignId} className="analytics-panel campaign-card reveal">
            <div className="analytics-panel-head compact">
              <div>
                <span className="section-kicker">Campanha</span>
                <h3>{row.name}</h3>
              </div>
              <span className={`status-pill ${String(row.status || '').toLowerCase()}`}>{row.status}</span>
            </div>
            <div className="mini-metric-grid">
              <div><span>Antes</span><strong>{formatMoney(row.beforeRevenue)}</strong></div>
              <div><span>Durante</span><strong>{formatMoney(row.duringRevenue)}</strong></div>
              <div><span>Depois</span><strong>{formatMoney(row.afterRevenue)}</strong></div>
            </div>
            <div className="campaign-lift-row">
              <span>Lift de receita</span>
              <strong>{formatPercent(row.revenueLiftPercent)}</strong>
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <Layout>
      <div className="page analytics-page dashboard-home-page">
        <section className="dashboard-command-grid reveal">
          <article className="dashboard-command-card">
            <div className="dashboard-command-copy">
              <span className="pill">Painel de hoje</span>
              <h1 className="dashboard-command-title">Veja o que exige decisao agora sem navegar por telas demais.</h1>
              <p className="dashboard-command-text">
                A entrada do painel foi reorganizada para uma leitura direta: o item que lidera a receita, o risco mais urgente, a melhor janela de venda e os atalhos para agir primeiro.
              </p>
              <div className="hero-inline-actions">
                <Link className="button" to="/app/produtos">Abrir produtos</Link>
                <Link className="button secondary" to="/app/alertas">Ver alertas</Link>
              </div>
            </div>

            <div className="dashboard-command-showcase">
              <div className="dashboard-glow-card">
                <span className="section-kicker">Produto que puxa a receita</span>
                <h3>{leadProduct?.name || 'Sem destaque ainda'}</h3>
                <strong>{leadProduct ? formatMoney(leadProduct.revenue) : 'R$ 0.00'}</strong>
                <p>
                  {leadProduct
                    ? `Giro ${Number(leadProduct.salesVelocity || 0).toFixed(2)}/dia e tendencia ${formatPercent(leadProduct.revenueTrendPercentage)}.`
                    : 'Assim que houver massa critica, o principal item do periodo aparece aqui.'}
                </p>
              </div>

              <div className="dashboard-command-mosaic">
                <div className="dashboard-mini-tile">
                  <span>Janela mais forte</span>
                  <strong>{strongestWeekday?.label || '--'}</strong>
                  <small>{hottestHour?.label || 'Sem hora dominante'}</small>
                </div>
                <div className="dashboard-mini-tile">
                  <span>Compra casada</span>
                  <strong>{leadPair ? `${leadPair.antecedentName} + ${leadPair.consequentName}` : 'Sem par dominante'}</strong>
                  <small>{leadPair ? `Lift ${leadPair.lift.toFixed(2)}` : 'Sem recorrencia suficiente'}</small>
                </div>
                <div className="dashboard-mini-tile accent">
                  <span>Resposta a promocao</span>
                  <strong>{leadPromotion?.name || 'Sem resposta forte'}</strong>
                  <small>{leadPromotion ? `Lift ${formatPercent(leadPromotion.quantityLiftPercent)}` : 'Ainda sem comparacao confiavel'}</small>
                </div>
              </div>
            </div>
          </article>

          <aside className="dashboard-priority-rail">
            <div className="dashboard-priority-card dark">
              <span className="section-kicker">Prioridade imediata</span>
              <strong>{highPriorityAlerts} alertas altos</strong>
              <p>{weakestProduct ? `${weakestProduct.name} aparece entre os menores giros e merece revisao agora.` : 'Sem item em desaceleracao critica neste momento.'}</p>
              <Link className="button secondary" to="/app/alertas">Abrir fila de alertas</Link>
            </div>

            <div className="dashboard-priority-card">
              <span className="section-kicker">Atalho de compra</span>
              <strong>{leadProduct?.name || 'Sem item lider'}</strong>
              <p>{leadProduct ? `Receita ${formatMoney(leadProduct.revenue)} e giro ${Number(leadProduct.salesVelocity || 0).toFixed(2)}/dia.` : 'Assim que houver lideranca clara, ela aparece aqui.'}</p>
            </div>

            <div className="dashboard-priority-card">
              <span className="section-kicker">Atalho operacional</span>
              <strong>{hottestCampaign?.name || 'Campanhas sob controle'}</strong>
              <p>{hottestCampaign ? `Lift de receita ${formatPercent(hottestCampaign.revenueLiftPercent)}.` : 'Use a area de campanhas para comparar antes, durante e depois da acao.'}</p>
            </div>
          </aside>
        </section>

        <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <MetricsCard title="Receita do periodo" value={formatMoney(dashboard.totalRevenue)} change={dashboard.growthPercentage} icon="R$" caption="comparado ao periodo anterior" />
          <MetricsCard title="Ticket medio" value={formatMoney(dashboard.averageTicket)} icon="TM" caption="valor por compra" />
          <MetricsCard title="Transacoes" value={dashboard.totalTransactions} icon="NF" caption="notas processadas" />
          <MetricsCard title="Produtos ativos" value={dashboard.activeProducts} icon="SKU" caption="com venda no periodo" />
          <MetricsCard title="Share promocional" value={formatPercent((dashboard.promoRevenueShare || 0) * 100)} icon="%" variant="warning" caption="receita sob pressao de preco" />
          <MetricsCard title="Campanhas em curso" value={dashboard.campaignsRunning} icon="CP" variant="danger" caption="janelas abertas para validar" />
        </div>

        <section className="dashboard-workbench-grid">
          <SalesChart
            className="dashboard-chart-panel"
            data={(dashboard.salesTrend || []).map((point) => ({ date: point.date, revenue: Number(point.revenue || 0) }))}
            title="Pulso de receita do periodo"
            panelCopy="A curva principal fica no centro da leitura para orientar compra, exposicao e correcao de ritmo."
          />

          <div className="dashboard-stack-column">
            {renderProductStrip('Produtos que aceleram o caixa', 'Motor de crescimento', dashboard.topProducts || [], 'mint')}
            {renderProductStrip('Produtos que perderam ritmo', 'Desaceleracao', dashboard.slowMovers || [], 'orange')}
          </div>

          <div className="dashboard-stack-column">
            <AlertsList alerts={dashboard.recentAlerts || []} />
            <section className="analytics-panel reveal dashboard-note-card dashboard-quick-actions-card">
              <div className="analytics-panel-head">
                <div>
                  <span className="section-kicker">Acoes rapidas</span>
                  <h3>Comece por aqui</h3>
                </div>
              </div>
              <div className="dashboard-quick-list">
                <Link className="dashboard-quick-item" to="/app/produtos">
                  <strong>Consultar produto antes da compra</strong>
                  <span>Abra o dashboard do item e valide giro, preco e sazonalidade.</span>
                </Link>
                <Link className="dashboard-quick-item" to="/app/campanhas">
                  <strong>Validar o que realmente deu resultado</strong>
                  <span>Compare antes, durante e depois da acao para parar de decidir no feeling.</span>
                </Link>
                <Link className="dashboard-quick-item" to="/app/cesta">
                  <strong>Montar combos e compra casada</strong>
                  <span>Use os pares com maior lift para reforcar venda conjunta no salao e no caixa.</span>
                </Link>
              </div>
            </section>
          </div>
        </section>

        <div className="analytics-grid analytics-grid-main">
          <div className="analytics-side-stack">
            {renderProductStrip('Maior giro', 'Velocidade', dashboard.topTurnoverProducts || [], 'amber')}
            {renderProductStrip('Menor giro', 'Atenuação', dashboard.lowTurnoverProducts || [], 'orange')}
          </div>
          <div className="analytics-panel basket-showcase reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Comportamento de cesta</span>
                <h3>Pares que pedem exposição conjunta</h3>
              </div>
            </div>
            {(dashboard.topPairs || []).length === 0 ? (
              <div className="panel-empty">Sem pares relevantes no período.</div>
            ) : (
              <div className="pair-grid">
                {(dashboard.topPairs || []).slice(0, 6).map((pair: ProductPairInsight) => (
                  <div key={`${pair.antecedentId}-${pair.consequentId}`} className="pair-card">
                    <strong>{pair.antecedentName} + {pair.consequentName}</strong>
                    <div className="pair-meta">
                      <span>Lift {pair.lift.toFixed(2)}</span>
                      <span>Confiança {formatPercent(pair.confidence * 100)}</span>
                    </div>
                    <div className="pair-meta subtle">
                      <span>{pair.pairCount} compras juntas</span>
                      <span>Suporte {formatPercent(pair.support * 100)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <section className="analytics-section reveal">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker">Preço e promoção</span>
              <h2>O que reage à redução de preço</h2>
            </div>
          </div>
          {renderPromotionCards(dashboard.promotionHighlights || [])}
        </section>

        <section className="analytics-section reveal">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker">Campanhas</span>
              <h2>Antes, durante e depois da ação</h2>
            </div>
          </div>
          {renderCampaignCards(dashboard.campaignImpacts || [])}
        </section>

        <div className="analytics-card-grid three-cols">
          {renderSeasonalityCard('Dia da semana', dashboard.weekdaySeasonality || [], 'mint')}
          {renderSeasonalityCard('Hora do dia', dashboard.hourlySeasonality || [], 'orange')}
          {renderSeasonalityCard('Mês do ano', dashboard.monthlySeasonality || [], 'amber')}
        </div>

        <div className="analytics-grid analytics-grid-main">
          <div className="analytics-panel invoice-showcase reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Fluxo recente</span>
                <h3>Últimas notas recebidas</h3>
              </div>
            </div>
            {(dashboard.recentInvoices || []).length === 0 ? (
              <div className="panel-empty">Nenhuma nota recebida.</div>
            ) : (
              <div className="invoice-feed">
                {(dashboard.recentInvoices || []).map((invoice) => (
                  <div key={invoice.id} className="invoice-card">
                    <div>
                      <strong>NF {invoice.numero || '-'} {invoice.serie ? `/ ${invoice.serie}` : ''}</strong>
                      <span>{invoice.chaveNFe}</span>
                    </div>
                    <div className="invoice-card-side">
                      <strong>{formatMoney(invoice.valorTotal)}</strong>
                      <span>{formatDateTime(invoice.processedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <AlertsList alerts={dashboard.recentAlerts || []} />
        </div>

        {weakestProduct ? (
          <div className="analytics-footer-callout reveal">
            <strong>Leitura rápida:</strong> {weakestProduct.name} está entre os menores giros e merece revisão de exposição, preço ou sortimento antes de consumir espaço de gôndola sem retorno.
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default Dashboard;
