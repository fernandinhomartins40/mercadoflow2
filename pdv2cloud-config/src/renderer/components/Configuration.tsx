import React, { useEffect, useState } from 'react';
import { AgentConfig } from '../../shared/types';

const defaultConfig: AgentConfig = {
  api_url: '',
  api_token: '',
  market_id: '',
  hmac_secret: '',
  watch_paths: [],
  poll_interval_seconds: 10,
  retry_interval_minutes: 5,
  healthcheck_enabled: true,
  healthcheck_port: 8765,
};

const Configuration: React.FC = () => {
  const [config, setConfig] = useState<AgentConfig>(defaultConfig);
  const [newPath, setNewPath] = useState('');
  const [message, setMessage] = useState('');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      const data = await (window as any).pdv2cloud.loadConfig();
      setConfig(data);
    };
    load();
  }, []);

  const save = async () => {
    await (window as any).pdv2cloud.saveConfig(config);
    setMessage('Configuracao salva');
  };

  const testConnection = async () => {
    setTestMessage('Testando...');
    try {
      const response = await fetch(`${config.api_url}/actuator/health`);
      if (!response.ok) {
        setTestMessage(`Falha (${response.status})`);
        return;
      }
      setTestMessage('Conexao OK');
    } catch (err: any) {
      setTestMessage(err?.toString() || 'Falha');
    }
  };

  const addPath = () => {
    if (!newPath) return;
    setConfig({ ...config, watch_paths: [...config.watch_paths, newPath] });
    setNewPath('');
  };

  const removePath = (path: string) => {
    setConfig({ ...config, watch_paths: config.watch_paths.filter((p) => p !== path) });
  };

  return (
    <div className="card">
      <h3>Configuracao</h3>
      <div className="grid">
        <div>
          <label>URL da API</label>
          <input value={config.api_url} onChange={(e) => setConfig({ ...config, api_url: e.target.value })} />
        </div>
        <div>
          <label>Token</label>
          <input
            value={config.api_token}
            placeholder="Token salvo"
            onChange={(e) =>
              setConfig({
                ...config,
                api_token: e.target.value,
                api_token_encrypted: e.target.value ? '' : config.api_token_encrypted,
              })
            }
          />
        </div>
        <div>
          <label>ID do supermercado</label>
          <input value={config.market_id} onChange={(e) => setConfig({ ...config, market_id: e.target.value })} />
        </div>
        <div>
          <label>HMAC Secret</label>
          <input
            value={config.hmac_secret || ''}
            onChange={(e) => setConfig({ ...config, hmac_secret: e.target.value })}
          />
        </div>
        <div>
          <label>Intervalo (segundos)</label>
          <input
            type="number"
            value={config.poll_interval_seconds}
            onChange={(e) => setConfig({ ...config, poll_interval_seconds: Number(e.target.value) })}
          />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Pastas monitoradas</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="C:/PDV/XMLs" />
          <button onClick={addPath}>Adicionar</button>
        </div>
        <ul>
          {config.watch_paths.map((path) => (
            <li key={path} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{path}</span>
              <button onClick={() => removePath(path)}>Remover</button>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginTop: 12 }}>
        <button onClick={save}>Salvar configuracoes</button>
        <button onClick={testConnection} style={{ marginLeft: 8 }}>Testar conexao</button>
        {message && <span style={{ marginLeft: 12, color: 'var(--muted)' }}>{message}</span>}
        {testMessage && <span style={{ marginLeft: 12, color: 'var(--muted)' }}>{testMessage}</span>}
      </div>
    </div>
  );
};

export default Configuration;
