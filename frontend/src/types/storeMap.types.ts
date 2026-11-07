/** Mapa de calor das câmeras: segundos de presença por célula da planta. */
export interface StoreTraffic {
  cellSize: number;
  days: number;
  cells: Array<{ x: number; y: number; seconds: number }>;
  byHour: number[];
  cameras: number;
  lastAt: string | null;
}

/** Loja Viva — planta da loja, setores com vendas e sugestões (ver StoreMapService no backend). */

export type FixtureType =
  | 'gondola' | 'ponta' | 'geladeira' | 'freezer' | 'ilha' | 'banca' | 'balcao' | 'caixa' | 'entrada';

export interface Fixture {
  id: string;
  type: FixtureType;
  /** Metros a partir do canto superior esquerdo da planta. */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  /** Chaves de setor (StoreDepartment). */
  departments: string[];
  /** Prateleiras por lado (gôndola e ilha: A e B; demais móveis: só A). */
  sides?: FixtureSide[];
}

export type ShelfKind = 'prateleira' | 'gancheira' | 'cesto' | 'grade';

/**
 * Espaço de uma prateleira, da esquerda para a direita. `share` é a fração da
 * largura (0.8 = 80%), não centímetros: a divisão continua certa quando a
 * largura do módulo muda. É um produto, um setor inteiro ou um nome livre.
 */
export interface ShelfSlot {
  productId?: string;
  department?: string;
  label?: string;
  share: number;
  /** Frentes do produto, quando a divisão foi feita por frentes. */
  facings?: number;
}

/** Prateleiras de um módulo vão de cima para baixo. */
export interface Shelf {
  id: string;
  kind: ShelfKind;
  slots: ShelfSlot[];
}

/** Trecho da gôndola entre duas colunas. */
export interface ShelfModule {
  id: string;
  widthCm: number;
  shelves: Shelf[];
}

export interface FixtureSide {
  key: 'A' | 'B';
  modules: ShelfModule[];
}

export interface ShelfProduct {
  name: string;
  imageUrl?: string | null;
}

export interface ProductPlace {
  fixtureId: string;
  fixtureLabel: string;
  side: 'A' | 'B';
  module: number;
  modules: number;
  /** 1 = prateleira de cima. */
  shelf: number;
  shelves: number;
  start: number;
  share: number;
}

export interface StorePlan {
  version?: number;
  width: number;
  height: number;
  fixtures: Fixture[];
}

export interface TopProduct {
  id: string;
  name: string;
  imageUrl?: string | null;
  revenue: number;
}

export interface DepartmentStat {
  key: string;
  label: string;
  magnet: boolean;
  cold: boolean;
  revenue: number;
  revenueShare: number;
  baskets: number;
  basketShare: number;
  productCount: number;
  topProducts: TopProduct[];
}

export interface DepartmentPair {
  a: string;
  b: string;
  together: number;
  lift: number;
}

export interface DepartmentsReport {
  days: number;
  invoices: number;
  revenue: number;
  departments: DepartmentStat[];
  pairs: DepartmentPair[];
}

export type InsightKind = 'PLACE' | 'COLD' | 'CLOSER' | 'MAGNET' | 'SLOW_SPOT' | 'END_CAP' | 'EMPTY';

export interface StoreInsight {
  kind: InsightKind;
  priority: number;
  title: string;
  text: string;
  departments: string[];
  fixtureIds: string[];
}

export interface LocatedProduct {
  id: string;
  name: string;
  imageUrl?: string | null;
  department: string;
  departmentLabel: string;
  /** Onde está nas prateleiras; vazio = só o setor é conhecido. */
  places?: ProductPlace[];
}
