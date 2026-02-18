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
    // Check for updates on mount
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    try {
      const versionInfo = await (window as any).electron.invoke('update:check');
      // Compare versions (simple string comparison for now)
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
    const id = setInterval(load, 10000); // Update every 10 seconds
    return () => clearInterval(id);
  }, []);

  const getStatusColor = () => {
    if (status.includes('RUNNING') && online) return 'bg-green-500';
    if (status.includes('RUNNING') && !online) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusIcon = () => {
    if (status.includes('RUNNING') && online) return '✓';
    if (status.includes('RUNNING') && !online) return '⚠';
    return '✕';
  };

  const getStatusText = () => {
    if (status === 'not_installed') return 'Serviço não instalado';
    if (status.includes('RUNNING') && online) return 'Funcionando normalmente';
    if (status.includes('RUNNING') && !online) return 'Aguardando conexão';
    if (status === 'carregando') return 'Carregando...';
    return 'Serviço parado';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-4">
      {/* Update Available Banner */}
      {updateAvailable && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-blue-500 text-xl mr-3">🎉</span>
              <div>
                <h3 className="text-sm font-semibold text-blue-800">Nova atualização disponível!</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Versão {latestVersion} está pronta para instalação
                </p>
              </div>
            </div>
            <button
              onClick={installUpdate}
              disabled={installing}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {installing ? 'Instalando...' : 'Atualizar agora'}
            </button>
          </div>
        </div>
      )}

      {/* Main Status Card */}
      <div className={`${getStatusColor()} text-white rounded-lg p-6 mb-4 transition-all`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-2xl">
                {getStatusIcon()}
              </div>
              <div>
                <h2 className="text-2xl font-bold">{getStatusText()}</h2>
                {statusMessage && (
                  <p className="text-sm opacity-90 mt-1">{statusMessage}</p>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs opacity-75">Última atualização</div>
            <div className="text-sm">
              {lastUpdate ? new Date(lastUpdate).toLocaleTimeString('pt-BR') : '--:--:--'}
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {lastError && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-red-500 text-xl">⚠</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-semibold text-red-800">{lastError.title}</h3>
              <p className="text-sm text-red-700 mt-1">{lastError.message}</p>
              {lastError.technical && (
                <details className="mt-2">
                  <summary className="text-xs text-red-600 cursor-pointer hover:underline">
                    Detalhes técnicos
                  </summary>
                  <code className="text-xs text-red-600 block mt-1 bg-red-100 p-2 rounded">
                    {lastError.technical}
                  </code>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Not Installed Warning */}
      {!serviceInstalled && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-yellow-500 text-xl">⚠</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-semibold text-yellow-800">Serviço não instalado</h3>
              <p className="text-sm text-yellow-700 mt-1">
                O serviço precisa ser instalado para começar a coletar dados.
              </p>
              <button
                onClick={() => (window as any).electron.invoke('service:install')}
                className="mt-2 px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm font-semibold"
              >
                Instalar agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      {queue && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-blue-600 text-sm font-semibold mb-1">Total</div>
            <div className="text-3xl font-bold text-blue-900">{queue.total || 0}</div>
            <div className="text-xs text-blue-600 mt-1">na fila</div>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-green-600 text-sm font-semibold mb-1">Enviados</div>
            <div className="text-3xl font-bold text-green-900">{queue.sent || 0}</div>
            <div className="text-xs text-green-600 mt-1">com sucesso</div>
          </div>

          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="text-yellow-600 text-sm font-semibold mb-1">Pendentes</div>
            <div className="text-3xl font-bold text-yellow-900">{queue.pending || 0}</div>
            <div className="text-xs text-yellow-600 mt-1">aguardando</div>
          </div>

          <div className="bg-red-50 rounded-lg p-4">
            <div className="text-red-600 text-sm font-semibold mb-1">Erros</div>
            <div className="text-3xl font-bold text-red-900">{queue.error || 0}</div>
            <div className="text-xs text-red-600 mt-1">
              {queue.dead_letter > 0 && `(${queue.dead_letter} críticos)`}
            </div>
          </div>
        </div>
      )}

      {/* Configuration Status */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className={configOk ? 'text-green-600' : 'text-red-600'}>
              {configOk ? '✓' : '✕'}
            </span>
            <span className="text-gray-700">
              {configOk ? 'Configuração carregada' : 'Configuração não encontrada'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={online ? 'text-green-600' : 'text-gray-400'}>
              {online ? '●' : '○'}
            </span>
            <span className="text-gray-700">
              {online === null ? 'Conectividade desconhecida' : online ? 'Conectado' : 'Offline'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
