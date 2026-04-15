import React from 'react';
import { Boxes, ChevronDown, ChevronUp, PackageSearch } from 'lucide-react';
import Button from '../../components/common/Button';
import type { OfferCatalogProduct } from '../../types/offers.types';
import {
  StudioQueueCard,
  StudioSearchResultCard,
} from './StudioPrimitives';

type ProductPanelMode = 'search' | 'selected';

type OfferStudioProductsPanelProps = {
  productPanelMode: ProductPanelMode;
  onChangeMode: (mode: ProductPanelMode) => void;
  searchBoxCollapsed: boolean;
  onToggleSearchBox: () => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  bulkInput: string;
  onBulkInputChange: (value: string) => void;
  onBulkInputKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBulkLookup: () => void;
  bulkSearching: boolean;
  onAddAllResults: () => void;
  resultsCollapsed: boolean;
  onToggleResults: () => void;
  searching: boolean;
  results: OfferCatalogProduct[];
  selectedProducts: OfferCatalogProduct[];
  isInQueue: (productId: string) => boolean;
  removingBackgroundId?: string | null;
  onAddProduct: (product: OfferCatalogProduct) => void;
  onRemoveProduct: (productId: string) => void;
  onCleanBackground?: (product: OfferCatalogProduct) => void;
};

const OfferStudioProductsPanel: React.FC<OfferStudioProductsPanelProps> = ({
  productPanelMode,
  onChangeMode,
  searchBoxCollapsed,
  onToggleSearchBox,
  searchInput,
  onSearchInputChange,
  bulkInput,
  onBulkInputChange,
  onBulkInputKeyDown,
  onBulkLookup,
  bulkSearching,
  onAddAllResults,
  resultsCollapsed,
  onToggleResults,
  searching,
  results,
  selectedProducts,
  isInQueue,
  removingBackgroundId,
  onAddProduct,
  onRemoveProduct,
  onCleanBackground,
}) => (
  <div className="offer-studio-panel-stack">
    <div className="offer-studio-panel-header">
      <div>
        <span className="section-kicker">Produtos</span>
        <h2>Monte a fila do encarte</h2>
      </div>
      <div className="offer-studio-panel-tabs">
        <button type="button" className={productPanelMode === 'search' ? 'active' : ''} onClick={() => onChangeMode('search')}>Pesquisar</button>
        <button type="button" className={productPanelMode === 'selected' ? 'active' : ''} onClick={() => onChangeMode('selected')}>Meus produtos</button>
      </div>
    </div>

    {productPanelMode === 'search' ? (
      <>
        <div className="offer-studio-search-box">
          <button type="button" className="offer-studio-section-toggle" onClick={onToggleSearchBox} aria-expanded={!searchBoxCollapsed}>
            <span>
              <strong>Buscar no catálogo</strong>
              <small>Digite um produto ou cole uma lista, um item por linha, para revisar os candidatos abaixo.</small>
            </span>
            {searchBoxCollapsed ? <ChevronDown size={16} strokeWidth={2.2} /> : <ChevronUp size={16} strokeWidth={2.2} />}
          </button>
          {!searchBoxCollapsed ? (
            <>
              <label className="offer-studio-text-field">
                <span>Buscar no catálogo</span>
                <input className="input" value={searchInput} onChange={(event) => onSearchInputChange(event.target.value)} placeholder="Digite nome, GTIN ou marca" />
              </label>
              <label className="offer-studio-text-field">
                <span>Cole a lista de produtos</span>
                <textarea
                  className="textarea"
                  rows={6}
                  value={bulkInput}
                  onChange={(event) => onBulkInputChange(event.target.value)}
                  onKeyDown={onBulkInputKeyDown}
                  placeholder={'Ex.: coca cola 2l\narroz tio joao 5kg\ncerveja heineken 600ml'}
                />
              </label>
              <div className="offer-studio-inline-actions">
                <Button type="button" onClick={onBulkLookup} disabled={bulkSearching}>
                  <PackageSearch size={16} strokeWidth={2.1} />
                  {bulkSearching ? 'Processando lista...' : 'Buscar produtos'}
                </Button>
                <Button type="button" variant="secondary" onClick={onAddAllResults} disabled={!results.length}>
                  <Boxes size={16} strokeWidth={2.1} />
                  Adicionar resultados
                </Button>
              </div>
            </>
          ) : null}
        </div>

        <div className="offer-studio-panel-list">
          <button type="button" className="offer-studio-panel-subhead offer-studio-panel-subhead-button" onClick={onToggleResults} aria-expanded={!resultsCollapsed}>
            <span className="section-kicker">Resultado da busca</span>
            <span className="offer-studio-panel-subhead-meta">
              <small>{searching ? 'Buscando...' : `${results.length} itens encontrados`}</small>
              {resultsCollapsed ? <ChevronDown size={16} strokeWidth={2.2} /> : <ChevronUp size={16} strokeWidth={2.2} />}
            </span>
          </button>
          {!resultsCollapsed ? (
            results.length === 0 ? (
              <div className="offer-studio-empty-card">Pesquise um item do catálogo ou processe uma lista para revisar os produtos e adicionar um por vez.</div>
            ) : (
              results.map((product) => (
                <StudioSearchResultCard
                  key={product.productId}
                  product={product}
                  inQueue={isInQueue(product.productId)}
                  removingBackground={removingBackgroundId === product.productId}
                  onAdd={() => onAddProduct(product)}
                  onCleanBackground={onCleanBackground ? () => onCleanBackground(product) : undefined}
                />
              ))
            )
          ) : null}
        </div>
      </>
    ) : (
      <div className="offer-studio-panel-list">
        <div className="offer-studio-panel-subhead">
          <span className="section-kicker">Fila selecionada</span>
          <small>{selectedProducts.length} produtos preparados</small>
        </div>
        {selectedProducts.length === 0 ? (
          <div className="offer-studio-empty-card">Nenhum produto foi adicionado ainda. Volte para a busca e monte sua fila.</div>
        ) : (
          selectedProducts.map((product) => (
            <StudioQueueCard
              key={product.productId}
              product={product}
              removingBackground={removingBackgroundId === product.productId}
              onRemove={() => onRemoveProduct(product.productId)}
              onCleanBackground={onCleanBackground ? () => onCleanBackground(product) : undefined}
            />
          ))
        )}
      </div>
    )}
  </div>
);

export default OfferStudioProductsPanel;
