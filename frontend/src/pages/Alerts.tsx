import React from 'react';
import Layout from '../components/layout/Layout';
import { useAlerts } from '../hooks/useAlerts';
import Button from '../components/common/Button';

const Alerts: React.FC = () => {
  const { alerts, loading, error, onlyUnread, setOnlyUnread, refresh, markRead, markAllRead } = useAlerts();

  return (
    <Layout>
      <div className="page analytics-page">
        <div className="card">
          <div className="card-section-head">
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Alertas</h3>
            <div className="card-section-actions">
              <label className="toggle-inline">
                <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
                Somente nao lidos
              </label>
              <Button variant="secondary" onClick={refresh} disabled={loading}>
                Atualizar
              </Button>
              <Button variant="secondary" onClick={markAllRead} disabled={loading || alerts.length === 0}>
                Marcar todos como lidos
              </Button>
            </div>
          </div>

          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          {loading ? (
            <p>Carregando...</p>
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
                      <tr key={alert.id} style={{ opacity: alert.isRead ? 0.65 : 1 }}>
                        <td data-label="Status">{alert.isRead ? 'Lido' : 'Novo'}</td>
                        <td data-label="Tipo">{alert.type}</td>
                        <td data-label="Titulo">{alert.title}</td>
                        <td data-label="Mensagem">{alert.message}</td>
                        <td data-label="Prioridade">{alert.priority}</td>
                        <td data-label="Criado em">{alert.createdAt ? new Date(alert.createdAt).toLocaleString('pt-BR') : '-'}</td>
                        <td data-label="Acoes" className="table-action-cell">
                          {alert.isRead ? (
                            <span style={{ color: 'var(--muted)' }}>-</span>
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
      </div>
    </Layout>
  );
};

export default Alerts;
