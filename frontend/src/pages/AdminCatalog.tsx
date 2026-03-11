import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import MetricsCard from '../components/dashboard/MetricsCard';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

interface CatalogRow {
  enrichmentId: string;
  productId: string;
  gtin: string;
  canonicalName: string;
  brand?: string | null;
  category?: string | null;
  packageDescription?: string | null;
  unit?: string | null;
  imageUrl?: string | null;
  provider: string;
  sourceLicense?: string | null;
  confidenceScore?: number | null;
  fetchedAt?: string | null;
  lastVerifiedAt?: string | null;
  observationCount?: number | null;
}

interface PageResponse<T> {
  content: T[];
  totalPages: number;
  totalElements: number;
  number: number;
  size: number;
}

type ImageStatus = 'ALL' | 'WITH_IMAGE' | 'WITHOUT_IMAGE';

interface CatalogFilters {
  search: string;
  brand: string;
  category: string;
  imageStatus: ImageStatus;
}

const EMPTY_FILTERS: CatalogFilters = {
  search: '',
  brand: '',
  category: '',
  imageStatus: 'ALL',
};

const IMAGE_STATUS_LABELS: Record<ImageStatus, string> = {
  ALL: 'Todos os produtos',
  WITH_IMAGE: 'Somente com imagem',
  WITHOUT_IMAGE: 'Somente sem imagem',
};

const EyeIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <circle
      cx="12"
      cy="12"
      r="3"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  </svg>
);

const textValue = (value?: string | null) => {
  if (!value) return '--';
  const normalized = value.trim();
  return normalized || '--';
};

