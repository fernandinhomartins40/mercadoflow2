import React, { useMemo } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import MetricsCard from '../components/dashboard/MetricsCard';
import { useAlerts } from '../hooks/useAlerts';

const Alerts: React.FC = () => {
  const { alerts, loading, error, onlyUnread, setOnlyUnread, refresh, markRead, markAllRead } = useAlerts();

  const unreadCount = useMemo(() => alerts.filter((alert) => !alert.isRead).length, [alerts]);
  const highPriorityCount = useMemo(() => alerts.filter((alert) => alert.priority === 'HIGH').length, [alerts]);
  const latestAlert = alerts[0];

  return (
    <Layout>
      <div className="page analytics-page">
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Centro de alertas</span>
            <h1 className="analytics-hero-title">Veja rapidamente o que exige acao, o que pode esperar e o que ja foi tratado.</h1>
            <p className="analytics-hero-text">
              A pagina agora separa leitura, prioridade e operacao. Fica mais facil para qualquer usuario entender o que chegou, o que precisa ser lido agora e qual acao tomar.
            </p>
            <div className="hero-inline-actions">
              <Button variant="secondary" onClick={refresh} disabled={loading}>Atualizar</Button>
              <Button variant="secondary" onClick={markAllRead} disabled={loading || alerts.length === 0}>Marcar todos como lidos</Button>
            </div>
            <div className="hero-chip-row">
              <span className="hero-chip">{alerts.length} alertas no recorte</span>
              <span className="hero-chip">{unreadCount} nao lidos</span>
              <span className="hero-chip">{highPriorityCount} com prioridade alta</span>
            </div>
          </div>
          <div className="analytics-hero-board single-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">Ultimo alerta</span>
              <h3>{latestAlert?.title || 'Nenhum alerta registrado'}</h3>
              <strong>{latestAlert?.priority || '--'}</strong>
              <p>{latestAlert ? latestAlert.message : 'Assim que novos sinais entrarem no sistema, eles aparecem aqui com mais contexto.'}</p>
            </div>
          </div>
        </section>

        <div className="metrics-grid analytics-metrics-grid">
          <MetricsCard title="Total de alertas" value={alerts.length} icon="AL" caption="itens retornados agora" />
          <MetricsCard title="Nao lidos" value={unreadCount} icon="NV" caption="pendentes de revisao" />
          <MetricsCard title="Alta prioridade" value={highPriorityCount} icon="HP" variant="danger" caption="pedem resposta mais rapida" />
          <MetricsCard title="Filtro ativo" value={onlyUnread ? 'Nao lidos' : 'Todos'} icon="FL" caption="escopo atual da lista" />
        </div>

        <div className="dashboard-page-grid">
          <section className="analytics-panel reveal dashboard-table-panel">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Operacao</span>
                <h3>Fila de alertas</h3>
              </div>
              <div className="card-section-actions">
                <label className="toggle-inline">
                  <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
                  Somente nao lidos
                </label>
              </div>
            </div>

            {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
            {loading ? (
              <div className="panel-empty">Carregando alertas...</div>
            ) : (
              <div className="table-shell responsive-data-table-wrap">
                <table className="table responsive-data-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Tipo</th>
                      <th>Titulo</th>
                      <th>Mensagem</th>
                      <th>Prioridade</th>
                      <th>Criado em</th>
                      <th style={{ width: 160 }}>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ color: 'var(--muted)' }}>
                          Nenhum alerta encontrado.
                        </td>
                      </tr>
                    ) : (
                      alerts.map((alert) => (
                        <tr key={alert.id} style={{ opacity: alert.isRead ? 0.7 : 1 }}>
                          <td data-label="Status">{alert.isRead ? 'Lido' : 'Novo'}</td>
                          <td data-label="Tipo">{alert.type}</td>
                          <td data-label="Titulo">{alert.title}</td>
                          <td data-label="Mensagem">{alert.message}</td>
                          <td data-label="Prioridade">{alert.priority}</td>
                          <td data-label="Criado em">{alert.createdAt ? new Date(alert.createdAt).toLocaleString('pt-BR') : '-'}</td>
                          <td data-label="Acoes" className="table-action-cell">
                            {alert.isRead ? (
                              <span style={{ color: 'var(--muted)' }}>Sem acao</span>
                            ) : (
                              <Button variant="secondary" onClick={() => markRead(alert.id)}>
                                Marcar lido
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="dashboard-side-stack">
            <section className="analytics-panel reveal dashboard-note-card">
              <span className="section-kicker">Leitura rapida</span>
              <h3>Como priorizar</h3>
              <div className="dashboard-stat-list">
                <div className="dashboard-stat-row">
                  <span>Alta prioridade</span>
                  <strong>{highPriorityCount}</strong>
                </div>
                <div className="dashboard-stat-row">
                  <span>Aguardando leitura</span>
                  <strong>{unreadCount}</strong>
                </div>
                <div className="dashboard-stat-row">
                  <span>Ja tratados</span>
                  <strong>{Math.max(alerts.length - unreadCount, 0)}</strong>
                </div>
              </div>
            </section>

            <section className="analytics-panel reveal dashboard-note-card">
              <span className="section-kicker">Atalho de operacao</span>
              <h3>Rotina sugerida</h3>
              <div className="dashboard-quick-list">
                <div className="dashboard-quick-item">
                  <strong>1. Olhe primeiro a prioridade alta</strong>
                  <span>Comece pelo que pode virar perda, ruptura ou erro operacional.</span>
                </div>
                <div className="dashboard-quick-item">
                  <strong>2. Marque como lido ao tratar</strong>
                  <span>Isso limpa a fila e evita leitura repetida entre pessoas do time.</span>
                </div>
                <div className="dashboard-quick-item">
                  <strong>3. Recarregue antes de encerrar</strong>
                  <span>Garanta que nenhum sinal novo ficou de fora antes de sair da tela.</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Alerts;
