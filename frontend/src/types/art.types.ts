export type FormatKey = 'story' | 'post' | 'square' | 'a4' | 'tv';
export type RegionKey = 'logo' | 'products' | 'footer' | 'seal';

/** Retângulo em coordenadas de 0 a 1 sobre o fundo. */
export interface NRect { x: number; y: number; w: number; h: number }
export type Regions = Partial<Record<RegionKey, NRect>>;

export interface Palette {
  /** Fundo da etiqueta de preço. */
  tag: string;
  /** Número do preço. */
  tagText: string;
  /** Fundo do cartão do produto. */
  card: string;
  /** Nome do produto. */
  cardText: string;
  /** Detalhes: unidade, "de/por", faixa de "leve 3 pague 2". */
  accent: string;
}

/**
 * Uma camada do fundo. `base` cobre a arte inteira; `element` é posicionado
 * pelo centro (cx, cy em fração da arte) e pela largura (fração da largura da
 * arte, altura pela proporção do PNG). Mesmo contrato do composicao.json.
 */
export interface ThemeLayer {
  id: string;
  name: string;
  url: string;
  w: number;
  h: number;
  role: 'base' | 'element';
  cx: number;
  cy: number;
  width: number;
  /** Graus, sentido horário. */
  rotation: number;
  opacity: number;
  hidden?: boolean;
  /** Não anima (fica parada mesmo com animação ligada). */
  still?: boolean;
}

export type MotionPreset = 'respirar' | 'parallax' | 'entrada' | 'selo' | 'zoom' | 'festa';

export interface ThemeAnimation {
  presets?: MotionPreset[];
  defaultPreset?: MotionPreset;
  /** Segundos. */
  duration?: number;
}

/**
 * Estilo do tema (tudo opcional; o que falta usa o padrão de
 * features/art-studio/style.ts). Proporções são frações do tamanho do
 * elemento: radius 0.07 = 7% do lado menor do cartão.
 */
export interface ThemeStyle {
  fonts?: { price?: string; name?: string; text?: string };
  tag?: {
    shape?: 'rounded' | 'pill' | 'square' | 'burst' | 'ribbon' | 'circle' | 'hang'; tilt?: number; align?: 'auto' | 'left' | 'center' | 'right';
    size?: number; currency?: boolean; cents?: 'super' | 'inline'; border?: string | null; borderWidth?: number; shadow?: boolean; gradient?: boolean;
  };
  card?: {
    style?: 'solid' | 'outline' | 'none'; radius?: number; shadow?: boolean; border?: string | null; borderWidth?: number; opacity?: number;
    layout?: 'auto' | 'classic' | 'side' | 'photo' | 'price-top' | 'name-top'; shape?: 'rect' | 'ticket' | 'cut' | 'arch';
    fill?: 'flat' | 'gradient' | 'glass'; photoBg?: 'none' | 'circle' | 'blob' | 'rays'; photoShadow?: boolean; vary?: 'none' | 'tilt' | 'alternate';
  };
  name?: {
    case?: 'upper' | 'title' | 'none'; weight?: number; maxLines?: number | null; align?: 'auto' | 'left' | 'center'; size?: number;
    color?: string | null; stroke?: string | null;
  };
  grid?: { layout?: 'auto' | 'uniform' | 'hero' | 'list' | 'mosaic'; gap?: number };
  badge?: { show?: boolean; shape?: 'circle' | 'burst' | 'tag'; position?: 'left' | 'right' };
  oldPrice?: { show?: boolean };
  footer?: {
    color?: string | null; weight?: number; size?: number; align?: 'left' | 'center' | 'right'; case?: 'upper' | 'title' | 'none';
    shadow?: boolean; band?: string | null; bandOpacity?: number;
  };
}

export interface ThemeFormat {
  format: FormatKey;
  backgroundUrl: string;
  width: number;
  height: number;
  regions: Regions;
  /** De trás para frente. Vazio: o fundo é só a imagem achatada. */
  layers?: ThemeLayer[];
  updatedAt?: string;
}

