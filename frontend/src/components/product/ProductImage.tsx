import React, { useMemo, useState } from 'react';

const FALLBACK_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
  <rect width="320" height="320" rx="32" fill="#f3ece5"/>
  <rect x="52" y="52" width="216" height="216" rx="28" fill="#fff" stroke="#ead9ca" stroke-width="8"/>
  <circle cx="112" cy="120" r="22" fill="#ff6a00" opacity="0.85"/>
  <path d="M88 210l42-46c8-9 23-9 31 0l18 20 23-26c8-9 23-9 31 0l35 38" fill="none" stroke="#1a1411" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="160" y="272" text-anchor="middle" fill="#6c5443" font-size="26" font-family="Manrope, Outfit, Arial, sans-serif">Sem imagem</text>
</svg>
`)}`;

interface ProductImageProps {
  src?: string | null;
  alt: string;
  className?: string;
}

const ProductImage: React.FC<ProductImageProps> = ({ src, alt, className }) => {
  const [broken, setBroken] = useState(false);
  const imageSrc = useMemo(() => (!broken && src ? src : FALLBACK_IMAGE), [broken, src]);

  return <img className={className} src={imageSrc} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
};

export default ProductImage;
