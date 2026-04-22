import {
  BoxSelect,
  CalendarDays,
  Factory,
  FileText,
  ImageIcon,
  LayoutTemplate,
  Layers3,
  PackageSearch,
  Palette,
  QrCode,
  SendHorizontal,
  Square,
  Tag,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type {
  OfferBrandKit,
  OfferCampaignKit,
  OfferCatalogProduct,
  OfferMarketProfile,
  OfferTemplate,
  OfferTemplatePreview,
  OfferTemplateVariant,
} from '../../types/offers.types';

export type JsonMap = Record<string, any>;

export const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export const compactCategory = (value?: string | null) => (!value ? 'Sem categoria' : value.length > 72 ? `${value.slice(0, 69)}...` : value);

export const parseJson = <T,>(value?: string | null, fallback?: T): T | undefined => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const asMap = (value: unknown): JsonMap => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonMap;
};

export const asList = (value: unknown): JsonMap[] => (Array.isArray(value) ? value.map(asMap) : []);

export const layerTypeIcon = (type?: string): LucideIcon => {
  switch (String(type || '').toLowerCase()) {
    case 'background':
      return Palette;
    case 'brandlogo':
    case 'logo':
      return Factory;
    case 'campaignbadge':
    case 'badge':
      return Tag;
    case 'text':
    case 'headline':
    case 'subheadline':
      return Type;
    case 'qrcode':
      return QrCode;
    case 'shape':
      return Square;
    case 'image':
      return ImageIcon;
    case 'productzone':
      return BoxSelect;
    default:
      return Layers3;
  }
};

export const TOOL_OPTIONS = [
  { key: 'products', icon: PackageSearch, label: 'Produtos' },
  { key: 'themes', icon: LayoutTemplate, label: 'Modelo' },
  { key: 'dates', icon: CalendarDays, label: 'Campanha' },
  { key: 'brand', icon: Factory, label: 'Sua marca' },
  { key: 'fonts', icon: Type, label: 'Textos' },
  { key: 'publish', icon: SendHorizontal, label: 'Publicar' },
  { key: 'leaflet', icon: FileText, label: 'Formato' },
  { key: 'portal', icon: QrCode, label: 'QR Code' },
] as const;

export type StudioTool = (typeof TOOL_OPTIONS)[number]['key'] | 'builder';
export type ProductPanelMode = 'search' | 'selected';
export type LayerDraft = {
  type: string;
  name: string;
  binding: string;
  x: string;
  y: string;
  w: string;
  h: string;
  locked: boolean;
  visible: boolean;
  content: string;
  imageUrl: string;
  imageStorageKey: string;
  background: string;
  textColor: string;
  borderColor: string;
  borderWidth: string;
  radius: string;
  fontSize: string;
  fontWeight: string;
  frame: boolean;
  fit: string;
};
export type ZoneDraft = {
  name: string;
  layout: string;
  slotCount: string;
  columns: string;
  rows: string;
  x: string;
  y: string;
  w: string;
  h: string;
};

export type TemplateBuilderBoundsDraft = {
  x: string;
  y: string;
  w: string;
  h: string;
};

export type TemplateBuilderTextLayerDraft = TemplateBuilderBoundsDraft & {
  text: string;
  visible: boolean;
  fontSize: string;
  fontWeight: string;
};

export type TemplateBuilderImageLayerDraft = TemplateBuilderBoundsDraft & {
  imageUrl: string;
  storageKey: string;
  visible: boolean;
  radius: string;
  frame: boolean;
};

export type TemplateBuilderBoxLayerDraft = TemplateBuilderBoundsDraft & {
  visible: boolean;
  radius: string;
  background: string;
  textColor?: string;
  fontSize: string;
};

export type TemplateBuilderCardDraft = {
  background: string;
  borderColor: string;
  textColor: string;
  cardRadius: string;
  priceLayout: string;
  priceBoxBackground: string;
  priceBoxTextColor: string;
  priceLabel: string;
  priceBoxRadius: string;
  priceBorderColor: string;
  priceBorderWidth: string;
  priceBorderStyle: string;
  pricePaddingX: string;
  pricePaddingY: string;
  priceGap: string;
  priceLabelBackground: string;
  priceLabelTextColor: string;
  priceLabelBorderColor: string;
  priceLabelRadius: string;
  priceLabelSize: string;
  priceLabelFontSize: string;
  priceValueColor: string;
  priceFractionColor: string;
  priceFractionFontSize: string;
  priceUnitColor: string;
  priceUnitFontSize: string;
  priceUnitLayout: string;
  priceBaselineColor: string;
  priceBaselineFontSize: string;
  nameFontSize: string;
  descriptionFontSize: string;
  priceFontSize: string;
  showUnit: boolean;
  showDescription: boolean;
  showBaselinePrice: boolean;
};

export type TemplateBuilderCustomLayerType = 'text' | 'image' | 'shape' | 'tag' | 'qrcode';

export type TemplateBuilderCustomLayerDraft = TemplateBuilderBoundsDraft & {
  id: string;
  name: string;
  type: TemplateBuilderCustomLayerType;
  binding: string;
  visible: boolean;
  content: string;
  imageUrl: string;
  storageKey: string;
  background: string;
  textColor: string;
  borderColor: string;
  borderWidth: string;
  radius: string;
  fontSize: string;
  fontWeight: string;
  fit: string;
  frame: boolean;
};

export type TemplateBuilderZoneDraft = TemplateBuilderBoundsDraft & {
  layout: string;
  columns: string;
  rows: string;
  slotCount: string;
};

export type TemplateBuilderDraft = {
  name: string;
  description: string;
  channel: string;
  canvasWidth: string;
  canvasHeight: string;
  backgroundMode: string;
  backgroundColor: string;
  backgroundStart: string;
  backgroundEnd: string;
  backgroundImageUrl: string;
  backgroundImageStorageKey: string;
  kicker: TemplateBuilderTextLayerDraft;
  headline: TemplateBuilderTextLayerDraft;
  subheadline: TemplateBuilderTextLayerDraft;
  badge: TemplateBuilderImageLayerDraft;
  footer: TemplateBuilderBoxLayerDraft;
  footerContent: TemplateBuilderTextLayerDraft;
  footerLegal: TemplateBuilderTextLayerDraft;
  footerLeftLogo: TemplateBuilderImageLayerDraft;
  footerRightLogo: TemplateBuilderImageLayerDraft;
  contentZone: TemplateBuilderZoneDraft;
  card: TemplateBuilderCardDraft;
  layerOrder: string[];
  layerLocks: Record<string, boolean>;
  customLayers: TemplateBuilderCustomLayerDraft[];
};

export type CanvasEditableTarget = string;

export type CanvasEditInteraction = {
  target: CanvasEditableTarget;
  mode: 'move' | 'resize';
  anchorX: number;
  anchorY: number;
  startBounds: { x: number; y: number; w: number; h: number };
};

export type SuperAdminMarketOption = {
  id: string;
  name: string;
  planType?: string | null;
  billingStatus?: string | null;
  isActive?: boolean | null;
};

export type PaginatedResponse<T> = {
  content: T[];
};

export const GRID_PRESET_OPTIONS = [
  { value: 'AUTO', label: 'Automático' },
  { value: '1x1', label: '1 produto · 1x1' },
  { value: '2x2', label: '4 produtos · 2x2' },
  { value: '3x2', label: '6 produtos · 3x2' },
  { value: '3x3', label: '9 produtos · 3x3' },
] as const;

export const QROFERTAS_GRID_PRESET_OPTIONS = [
  { value: 'AUTO', label: 'Automatico' },
  { value: 'COUNT:1', label: '1 produto - 1x1' },
  { value: 'COUNT:2', label: '2 produtos - 2x1' },
  { value: 'COUNT:3', label: '3 produtos - 3x1' },
  { value: 'COUNT:4', label: '4 produtos - 2x2' },
  { value: 'COUNT:5', label: '5 produtos - destaque lateral' },
  { value: 'COUNT:6', label: '6 produtos - 3x2' },
  { value: 'COUNT:8', label: '8 produtos - 4x2' },
  { value: 'COUNT:9', label: '9 produtos - 3x3' },
  { value: 'COUNT:10', label: '10 produtos - grade expandida' },
  { value: 'COUNT:12', label: '12 produtos - 4x3' },
  { value: 'COUNT:14', label: '14 produtos - encarte com destaque' },
  { value: 'COUNT:18', label: '18 produtos - tabloide extenso' },
  { value: 'COUNT:20', label: '20 produtos - tabela' },
] as const;

