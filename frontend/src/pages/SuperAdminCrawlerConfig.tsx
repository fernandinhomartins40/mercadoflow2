import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import Button from '../components/common/Button';
import api from '../services/api';

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

interface CrawlerJob {
  provider: string;
  name: string;
  enabled?: boolean | null;
  scopeLabel: string;
  extractorType: string;
  scriptName: string;
  description: string;
  sourceLicense?: string | null;
  includesMedication?: boolean | null;
  downloadsImages?: boolean | null;
  queuedRuns?: number | null;
  runningRuns?: number | null;
  lastRun?: CrawlerRun | null;
}

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
  const [jobs, setJobs] = useState<CrawlerJob[]>([]);
  const [monitor, setMonitor] = useState<CrawlerMonitor>({
    queuedRuns: 0,
    runningRuns: 0,
    latestRun: null,
    recentRuns: [],
  });
  const [loading, setLoading] = useState(true);
  const [triggeringProvider, setTriggeringProvider] = useState<string | null>(null);
  const [stoppingRunId, setStoppingRunId] = useState<string | null>(null);
  const [restartingRunId, setRestartingRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const latestRun = monitor.latestRun || null;
  const totalImportedRecent = useMemo(
    () => (monitor.recentRuns || []).reduce((sum, run) => sum + Number(run.importedProducts || 0), 0),
    [monitor.recentRuns]
  );
  const hasActiveRun = useMemo(
    () => Number(monitor.queuedRuns || 0) > 0 || Number(monitor.runningRuns || 0) > 0,
    [monitor.queuedRuns, monitor.runningRuns]
  );
  const activeJobs = useMemo(
    () => jobs.filter((job) => Number(job.runningRuns || 0) > 0 || (job.lastRun?.status || '').toUpperCase() === 'RUNNING').length,
    [jobs]
  );

  const loadJobs = async () => {
    const response = await api.get('/v1/super-admin/catalog/crawler/jobs');
    setJobs(response.data || []);
  };

  const loadMonitor = async () => {
    const response = await api.get('/v1/super-admin/catalog/crawler/monitor', { params: { size: 12 } });
    setMonitor(response.data);
  };

  const load = async () => {
    setLoading(true);
    try {
      await Promise.all([loadJobs(), loadMonitor()]);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar painel do crawler');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const handle = window.setInterval(() => {
      Promise.all([loadJobs(), loadMonitor()]).catch(() => null);
    }, 10000);
    return () => window.clearInterval(handle);
  }, []);

  const triggerProvider = async (provider: string) => {
    setTriggeringProvider(provider);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/v1/super-admin/catalog/crawler/jobs/${provider}/trigger?triggeredBy=MANUAL_SUPER_ADMIN`);
      setSuccess(`Execucao manual enfileirada para ${provider}. O dispatcher agora roda um supermercado por vez.`);
      await Promise.all([loadJobs(), loadMonitor()]);
    } catch (err: any) {
      setError(err?.message || `Falha ao enfileirar execucao de ${provider}`);
    } finally {
      setTriggeringProvider(null);
    }
  };

  const stopRun = async (runId: string) => {
    setStoppingRunId(runId);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/v1/super-admin/catalog/crawler/runs/${runId}/cancel?triggeredBy=MANUAL_SUPER_ADMIN_CANCEL`);
      setSuccess('Execucao marcada para cancelamento. O dispatcher vai encerrar a rodada atual assim que atingir um ponto seguro.');
      await Promise.all([loadJobs(), loadMonitor()]);
    } catch (err: any) {
      setError(err?.message || 'Falha ao cancelar execucao');
    } finally {
      setStoppingRunId(null);
    }
  };

  const restartRun = async (runId: string) => {
    setRestartingRunId(runId);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/v1/super-admin/catalog/crawler/runs/${runId}/restart?triggeredBy=MANUAL_SUPER_ADMIN_RESTART`);
      setSuccess('Reexecucao enfileirada com os mesmos providers do run selecionado.');
      await Promise.all([loadJobs(), loadMonitor()]);
    } catch (err: any) {
      setError(err?.message || 'Falha ao reiniciar execucao');
    } finally {
      setRestartingRunId(null);
    }
  };

  const canStopRun = (run: CrawlerRun) => {
    const status = (run.status || '').toUpperCase();
    return status === 'QUEUED' || status === 'RUNNING';
  };

  const canRestartRun = (run: CrawlerRun) => Array.isArray(run.sources) && run.sources.length === 1;

  return (
    <SuperAdminLayout>
      <div className="super-admin-page">
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Crawler Python</span>
            <h1 className="analytics-hero-title">Execucao manual por mercado</h1>
            <p className="analytics-hero-text">
              O painel agora roda somente execucoes manuais, uma por vez. Cada supermercado dispara um pipeline fixo, sem seeds editaveis e sem agendamento automatico.
            </p>
          </div>
          <div className="analytics-hero-board single-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">Ultima execucao global</span>
              <h3>{latestRun ? formatStatus(latestRun.status) : 'Sem historico'}</h3>
              <strong>{formatDate(latestRun?.finishedAt || latestRun?.startedAt || latestRun?.requestedAt)}</strong>
              <p>{latestRun?.message || 'Nenhuma execucao registrada ate o momento.'}</p>
            </div>
          </div>
        </section>

        {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}
        {success ? <div className="card" style={{ color: 'var(--success)' }}>{success}</div> : null}

        <section className="metrics-grid analytics-metrics-grid">
          <div className="card">
            <span className="section-kicker">Mercados suportados</span>
            <h3>{jobs.length}</h3>
            <p>scripts fixos disponiveis no worker.</p>
          </div>
          <div className="card">
            <span className="section-kicker">Fila</span>
            <h3>{monitor.queuedRuns || 0}</h3>
            <p>execucoes aguardando processamento.</p>
          </div>
          <div className="card">
            <span className="section-kicker">Executando</span>
            <h3>{activeJobs || monitor.runningRuns || 0}</h3>
            <p>execucao manual em andamento no dispatcher.</p>
          </div>
          <div className="card">
            <span className="section-kicker">Importados (12 ultimas)</span>
            <h3>{totalImportedRecent}</h3>
            <p>produtos injetados recentemente no catalogo global.</p>
          </div>
        </section>

        <section className="analytics-panel reveal">
          <div className="panel-empty" style={{ textAlign: 'left' }}>
            Nao ha mais execucao automatica nem rodada global. O dispatcher apenas consome runs manuais da fila e rejeita execucoes com mais de um supermercado.
          </div>
        </section>

        {loading ? (
          <div className="card">Carregando painel...</div>
        ) : (
          <>
            <section className="super-admin-crawler-job-grid">
              {jobs.map((job) => (
                <article className="card super-admin-crawler-job-card" key={job.provider}>
                  <div className="super-admin-crawler-job-head">
                    <div>
                      <span className="section-kicker">{job.scopeLabel || 'Catalogo completo'}</span>
                      <h3>{job.name}</h3>
                    </div>
                    <span className={`status-pill ${job.enabled === false ? 'neutral' : runStatusClass(job.lastRun?.status)}`}>
                      {job.enabled === false ? 'Desabilitado' : formatStatus(job.lastRun?.status)}
                    </span>
                  </div>

                  <div className="super-admin-crawler-job-meta">
                    <span className="pill secondary">{job.provider}</span>
                    <span className="pill secondary">{job.extractorType}</span>
                    <span className="pill secondary">{job.scriptName}</span>
                    {job.downloadsImages ? <span className="pill secondary">Imagens locais</span> : null}
                    {job.includesMedication ? <span className="pill secondary">Inclui medicamentos</span> : null}
                  </div>

                  <p className="super-admin-crawler-job-text">{job.description}</p>
                  {job.enabled === false ? (
                    <div className="panel-empty" style={{ textAlign: 'left' }}>
                      Execucao temporariamente desabilitada. O historico e os dados ja coletados continuam preservados.
                    </div>
                  ) : null}

                  <div className="super-admin-crawler-job-stats">
                    <div>
                      <span className="section-kicker">Ultimo fechamento</span>
                      <strong>{formatDate(job.lastRun?.finishedAt || job.lastRun?.startedAt || job.lastRun?.requestedAt)}</strong>
                    </div>
                    <div>
                      <span className="section-kicker">Importados</span>
                      <strong>{Number(job.lastRun?.importedProducts || 0)} / {Number(job.lastRun?.scannedProducts || 0)}</strong>
                    </div>
                    <div>
                      <span className="section-kicker">Fila local</span>
                      <strong>{Number(job.queuedRuns || 0)} na fila, {Number(job.runningRuns || 0)} executando</strong>
                    </div>
                  </div>

                  <div className="super-admin-crawler-job-footer">
                    <div className="super-admin-crawler-job-license">{job.sourceLicense || '--'}</div>
                    <div className="crawler-run-actions">
                      {job.lastRun?.id ? (
                        <Link className="button secondary" to={`/super-admin/crawler/runs/${job.lastRun.id}`}>
                          Ver detalhes
                        </Link>
                      ) : null}
                      <Button onClick={() => triggerProvider(job.provider)} disabled={job.enabled === false || triggeringProvider === job.provider || hasActiveRun}>
                        {triggeringProvider === job.provider ? 'Enfileirando...' : hasActiveRun ? 'Aguarde o run atual' : `Executar ${job.name}`}
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <section className="analytics-panel reveal">
              <div className="analytics-panel-head">
                <div>
                  <span className="section-kicker">Historico</span>
                  <h3>Ultimas execucoes do dispatcher</h3>
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
                        <th>Providers</th>
                        <th>Importados</th>
                        <th>Erros</th>
                        <th>Mensagem</th>
                        <th>Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitor.recentRuns.map((run) => (
                        <tr key={run.id}>
                          <td data-label="Status"><span className={`status-pill ${runStatusClass(run.status)}`}>{formatStatus(run.status)}</span></td>
                          <td data-label="Solicitado">{formatDate(run.requestedAt)}</td>
                          <td data-label="Finalizado">{formatDate(run.finishedAt || run.startedAt)}</td>
                          <td data-label="Providers">{(run.sources || []).join(', ') || '--'}</td>
                          <td data-label="Importados">{Number(run.importedProducts || 0)} / {Number(run.scannedProducts || 0)}</td>
                          <td data-label="Erros">{Number(run.errors || 0)}</td>
                          <td data-label="Mensagem">{run.message || '--'}</td>
                          <td data-label="Acoes" className="table-action-cell">
                            <div className="crawler-run-actions">
                              <Link className="button secondary" to={`/super-admin/crawler/runs/${run.id}`}>
                                Detalhes
                              </Link>
                              <Button
                                variant="secondary"
                                onClick={() => stopRun(run.id)}
                                disabled={!canStopRun(run) || stoppingRunId === run.id || restartingRunId === run.id}
                              >
                                {stoppingRunId === run.id ? 'Parando...' : 'Parar'}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => restartRun(run.id)}
                                disabled={!canRestartRun(run) || restartingRunId === run.id || stoppingRunId === run.id || hasActiveRun}
                              >
                                {restartingRunId === run.id ? 'Reiniciando...' : canRestartRun(run) ? 'Reiniciar' : 'Somente 1 provider'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminCrawlerConfig;
