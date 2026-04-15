import React, { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, SendHorizontal } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import OffersStudioLayout from '../components/layout/OffersStudioLayout';
import OfferProductImage from '../components/offers/OfferProductImage';
import { useOffersAppSession } from '../hooks/useOffersAppSession';
import { useOffersService } from '../hooks/useOffersService';
import { OfferGenerationJob, OfferRenderOutput } from '../types/offers.types';

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Agora';

const parseJsonList = (value?: string | null, fallback: string[] = []) => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return fallback;
  }
};

// ─── Status pill ─────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  READY: { label: 'Pronto', cls: 'positive' },
  PARTIAL: { label: 'Parcial', cls: 'soft' },
  PROCESSING: { label: 'Processando', cls: 'soft' },
  QUEUED: { label: 'Na fila', cls: 'soft' },
  FAILED: { label: 'Falhou', cls: 'negative' },
  DRAFT: { label: 'Rascunho', cls: 'soft' },
};

const StatusPill: React.FC<{ status?: string | null }> = ({ status }) => {
  const s = STATUS_MAP[String(status || '').toUpperCase()] || { label: status || '—', cls: 'soft' };
  return <span className={`sales-pill ${s.cls}`}>{s.label}</span>;
};

// ─── Output row ──────────────────────────────────────────────────────────────
const OutputRow: React.FC<{ output: OfferRenderOutput }> = ({ output }) => (
  <div className="ojb-output-row">
    <div className="min-w-0">
      <strong className="ojb-output-title">
        {output.outputType} · {output.publishTarget || 'DOWNLOAD'} · {output.variantKey || 'default'}
      </strong>
      <small className="ojb-output-meta">
        <StatusPill status={output.status} />
        {formatDate(output.createdAt)}
      </small>
    </div>
    {output.fileUrl ? (
      <a
        className="ojb-output-link"
        href={output.fileUrl}
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink size={13} strokeWidth={2.2} />
        Abrir arquivo
      </a>
    ) : (
      <span className="sales-pill soft">Sem URL</span>
    )}
  </div>
);

// ─── Product item row ────────────────────────────────────────────────────────
const ProductItem: React.FC<{ item: OfferGenerationJob['items'][0] }> = ({ item }) => (
  <div className="ojb-product-item">
    <div className="ojb-product-thumb">
      <OfferProductImage src={item.productImageUrl} alt={item.productName} className="ojb-product-img" />
    </div>
    <div className="min-w-0 flex-1">
      <strong className="ojb-product-name">{item.productName}</strong>
      <small className="ojb-product-meta">
        {item.productUnit || 'Unidade'} · zona {item.zoneId || 'principal'} · slot {item.slotIndex ?? item.positionIndex}
      </small>
    </div>
    <strong className="ojb-product-price">{formatMoney(item.currentPrice)}</strong>
  </div>
);

