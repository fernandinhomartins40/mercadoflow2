import React, { useMemo, useState } from 'react';

const FALLBACK_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
  <rect width="320" height="320" rx="32" fill="#f5ede6"/>
  <rect x="44" y="44" width="232" height="232" rx="24" fill="#ffffff" stroke="#ead9ca" stroke-width="8"/>
  <path d="M102 206l42-46c8-9 23-9 31 0l18 20 23-26c8-9 23-9 31 0l24 27" fill="none" stroke="#1a1411" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="126" cy="126" r="20" fill="#ff6a00" opacity="0.9"/>
  <text x="160" y="270" text-anchor="middle" fill="#6c5443" font-size="24" font-family="Manrope, Outfit, Arial, sans-serif">Sem imagem</text>
</svg>
`)}`;

interface OfferProductImageProps {
  src?: string | null;
  alt: string;
  className?: string;
}

const OfferProductImage: React.FC<OfferProductImageProps> = ({ src, alt, className }) => {
  const [broken, setBroken] = useState(false);
  const imageSrc = useMemo(() => (!broken && src ? src : FALLBACK_IMAGE), [broken, src]);
  return <img className={className} src={imageSrc} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
};

export default OfferProductImage;

