import type {
  Fixture, FixtureSide, FixtureType, ProductPlace, Shelf, ShelfKind, ShelfModule, ShelfSlot,
} from '../../types/storeMap.types';

/**
 * Prateleiras de um móvel: lado → módulo (largura própria) → prateleira (de
 * cima para baixo) → espaços (fração da largura). Operações puras: cada uma
 * devolve uma cópia nova, para o editor desfazer e refazer.
 */

let counter = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Menor espaço que a divisória deixa sobrar para um produto (5%). */
export const MIN_SHARE = 0.05;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

export const TWO_SIDED: ReadonlySet<FixtureType> = new Set<FixtureType>(['gondola', 'ilha']);
export const sideKeys = (type: FixtureType): Array<'A' | 'B'> => (TWO_SIDED.has(type) ? ['A', 'B'] : ['A']);

export const SHELF_KINDS: Record<ShelfKind, string> = {
  prateleira: 'Prateleira', gancheira: 'Gancheira', cesto: 'Cesto', grade: 'Grade',
};

/** Ponto de partida de cada móvel; o mercadista muda só o que for diferente. */
const DEFAULTS: Partial<Record<FixtureType, { count: number; kind: ShelfKind }>> = {
  gondola: { count: 5, kind: 'prateleira' },
  ponta: { count: 5, kind: 'prateleira' },
  geladeira: { count: 5, kind: 'grade' },
  freezer: { count: 2, kind: 'cesto' },
  ilha: { count: 2, kind: 'cesto' },
  banca: { count: 2, kind: 'prateleira' },
  balcao: { count: 2, kind: 'prateleira' },
};

export const newShelf = (kind: ShelfKind = 'prateleira'): Shelf => ({ id: uid('s'), kind, slots: [] });

export const newModule = (widthCm: number, count: number, kind: ShelfKind): ShelfModule => ({
  id: uid('m'), widthCm, shelves: Array.from({ length: count }, () => newShelf(kind)),
});

/** Comprimento do móvel em cm: o lado maior na planta. */
export const fixtureLengthCm = (f: Fixture) => Math.round(Math.max(f.w, f.h) * 100);

/** Módulos de 1 m; a sobra (30 cm ou mais) vira um módulo menor no fim. */
export function defaultSides(f: Fixture, shelves?: number): FixtureSide[] {
  const base = DEFAULTS[f.type] ?? { count: 4, kind: 'prateleira' as ShelfKind };
  const d = { ...base, count: shelves ? Math.max(1, Math.min(12, Math.round(shelves))) : base.count };
  const len = Math.max(20, fixtureLengthCm(f));
  const widths: number[] = [];
  for (let left = len; left > 0; left -= 100) widths.push(Math.min(100, left));
  if (widths.length > 1 && widths[widths.length - 1] < 30) widths[widths.length - 2] += widths.pop()!;
  return sideKeys(f.type).map((key) => ({ key, modules: widths.map((w) => newModule(w, d.count, d.kind)) }));
}

// ── Navegação ──────────────────────────────────────────────────────────────

const mapSide = (f: Fixture, key: 'A' | 'B', fn: (s: FixtureSide) => FixtureSide): Fixture =>
  ({ ...f, sides: (f.sides ?? []).map((s) => (s.key === key ? fn(s) : s)) });

export const mapModule = (f: Fixture, key: 'A' | 'B', moduleId: string, fn: (m: ShelfModule) => ShelfModule): Fixture =>
  mapSide(f, key, (s) => ({ ...s, modules: s.modules.map((m) => (m.id === moduleId ? fn(m) : m)) }));

export const mapShelf = (f: Fixture, key: 'A' | 'B', moduleId: string, shelfId: string, fn: (sh: Shelf) => Shelf): Fixture =>
  mapModule(f, key, moduleId, (m) => ({ ...m, shelves: m.shelves.map((sh) => (sh.id === shelfId ? fn(sh) : sh)) }));

// ── Módulos ────────────────────────────────────────────────────────────────

/** Novo módulo com a mesma estrutura (largura, prateleiras) do último, sem produtos. */
export function addModule(f: Fixture, key: 'A' | 'B'): Fixture {
  return mapSide(f, key, (s) => {
    const last = s.modules[s.modules.length - 1];
    const m = last
      ? { id: uid('m'), widthCm: last.widthCm, shelves: last.shelves.map((sh) => newShelf(sh.kind)) }
      : newModule(100, 5, 'prateleira');
    return { ...s, modules: [...s.modules, m] };
  });
}

export const removeModule = (f: Fixture, key: 'A' | 'B', moduleId: string): Fixture =>
  mapSide(f, key, (s) => ({ ...s, modules: s.modules.filter((m) => m.id !== moduleId) }));

/** Mais ou menos prateleiras: entram e saem por baixo, sem mexer nas de cima. */
export function setShelfCount(m: ShelfModule, count: number): ShelfModule {
  const n = Math.max(1, Math.min(12, Math.round(count)));
  if (n <= m.shelves.length) return { ...m, shelves: m.shelves.slice(0, n) };
  const kind = m.shelves[m.shelves.length - 1]?.kind ?? 'prateleira';
  return { ...m, shelves: [...m.shelves, ...Array.from({ length: n - m.shelves.length }, () => newShelf(kind))] };
}

/**
 * Mesma estrutura em todos os módulos do lado: largura, número e tipo de
 * prateleiras. Os produtos de cada módulo ficam onde estavam.
 */
