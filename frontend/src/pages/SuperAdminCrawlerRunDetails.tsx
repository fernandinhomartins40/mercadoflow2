import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
      setError(err?.message || 'Falha ao carregar detalhes da execucao');
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

  return (
    <SuperAdminLayout>
      <div className="super-admin-page">
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Crawler manual</span>
            <h1 className="analytics-hero-title">Detalhes da execucao</h1>
            <p className="analytics-hero-text">
              Logs, artefatos e amostra dos produtos captados para um unico supermercado por rodada.
            </p>
          </div>
          <div className="analytics-hero-board single-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">Run</span>
              <h3>{details?.run ? formatStatus(details.run.status) : 'Carregando'}</h3>
              <strong>{details?.run ? formatDate(details.run.finishedAt || details.run.startedAt || details.run.requestedAt) : '--'}</strong>
              <p>{details?.run?.message || 'Sem mensagem registrada.'}</p>
            </div>
          </div>
        </section>

        <div className="crawler-run-detail-head">
          <Link to="/super-admin/crawler" className="button secondary">Voltar para o crawler</Link>
          <Button variant="secondary" onClick={() => load(offset)} disabled={loading}>
            {loading ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </div>

        {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}
        {loading && !details ? <div className="card">Carregando detalhes...</div> : null}

        {details ? (
          <>
            <section className="metrics-grid analytics-metrics-grid">
              <div className="card">
                <span className="section-kicker">Solicitado</span>
                <h3>{formatDate(details.run.requestedAt)}</h3>
                <p>{details.run.triggeredBy || '--'}</p>
              </div>
              <div className="card">
                <span className="section-kicker">Escopo</span>
                <h3>{details.run.selectedCategories && details.run.selectedCategories.length > 0 ? details.run.selectedCategories.length : 'Completo'}</h3>
                <p>
                  {(details.run.sources || []).join(', ') || '--'}
                  {details.run.selectedCategories && details.run.selectedCategories.length > 0
                    ? ` | ${details.run.selectedCategories.join(', ')}`
                    : ' | catalogo completo'}
                </p>
              </div>
              <div className="card">
                <span className="section-kicker">Captados</span>
                <h3>{Number(details.run.scannedProducts || 0)}</h3>
                <p>produtos analisados nesta execucao.</p>
              </div>
              <div className="card">
                <span className="section-kicker">Importados</span>
                <h3>{Number(details.run.importedProducts || 0)}</h3>
                <p>produtos injetados no catalogo global.</p>
              </div>
            </section>

            <section className="crawler-run-manifest-grid">
              {details.manifests.map((manifest, index) => (
                <article className="card crawler-run-detail-card" key={`${manifest.provider || 'provider'}-${index}`}>
                  <span className="section-kicker">{detailValue(manifest.provider)}</span>
                  <h3>{detailValue(manifest.source)}</h3>
                  <div className="crawler-run-detail-meta">
                    <span><strong>Count:</strong> {detailValue(manifest.count)}</span>
                    <span><strong>Capturados:</strong> {detailValue(manifest.capturedProducts)}</span>
                    <span><strong>Imagens:</strong> {detailValue(manifest.imagesSaved)}</span>
                    <span><strong>Pages:</strong> {detailValue(manifest.pagesFetched)}</span>
                    <span><strong>Unique:</strong> {detailValue(manifest.productsUnique)}</span>
                  </div>
                  <p><strong>Manifest:</strong> {detailValue(manifest.outputManifest)}</p>
                  <p><strong>Records:</strong> {detailValue(manifest.recordsFile)}</p>
                </article>
              ))}
            </section>

            <section className="analytics-panel reveal">
              <div className="analytics-panel-head">
                <div>
                  <span className="section-kicker">Produtos</span>
                  <h3>Itens captados nesta execucao</h3>
                </div>
                <div className="crawler-run-pagination">
                  <span>{Math.min(offset + 1, Number(details.recordsTotal || 0))}-{Math.min(offset + limit, Number(details.recordsTotal || 0))} de {Number(details.recordsTotal || 0)}</span>
                  <Button variant="secondary" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={!canGoPrev || loading}>Anterior</Button>
                  <Button variant="secondary" onClick={() => setOffset(offset + limit)} disabled={!canGoNext || loading}>Proximos</Button>
                </div>
              </div>
              {details.records.length === 0 ? (
                <div className="panel-empty">Nenhum produto registrado nos artefatos desta execucao.</div>
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
                        <th>Provider</th>
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
                          <td data-label="Provider">{detailValue(record.provider)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="analytics-panel reveal">
              <div className="analytics-panel-head">
                <div>
                  <span className="section-kicker">Logs</span>
                  <h3>Saida do dispatcher</h3>
                </div>
              </div>
              <div className="crawler-run-log-meta">
                <span><strong>Log:</strong> {details.logPath || '--'}</span>
                <span><strong>Result:</strong> {details.resultPath || '--'}</span>
              </div>
              <pre className="crawler-run-log-viewer">{details.logText || 'Nenhum log salvo para esta execucao.'}</pre>
            </section>
          </>
        ) : null}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminCrawlerRunDetails;
