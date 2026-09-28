/**
 * Montagem automática da área de produtos.
 *
 * Recebe o retângulo da área (em pixels da arte) e quantos produtos entram, e
 * devolve um retângulo por produto. Os destaques ganham uma faixa própria —
 * em cima quando a área é alta, à esquerda quando é larga (TV). O restante
 * vai para a grade cujo cartão fica mais perto da proporção ideal, com o menor
 * número de buracos; a última linha incompleta é centralizada.
 */

export interface Rect { x: number; y: number; w: number; h: number }

/** Largura ÷ altura de um cartão que acomoda foto, nome e preço sem apertar. */
const IDEAL = 0.82;
/** Cartão mais largo que isto vira horizontal (foto à esquerda, preço à direita). */
export const WIDE_CARD = 1.35;

interface Grid { cols: number; rows: number; score: number }

const bestGrid = (area: Rect, n: number, gap: number): Grid => {
  let best: Grid = { cols: 1, rows: n, score: Infinity };
  const maxCols = Math.min(n, 8);
  for (let cols = 1; cols <= maxCols; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (area.w - gap * (cols - 1)) / cols;
    const ch = (area.h - gap * (rows - 1)) / rows;
    if (cw <= 0 || ch <= 0) continue;
    const aspect = cw / ch;
    const holes = rows * cols - n;
    // Distância da proporção ideal (em log, simétrica) + buracos + cartões muito
    // pequenos. Cartão largo é aceitável (vira horizontal); fino demais, não.
    let score = Math.abs(Math.log(aspect / IDEAL)) + (holes / n) * 0.9;
    if (aspect < 0.45) score += 2;
    if (aspect > 2.6) score += 1;
    if (score < best.score) best = { cols, rows, score };
  }
  return best;
};

const grid = (area: Rect, n: number, gap: number): Rect[] => {
  if (n <= 0 || area.w <= 0 || area.h <= 0) return [];
  const { cols, rows } = bestGrid(area, n, gap);
  const cw = (area.w - gap * (cols - 1)) / cols;
  let ch = (area.h - gap * (rows - 1)) / rows;
  // Poucos produtos numa área enorme: não estica o cartão além de ~1,6x a largura.
  const maxH = cw / 0.62;
  let top = area.y;
  if (ch > maxH) {
    const used = maxH * rows + gap * (rows - 1);
    top = area.y + (area.h - used) / 2;
    ch = maxH;
  }
  const out: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, n - r * cols);
    const rowWidth = inRow * cw + (inRow - 1) * gap;
    const left = area.x + (area.w - rowWidth) / 2;
    for (let c = 0; c < inRow; c++) {
      out.push({ x: left + c * (cw + gap), y: top + r * (ch + gap), w: cw, h: ch });
    }
  }
  return out;
};

/**
 * @param heroes quantos dos primeiros produtos são destaque (no máximo 2)
 * @param gap    espaço entre cartões, em pixels da arte
 */
export const layoutProducts = (area: Rect, n: number, heroes: number, gap: number): Rect[] => {
  if (n <= 0) return [];
  const h = Math.max(0, Math.min(heroes, 2, n));
  if (h === 0 || n === h) {
    return grid(area, n, gap);
  }
  const rest = n - h;
  const wide = area.w / area.h > 1.25;
  if (wide) {
    // TV: coluna de destaque à esquerda.
    const share = rest <= 4 ? 0.42 : 0.34;
    const heroW = area.w * share;
    const heroArea = { x: area.x, y: area.y, w: heroW - gap / 2, h: area.h };
    const restArea = { x: area.x + heroW + gap / 2, y: area.y, w: area.w - heroW - gap / 2, h: area.h };
    return [...grid(heroArea, h, gap), ...grid(restArea, rest, gap)];
  }
  // Faixa de destaque em cima; encolhe conforme a grade de baixo cresce.
  const share = rest <= 2 ? 0.52 : rest <= 6 ? 0.42 : rest <= 12 ? 0.34 : 0.28;
  const heroH = area.h * share;
  const heroArea = { x: area.x, y: area.y, w: area.w, h: heroH - gap / 2 };
  const restArea = { x: area.x, y: area.y + heroH + gap / 2, w: area.w, h: area.h - heroH - gap / 2 };
  return [...grid(heroArea, h, gap), ...grid(restArea, rest, gap)];
};

export const toPx = (r: { x: number; y: number; w: number; h: number }, W: number, H: number): Rect =>
  ({ x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H });

export const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: Math.max(0, r.w - 2 * d), h: Math.max(0, r.h - 2 * d) });

export const contain = (iw: number, ih: number, box: Rect): Rect => {
  const s = Math.min(box.w / iw, box.h / ih);
  const w = iw * s;
  const h = ih * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
};
