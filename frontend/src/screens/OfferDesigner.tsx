import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
  Factory,
  FileText,
  ImageIcon,
  LayoutTemplate,
  Layers3,
  Lock,
  PackageSearch,
  Palette,
  Plus,
  QrCode,
  RefreshCw,
  Scissors,
  SendHorizontal,
  Sparkles,
  Target,
  Tag,
  Trash2,
  Type,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import Button from '../components/common/Button';
import OffersStudioLayout from '../components/layout/OffersStudioLayout';
import OfferCanvasPreview from '../components/offers/OfferCanvasPreview';
import OfferProductImage from '../components/offers/OfferProductImage';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { offersService, type OfferCreateJobPayload } from '../services/offers.service';
import {
  OfferBackgroundRemovalResult,
  OfferBrandKit,
  OfferCampaignKit,
  OfferCatalogProduct,
  OfferGenerationJob,
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
  { key: 'calendar', icon: CalendarDays, label: 'Datas' },
  { key: 'copy', icon: FileText, label: 'Texto' },
  { key: 'publish', icon: SendHorizontal, label: 'Publicar' },
] as const;

type StudioTool = (typeof TOOL_OPTIONS)[number]['key'];
type ProductPanelMode = 'search' | 'selected';
type LayerDraft = {
  name: string;
  binding: string;
  x: string;
  y: string;
  w: string;
  h: string;
  locked: boolean;
  visible: boolean;
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
  visible: boolean;
  radius: string;
  frame: boolean;
};

type TemplateBuilderFooterLayerDraft = TemplateBuilderBoundsDraft & {
  text: string;
  visible: boolean;
  radius: string;
  background: string;
  textColor: string;
  fontSize: string;
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
  kicker: TemplateBuilderTextLayerDraft;
  headline: TemplateBuilderTextLayerDraft;
  subheadline: TemplateBuilderTextLayerDraft;
  badge: TemplateBuilderImageLayerDraft;
  footer: TemplateBuilderFooterLayerDraft;
  footerLeftLogo: TemplateBuilderImageLayerDraft;
  footerRightLogo: TemplateBuilderImageLayerDraft;
  contentZone: TemplateBuilderZoneDraft;
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

const ZOOM_OPTIONS = [
  { value: 'AUTO', label: 'Auto' },
  { value: '75', label: '75%' },
  { value: '100', label: '100%' },
  { value: '125', label: '125%' },
] as const;

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

const zoomToScale = (value: string) => (value === '75' ? 0.75 : value === '125' ? 1.25 : 1);

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
      visible: true,
      radius: '0',
      frame: false,
      ...boundsDraft(width - safeX - Math.round(width * 0.2), safeY + 8, Math.round(width * 0.18), Math.round(width * 0.18)),
    },
    footer: {
      text: 'Ofertas válidas enquanto durarem os estoques. Imagens meramente ilustrativas.',
      visible: true,
      radius: '18',
      background: '#2c1d17',
      textColor: '#fff4ee',
      fontSize: '15',
      ...boundsDraft(safeX, footerY, width - safeX * 2, footerHeight),
    },
    footerLeftLogo: {
      imageUrl: '',
      visible: false,
      radius: '0',
      frame: false,
      ...boundsDraft(safeX + 16, footerY + 10, logoWidth, footerHeight - 20),
    },
    footerRightLogo: {
      imageUrl: '',
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
  };
};

