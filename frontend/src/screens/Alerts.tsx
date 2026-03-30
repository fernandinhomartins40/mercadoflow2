import React, { useMemo } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHeader from '../components/layout/PageHeader';
import { useAlerts } from '../hooks/useAlerts';

const Alerts: React.FC = () => {
  const { alerts, loading, error, onlyUnread, setOnlyUnread, refresh, markRead, markAllRead } = useAlerts();

  const unreadCount = useMemo(() => alerts.filter((alert) => !alert.isRead).length, [alerts]);
  const highPriorityCount = useMemo(() => alerts.filter((alert) => alert.priority === 'HIGH').length, [alerts]);

  return (
    <Layout>
      <div className="page analytics-page">
        <PageHeader
          title="Alertas"
          subtitle="Gerencie notificações e priorize pendências."
          actions={
            <>
              <label className="toggle-inline">
                <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
                Somente não lidos
              </label>
              <Button variant="secondary" onClick={refresh} disabled={loading}>Atualizar</Button>
              <Button variant="secondary" onClick={markAllRead} disabled={loading || alerts.length === 0}>Marcar todos como lidos</Button>
            </>
          }
        />

        <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <MetricsCard title="Total" value={alerts.length} icon="AL" />
          <MetricsCard title="Não lidos" value={unreadCount} icon="NV" />
          <MetricsCard title="Alta prioridade" value={highPriorityCount} icon="HP" variant="danger" />
          <MetricsCard title="Filtro" value={onlyUnread ? 'Não lidos' : 'Todos'} icon="FL" />
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
                  <th>Título</th>
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
      </div>
    </Layout>
  );
};

export default Alerts;
