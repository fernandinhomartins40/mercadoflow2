import type { Fixture, FixtureType, StorePlan } from '../../../types/storeMap.types';
import { FIXTURES, newId } from '../model';
import { boundsOf, clamp, round2, snapTo } from './geometry';

/** Operações do editor sobre a planta: puras, cada uma devolve uma planta nova. */

const inside = (plan: StorePlan, f: Fixture): Fixture => ({
  ...f,
  w: round2(Math.min(f.w, plan.width)),
  h: round2(Math.min(f.h, plan.height)),
  x: round2(clamp(f.x, 0, Math.max(0, plan.width - Math.min(f.w, plan.width)))),
  y: round2(clamp(f.y, 0, Math.max(0, plan.height - Math.min(f.h, plan.height)))),
});

const mapSel = (plan: StorePlan, ids: string[], fn: (f: Fixture) => Fixture): StorePlan => {
  const set = new Set(ids);
  return { ...plan, fixtures: plan.fixtures.map((f) => (set.has(f.id) ? inside(plan, fn(f)) : f)) };
};

export const nextLabel = (plan: StorePlan, type: FixtureType) =>
  `${FIXTURES[type].label} ${plan.fixtures.filter((x) => x.type === type).length + 1}`;

export function addFixture(plan: StorePlan, type: FixtureType, cx: number, cy: number): { plan: StorePlan; id: string } {
  const m = FIXTURES[type];
  const f = inside(plan, {
    id: newId(), type, label: type === 'entrada' ? 'Entrada' : nextLabel(plan, type),
    x: snapTo(cx - m.w / 2), y: snapTo(cy - m.h / 2), w: m.w, h: m.h, departments: [],
  });
  return { plan: { ...plan, fixtures: [...plan.fixtures, f] }, id: f.id };
}

export function moveBy(plan: StorePlan, ids: string[], dx: number, dy: number): StorePlan {
  if (!ids.length) return plan;
  const set = new Set(ids);
  const b = boundsOf(plan.fixtures.filter((f) => set.has(f.id)));
  const ndx = clamp(dx, -b.x, plan.width - (b.x + b.w));
  const ndy = clamp(dy, -b.y, plan.height - (b.y + b.h));
  return { ...plan, fixtures: plan.fixtures.map((f) => (set.has(f.id) ? { ...f, x: round2(f.x + ndx), y: round2(f.y + ndy) } : f)) };
}

export function remove(plan: StorePlan, ids: string[]): StorePlan {
  const set = new Set(ids);
  return { ...plan, fixtures: plan.fixtures.filter((f) => !set.has(f.id)) };
}

/** Cópia ao lado do original (à direita, ou abaixo se não couber). */
export function duplicate(plan: StorePlan, ids: string[]): { plan: StorePlan; ids: string[] } {
  const set = new Set(ids);
  const src = plan.fixtures.filter((f) => set.has(f.id));
  if (!src.length) return { plan, ids };
  const b = boundsOf(src);
  const gap = 0.5;
  const right = b.x + b.w * 2 + gap <= plan.width;
  const dx = right ? b.w + gap : 0;
  const dy = right ? 0 : (b.y + b.h * 2 + gap <= plan.height ? b.h + gap : 0.5);
  const copies = src.map((f) => inside(plan, {
    ...f, id: newId(), x: f.x + dx, y: f.y + dy,
    label: src.length === 1 ? nextLabel(plan, f.type) : f.label,
  }));
  return { plan: { ...plan, fixtures: [...plan.fixtures, ...copies] }, ids: copies.map((c) => c.id) };
}

/** Gira 90° em torno do centro de cada móvel. */
export const rotate = (plan: StorePlan, ids: string[]) =>
  mapSel(plan, ids, (f) => ({ ...f, w: f.h, h: f.w, x: f.x + f.w / 2 - f.h / 2, y: f.y + f.h / 2 - f.w / 2 }));

export const patch = (plan: StorePlan, ids: string[], p: Partial<Fixture>) => mapSel(plan, ids, (f) => ({ ...f, ...p }));

export type Align = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

