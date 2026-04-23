import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Boxes,
  BoxSelect,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Factory,
  FileText,
  ImageIcon,
  LayoutTemplate,
  Layers3,
  Lock,
  GripVertical,
  PackageSearch,
  Paintbrush,
  Palette,
  Minus,
  Plus,
  QrCode,
  RefreshCw,
  Scissors,
  SendHorizontal,
  Square,
  Sparkles,
  Target,
  Tag,
  Trash2,
  Type,
  Unlock,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import Button from '../../components/common/Button';
import OffersStudioLayout from '../../components/layout/OffersStudioLayout';
import OfferCanvasPreview from '../../components/offers/OfferCanvasPreview';
import OfferProductImage from '../../components/offers/OfferProductImage';
import { loadOfferStudioBootstrap } from './bootstrap';
import OfferStudioDistributionPanels from './OfferStudioDistributionPanels';
import OfferStudioBuilderPanel from './OfferStudioBuilderPanel';
import OfferStudioMarketingPanels from './OfferStudioMarketingPanels';
import OfferStudioProductsPanel from './OfferStudioProductsPanel';
import OfferStudioRail from './OfferStudioRail';
import OfferStudioReadonlyThemePanel from './OfferStudioReadonlyThemePanel';
import OfferStudioShell from './OfferStudioShell';
import {
  OfferStudioCampaignsSheet,
  OfferStudioMediaSheet,
} from './OfferStudioSheets';
import OfferStudioThemesHeader from './OfferStudioThemesHeader';
import OfferStudioWorkspace from './OfferStudioWorkspace';
import {
  StudioAssetStatus,
  StudioBoundsFields,
  StudioCollapsibleSection,
  StudioColorField,
  StudioLayerRow,
  StudioPropertyRow,
  StudioSearchResultCard,
  StudioSelectField,
  StudioTemplateCard,
  StudioZoneCard,
  getCampaignState,
  parseStringList,
} from './StudioPrimitives';
import { useOffersAppSession } from '../../hooks/useOffersAppSession';
import { useOffersService } from '../../hooks/useOffersService';
import api from '../../services/api';
import { type OfferCreateJobPayload } from '../../services/offers.service';
import {
  OfferBackgroundRemovalResult,
  OfferBrandKit,
  OfferCampaignKit,
  OfferCatalogProduct,
  OfferGenerationJob,
  OfferMarketProfile,
  OfferOverview,
  OfferTemplate,
  OfferTemplatePreview,
  OfferTemplateValidation,
  OfferTemplateVariant,
} from '../../types/offers.types';
import {
  COLOR_MODE_OPTIONS,
  FOOTER_OPTIONS,
  PRODUCT_BOX_OPTIONS,
  QROFERTAS_GRID_PRESET_OPTIONS,
  QUALITY_OPTIONS,
  STUDIO_PUBLISH_TARGET_OPTIONS,
  TEXT_MODE_OPTIONS,
  clampNumber,
  type StudioTool,
} from './model';

type OfferStudioScreenProps = {
  context: any;
};

