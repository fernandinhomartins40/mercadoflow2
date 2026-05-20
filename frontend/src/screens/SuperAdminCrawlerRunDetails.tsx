import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  updatedAt?: string | null;
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

interface CrawlerCheckpoint {
  id: string;
  provider?: string | null;
  scopeType?: string | null;
  scopeKey?: string | null;
  status?: string | null;
  itemCount?: number | null;
  errorMessage?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, any> | null;
}

interface CrawlerRunDetails {
  run: CrawlerRun;
  active: boolean;
  logText?: string | null;
  logPath?: string | null;
  resultPath?: string | null;
  progressPath?: string | null;
  heartbeatAt?: string | null;
  logUpdatedAt?: string | null;
  logSizeBytes?: number | null;
  durationSeconds?: number | null;
  capturedPerMinute?: number | null;
  importedPerMinute?: number | null;
  canResumeFromCheckpoint?: boolean | null;
  continueHint?: string | null;
  recordsOffset: number;
  recordsLimit: number;
  recordsTotal: number;
  liveProgress?: Record<string, any> | null;
  checkpointStatusCounts?: Record<string, number> | null;
  summary: Record<string, any>[];
  manifests: Record<string, any>[];
  records: Record<string, any>[];
  errorHighlights: string[];
  recentCheckpoints: CrawlerCheckpoint[];
  recentFailedCheckpoints: CrawlerCheckpoint[];
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
  if (status === 'CANCELLED') return 'neutral';
  return 'neutral';
};

const formatNumber = (value?: number | null) => new Intl.NumberFormat('pt-BR').format(Number(value || 0));

const formatRate = (value?: number | null) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '--';
  return `${formatNumber(Math.round(numeric))}/min`;
};

