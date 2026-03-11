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
        <section className="dashboard-command-grid reveal super-admin-command-grid">
          <article className="dashboard-command-card">
            <div className="dashboard-command-copy">
              <span className="pill">Crawler manual</span>
              <h1 className="dashboard-command-title">Detalhes operacionais da execucao.</h1>
              <p className="dashboard-command-text">
                Esta pagina concentra status, escopo, artefatos, amostra de produtos e logs para uma unica rodada de coleta manual.
              </p>
              <div className="hero-chip-row">
                <span className={`hero-chip status-${runStatusClass(details?.run?.status)}`}>{details?.run ? formatStatus(details.run.status) : 'Carregando'}</span>
                <span className="hero-chip">Run {runId}</span>
                <span className="hero-chip">{details?.active ? 'Atualizacao automatica ativa' : 'Rodada finalizada'}</span>
              </div>
            </div>

            <div className="dashboard-command-showcase">
              <article className="dashboard-glow-card">
                <span className="section-kicker">Resumo da rodada</span>
                <strong>{details?.run ? formatStatus(details.run.status) : 'Carregando'}</strong>
                <p>{details?.run?.message || 'Sem mensagem registrada.'}</p>
                <div className="hero-inline-actions">
                  <Link to="/super-admin/crawler" className="button secondary">Voltar para o crawler</Link>
                  <Button variant="secondary" onClick={() => load(offset)} disabled={loading}>{loading ? 'Atualizando...' : 'Atualizar'}</Button>
                </div>
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
            </div>
          </article>

          <aside className="dashboard-priority-rail">
            <article className="dashboard-priority-card">
              <span className="section-kicker">Escopo da rodada</span>
              <h3>{details?.run?.selectedCategories && details.run.selectedCategories.length > 0 ? 'Execucao filtrada por categoria' : 'Catalogo completo'}</h3>
              <p>
                {details?.run?.selectedCategories && details.run.selectedCategories.length > 0
                  ? details.run.selectedCategories.join(', ')
                  : 'A rodada varreu todo o catalogo configurado para o provider selecionado.'}
              </p>
            </article>
            <article className="dashboard-priority-card">
              <span className="section-kicker">Arquivos da rodada</span>
              <h3>Logs e artefatos ficam visiveis aqui.</h3>
              <p>Use esta tela para validar o que foi captado, o que entrou no catalogo e se houve erro em pagina, imagem ou importacao.</p>
            </article>
          </aside>
        </section>

        {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}
        {loading && !details ? <div className="card">Carregando detalhes...</div> : null}

        {details ? (
          <>
            <section className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
              <div className="metric-card metric-card-default reveal">
                <div className="metric-card-top"><span className="metric-card-title">Captados</span><span className="metric-card-icon">CP</span></div>
                <strong className="metric-card-value">{Number(details.run.scannedProducts || 0)}</strong>
                <div className="metric-card-bottom"><span className="metric-card-meta">produtos analisados</span></div>
              </div>
              <div className="metric-card metric-card-warning reveal">
                <div className="metric-card-top"><span className="metric-card-title">Importados</span><span className="metric-card-icon">IM</span></div>
                <strong className="metric-card-value">{Number(details.run.importedProducts || 0)}</strong>
                <div className="metric-card-bottom"><span className="metric-card-meta">itens enviados ao catalogo global</span></div>
              </div>
              <div className="metric-card metric-card-danger reveal">
                <div className="metric-card-top"><span className="metric-card-title">Erros</span><span className="metric-card-icon">ER</span></div>
                <strong className="metric-card-value">{Number(details.run.errors || 0)}</strong>
                <div className="metric-card-bottom"><span className="metric-card-meta">falhas registradas na rodada</span></div>
              </div>
              <div className="metric-card metric-card-default reveal">
                <div className="metric-card-top"><span className="metric-card-title">Escopo</span><span className="metric-card-icon">SC</span></div>
                <strong className="metric-card-value">{details.run.selectedCategories && details.run.selectedCategories.length > 0 ? details.run.selectedCategories.length : 'Completo'}</strong>
                <div className="metric-card-bottom"><span className="metric-card-meta">categorias selecionadas ou varredura completa</span></div>
              </div>
            </section>

            <div className="dashboard-page-grid">
              <section className="analytics-panel reveal dashboard-note-card">
                <span className="section-kicker">Metadados da rodada</span>
                <h3>Contexto principal da execucao</h3>
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
                    <span>Fonte</span>
                    <strong>{(details.run.sources || []).join(', ') || '--'}</strong>
                  </div>
                </div>
              </section>

              <section className="analytics-panel reveal dashboard-note-card">
                <span className="section-kicker">Artefatos</span>
                <h3>Arquivos salvos para auditoria</h3>
                <div className="dashboard-quick-list">
                  <div className="dashboard-quick-item">
                    <strong>Log</strong>
                    <span>{details.logPath || '--'}</span>
                  </div>
                  <div className="dashboard-quick-item">
                    <strong>Resultado</strong>
                    <span>{details.resultPath || '--'}</span>
                  </div>
                </div>
              </section>
            </div>

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
