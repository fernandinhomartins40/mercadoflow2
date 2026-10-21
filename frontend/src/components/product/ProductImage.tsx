import React, { useMemo, useState } from 'react';
import { openProductPhoto } from '../flow/Flow';

const FALLBACK_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
  <rect width="320" height="320" rx="32" fill="#f3f4f6"/>
  <rect x="52" y="52" width="216" height="216" rx="28" fill="#fff" stroke="#d1d5db" stroke-width="8"/>
  <circle cx="112" cy="120" r="22" fill="#10B981" opacity="0.85"/>
  <path d="M88 210l42-46c8-9 23-9 31 0l18 20 23-26c8-9 23-9 31 0l35 38" fill="none" stroke="#374151" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="160" y="272" text-anchor="middle" fill="#6b7280" font-size="26" font-family="Inter, Arial, sans-serif">Sem imagem</text>
</svg>
`)}`;

interface ProductImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  /** Com foto de verdade, um toque abre a foto ampliada. */
  productId?: string | null;
  info?: string | null;
}

const ProductImage: React.FC<ProductImageProps> = ({ src, alt, className, productId, info }) => {
  const [broken, setBroken] = useState(false);
  const imageSrc = useMemo(() => (!broken && src ? src : FALLBACK_IMAGE), [broken, src]);
  const img = <img className={className} src={imageSrc} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
  if (!src || broken) return img;
  const open = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openProductPhoto({ src, name: alt, productId, info });
  };
  return (
    <span role="button" tabIndex={0} className="fx-thumb-zoom fx-photo-fill" aria-label={`Ampliar a foto de ${alt}`} title="Ampliar a foto"
      onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(e); }}>
      {img}
    </span>
  );
};

export default ProductImage;
