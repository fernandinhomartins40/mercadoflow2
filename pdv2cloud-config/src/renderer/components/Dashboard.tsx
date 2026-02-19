import React, { useEffect, useState } from 'react';

interface DashboardProps {
  serviceInstalled: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ serviceInstalled }) => {
  const [status, setStatus] = useState<string>('carregando');
  const [configOk, setConfigOk] = useState(false);
  const [queue, setQueue] = useState<any>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [lastError, setLastError] = useState<any>(null);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [installing, setInstalling] = useState<boolean>(false);

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    try {
      const versionInfo = await (window as any).electron.invoke('update:check');
      const currentVersion = '1.0.0';
      if (versionInfo.version !== currentVersion) {
        setUpdateAvailable(true);
        setLatestVersion(versionInfo.version);
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
    }
  };

  const installUpdate = async () => {
    if (!confirm('Instalar atualização? O sistema será reiniciado.')) {
      return;
    }

    setInstalling(true);
    try {
      await (window as any).electron.invoke('update:install');
      alert('Atualização iniciada! O sistema será reiniciado em breve.');
    } catch (err) {
      alert('Erro ao instalar atualização: ' + err);
    } finally {
      setInstalling(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const service = await (window as any).electron.invoke('service:status');
        setStatus(String(service));
      } catch (err) {
        const errorMsg = String(err);
        if (errorMsg.includes('SERVICE_NOT_INSTALLED')) {
          setStatus('not_installed');
        } else {
          setStatus('stopped');
        }
      }

      try {
        await (window as any).electron.invoke('config:load');
        setConfigOk(true);
      } catch (err) {
        setConfigOk(false);
      }

      try {
        const statusFile = await (window as any).electron.invoke('status:load');
        if (statusFile) {
          setQueue(statusFile.queue);
          setOnline(statusFile.online);
          setStatusMessage(statusFile.status_message || '');
          setLastUpdate(statusFile.timestamp);
          setLastError(statusFile.last_error);
        }
      } catch {
        setQueue(null);
      }
    };

    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const getStatusInfo = () => {
    if (status === 'not_installed') {
      return {
        color: '#ef4444',
        bgColor: '#fee2e2',
        icon: '⚙️',
        title: 'Serviço não instalado',
        subtitle: 'Clique em "Assistente de Configuração" para começar',
        action: null
      };
    }
    if (status.includes('RUNNING') && online) {
      return {
        color: '#10b981',
        bgColor: '#d1fae5',
        icon: '✓',
        title: 'Tudo funcionando!',
        subtitle: statusMessage || 'Coletando notas fiscais automaticamente',
        action: null
      };
    }
    if (status.includes('RUNNING') && !online) {
      return {
        color: '#f59e0b',
        bgColor: '#fef3c7',
        icon: '⚠',
        title: 'Sem conexão com servidor',
        subtitle: 'Verifique sua internet. Os dados serão enviados quando reconectar.',
        action: null
      };
    }
    if (status === 'carregando') {
      return {
        color: '#6b7280',
        bgColor: '#f3f4f6',
        icon: '⟳',
        title: 'Carregando...',
        subtitle: 'Verificando status do sistema',
        action: null
      };
    }
    return {
      color: '#ef4444',
      bgColor: '#fee2e2',
      icon: '✕',
      title: 'Serviço parado',
      subtitle: 'Clique em "Start" abaixo para iniciar a coleta',
      action: null
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>

      {/* Update Banner */}
      {updateAvailable && (
        <div style={{ backgroundColor: '#dbeafe', borderLeft: '4px solid #3b82f6', padding: '16px', marginBottom: '16px', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>🎉</span>
              <div>
                <div style={{ fontWeight: 600, color: '#1e40af', marginBottom: '4px' }}>
                  Nova atualização disponível!
                </div>
                <div style={{ fontSize: '14px', color: '#3b82f6' }}>
                  Versão {latestVersion} está pronta
                </div>
              </div>
            </div>
            <button
              onClick={installUpdate}
              disabled={installing}
              style={{
                padding: '10px 20px',
                backgroundColor: installing ? '#9ca3af' : '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: installing ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => !installing && (e.currentTarget.style.backgroundColor = '#2563eb')}
              onMouseLeave={(e) => !installing && (e.currentTarget.style.backgroundColor = '#3b82f6')}
            >
              {installing ? 'Instalando...' : 'Atualizar agora'}
            </button>
          </div>
        </div>
      )}

      {/* Main Status Card */}
      <div style={{
        backgroundColor: statusInfo.bgColor,
        border: `2px solid ${statusInfo.color}`,
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            backgroundColor: statusInfo.color,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            color: '#ffffff'
          }}>
            {statusInfo.icon}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: 0 }}>
              {statusInfo.title}
            </h2>
            <p style={{ fontSize: '14px', color: '#4b5563', margin: '4px 0 0 0' }}>
              {statusInfo.subtitle}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
              Última verificação
            </div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>
              {lastUpdate ? new Date(lastUpdate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {lastError && (
        <div style={{ backgroundColor: '#fee2e2', border: '2px solid #ef4444', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: '4px' }}>
                {lastError.title || 'Ocorreu um erro'}
              </div>
              <div style={{ fontSize: '14px', color: '#dc2626', marginBottom: '8px' }}>
                {lastError.message}
              </div>
              {lastError.technical && (
                <details style={{ marginTop: '8px' }}>
                  <summary style={{
                    fontSize: '12px',
                    color: '#dc2626',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}>
                    Ver detalhes técnicos
                  </summary>
                  <pre style={{
                    fontSize: '11px',
                    color: '#991b1b',
                    backgroundColor: '#fecaca',
                    padding: '8px',
                    borderRadius: '4px',
                    marginTop: '8px',
                    overflow: 'auto',
                    maxHeight: '200px'
                  }}>
                    {lastError.technical}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      {queue && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}>
          <div style={{ backgroundColor: '#eff6ff', borderRadius: '8px', padding: '16px', border: '1px solid #dbeafe' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e40af', marginBottom: '8px' }}>
              NOTAS PROCESSADAS
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#1e3a8a' }}>
              {queue.total || 0}
            </div>
            <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '4px' }}>
              total encontrado
            </div>
          </div>

          <div style={{ backgroundColor: '#d1fae5', borderRadius: '8px', padding: '16px', border: '1px solid #a7f3d0' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#065f46', marginBottom: '8px' }}>
              ENVIADAS COM SUCESSO
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#064e3b' }}>
              {queue.sent || 0}
            </div>
            <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px' }}>
              sincronizadas
            </div>
          </div>

          <div style={{ backgroundColor: '#fef3c7', borderRadius: '8px', padding: '16px', border: '1px solid #fde68a' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', marginBottom: '8px' }}>
              AGUARDANDO ENVIO
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#78350f' }}>
              {queue.pending || 0}
            </div>
            <div style={{ fontSize: '11px', color: '#d97706', marginTop: '4px' }}>
              na fila
            </div>
          </div>

          <div style={{ backgroundColor: '#fee2e2', borderRadius: '8px', padding: '16px', border: '1px solid #fecaca' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#991b1b', marginBottom: '8px' }}>
              COM ERROS
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#7f1d1d' }}>
              {queue.error || 0}
            </div>
            <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px' }}>
              {queue.dead_letter > 0 ? `${queue.dead_letter} críticos` : 'nenhum crítico'}
            </div>
          </div>
        </div>
      )}

      {/* System Status Footer */}
      <div style={{
        borderTop: '1px solid #e5e7eb',
        paddingTop: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: configOk ? '#10b981' : '#ef4444'
          }}></div>
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
            {configOk ? 'Configuração OK' : 'Configure o sistema'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: online ? '#10b981' : '#9ca3af'
          }}></div>
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
            {online === null ? 'Verificando conexão...' : online ? 'Servidor Online' : 'Servidor Offline'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
