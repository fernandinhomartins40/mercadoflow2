import React, { useEffect, useMemo, useState } from 'react';
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
  description?: string | null;
  manufacturer?: string | null;
  ncm?: string | null;
  packageDescription?: string | null;
  unit?: string | null;
  imageUrl?: string | null;
  provider: string;
  providerProductId?: string | null;
  sourceLicense?: string | null;
  attributesJson?: string | null;
  rawPayload?: string | null;
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

interface CatalogFormState {
  gtin: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  manufacturer: string;
  ncm: string;
  packageDescription: string;
  unit: string;
  imageUrl: string;
  provider: string;
  providerProductId: string;
  sourceLicense: string;
  confidenceScore: string;
  attributesJson: string;
  rawPayload: string;
}

type EditorState =
  | {
      mode: 'create' | 'edit';
      productId?: string;
      title: string;
      subtitle: string;
    }
  | null;

const EMPTY_FORM: CatalogFormState = {
  gtin: '',
  name: '',
  brand: '',
  category: '',
  description: '',
  manufacturer: '',
  ncm: '',
  packageDescription: '',
  unit: '',
  imageUrl: '',
  provider: 'MANUAL_SUPER_ADMIN',
  providerProductId: '',
  sourceLicense: 'Cadastro manual Super Admin',
  confidenceScore: '0.99',
  attributesJson: '',
  rawPayload: '',
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

const normalizeJsonForEditor = (value?: string | null) => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
};

const normalizeOptionalField = (value: string) => {
  const trimmed = value.trim();
  return trimmed || undefined;
};

const validateJsonField = (label: string, value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    throw new Error(`${label} invalido. Informe um JSON valido.`);
  }
};

