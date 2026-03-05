import React, { useEffect, useState } from 'react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import MetricsCard from '../components/dashboard/MetricsCard';
import api from '../services/api';

interface Overview {
  totalUsers: number;
  activeUsers: number;
  blockedUsers: number;
  totalMarkets: number;
  activeMarkets: number;
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
              Monitore usuarios ativos, bloqueios, planos e o crescimento do catalogo global em um unico painel.
            </p>
          </div>
        </section>

        {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}

        {loading ? (
          <div className="card">Carregando indicadores...</div>
        ) : (
          <div className="metrics-grid analytics-metrics-grid">
            <MetricsCard title="Usuarios" value={overview?.totalUsers ?? 0} icon="US" caption="total" />
            <MetricsCard title="Usuarios ativos" value={overview?.activeUsers ?? 0} icon="UA" caption="liberados" />
            <MetricsCard title="Usuarios bloqueados" value={overview?.blockedUsers ?? 0} icon="BL" caption="acesso suspenso" />
            <MetricsCard title="Mercados" value={overview?.totalMarkets ?? 0} icon="MK" caption="cadastrados" />
            <MetricsCard title="Mercados ativos" value={overview?.activeMarkets ?? 0} icon="MA" caption="operando" />
            <MetricsCard title="Produtos globais" value={overview?.totalCatalogProducts ?? 0} icon="PG" caption="tabela products" />
            <MetricsCard title="Enriquecimentos" value={overview?.totalCatalogEnrichments ?? 0} icon="EN" caption="fontes web/manual" />
          </div>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminDashboard;
