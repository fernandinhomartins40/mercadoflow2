import type { ThemeStyle } from '../../types/art.types';

/**
 * Estilo do tema: fontes, etiqueta de preço, cartão, nome do produto e
 * rodapé. Os padrões reproduzem a arte de antes do estilo existir, então
 * tema sem estilo continua igual. O backend tem a mesma lista de chaves em
 * ArtThemeService.STYLE_SPEC e a de fontes em ArtFormats.FONTS.
 */

export interface FontOption { key: string; label: string; family: string; weights: number[]; fallback: string; kind: 'impacto' | 'condensada' | 'texto' | 'divertida' }

export const FONTS: FontOption[] = [
  { key: 'anton', label: 'Anton', family: 'Anton', weights: [400], fallback: '"Impact", "Arial Narrow", sans-serif', kind: 'impacto' },
  { key: 'bebas', label: 'Bebas Neue', family: 'Bebas Neue', weights: [400], fallback: '"Impact", sans-serif', kind: 'impacto' },
  { key: 'archivo-black', label: 'Archivo Black', family: 'Archivo Black', weights: [400], fallback: '"Arial Black", sans-serif', kind: 'impacto' },
  { key: 'alfa-slab', label: 'Alfa Slab One', family: 'Alfa Slab One', weights: [400], fallback: 'Georgia, serif', kind: 'impacto' },
  { key: 'passion', label: 'Passion One', family: 'Passion One', weights: [400, 700, 900], fallback: '"Impact", sans-serif', kind: 'impacto' },
  { key: 'titan', label: 'Titan One', family: 'Titan One', weights: [400], fallback: '"Arial Black", sans-serif', kind: 'impacto' },
  { key: 'oswald', label: 'Oswald', family: 'Oswald', weights: [400, 500, 600, 700], fallback: '"Arial Narrow", sans-serif', kind: 'condensada' },
  { key: 'barlow-condensed', label: 'Barlow Condensed', family: 'Barlow Condensed', weights: [400, 500, 600, 700, 800, 900], fallback: '"Arial Narrow", sans-serif', kind: 'condensada' },
  { key: 'roboto-condensed', label: 'Roboto Condensed', family: 'Roboto Condensed', weights: [400, 500, 700, 900], fallback: '"Arial Narrow", sans-serif', kind: 'condensada' },
  { key: 'saira-condensed', label: 'Saira Condensed', family: 'Saira Condensed', weights: [400, 500, 600, 700, 800, 900], fallback: '"Arial Narrow", sans-serif', kind: 'condensada' },
  { key: 'archivo-narrow', label: 'Archivo Narrow', family: 'Archivo Narrow', weights: [400, 500, 600, 700], fallback: '"Arial Narrow", sans-serif', kind: 'condensada' },
  { key: 'fjalla', label: 'Fjalla One', family: 'Fjalla One', weights: [400], fallback: '"Arial Narrow", sans-serif', kind: 'condensada' },
  { key: 'teko', label: 'Teko', family: 'Teko', weights: [400, 500, 600, 700], fallback: '"Arial Narrow", sans-serif', kind: 'condensada' },
  { key: 'barlow', label: 'Barlow', family: 'Barlow', weights: [400, 500, 600, 700, 800, 900], fallback: '"Inter", Arial, sans-serif', kind: 'texto' },
  { key: 'montserrat', label: 'Montserrat', family: 'Montserrat', weights: [400, 500, 600, 700, 800, 900], fallback: 'Arial, sans-serif', kind: 'texto' },
  { key: 'poppins', label: 'Poppins', family: 'Poppins', weights: [400, 500, 600, 700, 800, 900], fallback: 'Arial, sans-serif', kind: 'texto' },
  { key: 'inter', label: 'Inter', family: 'Inter', weights: [400, 500, 600, 700, 800, 900], fallback: 'Arial, sans-serif', kind: 'texto' },
  { key: 'rubik', label: 'Rubik', family: 'Rubik', weights: [400, 500, 600, 700, 800, 900], fallback: 'Arial, sans-serif', kind: 'texto' },
  { key: 'league-spartan', label: 'League Spartan', family: 'League Spartan', weights: [400, 500, 600, 700, 800, 900], fallback: 'Arial, sans-serif', kind: 'texto' },
  { key: 'fredoka', label: 'Fredoka', family: 'Fredoka', weights: [400, 500, 600, 700], fallback: 'Arial Rounded MT Bold, sans-serif', kind: 'divertida' },
  { key: 'lilita', label: 'Lilita One', family: 'Lilita One', weights: [400], fallback: '"Arial Black", sans-serif', kind: 'divertida' },
  { key: 'bangers', label: 'Bangers', family: 'Bangers', weights: [400], fallback: '"Impact", sans-serif', kind: 'divertida' },
  { key: 'luckiest', label: 'Luckiest Guy', family: 'Luckiest Guy', weights: [400], fallback: '"Impact", sans-serif', kind: 'divertida' },
  { key: 'righteous', label: 'Righteous', family: 'Righteous', weights: [400], fallback: 'Arial, sans-serif', kind: 'divertida' },
];