export const PRODUCT_BOX_OPTIONS = [
  { value: 'SMART', label: 'Inteligente' },
  { value: 'COMPACT', label: 'Compacto' },
  { value: 'FEATURED', label: 'Com destaque' },
] as const;

export const TEXT_MODE_OPTIONS = [
  { value: 'SHORT', label: 'Texto curto' },
  { value: 'MEDIUM', label: 'Texto médio' },
  { value: 'LONG', label: 'Texto longo' },
] as const;

export const COLOR_MODE_OPTIONS = [
  { value: 'SMART', label: 'Inteligente' },
  { value: 'WARM', label: 'Quente' },
  { value: 'NEUTRAL', label: 'Neutro' },
] as const;

export const FOOTER_OPTIONS = [
  { value: 'ROUND', label: 'Redondo grande' },
  { value: 'SLIM', label: 'Faixa compacta' },
  { value: 'NONE', label: 'Sem rodapé' },
] as const;

export const ZOOM_PRESET_VALUES = [30, 40, 50, 60, 70, 80, 90, 100] as const;
export const MIN_STAGE_ZOOM = 0.01;
export const MAX_STAGE_ZOOM = 4;

export const QUALITY_OPTIONS = [
  { value: 'high', label: 'Alta qualidade' },
  { value: 'balanced', label: 'Equilibrado' },
  { value: 'draft', label: 'Rascunho' },
] as const;

export const PUBLISH_TARGET_OPTIONS = [
  { value: 'DOWNLOAD', label: 'Download' },
  { value: 'PORTAL', label: 'Portal' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'TV', label: 'TV da loja' },
] as const;

export const STUDIO_PUBLISH_TARGET_OPTIONS = [
  ...PUBLISH_TARGET_OPTIONS,
  { value: 'FACEBOOK', label: 'Facebook' },
] as const;

export const gridPresetToCount = (value: string) => (value === '1x1' ? 1 : value === '2x2' ? 4 : value === '3x2' ? 6 : value === '3x3' ? 9 : 6);
export const resolveGridPresetCount = (value: string) => {
  const explicitCount = /^COUNT:(\d+)$/i.exec(value || '');
  if (explicitCount) {
    return Math.max(Number(explicitCount[1]) || 1, 1);
  }

  return gridPresetToCount(value);
};
export const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const clampZoomScale = (value: number) => {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(Math.max(value, MIN_STAGE_ZOOM), MAX_STAGE_ZOOM);
};

export const zoomToScale = (value: string, fallback = 1) => {
  if (value === 'AUTO') {
    return clampZoomScale(fallback);
  }

  return clampZoomScale((Number(value) || Math.round(fallback * 100)) / 100);
};

export const scaleToZoomValue = (value: number) => String(Math.round(clampZoomScale(value) * 100));

export const formatZoomLabel = (value: number) => `${Math.round(clampZoomScale(value) * 100)}%`;

export const resolveStepZoomScale = (currentScale: number, direction: 'in' | 'out') => {
  const current = clampZoomScale(currentScale);
  const presets = ZOOM_PRESET_VALUES.map((value) => value / 100);

  if (direction === 'in') {
    return presets.find((value) => value > current + 0.001) ?? MAX_STAGE_ZOOM;
  }

  return [...presets].reverse().find((value) => value < current - 0.001) ?? MIN_STAGE_ZOOM;
};

export const footerPreviewLabel = (value: string) =>
  value === 'SLIM'
    ? 'Ofertas válidas enquanto durarem os estoques'
    : value === 'NONE'
      ? null
      : 'Ofertas válidas por tempo limitado · Imagens meramente ilustrativas';

export const mergeUniqueProducts = (base: OfferCatalogProduct[], incoming: OfferCatalogProduct[]) => {
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

export const normalizeSelection = <T extends { id: string }>(items: T[], currentId?: string | null, fallbackId?: string | null) => {
  if (currentId && items.some((item) => item.id === currentId)) return currentId;
  if (fallbackId && items.some((item) => item.id === fallbackId)) return fallbackId;
  return items[0]?.id || '';
};

export const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.min(Math.max(Math.round(numeric), min), max);
  }
  return fallback;
};

export const asText = (value: unknown, fallback = '') => {
  if (value == null) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
};

export const normalizeHexColor = (value: string, fallback = '#ffffff') => {
  const normalized = String(value || '').trim();

  if (HEX_COLOR_PATTERN.test(normalized)) {
    if (normalized.length === 4) {
      const [, r, g, b] = normalized;
      return `#${r}${r}${g}${g}${b}${b}`;
    }

    return normalized.toLowerCase();
  }

  return fallback;
};

export const getByPath = (source: JsonMap, path?: string) => {
  if (!path) return undefined;
  return path.split('.').reduce<any>((current, segment) => {
    if (current == null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      return current[Number(segment)];
    }
    if (typeof current !== 'object') return undefined;
    return (current as JsonMap)[segment];
  }, source);
};

export const boundsDraft = (x: number, y: number, w: number, h: number): TemplateBuilderBoundsDraft => ({
  x: String(Math.round(x)),
  y: String(Math.round(y)),
  w: String(Math.round(w)),
  h: String(Math.round(h)),
});

export const parseBoundsDraft = (value: TemplateBuilderBoundsDraft, fallback: { x: number; y: number; w: number; h: number }) => ({
  x: clampNumber(value.x, fallback.x, 0, 4000),
  y: clampNumber(value.y, fallback.y, 0, 6000),
  w: clampNumber(value.w, fallback.w, 1, 4000),
  h: clampNumber(value.h, fallback.h, 1, 6000),
});

export const parseLayerBoundsDraft = (layer: JsonMap | null, fallback: { x: number; y: number; w: number; h: number }) =>
  boundsDraft(
    clampNumber(layer?.bounds?.x, fallback.x, 0, 4000),
    clampNumber(layer?.bounds?.y, fallback.y, 0, 6000),
    clampNumber(layer?.bounds?.w, fallback.w, 1, 4000),
    clampNumber(layer?.bounds?.h, fallback.h, 1, 6000),
  );

export const resolveStaticBinding = (binding: unknown, staticBindings: JsonMap, fallback = '') => {
  const normalized = asText(binding);
  if (!normalized) return fallback;
  if (!normalized.startsWith('static.')) return normalized;
  const value = getByPath({ static: staticBindings }, normalized);
  return value == null ? fallback : String(value);
};

export const findLayer = (layers: JsonMap[], ids: string[], types: string[] = []) =>
  layers.find((layer) => {
    const id = String(layer.id || '').toLowerCase();
    const type = String(layer.type || '').toLowerCase();
    const binding = String(layer.binding || '').toLowerCase();
    return (
      ids.some((candidate) => id === candidate || id.includes(candidate)) ||
      types.includes(type) ||
      ids.some((candidate) => binding.includes(candidate))
    );
  }) || null;

export const TEMPLATE_BUILDER_LAYER_IDS = [
  'kicker',
  'headline',
  'subheadline',
  'campaign-badge',
  'footer',
  'footer-content',
  'footer-legal',
  'footer-logo-left',
  'footer-logo-right',
] as const;
export const TEMPLATE_BUILDER_LAYER_ID_SET = new Set<string>(TEMPLATE_BUILDER_LAYER_IDS);
export const CUSTOM_LAYER_TYPE_OPTIONS: Array<{ value: TemplateBuilderCustomLayerType; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'shape', label: 'Forma' },
  { value: 'image', label: 'Imagem' },
  { value: 'tag', label: 'Faixa' },
  { value: 'qrcode', label: 'QR code' },
];

export const BUILTIN_LAYER_LABELS: Record<string, string> = {
  kicker: 'Kicker',
  headline: 'Titulo principal',
  subheadline: 'Subtitulo',
  'campaign-badge': 'Selo 3D',
  footer: 'Rodape',
  'footer-content': 'Conteudo principal do rodape',
  'footer-legal': 'Aviso legal do rodape',
  'footer-logo-left': 'Logo rodape esquerdo',
  'footer-logo-right': 'Logo rodape direito',
};

export type CanvasEditableMeta = {
  label: string;
  selectionKind: 'layer' | 'zone';
  selectionId: string;
  minWidth: number;
  minHeight: number;
  accent: string;
  overlayLevel: number;
};

