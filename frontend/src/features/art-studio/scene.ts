import { useEffect, useRef, useState } from 'react';
import type { ArtBrand, ArtTheme, CampaignItem, FormatKey, Palette, Regions, ThemeLayer, ThemeStyle } from '../../types/art.types';
import { ensureFonts, ensureStyleFonts, loadImage, loadImageWithin } from './assets';
import { fontsOf, resolveStyle } from './style';
import { BUILTIN_REGIONS, BUILTIN_THEME_ID, DEFAULT_PALETTE, FORMATS, themeFormat } from './formats';
import { Scene, SceneLayer, footerLinesFor } from './render';
import { derivePalette } from './palette';

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
  /** Camadas ainda não gravadas (criador de temas). */
  layersOverride?: ThemeLayer[] | null;
  /** Estilo ainda não gravado (criador de temas). */
  styleOverride?: ThemeStyle | null;
  /** Cores tiradas do fundo (padrão) ou as fixas do tema. */
  colorMode?: 'auto' | 'theme';
  proxy?: (url: string) => Promise<Blob>;
  /** Quanto esperar cada foto (a exportação espera mais que a prévia). */
  imageWaitMs?: number;
}

/** Monta a cena com as imagens carregadas. Imagem é cacheada: remontar é barato. */
export const buildScene = async (input: SceneInput): Promise<Scene> => {
  const style = resolveStyle(input.styleOverride ?? input.theme?.style);
  await ensureFonts();
  // As três padrão já vêm em ensureFonts; as outras do estilo, sob demanda.
  await ensureStyleFonts(fontsOf(style).filter((f) => !['anton', 'barlow-condensed', 'barlow'].includes(f.key)));
  const { theme, format } = input;
  const builtin = !theme || theme.id === BUILTIN_THEME_ID;
  const tf = builtin ? null : themeFormat(theme, format);
  const size = tf && tf.width > 0 ? { width: tf.width, height: tf.height } : FORMATS[format];
  // Exporta sempre no tamanho do formato; fundo com outra resolução é esticado na mesma proporção.
  const width = FORMATS[format].width;
  const height = Math.round(width * (size.height / size.width));
  const regions = input.regionsOverride ?? (builtin ? BUILTIN_REGIONS[format] : tf?.regions ?? {});

  const layerList = builtin ? [] : input.layersOverride ?? tf?.layers ?? [];
  const [layers, background, seal, logo, images] = await Promise.all([
    loadLayers(layerList),
    tf?.backgroundUrl ? loadImage(tf.backgroundUrl) : Promise.resolve(null),
    theme?.sealUrl ? loadImage(theme.sealUrl) : Promise.resolve(null),
    loadImageWithin(input.brand?.logoUrl ?? null, input.imageWaitMs ?? 6000, input.proxy),
    Promise.all(input.items.map((item) => loadImageWithin(item.imageUrl ?? null, input.imageWaitMs ?? 6000, input.proxy))),
  ]);

  return {
    width,
    height,
    background,
    regions,
    palette: input.paletteOverride
      ?? (input.colorMode !== 'theme' && background ? derivePalette(background, regions.products) : { ...DEFAULT_PALETTE, ...(theme?.palette ?? {}) }),
    seal,
    showSeal: input.showSeal !== false,
    logo,
    brandName: input.brand?.displayName || input.brand?.marketName || '',
    headline: builtin ? (input.headline || 'Ofertas da semana') : undefined,
    footerLines: footerLinesFor(input.brand, input.validFrom ?? null, input.validUntil ?? null),
    items: input.items.map((item, i) => ({ ...item, image: images[i] })),
    selectedKey: input.selectedKey ?? null,
    layers,
    style,
  };
};

/** Imagens das camadas. Camada cuja imagem não abriu fica de fora (melhor que quebrar a arte). */
export const loadLayers = async (list: ThemeLayer[]): Promise<SceneLayer[]> => {
  const images = await Promise.all(list.map((l) => loadImage(l.url)));
  return list.flatMap((l, i) => (images[i] ? [{ ...l, image: images[i] as HTMLImageElement }] : []));
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
    buildScene(input).then((s) => { if (id === seq.current) setScene(s); })
      .catch((err) => { console.warn('Falha ao montar a arte', err); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return scene;
};