// ─── Job card completo ────────────────────────────────────────────────────────
const JobCard: React.FC<{
  job: OfferGenerationJob;
  publishing: boolean;
  onPublish: () => void;
  onRefresh: () => void;
}> = ({ job, publishing, onPublish, onRefresh }) => {
  const readyOutputs = job.outputs?.filter((o) => String(o.status || '').toUpperCase() === 'READY').length || 0;

  return (
    <article className="ojb-card">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="ojb-card-head">
        <div className="min-w-0">
          <span className="section-kicker">{job.templateName}</span>
          <h2 className="ojb-card-title">{job.name}</h2>
        </div>
        <StatusPill status={job.status} />
      </div>

      {/* ── Meta chips ───────────────────────────────────────────── */}
      <div className="ojb-card-meta">
        <span>Saída {job.outputType}</span>
        <span>{job.generationMode === 'CATALOG' ? 'Encarte' : 'Individual'}</span>
        <span>Variante: {job.variantKey || 'default'}</span>
        <span>{job.productCount} produtos</span>
        <span>{job.pageCount} peças</span>
      </div>

      {/* ── Corpo: produtos + outputs ─────────────────────────────── */}
      <div className="ojb-card-body">
        {/* Produtos */}
        <div className="ojb-products-panel">
          <span className="section-kicker">Produtos ({job.items.length})</span>
          <div className="ojb-products-list">
            {job.items.map((item) => (
              <ProductItem key={item.id} item={item} />
            ))}
          </div>
        </div>

        {/* Outputs */}
        <div className="ojb-outputs-panel">
          <div className="ojb-outputs-head">
            <div>
              <span className="section-kicker">Arquivos gerados</span>
              <strong className="ojb-outputs-count">{readyOutputs} prontos</strong>
            </div>
            <div className="ojb-outputs-actions">
              <Button type="button" variant="secondary" onClick={onRefresh}>
                <RefreshCw size={14} strokeWidth={2.2} />
                Atualizar fila
              </Button>
              <Button type="button" onClick={onPublish} disabled={publishing}>
                <SendHorizontal size={14} strokeWidth={2.2} />
                {publishing ? 'Publicando…' : 'Publicar / gerar'}
              </Button>
            </div>
          </div>

          <div className="ojb-outputs-list">
            {job.outputs?.length ? (
              job.outputs.map((output) => (
                <OutputRow key={output.id} output={output} />
              ))
            ) : (
              <div className="ofd-empty">Nenhum arquivo gerado para esta campanha.</div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

// ─── Screen principal ────────────────────────────────────────────────────────
const OfferJobs: React.FC = () => {
  const { buildUrl, isSuperAdminMode, marketId } = useOffersAppSession();
  const offersService = useOffersService();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<OfferGenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isSuperAdminMode) {
    return <Navigate to={buildUrl('/ofertas')} replace />;
  }

  const loadJobs = async () => {
    if (!marketId) {
      setLoading(false);
      setError('Mercado não encontrado.');
      return;
    }
    setLoading(true);
    try {
      const data = await offersService.getJobs(marketId);
      setJobs(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os arquivos das campanhas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadJobs(); }, [marketId]);

  const handlePublish = async (job: OfferGenerationJob) => {
    if (!marketId) return;
    setPublishingId(job.id);
    try {
      await offersService.publishJob(marketId, job.id, {
        variantKeys: [job.variantKey || 'default'],
        outputTypes: [job.outputType || 'PNG'],
        publishTargets: parseJsonList(job.publishTargetsJson, ['DOWNLOAD']),
        renderOptionsJson: job.renderOptionsJson || undefined,
      });
      await loadJobs();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível publicar a campanha.');
    } finally {
      setPublishingId(null);
    }
  };

  // Stats rápidos
  const readyCount = jobs.filter((j) => String(j.status || '').toUpperCase() === 'READY').length;
  const totalOutputs = jobs.reduce((acc, j) => acc + (j.outputs?.length || 0), 0);

  return (
    <OffersStudioLayout>
      <div className="page offers-page">

        {/* ── Header ───────────────────────────────────────────────── */}
        <header className="ofd-hero reveal">
          <div className="ofd-hero-copy">
            <span className="ofd-hero-kicker">Arquivos e publicações</span>
            <h1 className="ofd-hero-title">Revise os arquivos gerados e a fila de publicação.</h1>
            <p className="ofd-hero-desc">
              Cada campanha carrega variante, canais, opções de render e outputs — separados da listagem operacional para uma revisão mais focada.
            </p>
            <div className="ofd-hero-actions">
              <Button type="button" onClick={() => navigate(buildUrl('/ofertas/campanhas'))}>
                Campanhas
              </Button>
              <Button type="button" variant="secondary" onClick={() => void loadJobs()}>
                <RefreshCw size={15} strokeWidth={2.2} />
                Atualizar
              </Button>
            </div>
          </div>
          <div className="ocm-hero-summary">
            <div className="ocm-summary-stat">
              <strong>{jobs.length}</strong>
              <span>Campanhas</span>
            </div>
            <div className="ocm-summary-divider" />
            <div className="ocm-summary-stat">
              <strong>{readyCount}</strong>
              <span>Publicadas</span>
            </div>
            <div className="ocm-summary-divider" />
            <div className="ocm-summary-stat">
              <strong>{totalOutputs}</strong>
              <span>Arquivos totais</span>
            </div>
          </div>
        </header>

        {/* ── Feedback ─────────────────────────────────────────────── */}
        {error && <div className="ocm-banner ocm-banner-error">{error}</div>}
        {loading && <div className="ofd-feedback">Carregando arquivos…</div>}

        {/* ── Lista de jobs ─────────────────────────────────────────── */}
        {!loading && !error && (
          <div className="ojb-list">
            {jobs.length === 0 ? (
              <div className="ofd-empty">Nenhuma campanha publicada ainda. Publique uma campanha para ver os arquivos aqui.</div>
            ) : (
              jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  publishing={publishingId === job.id}
                  onPublish={() => void handlePublish(job)}
                  onRefresh={() => void loadJobs()}
                />
              ))
            )}
          </div>
        )}
      </div>
    </OffersStudioLayout>
  );
};

export default OfferJobs;
