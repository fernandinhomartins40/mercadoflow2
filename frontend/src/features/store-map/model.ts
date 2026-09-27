import type { DepartmentsReport, Fixture, FixtureType, StorePlan } from '../../types/storeMap.types';

/**
 * Loja Viva — conhecimento de varejo usado pela tela: tipos de móvel, setores,
 * a planta típica de cada tamanho de loja e a escala de calor.
 */

export interface FixtureMeta {
  type: FixtureType;
  label: string;
  hint: string;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  /** Conserva frio (aceita setores refrigerados). */
  cold?: boolean;
  /** Não expõe produto (entrada, caixa). */
  noProducts?: boolean;
}

export const FIXTURES: Record<FixtureType, FixtureMeta> = {
  gondola:   { type: 'gondola',   label: 'Gôndola',          hint: 'Prateleira de corredor, dos dois lados', w: 1, h: 5, fill: '#e2e8f0', stroke: '#94a3b8' },
  ponta:     { type: 'ponta',     label: 'Ponta de gôndola', hint: 'Fim de corredor: o lugar mais visto',    w: 1, h: 0.7, fill: '#fde68a', stroke: '#d97706' },
  geladeira: { type: 'geladeira', label: 'Geladeira',        hint: 'Refrigerado de porta ou aberto',         w: 4, h: 1, fill: '#bae6fd', stroke: '#0284c7', cold: true },
  freezer:   { type: 'freezer',   label: 'Freezer',          hint: 'Congelados e sorvetes',                  w: 2, h: 1.1, fill: '#c7d2fe', stroke: '#4f46e5', cold: true },
  ilha:      { type: 'ilha',      label: 'Ilha',             hint: 'Mesa de promoção no meio da loja',       w: 2, h: 1.4, fill: '#fbcfe8', stroke: '#db2777' },
  banca:     { type: 'banca',     label: 'Banca',            hint: 'Frutas, verduras e legumes',             w: 2.2, h: 1.4, fill: '#bbf7d0', stroke: '#16a34a' },
  balcao:    { type: 'balcao',    label: 'Balcão',           hint: 'Padaria, açougue, frios fatiados',       w: 3.5, h: 1, fill: '#fed7aa', stroke: '#ea580c', cold: true },
  caixa:     { type: 'caixa',     label: 'Caixa',            hint: 'Ponto de pagamento',                     w: 1.4, h: 0.9, fill: '#e9d5ff', stroke: '#7c3aed', noProducts: true },
  entrada:   { type: 'entrada',   label: 'Entrada',          hint: 'Por onde o cliente entra',               w: 3, h: 0.5, fill: '#dcfce7', stroke: '#16a34a', noProducts: true },
};

export interface DepartmentMeta { key: string; label: string; cold: boolean; color: string }

/** Espelho de StoreDepartment (backend), com uma cor por setor para os rótulos. */
export const DEPARTMENTS: DepartmentMeta[] = [
  { key: 'HORTIFRUTI', label: 'Hortifruti', cold: false, color: '#16a34a' },
  { key: 'ACOUGUE', label: 'Açougue', cold: true, color: '#dc2626' },
  { key: 'FRIOS_LATICINIOS', label: 'Frios e laticínios', cold: true, color: '#0284c7' },
  { key: 'CONGELADOS', label: 'Congelados', cold: true, color: '#4f46e5' },
  { key: 'PADARIA', label: 'Padaria', cold: false, color: '#b45309' },
  { key: 'BEBIDAS', label: 'Bebidas', cold: false, color: '#0891b2' },
  { key: 'BEBIDAS_ALCOOLICAS', label: 'Cervejas e destilados', cold: false, color: '#a16207' },
  { key: 'MERCEARIA', label: 'Mercearia', cold: false, color: '#ca8a04' },
  { key: 'MATINAIS', label: 'Café e matinais', cold: false, color: '#78350f' },
  { key: 'BISCOITOS_DOCES', label: 'Biscoitos e doces', cold: false, color: '#db2777' },
  { key: 'LIMPEZA', label: 'Limpeza', cold: false, color: '#2563eb' },
  { key: 'HIGIENE', label: 'Higiene e beleza', cold: false, color: '#9333ea' },
  { key: 'PET', label: 'Pet', cold: false, color: '#65a30d' },
  { key: 'BAZAR', label: 'Bazar e utilidades', cold: false, color: '#64748b' },
  { key: 'TABACARIA', label: 'Tabacaria', cold: false, color: '#57534e' },
  { key: 'OUTROS', label: 'Outros', cold: false, color: '#94a3b8' },
];

