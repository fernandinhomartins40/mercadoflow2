
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/common/Button';
import Layout from '../components/layout/Layout';
import OfferCanvasPreview from '../components/offers/OfferCanvasPreview';
import OfferProductImage from '../components/offers/OfferProductImage';
import { useAuth } from '../context/AuthContext';
import { offersService } from '../services/offers.service';
import { OfferCatalogProduct, OfferOverview, OfferTemplate } from '../types/offers.types';

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const compactCategory = (value?: string | null) => {
  if (!value) return 'Sem categoria';
  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
};

const TOOL_OPTIONS = [
  { key: 'products', mark: 'PR', label: 'Produtos' },
  { key: 'themes', mark: 'TM', label: 'Temas' },
  { key: 'calendar', mark: 'DT', label: 'Datas' },
  { key: 'copy', mark: 'TX', label: 'Texto' },
  { key: 'publish', mark: 'PB', label: 'Publicar' },
] as const;

type StudioTool = (typeof TOOL_OPTIONS)[number]['key'];
type ProductPanelMode = 'search' | 'selected';

const GRID_PRESET_OPTIONS = [
  { value: 'AUTO', label: 'Automático' },
  { value: '1x1', label: '1 produto · 1x1' },
  { value: '2x2', label: '4 produtos · 2x2' },
  { value: '3x2', label: '6 produtos · 3x2' },
  { value: '3x3', label: '9 produtos · 3x3' },
] as const;

const PRODUCT_BOX_OPTIONS = [
  { value: 'SMART', label: 'Inteligente' },
  { value: 'COMPACT', label: 'Compacto' },
  { value: 'FEATURED', label: 'Com destaque' },
] as const;

const TEXT_MODE_OPTIONS = [
  { value: 'SHORT', label: 'Texto curto' },
  { value: 'MEDIUM', label: 'Texto médio' },
  { value: 'LONG', label: 'Texto longo' },
] as const;

const COLOR_MODE_OPTIONS = [
  { value: 'SMART', label: 'Inteligente' },
  { value: 'WARM', label: 'Quente' },
  { value: 'NEUTRAL', label: 'Neutro' },
] as const;

const FOOTER_OPTIONS = [
  { value: 'ROUND', label: 'Redondo grande' },
  { value: 'SLIM', label: 'Faixa compacta' },
  { value: 'NONE', label: 'Sem rodapé' },
] as const;

const ZOOM_OPTIONS = [
  { value: 'AUTO', label: 'Auto' },
  { value: '75', label: '75%' },
  { value: '100', label: '100%' },
  { value: '125', label: '125%' },
] as const;

const gridPresetToCount = (value: string) => {
  switch (value) {
    case '1x1':
      return 1;
    case '2x2':
      return 4;
    case '3x2':
      return 6;
    case '3x3':
      return 9;
    default:
      return 6;
  }
};

const zoomToScale = (value: string) => {
  switch (value) {
    case '75':
      return 0.75;
    case '100':
      return 1;
    case '125':
      return 1.25;
    default:
      return 1;
  }
};

const footerPreviewLabel = (value: string) => {
  switch (value) {
    case 'SLIM':
      return 'Ofertas válidas enquanto durarem os estoques';
    case 'NONE':
      return null;
    default:
      return 'Ofertas válidas por tempo limitado · Imagens meramente ilustrativas';
  }
};

const mergeUniqueProducts = (base: OfferCatalogProduct[], incoming: OfferCatalogProduct[]) => {
  const seen = new Set(base.map((item) => item.productId));
  const merged = [...base];
  incoming.forEach((item) => {
    if (!seen.has(item.productId)) {
      seen.add(item.productId);
      merged.push(item);
    }
  });
  return merged;
};

const StudioToolButton: React.FC<{
  mark: string;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ mark, label, active, onClick }) => (
  <button type="button" className={`offer-studio-rail-button ${active ? 'active' : ''}`} onClick={onClick}>
    <span className="offer-studio-rail-mark">{mark}</span>
    <span>{label}</span>
  </button>
);

