import React, { useEffect, useMemo, useState } from 'react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import Button from '../components/common/Button';
import api from '../services/api';

interface CrawlerSource {
  id?: string;
  name: string;
  provider: string;
  sourceLicense?: string;
  seeds: string[];
  allowedDomains: string[];
  productPathHints: string[];
  maxPages: number;
  maxRecords: number;
  rateLimitMs: number;
  requestTimeoutSec: number;
  enabled: boolean;
}

interface CrawlerConfig {
  userAgent: string;
  intervalMinutes: number;
  enabled: boolean;
  sources: CrawlerSource[];
}

interface CrawlerRun {
  id: string;
  status: string;
  requestedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  scannedProducts?: number | null;
  importedProducts?: number | null;
  skippedInvalidGtin?: number | null;
  skippedMissingName?: number | null;
  skippedMedication?: number | null;
  skippedDuplicateGtin?: number | null;
  errors?: number | null;
  message?: string | null;
  triggeredBy?: string | null;
  sources?: string[] | null;
}

interface CrawlerMonitor {
  queuedRuns: number;
  runningRuns: number;
  latestRun?: CrawlerRun | null;
  recentRuns: CrawlerRun[];
}

const DEFAULT_SOURCE: CrawlerSource = {
  name: '',
  provider: '',
  sourceLicense: 'Public website data (respect provider terms and robots)',
  seeds: [''],
  allowedDomains: [''],
  productPathHints: ['/produto', '/product', '/p/', '/sitemap'],
  maxPages: 250,
  maxRecords: 2500,
  rateLimitMs: 1000,
  requestTimeoutSec: 20,
  enabled: true,
};

const formatDate = (value?: string | null) => {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleString('pt-BR');
};

const formatStatus = (value?: string | null) => {
  const status = (value || '').toUpperCase();
  if (status === 'RUNNING') return 'Executando';
  if (status === 'QUEUED') return 'Na fila';
  if (status === 'SUCCESS') return 'Concluido';
  if (status === 'FAILED') return 'Falhou';
  if (status === 'CANCELLED') return 'Cancelado';
  return status || '--';
};

const runStatusClass = (value?: string | null) => {
  const status = (value || '').toUpperCase();
  if (status === 'SUCCESS') return 'positive';
  if (status === 'FAILED') return 'negative';
  if (status === 'RUNNING') return 'running';
  if (status === 'QUEUED') return 'scheduled';
  return 'neutral';
};