const formatBytes = (value?: number | null) => {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '--';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const formatDuration = (value?: number | null) => {
  const seconds = Math.max(0, Math.round(Number(value || 0)));
  if (seconds <= 0) return '--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
  return `${remainingSeconds}s`;
};

const detailValue = (value: any) => {
  if (value == null || value === '') return '--';
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || '--';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const statusCountEntries = (counts?: Record<string, number> | null) =>
  Object.entries(counts || {}).filter(([, value]) => Number(value || 0) > 0);

const SuperAdminCrawlerRunDetails: React.FC = () => {
  const { runId = '' } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState<CrawlerRunDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [autoLive, setAutoLive] = useState(true);
  const [resuming, setResuming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const limit = 50;

  const load = async (currentOffset: number, background = false) => {
    if (!runId) return;
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const response = await api.get(`/v1/super-admin/catalog/crawler/runs/${runId}/details`, {
        params: { offset: currentOffset, limit },
      });
      setDetails(response.data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar os detalhes da execucao');
    } finally {
      if (background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setOffset(0);
    setDetails(null);
    setError(null);
    setSuccess(null);
  }, [runId]);

  useEffect(() => {
    load(offset).catch(() => null);
  }, [runId, offset]);

  useEffect(() => {
    if (!autoLive || !runId) return;
    const intervalMs = details?.active ? 2500 : 7000;
    const handle = window.setInterval(() => {
      load(offset, true).catch(() => null);
    }, intervalMs);
    return () => window.clearInterval(handle);
  }, [autoLive, details?.active, offset, runId]);

  const canGoPrev = offset > 0;
  const canGoNext = useMemo(() => {
    if (!details) return false;
    return offset + limit < Number(details.recordsTotal || 0);
  }, [details, offset]);

  const checkpointCounts = statusCountEntries(details?.checkpointStatusCounts);
  const liveStage = detailValue(details?.liveProgress?.stage);
  const livePending = Number(details?.liveProgress?.pendingCount || 0);
  const liveCaptured = Number(details?.liveProgress?.capturedProducts || details?.run?.scannedProducts || 0);
  const liveImported = Number(details?.liveProgress?.importedProducts || details?.run?.importedProducts || 0);
  const liveErrors = Number(details?.liveProgress?.errors || details?.run?.errors || 0);
  const canCancel = Boolean(details?.active);
  const canResume = Boolean(details?.canResumeFromCheckpoint);

  const metrics = details
    ? [
        { title: 'Captados', value: formatNumber(details.run.scannedProducts), icon: 'PD', caption: 'itens ja varridos' },
        { title: 'Importados', value: formatNumber(details.run.importedProducts), icon: 'EXE', variant: 'warning' as const, caption: 'enviados ao catalogo global' },
        { title: 'Erros', value: formatNumber(details.run.errors), icon: 'AT', variant: 'danger' as const, caption: 'falhas acumuladas nesta rodada' },
        { title: 'Ritmo', value: formatRate(details.importedPerMinute || details.capturedPerMinute), icon: 'PX', caption: 'throughput atual estimado' },
      ]
    : [];

  const refreshLabel = loading ? 'Atualizando...' : refreshing ? 'Sincronizando...' : 'Atualizar';

  const handleCancel = async () => {
    if (!details?.run?.id) return;
    setCancelling(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/v1/super-admin/catalog/crawler/runs/${details.run.id}/cancel?triggeredBy=MANUAL_SUPER_ADMIN_CANCEL`);
      setSuccess('Execucao marcada para cancelamento. O dispatcher vai encerrar a rodada no proximo ponto seguro.');
      await load(offset, true);
    } catch (err: any) {
      setError(err?.message || 'Falha ao solicitar o cancelamento da execucao');
    } finally {
      setCancelling(false);
    }
  };

  const handleResume = async () => {
    if (!details?.run?.id) return;
    if (!window.confirm('Criar uma nova rodada retomando os checkpoints completos deste run?')) return;
    setResuming(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await api.post(`/v1/super-admin/catalog/crawler/runs/${details.run.id}/resume?triggeredBy=MANUAL_SUPER_ADMIN_RESUME`);
      const nextRunId = response.data?.id;
      if (nextRunId) {
        navigate(`/super-admin/crawler/runs/${nextRunId}`);
        return;
      }
      setSuccess('Nova rodada enfileirada para retomar os checkpoints completos.');
      await load(offset, true);
    } catch (err: any) {
      setError(err?.message || 'Falha ao retomar a execucao a partir do checkpoint');
    } finally {
      setResuming(false);
    }
  };

  return (
    <SuperAdminLayout>
      <div className="page super-admin-page">
        <PageHero
          badge="Detalhes da coleta"
          title="Painel operacional da execucao"
          description="Acompanhe logs, throughput, checkpoints e artefatos deste run em tempo quase real. Quando houver falha, a retomada pode criar uma nova rodada aproveitando o progresso salvo."
          actions={
            <>
              <ButtonLink variant="secondary" to="/super-admin/crawler">Voltar ao crawler</ButtonLink>
              <Button variant="secondary" onClick={() => setAutoLive((current) => !current)}>
                {autoLive ? 'Ao vivo ligado' : 'Ao vivo pausado'}
              </Button>
              <Button variant="secondary" onClick={() => load(offset)} disabled={loading || resuming || cancelling}>
                {refreshLabel}
              </Button>
              <Button variant="secondary" onClick={handleCancel} disabled={!canCancel || cancelling || resuming}>
                {cancelling ? 'Cancelando...' : 'Parar execucao'}
              </Button>
              <Button onClick={handleResume} disabled={!canResume || resuming || cancelling || details?.active}>
                {resuming ? 'Retomando...' : 'Continuar do erro'}
              </Button>
            </>
          }
          feature={
            <>
              <article className="dashboard-glow-card">
                <span className="section-kicker">Status da rodada</span>
                <strong>{details?.run ? formatStatus(details.run.status) : 'Carregando'}</strong>
                <p>{details?.run?.message || 'Sem mensagem operacional registrada no momento.'}</p>
              </article>
              <div className="dashboard-command-mosaic">
                <article className="dashboard-mini-tile">
                  <span>Heartbeat</span>
                  <strong>{formatDate(details?.heartbeatAt || details?.run?.updatedAt)}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Ritmo</span>
                  <strong>{formatRate(details?.importedPerMinute || details?.capturedPerMinute)}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Worker</span>
                  <strong>{details?.run?.triggeredBy || '--'}</strong>
                </article>
              </div>
            </>
          }
        />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-green-600">{success}</p> : null}
        {loading && !details ? <p className="text-sm text-slate-400">Carregando detalhes do run...</p> : null}

        {details ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <MetricsCard
                  key={metric.title}
                  title={metric.title}
                  value={metric.value}
                  icon={metric.icon}
                  variant={metric.variant}
                  caption={metric.caption}
                />
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <PanelSection kicker="Contexto da rodada" title="Escopo e sincronizacao">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <span className="text-sm text-slate-500">Status</span>
                    <strong><span className={`status-pill ${runStatusClass(details.run.status)}`}>{formatStatus(details.run.status)}</span></strong>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <span className="text-sm text-slate-500">Solicitado</span>
                    <strong className="text-sm font-semibold text-slate-900">{formatDate(details.run.requestedAt)}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <span className="text-sm text-slate-500">Iniciado</span>
                    <strong className="text-sm font-semibold text-slate-900">{formatDate(details.run.startedAt)}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <span className="text-sm text-slate-500">Finalizado</span>
                    <strong className="text-sm font-semibold text-slate-900">{formatDate(details.run.finishedAt)}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <span className="text-sm text-slate-500">Mercado</span>
                    <strong className="text-sm font-semibold text-slate-900">{(details.run.sources || []).join(', ') || '--'}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <span className="text-sm text-slate-500">Categorias</span>
                    <strong className="text-sm font-semibold text-slate-900">{details.run.selectedCategories && details.run.selectedCategories.length > 0 ? details.run.selectedCategories.join(', ') : 'Catalogo completo'}</strong>
                  </div>
                </div>
              </PanelSection>

              <PanelSection kicker="Telemetria ao vivo" title="Progresso parcial do dispatcher">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <span className="text-sm text-slate-500">Etapa</span>
                    <strong className="text-sm font-semibold text-slate-900">{liveStage}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <span className="text-sm text-slate-500">Heartbeat</span>
                    <strong className="text-sm font-semibold text-slate-900">{formatDate(details.heartbeatAt || details.run.updatedAt)}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <span className="text-sm text-slate-500">Duracao</span>
                    <strong className="text-sm font-semibold text-slate-900">{formatDuration(details.durationSeconds)}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <span className="text-sm text-slate-500">Pendentes no lote</span>
                    <strong className="text-sm font-semibold text-slate-900">{formatNumber(livePending)}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <span className="text-sm text-slate-500">Arquivos ao vivo</span>
                    <strong className="text-sm font-semibold text-slate-900">{details.progressPath || '--'}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <span className="text-sm text-slate-500">Tail do log</span>
                    <strong className="text-sm font-semibold text-slate-900">{formatBytes(details.logSizeBytes)}</strong>
                  </div>
                </div>
              </PanelSection>
            </div>

            <PanelSection kicker="Retomada" title="Continuar a partir do erro">
              <div className="crawler-run-action-grid">
                <article className="card crawler-run-checkpoint-card">
                  <span className="section-kicker">Continuar do erro</span>
                  <h3>Nova rodada com checkpoint</h3>
                  <p>{details.continueHint || 'Quando houver progresso salvo, a retomada cria um novo run e evita revarrer escopos concluidos.'}</p>
                  <div className="crawler-run-actions">
                    <Button onClick={handleResume} disabled={!canResume || resuming || details.active}>
                      {resuming ? 'Retomando...' : 'Criar retomada'}
                    </Button>
                  </div>
                </article>
                <article className="card crawler-run-checkpoint-card">
                  <span className="section-kicker">Recuperacao operacional</span>
                  <h3>O que olhar antes de retomar</h3>
                  <div className="crawler-run-checkpoint-list">
                    <div className="crawler-run-checkpoint-item">
                      <strong>Log vivo</strong>
                      <span>Use os destaques de erro abaixo para identificar timeout, 5xx ou queda do backend.</span>
                    </div>
                    <div className="crawler-run-checkpoint-item">
                      <strong>Checkpoints falhos</strong>
                      <span>Os escopos com status FAILED indicam exatamente onde a coleta parou ou precisou repetir.</span>
                    </div>
                    <div className="crawler-run-checkpoint-item">
                      <strong>Heartbeat</strong>
                      <span>Se o heartbeat parar de evoluir, o worker travou ou o site externo deixou de responder.</span>
                    </div>
                  </div>
                </article>
              </div>
            </PanelSection>

            <PanelSection kicker="Checkpoints" title="Cobertura, falhas e progresso reaproveitavel">
              {checkpointCounts.length === 0 && details.recentCheckpoints.length === 0 ? (
                <div className="panel-empty">Nenhum checkpoint persistido para este run ate agora.</div>
              ) : (
                <>
                  <div className="crawler-run-checkpoint-grid">
                    {checkpointCounts.map(([status, value]) => (
                      <article className="card crawler-run-checkpoint-card" key={status}>
                        <span className="section-kicker">{status}</span>
                        <h3>{formatNumber(value)}</h3>
                        <p>escopos com este estado no run atual</p>
                      </article>
                    ))}
                  </div>

                  {details.recentFailedCheckpoints.length > 0 ? (
                    <div className="crawler-run-checkpoint-list">
                      {details.recentFailedCheckpoints.map((checkpoint) => (
                        <div className="crawler-run-checkpoint-item" key={checkpoint.id}>
                          <strong>{checkpoint.scopeType || '--'}: {checkpoint.scopeKey || '--'}</strong>
                          <span>{checkpoint.errorMessage || 'Falha sem mensagem detalhada.'}</span>
                          <span className="table-subtext">Atualizado em {formatDate(checkpoint.updatedAt)} | itens {formatNumber(checkpoint.itemCount)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </PanelSection>

            <PanelSection className="reveal" kicker="Manifestos" title="Arquivos gerados por mercado">
              <div className="crawler-run-manifest-grid">
                {details.manifests.map((manifest, index) => (
                  <article className="card crawler-run-detail-card" key={`${manifest.provider || 'provider'}-${index}`}>
                    <span className="section-kicker">{detailValue(manifest.provider)}</span>
                    <h3>{detailValue(manifest.source)}</h3>
                    <div className="crawler-run-detail-meta">
                      <span><strong>Total:</strong> {detailValue(manifest.count)}</span>
                      <span><strong>Capturados:</strong> {detailValue(manifest.capturedProducts)}</span>
                      <span><strong>Importados:</strong> {detailValue(manifest.importedProducts)}</span>
                      <span><strong>Imagens:</strong> {detailValue(manifest.imagesSaved)}</span>
                      <span><strong>Pendentes:</strong> {detailValue(manifest.pendingCount)}</span>
                    </div>
                    <p><strong>Manifesto:</strong> {detailValue(manifest.outputManifest)}</p>
                    <p><strong>Registros:</strong> {detailValue(manifest.recordsFile)}</p>
                  </article>
                ))}
              </div>
            </PanelSection>

            <PanelSection
              kicker="Produtos"
              title="Itens captados nesta execucao"
              action={
                <div className="crawler-run-pagination">
                  <span>
                    {Math.min(offset + 1, Number(details.recordsTotal || 0))}-
                    {Math.min(offset + limit, Number(details.recordsTotal || 0))} de {Number(details.recordsTotal || 0)}
                  </span>
                  <Button variant="secondary" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={!canGoPrev || loading}>Anterior</Button>
                  <Button variant="secondary" onClick={() => setOffset(offset + limit)} disabled={!canGoNext || loading}>Proximos</Button>
                </div>
              }
            >
              {details.records.length === 0 ? (
                <div className="panel-empty">Nenhum produto disponivel nos artefatos desta execucao ainda.</div>
              ) : (
                <div className="catalog-admin-table-wrap">
                  <table className="table catalog-admin-table">
                    <thead>
                      <tr>
                        <th>Imagem</th>
                        <th>GTIN</th>
                        <th>Nome</th>
                        <th>Marca</th>
                        <th>Categoria</th>
                        <th>Mercado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.records.map((record, index) => (
                        <tr key={`${record.provider || 'provider'}-${record.code || 'item'}-${index}`}>
                          <td data-label="Imagem">
                            {record.imageUrl ? (
                              <img className="catalog-admin-thumb" src={record.imageUrl} alt={record.name || record.code || 'Produto'} loading="lazy" />
                            ) : (
                              <span className="catalog-admin-thumb placeholder">Sem imagem</span>
                            )}
                          </td>
                          <td data-label="GTIN">{detailValue(record.code)}</td>
                          <td data-label="Nome">
                            <strong>{detailValue(record.name)}</strong>
                            <div className="table-subtext">{detailValue(record.sourceUrl)}</div>
                          </td>
                          <td data-label="Marca">{detailValue(record.brand)}</td>
                          <td data-label="Categoria">{detailValue(record.category)}</td>
                          <td data-label="Mercado">{detailValue(record.provider)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PanelSection>

            <PanelSection kicker="Logs" title="Tail vivo do dispatcher">
              <div className="crawler-run-log-meta">
                <span><strong>Log:</strong> {details.logPath || '--'}</span>
                <span><strong>Resultado:</strong> {details.resultPath || '--'}</span>
                <span><strong>Progresso:</strong> {details.progressPath || '--'}</span>
                <span><strong>Atualizado:</strong> {formatDate(details.logUpdatedAt || details.heartbeatAt)}</span>
              </div>

              {details.errorHighlights.length > 0 ? (
                <div className="crawler-run-checkpoint-list">
                  {details.errorHighlights.map((line, index) => (
                    <div className="crawler-run-checkpoint-item" key={`${line}-${index}`}>
                      <strong>Erro destacado</strong>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <pre className="crawler-run-log-viewer">{details.logText || 'Nenhum log salvo para esta execucao.'}</pre>

              <div className="crawler-run-checkpoint-list">
                <div className="crawler-run-checkpoint-item">
                  <strong>Progresso vivo</strong>
                  <span>capturados={formatNumber(liveCaptured)} | importados={formatNumber(liveImported)} | erros={formatNumber(liveErrors)} | pendentes={formatNumber(livePending)}</span>
                </div>
              </div>
            </PanelSection>
          </>
        ) : null}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminCrawlerRunDetails;
