import React, { useState, useEffect } from 'react';

interface ServiceControlProps {
  serviceInstalled: boolean;
  onServiceInstalled?: () => void;
}

const ServiceControl: React.FC<ServiceControlProps> = ({ serviceInstalled, onServiceInstalled }) => {
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  const [installing, setInstalling] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkServiceStatus();
    const interval = setInterval(checkServiceStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkServiceStatus = async () => {
    try {
      const status = await (window as any).pdv2cloud.serviceStatus();
      setIsRunning(String(status).includes('RUNNING'));
    } catch {
      setIsRunning(false);
    } finally {
      setChecking(false);
    }
  };

  const showMessage = (text: string, type: 'success' | 'error' | 'info') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(''), 8000);
  };

  const run = async (action: 'start' | 'stop' | 'restart') => {
    const actions = {
      start: { loading: 'Iniciando serviço...', success: 'Serviço iniciado com sucesso!', verb: 'iniciar' },
      stop: { loading: 'Parando serviço...', success: 'Serviço parado.', verb: 'parar' },
      restart: { loading: 'Reiniciando serviço...', success: 'Serviço reiniciado com sucesso!', verb: 'reiniciar' }
    };

    const actionInfo = actions[action];

    try {
      showMessage(actionInfo.loading, 'info');
      await (window as any).pdv2cloud[`${action}Service`]();
      showMessage(actionInfo.success, 'success');
      await checkServiceStatus();
    } catch (err: any) {
      const msg = err?.toString?.() || String(err || '');

      if (msg.includes('SERVICE_NOT_INSTALLED')) {
        showMessage('Serviço não está instalado. Use o Assistente de Configuração para instalar.', 'error');
      } else if (msg.includes('Access') || msg.includes('Acesso')) {
        showMessage('Sem permissão. Execute este aplicativo como Administrador.', 'error');
      } else {
        showMessage(`Não foi possível ${actionInfo.verb} o serviço. Verifique se você tem permissões de administrador.`, 'error');
      }
    }
  };

  const installServiceHandler = async () => {
    setInstalling(true);
    showMessage('Instalando e configurando o serviço...', 'info');

    try {
      await (window as any).pdv2cloud.installService();
      showMessage('Serviço instalado e iniciado com sucesso!', 'success');
      if (onServiceInstalled) {
        setTimeout(() => onServiceInstalled(), 2000);
      }
      await checkServiceStatus();
    } catch (err: any) {
      const msg = err?.toString?.() || String(err || '');

      if (msg.includes('SERVICE_INSTALLER_NOT_FOUND')) {
        showMessage('Arquivos não encontrados. Reinstale o PDV2Cloud usando o instalador oficial.', 'error');
      } else if (msg.includes('Access') || msg.includes('Acesso')) {
        showMessage('Sem permissão! Feche este aplicativo e execute-o como Administrador (botão direito > Executar como administrador).', 'error');
      } else {
        showMessage('Erro na instalação. Execute este aplicativo como Administrador e tente novamente.', 'error');
      }
    } finally {
      setInstalling(false);
    }
  };

  const getMessageStyle = () => {
    const styles = {
      success: { backgroundColor: '#d1fae5', color: '#065f46', border: '2px solid #10b981' },
      error: { backgroundColor: '#fee2e2', color: '#991b1b', border: '2px solid #ef4444' },
      info: { backgroundColor: '#dbeafe', color: '#1e40af', border: '2px solid #3b82f6' }
    };
    return styles[messageType];
  };

  if (!serviceInstalled) {
    return (
      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>
            Configure o Coletor
          </h3>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
            O serviço de coleta automática precisa ser instalado antes de usar o sistema.
          </p>
        </div>

        <button
          onClick={installServiceHandler}
          disabled={installing}
          style={{
            width: '100%',
            padding: '16px 24px',
            backgroundColor: installing ? '#9ca3af' : '#10b981',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 600,
            cursor: installing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => !installing && (e.currentTarget.style.backgroundColor = '#059669')}
          onMouseLeave={(e) => !installing && (e.currentTarget.style.backgroundColor = '#10b981')}
        >
          <span style={{ fontSize: '20px' }}>{installing ? '⏳' : '🔧'}</span>
          {installing ? 'Instalando serviço...' : 'Instalar Serviço de Coleta'}
        </button>

        {message && (
          <div style={{
            ...getMessageStyle(),
            padding: '12px 16px',
            borderRadius: '8px',
            marginTop: '16px',
            fontSize: '14px',
            fontWeight: 500
          }}>
            {message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: 0 }}>
            Controle do Serviço
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isRunning ? '#10b981' : '#ef4444'
            }}></div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: isRunning ? '#065f46' : '#991b1b' }}>
              {checking ? 'Verificando...' : isRunning ? 'Em Execução' : 'Parado'}
            </span>
          </div>
        </div>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
          Gerencie o funcionamento do coletor de notas fiscais
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <button
          onClick={() => run('start')}
          disabled={isRunning}
          style={{
            padding: '14px',
            backgroundColor: isRunning ? '#e5e7eb' : '#10b981',
            color: isRunning ? '#9ca3af' : '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => !isRunning && (e.currentTarget.style.backgroundColor = '#059669')}
          onMouseLeave={(e) => !isRunning && (e.currentTarget.style.backgroundColor = '#10b981')}
        >
          ▶ Iniciar
        </button>

        <button
          onClick={() => run('stop')}
          disabled={!isRunning}
          style={{
            padding: '14px',
            backgroundColor: !isRunning ? '#e5e7eb' : '#ef4444',
            color: !isRunning ? '#9ca3af' : '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: !isRunning ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => isRunning && (e.currentTarget.style.backgroundColor = '#dc2626')}
          onMouseLeave={(e) => isRunning && (e.currentTarget.style.backgroundColor = '#ef4444')}
        >
          ⏹ Parar
        </button>

        <button
          onClick={() => run('restart')}
          disabled={!isRunning}
          style={{
            padding: '14px',
            backgroundColor: !isRunning ? '#e5e7eb' : '#f59e0b',
            color: !isRunning ? '#9ca3af' : '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: !isRunning ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => isRunning && (e.currentTarget.style.backgroundColor = '#d97706')}
          onMouseLeave={(e) => isRunning && (e.currentTarget.style.backgroundColor = '#f59e0b')}
        >
          ⟳ Reiniciar
        </button>
      </div>

      {message && (
        <div style={{
          ...getMessageStyle(),
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 500
        }}>
          {message}
        </div>
      )}
    </div>
  );
};

export default ServiceControl;
