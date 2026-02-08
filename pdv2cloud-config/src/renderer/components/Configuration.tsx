import React, { useEffect, useState } from 'react';
import { AgentConfig } from '../../shared/types';

const defaultConfig: AgentConfig = {
  api_url: 'https://mercadoflow.com',
  api_key: '',
  market_id: '',
  watch_paths: [],
  poll_interval_seconds: 10,
  retry_interval_minutes: 5,
  healthcheck_enabled: true,
  healthcheck_port: 8765,
};

const DEFAULT_API_URL = 'https://mercadoflow.com';

const Configuration: React.FC = () => {
  const [config, setConfig] = useState<AgentConfig>(defaultConfig);
  const [message, setMessage] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [marketName, setMarketName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [useCustomApiUrl, setUseCustomApiUrl] = useState(false);

  useEffect(() => {
    const load = async () => {
      const data = await (window as any).pdv2cloud.loadConfig();
      const normalized: AgentConfig = {
        ...defaultConfig,
        ...data,
        api_url: data?.api_url || DEFAULT_API_URL,
        watch_paths: Array.isArray(data?.watch_paths) ? data.watch_paths : [],
      };
      setUseCustomApiUrl(normalized.api_url !== DEFAULT_API_URL);
      setConfig(normalized);
    };
    load();
  }, []);

  const save = async () => {
    const next: AgentConfig = {
      ...config,
      api_url: useCustomApiUrl ? config.api_url : DEFAULT_API_URL,
      watch_paths: (config.watch_paths || []).filter(Boolean),
    };
    await (window as any).pdv2cloud.saveConfig(next);
    setConfig(next);
    setMessage('Configuracao salva');
  };

  const testConnection = async (autoSave?: boolean) => {
    setTestMessage('Testando...');
    try {
      const apiUrl = (useCustomApiUrl ? config.api_url : DEFAULT_API_URL).trim();
      const apiKey = (config.api_key || '').trim();
      const response = await fetch(`${apiUrl}/api/v1/agent/me`, {
        headers: apiKey ? { 'X-API-Key': apiKey } : undefined,
      });
      if (!response.ok) {
        setTestMessage(`Falha (${response.status})`);
        return;
      }
      const data = await response.json();
      if (data?.marketId) {
        const next = { ...config, api_url: apiUrl, api_key: apiKey, market_id: data.marketId };
        setConfig(next);
        setMarketName(data.marketName || '');
        if (autoSave) {
          await (window as any).pdv2cloud.saveConfig(next);
          setMessage('Conectado e salvo com sucesso');
        }
      }
      setTestMessage('Conexao OK');
    } catch (err: any) {
      setTestMessage(err?.toString() || 'Falha');
    }
  };

  const addPath = async () => {
    const picked = await (window as any).pdv2cloud.pickFolder();
    if (!picked) return;
    const path = String(picked).trim();
    if (!path) return;
    if (config.watch_paths.includes(path)) {
      setMessage('Esta pasta ja esta na lista');
      return;
    }
    setConfig({ ...config, watch_paths: [...config.watch_paths, path] });
  };

  const removePath = (path: string) => {
    setConfig({ ...config, watch_paths: config.watch_paths.filter((p) => p !== path) });
  };

  return (
    <div className="card">
      <h3>Configuracao</h3>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Modo rapido: cole apenas a <strong>API Key</strong>. A URL e fixa em <code>{DEFAULT_API_URL}</code>.
      </p>
      <div className="grid">
        <div>
          <label>API Key</label>
          <div style={{ position: 'relative' }}>
            <input
              value={config.api_key}
              type={showKey ? 'text' : 'password'}
              placeholder="Ex: pdv2_********"
              onChange={(e) =>
                setConfig({
                  ...config,
                  api_key: e.target.value,
                  api_key_encrypted: e.target.value ? '' : config.api_key_encrypted,
                })
              }
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              style={{ position: 'absolute', right: 8, top: 8, background: 'transparent' }}
            >
              {showKey ? 'Ocultar' : 'Ver'}
            </button>
          </div>
          <div style={{ marginTop: 8, color: 'var(--muted)' }}>
            {config.market_id ? (
              <span>
                Vinculado: <strong>{marketName || config.market_id}</strong>
              </span>
            ) : (
              <span>Ainda nao vinculado a um mercado.</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Pastas monitoradas</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <button onClick={addPath}>Selecionar pasta...</button>
          <button onClick={() => setConfig({ ...config, watch_paths: [] })} style={{ background: '#334155' }}>
            Limpar lista
          </button>
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
        <button onClick={() => testConnection(true)}>Conectar e salvar</button>
        <button onClick={save} style={{ marginLeft: 8, background: '#334155' }}>
          Salvar
        </button>
        <button onClick={() => testConnection(false)} style={{ marginLeft: 8, background: '#334155' }}>
          Testar conexao
        </button>
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
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={useCustomApiUrl}
                onChange={(e) => setUseCustomApiUrl(e.target.checked)}
              />
              Usar URL customizada (dev)
            </label>
            {useCustomApiUrl ? (
              <input
                value={config.api_url}
                placeholder={DEFAULT_API_URL}
                onChange={(e) => setConfig({ ...config, api_url: e.target.value })}
              />
            ) : (
              <div style={{ color: 'var(--muted)' }}>
                URL fixa: <code>{DEFAULT_API_URL}</code>
              </div>
            )}
          </div>
          <div>
            <label>Intervalo (segundos)</label>
            <input
              type="number"
              value={config.poll_interval_seconds}
              onChange={(e) => setConfig({ ...config, poll_interval_seconds: Number(e.target.value) })}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <label>Retry (minutos)</label>
            <input
              type="number"
              value={config.retry_interval_minutes}
              onChange={(e) => setConfig({ ...config, retry_interval_minutes: Number(e.target.value) })}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={config.healthcheck_enabled}
                onChange={(e) => setConfig({ ...config, healthcheck_enabled: e.target.checked })}
              />
              Healthcheck habilitado
            </label>
          </div>
          <div style={{ marginTop: 10 }}>
            <label>Porta do healthcheck</label>
            <input
              type="number"
              value={config.healthcheck_port}
              onChange={(e) => setConfig({ ...config, healthcheck_port: Number(e.target.value) })}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Configuration;