export const DEPT_BY_KEY: Record<string, DepartmentMeta> =
  Object.fromEntries(DEPARTMENTS.map((d) => [d.key, d]));

export const deptLabel = (key: string) => DEPT_BY_KEY[key]?.label ?? key;

export const fixtureName = (f: Fixture) => f.label?.trim() || FIXTURES[f.type].label;

let counter = 0;
export const newId = () => `f${Date.now().toString(36)}${(counter++).toString(36)}`;

export const snap = (v: number) => Math.round(v * 2) / 2;

// ── Planta típica por tamanho ──────────────────────────────────────────────

export type StoreSize = 'pequena' | 'media' | 'grande';

export const SIZES: Array<{ key: StoreSize; title: string; text: string; w: number; h: number; gondolas: number; caixas: number; freezers: number; bancas: number }> = [
  { key: 'pequena', title: 'Mercadinho', text: 'Até 3 corredores, 1 ou 2 caixas', w: 14, h: 11, gondolas: 3, caixas: 2, freezers: 1, bancas: 1 },
  { key: 'media', title: 'Supermercado', text: '4 a 6 corredores, 3 ou 4 caixas', w: 22, h: 14, gondolas: 5, caixas: 3, freezers: 2, bancas: 2 },
  { key: 'grande', title: 'Supermercado grande', text: '7 corredores ou mais', w: 32, h: 20, gondolas: 8, caixas: 5, freezers: 3, bancas: 3 },
];

/** Ordem natural dos setores secos nos corredores, da padaria (fundo à esquerda) para a direita. */
const GONDOLA_ORDER = ['MATINAIS', 'BISCOITOS_DOCES', 'MERCEARIA', 'LIMPEZA', 'HIGIENE', 'PET', 'BAZAR'];

/**
 * Monta a planta típica de um supermercado brasileiro: padaria e açougue no
 * fundo, frios na parede do fundo, bebidas na parede lateral, congelados na
 * outra, hortifruti logo depois da entrada, caixas na frente e os corredores
 * no meio. Só entram os setores que a loja vende (sem dados, entram todos).
 */