export interface ArtTheme {
  id: string;
  name: string;
  occasion: string | null;
  tags: string[];
  palette: Palette;
  sealUrl: string | null;
  sealWidth: number | null;
  sealHeight: number | null;
  status: 'DRAFT' | 'PUBLISHED';
  sortOrder: number;
  animation?: ThemeAnimation;
  style?: ThemeStyle;
  formats: ThemeFormat[];
  updatedAt?: string;
}

/** Chave da API de temas, usada pelo MCP do Codex. O segredo só aparece na criação. */
export interface ArtApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  createdBy: string | null;
  lastUsedAt: string | null;
  calls: number;
  revokedAt: string | null;
}

export interface PlatformAiSettings {
  provider: string;
  model: string;
  configured: boolean;
  keyHint: string | null;
  encryptionReady: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface ThemeSuggestion {
  assignment: Partial<Record<RegionKey, number | null>>;
  name: string | null;
  occasion: string | null;
  tags: string[];
  palette: Partial<Palette>;
  notes: string | null;
  latencyMs: number;
}

export interface ArtBrand {
  displayName: string | null;
  logoUrl: string | null;
  addressLine: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  footerNote: string | null;
  marketName: string | null;
}

/** Foto do banco de imagens genéricas: recortada, sem fundo. */
export interface LibraryImage {
  id: string;
  name: string;
  group: 'hortifruti' | 'carnes' | 'padaria' | 'frios' | 'outros';
  category: string | null;
  imageUrl: string;
  width: number | null;
  height: number | null;
}

export interface ArtProduct {
  productId: string;
  name: string;
  ean: string | null;
  imageUrl: string | null;
  price: number | null;
  unit: string;
  baskets: number;
  reason: string | null;
  /** Embalagem/gramatura ("395 g"), quando o nome não diz. */
  detail: string | null;
  brand: string | null;
  /** De onde veio o preço: "Última venda na loja em 12/09", "Preço médio da loja em 10/09". */
  priceNote: string | null;
}

export interface SuggestionGroup {
  key: 'traffic' | 'falling' | 'rising';
  title: string;
  hint: string;
  products: ArtProduct[];
}

/** Um produto dentro do encarte, já com o texto que vai na arte. */
export interface CampaignItem {
  key: string;
  productId?: string | null;
  name: string;
  detail?: string;
  price: number | null;
  oldPrice?: number | null;
  unit: string;
  /** Faixa de condição: "Leve 3 pague 2", "Na compra de 2". */
  deal?: string;
  imageUrl?: string | null;
  hero?: boolean;
}

export interface CampaignContent {
  format?: FormatKey;
  products?: CampaignItem[];
  hideSeal?: boolean;
  /** Título, usado pelo tema básico (os temas do superadmin já trazem o título no fundo). */
  headline?: string;
  /** 'auto' (padrão): cores tiradas do fundo de cada formato. 'theme': as cores fixas do tema. */
  colorMode?: 'auto' | 'theme';
  /** Animação escolhida entre as do tema. Ausente: encarte estático. */
  motion?: MotionPreset | null;
}

export interface PublishedImage { format: string; url: string; width: number; height: number; type?: 'video' }

export interface ArtCampaign {
  id: string;
  title: string;
  themeId: string | null;
  content: CampaignContent;
  validFrom: string | null;
  validUntil: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  publicSlug: string | null;
  publishedImages: PublishedImage[];
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface PublicCampaign {
  title: string;
  marketName: string;
  logoUrl: string | null;
  addressLine: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  validFrom: string | null;
  validUntil: string | null;
  images: PublishedImage[];
  products: Array<{ name: string; detail?: string; price: number | null; oldPrice?: number | null; unit?: string; deal?: string; imageUrl?: string | null }>;
  publishedAt: string | null;
}
