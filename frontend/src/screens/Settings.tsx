import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import ButtonLink from '../components/common/ButtonLink';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHeader from '../components/layout/PageHeader';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

interface AgentKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string | null;
  lastHeartbeatAt?: string | null;
  isActive?: boolean | null;
}

interface InstallerInfo {
  version?: string;
  sizeFormatted?: string;
  lastModified?: string;
  downloadUrl?: string;
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleString('pt-BR');
};

const Settings: React.FC = () => {
  const { marketId, role, name: userName, email } = useAuth();
  const [keys, setKeys] = useState<AgentKeyRow[]>([]);
  const [name, setName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [manualMarketId, setManualMarketId] = useState('');
  const [markets, setMarkets] = useState<Array<{ id: string; name: string }>>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [installerInfo, setInstallerInfo] = useState<InstallerInfo | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const resolvedMarketId = marketId || manualMarketId;
  const apiBaseUrl = useMemo(() => {
    const configured = (import.meta.env.VITE_API_URL || '/api').trim();
    if (configured.startsWith('http://') || configured.startsWith('https://')) {
      return configured.replace(/\/api\/?$/, '').replace(/\/+$/, '');
    }
    return window.location.origin.replace(/\/+$/, '');
  }, []);

  const activeKeys = keys.filter((key) => key.isActive !== false);
  const revokedKeys = keys.filter((key) => key.isActive === false);
  const heartbeatFreshKeys = keys.filter((key) => {
    if (!key.lastHeartbeatAt || key.isActive === false) return false;
    const diffMs = Date.now() - new Date(key.lastHeartbeatAt).getTime();
    return diffMs <= 1000 * 60 * 10;
  });

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((current) => (current === label ? null : current)), 1800);
    } catch {
      setMessage(`Falha ao copiar ${label}.`);
    }
  };

  const loadKeys = async () => {
    if (!resolvedMarketId) {
      setKeys([]);
      return;
    }
    try {
      const response = await api.get('/v1/agent-keys', { params: { marketId: resolvedMarketId } });
      setKeys(response.data || []);
      setListError(null);
    } catch (err: any) {
      setListError(err?.message || 'Falha ao carregar chaves');
    }
  };

  const loadInstallerInfo = async () => {
    try {
      const response = await api.get('/v1/downloads/agent-installer/info');
      setInstallerInfo(response.data || null);
    } catch {
      setInstallerInfo(null);
    }
  };

  useEffect(() => {
    loadKeys();
  }, [marketId, manualMarketId]);

  useEffect(() => {
    loadInstallerInfo();
  }, []);

  useEffect(() => {
    const loadMarkets = async () => {
      if (role !== 'ADMIN' || marketId) {
        return;
      }
      try {
        const response = await api.get('/v1/markets');
        setMarkets(response.data || []);
      } catch {
        setMarkets([]);
      }
    };
    loadMarkets();
  }, [role, marketId]);

  const createKey = async () => {
    if (!resolvedMarketId || !name.trim()) {
      setMessage('Informe um nome e o supermercado alvo.');
      return;
    }
    try {
      const response = await api.post('/v1/agent-keys', { marketId: resolvedMarketId, name: name.trim() });
      setGeneratedKey(response.data.apiKey);
      setName('');
      setMessage('Chave criada com sucesso. Copie agora — ela só aparece uma vez.');
      await loadKeys();
    } catch (err: any) {
      setMessage(err?.message || 'Falha ao criar chave.');
    }
  };

  const revokeKey = async (key: AgentKeyRow) => {
    if (!resolvedMarketId) return;
    const confirmed = window.confirm(`Excluir a chave \"${key.name}\"? O agente que usa essa credencial perde acesso imediatamente.`);
    if (!confirmed) return;

    try {
      setBusyKeyId(key.id);
      await api.delete(`/v1/agent-keys/${key.id}`, { params: { marketId: resolvedMarketId } });
      setMessage(`Chave ${key.name} revogada com sucesso.`);
      if (generatedKey && generatedKey.startsWith(key.keyPrefix)) {
        setGeneratedKey(null);
      }
      await loadKeys();
    } catch (err: any) {
      setMessage(err?.message || 'Falha ao excluir chave.');
    } finally {
      setBusyKeyId(null);
    }
  };

  return (
    <Layout>
      <div className="page analytics-page settings-page">
        <PageHeader
          title="Configurações"
          subtitle="Credenciais do agente, endpoint e informações do mercado."
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <MetricsCard title="Chaves ativas" value={activeKeys.length} icon="AK" />
          <MetricsCard title="Revogadas" value={revokedKeys.length} icon="RV" variant="danger" />
          <MetricsCard title="Heartbeat recente" value={heartbeatFreshKeys.length} icon="HB" variant="warning" />
          <MetricsCard title="Instalador" value={installerInfo?.version || 'disponível'} icon="EXE" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
          <div className="flex min-w-0 flex-col gap-5">
            {/* Contexto */}
            <div className="flex flex-col gap-3">
              <div className="border-b border-slate-100 pb-2">
                <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400">Contexto</p>
                <h3 className="text-sm font-semibold text-slate-900">Identidade e endpoint</h3>
              </div>
              <div className="settings-stack">
                <div className="settings-line-card">
                  <div>
                    <strong>URL base da API</strong>
                    <span>{apiBaseUrl}</span>
                  </div>
                  <Button variant="secondary" onClick={() => copyText(apiBaseUrl, 'URL da API')}>{copied === 'URL da API' ? 'Copiado' : 'Copiar URL'}</Button>
                </div>
                <div className="settings-line-card">
                  <div>
                    <strong>ID do mercado</strong>
                    <span>{resolvedMarketId || '--'}</span>
                  </div>
                  <Button variant="secondary" onClick={() => resolvedMarketId && copyText(resolvedMarketId, 'ID do mercado')} disabled={!resolvedMarketId}>{copied === 'ID do mercado' ? 'Copiado' : 'Copiar ID'}</Button>
                </div>
                <div className="settings-line-card">
                  <div>
                    <strong>Usuário logado</strong>
                    <span>{userName || '--'} | {email || '--'}</span>
                  </div>
                  <span className="status-pill positive">{role || '--'}</span>
                </div>
                <div className="settings-line-card">
                  <div>
                    <strong>Instalador do agente</strong>
                    <span>{installerInfo?.version || 'Versão não informada'} | {installerInfo?.sizeFormatted || '--'}</span>
                  </div>
                  <ButtonLink to="/app/download-agente" variant="secondary">Abrir download</ButtonLink>
                </div>
              </div>
            </div>

            {/* Chaves */}
            <div className="flex flex-col gap-3">
              <div className="border-b border-slate-100 pb-2">
                <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400">Chaves do agente</p>
                <h3 className="text-sm font-semibold text-slate-900">Credenciais ativas e revogadas</h3>
              </div>
              <div className="analytics-card-grid settings-key-grid">
                {keys.length === 0 ? (
                  <div className="panel-empty">{listError || 'Nenhuma chave encontrada para este mercado.'}</div>
                ) : (
                  keys.map((key) => (
                    <article key={key.id} className={`settings-key-card ${key.isActive === false ? 'revoked' : 'active'} reveal`}>
                      <div className="settings-key-head">
                        <div>
                          <h3>{key.name}</h3>
                        </div>
                        <span className={`status-pill ${key.isActive === false ? 'ended' : 'positive'}`}>{key.isActive === false ? 'Revogada' : 'Ativa'}</span>
                      </div>
                      <div className="settings-key-body">
                        <div>
                          <span>Prefixo</span>
                          <strong>{key.keyPrefix}</strong>
                        </div>
                        <div>
                          <span>Criada em</span>
                          <strong>{formatDateTime(key.createdAt)}</strong>
                        </div>
                        <div>
                          <span>Último uso</span>
                          <strong>{formatDateTime(key.lastUsedAt)}</strong>
                        </div>
                        <div>
                          <span>Último heartbeat</span>
                          <strong>{formatDateTime(key.lastHeartbeatAt)}</strong>
                        </div>
                      </div>
                      <div className="settings-key-actions">
                        <Button variant="secondary" onClick={() => copyText(key.keyPrefix, `prefixo-${key.id}`)}>{copied === `prefixo-${key.id}` ? 'Copiado' : 'Copiar prefixo'}</Button>
                        <Button variant="secondary" onClick={() => revokeKey(key)} disabled={busyKeyId === key.id || key.isActive === false}>{busyKeyId === key.id ? 'Excluindo...' : key.isActive === false ? 'Já revogada' : 'Excluir chave'}</Button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-3">
            <div className="border-b border-slate-100 pb-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400">Nova credencial</p>
              <h3 className="text-sm font-semibold text-slate-900">Gerar chave</h3>
            </div>
            <div className="grid gap-3">
              {role === 'ADMIN' && !marketId && (
                <select className="input full" value={manualMarketId} onChange={(e) => setManualMarketId(e.target.value)}>
                  <option value="">Selecione o supermercado</option>
                  {markets.map((market) => (
                    <option key={market.id} value={market.id}>{market.name}</option>
                  ))}
                </select>
              )}
              <input className="input full" placeholder="Nome da chave. Ex: Caixa Loja Centro" value={name} onChange={(e) => setName(e.target.value)} />
              <Button onClick={createKey}>Gerar chave</Button>
            </div>
            {message && <div className="settings-message">{message}</div>}
            {generatedKey && (
              <div className="settings-secret-card">
                <strong>Copie esta chave agora. Ela só aparece uma vez.</strong>
                <div className="code-box" style={{ marginTop: 10 }}>{generatedKey}</div>
                <div className="flex flex-wrap gap-2" style={{ marginTop: 10 }}>
                  <Button variant="secondary" onClick={() => copyText(generatedKey, 'chave gerada')}>{copied === 'chave gerada' ? 'Copiado' : 'Copiar chave'}</Button>
                  <Button variant="secondary" onClick={() => setGeneratedKey(null)}>Ocultar</Button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
