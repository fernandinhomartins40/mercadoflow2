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
  number: number;
}

const EMPTY_FORM = {
  gtin: '',
  name: '',
  brand: '',
  category: '',
  packageDescription: '',
  unit: '',
  imageUrl: '',
  provider: 'MANUAL_SUPER_ADMIN',
  sourceLicense: 'Cadastro manual Super Admin',
  confidenceScore: '0.99',
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

const formatDate = (value?: string | null) => {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleString('pt-BR');
};

const textValue = (value?: string | null) => {
  if (!value) return '--';
  const normalized = value.trim();
  return normalized || '--';
};

const SuperAdminCatalogManager: React.FC = () => {
  const [rowsPage, setRowsPage] = useState<PageResponse<CatalogRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingProductId, setEditingProductId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<CatalogRow | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);

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

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const gtinDigits = (form.gtin || '').replace(/\D/g, '');
      if (gtinDigits.length < 8 || gtinDigits.length > 14) {
        throw new Error('GTIN invalido. Informe entre 8 e 14 digitos.');
      }

      const confidence = Number(form.confidenceScore);
      if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
        throw new Error('Confianca invalida. Use um valor entre 0 e 1.');
      }

      if (!form.name.trim()) {
        throw new Error('Nome do produto e obrigatorio.');
      }

      const payload = {
        ...form,
        gtin: gtinDigits,
        name: form.name.trim(),
        imageUrl: form.imageUrl.trim() || undefined,
        provider: (form.provider || 'MANUAL_SUPER_ADMIN').trim().toUpperCase(),
        sourceLicense: (form.sourceLicense || 'Cadastro manual Super Admin').trim(),
        confidenceScore: confidence,
      };

      if (editingProductId) {
        await api.put(`/v1/super-admin/catalog/products/${editingProductId}`, payload);
        setSuccess('Produto atualizado com sucesso.');
      } else {
        await api.post('/v1/super-admin/catalog/products', payload);
        setSuccess('Produto criado com sucesso.');
      }

      setForm(EMPTY_FORM);
      setEditingProductId('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar produto');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: CatalogRow) => {
    setEditingProductId(row.productId);
    setForm({
      gtin: row.gtin || '',
      name: row.canonicalName || '',
      brand: row.brand || '',
      category: row.category || '',
      packageDescription: row.packageDescription || '',
      unit: row.unit || '',
      imageUrl: row.imageUrl || '',
      provider: row.provider || 'MANUAL_SUPER_ADMIN',
      sourceLicense: row.sourceLicense || 'Cadastro manual Super Admin',
      confidenceScore: String(row.confidenceScore ?? 0.99),
    });
    setError(null);
    setSuccess(null);
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
            <input className="input" placeholder="URL da imagem" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
            <input className="input" placeholder="Provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
            <input className="input" placeholder="Confianca (0-1)" value={form.confidenceScore} onChange={(e) => setForm({ ...form, confidenceScore: e.target.value })} />
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : (editingProductId ? 'Salvar alteracoes' : 'Criar produto')}</Button>
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
          {success ? <div className="card" style={{ color: 'var(--success)' }}>{success}</div> : null}
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
                      <td data-label="Produto">
                        <div className="catalog-admin-product-cell">
                          {row.imageUrl ? (
                            <img className="catalog-admin-thumb" src={row.imageUrl} alt={row.canonicalName} loading="lazy" />
                          ) : (
                            <div className="catalog-admin-thumb placeholder">Sem imagem</div>
                          )}
                          <div className="catalog-admin-product-copy">
                            <strong>{row.canonicalName}</strong>
                            <span>{row.packageDescription || '--'}</span>
                            <span>Atualizado em {formatDate(row.lastVerifiedAt || row.fetchedAt)}</span>
                          </div>
                        </div>
                      </td>
                      <td data-label="GTIN">{row.gtin || '--'}</td>
                      <td data-label="Marca">{row.brand || '--'}</td>
                      <td data-label="Categoria">{row.category || '--'}</td>
                      <td data-label="Fonte">{row.provider}</td>
                      <td data-label="Acoes" className="table-action-cell catalog-admin-action-cell">
                        <div className="catalog-admin-row-actions">
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
                          <Button variant="secondary" onClick={() => startEdit(row)}>Editar</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager-actions admin-pager-actions" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page <= 0}>Anterior</Button>
            <Button variant="secondary" onClick={() => setPage((value) => value + 1)} disabled={!rowsPage || page >= (rowsPage.totalPages - 1)}>Proxima</Button>
          </div>
        </section>
        {selectedProduct ? (
          <div className="catalog-admin-modal-backdrop" role="presentation" onClick={closeProductModal}>
            <div
              className="catalog-admin-modal card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="super-admin-catalog-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="catalog-admin-modal-head">
                <div>
                  <span className="section-kicker">Produto global</span>
                  <h3 id="super-admin-catalog-modal-title">{selectedProduct.canonicalName || '--'}</h3>
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
    </SuperAdminLayout>
  );
};

export default SuperAdminCatalogManager;
