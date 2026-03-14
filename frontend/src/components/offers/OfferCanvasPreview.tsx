import React, { useMemo } from 'react';
import OfferProductImage from './OfferProductImage';
import { OfferCatalogProduct, OfferTemplate } from '../../types/offers.types';

interface OfferCanvasPreviewProps {
  template?: OfferTemplate | null;
  products?: OfferCatalogProduct[];
  className?: string;
  gridLimit?: number;
  footerText?: string | null;
}

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

const defaultTemplate = {
  background: { type: 'solid', color: '#fff7ef' },
  static: { kicker: 'Oferta', headline: 'Selecione um modelo para começar.' },
  slots: [] as CanvasSlot[],
};

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const parseTemplate = (template?: OfferTemplate | null) => {
  if (!template?.designJson) return defaultTemplate;
  try {
    const parsed = JSON.parse(template.designJson);
    return {
      ...defaultTemplate,
      ...parsed,
      slots: Array.isArray(parsed?.slots) ? parsed.slots : [],
    };
  } catch {
    return defaultTemplate;
  }
};

const getBindingValue = (binding: string | undefined, product: OfferCatalogProduct | undefined, parsedTemplate: any) => {
  if (!binding) return '';
  if (binding.startsWith('static.')) {
    return parsedTemplate?.static?.[binding.replace('static.', '')] ?? '';
  }
  if (!product) return '';
  switch (binding) {
    case 'product.name': return product.name;
    case 'product.currentPrice': return formatMoney(product.currentPrice);
    case 'product.unit': return product.unit || 'Unidade';
    case 'product.packageDescription': return product.packageDescription || '';
    case 'product.imageUrl': return product.imageUrl || '';
    case 'product.productUrl': return product.productUrl || '';
    default: return '';
  }
};

const OfferCanvasPreview: React.FC<OfferCanvasPreviewProps> = ({
  template,
  products = [],
  className,
  gridLimit,
  footerText,
}) => {
  const parsedTemplate = useMemo(() => parseTemplate(template), [template]);
  const leadProduct = products[0];
  const backgroundStyle = parsedTemplate.background?.type === 'gradient'
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
                  <OfferProductImage src={product?.imageUrl} alt={product?.name || 'Produto'} className="offer-mini-product-image" />
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
          const value = getBindingValue(slot.binding, leadProduct, parsedTemplate);

          if (slot.type === 'image') {
            return (
              <div key={slot.id} className="offer-canvas-slot image" style={{ ...style, background: slot.background || '#ffffff', borderRadius: slot.radius || 24 }}>
                <OfferProductImage src={value} alt={leadProduct?.name || 'Produto'} className="offer-canvas-image" />
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
                <div className="offer-canvas-qr-box">QR</div>
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
};

export default OfferCanvasPreview;

