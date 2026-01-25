import React, { useEffect, useState } from 'react';
import { AgentConfig } from '../../shared/types';

const defaultConfig: AgentConfig = {
  api_url: '',
  api_key: '',
  market_id: '',
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
  const [marketName, setMarketName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

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
      const response = await fetch(`${config.api_url}/api/v1/agent/me`, {
        headers: config.api_key ? { 'X-API-Key': config.api_key } : undefined,
      });
      if (!response.ok) {
        setTestMessage(`Falha (${response.status})`);
        return;
      }
      const data = await response.json();
      if (data?.marketId) {
        setConfig({ ...config, market_id: data.marketId });
        setMarketName(data.marketName || '');
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
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Cole a API Key gerada no painel web para conectar automaticamente ao mercado.
      </p>
      <div className="grid">
        <div>
          <label>URL da API</label>
          <input value={config.api_url} onChange={(e) => setConfig({ ...config, api_url: e.target.value })} />
        </div>
        <div>
          <label>API Key</label>
          <input
            value={config.api_key}
            placeholder="Ex: pdv2_********"
            onChange={(e) =>
              setConfig({
                ...config,
                api_key: e.target.value,
                api_key_encrypted: e.target.value ? '' : config.api_key_encrypted,
              })
            }
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

      <div style={{ marginTop: 16 }}>
        <button onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? 'Ocultar avancado' : 'Mostrar avancado'}
        </button>
      </div>

      {showAdvanced && (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <label>ID do supermercado (auto)</label>
            <input value={config.market_id} readOnly />
            {marketName && <div style={{ color: 'var(--muted)' }}>Mercado: {marketName}</div>}
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
      )}
    </div>
  );
};

export default Configuration;
