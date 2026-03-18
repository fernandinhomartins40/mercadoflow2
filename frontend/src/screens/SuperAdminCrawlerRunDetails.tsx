import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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

interface CrawlerRunDetails {
  run: CrawlerRun;
  active: boolean;
  logText?: string | null;
  logPath?: string | null;
  resultPath?: string | null;
  recordsOffset: number;
  recordsLimit: number;
  recordsTotal: number;
  summary: Record<string, any>[];
  manifests: Record<string, any>[];
  records: Record<string, any>[];
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
  if (status === 'SUCCESS') return 'Concludo';
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

const detailValue = (value: any) => {
  if (value == null || value === '') return '--';
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || '--';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const SuperAdminCrawlerRunDetails: React.FC = () => {
  const { runId = '' } = useParams();
  const [details, setDetails] = useState<CrawlerRunDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = async (currentOffset: number) => {
    if (!runId) return;
    setLoading(true);
    try {
      const response = await api.get(`/v1/super-admin/catalog/crawler/runs/${runId}/details`, {
        params: { offset: currentOffset, limit },
      });
      setDetails(response.data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar os detalhes da execução');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOffset(0);
  }, [runId]);

  useEffect(() => {
    load(offset);
  }, [runId, offset]);

  useEffect(() => {
    if (!details?.active) return;
    const handle = window.setInterval(() => {
      load(offset).catch(() => null);
    }, 10000);
    return () => window.clearInterval(handle);
  }, [details?.active, offset, runId]);

  const canGoPrev = offset > 0;
  const canGoNext = useMemo(() => {
    if (!details) return false;
    return offset + limit < Number(details.recordsTotal || 0);
  }, [details, offset]);

  const metrics = details
    ? [
        { title: 'Captados', value: Number(details.run.scannedProducts || 0), icon: 'CP', caption: 'produtos analisados' },
        {
          title: 'Importados',
          value: Number(details.run.importedProducts || 0),
          icon: 'IM',
          variant: 'warning' as const,
          caption: 'itens enviados ao catálogo global',
        },
        {
          title: 'Erros',
          value: Number(details.run.errors || 0),
          icon: 'ER',
          variant: 'danger' as const,
          caption: 'falhas registradas na rodada',
        },
        {
          title: 'Escopo',
          value:
            details.run.selectedCategories && details.run.selectedCategories.length > 0
              ? details.run.selectedCategories.length
              : 'Completo',
          icon: 'SC',
          caption: 'categorias selecionadas ou varredura completa',
        },
      ]
    : [];

  return (
    <SuperAdminLayout>
      <div className="page super-admin-page">
        <PageHero
          badge="Detalhes da coleta"
          title="Detalhes da execução."
          description="Esta página concentra status, escopo, artefatos, amostra de produtos e logs de uma única rodada."
          actions={
            <>
              <ButtonLink variant="secondary" to="/super-admin/crawler">Voltar ao crawler</ButtonLink>
              <Button variant="secondary" onClick={() => load(offset)} disabled={loading}>
                {loading ? 'Atualizando...' : 'Atualizar'}
              </Button>
            </>
          }
          feature={
            <>
              <article className="dashboard-glow-card">
                <span className="section-kicker">Resumo da rodada</span>
                <strong>{details?.run ? formatStatus(details.run.status) : 'Carregando'}</strong>
                <p>{details?.run?.message || 'Sem mensagem registrada.'}</p>
              </article>
              <div className="dashboard-command-mosaic">
                <article className="dashboard-mini-tile">
                  <span>Solicitado em</span>
                  <strong>{details?.run ? formatDate(details.run.requestedAt) : '--'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Finalizado em</span>
                  <strong>{details?.run ? formatDate(details.run.finishedAt || details.run.startedAt) : '--'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Disparado por</span>
                  <strong>{details?.run?.triggeredBy || '--'}</strong>
                </article>
              </div>
            </>
          }
        />

        {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}
        {loading && !details ? <div className="card">Carregando detalhes...</div> : null}

        {details ? (
          <>
            <section className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
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
            </section>

            <div className="dashboard-page-grid">
              <PanelSection className="dashboard-note-card" kicker="Metadados da rodada" title="Contexto principal da execução">
                <div className="dashboard-stat-list">
                  <div className="dashboard-stat-row">
                    <span>Solicitado</span>
                    <strong>{formatDate(details.run.requestedAt)}</strong>
                  </div>
                  <div className="dashboard-stat-row">
                    <span>Iniciado</span>
                    <strong>{formatDate(details.run.startedAt)}</strong>
                  </div>
                  <div className="dashboard-stat-row">
                    <span>Finalizado</span>
                    <strong>{formatDate(details.run.finishedAt)}</strong>
                  </div>
                  <div className="dashboard-stat-row">
                    <span>Mercado</span>
                    <strong>{(details.run.sources || []).join(', ') || '--'}</strong>
                  </div>
                </div>
              </PanelSection>

              <PanelSection className="dashboard-note-card" kicker="Artefatos" title="Arquivos salvos para auditoria">
                <div className="dashboard-quick-list">
                  <div className="dashboard-quick-item">
                    <strong>Log</strong>
                    <span>{details.logPath || '--'}</span>
                  </div>
                  <div className="dashboard-quick-item">
                    <strong>Arquivo de resultado</strong>
                    <span>{details.resultPath || '--'}</span>
                  </div>
                </div>
              </PanelSection>
            </div>

            <PanelSection className="reveal" kicker="Manifestos" title="Arquivos gerados por mercado">
              <div className="crawler-run-manifest-grid">
                {details.manifests.map((manifest, index) => (
                  <article className="card crawler-run-detail-card" key={`${manifest.provider || 'provider'}-${index}`}>
                    <span className="section-kicker">{detailValue(manifest.provider)}</span>
                    <h3>{detailValue(manifest.source)}</h3>
                    <div className="crawler-run-detail-meta">
                      <span><strong>Total:</strong> {detailValue(manifest.count)}</span>
                      <span><strong>Capturados:</strong> {detailValue(manifest.capturedProducts)}</span>
                      <span><strong>Imagens:</strong> {detailValue(manifest.imagesSaved)}</span>
                      <span><strong>Páginas:</strong> {detailValue(manifest.pagesFetched)}</span>
                      <span><strong>Únicos:</strong> {detailValue(manifest.productsUnique)}</span>
                    </div>
                    <p><strong>Manifesto:</strong> {detailValue(manifest.outputManifest)}</p>
                    <p><strong>Registros:</strong> {detailValue(manifest.recordsFile)}</p>
                  </article>
                ))}
              </div>
            </PanelSection>

            <PanelSection
              kicker="Produtos"
              title="Itens captados nesta execução"
              action={
                <div className="crawler-run-pagination">
                  <span>
                    {Math.min(offset + 1, Number(details.recordsTotal || 0))}-
                    {Math.min(offset + limit, Number(details.recordsTotal || 0))} de {Number(details.recordsTotal || 0)}
                  </span>
                  <Button variant="secondary" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={!canGoPrev || loading}>Anterior</Button>
                  <Button variant="secondary" onClick={() => setOffset(offset + limit)} disabled={!canGoNext || loading}>Próximos</Button>
                </div>
              }
            >
              {details.records.length === 0 ? (
                <div className="panel-empty">Nenhum produto registrado nos artefatos desta execução.</div>
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

            <PanelSection kicker="Logs" title="Saída do dispatcher">
              <div className="crawler-run-log-meta">
                <span><strong>Log:</strong> {details.logPath || '--'}</span>
                <span><strong>Resultado:</strong> {details.resultPath || '--'}</span>
              </div>
              <pre className="crawler-run-log-viewer">{details.logText || 'Nenhum log salvo para esta execução.'}</pre>
            </PanelSection>
          </>
        ) : null}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminCrawlerRunDetails;
