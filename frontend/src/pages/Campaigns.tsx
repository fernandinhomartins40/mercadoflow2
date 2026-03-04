import React, { useEffect, useMemo, useState } from 'react';
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
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Campanhas</span>
            <h1 className="analytics-hero-title">Cadastre a acao, acompanhe a janela e veja se ela devolveu resultado.</h1>
            <p className="analytics-hero-text">
              A pagina agora destaca campanhas como experimentos de negocio: cadastro, status e impacto real antes, durante e depois da execucao.
            </p>
            <div className="hero-chip-row">
              <span className="hero-chip">{items.length} campanhas cadastradas</span>
              <span className="hero-chip">{impacts.length} campanhas comparadas</span>
              <span className="hero-chip">Melhor lift {bestImpact ? formatPercent(bestImpact.revenueLiftPercent) : '0.0%'}</span>
            </div>
          </div>
          <div className="analytics-hero-board single-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">Campanha mais forte</span>
              <h3>{bestImpact?.name || 'Sem campanha com impacto medido'}</h3>
              <strong>{bestImpact ? formatPercent(bestImpact.revenueLiftPercent) : '0.0%'}</strong>
              <p>{bestImpact ? `Durante a campanha a receita foi para ${formatMoney(bestImpact.duringRevenue)} contra ${formatMoney(bestImpact.beforeRevenue)} antes da acao.` : 'Cadastre campanhas com datas fechadas para comparar com janelas equivalentes.'}</p>
            </div>
          </div>
        </section>

        <div className="analytics-grid analytics-grid-main">
          <div className="analytics-panel form-panel reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Nova campanha</span>
                <h3>Registrar janela de acao</h3>
              </div>
              <Button variant="secondary" onClick={load} disabled={loading}>Atualizar</Button>
            </div>
            <div className="form-grid-analytics">
              <input className="input" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="input" placeholder="Inicio (ISO)" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <input className="input" placeholder="Fim (ISO)" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <input className="input full" placeholder="Descricao" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="panel-actions">
              <Button onClick={create}>Criar campanha</Button>
            </div>
          </div>

          <div className="analytics-panel reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Mapa de cadastro</span>
                <h3>Campanhas existentes</h3>
              </div>
            </div>
            {items.length === 0 ? (
              <div className="panel-empty">Nenhuma campanha cadastrada.</div>
            ) : (
              <div className="campaign-stack">
                {items.map((campaign) => (
                  <div key={campaign.id} className="campaign-stack-card">
                    <div>
                      <strong>{campaign.name}</strong>
                      <span>{campaign.description || 'Sem descricao'}</span>
                    </div>
                    <div className="campaign-stack-side">
                      <strong>{formatDateTime(campaign.startDate)} ate {formatDateTime(campaign.endDate)}</strong>
                      <span>Criada em {formatDateTime(campaign.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        <div className="analytics-card-grid three-cols">
          {loading ? (
            <div className="analytics-panel"><div className="panel-empty">Carregando...</div></div>
          ) : impacts.length === 0 ? (
            <div className="analytics-panel"><div className="panel-empty">Nenhuma campanha com dados suficientes para comparacao.</div></div>
          ) : (
            impacts.map((impact) => (
              <div key={impact.campaignId} className="analytics-panel campaign-card reveal">
                <div className="analytics-panel-head compact">
                  <div>
                    <span className="section-kicker">Janela de campanha</span>
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
                  <span>Lift transacoes</span>
                  <strong>{formatPercent(impact.transactionLiftPercent)}</strong>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Campaigns;
