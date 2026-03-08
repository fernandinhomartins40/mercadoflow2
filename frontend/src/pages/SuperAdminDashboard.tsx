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
      <div className="super-admin-page">
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Controle Central</span>
            <h1 className="analytics-hero-title">Visao geral da plataforma</h1>
            <p className="analytics-hero-text">
              Monitore a saude operacional do SaaS, com usuarios, contas ativas, cobranca manual, vencimentos e crescimento do catalogo global em um unico painel.
            </p>
          </div>
          <div className="analytics-hero-board single-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">Gestao SaaS</span>
              <h3>{overview?.seatUsedTotal ?? 0} usuarios ativos</h3>
              <strong>{overview?.seatLimitTotal ?? 0}</strong>
              <p>assentos contratados somados. <Link to="/super-admin/saas">Abrir gestao SaaS</Link></p>
            </div>
          </div>
        </section>

        {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}

        {loading ? (
          <div className="card">Carregando indicadores...</div>
        ) : (
          <>
            <div className="metrics-grid analytics-metrics-grid">
              <MetricsCard title="Contas SaaS" value={overview?.totalMarkets ?? 0} icon="MK" caption="tenants cadastrados" />
              <MetricsCard title="Contas ativas" value={overview?.activeMarkets ?? 0} icon="ON" caption="operando" />
              <MetricsCard title="Trial" value={overview?.trialMarkets ?? 0} icon="TR" caption="periodo de teste" />
              <MetricsCard title="Em atraso" value={overview?.pastDueMarkets ?? 0} icon="PD" caption="cobranca manual" />
              <MetricsCard title="Suspensas" value={overview?.suspendedMarkets ?? 0} icon="BL" caption="acesso bloqueado" />
              <MetricsCard title="Vencendo" value={overview?.expiringMarkets ?? 0} icon="EX" caption="proximos 7 dias" />
              <MetricsCard title="Usuarios ativos" value={overview?.activeUsers ?? 0} icon="US" caption="liberados" />
              <MetricsCard title="Sem conta" value={overview?.orphanUsers ?? 0} icon="OR" caption="usuarios sem mercado" />
            </div>

            <section className="analytics-panel reveal">
              <div className="analytics-panel-head">
                <div>
                  <span className="section-kicker">Resumo operacional</span>
                  <h3>Controles manuais do SaaS</h3>
                </div>
                <Link to="/super-admin/saas" className="button">Abrir pagina dedicada</Link>
              </div>
              <div className="metrics-grid analytics-metrics-grid">
                <MetricsCard title="Usuarios bloqueados" value={overview?.blockedUsers ?? 0} icon="UB" caption="acesso suspenso" />
                <MetricsCard title="Produtos globais" value={overview?.totalCatalogProducts ?? 0} icon="PG" caption="tabela products" />
                <MetricsCard title="Enriquecimentos" value={overview?.totalCatalogEnrichments ?? 0} icon="EN" caption="fontes web/manual" />
              </div>
            </section>
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminDashboard;
