import React from 'react';
import Layout from '../components/layout/Layout';
import { useAlerts } from '../hooks/useAlerts';

const Alerts: React.FC = () => {
  const { alerts, loading } = useAlerts();

  return (
    <Layout>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Alertas</h3>
        {loading ? (
          <p>Carregando...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Título</th>
                <th>Mensagem</th>
                <th>Prioridade</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>{alert.type}</td>
                  <td>{alert.title}</td>
                  <td>{alert.message}</td>
                  <td>{alert.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
};

export default Alerts;
