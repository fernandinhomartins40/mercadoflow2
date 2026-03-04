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
    return <Layout><div className="card">{error || 'Painel indisponivel'}</div></Layout>;
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
            <div className="panel-empty">Sem dados suficientes neste periodo.</div>
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
        <div className="analytics-panel reveal"><div className="panel-empty">Nenhum produto com variacao de preco relevante.</div></div>
      ) : (
        rows.map((row) => (
          <div key={row.productId} className="analytics-panel promo-card reveal">
            <div className="analytics-panel-head compact">
              <div>
                <span className="section-kicker">Elasticidade de preco</span>
                <h3>{row.name}</h3>
              </div>
              <span className="status-pill positive">{formatPercent(row.quantityLiftPercent)}</span>
            </div>
            <div className="promo-metric-row">
              <div>
                <span>Preco base</span>
                <strong>{formatMoney(row.baselinePrice)}</strong>
              </div>
              <div>
                <span>Preco promo</span>
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
      <div className="page analytics-page">
        <section className="analytics-hero reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Painel de gestao em tempo real</span>
            <h1 className="analytics-hero-title">Onde a venda ganha tracao, perde ritmo e responde a preco.</h1>
            <p className="analytics-hero-text">
              O painel cruza notas reais para mostrar quais produtos puxam faturamento, quais empacam giro, quando o mercado esquenta e que combinacoes merecem exposicao conjunta.
            </p>
            <div className="hero-chip-row">
              <span className="hero-chip">{dashboard.totalTransactions} transacoes reais</span>
              <span className="hero-chip">{dashboard.activeProducts} produtos ativos</span>
              <span className="hero-chip">Share promo {formatPercent((dashboard.promoRevenueShare || 0) * 100)}</span>
            </div>
          </div>
          <div className="analytics-hero-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">Produto que mais puxa receita</span>
              <h3>{leadProduct?.name || 'Sem destaque ainda'}</h3>
              <strong>{leadProduct ? formatMoney(leadProduct.revenue) : 'R$ 0.00'}</strong>
              <p>{leadProduct ? `Giro ${Number(leadProduct.salesVelocity || 0).toFixed(2)}/dia e tendencia ${formatPercent(leadProduct.revenueTrendPercentage)}` : 'Assim que houver massa critica, o destaque aparece aqui.'}</p>
            </div>
            <div className="hero-focus-stack">
              <div className="hero-mini-card orange">
                <span>Compra casada mais forte</span>
                <strong>{leadPair ? `${leadPair.antecedentName} + ${leadPair.consequentName}` : 'Sem par dominante'}</strong>
                <small>{leadPair ? `Lift ${leadPair.lift.toFixed(2)} em ${leadPair.pairCount} compras` : 'Sem recorrencia suficiente'}</small>
              </div>
              <div className="hero-mini-card amber">
                <span>Promocao com maior resposta</span>
                <strong>{leadPromotion?.name || 'Sem resposta promocional'}</strong>
                <small>{leadPromotion ? `Lift de volume ${formatPercent(leadPromotion.quantityLiftPercent)}` : 'Ainda sem comparacoes confiaveis'}</small>
              </div>
              <div className="hero-mini-card mint">
                <span>Campanha mais forte</span>
                <strong>{hottestCampaign?.name || 'Sem campanha destacada'}</strong>
                <small>{hottestCampaign ? `Lift de receita ${formatPercent(hottestCampaign.revenueLiftPercent)}` : 'Cadastre campanhas para medir antes, durante e depois'}</small>
              </div>
            </div>
          </div>
        </section>

        <div className="metrics-grid analytics-metrics-grid">
          <MetricsCard title="Receita do periodo" value={formatMoney(dashboard.totalRevenue)} change={dashboard.growthPercentage} icon="R$" caption="comparado ao periodo anterior" />
          <MetricsCard title="Ticket medio" value={formatMoney(dashboard.averageTicket)} icon="TM" caption="valor por compra" />
          <MetricsCard title="Transacoes" value={dashboard.totalTransactions} icon="NF" caption="notas processadas" />
          <MetricsCard title="Produtos ativos" value={dashboard.activeProducts} icon="SKU" caption="com venda no periodo" />
          <MetricsCard title="Share promocional" value={formatPercent((dashboard.promoRevenueShare || 0) * 100)} icon="%" variant="warning" caption="receita sob pressao de preco" />
          <MetricsCard title="Campanhas em curso" value={dashboard.campaignsRunning} icon="CP" variant="danger" caption="janelas abertas para validar" />
        </div>

        <section className="executive-canvas reveal">
          <article className="executive-card blue">
            <span className="section-kicker">Momento de venda</span>
            <h3>{strongestWeekday?.label || '--'} e {hottestHour?.label || '--'}</h3>
            <p>O mercado concentra mais receita nesse recorte. Use esse pulso para compra, escala e exposição.</p>
          </article>
          <article className="executive-card coral">
            <span className="section-kicker">Produto para negociar</span>
            <h3>{leadProduct?.name || '--'}</h3>
            <p>{leadProduct ? `${formatMoney(leadProduct.revenue)} de receita e giro ${Number(leadProduct.salesVelocity || 0).toFixed(2)}/dia.` : 'Sem produto dominante no período.'}</p>
          </article>
          <article className="executive-card amber">
            <span className="section-kicker">Resposta a promo</span>
            <h3>{leadPromotion?.name || '--'}</h3>
            <p>{leadPromotion ? `Lift de volume ${formatPercent(leadPromotion.quantityLiftPercent)} com preço promo em ${formatMoney(leadPromotion.promoAveragePrice)}.` : 'Ainda não há item com resposta promocional forte.'}</p>
          </article>
          <article className="executive-card mint">
            <span className="section-kicker">Atenção imediata</span>
            <h3>{highPriorityAlerts} alertas altos</h3>
            <p>{weakestProduct ? `${weakestProduct.name} segue entre os menores giros e merece revisão imediata.` : 'Sem alerta crítico recente.'}</p>
          </article>
        </section>

        <section className="action-lab-grid reveal">
          <Link className="action-lab-card" to="/app/produtos">
            <span className="section-kicker">Fornecedor</span>
            <h3>Consultar produto antes da compra</h3>
            <p>Abra o dashboard do item, veja sazonalidade, preço, giro e distribuição por PDV.</p>
          </Link>
          <Link className="action-lab-card" to="/app/campanhas">
            <span className="section-kicker">Promoções</span>
            <h3>Validar o que realmente deu resultado</h3>
            <p>Compare antes, durante e depois da ação para parar de decidir no feeling.</p>
          </Link>
          <Link className="action-lab-card" to="/app/cesta">
            <span className="section-kicker">Exposição</span>
            <h3>Montar combos e compra casada</h3>
            <p>Use os pares com maior lift para reforçar venda conjunta no salão e no caixa.</p>
          </Link>
          <Link className="action-lab-card" to="/app/alertas">
            <span className="section-kicker">Operação</span>
            <h3>Atacar risco e desaceleração</h3>
            <p>Veja os sinais que exigem ação e corrija antes que virem perda de margem.</p>
          </Link>
        </section>

        <div className="analytics-grid analytics-grid-main">
          <div className="analytics-panel reveal product-radar-panel">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Radar de produto</span>
                <h3>Consulte um item antes de negociar com o fornecedor</h3>
              </div>
              <Link className="button" to="/app/produtos">Abrir mapa de produtos</Link>
            </div>
            <p className="panel-copy">
              Busque por nome ou GTIN e abra o dashboard do produto para ver performance, resposta a preco, sazonalidade e comparacao por PDV.
            </p>
            <div className="mini-metric-grid triple">
              <div>
                <span>Produto mais quente</span>
                <strong>{leadProduct?.name || '--'}</strong>
              </div>
              <div>
                <span>Produto mais lento</span>
                <strong>{weakestProduct?.name || '--'}</strong>
              </div>
              <div>
                <span>Melhor compra casada</span>
                <strong>{leadPair ? `${leadPair.antecedentName} + ${leadPair.consequentName}` : '--'}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="analytics-grid analytics-grid-main">
          <SalesChart data={(dashboard.salesTrend || []).map((point) => ({ date: point.date, revenue: Number(point.revenue || 0) }))} />
          <div className="analytics-side-stack">
            {renderProductStrip('Produtos que aceleram o caixa', 'Motor de crescimento', dashboard.topProducts || [], 'mint')}
            {renderProductStrip('Produtos que perderam ritmo', 'Desaceleracao', dashboard.slowMovers || [], 'orange')}
          </div>
        </div>

        <div className="analytics-grid analytics-grid-main">
          <div className="analytics-side-stack">
            {renderProductStrip('Maior giro', 'Velocidade', dashboard.topTurnoverProducts || [], 'amber')}
            {renderProductStrip('Menor giro', 'Atenuacao', dashboard.lowTurnoverProducts || [], 'orange')}
          </div>
          <div className="analytics-panel basket-showcase reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Comportamento de cesta</span>
                <h3>Pares que pedem exposicao conjunta</h3>
              </div>
            </div>
            {(dashboard.topPairs || []).length === 0 ? (
              <div className="panel-empty">Sem pares relevantes no periodo.</div>
            ) : (
              <div className="pair-grid">
                {(dashboard.topPairs || []).slice(0, 6).map((pair: ProductPairInsight) => (
                  <div key={`${pair.antecedentId}-${pair.consequentId}`} className="pair-card">
                    <strong>{pair.antecedentName} + {pair.consequentName}</strong>
                    <div className="pair-meta">
                      <span>Lift {pair.lift.toFixed(2)}</span>
                      <span>Confianca {formatPercent(pair.confidence * 100)}</span>
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
              <span className="section-kicker">Preco e promocao</span>
              <h2>O que reage a reducao de preco</h2>
            </div>
          </div>
          {renderPromotionCards(dashboard.promotionHighlights || [])}
        </section>

        <section className="analytics-section reveal">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker">Campanhas</span>
              <h2>Antes, durante e depois da acao</h2>
            </div>
          </div>
          {renderCampaignCards(dashboard.campaignImpacts || [])}
        </section>

        <div className="analytics-card-grid three-cols">
          {renderSeasonalityCard('Dia da semana', dashboard.weekdaySeasonality || [], 'mint')}
          {renderSeasonalityCard('Hora do dia', dashboard.hourlySeasonality || [], 'orange')}
          {renderSeasonalityCard('Mes do ano', dashboard.monthlySeasonality || [], 'amber')}
        </div>

        <div className="analytics-grid analytics-grid-main">
          <div className="analytics-panel invoice-showcase reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Fluxo recente</span>
                <h3>Ultimas notas recebidas</h3>
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
            <strong>Leitura rapida:</strong> {weakestProduct.name} esta entre os menores giros e merece revisao de exposicao, preco ou sortimento antes de consumir espaco de gondola sem retorno.
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default Dashboard;