const BY_KEY = new Map(FONTS.map((f) => [f.key, f]));
export const fontOption = (key: string | undefined, fallbackKey: string) => BY_KEY.get(key ?? '') ?? BY_KEY.get(fallbackKey)!;
export const fontStack = (f: FontOption) => `"${f.family}", ${f.fallback}`;
/** Peso que a fonte tem mais perto do pedido (canvas não engrossa fonte de peso único). */
export const nearestWeight = (f: FontOption, w: number) => f.weights.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));

export type TagShape = 'rounded' | 'pill' | 'square' | 'burst' | 'ribbon';
export type TextCase = 'upper' | 'title' | 'none';

export interface ResolvedStyle {
  fonts: { price: FontOption; name: FontOption; text: FontOption };
  tag: { shape: TagShape; tilt: number; align: 'auto' | 'left' | 'center' | 'right'; size: number; currency: boolean; cents: 'super' | 'inline'; border: string | null; borderWidth: number; shadow: boolean };
  card: { style: 'solid' | 'outline' | 'none'; radius: number; shadow: boolean; border: string | null; borderWidth: number; opacity: number };
  name: { case: TextCase; weight: number; maxLines: number | null; align: 'auto' | 'left' | 'center'; size: number };
  oldPrice: { show: boolean };
  footer: { color: string | null; weight: number; size: number; align: 'left' | 'center' | 'right'; case: TextCase; shadow: boolean; band: string | null; bandOpacity: number };
}

export const DEFAULT_STYLE: ResolvedStyle = {
  fonts: { price: BY_KEY.get('anton')!, name: BY_KEY.get('barlow-condensed')!, text: BY_KEY.get('barlow')! },
  tag: { shape: 'rounded', tilt: -3, align: 'auto', size: 1, currency: true, cents: 'super', border: null, borderWidth: 0.04, shadow: true },
  card: { style: 'solid', radius: 0.07, shadow: true, border: null, borderWidth: 0.012, opacity: 1 },
  name: { case: 'upper', weight: 700, maxLines: null, align: 'auto', size: 1 },
  oldPrice: { show: true },
  footer: { color: null, weight: 700, size: 1, align: 'center', case: 'none', shadow: true, band: null, bandOpacity: 0.85 },
};

/** Estilo guardado (parcial) + padrões. */
export const resolveStyle = (s: ThemeStyle | null | undefined): ResolvedStyle => {
  const d = DEFAULT_STYLE;
  return {
    fonts: {
      price: fontOption(s?.fonts?.price, 'anton'),
      name: fontOption(s?.fonts?.name, 'barlow-condensed'),
      text: fontOption(s?.fonts?.text, 'barlow'),
    },
    tag: { ...d.tag, ...(s?.tag ?? {}) } as ResolvedStyle['tag'],
    card: { ...d.card, ...(s?.card ?? {}) } as ResolvedStyle['card'],
    name: { ...d.name, ...(s?.name ?? {}) } as ResolvedStyle['name'],
    oldPrice: { ...d.oldPrice, ...(s?.oldPrice ?? {}) },
    footer: { ...d.footer, ...(s?.footer ?? {}) } as ResolvedStyle['footer'],
  };
};

export const applyCase = (text: string, c: TextCase) => {
  if (c === 'upper') return text.toUpperCase();
  if (c === 'title') return text.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp, ch) => sp + ch.toUpperCase());
  return text;
};

/** Fontes que um estilo usa (para carregar antes de desenhar). */
export const fontsOf = (st: ResolvedStyle) => [st.fonts.price, st.fonts.name, st.fonts.text];

/** Endereço do Google Fonts com as famílias pedidas, cada uma nos pesos que tem. */
export const googleFontsHref = (fonts: FontOption[]) => {
  const families = [...new Map(fonts.map((f) => [f.key, f])).values()]
    .map((f) => `family=${f.family.replace(/ /g, '+')}${f.weights.length > 1 ? `:wght@${f.weights.join(';')}` : ''}`);
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
};
