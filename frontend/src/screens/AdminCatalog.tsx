import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHeader from '../components/layout/PageHeader';
import PanelSection from '../components/dashboard/PanelSection';
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
          imageStatus: filters.imageStatus !== 'ALL' ?filters.imageStatus : undefined,
        },
      });
      setPageData(response.data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar catálogo global');
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
            Apenas administradores podem acessar o catálogo global.
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page analytics-page catalog-admin-page admin-catalog-page">
        <PageHeader
          title="Catálogo global"
          subtitle="Consulta e manutenção da base enriquecida."
        />

        <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <MetricsCard title="Total no banco" value={totalElements} icon="DB" />
          <MetricsCard title="Na página" value={rows.length} icon="PG" />
          <MetricsCard title="Com imagem" value={withImageCount} icon="IM" />
          <MetricsCard title="Marcas" value={brandCount} icon="BR" />
        </div>

        {/* Filtros */}
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
            <Button variant="secondary" onClick={clearFilters}>Limpar</Button>
          </div>
        </div>
        {activeFilterChips.length > 0 ?(
          <div className="catalog-admin-active-filters" aria-label="Filtros ativos">
            {activeFilterChips.map((chip) => (
              <span key={chip} className="catalog-admin-active-filter-chip">
                {chip}
              </span>
            ))}
          </div>
        ) : null}

        {error ? <PanelSection reveal={false} className="text-[color:var(--danger)]">{error}</PanelSection> : null}

        {loading ?(
          <div className="card">Carregando catálogo...</div>
        ) : (
          <PanelSection kicker="Resultados" title={`Produtos enriquecidos (${totalElements})`}>

            {rows.length === 0 ?(
              <div className="panel-empty">Nenhum item para os filtros atuais.</div>
            ) : (
              <div className="catalog-admin-table-wrap">
                <table className="table catalog-admin-table catalog-admin-products-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>GTIN</th>
                      <th>Marca</th>
                      <th>Categoria</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.enrichmentId}>
                        <td data-label="Produto">
                          <div className="catalog-admin-product-cell">
                            {row.imageUrl ?(
                              <button
                                type="button"
                                className="catalog-admin-thumb-button"
                                onClick={() =>
                                  setLightboxImage({
                                    src: row.imageUrl as string,
                                    alt: row.canonicalName || 'Imagem do produto',
                                  })
                                }
                                aria-label={`Ampliar imagem de ${row.canonicalName || 'produto'}`}
                                title="Ampliar imagem"
                              >
                                <img className="catalog-admin-thumb" src={row.imageUrl} alt={row.canonicalName} loading="lazy" />
                              </button>
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
                        <td data-label="Ações" className="table-action-cell catalog-admin-action-cell">
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
          </PanelSection>
        )}

        {!loading && pageData ?(
          <PanelSection className="pager-panel" kicker="Paginação" title={`Página ${pageData.number + 1} de ${Math.max(totalPages, 1)}`}>
            <div className="pager-actions admin-pager-actions">
              <Button variant="secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page <= 0}>
                Anterior
              </Button>
              <Button variant="secondary" onClick={() => setPage((value) => value + 1)} disabled={totalPages === 0 || page >= totalPages - 1}>
                Próxima
              </Button>
            </div>
          </PanelSection>
        ) : null}

        {selectedProduct ?(
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
                  {selectedProduct.imageUrl ?(
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
                    <span>Observações</span>
                    <strong>{selectedProduct.observationCount ?? '--'}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {lightboxImage ?(
          <div className="catalog-admin-lightbox-backdrop" role="presentation" onClick={() => setLightboxImage(null)}>
            <div className="catalog-admin-lightbox-frame" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="catalog-admin-lightbox-close"
                onClick={() => setLightboxImage(null)}
                aria-label="Fechar visualização ampliada"
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
