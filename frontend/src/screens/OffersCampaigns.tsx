import React, { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Eye,
  ExternalLink,
  FileImage,
  Plus,
  RefreshCw,
  SendHorizontal,
  Trash2,
} from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import ButtonLink from '../components/common/ButtonLink';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHero from '../components/dashboard/PageHero';
import OffersStudioLayout from '../components/layout/OffersStudioLayout';
import OfferCanvasPreview from '../components/offers/OfferCanvasPreview';
import OfferProductImage from '../components/offers/OfferProductImage';
import { useOffersAppSession } from '../hooks/useOffersAppSession';
import { offersService } from '../services/offers.service';
import { OfferGenerationJob, OfferOverview, OfferTemplate } from '../types/offers.types';

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString('pt-BR') : 'Agora');

const parseJsonList = (value?: string | null, fallback: string[] = []) => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return fallback;
  }
};

const getCampaignState = (job: OfferGenerationJob) => {
  const normalized = String(job.status || '').toUpperCase();
  const readyOutputs = job.outputs?.filter((output) => String(output.status || '').toUpperCase() === 'READY').length || 0;
  const failedOutputs = job.outputs?.filter((output) => String(output.status || '').toUpperCase() === 'FAILED').length || 0;

  if (normalized === 'FAILED' || (failedOutputs > 0 && readyOutputs === 0)) {
    return { key: 'failed', label: 'Falhou', pillClass: 'negative' };
  }
  if (normalized === 'READY' || normalized === 'PARTIAL' || readyOutputs > 0) {
    return { key: 'published', label: normalized === 'PARTIAL' ? 'Publicado com alerta' : 'Publicado', pillClass: 'positive' };
  }
  if (normalized === 'PROCESSING' || normalized === 'QUEUED') {
    return { key: 'processing', label: 'Publicando', pillClass: 'soft' };
  }
  return { key: 'draft', label: 'Rascunho', pillClass: 'soft' };
};

const TemplateStarterCard: React.FC<{ template: OfferTemplate; onStart: () => void }> = ({ template, onStart }) => (
  <article className="app-panel flex h-full flex-col gap-4 p-4">
    <OfferCanvasPreview template={template} className="min-h-[210px]" />
    <div className="flex flex-1 flex-col gap-3">
      <div>
        <span className="section-kicker">{template.channel}</span>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[color:var(--text-primary)]">{template.name}</h3>
        <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">{template.description || 'Template pronto para encarte, cartaz e publicação multicanal.'}</p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
          {template.canvasWidth}x{template.canvasHeight}
        </div>
        <Button type="button" onClick={onStart}>
          <Plus size={16} strokeWidth={2.1} />
          Criar campanha
        </Button>
      </div>
    </div>
  </article>
);

