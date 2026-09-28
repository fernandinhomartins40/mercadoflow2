import type { ArtTheme, CampaignItem, FormatKey, Palette, Regions } from '../../types/art.types';

/** Mesma tabela do backend (ArtFormats.java). */
export const FORMATS: Record<FormatKey, { label: string; hint: string; width: number; height: number }> = {
  story: { label: 'Story', hint: 'Story e status do WhatsApp', width: 1080, height: 1920 },
  post: { label: 'Post', hint: 'Feed do Instagram e Facebook', width: 1080, height: 1350 },
  square: { label: 'Quadrado', hint: 'Post quadrado e grupos', width: 1080, height: 1080 },
  a4: { label: 'A4', hint: 'Folha impressa (300 dpi)', width: 2480, height: 3508 },
  tv: { label: 'TV', hint: 'TV da loja (Full HD)', width: 1920, height: 1080 },
};
export const FORMAT_KEYS = Object.keys(FORMATS) as FormatKey[];

export const REGION_META = {
  products: { label: 'Produtos', color: '#16a34a' },
  logo: { label: 'Logo', color: '#2563eb' },
  footer: { label: 'Rodapé', color: '#9333ea' },
  seal: { label: 'Selo', color: '#ea580c' },
} as const;

export const DEFAULT_PALETTE: Palette = {
  tag: '#e3161f', tagText: '#ffffff', card: '#ffffff', cardText: '#1c1917', accent: '#ffd21f',
};

export const BUILTIN_THEME_ID = 'builtin';

/**
 * Áreas do tema básico, desenhado pelo próprio código: faixa de título em
 * cima, logo à esquerda do título, produtos no meio e rodapé embaixo. Vale
 * enquanto a plataforma não tem temas publicados — o mercado nunca fica sem
 * como fazer um encarte.
 */
export const BUILTIN_REGIONS: Record<FormatKey, Regions> = {
  story: {
    logo: { x: 0.06, y: 0.035, w: 0.3, h: 0.08 },
    seal: { x: 0.64, y: 0.03, w: 0.3, h: 0.1 },
    products: { x: 0.04, y: 0.2, w: 0.92, h: 0.7 },
    footer: { x: 0.05, y: 0.92, w: 0.9, h: 0.065 },
  },
  post: {
    logo: { x: 0.05, y: 0.035, w: 0.26, h: 0.1 },
    seal: { x: 0.7, y: 0.03, w: 0.25, h: 0.12 },
    products: { x: 0.035, y: 0.215, w: 0.93, h: 0.67 },
    footer: { x: 0.05, y: 0.9, w: 0.9, h: 0.08 },
  },
  square: {
    logo: { x: 0.05, y: 0.04, w: 0.24, h: 0.12 },
    seal: { x: 0.73, y: 0.035, w: 0.22, h: 0.14 },
    products: { x: 0.035, y: 0.23, w: 0.93, h: 0.65 },
    footer: { x: 0.05, y: 0.895, w: 0.9, h: 0.085 },
  },
  a4: {
    logo: { x: 0.05, y: 0.03, w: 0.26, h: 0.08 },
    seal: { x: 0.72, y: 0.025, w: 0.23, h: 0.1 },
    products: { x: 0.035, y: 0.17, w: 0.93, h: 0.74 },
    footer: { x: 0.05, y: 0.93, w: 0.9, h: 0.055 },
  },
  tv: {
    logo: { x: 0.03, y: 0.05, w: 0.16, h: 0.14 },
    seal: { x: 0.82, y: 0.04, w: 0.15, h: 0.17 },
    products: { x: 0.025, y: 0.27, w: 0.95, h: 0.62 },
    footer: { x: 0.04, y: 0.91, w: 0.92, h: 0.07 },
  },
};

export const BUILTIN_THEME: ArtTheme = {
  id: BUILTIN_THEME_ID,
  name: 'Básico',
  occasion: 'Ofertas da semana',
  tags: [],
  palette: DEFAULT_PALETTE,
  sealUrl: null,
  sealWidth: null,
  sealHeight: null,
  status: 'PUBLISHED',
  sortOrder: 9999,
  formats: FORMAT_KEYS.map((format) => ({
    format, backgroundUrl: '', width: FORMATS[format].width, height: FORMATS[format].height, regions: BUILTIN_REGIONS[format],
  })),
};

/** Produtos de exemplo: a prévia do criador de temas mostra o tema já em uso. */
export const SAMPLE_ITEMS: CampaignItem[] = [
  { key: 's1', name: 'Picanha bovina', detail: 'peça', price: 59.9, oldPrice: 69.9, unit: 'kg', hero: true },
  { key: 's2', name: 'Arroz tipo 1', detail: '5 kg', price: 24.9, unit: 'un' },
  { key: 's3', name: 'Feijão carioca', detail: '1 kg', price: 7.49, unit: 'un' },
  { key: 's4', name: 'Óleo de soja', detail: '900 ml', price: 6.99, unit: 'un', deal: 'Leve 3 pague 2' },
  { key: 's5', name: 'Café torrado e moído', detail: '500 g', price: 17.9, unit: 'un' },
  { key: 's6', name: 'Leite UHT integral', detail: '1 litro', price: 4.79, unit: 'un' },
  { key: 's7', name: 'Açúcar refinado', detail: '1 kg', price: 4.59, unit: 'un' },
  { key: 's8', name: 'Banana prata', price: 5.99, unit: 'kg' },
  { key: 's9', name: 'Sabão em pó', detail: '1,6 kg', price: 18.9, unit: 'un' },
  { key: 's10', name: 'Refrigerante cola', detail: '2 litros', price: 8.99, unit: 'un' },
  { key: 's11', name: 'Macarrão espaguete', detail: '500 g', price: 3.99, unit: 'un' },
  { key: 's12', name: 'Frango inteiro congelado', price: 11.9, unit: 'kg' },
  { key: 's13', name: 'Papel higiênico', detail: '12 rolos', price: 16.9, unit: 'un' },
  { key: 's14', name: 'Cerveja lata', detail: '350 ml', price: 3.49, unit: 'un' },
  { key: 's15', name: 'Tomate', price: 6.49, unit: 'kg' },
  { key: 's16', name: 'Queijo muçarela', detail: 'fatiado', price: 39.9, unit: 'kg' },
];

export const UNITS = ['un', 'kg', '100 g', 'pct', 'cx', 'L', 'dz', 'bdj'];

export const themeFormat = (theme: ArtTheme | null | undefined, format: FormatKey) =>
  theme?.formats.find((f) => f.format === format) ?? null;

/** Formatos que o tema tem prontos (com área de produtos). O básico tem todos. */
export const readyFormats = (theme: ArtTheme | null | undefined): FormatKey[] =>
  theme ? theme.formats.filter((f) => f.regions?.products).map((f) => f.format) : [];
