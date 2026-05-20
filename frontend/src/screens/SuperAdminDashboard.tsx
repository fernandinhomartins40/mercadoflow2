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
      <div className="flex flex-col gap-6">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-slate-400">Carregando indicadores...</div>
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

            {/* KPIs */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricsCard title="Contas" value={overview?.totalMarkets ?? 0} icon="CT" caption={`${overview?.activeMarkets ?? 0} ativas`} />
              <MetricsCard title="Usuários ativos" value={overview?.activeUsers ?? 0} icon="US" caption={`${overview?.seatUsedTotal ?? 0} assentos usados`} />
              <MetricsCard title="Em atraso" value={overview?.pastDueMarkets ?? 0} icon="AT" variant="danger" />
              <MetricsCard title="Vencimento próximo" value={overview?.expiringMarkets ?? 0} icon="VX" variant="warning" caption="próximos 7 dias" />
            </div>

            {/* Resumo + Atalhos */}
            <div className="grid gap-5 xl:grid-cols-[1fr_280px] xl:items-start">
              {/* Resumo */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400">Contas e acesso</p>
                    <h3 className="text-sm font-semibold text-slate-900">Resumo</h3>
                  </div>
                  <ButtonLink to="/super-admin/saas" variant="secondary">Abrir contas</ButtonLink>
                </div>
                <div className="grid gap-2">
                  {[
                    { label: 'Assentos usados', value: `${overview?.seatUsedTotal ?? 0} / ${overview?.seatLimitTotal ?? 0}` },
                    { label: 'Usuários sem conta vinculada', value: overview?.orphanUsers ?? 0 },
                    { label: 'Contas em teste', value: overview?.trialMarkets ?? 0 },
                    { label: 'Catálogo global', value: overview?.totalCatalogProducts ?? 0 },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                      <span className="text-sm text-slate-500">{row.label}</span>
                      <strong className="text-sm font-semibold text-slate-900">{row.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Atalhos */}
              <div className="flex flex-col gap-3">
                <div className="border-b border-slate-100 pb-2">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400">Atalhos</p>
                </div>
                <div className="grid gap-2">
                  <Link to="/super-admin/catalogo" className="flex flex-col gap-0.5 rounded-lg px-4 py-3 no-underline transition hover:border-green-300 hover:bg-green-50" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                    <strong className="text-sm font-semibold text-slate-900">Catálogo global</strong>
                    <span className="text-xs text-slate-400">{overview?.totalCatalogProducts ?? 0} produtos consolidados</span>
                  </Link>
                  <Link to="/super-admin/crawler" className="flex flex-col gap-0.5 rounded-lg px-4 py-3 no-underline transition hover:border-green-300 hover:bg-green-50" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                    <strong className="text-sm font-semibold text-slate-900">Crawler</strong>
                    <span className="text-xs text-slate-400">Execuções e fontes web</span>
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminDashboard;
