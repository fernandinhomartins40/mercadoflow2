import type { StorePlan } from '../../../types/storeMap.types';

/** Geometria do editor: encaixe na grade, guias de alinhamento e limites da loja. */

export interface Rect { x: number; y: number; w: number; h: number }

export interface Guide {
  /** 'v' = linha vertical em x = pos; 'h' = linha horizontal em y = pos. */
  axis: 'v' | 'h';
  pos: number;
  from: number;
  to: number;
}

export const GRID = 0.25;

export const snapTo = (v: number, step = GRID) => Math.round(v / step) * step;

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const round2 = (v: number) => Math.round(v * 100) / 100;

export const boundsOf = (fixtures: Rect[]): Rect => {
  const xs = fixtures.map((f) => f.x);
  const ys = fixtures.map((f) => f.y);
  const x2 = fixtures.map((f) => f.x + f.w);
  const y2 = fixtures.map((f) => f.y + f.h);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...x2) - x, h: Math.max(...y2) - y };
};

/**
 * Encaixe do retângulo em movimento nas bordas e centros dos outros móveis e
 * das paredes. Devolve o deslocamento corrigido e as guias a desenhar — o
 * mesmo recurso dos editores de desenho, que deixa corredores alinhados sem o
 * dono medir nada.
 */
export function smartSnap(moving: Rect, others: Rect[], plan: StorePlan, tolerance: number) {
  const walls: Rect[] = [{ x: 0, y: 0, w: plan.width, h: plan.height }];
  const targets = [...others, ...walls];
  const xs = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const ys = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  let bestDx: { d: number; pos: number; t: Rect } | null = null;
  let bestDy: { d: number; pos: number; t: Rect } | null = null;

  for (const t of targets) {
    const tx = [t.x, t.x + t.w / 2, t.x + t.w];
    const ty = [t.y, t.y + t.h / 2, t.y + t.h];
    for (const a of xs) for (const b of tx) {
      const d = b - a;
      if (Math.abs(d) <= tolerance && (!bestDx || Math.abs(d) < Math.abs(bestDx.d))) bestDx = { d, pos: b, t };
    }
    for (const a of ys) for (const b of ty) {
      const d = b - a;
      if (Math.abs(d) <= tolerance && (!bestDy || Math.abs(d) < Math.abs(bestDy.d))) bestDy = { d, pos: b, t };
    }
  }

  const dx = bestDx ? bestDx.d : snapTo(moving.x) - moving.x;
  const dy = bestDy ? bestDy.d : snapTo(moving.y) - moving.y;
  const guides: Guide[] = [];
  const moved = { ...moving, x: moving.x + dx, y: moving.y + dy };
  if (bestDx) {
    const t = bestDx.t;
    guides.push({ axis: 'v', pos: bestDx.pos, from: Math.min(moved.y, t.y), to: Math.max(moved.y + moved.h, t.y + t.h) });
  }
  if (bestDy) {
    const t = bestDy.t;
    guides.push({ axis: 'h', pos: bestDy.pos, from: Math.min(moved.x, t.x), to: Math.max(moved.x + moved.w, t.x + t.w) });
  }
  return { dx, dy, guides };
}

/** Mantém o móvel dentro da loja. */
export const keepInside = (r: Rect, plan: StorePlan): Rect => ({
  ...r,
  x: clamp(r.x, 0, Math.max(0, plan.width - r.w)),
  y: clamp(r.y, 0, Math.max(0, plan.height - r.h)),
});

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Novo retângulo ao arrastar uma alça, com tamanho mínimo e encaixe na grade. */
export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, plan: StorePlan, min = 0.3): Rect {
  let { x, y, w, h } = start;
  if (handle.includes('e')) w = clamp(snapTo(start.w + dx), min, plan.width - start.x);
  if (handle.includes('s')) h = clamp(snapTo(start.h + dy), min, plan.height - start.y);
  if (handle.includes('w')) {
    const nx = clamp(snapTo(start.x + dx), 0, start.x + start.w - min);
    w = start.x + start.w - nx;
    x = nx;
  }
  if (handle.includes('n')) {
    const ny = clamp(snapTo(start.y + dy), 0, start.y + start.h - min);
    h = start.y + start.h - ny;
    y = ny;
  }
  return { x: round2(x), y: round2(y), w: round2(w), h: round2(h) };
}

export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const normRect = (x1: number, y1: number, x2: number, y2: number): Rect => ({
  x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
});

export const fmtM = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m`;
