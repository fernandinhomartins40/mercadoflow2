import React from 'react';
import Card from '../common/Card';

const AlertsList: React.FC<{ alerts: any[] }> = ({ alerts }) => {
  return (
    <Card>
      <h3 style={{ marginTop: 0 }}>Alertas recentes</h3>
      <div className="alerts-list">
        {alerts?.length ? (
          alerts.map((alert) => (
            <div key={alert.id}>
              <strong>{alert.title}</strong>
              <p style={{ margin: '4px 0', color: 'var(--muted)' }}>{alert.message}</p>
            </div>
          ))
        ) : (
          <span style={{ color: 'var(--muted)' }}>Sem alertas no momento</span>
        )}
      </div>
    </Card>
  );
};

export default AlertsList;