export function buildTemplate(size: StoreSize, report: DepartmentsReport | null): StorePlan {
  const cfg = SIZES.find((s) => s.key === size) ?? SIZES[1];
  const W = cfg.w;
  const H = cfg.h;
  const sold = new Set((report?.departments ?? []).filter((d) => d.revenueShare >= 0.003).map((d) => d.key));
  const sells = (key: string) => sold.size === 0 || sold.has(key);
  const fixtures: Fixture[] = [];
  const add = (type: FixtureType, x: number, y: number, w: number, h: number, label: string, departments: string[] = []) =>
    fixtures.push({ id: newId(), type, x, y, w, h, label, departments });

  add('entrada', W - 3.5, H - 0.5, 3, 0.5, 'Entrada');
  for (let i = 0; i < cfg.caixas; i++) add('caixa', 1 + i * 2.2, H - 2.2, 1.4, 0.9, `Caixa ${i + 1}`);

  // Fundo da loja: balcões e frios.
  let x = 0.3;
  if (sells('PADARIA')) { add('balcao', x, 0.3, 3.5, 1, 'Padaria', ['PADARIA']); x += 3.8; }
  if (sells('ACOUGUE')) { add('balcao', x, 0.3, 3.5, 1, 'Açougue', ['ACOUGUE']); x += 3.8; }
  if (sells('FRIOS_LATICINIOS')) {
    const end = W - 2;
    const n = Math.max(1, Math.floor((end - x) / 4));
    const seg = (end - x) / n;
    for (let i = 0; i < n; i++) add('geladeira', x + i * seg, 0.3, seg - 0.2, 1, `Geladeira ${i + 1}`, ['FRIOS_LATICINIOS']);
  }

  // Parede lateral direita: bebidas.
  const drinks = [sells('BEBIDAS') ? 'BEBIDAS' : null, sells('BEBIDAS_ALCOOLICAS') ? 'BEBIDAS_ALCOOLICAS' : null]
    .filter(Boolean) as string[];
  if (drinks.length) {
    // Só a metade de trás da parede: bebida é destino e, perto da entrada,
    // o cliente pegaria e sairia sem passar pela loja.
    const top = 1.8;
    const len = (H - 5.8) * 0.6;
    if (len > 6 && drinks.length === 2) {
      add('geladeira', W - 1.3, top, 1, len / 2 - 0.2, 'Bebidas', ['BEBIDAS']);
      add('geladeira', W - 1.3, top + len / 2, 1, len / 2, 'Cervejas', ['BEBIDAS_ALCOOLICAS']);
    } else {
      add('geladeira', W - 1.3, top, 1, len, 'Bebidas', drinks);
    }
  }

  // Parede lateral esquerda: congelados.
  if (sells('CONGELADOS')) {
    for (let i = 0; i < cfg.freezers; i++) {
      const y = 2 + i * 3.4;
      if (y + 3 > H - 3.2) break;
      add('freezer', 0.3, y, 1.2, 3, `Freezer ${i + 1}`, ['CONGELADOS']);
    }
  }

  // Hortifruti logo depois da entrada.
  if (sells('HORTIFRUTI')) {
    for (let i = 0; i < cfg.bancas; i++) {
      const bx = W - 4.3 - i * 2.8;
      if (bx < 1 + cfg.caixas * 2.2) break;
      add('banca', bx, H - 4.4, 2.2, 1.4, `Banca ${i + 1}`, ['HORTIFRUTI']);
    }
  }

  // Corredores: gôndolas com ponta virada para a frente da loja.
  const dry = GONDOLA_ORDER.filter(sells);
  const queue = dry.length ? [...dry] : ['MERCEARIA'];
  const xa = 2.2;
  const xb = W - 3;
  const gTop = 2.3;
  const gEnd = H - 5.2;
  const step = cfg.gondolas > 1 ? (xb - xa - 1) / (cfg.gondolas - 1) : 0;
  for (let i = 0; i < cfg.gondolas; i++) {
    const left = cfg.gondolas - i;
    const take = Math.min(3, Math.max(1, Math.ceil(queue.length / left)));
    const depts = queue.length ? queue.splice(0, take) : ['MERCEARIA'];
    const gx = xa + i * step;
    add('gondola', gx, gTop, 1, gEnd - gTop, `Gôndola ${i + 1}`, depts);
    add('ponta', gx, gEnd + 0.1, 1, 0.7, `Ponta ${i + 1}`, [depts[0]]);
  }

  return { version: 2, width: W, height: H, fixtures };
}

// ── Calor de vendas ────────────────────────────────────────────────────────

/** Faturamento do período por móvel: o de cada setor dividido entre os móveis que o expõem. */
export function revenuePerFixture(plan: StorePlan, report: DepartmentsReport | null): Record<string, number> {
  const revenue: Record<string, number> = {};
  (report?.departments ?? []).forEach((d) => { revenue[d.key] = Number(d.revenue) || 0; });
  const count: Record<string, number> = {};
  plan.fixtures.forEach((f) => f.departments.forEach((d) => { count[d] = (count[d] || 0) + 1; }));
  const out: Record<string, number> = {};
  plan.fixtures.forEach((f) => {
    if (!f.departments.length) return;
    out[f.id] = f.departments.reduce((sum, d) => sum + (revenue[d] || 0) / (count[d] || 1), 0);
  });
  return out;
}

/** Frio (azul claro) → morno (amarelo) → quente (vermelho). */
export function heatColor(t: number): string {
  const stops = [[219, 234, 254], [253, 230, 138], [248, 113, 113], [220, 38, 38]];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
