import React from 'react';
import Card from '../common/Card';

const AlertsList: React.FC<{ alerts: any[] }> = ({ alerts }) => {
  return (
    <Card className="analytics-panel reveal stagger-2">
      <div className="analytics-panel-head">
        <div>
          <span className="section-kicker">Atencao operacional</span>
          <h3>Alertas recentes</h3>
        </div>
      </div>
      <div className="alert-stack">
        {alerts?.length ? (
          alerts.map((alert) => (
            <div key={alert.id} className="alert-card">
              <div className="alert-card-top">
                <strong>{alert.title}</strong>
                <span className={`status-pill ${String(alert.priority || '').toLowerCase()}`}>{alert.priority || 'INFO'}</span>
              </div>
              <p>{alert.message}</p>
            </div>
          ))
        ) : (
          <span className="panel-empty">Sem alertas no momento.</span>
        )}
      </div>
    </Card>
  );
};

export default AlertsList;