export const BUILTIN_CANVAS_EDITABLE_META: Record<string, CanvasEditableMeta> = {
  kicker: { label: 'Kicker', selectionKind: 'layer', selectionId: 'kicker', minWidth: 140, minHeight: 32, accent: '#b6642b', overlayLevel: 5 },
  headline: { label: 'Titulo principal', selectionKind: 'layer', selectionId: 'headline', minWidth: 220, minHeight: 72, accent: '#d56d1c', overlayLevel: 5 },
  subheadline: { label: 'Subtitulo', selectionKind: 'layer', selectionId: 'subheadline', minWidth: 220, minHeight: 52, accent: '#c18651', overlayLevel: 5 },
  'campaign-badge': { label: 'Selo 3D', selectionKind: 'layer', selectionId: 'campaign-badge', minWidth: 96, minHeight: 96, accent: '#059669', overlayLevel: 6 },
  footer: { label: 'Rodape', selectionKind: 'layer', selectionId: 'footer', minWidth: 260, minHeight: 48, accent: '#4f2a16', overlayLevel: 2 },
  'footer-content': { label: 'Conteudo principal', selectionKind: 'layer', selectionId: 'footer-content', minWidth: 180, minHeight: 32, accent: '#6d3d20', overlayLevel: 4 },
  'footer-legal': { label: 'Aviso legal', selectionKind: 'layer', selectionId: 'footer-legal', minWidth: 160, minHeight: 28, accent: '#946348', overlayLevel: 4 },
  'footer-logo-left': { label: 'Logo primaria', selectionKind: 'layer', selectionId: 'footer-logo-left', minWidth: 84, minHeight: 42, accent: '#8f4618', overlayLevel: 4 },
  'footer-logo-right': { label: 'Logo secundaria', selectionKind: 'layer', selectionId: 'footer-logo-right', minWidth: 84, minHeight: 42, accent: '#b55e24', overlayLevel: 4 },
  'content-zone': { label: 'Area de conteudo', selectionKind: 'zone', selectionId: 'content-zone', minWidth: 240, minHeight: 180, accent: '#f0a15c', overlayLevel: 1 },
};

export const customLayerTypeLabel = (type: TemplateBuilderCustomLayerType) => {
  switch (type) {
    case 'text':
      return 'Texto';
    case 'shape':
      return 'Forma';
    case 'image':
      return 'Imagem';
    case 'tag':
      return 'Faixa';
    case 'qrcode':
      return 'QR code';
    default:
      return 'Camada';
  }
};

export const createDefaultLayerLocks = () =>
  Object.fromEntries(TEMPLATE_BUILDER_LAYER_IDS.map((layerId) => [layerId, true])) as Record<string, boolean>;

export const sanitizeLayerOrder = (order: string[] | undefined, availableIds: string[], appendMissing = false) => {
  const available = new Set(availableIds);
  const normalized = (order || []).filter((layerId, index, items) => available.has(layerId) && items.indexOf(layerId) === index);
  if (!normalized.length) {
    return [...availableIds];
  }
  return appendMissing ? [...normalized, ...availableIds.filter((layerId) => !normalized.includes(layerId))] : normalized;
};

export const reorderLayerOrder = (order: string[], sourceId: string, targetId: string) => {
  if (!sourceId || !targetId || sourceId === targetId) {
    return order;
  }

  const currentOrder = [...order];
  const sourceIndex = currentOrder.indexOf(sourceId);
  const targetIndex = currentOrder.indexOf(targetId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return currentOrder;
  }

  const [sourceLayerId] = currentOrder.splice(sourceIndex, 1);
  currentOrder.splice(targetIndex, 0, sourceLayerId);
  return currentOrder;
};

export const editableTargetFromLayerId = (layerId: string): CanvasEditableTarget | null => {
  return layerId || null;
};

export const editableTargetFromZoneId = (zoneId: string): CanvasEditableTarget | null => {
  return zoneId || null;
};

export const createCustomLayerDraft = (
  type: TemplateBuilderCustomLayerType,
  existingIds: string[],
  canvasWidth: number,
  canvasHeight: number,
): TemplateBuilderCustomLayerDraft => {
  let nextIndex = existingIds.filter((id) => id.startsWith(`custom-${type}-`)).length + 1;
  let nextId = `custom-${type}-${nextIndex}`;
  while (existingIds.includes(nextId)) {
    nextIndex += 1;
    nextId = `custom-${type}-${nextIndex}`;
  }

  const defaults =
    type === 'text'
      ? { x: 96, y: 96, w: Math.round(canvasWidth * 0.34), h: 88, background: 'transparent', textColor: '#1f1613', radius: '0', fontSize: '42', fontWeight: '700', content: 'Novo texto' }
      : type === 'shape'
        ? { x: 96, y: 96, w: Math.round(canvasWidth * 0.28), h: 140, background: '#ffede0', textColor: '#1f1613', radius: '28', fontSize: '18', fontWeight: '600', content: '' }
        : type === 'image'
          ? { x: 96, y: 96, w: Math.round(canvasWidth * 0.24), h: Math.round(canvasHeight * 0.18), background: 'rgba(255,255,255,0.88)', textColor: '#1f1613', radius: '24', fontSize: '18', fontWeight: '600', content: '' }
          : type === 'tag'
            ? { x: 96, y: 96, w: 220, h: 48, background: '#ffffff', textColor: '#7b4318', radius: '999', fontSize: '22', fontWeight: '700', content: 'Nova faixa' }
            : { x: 96, y: 96, w: 120, h: 120, background: '#ffffff', textColor: '#6c5443', radius: '22', fontSize: '18', fontWeight: '700', content: 'QR do produto' };

  return {
    id: nextId,
    name: `${customLayerTypeLabel(type)} ${nextIndex}`,
    type,
    binding: '',
    visible: true,
    content: defaults.content,
    imageUrl: '',
    storageKey: '',
    background: defaults.background,
    textColor: defaults.textColor,
    borderColor: '#ead9ca',
    borderWidth: type === 'shape' ? '1' : '0',
    radius: defaults.radius,
    fontSize: defaults.fontSize,
    fontWeight: defaults.fontWeight,
    fit: type === 'image' ? 'contain' : 'contain',
    frame: type === 'image',
    ...boundsDraft(defaults.x, defaults.y, defaults.w, defaults.h),
  };
};

export const parseCustomLayerDraft = (layer: JsonMap, staticBindings: JsonMap): TemplateBuilderCustomLayerDraft => {
  const layerId = String(layer.id || `custom-${String(layer.type || 'layer').toLowerCase()}`);
  const layerTypeValue = String(layer.type || 'text').toLowerCase();
  const layerType: TemplateBuilderCustomLayerType =
    layerTypeValue === 'image' ? 'image' : layerTypeValue === 'shape' ? 'shape' : layerTypeValue === 'tag' || layerTypeValue === 'badge' ? 'tag' : layerTypeValue === 'qrcode' ? 'qrcode' : 'text';
  const props = asMap(layer.props);
  return {
    id: layerId,
    name: asText(layer.name, customLayerTypeLabel(layerType)),
    type: layerType,
    binding: asText(layer.binding),
    visible: layer.visible !== false,
    content: asText(props.content, layerType === 'text' || layerType === 'tag' || layerType === 'qrcode' ? resolveStaticBinding(layer.binding, staticBindings, '') : ''),
    imageUrl: asText(props.imageUrl, layerType === 'image' ? resolveStaticBinding(layer.binding, staticBindings, '') : ''),
    storageKey: asText(props.storageKey),
    background: asText(props.background, layerType === 'shape' ? '#ffede0' : layerType === 'image' ? 'rgba(255,255,255,0.88)' : layerType === 'tag' ? '#ffffff' : 'transparent'),
    textColor: asText(props.textColor, layerType === 'tag' ? '#7b4318' : '#1f1613'),
    borderColor: asText(props.borderColor, '#ead9ca'),
    borderWidth: asText(props.borderWidth, layerType === 'shape' ? '1' : '0'),
    radius: asText(props.radius, layerType === 'tag' ? '999' : layerType === 'shape' ? '28' : layerType === 'image' ? '24' : '0'),
    fontSize: asText(props.fontSize, layerType === 'text' ? '42' : layerType === 'tag' ? '22' : '18'),
    fontWeight: asText(props.fontWeight, '700'),
    fit: asText(props.fit, 'contain'),
    frame: Boolean(props.frame ?? (layerType === 'image')),
    ...parseLayerBoundsDraft(layer, { x: 96, y: 96, w: 220, h: 96 }),
  };
};

export const findCustomLayerDraft = (draft: TemplateBuilderDraft, target: string) => draft.customLayers.find((layer) => layer.id === target) || null;

