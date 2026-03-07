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

const formatDateTime = (value?: string | null) => {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleString('pt-BR');
};

const formatConfidence = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return `${(Number(value) * 100).toFixed(0)}%`;
};

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
  const [provider, setProvider] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<CatalogRow | null>(null);

  const rows = pageData?.content || [];
  const totalPages = pageData?.totalPages ?? 0;
  const totalElements = pageData?.totalElements ?? 0;

  const providerCount = useMemo(() => {
    const values = new Set(rows.map((row) => row.provider).filter(Boolean));
    return values.size;
  }, [rows]);

  const highConfidence = useMemo(
    () => rows.filter((row) => Number(row.confidenceScore || 0) >= 0.9).length,
    [rows]
  );

  useEffect(() => {
    if (!selectedProduct) return undefined;
    const originalOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedProduct(null);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedProduct]);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/v1/admin/catalog/products', {
        params: {
          page,
          size,
          provider: provider || undefined,
          search: search || undefined,
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
  }, [role, page, size, provider, search]);

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
      <div className="page analytics-page catalog-admin-page">
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Admin</span>
            <h1 className="analytics-hero-title">Catalogo global de produtos</h1>
            <p className="analytics-hero-text">
              Esta tela mostra todos os produtos enriquecidos por fontes web e capturas externas, incluindo o lote extraido do InfoPrice.
            </p>
            <div className="hero-chip-row">
              <span className="hero-chip">{totalElements} registros</span>
              <span className="hero-chip">{providerCount} provedores na pagina</span>
              <span className="hero-chip">{highConfidence} com confianca alta</span>
            </div>
          </div>
          <div className="analytics-hero-board single-board">
            <div className="hero-focus-card primary">
              <span className="section-kicker">Fonte selecionada</span>
              <h3>{provider || 'TODAS'}</h3>
              <strong>{rows.length}</strong>
              <p>itens retornados nesta pagina de consulta.</p>
            </div>
          </div>
        </section>

        <div className="metrics-grid analytics-metrics-grid">
          <MetricsCard title="Total no banco" value={totalElements} icon="DB" caption="catalogo enriquecido" />
          <MetricsCard title="Itens na pagina" value={rows.length} icon="PG" caption="retorno atual" />
          <MetricsCard title="Confianca alta" value={highConfidence} icon="CF" caption="score >= 90%" />
          <MetricsCard title="Fontes" value={providerCount} icon="SRC" caption="provedores exibidos" />
        </div>

        <section className="analytics-panel reveal">
          <div className="analytics-panel-head">
            <div>
              <span className="section-kicker">Filtros</span>
              <h3>Refinar catalogo</h3>
            </div>
          </div>
          <div className="filter-bar-controls catalog-admin-filters-grid">
            <select
              className="input"
              value={provider}
              onChange={(e) => {
                setPage(0);
                setProvider(e.target.value);
              }}
            >
              <option value="">Todas as fontes</option>
              <option value="INFOPRICE_ISA">INFOPRICE_ISA</option>
              <option value="OPEN_FOOD_FACTS_BR">OPEN_FOOD_FACTS_BR</option>
              <option value="OPEN_BEAUTY_FACTS_BR">OPEN_BEAUTY_FACTS_BR</option>
              <option value="OPEN_PRODUCTS_FACTS_BR">OPEN_PRODUCTS_FACTS_BR</option>
            </select>

            <input
              className="input"
              placeholder="Buscar por nome, GTIN ou marca"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />

            <Button
              onClick={() => {
                setPage(0);
                setSearch(searchInput.trim());
              }}
            >
              Buscar
            </Button>

            <Button
              variant="secondary"
              onClick={() => {
                setPage(0);
                setSearchInput('');
                setSearch('');
              }}
            >
              Limpar
            </Button>
          </div>
        </section>

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
                      <th>Fonte</th>
                      <th>Confianca</th>
                      <th>Atualizado</th>
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
                        <td data-label="Fonte">{textValue(row.provider)}</td>
                        <td data-label="Confianca">{formatConfidence(row.confidenceScore)}</td>
                        <td data-label="Atualizado">{formatDateTime(row.lastVerifiedAt || row.fetchedAt)}</td>
                        <td data-label="Acoes" className="table-action-cell">
                          <Button
                            type="button"
                            variant="secondary"
                            className="catalog-admin-view-button"
                            onClick={() => setSelectedProduct(row)}
                          >
                            <EyeIcon />
                            <span>Ver</span>
                          </Button>
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
          <div className="catalog-admin-modal-backdrop" role="presentation" onClick={() => setSelectedProduct(null)}>
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
                <Button type="button" variant="secondary" onClick={() => setSelectedProduct(null)}>
                  Fechar
                </Button>
              </div>

              <div className="catalog-admin-modal-body">
                <div className="catalog-admin-modal-media">
                  {selectedProduct.imageUrl ? (
                    <img
                      className="catalog-admin-modal-image"
                      src={selectedProduct.imageUrl}
                      alt={selectedProduct.canonicalName}
                    />
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
                    <span>Fonte</span>
                    <strong>{textValue(selectedProduct.provider)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Confianca</span>
                    <strong>{formatConfidence(selectedProduct.confidenceScore)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Observacoes</span>
                    <strong>{selectedProduct.observationCount ?? '--'}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Coletado em</span>
                    <strong>{formatDateTime(selectedProduct.fetchedAt)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Verificado em</span>
                    <strong>{formatDateTime(selectedProduct.lastVerifiedAt)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Product ID</span>
                    <strong>{textValue(selectedProduct.productId)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item catalog-admin-detail-item-wide">
                    <span>Enrichment ID</span>
                    <strong>{textValue(selectedProduct.enrichmentId)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item catalog-admin-detail-item-wide">
                    <span>Licenca da fonte</span>
                    <strong>{textValue(selectedProduct.sourceLicense)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item catalog-admin-detail-item-wide">
                    <span>URL da imagem</span>
                    {selectedProduct.imageUrl ? (
                      <a href={selectedProduct.imageUrl} target="_blank" rel="noreferrer">
                        {selectedProduct.imageUrl}
                      </a>
                    ) : (
                      <strong>--</strong>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default CatalogAdmin;
