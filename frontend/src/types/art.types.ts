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

export interface ThemeFormat {
  format: FormatKey;
  backgroundUrl: string;
  width: number;
  height: number;
  regions: Regions;
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
  formats: ThemeFormat[];
  updatedAt?: string;
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
}

export interface PublishedImage { format: string; url: string; width: number; height: number }

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
