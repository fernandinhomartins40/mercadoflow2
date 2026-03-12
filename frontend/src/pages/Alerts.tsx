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
        <section className="dashboard-command-grid reveal">
          <article className="dashboard-command-card">
            <div className="dashboard-command-copy">
              <span className="pill">Centro de alertas</span>
              <h1 className="dashboard-command-title">Separe o que precisa de resposta agora do que pode esperar.</h1>
              <p className="dashboard-command-text">
                A fila fica mais legível para usuário leigo: leitura imediata, prioridade, ação rápida e histórico visível no mesmo fluxo operacional.
              </p>
              <div className="hero-inline-actions">
                <Button variant="secondary" onClick={refresh} disabled={loading}>Atualizar</Button>
                <Button variant="secondary" onClick={markAllRead} disabled={loading || alerts.length === 0}>Marcar todos como lidos</Button>
              </div>
              <div className="hero-chip-row">
                <span className="hero-chip">{alerts.length} alertas no recorte</span>
                <span className="hero-chip">{unreadCount} não lidos</span>
                <span className="hero-chip">{highPriorityCount} com prioridade alta</span>
              </div>
            </div>

            <div className="dashboard-command-showcase">
              <article className="dashboard-glow-card">
                <span className="section-kicker">Ultimo alerta</span>
                <strong>{latestAlert?.title || 'Nenhum alerta registrado'}</strong>
                <p>{latestAlert ? latestAlert.message : 'Assim que novos sinais entrarem no sistema, eles aparecem aqui com mais contexto.'}</p>
              </article>

              <div className="dashboard-command-mosaic">
                <article className="dashboard-mini-tile">
                  <span>Prioridade</span>
                  <strong>{latestAlert?.priority || '--'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Status</span>
                  <strong>{latestAlert ? (latestAlert.isRead ? 'Lido' : 'Novo') : '--'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Criado em</span>
                  <strong>{latestAlert?.createdAt ? new Date(latestAlert.createdAt).toLocaleDateString('pt-BR') : '--'}</strong>
                </article>
              </div>
            </div>
          </article>

          <aside className="dashboard-priority-rail">
            <article className="dashboard-priority-card">
              <span className="section-kicker">Fila recomendada</span>
              <h3>Prioridade alta primeiro.</h3>
              <p>Comece pelo que pode virar perda, ruptura ou erro operacional. O resto entra depois na rotina de leitura.</p>
            </article>
            <article className="dashboard-priority-card">
              <span className="section-kicker">Disciplina de uso</span>
              <h3>Marque como lido so quando tratar.</h3>
              <p>Isso limpa a fila sem esconder sinal pendente para o restante do time.</p>
            </article>
          </aside>
        </section>

        <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <MetricsCard title="Total de alertas" value={alerts.length} icon="AL" caption="itens retornados agora" />
          <MetricsCard title="Não lidos" value={unreadCount} icon="NV" caption="pendentes de revisão" />
          <MetricsCard title="Alta prioridade" value={highPriorityCount} icon="HP" variant="danger" caption="pedem resposta mais rápida" />
          <MetricsCard title="Filtro ativo" value={onlyUnread ? 'Não lidos' : 'Todos'} icon="FL" caption="escopo atual da lista" />
        </div>

        <div className="dashboard-page-grid">
          <section className="analytics-panel reveal dashboard-table-panel">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Operação</span>
                <h3>Fila de alertas</h3>
              </div>
              <div className="card-section-actions">
                <label className="toggle-inline">
                  <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
                  Somente não lidos
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
                      <th style={{ width: 160 }}>Ações</th>
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
                          <td data-label="Ações" className="table-action-cell">
                            {alert.isRead ? (
                              <span style={{ color: 'var(--muted)' }}>Sem ação</span>
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
              <span className="section-kicker">Leitura rápida</span>
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
              <span className="section-kicker">Atalho de operação</span>
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
              </div>
            </section>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Alerts;
