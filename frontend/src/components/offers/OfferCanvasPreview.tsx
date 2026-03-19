import React, { useMemo } from 'react';
import { QrCode } from 'lucide-react';
import OfferProductImage from './OfferProductImage';
import { OfferCatalogProduct, OfferTemplate } from '../../types/offers.types';

interface OfferCanvasPreviewProps {
  template?: OfferTemplate | null;
  products?: OfferCatalogProduct[];
  className?: string;
  gridLimit?: number;
  footerText?: string | null;
  resolvedDesignJson?: string | null;
}

type JsonMap = Record<string, any>;

interface CanvasSlot {
  id: string;
  type: string;
  binding?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  fontSize?: number;
  fontWeight?: number;
  background?: string;
  radius?: number;
  fit?: string;
}

const defaultLegacyTemplate = {
  background: { type: 'solid', color: '#fff7ef' },
  static: { kicker: 'Oferta', headline: 'Selecione um modelo para começar.' },
  slots: [] as CanvasSlot[],
};

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const asMap = (value: unknown): JsonMap => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as JsonMap;
};

const asList = (value: unknown): JsonMap[] => (Array.isArray(value) ? value.map(asMap) : []);

const parseJson = (value?: string | null) => {
  if (!value) return {};
  try {
    return asMap(JSON.parse(value));
  } catch {
    return {};
  }
};

const getByPath = (source: JsonMap, path?: string) => {
  if (!path) return '';
  return path.split('.').reduce<any>((current, segment) => {
    if (current == null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      return current[Number(segment)];
    }
    if (typeof current !== 'object') return undefined;
    return (current as JsonMap)[segment];
  }, source);
};

const normalizeProduct = (product?: OfferCatalogProduct | JsonMap | null): JsonMap => {
  if (!product) return {};
  return {
    productId: product.productId,
    name: product.name,
    brand: product.brand,
    category: product.category,
    unit: product.unit,
    packageDescription: product.packageDescription,
    currentPrice: product.currentPrice,
    baselinePrice: product.baselinePrice,
    imageUrl: product.imageUrl,
    productUrl: product.productUrl,
    lastSoldAt: product.lastSoldAt,
  };
};

const parseLegacyTemplate = (template?: OfferTemplate | null) => {
  const parsed = parseJson(template?.designJson);
  return {
    ...defaultLegacyTemplate,
    ...parsed,
    slots: Array.isArray(parsed?.slots) ? (parsed.slots as CanvasSlot[]) : [],
  };
};

const resolveLegacyBinding = (binding: string | undefined, product: OfferCatalogProduct | undefined, parsedTemplate: JsonMap) => {
  if (!binding) return '';
  if (binding.startsWith('static.')) {
    return parsedTemplate?.static?.[binding.replace('static.', '')] ?? '';
  }
  if (!product) return '';
  switch (binding) {
    case 'product.name':
      return product.name;
    case 'product.currentPrice':
      return formatMoney(product.currentPrice);
    case 'product.unit':
      return product.unit || 'Unidade';
    case 'product.packageDescription':
      return product.packageDescription || '';
    case 'product.imageUrl':
      return product.imageUrl || '';
    case 'product.productUrl':
      return product.productUrl || '';
    default:
      return '';
  }
};

const boundsToStyle = (bounds: JsonMap, canvasWidth: number, canvasHeight: number): React.CSSProperties => ({
  left: `${(((Number(bounds.x) || 0) / canvasWidth) * 100).toFixed(2)}%`,
  top: `${(((Number(bounds.y) || 0) / canvasHeight) * 100).toFixed(2)}%`,
  width: `${(((Number(bounds.w) || canvasWidth) / canvasWidth) * 100).toFixed(2)}%`,
  height: `${(((Number(bounds.h) || canvasHeight) / canvasHeight) * 100).toFixed(2)}%`,
});

const resolveReference = (value: unknown, resolver: (binding?: string, fallback?: string) => string, fallback = '') => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return fallback;
  if (/^(https?:)?\/\//i.test(normalized) || normalized.startsWith('data:') || normalized.startsWith('/')) {
    return normalized;
  }
  return resolver(normalized, fallback);
};

