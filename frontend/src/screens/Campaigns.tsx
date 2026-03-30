import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHeader from '../components/layout/PageHeader';
import PanelSection from '../components/dashboard/PanelSection';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import { CampaignImpact } from '../types/analytics.types';

interface CampaignItem {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
}

const formatMoney = (value?: number | null) => `R$ ${Number(value || 0).toFixed(2)}`;
const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('pt-BR') : '-');
const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(1)}%`;

const Campaigns: React.FC = () => {
  const { marketId } = useAuth();
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [impacts, setImpacts] = useState<CampaignImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const bestImpact = useMemo(() => [...impacts].sort((a, b) => Number(b.revenueLiftPercent || 0) - Number(a.revenueLiftPercent || 0))[0], [impacts]);

  const load = async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const [campaigns, impactRows] = await Promise.all([
        marketService.getCampaigns(marketId),
        marketService.getCampaignImpact(marketId),
      ]);
      setItems(campaigns || []);
      setImpacts(impactRows || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar campanhas');
      setItems([]);
      setImpacts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [marketId]);

  const create = async () => {
    if (!marketId) return;
    if (!name.trim()) {
      setError('Informe o nome da campanha');
      return;
    }
    await marketService.createCampaign(marketId, {
      name: name.trim(),
      description: description.trim() || undefined,
      startDate: startDate.trim() || undefined,
      endDate: endDate.trim() || undefined,
    });
    setName('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    await load();
  };

  return (
    <Layout>
      <div className="page analytics-page">
        <PageHeader
          title="Campanhas"
          subtitle="Cadastre janelas e meça o impacto real em receita."
          actions={<Button variant="secondary" onClick={load} disabled={loading}>Atualizar</Button>}
        />

        <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <MetricsCard title="Campanhas" value={items.length} icon="CP" />
          <MetricsCard title="Com comparação" value={impacts.length} icon="CM" variant="warning" />
          <MetricsCard title="Melhor lift" value={bestImpact ? formatPercent(bestImpact.revenueLiftPercent) : '0.0%'} icon="LF" variant="danger" />
        </div>

        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        <div className="layout-split">
          <div className="layout-main">
            {/* Campanhas existentes */}
            {items.length === 0 ? (
              <div className="panel-empty">Nenhuma campanha cadastrada.</div>
            ) : (
              <div className="campaign-stack">
                {items.map((campaign) => (
                  <div key={campaign.id} className="campaign-stack-card">
                    <div>
                      <strong>{campaign.name}</strong>
                      <span>{campaign.description || 'Sem descrição'}</span>
                    </div>
                    <div className="campaign-stack-side">
                      <strong>{formatDateTime(campaign.startDate)} até {formatDateTime(campaign.endDate)}</strong>
                      <span>Criada em {formatDateTime(campaign.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Impacto das campanhas */}
            {loading ? (
              <div className="panel-empty">Carregando...</div>
            ) : impacts.length > 0 ? (
              <div className="analytics-card-grid three-cols">
                {impacts.map((impact) => (
                  <div key={impact.campaignId} className="analytics-panel campaign-card reveal">
                    <div className="analytics-panel-head compact">
                      <div>
                        <span className="section-kicker">Campanha</span>
                        <h3>{impact.name}</h3>
                      </div>
                      <span className={`status-pill ${String(impact.status || '').toLowerCase()}`}>{impact.status}</span>
                    </div>
                    <div className="mini-metric-grid">
                      <div><span>Antes</span><strong>{formatMoney(impact.beforeRevenue)}</strong></div>
                      <div><span>Durante</span><strong>{formatMoney(impact.duringRevenue)}</strong></div>
                      <div><span>Depois</span><strong>{formatMoney(impact.afterRevenue)}</strong></div>
                    </div>
                    <div className="campaign-lift-row">
                      <span>Lift receita</span>
                      <strong>{formatPercent(impact.revenueLiftPercent)}</strong>
                    </div>
                    <div className="campaign-lift-row subtle">
                      <span>Lift transações</span>
                      <strong>{formatPercent(impact.transactionLiftPercent)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="layout-aside">
            <section className="analytics-panel reveal">
              <div className="analytics-panel-head compact">
                <div>
                  <span className="section-kicker">Nova campanha</span>
                  <h3>Cadastrar</h3>
                </div>
              </div>
              <div className="dashboard-form-stack">
                <input className="input" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
                <input className="input" placeholder="Início (ISO)" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <input className="input" placeholder="Fim (ISO)" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                <input className="input" placeholder="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} />
                <Button onClick={create}>Criar campanha</Button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </Layout>
  );
};

export default Campaigns;
