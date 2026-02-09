import React, { useEffect, useState } from 'react';

interface DashboardProps {
  serviceInstalled: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ serviceInstalled }) => {
  const [status, setStatus] = useState<string>('carregando');
  const [configOk, setConfigOk] = useState(false);
  const [configPath, setConfigPath] = useState<string>('');
  const [queue, setQueue] = useState<any>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [lastProcessed, setLastProcessed] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      try {
        const service = await (window as any).pdv2cloud.serviceStatus();
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
        await (window as any).pdv2cloud.loadConfig();
        setConfigOk(true);
        setConfigPath('C:\\ProgramData\\PDV2Cloud\\config.json');
      } catch (err) {
        setConfigOk(false);
        setConfigPath('');
      }

      try {
        const statusFile = await (window as any).pdv2cloud.loadStatus();
        if (statusFile) {
          setQueue(statusFile.queue);
          setOnline(statusFile.online);
          setLastUpdate(statusFile.timestamp);
          setLastProcessed(statusFile.last_processed || '');
        }
      } catch {
        setQueue(null);
      }
    };

    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card">
      <h3>Status</h3>
      {!serviceInstalled && (
        <div className="alert alert-error" style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#fee', border: '1px solid #fcc', borderRadius: '4px' }}>
          <strong>⚠️ Servico nao instalado</strong>
          <p>O servico PDV2CloudAgent nao esta registrado no Windows.</p>
          <p>Execute como Administrador (ajuste o caminho se instalou em outra pasta):</p>
          <code style={{ display: 'block', marginTop: '5px', padding: '5px', backgroundColor: '#f5f5f5', whiteSpace: 'pre-wrap' }}>
            "C:\Program Files\PDV2Cloud\python\python.exe" "C:\Program Files\PDV2Cloud\service\installer\service_installer.py" install
            <br />
            "C:\Program Files (x86)\PDV2Cloud\python\python.exe" "C:\Program Files (x86)\PDV2Cloud\service\installer\service_installer.py" install
          </code>
        </div>
      )}
      <p>Servico: <span className="badge">{
        status === 'not_installed' ? '❌ Nao instalado' :
        status.includes('RUNNING') ? '✅ Running' :
        status === 'carregando' ? '⏳ Carregando...' :
        '⏹️ Stopped'
      }</span></p>
      <p>Conectividade API: {online === null ? 'Desconhecida' : online ? '✅ Online' : '❌ Offline'}</p>
      <p>Configuracao: {
        configOk ?
          <span>✅ OK <small style={{ color: '#666' }}>({configPath})</small></span> :
          <span>❌ Nao encontrada <small style={{ color: '#666' }}>(C:\ProgramData\PDV2Cloud\config.json)</small></span>
      }</p>
      {queue && (
        <div>
          <p>Fila: {queue.pending} pendentes, {queue.error} erros, {queue.dead_letter} dead letter</p>
          {lastUpdate && <p>Ultima atualizacao: {lastUpdate}</p>}
          {lastProcessed && <p>Ultimo processamento: {lastProcessed}</p>}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
