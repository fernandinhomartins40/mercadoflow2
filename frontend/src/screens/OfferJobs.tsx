import React, { useEffect, useState } from 'react';
import { Eye, ExternalLink, RefreshCw, SendHorizontal, WandSparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import PageHero from '../components/dashboard/PageHero';
import Layout from '../components/layout/Layout';
import OfferProductImage from '../components/offers/OfferProductImage';
import { useAuth } from '../context/AuthContext';
import { offersService } from '../services/offers.service';
import { OfferGenerationJob } from '../types/offers.types';

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const parseJsonList = (value?: string | null, fallback: string[] = []) => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return fallback;
  }
};

const OfferJobs: React.FC = () => {
  const { marketId } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<OfferGenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError(err?.message || 'Não foi possível carregar os lotes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadJobs();
  }, [marketId]);

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
      setError(err?.message || 'Não foi possível publicar o lote.');
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <Layout>
      <div className="page analytics-page offers-page">
        <PageHero
          badge="Lotes e outputs"
          title="Acompanhe, publique e reaproveite a geração do estúdio."
          description="Cada lote agora carrega variante, targets de publicação, render options e outputs gerados, em vez de ser apenas um registro raso de template."
          actions={
            <>
              <Button type="button" onClick={() => navigate('/app/ofertas/designer')}>Novo lote</Button>
              <Button type="button" variant="secondary" onClick={() => void loadJobs()}>
                <RefreshCw size={16} strokeWidth={2.1} />
                Atualizar
              </Button>
            </>
          }
          feature={
            <article className="dashboard-glow-card">
              <span className="section-kicker">Lote mais recente</span>
              <strong>{jobs[0]?.name || 'Nenhum lote criado'}</strong>
              <p>{jobs[0] ? `${jobs[0].variantKey || 'default'} · ${jobs[0].outputType} · ${jobs[0].outputs?.length || 0} outputs` : 'Assim que o primeiro lote for criado, ele aparece aqui com o resumo principal.'}</p>
            </article>
          }
          aside={(
            <article className="dashboard-priority-card">
              <span className="section-kicker">Pipeline</span>
              <h3>{jobs.length} lotes registrados.</h3>
              <p>Use a fila para revisar os itens, publicar novamente e acompanhar outputs já gerados por variante e canal.</p>
            </article>
          )}
        />

        {loading ? <div className="sales-empty-card">Carregando lotes...</div> : null}
        {error ? <div className="sales-empty-card">{error}</div> : null}

        {!loading && !error ? (
          <div className="offer-jobs-page-grid">
            {jobs.length === 0 ? <div className="sales-empty-card">Nenhum lote foi criado ainda.</div> : null}
            {jobs.map((job) => (
              <article key={job.id} className="offer-job-detail-card">
                <div className="offer-job-detail-head">
                  <div>
                    <span className="section-kicker">{job.templateName}</span>
                    <h2>{job.name}</h2>
                  </div>
                  <span className={`status-pill ${String(job.status || '').toLowerCase()}`}>{job.status}</span>
                </div>
                <div className="offer-job-detail-meta">
                  <span>Saída {job.outputType}</span>
                  <span>Modo {job.generationMode === 'CATALOG' ? 'Encarte' : 'Individual'}</span>
                  <span>Variante {job.variantKey || 'default'}</span>
                  <span>{job.productCount} produtos</span>
                  <span>{job.pageCount} páginas/peças</span>
                </div>
                <div className="offer-job-detail-items">
                  {job.items.map((item) => (
                    <article key={item.id} className="offer-job-detail-item">
                      <div className="offer-job-detail-item-frame">
                        <OfferProductImage src={item.productImageUrl} alt={item.productName} className="offer-job-detail-item-image" />
                      </div>
                      <div className="offer-job-detail-item-body">
                        <h3>{item.productName}</h3>
                        <p>{item.productUnit || 'Unidade'} · zona {item.zoneId || 'principal'} · slot {item.slotIndex ?? item.positionIndex}</p>
                        <strong>{formatMoney(item.currentPrice)}</strong>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-6 rounded-[24px] border border-[rgba(87,51,30,0.08)] bg-white/80 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="section-kicker">Outputs</span>
                      <h3 className="mt-1 text-xl font-semibold text-[color:var(--text-primary)]">{job.outputs?.length || 0} arquivos gerados</h3>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button type="button" variant="secondary" onClick={() => void loadJobs()}>
                        <Eye size={16} strokeWidth={2.1} />
                        Atualizar fila
                      </Button>
                      <Button type="button" onClick={() => void handlePublish(job)} disabled={publishingId === job.id}>
                        <SendHorizontal size={16} strokeWidth={2.1} />
                        {publishingId === job.id ? 'Publicando...' : 'Publicar / gerar outputs'}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {job.outputs?.length ? (
                      job.outputs.map((output) => (
                        <div key={output.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.7)] px-4 py-3">
                          <div className="min-w-0">
                            <strong className="block truncate text-[color:var(--text-primary)]">{output.outputType} · {output.publishTarget || 'DOWNLOAD'} · {output.variantKey || 'default'}</strong>
                            <small className="text-[color:var(--text-secondary)]">{output.status} · {output.createdAt ? new Date(output.createdAt).toLocaleString('pt-BR') : 'agora'}</small>
                          </div>
                          {output.fileUrl ? (
                            <a className="inline-flex items-center gap-2 rounded-full border border-[rgba(87,51,30,0.1)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--text-primary)]" href={output.fileUrl} target="_blank" rel="noreferrer">
                              <ExternalLink size={14} strokeWidth={2.1} />
                              Abrir arquivo
                            </a>
                          ) : (
                            <span className="sales-pill soft">Sem URL final</span>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="sales-empty-card">Nenhum output gerado para este lote ainda.</div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default OfferJobs;