const CatalogAdmin: React.FC = () => {
  const { role } = useAuth();
  const [pageData, setPageData] = useState<PageResponse<CatalogRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [size] = useState(50);
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [selectedProduct, setSelectedProduct] = useState<CatalogRow | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);

  const rows = pageData?.content || [];
  const totalPages = pageData?.totalPages ?? 0;
  const totalElements = pageData?.totalElements ?? 0;

  const brandCount = useMemo(() => {
    const values = new Set(rows.map((row) => textValue(row.brand)).filter((value) => value !== '--'));
    return values.size;
  }, [rows]);

  const categoryCount = useMemo(() => {
    const values = new Set(rows.map((row) => textValue(row.category)).filter((value) => value !== '--'));
    return values.size;
  }, [rows]);

  const withImageCount = useMemo(() => rows.filter((row) => Boolean(row.imageUrl)).length, [rows]);

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (filters.search) {
      chips.push(`Busca: ${filters.search}`);
    }
    if (filters.brand) {
      chips.push(`Marca: ${filters.brand}`);
    }
    if (filters.category) {
      chips.push(`Categoria: ${filters.category}`);
    }
    if (filters.imageStatus !== 'ALL') {
      chips.push(IMAGE_STATUS_LABELS[filters.imageStatus]);
    }
    return chips;
  }, [filters]);

  const closeProductModal = () => {
    setSelectedProduct(null);
    setLightboxImage(null);
  };

  useEffect(() => {
    if (!selectedProduct && !lightboxImage) return undefined;
    const originalOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (lightboxImage) {
          setLightboxImage(null);
          return;
        }
        closeProductModal();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lightboxImage, selectedProduct]);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/v1/admin/catalog/products', {
        params: {
          page,
          size,
          search: filters.search || undefined,
          brand: filters.brand || undefined,
          category: filters.category || undefined,
          imageStatus: filters.imageStatus !== 'ALL' ? filters.imageStatus : undefined,
        },
      });
      setPageData(response.data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar catalogo global');
      setPageData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role !== 'ADMIN') {
      setLoading(false);
      return;
    }
    loadData();
  }, [role, page, size, filters.search, filters.brand, filters.category, filters.imageStatus]);

  const applyFilters = () => {
    setPage(0);
    setFilters({
      search: draftFilters.search.trim(),
      brand: draftFilters.brand.trim(),
      category: draftFilters.category.trim(),
      imageStatus: draftFilters.imageStatus,
    });
  };

  const clearFilters = () => {
    setPage(0);
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  };

  const handleFilterKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      applyFilters();
    }
  };

  if (role !== 'ADMIN') {
    return (
      <Layout>
        <div className="page analytics-page">
          <div className="card" style={{ color: 'var(--danger)' }}>
            Apenas administradores podem acessar o catalogo global.
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page analytics-page catalog-admin-page admin-catalog-page">
        <section className="dashboard-command-grid reveal">
          <article className="dashboard-command-card">
            <div className="dashboard-command-copy">
              <span className="pill">Admin</span>
              <h1 className="dashboard-command-title">Catalogo global em uma leitura mais direta para manutencao e consulta.</h1>
              <p className="dashboard-command-text">
                O foco desta pagina agora fica no que interessa para o operador: volume da base, cobertura de imagem, recorte atual e filtros funcionais por produto.
              </p>
            </div>

            <div className="dashboard-command-showcase">
              <div className="dashboard-glow-card">
                <span className="section-kicker">Recorte atual</span>
                <h3>{IMAGE_STATUS_LABELS[filters.imageStatus]}</h3>
                <strong>{rows.length}</strong>
                <p>{activeFilterChips.length > 0 ? `${activeFilterChips.length} filtros ativos nesta consulta.` : 'Sem filtros adicionais aplicados.'}</p>
              </div>

              <div className="dashboard-command-mosaic">
                <div className="dashboard-mini-tile">
                  <span>Base total</span>
                  <strong>{totalElements}</strong>
                  <small>produtos enriquecidos no catalogo global</small>
                </div>
                <div className="dashboard-mini-tile">
                  <span>Imagens nesta pagina</span>
                  <strong>{withImageCount}</strong>
                  <small>itens prontos para exibicao</small>
                </div>
                <div className="dashboard-mini-tile accent">
                  <span>Categorias no recorte</span>
                  <strong>{categoryCount}</strong>
                  <small>{brandCount} marcas distintas visiveis</small>
                </div>
              </div>
            </div>
          </article>

          <aside className="dashboard-priority-rail">
            <div className="dashboard-priority-card dark">
              <span className="section-kicker">Objetivo da tela</span>
              <strong>Consultar sem ruido tecnico</strong>
              <p>Origem, confianca e outros dados internos saem do foco para que a leitura fique centrada no produto.</p>
            </div>
            <div className="dashboard-priority-card">
              <span className="section-kicker">Pagina atual</span>
              <strong>{page + 1} de {Math.max(totalPages, 1)}</strong>
              <p>{rows.length} itens retornados nesta pagina, com paginação pronta para navegar o restante.</p>
            </div>
          </aside>
        </section>

        <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <MetricsCard title="Total no banco" value={totalElements} icon="DB" caption="catalogo enriquecido" />
          <MetricsCard title="Itens na pagina" value={rows.length} icon="PG" caption="retorno atual" />
          <MetricsCard title="Com imagem" value={withImageCount} icon="IM" caption="prontos para exibicao" />
          <MetricsCard title="Marcas na pagina" value={brandCount} icon="BR" caption="variedade no recorte" />
        </div>

        <div className="dashboard-page-grid">
          <section className="analytics-panel reveal dashboard-form-panel">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Filtros</span>
                <h3>Refinar por informacoes do produto</h3>
              </div>
            </div>
            <div className="filter-bar-controls catalog-admin-filters-grid">
              <input
                className="input"
                placeholder="Buscar por nome ou GTIN"
                value={draftFilters.search}
                onChange={(e) => setDraftFilters((current) => ({ ...current, search: e.target.value }))}
                onKeyDown={handleFilterKeyDown}
              />

              <input
                className="input"
                placeholder="Filtrar por marca"
                value={draftFilters.brand}
                onChange={(e) => setDraftFilters((current) => ({ ...current, brand: e.target.value }))}
                onKeyDown={handleFilterKeyDown}
              />

              <input
                className="input"
                placeholder="Filtrar por categoria"
                value={draftFilters.category}
                onChange={(e) => setDraftFilters((current) => ({ ...current, category: e.target.value }))}
                onKeyDown={handleFilterKeyDown}
              />

              <select
                className="input"
                value={draftFilters.imageStatus}
                onChange={(e) =>
                  setDraftFilters((current) => ({
                    ...current,
                    imageStatus: e.target.value as ImageStatus,
                  }))
                }
              >
                <option value="ALL">Todos os produtos</option>
                <option value="WITH_IMAGE">Somente com imagem</option>
                <option value="WITHOUT_IMAGE">Somente sem imagem</option>
              </select>

              <div className="catalog-admin-filter-actions">
                <Button onClick={applyFilters}>Aplicar filtros</Button>
                <Button variant="secondary" onClick={clearFilters}>
                  Limpar
                </Button>
              </div>
            </div>
            {activeFilterChips.length > 0 ? (
              <div className="catalog-admin-active-filters" aria-label="Filtros ativos">
                {activeFilterChips.map((chip) => (
                  <span key={chip} className="catalog-admin-active-filter-chip">
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="analytics-panel reveal dashboard-note-card">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Leitura rapida</span>
                <h3>Como usar este catalogo</h3>
              </div>
            </div>
            <div className="dashboard-quick-list">
              <div className="dashboard-quick-item">
                <strong>Busque por nome ou GTIN</strong>
                <span>O filtro principal foi mantido centrado na consulta do produto, nao na origem tecnica.</span>
              </div>
              <div className="dashboard-quick-item">
                <strong>Use imagem como criterio de triagem</strong>
                <span>O status de imagem ajuda a localizar itens prontos para exibicao ou pendentes de tratamento.</span>
              </div>
              <div className="dashboard-quick-item">
                <strong>Abra o olho para validar detalhes</strong>
                <span>O modal mostra a versao consolidada do item sem sobrecarregar a tabela principal.</span>
              </div>
            </div>
          </section>
        </div>

        {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}

        {loading ? (
          <div className="card">Carregando catalogo...</div>
        ) : (
          <section className="analytics-panel reveal">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Resultados</span>
                <h3>Produtos enriquecidos</h3>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="panel-empty">Nenhum item para os filtros atuais.</div>
            ) : (
              <div className="catalog-admin-table-wrap">
                <table className="table catalog-admin-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>GTIN</th>
                      <th>Marca</th>
                      <th>Categoria</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.enrichmentId}>
                        <td data-label="Produto">
                          <div className="catalog-admin-product-cell">
                            {row.imageUrl ? (
                              <img className="catalog-admin-thumb" src={row.imageUrl} alt={row.canonicalName} loading="lazy" />
                            ) : (
                              <div className="catalog-admin-thumb placeholder">Sem imagem</div>
                            )}
                            <div className="catalog-admin-product-copy">
                              <strong>{row.canonicalName || '--'}</strong>
                              <span>{textValue(row.packageDescription)}</span>
                              <span>Unidade: {textValue(row.unit)}</span>
                            </div>
                          </div>
                        </td>
                        <td data-label="GTIN">{textValue(row.gtin)}</td>
                        <td data-label="Marca">{textValue(row.brand)}</td>
                        <td data-label="Categoria">{textValue(row.category)}</td>
                        <td data-label="Acoes" className="table-action-cell catalog-admin-action-cell">
                          <button
                            type="button"
                            className="catalog-admin-view-button"
                            onClick={() => {
                              setSelectedProduct(row);
                              setLightboxImage(null);
                            }}
                            aria-label={`Visualizar detalhes de ${row.canonicalName || 'produto'}`}
                            title="Visualizar detalhes"
                          >
                            <EyeIcon />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {!loading && pageData ? (
          <div className="analytics-panel pager-panel reveal">
            <div>
              <span className="section-kicker">Paginacao</span>
              <h3>Pagina {pageData.number + 1} de {Math.max(totalPages, 1)}</h3>
            </div>
            <div className="pager-actions admin-pager-actions">
              <Button variant="secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page <= 0}>
                Anterior
              </Button>
              <Button variant="secondary" onClick={() => setPage((value) => value + 1)} disabled={totalPages === 0 || page >= totalPages - 1}>
                Proxima
              </Button>
            </div>
          </div>
        ) : null}

        {selectedProduct ? (
          <div className="catalog-admin-modal-backdrop" role="presentation" onClick={closeProductModal}>
            <div
              className="catalog-admin-modal card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="catalog-admin-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="catalog-admin-modal-head">
                <div>
                  <span className="section-kicker">Produto global</span>
                  <h3 id="catalog-admin-modal-title">{selectedProduct.canonicalName || '--'}</h3>
                </div>
                <Button type="button" variant="secondary" onClick={closeProductModal}>
                  Fechar
                </Button>
              </div>

              <div className="catalog-admin-modal-body">
                <div className="catalog-admin-modal-media">
                  {selectedProduct.imageUrl ? (
                    <>
                      <button
                        type="button"
                        className="catalog-admin-modal-image-button"
                        onClick={() =>
                          setLightboxImage({
                            src: selectedProduct.imageUrl as string,
                            alt: selectedProduct.canonicalName || 'Imagem do produto',
                          })
                        }
                        aria-label="Ampliar imagem do produto"
                      >
                        <img
                          className="catalog-admin-modal-image"
                          src={selectedProduct.imageUrl}
                          alt={selectedProduct.canonicalName}
                        />
                      </button>
                      <span className="catalog-admin-image-hint">Clique na imagem para ampliar</span>
                    </>
                  ) : (
                    <div className="catalog-admin-modal-image placeholder">Sem imagem cadastrada</div>
                  )}
                </div>

                <div className="catalog-admin-detail-grid">
                  <div className="catalog-admin-detail-item">
                    <span>GTIN</span>
                    <strong>{textValue(selectedProduct.gtin)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Nome</span>
                    <strong>{textValue(selectedProduct.canonicalName)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Marca</span>
                    <strong>{textValue(selectedProduct.brand)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Categoria</span>
                    <strong>{textValue(selectedProduct.category)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Embalagem</span>
                    <strong>{textValue(selectedProduct.packageDescription)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Unidade</span>
                    <strong>{textValue(selectedProduct.unit)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Observacoes</span>
                    <strong>{selectedProduct.observationCount ?? '--'}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {lightboxImage ? (
          <div className="catalog-admin-lightbox-backdrop" role="presentation" onClick={() => setLightboxImage(null)}>
            <div className="catalog-admin-lightbox-frame" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="catalog-admin-lightbox-close"
                onClick={() => setLightboxImage(null)}
                aria-label="Fechar visualizacao ampliada"
              >
                ×
              </button>
              <img className="catalog-admin-lightbox-image" src={lightboxImage.src} alt={lightboxImage.alt} />
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default CatalogAdmin;
