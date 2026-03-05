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
  provider: string;
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

const formatDateTime = (value?: string | null) => {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleString('pt-BR');
};

const formatConfidence = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return `${(Number(value) * 100).toFixed(0)}%`;
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
          <div className="filter-bar-controls" style={{ gridTemplateColumns: '220px minmax(280px, 1fr) auto auto' }}>
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
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.enrichmentId}>
                        <td>
                          <strong>{row.canonicalName || '--'}</strong>
                          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{row.packageDescription || '--'}</div>
                        </td>
                        <td>{row.gtin || '--'}</td>
                        <td>{row.brand || '--'}</td>
                        <td>{row.category || '--'}</td>
                        <td>{row.provider || '--'}</td>
                        <td>{formatConfidence(row.confidenceScore)}</td>
                        <td>{formatDateTime(row.lastVerifiedAt || row.fetchedAt)}</td>
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
            <div className="pager-actions">
              <Button variant="secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page <= 0}>
                Anterior
              </Button>
              <Button variant="secondary" onClick={() => setPage((value) => value + 1)} disabled={totalPages === 0 || page >= totalPages - 1}>
                Proxima
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default CatalogAdmin;
