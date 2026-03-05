import React, { useEffect, useState } from 'react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import Button from '../components/common/Button';
import api from '../services/api';

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
}

interface PageResponse<T> {
  content: T[];
  totalPages: number;
  number: number;
}

const EMPTY_FORM = {
  gtin: '',
  name: '',
  brand: '',
  category: '',
  packageDescription: '',
  unit: '',
  provider: 'MANUAL_SUPER_ADMIN',
  sourceLicense: 'Cadastro manual Super Admin',
  confidenceScore: '0.99',
};

const SuperAdminCatalogManager: React.FC = () => {
  const [rowsPage, setRowsPage] = useState<PageResponse<CatalogRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingProductId, setEditingProductId] = useState('');

  const rows = rowsPage?.content || [];

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get('/v1/super-admin/catalog/products', {
        params: {
          page,
          size: 25,
          search: search || undefined,
        },
      });
      setRowsPage(response.data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar catalogo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page]);

  const save = async () => {
    const payload = {
      ...form,
      confidenceScore: Number(form.confidenceScore),
    };
    if (editingProductId) {
      await api.put(`/v1/super-admin/catalog/products/${editingProductId}`, payload);
    } else {
      await api.post('/v1/super-admin/catalog/products', payload);
    }
    setForm(EMPTY_FORM);
    setEditingProductId('');
    await load();
  };

  const startEdit = (row: CatalogRow) => {
    setEditingProductId(row.productId);
    setForm({
      gtin: row.gtin || '',
      name: row.canonicalName || '',
      brand: row.brand || '',
      category: row.category || '',
      packageDescription: row.packageDescription || '',
      unit: '',
      provider: row.provider || 'MANUAL_SUPER_ADMIN',
      sourceLicense: 'Cadastro manual Super Admin',
      confidenceScore: String(row.confidenceScore ?? 0.99),
    });
  };

  return (
    <SuperAdminLayout>
      <div className="super-admin-page">
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Catalogo Global</span>
            <h1 className="analytics-hero-title">Criacao e edicao de produtos</h1>
            <p className="analytics-hero-text">Cadastre ou ajuste produtos da base global com GTIN padronizado para todos os clientes.</p>
          </div>
        </section>

        <section className="analytics-panel reveal">
          <div className="analytics-panel-head">
            <div>
              <span className="section-kicker">Cadastro manual</span>
              <h3>{editingProductId ? 'Editar produto' : 'Novo produto'}</h3>
            </div>
          </div>
          <div className="filter-bar-controls super-admin-form-grid">
            <input className="input" placeholder="GTIN (8-14 digitos)" value={form.gtin} onChange={(e) => setForm({ ...form, gtin: e.target.value })} />
            <input className="input" placeholder="Nome canonical" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="Marca" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            <input className="input" placeholder="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <input className="input" placeholder="Embalagem" value={form.packageDescription} onChange={(e) => setForm({ ...form, packageDescription: e.target.value })} />
            <input className="input" placeholder="Unidade" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <input className="input" placeholder="Provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
            <input className="input" placeholder="Confianca (0-1)" value={form.confidenceScore} onChange={(e) => setForm({ ...form, confidenceScore: e.target.value })} />
            <Button onClick={save}>{editingProductId ? 'Salvar alteracoes' : 'Criar produto'}</Button>
            {editingProductId ? <Button variant="secondary" onClick={() => { setEditingProductId(''); setForm(EMPTY_FORM); }}>Cancelar edicao</Button> : null}
          </div>
        </section>

        <section className="analytics-panel reveal">
          <div className="analytics-panel-head">
            <div>
              <span className="section-kicker">Consulta</span>
              <h3>Itens cadastrados</h3>
            </div>
          </div>
          <div className="filter-bar-controls">
            <input className="input" placeholder="Buscar por GTIN, nome, marca..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button onClick={() => { setPage(0); load(); }}>Buscar</Button>
          </div>
          {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}
          {loading ? (
            <div className="card">Carregando catalogo...</div>
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
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.enrichmentId}>
                      <td>{row.canonicalName}</td>
                      <td>{row.gtin || '--'}</td>
                      <td>{row.brand || '--'}</td>
                      <td>{row.category || '--'}</td>
                      <td>{row.provider}</td>
                      <td><Button variant="secondary" onClick={() => startEdit(row)}>Editar</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager-actions" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page <= 0}>Anterior</Button>
            <Button variant="secondary" onClick={() => setPage((value) => value + 1)} disabled={!rowsPage || page >= (rowsPage.totalPages - 1)}>Proxima</Button>
          </div>
        </section>
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminCatalogManager;