export const getCanvasEditableMeta = (draft: TemplateBuilderDraft, target: CanvasEditableTarget): CanvasEditableMeta => {
  const builtin = BUILTIN_CANVAS_EDITABLE_META[target];
  if (builtin) {
    return builtin;
  }

  const customLayer = findCustomLayerDraft(draft, target);
  if (customLayer) {
    const metaByType: Record<TemplateBuilderCustomLayerType, Omit<CanvasEditableMeta, 'label' | 'selectionId' | 'selectionKind'>> = {
      text: { minWidth: 140, minHeight: 40, accent: '#d56d1c', overlayLevel: 5 },
      shape: { minWidth: 80, minHeight: 48, accent: '#cc8c53', overlayLevel: 3 },
      image: { minWidth: 72, minHeight: 72, accent: '#b86b29', overlayLevel: 4 },
      tag: { minWidth: 120, minHeight: 32, accent: '#059669', overlayLevel: 5 },
      qrcode: { minWidth: 72, minHeight: 72, accent: '#8f6a55', overlayLevel: 4 },
    };
    return {
      label: customLayer.name,
      selectionKind: 'layer',
      selectionId: customLayer.id,
      ...metaByType[customLayer.type],
    };
  }

  return {
    label: target,
    selectionKind: 'layer',
    selectionId: target,
    minWidth: 72,
    minHeight: 32,
    accent: '#b55e24',
    overlayLevel: 4,
  };
};

export const editableBoundsDraftByTarget = (draft: TemplateBuilderDraft, target: CanvasEditableTarget): TemplateBuilderBoundsDraft => {
  switch (target) {
    case 'content-zone':
      return draft.contentZone;
    case 'kicker':
      return draft.kicker;
    case 'headline':
      return draft.headline;
    case 'subheadline':
      return draft.subheadline;
    case 'campaign-badge':
      return draft.badge;
    case 'footer':
      return draft.footer;
    case 'footer-content':
      return draft.footerContent;
    case 'footer-legal':
      return draft.footerLegal;
    case 'footer-logo-left':
      return draft.footerLeftLogo;
    case 'footer-logo-right':
      return draft.footerRightLogo;
    default:
      return findCustomLayerDraft(draft, target) || draft.kicker;
  }
};

export const editableVisibilityByTarget = (draft: TemplateBuilderDraft, target: CanvasEditableTarget) => {
  if (target !== 'content-zone' && !draft.layerOrder.includes(target)) {
    return false;
  }

  switch (target) {
    case 'kicker':
      return draft.kicker.visible;
    case 'headline':
      return draft.headline.visible;
    case 'subheadline':
      return draft.subheadline.visible;
    case 'campaign-badge':
      return draft.badge.visible;
    case 'footer':
      return draft.footer.visible;
    case 'footer-content':
      return draft.footerContent.visible;
    case 'footer-legal':
      return draft.footerLegal.visible;
    case 'footer-logo-left':
      return draft.footerLeftLogo.visible;
    case 'footer-logo-right':
      return draft.footerRightLogo.visible;
    case 'content-zone':
      return true;
    default:
      return findCustomLayerDraft(draft, target)?.visible !== false;
  }
};

export const updateEditableBoundsByTarget = (
  draft: TemplateBuilderDraft,
  target: CanvasEditableTarget,
  next: TemplateBuilderBoundsDraft,
): TemplateBuilderDraft => {
  switch (target) {
    case 'content-zone':
      return { ...draft, contentZone: { ...draft.contentZone, ...next } };
    case 'kicker':
      return { ...draft, kicker: { ...draft.kicker, ...next } };
    case 'headline':
      return { ...draft, headline: { ...draft.headline, ...next } };
    case 'subheadline':
      return { ...draft, subheadline: { ...draft.subheadline, ...next } };
    case 'campaign-badge':
      return { ...draft, badge: { ...draft.badge, ...next } };
    case 'footer':
      return { ...draft, footer: { ...draft.footer, ...next } };
    case 'footer-content':
      return { ...draft, footerContent: { ...draft.footerContent, ...next } };
    case 'footer-legal':
      return { ...draft, footerLegal: { ...draft.footerLegal, ...next } };
    case 'footer-logo-left':
      return { ...draft, footerLeftLogo: { ...draft.footerLeftLogo, ...next } };
    case 'footer-logo-right':
      return { ...draft, footerRightLogo: { ...draft.footerRightLogo, ...next } };
    default:
      return {
        ...draft,
        customLayers: draft.customLayers.map((layer) => (layer.id === target ? { ...layer, ...next } : layer)),
      };
  }
};

export const clampEditableBounds = (
  draft: TemplateBuilderDraft,
  target: CanvasEditableTarget,
  bounds: { x: number; y: number; w: number; h: number },
  canvasWidth: number,
  canvasHeight: number,
) => {
  const meta = getCanvasEditableMeta(draft, target);
  const width = Math.min(Math.max(Math.round(bounds.w), meta.minWidth), Math.max(canvasWidth, meta.minWidth));
  const height = Math.min(Math.max(Math.round(bounds.h), meta.minHeight), Math.max(canvasHeight, meta.minHeight));
  const x = Math.min(Math.max(Math.round(bounds.x), 0), Math.max(canvasWidth - width, 0));
  const y = Math.min(Math.max(Math.round(bounds.y), 0), Math.max(canvasHeight - height, 0));

  return {
    x,
    y,
    w: Math.min(width, Math.max(canvasWidth - x, meta.minWidth)),
    h: Math.min(height, Math.max(canvasHeight - y, meta.minHeight)),
  };
};

export const defaultCardDraft = (): TemplateBuilderCardDraft => ({
  background: '#ffffff',
  borderColor: '#ead9ca',
  textColor: '#1f1613',
  cardRadius: '28',
  priceLayout: 'inline',
  priceBoxBackground: '#ff3b1f',
  priceBoxTextColor: '#ffffff',
  priceLabel: 'R$',
  priceBoxRadius: '26',
  priceBorderColor: '#ffc44f',
  priceBorderWidth: '4',
  priceBorderStyle: 'solid',
  pricePaddingX: '16',
  pricePaddingY: '12',
  priceGap: '12',
  priceLabelBackground: '#ffffff',
  priceLabelTextColor: '#fff1d6',
  priceLabelBorderColor: '#ffffff',
  priceLabelRadius: '999',
  priceLabelSize: '72',
  priceLabelFontSize: '24',
  priceValueColor: '#ffffff',
  priceFractionColor: '#ffffff',
  priceFractionFontSize: '28',
  priceUnitColor: '#ffffff',
  priceUnitFontSize: '18',
  priceUnitLayout: 'stacked',
  priceBaselineColor: '#7a5b49',
  priceBaselineFontSize: '13',
  nameFontSize: '30',
  descriptionFontSize: '18',
  priceFontSize: '54',
  showUnit: true,
  showDescription: true,
  showBaselinePrice: true,
});

export const createDefaultTemplateBuilderDraft = (template?: OfferTemplate | null, variant?: OfferTemplateVariant | null): TemplateBuilderDraft => {
  const width = clampNumber(variant?.canvasWidth ?? template?.canvasWidth, 1080, 720, 3200);
  const height = clampNumber(variant?.canvasHeight ?? template?.canvasHeight, 1350, 720, 4800);
  const safeX = Math.round(width * 0.067);
  const safeY = Math.round(height * 0.053);
  const footerHeight = Math.round(height * 0.09);
  const footerY = height - footerHeight - safeY;
  const contentTop = Math.round(height * 0.28);
  const contentHeight = Math.max(Math.round(height * 0.44), 320);
  const logoWidth = Math.round(width * 0.15);

  return {
    name: template?.name || 'Novo template em camadas',
    description: template?.description || 'Template criado no estúdio visual.',
    channel: template?.channel || 'PRINT',
    canvasWidth: String(width),
    canvasHeight: String(height),
    backgroundMode: 'gradient',
    backgroundColor: '#f9fafb',
    backgroundStart: '#f9fafb',
    backgroundEnd: '#d1fae5',
    backgroundImageUrl: '',
    backgroundImageStorageKey: '',
    kicker: {
      text: 'Catálogo global',
      visible: true,
      fontSize: '24',
      fontWeight: '700',
      ...boundsDraft(safeX, safeY, Math.round(width * 0.22), 44),
    },
    headline: {
      text: 'Template pronto para campanhas de ofertas.',
      visible: true,
      fontSize: '64',
      fontWeight: '800',
      ...boundsDraft(safeX, safeY + 60, Math.round(width * 0.5), Math.round(height * 0.12)),
    },
    subheadline: {
      text: 'Defina áreas, imagens e logos para receber os produtos automaticamente.',
      visible: true,
      fontSize: '28',
      fontWeight: '500',
      ...boundsDraft(safeX, safeY + 176, Math.round(width * 0.54), Math.round(height * 0.08)),
    },
    badge: {
      imageUrl: '',
      storageKey: '',
      visible: true,
      radius: '0',
      frame: false,
      ...boundsDraft(width - safeX - Math.round(width * 0.2), safeY + 8, Math.round(width * 0.18), Math.round(width * 0.18)),
    },
    footer: {
      visible: true,
      radius: '18',
      background: '#2c1d17',
      textColor: '#fff4ee',
      fontSize: '15',
      ...boundsDraft(safeX, footerY, width - safeX * 2, footerHeight),
    },
    footerContent: {
      text: 'Conteúdo principal do rodapé',
      visible: true,
      fontSize: '15',
      fontWeight: '600',
      ...boundsDraft(safeX + 176, footerY + 12, Math.round(width * 0.42), footerHeight - 24),
    },
    footerLegal: {
      text: 'Aviso legal do mercado',
      visible: true,
      fontSize: '12',
      fontWeight: '500',
      ...boundsDraft(width - safeX - Math.round(width * 0.28), footerY + 12, Math.round(width * 0.24), footerHeight - 24),
    },
    footerLeftLogo: {
      imageUrl: '',
      storageKey: '',
      visible: true,
      radius: '0',
      frame: false,
      ...boundsDraft(safeX + 16, footerY + 10, logoWidth, footerHeight - 20),
    },
    footerRightLogo: {
      imageUrl: '',
      storageKey: '',
      visible: false,
      radius: '0',
      frame: false,
      ...boundsDraft(width - safeX - logoWidth - 16, footerY + 10, logoWidth, footerHeight - 20),
    },
    contentZone: {
      layout: 'grid',
      columns: '2',
      rows: '3',
      slotCount: '6',
      ...boundsDraft(safeX, contentTop, width - safeX * 2, Math.min(contentHeight, footerY - contentTop - 20)),
    },
    card: defaultCardDraft(),
    layerOrder: [...TEMPLATE_BUILDER_LAYER_IDS],
    layerLocks: createDefaultLayerLocks(),
    customLayers: [],
  };
};

