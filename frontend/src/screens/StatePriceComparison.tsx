import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Button from '../components/common/Button';
import Layout from '../components/layout/Layout';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import MetricsCard from '../components/dashboard/MetricsCard';
import PanelSection from '../components/dashboard/PanelSection';
import PageHero from '../components/dashboard/PageHero';
import { statePriceService, StatePriceImportRequest, StatePriceProductDetail, StatePriceProductSummary, StatePriceSource } from '../services/state-price.service';

type Filters = {
  search: string;
  state: string;
  provider: string;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  state: '',
  provider: '',
};

const moneyFormat = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const textValue = (value?: string | null) => {
  if (!value) return '--';
  const normalized = value.trim();
  return normalized || '--';
};

const formatMoney = (value?: string | number | null) => {
  if (value == null || value === '') return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return moneyFormat.format(numeric);
};

const formatDate = (value?: string | null) => {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleString('pt-BR');
};

const StatePriceComparisonContent: React.FC = () => {
  const location = useLocation();
  const [stats, setStats] = useState<any>(null);
  const [sources, setSources] = useState<StatePriceSource[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [pageData, setPageData] = useState<{ content: StatePriceProductSummary[]; totalPages: number; totalElements: number; number: number } | null>(null);
  const [details, setDetails] = useState<StatePriceProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [importPayload, setImportPayload] = useState('');
  const [importing, setImporting] = useState(false);

  const selectedSummary = details?.summary || null;

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [statsData, sourcesData, statesData, productsData] = await Promise.all([
        statePriceService.getStats(),
        statePriceService.listSources(),
        statePriceService.listStates(),
        statePriceService.searchProducts({
          search: filters.search,
          state: filters.state,
          provider: filters.provider,
          page,
          size: 20,
        }),
      ]);
      setStats(statsData);
      setSources(sourcesData);
      setStates(statesData);
      setPageData(productsData);
      setError(null);
      if (selectedProductId && !productsData.content.some((item) => item.productId === selectedProductId)) {
        setSelectedProductId(productsData.content[0]?.productId || null);
      } else if (!selectedProductId && productsData.content[0]?.productId) {
        setSelectedProductId(productsData.content[0].productId);
      }
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar os precos estaduais');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (productId: string) => {
    setDetailLoading(true);
    try {
      const response = await statePriceService.getProductDetail(productId);
      setDetails(response);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar o detalhe do produto');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadOverview().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search, filters.state, filters.provider, page]);

  useEffect(() => {
    if (!selectedProductId) {
      setDetails(null);
      return;
    }
    loadDetail(selectedProductId).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId]);

  useEffect(() => {
    if (!selectedSummary) return;
    setImportPayload(JSON.stringify({
      provider: selectedSummary.bestSourceProvider || 'MENOR_PRECO_PR',
      name: selectedSummary.bestSourceName || 'Portal estadual',
      stateCode: selectedSummary.bestState || 'PR',
      serviceName: selectedSummary.bestSourceName || 'Portal estadual',
      serviceUrl: '',
      coverageStates: selectedSummary.bestState || '',
      notes: 'Importacao manual via painel',
      observations: [
        {
          productName: selectedSummary.productName,
          gtin: selectedSummary.gtin || '',
          observedState: selectedSummary.bestState || 'PR',
          observedCity: selectedSummary.bestCity || '',
          observedStore: selectedSummary.bestStore || '',
          providerProductId: selectedSummary.gtin || selectedSummary.productId,
          price: selectedSummary.bestPrice || '0.00',
          observedAt: selectedSummary.bestObservedAt || new Date().toISOString(),
        },
      ],
    }, null, 2));
  }, [selectedSummary]);

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (filters.search) chips.push(`Busca: ${filters.search}`);
    if (filters.state) chips.push(`Estado: ${filters.state}`);
    if (filters.provider) chips.push(`Fonte: ${filters.provider}`);
    return chips;
  }, [filters]);

  const applyFilters = () => {
    setPage(0);
    setFilters({
      search: draftFilters.search.trim(),
      state: draftFilters.state.trim().toUpperCase(),
      provider: draftFilters.provider.trim().toUpperCase(),
    });
  };

  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(0);
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const parsed = JSON.parse(importPayload) as StatePriceImportRequest;
      if (!parsed.provider?.trim()) {
        throw new Error('Provider obrigatorio no payload');
      }
      if (!Array.isArray(parsed.observations) || parsed.observations.length === 0) {
        throw new Error('Informe ao menos uma observacao');
      }
      const response = await statePriceService.importObservations(parsed);
      setSuccess(`Importacao concluida: ${response.importedObservations} observacoes, ${response.createdProducts} novos produtos.`);
      await loadOverview();
    } catch (err: any) {
      setError(err?.message || 'Falha ao importar lote de precos');
    } finally {
      setImporting(false);
    }
  };

  const refresh = async () => {
    await loadOverview();
    if (selectedProductId) {
      await loadDetail(selectedProductId);
    }
  };

  const LayoutComponent = location.pathname.startsWith('/super-admin') ? SuperAdminLayout : Layout;

  return (
    <LayoutComponent>
      <div className="page analytics-page state-price-page">
        <PageHero
          badge="Preco estadual"
          title="Comparacao nacional de precos praticados"
          description="Consulte produtos capturados dos portais estaduais, compare o menor e o maior preco por estado e carregue novos lotes de observacao para alimentar a base unificada."
          actions={
            <>
              <Button variant="secondary" onClick={clearFilters}>Limpar filtros</Button>
              <Button variant="secondary" onClick={refresh} disabled={loading || detailLoading || importing}>
                {loading ? 'Atualizando...' : 'Atualizar'}
              </Button>
            </>
          }
          feature={
            <div className="state-price-hero-panel">
              <article className="dashboard-glow-card">
                <span className="section-kicker">Base operacional</span>
                <strong>{stats ? `${stats.totalProducts || 0} produtos únicos` : 'Carregando'}</strong>
                <p>{stats ? `${stats.totalObservations || 0} observacoes em ${stats.totalStates || 0} estados` : 'Sincronizando indicadores'}</p>
              </article>
              <div className="dashboard-command-mosaic">
                <article className="dashboard-mini-tile"><span>Fontes</span><strong>{stats?.totalSources ?? '--'}</strong></article>
                <article className="dashboard-mini-tile"><span>Produtos</span><strong>{stats?.totalProducts ?? '--'}</strong></article>
                <article className="dashboard-mini-tile"><span>Estados</span><strong>{stats?.totalStates ?? '--'}</strong></article>
              </div>
            </div>
          }
        />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-green-600">{success}</p> : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricsCard title="Produtos únicos" value={stats?.totalProducts ?? 0} icon="PR" />
          <MetricsCard title="Observações" value={stats?.totalObservations ?? 0} icon="OB" variant="warning" />
          <MetricsCard title="Fontes ativas" value={stats?.totalSources ?? 0} icon="SF" />
          <MetricsCard title="Estados cobertos" value={stats?.totalStates ?? 0} icon="UF" />
        </section>

        <div className="state-price-layout">
          <div className="state-price-main">
            <PanelSection kicker="Busca e comparacao" title="Pesquisar por produto, estado ou fonte">
              <div className="state-price-filters">
                <input
                  className="input"
                  placeholder="Nome, GTIN ou marca"
                  value={draftFilters.search}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
                />
                <select
                  className="input"
                  value={draftFilters.state}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, state: event.target.value }))}
                >
                  <option value="">Todos os estados</option>
                  {states.map((state) => <option key={state} value={state}>{state}</option>)}
                </select>
                <select
                  className="input"
                  value={draftFilters.provider}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, provider: event.target.value }))}
                >
                  <option value="">Todas as fontes</option>
                  {sources.map((source) => <option key={source.provider} value={source.provider}>{source.provider}</option>)}
                </select>
                <div className="state-price-filter-actions">
                  <Button onClick={applyFilters}>Aplicar</Button>
                  <Button variant="secondary" onClick={clearFilters}>Limpar</Button>
                </div>
              </div>

              {activeFilterChips.length > 0 ? (
                <div className="state-price-active-filters">
                  {activeFilterChips.map((chip) => (
                    <span key={chip} className="catalog-admin-active-filter-chip">{chip}</span>
                  ))}
                </div>
              ) : null}

              {loading && !pageData ? <div className="panel-empty">Carregando comparacao estadual...</div> : null}

              {!loading && pageData ? (
                <>
                  <div className="state-price-results-meta">
                    <span>{pageData.totalElements} produtos encontrados</span>
                    <span>Pagina {pageData.number + 1} de {Math.max(pageData.totalPages, 1)}</span>
                  </div>
                  <div className="state-price-table-wrap">
                    <table className="table state-price-table">
                      <thead>
                        <tr>
                          <th>Produto</th>
                          <th>Menor</th>
                          <th>Maior</th>
                          <th>Estados</th>
                          <th>Fontes</th>
                          <th>Atualizado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageData.content.map((row) => (
                          <tr
                            key={row.productId}
                            className={row.productId === selectedProductId ? 'is-selected' : ''}
                            onClick={() => setSelectedProductId(row.productId)}
                            role="button"
                            tabIndex={0}
                          >
                            <td data-label="Produto">
                              <div className="state-price-product-cell">
                                <strong>{row.productName}</strong>
                                <span>{textValue(row.gtin)}</span>
                                <span>{textValue(row.brand)} {row.category ? `• ${row.category}` : ''}</span>
                              </div>
                            </td>
                            <td data-label="Menor">
                              <strong>{formatMoney(row.lowestPrice)}</strong>
                              <span>{textValue(row.bestState)} {row.bestCity ? `• ${row.bestCity}` : ''}</span>
                            </td>
                            <td data-label="Maior">
                              <strong>{formatMoney(row.highestPrice)}</strong>
                              <span>{textValue(row.worstState)} {row.worstCity ? `• ${row.worstCity}` : ''}</span>
                            </td>
                            <td data-label="Estados">{row.stateCount}</td>
                            <td data-label="Fontes">{row.sourceCount}</td>
                            <td data-label="Atualizado">{formatDate(row.latestObservedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {!loading && pageData ? (
                <div className="crawler-run-pagination state-price-pagination">
                  <Button variant="secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page <= 0}>
                    Anterior
                  </Button>
                  <Button variant="secondary" onClick={() => setPage((value) => value + 1)} disabled={page >= Math.max(pageData.totalPages - 1, 0)}>
                    Proxima
                  </Button>
                </div>
              ) : null}
            </PanelSection>
          </div>

          <div className="state-price-aside">
            <PanelSection kicker="Detalhe" title="Comparacao do produto selecionado">
              {detailLoading && !details ? <div className="panel-empty">Carregando detalhe...</div> : null}
              {details ? (
                <div className="state-price-detail-card">
                  <div className="state-price-detail-header">
                    <strong>{details.summary.productName}</strong>
                    <span>{textValue(details.summary.gtin)}</span>
                  </div>
                  <div className="dashboard-stat-list">
                    <div className="dashboard-stat-row"><span>Menor preco</span><strong>{formatMoney(details.summary.lowestPrice)}</strong></div>
                    <div className="dashboard-stat-row"><span>Maior preco</span><strong>{formatMoney(details.summary.highestPrice)}</strong></div>
                    <div className="dashboard-stat-row"><span>Media</span><strong>{formatMoney(details.summary.averagePrice)}</strong></div>
                    <div className="dashboard-stat-row"><span>Observacoes</span><strong>{details.summary.observationCount}</strong></div>
                    <div className="dashboard-stat-row"><span>Estados</span><strong>{details.summary.stateCount}</strong></div>
                  </div>
                  <div className="state-price-best-worst">
                    <article className="state-price-note">
                      <span className="section-kicker">Melhor</span>
                      <strong>{formatMoney(details.summary.bestPrice)}</strong>
                      <p>{textValue(details.summary.bestState)} • {textValue(details.summary.bestCity)}</p>
                      <p>{textValue(details.summary.bestSourceName)}</p>
                    </article>
                    <article className="state-price-note">
                      <span className="section-kicker">Pior</span>
                      <strong>{formatMoney(details.summary.worstPrice)}</strong>
                      <p>{textValue(details.summary.worstState)} • {textValue(details.summary.worstCity)}</p>
                      <p>{textValue(details.summary.worstSourceName)}</p>
                    </article>
                  </div>
                  <div className="state-price-observation-list">
                    {details.observations.map((item) => (
                      <article key={item.observationId} className="state-price-observation-item">
                        <strong>{formatMoney(item.price)}</strong>
                        <span>{item.observedState}{item.observedCity ? ` • ${item.observedCity}` : ''}</span>
                        <span>{textValue(item.observedStore)}</span>
                        <span>{formatDate(item.observedAt)}</span>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="panel-empty">Selecione um produto para ver a comparacao estadual.</div>
              )}
            </PanelSection>

            <PanelSection kicker="Importacao" title="Injetar lote manual">
              <div className="state-price-import-box">
                <p className="state-price-import-help">
                  Cole um JSON com `provider` e `observations`. O backend faz o upsert da fonte e persiste as observacoes em lote.
                </p>
                <textarea
                  className="input state-price-import-textarea"
                  value={importPayload}
                  onChange={(event) => setImportPayload(event.target.value)}
                  rows={16}
                />
                <div className="state-price-filter-actions">
                  <Button variant="secondary" onClick={() => setImportPayload(JSON.stringify({
                    provider: 'MENOR_PRECO_PR',
                    name: 'Menor Preco Parana',
                    stateCode: 'PR',
                    serviceName: 'Menor Preco / Nota Parana',
                    serviceUrl: 'https://menorpreco.notaparana.pr.gov.br/',
                    coverageStates: 'PR',
                    notes: 'Exemplo de importacao manual',
                    observations: [
                      {
                        productName: 'Produto exemplo',
                        gtin: '0000000000000',
                        observedState: 'PR',
                        observedCity: 'Curitiba',
                        observedStore: 'Loja exemplo',
                        providerProductId: 'EXAMPLE-001',
                        price: '0.00',
                        observedAt: new Date().toISOString(),
                      },
                    ],
                  }, null, 2))}>
                    Exemplo
                  </Button>
                  <Button onClick={handleImport} disabled={importing || !importPayload.trim()}>
                    {importing ? 'Importando...' : 'Importar lote'}
                  </Button>
                </div>
              </div>
            </PanelSection>

            <PanelSection kicker="Fontes" title="Servicos ativos">
              <div className="state-price-source-grid">
                {sources.map((source) => (
                  <article key={source.id} className="state-price-source-card">
                    <strong>{source.name}</strong>
                    <span>{source.provider}</span>
                    <span>{source.stateCode || source.coverageStates || '--'}</span>
                    <span>{source.observationCount} observacoes</span>
                    <span>{formatDate(source.latestObservedAt)}</span>
                  </article>
                ))}
              </div>
            </PanelSection>
          </div>
        </div>
      </div>
    </LayoutComponent>
  );
};

export default StatePriceComparisonContent;
