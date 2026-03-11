import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import MetricsCard from '../components/dashboard/MetricsCard';
import api from '../services/api';

interface Overview {
  totalUsers: number;
  activeUsers: number;
  blockedUsers: number;
  orphanUsers: number;
  totalMarkets: number;
  activeMarkets: number;
  trialMarkets: number;
  pastDueMarkets: number;
  suspendedMarkets: number;
  expiringMarkets: number;
  seatLimitTotal: number;
  seatUsedTotal: number;
  totalCatalogProducts: number;
  totalCatalogEnrichments: number;
}

const SuperAdminDashboard: React.FC = () => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await api.get('/v1/super-admin/overview');
        setOverview(response.data);
        setError(null);
      } catch (err: any) {
        setError(err?.message || 'Falha ao carregar visao geral');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <SuperAdminLayout>
      <div className="super-admin-page super-admin-home-page">
        {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}

        {loading ? (
          <div className="card">Carregando indicadores...</div>
        ) : (
          <>
            <section className="dashboard-command-grid reveal super-admin-command-grid">
              <article className="dashboard-command-card super-admin-command-card">
                <div className="dashboard-command-copy">
                  <span className="pill">Centro de comando</span>
                  <h1 className="dashboard-command-title">Contas, acessos e catalogo em uma leitura mais operacional.</h1>
                  <p className="dashboard-command-text">
                    Em vez de espalhar numeros em blocos soltos, o painel principal agora resume saude da base, risco de acesso e volume de dados em um unico fluxo visual.
                  </p>
                  <div className="hero-inline-actions">
                    <Link to="/super-admin/saas" className="button">Abrir gestao SaaS</Link>
                    <Link to="/super-admin/crawler" className="button secondary">Abrir crawler</Link>
                  </div>
                </div>

                <div className="dashboard-command-showcase">
                  <div className="dashboard-glow-card">
                    <span className="section-kicker">Contas em operacao</span>
                    <h3>{overview?.activeMarkets ?? 0} mercados ativos</h3>
                    <strong>{overview?.totalMarkets ?? 0}</strong>
                    <p>contas totais cadastradas. {overview?.expiringMarkets ?? 0} vencem nos proximos 7 dias.</p>
                  </div>

                  <div className="dashboard-command-mosaic">
                    <div className="dashboard-mini-tile">
                      <span>Usuarios ativos</span>
                      <strong>{overview?.activeUsers ?? 0}</strong>
                      <small>{overview?.seatUsedTotal ?? 0} assentos usados</small>
                    </div>
                    <div className="dashboard-mini-tile">
                      <span>Catalogo global</span>
                      <strong>{overview?.totalCatalogProducts ?? 0}</strong>
                      <small>{overview?.totalCatalogEnrichments ?? 0} enriquecimentos</small>
                    </div>
                  </div>
                </div>
              </article>

              <aside className="dashboard-priority-rail">
                <div className="dashboard-priority-card dark">
                  <span className="section-kicker">Risco imediato</span>
                  <strong>{overview?.expiringMarkets ?? 0} contas vencendo</strong>
                  <p>Priorize renovacao manual, revisao de acesso e comunicacao com mercados proximos do vencimento.</p>
                  <Link to="/super-admin/saas" className="button secondary">Tratar contas</Link>
                </div>

                <div className="dashboard-priority-card">
                  <span className="section-kicker">Usuarios bloqueados</span>
                  <strong>{overview?.blockedUsers ?? 0}</strong>
                  <p>{overview?.orphanUsers ?? 0} usuarios seguem sem conta vinculada e pedem ajuste de cadastro.</p>
                </div>

              </aside>
            </section>

            <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
              <MetricsCard title="Contas SaaS" value={overview?.totalMarkets ?? 0} icon="MK" caption="tenants cadastrados" />
              <MetricsCard title="Contas ativas" value={overview?.activeMarkets ?? 0} icon="ON" caption="operando" />
              <MetricsCard title="Em atraso" value={overview?.pastDueMarkets ?? 0} icon="PD" caption="cobranca manual" />
              <MetricsCard title="Usuarios ativos" value={overview?.activeUsers ?? 0} icon="US" caption="liberados" />
            </div>

            <section className="dashboard-page-grid reveal">
              <article className="analytics-panel dashboard-note-card">
                <div className="analytics-panel-head">
                  <div>
                    <span className="section-kicker">Saude SaaS</span>
                    <h3>Resumo para liberacao manual</h3>
                  </div>
                  <Link to="/super-admin/saas" className="button secondary">Abrir gestao SaaS</Link>
                </div>
                <div className="dashboard-stat-list">
                  <div className="dashboard-stat-row">
                    <span>Assentos usados</span>
                    <strong>{overview?.seatUsedTotal ?? 0} / {overview?.seatLimitTotal ?? 0}</strong>
                  </div>
                  <div className="dashboard-stat-row">
                    <span>Usuarios sem conta vinculada</span>
                    <strong>{overview?.orphanUsers ?? 0}</strong>
                  </div>
                  <div className="dashboard-stat-row">
                    <span>Contas em trial</span>
                    <strong>{overview?.trialMarkets ?? 0}</strong>
                  </div>
                </div>
              </article>

              <article className="analytics-panel dashboard-note-card">
                <div className="analytics-panel-head">
                  <div>
                    <span className="section-kicker">Dados e automacao</span>
                    <h3>Catalogo e operacao tecnica</h3>
                  </div>
                  <Link to="/super-admin/crawler" className="button secondary">Abrir crawler</Link>
                </div>
                <div className="dashboard-quick-list">
                  <Link to="/super-admin/catalogo" className="dashboard-quick-item">
                    <strong>Revisar catalogo global</strong>
                    <span>{overview?.totalCatalogProducts ?? 0} produtos consolidados.</span>
                  </Link>
                  <Link to="/super-admin/crawler" className="dashboard-quick-item">
                    <strong>Monitorar coletas e reparos</strong>
                    <span>Acompanhe runs e atualizacao das fontes web.</span>
                  </Link>
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminDashboard;