const buildTemplateBuilderDraft = (template?: OfferTemplate | null, variant?: OfferTemplateVariant | null): TemplateBuilderDraft => {
  const fallback = createDefaultTemplateBuilderDraft(template, variant);
  const parsedDesign = parseJson<JsonMap>(template?.designJson, {}) || {};
  const canvas = asMap(parsedDesign.canvas);
  const background = asMap(canvas.background);
  const bindings = asMap(parsedDesign.bindings);
  const staticBindings = asMap(bindings.static);
  const layers = asList(parsedDesign.layers);
  const zones = asList(parsedDesign.productZones);
  const kickerLayer = findLayer(layers, ['kicker']);
  const headlineLayer = findLayer(layers, ['headline'], ['headline']);
  const subheadlineLayer = findLayer(layers, ['subheadline']);
  const badgeLayer = findLayer(layers, ['campaign-badge', 'badge3d', 'badge'], ['campaignbadge']);
  const footerLayer = findLayer(layers, ['footer'], ['footer']);
  const footerLeftLogoLayer = findLayer(layers, ['footer-logo-left', 'logo-left']);
  const footerRightLogoLayer = findLayer(layers, ['footer-logo-right', 'logo-right']);
  const contentZone = zones.find((zone) => String(zone.id || '').toLowerCase().includes('content')) || zones[0] || null;

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
    kicker: {
      ...fallback.kicker,
      text: resolveStaticBinding(kickerLayer?.binding, staticBindings, fallback.kicker.text),
      visible: kickerLayer?.visible !== false,
      fontSize: asText(kickerLayer?.props?.fontSize, fallback.kicker.fontSize),
      fontWeight: asText(kickerLayer?.props?.fontWeight, fallback.kicker.fontWeight),
      ...parseLayerBoundsDraft(kickerLayer, parseBoundsDraft(fallback.kicker, { x: 0, y: 0, w: 1, h: 1 })),
    },
    headline: {
      ...fallback.headline,
      text: resolveStaticBinding(headlineLayer?.binding, staticBindings, fallback.headline.text),
      visible: headlineLayer?.visible !== false,
      fontSize: asText(headlineLayer?.props?.fontSize, fallback.headline.fontSize),
      fontWeight: asText(headlineLayer?.props?.fontWeight, fallback.headline.fontWeight),
      ...parseLayerBoundsDraft(headlineLayer, parseBoundsDraft(fallback.headline, { x: 0, y: 0, w: 1, h: 1 })),
    },
    subheadline: {
      ...fallback.subheadline,
      text: resolveStaticBinding(subheadlineLayer?.binding, staticBindings, fallback.subheadline.text),
      visible: subheadlineLayer?.visible !== false,
      fontSize: asText(subheadlineLayer?.props?.fontSize, fallback.subheadline.fontSize),
      fontWeight: asText(subheadlineLayer?.props?.fontWeight, fallback.subheadline.fontWeight),
      ...parseLayerBoundsDraft(subheadlineLayer, parseBoundsDraft(fallback.subheadline, { x: 0, y: 0, w: 1, h: 1 })),
    },
    badge: {
      ...fallback.badge,
      imageUrl: resolveStaticBinding(badgeLayer?.binding, staticBindings, fallback.badge.imageUrl),
      visible: badgeLayer ? badgeLayer.visible !== false : fallback.badge.visible,
      radius: asText(badgeLayer?.props?.radius, fallback.badge.radius),
      frame: Boolean(badgeLayer?.props?.frame ?? fallback.badge.frame),
      ...parseLayerBoundsDraft(badgeLayer, parseBoundsDraft(fallback.badge, { x: 0, y: 0, w: 1, h: 1 })),
    },
    footer: {
      ...fallback.footer,
      text: resolveStaticBinding(footerLayer?.binding, staticBindings, fallback.footer.text),
      visible: footerLayer ? footerLayer.visible !== false : fallback.footer.visible,
      radius: asText(footerLayer?.props?.radius, fallback.footer.radius),
      background: asText(footerLayer?.props?.background, fallback.footer.background),
      textColor: asText(footerLayer?.props?.textColor, fallback.footer.textColor),
      fontSize: asText(footerLayer?.props?.fontSize, fallback.footer.fontSize),
      ...parseLayerBoundsDraft(footerLayer, parseBoundsDraft(fallback.footer, { x: 0, y: 0, w: 1, h: 1 })),
    },
    footerLeftLogo: {
      ...fallback.footerLeftLogo,
      imageUrl: resolveStaticBinding(footerLeftLogoLayer?.binding, staticBindings, fallback.footerLeftLogo.imageUrl),
      visible: footerLeftLogoLayer ? footerLeftLogoLayer.visible !== false : Boolean(fallback.footerLeftLogo.imageUrl),
      radius: asText(footerLeftLogoLayer?.props?.radius, fallback.footerLeftLogo.radius),
      frame: Boolean(footerLeftLogoLayer?.props?.frame ?? fallback.footerLeftLogo.frame),
      ...parseLayerBoundsDraft(footerLeftLogoLayer, parseBoundsDraft(fallback.footerLeftLogo, { x: 0, y: 0, w: 1, h: 1 })),
    },
    footerRightLogo: {
      ...fallback.footerRightLogo,
      imageUrl: resolveStaticBinding(footerRightLogoLayer?.binding, staticBindings, fallback.footerRightLogo.imageUrl),
      visible: footerRightLogoLayer ? footerRightLogoLayer.visible !== false : Boolean(fallback.footerRightLogo.imageUrl),
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
  const footerLeftBounds = parseBoundsDraft(draft.footerLeftLogo, { x: 88, y: height - 138, w: 140, h: 52 });
  const footerRightBounds = parseBoundsDraft(draft.footerRightLogo, { x: width - 228, y: height - 138, w: 140, h: 52 });
  const zoneBounds = parseBoundsDraft(draft.contentZone, { x: 72, y: 360, w: width - 144, h: height - 540 });
  const staticBindings = {
    kicker: draft.kicker.text.trim() || 'Catálogo global',
    headline: draft.headline.text.trim() || 'Template pronto para campanhas de ofertas.',
    subheadline: draft.subheadline.text.trim() || 'Defina áreas, imagens e logos para receber os produtos automaticamente.',
    footer: {
      text: draft.footer.text.trim() || 'Ofertas válidas enquanto durarem os estoques. Imagens meramente ilustrativas.',
      logoLeftUrl: draft.footerLeftLogo.imageUrl.trim(),
      logoRightUrl: draft.footerRightLogo.imageUrl.trim(),
    },
    assets: {
      backgroundImageUrl: draft.backgroundImageUrl.trim(),
      campaignBadgeUrl: draft.badge.imageUrl.trim(),
    },
  };

  const layers: JsonMap[] = [
    {
      id: 'kicker',
      name: 'Kicker',
      type: 'tag',
      binding: 'static.kicker',
      locked: true,
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
      binding: 'static.headline',
      locked: true,
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
      binding: 'static.subheadline',
      locked: true,
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
      locked: true,
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
      binding: 'static.footer.text',
      locked: true,
      visible: draft.footer.visible,
      bounds: footerBounds,
      props: {
        radius: clampNumber(draft.footer.radius, 18, 0, 160),
        background: draft.footer.background.trim() || '#2c1d17',
        textColor: draft.footer.textColor.trim() || '#fff4ee',
        fontSize: clampNumber(draft.footer.fontSize, 15, 10, 48),
      },
    },
    {
      id: 'footer-logo-left',
      name: 'Logo rodapé esquerdo',
      type: 'image',
      binding: 'static.footer.logoLeftUrl',
      locked: true,
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
      binding: 'static.footer.logoRightUrl',
      locked: true,
      visible: draft.footerRightLogo.visible,
      bounds: footerRightBounds,
      props: {
        radius: clampNumber(draft.footerRightLogo.radius, 0, 0, 120),
        frame: draft.footerRightLogo.frame,
        fit: 'contain',
      },
    },
  ];

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
          showBaselinePrice: true,
          showUnit: true,
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
  products: OfferCatalogProduct[] = [],
) => {
  const design = buildTemplateDesignFromDraft(draft);
  const zone = asList(design.productZones)[0];
  const zoneId = String(zone?.id || 'content-zone');
  const slotCount = clampNumber(zone?.slotCount, 6, 1, 24);
  return {
    ...design,
    brandTokens: parseJson<JsonMap>(brandKit?.tokensJson, {}) || {},
    brandAssets: parseJson<JsonMap>(brandKit?.assetsJson, {}) || {},
    campaignTokens: parseJson<JsonMap>(campaignKit?.tokensJson, {}) || {},
    campaignAssets: parseJson<JsonMap>(campaignKit?.assetsJson, {}) || {},
    resolvedProducts: products.map((product) => ({ ...product })),
    zoneBindings: {
      [zoneId]: products.slice(0, slotCount).map((product) => ({ ...product })),
    },
  };
};

const emptyLayerDraft: LayerDraft = {
  name: '',
  binding: '',
  x: '',
  y: '',
  w: '',
  h: '',
  locked: false,
  visible: true,
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
  onSelect: () => void;
}> = ({ layer, active, onSelect }) => {
  const Icon = layerTypeIcon(String(layer.type || layer.kind || 'layer'));
  return (
    <button type="button" className={`offer-studio-structure-row ${active ? 'active' : ''}`} onClick={onSelect}>
      <span className="offer-studio-structure-icon">
        <Icon size={16} strokeWidth={2.1} />
      </span>
      <span className="offer-studio-structure-copy">
        <strong>{String(layer.name || layer.id || 'Camada')}</strong>
        <small>{String(layer.type || 'layer')}</small>
      </span>
      <span className="offer-studio-structure-flags">
        {layer.locked ? <Lock size={14} strokeWidth={2.1} /> : null}
        {layer.visible === false ? <Eye size={14} strokeWidth={2.1} className="opacity-45" /> : null}
      </span>
    </button>
  );
};

const StudioZoneCard: React.FC<{
  zone: JsonMap;
  active: boolean;
  onSelect: () => void;
}> = ({ zone, active, onSelect }) => (
  <button type="button" className={`offer-studio-zone-card ${active ? 'active' : ''}`} onClick={onSelect}>
    <div>
      <span className="section-kicker">{String(zone.layout || 'grid')}</span>
      <strong>{String(zone.name || zone.id || 'Zona')}</strong>
    </div>
    <div className="offer-studio-zone-meta">
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
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <label className="offer-studio-text-field">
      <span>X</span>
      <input className="input" value={value.x} onChange={(event) => onChange({ ...value, x: event.target.value })} />
    </label>
    <label className="offer-studio-text-field">
      <span>Y</span>
      <input className="input" value={value.y} onChange={(event) => onChange({ ...value, y: event.target.value })} />
    </label>
    <label className="offer-studio-text-field">
      <span>Largura</span>
      <input className="input" value={value.w} onChange={(event) => onChange({ ...value, w: event.target.value })} />
    </label>
    <label className="offer-studio-text-field">
      <span>Altura</span>
      <input className="input" value={value.h} onChange={(event) => onChange({ ...value, h: event.target.value })} />
    </label>
  </div>
);

const OfferDesigner: React.FC = () => {
  const { marketId, name } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSuperAdminMode = location.pathname.startsWith('/super-admin');
  const requestedTemplateId = searchParams.get('templateId') || '';
  const requestedJobId = searchParams.get('jobId') || '';
  const requestedProductId = searchParams.get('productId') || '';
  const requestedMarketId = searchParams.get('marketId') || '';
  const routeBase = isSuperAdminMode ? '/super-admin/ofertas' : '/app/ofertas';
  const adminCampaignsRoute = '/app/ofertas/campanhas';
  const [overview, setOverview] = useState<OfferOverview | null>(null);
  const [templates, setTemplates] = useState<OfferTemplate[]>([]);
  const [brandKits, setBrandKits] = useState<OfferBrandKit[]>([]);
  const [campaignKits, setCampaignKits] = useState<OfferCampaignKit[]>([]);
  const [templateVariants, setTemplateVariants] = useState<OfferTemplateVariant[]>([]);
  const [superAdminMarkets, setSuperAdminMarkets] = useState<SuperAdminMarketOption[]>([]);
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
  const [removingBackgroundId, setRemovingBackgroundId] = useState<string | null>(null);
  const [layerDraft, setLayerDraft] = useState<LayerDraft>(emptyLayerDraft);
  const [zoneDraft, setZoneDraft] = useState<ZoneDraft>(emptyZoneDraft);
  const [templateBuilderDraft, setTemplateBuilderDraft] = useState<TemplateBuilderDraft>(() => createDefaultTemplateBuilderDraft());
  const [loading, setLoading] = useState(true);
  const [marketsLoading, setMarketsLoading] = useState(isSuperAdminMode);
  const [searching, setSearching] = useState(false);
  const [bulkSearching, setBulkSearching] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [lookupNotice, setLookupNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSuperAdminMarket = useMemo(
    () => superAdminMarkets.find((market) => market.id === selectedSuperAdminMarketId) || null,
    [selectedSuperAdminMarketId, superAdminMarkets],
  );
  const effectiveMarketId = isSuperAdminMode ? selectedSuperAdminMarketId : marketId || '';
  const effectiveMarketName = isSuperAdminMode ? selectedSuperAdminMarket?.name || 'conta selecionada' : name || 'MercadoFlow';
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
  const stageScale = useMemo(() => zoomToScale(zoomMode), [zoomMode]);
  const footerText = useMemo(() => footerPreviewLabel(footerMode), [footerMode]);
  const templateOptions = useMemo(() => templates.map((template) => ({ value: template.id, label: template.name })), [templates]);
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
    () => (isSuperAdminMode ? TOOL_OPTIONS.filter((tool) => tool.key !== 'publish') : TOOL_OPTIONS),
    [isSuperAdminMode],
  );
  const stageProducts = useMemo(
    () => selectedProducts.slice(0, Math.max(itemsPerPage, clampNumber(templateBuilderDraft.contentZone.slotCount, itemsPerPage, 1, 24))),
    [itemsPerPage, selectedProducts, templateBuilderDraft.contentZone.slotCount],
  );
  const builderResolvedDesignJson = useMemo(
    () => JSON.stringify(buildTemplateResolvedDesignFromDraft(templateBuilderDraft, selectedBrandKit, selectedCampaignKit, stageProducts)),
    [selectedBrandKit, selectedCampaignKit, stageProducts, templateBuilderDraft],
  );
  const stageGridLimit = useMemo(
    () => (activeTool === 'themes' ? clampNumber(templateBuilderDraft.contentZone.slotCount, itemsPerPage, 1, 24) : generationMode === 'CATALOG' ? itemsPerPage : 1),
    [activeTool, generationMode, itemsPerPage, templateBuilderDraft.contentZone.slotCount],
  );
  const effectiveResolvedDesignJson = useMemo(
    () => (activeTool === 'themes' && selectedTemplateId ? builderResolvedDesignJson : preview?.resolvedDesignJson || null),
    [activeTool, builderResolvedDesignJson, preview?.resolvedDesignJson, selectedTemplateId],
  );
  const resolvedDesign = useMemo(() => parseJson<JsonMap>(effectiveResolvedDesignJson, {}) || {}, [effectiveResolvedDesignJson]);
  const resolvedLayers = useMemo(() => asList(resolvedDesign.layers), [resolvedDesign]);
  const resolvedZones = useMemo(() => asList(resolvedDesign.productZones), [resolvedDesign]);
  const activeLayer = useMemo(
    () => resolvedLayers.find((layer) => String(layer.id || '') === selectedLayerId) || resolvedLayers[0] || null,
    [resolvedLayers, selectedLayerId],
  );
  const activeZone = useMemo(
    () => resolvedZones.find((zone) => String(zone.id || '') === selectedZoneId) || resolvedZones[0] || null,
    [resolvedZones, selectedZoneId],
  );
  const activeZoneBinding = useMemo(() => {
    const zoneBindings = asMap(resolvedDesign.zoneBindings);
    return activeZone ? asList(zoneBindings[String(activeZone.id || '')]) : [];
  }, [activeZone, resolvedDesign]);

  const buildAdminDesignerRoute = (jobId: string) => `${routeBase}?${new URLSearchParams({ jobId }).toString()}`;

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
    const jobTemplateId = job.templateId || templateData[0]?.id || '';
    setActiveJobId(job.id);
    setSelectedTemplateId(jobTemplateId);
    await loadTemplateMeta(jobTemplateId, templateData, brandList, campaignList);
    setJobName(job.name || '');
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
  }, [effectiveMarketId, selectedTemplateId, selectedVariantKey, selectedBrandKitId, selectedCampaignKitId, selectedProducts]);

  useEffect(() => {
    if (isSuperAdminMode && activeTool === 'publish') {
      setActiveTool('themes');
    }
  }, [activeTool, isSuperAdminMode]);

  useEffect(() => {
    if (!lookupNotice) return undefined;
    const timer = window.setTimeout(() => setLookupNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [lookupNotice]);

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
    if (!activeLayer) {
      setLayerDraft(emptyLayerDraft);
      return;
    }
    setLayerDraft({
      name: String(activeLayer.name || activeLayer.id || ''),
      binding: String(activeLayer.binding || ''),
      x: String(bounds.x ?? ''),
      y: String(bounds.y ?? ''),
      w: String(bounds.w ?? ''),
      h: String(bounds.h ?? ''),
      locked: Boolean(activeLayer.locked),
      visible: activeLayer.visible !== false,
    });
  }, [activeLayer]);

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
    if (!effectiveMarketId || !selectedTemplateId || !selectedTemplate) return;
    const parsedDesign = buildTemplateDesignFromDraft(templateBuilderDraft);
    const nextDesign: JsonMap = {
      ...parsedDesign,
      layers: asList(parsedDesign.layers).map((layer) =>
        String(layer.id || '') !== String(activeLayer?.id || '')
          ? layer
          : {
              ...layer,
              name: layerDraft.name || layer.name || layer.id,
              binding: layerDraft.binding || undefined,
              locked: layerDraft.locked,
              visible: layerDraft.visible,
              bounds: {
                ...asMap(layer.bounds),
                x: Number(layerDraft.x || 0),
                y: Number(layerDraft.y || 0),
                w: Number(layerDraft.w || 0),
                h: Number(layerDraft.h || 0),
              },
            },
      ),
      productZones: asList(parsedDesign.productZones).map((zone) =>
        String(zone.id || '') !== String(activeZone?.id || '')
          ? zone
          : {
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
            },
      ),
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
      renderOptionsJson: JSON.stringify({
        quality: renderQuality,
        coverEnabled,
        gridPreset,
        productBoxMode,
        textMode,
        colorMode,
        footerMode,
        zoomMode,
        brandKitId: selectedBrandKitId || null,
        campaignKitId: selectedCampaignKitId || null,
      }),
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
        navigate(buildAdminDesignerRoute(persistedJob.id), { replace: true });
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
      <OffersStudioLayout mode={isSuperAdminMode ? 'super-admin' : 'admin'}>
        <div className="page offers-studio-page">
          <div className="sales-empty-card">Carregando estúdio de ofertas...</div>
        </div>
      </OffersStudioLayout>
    );
  }

  return (
    <OffersStudioLayout mode={isSuperAdminMode ? 'super-admin' : 'admin'}>
      <div className="page offers-studio-page">
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

        <div className={`offer-studio-shell ${toolPanelCollapsed ? 'is-panel-collapsed' : ''}`}>
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
                <div className="offer-studio-panel-header">
                  <div>
                    <span className="section-kicker">Temas</span>
                    <h2>Template, variantes e kits</h2>
                  </div>
                  {isSuperAdminMode ? (
                    <Button type="button" variant="secondary" onClick={() => void handleCreateTemplateFromCurrent()} disabled={saving || !effectiveMarketId}>
                      <LayoutTemplate size={16} strokeWidth={2.1} />
                      {saving ? 'Salvando...' : 'Salvar template'}
                    </Button>
                  ) : null}
                </div>
                <div className="offer-studio-template-list">
                  {templates.map((template) => <StudioTemplateCard key={template.id} template={template} selected={selectedTemplateId === template.id} onUse={() => void handleTemplateChange(template.id)} />)}
                </div>
                <div className="offer-studio-theme-grid">
                  <section className="offer-studio-theme-card md:col-span-2">
                    <div className="offer-studio-panel-subhead">
                      <span className="section-kicker">Template builder</span>
                      <small>Crie templates com áreas de fundo, selo, rodapé, logos e conteúdo.</small>
                    </div>
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
                  </section>

                  <section className="offer-studio-theme-card">
                    <div className="offer-studio-panel-subhead">
                      <span className="section-kicker">Fundo e selo</span>
                      <small>Imagem de fundo e PNG do selo 3D.</small>
                    </div>
                    <div className="offer-studio-edit-grid">
                      <label className="offer-studio-text-field">
                        <span>Modo do fundo</span>
                        <select
                          className="input"
                          value={templateBuilderDraft.backgroundMode}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, backgroundMode: event.target.value }))}
                        >
                          <option value="solid">Cor sólida</option>
                          <option value="gradient">Gradiente</option>
                          <option value="image">Imagem</option>
                        </select>
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Cor base</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.backgroundColor}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, backgroundColor: event.target.value }))}
                          placeholder="#fff7ef"
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Início do gradiente</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.backgroundStart}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, backgroundStart: event.target.value }))}
                          placeholder="#fff7ef"
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Fim do gradiente</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.backgroundEnd}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, backgroundEnd: event.target.value }))}
                          placeholder="#ffd4b4"
                        />
                      </label>
                      <label className="offer-studio-text-field md:col-span-2">
                        <span>Imagem de fundo</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.backgroundImageUrl}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, backgroundImageUrl: event.target.value }))}
                          placeholder="https://..."
                        />
                      </label>
                      <label className="offer-studio-text-field md:col-span-2">
                        <span>PNG do selo 3D</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.badge.imageUrl}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, badge: { ...current.badge, imageUrl: event.target.value } }))}
                          placeholder="https://..."
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
                  </section>

                  <section className="offer-studio-theme-card">
                    <div className="offer-studio-panel-subhead">
                      <span className="section-kicker">Rodapé e logos</span>
                      <small>Base da peça e logos posicionados em camada.</small>
                    </div>
                    <div className="offer-studio-edit-grid">
                      <label className="offer-studio-text-field md:col-span-2">
                        <span>Texto do rodapé</span>
                        <textarea
                          className="textarea"
                          rows={3}
                          value={templateBuilderDraft.footer.text}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footer: { ...current.footer, text: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Cor do fundo</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.footer.background}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footer: { ...current.footer, background: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Cor do texto</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.footer.textColor}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footer: { ...current.footer, textColor: event.target.value } }))}
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Logo esquerda</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.footerLeftLogo.imageUrl}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footerLeftLogo: { ...current.footerLeftLogo, imageUrl: event.target.value } }))}
                          placeholder="https://..."
                        />
                      </label>
                      <label className="offer-studio-text-field">
                        <span>Logo direita</span>
                        <input
                          className="input"
                          value={templateBuilderDraft.footerRightLogo.imageUrl}
                          onChange={(event) => setTemplateBuilderDraft((current) => ({ ...current, footerRightLogo: { ...current.footerRightLogo, imageUrl: event.target.value } }))}
                          placeholder="https://..."
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
                        <span>Exibir rodapé</span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={templateBuilderDraft.footerLeftLogo.visible}
                          onChange={(event) =>
                            setTemplateBuilderDraft((current) => ({ ...current, footerLeftLogo: { ...current.footerLeftLogo, visible: event.target.checked } }))
                          }
                        />
                        <span>Exibir logo esquerda</span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={templateBuilderDraft.footerRightLogo.visible}
                          onChange={(event) =>
                            setTemplateBuilderDraft((current) => ({ ...current, footerRightLogo: { ...current.footerRightLogo, visible: event.target.checked } }))
                          }
                        />
                        <span>Exibir logo direita</span>
                      </label>
                    </div>
                    <StudioBoundsFields
                      value={templateBuilderDraft.footer}
                      onChange={(next) => setTemplateBuilderDraft((current) => ({ ...current, footer: { ...current.footer, ...next } }))}
                    />
                  </section>

                  <section className="offer-studio-theme-card md:col-span-2">
                    <div className="offer-studio-panel-subhead">
                      <span className="section-kicker">Área de conteúdo</span>
                      <small>Zona onde os produtos serão distribuídos automaticamente.</small>
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
                          <span className="section-kicker">Logo esquerda</span>
                          <small>Dimensões da camada</small>
                        </div>
                        <StudioBoundsFields
                          value={templateBuilderDraft.footerLeftLogo}
                          onChange={(next) => setTemplateBuilderDraft((current) => ({ ...current, footerLeftLogo: { ...current.footerLeftLogo, ...next } }))}
                        />
                      </div>
                      <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.62)] p-4">
                        <div className="offer-studio-panel-subhead">
                          <span className="section-kicker">Logo direita</span>
                          <small>Dimensões da camada</small>
                        </div>
                        <StudioBoundsFields
                          value={templateBuilderDraft.footerRightLogo}
                          onChange={(next) => setTemplateBuilderDraft((current) => ({ ...current, footerRightLogo: { ...current.footerRightLogo, ...next } }))}
                        />
                      </div>
                    </div>
                  </section>
                </div>
                <div className="rounded-[28px] border border-[rgba(87,51,30,0.1)] bg-[rgba(255,255,255,0.04)] p-5">
                  <div className="offer-studio-panel-subhead">
                    <span className="section-kicker">Estrutura ativa</span>
                    <small>{validation?.valid ? 'Template válido' : 'Template em ajuste'}</small>
                  </div>
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
                    <section className="offer-studio-theme-card">
                      <div className="offer-studio-panel-subhead">
                        <span className="section-kicker">Camadas</span>
                        <small>{resolvedLayers.length} itens estruturados</small>
                      </div>
                      <div className="offer-studio-structure-list">
                        {resolvedLayers.length ? (
                          resolvedLayers.map((layer, index) => (
                            <StudioLayerRow
                              key={String(layer.id || `layer-${index}`)}
                              layer={layer}
                              active={String(layer.id || '') === String(activeLayer?.id || '')}
                              onSelect={() => setSelectedLayerId(String(layer.id || ''))}
                            />
                          ))
                        ) : (
                          <div className="offer-studio-empty-card slim">A prévia ainda não expôs camadas para este template.</div>
                        )}
                      </div>
                    </section>

                    <section className="offer-studio-theme-card">
                      <div className="offer-studio-panel-subhead">
                        <span className="section-kicker">Zonas de produto</span>
                        <small>{resolvedZones.length} áreas configuradas</small>
                      </div>
                      <div className="offer-studio-zone-list">
                        {resolvedZones.length ? (
                          resolvedZones.map((zone, index) => (
                            <StudioZoneCard
                              key={String(zone.id || `zone-${index}`)}
                              zone={zone}
                              active={String(zone.id || '') === String(activeZone?.id || '')}
                              onSelect={() => setSelectedZoneId(String(zone.id || ''))}
                            />
                          ))
                        ) : (
                          <div className="offer-studio-empty-card slim">Nenhuma zona foi resolvida nesta variação.</div>
                        )}
                      </div>
                    </section>
                  </div>

                  <section className="offer-studio-theme-card">
                    <div className="offer-studio-panel-subhead">
                      <span className="section-kicker">Inspector</span>
                      <small>{activeLayer ? 'Camada selecionada' : activeZone ? 'Zona selecionada' : 'Sem seleção'}</small>
                    </div>
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
                  </section>
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
                    <h2>Legenda automática</h2>
                  </div>
                  <Button type="button" variant="secondary" onClick={handleCopyText} disabled={copying}>
                    <Copy size={16} strokeWidth={2.1} />
                    {copying ? 'Copiando...' : 'Copiar texto'}
                  </Button>
                </div>
                <div className="offer-studio-copy-box">
                  <p>Gere um texto de apoio para redes sociais e comunicação acessível com base nos produtos já selecionados e na campanha ativa.</p>
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
                <div className="offer-studio-publish-box">
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
                </div>
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
              <StudioSelectField label="Rodapé" value={footerMode} onChange={setFooterMode} options={[...FOOTER_OPTIONS]} />
              <StudioSelectField label="Zoom" value={zoomMode} onChange={setZoomMode} options={[...ZOOM_OPTIONS]} />
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
                  <span>{generationMode === 'CATALOG' ? 'Encarte automático' : 'Peças individuais'}</span>
                  <span>{stageGridLimit} slots</span>
                </div>
              </div>

              <div className="offer-studio-stage-surface">
                <div className="offer-studio-stage-canvas" style={{ transform: `scale(${stageScale})` }}>
                  <OfferCanvasPreview template={selectedTemplate} resolvedDesignJson={effectiveResolvedDesignJson} products={stageProducts} gridLimit={stageGridLimit} footerText={activeTool === 'themes' ? null : footerText} className={`offer-studio-canvas-preview color-${colorMode.toLowerCase()} mode-${productBoxMode.toLowerCase()}`} />
                </div>
              </div>

              <div className="offer-studio-output-bar">
                <div className="offer-studio-output-meta">
                  <strong>Página 1 de {pageEstimate}</strong>
                  <span>{selectedProducts.length} produtos selecionados</span>
                  <span>{validation?.layerCount || 0} camadas · {validation?.zoneCount || 0} zonas</span>
                </div>
                <div className="offer-studio-output-actions">
                  <Button type="button" variant="secondary" onClick={() => setActiveTool('themes')}>
                    <LayoutTemplate size={16} strokeWidth={2.1} />
                    Modelos
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => void refreshPreview('autofill')}>
                    <WandSparkles size={16} strokeWidth={2.1} />
                    Auto-fill
                  </Button>
                  {isSuperAdminMode ? (
                    <Button type="button" onClick={() => void handleCreateTemplateFromCurrent()} disabled={saving || !effectiveMarketId}>
                      <LayoutTemplate size={16} strokeWidth={2.1} />
                      {saving ? 'Salvando...' : 'Salvar template'}
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="secondary" onClick={() => navigate(adminCampaignsRoute)}>
                        <Boxes size={16} strokeWidth={2.1} />
                        Campanhas
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
