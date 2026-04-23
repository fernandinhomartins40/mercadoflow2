import React, { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  ExternalLink,
  FileImage,
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
    return { key: 'published', label: normalized === 'PARTIAL' ? 'Pronto c/ alerta' : 'Pronto', pillClass: 'positive' };
  }
  if (normalized === 'PROCESSING' || normalized === 'QUEUED') {
    return { key: 'processing', label: 'Gerando…', pillClass: 'soft' };
  }
  return { key: 'draft', label: 'Rascunho', pillClass: 'soft' };
};

// ─── Template starter (escolha inicial) ──────────────────────────────────────
const TemplateStarter: React.FC<{ template: OfferTemplate; onStart: () => void }> = ({ template, onStart }) => (
  <button type="button" onClick={onStart} className="cm-starter">
    <div className="cm-starter-preview">
      <OfferCanvasPreview template={template} className="cm-starter-canvas" />
    </div>
    <div className="cm-starter-label">
      <strong>{template.name}</strong>
      <span>{template.channel} · {template.canvasWidth}×{template.canvasHeight}</span>
    </div>
  </button>
);

// ─── Linha de campanha (lista plana) ─────────────────────────────────────────
const CampaignRow: React.FC<{
  job: OfferGenerationJob;
  busyAction: string | null;
  onEdit: () => void;
  onClone: () => void;
  onPublish: () => void;
  onDelete: () => void;
}> = ({ job, busyAction, onEdit, onClone, onPublish, onDelete }) => {
  const state = getCampaignState(job);
  const readyOutputs = job.outputs?.filter((o) => String(o.status || '').toUpperCase() === 'READY').length || 0;
  const primaryOutput = job.outputs?.find((o) => o.fileUrl) || null;

  return (
    <div className="cm-row">
      {/* Miniaturas de produtos */}
      <div className="cm-row-thumbs">
        {job.items.slice(0, 3).map((item) => (
          <div key={item.id} className="cm-row-thumb">
            <OfferProductImage src={item.productImageUrl} alt={item.productName} className="cm-row-img" />
          </div>
        ))}
        {job.items.length === 0 && (
          <div className="cm-row-thumb cm-row-thumb-empty">
            <FileImage size={14} />
          </div>
        )}
      </div>

      {/* Info principal */}
      <div className="cm-row-info">
        <strong className="cm-row-name">{job.name}</strong>
        <span className="cm-row-meta">
          {job.templateName} · {job.productCount} produto{job.productCount !== 1 ? 's' : ''} · {formatDate(job.updatedAt)}
        </span>
      </div>

      {/* Status */}
      <div className="cm-row-status">
        <span className={`sales-pill ${state.pillClass}`}>{state.label}</span>
        {readyOutputs > 0 && (
          <span className="cm-row-files">{readyOutputs} arquivo{readyOutputs !== 1 ? 's' : ''}</span>
        )}
        {primaryOutput?.fileUrl && (
          <a href={primaryOutput.fileUrl} target="_blank" rel="noreferrer" className="cm-row-link">
            <ExternalLink size={12} />
            Baixar
          </a>
        )}
      </div>

      {/* Ações */}
      <div className="cm-row-actions">
        <button type="button" className="cm-icon-btn" title="Editar" onClick={onEdit}>
          <Pencil size={15} />
        </button>
        <button
          type="button"
          className="cm-icon-btn"
          title="Duplicar"
          onClick={onClone}
          disabled={busyAction === `clone:${job.id}`}
        >
          <Copy size={15} />
        </button>
        <button
          type="button"
          className="cm-icon-btn cm-icon-btn-primary"
          title={readyOutputs ? 'Gerar novamente' : 'Gerar'}
          onClick={onPublish}
          disabled={busyAction === `publish:${job.id}`}
        >
          <SendHorizontal size={15} />
        </button>
        <button
          type="button"
          className="cm-icon-btn cm-icon-btn-danger"
          title="Excluir"
          onClick={onDelete}
          disabled={busyAction === `delete:${job.id}`}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
};

// ─── Screen principal ─────────────────────────────────────────────────────────
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
    if (!marketId) { setError('Mercado não encontrado.'); setLoading(false); return; }
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
      setError(err?.message || 'Não foi possível carregar os encartes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, [marketId]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(t);
  }, [notice]);

  const leadTemplate = useMemo<OfferTemplate | null>(() => overview?.templates?.[0] || null, [overview]);
  const templateStarters = useMemo(() => (overview?.templates || []).slice(0, 4), [overview?.templates]);

  const counts = useMemo(() => ({
    draft: jobs.filter((j) => getCampaignState(j).key === 'draft').length,
    published: jobs.filter((j) => getCampaignState(j).key === 'published').length,
    failed: jobs.filter((j) => getCampaignState(j).key === 'failed').length,
  }), [jobs]);

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchFilter = filter === 'all' || getCampaignState(job).key === filter;
      const matchQuery = !q || job.name.toLowerCase().includes(q) || job.templateName.toLowerCase().includes(q);
      return matchFilter && matchQuery;
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
      setNotice('Encarte gerado.');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível gerar o encarte.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleClone = async (job: OfferGenerationJob) => {
    if (!marketId) return;
    setBusyAction(`clone:${job.id}`);
    try {
      const cloned = await offersService.cloneJob(marketId, job.id);
      setNotice('Encarte duplicado.');
      await loadData();
      openDesigner({ jobId: cloned.id });
    } catch (err: any) {
      setError(err?.message || 'Não foi possível duplicar o encarte.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (job: OfferGenerationJob) => {
    if (!marketId) return;
    if (!window.confirm(`Excluir o encarte "${job.name}"?`)) return;
    setBusyAction(`delete:${job.id}`);
    try {
      await offersService.deleteJob(marketId, job.id);
      setNotice('Encarte removido.');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível excluir.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <OffersStudioLayout>
      <div className="page offers-page">

        {/* ── Notificações ───────────────────────────────────────────── */}
        {error && <div className="ocm-banner ocm-banner-error">{error}</div>}
        {!error && notice && <div className="ocm-banner ocm-banner-success">{notice}</div>}

        {/* ── Cabeçalho da página ────────────────────────────────────── */}
        <div className="dash-page-head">
          <div>
            <h1 className="dash-page-title">Meus encartes</h1>
            <p className="dash-page-sub">Crie, edite e gere seus encartes de ofertas.</p>
          </div>
          <div className="cm-head-actions">
            <Button type="button" variant="secondary" onClick={() => void loadData()}>
              <RefreshCw size={14} />
              Atualizar
            </Button>
            <Button type="button" onClick={() => openDesigner({ templateId: leadTemplate?.id })}>
              <Plus size={15} />
              Novo encarte
            </Button>
          </div>
        </div>

        {loading && <div className="ofd-feedback">Carregando encartes…</div>}

        {!loading && overview && (
          <>
            {/* ── Escolha de template (início rápido) ───────────────── */}
            {templateStarters.length > 0 && jobs.length === 0 && (
              <section className="dash-section">
                <h2 className="dash-section-title">Escolha um modelo para começar</h2>
                <div className="cm-starters-grid">
                  {templateStarters.map((t) => (
                    <TemplateStarter
                      key={t.id}
                      template={t}
                      onStart={() => openDesigner({ templateId: t.id })}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── Lista de campanhas ─────────────────────────────────── */}
            {jobs.length > 0 && (
              <section className="dash-section">
                {/* Toolbar */}
                <div className="cm-toolbar">
                  <div className="cm-search-wrap">
                    <Search size={14} className="cm-search-icon" />
                    <input
                      className="cm-search-input"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar encarte…"
                    />
                  </div>
                  <div className="cm-filters">
                    {([
                      { key: 'all', label: 'Todos', count: jobs.length },
                      { key: 'published', label: 'Gerados', count: counts.published },
                      { key: 'draft', label: 'Rascunho', count: counts.draft },
                      ...(counts.failed > 0 ? [{ key: 'failed', label: 'Com falha', count: counts.failed }] : []),
                    ] as const).map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        className={`cm-filter-btn ${filter === f.key ? 'active' : ''}`}
                        onClick={() => setFilter(f.key as typeof filter)}
                      >
                        {f.label}
                        <span className="cm-filter-count">{f.count}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lista */}
                <div className="cm-list">
                  {filteredJobs.length === 0 ? (
                    <div className="ofd-empty">Nenhum encarte encontrado.</div>
                  ) : (
                    filteredJobs.map((job) => (
                      <CampaignRow
                        key={job.id}
                        job={job}
                        busyAction={busyAction}
                        onEdit={() => openDesigner({ jobId: job.id })}
                        onClone={() => void handleClone(job)}
                        onPublish={() => void handlePublish(job)}
                        onDelete={() => void handleDelete(job)}
                      />
                    ))
                  )}
                </div>
              </section>
            )}

            {/* Modelos disponíveis quando já há campanhas */}
            {jobs.length > 0 && templateStarters.length > 0 && (
              <section className="dash-section">
                <div className="dash-section-head">
                  <h2 className="dash-section-title">Criar com um modelo</h2>
                </div>
                <div className="cm-starters-grid">
                  {templateStarters.map((t) => (
                    <TemplateStarter
                      key={t.id}
                      template={t}
                      onStart={() => openDesigner({ templateId: t.id })}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Link para arquivos */}
            <div className="cm-files-link">
              <ButtonLink to={buildUrl('/ofertas/jobs')} variant="secondary">
                <FileImage size={14} />
                Revisar arquivos e publicações
              </ButtonLink>
            </div>
          </>
        )}
      </div>
    </OffersStudioLayout>
  );
};

export default OffersCampaigns;
