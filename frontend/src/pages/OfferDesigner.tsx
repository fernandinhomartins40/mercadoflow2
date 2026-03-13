import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import OfferCanvasPreview from '../components/offers/OfferCanvasPreview';
import OfferProductImage from '../components/offers/OfferProductImage';
import { useAuth } from '../context/AuthContext';
import { offersService } from '../services/offers.service';
import { OfferCatalogProduct, OfferTemplate } from '../types/offers.types';

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const compactCategory = (value?: string | null) => {
  if (!value) return 'Sem categoria';
  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
};

const OfferDesigner: React.FC = () => {
  const { marketId } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [templates, setTemplates] = useState<OfferTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState<OfferCatalogProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<OfferCatalogProduct[]>([]);
  const [outputType, setOutputType] = useState('PNG');
  const [generationMode, setGenerationMode] = useState('INDIVIDUAL');
  const [jobName, setJobName] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  useEffect(() => {
    const load = async () => {
      if (!marketId) {
        setLoading(false);
        setError('Mercado não encontrado.');
        return;
      }
      try {
        const templateData = await offersService.getTemplates(marketId);
        setTemplates(templateData);
        const initialTemplateId = searchParams.get('templateId') || templateData[0]?.id || '';
        setSelectedTemplateId(initialTemplateId);

        const initialProductId = searchParams.get('productId');
        if (initialProductId) {
          const selection = await offersService.getCatalogSelection(marketId, [initialProductId]);
          setSelectedProducts(selection);
        }
        setError(null);
      } catch (err: any) {
        setError(err?.message || 'Não foi possível carregar o designer.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [marketId, searchParams]);

  useEffect(() => {
    if (!marketId) return;
    const handler = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await offersService.searchCatalog(marketId, searchInput, 20);
        setResults(data);
      } catch (err: any) {
        setError(err?.message || 'Não foi possível buscar produtos.');
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handler);
  }, [marketId, searchInput]);

  const addProduct = (product: OfferCatalogProduct) => {
    setSelectedProducts((current) => (current.some((item) => item.productId === product.productId) ? current : [...current, product]));
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts((current) => current.filter((item) => item.productId !== productId));
  };

  const handleCreateJob = async () => {
    if (!marketId || !selectedTemplateId || selectedProducts.length === 0) {
      setError('Escolha um template e pelo menos um produto antes de gerar o lote.');
      return;
    }
    setSaving(true);
    try {
      await offersService.createJob(marketId, {
        templateId: selectedTemplateId,
        name: jobName.trim() || undefined,
        outputType,
        generationMode,
        productIds: selectedProducts.map((product) => product.productId),
      });
      navigate('/app/ofertas/jobs');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível criar o lote.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="page analytics-page offers-page offer-designer-page">
        <section className="dashboard-command-grid reveal">
          <article className="dashboard-command-card">
            <div className="dashboard-command-copy">
              <span className="pill">Designer nativo</span>
              <h1 className="dashboard-command-title">Vincule o produto ao template e deixe a geração pronta para escala.</h1>
              <p className="dashboard-command-text">Esta primeira versão já trabalha com binding real do catálogo, preview do layout e criação de lotes persistidos no backend.</p>
            </div>
            <div className="hero-inline-actions">
              <button type="button" className="button secondary" onClick={() => navigate('/app/ofertas/modelos')}>Editar modelos</button>
              <button type="button" className="button secondary" onClick={() => navigate('/app/ofertas/jobs')}>Abrir lotes</button>
            </div>
          </article>
        </section>

        {error ? <div className="sales-empty-card">{error}</div> : null}
        {loading ? <div className="sales-empty-card">Carregando designer...</div> : null}

        {!loading ? (
          <div className="offer-designer-grid">
            <section className="analytics-panel reveal offer-designer-sidebar">
              <div className="sales-section-head">
                <div>
                  <span className="section-kicker">Template e saída</span>
                  <h2>Configurar a peça</h2>
                </div>
                <p>Escolha o modelo e o tipo de lote.</p>
              </div>
              <div className="offer-designer-form-grid">
                <label>
                  <span>Template</span>
                  <select className="input" value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Nome do lote</span>
                  <input className="input" value={jobName} onChange={(event) => setJobName(event.target.value)} placeholder="Ex.: Encarte fim de semana" />
                </label>
                <label>
                  <span>Saída</span>
                  <select className="input" value={outputType} onChange={(event) => setOutputType(event.target.value)}>
                    <option value="PNG">PNG</option>
                    <option value="PDF">PDF</option>
                  </select>
                </label>
                <label>
                  <span>Modo</span>
                  <select className="input" value={generationMode} onChange={(event) => setGenerationMode(event.target.value)}>
                    <option value="INDIVIDUAL">1 arte por produto</option>
                    <option value="CATALOG">Encarte paginado</option>
                  </select>
                </label>
              </div>

              <div className="sales-section-head compact-head">
                <div>
                  <span className="section-kicker">Busca do catálogo</span>
                  <h2>Selecionar produtos</h2>
                </div>
                <p>Busca leve agora; índice dedicado entra na próxima fase.</p>
              </div>
              <input className="input" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar por nome, GTIN, marca ou categoria" />
              <div className="offer-search-result-list">
                {searching ? <div className="offer-list-empty">Buscando...</div> : null}
                {!searching && results.length === 0 ? <div className="offer-list-empty">Sem resultados para esta busca.</div> : null}
                {results.map((product) => (
                  <article key={product.productId} className="offer-search-result-card">
                    <div className="offer-search-result-frame">
                      <OfferProductImage src={product.imageUrl} alt={product.name} className="offer-search-result-image" />
                    </div>
                    <div className="offer-search-result-body">
                      <h3>{product.name}</h3>
                      <p>{compactCategory(product.category)}</p>
                      <div className="offer-search-result-meta">
                        <span>{product.unit || 'Unidade'}</span>
                        <strong>{formatMoney(product.currentPrice)}</strong>
                      </div>
                    </div>
                    <button type="button" className="button secondary" onClick={() => addProduct(product)}>Adicionar</button>
                  </article>
                ))}
              </div>
            </section>

            <section className="analytics-panel reveal offer-designer-stage">
              <div className="sales-section-head">
                <div>
                  <span className="section-kicker">Preview da arte</span>
                  <h2>{selectedTemplate?.name || 'Selecione um template'}</h2>
                </div>
                <p>{selectedTemplate?.description || 'O preview mostra o primeiro produto da fila ou uma grade, conforme o template escolhido.'}</p>
              </div>
              <OfferCanvasPreview template={selectedTemplate} products={selectedProducts} className="offer-designer-canvas" />
              <div className="offer-designer-actions">
                <button type="button" className="button" onClick={handleCreateJob} disabled={saving || !selectedProducts.length || !selectedTemplateId}>
                  {saving ? 'Criando lote...' : 'Criar lote de geração'}
                </button>
                <button type="button" className="button secondary" onClick={() => setSelectedProducts([])}>Limpar seleção</button>
              </div>
            </section>

            <section className="analytics-panel reveal offer-designer-sidebar right">
              <div className="sales-section-head">
                <div>
                  <span className="section-kicker">Fila do template</span>
                  <h2>Produtos selecionados</h2>
                </div>
                <p>{selectedProducts.length} itens prontos para o lote.</p>
              </div>
              <div className="offer-selected-product-list">
                {selectedProducts.length === 0 ? <div className="offer-list-empty">Nenhum produto foi selecionado ainda.</div> : null}
                {selectedProducts.map((product) => (
                  <article key={product.productId} className="offer-selected-product-card">
                    <div className="offer-selected-product-frame">
                      <OfferProductImage src={product.imageUrl} alt={product.name} className="offer-selected-product-image" />
                    </div>
                    <div className="offer-selected-product-body">
                      <h3>{product.name}</h3>
                      <p>{compactCategory(product.category)}</p>
                      <div className="offer-selected-product-meta">
                        <span>{product.unit || 'Unidade'}</span>
                        <strong>{formatMoney(product.currentPrice)}</strong>
                      </div>
                    </div>
                    <button type="button" className="button secondary" onClick={() => removeProduct(product.productId)}>Remover</button>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default OfferDesigner;

