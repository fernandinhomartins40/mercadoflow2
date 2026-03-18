import React, { useEffect, useMemo, useState } from 'react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import Button from '../components/common/Button';
import ButtonLink from '../components/common/ButtonLink';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHero from '../components/dashboard/PageHero';
import PanelSection from '../components/dashboard/PanelSection';
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
  selectedCategories?: string[] | null;
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

interface CrawlerCategoryOption {
  value: string;
  label: string;
  childrenCount?: number | null;
}

const formatDate = (value?: string | null) => {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ?'--' : parsed.toLocaleString('pt-BR');
};

const formatStatus = (value?: string | null) => {
  const status = (value || '').toUpperCase();
  if (status === 'RUNNING') return 'Executando';
  if (status === 'QUEUED') return 'Na fila';
  if (status === 'SUCCESS') return 'Concluído';
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

const formatJobLoad = (job: CrawlerJob) => {
  const queued = Number(job.queuedRuns || 0);
  const running = Number(job.runningRuns || 0);
  if (running > 0) return `${running} em execução`;
  if (queued > 0) return `${queued} na fila`;
  return 'Sem fila local';
};

const formatJobResult = (run?: CrawlerRun | null) => {
  const imported = Number(run?.importedProducts || 0);
  const scanned = Number(run?.scannedProducts || 0);
  const errors = Number(run?.errors || 0);
  if (!run) return 'Sem histórico';
  if (errors > 0) return `${imported}/${scanned} | ${errors} erros`;
  return `${imported}/${scanned}`;
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
  const [categoryJob, setCategoryJob] = useState<CrawlerJob | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<CrawlerCategoryOption[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [categoriesLoading, setCategoriesLoading] = useState(false);
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
  const filteredCategoryOptions = useMemo(() => {
    const search = categorySearch.trim().toLowerCase();
    if (!search) return categoryOptions;
    return categoryOptions.filter((option) => `${option.label} ${option.value}`.toLowerCase().includes(search));
  }, [categoryOptions, categorySearch]);

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
      setError(err?.message || 'Falha ao carregar o painel do crawler');
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

  const closeCategoryModal = () => {
    setCategoryJob(null);
    setCategoryOptions([]);
    setSelectedCategories([]);
    setCategorySearch('');
    setCategoriesLoading(false);
  };

  const triggerProvider = async (provider: string, categories: string[] = []) => {
    setTriggeringProvider(provider);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/v1/super-admin/catalog/crawler/jobs/${provider}/trigger?triggeredBy=MANUAL_SUPER_ADMIN`, {
        triggeredBy: 'MANUAL_SUPER_ADMIN',
        selectedCategories: categories,
      });
      setSuccess(
        categories.length > 0
          ?`Execução manual enfileirada para ${provider} com ${categories.length} categorias selecionadas.`
          : `Execução manual enfileirada para ${provider} com catálogo completo.`
      );
      closeCategoryModal();
      await Promise.all([loadJobs(), loadMonitor()]);
    } catch (err: any) {
      setError(err?.message || `Falha ao enfileirar a execução de ${provider}`);
    } finally {
      setTriggeringProvider(null);
    }
  };

  const prepareProviderTrigger = async (job: CrawlerJob) => {
    setError(null);
    setSuccess(null);
    setCategoryJob(job);
    setCategoryOptions([]);
    setSelectedCategories([]);
    setCategorySearch('');
    setCategoriesLoading(true);
    try {
      const response = await api.get(`/v1/super-admin/catalog/crawler/jobs/${job.provider}/categories`);
      const options = Array.isArray(response.data) ?response.data : [];
      if (options.length === 0) {
        closeCategoryModal();
        await triggerProvider(job.provider, []);
        return;
      }
      setCategoryOptions(options);
      setSelectedCategories([]);
    } catch (err: any) {
      closeCategoryModal();
      setError(err?.message || `Falha ao carregar as categorias de ${job.provider}`);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const toggleSelectedCategory = (value: string) => {
    setSelectedCategories((current) =>
      current.includes(value) ?current.filter((item) => item !== value) : [...current, value]
    );
  };

  const selectVisibleCategories = () => {
    setSelectedCategories((current) => {
      const next = new Set(current);
      filteredCategoryOptions.forEach((option) => next.add(option.value));
      return Array.from(next);
    });
  };

  const clearCategorySelection = () => {
    setSelectedCategories([]);
  };

  const stopRun = async (runId: string) => {
    setStoppingRunId(runId);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/v1/super-admin/catalog/crawler/runs/${runId}/cancel?triggeredBy=MANUAL_SUPER_ADMIN_CANCEL`);
      setSuccess('Execução marcada para cancelamento. O dispatcher vai encerrar a rodada atual quando chegar a um ponto seguro.');
      await Promise.all([loadJobs(), loadMonitor()]);
    } catch (err: any) {
      setError(err?.message || 'Falha ao cancelar a execução');
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
      setSuccess('Nova execução enfileirada com o mesmo mercado do run selecionado.');
      await Promise.all([loadJobs(), loadMonitor()]);
    } catch (err: any) {
      setError(err?.message || 'Falha ao reiniciar a execução');
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
      <div className="page super-admin-page super-admin-crawler-page">
        <PageHero
          badge="Crawler"
          title="Coleta manual por mercado."
          description="Aqui você acompanha o estado atual, o último resultado e dispara uma nova coleta quando precisar."
          actions={latestRun?.id ?<ButtonLink variant="secondary" to={`/super-admin/crawler/runs/${latestRun.id}`}>Ver último run</ButtonLink> : null}
          feature={
            <div className="dashboard-glow-card">
              <span className="section-kicker">Run mais recente</span>
              <h3>{latestRun ?formatStatus(latestRun.status) : 'Sem histórico'}</h3>
              <strong>{formatDate(latestRun?.finishedAt || latestRun?.startedAt || latestRun?.requestedAt)}</strong>
              <p>{latestRun?.message || 'Nenhuma execução registrada até agora.'}</p>
            </div>
          }
        />

        {error ? <PanelSection reveal={false} className="text-[color:var(--danger)]">{error}</PanelSection> : null}
        {success ? <PanelSection reveal={false} className="text-[color:var(--success)]">{success}</PanelSection> : null}

        <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <MetricsCard title="Mercados suportados" value={jobs.length} icon="MK" />
          <MetricsCard title="Em execução" value={activeJobs || monitor.runningRuns || 0} icon="RUN" />
          <MetricsCard title="Importados recentes" value={totalImportedRecent} icon="IMP" />
        </div>
        <div className="page-slab-grid">
          <PanelSection className="dashboard-note-card" kicker="Fluxo" title="Executar, revisar e seguir">
            <div className="dashboard-quick-list">
              <div className="dashboard-quick-item">
                <strong>1. Escolha um mercado</strong>
                <span>Rode apenas o mercado necessário.</span>
              </div>
              <div className="dashboard-quick-item">
                <strong>2. Revise o último resultado</strong>
                <span>Confira importados, erros e detalhes antes de partir para o próximo mercado.</span>
              </div>
            </div>
          </PanelSection>
        </div>

        {loading ?(
          <PanelSection reveal={false}>Carregando painel...</PanelSection>
        ) : (
          <>
            <section className="super-admin-crawler-job-grid">
              {jobs.map((job) => (
                <article className="card super-admin-crawler-job-card" key={job.provider}>
                  <div className="super-admin-crawler-job-head">
                    <div>
                      <span className="section-kicker">{job.scopeLabel || 'Catálogo completo'}</span>
                      <h3>{job.name}</h3>
                    </div>
                    <span className={`status-pill ${job.enabled === false ?'neutral' : runStatusClass(job.lastRun?.status)}`}>
                      {job.enabled === false ?'Desabilitado' : formatStatus(job.lastRun?.status)}
                    </span>
                  </div>

                  <div className="super-admin-crawler-job-meta">
                    <span className="pill secondary">{job.provider}</span>
                    {Number(job.runningRuns || 0) > 0 || Number(job.queuedRuns || 0) > 0 ?(
                      <span className="pill secondary">{formatJobLoad(job)}</span>
                    ) : null}
                  </div>

                  {job.enabled === false ?(
                    <div className="panel-empty" style={{ textAlign: 'left' }}>
                      Execução temporariamente desabilitada.
                    </div>
                  ) : null}

                  <div className="super-admin-crawler-job-stats">
                    <div>
                      <span className="section-kicker">Última rodada</span>
                      <strong>{formatDate(job.lastRun?.finishedAt || job.lastRun?.startedAt || job.lastRun?.requestedAt)}</strong>
                    </div>
                    <div>
                      <span className="section-kicker">Resultado</span>
                      <strong>{formatJobResult(job.lastRun)}</strong>
                    </div>
                  </div>

                  <div className="super-admin-crawler-job-footer">
                    <div className="crawler-run-actions">
                      {job.lastRun?.id ?(
                        <ButtonLink variant="secondary" to={`/super-admin/crawler/runs/${job.lastRun.id}`}>
                          Ver detalhes
                        </ButtonLink>
                      ) : null}
                      <Button
                        onClick={() => prepareProviderTrigger(job)}
                        disabled={job.enabled === false || triggeringProvider === job.provider || hasActiveRun}
                      >
                        {triggeringProvider === job.provider ?'Enfileirando...' : hasActiveRun ?'Aguarde a execução atual' : `Executar ${job.name}`}
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <PanelSection kicker="Histórico" title="Últimas execuções">
              {monitor.recentRuns.length === 0 ?(
                <div className="panel-empty">Nenhuma execução registrada até agora.</div>
              ) : (
                <div className="catalog-admin-table-wrap">
                  <table className="table catalog-admin-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Solicitado</th>
                        <th>Finalizado</th>
                        <th>Mercados</th>
                        <th>Importados</th>
                        <th>Erros</th>
                        <th>Mensagem</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitor.recentRuns.map((run) => (
                        <tr key={run.id}>
                          <td data-label="Status"><span className={`status-pill ${runStatusClass(run.status)}`}>{formatStatus(run.status)}</span></td>
                          <td data-label="Solicitado">{formatDate(run.requestedAt)}</td>
                          <td data-label="Finalizado">{formatDate(run.finishedAt || run.startedAt)}</td>
                          <td data-label="Mercados">
                            {(run.sources || []).join(', ') || '--'}
                            <div className="table-subtext">
                              {run.selectedCategories && run.selectedCategories.length > 0
                                ?`Categorias: ${run.selectedCategories.slice(0, 3).join(', ')}${run.selectedCategories.length > 3 ?` +${run.selectedCategories.length - 3}` : ''}`
                                : 'Categorias: catálogo completo'}
                            </div>
                          </td>
                          <td data-label="Importados">{Number(run.importedProducts || 0)} / {Number(run.scannedProducts || 0)}</td>
                          <td data-label="Erros">{Number(run.errors || 0)}</td>
                          <td data-label="Mensagem">{run.message || '--'}</td>
                          <td data-label="Ações" className="table-action-cell">
                            <div className="crawler-run-actions">
                              <ButtonLink variant="secondary" to={`/super-admin/crawler/runs/${run.id}`}>
                                Detalhes
                              </ButtonLink>
                              <Button
                                variant="secondary"
                                onClick={() => stopRun(run.id)}
                                disabled={!canStopRun(run) || stoppingRunId === run.id || restartingRunId === run.id}
                              >
                                {stoppingRunId === run.id ?'Parando...' : 'Parar'}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => restartRun(run.id)}
                                disabled={!canRestartRun(run) || restartingRunId === run.id || stoppingRunId === run.id || hasActiveRun}
                              >
                                {restartingRunId === run.id ?'Reiniciando...' : canRestartRun(run) ?'Reiniciar' : 'Somente 1 mercado'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PanelSection>
          </>
        )}

        {categoryJob ?(
          <div className="catalog-admin-modal-backdrop" role="presentation" onClick={closeCategoryModal}>
            <div
              className="catalog-admin-modal card crawler-category-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="crawler-category-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="catalog-admin-modal-head">
                <div>
                  <span className="section-kicker">{categoryJob.provider}</span>
                  <h3 id="crawler-category-modal-title">Selecionar categorias de {categoryJob.name}</h3>
                  <p className="super-admin-crawler-job-text">
                    Escolha apenas as categorias que devem ser capturadas neste run. Se nenhuma categoria ficar marcada, o crawler roda o catálogo inteiro do supermercado.
                  </p>
                </div>
                <Button variant="secondary" onClick={closeCategoryModal} disabled={triggeringProvider === categoryJob.provider}>
                  Fechar
                </Button>
              </div>

              {categoriesLoading ?(
                <div className="panel-empty">Carregando categorias disponíveis...</div>
              ) : (
                <>
                  <div className="crawler-category-toolbar">
                    <label className="crawler-category-search">
                      <span className="section-kicker">Buscar categoria</span>
                      <input
                        className="input"
                        type="text"
                        value={categorySearch}
                        onChange={(event) => setCategorySearch(event.target.value)}
                        placeholder="Ex.: bebidas, higiene, mercearia"
                      />
                    </label>
                    <div className="crawler-category-toolbar-actions">
                      <Button variant="secondary" onClick={selectVisibleCategories}>
                        Selecionar visíveis
                      </Button>
                      <Button variant="secondary" onClick={clearCategorySelection}>
                        Limpar tudo
                      </Button>
                    </div>
                  </div>

                  <div className="crawler-category-summary">
                    <span>{selectedCategories.length} categorias selecionadas</span>
                    <span>{filteredCategoryOptions.length} categorias exibidas</span>
                  </div>

                  {filteredCategoryOptions.length === 0 ?(
                    <div className="panel-empty">Nenhuma categoria encontrada para o filtro informado.</div>
                  ) : (
                    <div className="crawler-category-grid">
                      {filteredCategoryOptions.map((option) => {
                        const checked = selectedCategories.includes(option.value);
                        return (
                          <label className={`crawler-category-option ${checked ?'selected' : ''}`} key={option.value}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelectedCategory(option.value)}
                            />
                            <div>
                              <strong>{option.label}</strong>
                              <span>
                                {Number(option.childrenCount || 0) > 0
                                  ?`${Number(option.childrenCount || 0)} subcategorias diretas`
                                  : 'Categoria final'}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <div className="crawler-category-footer">
                    <div className="super-admin-crawler-job-license">
                      {selectedCategories.length > 0
                        ?'O run será filtrado por estas categorias.'
                        : 'Sem seleção o run captura o catálogo completo.'}
                    </div>
                    <div className="crawler-run-actions">
                      <Button variant="secondary" onClick={closeCategoryModal} disabled={triggeringProvider === categoryJob.provider}>
                        Cancelar
                      </Button>
                      <Button
                        onClick={() => triggerProvider(categoryJob.provider, selectedCategories)}
                        disabled={triggeringProvider === categoryJob.provider}
                      >
                        {triggeringProvider === categoryJob.provider
                          ?'Enfileirando...'
                          : selectedCategories.length > 0
                            ?`Executar ${selectedCategories.length} categorias`
                            : 'Executar catálogo completo'}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminCrawlerConfig;