const backgroundFromCanvas = (canvas: JsonMap, brandTokens: JsonMap, campaignAssets: JsonMap) => {
  const background = asMap(canvas.background);
  const colors = asMap(brandTokens.colors);
  const backgroundArt = asMap(campaignAssets.backgroundArt);
  const surface = String(colors.surface || '#fff7ef');
  const surfaceAlt = String(colors.surfaceAlt || '#ffffff');

  if (String(background.type || '').toLowerCase() === 'gradient') {
    return {
      background: `linear-gradient(180deg, ${background.start || surface} 0%, ${background.end || surfaceAlt} 100%)`,
    };
  }

  if (String(backgroundArt.type || '').toLowerCase() === 'soft-gradient') {
    return {
      background: `radial-gradient(circle at 20% 18%, rgba(255,174,92,0.35) 0%, rgba(255,174,92,0) 30%), linear-gradient(180deg, ${surface} 0%, ${surfaceAlt} 100%)`,
    };
  }

  return { background: String(background.color || surface) };
};

const OfferCanvasPreview: React.FC<OfferCanvasPreviewProps> = ({
  template,
  products = [],
  className,
  gridLimit,
  footerText,
  resolvedDesignJson,
}) => {
  const resolved = useMemo(() => parseJson(resolvedDesignJson), [resolvedDesignJson]);
  const parsedTemplate = useMemo(() => parseLegacyTemplate(template), [template]);
  const isSchemaV2 = useMemo(
    () =>
      Number(resolved.schemaVersion || 0) >= 2 ||
      Number(parsedTemplate.schemaVersion || 0) >= 2 ||
      Array.isArray(resolved.layers) ||
      Array.isArray(parsedTemplate.layers),
    [parsedTemplate, resolved],
  );

  const leadProduct = products[0];

  if (!isSchemaV2) {
    const backgroundStyle =
      parsedTemplate.background?.type === 'gradient'
        ? { background: `linear-gradient(180deg, ${parsedTemplate.background.start || '#fff7ef'} 0%, ${parsedTemplate.background.end || '#ffd4b4'} 100%)` }
        : { background: parsedTemplate.background?.color || '#fff7ef' };

    const ratio = `${template?.canvasWidth || 1080} / ${template?.canvasHeight || 1350}`;
    const hasGrid = parsedTemplate.slots.some((slot: CanvasSlot) => slot.type === 'product-grid');
    const visibleGridItems = Math.max(1, gridLimit || 6);

    return (
      <div className={`offer-canvas-preview ${className || ''}`} style={{ aspectRatio: ratio, ...backgroundStyle }}>
        {hasGrid ? (
          <div className="offer-canvas-grid-layout">
            <div className="offer-canvas-grid-head">
              <span className="sales-pill">{parsedTemplate?.static?.kicker || 'Encarte'}</span>
              <h3>{parsedTemplate?.static?.headline || 'Selecione produtos para montar a página.'}</h3>
            </div>
            <div className="offer-canvas-grid-products">
              {(products.length ? products : Array.from({ length: visibleGridItems })).slice(0, visibleGridItems).map((product: any, index: number) => (
                <article key={product?.productId || index} className="offer-mini-product-card">
                  <div className="offer-mini-product-frame">
                    <OfferProductImage src={product?.imageUrl} alt={product?.name || 'Produto'} className="offer-mini-product-image object-contain" />
                  </div>
                  <strong>{product?.name || 'Produto do encarte'}</strong>
                  <span>{product?.unit || 'Unidade'}</span>
                  <b>{product ? formatMoney(product.currentPrice) : 'R$ 0,00'}</b>
                </article>
              ))}
            </div>
          </div>
        ) : (
          parsedTemplate.slots.map((slot: CanvasSlot) => {
            const style: React.CSSProperties = {
              left: `${(((slot.x || 0) / (template?.canvasWidth || 1080)) * 100).toFixed(2)}%`,
              top: `${(((slot.y || 0) / (template?.canvasHeight || 1350)) * 100).toFixed(2)}%`,
              width: `${(((slot.w || 0) / (template?.canvasWidth || 1080)) * 100).toFixed(2)}%`,
              height: `${(((slot.h || 0) / (template?.canvasHeight || 1350)) * 100).toFixed(2)}%`,
            };
            const value = resolveLegacyBinding(slot.binding, leadProduct, parsedTemplate);

            if (slot.type === 'image') {
              return (
                <div key={slot.id} className="offer-canvas-slot image" style={{ ...style, background: slot.background || '#ffffff', borderRadius: slot.radius || 24 }}>
                  <OfferProductImage src={value} alt={leadProduct?.name || 'Produto'} className="offer-canvas-image object-contain" />
                </div>
              );
            }

            if (slot.type === 'price') {
              return (
                <div key={slot.id} className="offer-canvas-slot price" style={style}>
                  <span>Oferta</span>
                  <strong>{leadProduct ? formatMoney(leadProduct.currentPrice) : 'R$ 0,00'}</strong>
                </div>
              );
            }

            if (slot.type === 'qrcode') {
              return (
                <div key={slot.id} className="offer-canvas-slot qr" style={style}>
                  <div className="offer-canvas-qr-box">
                    <QrCode size={28} strokeWidth={2.1} />
                  </div>
                  <small>{leadProduct ? 'Link do produto' : 'QR dinâmico'}</small>
                </div>
              );
            }

            if (slot.type === 'tag' || slot.type === 'badge') {
              return (
                <div key={slot.id} className={`offer-canvas-slot ${slot.type}`} style={style}>
                  {value || (slot.type === 'tag' ? 'Faixa' : 'Badge')}
                </div>
              );
            }

            return (
              <div
                key={slot.id}
                className="offer-canvas-slot text"
                style={{
                  ...style,
                  fontSize: slot.fontSize ? `${slot.fontSize / 24}rem` : undefined,
                  fontWeight: slot.fontWeight || undefined,
                }}
              >
                {value || 'Texto do template'}
              </div>
            );
          })
        )}
        {footerText ? <div className="offer-canvas-footer-bar">{footerText}</div> : null}
      </div>
    );
  }

  const source = Object.keys(resolved).length ? resolved : parseJson(template?.designJson);
  const canvas = asMap(source.canvas);
  const canvasWidth = Number(canvas.width) || template?.canvasWidth || 1080;
  const canvasHeight = Number(canvas.height) || template?.canvasHeight || 1350;
  const brandTokens = asMap(source.brandTokens);
  const brandAssets = asMap(source.brandAssets);
  const campaignTokens = asMap(source.campaignTokens);
  const campaignAssets = asMap(source.campaignAssets);
  const marketProfile = asMap(source.marketProfile);
  const bindings = asMap(source.bindings);
  const staticBindings = asMap(bindings.static);
  const resolvedProducts = (Array.isArray(source.resolvedProducts) ? source.resolvedProducts : products.map(normalizeProduct)).map(normalizeProduct);
  const zoneBindings = asMap(source.zoneBindings);
  const layers = asList(source.layers);
  const zones = asList(source.productZones);
  const ratio = `${canvasWidth} / ${canvasHeight}`;
  const backgroundStyle = backgroundFromCanvas(canvas, brandTokens, campaignAssets);
  const marketFooter = asMap(marketProfile.footer);
  const marketAssets = asMap(marketProfile.assets);
  const fallbackFooter = footerText || String(marketFooter.content || marketFooter.legalText || campaignTokens.footer || brandAssets.footer?.disclaimer || '');
  const textColor = String(asMap(brandTokens.colors).text || '#1f1613');
  const backgroundConfig = asMap(canvas.background);
  const renderOptions = asMap(source.renderOptions);
  const footerHidden = String(renderOptions.footerMode || '').toUpperCase() === 'NONE';

  const bindingContext: JsonMap = {
    static: staticBindings,
    product: normalizeProduct(resolvedProducts[0] || leadProduct),
    brand: brandTokens,
    brandAssets,
    campaign: campaignTokens,
    campaignAssets,
    marketProfile: {
      ...marketProfile,
      assets: {
        ...marketAssets,
        primaryLogo: asMap(marketAssets.primaryLogo),
        secondaryLogo: asMap(marketAssets.secondaryLogo),
      },
    },
  };

  const resolveValue = (binding?: string, fallback = '') => {
    if (!binding) return fallback;
    const value = getByPath(bindingContext, binding);
    if (value == null || value === '') return fallback;
    if (typeof value === 'number' && binding.toLowerCase().includes('price')) {
      return formatMoney(value);
    }
    return String(value);
  };

  const resolveAsset = (value: unknown, fallback = '') => resolveReference(value, resolveValue, fallback);
  const backgroundImageUrl = resolveAsset(backgroundConfig.imageUrl);
  const backgroundFit = String(backgroundConfig.fit || 'cover').toLowerCase() === 'contain' ? 'object-contain' : 'object-cover';
  const hasFooterLayer = layers.some((layer) => String(layer.type || '').toLowerCase() === 'footer' && layer.visible !== false);

  const renderLayer = (layer: JsonMap) => {
    const layerId = String(layer.id || `layer-${Math.random()}`);
    const layerType = String(layer.type || 'text').toLowerCase();
    const bounds = asMap(layer.bounds);
    const props = asMap(layer.props);
    const layerTextColor = String(props.textColor || textColor);
    const style: React.CSSProperties = {
      ...boundsToStyle(bounds, canvasWidth, canvasHeight),
      color: layerTextColor,
    };
    const radius = Number(props.radius) || 24;
    const background = props.background ? String(props.background) : undefined;
    const fontSize = Number(props.fontSize);
    const fontWeight = Number(props.fontWeight) || 700;

    if (layerType === 'background' || layer.visible === false) return null;
    if (footerHidden && (layerType === 'footer' || layerId.startsWith('footer-'))) return null;

    if (layerType === 'image' || layerType === 'brandlogo' || layerType === 'campaignbadge') {
      const fallbackImage =
        layerType === 'brandlogo'
          ? String(getByPath(bindingContext, 'brandAssets.logo.imageUrl') || '')
          : layerType === 'campaignbadge'
            ? String(getByPath(bindingContext, 'campaignAssets.badge3d.imageUrl') || '')
            : '';
      const src = resolveAsset(layer.binding, fallbackImage);
      const hasFrame = props.frame !== false && layerType !== 'campaignbadge';
      const fitClass = String(props.fit || 'contain').toLowerCase() === 'cover' ? 'object-cover' : 'object-contain';
      const padding = hasFrame ? Number(props.padding) || 12 : Number(props.padding) || 0;
      if (!src) {
        if (layerType === 'campaignbadge') {
          return (
            <div
              key={layerId}
              className="absolute flex items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#ff8b2a_0%,#ff6a00_100%)] px-4 text-center text-sm font-semibold uppercase tracking-[0.12em] text-white shadow-[0_16px_36px_rgba(255,106,0,0.24)]"
              style={{ ...style, borderRadius: radius || 24 }}
            >
              {resolveValue('campaign.badgeLabel', 'Oferta')}
            </div>
          );
        }
        return null;
      }
      return (
        <div
          key={layerId}
          className={hasFrame ? 'absolute overflow-hidden border border-[rgba(87,51,30,0.08)] shadow-[0_10px_30px_rgba(44,20,6,0.08)]' : 'absolute overflow-hidden'}
          style={{ ...style, borderRadius: radius, background: background || (hasFrame ? 'rgba(255,255,255,0.88)' : 'transparent') }}
        >
          <OfferProductImage src={src} alt={layerType} className={`h-full w-full ${fitClass}`} />
          {padding > 0 ? <div className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 0 ${padding}px ${background || 'rgba(255,255,255,0.88)'}` }} /> : null}
        </div>
      );
    }

    if (layerType === 'qrcode') {
      return (
        <div
          key={layerId}
          className="absolute flex flex-col items-center justify-center gap-2 rounded-[22px] border border-[rgba(87,51,30,0.1)] bg-white/90 p-3 text-center text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-secondary)]"
          style={style}
        >
          <div className="rounded-[18px] border border-[rgba(87,51,30,0.1)] bg-[rgba(255,247,240,0.95)] p-3 text-[color:var(--text-primary)]">
            <QrCode size={Math.max(20, Math.min(bounds.h || 80, bounds.w || 80) / 2)} strokeWidth={2.1} />
          </div>
          <span>{resolveValue(String(layer.binding || ''), 'QR do produto')}</span>
        </div>
      );
    }

    if (layerType === 'price') {
      return (
        <div
          key={layerId}
          className="absolute flex flex-col justify-center rounded-[24px] border border-transparent bg-[linear-gradient(180deg,#ff8b2a_0%,#ff6a00_100%)] p-4 text-white shadow-[0_16px_36px_rgba(255,106,0,0.28)]"
          style={style}
        >
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-white/70">Oferta</span>
          <strong className="mt-2 text-[clamp(1.4rem,2vw,2.4rem)] font-semibold leading-none">
            {resolveValue(String(layer.binding || ''), formatMoney((resolvedProducts[0] as any)?.currentPrice))}
          </strong>
          {Boolean((resolvedProducts[0] as any)?.baselinePrice) ? (
            <small className="mt-2 text-xs text-white/75">De {formatMoney((resolvedProducts[0] as any)?.baselinePrice)}</small>
          ) : null}
        </div>
      );
    }

    if (layerType === 'footer') {
      return (
        <div
          key={layerId}
          className="absolute overflow-hidden"
          style={{
            ...style,
            background: background || 'rgba(44,20,6,0.86)',
            borderRadius: radius,
          }}
        />
      );
    }

    const content = resolveValue(String(layer.binding || ''), fallbackFooter);
    if (!content) return null;

    return (
      <div
        key={layerId}
        className={`absolute ${layerType === 'tag' || layerType === 'badge' ? 'inline-flex items-center justify-center rounded-full border border-[rgba(87,51,30,0.08)] bg-white/85 px-3 py-1 text-center text-xs font-semibold uppercase tracking-[0.12em]' : 'flex items-start justify-start text-left'} overflow-hidden`}
        style={{
          ...style,
          background,
          borderRadius: layerType === 'tag' || layerType === 'badge' ? 9999 : radius,
          fontSize: fontSize ? `${Math.max(fontSize / 26, 0.7)}rem` : undefined,
          fontWeight,
          lineHeight: layerId.startsWith('footer-') ? 1.35 : 1.08,
          padding: layerType === 'text' ? '0.2rem' : undefined,
        }}
      >
        <span className="line-clamp-4">{content}</span>
      </div>
    );
  };

  const renderZone = (zone: JsonMap) => {
    const zoneId = String(zone.id || `zone-${Math.random()}`);
    const bounds = asMap(zone.bounds);
    const slotCount = Number(zone.slotCount) || 1;
    const zoneType = String(zone.zoneType || zone.layout || 'grid').toLowerCase();
    const columns = zoneType === 'hero' || String(zone.layout || '').toLowerCase() === 'single' ? 1 : Math.max(Number(zone.columns) || 2, 1);
    const cardTemplate = asMap(zone.cardTemplate);
    const boundProducts = (Array.isArray(zoneBindings[zoneId]) ? zoneBindings[zoneId] : []).map(normalizeProduct);
    const slots = (boundProducts.length ? boundProducts : Array.from({ length: Math.min(slotCount, gridLimit || slotCount) })).slice(0, gridLimit || slotCount);
    const cardRadius = Number(cardTemplate.cardRadius) || 28;
    const priceBoxRadius = Number(cardTemplate.priceBoxRadius) || 26;
    const showUnit = cardTemplate.showUnit !== false;
    const showDescription = cardTemplate.showDescription !== false;
    const showBaselinePrice = cardTemplate.showBaselinePrice !== false;
    const priceLabel = String(cardTemplate.priceLabel || 'R$');
    const priceBoxBackground = String(cardTemplate.priceBoxBackground || '#ff3b1f');
    const priceBoxTextColor = String(cardTemplate.priceBoxTextColor || '#ffffff');
    const priceLabelColor = String(cardTemplate.priceBoxLabelColor || 'rgba(255,255,255,0.82)');
    const textColorValue = String(cardTemplate.textColor || '#1f1613');
    const cardBackground = String(cardTemplate.background || 'rgba(255,255,255,0.92)');
    const borderColor = String(cardTemplate.borderColor || 'rgba(87,51,30,0.08)');
    const nameFontSize = Number(cardTemplate.nameFontSize) || (zoneType === 'hero' ? 32 : 22);
    const descriptionFontSize = Number(cardTemplate.descriptionFontSize) || (zoneType === 'hero' ? 18 : 14);
    const priceFontSize = Number(cardTemplate.priceFontSize) || (zoneType === 'hero' ? 64 : 46);
    const unitFontSize = Math.max(Math.round(descriptionFontSize * 0.84), 11);

    return (
      <div
        key={zoneId}
        className="absolute grid gap-3 rounded-[28px] bg-transparent p-0"
        style={{
          ...boundsToStyle(bounds, canvasWidth, canvasHeight),
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          alignContent: 'start',
        }}
      >
        {slots.map((product, index) => {
          const item = normalizeProduct(product as JsonMap);
          const showBaselinePrice = cardTemplate.showBaselinePrice !== false;
          const showUnit = cardTemplate.showUnit !== false;
          const formattedPrice = item.currentPrice != null ? formatMoney(Number(item.currentPrice)) : 'R$ 0,00';
          const numericPrice = formattedPrice.replace(/^R\$\s?/, '').trim();

          return (
            <article
              key={String(item.productId || index)}
              className={`min-w-0 overflow-hidden border p-4 shadow-[0_10px_28px_rgba(44,20,6,0.06)] ${zoneType === 'hero' ? 'grid grid-cols-[1.1fr_0.9fr] gap-4' : 'flex flex-col gap-3'}`}
              style={{ borderRadius: `${cardRadius}px`, background: cardBackground, borderColor }}
            >
              <div className={`min-w-0 ${zoneType === 'hero' ? 'order-2 flex flex-col justify-center' : ''}`}>
                <div className="mb-3 flex aspect-square items-center justify-center rounded-[20px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.92)]">
                  <OfferProductImage src={String(item.imageUrl || '')} alt={String(item.name || 'Produto')} className="h-full w-full object-contain p-4" />
                </div>
              </div>
              <div className={`min-w-0 ${zoneType === 'hero' ? 'order-1' : ''}`}>
                <strong
                  className="line-clamp-2 font-semibold"
                  style={{
                    color: textColorValue,
                    fontSize: `${Math.max(nameFontSize / 16, 0.9)}rem`,
                    lineHeight: 1.08,
                  }}
                >
                  {String(item.name || 'Produto do encarte')}
                </strong>
                {showUnit ? (
                  <p className="mt-2 text-[color:var(--text-secondary)]" style={{ fontSize: `${Math.max(unitFontSize / 16, 0.72)}rem` }}>
                    {String(item.unit || 'Unidade')}
                  </p>
                ) : null}
                {showDescription && Boolean(item.packageDescription) ? (
                  <p
                    className="mt-1 line-clamp-2 text-[color:var(--text-muted)]"
                    style={{ fontSize: `${Math.max(descriptionFontSize / 16, 0.72)}rem`, lineHeight: 1.3 }}
                  >
                    {String(item.packageDescription)}
                  </p>
                ) : null}
                <div
                  className="mt-4 flex items-end justify-between gap-3 border-4 px-4 py-3"
                  style={{ background: priceBoxBackground, borderColor: 'rgba(255,196,79,0.82)', borderRadius: `${priceBoxRadius}px` }}
                >
                  <span className="font-medium" style={{ color: priceLabelColor, fontSize: `${Math.max(Math.round(priceFontSize * 0.4) / 16, 1.1)}rem` }}>
                    {priceLabel}
                  </span>
                  <strong className="font-semibold leading-none" style={{ color: priceBoxTextColor, fontSize: `${Math.max(priceFontSize / 16, 1.8)}rem` }}>
                    {numericPrice || '0,00'}
                  </strong>
                  {showBaselinePrice && item.baselinePrice != null ? (
                    <span className="text-xs text-white/80 line-through">{formatMoney(Number(item.baselinePrice))}</span>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`offer-canvas-preview relative overflow-hidden rounded-[32px] border border-[rgba(87,51,30,0.08)] shadow-[0_20px_40px_rgba(44,20,6,0.08)] ${className || ''}`} style={{ aspectRatio: ratio, ...backgroundStyle }}>
      <div className="absolute inset-0">
        {backgroundImageUrl ? (
          <OfferProductImage src={backgroundImageUrl} alt="Fundo do template" className={`absolute inset-0 h-full w-full ${backgroundFit}`} />
        ) : null}
        {layers.map(renderLayer)}
        {zones.map(renderZone)}
      </div>
      {fallbackFooter && !hasFooterLayer && !footerHidden ? (
        <div className="absolute inset-x-4 bottom-4 rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-[rgba(44,20,6,0.86)] px-4 py-3 text-center text-[0.62rem] font-medium uppercase tracking-[0.12em] text-white/82">
          {fallbackFooter}
        </div>
      ) : null}
    </div>
  );
};

export default OfferCanvasPreview;
