import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import SalesChart from '../components/dashboard/SalesChart';
import { useAuth } from '../context/AuthContext';
import { marketService } from '../services/market.service';
import {
  ProductBranchPerformance,
  ProductDashboard,
  ProductPairInsight,
  ProductPriceEvent,
  ProductPromotionWindow,
  SeasonalityPoint,
} from '../types/analytics.types';

const formatMoney = (value?: number | null) => `R$ ${Number(value || 0).toFixed(2)}`;
const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(2)}%`;
const formatSignedPercent = (value?: number | null) => {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toFixed(2)}%`;
};

const formatDate = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleDateString('pt-BR');
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('pt-BR');
};

const mapPromotionStatus = (status?: string | null) => {
  switch ((status || '').toUpperCase()) {
    case 'CONFIRMED':
      return 'Confirmada';
    case 'CLOSED':
      return 'Encerrada';
    case 'SUSPECTED':
      return 'Suspeita';
    default:
      return status || 'Não classificada';
  }
};

const formatTriggerType = (value?: string | null) => {
  if (!value) return 'Variação de preço';
  return value
    .toLowerCase()
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
};

const ProductDetail: React.FC = () => {
  const { marketId } = useAuth();
  const { productId } = useParams<{ productId: string }>();
  const [dashboard, setDashboard] = useState<ProductDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!marketId || !productId) {
        setLoading(false);
        setError('Produto não encontrado');
        return;
      }

      setLoading(true);
      try {
        const data = await marketService.getProductDashboard(marketId, productId);
        setDashboard(data);
        setError(null);
      } catch (err: any) {
        setDashboard(null);
        setError(err?.message || 'Erro ao carregar o dashboard do produto');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [marketId, productId]);

  const overview = dashboard?.overview;
  const bestBranch = useMemo(() => (dashboard?.branchPerformance || [])[0], [dashboard]);

  const weekdayPeak = useMemo(() => {
    return [...(dashboard?.weekdaySeasonality || [])].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0];
  }, [dashboard]);

  const strongestPair = useMemo(() => {
    return [...(dashboard?.relatedPairs || [])].sort((a, b) => Number(b.lift || 0) - Number(a.lift || 0))[0];
  }, [dashboard]);

  const priceTimeline = dashboard?.priceTimeline;
  const priceTimelinePoints = priceTimeline?.points || [];

  const priceEvents = useMemo(
    () => [...(dashboard?.priceEvents || [])].sort((a, b) => new Date(b.eventAt || 0).getTime() - new Date(a.eventAt || 0).getTime()),
    [dashboard]
  );

  const promotionWindows = useMemo(
    () => [...(dashboard?.promotionWindows || [])].sort((a, b) => new Date(b.startAt || 0).getTime() - new Date(a.startAt || 0).getTime()),
    [dashboard]
  );

  const firstObservedPrice = Number(priceTimeline?.firstObservedPrice || 0);
  const lastObservedPrice = Number(priceTimeline?.lastObservedPrice || 0);
  const timelineDeltaPercent = firstObservedPrice > 0 ? ((lastObservedPrice - firstObservedPrice) / firstObservedPrice) * 100 : 0;

  const renderSeasonality = (rows: SeasonalityPoint[]) => {
    if (!rows.length) {
      return <div className="panel-empty">Sem sazonalidade suficiente neste período.</div>;
    }

    const maxRevenue = Math.max(...rows.map((row) => Number(row.revenue || 0)), 1);

    return (
      <div className="signal-list">
        {rows.map((row) => (
          <div key={row.key} className="signal-row">
            <div>
              <strong>{row.label}</strong>
              <span>{row.transactions} compras</span>
            </div>
            <div className="signal-bar-shell">
              <div className="signal-bar-fill solid-blue" style={{ width: `${(Number(row.revenue || 0) / maxRevenue) * 100}%` }} />
            </div>
            <strong>{formatMoney(row.revenue)}</strong>
          </div>
        ))}
      </div>
    );
  };

  const renderBranches = (rows: ProductBranchPerformance[]) => {
    if (rows.length === 0) {
      return <div className="panel-empty">Sem distribuição por PDV neste período.</div>;
    }

    const maxRevenue = Math.max(...rows.map((row) => Number(row.revenue || 0)), 1);

    return (
      <div className="branch-grid">
        {rows.map((branch) => (
          <article key={branch.branchId || branch.branchName} className="branch-card">
            <div className="branch-card-head">
              <div>
                <span className="section-kicker">PDV / filial operacional</span>
                <h3>{branch.branchName}</h3>
              </div>
              <span className="status-pill positive">{formatPercent((branch.promoRevenueShare || 0) * 100)} promo</span>
            </div>

            <div className="mini-metric-grid dual">
              <div>
                <span>Receita</span>
                <strong>{formatMoney(branch.revenue)}</strong>
              </div>
              <div>
                <span>Quantidade</span>
                <strong>{Number(branch.quantitySold || 0).toFixed(2)}</strong>
              </div>
              <div>
                <span>Preço médio</span>
                <strong>{formatMoney(branch.averagePrice)}</strong>
              </div>
              <div>
                <span>Transações</span>
                <strong>{branch.transactionCount || 0}</strong>
              </div>
            </div>

            <div className="progress-track">
              <div className="progress-fill solid-pink" style={{ width: `${(Number(branch.revenue || 0) / maxRevenue) * 100}%` }} />
            </div>

            <div className="product-card-foot">
              <span>Última venda em {formatDate(branch.lastSoldAt)}</span>
            </div>
          </article>
        ))}
      </div>
    );
  };

  const renderPriceEvents = (rows: ProductPriceEvent[]) => {
    if (rows.length === 0) {
      return <div className="panel-empty">Sem eventos relevantes de variação de preço no período.</div>;
    }

    return (
      <div className="price-event-list">
        {rows.slice(0, 8).map((event) => {
          const isDown = (event.direction || '').toUpperCase() === 'DOWN';
          return (
            <article key={event.id} className="price-event-item">
              <div>
                <span className={`status-pill ${isDown ? 'positive' : 'negative'}`}>{isDown ? 'Queda' : 'Alta'}</span>
                <h4>{formatTriggerType(event.triggerType)}</h4>
                <p>{formatDateTime(event.eventAt)}</p>
              </div>

              <div className="price-event-metrics">
                <div>
                  <span>Preço anterior</span>
                  <strong>{formatMoney(event.oldPrice)}</strong>
                </div>
                <div>
                  <span>Novo preço</span>
                  <strong>{formatMoney(event.newPrice)}</strong>
                </div>
                <div>
                  <span>Variação</span>
                  <strong>{formatSignedPercent(event.deltaPercent)}</strong>
                </div>
                <div>
                  <span>Confiança</span>
                  <strong>{formatPercent(Number(event.confidenceScore || 0) * 100)}</strong>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const renderPromotionWindows = (rows: ProductPromotionWindow[]) => {
    if (rows.length === 0) {
      return <div className="panel-empty">Nenhuma janela promocional detectada no período.</div>;
    }

    return (
      <div className="price-event-list">
        {rows.slice(0, 6).map((window) => (
          <article key={window.id} className="price-event-item promotion-window-item">
            <div>
              <span className="status-pill neutral">{mapPromotionStatus(window.status)}</span>
              <h4>Janela iniciada em {formatDate(window.startAt)}</h4>
              <p>Fim: {formatDateTime(window.endAt)}</p>
            </div>

            <div className="price-event-metrics">
              <div>
                <span>Preço baseline</span>
                <strong>{formatMoney(window.baselinePrice)}</strong>
              </div>
              <div>
                <span>Preço promocional</span>
                <strong>{formatMoney(window.promoPrice)}</strong>
              </div>
              <div>
                <span>Desconto estimado</span>
                <strong>{formatSignedPercent(-Math.abs(Number(window.discountPercent || 0)))}</strong>
              </div>
              <div>
                <span>Lift de receita</span>
                <strong>{formatSignedPercent(window.revenueLiftPercent)}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <Layout>
        <div className="card">Carregando...</div>
      </Layout>
    );
  }

  if (error || !dashboard || !overview) {
    return (
      <Layout>
        <div className="page analytics-page">
          <div className="card" style={{ color: 'var(--danger)' }}>{error || 'Dashboard do produto indisponível'}</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page analytics-page product-dashboard-page">
        <section className="analytics-hero reveal product-hero">
          <div className="analytics-hero-copy">
            <span className="pill">Dashboard do produto</span>
            <h1 className="analytics-hero-title">{overview.name}</h1>
            <p className="analytics-hero-text">
              Um painel único para entender se este item vende por tração real, depende de preço,
              muda por dia da semana e em qual PDV vale negociar melhor a compra com o fornecedor.
            </p>
            <div className="hero-chip-row">
              <span className="hero-chip">Categoria {overview.category || 'Sem categoria'}</span>
              <span className="hero-chip">GTIN {overview.ean || '--'}</span>
              <span className="hero-chip">Última venda em {formatDate(overview.lastSoldAt)}</span>
            </div>
            <div className="hero-inline-actions product-detail-actions">
              <Link className="button secondary" to="/app/produtos">Voltar ao mapa de produtos</Link>
            </div>
          </div>

          <div className="analytics-hero-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">Receita do período</span>
              <h3>{formatMoney(overview.revenue)}</h3>
              <p>{Number(overview.quantitySold || 0).toFixed(2)} unidades vendidas em {overview.transactionCount || 0} transações.</p>
            </div>

            <div className="hero-focus-stack">
              <div className="hero-mini-card blue">
                <span>Giro</span>
                <strong>{Number(overview.salesVelocity || 0).toFixed(2)}/dia</strong>
                <small>
                  {overview.turnoverBand === 'HIGH'
                    ? 'Alta velocidade'
                    : overview.turnoverBand === 'MEDIUM'
                      ? 'Velocidade média'
                      : 'Baixa velocidade'}
                </small>
              </div>
              <div className="hero-mini-card coral">
                <span>Resposta a preço</span>
                <strong>{formatPercent((overview.promoRevenueShare || 0) * 100)}</strong>
                <small>Share de receita sob preço abaixo do baseline.</small>
              </div>
              <div className="hero-mini-card mint">
                <span>PDV mais forte</span>
                <strong>{bestBranch?.branchName || '--'}</strong>
                <small>{bestBranch ? formatMoney(bestBranch.revenue) : 'Sem distribuição por PDV neste período.'}</small>
              </div>
            </div>
          </div>
        </section>

        <div className="metrics-grid analytics-metrics-grid">
          <div className="metric-card metric-card-default reveal">
            <div className="metric-card-top"><span className="metric-card-title">Preço médio</span><span className="metric-card-icon">R$</span></div>
            <strong className="metric-card-value">{formatMoney(overview.averagePrice)}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">Baseline: {formatMoney(overview.baselinePrice)}</span></div>
          </div>
          <div className="metric-card metric-card-default reveal">
            <div className="metric-card-top"><span className="metric-card-title">Tendência</span><span className="metric-card-icon">TR</span></div>
            <strong className="metric-card-value">{formatPercent(overview.revenueTrendPercentage)}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">Comparado ao período anterior</span></div>
          </div>
          <div className="metric-card metric-card-warning reveal">
            <div className="metric-card-top"><span className="metric-card-title">Preço promocional</span><span className="metric-card-icon">PR</span></div>
            <strong className="metric-card-value">{formatMoney(overview.promoAveragePrice)}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">Normal: {formatMoney(overview.normalAveragePrice)}</span></div>
          </div>
          <div className="metric-card metric-card-danger reveal">
            <div className="metric-card-top"><span className="metric-card-title">Índice de preço</span><span className="metric-card-icon">PX</span></div>
            <strong className="metric-card-value">{Number(overview.priceIndex || 0).toFixed(2)}x</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">1,00 significa alinhado ao baseline</span></div>
          </div>
        </div>

        <div className="analytics-grid analytics-grid-main product-detail-grid">
          <SalesChart
            data={(dashboard.salesTrend || []).map((point) => ({ date: point.date, revenue: Number(point.revenue || 0) }))}
            kicker="Desempenho de vendas"
            title="Curva diária de faturamento"
            panelCopy="A linha mostra a cadência diária de receita do produto no período selecionado."
            calloutLabel="Último faturamento diário"
          />

          <div className="analytics-side-stack">
            <div className="analytics-panel reveal">
              <div className="analytics-panel-head compact">
                <div>
                  <span className="section-kicker">Leitura rápida</span>
                  <h3>Como comprar melhor este item</h3>
                </div>
              </div>
              <div className="decision-stack">
                <div className="decision-card blue">
                  <strong>Dia mais forte</strong>
                  <span>{weekdayPeak?.label || '--'}</span>
                  <small>{weekdayPeak ? `${formatMoney(weekdayPeak.revenue)} em receita` : 'Sem sazonalidade suficiente neste período.'}</small>
                </div>
                <div className="decision-card coral">
                  <strong>PDV mais forte</strong>
                  <span>{bestBranch?.branchName || '--'}</span>
                  <small>{bestBranch ? `${Number(bestBranch.quantitySold || 0).toFixed(2)} unidades` : 'Sem comparação por PDV.'}</small>
                </div>
                <div className="decision-card mint">
                  <strong>Compra casada</strong>
                  <span>{strongestPair ? `${strongestPair.antecedentName} + ${strongestPair.consequentName}` : '--'}</span>
                  <small>{strongestPair ? `Lift ${Number(strongestPair.lift || 0).toFixed(2)}` : 'Sem relação forte detectada.'}</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="analytics-grid analytics-grid-main product-detail-grid">
          <SalesChart
            className="price-timeline-chart"
            data={priceTimelinePoints.map((point) => ({ date: point.date, revenue: Number(point.weightedAveragePrice || 0) }))}
            kicker="Inteligência de preço"
            title="Linha do tempo de preços por período"
            panelCopy="A linha usa o preço registrado por período (último preço do dia), destacando aumentos e quedas de valor ao longo do tempo."
            calloutLabel="Último preço do período"
            formatter={formatMoney}
          />

          <div className="analytics-panel reveal">
            <div className="analytics-panel-head compact">
              <div>
                <span className="section-kicker">Resumo de variação</span>
                <h3>Inteligência de preço consolidada</h3>
              </div>
            </div>

            <div className="mini-metric-grid dual price-intelligence-summary">
              <div>
                <span>Limiar dinâmico</span>
                <strong>{formatPercent(priceTimeline?.dynamicThresholdPercent)}</strong>
              </div>
              <div>
                <span>Promoções detectadas</span>
                <strong>{priceTimeline?.detectedPromotionWindows || 0}</strong>
              </div>
              <div>
                <span>Primeira variação</span>
                <strong>{formatDateTime(priceTimeline?.firstVariationAt)}</strong>
              </div>
              <div>
                <span>Última variação</span>
                <strong>{formatDateTime(priceTimeline?.lastVariationAt)}</strong>
              </div>
              <div>
                <span>Maior alta</span>
                <strong>{formatSignedPercent(priceTimeline?.maxIncreasePercent)}</strong>
              </div>
              <div>
                <span>Maior queda</span>
                <strong>{formatSignedPercent(priceTimeline?.maxDecreasePercent)}</strong>
              </div>
              <div>
                <span>Preço inicial</span>
                <strong>{formatMoney(firstObservedPrice)}</strong>
              </div>
              <div>
                <span>Preço atual</span>
                <strong>{formatMoney(lastObservedPrice)}</strong>
              </div>
              <div>
                <span>Variação acumulada</span>
                <strong>{formatSignedPercent(timelineDeltaPercent)}</strong>
              </div>
              <div>
                <span>Pontos no histórico</span>
                <strong>{priceTimelinePoints.length}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="analytics-grid analytics-grid-main">
          <div className="analytics-panel reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Variações relevantes</span>
                <h3>Eventos de preço detectados automaticamente</h3>
              </div>
            </div>
            {renderPriceEvents(priceEvents)}
          </div>

          <div className="analytics-panel reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Promoções estimadas</span>
                <h3>Janelas de promoção e impactos</h3>
              </div>
            </div>
            {renderPromotionWindows(promotionWindows)}
          </div>
        </div>

        <div className="analytics-grid analytics-grid-main">
          <div className="analytics-panel reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Comparação por filial</span>
                <h3>Onde o produto performa melhor</h3>
              </div>
            </div>
            {renderBranches(dashboard.branchPerformance || [])}
          </div>

          <div className="analytics-panel reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Sazonalidade</span>
                <h3>Quando este item ganha tração</h3>
              </div>
            </div>
            {renderSeasonality(dashboard.weekdaySeasonality || [])}
          </div>
        </div>

        <section className="analytics-section reveal">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker">Produtos associados</span>
              <h2>Itens que reforçam a venda deste produto</h2>
            </div>
          </div>

          <div className="analytics-card-grid three-cols">
            {(dashboard.relatedPairs || []).length === 0 ? (
              <div className="analytics-panel"><div className="panel-empty">Nenhuma associação forte encontrada.</div></div>
            ) : (
              (dashboard.relatedPairs || []).map((pair: ProductPairInsight) => (
                <article key={`${pair.antecedentId}-${pair.consequentId}`} className="analytics-panel related-product-card">
                  <div className="analytics-panel-head compact">
                    <div>
                      <span className="section-kicker">Compra casada</span>
                      <h3>{pair.antecedentName} + {pair.consequentName}</h3>
                    </div>
                    <span className="status-pill positive">Lift {Number(pair.lift || 0).toFixed(2)}</span>
                  </div>
                  <div className="mini-metric-grid dual">
                    <div>
                      <span>Confiança</span>
                      <strong>{formatPercent((pair.confidence || 0) * 100)}</strong>
                    </div>
                    <div>
                      <span>Suporte</span>
                      <strong>{formatPercent((pair.support || 0) * 100)}</strong>
                    </div>
                    <div>
                      <span>Ocorrências</span>
                      <strong>{pair.pairCount || 0}</strong>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default ProductDetail;