export const buildTemplateBuilderDraft = (template?: OfferTemplate | null, variant?: OfferTemplateVariant | null): TemplateBuilderDraft => {
  const fallback = createDefaultTemplateBuilderDraft(template, variant);
  const parsedDesign = parseJson<JsonMap>(template?.designJson, {}) || {};
  const canvas = asMap(parsedDesign.canvas);
  const background = asMap(canvas.background);
  const bindings = asMap(parsedDesign.bindings);
  const staticBindings = asMap(bindings.static);
  const staticAssets = asMap(staticBindings.assets);
  const layers = asList(parsedDesign.layers);
  const zones = asList(parsedDesign.productZones);
  const kickerLayer = findLayer(layers, ['kicker']);
  const headlineLayer = findLayer(layers, ['headline'], ['headline']);
  const subheadlineLayer = findLayer(layers, ['subheadline']);
  const badgeLayer = findLayer(layers, ['campaign-badge', 'badge3d', 'badge'], ['campaignbadge']);
  const footerLayer = findLayer(layers, ['footer'], ['footer']);
  const footerContentLayer = findLayer(layers, ['footer-content']);
  const footerLegalLayer = findLayer(layers, ['footer-legal']);
  const footerLeftLogoLayer = findLayer(layers, ['footer-logo-left', 'logo-left']);
  const footerRightLogoLayer = findLayer(layers, ['footer-logo-right', 'logo-right']);
  const contentZone = zones.find((zone) => String(zone.id || '').toLowerCase().includes('content')) || zones[0] || null;
  const cardTemplate = asMap(contentZone?.cardTemplate);
  const customLayers = layers
    .filter((layer) => {
      const layerId = String(layer.id || '');
      return layerId && !TEMPLATE_BUILDER_LAYER_ID_SET.has(layerId);
    })
    .map((layer) => parseCustomLayerDraft(layer, staticBindings));
  const availableLayerIds = [...TEMPLATE_BUILDER_LAYER_IDS, ...customLayers.map((layer) => layer.id)];
  const parsedLayerIds = layers.map((layer) => String(layer.id || '')).filter(Boolean);
  const layerOrder = parsedLayerIds.length
    ? sanitizeLayerOrder(parsedLayerIds, availableLayerIds, false)
    : sanitizeLayerOrder(fallback.layerOrder, availableLayerIds, true);
  const layerLocks = layers.reduce<Record<string, boolean>>(
    (accumulator, layer) => {
      const layerId = String(layer.id || '');
      if (!layerId) {
        return accumulator;
      }

      accumulator[layerId] = Boolean(layer.locked);
      return accumulator;
    },
    { ...fallback.layerLocks },
  );

  return {
    ...fallback,
    name: template?.name || fallback.name,
    description: template?.description || fallback.description,
    channel: template?.channel || fallback.channel,
    canvasWidth: String(clampNumber(canvas.width ?? variant?.canvasWidth ?? template?.canvasWidth, Number(fallback.canvasWidth), 720, 3200)),
    canvasHeight: String(clampNumber(canvas.height ?? variant?.canvasHeight ?? template?.canvasHeight, Number(fallback.canvasHeight), 720, 4800)),
    backgroundMode: asText(background.type, fallback.backgroundMode),
    backgroundColor: asText(background.color, fallback.backgroundColor),
    backgroundStart: asText(background.start, fallback.backgroundStart),
    backgroundEnd: asText(background.end, fallback.backgroundEnd),
    backgroundImageUrl: resolveStaticBinding(background.imageUrl, staticBindings, fallback.backgroundImageUrl),
    backgroundImageStorageKey: asText(staticAssets.backgroundImageStorageKey, fallback.backgroundImageStorageKey),
    kicker: {
      ...fallback.kicker,
      text: fallback.kicker.text,
      visible: kickerLayer?.visible !== false,
      fontSize: asText(kickerLayer?.props?.fontSize, fallback.kicker.fontSize),
      fontWeight: asText(kickerLayer?.props?.fontWeight, fallback.kicker.fontWeight),
      ...parseLayerBoundsDraft(kickerLayer, parseBoundsDraft(fallback.kicker, { x: 0, y: 0, w: 1, h: 1 })),
    },
    headline: {
      ...fallback.headline,
      text: fallback.headline.text,
      visible: headlineLayer?.visible !== false,
      fontSize: asText(headlineLayer?.props?.fontSize, fallback.headline.fontSize),
      fontWeight: asText(headlineLayer?.props?.fontWeight, fallback.headline.fontWeight),
      ...parseLayerBoundsDraft(headlineLayer, parseBoundsDraft(fallback.headline, { x: 0, y: 0, w: 1, h: 1 })),
    },
    subheadline: {
      ...fallback.subheadline,
      text: fallback.subheadline.text,
      visible: subheadlineLayer?.visible !== false,
      fontSize: asText(subheadlineLayer?.props?.fontSize, fallback.subheadline.fontSize),
      fontWeight: asText(subheadlineLayer?.props?.fontWeight, fallback.subheadline.fontWeight),
      ...parseLayerBoundsDraft(subheadlineLayer, parseBoundsDraft(fallback.subheadline, { x: 0, y: 0, w: 1, h: 1 })),
    },
    badge: {
      ...fallback.badge,
      imageUrl: resolveStaticBinding(badgeLayer?.binding, staticBindings, fallback.badge.imageUrl),
      storageKey: asText(staticAssets.campaignBadgeStorageKey, fallback.badge.storageKey),
      visible: badgeLayer ? badgeLayer.visible !== false : fallback.badge.visible,
      radius: asText(badgeLayer?.props?.radius, fallback.badge.radius),
      frame: Boolean(badgeLayer?.props?.frame ?? fallback.badge.frame),
      ...parseLayerBoundsDraft(badgeLayer, parseBoundsDraft(fallback.badge, { x: 0, y: 0, w: 1, h: 1 })),
    },
    footer: {
      ...fallback.footer,
      visible: footerLayer ? footerLayer.visible !== false : fallback.footer.visible,
      radius: asText(footerLayer?.props?.radius, fallback.footer.radius),
      background: asText(footerLayer?.props?.background, fallback.footer.background),
      textColor: asText(footerLayer?.props?.textColor, fallback.footer.textColor),
      fontSize: asText(footerLayer?.props?.fontSize, fallback.footer.fontSize),
      ...parseLayerBoundsDraft(footerLayer, parseBoundsDraft(fallback.footer, { x: 0, y: 0, w: 1, h: 1 })),
    },
    footerContent: {
      ...fallback.footerContent,
      visible: footerContentLayer ? footerContentLayer.visible !== false : fallback.footerContent.visible,
      fontSize: asText(footerContentLayer?.props?.fontSize, fallback.footerContent.fontSize),
      fontWeight: asText(footerContentLayer?.props?.fontWeight, fallback.footerContent.fontWeight),
      ...parseLayerBoundsDraft(footerContentLayer, parseBoundsDraft(fallback.footerContent, { x: 0, y: 0, w: 1, h: 1 })),
    },
    footerLegal: {
      ...fallback.footerLegal,
      visible: footerLegalLayer ? footerLegalLayer.visible !== false : fallback.footerLegal.visible,
      fontSize: asText(footerLegalLayer?.props?.fontSize, fallback.footerLegal.fontSize),
      fontWeight: asText(footerLegalLayer?.props?.fontWeight, fallback.footerLegal.fontWeight),
      ...parseLayerBoundsDraft(footerLegalLayer, parseBoundsDraft(fallback.footerLegal, { x: 0, y: 0, w: 1, h: 1 })),
    },
    footerLeftLogo: {
      ...fallback.footerLeftLogo,
      visible: footerLeftLogoLayer ? footerLeftLogoLayer.visible !== false : fallback.footerLeftLogo.visible,
      radius: asText(footerLeftLogoLayer?.props?.radius, fallback.footerLeftLogo.radius),
      frame: Boolean(footerLeftLogoLayer?.props?.frame ?? fallback.footerLeftLogo.frame),
      ...parseLayerBoundsDraft(footerLeftLogoLayer, parseBoundsDraft(fallback.footerLeftLogo, { x: 0, y: 0, w: 1, h: 1 })),
    },
    footerRightLogo: {
      ...fallback.footerRightLogo,
      visible: footerRightLogoLayer ? footerRightLogoLayer.visible !== false : fallback.footerRightLogo.visible,
      radius: asText(footerRightLogoLayer?.props?.radius, fallback.footerRightLogo.radius),
      frame: Boolean(footerRightLogoLayer?.props?.frame ?? fallback.footerRightLogo.frame),
      ...parseLayerBoundsDraft(footerRightLogoLayer, parseBoundsDraft(fallback.footerRightLogo, { x: 0, y: 0, w: 1, h: 1 })),
    },
    contentZone: {
      ...fallback.contentZone,
      layout: asText(contentZone?.layout || contentZone?.zoneType, fallback.contentZone.layout),
      columns: asText(contentZone?.columns, fallback.contentZone.columns),
      rows: asText(contentZone?.rows, fallback.contentZone.rows),
      slotCount: asText(contentZone?.slotCount, fallback.contentZone.slotCount),
      ...parseLayerBoundsDraft(contentZone, parseBoundsDraft(fallback.contentZone, { x: 0, y: 0, w: 1, h: 1 })),
    },
    card: {
      ...fallback.card,
      background: asText(cardTemplate.background, fallback.card.background),
      borderColor: asText(cardTemplate.borderColor, fallback.card.borderColor),
      textColor: asText(cardTemplate.textColor, fallback.card.textColor),
      cardRadius: asText(cardTemplate.cardRadius, fallback.card.cardRadius),
      priceLayout: asText(cardTemplate.priceLayout, fallback.card.priceLayout),
      priceBoxBackground: asText(cardTemplate.priceBoxBackground, fallback.card.priceBoxBackground),
      priceBoxTextColor: asText(cardTemplate.priceBoxTextColor, fallback.card.priceBoxTextColor),
      priceLabel: asText(cardTemplate.priceLabel, fallback.card.priceLabel),
      priceBoxRadius: asText(cardTemplate.priceBoxRadius, fallback.card.priceBoxRadius),
      priceBorderColor: asText(cardTemplate.priceBorderColor, fallback.card.priceBorderColor),
      priceBorderWidth: asText(cardTemplate.priceBorderWidth, fallback.card.priceBorderWidth),
      priceBorderStyle: asText(cardTemplate.priceBorderStyle, fallback.card.priceBorderStyle),
      pricePaddingX: asText(cardTemplate.pricePaddingX, fallback.card.pricePaddingX),
      pricePaddingY: asText(cardTemplate.pricePaddingY, fallback.card.pricePaddingY),
      priceGap: asText(cardTemplate.priceGap, fallback.card.priceGap),
      priceLabelBackground: asText(cardTemplate.priceLabelBackground, fallback.card.priceLabelBackground),
      priceLabelTextColor: asText(cardTemplate.priceLabelTextColor ?? cardTemplate.priceBoxLabelColor, fallback.card.priceLabelTextColor),
      priceLabelBorderColor: asText(cardTemplate.priceLabelBorderColor, fallback.card.priceLabelBorderColor),
      priceLabelRadius: asText(cardTemplate.priceLabelRadius, fallback.card.priceLabelRadius),
      priceLabelSize: asText(cardTemplate.priceLabelSize, fallback.card.priceLabelSize),
      priceLabelFontSize: asText(cardTemplate.priceLabelFontSize, fallback.card.priceLabelFontSize),
      priceValueColor: asText(cardTemplate.priceValueColor ?? cardTemplate.priceBoxTextColor, fallback.card.priceValueColor),
      priceFractionColor: asText(cardTemplate.priceFractionColor ?? cardTemplate.priceValueColor ?? cardTemplate.priceBoxTextColor, fallback.card.priceFractionColor),
      priceFractionFontSize: asText(cardTemplate.priceFractionFontSize, fallback.card.priceFractionFontSize),
      priceUnitColor: asText(cardTemplate.priceUnitColor ?? cardTemplate.priceValueColor ?? cardTemplate.priceBoxTextColor, fallback.card.priceUnitColor),
      priceUnitFontSize: asText(cardTemplate.priceUnitFontSize, fallback.card.priceUnitFontSize),
      priceUnitLayout: asText(cardTemplate.priceUnitLayout, fallback.card.priceUnitLayout),
      priceBaselineColor: asText(cardTemplate.priceBaselineColor, fallback.card.priceBaselineColor),
      priceBaselineFontSize: asText(cardTemplate.priceBaselineFontSize, fallback.card.priceBaselineFontSize),
      nameFontSize: asText(cardTemplate.nameFontSize, fallback.card.nameFontSize),
      descriptionFontSize: asText(cardTemplate.descriptionFontSize, fallback.card.descriptionFontSize),
      priceFontSize: asText(cardTemplate.priceFontSize, fallback.card.priceFontSize),
      showUnit: cardTemplate.showUnit !== false,
      showDescription: cardTemplate.showDescription !== false,
      showBaselinePrice: cardTemplate.showBaselinePrice !== false,
    },
    layerOrder,
    layerLocks,
    customLayers,
  };
};

