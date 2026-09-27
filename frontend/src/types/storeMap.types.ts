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
}
