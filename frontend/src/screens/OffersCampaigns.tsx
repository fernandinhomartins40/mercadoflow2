import React, { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  ExternalLink,
  FileImage,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Trash2,
} from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import ButtonLink from '../components/common/ButtonLink';
import OffersStudioLayout from '../components/layout/OffersStudioLayout';
import OfferCanvasPreview from '../components/offers/OfferCanvasPreview';
import OfferProductImage from '../components/offers/OfferProductImage';
import { useOffersAppSession } from '../hooks/useOffersAppSession';
import { useOffersService } from '../hooks/useOffersService';
import { OfferGenerationJob, OfferOverview, OfferTemplate } from '../types/offers.types';

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Agora';

const parseJsonList = (value?: string | null, fallback: string[] = []) => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return fallback;
  }
};

type CampaignStateKey = 'draft' | 'processing' | 'published' | 'failed';

const getCampaignState = (job: OfferGenerationJob): { key: CampaignStateKey; label: string; pillClass: string } => {
  const normalized = String(job.status || '').toUpperCase();
  const readyOutputs = job.outputs?.filter((o) => String(o.status || '').toUpperCase() === 'READY').length || 0;
  const failedOutputs = job.outputs?.filter((o) => String(o.status || '').toUpperCase() === 'FAILED').length || 0;

  if (normalized === 'FAILED' || (failedOutputs > 0 && readyOutputs === 0)) {
    return { key: 'failed', label: 'Falhou', pillClass: 'negative' };
  }
  if (normalized === 'READY' || normalized === 'PARTIAL' || readyOutputs > 0) {
    return { key: 'published', label: normalized === 'PARTIAL' ? 'Publicado c/ alerta' : 'Publicado', pillClass: 'positive' };
  }
  if (normalized === 'PROCESSING' || normalized === 'QUEUED') {
    return { key: 'processing', label: 'Publicando…', pillClass: 'soft' };
  }
  return { key: 'draft', label: 'Rascunho', pillClass: 'soft' };
};

// ─── Template starter card ───────────────────────────────────────────────────
const TemplateStarterCard: React.FC<{ template: OfferTemplate; onStart: () => void }> = ({ template, onStart }) => (
  <article className="ocm-starter-card">
    <div className="ocm-starter-preview">
      <OfferCanvasPreview template={template} className="ocm-starter-canvas" />
    </div>
    <div className="ocm-starter-body">
      <div>
        <span className="section-kicker">{template.channel}</span>
        <h3 className="ocm-starter-name">{template.name}</h3>
        <p className="ocm-starter-desc">{template.description || 'Template pronto para encarte, cartaz e publicação multicanal.'}</p>
      </div>
      <div className="ocm-starter-footer">
        <span className="ocm-starter-dim">{template.canvasWidth}×{template.canvasHeight}</span>
        <Button type="button" onClick={onStart}>
          <Plus size={15} strokeWidth={2.2} />
          Criar campanha
        </Button>
      </div>
    </div>
  </article>
);

// ─── Campaign card ───────────────────────────────────────────────────────────
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
  const primaryOutput = job.outputs?.find((o) => o.fileUrl) || null;
  const readyOutputs = job.outputs?.filter((o) => String(o.status || '').toUpperCase() === 'READY').length || 0;

  return (
    <article className="ocm-campaign-card">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="ocm-campaign-head">
        <div className="min-w-0">
          <span className="section-kicker">{job.templateName || 'Template'}</span>
          <h3 className="ocm-campaign-title">{job.name}</h3>
        </div>
        <span className={`sales-pill ${state.pillClass}`}>{state.label}</span>
      </div>

      {/* ── Meta row ─────────────────────────────────────────────── */}
      <div className="ocm-campaign-meta">
        <span>{job.productCount} produtos</span>
        <span>{job.pageCount} peças</span>
        <span>{job.generationMode === 'CATALOG' ? 'Encarte' : 'Individual'}</span>
        <span>Atualizado {formatDate(job.updatedAt)}</span>
      </div>

      {/* ── Channels ─────────────────────────────────────────────── */}
      {channels.length > 0 && (
        <div className="ocm-campaign-channels">
          {channels.map((ch) => (
            <span key={`${job.id}-${ch}`} className="sales-pill soft">{ch}</span>
          ))}
        </div>
      )}

      {/* ── Products + Files ─────────────────────────────────────── */}
      <div className="ocm-campaign-content">
        <div className="ocm-campaign-products">
          {job.items.slice(0, 4).map((item) => (
            <div key={item.id} className="ocm-product-row">
              <div className="ocm-product-thumb">
                <OfferProductImage src={item.productImageUrl} alt={item.productName} className="ocm-product-img" />
              </div>
              <div className="min-w-0">
                <strong className="ocm-product-name">{item.productName}</strong>
                <small className="ocm-product-meta">{item.productUnit || 'Unidade'} · slot {item.slotIndex ?? item.positionIndex}</small>
              </div>
            </div>
          ))}
          {job.items.length > 4 && (
            <p className="ocm-products-more">+{job.items.length - 4} produtos</p>
          )}
        </div>

        <div className="ocm-campaign-files">
          <span className="section-kicker">Arquivos prontos</span>
          <strong className="ocm-files-count">{readyOutputs}</strong>
          <p className="ocm-files-desc">
            {primaryOutput?.fileUrl
              ? 'Campanha com pelo menos um arquivo gerado.'
              : 'Publique para gerar os arquivos finais.'}
          </p>
          {primaryOutput?.fileUrl && (
            <a
              className="ocm-file-link"
              href={primaryOutput.fileUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} strokeWidth={2.2} />
              Abrir arquivo
            </a>
          )}
        </div>
      </div>

      {/* ── Actions ──────────────────────────────────────────────── */}
      <div className="ocm-campaign-actions">
        <Button type="button" variant="secondary" onClick={onEdit}>
          <Pencil size={14} strokeWidth={2.2} />
          Editar
        </Button>
        <Button type="button" variant="secondary" onClick={onClone} disabled={busyAction === `clone:${job.id}`}>
          <Copy size={14} strokeWidth={2.2} />
          {busyAction === `clone:${job.id}` ? 'Clonando…' : 'Clonar'}
        </Button>
        <Button type="button" onClick={onPublish} disabled={busyAction === `publish:${job.id}`}>
          <SendHorizontal size={14} strokeWidth={2.2} />
          {busyAction === `publish:${job.id}` ? 'Publicando…' : readyOutputs ? 'Republicar' : 'Publicar'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDelete} disabled={busyAction === `delete:${job.id}`} className="ml-auto">
          <Trash2 size={14} strokeWidth={2.2} />
          {busyAction === `delete:${job.id}` ? 'Excluindo…' : 'Excluir'}
        </Button>
      </div>
    </article>
  );
};