export const buildCustomLayerFromDraft = (layer: TemplateBuilderCustomLayerDraft, layerLocks: Record<string, boolean>): JsonMap => {
  const bounds = parseBoundsDraft(layer, { x: 96, y: 96, w: 220, h: 96 });
  const common = {
    id: layer.id,
    name: layer.name.trim() || customLayerTypeLabel(layer.type),
    type: layer.type,
    binding: layer.binding.trim() || undefined,
    locked: layerLocks[layer.id] ?? false,
    visible: layer.visible,
    bounds,
  };

  if (layer.type === 'image') {
    return {
      ...common,
      props: {
        imageUrl: layer.imageUrl.trim() || undefined,
        storageKey: layer.storageKey.trim() || undefined,
        background: layer.background.trim() || 'rgba(255,255,255,0.88)',
        radius: clampNumber(layer.radius, 24, 0, 200),
        frame: layer.frame,
        fit: layer.fit === 'cover' ? 'cover' : 'contain',
      },
    };
  }

  if (layer.type === 'shape') {
    return {
      ...common,
      props: {
        background: layer.background.trim() || '#ffede0',
        borderColor: layer.borderColor.trim() || '#ead9ca',
        borderWidth: clampNumber(layer.borderWidth, 1, 0, 12),
        radius: clampNumber(layer.radius, 28, 0, 200),
      },
    };
  }

  if (layer.type === 'qrcode') {
    return {
      ...common,
      props: {
        content: layer.content.trim() || 'QR do produto',
        background: layer.background.trim() || '#ffffff',
        textColor: layer.textColor.trim() || '#6c5443',
        radius: clampNumber(layer.radius, 22, 0, 120),
      },
    };
  }

  return {
    ...common,
    props: {
      content: layer.content.trim() || (layer.type === 'tag' ? 'Nova faixa' : 'Novo texto'),
      background: layer.background.trim() || (layer.type === 'tag' ? '#ffffff' : 'transparent'),
      textColor: layer.textColor.trim() || '#1f1613',
      radius: clampNumber(layer.radius, layer.type === 'tag' ? 999 : 0, 0, 999),
      fontSize: clampNumber(layer.fontSize, layer.type === 'tag' ? 22 : 42, 10, 180),
      fontWeight: clampNumber(layer.fontWeight, 700, 300, 900),
    },
  };
};

