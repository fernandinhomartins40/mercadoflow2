import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHeader from '../components/layout/PageHeader';
import ButtonLink from '../components/common/ButtonLink';
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
        setError(err?.message || 'Falha ao carregar a visão geral.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <SuperAdminLayout>
      <div className="page super-admin-page super-admin-home-page">
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

        {loading ? (
          <div className="panel-empty">Carregando indicadores...</div>
        ) : (
          <>
            <PageHeader
              title="Visão geral"
              subtitle="Contas, acesso e catálogo em uma leitura rápida."
              actions={
                <>
                  <ButtonLink to="/super-admin/saas">Abrir contas</ButtonLink>
                  <ButtonLink to="/super-admin/crawler" variant="secondary">Abrir crawler</ButtonLink>
                </>
              }
            />

            <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
              <MetricsCard title="Contas" value={overview?.totalMarkets ?? 0} icon="CT" caption={`${overview?.activeMarkets ?? 0} ativas`} />
              <MetricsCard title="Usuários ativos" value={overview?.activeUsers ?? 0} icon="US" caption={`${overview?.seatUsedTotal ?? 0} assentos usados`} />
              <MetricsCard title="Em atraso" value={overview?.pastDueMarkets ?? 0} icon="AT" variant="danger" />
              <MetricsCard title="Vencimento próximo" value={overview?.expiringMarkets ?? 0} icon="VX" variant="warning" caption="próximos 7 dias" />
            </div>

            <div className="layout-split">
              <div className="layout-main">
                {/* Resumo de contas */}
                <section className="analytics-panel reveal">
                  <div className="analytics-panel-head compact">
                    <div>
                      <span className="section-kicker">Contas e acesso</span>
                      <h3>Resumo</h3>
                    </div>
                    <ButtonLink to="/super-admin/saas" variant="secondary">Abrir contas</ButtonLink>
                  </div>
                  <div className="dashboard-stat-list">
                    <div className="dashboard-stat-row">
                      <span>Assentos usados</span>
                      <strong>{overview?.seatUsedTotal ?? 0} / {overview?.seatLimitTotal ?? 0}</strong>
                    </div>
                    <div className="dashboard-stat-row">
                      <span>Usuários sem conta vinculada</span>
                      <strong>{overview?.orphanUsers ?? 0}</strong>
                    </div>
                    <div className="dashboard-stat-row">
                      <span>Contas em teste</span>
                      <strong>{overview?.trialMarkets ?? 0}</strong>
                    </div>
                    <div className="dashboard-stat-row">
                      <span>Catálogo global</span>
                      <strong>{overview?.totalCatalogProducts ?? 0}</strong>
                    </div>
                  </div>
                </section>
              </div>

              <aside className="layout-aside">
                <section className="analytics-panel reveal">
                  <div className="analytics-panel-head compact">
                    <span className="section-kicker">Atalhos</span>
                  </div>
                  <div className="dashboard-quick-list">
                    <Link to="/super-admin/catalogo" className="dashboard-quick-item">
                      <strong>Catálogo global</strong>
                      <span>{overview?.totalCatalogProducts ?? 0} produtos consolidados</span>
                    </Link>
                    <Link to="/super-admin/crawler" className="dashboard-quick-item">
                      <strong>Crawler</strong>
                      <span>Execuções e fontes web</span>
                    </Link>
                  </div>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminDashboard;
