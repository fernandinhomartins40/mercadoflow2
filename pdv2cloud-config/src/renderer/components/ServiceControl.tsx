import React, { useState } from 'react';

interface ServiceControlProps {
  serviceInstalled: boolean;
  onServiceInstalled?: () => void;
}

const ServiceControl: React.FC<ServiceControlProps> = ({ serviceInstalled, onServiceInstalled }) => {
  const [message, setMessage] = useState('');
  const [installing, setInstalling] = useState(false);

  const run = async (action: 'start' | 'stop' | 'restart') => {
    try {
      const result = await (window as any).pdv2cloud[`${action}Service`]();
      setMessage(String(result));
    } catch (err: any) {
      setMessage(err?.toString() || 'Erro ao controlar servico');
    }
  };

  const installServiceHandler = async () => {
    setInstalling(true);
    setMessage('Instalando servico...');
    try {
      const result = await (window as any).pdv2cloud.installService();
      setMessage('✅ Servico instalado e iniciado com sucesso!\n' + String(result));
      if (onServiceInstalled) {
        setTimeout(() => onServiceInstalled(), 2000);
      }
    } catch (err: any) {
      setMessage('❌ Erro ao instalar servico:\n' + (err?.toString() || 'Erro desconhecido') + '\n\nTente executar manualmente como Administrador.');
    } finally {
      setInstalling(false);
    }
  };

  if (!serviceInstalled) {
    return (
      <div className="card">
        <h3>Instalacao do Servico</h3>
        <p>O servico PDV2CloudAgent precisa ser instalado antes de usar.</p>
        <button
          onClick={installServiceHandler}
          disabled={installing}
          style={{ backgroundColor: '#28a745', color: 'white' }}
        >
          {installing ? '⏳ Instalando...' : '🔧 Instalar Servico'}
        </button>
        {message && <pre style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>{message}</pre>}
      </div>
    );
  }

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