const CampaignCard: React.FC<{
  job: OfferGenerationJob;
  busyAction: string | null;
  onEdit: () => void;
  onClone: () => void;
  onPublish: () => void;
  onDelete: () => void;
}> = ({ job, busyAction, onEdit, onClone, onPublish, onDelete }) => {
  const state = getCampaignState(job);
  const channels = parseJsonList(job.publishTargetsJson, ['DOWNLOAD']);
  const primaryOutput = job.outputs?.find((output) => output.fileUrl) || null;
  const readyOutputs = job.outputs?.filter((output) => String(output.status || '').toUpperCase() === 'READY').length || 0;

  return (
    <article className="app-panel flex h-full flex-col gap-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="section-kicker">{job.templateName || 'Template'}</span>
          <h3 className="mt-2 truncate text-2xl font-semibold tracking-[-0.04em] text-[color:var(--text-primary)]">{job.name}</h3>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-[color:var(--text-secondary)]">
            <span>{job.productCount} produtos</span>
            <span>{job.pageCount} pecas</span>
            <span>{job.generationMode === 'CATALOG' ? 'Encarte' : 'Pecas individuais'}</span>
            <span>Atualizado em {formatDate(job.updatedAt)}</span>
          </div>
        </div>
        <span className={`sales-pill ${state.pillClass}`}>{state.label}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {channels.map((channel) => (
          <span key={`${job.id}-${channel}`} className="sales-pill soft">{channel}</span>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="grid gap-2">
          {job.items.slice(0, 4).map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-white/84 px-3 py-2.5">
              <div className="h-12 w-12 overflow-hidden rounded-[14px] bg-[rgba(255,247,240,0.9)]">
                <OfferProductImage src={item.productImageUrl} alt={item.productName} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0">
                <strong className="block truncate text-sm text-[color:var(--text-primary)]">{item.productName}</strong>
                <small className="text-[color:var(--text-secondary)]">{item.productUnit || 'Unidade'} · slot {item.slotIndex ?? item.positionIndex}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-[22px] border border-[rgba(87,51,30,0.1)] bg-[rgba(255,247,240,0.82)] px-4 py-3 text-sm text-[color:var(--text-secondary)] md:min-w-[220px]">
          <span className="section-kicker">Arquivos</span>
          <strong className="mt-2 block text-2xl text-[color:var(--text-primary)]">{readyOutputs}</strong>
          <p className="mt-2 text-sm leading-6">
            {primaryOutput?.fileUrl ? 'A campanha ja tem pelo menos um arquivo pronto para abertura.' : 'Salve e publique quando quiser gerar os arquivos finais.'}
          </p>
          {primaryOutput?.fileUrl ? (
            <a
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-[rgba(87,51,30,0.1)] bg-white px-4 py-2 font-semibold text-[color:var(--text-primary)] no-underline"
              href={primaryOutput.fileUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} strokeWidth={2.1} />
              Abrir arquivo
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={onEdit}>
          <Eye size={16} strokeWidth={2.1} />
          Editar
        </Button>
        <Button type="button" variant="secondary" onClick={onClone} disabled={busyAction === `clone:${job.id}`}>
          <Copy size={16} strokeWidth={2.1} />
          {busyAction === `clone:${job.id}` ? 'Clonando...' : 'Clonar'}
        </Button>
        <Button type="button" onClick={onPublish} disabled={busyAction === `publish:${job.id}`}>
          <SendHorizontal size={16} strokeWidth={2.1} />
          {busyAction === `publish:${job.id}` ? 'Publicando...' : readyOutputs ? 'Publicar novamente' : 'Publicar'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDelete} disabled={busyAction === `delete:${job.id}`} className="ml-auto">
          <Trash2 size={16} strokeWidth={2.1} />
          {busyAction === `delete:${job.id}` ? 'Excluindo...' : 'Excluir'}
        </Button>
      </div>
    </article>
  );
};

const OffersCampaigns: React.FC = () => {
  const { buildUrl, isSuperAdminMode, marketId } = useOffersAppSession();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<OfferOverview | null>(null);
  const [jobs, setJobs] = useState<OfferGenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'draft' | 'published' | 'failed'>('all');

  if (isSuperAdminMode) {
    return <Navigate to={buildUrl('/ofertas')} replace />;
  }

  const loadData = async () => {
    if (!marketId) {
      setError('Mercado nao encontrado.');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [overviewData, jobsData] = await Promise.all([
        offersService.getOverview(marketId),
        offersService.getJobs(marketId),
      ]);
      setOverview(overviewData);
      setJobs(jobsData);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel carregar as campanhas de ofertas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [marketId]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const leadTemplate = useMemo<OfferTemplate | null>(() => overview?.templates?.[0] || null, [overview]);
  const templateStarters = useMemo(() => (overview?.templates || []).slice(0, 3), [overview?.templates]);
  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const state = getCampaignState(job);
      const matchesFilter = filter === 'all' ? true : state.key === filter;
      const matchesQuery = !normalizedQuery
        ? true
        : job.name.toLowerCase().includes(normalizedQuery)
          || job.templateName.toLowerCase().includes(normalizedQuery)
          || job.items.some((item) => item.productName.toLowerCase().includes(normalizedQuery));
      return matchesFilter && matchesQuery;
    });
  }, [filter, jobs, query]);

  const draftCount = useMemo(() => jobs.filter((job) => getCampaignState(job).key === 'draft').length, [jobs]);
  const publishedCount = useMemo(() => jobs.filter((job) => getCampaignState(job).key === 'published').length, [jobs]);
  const failedCount = useMemo(() => jobs.filter((job) => getCampaignState(job).key === 'failed').length, [jobs]);

  const openDesigner = (params?: { templateId?: string | null; jobId?: string | null }) => {
    const search = new URLSearchParams();
    if (params?.templateId) search.set('templateId', params.templateId);
    if (params?.jobId) search.set('jobId', params.jobId);
    navigate(buildUrl('/ofertas', search.toString()));
  };

  const handlePublish = async (job: OfferGenerationJob) => {
    if (!marketId) return;
    setBusyAction(`publish:${job.id}`);
    try {
      await offersService.publishJob(marketId, job.id, {
        variantKeys: [job.variantKey || 'default'],
        outputTypes: [job.outputType || 'PNG'],
        publishTargets: parseJsonList(job.publishTargetsJson, ['DOWNLOAD']),
        renderOptionsJson: job.renderOptionsJson || undefined,
      });
      setNotice('Campanha publicada e fila de arquivos atualizada.');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel publicar a campanha.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleClone = async (job: OfferGenerationJob) => {
    if (!marketId) return;
    setBusyAction(`clone:${job.id}`);
    try {
      const cloned = await offersService.cloneJob(marketId, job.id);
      setNotice('Campanha clonada.');
      await loadData();
      openDesigner({ jobId: cloned.id });
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel clonar a campanha.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (job: OfferGenerationJob) => {
    if (!marketId) return;
    if (!window.confirm(`Excluir a campanha "${job.name}"?`)) {
      return;
    }
    setBusyAction(`delete:${job.id}`);
    try {
      await offersService.deleteJob(marketId, job.id);
      setNotice('Campanha removida.');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel excluir a campanha.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <OffersStudioLayout>
      <div className="page analytics-page offers-page">
        {error ? <div className="sales-empty-card">{error}</div> : null}
        {!error && notice ? <div className="sales-empty-card">{notice}</div> : null}

        <PageHero
          badge="Campanhas de ofertas"
          title="Crie, publique e reaproveite campanhas sem sair do fluxo operacional."
          description="O painel admin agora trabalha com campanhas reais: template compartilhado, produtos do catalogo, publicacao multicanal e arquivos finais gerados pelo motor do modulo."
          actions={
            <>
              <Button type="button" onClick={() => openDesigner({ templateId: leadTemplate?.id })}>
                <Plus size={16} strokeWidth={2.1} />
                Abrir estúdio
              </Button>
              <ButtonLink variant="secondary" to={buildUrl('/ofertas/jobs')}>Arquivos</ButtonLink>
            </>
          }
          feature={
            <article className="dashboard-glow-card">
              <span className="section-kicker">Resumo operacional</span>
              <strong>{jobs.length}</strong>
              <p>{publishedCount} publicadas, {draftCount} em rascunho e {failedCount} com falha. O foco aqui passa a ser campanha, nao tela solta de editor.</p>
            </article>
          }
        />

        {loading ? <div className="sales-empty-card">Carregando campanhas...</div> : null}

        {!loading && overview ? (
          <>
            <div className="metrics-grid analytics-metrics-grid sales-metric-strip">
              <MetricsCard title="Campanhas" value={String(jobs.length)} icon="LT" caption="Historico recente da conta" />
              <MetricsCard title="Rascunhos" value={String(draftCount)} icon="MD" caption="Prontas para edicao ou publicacao" />
              <MetricsCard title="Publicadas" value={String(publishedCount)} icon="ON" caption="Com arquivo pronto ou saida valida" />
              <MetricsCard title="Modelos" value={String(overview.templatesCount)} icon="SG" caption="Templates disponiveis no estúdio" />
            </div>

            {templateStarters.length ? (
              <section className="sales-section reveal">
                <div className="sales-section-head">
                  <div>
                    <span className="section-kicker">Comecar rapido</span>
                    <h2>Escolha um template e abra a campanha no editor</h2>
                  </div>
                  <p>O super admin publica os templates base e o admin usa daqui para montar as campanhas da loja.</p>
                </div>
                <div className="grid gap-4 xl:grid-cols-3">
                  {templateStarters.map((template) => (
                    <TemplateStarterCard key={template.id} template={template} onStart={() => openDesigner({ templateId: template.id })} />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="sales-section reveal">
              <div className="sales-section-head">
                <div>
                  <span className="section-kicker">Minhas campanhas</span>
                  <h2>Edite, clone, publique e limpe a fila sem sair da listagem</h2>
                </div>
                <p>Esse fluxo aproxima o modulo do QR Ofertas: lista operacional primeiro, editor depois.</p>
              </div>

              <div className="app-panel p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <label className="offer-studio-text-field min-w-0 lg:min-w-[380px]">
                    <span>Buscar campanha</span>
                    <input
                      className="input"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Nome da campanha, template ou produto"
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'all', label: 'Todas' },
                      { value: 'draft', label: 'Rascunho' },
                      { value: 'published', label: 'Publicadas' },
                      { value: 'failed', label: 'Falhas' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFilter(option.value as typeof filter)}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${filter === option.value ? 'border-transparent bg-[color:var(--accent-primary)] text-white shadow-[0_14px_24px_rgba(255,106,0,0.22)]' : 'border-[rgba(87,51,30,0.1)] bg-white text-[color:var(--text-primary)]'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                    <Button type="button" variant="secondary" onClick={() => void loadData()}>
                      <RefreshCw size={16} strokeWidth={2.1} />
                      Atualizar
                    </Button>
                  </div>
                </div>
              </div>

              {!filteredJobs.length ? (
                <div className="sales-empty-card">
                  {jobs.length ? 'Nenhuma campanha corresponde aos filtros atuais.' : 'Nenhuma campanha foi salva ainda. Abra um template e monte a primeira.'}
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {filteredJobs.map((job) => (
                    <CampaignCard
                      key={job.id}
                      job={job}
                      busyAction={busyAction}
                      onEdit={() => openDesigner({ jobId: job.id })}
                      onClone={() => void handleClone(job)}
                      onPublish={() => void handlePublish(job)}
                      onDelete={() => void handleDelete(job)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="sales-section reveal">
              <div className="sales-section-head">
                <div>
                  <span className="section-kicker">Saidas</span>
                  <h2>Arquivos, portal e canais em uma fila separada</h2>
                </div>
                <p>Quando precisar revisar os arquivos gerados em detalhe, a pagina de arquivos continua disponivel.</p>
              </div>
              <div className="app-panel flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <strong className="block text-xl text-[color:var(--text-primary)]">Centro de arquivos do modulo</strong>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">Abra a fila detalhada para revisar outputs, links finais e historico de publicacao.</p>
                </div>
                <ButtonLink to={buildUrl('/ofertas/jobs')}>
                  <FileImage size={16} strokeWidth={2.1} />
                  Abrir arquivos
                </ButtonLink>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </OffersStudioLayout>
  );
};

export default OffersCampaigns;