const SuperAdminCrawlerConfig: React.FC = () => {
  const [config, setConfig] = useState<CrawlerConfig>({
    userAgent: 'MercadoFlowCatalogBot/1.0 (+https://mercadoflow.com/catalog-bot)',
    intervalMinutes: 360,
    enabled: true,
    sources: [],
  });
  const [monitor, setMonitor] = useState<CrawlerMonitor>({
    queuedRuns: 0,
    runningRuns: 0,
    latestRun: null,
    recentRuns: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const latestRun = monitor.latestRun || null;
  const totalImportedRecent = useMemo(
    () => (monitor.recentRuns || []).reduce((sum, run) => sum + Number(run.importedProducts || 0), 0),
    [monitor.recentRuns]
  );

  const loadConfig = async () => {
    const response = await api.get('/v1/super-admin/catalog/crawler/config');
    setConfig(response.data);
  };

  const loadMonitor = async () => {
    const response = await api.get('/v1/super-admin/catalog/crawler/monitor', { params: { size: 10 } });
    setMonitor(response.data);
  };

  const load = async () => {
    setLoading(true);
    try {
      await Promise.all([loadConfig(), loadMonitor()]);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar configuracao e monitor do crawler');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const handle = window.setInterval(() => {
      loadMonitor().catch(() => null);
    }, 10000);
    return () => window.clearInterval(handle);
  }, []);

  const save = async () => {
    setSaving(true);
    setSuccess(null);
    setError(null);
    try {
      const normalizedProviders = new Set<string>();
      for (const source of config.sources) {
        const provider = (source.provider || '').trim().toUpperCase();
        if (!provider) {
          throw new Error('Cada fonte precisa ter um provider preenchido.');
        }
        if (normalizedProviders.has(provider)) {
          throw new Error(`Provider duplicado no formulario: ${provider}`);
        }
        normalizedProviders.add(provider);
      }

      const normalizedConfig: CrawlerConfig = {
        ...config,
        sources: config.sources.map((source) => ({
          ...source,
          provider: source.provider.trim().toUpperCase(),
          name: source.name.trim(),
        })),
      };

      await api.put('/v1/super-admin/catalog/crawler/config', normalizedConfig);
      setSuccess('Configuracao salva com sucesso.');
      await Promise.all([loadConfig(), loadMonitor()]);
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar configuracao');
    } finally {
      setSaving(false);
    }
  };

  const triggerManualRun = async () => {
    setTriggering(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/v1/super-admin/catalog/crawler/runs/trigger?triggeredBy=MANUAL_SUPER_ADMIN');
      setSuccess('Execucao enfileirada com sucesso. O monitor sera atualizado automaticamente.');
      await loadMonitor();
    } catch (err: any) {
      setError(err?.message || 'Falha ao enfileirar execucao manual');
    } finally {
      setTriggering(false);
    }
  };

  const updateSource = (index: number, partial: Partial<CrawlerSource>) => {
    const next = [...config.sources];
    next[index] = { ...next[index], ...partial };
    setConfig({ ...config, sources: next });
  };

  const removeSource = (index: number) => {
    const next = config.sources.filter((_, idx) => idx !== index);
    setConfig({ ...config, sources: next });
  };

  const updateStringList = (sourceIndex: number, field: 'seeds' | 'allowedDomains' | 'productPathHints', value: string) => {
    const items = value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    updateSource(sourceIndex, { [field]: items } as Partial<CrawlerSource>);
  };

  return (
    <SuperAdminLayout>
      <div className="super-admin-page">
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Crawler Python</span>
            <h1 className="analytics-hero-title">Configuracao das fontes web</h1>
            <p className="analytics-hero-text">
              Defina os mercados monitorados e acompanhe em tempo real quando o crawler executou, quantos produtos encontrou e quantos foram importados.
            </p>
          </div>
          <div className="analytics-hero-board single-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">Ultima execucao</span>
              <h3>{latestRun ? formatStatus(latestRun.status) : 'Sem historico'}</h3>
              <strong>{formatDate(latestRun?.finishedAt || latestRun?.startedAt || latestRun?.requestedAt)}</strong>
              <p>{latestRun?.message || 'Ainda nao houve execucoes registradas.'}</p>
            </div>
          </div>
        </section>

        {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}
        {success ? <div className="card" style={{ color: 'var(--success)' }}>{success}</div> : null}

        <section className="metrics-grid analytics-metrics-grid">
          <div className="card">
            <span className="section-kicker">Fila</span>
            <h3>{monitor.queuedRuns || 0}</h3>
            <p>execucoes aguardando o worker Python.</p>
          </div>
          <div className="card">
            <span className="section-kicker">Em execucao</span>
            <h3>{monitor.runningRuns || 0}</h3>
            <p>processos ativos neste momento.</p>
          </div>
          <div className="card">
            <span className="section-kicker">Importados (10 ultimas)</span>
            <h3>{totalImportedRecent}</h3>
            <p>produtos cadastrados recentemente.</p>
          </div>
          <div className="card">
            <span className="section-kicker">Ultimo lote</span>
            <h3>{Number(latestRun?.importedProducts || 0)}</h3>
            <p>importados de {Number(latestRun?.scannedProducts || 0)} analisados.</p>
          </div>
        </section>

        <section className="analytics-panel reveal">
          <div className="analytics-panel-head">
            <div>
              <span className="section-kicker">Controle operacional</span>
              <h3>Executar agora</h3>
            </div>
            <Button onClick={triggerManualRun} disabled={triggering}>
              {triggering ? 'Enfileirando...' : 'Executar crawler agora'}
            </Button>
          </div>
          <div className="panel-empty" style={{ textAlign: 'left' }}>
            A execucao manual entra na fila e o worker Python coleta os dados no proximo ciclo de poll. O historico abaixo atualiza automaticamente.
          </div>
        </section>

        {loading ? (
          <div className="card">Carregando configuracao...</div>
        ) : (
          <>
            <section className="analytics-panel reveal">
              <div className="analytics-panel-head">
                <div>
                  <span className="section-kicker">Parametros globais</span>
                  <h3>Execucao automatica</h3>
                </div>
              </div>
              <div className="filter-bar-controls super-admin-form-grid">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  />
                  <span>Crawler habilitado</span>
                </label>
                <input
                  className="input"
                  placeholder="User agent"
                  value={config.userAgent}
                  onChange={(e) => setConfig({ ...config, userAgent: e.target.value })}
                />
                <input
                  className="input"
                  type="number"
                  min={5}
                  placeholder="Intervalo em minutos"
                  value={config.intervalMinutes}
                  onChange={(e) => setConfig({ ...config, intervalMinutes: Number(e.target.value) || 360 })}
                />
              </div>
            </section>

            <section className="analytics-panel reveal">
              <div className="analytics-panel-head">
                <div>
                  <span className="section-kicker">Fontes</span>
                  <h3>Mercados e links monitorados</h3>
                </div>
                <Button variant="secondary" onClick={() => setConfig({ ...config, sources: [...config.sources, { ...DEFAULT_SOURCE }] })}>
                  Adicionar fonte
                </Button>
              </div>

              <div className="super-admin-source-list">
                {config.sources.map((source, index) => (
                  <div className="card super-admin-source-card" key={`${source.provider || 'source'}-${index}`}>
                    <div className="super-admin-source-head">
                      <strong>Fonte {index + 1}</strong>
                      <Button variant="secondary" onClick={() => removeSource(index)}>Remover</Button>
                    </div>
                    <div className="filter-bar-controls super-admin-form-grid">
                      <input className="input" placeholder="Nome" value={source.name} onChange={(e) => updateSource(index, { name: e.target.value })} />
                      <input className="input" placeholder="Provider (unico)" value={source.provider} onChange={(e) => updateSource(index, { provider: e.target.value })} />
                      <input className="input" placeholder="Licenca da fonte" value={source.sourceLicense || ''} onChange={(e) => updateSource(index, { sourceLicense: e.target.value })} />
                      <textarea
                        className="input"
                        rows={4}
                        placeholder="Seeds (1 URL por linha)"
                        value={source.seeds.join('\n')}
                        onChange={(e) => updateStringList(index, 'seeds', e.target.value)}
                      />
                      <textarea
                        className="input"
                        rows={4}
                        placeholder="Dominios permitidos (1 por linha)"
                        value={source.allowedDomains.join('\n')}
                        onChange={(e) => updateStringList(index, 'allowedDomains', e.target.value)}
                      />
                      <textarea
                        className="input"
                        rows={4}
                        placeholder="Hints de caminho (1 por linha)"
                        value={(source.productPathHints || []).join('\n')}
                        onChange={(e) => updateStringList(index, 'productPathHints', e.target.value)}
                      />
                      <input className="input" type="number" min={1} value={source.maxPages} onChange={(e) => updateSource(index, { maxPages: Number(e.target.value) || 250 })} />
                      <input className="input" type="number" min={1} value={source.maxRecords} onChange={(e) => updateSource(index, { maxRecords: Number(e.target.value) || 2500 })} />
                      <input className="input" type="number" min={100} value={source.rateLimitMs} onChange={(e) => updateSource(index, { rateLimitMs: Number(e.target.value) || 1000 })} />
                      <input className="input" type="number" min={5} value={source.requestTimeoutSec} onChange={(e) => updateSource(index, { requestTimeoutSec: Number(e.target.value) || 20 })} />
                      <label className="checkbox">
                        <input type="checkbox" checked={source.enabled} onChange={(e) => updateSource(index, { enabled: e.target.checked })} />
                        <span>Fonte habilitada</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="analytics-panel reveal">
              <div className="analytics-panel-head">
                <div>
                  <span className="section-kicker">Historico</span>
                  <h3>Ultimas execucoes do crawler</h3>
                </div>
              </div>
              {monitor.recentRuns.length === 0 ? (
                <div className="panel-empty">Nenhuma execucao registrada ate o momento.</div>
              ) : (
                <div className="catalog-admin-table-wrap">
                  <table className="table catalog-admin-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Solicitado</th>
                        <th>Finalizado</th>
                        <th>Importados</th>
                        <th>Erros</th>
                        <th>Origem</th>
                        <th>Mensagem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitor.recentRuns.map((run) => (
                        <tr key={run.id}>
                          <td><span className={`status-pill ${runStatusClass(run.status)}`}>{formatStatus(run.status)}</span></td>
                          <td>{formatDate(run.requestedAt)}</td>
                          <td>{formatDate(run.finishedAt || run.startedAt)}</td>
                          <td>{Number(run.importedProducts || 0)} / {Number(run.scannedProducts || 0)}</td>
                          <td>{Number(run.errors || 0)}</td>
                          <td>{run.triggeredBy || '--'}</td>
                          <td>{run.message || '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="super-admin-actions">
              <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar configuracao do crawler'}</Button>
            </div>
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminCrawlerConfig;
