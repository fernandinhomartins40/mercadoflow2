import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHero from '../components/dashboard/PageHero';
import PanelSection from '../components/dashboard/PanelSection';
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
      <div className="super-admin-page super-admin-home-page">
        {error ? <div className="sales-empty-card">{error}</div> : null}

        {loading ? (
          <div className="sales-empty-card">Carregando indicadores...</div>
        ) : (
          <>
            <PageHero
              className="super-admin-command-grid"
              articleClassName="super-admin-command-card"
              badge="Controle da operação"
              title="Contas, acesso e catálogo em uma leitura rápida."
              description="Aqui ficam os números que exigem decisão: contas ativas, vencimentos próximos, bloqueios e volume do catálogo."
              actions={
                <>
                  <ButtonLink to="/super-admin/saas">Abrir contas</ButtonLink>
                  <ButtonLink to="/super-admin/crawler" variant="secondary">
                    Abrir crawler
                  </ButtonLink>
                </>
              }
              feature={
                <>
                  <div className="dashboard-glow-card">
                    <span className="section-kicker">Contas em operação</span>
                    <h3>{overview?.activeMarkets ?? 0} mercados ativos</h3>
                    <strong>{overview?.totalMarkets ?? 0}</strong>
                    <p>{overview?.expiringMarkets ?? 0} contas vencem nos próximos 7 dias.</p>
                  </div>

                  <div className="dashboard-command-mosaic">
                    <div className="dashboard-mini-tile">
                      <span>Usuários ativos</span>
                      <strong>{overview?.activeUsers ?? 0}</strong>
                      <small>{overview?.seatUsedTotal ?? 0} assentos usados</small>
                    </div>
                    <div className="dashboard-mini-tile">
                      <span>Catálogo global</span>
                      <strong>{overview?.totalCatalogProducts ?? 0}</strong>
                      <small>{overview?.totalCatalogEnrichments ?? 0} registros complementares</small>
                    </div>
                  </div>
                </>
              }
              aside={
                <>
                  <div className="dashboard-priority-card dark">
                    <span className="section-kicker">Ação imediata</span>
                    <strong>{overview?.expiringMarkets ?? 0} contas vencendo</strong>
                    <p>Priorize renovação manual e revisão de acesso nas contas mais próximas do vencimento.</p>
                    <ButtonLink to="/super-admin/saas" variant="secondary">
                      Revisar contas
                    </ButtonLink>
                  </div>

                  <div className="dashboard-priority-card">
                    <span className="section-kicker">Usuários bloqueados</span>
                    <strong>{overview?.blockedUsers ?? 0}</strong>
                    <p>{overview?.orphanUsers ?? 0} usuários seguem sem conta vinculada e precisam de ajuste.</p>
                  </div>
                </>
              }
            />

            <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
              <MetricsCard title="Contas" value={overview?.totalMarkets ?? 0} icon="CT" />
              <MetricsCard title="Ativas" value={overview?.activeMarkets ?? 0} icon="ON" />
              <MetricsCard title="Em atraso" value={overview?.pastDueMarkets ?? 0} icon="AT" />
              <MetricsCard title="Usuários ativos" value={overview?.activeUsers ?? 0} icon="US" />
            </div>

            <section className="dashboard-page-grid reveal">
              <PanelSection
                className="dashboard-note-card"
                kicker="Contas e acesso"
                title="Resumo para ajuste manual"
                action={
                  <ButtonLink to="/super-admin/saas" variant="secondary">
                    Abrir contas
                  </ButtonLink>
                }
              >
                <div className="dashboard-stat-list">
                  <div className="dashboard-stat-row">
                    <span>Assentos usados</span>
                    <strong>
                      {overview?.seatUsedTotal ?? 0} / {overview?.seatLimitTotal ?? 0}
                    </strong>
                  </div>
                  <div className="dashboard-stat-row">
                    <span>Usuários sem conta vinculada</span>
                    <strong>{overview?.orphanUsers ?? 0}</strong>
                  </div>
                  <div className="dashboard-stat-row">
                    <span>Contas em teste</span>
                    <strong>{overview?.trialMarkets ?? 0}</strong>
                  </div>
                </div>
              </PanelSection>

              <PanelSection
                className="dashboard-note-card"
                kicker="Dados e automação"
                title="Catálogo e coleta"
                action={
                  <ButtonLink to="/super-admin/crawler" variant="secondary">
                    Abrir crawler
                  </ButtonLink>
                }
              >
                <div className="dashboard-quick-list">
                  <Link to="/super-admin/catalogo" className="dashboard-quick-item">
                    <strong>Revisar catálogo global</strong>
                    <span>{overview?.totalCatalogProducts ?? 0} produtos consolidados.</span>
                  </Link>
                  <Link to="/super-admin/crawler" className="dashboard-quick-item">
                    <strong>Monitorar coletas e reparos</strong>
                    <span>Acompanhe execuções e atualização das fontes web.</span>
                  </Link>
                </div>
              </PanelSection>
            </section>
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminDashboard;