export function align(plan: StorePlan, ids: string[], how: Align): StorePlan {
  const set = new Set(ids);
  const b = boundsOf(plan.fixtures.filter((f) => set.has(f.id)));
  return mapSel(plan, ids, (f) => {
    switch (how) {
      case 'left': return { ...f, x: b.x };
      case 'right': return { ...f, x: b.x + b.w - f.w };
      case 'hcenter': return { ...f, x: b.x + b.w / 2 - f.w / 2 };
      case 'top': return { ...f, y: b.y };
      case 'bottom': return { ...f, y: b.y + b.h - f.h };
      default: return { ...f, y: b.y + b.h / 2 - f.h / 2 };
    }
  });
}

/** Espaços iguais entre os móveis, mantendo os das pontas no lugar. */
export function distribute(plan: StorePlan, ids: string[], axis: 'x' | 'y'): StorePlan {
  const set = new Set(ids);
  const sel = plan.fixtures.filter((f) => set.has(f.id));
  if (sel.length < 3) return plan;
  const size = (f: Fixture) => (axis === 'x' ? f.w : f.h);
  const sorted = [...sel].sort((a, b) => a[axis] - b[axis]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last[axis] + size(last) - first[axis];
  const gap = (span - sorted.reduce((s, f) => s + size(f), 0)) / (sorted.length - 1);
  const pos = new Map<string, number>();
  let cur = first[axis];
  sorted.forEach((f) => { pos.set(f.id, cur); cur += size(f) + gap; });
  return mapSel(plan, ids, (f) => ({ ...f, [axis]: round2(pos.get(f.id)!) }));
}

/** Iguala o tamanho de todos ao do primeiro selecionado. */
export function matchSize(plan: StorePlan, ids: string[]): StorePlan {
  const ref = plan.fixtures.find((f) => f.id === ids[0]);
  if (!ref) return plan;
  return mapSel(plan, ids.slice(1), (f) => ({ ...f, w: ref.w, h: ref.h }));
}

export interface AisleSpec {
  count: number;
  length: number;
  aisle: number;
  orientation: 'vertical' | 'horizontal';
  endCaps: boolean;
}

/**
 * Corredores prontos: N gôndolas paralelas com o corredor escolhido entre
 * elas, centradas na área livre do meio da loja, com ponta de gôndola na
 * frente. É o que o dono faria arrastando uma por uma.
 */
export function generateAisles(plan: StorePlan, spec: AisleSpec): { plan: StorePlan; ids: string[] } {
  const depth = 1;
  const cap = spec.endCaps ? 0.7 : 0;
  const n = Math.max(1, Math.min(30, Math.round(spec.count)));
  const vertical = spec.orientation === 'vertical';
  const across = n * depth + (n - 1) * spec.aisle;
  const along = spec.length + cap;
  const W = plan.width;
  const H = plan.height;
  const length = Math.min(spec.length, (vertical ? H : W) - cap - 1);
  const startA = snapTo(Math.max(0.5, ((vertical ? W : H) - across) / 2));
  const startL = snapTo(Math.max(0.5, ((vertical ? H : W) - along) / 2));
  const added: Fixture[] = [];
  const base = plan.fixtures.filter((f) => f.type === 'gondola').length;
  for (let i = 0; i < n; i++) {
    const a = startA + i * (depth + spec.aisle);
    const label = `Gôndola ${base + i + 1}`;
    added.push(inside(plan, vertical
      ? { id: newId(), type: 'gondola', x: a, y: startL, w: depth, h: length, label, departments: [] }
      : { id: newId(), type: 'gondola', x: startL, y: a, w: length, h: depth, label, departments: [] }));
    if (spec.endCaps) {
      added.push(inside(plan, vertical
        ? { id: newId(), type: 'ponta', x: a, y: startL + length + 0.05, w: depth, h: cap, label: `Ponta ${base + i + 1}`, departments: [] }
        : { id: newId(), type: 'ponta', x: startL + length + 0.05, y: a, w: cap, h: depth, label: `Ponta ${base + i + 1}`, departments: [] }));
    }
  }
  return { plan: { ...plan, fixtures: [...plan.fixtures, ...added] }, ids: added.map((f) => f.id) };
}