export const buildLayerPropsFromInspectorDraft = (layer: JsonMap, draft: LayerDraft, isCustomLayer: boolean) => {
  const currentProps = asMap(layer.props);
  if (!isCustomLayer) {
    return currentProps;
  }

  const layerType = String(layer.type || draft.type || 'text').toLowerCase();

  if (layerType === 'image') {
    return {
      ...currentProps,
      imageUrl: draft.imageUrl.trim() || undefined,
      storageKey: draft.imageStorageKey.trim() || undefined,
      background: draft.background.trim() || undefined,
      radius: draft.radius ? Number(draft.radius) : currentProps.radius,
      frame: draft.frame,
      fit: draft.fit === 'cover' ? 'cover' : 'contain',
    };
  }

  if (layerType === 'shape') {
    return {
      ...currentProps,
      background: draft.background.trim() || undefined,
      borderColor: draft.borderColor.trim() || undefined,
      borderWidth: draft.borderWidth ? Number(draft.borderWidth) : currentProps.borderWidth,
      radius: draft.radius ? Number(draft.radius) : currentProps.radius,
    };
  }

  if (layerType === 'qrcode') {
    return {
      ...currentProps,
      content: draft.content.trim() || undefined,
      background: draft.background.trim() || undefined,
      textColor: draft.textColor.trim() || undefined,
      radius: draft.radius ? Number(draft.radius) : currentProps.radius,
    };
  }

  return {
    ...currentProps,
    content: draft.content.trim() || undefined,
    background: draft.background.trim() || undefined,
    textColor: draft.textColor.trim() || undefined,
    radius: draft.radius ? Number(draft.radius) : currentProps.radius,
    fontSize: draft.fontSize ? Number(draft.fontSize) : currentProps.fontSize,
    fontWeight: draft.fontWeight ? Number(draft.fontWeight) : currentProps.fontWeight,
  };
};

export const buildTemplateDesignFromDraft = (draft: TemplateBuilderDraft): JsonMap => {
  const width = clampNumber(draft.canvasWidth, 1080, 720, 3200);
  const height = clampNumber(draft.canvasHeight, 1350, 720, 4800);
  const kickerBounds = parseBoundsDraft(draft.kicker, { x: 72, y: 72, w: 240, h: 44 });
  const headlineBounds = parseBoundsDraft(draft.headline, { x: 72, y: 132, w: 540, h: 160 });
  const subheadlineBounds = parseBoundsDraft(draft.subheadline, { x: 72, y: 280, w: 560, h: 100 });
  const badgeBounds = parseBoundsDraft(draft.badge, { x: width - 280, y: 72, w: 200, h: 200 });
  const footerBounds = parseBoundsDraft(draft.footer, { x: 72, y: height - 148, w: width - 144, h: 72 });
  const footerContentBounds = parseBoundsDraft(draft.footerContent, { x: 248, y: height - 136, w: 452, h: 48 });
  const footerLegalBounds = parseBoundsDraft(draft.footerLegal, { x: width - 360, y: height - 136, w: 280, h: 48 });
  const footerLeftBounds = parseBoundsDraft(draft.footerLeftLogo, { x: 88, y: height - 138, w: 140, h: 52 });
  const footerRightBounds = parseBoundsDraft(draft.footerRightLogo, { x: width - 228, y: height - 138, w: 140, h: 52 });
  const zoneBounds = parseBoundsDraft(draft.contentZone, { x: 72, y: 360, w: width - 144, h: height - 540 });
  const staticBindings = {
    assets: {
      backgroundImageUrl: draft.backgroundImageUrl.trim(),
      backgroundImageStorageKey: draft.backgroundImageStorageKey.trim(),
      campaignBadgeUrl: draft.badge.imageUrl.trim(),
      campaignBadgeStorageKey: draft.badge.storageKey.trim(),
    },
  };

  const baseLayers: JsonMap[] = [
    {
      id: 'kicker',
      name: 'Kicker',
      type: 'tag',
      binding: 'campaign.kicker',
      locked: draft.layerLocks.kicker ?? true,
      visible: draft.kicker.visible,
      bounds: kickerBounds,
      props: {
        fontSize: clampNumber(draft.kicker.fontSize, 24, 12, 120),
        fontWeight: clampNumber(draft.kicker.fontWeight, 700, 300, 900),
        background: 'rgba(255,255,255,0.86)',
        radius: 999,
      },
    },
    {
      id: 'headline',
      name: 'Título principal',
      type: 'text',
      binding: 'campaign.headline',
      locked: draft.layerLocks.headline ?? true,
      visible: draft.headline.visible,
      bounds: headlineBounds,
      props: {
        fontSize: clampNumber(draft.headline.fontSize, 64, 18, 180),
        fontWeight: clampNumber(draft.headline.fontWeight, 800, 300, 900),
      },
    },
    {
      id: 'subheadline',
      name: 'Subtítulo',
      type: 'text',
      binding: 'campaign.subheadline',
      locked: draft.layerLocks.subheadline ?? true,
      visible: draft.subheadline.visible,
      bounds: subheadlineBounds,
      props: {
        fontSize: clampNumber(draft.subheadline.fontSize, 28, 14, 120),
        fontWeight: clampNumber(draft.subheadline.fontWeight, 500, 300, 900),
      },
    },
    {
      id: 'campaign-badge',
      name: 'Selo 3D',
      type: 'campaignbadge',
      binding: 'static.assets.campaignBadgeUrl',
      locked: draft.layerLocks['campaign-badge'] ?? true,
      visible: draft.badge.visible,
      bounds: badgeBounds,
      props: {
        radius: clampNumber(draft.badge.radius, 0, 0, 200),
        frame: draft.badge.frame,
        fit: 'contain',
      },
    },
    {
      id: 'footer',
      name: 'Rodapé',
      type: 'footer',
      locked: draft.layerLocks.footer ?? true,
      visible: draft.footer.visible,
      bounds: footerBounds,
      props: {
        radius: clampNumber(draft.footer.radius, 18, 0, 160),
        background: draft.footer.background.trim() || '#2c1d17',
        textColor: (draft.footer.textColor ?? '').trim() || '#fff4ee',
        fontSize: clampNumber(draft.footer.fontSize, 15, 10, 48),
        containerOnly: true,
      },
    },
    {
      id: 'footer-content',
      name: 'Conteúdo principal do rodapé',
      type: 'text',
      binding: 'marketProfile.footer.content',
      locked: draft.layerLocks['footer-content'] ?? true,
      visible: draft.footerContent.visible,
      bounds: footerContentBounds,
      props: {
        fontSize: clampNumber(draft.footerContent.fontSize, 15, 10, 48),
        fontWeight: clampNumber(draft.footerContent.fontWeight, 600, 300, 900),
        textColor: (draft.footer.textColor ?? '').trim() || '#fff4ee',
      },
    },
    {
      id: 'footer-legal',
      name: 'Aviso legal do rodapé',
      type: 'text',
      binding: 'marketProfile.footer.legalText',
      locked: draft.layerLocks['footer-legal'] ?? true,
      visible: draft.footerLegal.visible,
      bounds: footerLegalBounds,
      props: {
        fontSize: clampNumber(draft.footerLegal.fontSize, 12, 10, 48),
        fontWeight: clampNumber(draft.footerLegal.fontWeight, 500, 300, 900),
        textColor: (draft.footer.textColor ?? '').trim() || '#fff4ee',
      },
    },
    {
      id: 'footer-logo-left',
      name: 'Logo rodapé esquerdo',
      type: 'image',
      binding: 'marketProfile.assets.primaryLogo.imageUrl',
      locked: draft.layerLocks['footer-logo-left'] ?? true,
      visible: draft.footerLeftLogo.visible,
      bounds: footerLeftBounds,
      props: {
        radius: clampNumber(draft.footerLeftLogo.radius, 0, 0, 120),
        frame: draft.footerLeftLogo.frame,
        fit: 'contain',
      },
    },
    {
      id: 'footer-logo-right',
      name: 'Logo rodapé direito',
      type: 'image',
      binding: 'marketProfile.assets.secondaryLogo.imageUrl',
      locked: draft.layerLocks['footer-logo-right'] ?? true,
      visible: draft.footerRightLogo.visible,
      bounds: footerRightBounds,
      props: {
        radius: clampNumber(draft.footerRightLogo.radius, 0, 0, 120),
        frame: draft.footerRightLogo.frame,
        fit: 'contain',
      },
    },
  ];

  const customLayers = draft.customLayers.map((layer) => buildCustomLayerFromDraft(layer, draft.layerLocks));
  const availableLayers = [...baseLayers, ...customLayers];
  const availableLayerIds = availableLayers.map((layer) => String(layer.id || '')).filter(Boolean);

  const orderedLayerIds = sanitizeLayerOrder(draft.layerOrder, availableLayerIds, false);
  const layersById = new Map(availableLayers.map((layer) => [String(layer.id || ''), layer]));
  const layers = orderedLayerIds.map((layerId) => layersById.get(layerId)).filter((layer): layer is JsonMap => Boolean(layer));

  return {
    schemaVersion: 2,
    canvas: {
      width,
      height,
      safeArea: { top: 48, right: 48, bottom: 48, left: 48 },
      background:
        draft.backgroundMode === 'image'
          ? {
              type: 'image',
              imageUrl: 'static.assets.backgroundImageUrl',
              color: draft.backgroundColor.trim() || '#f9fafb',
              fit: 'cover',
            }
          : draft.backgroundMode === 'gradient'
            ? {
                type: 'gradient',
                start: draft.backgroundStart.trim() || '#f9fafb',
                end: draft.backgroundEnd.trim() || '#d1fae5',
              }
            : {
                type: 'solid',
                color: draft.backgroundColor.trim() || '#f9fafb',
              },
    },
    layers,
    productZones: [
      {
        id: 'content-zone',
        name: 'Área de conteúdo',
        zoneType: draft.contentZone.layout === 'single' ? 'single' : draft.contentZone.layout === 'hero' ? 'hero' : 'grid',
        layout: draft.contentZone.layout === 'single' ? 'single' : draft.contentZone.layout === 'hero' ? 'hero' : 'grid',
        columns: clampNumber(draft.contentZone.columns, draft.contentZone.layout === 'grid' ? 2 : 1, 1, 6),
        rows: clampNumber(draft.contentZone.rows, draft.contentZone.layout === 'grid' ? 3 : 1, 1, 8),
        slotCount: clampNumber(draft.contentZone.slotCount, draft.contentZone.layout === 'grid' ? 6 : 1, 1, 24),
        bounds: zoneBounds,
        cardTemplate: {
          imageFit: 'contain',
          background: draft.card.background.trim() || '#ffffff',
          borderColor: draft.card.borderColor.trim() || '#ead9ca',
          textColor: draft.card.textColor.trim() || '#1f1613',
          priceLayout: draft.card.priceLayout === 'split' ? 'split' : 'inline',
          cardRadius: clampNumber(draft.card.cardRadius, 28, 8, 80),
          priceBoxBackground: draft.card.priceBoxBackground.trim() || '#ff3b1f',
          priceBoxTextColor: draft.card.priceValueColor.trim() || draft.card.priceBoxTextColor.trim() || '#ffffff',
          priceBoxLabelColor: draft.card.priceLabelTextColor.trim() || '#fff1d6',
          priceLabel: draft.card.priceLabel.trim() || 'R$',
          priceBoxRadius: clampNumber(draft.card.priceBoxRadius, 26, 8, 80),
          priceBorderColor: draft.card.priceBorderColor.trim() || '#ffc44f',
          priceBorderWidth: clampNumber(draft.card.priceBorderWidth, 4, 0, 16),
          priceBorderStyle: draft.card.priceBorderStyle === 'dashed' ? 'dashed' : 'solid',
          pricePaddingX: clampNumber(draft.card.pricePaddingX, 16, 4, 64),
          pricePaddingY: clampNumber(draft.card.pricePaddingY, 12, 4, 48),
          priceGap: clampNumber(draft.card.priceGap, 12, 0, 48),
          priceLabelBackground: draft.card.priceLabelBackground.trim() || '#ffffff',
          priceLabelTextColor: draft.card.priceLabelTextColor.trim() || '#fff1d6',
          priceLabelBorderColor: draft.card.priceLabelBorderColor.trim() || '#ffffff',
          priceLabelRadius: clampNumber(draft.card.priceLabelRadius, 999, 0, 999),
          priceLabelSize: clampNumber(draft.card.priceLabelSize, 72, 24, 200),
          priceLabelFontSize: clampNumber(draft.card.priceLabelFontSize, 24, 8, 80),
          priceValueColor: draft.card.priceValueColor.trim() || '#ffffff',
          priceFractionColor: draft.card.priceFractionColor.trim() || draft.card.priceValueColor.trim() || '#ffffff',
          priceFractionFontSize: clampNumber(draft.card.priceFractionFontSize, 28, 8, 96),
          priceUnitColor: draft.card.priceUnitColor.trim() || draft.card.priceValueColor.trim() || '#ffffff',
          priceUnitFontSize: clampNumber(draft.card.priceUnitFontSize, 18, 8, 72),
          priceUnitLayout: draft.card.priceUnitLayout === 'side' ? 'side' : 'stacked',
          priceBaselineColor: draft.card.priceBaselineColor.trim() || '#7a5b49',
          priceBaselineFontSize: clampNumber(draft.card.priceBaselineFontSize, 13, 8, 60),
          nameFontSize: clampNumber(draft.card.nameFontSize, 30, 14, 120),
          descriptionFontSize: clampNumber(draft.card.descriptionFontSize, 18, 10, 72),
          priceFontSize: clampNumber(draft.card.priceFontSize, 54, 18, 160),
          showBaselinePrice: draft.card.showBaselinePrice,
          showUnit: draft.card.showUnit,
          showDescription: draft.card.showDescription,
        },
      },
    ],
    bindings: {
      static: staticBindings,
    },
    brandTokens: {},
    campaignTokens: {},
  };
};

