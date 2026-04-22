export interface StoreElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  categoryIds: string[];
  color?: string;
}

export interface StoreLayout {
  id: string;
  name: string;
  width: number;
  height: number;
  gridSize: number;
  elements: StoreElement[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const ELEMENT_TYPES = {
  gondola: { label: 'Gôndola', icon: '═══', defaultWidth: 120, defaultHeight: 40, color: '#E5E7EB' },
  endcap: { label: 'Ponta de gôndola', icon: '╗', defaultWidth: 50, defaultHeight: 50, color: '#FEF3C7' },
  island: { label: 'Ilha', icon: '▣', defaultWidth: 80, defaultHeight: 60, color: '#DBEAFE' },
  freezer_h: { label: 'Freezer horizontal', icon: '❄', defaultWidth: 100, defaultHeight: 40, color: '#BFDBFE' },
  freezer_v: { label: 'Freezer vertical', icon: '▐', defaultWidth: 40, defaultHeight: 80, color: '#93C5FD' },
  counter: { label: 'Balcão', icon: '───', defaultWidth: 120, defaultHeight: 30, color: '#FDE68A' },
  checkout: { label: 'Caixa', icon: '⬜', defaultWidth: 50, defaultHeight: 30, color: '#A7F3D0' },
  open_area: { label: 'Área livre', icon: '░', defaultWidth: 100, defaultHeight: 100, color: '#F3F4F6' },
} as const;

export type ElementType = keyof typeof ELEMENT_TYPES;
