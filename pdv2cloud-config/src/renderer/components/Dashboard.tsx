import React, { useEffect, useState } from 'react';

const Dashboard: React.FC = () => {
  const [status, setStatus] = useState<string>('carregando');
  const [configOk, setConfigOk] = useState(false);
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
        setStatus('stopped');
      }

      try {
        await (window as any).pdv2cloud.loadConfig();
        setConfigOk(true);
      } catch {
        setConfigOk(false);
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
      <p>Servico: <span className="badge">{status.includes('RUNNING') ? 'Running' : 'Stopped'}</span></p>
      <p>Conectividade API: {online === null ? 'Desconhecida' : online ? 'Online' : 'Offline'}</p>
      <p>Configuracao: {configOk ? 'OK' : 'Nao carregada'}</p>
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