const OfferStudioScreen: React.FC<OfferStudioScreenProps> = ({ context }) => {
  const {
    buildUrl,
    isSuperAdminMode,
    marketId,
    userName,
    offersService,
    navigate,
    stageSurfaceRef,
    stageArtboardRef,
    pendingStageViewportRef,
    canvasPointerSessionRef,
    canvasSuppressClickTargetRef,
    searchParams,
    requestedTemplateId,
    requestedJobId,
    requestedProductId,
    requestedMarketId,
    requestedStudioSheet,
    studioSheet,
    overview,
    setOverview,
    jobs,
    setJobs,
    templates,
    setTemplates,
    brandKits,
    setBrandKits,
    campaignKits,
    setCampaignKits,
    templateVariants,
    setTemplateVariants,
    superAdminMarkets,
    setSuperAdminMarkets,
    marketProfile,
    setMarketProfile,
    selectedSuperAdminMarketId,
    setSelectedSuperAdminMarketId,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedVariantKey,
    setSelectedVariantKey,
    selectedBrandKitId,
    setSelectedBrandKitId,
    selectedCampaignKitId,
    setSelectedCampaignKitId,
    selectedProducts,
    setSelectedProducts,
    activeJobId,
    setActiveJobId,
    results,
    setResults,
    preview,
    setPreview,
    validation,
    setValidation,
    searchInput,
    setSearchInput,
    bulkInput,
    setBulkInput,
    jobName,
    setJobName,
    campaignKicker,
    setCampaignKicker,
    campaignHeadline,
    setCampaignHeadline,
    campaignSubheadline,
    setCampaignSubheadline,
    campaignBadgeLabel,
    setCampaignBadgeLabel,
    outputType,
    setOutputType,
    generationMode,
    setGenerationMode,
    gridPreset,
    setGridPreset,
    productBoxMode,
    setProductBoxMode,
    textMode,
    setTextMode,
    colorMode,
    setColorMode,
    footerMode,
    setFooterMode,
    zoomMode,
    setZoomMode,
    renderQuality,
    setRenderQuality,
    publishTargets,
    setPublishTargets,
    coverEnabled,
    setCoverEnabled,
    activeTool,
    setActiveTool,
    productPanelMode,
    setProductPanelMode,
    toolPanelCollapsed,
    setToolPanelCollapsed,
    searchBoxCollapsed,
    setSearchBoxCollapsed,
    resultsCollapsed,
    setResultsCollapsed,
    selectedLayerId,
    setSelectedLayerId,
    selectedZoneId,
    setSelectedZoneId,
    draggingLayerId,
    setDraggingLayerId,
    dragOverLayerId,
    setDragOverLayerId,
    canvasEditTarget,
    setCanvasEditTarget,
    canvasEditInteraction,
    setCanvasEditInteraction,
    removingBackgroundId,
    setRemovingBackgroundId,
    layerDraft,
    setLayerDraft,
    zoneDraft,
    setZoneDraft,
    templateBuilderDraft,
    setTemplateBuilderDraft,
    newLayerOption,
    setNewLayerOption,
    loading,
    setLoading,
    marketsLoading,
    setMarketsLoading,
    searching,
    setSearching,
    bulkSearching,
    setBulkSearching,
    previewing,
    setPreviewing,
    saving,
    setSaving,
    savingMarketProfile,
    setSavingMarketProfile,
    uploadingAsset,
    setUploadingAsset,
    copying,
    setCopying,
    lookupNotice,
    setLookupNotice,
    error,
    setError,
    stageSurfaceSize,
    setStageSurfaceSize,
    collapsedConfigSections,
    setCollapsedConfigSections,
    pendingStructureReveal,
    setPendingStructureReveal,
    selectedSuperAdminMarket,
    effectiveMarketId,
    effectiveMarketName,
    isEditingCampaign,
    selectedTemplate,
    selectedVariant,
    selectedBrandKit,
    selectedCampaignKit,
    selectedProductIds,
    itemsPerPage,
    pageEstimate,
    sortedJobs,
    mediaEntries,
    readyMediaCount,
    draftCampaignCount,
    portalEnabled,
    stageCanvasWidth,
    stageCanvasHeight,
    fitStageScale,
    stageScale,
    scaledStageWidth,
    scaledStageHeight,
    zoomOptions,
    zoomDisplayLabel,
    footerText,
    templateOptions,
    variantOptions,
    brandKitOptions,
    campaignKitOptions,
    superAdminMarketOptions,
    visibleToolOptions,
    stageProducts,
    builderResolvedDesignJson,
    stageGridLimit,
    effectiveResolvedDesignJson,
    resolvedDesign,
    resolvedLayers,
    resolvedZones,
    activeLayer,
    activeCustomLayer,
    activeCustomLayerType,
    activeCustomLayerSupportsText,
    activeCustomLayerSupportsFont,
    activeCustomLayerSupportsImage,
    activeCustomLayerSupportsShape,
    activeZone,
    activeInspectorCanvasTarget,
    layerInsertOptions,
    activeZoneBinding,
    canvasEditableOverlays,
    canvasHighlightedTarget,
    activeCanvasSelection,
    canvasSelectedLayerId,
    canvasSelectedZoneId,
    activeCanvasEditLabel,
    setViewportZoom,
    handleZoomSelect,
    handleZoomStep,
    buildStudioRoute,
    buildDesignerRoute,
    buildRenderOptionsPayload,
    name,
    socialCopy,
    resetCampaignDraft,
    hydrateDraftFromJob,
    refreshPreview,
    loadTemplateMeta,
    handleToggleLayerLock,
    handleToggleLayerVisibility,
    handleAddTemplateLayer,
    handleDeleteTemplateLayer,
    handleLayerDragStart,
    handleLayerDragOver,
    handleLayerDrop,
    handleLayerDragEnd,
    revealStructureSelection,
    syncCanvasEditSelection,
    handleCanvasEditToggle,
    handleCanvasEditPointerStart,
    handleCanvasGuideClick,
    renderCanvasEditButton,
    toggleConfigSection,
    handleStartNewTemplate,
    handleTemplateChange,
    addProduct,
    removeProduct,
    addProductById,
    applyRemovedBackground,
    handleCleanBackground,
    handleBulkInputKeyDown,
    handleBulkLookup,
    handleAddAllResults,
    handleMarketProfileField,
    handleSaveMarketProfile,
    handleUploadMarketLogo,
    handleUploadTemplateAsset,
    persistSelectedVariantDimensions,
    handleSaveTemplateBuilder,
    handleSaveStructure,
    handleCreateTemplateFromCurrent,
    handleSaveCampaign,
    handleCopyText,
    togglePublishTarget,
    openStudioSheet,
    closeStudioSheet,
    handleEditSavedCampaign,
    reloadJobs,
    handlePublishCurrentCampaign,
    handlePublishSavedCampaign,
    handleCloneSavedCampaign,
    handleDeleteSavedCampaign
  } = context;

  if (loading) {
    return (
      <OffersStudioLayout>
        <div className="page offers-studio-page">
          <div className="sales-empty-card">Carregando estúdio de ofertas...</div>
        </div>
      </OffersStudioLayout>
    );
  }

  return (
    <OffersStudioLayout>
      <div className="page offers-studio-page w-full">
        {error ? (
          <div className="offer-studio-toast-stack">
            <div className="offer-studio-toast error">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Fechar aviso"></button>
            </div>
          </div>
        ) : null}

        {!error && lookupNotice ? (
          <div className="offer-studio-toast-stack">
            <div className="offer-studio-toast info">
              <span>{lookupNotice}</span>
              <button type="button" onClick={() => setLookupNotice(null)} aria-label="Fechar aviso"></button>
            </div>
          </div>
        ) : null}

        {isEditingCampaign ? (
          <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            <strong className="block text-gray-900">Editando encarte salvo</strong>
            <span>Suas alterações atualizam este encarte. Para criar um novo, use "Salvar como novo".</span>
          </div>
        ) : null}

        <OfferStudioShell
          builderMode={activeTool === 'builder'}
          panelCollapsed={toolPanelCollapsed}
          rail={(
            <OfferStudioRail
              tools={visibleToolOptions}
              activeTool={activeTool}
              onSelectTool={(toolKey) => setActiveTool(toolKey as StudioTool)}
            />
          )}
          panel={(
            <aside className="offer-studio-panel">
            {activeTool === 'products' ? (
              <OfferStudioProductsPanel
                productPanelMode={productPanelMode}
                onChangeMode={setProductPanelMode}
                searchBoxCollapsed={searchBoxCollapsed}
                onToggleSearchBox={() => setSearchBoxCollapsed((current) => !current)}
                searchInput={searchInput}
                onSearchInputChange={setSearchInput}
                bulkInput={bulkInput}
                onBulkInputChange={setBulkInput}
                onBulkInputKeyDown={handleBulkInputKeyDown}
                onBulkLookup={handleBulkLookup}
                bulkSearching={bulkSearching}
                onAddAllResults={handleAddAllResults}
                resultsCollapsed={resultsCollapsed}
                onToggleResults={() => setResultsCollapsed((current) => !current)}
                searching={searching}
                results={results}
                selectedProducts={selectedProducts}
                isInQueue={(productId) => selectedProductIds.has(productId)}
                removingBackgroundId={removingBackgroundId}
                onAddProduct={addProduct}
                onRemoveProduct={removeProduct}
                onCleanBackground={(product) => void handleCleanBackground(product)}
              />
            ) : null}

            {activeTool === 'themes' || activeTool === 'builder' ? (
              <div className="offer-studio-panel-stack">
                <OfferStudioThemesHeader
                  activeTool={activeTool}
                  saving={saving}
                  effectiveMarketId={effectiveMarketId}
                  onStartNewTemplate={handleStartNewTemplate}
                  onCreateTemplateFromCurrent={() => void handleCreateTemplateFromCurrent()}
                  templates={templates}
                  selectedTemplateId={selectedTemplateId}
                  onChangeTemplate={(templateId) => void handleTemplateChange(templateId)}
                  selectedVariantKey={selectedVariantKey}
                  setSelectedVariantKey={setSelectedVariantKey}
                  variantOptions={variantOptions}
                  selectedCampaignKitId={selectedCampaignKitId}
                  setSelectedCampaignKitId={setSelectedCampaignKitId}
                  campaignKitOptions={campaignKitOptions}
                  selectedBrandKitId={selectedBrandKitId}
                  setSelectedBrandKitId={setSelectedBrandKitId}
                  brandKitOptions={brandKitOptions}
                  colorMode={colorMode}
                  setColorMode={setColorMode}
                  textMode={textMode}
                  setTextMode={setTextMode}
                  footerMode={footerMode}
                  setFooterMode={setFooterMode}
                  colorModeOptions={[...COLOR_MODE_OPTIONS]}
                  textModeOptions={[...TEXT_MODE_OPTIONS]}
                  footerOptions={[...FOOTER_OPTIONS]}
                />
                {activeTool === 'builder' && isSuperAdminMode ? (

<OfferStudioBuilderPanel
  context={{
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
  }}
/>
                ) : (
                  <OfferStudioReadonlyThemePanel
                    collapsedConfigSections={collapsedConfigSections}
                    toggleConfigSection={toggleConfigSection}
                    selectedTemplate={selectedTemplate}
                    selectedVariant={selectedVariant}
                    templateCanvasWidth={clampNumber(templateBuilderDraft.canvasWidth, 1080, 720, 3200)}
                    templateCanvasHeight={clampNumber(templateBuilderDraft.canvasHeight, 1350, 720, 4800)}
                    slotCount={templateBuilderDraft.contentZone.slotCount}
                    footerVisible={templateBuilderDraft.footer.visible}
                    onRefreshPreview={() => void refreshPreview('preview')}
                    selectedTemplateId={selectedTemplateId}
                    onOpenCampaigns={() => openStudioSheet('campaigns')}
                    contentZoneLayout={templateBuilderDraft.contentZone.layout}
                    contentZoneColumns={templateBuilderDraft.contentZone.columns}
                    contentZoneRows={templateBuilderDraft.contentZone.rows}
                    layerCount={validation?.layerCount || resolvedLayers.length || 0}
                    zoneCount={validation?.zoneCount || resolvedZones.length || 0}
                    footerLeftLogoVisible={templateBuilderDraft.footerLeftLogo.visible}
                    footerRightLogoVisible={templateBuilderDraft.footerRightLogo.visible}
                    cardRadius={templateBuilderDraft.card.cardRadius}
                    priceBoxRadius={templateBuilderDraft.card.priceBoxRadius}
                    showUnit={templateBuilderDraft.card.showUnit}
                    showDescription={templateBuilderDraft.card.showDescription}
                    showBaselinePrice={templateBuilderDraft.card.showBaselinePrice}
                    priceLabel={templateBuilderDraft.card.priceLabel}
                    resolvedLayers={resolvedLayers}
                    activeLayerId={String(activeLayer?.id || '')}
                    canvasSelectedLayerId={canvasSelectedLayerId}
                    onSelectLayer={setSelectedLayerId}
                    resolvedZones={resolvedZones}
                    activeZoneId={String(activeZone?.id || '')}
                    canvasSelectedZoneId={canvasSelectedZoneId}
                    onSelectZone={setSelectedZoneId}
                  />
                )}
              </div>
            ) : null}

            {activeTool === 'customize' ? (
              <OfferStudioMarketingPanels
                activeTool={activeTool}
                collapsedConfigSections={collapsedConfigSections}
                toggleConfigSection={toggleConfigSection}
                selectedBrandKitId={selectedBrandKitId}
                setSelectedBrandKitId={setSelectedBrandKitId}
                brandKitOptions={brandKitOptions}
                selectedCampaignKitId={selectedCampaignKitId}
                setSelectedCampaignKitId={setSelectedCampaignKitId}
                campaignKitOptions={campaignKitOptions}
                marketProfile={marketProfile}
                handleMarketProfileField={handleMarketProfileField}
                handleUploadMarketLogo={(slot, file) => void handleUploadMarketLogo(slot, file)}
                uploadingAsset={uploadingAsset}
                handleSaveMarketProfile={() => void handleSaveMarketProfile()}
                savingMarketProfile={savingMarketProfile}
                selectedCampaignKit={selectedCampaignKit}
                overview={overview}
                selectedProductIds={selectedProductIds}
                addProductById={(productId) => void addProductById(productId)}
                handleCopyText={() => void handleCopyText()}
                copying={copying}
                textMode={textMode}
                setTextMode={setTextMode}
                colorMode={colorMode}
                setColorMode={setColorMode}
                footerMode={footerMode}
                setFooterMode={setFooterMode}
                campaignKicker={campaignKicker}
                setCampaignKicker={setCampaignKicker}
                campaignBadgeLabel={campaignBadgeLabel}
                setCampaignBadgeLabel={setCampaignBadgeLabel}
                campaignHeadline={campaignHeadline}
                setCampaignHeadline={setCampaignHeadline}
                campaignSubheadline={campaignSubheadline}
                setCampaignSubheadline={setCampaignSubheadline}
                socialCopy={socialCopy}
                textModeOptions={[...TEXT_MODE_OPTIONS]}
                colorModeOptions={[...COLOR_MODE_OPTIONS]}
                footerOptions={[...FOOTER_OPTIONS]}
              />
            ) : null}

            {activeTool === 'generate' ? (
              <OfferStudioDistributionPanels
                activeTool={activeTool}
                collapsedConfigSections={collapsedConfigSections}
                toggleConfigSection={toggleConfigSection}
                jobName={jobName}
                setJobName={setJobName}
                outputType={outputType}
                setOutputType={setOutputType}
                generationMode={generationMode}
                setGenerationMode={setGenerationMode}
                renderQuality={renderQuality}
                setRenderQuality={setRenderQuality}
                qualityOptions={[...QUALITY_OPTIONS]}
                selectedVariantKey={selectedVariantKey}
                setSelectedVariantKey={setSelectedVariantKey}
                variantOptions={variantOptions}
                gridPreset={gridPreset}
                setGridPreset={setGridPreset}
                gridPresetOptions={[...QROFERTAS_GRID_PRESET_OPTIONS]}
                productBoxMode={productBoxMode}
                setProductBoxMode={setProductBoxMode}
                productBoxOptions={[...PRODUCT_BOX_OPTIONS]}
                coverEnabled={coverEnabled}
                setCoverEnabled={setCoverEnabled}
                selectedProducts={selectedProducts}
                pageEstimate={pageEstimate}
                selectedVariant={selectedVariant}
                selectedTemplate={selectedTemplate}
                refreshPreview={(mode) => void refreshPreview(mode)}
                handleSaveCampaign={() => void handleSaveCampaign()}
                saving={saving}
                isEditingCampaign={isEditingCampaign}
                selectedTemplateId={selectedTemplateId}
                portalEnabled={portalEnabled}
                togglePublishTarget={togglePublishTarget}
                marketProfile={marketProfile}
                setActiveTool={setActiveTool}
                publishTargets={publishTargets}
                publishTargetOptions={[...STUDIO_PUBLISH_TARGET_OPTIONS]}
                draftCampaignCount={draftCampaignCount}
                readyMediaCount={readyMediaCount}
                activeJobId={activeJobId}
                handlePublishCurrentCampaign={() => void handlePublishCurrentCampaign()}
                openStudioSheet={openStudioSheet}
              />
            ) : null}
            </aside>
          )}
          workspace={(
            <OfferStudioWorkspace
              toolPanelCollapsed={toolPanelCollapsed}
              onTogglePanelCollapsed={() => setToolPanelCollapsed((current) => !current)}
              topbarActions={!isSuperAdminMode ? (
                <div className="offer-studio-inline-actions wrap">
                  <Button type="button" variant={studioSheet === 'campaigns' ? 'primary' : 'secondary'} onClick={() => openStudioSheet('campaigns')}>
                    <Boxes size={16} strokeWidth={2.1} />
                    Meus encartes ({sortedJobs.length})
                  </Button>
                  <Button type="button" variant={studioSheet === 'media' ? 'primary' : 'secondary'} onClick={() => openStudioSheet('media')}>
                    <ImageIcon size={16} strokeWidth={2.1} />
                    Arquivos prontos ({readyMediaCount})
                  </Button>
                </div>
              ) : null}
              toolbar={(
                <>
                  <StudioSelectField label="Modelo" value={selectedTemplateId} onChange={(value) => void handleTemplateChange(value)} options={templateOptions.length ? templateOptions : [{ value: '', label: 'Sem modelo' }]} />
                  <StudioSelectField label="Layout" value={gridPreset} onChange={setGridPreset} options={[...QROFERTAS_GRID_PRESET_OPTIONS]} />
                  <StudioSelectField label="Estilo dos produtos" value={productBoxMode} onChange={setProductBoxMode} options={[...PRODUCT_BOX_OPTIONS]} />
                  <StudioSelectField label="Zoom" value={zoomMode} onChange={handleZoomSelect} options={zoomOptions} />
                  <label className="offer-studio-toggle-field">
                    <span>Gerar capa</span>
                    <button type="button" className={`offer-studio-toggle ${coverEnabled ? 'active' : ''}`} onClick={() => setCoverEnabled((current) => !current)}>
                      <span />
                    </button>
                  </label>
                </>
              )}
              stageTitle={activeTool === 'builder' ? templateBuilderDraft.name || selectedTemplate?.name || 'Selecione um modelo' : selectedTemplate?.name || 'Selecione um modelo'}
              stageBadges={(
                <>
                  {selectedVariant ? <span className="sales-pill soft">{selectedVariant.name}</span> : null}
                  {selectedBrandKit ? <span className="sales-pill soft"><Factory size={14} strokeWidth={2.1} /> {selectedBrandKit.name}</span> : null}
                  {selectedCampaignKit ? <span className="sales-pill soft"><Palette size={14} strokeWidth={2.1} /> {selectedCampaignKit.name}</span> : null}
                  {previewing ? <span className="sales-pill soft"><RefreshCw size={14} className="animate-spin" strokeWidth={2.1} /> Atualizando</span> : null}
                </>
              )}
              stageMeta={isSuperAdminMode ? (
                <>
                  <span>{templateBuilderDraft.channel || 'PRINT'}</span>
                  <span>{templateBuilderDraft.contentZone.slotCount} slots</span>
                </>
              ) : (
                <>
                  <span>{generationMode === 'CATALOG' ? 'Encarte completo' : 'Um produto por página'}</span>
                  {isEditingCampaign ? <span>Editando encarte</span> : null}
                  <span>{stageGridLimit} {stageGridLimit === 1 ? 'produto' : 'produtos'} por página</span>
                </>
              )}
              showEditBanner={activeTool === 'builder' && Boolean(canvasEditTarget)}
              editBannerLabel={activeCanvasEditLabel}
              stageSurfaceRef={stageSurfaceRef}
              stageArtboardRef={stageArtboardRef}
              scaledStageWidth={scaledStageWidth}
              scaledStageHeight={scaledStageHeight}
              stageCanvasWidth={stageCanvasWidth}
              stageCanvasHeight={stageCanvasHeight}
              stageScale={stageScale}
              selectedTemplate={selectedTemplate}
              effectiveResolvedDesignJson={effectiveResolvedDesignJson}
              stageProducts={stageProducts}
              stageGridLimit={stageGridLimit}
              gridPreset={gridPreset}
              footerText={footerText}
              colorMode={colorMode}
              productBoxMode={productBoxMode}
              builderMode={activeTool === 'builder'}
              canvasEditableOverlays={canvasEditableOverlays}
              canvasHighlightedTarget={canvasHighlightedTarget}
              onCanvasEditPointerStart={handleCanvasEditPointerStart}
              onCanvasGuideClick={handleCanvasGuideClick}
              outputMeta={isSuperAdminMode ? (
                <>
                  <strong>{selectedVariant?.canvasWidth || clampNumber(templateBuilderDraft.canvasWidth, 1080, 720, 3200)} x {selectedVariant?.canvasHeight || clampNumber(templateBuilderDraft.canvasHeight, 1350, 720, 4800)}</strong>
                  <span>{validation?.layerCount || resolvedLayers.length || 0} camadas</span>
                  <span>{validation?.zoneCount || resolvedZones.length || 0} zonas</span>
                </>
              ) : (
                <>
                  <strong>Pagina 1 de {pageEstimate}</strong>
                  <span>{selectedProducts.length} produtos selecionados</span>
                  <span>{validation?.layerCount || 0} elementos</span>
                  <span>Zoom {zoomDisplayLabel}</span>
                </>
              )}
              outputActions={(
                <>
                  <Button type="button" variant="secondary" onClick={() => handleZoomStep('out')} title="Diminuir zoom (Ctrl/Cmd -)">
                    <Minus size={16} strokeWidth={2.2} />
                    Menos zoom
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => handleZoomSelect('AUTO')} title="Ajustar ao palco (Ctrl/Cmd 0)">
                    <Target size={16} strokeWidth={2.2} />
                    Auto
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => handleZoomStep('in')} title="Aumentar zoom (Ctrl/Cmd +)">
                    <Plus size={16} strokeWidth={2.2} />
                    Mais zoom
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setActiveTool('themes')}>
                    <LayoutTemplate size={16} strokeWidth={2.1} />
                    Modelos
                  </Button>
                  {isSuperAdminMode ? (
                    <>
                      <Button type="button" variant="secondary" onClick={() => selectedTemplateId && void loadTemplateMeta(selectedTemplateId, templates, brandKits, campaignKits)}>
                        <Target size={16} strokeWidth={2.1} />
                        Revalidar
                      </Button>
                      <Button type="button" onClick={() => void handleCreateTemplateFromCurrent()} disabled={saving || !effectiveMarketId}>
                        <LayoutTemplate size={16} strokeWidth={2.1} />
                        {saving ? 'Salvando...' : 'Salvar template'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" variant="secondary" onClick={() => void refreshPreview('autofill')}>
                        <WandSparkles size={16} strokeWidth={2.1} />
                        Preencher automático
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setActiveTool('generate')}>
                        <FileText size={16} strokeWidth={2.1} />
                        Gerar encarte
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => openStudioSheet('campaigns')}>
                        <Boxes size={16} strokeWidth={2.1} />
                        Meus encartes
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => openStudioSheet('media')}>
                        <ImageIcon size={16} strokeWidth={2.1} />
                        Arquivos
                      </Button>
                      <Button type="button" variant="secondary" onClick={handlePublishCurrentCampaign} disabled={saving || !activeJobId}>
                        <SendHorizontal size={16} strokeWidth={2.1} />
                        {saving ? 'Gerando...' : 'Gerar encarte'}
                      </Button>
                      <Button type="button" onClick={handleSaveCampaign} disabled={saving || !selectedProducts.length || !selectedTemplateId}>
                        <WandSparkles size={16} strokeWidth={2.1} />
                        {saving ? (isEditingCampaign ? 'Atualizando...' : 'Salvando...') : (isEditingCampaign ? 'Atualizar encarte' : 'Salvar encarte')}
                      </Button>
                    </>
                  )}
                </>
              )}
            />
          )}
        />
      </div>
      {!isSuperAdminMode ? (
        <>
          <OfferStudioCampaignsSheet
            open={studioSheet === 'campaigns'}
            onClose={closeStudioSheet}
            jobs={sortedJobs}
            draftCampaignCount={draftCampaignCount}
            readyMediaCount={readyMediaCount}
            saving={saving}
            onOpenJob={handleEditSavedCampaign}
            onPublishJob={(job) => void handlePublishSavedCampaign(job)}
            onCloneJob={(job) => void handleCloneSavedCampaign(job)}
            onDeleteJob={(job) => void handleDeleteSavedCampaign(job)}
          />
          <OfferStudioMediaSheet
            open={studioSheet === 'media'}
            onClose={closeStudioSheet}
            mediaEntries={mediaEntries}
            readyMediaCount={readyMediaCount}
            onOpenJob={handleEditSavedCampaign}
          />
        </>
      ) : null}
    </OffersStudioLayout>
  );
};

export default OfferStudioScreen;


