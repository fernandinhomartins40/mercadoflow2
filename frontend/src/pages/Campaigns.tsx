import React, { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
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
      <div className="page">
        <div className="page-header">
          <div>
            <span className="pill">Campanhas</span>
            <h1 className="page-title">Cadastre e valide impacto</h1>
            <p className="page-subtitle">
              Cada campanha passa a ser comparada com janelas equivalentes antes e depois para mostrar se houve resultado real.
            </p>
          </div>
          <Button variant="secondary" onClick={load} disabled={loading}>
            Atualizar
          </Button>
        </div>

        <div className="card soft">
          <strong>Nova campanha</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10 }}>
            <input className="input" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="input" placeholder="Inicio (ISO, opcional)" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input className="input" placeholder="Fim (ISO, opcional)" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <input
              className="input"
              placeholder="Descricao (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ gridColumn: '1 / -1' }}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <Button onClick={create}>Criar</Button>
          </div>
        </div>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Campanhas cadastradas</h3>
          {loading ? (
            <p>Carregando...</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Periodo</th>
                  <th>Descricao</th>
                  <th>Criada em</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--muted)' }}>
                      Nenhuma campanha cadastrada.
                    </td>
                  </tr>
                ) : (
                  items.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>{campaign.name}</td>
                      <td>{formatDateTime(campaign.startDate)} ate {formatDateTime(campaign.endDate)}</td>
                      <td>{campaign.description || '-'}</td>
                      <td>{formatDateTime(campaign.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Resultado das campanhas</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Status</th>
                <th>Antes</th>
                <th>Durante</th>
                <th>Depois</th>
                <th>Lift receita</th>
              </tr>
            </thead>
            <tbody>
              {impacts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--muted)' }}>
                    Nenhuma campanha com dados suficientes para comparacao.
                  </td>
                </tr>
              ) : (
                impacts.map((impact) => (
                  <tr key={impact.campaignId}>
                    <td>
                      <div>{impact.name}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{impact.durationDays} dias</div>
                    </td>
                    <td>{impact.status}</td>
                    <td>{formatMoney(impact.beforeRevenue)}</td>
                    <td>{formatMoney(impact.duringRevenue)}</td>
                    <td>{formatMoney(impact.afterRevenue)}</td>
                    <td>{Number(impact.revenueLiftPercent || 0).toFixed(1)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default Campaigns;
