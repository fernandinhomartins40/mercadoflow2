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
import Button from '../components/common/Button';
import OffersStudioLayout from '../components/layout/OffersStudioLayout';
import OfferCanvasPreview from '../components/offers/OfferCanvasPreview';
import OfferProductImage from '../components/offers/OfferProductImage';
import { useOffersAppSession } from '../hooks/useOffersAppSession';
import api from '../services/api';
import { offersService, type OfferCreateJobPayload } from '../services/offers.service';
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
} from '../types/offers.types';

type JsonMap = Record<string, any>;

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const compactCategory = (value?: string | null) => (!value ? 'Sem categoria' : value.length > 72 ? `${value.slice(0, 69)}...` : value);

const parseJson = <T,>(value?: string | null, fallback?: T): T | undefined => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const asMap = (value: unknown): JsonMap => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonMap;
};

const asList = (value: unknown): JsonMap[] => (Array.isArray(value) ? value.map(asMap) : []);

const layerTypeIcon = (type?: string): LucideIcon => {
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

const TOOL_OPTIONS = [
  { key: 'products', icon: PackageSearch, label: 'Produtos' },
  { key: 'themes', icon: LayoutTemplate, label: 'Temas' },
  { key: 'market', icon: Factory, label: 'Marca' },
  { key: 'calendar', icon: CalendarDays, label: 'Datas' },
  { key: 'copy', icon: FileText, label: 'Texto' },
  { key: 'publish', icon: SendHorizontal, label: 'Publicar' },
] as const;

type StudioTool = (typeof TOOL_OPTIONS)[number]['key'];
type ProductPanelMode = 'search' | 'selected';
type LayerDraft = {
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
type ZoneDraft = {
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

type TemplateBuilderBoundsDraft = {
  x: string;
  y: string;
  w: string;
  h: string;
};

type TemplateBuilderTextLayerDraft = TemplateBuilderBoundsDraft & {
  text: string;
  visible: boolean;
  fontSize: string;
  fontWeight: string;
};

type TemplateBuilderImageLayerDraft = TemplateBuilderBoundsDraft & {
  imageUrl: string;
  storageKey: string;
  visible: boolean;
  radius: string;
  frame: boolean;
};

type TemplateBuilderBoxLayerDraft = TemplateBuilderBoundsDraft & {
  visible: boolean;
  radius: string;
  background: string;
  textColor?: string;
  fontSize: string;
};

type TemplateBuilderCardDraft = {
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

type TemplateBuilderCustomLayerType = 'text' | 'image' | 'shape' | 'tag' | 'qrcode';

type TemplateBuilderCustomLayerDraft = TemplateBuilderBoundsDraft & {
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

type TemplateBuilderZoneDraft = TemplateBuilderBoundsDraft & {
  layout: string;
  columns: string;
  rows: string;
  slotCount: string;
};

type TemplateBuilderDraft = {
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

type CanvasEditableTarget = string;

type CanvasEditInteraction = {
  target: CanvasEditableTarget;
  mode: 'move' | 'resize';
  anchorX: number;
  anchorY: number;
  startBounds: { x: number; y: number; w: number; h: number };
};

type SuperAdminMarketOption = {
  id: string;
  name: string;
  planType?: string | null;
  billingStatus?: string | null;
  isActive?: boolean | null;
};

type PaginatedResponse<T> = {
  content: T[];
};

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

const ZOOM_PRESET_VALUES = [1, 2, 5, 10, 25, 50, 75, 100, 125, 150, 200, 300, 400] as const;
const MIN_STAGE_ZOOM = 0.01;
const MAX_STAGE_ZOOM = 4;

const QUALITY_OPTIONS = [
  { value: 'high', label: 'Alta qualidade' },
  { value: 'balanced', label: 'Equilibrado' },
  { value: 'draft', label: 'Rascunho' },
] as const;

const PUBLISH_TARGET_OPTIONS = [
  { value: 'DOWNLOAD', label: 'Download' },
  { value: 'PORTAL', label: 'Portal' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'TV', label: 'TV da loja' },
] as const;

const gridPresetToCount = (value: string) => (value === '1x1' ? 1 : value === '2x2' ? 4 : value === '3x2' ? 6 : value === '3x3' ? 9 : 6);
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const clampZoomScale = (value: number) => {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(Math.max(value, MIN_STAGE_ZOOM), MAX_STAGE_ZOOM);
};

const zoomToScale = (value: string, fallback = 1) => {
  if (value === 'AUTO') {
    return clampZoomScale(fallback);
  }

  return clampZoomScale((Number(value) || Math.round(fallback * 100)) / 100);
};

const scaleToZoomValue = (value: number) => String(Math.round(clampZoomScale(value) * 100));

const formatZoomLabel = (value: number) => `${Math.round(clampZoomScale(value) * 100)}%`;

const resolveStepZoomScale = (currentScale: number, direction: 'in' | 'out') => {
  const current = clampZoomScale(currentScale);
  const presets = ZOOM_PRESET_VALUES.map((value) => value / 100);

  if (direction === 'in') {
    return presets.find((value) => value > current + 0.001) ?? MAX_STAGE_ZOOM;
  }

  return [...presets].reverse().find((value) => value < current - 0.001) ?? MIN_STAGE_ZOOM;
};

const footerPreviewLabel = (value: string) =>
  value === 'SLIM'
    ? 'Ofertas válidas enquanto durarem os estoques'
    : value === 'NONE'
      ? null
      : 'Ofertas válidas por tempo limitado · Imagens meramente ilustrativas';

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

const normalizeSelection = <T extends { id: string }>(items: T[], currentId?: string | null, fallbackId?: string | null) => {
  if (currentId && items.some((item) => item.id === currentId)) return currentId;
  if (fallbackId && items.some((item) => item.id === fallbackId)) return fallbackId;
  return items[0]?.id || '';
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.min(Math.max(Math.round(numeric), min), max);
  }
  return fallback;
};

const asText = (value: unknown, fallback = '') => {
  if (value == null) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
};

const normalizeHexColor = (value: string, fallback = '#ffffff') => {
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

const getByPath = (source: JsonMap, path?: string) => {
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

const boundsDraft = (x: number, y: number, w: number, h: number): TemplateBuilderBoundsDraft => ({
  x: String(Math.round(x)),
  y: String(Math.round(y)),
  w: String(Math.round(w)),
  h: String(Math.round(h)),
});

const parseBoundsDraft = (value: TemplateBuilderBoundsDraft, fallback: { x: number; y: number; w: number; h: number }) => ({
  x: clampNumber(value.x, fallback.x, 0, 4000),
  y: clampNumber(value.y, fallback.y, 0, 6000),
  w: clampNumber(value.w, fallback.w, 1, 4000),
  h: clampNumber(value.h, fallback.h, 1, 6000),
});

const parseLayerBoundsDraft = (layer: JsonMap | null, fallback: { x: number; y: number; w: number; h: number }) =>
  boundsDraft(
    clampNumber(layer?.bounds?.x, fallback.x, 0, 4000),
    clampNumber(layer?.bounds?.y, fallback.y, 0, 6000),
    clampNumber(layer?.bounds?.w, fallback.w, 1, 4000),
    clampNumber(layer?.bounds?.h, fallback.h, 1, 6000),
  );

const resolveStaticBinding = (binding: unknown, staticBindings: JsonMap, fallback = '') => {
  const normalized = asText(binding);
  if (!normalized) return fallback;
  if (!normalized.startsWith('static.')) return normalized;
  const value = getByPath({ static: staticBindings }, normalized);
  return value == null ? fallback : String(value);
};

const findLayer = (layers: JsonMap[], ids: string[], types: string[] = []) =>
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

const TEMPLATE_BUILDER_LAYER_IDS = [
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
const TEMPLATE_BUILDER_LAYER_ID_SET = new Set<string>(TEMPLATE_BUILDER_LAYER_IDS);
const CUSTOM_LAYER_TYPE_OPTIONS: Array<{ value: TemplateBuilderCustomLayerType; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'shape', label: 'Forma' },
  { value: 'image', label: 'Imagem' },
  { value: 'tag', label: 'Faixa' },
  { value: 'qrcode', label: 'QR code' },
];

const BUILTIN_LAYER_LABELS: Record<string, string> = {
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

type CanvasEditableMeta = {
  label: string;
  selectionKind: 'layer' | 'zone';
  selectionId: string;
  minWidth: number;
  minHeight: number;
  accent: string;
  overlayLevel: number;
};

const BUILTIN_CANVAS_EDITABLE_META: Record<string, CanvasEditableMeta> = {
  kicker: { label: 'Kicker', selectionKind: 'layer', selectionId: 'kicker', minWidth: 140, minHeight: 32, accent: '#b6642b', overlayLevel: 5 },
  headline: { label: 'Titulo principal', selectionKind: 'layer', selectionId: 'headline', minWidth: 220, minHeight: 72, accent: '#d56d1c', overlayLevel: 5 },
  subheadline: { label: 'Subtitulo', selectionKind: 'layer', selectionId: 'subheadline', minWidth: 220, minHeight: 52, accent: '#c18651', overlayLevel: 5 },
  'campaign-badge': { label: 'Selo 3D', selectionKind: 'layer', selectionId: 'campaign-badge', minWidth: 96, minHeight: 96, accent: '#ff7a12', overlayLevel: 6 },
  footer: { label: 'Rodape', selectionKind: 'layer', selectionId: 'footer', minWidth: 260, minHeight: 48, accent: '#4f2a16', overlayLevel: 2 },
  'footer-content': { label: 'Conteudo principal', selectionKind: 'layer', selectionId: 'footer-content', minWidth: 180, minHeight: 32, accent: '#6d3d20', overlayLevel: 4 },
  'footer-legal': { label: 'Aviso legal', selectionKind: 'layer', selectionId: 'footer-legal', minWidth: 160, minHeight: 28, accent: '#946348', overlayLevel: 4 },
  'footer-logo-left': { label: 'Logo primaria', selectionKind: 'layer', selectionId: 'footer-logo-left', minWidth: 84, minHeight: 42, accent: '#8f4618', overlayLevel: 4 },
  'footer-logo-right': { label: 'Logo secundaria', selectionKind: 'layer', selectionId: 'footer-logo-right', minWidth: 84, minHeight: 42, accent: '#b55e24', overlayLevel: 4 },
  'content-zone': { label: 'Area de conteudo', selectionKind: 'zone', selectionId: 'content-zone', minWidth: 240, minHeight: 180, accent: '#f0a15c', overlayLevel: 1 },
};

const customLayerTypeLabel = (type: TemplateBuilderCustomLayerType) => {
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

const createDefaultLayerLocks = () =>
  Object.fromEntries(TEMPLATE_BUILDER_LAYER_IDS.map((layerId) => [layerId, true])) as Record<string, boolean>;

const sanitizeLayerOrder = (order: string[] | undefined, availableIds: string[], appendMissing = false) => {
  const available = new Set(availableIds);
  const normalized = (order || []).filter((layerId, index, items) => available.has(layerId) && items.indexOf(layerId) === index);
  if (!normalized.length) {
    return [...availableIds];
  }
  return appendMissing ? [...normalized, ...availableIds.filter((layerId) => !normalized.includes(layerId))] : normalized;
};

const reorderLayerOrder = (order: string[], sourceId: string, targetId: string) => {
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

const editableTargetFromLayerId = (layerId: string): CanvasEditableTarget | null => {
  return layerId || null;
};

const editableTargetFromZoneId = (zoneId: string): CanvasEditableTarget | null => {
  return zoneId || null;
};

const createCustomLayerDraft = (
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

const parseCustomLayerDraft = (layer: JsonMap, staticBindings: JsonMap): TemplateBuilderCustomLayerDraft => {
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

const findCustomLayerDraft = (draft: TemplateBuilderDraft, target: string) => draft.customLayers.find((layer) => layer.id === target) || null;

const getCanvasEditableMeta = (draft: TemplateBuilderDraft, target: CanvasEditableTarget): CanvasEditableMeta => {
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
      tag: { minWidth: 120, minHeight: 32, accent: '#ff7a12', overlayLevel: 5 },
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

const editableBoundsDraftByTarget = (draft: TemplateBuilderDraft, target: CanvasEditableTarget): TemplateBuilderBoundsDraft => {
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

const editableVisibilityByTarget = (draft: TemplateBuilderDraft, target: CanvasEditableTarget) => {
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

const updateEditableBoundsByTarget = (
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

const clampEditableBounds = (
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

const defaultCardDraft = (): TemplateBuilderCardDraft => ({
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

const createDefaultTemplateBuilderDraft = (template?: OfferTemplate | null, variant?: OfferTemplateVariant | null): TemplateBuilderDraft => {
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
    backgroundColor: '#fff7ef',
    backgroundStart: '#fff7ef',
    backgroundEnd: '#ffd4b4',
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

const buildTemplateBuilderDraft = (template?: OfferTemplate | null, variant?: OfferTemplateVariant | null): TemplateBuilderDraft => {
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

const buildCustomLayerFromDraft = (layer: TemplateBuilderCustomLayerDraft, layerLocks: Record<string, boolean>): JsonMap => {
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

const buildLayerPropsFromInspectorDraft = (layer: JsonMap, draft: LayerDraft, isCustomLayer: boolean) => {
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

const buildTemplateDesignFromDraft = (draft: TemplateBuilderDraft): JsonMap => {
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
        textColor: draft.footer.textColor.trim() || '#fff4ee',
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
        textColor: draft.footer.textColor.trim() || '#fff4ee',
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
        textColor: draft.footer.textColor.trim() || '#fff4ee',
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
              color: draft.backgroundColor.trim() || '#fff7ef',
              fit: 'cover',
            }
          : draft.backgroundMode === 'gradient'
            ? {
                type: 'gradient',
                start: draft.backgroundStart.trim() || '#fff7ef',
                end: draft.backgroundEnd.trim() || '#ffd4b4',
              }
            : {
                type: 'solid',
                color: draft.backgroundColor.trim() || '#fff7ef',
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

const buildTemplateResolvedDesignFromDraft = (
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

const emptyLayerDraft: LayerDraft = {
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

const emptyZoneDraft: ZoneDraft = {
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

const readHeadline = (preview?: OfferTemplatePreview | null) => {
  const resolved = parseJson<Record<string, any>>(preview?.resolvedDesignJson, {});
  return resolved?.campaignTokens?.headline || resolved?.bindings?.static?.headline || null;
};

const StudioToolButton: React.FC<{ icon: LucideIcon; label: string; active: boolean; onClick: () => void }> = ({ icon: Icon, label, active, onClick }) => (
  <button type="button" className={`offer-studio-rail-button ${active ? 'active' : ''}`} onClick={onClick}>
    <span className="offer-studio-rail-icon-wrap">
      <Icon className="offer-studio-rail-icon" strokeWidth={2.1} />
    </span>
    <span>{label}</span>
  </button>
);

const StudioSelectField: React.FC<{ label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }> = ({ label, value, onChange, options }) => (
  <label className="offer-studio-toolbar-field">
    <span>{label}</span>
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
);

const StudioSearchResultCard: React.FC<{
  product: OfferCatalogProduct;
  inQueue: boolean;
  removingBackground?: boolean;
  onAdd: () => void;
  onCleanBackground?: () => void;
}> = ({ product, inQueue, removingBackground, onAdd, onCleanBackground }) => (
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
    <div className="offer-studio-card-actions">
      <Button type="button" variant={inQueue ? 'secondary' : 'primary'} onClick={onAdd} disabled={inQueue}>
        {inQueue ? <Check size={16} strokeWidth={2.2} /> : <Plus size={16} strokeWidth={2.2} />}
        {inQueue ? 'Na fila' : 'Adicionar'}
      </Button>
      {onCleanBackground ? (
        <Button type="button" variant="ghost" onClick={onCleanBackground} disabled={removingBackground}>
          <Scissors size={15} strokeWidth={2.1} />
          {removingBackground ? 'Limpando...' : 'Limpar fundo'}
        </Button>
      ) : null}
    </div>
  </article>
);

const StudioTemplateCard: React.FC<{ template: OfferTemplate; selected: boolean; onUse: () => void }> = ({ template, selected, onUse }) => (
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
  removingBackground?: boolean;
  onRemove: () => void;
  onCleanBackground?: () => void;
}> = ({ product, removingBackground, onRemove, onCleanBackground }) => (
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
    <div className="offer-studio-card-actions">
      {onCleanBackground ? (
        <Button type="button" variant="ghost" onClick={onCleanBackground} disabled={removingBackground}>
          <Scissors size={15} strokeWidth={2.1} />
          {removingBackground ? 'Limpando...' : 'Limpar fundo'}
        </Button>
      ) : null}
      <Button type="button" variant="secondary" onClick={onRemove}>
        <Trash2 size={16} strokeWidth={2.1} />
        Remover
      </Button>
    </div>
  </article>
);

const StudioLayerRow: React.FC<{
  layer: JsonMap;
  active: boolean;
  identified?: boolean;
  onSelect: () => void;
  draggableLayer?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onToggleVisibility?: () => void;
  onToggleLock?: () => void;
  onDelete?: () => void;
}> = ({ layer, active, identified = false, onSelect, draggableLayer = false, dragging = false, dropTarget = false, onDragStart, onDragOver, onDrop, onDragEnd, onToggleVisibility, onToggleLock, onDelete }) => {
  const Icon = layerTypeIcon(String(layer.type || layer.kind || 'layer'));
  const visibilityLabel = layer.visible === false ? 'Mostrar camada' : 'Ocultar camada';
  const lockLabel = layer.locked ? 'Desbloquear camada' : 'Bloquear camada';
  const canToggleVisibility = Boolean(onToggleVisibility);
  const canToggleLock = Boolean(onToggleLock);
  const canDelete = Boolean(onDelete);
  return (
    <div
      className={`offer-studio-structure-row ${active ? 'active' : ''} ${identified ? 'canvas-linked' : ''} ${draggableLayer ? 'draggable' : ''} ${dragging ? 'dragging' : ''} ${dropTarget ? 'drop-target' : ''}`}
      data-structure-layer-id={String(layer.id || '')}
      draggable={draggableLayer}
      onDragStart={draggableLayer ? onDragStart : undefined}
      onDragOver={draggableLayer ? onDragOver : undefined}
      onDrop={draggableLayer ? onDrop : undefined}
      onDragEnd={draggableLayer ? onDragEnd : undefined}
    >
      {draggableLayer ? (
        <span className="offer-studio-structure-grip" aria-hidden="true">
          <GripVertical size={16} strokeWidth={2.1} />
        </span>
      ) : null}
      <button type="button" className="offer-studio-structure-main" onClick={onSelect} aria-current={active || identified ? 'true' : undefined}>
        <span className="offer-studio-structure-icon">
          <Icon size={16} strokeWidth={2.1} />
        </span>
        <span className="offer-studio-structure-copy">
          <strong>{String(layer.name || layer.id || 'Camada')}</strong>
          <small>{String(layer.type || 'layer')}</small>
        </span>
        <span className="offer-studio-structure-flags">
          {identified ? <span className="offer-studio-structure-badge">Na arte</span> : null}
          {layer.locked && !canToggleLock ? <Lock size={14} strokeWidth={2.1} /> : null}
          {layer.visible === false && !canToggleVisibility ? <EyeOff size={14} strokeWidth={2.1} className="opacity-45" /> : null}
        </span>
      </button>
      {canToggleVisibility || canToggleLock || canDelete ? (
        <div className="offer-studio-structure-actions">
          {canToggleVisibility ? (
            <button
              type="button"
              className={`offer-studio-structure-lock ${layer.visible === false ? 'muted' : 'visible'}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleVisibility?.();
              }}
              title={visibilityLabel}
              aria-label={visibilityLabel}
            >
              {layer.visible === false ? <EyeOff size={15} strokeWidth={2.1} /> : <Eye size={15} strokeWidth={2.1} />}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="offer-studio-structure-lock danger"
              onClick={(event) => {
                event.stopPropagation();
                onDelete?.();
              }}
              title="Excluir camada"
              aria-label="Excluir camada"
            >
              <Trash2 size={15} strokeWidth={2.1} />
            </button>
          ) : null}
          {canToggleLock ? (
            <button
              type="button"
              className={`offer-studio-structure-lock ${layer.locked ? 'active' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleLock?.();
              }}
              title={lockLabel}
              aria-label={lockLabel}
            >
              {layer.locked ? <Lock size={15} strokeWidth={2.1} /> : <Unlock size={15} strokeWidth={2.1} />}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const StudioZoneCard: React.FC<{
  zone: JsonMap;
  active: boolean;
  identified?: boolean;
  onSelect: () => void;
}> = ({ zone, active, identified = false, onSelect }) => (
  <button
    type="button"
    className={`offer-studio-zone-card ${active ? 'active' : ''} ${identified ? 'canvas-linked' : ''}`}
    data-structure-zone-id={String(zone.id || '')}
    onClick={onSelect}
    aria-current={active || identified ? 'true' : undefined}
  >
    <div>
      <span className="section-kicker">{String(zone.layout || 'grid')}</span>
      <strong>{String(zone.name || zone.id || 'Zona')}</strong>
    </div>
    <div className="offer-studio-zone-meta">
      {identified ? <span className="offer-studio-structure-badge">Na arte</span> : null}
      <span>{Number(zone.slotCount || 0)} slots</span>
      <span>{Number(zone.columns || 1)} colunas</span>
    </div>
  </button>
);

const StudioPropertyRow: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="offer-studio-property-row">
    <span>{label}</span>
    <strong>{value ?? '-'}</strong>
  </div>
);

const StudioBoundsFields: React.FC<{
  value: TemplateBuilderBoundsDraft;
  onChange: (next: TemplateBuilderBoundsDraft) => void;
}> = ({ value, onChange }) => (
  <div className="offer-studio-bounds-grid">
    <label className="offer-studio-text-field">
      <span>X</span>
      <input className="input" inputMode="numeric" value={value.x} onChange={(event) => onChange({ ...value, x: event.target.value })} />
    </label>
    <label className="offer-studio-text-field">
      <span>Y</span>
      <input className="input" inputMode="numeric" value={value.y} onChange={(event) => onChange({ ...value, y: event.target.value })} />
    </label>
    <label className="offer-studio-text-field">
      <span>Largura</span>
      <input className="input" inputMode="numeric" value={value.w} onChange={(event) => onChange({ ...value, w: event.target.value })} />
    </label>
    <label className="offer-studio-text-field">
      <span>Altura</span>
      <input className="input" inputMode="numeric" value={value.h} onChange={(event) => onChange({ ...value, h: event.target.value })} />
    </label>
  </div>
);

const StudioColorField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <label className="offer-studio-text-field offer-studio-color-field">
    <span>{label}</span>
    <div className="offer-studio-color-control">
      <input
        className="offer-studio-color-picker"
        type="color"
        value={normalizeHexColor(value, placeholder || '#ffffff')}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      />
      <input
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
    </div>
  </label>
);

const StudioAssetStatus: React.FC<{
  label: string;
  storageKey?: string | null;
  hasAsset?: boolean;
  readyLabel?: string;
  emptyLabel?: string;
}> = ({ label, storageKey, hasAsset = false, readyLabel = 'Imagem persistida no banco e no storage.', emptyLabel = 'Nenhuma imagem enviada ainda.' }) => {
  const ready = Boolean(storageKey) || hasAsset;
  return (
    <div className={`offer-studio-asset-status ${ready ? 'is-ready' : 'is-empty'}`} role="status" aria-live="polite">
      <div className="offer-studio-asset-status-head">
        <ImageIcon size={16} strokeWidth={2} />
        <span>{label}</span>
      </div>
      <strong>{ready ? readyLabel : emptyLabel}</strong>
      <small>{storageKey ? `Storage key: ${storageKey}` : ready ? 'Arquivo gerenciado pelo template.' : 'Envie um arquivo para vincular este asset ao template.'}</small>
    </div>
  );
};

const StudioCollapsibleSection: React.FC<{
  title: string;
  description?: string;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
}> = ({ title, description, collapsed, onToggle, className, containerClassName, children }) => (
  <section className={[containerClassName || 'offer-studio-theme-card', 'offer-studio-collapsible-section', collapsed ? 'is-collapsed' : '', className].filter(Boolean).join(' ')}>
    <button type="button" className={`offer-studio-panel-subhead offer-studio-panel-subhead-button ${collapsed ? 'is-collapsed' : ''}`} onClick={onToggle} aria-expanded={!collapsed}>
      <span className="offer-studio-collapsible-copy">
        <span className="section-kicker">{title}</span>
        {description ? <small>{description}</small> : null}
      </span>
      <span className="offer-studio-collapsible-toggle">
        <span className="offer-studio-collapsible-toggle-label">{collapsed ? 'Expandir' : 'Recolher'}</span>
        {collapsed ? <ChevronDown size={16} strokeWidth={2.2} /> : <ChevronUp size={16} strokeWidth={2.2} />}
      </span>
    </button>
    {!collapsed ? children : null}
  </section>
);

const OfferDesigner: React.FC = () => {
  const { buildUrl, isSuperAdminMode, marketId, userName } = useOffersAppSession();
  const navigate = useNavigate();
  const stageSurfaceRef = useRef<HTMLDivElement | null>(null);
  const stageArtboardRef = useRef<HTMLDivElement | null>(null);
  const pendingStageViewportRef = useRef<{ anchorX: number; anchorY: number; nextScale: number } | null>(null);
  const [searchParams] = useSearchParams();
  const requestedTemplateId = searchParams.get('templateId') || '';
  const requestedJobId = searchParams.get('jobId') || '';
  const requestedProductId = searchParams.get('productId') || '';
  const requestedMarketId = searchParams.get('marketId') || '';
  const adminCampaignsRoute = buildUrl('/ofertas/campanhas');
  const [overview, setOverview] = useState<OfferOverview | null>(null);
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
  const [activeTool, setActiveTool] = useState<StudioTool>('products');
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
  const itemsPerPage = useMemo(() => (generationMode === 'CATALOG' ? gridPresetToCount(gridPreset) : 1), [generationMode, gridPreset]);
  const pageEstimate = useMemo(() => {
    if (generationMode === 'INDIVIDUAL') return Math.max(selectedProducts.length, 1);
    const basePages = Math.max(Math.ceil(selectedProducts.length / Math.max(itemsPerPage, 1)), 1);
    return coverEnabled ? basePages + 1 : basePages;
  }, [coverEnabled, generationMode, itemsPerPage, selectedProducts.length]);
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
      { value: 'AUTO', label: `Ajustar (${formatZoomLabel(fitStageScale)})` },
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
    () => (isSuperAdminMode ? TOOL_OPTIONS.filter((tool) => tool.key === 'themes') : TOOL_OPTIONS),
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
    () => (activeTool === 'themes' ? clampNumber(templateBuilderDraft.contentZone.slotCount, itemsPerPage, 1, 24) : generationMode === 'CATALOG' ? itemsPerPage : 1),
    [activeTool, generationMode, itemsPerPage, templateBuilderDraft.contentZone.slotCount],
  );
  const effectiveResolvedDesignJson = useMemo(
    () => (activeTool === 'themes' ? builderResolvedDesignJson : preview?.resolvedDesignJson || null),
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
  const canvasHighlightedTarget = useMemo(
    () => canvasEditTarget || editableTargetFromLayerId(selectedLayerId) || editableTargetFromZoneId(selectedZoneId),
    [canvasEditTarget, selectedLayerId, selectedZoneId],
  );
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

  const buildDesignerRoute = (jobId: string) => buildUrl('/ofertas', new URLSearchParams({ jobId }).toString());

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
        const [templateData, overviewData] = await Promise.all([
          offersService.getTemplates(effectiveMarketId),
          offersService.getOverview(effectiveMarketId),
        ]);
        setTemplates(templateData);
        setOverview(overviewData);
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
  }, [effectiveMarketId, isSuperAdminMode, marketsLoading, requestedJobId, requestedProductId, requestedTemplateId]);

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
    if (isSuperAdminMode && activeTool !== 'themes') {
      setActiveTool('themes');
    }
  }, [activeTool, isSuperAdminMode]);

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
    if (!(isSuperAdminMode && activeTool === 'themes')) {
      setCanvasEditInteraction(null);
      setCanvasEditTarget(null);
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

    const handlePointerUp = () => setCanvasEditInteraction(null);

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

  const syncCanvasEditSelection = (target: CanvasEditableTarget | null) => {
    if (!target) {
      return;
    }

    const meta = getCanvasEditableMeta(templateBuilderDraft, target);
    if (meta.selectionKind === 'zone') {
      setSelectedLayerId('');
      setSelectedZoneId(meta.selectionId);
      revealStructureSelection('zone', meta.selectionId);
      return;
    }

    setSelectedLayerId(meta.selectionId);
    revealStructureSelection('layer', meta.selectionId);
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
    syncCanvasEditSelection(target);
    setCanvasEditInteraction({
      target,
      mode,
      anchorX: mode === 'move' ? localX - descriptor.bounds.x : localX,
      anchorY: mode === 'move' ? localY - descriptor.bounds.y : localY,
      startBounds: descriptor.bounds,
    });
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
      setResults(bestMatches);
      const mergedSelection = mergeUniqueProducts(selectedProducts, bestMatches);
      setSelectedProducts(mergedSelection);
      setProductPanelMode('selected');
      await refreshPreview('autofill', mergedSelection.map((product) => product.productId));
      setLookupNotice(`${bestMatches.length} produtos foram adicionados automaticamente a partir da lista colada.`);
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
          <div className="mb-5 rounded-[22px] border border-[rgba(87,51,30,0.1)] bg-[rgba(255,247,240,0.82)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
            <strong className="block text-[color:var(--text-primary)]">Campanha em ediÃ§Ã£o</strong>
            <span>As alteraÃ§Ãµes feitas no estÃºdio atualizam a campanha salva, sem criar um registro novo.</span>
          </div>
        ) : null}

        <div className={`offer-studio-shell w-full ${isSuperAdminMode && activeTool === 'themes' ? 'is-template-builder' : ''} ${toolPanelCollapsed ? 'is-panel-collapsed' : ''}`}>
          <aside className="offer-studio-rail">
            <div className="offer-studio-rail-brand">
              <span className="offer-studio-rail-badge"><Sparkles className="offer-studio-rail-brand-icon" strokeWidth={2.1} /></span>
              <div>
                <strong>Designer de ofertas</strong>
                <small>Automação visual nativa do MercadoFlow</small>
              </div>
            </div>
            <div className="offer-studio-rail-nav">
              {visibleToolOptions.map((tool) => <StudioToolButton key={tool.key} icon={tool.icon} label={tool.label} active={activeTool === tool.key} onClick={() => setActiveTool(tool.key)} />)}
            </div>
            <div className="offer-studio-rail-summary">
              <span className="section-kicker">Resumo</span>
              <strong>{selectedProducts.length} produtos na fila</strong>
              <small>{pageEstimate} página(s) estimadas · {selectedVariant?.name || selectedTemplate?.defaultVariantKey || 'formato principal'}</small>
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
                    <button type="button" className={productPanelMode === 'search' ? 'active' : ''} onClick={() => setProductPanelMode('search')}>Pesquisar</button>
                    <button type="button" className={productPanelMode === 'selected' ? 'active' : ''} onClick={() => setProductPanelMode('selected')}>Meus produtos</button>
                  </div>
                </div>

                {productPanelMode === 'search' ? (
                  <>
                    <div className="offer-studio-search-box">
                      <button type="button" className="offer-studio-section-toggle" onClick={() => setSearchBoxCollapsed((current) => !current)} aria-expanded={!searchBoxCollapsed}>
                        <span>
                          <strong>Buscar no catálogo</strong>
                          <small>Digite um produto ou cole uma lista para preenchimento automático.</small>
                        </span>
                        {searchBoxCollapsed ? <ChevronDown size={16} strokeWidth={2.2} /> : <ChevronUp size={16} strokeWidth={2.2} />}
                      </button>
                      {!searchBoxCollapsed ? (
                        <>
                          <label className="offer-studio-text-field">
                            <span>Buscar no catálogo</span>
                            <input className="input" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Digite nome, GTIN ou marca" />
                          </label>
                          <label className="offer-studio-text-field">
                            <span>Cole a lista de produtos</span>
                            <textarea className="textarea" rows={6} value={bulkInput} onChange={(event) => setBulkInput(event.target.value)} placeholder={'Ex.: coca cola 2l\narroz tio joao 5kg\ncerveja heineken 600ml'} />
                          </label>
                          <div className="offer-studio-inline-actions">
                            <Button type="button" onClick={handleBulkLookup} disabled={bulkSearching}>
                              <PackageSearch size={16} strokeWidth={2.1} />
                              {bulkSearching ? 'Processando lista...' : 'Buscar produtos'}
                            </Button>
                            <Button type="button" variant="secondary" onClick={handleAddAllResults} disabled={!results.length}>
                              <Boxes size={16} strokeWidth={2.1} />
                              Adicionar resultados
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </div>

                    <div className="offer-studio-panel-list">
                      <button type="button" className="offer-studio-panel-subhead offer-studio-panel-subhead-button" onClick={() => setResultsCollapsed((current) => !current)} aria-expanded={!resultsCollapsed}>
                        <span className="section-kicker">Resultado da busca</span>
                        <span className="offer-studio-panel-subhead-meta">
                          <small>{searching ? 'Buscando...' : `${results.length} itens encontrados`}</small>
                          {resultsCollapsed ? <ChevronDown size={16} strokeWidth={2.2} /> : <ChevronUp size={16} strokeWidth={2.2} />}
                        </span>
                      </button>
                      {!resultsCollapsed ? (
                        results.length === 0 ? (
                          <div className="offer-studio-empty-card">Pesquise um item do catálogo ou cole uma lista para preencher a arte automaticamente.</div>
                        ) : (
                          results.map((product) => (
                            <StudioSearchResultCard
                              key={product.productId}
                              product={product}
                              inQueue={selectedProductIds.has(product.productId)}
                              removingBackground={removingBackgroundId === product.productId}
                              onAdd={() => addProduct(product)}
                              onCleanBackground={() => void handleCleanBackground(product)}
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
                          onRemove={() => removeProduct(product.productId)}
                          onCleanBackground={() => void handleCleanBackground(product)}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {activeTool === 'themes' ? (
              <div className="offer-studio-panel-stack">
                <div className={`offer-studio-panel-header ${isSuperAdminMode ? 'offer-studio-panel-header-builder' : ''}`}>
                  <div className="offer-studio-panel-header-copy">
                    <span className="section-kicker">Temas</span>
                    <h2>{isSuperAdminMode ? 'Template builder' : 'Modelos prontos'}</h2>
                  </div>
                  {isSuperAdminMode ? (
                    <div className="offer-studio-panel-header-actions">
                      <Button type="button" variant="secondary" onClick={handleStartNewTemplate} disabled={saving || !effectiveMarketId}>
                        <Plus size={16} strokeWidth={2.1} />
                        Novo template
                      </Button>
                      <Button type="button" onClick={() => void handleCreateTemplateFromCurrent()} disabled={saving || !effectiveMarketId}>
                        <LayoutTemplate size={16} strokeWidth={2.1} />
                        {saving ? 'Salvando...' : 'Salvar como novo'}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="offer-studio-template-list">
                  {templates.map((template) => <StudioTemplateCard key={template.id} template={template} selected={selectedTemplateId === template.id} onUse={() => void handleTemplateChange(template.id)} />)}
                </div>
                {isSuperAdminMode ? (
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
                          <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.86)] px-4 py-3 text-sm text-[color:var(--text-secondary)] md:col-span-2">
                            <strong className="block text-[color:var(--text-primary)]">Templates salvos aqui aparecem no painel admin da conta.</strong>
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
                          placeholder="#fff7ef"
                        />
                      ) : null}
                      {templateBuilderDraft.backgroundMode === 'gradient' ? (
                        <>
                          <StudioColorField
                            label="Inicio do gradiente"
                            value={templateBuilderDraft.backgroundStart}
                            onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, backgroundStart: value }))}
                            placeholder="#fff7ef"
                          />
                          <StudioColorField
                            label="Fim do gradiente"
                            value={templateBuilderDraft.backgroundEnd}
                            onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, backgroundEnd: value }))}
                            placeholder="#ffd4b4"
                          />
                        </>
                      ) : null}
                      {templateBuilderDraft.backgroundMode === 'image' ? (
                        <>
                          <StudioColorField
                            label="Cor de apoio"
                            value={templateBuilderDraft.backgroundColor}
                            onChange={(value) => setTemplateBuilderDraft((current) => ({ ...current, backgroundColor: value }))}
                            placeholder="#fff7ef"
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
                      <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.62)] p-4">
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
                      <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.62)] p-4">
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
                      <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.62)] p-4">
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
                      <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.62)] p-4">
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
                  containerClassName="rounded-[28px] border border-[rgba(87,51,30,0.1)] bg-[rgba(255,255,255,0.04)] p-5"
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
                      <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-white/90 px-4 py-3"><span className="section-kicker">Camadas</span><strong className="mt-1 block text-2xl">{validation.layerCount}</strong></div>
                      <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-white/90 px-4 py-3"><span className="section-kicker">Zonas</span><strong className="mt-1 block text-2xl">{validation.zoneCount}</strong></div>
                      <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-white/90 px-4 py-3"><span className="section-kicker">Variantes</span><strong className="mt-1 block text-2xl">{validation.variantCount}</strong></div>
                    </div>
                  ) : null}
                  {validation?.messages?.length ? (
                    <ul className="mt-4 space-y-2 text-sm text-[color:var(--text-secondary)]">
                      {validation.messages.map((message) => <li key={message} className="rounded-[16px] border border-[rgba(87,51,30,0.08)] bg-white/85 px-4 py-3">{message}</li>)}
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
                ) : (
                  <div className="offer-studio-theme-grid">
                    <StudioCollapsibleSection
                      title="Template em uso"
                      description="O painel admin apenas escolhe templates prontos. A estrutura e mantida no super admin."
                      collapsed={Boolean(collapsedConfigSections.readonlyTemplate)}
                      onToggle={() => toggleConfigSection('readonlyTemplate')}
                      className="md:col-span-2"
                    >
                      <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.86)] px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                        <strong className="block text-base text-[color:var(--text-primary)]">{selectedTemplate?.name || 'Selecione um template'}</strong>
                        <p className="mt-2">{selectedTemplate?.description || 'Escolha um template para montar encartes com produtos reais, logo e rodape do mercado.'}</p>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-white/90 px-4 py-3">
                          <span className="section-kicker">Canvas</span>
                          <strong className="mt-1 block text-2xl">{selectedVariant?.canvasWidth || selectedTemplate?.canvasWidth || clampNumber(templateBuilderDraft.canvasWidth, 1080, 720, 3200)} x {selectedVariant?.canvasHeight || selectedTemplate?.canvasHeight || clampNumber(templateBuilderDraft.canvasHeight, 1350, 720, 4800)}</strong>
                        </div>
                        <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-white/90 px-4 py-3">
                          <span className="section-kicker">Slots</span>
                          <strong className="mt-1 block text-2xl">{templateBuilderDraft.contentZone.slotCount}</strong>
                        </div>
                        <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-white/90 px-4 py-3">
                          <span className="section-kicker">Rodape</span>
                          <strong className="mt-1 block text-2xl">{templateBuilderDraft.footer.visible ? 'Ativo' : 'Oculto'}</strong>
                        </div>
                      </div>
                      <div className="offer-studio-inline-actions wrap">
                        <Button type="button" variant="secondary" onClick={() => void refreshPreview('preview')} disabled={!selectedTemplateId}>
                          <RefreshCw size={16} strokeWidth={2.1} />
                          Atualizar previa
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => navigate(adminCampaignsRoute)}>
                          <Boxes size={16} strokeWidth={2.1} />
                          Ver campanhas
                        </Button>
                      </div>
                    </StudioCollapsibleSection>

                    <StudioCollapsibleSection
                      title="Estrutura"
                      description="Resumo rapido da area de produtos e do rodape."
                      collapsed={Boolean(collapsedConfigSections.readonlyStructure)}
                      onToggle={() => toggleConfigSection('readonlyStructure')}
                    >
                      <div className="offer-studio-property-grid">
                        <StudioPropertyRow label="Layout" value={templateBuilderDraft.contentZone.layout} />
                        <StudioPropertyRow label="Colunas x linhas" value={`${templateBuilderDraft.contentZone.columns} x ${templateBuilderDraft.contentZone.rows}`} />
                        <StudioPropertyRow label="Camadas" value={String(validation?.layerCount || resolvedLayers.length || 0)} />
                        <StudioPropertyRow label="Zonas" value={String(validation?.zoneCount || resolvedZones.length || 0)} />
                        <StudioPropertyRow label="Logo primaria" value={templateBuilderDraft.footerLeftLogo.visible ? 'Sim' : 'Nao'} />
                        <StudioPropertyRow label="Logo secundaria" value={templateBuilderDraft.footerRightLogo.visible ? 'Sim' : 'Nao'} />
                      </div>
                    </StudioCollapsibleSection>

                    <StudioCollapsibleSection
                      title="Card do produto"
                      description="Receita visual usada para cada item da campanha."
                      collapsed={Boolean(collapsedConfigSections.readonlyCard)}
                      onToggle={() => toggleConfigSection('readonlyCard')}
                    >
                      <div className="offer-studio-property-grid">
                        <StudioPropertyRow label="Raio do card" value={`${templateBuilderDraft.card.cardRadius}px`} />
                        <StudioPropertyRow label="Raio do preco" value={`${templateBuilderDraft.card.priceBoxRadius}px`} />
                        <StudioPropertyRow label="Mostrar unidade" value={templateBuilderDraft.card.showUnit ? 'Sim' : 'Nao'} />
                        <StudioPropertyRow label="Mostrar descricao" value={templateBuilderDraft.card.showDescription ? 'Sim' : 'Nao'} />
                        <StudioPropertyRow label="Preco anterior" value={templateBuilderDraft.card.showBaselinePrice ? 'Sim' : 'Nao'} />
                        <StudioPropertyRow label="Prefixo" value={templateBuilderDraft.card.priceLabel} />
                      </div>
                    </StudioCollapsibleSection>

                    <StudioCollapsibleSection
                      title="Camadas e zonas"
                      description="Consulta somente leitura do template selecionado."
                      collapsed={Boolean(collapsedConfigSections.readonlyLayersZones)}
                      onToggle={() => toggleConfigSection('readonlyLayersZones')}
                      className="md:col-span-2"
                    >
                      <div className="offer-studio-theme-grid">
                        <StudioCollapsibleSection
                          title="Camadas"
                          description={`${resolvedLayers.length} itens`}
                          collapsed={Boolean(collapsedConfigSections.readonlyLayers)}
                          onToggle={() => toggleConfigSection('readonlyLayers')}
                        >
                          <div className="offer-studio-structure-list">
                            {resolvedLayers.length ? (
                              resolvedLayers.map((layer, index) => (
                                <StudioLayerRow
                                  key={String(layer.id || `layer-${index}`)}
                                  layer={layer}
                                  active={String(layer.id || '') === String(activeLayer?.id || '')}
                                  identified={String(layer.id || '') === canvasSelectedLayerId}
                                  onSelect={() => setSelectedLayerId(String(layer.id || ''))}
                                />
                              ))
                            ) : (
                              <div className="offer-studio-empty-card slim">Nenhuma camada resolvida para este template.</div>
                            )}
                          </div>
                        </StudioCollapsibleSection>
                        <StudioCollapsibleSection
                          title="Zonas de produto"
                          description={`${resolvedZones.length} areas`}
                          collapsed={Boolean(collapsedConfigSections.readonlyZones)}
                          onToggle={() => toggleConfigSection('readonlyZones')}
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
                              <div className="offer-studio-empty-card slim">Nenhuma zona de produto foi resolvida.</div>
                            )}
                          </div>
                        </StudioCollapsibleSection>
                      </div>
                    </StudioCollapsibleSection>
                  </div>
                )}
              </div>
            ) : null}

            {activeTool === 'market' ? (
              <div className="offer-studio-panel-stack">
                <div className="offer-studio-panel-header compact">
                  <div>
                    <span className="section-kicker">Marca</span>
                    <h2>Perfil visual do mercado</h2>
                  </div>
                </div>

                <StudioCollapsibleSection
                  title="Rodape da conta"
                  description="O template reserva a area. Aqui o mercado define textos e logos que vao preencher o rodape."
                  collapsed={Boolean(collapsedConfigSections.marketFooter)}
                  onToggle={() => toggleConfigSection('marketFooter')}
                >
                  <div className="offer-studio-edit-grid">
                    <label className="offer-studio-text-field md:col-span-2">
                      <span>Conteudo principal do rodape</span>
                      <textarea
                        className="textarea"
                        rows={4}
                        value={marketProfile?.footerContent || ''}
                        onChange={(event) => handleMarketProfileField('footerContent', event.target.value)}
                        placeholder="Ex.: ofertas validas no fim de semana, endereco da loja, horario ou mensagem principal."
                      />
                    </label>
                    <label className="offer-studio-text-field md:col-span-2">
                      <span>Aviso legal do rodape</span>
                      <textarea
                        className="textarea"
                        rows={4}
                        value={marketProfile?.footerLegalText || ''}
                        onChange={(event) => handleMarketProfileField('footerLegalText', event.target.value)}
                        placeholder="Ex.: imagens meramente ilustrativas. consulte disponibilidade na loja."
                      />
                    </label>
                  </div>
                </StudioCollapsibleSection>

                <StudioCollapsibleSection
                  title="Logos do rodape"
                  description="Essas imagens sao aplicadas nas areas reservadas pelo template."
                  collapsed={Boolean(collapsedConfigSections.marketLogos)}
                  onToggle={() => toggleConfigSection('marketLogos')}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.62)] p-4">
                      <div className="offer-studio-panel-subhead">
                        <span className="section-kicker">Logo principal</span>
                        <small>Slot esquerdo</small>
                      </div>
                      <div className="mb-4 flex h-28 items-center justify-center rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-white">
                        {marketProfile?.primaryLogoUrl ? (
                          <OfferProductImage src={marketProfile.primaryLogoUrl} alt="Logo principal" className="h-full w-full object-contain p-4" />
                        ) : (
                          <span className="text-sm text-[color:var(--text-secondary)]">Nenhuma logo enviada</span>
                        )}
                      </div>
                      <div className="mb-4">
                        <StudioAssetStatus
                          label="Logo principal"
                          storageKey={marketProfile?.primaryLogoStorageKey}
                          hasAsset={Boolean(marketProfile?.primaryLogoUrl)}
                        />
                      </div>
                      <label className="offer-studio-text-field">
                        <span>Upload da logo principal</span>
                        <input
                          className="input"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={(event) => void handleUploadMarketLogo('PRIMARY', event.target.files?.[0])}
                          disabled={uploadingAsset === 'market-primary'}
                        />
                      </label>
                    </div>

                    <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.62)] p-4">
                      <div className="offer-studio-panel-subhead">
                        <span className="section-kicker">Logo secundaria</span>
                        <small>Slot direito</small>
                      </div>
                      <div className="mb-4 flex h-28 items-center justify-center rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-white">
                        {marketProfile?.secondaryLogoUrl ? (
                          <OfferProductImage src={marketProfile.secondaryLogoUrl} alt="Logo secundaria" className="h-full w-full object-contain p-4" />
                        ) : (
                          <span className="text-sm text-[color:var(--text-secondary)]">Nenhuma logo enviada</span>
                        )}
                      </div>
                      <div className="mb-4">
                        <StudioAssetStatus
                          label="Logo secundaria"
                          storageKey={marketProfile?.secondaryLogoStorageKey}
                          hasAsset={Boolean(marketProfile?.secondaryLogoUrl)}
                        />
                      </div>
                      <label className="offer-studio-text-field">
                        <span>Upload da logo secundaria</span>
                        <input
                          className="input"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={(event) => void handleUploadMarketLogo('SECONDARY', event.target.files?.[0])}
                          disabled={uploadingAsset === 'market-secondary'}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="offer-studio-inline-actions wrap">
                    <Button type="button" onClick={() => void handleSaveMarketProfile()} disabled={savingMarketProfile}>
                      <Factory size={16} strokeWidth={2.1} />
                      {savingMarketProfile ? 'Salvando...' : 'Salvar perfil do mercado'}
                    </Button>
                  </div>
                </StudioCollapsibleSection>
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
                    <span className="section-kicker">Campaign kit ativo</span>
                    <small>{selectedCampaignKit?.seasonKey || 'Campanha livre'}</small>
                  </div>
                  <div className="rounded-[20px] border border-[rgba(87,51,30,0.08)] bg-white/85 px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                    <strong className="block text-base text-[color:var(--text-primary)]">{selectedCampaignKit?.name || 'Sem campanha selecionada'}</strong>
                    <p className="mt-2">{selectedCampaignKit?.description || 'Escolha uma campanha para aplicar headline, selo e tokens sazonais ao template.'}</p>
                  </div>
                </section>

                <section className="offer-studio-insight-block">
                  <div className="offer-studio-panel-subhead">
                    <span className="section-kicker">Sazonalidade próxima</span>
                    <small>{overview?.seasonalSuggestions?.length || 0} itens</small>
                  </div>
                  <div className="offer-studio-mini-list">
                    {overview?.seasonalSuggestions?.slice(0, 6).map((product) => (
                      <StudioSearchResultCard
                        key={product.productId}
                        product={product as unknown as OfferCatalogProduct}
                        inQueue={selectedProductIds.has(product.productId)}
                        onAdd={() => void addProductById(product.productId)}
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
                        onAdd={() => void addProductById(product.productId)}
                      />
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
                    <h2>Campanha e legenda</h2>
                  </div>
                  <Button type="button" variant="secondary" onClick={handleCopyText} disabled={copying}>
                    <Copy size={16} strokeWidth={2.1} />
                    {copying ? 'Copiando...' : 'Copiar texto'}
                  </Button>
                </div>
                <StudioCollapsibleSection
                  title="Texto da arte"
                  description="Esses campos alimentam o topo do template sem alterar a estrutura."
                  collapsed={Boolean(collapsedConfigSections.copyText)}
                  onToggle={() => toggleConfigSection('copyText')}
                >
                  <div className="offer-studio-edit-grid">
                    <label className="offer-studio-text-field">
                      <span>Kicker</span>
                      <input className="input" value={campaignKicker} onChange={(event) => setCampaignKicker(event.target.value)} placeholder="Ex.: Ofertao da semana" />
                    </label>
                    <label className="offer-studio-text-field">
                      <span>Selo</span>
                      <input className="input" value={campaignBadgeLabel} onChange={(event) => setCampaignBadgeLabel(event.target.value)} placeholder="Ex.: Oferta" />
                    </label>
                    <label className="offer-studio-text-field md:col-span-2">
                      <span>Titulo</span>
                      <input className="input" value={campaignHeadline} onChange={(event) => setCampaignHeadline(event.target.value)} placeholder="Ex.: Ofertas da semana" />
                    </label>
                    <label className="offer-studio-text-field md:col-span-2">
                      <span>Subtitulo</span>
                      <textarea
                        className="textarea"
                        rows={4}
                        value={campaignSubheadline}
                        onChange={(event) => setCampaignSubheadline(event.target.value)}
                        placeholder="Ex.: selecione produtos para montar a arte automaticamente."
                      />
                    </label>
                  </div>
                </StudioCollapsibleSection>
                <div className="offer-studio-copy-box">
                  <p>Gere um texto de apoio para redes sociais e comunicacao acessivel com base nos produtos selecionados e na campanha ativa.</p>
                  <textarea className="textarea" rows={18} value={socialCopy} readOnly />
                </div>
              </div>
            ) : null}

            {activeTool === 'publish' ? (
              <div className="offer-studio-panel-stack">
                <div className="offer-studio-panel-header compact">
                  <div>
                    <span className="section-kicker">Publicação</span>
                    <h2>{isEditingCampaign ? 'Atualizar campanha' : 'Salvar campanha'}</h2>
                  </div>
                </div>
                <StudioCollapsibleSection
                  title="Configuracao de publicacao"
                  description="Defina campanha, saida, qualidade e canais antes de salvar."
                  collapsed={Boolean(collapsedConfigSections.publishConfig)}
                  onToggle={() => toggleConfigSection('publishConfig')}
                  containerClassName="offer-studio-publish-box"
                >
                  <label className="offer-studio-text-field">
                    <span>Nome da campanha</span>
                    <input className="input" value={jobName} onChange={(event) => setJobName(event.target.value)} placeholder="Ex.: Encarte fim de semana" />
                  </label>
                  <label className="offer-studio-text-field">
                    <span>Saída principal</span>
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
                  <label className="offer-studio-text-field">
                    <span>Qualidade de render</span>
                    <select className="input" value={renderQuality} onChange={(event) => setRenderQuality(event.target.value)}>
                      {QUALITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <div className="offer-studio-summary-card">
                    <strong>{selectedProducts.length} produtos</strong>
                    <span>{pageEstimate} página(s) estimadas</span>
                    <span>{selectedVariant?.name || 'Formato principal'} · {selectedTemplate?.name || 'Sem modelo'}</span>
                  </div>
                  <div className="space-y-3">
                    <span className="section-kicker">Canais de publicação</span>
                    <div className="flex flex-wrap gap-2">
                      {PUBLISH_TARGET_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => togglePublishTarget(option.value)}
                          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${publishTargets.includes(option.value) ? 'border-transparent bg-[color:var(--accent-primary)] text-white shadow-[0_14px_24px_rgba(255,106,0,0.22)]' : 'border-[rgba(87,51,30,0.1)] bg-white text-[color:var(--text-primary)]'}`}
                        >
                          {publishTargets.includes(option.value) ? <Check size={14} strokeWidth={2.1} /> : <Target size={14} strokeWidth={2.1} />}
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="offer-studio-inline-actions wrap">
                    <Button type="button" onClick={handleSaveCampaign} disabled={saving || !selectedProducts.length || !selectedTemplateId}>
                      <WandSparkles size={16} strokeWidth={2.1} />
                      {saving ? (isEditingCampaign ? 'Atualizando...' : 'Salvando...') : (isEditingCampaign ? 'Atualizar campanha' : 'Salvar campanha')}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => navigate(adminCampaignsRoute)}>
                      <Boxes size={16} strokeWidth={2.1} />
                      Ver campanhas
                    </Button>
                  </div>
                </StudioCollapsibleSection>
              </div>
            ) : null}
          </aside>

          <section className="offer-studio-workspace">
            <div className="offer-studio-workspace-topbar">
              <button type="button" className="offer-studio-panel-toggle" onClick={() => setToolPanelCollapsed((current) => !current)} aria-label={toolPanelCollapsed ? 'Expandir painel de ferramentas' : 'Recolher painel de ferramentas'}>
                {toolPanelCollapsed ? <ChevronRight size={16} strokeWidth={2.2} /> : <ChevronLeft size={16} strokeWidth={2.2} />}
                <span>{toolPanelCollapsed ? 'Expandir ferramentas' : 'Recolher ferramentas'}</span>
              </button>
            </div>

            <div className="offer-studio-toolbar">
              <StudioSelectField label="Modelo" value={selectedTemplateId} onChange={(value) => void handleTemplateChange(value)} options={templateOptions.length ? templateOptions : [{ value: '', label: 'Sem modelo' }]} />
              <StudioSelectField label="Variante" value={selectedVariantKey} onChange={setSelectedVariantKey} options={variantOptions.length ? variantOptions : [{ value: '', label: 'Formato principal' }]} />
              <StudioSelectField label="Brand kit" value={selectedBrandKitId} onChange={setSelectedBrandKitId} options={brandKitOptions.length ? brandKitOptions : [{ value: '', label: 'Sem brand kit' }]} />
              <StudioSelectField label="Campanha" value={selectedCampaignKitId} onChange={setSelectedCampaignKitId} options={campaignKitOptions.length ? campaignKitOptions : [{ value: '', label: 'Sem campanha' }]} />
              {!isSuperAdminMode ? (
                <>
                  <StudioSelectField label="Grade" value={gridPreset} onChange={setGridPreset} options={[...GRID_PRESET_OPTIONS]} />
                  <StudioSelectField label="Boxes de produtos" value={productBoxMode} onChange={setProductBoxMode} options={[...PRODUCT_BOX_OPTIONS]} />
                  <StudioSelectField label="Texto" value={textMode} onChange={setTextMode} options={[...TEXT_MODE_OPTIONS]} />
                  <StudioSelectField label="Cores" value={colorMode} onChange={setColorMode} options={[...COLOR_MODE_OPTIONS]} />
                  <label className="offer-studio-toggle-field">
                    <span>Gerar capa</span>
                    <button type="button" className={`offer-studio-toggle ${coverEnabled ? 'active' : ''}`} onClick={() => setCoverEnabled((current) => !current)}>
                      <span />
                    </button>
                  </label>
                  <StudioSelectField label="Rodape" value={footerMode} onChange={setFooterMode} options={[...FOOTER_OPTIONS]} />
                </>
              ) : null}
            </div>

            <div className="offer-studio-stage-wrap">
              <div className="offer-studio-stage-header">
                <div>
                  <span className="section-kicker">Prévia da arte</span>
                  <h2>{activeTool === 'themes' ? templateBuilderDraft.name || selectedTemplate?.name || 'Selecione um modelo' : selectedTemplate?.name || 'Selecione um modelo'}</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedVariant ? <span className="sales-pill soft">{selectedVariant.name}</span> : null}
                    {selectedBrandKit ? <span className="sales-pill soft"><Factory size={14} strokeWidth={2.1} /> {selectedBrandKit.name}</span> : null}
                    {selectedCampaignKit ? <span className="sales-pill soft"><Palette size={14} strokeWidth={2.1} /> {selectedCampaignKit.name}</span> : null}
                    {previewing ? <span className="sales-pill soft"><RefreshCw size={14} className="animate-spin" strokeWidth={2.1} /> Atualizando</span> : null}
                  </div>
                </div>
                <div className="offer-studio-stage-meta">
                  {isSuperAdminMode ? (
                    <>
                      <span>{templateBuilderDraft.channel || 'PRINT'}</span>
                      <span>{templateBuilderDraft.contentZone.slotCount} slots</span>
                    </>
                  ) : (
                    <>
                      <span>{generationMode === 'CATALOG' ? 'Encarte automático' : 'Peças individuais'}</span>
                      {isEditingCampaign ? <span>Campanha em edicao</span> : null}
                      <span>{stageGridLimit} slots</span>
                    </>
                  )}
                </div>
              </div>

              {isSuperAdminMode && activeTool === 'themes' && canvasEditTarget ? (
                <div className="offer-studio-stage-edit-banner">
                  <strong>Editando na arte: {activeCanvasEditLabel}</strong>
                  <span>Arraste a area para mover e use o canto inferior direito para redimensionar.</span>
                </div>
              ) : null}

              <div ref={stageSurfaceRef} className="offer-studio-stage-surface">
                <div className="offer-studio-stage-canvas" style={{ width: `${scaledStageWidth}px`, height: `${scaledStageHeight}px` }}>
                  <div ref={stageArtboardRef} className="offer-studio-stage-artboard" style={{ width: `${stageCanvasWidth}px`, height: `${stageCanvasHeight}px`, transform: `scale(${stageScale})`, transformOrigin: 'top left' }}>
                    <OfferCanvasPreview template={selectedTemplate} resolvedDesignJson={effectiveResolvedDesignJson} products={stageProducts} gridLimit={stageGridLimit} footerText={activeTool === 'themes' ? null : footerText} respectCanvasDimensions className={`offer-studio-canvas-preview color-${colorMode.toLowerCase()} mode-${productBoxMode.toLowerCase()}`} />
                    {isSuperAdminMode && activeTool === 'themes' ? (
                      <div className="offer-studio-stage-editor">
                        {canvasEditableOverlays.map((item) => (
                          <div
                            key={item.key}
                            className={`offer-studio-stage-guide ${canvasHighlightedTarget === item.key ? 'active' : ''} ${item.editing ? 'editing' : ''} ${item.visible ? '' : 'is-hidden'}`}
                            style={{
                              left: `${item.bounds.x}px`,
                              top: `${item.bounds.y}px`,
                              width: `${item.bounds.w}px`,
                              height: `${item.bounds.h}px`,
                              color: item.accent,
                              background: `${item.accent}1a`,
                              zIndex: item.editing ? item.overlayLevel + 10 : item.overlayLevel,
                            }}
                          >
                            <button
                              type="button"
                              className="offer-studio-stage-guide-body"
                              onMouseDown={item.editing ? (event) => handleCanvasEditPointerStart(item.key, 'move', event) : undefined}
                              onClick={() => syncCanvasEditSelection(item.key)}
                            >
                              <span className="offer-studio-stage-guide-label">{item.label}</span>
                            </button>
                            <button
                              type="button"
                              className="offer-studio-stage-guide-handle"
                              onMouseDown={item.editing ? (event) => handleCanvasEditPointerStart(item.key, 'resize', event) : undefined}
                              aria-label={`Redimensionar ${item.label}`}
                              title={`Redimensionar ${item.label}`}
                              disabled={!item.editing}
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="offer-studio-output-bar">
                <div className="offer-studio-output-meta">
                  {isSuperAdminMode ? (
                    <>
                      <strong>{selectedVariant?.canvasWidth || clampNumber(templateBuilderDraft.canvasWidth, 1080, 720, 3200)} x {selectedVariant?.canvasHeight || clampNumber(templateBuilderDraft.canvasHeight, 1350, 720, 4800)}</strong>
                      <span>{validation?.layerCount || resolvedLayers.length || 0} camadas</span>
                      <span>{validation?.zoneCount || resolvedZones.length || 0} zonas</span>
                    </>
                  ) : (
                    <>
                      <strong>Página 1 de {pageEstimate}</strong>
                      <span>{selectedProducts.length} produtos selecionados</span>
                      <span>{validation?.layerCount || 0} camadas · {validation?.zoneCount || 0} zonas</span>
                    </>
                  )}
                </div>
                <div className="offer-studio-output-actions">
                  <div className="offer-studio-zoom-control">
                    <span>Zoom da arte</span>
                    <div className="offer-studio-zoom-control-row">
                      <button
                        type="button"
                        className="offer-studio-zoom-button"
                        onClick={() => handleZoomStep('out')}
                        aria-label="Diminuir zoom"
                        title="Diminuir zoom (Ctrl/Cmd -)"
                      >
                        <Minus size={16} strokeWidth={2.2} />
                      </button>
                      <select
                        className="input"
                        value={zoomMode}
                        onChange={(event) => handleZoomSelect(event.target.value)}
                        aria-label="Selecionar zoom da arte"
                        title="Zoom da arte"
                      >
                        {zoomOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="offer-studio-zoom-button"
                        onClick={() => handleZoomStep('in')}
                        aria-label="Aumentar zoom"
                        title="Aumentar zoom (Ctrl/Cmd +)"
                      >
                        <Plus size={16} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        className={`offer-studio-zoom-fit ${zoomMode === 'AUTO' ? 'active' : ''}`}
                        onClick={() => handleZoomSelect('AUTO')}
                        title="Ajustar ao palco (Ctrl/Cmd 0)"
                      >
                        Ajustar
                      </button>
                      <span className="offer-studio-zoom-indicator">{zoomDisplayLabel}</span>
                    </div>
                  </div>
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
                        Auto-fill
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => navigate(adminCampaignsRoute)}>
                        <Boxes size={16} strokeWidth={2.1} />
                        Campanhas
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => navigate(buildUrl('/ofertas/jobs'))}>
                        <FileText size={16} strokeWidth={2.1} />
                        Arquivos
                      </Button>
                      <Button type="button" onClick={handleSaveCampaign} disabled={saving || !selectedProducts.length || !selectedTemplateId}>
                        <WandSparkles size={16} strokeWidth={2.1} />
                        {saving ? (isEditingCampaign ? 'Atualizando...' : 'Salvando...') : (isEditingCampaign ? 'Atualizar campanha' : 'Salvar campanha')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </OffersStudioLayout>
  );
};

export default OfferDesigner;

