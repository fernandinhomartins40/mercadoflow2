import { useEffect, useRef, useState } from 'react';
import type { ArtBrand, ArtTheme, CampaignItem, FormatKey, Palette, Regions } from '../../types/art.types';
import { ensureFonts, loadImage } from './assets';
import { BUILTIN_REGIONS, BUILTIN_THEME_ID, DEFAULT_PALETTE, FORMATS, themeFormat } from './formats';
import { Scene, footerLinesFor } from './render';

export interface SceneInput {
  theme: ArtTheme | null;
  format: FormatKey;
  items: CampaignItem[];
  brand: Partial<ArtBrand> | null;
  validFrom?: string | null;
  validUntil?: string | null;
  showSeal?: boolean;
  headline?: string;
  selectedKey?: string | null;
  /** Áreas e paleta ainda não gravadas (criador de temas). */
  regionsOverride?: Regions | null;
  paletteOverride?: Palette | null;
  proxy?: (url: string) => Promise<Blob>;
}

/** Monta a cena com as imagens carregadas. Imagem é cacheada: remontar é barato. */
export const buildScene = async (input: SceneInput): Promise<Scene> => {
  await ensureFonts();
  const { theme, format } = input;
  const builtin = !theme || theme.id === BUILTIN_THEME_ID;
  const tf = builtin ? null : themeFormat(theme, format);
  const size = tf && tf.width > 0 ? { width: tf.width, height: tf.height } : FORMATS[format];
  // Exporta sempre no tamanho do formato; fundo com outra resolução é esticado na mesma proporção.
  const width = FORMATS[format].width;
  const height = Math.round(width * (size.height / size.width));
  const regions = input.regionsOverride ?? (builtin ? BUILTIN_REGIONS[format] : tf?.regions ?? {});

  const [background, seal, logo, images] = await Promise.all([
    tf?.backgroundUrl ? loadImage(tf.backgroundUrl) : Promise.resolve(null),
    theme?.sealUrl ? loadImage(theme.sealUrl) : Promise.resolve(null),
    loadImage(input.brand?.logoUrl ?? null, input.proxy),
    Promise.all(input.items.map((item) => loadImage(item.imageUrl ?? null, input.proxy))),
  ]);

  return {
    width,
    height,
    background,
    regions,
    palette: input.paletteOverride ?? { ...DEFAULT_PALETTE, ...(theme?.palette ?? {}) },
    seal,
    showSeal: input.showSeal !== false,
    logo,
    brandName: input.brand?.displayName || input.brand?.marketName || '',
    headline: builtin ? (input.headline || 'Ofertas da semana') : undefined,
    footerLines: footerLinesFor(input.brand, input.validFrom ?? null, input.validUntil ?? null),
    items: input.items.map((item, i) => ({ ...item, image: images[i] })),
    selectedKey: input.selectedKey ?? null,
  };
};

/**
 * Cena reativa para a prévia. Mantém a anterior na tela enquanto a nova
 * carrega — a arte não pisca a cada tecla.
 */
export const useScene = (input: SceneInput | null, deps: unknown[]): Scene | null => {
  const [scene, setScene] = useState<Scene | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (!input) { setScene(null); return; }
    const id = ++seq.current;
    buildScene(input).then((s) => { if (id === seq.current) setScene(s); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return scene;
};
