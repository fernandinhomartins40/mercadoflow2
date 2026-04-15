import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loadOfferStudioBootstrap } from './bootstrap';
import {
  JsonMap,
  formatMoney,
  compactCategory,
  parseJson,
  asMap,
  asList,
  layerTypeIcon,
  TOOL_OPTIONS,
  StudioTool,
  ProductPanelMode,
  LayerDraft,
  ZoneDraft,
  TemplateBuilderBoundsDraft,
  TemplateBuilderTextLayerDraft,
  TemplateBuilderImageLayerDraft,
  TemplateBuilderBoxLayerDraft,
  TemplateBuilderCardDraft,
  TemplateBuilderCustomLayerType,
  TemplateBuilderCustomLayerDraft,
  TemplateBuilderZoneDraft,
  TemplateBuilderDraft,
  CanvasEditableTarget,
  CanvasEditInteraction,
  SuperAdminMarketOption,
  PaginatedResponse,
  GRID_PRESET_OPTIONS,
  QROFERTAS_GRID_PRESET_OPTIONS,
  PRODUCT_BOX_OPTIONS,
  TEXT_MODE_OPTIONS,
  COLOR_MODE_OPTIONS,
  FOOTER_OPTIONS,
  ZOOM_PRESET_VALUES,
  MIN_STAGE_ZOOM,
  MAX_STAGE_ZOOM,
  QUALITY_OPTIONS,
  PUBLISH_TARGET_OPTIONS,
  STUDIO_PUBLISH_TARGET_OPTIONS,
  gridPresetToCount,
  resolveGridPresetCount,
  HEX_COLOR_PATTERN,
  clampZoomScale,
  zoomToScale,
  scaleToZoomValue,
  formatZoomLabel,
  resolveStepZoomScale,
  footerPreviewLabel,
  mergeUniqueProducts,
  normalizeSelection,
  clampNumber,
  asText,
  normalizeHexColor,
  getByPath,
  boundsDraft,
  parseBoundsDraft,
  parseLayerBoundsDraft,
  resolveStaticBinding,
  findLayer,
  TEMPLATE_BUILDER_LAYER_IDS,
  TEMPLATE_BUILDER_LAYER_ID_SET,
  CUSTOM_LAYER_TYPE_OPTIONS,
  BUILTIN_LAYER_LABELS,
  CanvasEditableMeta,
  BUILTIN_CANVAS_EDITABLE_META,
  customLayerTypeLabel,
  createDefaultLayerLocks,
  sanitizeLayerOrder,
  reorderLayerOrder,
  editableTargetFromLayerId,
  editableTargetFromZoneId,
  createCustomLayerDraft,
  parseCustomLayerDraft,
  findCustomLayerDraft,
  getCanvasEditableMeta,
  editableBoundsDraftByTarget,
  editableVisibilityByTarget,
  updateEditableBoundsByTarget,
  clampEditableBounds,
  defaultCardDraft,
  createDefaultTemplateBuilderDraft,
  buildTemplateBuilderDraft,
  buildCustomLayerFromDraft,
  buildLayerPropsFromInspectorDraft,
  buildTemplateDesignFromDraft,
  buildTemplateResolvedDesignFromDraft,
  emptyLayerDraft,
  emptyZoneDraft,
  readHeadline
} from './model';
import { getCampaignState, parseStringList } from './StudioPrimitives';
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

