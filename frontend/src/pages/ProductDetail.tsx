import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import SalesChart from '../components/dashboard/SalesChart';
import { useAuth } from '../context/AuthContext';
import { marketService } from '../services/market.service';
import { ProductBranchPerformance, ProductDashboard, ProductPairInsight, SeasonalityPoint } from '../types/analytics.types';

const formatMoney = (value?: number | null) => `R$ ${Number(value || 0).toFixed(2)}`;
const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(1)}%`;
const formatDate = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleDateString('pt-BR');
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
        setError('Produto nao encontrado');
        return;
      }
      setLoading(true);
      try {
        const data = await marketService.getProductDashboard(marketId, productId);
        setDashboard(data);
        setError(null);
      } catch (err: any) {
        setDashboard(null);
        setError(err?.message || 'Erro ao carregar dashboard do produto');
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

  const renderSeasonality = (rows: SeasonalityPoint[]) => {
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
      return <div className="panel-empty">Sem distribuicao por PDV neste periodo.</div>;
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
                <span>Preco medio</span>
                <strong>{formatMoney(branch.averagePrice)}</strong>
              </div>
              <div>
                <span>Transacoes</span>
                <strong>{branch.transactionCount || 0}</strong>
              </div>
            </div>
            <div className="progress-track">
              <div className="progress-fill solid-pink" style={{ width: `${(Number(branch.revenue || 0) / maxRevenue) * 100}%` }} />
            </div>
            <div className="product-card-foot">
              <span>Ultima venda {formatDate(branch.lastSoldAt)}</span>
            </div>
          </article>
        ))}
      </div>
    );
  };

  if (loading) {
    return <Layout><div className="card">Carregando...</div></Layout>;
  }

  if (error || !dashboard || !overview) {
    return (
      <Layout>
        <div className="page analytics-page">
          <div className="card" style={{ color: 'var(--danger)' }}>{error || 'Dashboard do produto indisponivel'}</div>
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
              Um painel unico para entender se este item vende por tracao real, depende de preco, muda por dia da semana e em qual PDV vale negociar mais compra ou rever exposicao.
            </p>
            <div className="hero-chip-row">
              <span className="hero-chip">Categoria {overview.category || 'Sem categoria'}</span>
              <span className="hero-chip">GTIN {overview.ean || '--'}</span>
              <span className="hero-chip">Ultima venda {formatDate(overview.lastSoldAt)}</span>
            </div>
            <div className="hero-inline-actions">
              <Link className="button secondary" to="/app/produtos">Voltar ao mapa de produtos</Link>
            </div>
          </div>
          <div className="analytics-hero-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">Receita do periodo</span>
              <h3>{formatMoney(overview.revenue)}</h3>
              <p>{Number(overview.quantitySold || 0).toFixed(2)} unidades vendidas em {overview.transactionCount || 0} transacoes.</p>
            </div>
            <div className="hero-focus-stack">
              <div className="hero-mini-card blue">
                <span>Giro</span>
                <strong>{Number(overview.salesVelocity || 0).toFixed(2)}/dia</strong>
                <small>{overview.turnoverBand === 'HIGH' ? 'Alta velocidade' : overview.turnoverBand === 'MEDIUM' ? 'Velocidade media' : 'Baixa velocidade'}</small>
              </div>
              <div className="hero-mini-card coral">
                <span>Resposta a preco</span>
                <strong>{formatPercent((overview.promoRevenueShare || 0) * 100)}</strong>
                <small>share de receita sob preco abaixo do baseline</small>
              </div>
              <div className="hero-mini-card mint">
                <span>PDV mais forte</span>
                <strong>{bestBranch?.branchName || '--'}</strong>
                <small>{bestBranch ? formatMoney(bestBranch.revenue) : 'Sem distribuicao por PDV'}</small>
              </div>
            </div>
          </div>
        </section>

        <div className="metrics-grid analytics-metrics-grid">
          <div className="metric-card metric-card-default reveal">
            <div className="metric-card-top"><span className="metric-card-title">Preco medio</span><span className="metric-card-icon">R$</span></div>
            <strong className="metric-card-value">{formatMoney(overview.averagePrice)}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">baseline {formatMoney(overview.baselinePrice)}</span></div>
          </div>
          <div className="metric-card metric-card-default reveal">
            <div className="metric-card-top"><span className="metric-card-title">Tendencia</span><span className="metric-card-icon">TR</span></div>
            <strong className="metric-card-value">{formatPercent(overview.revenueTrendPercentage)}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">comparado ao periodo anterior</span></div>
          </div>
          <div className="metric-card metric-card-warning reveal">
            <div className="metric-card-top"><span className="metric-card-title">Preco promocional</span><span className="metric-card-icon">PR</span></div>
            <strong className="metric-card-value">{formatMoney(overview.promoAveragePrice)}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">normal {formatMoney(overview.normalAveragePrice)}</span></div>
          </div>
          <div className="metric-card metric-card-danger reveal">
            <div className="metric-card-top"><span className="metric-card-title">Indice de preco</span><span className="metric-card-icon">PX</span></div>
            <strong className="metric-card-value">{Number(overview.priceIndex || 0).toFixed(2)}x</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">1.00 significa alinhado ao baseline</span></div>
          </div>
        </div>

        <div className="analytics-grid analytics-grid-main product-detail-grid">
          <SalesChart data={(dashboard.salesTrend || []).map((point) => ({ date: point.date, revenue: Number(point.revenue || 0) }))} />
          <div className="analytics-side-stack">
            <div className="analytics-panel reveal">
              <div className="analytics-panel-head compact">
                <div>
                  <span className="section-kicker">Leitura rapida</span>
                  <h3>Como comprar melhor este item</h3>
                </div>
              </div>
              <div className="decision-stack">
                <div className="decision-card blue">
                  <strong>Dia mais forte</strong>
                  <span>{weekdayPeak?.label || '--'}</span>
                  <small>{weekdayPeak ? `${formatMoney(weekdayPeak.revenue)} em receita` : 'Sem sazonalidade suficiente'}</small>
                </div>
                <div className="decision-card coral">
                  <strong>PDV mais forte</strong>
                  <span>{bestBranch?.branchName || '--'}</span>
                  <small>{bestBranch ? `${Number(bestBranch.quantitySold || 0).toFixed(2)} unidades` : 'Sem comparacao por PDV'}</small>
                </div>
                <div className="decision-card mint">
                  <strong>Compra casada</strong>
                  <span>{strongestPair ? `${strongestPair.antecedentName} + ${strongestPair.consequentName}` : '--'}</span>
                  <small>{strongestPair ? `Lift ${Number(strongestPair.lift || 0).toFixed(2)}` : 'Sem relacao forte detectada'}</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="analytics-grid analytics-grid-main">
          <div className="analytics-panel reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Comparacao por filial</span>
                <h3>Onde o produto performa melhor</h3>
              </div>
            </div>
            {renderBranches(dashboard.branchPerformance || [])}
          </div>
          <div className="analytics-panel reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Sazonalidade</span>
                <h3>Quando esse item ganha tracao</h3>
              </div>
            </div>
            {renderSeasonality(dashboard.weekdaySeasonality || [])}
          </div>
        </div>

        <section className="analytics-section reveal">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker">Produtos associados</span>
              <h2>Itens que reforcam a venda deste produto</h2>
            </div>
          </div>
          <div className="analytics-card-grid three-cols">
            {(dashboard.relatedPairs || []).length === 0 ? (
              <div className="analytics-panel"><div className="panel-empty">Nenhuma associacao forte encontrada.</div></div>
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
                      <span>Confianca</span>
                      <strong>{formatPercent((pair.confidence || 0) * 100)}</strong>
                    </div>
                    <div>
                      <span>Suporte</span>
                      <strong>{formatPercent((pair.support || 0) * 100)}</strong>
                    </div>
                    <div>
                      <span>Ocorrencias</span>
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
