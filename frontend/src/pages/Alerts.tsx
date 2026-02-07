import React from 'react';
import Layout from '../components/layout/Layout';
import { useAlerts } from '../hooks/useAlerts';
import Button from '../components/common/Button';

const Alerts: React.FC = () => {
  const { alerts, loading, error, onlyUnread, setOnlyUnread, refresh, markRead, markAllRead } = useAlerts();

  return (
    <Layout>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Alertas</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted)' }}>
              <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
              Somente não lidos
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
          <table className="table">
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
                  <tr key={alert.id} style={{ opacity: alert.isRead ? 0.65 : 1 }}>
                    <td>{alert.isRead ? 'Lido' : 'Novo'}</td>
                    <td>{alert.type}</td>
                    <td>{alert.title}</td>
                    <td>{alert.message}</td>
                    <td>{alert.priority}</td>
                    <td>{alert.createdAt ? new Date(alert.createdAt).toLocaleString('pt-BR') : '-'}</td>
                    <td>
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
        )}
      </div>
    </Layout>
  );
};

export default Alerts;