export const buildTemplateResolvedDesignFromDraft = (
  draft: TemplateBuilderDraft,
  brandKit?: OfferBrandKit | null,
  campaignKit?: OfferCampaignKit | null,
  marketProfile?: OfferMarketProfile | null,
  campaignCopy?: { kicker: string; headline: string; subheadline: string; badgeLabel: string } | null,
  products: OfferCatalogProduct[] = [],
) => {
  const design = buildTemplateDesignFromDraft(draft);
  const zone = asList(design.productZones)[0];
  const zoneId = String(zone?.id || 'content-zone');
  const slotCount = clampNumber(zone?.slotCount, 6, 1, 24);
  const campaignTokens = {
    ...(parseJson<JsonMap>(campaignKit?.tokensJson, {}) || {}),
    kicker: campaignCopy?.kicker?.trim() || 'Oferta do dia',
    headline: campaignCopy?.headline?.trim() || 'Template pronto para campanhas de ofertas.',
    subheadline: campaignCopy?.subheadline?.trim() || 'Defina áreas, imagens e logos para receber os produtos automaticamente.',
    badgeLabel: campaignCopy?.badgeLabel?.trim() || 'Oferta',
  };
  return {
    ...design,
    brandTokens: parseJson<JsonMap>(brandKit?.tokensJson, {}) || {},
    brandAssets: parseJson<JsonMap>(brandKit?.assetsJson, {}) || {},
    campaignTokens,
    campaignAssets: parseJson<JsonMap>(campaignKit?.assetsJson, {}) || {},
    marketProfile: {
      footer: {
        content: marketProfile?.footerContent || 'Conteúdo principal do rodapé',
        legalText: marketProfile?.footerLegalText || 'Aviso legal do mercado',
      },
      assets: {
        primaryLogo: {
          imageUrl: marketProfile?.primaryLogoUrl || '',
          storageKey: marketProfile?.primaryLogoStorageKey || '',
        },
        secondaryLogo: {
          imageUrl: marketProfile?.secondaryLogoUrl || '',
          storageKey: marketProfile?.secondaryLogoStorageKey || '',
        },
      },
    },
    resolvedProducts: products.map((product) => ({ ...product })),
    zoneBindings: {
      [zoneId]: products.slice(0, slotCount).map((product) => ({ ...product })),
    },
  };
};

export const emptyLayerDraft: LayerDraft = {
  type: '',
  name: '',
  binding: '',
  x: '',
  y: '',
  w: '',
  h: '',
  locked: false,
  visible: true,
  content: '',
  imageUrl: '',
  imageStorageKey: '',
  background: '',
  textColor: '',
  borderColor: '',
  borderWidth: '',
  radius: '',
  fontSize: '',
  fontWeight: '',
  frame: false,
  fit: 'contain',
};

export const emptyZoneDraft: ZoneDraft = {
  name: '',
  layout: 'grid',
  slotCount: '1',
  columns: '1',
  rows: '1',
  x: '',
  y: '',
  w: '',
  h: '',
};

export const readHeadline = (preview?: OfferTemplatePreview | null) => {
  const resolved = parseJson<Record<string, any>>(preview?.resolvedDesignJson, {});
  return resolved?.campaignTokens?.headline || resolved?.bindings?.static?.headline || null;
};
