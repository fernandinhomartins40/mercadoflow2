import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, RefreshCw, SendHorizontal } from 'lucide-react';
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

// ─── Linha de output ──────────────────────────────────────────────────────────
const OutputRow: React.FC<{ output: OfferRenderOutput }> = ({ output }) => (
  <div className="jb-output-row">
    <StatusPill status={output.status} />
    <span className="jb-output-info">
      {output.outputType} · {output.publishTarget || 'DOWNLOAD'} · {output.variantKey || 'default'}
    </span>
    <span className="jb-output-date">{formatDate(output.createdAt)}</span>
    {output.fileUrl ? (
      <a className="jb-output-link" href={output.fileUrl} target="_blank" rel="noreferrer">
        <ExternalLink size={13} />
        Baixar
      </a>
    ) : (
      <span className="jb-output-pending">Sem arquivo</span>
    )}
  </div>
);

// ─── Accordion de job ─────────────────────────────────────────────────────────
const JobAccordion: React.FC<{
  job: OfferGenerationJob;
  publishing: boolean;
  onPublish: () => void;
  onRefresh: () => void;
}> = ({ job, publishing, onPublish, onRefresh }) => {
  const [open, setOpen] = useState(false);
  const readyOutputs = job.outputs?.filter((o) => String(o.status || '').toUpperCase() === 'READY').length || 0;

  return (
    <div className={`jb-accordion ${open ? 'open' : ''}`}>
      {/* Cabeçalho clicável */}
      <button type="button" className="jb-accordion-head" onClick={() => setOpen((v) => !v)}>
        {/* Miniaturas */}
        <div className="jb-acc-thumbs">
          {job.items.slice(0, 3).map((item) => (
            <div key={item.id} className="jb-acc-thumb">
              <OfferProductImage src={item.productImageUrl} alt={item.productName} className="jb-acc-img" />
            </div>
          ))}
        </div>

        {/* Nome e info */}
        <div className="jb-acc-info">
          <strong className="jb-acc-name">{job.name}</strong>
          <span className="jb-acc-meta">
            {job.templateName} · {job.productCount} produto{job.productCount !== 1 ? 's' : ''} · {job.outputType}
          </span>
        </div>

        {/* Status e arquivos */}
        <div className="jb-acc-status">
          <StatusPill status={job.status} />
          {readyOutputs > 0 && (
            <span className="jb-acc-files">{readyOutputs} arquivo{readyOutputs !== 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Expandir/colapsar */}
        <span className="jb-acc-chevron">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Corpo expandido */}
      {open && (
        <div className="jb-accordion-body">
          {/* Ações */}
          <div className="jb-acc-actions">
            <Button type="button" variant="secondary" onClick={onRefresh}>
              <RefreshCw size={14} />
              Atualizar fila
            </Button>
            <Button type="button" onClick={onPublish} disabled={publishing}>
              <SendHorizontal size={14} />
              {publishing ? 'Publicando…' : readyOutputs ? 'Republicar' : 'Publicar / gerar'}
            </Button>
          </div>

          {/* Produtos */}
          <div className="jb-products-section">
            <h4 className="jb-sub-title">Produtos ({job.items.length})</h4>
            <div className="jb-products-list">
              {job.items.map((item) => (
                <div key={item.id} className="jb-product-row">
                  <div className="jb-product-thumb">
                    <OfferProductImage src={item.productImageUrl} alt={item.productName} className="jb-product-img" />
                  </div>
                  <div className="jb-product-info">
                    <strong>{item.productName}</strong>
                    <span>{item.productUnit || 'Unidade'} · slot {item.slotIndex ?? item.positionIndex}</span>
                  </div>
                  <strong className="jb-product-price">{formatMoney(item.currentPrice)}</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Arquivos */}
          <div className="jb-outputs-section">
            <h4 className="jb-sub-title">Arquivos gerados ({readyOutputs} prontos)</h4>
            {job.outputs?.length ? (
              <div className="jb-outputs-list">
                {job.outputs.map((output) => (
                  <OutputRow key={output.id} output={output} />
                ))}
              </div>
            ) : (
              <p className="jb-outputs-empty">Publique para gerar os arquivos.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Screen principal ─────────────────────────────────────────────────────────
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
    if (!marketId) { setLoading(false); setError('Mercado não encontrado.'); return; }
    setLoading(true);
    try {
      setJobs(await offersService.getJobs(marketId));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os arquivos.');
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
      setError(err?.message || 'Não foi possível publicar.');
    } finally {
      setPublishingId(null);
    }
  };

  const readyCount = jobs.filter((j) => String(j.status || '').toUpperCase() === 'READY').length;

  return (
    <OffersStudioLayout>
      <div className="page offers-page">

        {/* ── Cabeçalho ─────────────────────────────────────────────── */}
        <div className="dash-page-head">
          <div>
            <h1 className="dash-page-title">Arquivos e publicações</h1>
            <p className="dash-page-sub">
              {jobs.length} campanha{jobs.length !== 1 ? 's' : ''} · {readyCount} publicada{readyCount !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="cm-head-actions">
            <Button type="button" variant="secondary" onClick={() => void loadJobs()}>
              <RefreshCw size={14} />
              Atualizar
            </Button>
            <Button type="button" onClick={() => navigate(buildUrl('/ofertas/campanhas'))}>
              Campanhas
            </Button>
          </div>
        </div>

        {/* ── Feedback ──────────────────────────────────────────────── */}
        {error && <div className="ocm-banner ocm-banner-error">{error}</div>}
        {loading && <div className="ofd-feedback">Carregando arquivos…</div>}

        {/* ── Lista accordion ────────────────────────────────────────── */}
        {!loading && !error && (
          <section className="dash-section">
            {jobs.length === 0 ? (
              <div className="ofd-empty">
                Nenhuma campanha publicada ainda. Publique uma campanha para ver os arquivos aqui.
              </div>
            ) : (
              <div className="jb-list">
                {jobs.map((job) => (
                  <JobAccordion
                    key={job.id}
                    job={job}
                    publishing={publishingId === job.id}
                    onPublish={() => void handlePublish(job)}
                    onRefresh={() => void loadJobs()}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </OffersStudioLayout>
  );
};

export default OfferJobs;
