import type { Fixture, StorePlan } from '../../../types/storeMap.types';
import { FIXTURES, fixtureName } from '../model';

/**
 * Corredores achados na planta: o espaço entre dois móveis paralelos (ou
 * entre um móvel e a parede) por onde o cliente anda. O caminho vai da frente
 * da loja para o fundo nos corredores em pé e da esquerda para a direita nos
 * deitados; "esquerda" e "direita" são as do cliente andando.
 */
export interface Aisle {
  id: string;
  name: string;
  left: Fixture | null;
  right: Fixture | null;
  /** Largura livre do corredor, em metros. */
  width: number;
  /** Comprimento andável, em metros. */
  length: number;
  vertical: boolean;
  /** Onde começa e termina no eixo do corredor (y nos em pé, x nos deitados). */
  from: number;
  to: number;
  /** Coordenada do meio do corredor no outro eixo. */
  mid: number;
}

const MAX_GAP = 4.5;
const MIN_GAP = 0.6;
/** Menos que isso é passagem, não corredor. */
const MIN_LENGTH = 2;

const isShelf = (f: Fixture) => !FIXTURES[f.type].noProducts && f.type !== 'ponta' && Math.max(f.w, f.h) >= 1.5;

export function findAisles(plan: StorePlan): Aisle[] {
  const shelves = plan.fixtures.filter(isShelf);
  const seen = new Set<string>();
  const out: Aisle[] = [];

  shelves.forEach((c) => {
    const vertical = c.h >= c.w;
    const a1 = vertical ? c.y : c.x;
    const a2 = vertical ? c.y + c.h : c.x + c.w;
    ([-1, 1] as const).forEach((side) => {
      const face = vertical ? (side < 0 ? c.x : c.x + c.w) : (side < 0 ? c.y : c.y + c.h);
      let best: { f: Fixture; gap: number; o1: number; o2: number } | null = null;
      shelves.forEach((g) => {
        if (g.id === c.id) return;
        const b1 = vertical ? g.y : g.x;
        const b2 = vertical ? g.y + g.h : g.x + g.w;
        const o1 = Math.max(a1, b1);
        const o2 = Math.min(a2, b2);
        if (o2 - o1 < 0.4 * Math.min(a2 - a1, b2 - b1)) return;
        const gFace = vertical ? (side < 0 ? g.x + g.w : g.x) : (side < 0 ? g.y + g.h : g.y);
        const gap = side < 0 ? face - gFace : gFace - face;
        if (gap < MIN_GAP || gap > MAX_GAP) return;
        if (!best || gap < best.gap) best = { f: g, gap, o1, o2 };
      });
      const wallGap = vertical ? (side < 0 ? face : plan.width - face) : (side < 0 ? face : plan.height - face);
      const found = best as { f: Fixture; gap: number; o1: number; o2: number } | null;
      if (!found && (wallGap < MIN_GAP || wallGap > MAX_GAP)) return;
      const other = found?.f ?? null;
      const key = other ? [c.id, other.id].sort().join('|') : `${c.id}|parede${side}`;
      if (seen.has(key)) return;
      seen.add(key);
      const gap = found ? found.gap : wallGap;
      // Andando para o fundo (y diminuindo), a esquerda é o x menor;
      // andando para a direita (x aumentando), a esquerda é o y menor.
      const lowSide = side < 0 ? other : c;
      const highSide = side < 0 ? c : other;
      const left = lowSide;
      const right = highSide;
      if (!(left?.departments.length || right?.departments.length)) return;
      const from = found ? found.o1 : a1;
      const to = found ? found.o2 : a2;
      if (to - from < MIN_LENGTH) return;
      const mid = side < 0 ? face - gap / 2 : face + gap / 2;
      const names = [left, right].filter(Boolean).map((f) => fixtureName(f as Fixture));
      out.push({
        id: key,
        name: names.length === 2 ? `Entre ${names[0]} e ${names[1]}` : `${names[0]} e a parede`,
        left, right, width: gap, length: to - from, vertical, from, to, mid,
      });
    });
  });

  // Da esquerda para a direita e do fundo para a frente, como se anda na loja.
  return out.sort((p, q) => (p.vertical === q.vertical ? p.mid - q.mid : p.vertical ? -1 : 1));
}

/** O corredor mais comprido com setor marcado: o melhor para começar a andar. */
export const longestAisle = (aisles: Aisle[]) =>
  aisles.reduce<Aisle | null>((best, a) => (!best || a.length > best.length ? a : best), null);
