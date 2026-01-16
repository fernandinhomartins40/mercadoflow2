import React, { useState } from 'react';

const ServiceControl: React.FC = () => {
  const [message, setMessage] = useState('');

  const run = async (action: 'start' | 'stop' | 'restart') => {
    try {
      const result = await (window as any).pdv2cloud[`${action}Service`]();
      setMessage(String(result));
    } catch (err: any) {
      setMessage(err?.toString() || 'Erro ao controlar servico');
    }
  };

  return (
    <div className="card">
      <h3>Controle do servico</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => run('start')}>Start</button>
        <button onClick={() => run('stop')}>Stop</button>
        <button onClick={() => run('restart')}>Restart</button>
      </div>
      {message && <p style={{ color: 'var(--muted)' }}>{message}</p>}
    </div>
  );
};

export default ServiceControl;