const StudioSelectField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}> = ({ label, value, onChange, options }) => (
  <label className="offer-studio-toolbar-field">
    <span>{label}</span>
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  </label>
);

const StudioSearchResultCard: React.FC<{
  product: OfferCatalogProduct;
  inQueue: boolean;
  onAdd: () => void;
}> = ({ product, inQueue, onAdd }) => (
  <article className="offer-studio-result-card">
    <div className="offer-studio-result-frame">
      <OfferProductImage src={product.imageUrl} alt={product.name} className="offer-studio-result-image" />
    </div>
    <div className="offer-studio-result-body">
      <h3>{product.name}</h3>
      <p>{compactCategory(product.category)}</p>
      <div className="offer-studio-result-meta">
        <span>{product.unit || 'Unidade'}</span>
        <strong>{formatMoney(product.currentPrice)}</strong>
      </div>
    </div>
    <Button type="button" variant={inQueue ? 'secondary' : 'primary'} onClick={onAdd} disabled={inQueue}>
      {inQueue ? 'Na fila' : 'Adicionar'}
    </Button>
  </article>
);

const StudioTemplateCard: React.FC<{
  template: OfferTemplate;
  selected: boolean;
  onUse: () => void;
}> = ({ template, selected, onUse }) => (
  <button type="button" className={`offer-studio-template-card ${selected ? 'selected' : ''}`} onClick={onUse}>
    <OfferCanvasPreview template={template} className="offer-studio-template-preview" />
    <div className="offer-studio-template-copy">
      <span className="section-kicker">{template.channel}</span>
      <strong>{template.name}</strong>
      <small>{template.description || 'Template pronto para automação.'}</small>
    </div>
  </button>
);

const StudioQueueCard: React.FC<{
  product: OfferCatalogProduct;
  onRemove: () => void;
}> = ({ product, onRemove }) => (
  <article className="offer-studio-queue-card">
    <div className="offer-studio-queue-main">
      <div className="offer-studio-queue-frame">
        <OfferProductImage src={product.imageUrl} alt={product.name} className="offer-studio-queue-image" />
      </div>
      <div className="offer-studio-queue-copy">
        <h3>{product.name}</h3>
        <p>{compactCategory(product.category)}</p>
        <div className="offer-studio-queue-meta">
          <span>{product.unit || 'Unidade'}</span>
          <strong>{formatMoney(product.currentPrice)}</strong>
        </div>
      </div>
    </div>
    <Button type="button" variant="secondary" onClick={onRemove}>Remover</Button>
  </article>
);