export function applyLayoutToSide(f: Fixture, key: 'A' | 'B', moduleId: string): Fixture {
  const src = f.sides?.find((s) => s.key === key)?.modules.find((m) => m.id === moduleId);
  if (!src) return f;
  return mapSide(f, key, (s) => ({
    ...s,
    modules: s.modules.map((m) => {
      if (m.id === moduleId) return m;
      const sized = setShelfCount(m, src.shelves.length);
      return { ...sized, widthCm: src.widthCm, shelves: sized.shelves.map((sh, i) => ({ ...sh, kind: src.shelves[i].kind })) };
    }),
  }));
}

/** Copia um lado inteiro (estrutura e produtos) para o outro. */
export function copySide(f: Fixture, from: 'A' | 'B', to: 'A' | 'B'): Fixture {
  const src = f.sides?.find((s) => s.key === from);
  if (!src) return f;
  const copy: FixtureSide = {
    key: to,
    modules: src.modules.map((m) => ({
      ...m, id: uid('m'), shelves: m.shelves.map((sh) => ({ ...sh, id: uid('s'), slots: sh.slots.map((sl) => ({ ...sl })) })),
    })),
  };
  const others = (f.sides ?? []).filter((s) => s.key !== to);
  return { ...f, sides: [...others, copy].sort((a, b) => a.key.localeCompare(b.key)) };
}

// ── Espaços da prateleira ──────────────────────────────────────────────────

export const usedShare = (slots: ShelfSlot[]) => slots.reduce((sum, s) => sum + s.share, 0);

const sameSlot = (a: ShelfSlot, b: ShelfSlot) =>
  (a.productId ?? '') === (b.productId ?? '') && (a.department ?? '') === (b.department ?? '') && (a.label ?? '') === (b.label ?? '');

/**
 * Coloca um item na prateleira. Ocupa o espaço livre; sem espaço livre, todos
 * passam a dividir por igual. Item repetido na mesma prateleira não duplica.
 */
export function addSlot(slots: ShelfSlot[], item: Omit<ShelfSlot, 'share'>): ShelfSlot[] {
  const probe = { ...item, share: 0 };
  if (slots.some((s) => sameSlot(s, probe))) return slots;
  const free = round4(1 - usedShare(slots));
  if (free >= MIN_SHARE) return [...slots, { ...item, share: free }];
  return equalize([...slots, probe]);
}

export const equalize = (slots: ShelfSlot[]): ShelfSlot[] =>
  slots.map((s) => ({ ...s, share: round4(1 / slots.length) }));

/** Divide pelos pesos dados (ex.: [80, 20]); a prateleira fica cheia. */
export function splitBy(slots: ShelfSlot[], weights: number[]): ShelfSlot[] {
  const w = slots.map((_, i) => Math.max(0, weights[i] ?? 0));
  const total = w.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return equalize(slots);
  return slots.map((s, i) => ({ ...s, share: round4(w[i] / total) }));
}

/** Pelas frentes de cada produto (4 frentes de um, 1 de outro = 80/20). */
export const splitByFacings = (slots: ShelfSlot[]): ShelfSlot[] =>
  splitBy(slots, slots.map((s) => s.facings ?? 1));

/** Muda a fração de um espaço; nunca deixa a prateleira passar de 100%. */
export function setShare(slots: ShelfSlot[], index: number, share: number): ShelfSlot[] {
  const others = usedShare(slots) - (slots[index]?.share ?? 0);
  const v = Math.max(MIN_SHARE, Math.min(share, 1 - others));
  return slots.map((s, i) => (i === index ? { ...s, share: round4(v) } : s));
}

/**
 * Arrasta a divisória entre o espaço `index` e o seguinte: um cresce o que o
 * outro perde, e nenhum fica menor que 5%.
 */
export function moveDivider(slots: ShelfSlot[], index: number, delta: number): ShelfSlot[] {
  const a = slots[index];
  const b = slots[index + 1];
  if (!a || !b) return slots;
  const d = Math.max(MIN_SHARE - a.share, Math.min(delta, b.share - MIN_SHARE));
  return slots.map((s, i) => {
    if (i === index) return { ...s, share: round4(a.share + d) };
    if (i === index + 1) return { ...s, share: round4(b.share - d) };
    return s;
  });
}

export function moveSlot(slots: ShelfSlot[], index: number, dir: -1 | 1): ShelfSlot[] {
  const j = index + dir;
  if (j < 0 || j >= slots.length) return slots;
  const next = [...slots];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

// ── Resumos ────────────────────────────────────────────────────────────────

export function sideStats(f: Fixture) {
  let modules = 0;
  let shelves = 0;
  const products = new Set<string>();
  (f.sides ?? []).forEach((s) => {
    modules += s.modules.length;
    s.modules.forEach((m) => {
      shelves += m.shelves.length;
      m.shelves.forEach((sh) => sh.slots.forEach((sl) => { if (sl.productId) products.add(sl.productId); }));
    });
  });
  return { modules, shelves, products: products.size };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** "Gôndola 3 · lado A · módulo 2 de 5 · 3ª prateleira de cima · 57% da prateleira, à esquerda". */
export function describePlace(p: ProductPlace, sided: boolean): string {
  const where = p.start < 0.05 ? 'à esquerda' : p.start + p.share > 0.95 ? 'à direita' : 'no meio';
  return [
    p.fixtureLabel,
    sided ? `lado ${p.side}` : null,
    p.modules > 1 ? `módulo ${p.module} de ${p.modules}` : null,
    `${p.shelf}ª prateleira de cima (de ${p.shelves})`,
    `${pct(p.share)} da prateleira, ${where}`,
  ].filter(Boolean).join(' · ');
}
