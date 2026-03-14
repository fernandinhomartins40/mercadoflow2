import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHero from '../components/dashboard/PageHero';
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
      setMessage('Chave criada com sucesso. Copie agora e guarde com seguranca.');
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
        <PageHero
          badge="Central de configurações"
          title="Controle credenciais, instalador e contexto do mercado em uma única área."
          description="Esta central concentra URL real da API, distribuição do instalador, identidade do mercado e ciclo completo das chaves do coletor desktop."
          feature={
            <>
              <article className="dashboard-glow-card">
                <span className="section-kicker">Conexão principal do agente</span>
                <strong>{apiBaseUrl}</strong>
                <p>{heartbeatFreshKeys.length} chaves com heartbeat recente nos últimos 10 minutos. Isso separa instalações vivas das esquecidas.</p>
              </article>
              <div className="dashboard-command-mosaic">
                <article className="dashboard-mini-tile">
                  <span>Versão do instalador</span>
                  <strong>{installerInfo?.version || 'disponível'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Tamanho</span>
                  <strong>{installerInfo?.sizeFormatted || '--'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Última atualização</span>
                  <strong>{installerInfo?.lastModified || '--'}</strong>
                </article>
              </div>
            </>
          }
          aside={
            <>
              <article className="dashboard-priority-card">
                <span className="section-kicker">Boa prática</span>
                <h3>Uma chave por instalação ou PDV.</h3>
                <p>Evite compartilhar credenciais. Isso preserva rastreabilidade real e facilita revogação sem atingir outras máquinas.</p>
              </article>
              <article className="dashboard-priority-card">
                <span className="section-kicker">Risco comum</span>
                <h3>Heartbeat sem uso precisa de revisão.</h3>
                <p>Quando o agente some ou a máquina muda, revogue a chave antiga antes que ela vire credencial esquecida em produção.</p>
              </article>
            </>
          }
        />

        <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <MetricsCard title="Chaves ativas" value={activeKeys.length} icon="AK" caption="credenciais prontas para uso" />
          <MetricsCard title="Chaves revogadas" value={revokedKeys.length} icon="RV" variant="danger" caption="histórico desativado" />
          <MetricsCard title="Heartbeat recente" value={heartbeatFreshKeys.length} icon="HB" variant="warning" caption="atividade do agente" />
          <MetricsCard title="Instalador" value={installerInfo?.version || 'disponível'} icon="EXE" caption={installerInfo?.sizeFormatted || 'pacote do coletor'} />
        </div>

        <div className="dashboard-page-grid">
          <section className="analytics-panel reveal dashboard-form-panel">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Contexto da aplicação</span>
                <h3>Identidade, endpoint e download</h3>
              </div>
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
                  <span>{installerInfo?.version || 'Versão não informada'} | {installerInfo?.lastModified || 'sem timestamp'}</span>
                </div>
                <a className="button secondary" href="/app/download-agente">Abrir download</a>
              </div>
            </div>
          </section>

          <div className="dashboard-side-stack">
            <section className="analytics-panel reveal dashboard-form-panel">
              <div className="analytics-panel-head">
                <div>
                  <span className="section-kicker">Nova credencial</span>
                  <h3>Gerar chave da API do coletor</h3>
                </div>
              </div>
              <div className="form-grid-analytics settings-form-grid">
                {role === 'ADMIN' && !marketId && (
                  <select className="input full" value={manualMarketId} onChange={(e) => setManualMarketId(e.target.value)}>
                    <option value="">Selecione o supermercado</option>
                    {markets.map((market) => (
                      <option key={market.id} value={market.id}>{market.name}</option>
                    ))}
                  </select>
                )}
                <input className="input full" placeholder="Nome da chave. Ex: Caixa Loja Centro" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="panel-actions">
                <Button onClick={createKey}>Gerar chave</Button>
              </div>
              {message && <div className="settings-message">{message}</div>}
              {generatedKey && (
                <div className="settings-secret-card">
                  <strong>Copie esta chave agora. Ela so aparece uma vez.</strong>
                  <div className="code-box" style={{ marginTop: 10 }}>{generatedKey}</div>
                  <div className="panel-actions" style={{ marginTop: 10 }}>
                    <Button variant="secondary" onClick={() => copyText(generatedKey, 'chave gerada')}>{copied === 'chave gerada' ? 'Copiado' : 'Copiar chave'}</Button>
                    <Button variant="secondary" onClick={() => setGeneratedKey(null)}>Ocultar</Button>
                  </div>
                </div>
              )}
            </section>

            <section className="analytics-panel reveal dashboard-note-card">
              <span className="section-kicker">Checklist rápido</span>
              <h3>Padrão mínimo de configuração</h3>
              <div className="dashboard-quick-list">
                <div className="dashboard-quick-item">
                  <strong>1. Defina a URL correta</strong>
                  <span>Use exatamente {apiBaseUrl} no desktop do coletor.</span>
                </div>
                <div className="dashboard-quick-item">
                  <strong>2. Gere uma chave por máquina</strong>
                  <span>Isso evita perda de rastreabilidade e simplifica revogação.</span>
                </div>
                <div className="dashboard-quick-item">
                  <strong>3. Revogue chaves antigas</strong>
                  <span>Troca de máquina sem revogação vira credencial esquecida em produção.</span>
                </div>
              </div>
            </section>
          </div>
        </div>

        <section className="analytics-section reveal">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker">Gerenciamento de chaves</span>
              <h2>Excluir, auditar e identificar quais credenciais ainda estao vivas</h2>
            </div>
          </div>
          <div className="analytics-card-grid settings-key-grid">
            {keys.length === 0 ? (
              <div className="analytics-panel"><div className="panel-empty">{listError || 'Nenhuma chave encontrada para este mercado.'}</div></div>
            ) : (
              keys.map((key) => (
                <article key={key.id} className={`settings-key-card ${key.isActive === false ? 'revoked' : 'active'} reveal`}>
                  <div className="settings-key-head">
                    <div>
                      <span className="section-kicker">Credencial do agente</span>
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
                      <span>Ultimo uso</span>
                      <strong>{formatDateTime(key.lastUsedAt)}</strong>
                    </div>
                    <div>
                      <span>Ultimo heartbeat</span>
                      <strong>{formatDateTime(key.lastHeartbeatAt)}</strong>
                    </div>
                  </div>
                  <div className="settings-key-actions">
                    <Button variant="secondary" onClick={() => copyText(key.keyPrefix, `prefixo-${key.id}`)}>{copied === `prefixo-${key.id}` ? 'Copiado' : 'Copiar prefixo'}</Button>
                    <Button variant="secondary" onClick={() => revokeKey(key)} disabled={busyKeyId === key.id || key.isActive === false}>{busyKeyId === key.id ? 'Excluindo...' : key.isActive === false ? 'Ja revogada' : 'Excluir chave'}</Button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default Settings;