const OfferDesigner: React.FC = () => {
  const { marketId, name } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [overview, setOverview] = useState<OfferOverview | null>(null);
  const [templates, setTemplates] = useState<OfferTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedProducts, setSelectedProducts] = useState<OfferCatalogProduct[]>([]);
  const [results, setResults] = useState<OfferCatalogProduct[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [jobName, setJobName] = useState('');
  const [outputType, setOutputType] = useState('PNG');
  const [generationMode, setGenerationMode] = useState('CATALOG');
  const [gridPreset, setGridPreset] = useState('AUTO');
  const [productBoxMode, setProductBoxMode] = useState('SMART');
  const [textMode, setTextMode] = useState('MEDIUM');
  const [colorMode, setColorMode] = useState('SMART');
  const [footerMode, setFooterMode] = useState('ROUND');
  const [zoomMode, setZoomMode] = useState('AUTO');
  const [coverEnabled, setCoverEnabled] = useState(false);
  const [activeTool, setActiveTool] = useState<StudioTool>('products');
  const [productPanelMode, setProductPanelMode] = useState<ProductPanelMode>('search');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [bulkSearching, setBulkSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [lookupNotice, setLookupNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [templates, selectedTemplateId],
  );

  const selectedProductIds = useMemo(() => new Set(selectedProducts.map((product) => product.productId)), [selectedProducts]);
  const itemsPerPage = useMemo(() => (generationMode === 'CATALOG' ? gridPresetToCount(gridPreset) : 1), [generationMode, gridPreset]);
  const pageEstimate = useMemo(() => {
    if (generationMode === 'INDIVIDUAL') {
      return Math.max(selectedProducts.length, 1);
    }
    const basePages = Math.max(Math.ceil(selectedProducts.length / Math.max(itemsPerPage, 1)), 1);
    return coverEnabled ? basePages + 1 : basePages;
  }, [coverEnabled, generationMode, itemsPerPage, selectedProducts.length]);
  const stageScale = useMemo(() => zoomToScale(zoomMode), [zoomMode]);
  const footerText = useMemo(() => footerPreviewLabel(footerMode), [footerMode]);

  const socialCopy = useMemo(() => {
    if (!selectedProducts.length) {
      return 'Adicione produtos na fila para gerar um texto de apoio automático para redes sociais e comunicação acessível.';
    }

    const intro = textMode === 'SHORT'
      ? `Ofertas em destaque do ${name || 'MercadoFlow'}:`
      : `Confira as ofertas preparadas para o ${name || 'seu mercado'}, com foco em preço, giro e exposição:`;

    const lines = selectedProducts
      .slice(0, textMode === 'LONG' ? 8 : textMode === 'MEDIUM' ? 5 : 3)
      .map((product) => `• ${product.name} por ${formatMoney(product.currentPrice)}${product.unit ? ` · ${product.unit}` : ''}`);

    const outro = textMode === 'LONG'
      ? '\n\nValores sujeitos ao estoque da loja e à vigência da ação comercial.'
      : '\n\nOfertas sujeitas à disponibilidade.';

    return `${intro}\n\n${lines.join('\n')}${outro}`;
  }, [name, selectedProducts, textMode]);

  useEffect(() => {
    const load = async () => {
      if (!marketId) {
        setLoading(false);
        setError('Mercado não encontrado.');
        return;
      }
      try {
        const [templateData, overviewData] = await Promise.all([
          offersService.getTemplates(marketId),
          offersService.getOverview(marketId),
        ]);

        setTemplates(templateData);
        setOverview(overviewData);

        const initialTemplateId = searchParams.get('templateId') || templateData[0]?.id || '';
        setSelectedTemplateId(initialTemplateId);

        const initialProductId = searchParams.get('productId');
        if (initialProductId) {
          const selection = await offersService.getCatalogSelection(marketId, [initialProductId]);
          setSelectedProducts(selection);
        }

        setError(null);
      } catch (err: any) {
        setError(err?.message || 'Não foi possível carregar o estúdio de ofertas.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [marketId, searchParams]);

  useEffect(() => {
    if (!marketId) return;
    const normalized = searchInput.trim();
    if (normalized.length < 2) {
      setResults([]);
      return undefined;
    }

    const handler = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await offersService.searchCatalog(marketId, normalized, 20);
        setResults(data);
        setLookupNotice(null);
      } catch (err: any) {
        setError(err?.message || 'Não foi possível buscar produtos.');
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [marketId, searchInput]);

  const addProduct = (product: OfferCatalogProduct) => {
    setSelectedProducts((current) => mergeUniqueProducts(current, [product]));
    setProductPanelMode('selected');
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts((current) => current.filter((item) => item.productId !== productId));
  };

  const addProductById = async (productId?: string | null) => {
    if (!marketId || !productId || selectedProductIds.has(productId)) {
      return;
    }
    try {
      const selection = await offersService.getCatalogSelection(marketId, [productId]);
      if (selection.length) {
        setSelectedProducts((current) => mergeUniqueProducts(current, selection));
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível incluir o produto na fila.');
    }
  };

  const handleBulkLookup = async () => {
    if (!marketId) return;

    const terms = bulkInput
      .split(/\n|,|;/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 16);

    if (!terms.length) {
      setLookupNotice('Digite ao menos um produto para buscar.');
      return;
    }

    setBulkSearching(true);
    try {
      const responses = await Promise.all(terms.map((term) => offersService.searchCatalog(marketId, term, 6)));
      const bestMatches = responses
        .map((items) => items[0])
        .filter(Boolean) as OfferCatalogProduct[];

      setResults(bestMatches);
      setSelectedProducts((current) => mergeUniqueProducts(current, bestMatches));
      setProductPanelMode('selected');
      setLookupNotice(`${bestMatches.length} produtos foram adicionados automaticamente a partir da lista colada.`);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível processar a lista de produtos.');
    } finally {
      setBulkSearching(false);
    }
  };

  const handleAddAllResults = () => {
    setSelectedProducts((current) => mergeUniqueProducts(current, results));
    setProductPanelMode('selected');
    setLookupNotice(`${results.length} produtos da busca foram incluídos na fila.`);
  };

  const handleCreateJob = async () => {
    if (!marketId || !selectedTemplateId || selectedProducts.length === 0) {
      setError('Escolha um modelo e pelo menos um produto antes de gerar o lote.');
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

  const handleCopyText = async () => {
    try {
      setCopying(true);
      await navigator.clipboard.writeText(socialCopy);
      setLookupNotice('Texto copiado para a área de transferência.');
    } catch {
      setLookupNotice('Não foi possível copiar o texto automaticamente neste navegador.');
    } finally {
      setCopying(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="page offers-studio-page">
          <div className="sales-empty-card">Carregando estúdio de ofertas...</div>
        </div>
      </Layout>
    );
  }

  const templateOptions = templates.map((template) => ({ value: template.id, label: template.name }));
  const stageProducts = selectedProducts.slice(0, itemsPerPage);

  return (
    <Layout>
      <div className="page offers-studio-page">
        {error ? <div className="sales-empty-card offer-studio-alert error">{error}</div> : null}
        {lookupNotice ? <div className="sales-empty-card offer-studio-alert info">{lookupNotice}</div> : null}

        <div className="offer-studio-shell">
          <aside className="offer-studio-rail">
            <div className="offer-studio-rail-brand">
              <span className="offer-studio-rail-badge">OF</span>
              <div>
                <strong>Designer de ofertas</strong>
                <small>Automação visual nativa do MercadoFlow</small>
              </div>
            </div>
            <div className="offer-studio-rail-nav">
              {TOOL_OPTIONS.map((tool) => (
                <StudioToolButton
                  key={tool.key}
                  mark={tool.mark}
                  label={tool.label}
                  active={activeTool === tool.key}
                  onClick={() => setActiveTool(tool.key)}
                />
              ))}
            </div>
            <div className="offer-studio-rail-summary">
              <span className="section-kicker">Resumo</span>
              <strong>{selectedProducts.length} produtos na fila</strong>
              <small>{pageEstimate} página(s) estimadas · {outputType}</small>
            </div>
          </aside>

          <aside className="offer-studio-panel">
            {activeTool === 'products' ? (
              <div className="offer-studio-panel-stack">
                <div className="offer-studio-panel-header">
                  <div>
                    <span className="section-kicker">Produtos</span>
                    <h2>Monte a fila do encarte</h2>
                  </div>
                  <div className="offer-studio-panel-tabs">
                    <button
                      type="button"
                      className={productPanelMode === 'search' ? 'active' : ''}
                      onClick={() => setProductPanelMode('search')}
                    >
                      Pesquisar
                    </button>
                    <button
                      type="button"
                      className={productPanelMode === 'selected' ? 'active' : ''}
                      onClick={() => setProductPanelMode('selected')}
                    >
                      Meus produtos
                    </button>
                  </div>
                </div>

                {productPanelMode === 'search' ? (
                  <>
                    <div className="offer-studio-search-box">
                      <label className="offer-studio-text-field">
                        <span>Buscar no catálogo</span>
                        <input
                          className="input"
                          value={searchInput}
                          onChange={(event) => setSearchInput(event.target.value)}
                          placeholder="Digite nome, GTIN ou marca"
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Cole a lista de produtos</span>
                        <textarea
                          className="textarea"
                          rows={6}
                          value={bulkInput}
                          onChange={(event) => setBulkInput(event.target.value)}
                          placeholder={'Ex.: coca cola 2l\narroz tio joao 5kg\ncerveja heineken 600ml'}
                        />
                      </label>
                      <div className="offer-studio-inline-actions">
                        <Button type="button" onClick={handleBulkLookup} disabled={bulkSearching}>
                          {bulkSearching ? 'Processando lista...' : 'Buscar produtos'}
                        </Button>
                        <Button type="button" variant="secondary" onClick={handleAddAllResults} disabled={!results.length}>
                          Adicionar resultados
                        </Button>
                      </div>
                    </div>

                    <div className="offer-studio-panel-list">
                      <div className="offer-studio-panel-subhead">
                        <span className="section-kicker">Resultado da busca</span>
                        <small>{searching ? 'Buscando...' : `${results.length} itens encontrados`}</small>
                      </div>
                      {results.length === 0 ? (
                        <div className="offer-studio-empty-card">
                          Pesquise um item do catálogo ou cole uma lista para preencher a arte automaticamente.
                        </div>
                      ) : (
                        results.map((product) => (
                          <StudioSearchResultCard
                            key={product.productId}
                            product={product}
                            inQueue={selectedProductIds.has(product.productId)}
                            onAdd={() => addProduct(product)}
                          />
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <div className="offer-studio-panel-list">
                    <div className="offer-studio-panel-subhead">
                      <span className="section-kicker">Fila selecionada</span>
                      <small>{selectedProducts.length} produtos preparados</small>
                    </div>
                    {selectedProducts.length === 0 ? (
                      <div className="offer-studio-empty-card">
                        Nenhum produto foi adicionado ainda. Volte para a busca e monte sua fila.
                      </div>
                    ) : (
                      selectedProducts.map((product) => (
                        <StudioQueueCard key={product.productId} product={product} onRemove={() => removeProduct(product.productId)} />
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {activeTool === 'themes' ? (
              <div className="offer-studio-panel-stack">
                <div className="offer-studio-panel-header">
                  <div>
                    <span className="section-kicker">Temas</span>
                    <h2>Modelos disponíveis</h2>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => navigate('/app/ofertas/modelos')}>
                    Gerenciar
                  </Button>
                </div>
                <div className="offer-studio-template-list">
                  {templates.map((template) => (
                    <StudioTemplateCard
                      key={template.id}
                      template={template}
                      selected={selectedTemplateId === template.id}
                      onUse={() => setSelectedTemplateId(template.id)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {activeTool === 'calendar' ? (
              <div className="offer-studio-panel-stack">
                <div className="offer-studio-panel-header compact">
                  <div>
                    <span className="section-kicker">Datas</span>
                    <h2>Sugestões inteligentes</h2>
                  </div>
                </div>

                <section className="offer-studio-insight-block">
                  <div className="offer-studio-panel-subhead">
                    <span className="section-kicker">Sazonalidade próxima</span>
                    <small>{overview?.seasonalSuggestions?.length || 0} itens</small>
                  </div>
                  <div className="offer-studio-mini-list">
                    {overview?.seasonalSuggestions?.slice(0, 6).map((product) => (
                      <StudioSearchResultCard
                        key={product.productId}
                        product={product as OfferCatalogProduct}
                        inQueue={selectedProductIds.has(product.productId)}
                        onAdd={() => addProductById(product.productId)}
                      />
                    ))}
                  </div>
                </section>

                <section className="offer-studio-insight-block">
                  <div className="offer-studio-panel-subhead">
                    <span className="section-kicker">Promoções com maior resposta</span>
                    <small>{overview?.promotionSuggestions?.length || 0} itens</small>
                  </div>
                  <div className="offer-studio-mini-list">
                    {overview?.promotionSuggestions?.slice(0, 5).map((product) => (
                      <StudioSearchResultCard
                        key={product.productId}
                        product={product as unknown as OfferCatalogProduct}
                        inQueue={selectedProductIds.has(product.productId)}
                        onAdd={() => addProductById(product.productId)}
                      />
                    ))}
                  </div>
                </section>

                <section className="offer-studio-insight-block">
                  <div className="offer-studio-panel-subhead">
                    <span className="section-kicker">Pares fortes</span>
                    <small>{overview?.pairSuggestions?.length || 0} combinações</small>
                  </div>
                  <div className="offer-studio-pair-list">
                    {overview?.pairSuggestions?.slice(0, 5).map((pair) => (
                      <button
                        key={`${pair.antecedentId}-${pair.consequentId}`}
                        type="button"
                        className="offer-studio-pair-card"
                        onClick={() => {
                          void addProductById(pair.antecedentId);
                          void addProductById(pair.consequentId);
                          setProductPanelMode('selected');
                          setActiveTool('products');
                        }}
                      >
                        <div className="offer-studio-pair-media">
                          <OfferProductImage src={pair.antecedentImageUrl} alt={pair.antecedentName || 'Produto'} className="offer-studio-pair-image" />
                          <span>+</span>
                          <OfferProductImage src={pair.consequentImageUrl} alt={pair.consequentName || 'Produto'} className="offer-studio-pair-image" />
                        </div>
                        <div className="offer-studio-pair-copy">
                          <strong>{pair.antecedentName}</strong>
                          <small>{pair.consequentName}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTool === 'copy' ? (
              <div className="offer-studio-panel-stack">
                <div className="offer-studio-panel-header compact">
                  <div>
                    <span className="section-kicker">Texto</span>
                    <h2>Legenda automática</h2>
                  </div>
                  <Button type="button" variant="secondary" onClick={handleCopyText} disabled={copying}>
                    {copying ? 'Copiando...' : 'Copiar texto'}
                  </Button>
                </div>
                <div className="offer-studio-copy-box">
                  <p>
                    Gere um texto de apoio para redes sociais e comunicação acessível com base nos produtos já selecionados.
                  </p>
                  <textarea className="textarea" rows={18} value={socialCopy} readOnly />
                </div>
              </div>
            ) : null}

            {activeTool === 'publish' ? (
              <div className="offer-studio-panel-stack">
                <div className="offer-studio-panel-header compact">
                  <div>
                    <span className="section-kicker">Publicação</span>
                    <h2>Fechar lote</h2>
                  </div>
                </div>
                <div className="offer-studio-publish-box">
                  <label className="offer-studio-text-field">
                    <span>Nome do lote</span>
                    <input
                      className="input"
                      value={jobName}
                      onChange={(event) => setJobName(event.target.value)}
                      placeholder="Ex.: Encarte fim de semana"
                    />
                  </label>
                  <label className="offer-studio-text-field">
                    <span>Saída</span>
                    <select className="input" value={outputType} onChange={(event) => setOutputType(event.target.value)}>
                      <option value="PNG">PNG</option>
                      <option value="PDF">PDF</option>
                      <option value="MP4">MP4</option>
                    </select>
                  </label>
                  <label className="offer-studio-text-field">
                    <span>Modo de geração</span>
                    <select className="input" value={generationMode} onChange={(event) => setGenerationMode(event.target.value)}>
                      <option value="CATALOG">Encarte multiproduto</option>
                      <option value="INDIVIDUAL">Peças individuais</option>
                    </select>
                  </label>
                  <div className="offer-studio-summary-card">
                    <strong>{selectedProducts.length} produtos</strong>
                    <span>{pageEstimate} página(s) estimadas</span>
                    <span>{selectedTemplate?.name || 'Nenhum modelo selecionado'}</span>
                  </div>
                  <div className="offer-studio-inline-actions wrap">
                    <Button type="button" onClick={handleCreateJob} disabled={saving || !selectedProducts.length || !selectedTemplateId}>
                      {saving ? 'Gerando lote...' : 'Gerar lote'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => navigate('/app/ofertas/jobs')}>
                      Ver fila
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </aside>

          <section className="offer-studio-workspace">
            <div className="offer-studio-toolbar">
              <StudioSelectField
                label="Modelo"
                value={selectedTemplateId}
                onChange={setSelectedTemplateId}
                options={templateOptions.length ? templateOptions : [{ value: '', label: 'Sem modelo' }]}
              />
              <StudioSelectField label="Grade" value={gridPreset} onChange={setGridPreset} options={[...GRID_PRESET_OPTIONS]} />
              <StudioSelectField label="Boxes de produtos" value={productBoxMode} onChange={setProductBoxMode} options={[...PRODUCT_BOX_OPTIONS]} />
              <StudioSelectField label="Texto" value={textMode} onChange={setTextMode} options={[...TEXT_MODE_OPTIONS]} />
              <StudioSelectField label="Cores" value={colorMode} onChange={setColorMode} options={[...COLOR_MODE_OPTIONS]} />
              <label className="offer-studio-toggle-field">
                <span>Gerar capa</span>
                <button
                  type="button"
                  className={`offer-studio-toggle ${coverEnabled ? 'active' : ''}`}
                  onClick={() => setCoverEnabled((current) => !current)}
                >
                  <span />
                </button>
              </label>
              <StudioSelectField label="Rodapé" value={footerMode} onChange={setFooterMode} options={[...FOOTER_OPTIONS]} />
              <StudioSelectField label="Zoom" value={zoomMode} onChange={setZoomMode} options={[...ZOOM_OPTIONS]} />
            </div>

            <div className="offer-studio-stage-wrap">
              <div className="offer-studio-stage-header">
                <div>
                  <span className="section-kicker">Prévia da arte</span>
                  <h2>{selectedTemplate?.name || 'Selecione um modelo'}</h2>
                </div>
                <div className="offer-studio-stage-meta">
                  <span>{generationMode === 'CATALOG' ? 'Encarte automático' : 'Peças individuais'}</span>
                  <span>{itemsPerPage} slots</span>
                </div>
              </div>

              <div className="offer-studio-stage-surface">
                <div className="offer-studio-stage-canvas" style={{ transform: `scale(${stageScale})` }}>
                  <OfferCanvasPreview
                    template={selectedTemplate}
                    products={stageProducts}
                    gridLimit={generationMode === 'CATALOG' ? itemsPerPage : 1}
                    footerText={footerText}
                    className={`offer-studio-canvas-preview color-${colorMode.toLowerCase()} mode-${productBoxMode.toLowerCase()}`}
                  />
                </div>
              </div>

              <div className="offer-studio-output-bar">
                <div className="offer-studio-output-meta">
                  <strong>Página 1 de {pageEstimate}</strong>
                  <span>{selectedProducts.length} produtos selecionados</span>
                </div>
                <div className="offer-studio-output-actions">
                  <Button type="button" variant="secondary" onClick={() => setActiveTool('themes')}>
                    Modelos
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => navigate('/app/ofertas/jobs')}>
                    Lotes
                  </Button>
                  <Button type="button" onClick={handleCreateJob} disabled={saving || !selectedProducts.length || !selectedTemplateId}>
                    {saving ? 'Gerando...' : 'Gerar lote'}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default OfferDesigner;
