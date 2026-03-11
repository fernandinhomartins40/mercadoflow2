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
  const activeWindows = useMemo(() => items.filter((item) => item.startDate && item.endDate).length, [items]);

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
        <section className="dashboard-command-grid reveal">
          <article className="dashboard-command-card">
            <div className="dashboard-command-copy">
              <span className="pill">Campanhas</span>
              <h1 className="dashboard-command-title">Trate campanha como experimento, nao como anotacao solta.</h1>
              <p className="dashboard-command-text">
                Cadastre a janela, acompanhe o impacto e mantenha historico claro para comparar o que trouxe resultado real antes, durante e depois da acao.
              </p>
              <div className="hero-chip-row">
                <span className="hero-chip">{items.length} campanhas cadastradas</span>
                <span className="hero-chip">{impacts.length} campanhas comparadas</span>
                <span className="hero-chip">Melhor lift {bestImpact ? formatPercent(bestImpact.revenueLiftPercent) : '0.0%'}</span>
              </div>
            </div>

            <div className="dashboard-command-showcase">
              <article className="dashboard-glow-card">
                <span className="section-kicker">Campanha mais forte</span>
                <strong>{bestImpact?.name || 'Sem campanha com impacto medido'}</strong>
                <p>
                  {bestImpact
                    ? `Durante a campanha a receita foi para ${formatMoney(bestImpact.duringRevenue)} contra ${formatMoney(bestImpact.beforeRevenue)} antes da acao.`
                    : 'Cadastre campanhas com datas fechadas para medir janelas equivalentes e sair do achismo.'}
                </p>
              </article>

              <div className="dashboard-command-mosaic">
                <article className="dashboard-mini-tile">
                  <span>Lift de receita</span>
                  <strong>{bestImpact ? formatPercent(bestImpact.revenueLiftPercent) : '0.0%'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Lift de transacoes</span>
                  <strong>{bestImpact ? formatPercent(bestImpact.transactionLiftPercent) : '0.0%'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Receita durante</span>
                  <strong>{bestImpact ? formatMoney(bestImpact.duringRevenue) : 'R$ 0.00'}</strong>
                </article>
              </div>
            </div>
          </article>

          <aside className="dashboard-priority-rail">
            <article className="dashboard-priority-card">
              <span className="section-kicker">Uso correto</span>
              <h3>Registre campanha antes dela terminar.</h3>
              <p>Se a janela entrar tarde, a comparacao fica distorcida e o historico perde valor para o time comercial.</p>
            </article>
            <article className="dashboard-priority-card">
              <span className="section-kicker">Leitura esperada</span>
              <h3>Compare impacto, nao so presenca.</h3>
              <p>O valor desta tela esta em mostrar se a acao mudou receita e transacoes, nao apenas se ela existiu.</p>
            </article>
          </aside>
        </section>

        <section className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <div className="metric-card metric-card-default reveal">
            <div className="metric-card-top"><span className="metric-card-title">Campanhas</span><span className="metric-card-icon">CP</span></div>
            <strong className="metric-card-value">{items.length}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">cadastros ativos no historico</span></div>
          </div>
          <div className="metric-card metric-card-warning reveal">
            <div className="metric-card-top"><span className="metric-card-title">Com comparacao</span><span className="metric-card-icon">CM</span></div>
            <strong className="metric-card-value">{impacts.length}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">janelas com leitura de impacto</span></div>
          </div>
          <div className="metric-card metric-card-danger reveal">
            <div className="metric-card-top"><span className="metric-card-title">Melhor lift</span><span className="metric-card-icon">LF</span></div>
            <strong className="metric-card-value">{bestImpact ? formatPercent(bestImpact.revenueLiftPercent) : '0.0%'}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">maior ganho medido de receita</span></div>
          </div>
          <div className="metric-card metric-card-default reveal">
            <div className="metric-card-top"><span className="metric-card-title">Janelas definidas</span><span className="metric-card-icon">JN</span></div>
            <strong className="metric-card-value">{activeWindows}</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">campanhas com inicio e fim informados</span></div>
          </div>
        </section>

        <div className="dashboard-page-grid">
          <section className="analytics-panel reveal dashboard-form-panel">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Nova campanha</span>
                <h3>Registrar uma nova janela de acao</h3>
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
          </section>

          <div className="dashboard-side-stack">
            <section className="analytics-panel reveal dashboard-note-card">
              <span className="section-kicker">Mapa de cadastro</span>
              <h3>Campanhas existentes</h3>
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
            </section>
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