// ─── Filter tab ──────────────────────────────────────────────────────────────
const FilterTab: React.FC<{
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}> = ({ label, count, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`ocm-filter-tab ${active ? 'active' : ''}`}
  >
    {label}
    {count !== undefined && <span className="ocm-filter-tab-badge">{count}</span>}
  </button>
);

// ─── Screen principal ────────────────────────────────────────────────────────
const OffersCampaigns: React.FC = () => {
  const { buildUrl, isSuperAdminMode, marketId } = useOffersAppSession();
  const offersService = useOffersService();
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
      setError('Mercado não encontrado.');
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
      setError(err?.message || 'Não foi possível carregar as campanhas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, [marketId]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const leadTemplate = useMemo<OfferTemplate | null>(() => overview?.templates?.[0] || null, [overview]);
  const templateStarters = useMemo(() => (overview?.templates || []).slice(0, 3), [overview?.templates]);

  const draftCount = useMemo(() => jobs.filter((j) => getCampaignState(j).key === 'draft').length, [jobs]);
  const publishedCount = useMemo(() => jobs.filter((j) => getCampaignState(j).key === 'published').length, [jobs]);
  const failedCount = useMemo(() => jobs.filter((j) => getCampaignState(j).key === 'failed').length, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesFilter = filter === 'all' ? true : getCampaignState(job).key === filter;
      const matchesQuery = !q
        ? true
        : job.name.toLowerCase().includes(q)
          || job.templateName.toLowerCase().includes(q)
          || job.items.some((item) => item.productName.toLowerCase().includes(q));
      return matchesFilter && matchesQuery;
    });
  }, [filter, jobs, query]);

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
      setError(err?.message || 'Não foi possível publicar a campanha.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleClone = async (job: OfferGenerationJob) => {
    if (!marketId) return;
    setBusyAction(`clone:${job.id}`);
    try {
      const cloned = await offersService.cloneJob(marketId, job.id);
      setNotice('Campanha clonada com sucesso.');
      await loadData();
      openDesigner({ jobId: cloned.id });
    } catch (err: any) {
      setError(err?.message || 'Não foi possível clonar a campanha.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (job: OfferGenerationJob) => {
    if (!marketId) return;
    if (!window.confirm(`Excluir a campanha "${job.name}"?`)) return;
    setBusyAction(`delete:${job.id}`);
    try {
      await offersService.deleteJob(marketId, job.id);
      setNotice('Campanha removida.');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível excluir a campanha.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <OffersStudioLayout>
      <div className="page offers-page">

        {/* ── Notificações ─────────────────────────────────────────── */}
        {error && <div className="ocm-banner ocm-banner-error">{error}</div>}
        {!error && notice && <div className="ocm-banner ocm-banner-success">{notice}</div>}

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <header className="ofd-hero reveal">
          <div className="ofd-hero-copy">
            <span className="ofd-hero-kicker">Campanhas de ofertas</span>
            <h1 className="ofd-hero-title">Crie, publique e reaproveite campanhas sem sair do fluxo.</h1>
            <p className="ofd-hero-desc">
              Template compartilhado, produtos do catálogo, publicação multicanal e arquivos gerados pelo motor do módulo.
            </p>
            <div className="ofd-hero-actions">
              <Button type="button" onClick={() => openDesigner({ templateId: leadTemplate?.id })}>
                <Plus size={16} strokeWidth={2.2} />
                Abrir estúdio
              </Button>
              <ButtonLink variant="secondary" to={buildUrl('/ofertas/jobs')}>
                <FileImage size={15} strokeWidth={2.2} />
                Arquivos
              </ButtonLink>
            </div>
          </div>
          <div className="ocm-hero-summary">
            <div className="ocm-summary-stat">
              <strong>{jobs.length}</strong>
              <span>Total de campanhas</span>
            </div>
            <div className="ocm-summary-divider" />
            <div className="ocm-summary-stat">
              <strong>{publishedCount}</strong>
              <span>Publicadas</span>
            </div>
            <div className="ocm-summary-divider" />
            <div className="ocm-summary-stat">
              <strong>{draftCount}</strong>
              <span>Rascunhos</span>
            </div>
            {failedCount > 0 && (
              <>
                <div className="ocm-summary-divider" />
                <div className="ocm-summary-stat ocm-summary-stat-alert">
                  <strong>{failedCount}</strong>
                  <span>Com falha</span>
                </div>
              </>
            )}
          </div>
        </header>

        {loading && <div className="ofd-feedback">Carregando campanhas…</div>}

        {!loading && overview && (
          <>
            {/* ── Templates de início rápido ────────────────────────── */}
            {templateStarters.length > 0 && (
              <section className="ocm-section reveal">
                <div className="ocm-section-head">
                  <div>
                    <span className="section-kicker">Início rápido</span>
                    <h2 className="ocm-section-title">Escolha um template</h2>
                  </div>
                  <p className="ocm-section-desc">Selecione um modelo base para abrir o editor e montar sua campanha.</p>
                </div>
                <div className="ocm-starters-grid">
                  {templateStarters.map((template) => (
                    <TemplateStarterCard
                      key={template.id}
                      template={template}
                      onStart={() => openDesigner({ templateId: template.id })}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── Lista de campanhas ────────────────────────────────── */}
            <section className="ocm-section reveal">
              <div className="ocm-section-head">
                <div>
                  <span className="section-kicker">Minhas campanhas</span>
                  <h2 className="ocm-section-title">Edite, clone e publique</h2>
                </div>
                <p className="ocm-section-desc">
                  {jobs.length} campanha{jobs.length !== 1 ? 's' : ''} no total.
                </p>
              </div>

              {/* ── Toolbar: busca + filtros ──────────────────────── */}
              <div className="ocm-toolbar">
                <div className="ocm-search-wrap">
                  <Search size={15} strokeWidth={2.2} className="ocm-search-icon" />
                  <input
                    className="ocm-search-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por nome, template ou produto…"
                  />
                </div>
                <div className="ocm-toolbar-right">
                  <div className="ocm-filter-tabs">
                    <Filter size={14} strokeWidth={2.2} className="ocm-filter-icon" />
                    <FilterTab label="Todas" count={jobs.length} active={filter === 'all'} onClick={() => setFilter('all')} />
                    <FilterTab label="Rascunho" count={draftCount} active={filter === 'draft'} onClick={() => setFilter('draft')} />
                    <FilterTab label="Publicadas" count={publishedCount} active={filter === 'published'} onClick={() => setFilter('published')} />
                    {failedCount > 0 && (
                      <FilterTab label="Falhas" count={failedCount} active={filter === 'failed'} onClick={() => setFilter('failed')} />
                    )}
                  </div>
                  <Button type="button" variant="secondary" onClick={() => void loadData()}>
                    <RefreshCw size={14} strokeWidth={2.2} />
                    Atualizar
                  </Button>
                </div>
              </div>

              {/* ── Grid de campanhas ─────────────────────────────── */}
              {filteredJobs.length === 0 ? (
                <div className="ofd-empty">
                  {jobs.length
                    ? 'Nenhuma campanha corresponde aos filtros.'
                    : 'Nenhuma campanha criada ainda. Escolha um template acima para começar.'}
                </div>
              ) : (
                <div className="ocm-campaigns-grid">
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

            {/* ── Acesso aos arquivos ───────────────────────────────── */}
            <section className="ocm-section reveal">
              <div className="ocm-files-banner">
                <div>
                  <span className="section-kicker">Centro de arquivos</span>
                  <h3 className="ocm-files-title">Revise outputs, links finais e histórico de publicação</h3>
                </div>
                <ButtonLink to={buildUrl('/ofertas/jobs')}>
                  <FileImage size={15} strokeWidth={2.2} />
                  Abrir arquivos
                </ButtonLink>
              </div>
            </section>
          </>
        )}
      </div>
    </OffersStudioLayout>
  );
};

export default OffersCampaigns;
