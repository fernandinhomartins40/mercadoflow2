import React from 'react';
import { BoxSelect, LayoutTemplate, Layers3, Plus, RefreshCw, Target } from 'lucide-react';
import Button from '../../components/common/Button';
import OfferProductImage from '../../components/offers/OfferProductImage';
import { buildTemplateBuilderDraft, customLayerTypeLabel } from './model';
import {
  StudioAssetStatus,
  StudioBoundsFields,
  StudioCollapsibleSection,
  StudioColorField,
  StudioLayerRow,
  StudioPropertyRow,
  StudioZoneCard,
} from './StudioPrimitives';

type OfferStudioBuilderPanelProps = {
  context: any;
};

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const normalizeHexColor = (value: string, fallback = '#ffffff') => {
  const normalized = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    return `#${normalized.slice(1).split('').map((char) => char + char).join('')}`;
  }
  return fallback;
};

export default function OfferStudioBuilderPanel({ context }: OfferStudioBuilderPanelProps) {
  const {
    activeCustomLayer,
    activeCustomLayerSupportsFont,
    activeCustomLayerSupportsImage,
    activeCustomLayerSupportsShape,
    activeCustomLayerSupportsText,
    activeCustomLayerType,
    activeInspectorCanvasTarget,
    activeLayer,
    activeZone,
    activeZoneBinding,
    brandKitOptions,
    brandKits,
    campaignKitOptions,
    campaignKits,
    canvasEditTarget,
    canvasSelectedLayerId,
    canvasSelectedZoneId,
    collapsedConfigSections,
    dragOverLayerId,
    draggingLayerId,
    effectiveMarketId,
    handleAddTemplateLayer,
    handleCanvasEditToggle,
    handleCreateTemplateFromCurrent,
    handleDeleteTemplateLayer,
    handleLayerDragEnd,
    handleLayerDragOver,
    handleLayerDragStart,
    handleLayerDrop,
    handleSaveStructure,
    handleSaveTemplateBuilder,
    handleToggleLayerLock,
    handleToggleLayerVisibility,
    handleUploadTemplateAsset,
    isSuperAdminMode,
    layerDraft,
    layerInsertOptions,
    loadTemplateMeta,
    marketsLoading,
    newLayerOption,
    refreshPreview,
    renderCanvasEditButton,
    resolvedLayers,
    resolvedZones,
    saving,
    selectedBrandKitId,
    selectedCampaignKitId,
    selectedSuperAdminMarket,
    selectedSuperAdminMarketId,
    selectedTemplate,
    selectedTemplateId,
    selectedVariant,
    selectedVariantKey,
    setLayerDraft,
    setNewLayerOption,
    setSelectedBrandKitId,
    setSelectedCampaignKitId,
    setSelectedSuperAdminMarketId,
    setSelectedLayerId,
    setSelectedVariantKey,
    setSelectedZoneId,
    setTemplateBuilderDraft,
    setZoneDraft,
    superAdminMarketOptions,
    templateBuilderDraft,
    templates,
    toggleConfigSection,
    uploadingAsset,
    validation,
    variantOptions,
    zoneDraft,
  } = context;

  return (
                <>
                <div className="offer-studio-theme-grid">
                  <StudioCollapsibleSection
                    title="Template builder"
                    description="Crie templates com areas de fundo, selo, rodape, logos e conteudo."
                    collapsed={Boolean(collapsedConfigSections.builderGeneral)}
                    onToggle={() => toggleConfigSection('builderGeneral')}
                    className="md:col-span-2"
                  >
                    <div className="offer-studio-edit-grid">
                      {isSuperAdminMode ? (
                        <>
                          <label className="offer-studio-text-field md:col-span-2">
                            <span>Conta da plataforma</span>
                            <select
                              className="input"
                              value={selectedSuperAdminMarketId}
                              onChange={(event) => setSelectedSuperAdminMarketId(event.target.value)}
                              disabled={marketsLoading || superAdminMarketOptions.length === 0}
                            >
                              {superAdminMarketOptions.length ? (
                                superAdminMarketOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))
                              ) : (
                                <option value="">Nenhuma conta encontrada</option>
                              )}
                            </select>
                          </label>
                          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500 md:col-span-2">
                            <strong className="block text-gray-900">Templates salvos aqui aparecem no painel admin da conta.</strong>
                            <span>{selectedSuperAdminMarket ? `Conta ativa: ${selectedSuperAdminMarket.name}` : 'Selecione uma conta para abrir os dados.'}</span>
                          </div>
                        </>
                      ) : null}
                      <label className="offer-studio-text-field">
                        <span>Nome do template</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.name}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Ex.: Cartaz premium vertical"
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Canal</span>
                        <select
                          className="input"
                          value={templateBuilderDraft.channel}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, channel: event.target.value }))}
                        >
                          <option value="PRINT">Print</option>
                          <option value="SOCIAL">Social</option>
                          <option value="PORTAL">Portal</option>
                          <option value="TV">TV</option>
                        </select>
                      </label>
                      <label className="offer-studio-text-field md:col-span-2">
                        <span>Descrição</span>
                        <textarea
                          className="textarea"
                          rows={3}
                          value={templateBuilderDraft.description}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, description: event.target.value }))}
                          placeholder="Descreva em que contexto esse template deve ser usado."
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Largura do canvas</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.canvasWidth}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, canvasWidth: event.target.value }))}
                          placeholder="1080"
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Altura do canvas</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.canvasHeight}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, canvasHeight: event.target.value }))}
                          placeholder="1350"
                        />
                      </label>
                    </div>
                    <div className="offer-studio-inline-actions wrap">
                      <Button type="button" onClick={() => void handleSaveTemplateBuilder()} disabled={saving || !selectedTemplateId}>
                        <Layers3 size={16} strokeWidth={2.1} />
                        {saving ? 'Aplicando...' : 'Aplicar no template atual'}
                      </Button>
                      {isSuperAdminMode ? (
                        <Button type="button" variant="secondary" onClick={() => void handleCreateTemplateFromCurrent()} disabled={saving || !effectiveMarketId}>
                          <LayoutTemplate size={16} strokeWidth={2.1} />
                          {saving ? 'Salvando...' : 'Salvar como novo template'}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setTemplateBuilderDraft(buildTemplateBuilderDraft(selectedTemplate, selectedVariant))}
                        disabled={!selectedTemplate}
                      >
                        <RefreshCw size={16} strokeWidth={2.1} />
                        Recarregar estrutura atual
                      </Button>
                    </div>
                  </StudioCollapsibleSection>
                  <StudioCollapsibleSection
                    title="Fundo"
                    description="As opcoes mudam conforme o tipo de fundo selecionado."
                    collapsed={Boolean(collapsedConfigSections.builderBackground)}
                    onToggle={() => toggleConfigSection('builderBackground')}
                  >
                    <div className="offer-studio-edit-grid">
                      <label className="offer-studio-text-field">
                        <span>Tipo de fundo</span>
                        <select
                          className="input"
                          value={templateBuilderDraft.backgroundMode}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, backgroundMode: event.target.value }))}
                        >
                          <option value="solid">Cor solida</option>
                          <option value="gradient">Gradiente</option>
                          <option value="image">Imagem</option>
                        </select>
                      </label>
                      {templateBuilderDraft.backgroundMode === 'solid' ? (
                        <StudioColorField
                          label="Cor base"
                          value={templateBuilderDraft.backgroundColor}
                          onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, backgroundColor: value }))}
                          placeholder="#f9fafb"
                        />
                      ) : null}
                      {templateBuilderDraft.backgroundMode === 'gradient' ? (
                        <>
                          <StudioColorField
                            label="Inicio do gradiente"
                            value={templateBuilderDraft.backgroundStart}
                            onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, backgroundStart: value }))}
                            placeholder="#f9fafb"
                          />
                          <StudioColorField
                            label="Fim do gradiente"
                            value={templateBuilderDraft.backgroundEnd}
                            onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, backgroundEnd: value }))}
                            placeholder="#d1fae5"
                          />
                        </>
                      ) : null}
                      {templateBuilderDraft.backgroundMode === 'image' ? (
                        <>
                          <StudioColorField
                            label="Cor de apoio"
                            value={templateBuilderDraft.backgroundColor}
                            onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, backgroundColor: value }))}
                            placeholder="#f9fafb"
                          />
                          <div className="md:col-span-2">
                            <StudioAssetStatus
                              label="Imagem de fundo"
                              storageKey={templateBuilderDraft.backgroundImageStorageKey}
                              hasAsset={Boolean(templateBuilderDraft.backgroundImageUrl)}
                            />
                          </div>
                          <label className="offer-studio-text-field md:col-span-2">
                            <span>Upload da imagem de fundo</span>
                            <input
                              className="input"
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(event) => void handleUploadTemplateAsset('template-background', event.target.files?.[0])}
                              disabled={uploadingAsset === 'template-background'}
                            />
                          </label>
                        </>
                      ) : null}
                    </div>
                  </StudioCollapsibleSection>

                  <StudioCollapsibleSection
                    title="Selo 3D"
                    description="Posicione a area do selo direto na arte."
                    collapsed={Boolean(collapsedConfigSections.builderBadge)}
                    onToggle={() => toggleConfigSection('builderBadge')}
                  >
                    <div className="offer-studio-card-toolbar">
                      {renderCanvasEditButton('campaign-badge', 'Posicionar selo')}
                    </div>
                    <div className="offer-studio-edit-grid">
                      <div className="md:col-span-2">
                        <StudioAssetStatus
                          label="PNG do selo 3D"
                          storageKey={templateBuilderDraft.badge.storageKey}
                          hasAsset={Boolean(templateBuilderDraft.badge.imageUrl)}
                        />
                      </div>
                      <label className="offer-studio-text-field md:col-span-2">
                        <span>Upload do selo 3D</span>
                        <input
                          className="input"
                          type="file"
                          accept="image/png,image/webp"
                          onChange={(event) => void handleUploadTemplateAsset('template-badge', event.target.files?.[0])}
                          disabled={uploadingAsset === 'template-badge'}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Raio do selo</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.badge.radius}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, badge: { ...current.badge, radius: event.target.value } }))}
                        />
                      </label>
                    </div>
                    <div className="offer-studio-check-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={templateBuilderDraft.badge.visible}
                          onChange={(event) =>
                            setTemplateBuilderDraft((current) => ({ ...current, badge: { ...current.badge, visible: event.target.checked } }))
                          }
                        />
                        <span>Exibir selo</span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={templateBuilderDraft.badge.frame}
                          onChange={(event) =>
                            setTemplateBuilderDraft((current) => ({ ...current, badge: { ...current.badge, frame: event.target.checked } }))
                          }
                        />
                        <span>Aplicar moldura</span>
                      </label>
                    </div>
                    <StudioBoundsFields
                      value={templateBuilderDraft.badge}
                      onChange={(next) => setTemplateBuilderDraft((current) => ({ ...current, badge: { ...current.badge, ...next } }))}
                    />
                  </StudioCollapsibleSection>


                  <StudioCollapsibleSection
                    title="Card do produto"
                    description="Receita visual dos produtos dentro da area branca do template."
                    collapsed={Boolean(collapsedConfigSections.builderCard)}
                    onToggle={() => toggleConfigSection('builderCard')}
                  >
                    <div className="offer-studio-edit-grid">
                      <label className="offer-studio-text-field">
                        <span>Fundo do card</span>
                          <div className="offer-studio-color-control">
                            <input
                              className="offer-studio-color-picker"
                              type="color"
                              value={normalizeHexColor(templateBuilderDraft.card.background, '#ffffff')}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, background: event.target.value } }))}
                              aria-label="Fundo do card"
                            />
                            <input
                              className="input"
                              value={templateBuilderDraft.card.background}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, background: event.target.value } }))}
                              spellCheck={false}
                              autoCapitalize="off"
                              autoCorrect="off"
                            />
                          </div>
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Borda do card</span>
                          <div className="offer-studio-color-control">
                            <input
                              className="offer-studio-color-picker"
                              type="color"
                              value={normalizeHexColor(templateBuilderDraft.card.borderColor, '#ead9ca')}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, borderColor: event.target.value } }))}
                              aria-label="Borda do card"
                            />
                            <input
                              className="input"
                              value={templateBuilderDraft.card.borderColor}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, borderColor: event.target.value } }))}
                              spellCheck={false}
                              autoCapitalize="off"
                              autoCorrect="off"
                            />
                          </div>
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Cor do texto</span>
                          <div className="offer-studio-color-control">
                            <input
                              className="offer-studio-color-picker"
                              type="color"
                              value={normalizeHexColor(templateBuilderDraft.card.textColor, '#1f1613')}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, textColor: event.target.value } }))}
                              aria-label="Cor do texto"
                            />
                            <input
                              className="input"
                              value={templateBuilderDraft.card.textColor}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, textColor: event.target.value } }))}
                              spellCheck={false}
                              autoCapitalize="off"
                              autoCorrect="off"
                            />
                          </div>
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Raio do card</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.cardRadius}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, cardRadius: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Raio do preco</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.priceBoxRadius}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceBoxRadius: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Fonte do nome</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.nameFontSize}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, nameFontSize: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Fonte da descricao</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.descriptionFontSize}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, descriptionFontSize: event.target.value } }))}
                        />
                      </label>
                    </div>
                    <div className="offer-studio-check-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={templateBuilderDraft.card.showDescription}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, showDescription: event.target.checked } }))}
                        />
                        <span>Mostrar descricao</span>
                      </label>
                    </div>
                  </StudioCollapsibleSection>

                  <StudioCollapsibleSection
                    title="Preco do card"
                    description="Personalize manualmente o bloco de preco, prefixo, centavos e unidade."
                    collapsed={Boolean(collapsedConfigSections.builderPrice)}
                    onToggle={() => toggleConfigSection('builderPrice')}
                  >
                    <div className="offer-studio-edit-grid">
                      <label className="offer-studio-text-field">
                        <span>Layout do preco</span>
                        <select
                          className="input"
                          value={templateBuilderDraft.card.priceLayout}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceLayout: event.target.value } }))}
                        >
                          <option value="inline">Inline classico</option>
                          <option value="split">Destacado com centavos</option>
                        </select>
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Prefixo do preco</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.priceLabel}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceLabel: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Layout da unidade</span>
                        <select
                          className="input"
                          value={templateBuilderDraft.card.priceUnitLayout}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceUnitLayout: event.target.value } }))}
                        >
                          <option value="stacked">Empilhada</option>
                          <option value="side">Lateral</option>
                        </select>
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Estilo da borda</span>
                        <select
                          className="input"
                          value={templateBuilderDraft.card.priceBorderStyle}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceBorderStyle: event.target.value } }))}
                        >
                          <option value="solid">Solida</option>
                          <option value="dashed">Tracejada</option>
                        </select>
                      </label>
                      <StudioColorField
                        label="Fundo do preco"
                        value={templateBuilderDraft.card.priceBoxBackground}
                        onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceBoxBackground: value } }))}
                        placeholder="#ff3b1f"
                      />
                      <StudioColorField
                        label="Borda do preco"
                        value={templateBuilderDraft.card.priceBorderColor}
                        onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceBorderColor: value } }))}
                        placeholder="#ffc44f"
                      />
                      <StudioColorField
                        label="Fundo do prefixo"
                        value={templateBuilderDraft.card.priceLabelBackground}
                        onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceLabelBackground: value } }))}
                        placeholder="#ffffff"
                      />
                      <StudioColorField
                        label="Texto do prefixo"
                        value={templateBuilderDraft.card.priceLabelTextColor}
                        onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceLabelTextColor: value } }))}
                        placeholder="#fff1d6"
                      />
                      <StudioColorField
                        label="Borda do prefixo"
                        value={templateBuilderDraft.card.priceLabelBorderColor}
                        onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceLabelBorderColor: value } }))}
                        placeholder="#ffffff"
                      />
                      <StudioColorField
                        label="Cor do valor"
                        value={templateBuilderDraft.card.priceValueColor}
                        onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceValueColor: value, priceBoxTextColor: value } }))}
                        placeholder="#ffffff"
                      />
                      <StudioColorField
                        label="Cor dos centavos"
                        value={templateBuilderDraft.card.priceFractionColor}
                        onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceFractionColor: value } }))}
                        placeholder="#ffffff"
                      />
                      <StudioColorField
                        label="Cor da unidade"
                        value={templateBuilderDraft.card.priceUnitColor}
                        onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceUnitColor: value } }))}
                        placeholder="#ffffff"
                      />
                      <StudioColorField
                        label="Preco anterior"
                        value={templateBuilderDraft.card.priceBaselineColor}
                        onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceBaselineColor: value } }))}
                        placeholder="#7a5b49"
                      />
                      <label className="offer-studio-text-field">
                        <span>Raio do preco</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.priceBoxRadius}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceBoxRadius: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Espessura da borda</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.priceBorderWidth}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceBorderWidth: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Raio do prefixo</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.priceLabelRadius}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceLabelRadius: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Tamanho do prefixo</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.priceLabelSize}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceLabelSize: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Fonte do prefixo</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.priceLabelFontSize}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceLabelFontSize: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Fonte do valor</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.priceFontSize}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceFontSize: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Fonte dos centavos</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.priceFractionFontSize}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceFractionFontSize: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Fonte da unidade</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.priceUnitFontSize}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceUnitFontSize: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Fonte do preco anterior</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.priceBaselineFontSize}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceBaselineFontSize: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Padding horizontal</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.pricePaddingX}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, pricePaddingX: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Padding vertical</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.pricePaddingY}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, pricePaddingY: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Gap interno</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.card.priceGap}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, priceGap: event.target.value } }))}
                        />
                      </label>
                    </div>
                    <div className="offer-studio-check-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={templateBuilderDraft.card.showUnit}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, showUnit: event.target.checked } }))}
                        />
                        <span>Mostrar unidade</span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={templateBuilderDraft.card.showBaselinePrice}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, card: { ...current.card, showBaselinePrice: event.target.checked } }))}
                        />
                        <span>Mostrar preco anterior</span>
                      </label>
                    </div>
                  </StudioCollapsibleSection>

                  <StudioCollapsibleSection
                    title="Rodape"
                    description="O template define fundo, areas de texto e posicao das logos. O conteudo vem do mercado."
                    collapsed={Boolean(collapsedConfigSections.builderFooter)}
                    onToggle={() => toggleConfigSection('builderFooter')}
                  >
                    <div className="offer-studio-card-toolbar">
                      {renderCanvasEditButton('footer', 'Posicionar rodape')}
                    </div>
                    <div className="offer-studio-edit-grid">
                      <label className="offer-studio-text-field">
                        <span>Cor do fundo</span>
                          <div className="offer-studio-color-control">
                            <input
                              className="offer-studio-color-picker"
                              type="color"
                              value={normalizeHexColor(templateBuilderDraft.footer.background, '#2c1d17')}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footer: { ...current.footer, background: event.target.value } }))}
                              aria-label="Cor do fundo"
                            />
                            <input
                              className="input"
                              value={templateBuilderDraft.footer.background}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footer: { ...current.footer, background: event.target.value } }))}
                              spellCheck={false}
                              autoCapitalize="off"
                              autoCorrect="off"
                            />
                          </div>
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Cor do texto</span>
                          <div className="offer-studio-color-control">
                            <input
                              className="offer-studio-color-picker"
                              type="color"
                              value={normalizeHexColor(templateBuilderDraft.footer.textColor, '#fff4ee')}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footer: { ...current.footer, textColor: event.target.value } }))}
                              aria-label="Cor do texto"
                            />
                            <input
                              className="input"
                              value={templateBuilderDraft.footer.textColor}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footer: { ...current.footer, textColor: event.target.value } }))}
                              spellCheck={false}
                              autoCapitalize="off"
                              autoCorrect="off"
                            />
                          </div>
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Raio do rodape</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.footer.radius}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footer: { ...current.footer, radius: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Fonte base</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.footer.fontSize}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footer: { ...current.footer, fontSize: event.target.value } }))}
                        />
                      </label>
                    </div>
                    <div className="offer-studio-check-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={templateBuilderDraft.footer.visible}
                          onChange={(event) =>
                            setTemplateBuilderDraft((current) => ({ ...current, footer: { ...current.footer, visible: event.target.checked } }))
                          }
                        />
                        <span>Exibir rodape</span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={templateBuilderDraft.footerContent.visible}
                          onChange={(event) =>
                            setTemplateBuilderDraft((current) => ({ ...current, footerContent: { ...current.footerContent, visible: event.target.checked } }))
                          }
                        />
                        <span>Exibir texto principal</span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={templateBuilderDraft.footerLegal.visible}
                          onChange={(event) =>
                            setTemplateBuilderDraft((current) => ({ ...current, footerLegal: { ...current.footerLegal, visible: event.target.checked } }))
                          }
                        />
                        <span>Exibir aviso legal</span>
                      </label>
                    </div>
                    <StudioBoundsFields
                      value={templateBuilderDraft.footer}
                      onChange={(next) => setTemplateBuilderDraft((current) => ({ ...current, footer: { ...current.footer, ...next } }))}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="offer-studio-panel-subhead">
                          <span className="section-kicker">Conteudo principal</span>
                          <small>Area do texto principal do mercado</small>
                        </div>
                        <div className="offer-studio-card-toolbar compact">
                          {renderCanvasEditButton('footer-content', 'Posicionar texto')}
                        </div>
                        <div className="offer-studio-edit-grid">
                          <label className="offer-studio-text-field">
                            <span>Fonte</span>
                            <input
                              className="input"
                              value={templateBuilderDraft.footerContent.fontSize}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footerContent: { ...current.footerContent, fontSize: event.target.value } }))}
                            />
                          </label>
                          <label className="offer-studio-text-field">
                            <span>Peso</span>
                            <input
                              className="input"
                              value={templateBuilderDraft.footerContent.fontWeight}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footerContent: { ...current.footerContent, fontWeight: event.target.value } }))}
                            />
                          </label>
                        </div>
                        <StudioBoundsFields
                          value={templateBuilderDraft.footerContent}
                          onChange={(next) => setTemplateBuilderDraft((current) => ({ ...current, footerContent: { ...current.footerContent, ...next } }))}
                        />
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="offer-studio-panel-subhead">
                          <span className="section-kicker">Aviso legal</span>
                          <small>Area do texto secundario do mercado</small>
                        </div>
                        <div className="offer-studio-card-toolbar compact">
                          {renderCanvasEditButton('footer-legal', 'Posicionar texto')}
                        </div>
                        <div className="offer-studio-edit-grid">
                          <label className="offer-studio-text-field">
                            <span>Fonte</span>
                            <input
                              className="input"
                              value={templateBuilderDraft.footerLegal.fontSize}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footerLegal: { ...current.footerLegal, fontSize: event.target.value } }))}
                            />
                          </label>
                          <label className="offer-studio-text-field">
                            <span>Peso</span>
                            <input
                              className="input"
                              value={templateBuilderDraft.footerLegal.fontWeight}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footerLegal: { ...current.footerLegal, fontWeight: event.target.value } }))}
                            />
                          </label>
                        </div>
                        <StudioBoundsFields
                          value={templateBuilderDraft.footerLegal}
                          onChange={(next) => setTemplateBuilderDraft((current) => ({ ...current, footerLegal: { ...current.footerLegal, ...next } }))}
                        />
                      </div>
                    </div>
                  </StudioCollapsibleSection>

                  <StudioCollapsibleSection
                    title="Area de conteudo"
                    description="Zona onde os produtos serao distribuidos automaticamente."
                    collapsed={Boolean(collapsedConfigSections.builderContent)}
                    onToggle={() => toggleConfigSection('builderContent')}
                    className="md:col-span-2"
                  >
                    <div className="offer-studio-card-toolbar">
                      {renderCanvasEditButton('content-zone', 'Posicionar area')}
                    </div>
                    <div className="offer-studio-edit-grid">
                      <label className="offer-studio-text-field">
                        <span>Layout</span>
                        <select
                          className="input"
                          value={templateBuilderDraft.contentZone.layout}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, contentZone: { ...current.contentZone, layout: event.target.value } }))}
                        >
                          <option value="grid">Grade</option>
                          <option value="hero">Hero</option>
                          <option value="single">Single</option>
                        </select>
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Slots</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.contentZone.slotCount}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, contentZone: { ...current.contentZone, slotCount: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Colunas</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.contentZone.columns}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, contentZone: { ...current.contentZone, columns: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Linhas</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.contentZone.rows}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, contentZone: { ...current.contentZone, rows: event.target.value } }))}
                        />
                      </label>
                    </div>
                    <StudioBoundsFields
                      value={templateBuilderDraft.contentZone}
                      onChange={(next) => setTemplateBuilderDraft((current) => ({ ...current, contentZone: { ...current.contentZone, ...next } }))}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="offer-studio-panel-subhead">
                          <span className="section-kicker">Logo primaria</span>
                          <small>Area da logo do mercado</small>
                        </div>
                        <div className="offer-studio-card-toolbar compact">
                          {renderCanvasEditButton('footer-logo-left', 'Posicionar logo')}
                        </div>
                        <div className="offer-studio-check-row">
                          <label>
                            <input
                              type="checkbox"
                              checked={templateBuilderDraft.footerLeftLogo.visible}
                              onChange={(event) =>
                                setTemplateBuilderDraft((current) => ({ ...current, footerLeftLogo: { ...current.footerLeftLogo, visible: event.target.checked } }))
                              }
                            />
                            <span>Exibir logo</span>
                          </label>
                        </div>
                        <div className="offer-studio-edit-grid">
                          <label className="offer-studio-text-field">
                            <span>Raio</span>
                            <input
                              className="input"
                              value={templateBuilderDraft.footerLeftLogo.radius}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footerLeftLogo: { ...current.footerLeftLogo, radius: event.target.value } }))}
                            />
                          </label>
                          <label className="offer-studio-text-field">
                            <span>Moldura</span>
                            <select
                              className="input"
                              value={templateBuilderDraft.footerLeftLogo.frame ? 'yes' : 'no'}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footerLeftLogo: { ...current.footerLeftLogo, frame: event.target.value === 'yes' } }))}
                            >
                              <option value="no">Sem moldura</option>
                              <option value="yes">Com moldura</option>
                            </select>
                          </label>
                        </div>
                        <StudioBoundsFields
                          value={templateBuilderDraft.footerLeftLogo}
                          onChange={(next) => setTemplateBuilderDraft((current) => ({ ...current, footerLeftLogo: { ...current.footerLeftLogo, ...next } }))}
                        />
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="offer-studio-panel-subhead">
                          <span className="section-kicker">Logo secundaria</span>
                          <small>Area opcional do rodape</small>
                        </div>
                        <div className="offer-studio-card-toolbar compact">
                          {renderCanvasEditButton('footer-logo-right', 'Posicionar logo')}
                        </div>
                        <div className="offer-studio-check-row">
                          <label>
                            <input
                              type="checkbox"
                              checked={templateBuilderDraft.footerRightLogo.visible}
                              onChange={(event) =>
                                setTemplateBuilderDraft((current) => ({ ...current, footerRightLogo: { ...current.footerRightLogo, visible: event.target.checked } }))
                              }
                            />
                            <span>Exibir logo</span>
                          </label>
                        </div>
                        <div className="offer-studio-edit-grid">
                          <label className="offer-studio-text-field">
                            <span>Raio</span>
                            <input
                              className="input"
                              value={templateBuilderDraft.footerRightLogo.radius}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footerRightLogo: { ...current.footerRightLogo, radius: event.target.value } }))}
                            />
                          </label>
                          <label className="offer-studio-text-field">
                            <span>Moldura</span>
                            <select
                              className="input"
                              value={templateBuilderDraft.footerRightLogo.frame ? 'yes' : 'no'}
                              onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footerRightLogo: { ...current.footerRightLogo, frame: event.target.value === 'yes' } }))}
                            >
                              <option value="no">Sem moldura</option>
                              <option value="yes">Com moldura</option>
                            </select>
                          </label>
                        </div>
                        <StudioBoundsFields
                          value={templateBuilderDraft.footerRightLogo}
                          onChange={(next) => setTemplateBuilderDraft((current) => ({ ...current, footerRightLogo: { ...current.footerRightLogo, ...next } }))}
                        />
                      </div>
                    </div>
                  </StudioCollapsibleSection>
                </div>
                <StudioCollapsibleSection
                  title="Estrutura ativa"
                  description={validation?.valid ? 'Template valido' : 'Template em ajuste'}
                  collapsed={Boolean(collapsedConfigSections.structure)}
                  onToggle={() => toggleConfigSection('structure')}
                  containerClassName="rounded-2xl border border-gray-200 bg-[rgba(255,255,255,0.04)] p-5"
                >
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="offer-studio-text-field">
                      <span>Variante</span>
                      <select className="input" value={selectedVariantKey} onChange={(event) => setSelectedVariantKey(event.target.value)}>
                        {variantOptions.length ? variantOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : <option value="">Sem variante</option>}
                      </select>
                    </label>
                    <label className="offer-studio-text-field">
                      <span>Brand kit</span>
                      <select className="input" value={selectedBrandKitId} onChange={(event) => setSelectedBrandKitId(event.target.value)}>
                        {brandKitOptions.length ? brandKitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : <option value="">Sem brand kit</option>}
                      </select>
                    </label>
                    <label className="offer-studio-text-field md:col-span-2">
                      <span>Campaign kit</span>
                      <select className="input" value={selectedCampaignKitId} onChange={(event) => setSelectedCampaignKitId(event.target.value)}>
                        {campaignKitOptions.length ? campaignKitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : <option value="">Sem campanha</option>}
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button type="button" variant="secondary" onClick={() => selectedTemplateId && void loadTemplateMeta(selectedTemplateId, templates, brandKits, campaignKits)}>
                      <Target size={16} strokeWidth={2.1} />
                      Revalidar
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void refreshPreview('preview')}>
                      <RefreshCw size={16} strokeWidth={2.1} />
                      Atualizar prévia
                    </Button>
                  </div>
                  {validation ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-gray-200 bg-white/90 px-4 py-3"><span className="section-kicker">Camadas</span><strong className="mt-1 block text-2xl">{validation.layerCount}</strong></div>
                      <div className="rounded-xl border border-gray-200 bg-white/90 px-4 py-3"><span className="section-kicker">Zonas</span><strong className="mt-1 block text-2xl">{validation.zoneCount}</strong></div>
                      <div className="rounded-xl border border-gray-200 bg-white/90 px-4 py-3"><span className="section-kicker">Variantes</span><strong className="mt-1 block text-2xl">{validation.variantCount}</strong></div>
                    </div>
                  ) : null}
                  {validation?.messages?.length ? (
                    <ul className="mt-4 space-y-2 text-sm text-gray-500">
                      {validation.messages.map((message) => <li key={message} className="rounded-lg border border-gray-200 bg-white/85 px-4 py-3">{message}</li>)}
                    </ul>
                  ) : null}
                  <div className="offer-studio-theme-grid">
                    <StudioCollapsibleSection
                      title="Camadas"
                      description={`${resolvedLayers.length} itens estruturados`}
                      collapsed={Boolean(collapsedConfigSections.layersPanel)}
                      onToggle={() => toggleConfigSection('layersPanel')}
                    >
                      <div className="offer-studio-inline-actions wrap">
                        <label className="offer-studio-text-field">
                          <span>Inserir camada</span>
                          <select className="input" value={newLayerOption} onChange={(event) => setNewLayerOption(event.target.value)}>
                            {layerInsertOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button type="button" variant="secondary" onClick={handleAddTemplateLayer}>
                          <Plus size={16} strokeWidth={2.1} />
                          Adicionar camada
                        </Button>
                      </div>
                      <div className="offer-studio-structure-list">
                        {resolvedLayers.length ? (
                          resolvedLayers.map((layer, index) => (
                            <StudioLayerRow
                              key={String(layer.id || `layer-${index}`)}
                              layer={layer}
                              active={String(layer.id || '') === String(activeLayer?.id || '')}
                              identified={String(layer.id || '') === canvasSelectedLayerId}
                              onSelect={() => setSelectedLayerId(String(layer.id || ''))}
                              draggableLayer={resolvedLayers.length > 1}
                              dragging={draggingLayerId === String(layer.id || '')}
                              dropTarget={dragOverLayerId === String(layer.id || '') && draggingLayerId !== String(layer.id || '')}
                              onDragStart={(event) => handleLayerDragStart(String(layer.id || ''), event)}
                              onDragOver={(event) => handleLayerDragOver(String(layer.id || ''), event)}
                              onDrop={(event) => handleLayerDrop(String(layer.id || ''), event)}
                              onDragEnd={handleLayerDragEnd}
                              onToggleVisibility={() => handleToggleLayerVisibility(String(layer.id || ''))}
                              onToggleLock={() => handleToggleLayerLock(String(layer.id || ''))}
                              onDelete={() => handleDeleteTemplateLayer(String(layer.id || ''))}
                            />
                          ))
                        ) : (
                          <div className="offer-studio-empty-card slim">A prévia ainda não expôs camadas para este template.</div>
                        )}
                      </div>
                    </StudioCollapsibleSection>

                    <StudioCollapsibleSection
                      title="Zonas de produto"
                      description={`${resolvedZones.length} areas configuradas`}
                      collapsed={Boolean(collapsedConfigSections.zonesPanel)}
                      onToggle={() => toggleConfigSection('zonesPanel')}
                    >
                      <div className="offer-studio-zone-list">
                        {resolvedZones.length ? (
                          resolvedZones.map((zone, index) => (
                            <StudioZoneCard
                              key={String(zone.id || `zone-${index}`)}
                              zone={zone}
                              active={String(zone.id || '') === String(activeZone?.id || '')}
                              identified={String(zone.id || '') === canvasSelectedZoneId}
                              onSelect={() => setSelectedZoneId(String(zone.id || ''))}
                            />
                          ))
                        ) : (
                          <div className="offer-studio-empty-card slim">Nenhuma zona foi resolvida nesta variação.</div>
                        )}
                      </div>
                    </StudioCollapsibleSection>
                  </div>

                  <StudioCollapsibleSection
                    title="Inspector"
                    description={activeLayer ? 'Camada selecionada' : activeZone ? 'Zona selecionada' : 'Sem selecao'}
                    collapsed={Boolean(collapsedConfigSections.inspectorPanel)}
                    onToggle={() => toggleConfigSection('inspectorPanel')}
                  >
                    <div className="offer-studio-property-grid">
                      <StudioPropertyRow label="Camada" value={String(activeLayer?.name || activeLayer?.id || '-')} />
                      <StudioPropertyRow label="Tipo" value={String(activeLayer?.type || '-')} />
                      <StudioPropertyRow label="Visível" value={activeLayer?.visible === false ? 'Não' : 'Sim'} />
                      <StudioPropertyRow label="Bloqueada" value={activeLayer?.locked ? 'Sim' : 'Não'} />
                      <StudioPropertyRow label="Binding" value={String(activeLayer?.binding || '-')} />
                      <StudioPropertyRow
                        label="Bounds camada"
                        value={activeLayer?.bounds ? `${Number(activeLayer.bounds.x || 0)}, ${Number(activeLayer.bounds.y || 0)} · ${Number(activeLayer.bounds.w || 0)}x${Number(activeLayer.bounds.h || 0)}` : '-'}
                      />
                      <StudioPropertyRow label="Zona" value={String(activeZone?.name || activeZone?.id || '-')} />
                      <StudioPropertyRow label="Layout zona" value={String(activeZone?.layout || '-')} />
                      <StudioPropertyRow label="Slots" value={String(activeZone?.slotCount || '-')} />
                      <StudioPropertyRow label="Colunas x linhas" value={`${Number(activeZone?.columns || 1)} x ${Number(activeZone?.rows || 1)}`} />
                      <StudioPropertyRow
                        label="Bounds zona"
                        value={activeZone?.bounds ? `${Number(activeZone.bounds.x || 0)}, ${Number(activeZone.bounds.y || 0)} · ${Number(activeZone.bounds.w || 0)}x${Number(activeZone.bounds.h || 0)}` : '-'}
                      />
                      <StudioPropertyRow label="Produtos vinculados" value={String(activeZoneBinding.length)} />
                    </div>
                    <div className="offer-studio-edit-grid">
                      <label className="offer-studio-text-field">
                        <span>Nome da camada</span>
                        <input className="input" value={layerDraft.name} onChange={(event) => setLayerDraft((current) => ({ ...current, name: event.target.value }))} />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Binding</span>
                        <input className="input" value={layerDraft.binding} onChange={(event) => setLayerDraft((current) => ({ ...current, binding: event.target.value }))} placeholder="campaign.headline" />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>X</span>
                        <input className="input" value={layerDraft.x} onChange={(event) => setLayerDraft((current) => ({ ...current, x: event.target.value }))} />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Y</span>
                        <input className="input" value={layerDraft.y} onChange={(event) => setLayerDraft((current) => ({ ...current, y: event.target.value }))} />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Largura</span>
                        <input className="input" value={layerDraft.w} onChange={(event) => setLayerDraft((current) => ({ ...current, w: event.target.value }))} />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Altura</span>
                        <input className="input" value={layerDraft.h} onChange={(event) => setLayerDraft((current) => ({ ...current, h: event.target.value }))} />
                      </label>
                      {activeCustomLayer ? (
                        <>
                          <label className="offer-studio-text-field">
                            <span>Tipo da camada</span>
                            <input className="input" value={customLayerTypeLabel(activeCustomLayer.type)} readOnly />
                          </label>
                          {activeCustomLayerSupportsText ? (
                            <label className="offer-studio-text-field md:col-span-2">
                              <span>{activeCustomLayerType === 'qrcode' ? 'Legenda fallback' : 'Conteudo fallback'}</span>
                              <textarea
                                className="textarea"
                                rows={3}
                                value={layerDraft.content}
                                onChange={(event) => setLayerDraft((current) => ({ ...current, content: event.target.value }))}
                                placeholder={activeCustomLayerType === 'qrcode' ? 'QR do produto' : 'Texto exibido quando o binding estiver vazio'}
                              />
                            </label>
                          ) : null}
                          {activeCustomLayerSupportsImage ? (
                            <>
                              <div className="md:col-span-2">
                                <StudioAssetStatus
                                  label="Imagem da camada"
                                  storageKey={layerDraft.imageStorageKey || activeCustomLayer.storageKey}
                                  hasAsset={Boolean(layerDraft.imageUrl || activeCustomLayer.imageUrl)}
                                />
                              </div>
                              <label className="offer-studio-text-field md:col-span-2">
                                <span>Upload da imagem</span>
                                <input
                                  className="input"
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                  onChange={(event) => void handleUploadTemplateAsset('template-layer-image', event.target.files?.[0], activeCustomLayer.id)}
                                  disabled={uploadingAsset === `template-layer-image:${activeCustomLayer.id}`}
                                />
                              </label>
                            </>
                          ) : null}
                          {activeCustomLayerSupportsText || activeCustomLayerSupportsShape || activeCustomLayerSupportsImage ? (
                            <StudioColorField
                              label={activeCustomLayerSupportsImage ? 'Fundo/moldura' : 'Fundo'}
                              value={layerDraft.background}
                              onChange={(value) => setLayerDraft((current) => ({ ...current, background: value }))}
                              placeholder={activeCustomLayerSupportsShape ? '#ffede0' : '#ffffff'}
                            />
                          ) : null}
                          {activeCustomLayerSupportsText || activeCustomLayerType === 'qrcode' ? (
                            <StudioColorField
                              label="Cor do texto"
                              value={layerDraft.textColor}
                              onChange={(value) => setLayerDraft((current) => ({ ...current, textColor: value }))}
                              placeholder="#1f1613"
                            />
                          ) : null}
                          {activeCustomLayerSupportsShape ? (
                            <>
                              <StudioColorField
                                label="Cor da borda"
                                value={layerDraft.borderColor}
                                onChange={(value) => setLayerDraft((current) => ({ ...current, borderColor: value }))}
                                placeholder="#ead9ca"
                              />
                              <label className="offer-studio-text-field">
                                <span>Espessura da borda</span>
                                <input
                                  className="input"
                                  inputMode="numeric"
                                  value={layerDraft.borderWidth}
                                  onChange={(event) => setLayerDraft((current) => ({ ...current, borderWidth: event.target.value }))}
                                />
                              </label>
                            </>
                          ) : null}
                          {activeCustomLayerSupportsText || activeCustomLayerSupportsShape || activeCustomLayerSupportsImage || activeCustomLayerType === 'qrcode' ? (
                            <label className="offer-studio-text-field">
                              <span>Raio</span>
                              <input
                                className="input"
                                inputMode="numeric"
                                value={layerDraft.radius}
                                onChange={(event) => setLayerDraft((current) => ({ ...current, radius: event.target.value }))}
                              />
                            </label>
                          ) : null}
                          {activeCustomLayerSupportsFont ? (
                            <>
                              <label className="offer-studio-text-field">
                                <span>Tamanho da fonte</span>
                                <input
                                  className="input"
                                  inputMode="numeric"
                                  value={layerDraft.fontSize}
                                  onChange={(event) => setLayerDraft((current) => ({ ...current, fontSize: event.target.value }))}
                                />
                              </label>
                              <label className="offer-studio-text-field">
                                <span>Peso da fonte</span>
                                <input
                                  className="input"
                                  inputMode="numeric"
                                  value={layerDraft.fontWeight}
                                  onChange={(event) => setLayerDraft((current) => ({ ...current, fontWeight: event.target.value }))}
                                />
                              </label>
                            </>
                          ) : null}
                          {activeCustomLayerSupportsImage ? (
                            <>
                              <label className="offer-studio-text-field">
                                <span>Ajuste da imagem</span>
                                <select className="input" value={layerDraft.fit} onChange={(event) => setLayerDraft((current) => ({ ...current, fit: event.target.value }))}>
                                  <option value="contain">Conter</option>
                                  <option value="cover">Cobrir</option>
                                </select>
                              </label>
                              <div className="offer-studio-check-row md:col-span-2">
                                <label>
                                  <input type="checkbox" checked={layerDraft.frame} onChange={(event) => setLayerDraft((current) => ({ ...current, frame: event.target.checked }))} />
                                  <span>Aplicar moldura</span>
                                </label>
                              </div>
                            </>
                          ) : null}
                        </>
                      ) : null}
                      <label className="offer-studio-text-field">
                        <span>Nome da zona</span>
                        <input className="input" value={zoneDraft.name} onChange={(event) => setZoneDraft((current) => ({ ...current, name: event.target.value }))} />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Layout da zona</span>
                        <input className="input" value={zoneDraft.layout} onChange={(event) => setZoneDraft((current) => ({ ...current, layout: event.target.value }))} />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Slots</span>
                        <input className="input" value={zoneDraft.slotCount} onChange={(event) => setZoneDraft((current) => ({ ...current, slotCount: event.target.value }))} />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Colunas</span>
                        <input className="input" value={zoneDraft.columns} onChange={(event) => setZoneDraft((current) => ({ ...current, columns: event.target.value }))} />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Linhas</span>
                        <input className="input" value={zoneDraft.rows} onChange={(event) => setZoneDraft((current) => ({ ...current, rows: event.target.value }))} />
                      </label>
                      <div className="offer-studio-check-row">
                        <label>
                          <input type="checkbox" checked={layerDraft.locked} onChange={(event) => setLayerDraft((current) => ({ ...current, locked: event.target.checked }))} />
                          <span>Camada bloqueada</span>
                        </label>
                        <label>
                          <input type="checkbox" checked={layerDraft.visible} onChange={(event) => setLayerDraft((current) => ({ ...current, visible: event.target.checked }))} />
                          <span>Camada visvel</span>
                        </label>
                      </div>
                    </div>
                    <div className="offer-studio-inline-actions wrap">
                      {activeInspectorCanvasTarget ? (
                        <Button type="button" variant="secondary" onClick={() => handleCanvasEditToggle(activeInspectorCanvasTarget)}>
                          <BoxSelect size={16} strokeWidth={2.1} />
                          {canvasEditTarget === activeInspectorCanvasTarget ? 'Parar ajuste na arte' : 'Posicionar na arte'}
                        </Button>
                      ) : null}
                      <Button type="button" onClick={() => void handleSaveStructure()} disabled={saving || !selectedTemplateId}>
                        <Layers3 size={16} strokeWidth={2.1} />
                        {saving ? 'Salvando estrutura...' : 'Salvar camada e zona'}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => void refreshPreview('preview')}>
                        <RefreshCw size={16} strokeWidth={2.1} />
                        Recarregar preview
                      </Button>
                    </div>
                    {activeZoneBinding.length ? (
                      <div className="offer-studio-binding-list">
                        {activeZoneBinding.map((product, index) => (
                          <div key={`${String(activeZone?.id || 'zone')}-${index}`} className="offer-studio-binding-row">
                            <OfferProductImage src={String(product.imageUrl || '')} alt={String(product.name || 'Produto')} className="offer-studio-binding-image" />
                            <div>
                              <strong>{String(product.name || `Produto ${index + 1}`)}</strong>
                              <small>{formatMoney(Number(product.currentPrice || 0))} {String(product.unit || '')}</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </StudioCollapsibleSection>
                </StudioCollapsibleSection>
                </>
  );
}