const SuperAdminCatalogManager: React.FC = () => {
  const [rowsPage, setRowsPage] = useState<PageResponse<CatalogRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<CatalogFormState>(EMPTY_FORM);
  const [editorState, setEditorState] = useState<EditorState>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<CatalogRow | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);

  const rows = rowsPage?.content || [];
  const editorImageUrl = form.imageUrl.trim();
  const editorProviderLabel = textValue(form.provider);
  const editorProviderProductIdLabel = textValue(form.providerProductId);

  const editorSummary = useMemo(() => {
    if (!editorState) return 'Nenhum item em edicao.';
    if (editorState.mode === 'create') {
      return 'Cadastre manualmente um produto global com os campos ricos do enrichment.';
    }
    return 'Atualize os metadados do produto sem sair da listagem.';
  }, [editorState]);

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
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.message || 'Falha ao carregar catalogo');
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

  const closeEditorModal = () => {
    if (saving) {
      return;
    }
    setEditorState(null);
    setEditorError(null);
    setForm(EMPTY_FORM);
  };
  useEffect(() => {
    if (!selectedProduct && !lightboxImage && !editorState) return undefined;
    const originalOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (lightboxImage) {
          setLightboxImage(null);
          return;
        }
        if (editorState) {
          closeEditorModal();
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
  }, [editorState, lightboxImage, selectedProduct, saving]);

  const openCreateModal = () => {
    setForm(EMPTY_FORM);
    setEditorError(null);
    setSuccess(null);
    setSelectedProduct(null);
    setEditorState({
      mode: 'create',
      title: 'Novo produto global',
      subtitle: 'Cadastro manual completo',
    });
  };

  const openEditModal = (row: CatalogRow) => {
    setForm({
      gtin: row.gtin || '',
      name: row.canonicalName || '',
      brand: row.brand || '',
      category: row.category || '',
      description: row.description || '',
      manufacturer: row.manufacturer || '',
      ncm: row.ncm || '',
      packageDescription: row.packageDescription || '',
      unit: row.unit || '',
      imageUrl: row.imageUrl || '',
      provider: row.provider || 'MANUAL_SUPER_ADMIN',
      providerProductId: row.providerProductId || '',
      sourceLicense: row.sourceLicense || 'Cadastro manual Super Admin',
      confidenceScore: String(row.confidenceScore ?? 0.99),
      attributesJson: normalizeJsonForEditor(row.attributesJson),
      rawPayload: normalizeJsonForEditor(row.rawPayload),
    });
    setEditorError(null);
    setSuccess(null);
    setSelectedProduct(null);
    setEditorState({
      mode: 'edit',
      productId: row.productId,
      title: 'Editar produto global',
      subtitle: row.canonicalName || row.gtin || 'Produto selecionado',
    });
  };

  const save = async () => {
    if (!editorState) {
      return;
    }

    setSaving(true);
    setEditorError(null);
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
        gtin: gtinDigits,
        name: form.name.trim(),
        brand: normalizeOptionalField(form.brand),
        category: normalizeOptionalField(form.category),
        description: normalizeOptionalField(form.description),
        manufacturer: normalizeOptionalField(form.manufacturer),
        ncm: normalizeOptionalField(form.ncm),
        packageDescription: normalizeOptionalField(form.packageDescription),
        unit: normalizeOptionalField(form.unit),
        imageUrl: normalizeOptionalField(form.imageUrl),
        provider: (form.provider || 'MANUAL_SUPER_ADMIN').trim().toUpperCase(),
        providerProductId: normalizeOptionalField(form.providerProductId),
        sourceLicense: (form.sourceLicense || 'Cadastro manual Super Admin').trim(),
        confidenceScore: confidence,
        attributesJson: validateJsonField('Attributes JSON', form.attributesJson),
        rawPayload: validateJsonField('Raw payload', form.rawPayload),
      };

      if (editorState.mode === 'edit' && editorState.productId) {
        await api.put(`/v1/super-admin/catalog/products/${editorState.productId}`, payload);
        setSuccess('Produto atualizado com sucesso.');
      } else {
        await api.post('/v1/super-admin/catalog/products', payload);
        setSuccess('Produto criado com sucesso.');
      }

      closeEditorModal();
      await load();
    } catch (err: any) {
      setEditorError(err?.message || 'Falha ao salvar produto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SuperAdminLayout>
      <div className="super-admin-page catalog-admin-page super-admin-catalog-page">
        <section className="dashboard-command-grid reveal super-admin-command-grid">
          <article className="dashboard-command-card super-admin-command-card">
            <div className="dashboard-command-copy">
              <span className="pill">Catalogo Global</span>
              <h1 className="dashboard-command-title">Manutencao manual de produtos sem espalhar o fluxo em blocos confusos.</h1>
              <p className="dashboard-command-text">
                A entrada desta pagina agora resume busca, criacao e estado da base antes de voce abrir o modal de cadastro ou edicao.
              </p>
              <div className="hero-inline-actions">
                <Button onClick={openCreateModal}>Novo produto</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPage(0);
                    load();
                  }}
                >
                  Atualizar lista
                </Button>
              </div>
            </div>

            <div className="dashboard-command-showcase">
              <div className="dashboard-glow-card">
                <span className="section-kicker">Itens nesta pagina</span>
                <h3>{rows.length} produtos visiveis</h3>
                <strong>{rowsPage?.number != null ? rowsPage.number + 1 : page + 1}</strong>
                <p>{rowsPage ? `${rowsPage.totalPages} paginas disponiveis para navegacao.` : 'Carregue a base para ver o recorte atual.'}</p>
              </div>

              <div className="dashboard-command-mosaic">
                <div className="dashboard-mini-tile">
                  <span>Busca atual</span>
                  <strong>{search.trim() || 'Sem filtro'}</strong>
                  <small>consulta por GTIN, nome ou marca</small>
                </div>
                <div className="dashboard-mini-tile">
                  <span>Provider padrao</span>
                  <strong>{editorProviderLabel}</strong>
                  <small>origem aplicada no cadastro manual</small>
                </div>
                <div className="dashboard-mini-tile accent">
                  <span>Preview do editor</span>
                  <strong>{editorImageUrl ? 'Com imagem' : 'Sem imagem'}</strong>
                  <small>o modal de edicao mostra o preview ao vivo</small>
                </div>
              </div>
            </div>
          </article>

          <aside className="dashboard-priority-rail">
            <div className="dashboard-priority-card dark">
              <span className="section-kicker">Fluxo principal</span>
              <strong>Consultar, abrir o olho e editar no modal</strong>
              <p>A tabela vira trilha de selecao. Os campos ricos ficam concentrados no editor, nao no corpo da pagina.</p>
            </div>
            <div className="dashboard-priority-card">
              <span className="section-kicker">Pagina atual</span>
              <strong>{page + 1}</strong>
              <p>{rowsPage ? `${rowsPage.totalPages} paginas totais no resultado atual.` : 'Sem paginacao carregada ainda.'}</p>
            </div>
          </aside>
        </section>

        <div className="dashboard-page-grid">
          <section className="analytics-panel reveal dashboard-form-panel">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Consulta</span>
                <h3>Itens cadastrados</h3>
              </div>
            </div>
            <div className="filter-bar-controls">
              <input
                className="input"
                placeholder="Buscar por GTIN, nome, marca..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button
                onClick={() => {
                  setPage(0);
                  load();
                }}
              >
                Buscar
              </Button>
            </div>
            {loadError ? <div className="card" style={{ color: 'var(--danger)' }}>{loadError}</div> : null}
            {success ? <div className="card" style={{ color: 'var(--success)' }}>{success}</div> : null}
          </section>

          <section className="analytics-panel reveal dashboard-note-card">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Como operar</span>
                <h3>Leitura recomendada</h3>
              </div>
            </div>
            <div className="dashboard-quick-list">
              <div className="dashboard-quick-item">
                <strong>Use a tabela como trilha de selecao</strong>
                <span>O objetivo nao e preencher campos na pagina, mas escolher o item certo para visualizar ou editar.</span>
              </div>
              <div className="dashboard-quick-item">
                <strong>O modal concentra os campos ricos</strong>
                <span>Descricao, payload, atributos e preview de imagem ficaram todos dentro do editor.</span>
              </div>
              <div className="dashboard-quick-item">
                <strong>Mantenha a base manual sob controle</strong>
                <span>Use provider e provider product id apenas quando fizer sentido para rastreio da manutencao.</span>
              </div>
            </div>
          </section>
        </div>

        <section className="analytics-panel reveal">
          <div className="analytics-panel-head">
            <div>
              <span className="section-kicker">Listagem</span>
              <h3>Produtos do catalogo global</h3>
            </div>
          </div>
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
                          <Button variant="secondary" onClick={() => openEditModal(row)}>
                            Editar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager-actions admin-pager-actions" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page <= 0}>
              Anterior
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPage((value) => value + 1)}
              disabled={!rowsPage || page >= rowsPage.totalPages - 1}
            >
              Proxima
            </Button>
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
                <div className="catalog-admin-modal-head-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      closeProductModal();
                      openEditModal(selectedProduct);
                    }}
                  >
                    Editar
                  </Button>
                  <Button type="button" variant="secondary" onClick={closeProductModal}>
                    Fechar
                  </Button>
                </div>
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
                    <span>Fabricante</span>
                    <strong>{textValue(selectedProduct.manufacturer)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>NCM</span>
                    <strong>{textValue(selectedProduct.ncm)}</strong>
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
                    <span>Provider</span>
                    <strong>{textValue(selectedProduct.provider)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Provider Product ID</span>
                    <strong>{textValue(selectedProduct.providerProductId)}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Observacoes</span>
                    <strong>{selectedProduct.observationCount ?? '--'}</strong>
                  </div>
                  <div className="catalog-admin-detail-item">
                    <span>Confianca</span>
                    <strong>{selectedProduct.confidenceScore != null ? `${Math.round(selectedProduct.confidenceScore * 100)}%` : '--'}</strong>
                  </div>
                  <div className="catalog-admin-detail-item catalog-admin-detail-item-wide">
                    <span>Descricao</span>
                    <strong>{textValue(selectedProduct.description)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {editorState ? (
          <div className="catalog-admin-modal-backdrop" role="presentation" onClick={closeEditorModal}>
            <div
              className="catalog-admin-modal catalog-admin-editor-modal card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="super-admin-catalog-editor-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="catalog-admin-modal-head">
                <div>
                  <span className="section-kicker">{editorState.subtitle}</span>
                  <h3 id="super-admin-catalog-editor-title">{editorState.title}</h3>
                </div>
                <div className="catalog-admin-modal-head-actions">
                  <Button type="button" variant="secondary" onClick={closeEditorModal} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={save} disabled={saving}>
                    {saving ? 'Salvando...' : editorState.mode === 'edit' ? 'Salvar alteracoes' : 'Criar produto'}
                  </Button>
                </div>
              </div>

              {editorError ? <div className="card" style={{ color: 'var(--danger)', marginBottom: 16 }}>{editorError}</div> : null}

              <div className="catalog-admin-modal-body catalog-admin-editor-layout">
                <div className="catalog-admin-modal-media">
                  {editorImageUrl ? (
                    <>
                      <button
                        type="button"
                        className="catalog-admin-modal-image-button"
                        onClick={() =>
                          setLightboxImage({
                            src: editorImageUrl,
                            alt: form.name.trim() || 'Imagem do produto em edicao',
                          })
                        }
                        aria-label="Ampliar imagem em edicao"
                      >
                        <img className="catalog-admin-modal-image" src={editorImageUrl} alt={form.name || 'Preview da imagem'} />
                      </button>
                      <span className="catalog-admin-image-hint">Preview ao vivo da imagem. Clique para ampliar.</span>
                    </>
                  ) : (
                    <div className="catalog-admin-modal-image placeholder">Informe uma URL de imagem para ver o preview.</div>
                  )}

                  <div className="catalog-admin-editor-panel">
                    <span className="section-kicker">Resumo do enrichment</span>
                    <h4>{form.name.trim() || 'Novo produto'}</h4>
                    <p>{editorSummary}</p>
                    <div className="catalog-admin-editor-meta">
                      <span className="catalog-admin-editor-chip">{editorProviderLabel}</span>
                      <span className="catalog-admin-editor-chip">{editorProviderProductIdLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="catalog-admin-editor-form">
                  <section className="catalog-admin-editor-panel">
                    <div className="catalog-admin-editor-section-head">
                      <span className="section-kicker">Dados principais</span>
                      <h4>Identificacao e exibicao</h4>
                    </div>
                    <div className="catalog-admin-editor-grid">
                      <div className="catalog-admin-editor-field">
                        <label htmlFor="catalog-form-gtin">GTIN</label>
                        <input
                          id="catalog-form-gtin"
                          className="input"
                          placeholder="8 a 14 digitos"
                          value={form.gtin}
                          onChange={(event) => setForm((current) => ({ ...current, gtin: event.target.value }))}
                        />
                      </div>
                      <div className="catalog-admin-editor-field catalog-admin-editor-field-wide">
                        <label htmlFor="catalog-form-name">Nome canonical</label>
                        <input
                          id="catalog-form-name"
                          className="input"
                          placeholder="Nome principal do produto"
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </div>
                      <div className="catalog-admin-editor-field">
                        <label htmlFor="catalog-form-brand">Marca</label>
                        <input
                          id="catalog-form-brand"
                          className="input"
                          placeholder="Marca"
                          value={form.brand}
                          onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))}
                        />
                      </div>
                      <div className="catalog-admin-editor-field">
                        <label htmlFor="catalog-form-category">Categoria</label>
                        <input
                          id="catalog-form-category"
                          className="input"
                          placeholder="Categoria"
                          value={form.category}
                          onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                        />
                      </div>
                      <div className="catalog-admin-editor-field">
                        <label htmlFor="catalog-form-package">Embalagem</label>
                        <input
                          id="catalog-form-package"
                          className="input"
                          placeholder="Ex.: Caixa 1L"
                          value={form.packageDescription}
                          onChange={(event) => setForm((current) => ({ ...current, packageDescription: event.target.value }))}
                        />
                      </div>
                      <div className="catalog-admin-editor-field">
                        <label htmlFor="catalog-form-unit">Unidade</label>
                        <input
                          id="catalog-form-unit"
                          className="input"
                          placeholder="Ex.: UN, KG, ML"
                          value={form.unit}
                          onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
                        />
                      </div>
                      <div className="catalog-admin-editor-field catalog-admin-editor-field-wide">
                        <label htmlFor="catalog-form-description">Descricao</label>
                        <textarea
                          id="catalog-form-description"
                          className="input catalog-admin-editor-textarea"
                          placeholder="Descricao comercial ou detalhada do produto"
                          value={form.description}
                          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="catalog-admin-editor-panel">
                    <div className="catalog-admin-editor-section-head">
                      <span className="section-kicker">Enriquecimento</span>
                      <h4>Campos tecnicos e rastreio</h4>
                    </div>
                    <div className="catalog-admin-editor-grid">
                      <div className="catalog-admin-editor-field">
                        <label htmlFor="catalog-form-manufacturer">Fabricante</label>
                        <input
                          id="catalog-form-manufacturer"
                          className="input"
                          placeholder="Fabricante"
                          value={form.manufacturer}
                          onChange={(event) => setForm((current) => ({ ...current, manufacturer: event.target.value }))}
                        />
                      </div>
                      <div className="catalog-admin-editor-field">
                        <label htmlFor="catalog-form-ncm">NCM</label>
                        <input
                          id="catalog-form-ncm"
                          className="input"
                          placeholder="Codigo NCM"
                          value={form.ncm}
                          onChange={(event) => setForm((current) => ({ ...current, ncm: event.target.value }))}
                        />
                      </div>
                      <div className="catalog-admin-editor-field">
                        <label htmlFor="catalog-form-provider">Provider</label>
                        <input
                          id="catalog-form-provider"
                          className="input"
                          placeholder="MANUAL_SUPER_ADMIN"
                          value={form.provider}
                          onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                        />
                      </div>
                      <div className="catalog-admin-editor-field">
                        <label htmlFor="catalog-form-provider-product-id">Provider Product ID</label>
                        <input
                          id="catalog-form-provider-product-id"
                          className="input"
                          placeholder="Identificador na origem"
                          value={form.providerProductId}
                          onChange={(event) => setForm((current) => ({ ...current, providerProductId: event.target.value }))}
                        />
                      </div>
                      <div className="catalog-admin-editor-field">
                        <label htmlFor="catalog-form-confidence">Confianca</label>
                        <input
                          id="catalog-form-confidence"
                          className="input"
                          placeholder="0.00 a 1.00"
                          value={form.confidenceScore}
                          onChange={(event) => setForm((current) => ({ ...current, confidenceScore: event.target.value }))}
                        />
                      </div>
                      <div className="catalog-admin-editor-field">
                        <label htmlFor="catalog-form-source-license">Licenca da fonte</label>
                        <input
                          id="catalog-form-source-license"
                          className="input"
                          placeholder="Licenca ou observacao de uso"
                          value={form.sourceLicense}
                          onChange={(event) => setForm((current) => ({ ...current, sourceLicense: event.target.value }))}
                        />
                      </div>
                    </div>
                  </section>
                  <section className="catalog-admin-editor-panel">
                    <div className="catalog-admin-editor-section-head">
                      <span className="section-kicker">Midia e payload</span>
                      <h4>Imagem e dados estruturados</h4>
                    </div>
                    <div className="catalog-admin-editor-grid">
                      <div className="catalog-admin-editor-field catalog-admin-editor-field-wide">
                        <label htmlFor="catalog-form-image-url">URL da imagem</label>
                        <input
                          id="catalog-form-image-url"
                          className="input"
                          placeholder="https://..."
                          value={form.imageUrl}
                          onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))}
                        />
                      </div>
                      <div className="catalog-admin-editor-field catalog-admin-editor-field-wide">
                        <label htmlFor="catalog-form-attributes-json">Attributes JSON</label>
                        <textarea
                          id="catalog-form-attributes-json"
                          className="input catalog-admin-editor-textarea"
                          placeholder='{"weight":"1kg","origin":"manual"}'
                          value={form.attributesJson}
                          onChange={(event) => setForm((current) => ({ ...current, attributesJson: event.target.value }))}
                        />
                      </div>
                      <div className="catalog-admin-editor-field catalog-admin-editor-field-wide">
                        <label htmlFor="catalog-form-raw-payload">Raw payload</label>
                        <textarea
                          id="catalog-form-raw-payload"
                          className="input catalog-admin-editor-textarea"
                          placeholder='{"origin":"SUPER_ADMIN_MANUAL"}'
                          value={form.rawPayload}
                          onChange={(event) => setForm((current) => ({ ...current, rawPayload: event.target.value }))}
                        />
                      </div>
                    </div>
                  </section>
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
                x
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