export const useOfferStudioController = () => {
  const { buildUrl, isSuperAdminMode, marketId, userName } = useOffersAppSession();
  const offersService = useOffersService();
  const navigate = useNavigate();
  const stageSurfaceRef = useRef<HTMLDivElement | null>(null);
  const stageArtboardRef = useRef<HTMLDivElement | null>(null);
  const pendingStageViewportRef = useRef<{ anchorX: number; anchorY: number; nextScale: number } | null>(null);
  const canvasPointerSessionRef = useRef<{ target: CanvasEditableTarget | null; startClientX: number; startClientY: number; didDrag: boolean } | null>(null);
  const canvasSuppressClickTargetRef = useRef<CanvasEditableTarget | null>(null);
  const [searchParams] = useSearchParams();
  const requestedTemplateId = searchParams.get('templateId') || '';
  const requestedJobId = searchParams.get('jobId') || '';
  const requestedProductId = searchParams.get('productId') || '';
  const requestedMarketId = searchParams.get('marketId') || '';
  const requestedStudioSheet = searchParams.get('sheet') || '';
  const studioSheet = requestedStudioSheet === 'campaigns' || requestedStudioSheet === 'media'
    ? requestedStudioSheet
    : '';
  const [overview, setOverview] = useState<OfferOverview | null>(null);
  const [jobs, setJobs] = useState<OfferGenerationJob[]>([]);
  const [templates, setTemplates] = useState<OfferTemplate[]>([]);
  const [brandKits, setBrandKits] = useState<OfferBrandKit[]>([]);
  const [campaignKits, setCampaignKits] = useState<OfferCampaignKit[]>([]);
  const [templateVariants, setTemplateVariants] = useState<OfferTemplateVariant[]>([]);
  const [superAdminMarkets, setSuperAdminMarkets] = useState<SuperAdminMarketOption[]>([]);
  const [marketProfile, setMarketProfile] = useState<OfferMarketProfile | null>(null);
  const [selectedSuperAdminMarketId, setSelectedSuperAdminMarketId] = useState(requestedMarketId);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedVariantKey, setSelectedVariantKey] = useState('');
  const [selectedBrandKitId, setSelectedBrandKitId] = useState('');
  const [selectedCampaignKitId, setSelectedCampaignKitId] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<OfferCatalogProduct[]>([]);
  const [activeJobId, setActiveJobId] = useState(requestedJobId);
  const [results, setResults] = useState<OfferCatalogProduct[]>([]);
  const [preview, setPreview] = useState<OfferTemplatePreview | null>(null);
  const [validation, setValidation] = useState<OfferTemplateValidation | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [jobName, setJobName] = useState('');
  const [campaignKicker, setCampaignKicker] = useState('Oferta do dia');
  const [campaignHeadline, setCampaignHeadline] = useState('Ofertas da semana');
  const [campaignSubheadline, setCampaignSubheadline] = useState('Selecione os produtos para montar a arte automaticamente.');
  const [campaignBadgeLabel, setCampaignBadgeLabel] = useState('Oferta');
  const [outputType, setOutputType] = useState('PNG');
  const [generationMode, setGenerationMode] = useState('CATALOG');
  const [gridPreset, setGridPreset] = useState('AUTO');
  const [productBoxMode, setProductBoxMode] = useState('SMART');
  const [textMode, setTextMode] = useState('MEDIUM');
  const [colorMode, setColorMode] = useState('SMART');
  const [footerMode, setFooterMode] = useState('ROUND');
  const [zoomMode, setZoomMode] = useState('AUTO');
  const [renderQuality, setRenderQuality] = useState('high');
  const [publishTargets, setPublishTargets] = useState<string[]>(['DOWNLOAD']);
  const [coverEnabled, setCoverEnabled] = useState(false);
  const [activeTool, setActiveTool] = useState<StudioTool>(isSuperAdminMode ? 'themes' : 'products');
  const [productPanelMode, setProductPanelMode] = useState<ProductPanelMode>('search');
  const [toolPanelCollapsed, setToolPanelCollapsed] = useState(false);
  const [searchBoxCollapsed, setSearchBoxCollapsed] = useState(false);
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [draggingLayerId, setDraggingLayerId] = useState('');
  const [dragOverLayerId, setDragOverLayerId] = useState('');
  const [canvasEditTarget, setCanvasEditTarget] = useState<CanvasEditableTarget | null>(null);
  const [canvasEditInteraction, setCanvasEditInteraction] = useState<CanvasEditInteraction | null>(null);
  const [removingBackgroundId, setRemovingBackgroundId] = useState<string | null>(null);
  const [layerDraft, setLayerDraft] = useState<LayerDraft>(emptyLayerDraft);
  const [zoneDraft, setZoneDraft] = useState<ZoneDraft>(emptyZoneDraft);
  const [templateBuilderDraft, setTemplateBuilderDraft] = useState<TemplateBuilderDraft>(() => createDefaultTemplateBuilderDraft());
  const [newLayerOption, setNewLayerOption] = useState<string>('custom:text');
  const [loading, setLoading] = useState(true);
  const [marketsLoading, setMarketsLoading] = useState(isSuperAdminMode);
  const [searching, setSearching] = useState(false);
  const [bulkSearching, setBulkSearching] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingMarketProfile, setSavingMarketProfile] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [lookupNotice, setLookupNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stageSurfaceSize, setStageSurfaceSize] = useState({ width: 0, height: 0 });
  const [collapsedConfigSections, setCollapsedConfigSections] = useState<Record<string, boolean>>({});
  const [pendingStructureReveal, setPendingStructureReveal] = useState<{ kind: 'layer' | 'zone'; id: string } | null>(null);

  const selectedSuperAdminMarket = useMemo(
    () => superAdminMarkets.find((market) => market.id === selectedSuperAdminMarketId) || null,
    [selectedSuperAdminMarketId, superAdminMarkets],
  );
  const effectiveMarketId = isSuperAdminMode ? selectedSuperAdminMarketId : marketId || '';
  const effectiveMarketName = isSuperAdminMode ? selectedSuperAdminMarket?.name || 'conta selecionada' : userName || 'MercadoFlow';
  const isEditingCampaign = !isSuperAdminMode && Boolean(activeJobId);
  const selectedTemplate = useMemo(() => templates.find((template) => template.id === selectedTemplateId) || null, [templates, selectedTemplateId]);
  const selectedVariant = useMemo(() => templateVariants.find((variant) => variant.variantKey === selectedVariantKey) || null, [templateVariants, selectedVariantKey]);
  const selectedBrandKit = useMemo(() => brandKits.find((kit) => kit.id === selectedBrandKitId) || null, [brandKits, selectedBrandKitId]);
  const selectedCampaignKit = useMemo(() => campaignKits.find((kit) => kit.id === selectedCampaignKitId) || null, [campaignKits, selectedCampaignKitId]);
  const selectedProductIds = useMemo(() => new Set(selectedProducts.map((product) => product.productId)), [selectedProducts]);
  const itemsPerPage = useMemo(() => (generationMode === 'CATALOG' ? resolveGridPresetCount(gridPreset) : 1), [generationMode, gridPreset]);
  const pageEstimate = useMemo(() => {
    if (generationMode === 'INDIVIDUAL') return Math.max(selectedProducts.length, 1);
    const basePages = Math.max(Math.ceil(selectedProducts.length / Math.max(itemsPerPage, 1)), 1);
    return coverEnabled ? basePages + 1 : basePages;
  }, [coverEnabled, generationMode, itemsPerPage, selectedProducts.length]);
  const sortedJobs = useMemo(
    () => [...jobs].sort((left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime()),
    [jobs],
  );
  const mediaEntries = useMemo(
    () =>
      sortedJobs.flatMap((job) => (job.outputs || []).map((output) => ({
        job,
        output,
      }))),
    [sortedJobs],
  );
  const readyMediaCount = useMemo(
    () => mediaEntries.filter(({ output }) => String(output.status || '').toUpperCase() === 'READY').length,
    [mediaEntries],
  );
  const draftCampaignCount = useMemo(
    () => sortedJobs.filter((job) => getCampaignState(job).key === 'draft').length,
    [sortedJobs],
  );
  const portalEnabled = publishTargets.includes('PORTAL');
  const stageCanvasWidth = useMemo(
    () => (
      isSuperAdminMode
        ? clampNumber(
            templateBuilderDraft.canvasWidth,
            selectedVariant?.canvasWidth || selectedTemplate?.canvasWidth || 1080,
            720,
            3200,
          )
        : selectedVariant?.canvasWidth || preview?.canvasWidth || selectedTemplate?.canvasWidth || 1080
    ),
    [
      isSuperAdminMode,
      preview?.canvasWidth,
      selectedTemplate?.canvasWidth,
      selectedVariant?.canvasWidth,
      templateBuilderDraft.canvasWidth,
    ],
  );
  const stageCanvasHeight = useMemo(
    () => (
      isSuperAdminMode
        ? clampNumber(
            templateBuilderDraft.canvasHeight,
            selectedVariant?.canvasHeight || selectedTemplate?.canvasHeight || 1350,
            720,
            4800,
          )
        : selectedVariant?.canvasHeight || preview?.canvasHeight || selectedTemplate?.canvasHeight || 1350
    ),
    [
      isSuperAdminMode,
      preview?.canvasHeight,
      selectedTemplate?.canvasHeight,
      selectedVariant?.canvasHeight,
      templateBuilderDraft.canvasHeight,
    ],
  );
  const fitStageScale = useMemo(() => {
    if (!stageSurfaceSize.width || !stageSurfaceSize.height || !stageCanvasWidth || !stageCanvasHeight) {
      return 1;
    }

    return Math.min(stageSurfaceSize.width / stageCanvasWidth, stageSurfaceSize.height / stageCanvasHeight, 1);
  }, [stageCanvasHeight, stageCanvasWidth, stageSurfaceSize.height, stageSurfaceSize.width]);
  const stageScale = useMemo(() => {
    if (zoomMode !== 'AUTO') {
      return zoomToScale(zoomMode, fitStageScale);
    }

    return fitStageScale;
  }, [fitStageScale, zoomMode]);
  const scaledStageWidth = Math.max(stageCanvasWidth * stageScale, 1);
  const scaledStageHeight = Math.max(stageCanvasHeight * stageScale, 1);
  const zoomOptions = useMemo(() => {
    const manualValues = new Set<number>(ZOOM_PRESET_VALUES);

    if (zoomMode !== 'AUTO') {
      manualValues.add(Math.round(zoomToScale(zoomMode, fitStageScale) * 100));
    }

    return [
      { value: 'AUTO', label: 'Auto' },
      ...Array.from(manualValues)
        .sort((left, right) => left - right)
        .map((value) => ({ value: String(value), label: `${value}%` })),
    ];
  }, [fitStageScale, zoomMode]);
  const zoomDisplayLabel = useMemo(() => formatZoomLabel(stageScale), [stageScale]);
  const footerText = useMemo(() => footerPreviewLabel(footerMode), [footerMode]);
  const templateOptions = useMemo(
    () => (
      isSuperAdminMode
        ? [{ value: '', label: 'Novo template' }, ...templates.map((template) => ({ value: template.id, label: template.name }))]
        : templates.map((template) => ({ value: template.id, label: template.name }))
    ),
    [isSuperAdminMode, templates],
  );
  const variantOptions = useMemo(
    () => templateVariants.map((variant) => ({ value: variant.variantKey, label: `${variant.name} · ${variant.canvasWidth}x${variant.canvasHeight}` })),
    [templateVariants],
  );
  const brandKitOptions = useMemo(() => brandKits.map((kit) => ({ value: kit.id, label: kit.name })), [brandKits]);
  const campaignKitOptions = useMemo(() => campaignKits.map((kit) => ({ value: kit.id, label: kit.name })), [campaignKits]);
  const superAdminMarketOptions = useMemo(
    () =>
      superAdminMarkets.map((market) => ({
        value: market.id,
        label: market.planType ? `${market.name} · ${market.planType}` : market.name,
      })),
    [superAdminMarkets],
  );
  const visibleToolOptions = useMemo(
    () => (isSuperAdminMode ? [...TOOL_OPTIONS, { key: 'builder', icon: Paintbrush, label: 'Construtor' } as any] : TOOL_OPTIONS),
    [isSuperAdminMode],
  );
  const stageProducts = useMemo(
    () => selectedProducts.slice(0, Math.max(itemsPerPage, clampNumber(templateBuilderDraft.contentZone.slotCount, itemsPerPage, 1, 24))),
    [itemsPerPage, selectedProducts, templateBuilderDraft.contentZone.slotCount],
  );
  const builderResolvedDesignJson = useMemo(
    () =>
      JSON.stringify(
        buildTemplateResolvedDesignFromDraft(
          templateBuilderDraft,
          selectedBrandKit,
          selectedCampaignKit,
          marketProfile,
          {
            kicker: campaignKicker,
            headline: campaignHeadline,
            subheadline: campaignSubheadline,
            badgeLabel: campaignBadgeLabel,
          },
          stageProducts,
        ),
      ),
    [campaignBadgeLabel, campaignHeadline, campaignKicker, campaignSubheadline, marketProfile, selectedBrandKit, selectedCampaignKit, stageProducts, templateBuilderDraft],
  );
  const stageGridLimit = useMemo(
    () => (activeTool === 'builder' ? clampNumber(templateBuilderDraft.contentZone.slotCount, itemsPerPage, 1, 24) : generationMode === 'CATALOG' ? itemsPerPage : 1),
    [activeTool, generationMode, itemsPerPage, templateBuilderDraft.contentZone.slotCount],
  );
  const effectiveResolvedDesignJson = useMemo(
    () => (activeTool === 'builder' ? builderResolvedDesignJson : preview?.resolvedDesignJson || null),
    [activeTool, builderResolvedDesignJson, preview?.resolvedDesignJson],
  );
  const resolvedDesign = useMemo(() => parseJson<JsonMap>(effectiveResolvedDesignJson, {}) || {}, [effectiveResolvedDesignJson]);
  const resolvedLayers = useMemo(() => asList(resolvedDesign.layers), [resolvedDesign]);
  const resolvedZones = useMemo(() => asList(resolvedDesign.productZones), [resolvedDesign]);
  const activeLayer = useMemo(
    () => resolvedLayers.find((layer) => String(layer.id || '') === selectedLayerId) || resolvedLayers[0] || null,
    [resolvedLayers, selectedLayerId],
  );
  const activeCustomLayer = useMemo(
    () => templateBuilderDraft.customLayers.find((layer) => layer.id === String(activeLayer?.id || '')) || null,
    [activeLayer, templateBuilderDraft.customLayers],
  );
  const activeCustomLayerType = activeCustomLayer?.type || '';
  const activeCustomLayerSupportsText = activeCustomLayerType === 'text' || activeCustomLayerType === 'tag' || activeCustomLayerType === 'qrcode';
  const activeCustomLayerSupportsFont = activeCustomLayerType === 'text' || activeCustomLayerType === 'tag';
  const activeCustomLayerSupportsImage = activeCustomLayerType === 'image';
  const activeCustomLayerSupportsShape = activeCustomLayerType === 'shape';
  const activeZone = useMemo(
    () => resolvedZones.find((zone) => String(zone.id || '') === selectedZoneId) || resolvedZones[0] || null,
    [resolvedZones, selectedZoneId],
  );
  const activeInspectorCanvasTarget = useMemo(() => {
    const layerTarget = editableTargetFromLayerId(String(activeLayer?.id || ''));
    if (layerTarget) {
      return layerTarget;
    }

    return editableTargetFromZoneId(String(activeZone?.id || ''));
  }, [activeLayer, activeZone]);
  const layerInsertOptions = useMemo(() => {
    const missingBuiltins = TEMPLATE_BUILDER_LAYER_IDS
      .filter((layerId) => !templateBuilderDraft.layerOrder.includes(layerId))
      .map((layerId) => ({
        value: `builtin:${layerId}`,
        label: `Restaurar ${BUILTIN_LAYER_LABELS[layerId] || layerId}`,
      }));

    return [
      ...CUSTOM_LAYER_TYPE_OPTIONS.map((option) => ({ value: `custom:${option.value}`, label: `Nova camada de ${option.label.toLowerCase()}` })),
      ...missingBuiltins,
    ];
  }, [templateBuilderDraft.layerOrder]);
  const activeZoneBinding = useMemo(() => {
    const zoneBindings = asMap(resolvedDesign.zoneBindings);
    return activeZone ? asList(zoneBindings[String(activeZone.id || '')]) : [];
  }, [activeZone, resolvedDesign]);
  const canvasEditableOverlays = useMemo(
    () =>
      ['content-zone', ...templateBuilderDraft.layerOrder].map((target) => {
        const meta = getCanvasEditableMeta(templateBuilderDraft, target);
        const rawBounds = editableBoundsDraftByTarget(templateBuilderDraft, target);
        const bounds = clampEditableBounds(
          templateBuilderDraft,
          target,
          parseBoundsDraft(rawBounds, { x: 0, y: 0, w: meta.minWidth, h: meta.minHeight }),
          stageCanvasWidth,
          stageCanvasHeight,
        );

        return {
          key: target,
          label: meta.label,
          selectionKind: meta.selectionKind,
          selectionId: meta.selectionId,
          accent: meta.accent,
          overlayLevel: meta.overlayLevel,
          bounds,
          visible: editableVisibilityByTarget(templateBuilderDraft, target),
          editing: canvasEditTarget === target,
        };
      }),
    [canvasEditTarget, stageCanvasHeight, stageCanvasWidth, templateBuilderDraft],
  );
  const canvasHighlightedTarget = canvasEditTarget;
  const activeCanvasSelection = useMemo(
    () => (canvasHighlightedTarget ? getCanvasEditableMeta(templateBuilderDraft, canvasHighlightedTarget) : null),
    [canvasHighlightedTarget, templateBuilderDraft],
  );
  const canvasSelectedLayerId = activeCanvasSelection?.selectionKind === 'layer' ? activeCanvasSelection.selectionId : '';
  const canvasSelectedZoneId = activeCanvasSelection?.selectionKind === 'zone' ? activeCanvasSelection.selectionId : '';
  const activeCanvasEditLabel = canvasEditTarget ? getCanvasEditableMeta(templateBuilderDraft, canvasEditTarget).label : '';

  useEffect(() => {
    const node = stageSurfaceRef.current;
    if (!node || typeof window === 'undefined') {
      return undefined;
    }

    const updateStageSurfaceSize = () => {
      const styles = window.getComputedStyle(node);
      const horizontalPadding = Number.parseFloat(styles.paddingLeft || '0') + Number.parseFloat(styles.paddingRight || '0');
      const verticalPadding = Number.parseFloat(styles.paddingTop || '0') + Number.parseFloat(styles.paddingBottom || '0');
      setStageSurfaceSize({
        width: Math.max(node.clientWidth - horizontalPadding, 0),
        height: Math.max(node.clientHeight - verticalPadding, 0),
      });
    };

    updateStageSurfaceSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateStageSurfaceSize);
      return () => window.removeEventListener('resize', updateStageSurfaceSize);
    }

    const observer = new ResizeObserver(() => updateStageSurfaceSize());
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const setViewportZoom = (nextMode: string, nextScale: number, pointer?: { clientX: number; clientY: number }) => {
    const surface = stageSurfaceRef.current;

    if (surface) {
      const bounds = surface.getBoundingClientRect();
      const localX = pointer ? pointer.clientX - bounds.left + surface.scrollLeft : surface.scrollLeft + surface.clientWidth / 2;
      const localY = pointer ? pointer.clientY - bounds.top + surface.scrollTop : surface.scrollTop + surface.clientHeight / 2;
      pendingStageViewportRef.current = {
        anchorX: localX / Math.max(stageScale, MIN_STAGE_ZOOM),
        anchorY: localY / Math.max(stageScale, MIN_STAGE_ZOOM),
        nextScale: clampZoomScale(nextScale),
      };
    }

    setZoomMode(nextMode);
  };

  const handleZoomSelect = (value: string) => {
    if (value === 'AUTO') {
      setViewportZoom('AUTO', fitStageScale);
      return;
    }

    const nextScale = zoomToScale(value, fitStageScale);
    setViewportZoom(scaleToZoomValue(nextScale), nextScale);
  };

  const handleZoomStep = (direction: 'in' | 'out', pointer?: { clientX: number; clientY: number }) => {
    const nextScale = resolveStepZoomScale(stageScale, direction);

    if (Math.abs(nextScale - stageScale) < 0.001) {
      return;
    }

    setViewportZoom(scaleToZoomValue(nextScale), nextScale, pointer);
  };

  useLayoutEffect(() => {
    const surface = stageSurfaceRef.current;
    const pendingViewport = pendingStageViewportRef.current;

    if (!surface || !pendingViewport) {
      return;
    }

    if (Math.abs(stageScale - pendingViewport.nextScale) > 0.001) {
      return;
    }

    const nextLeft = pendingViewport.anchorX * stageScale - surface.clientWidth / 2;
    const nextTop = pendingViewport.anchorY * stageScale - surface.clientHeight / 2;
    surface.scrollTo({
      left: Math.max(nextLeft, 0),
      top: Math.max(nextTop, 0),
    });
    pendingStageViewportRef.current = null;
  }, [stageScale]);

  useEffect(() => {
    const surface = stageSurfaceRef.current;
    if (!surface) {
      return undefined;
    }

    const handleWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      event.preventDefault();
      const nextScale = clampZoomScale(stageScale * (event.deltaY < 0 ? 1.12 : 1 / 1.12));

      if (Math.abs(nextScale - stageScale) < 0.001) {
        return;
      }

      setViewportZoom(scaleToZoomValue(nextScale), nextScale, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    };

    surface.addEventListener('wheel', handleWheel, { passive: false });
    return () => surface.removeEventListener('wheel', handleWheel);
  }, [stageScale]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName || '';

      if (target?.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return;
      }

      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      if (event.key === '0') {
        event.preventDefault();
        handleZoomSelect('AUTO');
        return;
      }

      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        handleZoomStep('in');
        return;
      }

      if (event.key === '-') {
        event.preventDefault();
        handleZoomStep('out');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fitStageScale, stageScale]);

  const buildStudioRoute = (overrides?: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(overrides || {}).forEach(([key, value]) => {
      if (value == null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    return buildUrl('/ofertas', params.toString());
  };

  const buildDesignerRoute = (jobId: string) => buildStudioRoute({ jobId, sheet: null });

  const buildRenderOptionsPayload = () => ({
    quality: renderQuality,
    coverEnabled,
    gridPreset,
    productBoxMode,
    textMode,
    colorMode,
    footerMode,
    brandKitId: selectedBrandKitId || null,
    campaignKitId: selectedCampaignKitId || null,
    campaignCopy: {
      kicker: campaignKicker,
      headline: campaignHeadline,
      subheadline: campaignSubheadline,
      badgeLabel: campaignBadgeLabel,
    },
  });
  const name = effectiveMarketName;

  const socialCopy = useMemo(() => {
    const previewHeadline = readHeadline(preview);
    if (!selectedProducts.length) {
      return 'Adicione produtos na fila para gerar um texto de apoio automático para redes sociais e comunicação acessível.';
    }
    const intro = previewHeadline
      ? `${previewHeadline}\n\n`
      : textMode === 'SHORT'
        ? `Ofertas em destaque do ${name || 'MercadoFlow'}:\n\n`
        : `Confira as ofertas preparadas para o ${name || 'seu mercado'}, com foco em preço, giro e exposição:\n\n`;
    const lines = selectedProducts
      .slice(0, textMode === 'LONG' ? 8 : textMode === 'MEDIUM' ? 5 : 3)
      .map((product) => ` ${product.name} por ${formatMoney(product.currentPrice)}${product.unit ? ` · ${product.unit}` : ''}`);
    const outro = textMode === 'LONG'
      ? '\n\nValores sujeitos ao estoque da loja e à vigência da ação comercial.'
      : '\n\nOfertas sujeitas à disponibilidade.';
    return `${intro}${lines.join('\n')}${outro}`;
  }, [name, preview, selectedProducts, textMode]);

  const resetCampaignDraft = () => {
    setActiveJobId('');
    setJobName('');
    setCampaignKicker('Oferta do dia');
    setCampaignHeadline('Ofertas da semana');
    setCampaignSubheadline('Selecione os produtos para montar a arte automaticamente.');
    setCampaignBadgeLabel('Oferta');
    setOutputType('PNG');
    setGenerationMode('CATALOG');
    setGridPreset('AUTO');
    setProductBoxMode('SMART');
    setTextMode('MEDIUM');
    setColorMode('SMART');
    setFooterMode('ROUND');
    setZoomMode('AUTO');
    setRenderQuality('high');
    setPublishTargets(['DOWNLOAD']);
    setCoverEnabled(false);
  };

  const hydrateDraftFromJob = async (
    job: OfferGenerationJob,
    templateData: OfferTemplate[],
    brandList: OfferBrandKit[],
    campaignList: OfferCampaignKit[],
  ) => {
    const renderOptions = parseJson<JsonMap>(job.renderOptionsJson, {}) || {};
    const campaignCopy = asMap(renderOptions.campaignCopy);
    const jobTemplateId = job.templateId || templateData[0]?.id || '';
    setActiveJobId(job.id);
    setSelectedTemplateId(jobTemplateId);
    await loadTemplateMeta(jobTemplateId, templateData, brandList, campaignList);
    setJobName(job.name || '');
    setCampaignKicker(String(campaignCopy.kicker || 'Oferta do dia'));
    setCampaignHeadline(String(campaignCopy.headline || job.name || 'Ofertas da semana'));
    setCampaignSubheadline(String(campaignCopy.subheadline || 'Selecione os produtos para montar a arte automaticamente.'));
    setCampaignBadgeLabel(String(campaignCopy.badgeLabel || 'Oferta'));
    setOutputType(job.outputType || 'PNG');
    setGenerationMode(job.generationMode || 'CATALOG');
    setSelectedVariantKey(job.variantKey || '');
    setSelectedBrandKitId(normalizeSelection(brandList, typeof renderOptions.brandKitId === 'string' ? renderOptions.brandKitId : '', '') || '');
    setSelectedCampaignKitId(normalizeSelection(campaignList, typeof renderOptions.campaignKitId === 'string' ? renderOptions.campaignKitId : '', '') || '');
    setGridPreset(String(renderOptions.gridPreset || 'AUTO'));
    setProductBoxMode(String(renderOptions.productBoxMode || 'SMART'));
    setTextMode(String(renderOptions.textMode || 'MEDIUM'));
    setColorMode(String(renderOptions.colorMode || 'SMART'));
    setFooterMode(String(renderOptions.footerMode || 'ROUND'));
    setZoomMode(String(renderOptions.zoomMode || 'AUTO'));
    setRenderQuality(String(renderOptions.quality || 'high'));
    setPublishTargets(parseJson<string[]>(job.publishTargetsJson, ['DOWNLOAD']) || ['DOWNLOAD']);
    setCoverEnabled(Boolean(renderOptions.coverEnabled));
    setSelectedProducts(
      job.items.map((item) => ({
        productId: item.productId || item.id,
        name: item.productName,
        category: item.zoneId || null,
        unit: item.productUnit || null,
        imageUrl: item.productImageUrl || null,
        currentPrice: Number(item.currentPrice || 0),
        baselinePrice: Number(item.currentPrice || 0),
      })),
    );
  };

  const refreshPreview = async (mode: 'preview' | 'autofill' = 'preview', productIds?: string[]) => {
    if (!effectiveMarketId || !selectedTemplateId) {
      setPreview(null);
      return;
    }
    setPreviewing(true);
    try {
      const payload = {
        templateId: selectedTemplateId,
        variantKey: selectedVariantKey || undefined,
        brandKitId: selectedBrandKitId || undefined,
        campaignKitId: selectedCampaignKitId || undefined,
        renderOptionsJson: JSON.stringify(buildRenderOptionsPayload()),
        productIds: productIds || selectedProducts.map((product) => product.productId),
      };
      const data = mode === 'autofill'
        ? await offersService.autoFillTemplate(effectiveMarketId, payload)
        : await offersService.previewTemplate(effectiveMarketId, payload);
      setPreview(data);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível atualizar a prévia.');
    } finally {
      setPreviewing(false);
    }
  };

  const loadTemplateMeta = async (templateId: string, templateList: OfferTemplate[], brandList: OfferBrandKit[], campaignList: OfferCampaignKit[]) => {
    if (!effectiveMarketId || !templateId) {
      setTemplateVariants([]);
      setValidation(null);
      return;
    }
    const template = templateList.find((item) => item.id === templateId) || null;
    try {
      const [variantsData, validationData] = await Promise.all([
        offersService.getTemplateVariants(effectiveMarketId, templateId),
        offersService.validateTemplate(effectiveMarketId, templateId),
      ]);
      setTemplateVariants(variantsData);
      setValidation(validationData);
      setSelectedVariantKey((current) => {
        const templateDefault = template?.defaultVariantKey || variantsData[0]?.variantKey || '';
        return variantsData.some((variant) => variant.variantKey === current) ? current : templateDefault;
      });
      setSelectedBrandKitId((current) => normalizeSelection(brandList, current, template?.brandKitId || brandList[0]?.id || '') || '');
      setSelectedCampaignKitId((current) => normalizeSelection(campaignList, current, template?.campaignKitId || campaignList[0]?.id || '') || '');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar variantes e validação do template.');
    }
  };

  useEffect(() => {
    if (!isSuperAdminMode) {
      return;
    }

    let active = true;

    const loadMarkets = async () => {
      setMarketsLoading(true);
      try {
        const response = await api.get<PaginatedResponse<SuperAdminMarketOption>>('/v1/super-admin/markets', {
          params: { page: 0, size: 200 },
        });
        if (!active) {
          return;
        }
        const marketOptions = response.data.content || [];
        setSuperAdminMarkets(marketOptions);
        setSelectedSuperAdminMarketId((current) => {
          const preferredMarketId = current || requestedMarketId;
          if (preferredMarketId && marketOptions.some((item) => item.id === preferredMarketId)) {
            return preferredMarketId;
          }
          return marketOptions[0]?.id || '';
        });
      } catch (err: any) {
        if (active) {
          setError(err?.message || 'Nao foi possivel carregar as contas do super admin.');
        }
      } finally {
        if (active) {
          setMarketsLoading(false);
        }
      }
    };

    void loadMarkets();

    return () => {
      active = false;
    };
  }, [isSuperAdminMode, requestedMarketId]);

  useEffect(() => {
    const load = async () => {
      if (isSuperAdminMode && marketsLoading) {
        setLoading(true);
        return;
      }
      if (!effectiveMarketId) {
        setTemplates([]);
        setOverview(null);
        setJobs([]);
        setBrandKits([]);
        setCampaignKits([]);
        setMarketProfile(null);
        setTemplateVariants([]);
        resetCampaignDraft();
        setSelectedTemplateId('');
        setSelectedProducts([]);
        setResults([]);
        setPreview(null);
        setValidation(null);
        setLoading(false);
        if (isSuperAdminMode) {
          window.setTimeout(() => setError('Selecione uma conta para abrir o estudio de ofertas.'), 0);
        }
        setError('Mercado não encontrado.');
        return;
      }
      try {
        setLoading(true);
        const { overview: overviewData, jobs: jobsData, templates: templateData } = await loadOfferStudioBootstrap(offersService, effectiveMarketId);
        setTemplates(templateData);
        setOverview(overviewData);
        setJobs(jobsData);
        setBrandKits(overviewData.brandKits || []);
        setCampaignKits(overviewData.campaignKits || []);
        setMarketProfile(overviewData.marketProfile || null);
        setResults([]);
        setPreview(null);
        if (requestedJobId && !isSuperAdminMode) {
          const job = await offersService.getJob(effectiveMarketId, requestedJobId);
          await hydrateDraftFromJob(job, templateData, overviewData.brandKits || [], overviewData.campaignKits || []);
        } else {
          resetCampaignDraft();
          const initialTemplateId = requestedTemplateId || templateData[0]?.id || '';
          setSelectedTemplateId(initialTemplateId);
          setSelectedProducts([]);
          await loadTemplateMeta(initialTemplateId, templateData, overviewData.brandKits || [], overviewData.campaignKits || []);
          const initialProductId = requestedProductId;
          if (initialProductId) {
            const selection = await offersService.getCatalogSelection(effectiveMarketId, [initialProductId]);
            setSelectedProducts(selection);
          }
        }
        setError(null);
      } catch (err: any) {
        setError(err?.message || 'Não foi possível carregar o estúdio de ofertas.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [effectiveMarketId, isSuperAdminMode, marketsLoading, offersService, requestedJobId, requestedProductId, requestedTemplateId]);

  useEffect(() => {
    if (!effectiveMarketId || !selectedTemplateId) return;
    const timer = window.setTimeout(() => {
      void refreshPreview('preview');
    }, 180);
    return () => window.clearTimeout(timer);
  }, [
    campaignBadgeLabel,
    campaignHeadline,
    campaignKicker,
    campaignSubheadline,
    colorMode,
    coverEnabled,
    effectiveMarketId,
    footerMode,
    gridPreset,
    productBoxMode,
    selectedBrandKitId,
    selectedCampaignKitId,
    selectedProducts,
    selectedTemplateId,
    selectedVariantKey,
    textMode,
  ]);

  useEffect(() => {
    if (!lookupNotice) return undefined;
    const timer = window.setTimeout(() => setLookupNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [lookupNotice]);

  useEffect(() => {
    if (!pendingStructureReveal || !isSuperAdminMode || activeTool !== 'themes' || typeof window === 'undefined') {
      return undefined;
    }

    const selector =
      pendingStructureReveal.kind === 'layer'
        ? `[data-structure-layer-id="${pendingStructureReveal.id}"]`
        : `[data-structure-zone-id="${pendingStructureReveal.id}"]`;

    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(selector);
      target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      setPendingStructureReveal(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    activeTool,
    collapsedConfigSections.inspectorPanel,
    collapsedConfigSections.layersPanel,
    collapsedConfigSections.structure,
    collapsedConfigSections.zonesPanel,
    isSuperAdminMode,
    pendingStructureReveal,
  ]);

  useEffect(() => {
    if (resolvedLayers.length) {
      setSelectedLayerId((current) => (resolvedLayers.some((layer) => String(layer.id || '') === current) ? current : String(resolvedLayers[0].id || '')));
    } else {
      setSelectedLayerId('');
    }
    if (resolvedZones.length) {
      setSelectedZoneId((current) => (resolvedZones.some((zone) => String(zone.id || '') === current) ? current : String(resolvedZones[0].id || '')));
    } else {
      setSelectedZoneId('');
    }
  }, [resolvedLayers, resolvedZones]);

  useEffect(() => {
    const bounds = asMap(activeLayer?.bounds);
    const props = asMap(activeLayer?.props);
    if (!activeLayer) {
      setLayerDraft(emptyLayerDraft);
      return;
    }
    setLayerDraft({
      type: String(activeLayer.type || 'text'),
      name: String(activeLayer.name || activeLayer.id || ''),
      binding: String(activeLayer.binding || ''),
      x: String(bounds.x ?? ''),
      y: String(bounds.y ?? ''),
      w: String(bounds.w ?? ''),
      h: String(bounds.h ?? ''),
      locked: Boolean(activeLayer.locked),
      visible: activeLayer.visible !== false,
      content: activeCustomLayer?.content || String(props.content || ''),
      imageUrl: activeCustomLayer?.imageUrl || String(props.imageUrl || ''),
      imageStorageKey: activeCustomLayer?.storageKey || String(props.storageKey || ''),
      background: String(props.background || activeCustomLayer?.background || ''),
      textColor: String(props.textColor || activeCustomLayer?.textColor || ''),
      borderColor: String(props.borderColor || activeCustomLayer?.borderColor || ''),
      borderWidth: String(props.borderWidth ?? activeCustomLayer?.borderWidth ?? ''),
      radius: String(props.radius ?? activeCustomLayer?.radius ?? ''),
      fontSize: String(props.fontSize ?? activeCustomLayer?.fontSize ?? ''),
      fontWeight: String(props.fontWeight ?? activeCustomLayer?.fontWeight ?? ''),
      frame: Boolean(props.frame ?? activeCustomLayer?.frame ?? false),
      fit: String(props.fit || activeCustomLayer?.fit || 'contain'),
    });
  }, [activeCustomLayer, activeLayer]);

  useEffect(() => {
    const bounds = asMap(activeZone?.bounds);
    if (!activeZone) {
      setZoneDraft(emptyZoneDraft);
      return;
    }
    setZoneDraft({
      name: String(activeZone.name || activeZone.id || ''),
      layout: String(activeZone.layout || 'grid'),
      slotCount: String(activeZone.slotCount ?? 1),
      columns: String(activeZone.columns ?? 1),
      rows: String(activeZone.rows ?? 1),
      x: String(bounds.x ?? ''),
      y: String(bounds.y ?? ''),
      w: String(bounds.w ?? ''),
      h: String(bounds.h ?? ''),
    });
  }, [activeZone]);

  useEffect(() => {
    setTemplateBuilderDraft(buildTemplateBuilderDraft(selectedTemplate, selectedVariant));
  }, [selectedTemplate, selectedVariant]);

  useEffect(() => {
    if (!(isSuperAdminMode && activeTool === 'builder')) {
      setCanvasEditInteraction(null);
      setCanvasEditTarget(null);
      canvasPointerSessionRef.current = null;
      canvasSuppressClickTargetRef.current = null;
    }
  }, [activeTool, isSuperAdminMode]);

  useEffect(() => {
    if (!canvasEditInteraction) {
      return undefined;
    }

    const handlePointerMove = (event: MouseEvent) => {
      const artboard = stageArtboardRef.current;
      if (!artboard) {
        return;
      }

      const pointerSession = canvasPointerSessionRef.current;
      if (
        pointerSession &&
        !pointerSession.didDrag &&
        (Math.abs(event.clientX - pointerSession.startClientX) > 2 || Math.abs(event.clientY - pointerSession.startClientY) > 2)
      ) {
        pointerSession.didDrag = true;
      }

      const rect = artboard.getBoundingClientRect();
      const localX = (event.clientX - rect.left) / Math.max(stageScale, MIN_STAGE_ZOOM);
      const localY = (event.clientY - rect.top) / Math.max(stageScale, MIN_STAGE_ZOOM);

      setTemplateBuilderDraft((current) => {
        const nextBounds =
          canvasEditInteraction.mode === 'move'
            ? clampEditableBounds(
                current,
                canvasEditInteraction.target,
                {
                  ...canvasEditInteraction.startBounds,
                  x: localX - canvasEditInteraction.anchorX,
                  y: localY - canvasEditInteraction.anchorY,
                },
                stageCanvasWidth,
                stageCanvasHeight,
              )
            : clampEditableBounds(
                current,
                canvasEditInteraction.target,
                {
                  ...canvasEditInteraction.startBounds,
                  w: canvasEditInteraction.startBounds.w + (localX - canvasEditInteraction.anchorX),
                  h: canvasEditInteraction.startBounds.h + (localY - canvasEditInteraction.anchorY),
                },
                stageCanvasWidth,
                stageCanvasHeight,
              );

        return updateEditableBoundsByTarget(current, canvasEditInteraction.target, boundsDraft(nextBounds.x, nextBounds.y, nextBounds.w, nextBounds.h));
      });
    };

    const handlePointerUp = () => {
      const pointerSession = canvasPointerSessionRef.current;
      canvasSuppressClickTargetRef.current = pointerSession?.didDrag ? pointerSession.target : null;
      canvasPointerSessionRef.current = null;
      setCanvasEditInteraction(null);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [canvasEditInteraction, stageCanvasHeight, stageCanvasWidth, stageScale]);

  const handleToggleLayerLock = (layerId: string) => {
    if (!layerId) {
      return;
    }

    setTemplateBuilderDraft((current) => ({
      ...current,
      layerLocks: {
        ...current.layerLocks,
        [layerId]: !(current.layerLocks[layerId] ?? true),
      },
    }));
  };

  const handleToggleLayerVisibility = (layerId: string) => {
    if (!layerId) {
      return;
    }

    setTemplateBuilderDraft((current) => {
      switch (layerId) {
        case 'kicker':
          return { ...current, kicker: { ...current.kicker, visible: !current.kicker.visible } };
        case 'headline':
          return { ...current, headline: { ...current.headline, visible: !current.headline.visible } };
        case 'subheadline':
          return { ...current, subheadline: { ...current.subheadline, visible: !current.subheadline.visible } };
        case 'campaign-badge':
          return { ...current, badge: { ...current.badge, visible: !current.badge.visible } };
        case 'footer':
          return { ...current, footer: { ...current.footer, visible: !current.footer.visible } };
        case 'footer-content':
          return { ...current, footerContent: { ...current.footerContent, visible: !current.footerContent.visible } };
        case 'footer-legal':
          return { ...current, footerLegal: { ...current.footerLegal, visible: !current.footerLegal.visible } };
        case 'footer-logo-left':
          return { ...current, footerLeftLogo: { ...current.footerLeftLogo, visible: !current.footerLeftLogo.visible } };
        case 'footer-logo-right':
          return { ...current, footerRightLogo: { ...current.footerRightLogo, visible: !current.footerRightLogo.visible } };
        default:
          return {
            ...current,
            customLayers: current.customLayers.map((layer) =>
              layer.id === layerId
                ? {
                    ...layer,
                    visible: !layer.visible,
                  }
                : layer,
            ),
          };
      }
    });
  };

  const handleAddTemplateLayer = () => {
    if (!newLayerOption) {
      return;
    }

    let nextSelectedLayerId = '';
    setTemplateBuilderDraft((current) => {
      if (newLayerOption.startsWith('builtin:')) {
        const layerId = newLayerOption.replace('builtin:', '');
        if (!layerId || current.layerOrder.includes(layerId)) {
          return current;
        }
        nextSelectedLayerId = layerId;

        const nextDraft: TemplateBuilderDraft = {
          ...current,
          layerOrder: [...current.layerOrder, layerId],
          layerLocks: {
            ...current.layerLocks,
            [layerId]: current.layerLocks[layerId] ?? true,
          },
        };

        switch (layerId) {
          case 'kicker':
            nextDraft.kicker = { ...current.kicker, visible: true };
            break;
          case 'headline':
            nextDraft.headline = { ...current.headline, visible: true };
            break;
          case 'subheadline':
            nextDraft.subheadline = { ...current.subheadline, visible: true };
            break;
          case 'campaign-badge':
            nextDraft.badge = { ...current.badge, visible: true };
            break;
          case 'footer':
            nextDraft.footer = { ...current.footer, visible: true };
            break;
          case 'footer-content':
            nextDraft.footerContent = { ...current.footerContent, visible: true };
            break;
          case 'footer-legal':
            nextDraft.footerLegal = { ...current.footerLegal, visible: true };
            break;
          case 'footer-logo-left':
            nextDraft.footerLeftLogo = { ...current.footerLeftLogo, visible: true };
            break;
          case 'footer-logo-right':
            nextDraft.footerRightLogo = { ...current.footerRightLogo, visible: true };
            break;
          default:
            break;
        }

        return nextDraft;
      }

      const nextType = newLayerOption.replace('custom:', '') as TemplateBuilderCustomLayerType;
      const nextLayer = createCustomLayerDraft(nextType, [...current.layerOrder, ...current.customLayers.map((layer) => layer.id)], stageCanvasWidth, stageCanvasHeight);
      nextSelectedLayerId = nextLayer.id;
      return {
        ...current,
        customLayers: [...current.customLayers, nextLayer],
        layerOrder: [...current.layerOrder, nextLayer.id],
        layerLocks: {
          ...current.layerLocks,
          [nextLayer.id]: false,
        },
      };
    });

    if (nextSelectedLayerId) {
      setSelectedLayerId(nextSelectedLayerId);
      setCanvasEditTarget(nextSelectedLayerId);
      setLookupNotice(newLayerOption.startsWith('builtin:') ? 'Camada restaurada na pilha do template.' : 'Nova camada adicionada. Ajuste no inspector e arraste na arte.');
      return;
    }

    setLookupNotice('Nao foi possivel adicionar a camada selecionada.');
  };

  const handleDeleteTemplateLayer = (layerId: string) => {
    if (!layerId) {
      return;
    }

    setTemplateBuilderDraft((current) => ({
      ...current,
      layerOrder: current.layerOrder.filter((id) => id !== layerId),
      customLayers: current.customLayers.filter((layer) => layer.id !== layerId),
    }));

    if (canvasEditTarget === layerId) {
      setCanvasEditInteraction(null);
      setCanvasEditTarget(null);
    }

    setLookupNotice('Camada removida da estrutura do template.');
  };

  const handleLayerDragStart = (layerId: string, event: React.DragEvent<HTMLDivElement>) => {
    if (!layerId) {
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', layerId);
    setDraggingLayerId(layerId);
    setDragOverLayerId(layerId);
    setSelectedLayerId(layerId);
  };

  const handleLayerDragOver = (layerId: string, event: React.DragEvent<HTMLDivElement>) => {
    if (!draggingLayerId || !layerId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (draggingLayerId !== layerId) {
      setDragOverLayerId(layerId);
    }
  };

  const handleLayerDrop = (targetLayerId: string, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const sourceLayerId = draggingLayerId || event.dataTransfer.getData('text/plain') || '';

    if (!sourceLayerId || !targetLayerId || sourceLayerId === targetLayerId) {
      setDragOverLayerId('');
      setDraggingLayerId('');
      return;
    }

    setTemplateBuilderDraft((current) => ({
      ...current,
      layerOrder: reorderLayerOrder(current.layerOrder, sourceLayerId, targetLayerId),
    }));
    setSelectedLayerId(sourceLayerId);
    setDragOverLayerId('');
    setDraggingLayerId('');
  };

  const handleLayerDragEnd = () => {
    setDragOverLayerId('');
    setDraggingLayerId('');
  };

  const revealStructureSelection = (kind: 'layer' | 'zone', id: string) => {
    if (!id) {
      return;
    }

    setCollapsedConfigSections((current) => ({
      ...current,
      structure: false,
      inspectorPanel: false,
      [kind === 'layer' ? 'layersPanel' : 'zonesPanel']: false,
    }));
    setPendingStructureReveal({ kind, id });
  };

  const syncCanvasEditSelection = (target: CanvasEditableTarget | null, options?: { reveal?: boolean }) => {
    if (!target) {
      return;
    }

    const reveal = options?.reveal !== false;
    const meta = getCanvasEditableMeta(templateBuilderDraft, target);
    if (meta.selectionKind === 'zone') {
      setSelectedLayerId('');
      setSelectedZoneId(meta.selectionId);
      if (reveal) {
        revealStructureSelection('zone', meta.selectionId);
      }
      return;
    }

    setSelectedLayerId(meta.selectionId);
    if (reveal) {
      revealStructureSelection('layer', meta.selectionId);
    }
  };

  const handleCanvasEditToggle = (target: CanvasEditableTarget) => {
    const nextTarget = canvasEditTarget === target ? null : target;
    setCanvasEditInteraction(null);
    setCanvasEditTarget(nextTarget);
    syncCanvasEditSelection(nextTarget);
  };

  const handleCanvasEditPointerStart = (
    target: CanvasEditableTarget,
    mode: 'move' | 'resize',
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    const artboard = stageArtboardRef.current;
    const descriptor = canvasEditableOverlays.find((item) => item.key === target);
    if (!artboard || !descriptor) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = artboard.getBoundingClientRect();
    const localX = (event.clientX - rect.left) / Math.max(stageScale, MIN_STAGE_ZOOM);
    const localY = (event.clientY - rect.top) / Math.max(stageScale, MIN_STAGE_ZOOM);

    setCanvasEditTarget(target);
    syncCanvasEditSelection(target, { reveal: false });
    canvasPointerSessionRef.current = {
      target,
      startClientX: event.clientX,
      startClientY: event.clientY,
      didDrag: false,
    };
    canvasSuppressClickTargetRef.current = null;
    setCanvasEditInteraction({
      target,
      mode,
      anchorX: mode === 'move' ? localX - descriptor.bounds.x : localX,
      anchorY: mode === 'move' ? localY - descriptor.bounds.y : localY,
      startBounds: descriptor.bounds,
    });
  };

  const handleCanvasGuideClick = (target: CanvasEditableTarget) => {
    if (canvasSuppressClickTargetRef.current === target) {
      canvasSuppressClickTargetRef.current = null;
      return;
    }

    setCanvasEditTarget(target);
    syncCanvasEditSelection(target);
  };

  const renderCanvasEditButton = (target: CanvasEditableTarget, label = 'Editar na arte') => (
    <button
      type="button"
      className={`offer-studio-stage-tool-button ${canvasEditTarget === target ? 'active' : ''}`}
      onClick={() => handleCanvasEditToggle(target)}
    >
      <BoxSelect size={15} strokeWidth={2.1} />
      <span>{canvasEditTarget === target ? 'Parar edicao' : label}</span>
    </button>
  );

  const toggleConfigSection = (sectionId: string) => {
    setCollapsedConfigSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  };

  const handleStartNewTemplate = () => {
    if (!isSuperAdminMode) {
      setError('A criação de templates fica disponível apenas no painel super admin.');
      return;
    }

    const nextDraft = createDefaultTemplateBuilderDraft(selectedTemplate, selectedVariant);
    setSelectedTemplateId('');
    setTemplateVariants([]);
    setSelectedVariantKey('');
    setValidation(null);
    setPreview(null);
    setTemplateBuilderDraft(nextDraft);
    setError(null);
    setLookupNotice('Novo template iniciado. Ajuste a estrutura e salve como novo template.');
  };

  useEffect(() => {
    if (!effectiveMarketId) return;
    const normalized = searchInput.trim();
    if (normalized.length < 2) {
      setResults([]);
      return undefined;
    }
    const handler = window.setTimeout(async () => {
      setSearching(true);
      try {
        const data = await offersService.searchCatalog(effectiveMarketId, normalized, 20);
        setResults(data);
        setLookupNotice(null);
      } catch (err: any) {
        setError(err?.message || 'Não foi possível buscar produtos.');
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(handler);
  }, [effectiveMarketId, searchInput]);

  const handleTemplateChange = async (templateId: string) => {
    if (!templateId && isSuperAdminMode) {
      handleStartNewTemplate();
      return;
    }
    setSelectedTemplateId(templateId);
    await loadTemplateMeta(templateId, templates, brandKits, campaignKits);
  };

  const addProduct = (product: OfferCatalogProduct) => {
    setSelectedProducts((current) => mergeUniqueProducts(current, [product]));
    setProductPanelMode('selected');
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts((current) => current.filter((item) => item.productId !== productId));
  };

  const addProductById = async (productId?: string | null) => {
    if (!effectiveMarketId || !productId || selectedProductIds.has(productId)) return;
    try {
      const selection = await offersService.getCatalogSelection(effectiveMarketId, [productId]);
      if (selection.length) {
        setSelectedProducts((current) => mergeUniqueProducts(current, selection));
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível incluir o produto na fila.');
    }
  };


  const applyRemovedBackground = (productId: string, result: OfferBackgroundRemovalResult) => {
    if (!result.cleanedImageUrl) return;
    setSelectedProducts((current) =>
      current.map((item) => (item.productId === productId ? { ...item, imageUrl: result.cleanedImageUrl } : item)),
    );
    setResults((current) =>
      current.map((item) => (item.productId === productId ? { ...item, imageUrl: result.cleanedImageUrl } : item)),
    );
  };

  const handleCleanBackground = async (product: OfferCatalogProduct) => {
    if (!effectiveMarketId || !product.imageUrl) {
      setLookupNotice('Esse produto ainda não possui imagem para limpar.');
      return;
    }
    setRemovingBackgroundId(product.productId);
    try {
      const result = await offersService.removeBackground(effectiveMarketId, {
        productId: product.productId,
        imageUrl: product.imageUrl,
      });
      applyRemovedBackground(product.productId, result);
      setLookupNotice('Imagem tratada e pronta para uso no template.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível remover o fundo da imagem.');
    } finally {
      setRemovingBackgroundId(null);
    }
  };

  const handleBulkInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      event.stopPropagation();
    }
  };

  const handleBulkLookup = async () => {
    if (!effectiveMarketId) return;
    const terms = bulkInput.split(/\n|,|;/).map((item) => item.trim()).filter(Boolean).slice(0, 16);
    if (!terms.length) {
      setLookupNotice('Digite ao menos um produto para buscar.');
      return;
    }
    setBulkSearching(true);
    try {
      const responses = await Promise.all(terms.map((term) => offersService.searchCatalog(effectiveMarketId, term, 6)));
      const bestMatches = responses.map((items) => items[0]).filter(Boolean) as OfferCatalogProduct[];
      const resolvedMatches = mergeUniqueProducts([], bestMatches);
      setResults(resolvedMatches);
      setProductPanelMode('search');
      setResultsCollapsed(false);
      if (!resolvedMatches.length) {
        setLookupNotice('Nenhum produto foi encontrado a partir da lista colada.');
      } else if (resolvedMatches.length === terms.length) {
        setLookupNotice(`${resolvedMatches.length} produtos localizados. Revise abaixo e adicione um a um.`);
      } else {
        setLookupNotice(`${resolvedMatches.length} produtos localizados a partir de ${terms.length} linhas. Revise abaixo e adicione um a um.`);
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível processar a lista de produtos.');
    } finally {
      setBulkSearching(false);
    }
  };

  const handleAddAllResults = async () => {
    const mergedSelection = mergeUniqueProducts(selectedProducts, results);
    setSelectedProducts(mergedSelection);
    setProductPanelMode('selected');
    await refreshPreview('autofill', mergedSelection.map((product) => product.productId));
    setLookupNotice(`${results.length} produtos da busca foram incluídos na fila.`);
  };

  const handleMarketProfileField = (field: keyof OfferMarketProfile, value: string) => {
    setMarketProfile((current) => ({ ...(current || { id: 'draft' }), [field]: value }));
  };

  const handleSaveMarketProfile = async () => {
    if (!effectiveMarketId || isSuperAdminMode) return;
    setSavingMarketProfile(true);
    try {
      const saved = await offersService.updateMarketProfile(effectiveMarketId, {
        footerContent: marketProfile?.footerContent || '',
        footerLegalText: marketProfile?.footerLegalText || '',
        primaryLogoUrl: marketProfile?.primaryLogoUrl || '',
        secondaryLogoUrl: marketProfile?.secondaryLogoUrl || '',
      });
      setMarketProfile(saved);
      setLookupNotice('Perfil visual do mercado atualizado.');
      await refreshPreview('preview');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o perfil do mercado.');
    } finally {
      setSavingMarketProfile(false);
    }
  };

  const handleUploadMarketLogo = async (slot: 'PRIMARY' | 'SECONDARY', file?: File | null) => {
    if (!effectiveMarketId || !file || isSuperAdminMode) return;
    setUploadingAsset(`market-${slot.toLowerCase()}`);
    try {
      const uploaded = await offersService.uploadMarketProfileLogo(effectiveMarketId, slot, file);
      setMarketProfile((current) => ({
        ...(current || { id: 'draft' }),
        primaryLogoUrl: slot === 'PRIMARY' ? uploaded.assetUrl : current?.primaryLogoUrl || '',
        primaryLogoStorageKey: slot === 'PRIMARY' ? uploaded.storageKey || null : current?.primaryLogoStorageKey || null,
        secondaryLogoUrl: slot === 'SECONDARY' ? uploaded.assetUrl : current?.secondaryLogoUrl || '',
        secondaryLogoStorageKey: slot === 'SECONDARY' ? uploaded.storageKey || null : current?.secondaryLogoStorageKey || null,
      }));
      setLookupNotice(slot === 'PRIMARY' ? 'Logo principal enviada.' : 'Logo secundária enviada.');
      await refreshPreview('preview');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível enviar a logo.');
    } finally {
      setUploadingAsset(null);
    }
  };

  const handleUploadTemplateAsset = async (
    purpose: 'template-background' | 'template-badge' | 'template-layer-image',
    file?: File | null,
    layerId?: string,
  ) => {
    if (!isSuperAdminMode) {
      setError('O upload de assets do template fica disponível apenas no painel super admin.');
      return;
    }
    if (!effectiveMarketId || !file) return;
    const uploadToken = purpose === 'template-layer-image' && layerId ? `template-layer-image:${layerId}` : purpose;
    setUploadingAsset(uploadToken);
    try {
      const uploadPurpose = purpose === 'template-layer-image' && layerId ? `${purpose}-${layerId}` : purpose;
      const uploaded = await offersService.uploadTemplateAsset(effectiveMarketId, uploadPurpose, file);
      if (purpose === 'template-background') {
        setTemplateBuilderDraft((current) => ({
          ...current,
          backgroundMode: 'image',
          backgroundImageUrl: uploaded.assetUrl,
          backgroundImageStorageKey: uploaded.storageKey || '',
        }));
      } else if (purpose === 'template-badge') {
        setTemplateBuilderDraft((current) => ({
          ...current,
          badge: {
            ...current.badge,
            imageUrl: uploaded.assetUrl,
            storageKey: uploaded.storageKey || '',
            visible: true,
          },
        }));
      } else if (layerId) {
        setTemplateBuilderDraft((current) => ({
          ...current,
          customLayers: current.customLayers.map((layer) =>
            layer.id === layerId
              ? {
                  ...layer,
                  imageUrl: uploaded.assetUrl,
                  storageKey: uploaded.storageKey || '',
                  visible: true,
                }
              : layer,
          ),
        }));
      }
      setLookupNotice(
        purpose === 'template-background'
          ? 'Imagem de fundo enviada.'
          : purpose === 'template-badge'
            ? 'PNG do selo enviado.'
            : 'Imagem da camada enviada.',
      );
    } catch (err: any) {
      setError(err?.message || 'Não foi possível enviar o asset.');
    } finally {
      setUploadingAsset(null);
    }
  };


  const persistSelectedVariantDimensions = async (canvasWidth: number, canvasHeight: number) => {
    if (!effectiveMarketId || !selectedVariant) return;
    const variantJson = parseJson<JsonMap>(selectedVariant.variantJson, {}) || {};
    await offersService.updateTemplateVariant(effectiveMarketId, selectedVariant.id, {
      variantKey: selectedVariant.variantKey,
      name: selectedVariant.name,
      canvasWidth,
      canvasHeight,
      variantJson: JSON.stringify({
        ...variantJson,
        variantKey: selectedVariant.variantKey,
        name: selectedVariant.name,
        canvasWidth,
        canvasHeight,
      }),
      previewImageUrl: selectedVariant.previewImageUrl || undefined,
      active: selectedVariant.active,
    });
  };

  const handleSaveTemplateBuilder = async () => {
    if (!isSuperAdminMode) {
      setError('A edição de templates fica disponível apenas no painel super admin.');
      return;
    }
    if (!effectiveMarketId || !selectedTemplateId || !selectedTemplate) return;
    const nextDesign = buildTemplateDesignFromDraft(templateBuilderDraft);
    const canvasWidth = clampNumber(templateBuilderDraft.canvasWidth, selectedTemplate.canvasWidth || 1080, 720, 3200);
    const canvasHeight = clampNumber(templateBuilderDraft.canvasHeight, selectedTemplate.canvasHeight || 1350, 720, 4800);

    setSaving(true);
    try {
      const updated = await offersService.updateTemplate(effectiveMarketId, selectedTemplateId, {
        name: templateBuilderDraft.name.trim() || selectedTemplate.name,
        description: templateBuilderDraft.description.trim() || '',
        channel: templateBuilderDraft.channel || selectedTemplate.channel,
        canvasWidth,
        canvasHeight,
        schemaVersion: 2,
        masterTemplateKey: selectedTemplate.masterTemplateKey || '',
        defaultVariantKey: selectedTemplate.defaultVariantKey || selectedVariantKey || '',
        brandKitId: selectedBrandKitId || selectedTemplate.brandKitId || null,
        campaignKitId: selectedCampaignKitId || selectedTemplate.campaignKitId || null,
        designJson: JSON.stringify(nextDesign),
        active: selectedTemplate.active,
      });
      await persistSelectedVariantDimensions(canvasWidth, canvasHeight);
      const nextTemplates = templates.map((item) => (item.id === updated.id ? updated : item));
      setTemplates(nextTemplates);
      setTemplateBuilderDraft(
        buildTemplateBuilderDraft(
          updated,
          selectedVariant ? { ...selectedVariant, canvasWidth, canvasHeight } : selectedVariant,
        ),
      );
      setLookupNotice('Template atualizado com fundo, selo, logos e área de conteúdo.');
      await loadTemplateMeta(updated.id, nextTemplates, brandKits, campaignKits);
      await refreshPreview('preview');
    } catch (err: any) {
      setError(err?.message || 'NÃ£o foi possÃ­vel salvar a composiÃ§Ã£o do template.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStructure = async () => {
    if (!isSuperAdminMode) {
      setError('A edição de templates fica disponível apenas no painel super admin.');
      return;
    }
    if (!effectiveMarketId || !selectedTemplateId || !selectedTemplate) return;
    const parsedDesign = buildTemplateDesignFromDraft(templateBuilderDraft);
    const activeLayerId = String(activeLayer?.id || '');
    const activeZoneId = String(activeZone?.id || '');
    const nextDesign: JsonMap = {
      ...parsedDesign,
      layers: asList(parsedDesign.layers).map((layer) => {
        const layerId = String(layer.id || '');
        if (layerId !== activeLayerId) {
          return layer;
        }

        return {
          ...layer,
          name: layerDraft.name || layer.name || layer.id,
          binding: layerDraft.binding || undefined,
          locked: layerDraft.locked,
          visible: layerDraft.visible,
          props: buildLayerPropsFromInspectorDraft(layer, layerDraft, Boolean(activeCustomLayer && layerId === activeCustomLayer.id)),
          bounds: {
            ...asMap(layer.bounds),
            x: Number(layerDraft.x || 0),
            y: Number(layerDraft.y || 0),
            w: Number(layerDraft.w || 0),
            h: Number(layerDraft.h || 0),
          },
        };
      }),
      productZones: asList(parsedDesign.productZones).map((zone) => {
        if (String(zone.id || '') !== activeZoneId) {
          return zone;
        }

        return {
          ...zone,
          name: zoneDraft.name || zone.name || zone.id,
          layout: zoneDraft.layout || zone.layout || 'grid',
          slotCount: Number(zoneDraft.slotCount || 1),
          columns: Number(zoneDraft.columns || 1),
          rows: Number(zoneDraft.rows || 1),
          bounds: {
            ...asMap(zone.bounds),
            x: Number(zoneDraft.x || 0),
            y: Number(zoneDraft.y || 0),
            w: Number(zoneDraft.w || 0),
            h: Number(zoneDraft.h || 0),
          },
        };
      }),
    };

    setSaving(true);
    try {
      const updated = await offersService.updateTemplate(effectiveMarketId, selectedTemplateId, {
        name: templateBuilderDraft.name.trim() || selectedTemplate.name,
        description: templateBuilderDraft.description.trim() || selectedTemplate.description || '',
        channel: templateBuilderDraft.channel || selectedTemplate.channel,
        canvasWidth: clampNumber(templateBuilderDraft.canvasWidth, selectedTemplate.canvasWidth || 1080, 720, 3200),
        canvasHeight: clampNumber(templateBuilderDraft.canvasHeight, selectedTemplate.canvasHeight || 1350, 720, 4800),
        schemaVersion: 2,
        masterTemplateKey: selectedTemplate.masterTemplateKey || '',
        defaultVariantKey: selectedTemplate.defaultVariantKey || selectedVariantKey || '',
        brandKitId: selectedTemplate.brandKitId || selectedBrandKitId || null,
        campaignKitId: selectedTemplate.campaignKitId || selectedCampaignKitId || null,
        designJson: JSON.stringify(nextDesign),
        active: selectedTemplate.active,
      });
      await persistSelectedVariantDimensions(
        clampNumber(templateBuilderDraft.canvasWidth, selectedTemplate.canvasWidth || updated.canvasWidth, 720, 3200),
        clampNumber(templateBuilderDraft.canvasHeight, selectedTemplate.canvasHeight || updated.canvasHeight, 720, 4800),
      );
      const nextTemplates = templates.map((item) => (item.id === updated.id ? updated : item));
      setTemplates(nextTemplates);
      setTemplateBuilderDraft(
        buildTemplateBuilderDraft(
          updated,
          selectedVariant
            ? {
                ...selectedVariant,
                canvasWidth: clampNumber(templateBuilderDraft.canvasWidth, selectedVariant.canvasWidth || updated.canvasWidth, 720, 3200),
                canvasHeight: clampNumber(templateBuilderDraft.canvasHeight, selectedVariant.canvasHeight || updated.canvasHeight, 720, 4800),
              }
            : selectedVariant,
        ),
      );
      setLookupNotice('Estrutura do template atualizada.');
      await loadTemplateMeta(updated.id, nextTemplates, brandKits, campaignKits);
      await refreshPreview('preview');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar a estrutura do template.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTemplateFromCurrent = async () => {
    if (!isSuperAdminMode) {
      setError('A criação de templates fica disponível apenas no painel super admin.');
      return;
    }
    if (!effectiveMarketId) {
      setError('Selecione uma conta antes de salvar um template.');
      return;
    }

    const baseTemplate = selectedTemplate;
    const nextDesign = buildTemplateDesignFromDraft(templateBuilderDraft);
    const canvasWidth = clampNumber(templateBuilderDraft.canvasWidth, baseTemplate?.canvasWidth || selectedVariant?.canvasWidth || 1080, 720, 3200);
    const canvasHeight = clampNumber(templateBuilderDraft.canvasHeight, baseTemplate?.canvasHeight || selectedVariant?.canvasHeight || 1350, 720, 4800);

    setSaving(true);
    try {
      const createdTemplate = await offersService.createTemplate(effectiveMarketId, {
        name: templateBuilderDraft.name.trim() || baseTemplate?.name || 'Novo template',
        description: templateBuilderDraft.description.trim() || baseTemplate?.description || 'Template criado no estudio visual.',
        channel: templateBuilderDraft.channel || baseTemplate?.channel || 'PRINT',
        canvasWidth,
        canvasHeight,
        schemaVersion: 2,
        masterTemplateKey: baseTemplate?.masterTemplateKey || '',
        defaultVariantKey: selectedVariantKey || baseTemplate?.defaultVariantKey || '',
        brandKitId: selectedBrandKitId || baseTemplate?.brandKitId || null,
        campaignKitId: selectedCampaignKitId || baseTemplate?.campaignKitId || null,
        designJson: JSON.stringify(nextDesign),
        active: true,
      });

      const persistedTemplate = await offersService.getTemplate(effectiveMarketId, createdTemplate.id);
      const nextTemplates = [persistedTemplate, ...templates.filter((item) => item.id !== persistedTemplate.id)];
      setTemplates(nextTemplates);
      setSelectedTemplateId(persistedTemplate.id);
      setTemplateBuilderDraft(
        buildTemplateBuilderDraft(
          persistedTemplate,
          selectedVariant ? { ...selectedVariant, canvasWidth, canvasHeight } : selectedVariant,
        ),
      );
      await loadTemplateMeta(persistedTemplate.id, nextTemplates, brandKits, campaignKits);
      setLookupNotice('Template salvo e liberado para a conta selecionada.');
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel salvar o template.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCampaign = async () => {
    if (!effectiveMarketId || !selectedTemplateId || selectedProducts.length === 0) {
      setError('Escolha um modelo e pelo menos um produto antes de salvar a campanha.');
      return;
    }
    const payload: OfferCreateJobPayload = {
      templateId: selectedTemplateId,
      name: jobName.trim() || undefined,
      outputType,
      generationMode,
      variantKey: selectedVariantKey || undefined,
      publishTargetsJson: JSON.stringify(publishTargets),
      renderOptionsJson: JSON.stringify(buildRenderOptionsPayload()),
      productIds: selectedProducts.map((product) => product.productId),
    };
    setSaving(true);
    try {
      const persistedJob = activeJobId
        ? await offersService.updateJob(effectiveMarketId, activeJobId, payload)
        : await offersService.createJob(effectiveMarketId, payload);
      setActiveJobId(persistedJob.id);
      setLookupNotice(activeJobId ? 'Campanha atualizada.' : 'Campanha salva.');
      if (!activeJobId) {
        navigate(buildDesignerRoute(persistedJob.id), { replace: true });
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar a campanha.');
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

  const togglePublishTarget = (target: string) => {
    setPublishTargets((current) => {
      if (current.includes(target)) {
        const next = current.filter((item) => item !== target);
        return next.length ? next : ['DOWNLOAD'];
      }
      return [...current, target];
    });
  };

  const openStudioSheet = (nextSheet: 'campaigns' | 'media') => {
    navigate(buildStudioRoute({ sheet: nextSheet }));
  };

  const closeStudioSheet = () => {
    navigate(buildStudioRoute({ sheet: null }));
  };

  const handleEditSavedCampaign = (job: OfferGenerationJob) => {
    setActiveTool('products');
    navigate(buildDesignerRoute(job.id));
  };

  const reloadJobs = async () => {
    if (!effectiveMarketId) {
      return;
    }

    try {
      const data = await offersService.getJobs(effectiveMarketId);
      setJobs(data);
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel atualizar campanhas e midias.');
    }
  };

  const handlePublishCurrentCampaign = async () => {
    if (!effectiveMarketId) {
      return;
    }

    if (!activeJobId) {
      setActiveTool('leaflet');
      setError('Salve a campanha antes de publicar nos canais.');
      return;
    }

    setSaving(true);
    try {
      await offersService.publishJob(effectiveMarketId, activeJobId, {
        variantKeys: [selectedVariantKey || 'default'],
        outputTypes: [outputType || 'PNG'],
        publishTargets,
        renderOptionsJson: JSON.stringify(buildRenderOptionsPayload()),
      });
      await reloadJobs();
      openStudioSheet('media');
      setLookupNotice('Campanha enviada para geracao e publicacao.');
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel publicar a campanha atual.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishSavedCampaign = async (job: OfferGenerationJob) => {
    if (!effectiveMarketId) {
      return;
    }

    setSaving(true);
    try {
      await offersService.publishJob(effectiveMarketId, job.id, {
        variantKeys: [job.variantKey || 'default'],
        outputTypes: [job.outputType || 'PNG'],
        publishTargets: parseStringList(job.publishTargetsJson, ['DOWNLOAD']),
        renderOptionsJson: job.renderOptionsJson || undefined,
      });
      await reloadJobs();
      setLookupNotice('Campanha enviada para geracao e publicacao.');
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel publicar a campanha.');
    } finally {
      setSaving(false);
    }
  };

  const handleCloneSavedCampaign = async (job: OfferGenerationJob) => {
    if (!effectiveMarketId) {
      return;
    }

    setSaving(true);
    try {
      const cloned = await offersService.cloneJob(effectiveMarketId, job.id);
      await reloadJobs();
      setLookupNotice('Campanha clonada.');
      navigate(buildDesignerRoute(cloned.id));
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel clonar a campanha.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSavedCampaign = async (job: OfferGenerationJob) => {
    if (!effectiveMarketId) {
      return;
    }

    setSaving(true);
    try {
      await offersService.deleteJob(effectiveMarketId, job.id);
      await reloadJobs();
      if (activeJobId === job.id) {
        setActiveJobId('');
        navigate(buildStudioRoute({ jobId: null, sheet: 'campaigns' }), { replace: true });
      }
      setLookupNotice('Campanha removida.');
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel remover a campanha.');
    } finally {
      setSaving(false);
    }
  };

  return {
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
  };
};
