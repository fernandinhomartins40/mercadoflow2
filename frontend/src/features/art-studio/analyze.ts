import type { NRect, RegionKey, Regions } from '../../types/art.types';
import { REGION_META } from './formats';

/**
 * Análise do fundo de um tema.
 *
 * Divide a imagem numa grade e mede, em cada célula, quanto ela "mexe"
 * (variação de cor dentro dela e diferença para as vizinhas). Células
 * transparentes ou lisas são calmas: ali cabe conteúdo sem brigar com o
 * desenho. Depois tira, uma a uma, as maiores áreas retangulares calmas —
 * essas são as candidatas que a IA vai avaliar.
 *
 * Tudo roda no navegador, em milissegundos, e sem IA já dá uma sugestão
 * razoável: a maior área vira produtos, uma pequena no alto vira logo, uma
 * faixa embaixo vira rodapé.
 */

export interface Candidate extends NRect {
  id: number;
  /** 0 a 1: quão lisa é a área (1 = cor chapada ou transparente). */
  calm: number;
  /** Luminância média (0 a 1). */
  lum: number;
}

export interface Analysis {
  candidates: Candidate[];
  regions: Regions;
  cols: number;
  rows: number;
}

const COLS = 48;

export const analyzeBackground = (img: HTMLImageElement): Analysis => {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const cols = COLS;
  const rows = Math.max(12, Math.round((COLS * H) / W));
  const S = 4; // pixels por célula na amostra
  const canvas = document.createElement('canvas');
  canvas.width = cols * S;
  canvas.height = rows * S;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  const mean = new Float32Array(cols * rows * 3);
  const lum = new Float32Array(cols * rows);
  const alpha = new Float32Array(cols * rows);
  const inner = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sr = 0; let sg = 0; let sb = 0; let sa = 0; let sl = 0; let sl2 = 0;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = ((r * S + y) * canvas.width + (c * S + x)) * 4;
          const a = data[i + 3] / 255;
          // Transparente conta como branco liso: vai ficar o que estiver atrás.
          const R = data[i] * a + 255 * (1 - a);
          const G = data[i + 1] * a + 255 * (1 - a);
          const B = data[i + 2] * a + 255 * (1 - a);
          const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
          sr += R; sg += G; sb += B; sa += a; sl += L; sl2 += L * L;
        }
      }
      const n = S * S;
      const k = r * cols + c;
      mean[k * 3] = sr / n; mean[k * 3 + 1] = sg / n; mean[k * 3 + 2] = sb / n;
      alpha[k] = sa / n;
      lum[k] = sl / n / 255;
      inner[k] = Math.sqrt(Math.max(0, sl2 / n - (sl / n) ** 2));
    }
  }

  const busy = new Float32Array(cols * rows);
  const dist = (a: number, b: number) => Math.hypot(mean[a * 3] - mean[b * 3], mean[a * 3 + 1] - mean[b * 3 + 1], mean[a * 3 + 2] - mean[b * 3 + 2]);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      let d = 0; let n = 0;
      if (c > 0) { d += dist(k, k - 1); n++; }
      if (c < cols - 1) { d += dist(k, k + 1); n++; }
      if (r > 0) { d += dist(k, k - cols); n++; }
      if (r < rows - 1) { d += dist(k, k + cols); n++; }
      busy[k] = alpha[k] < 0.08 ? 0 : inner[k] + (n ? d / n : 0) * 0.6;
    }
  }

  // Limite adaptativo: o fundo de um tema costuma ter bem mais que metade de área lisa.
  const sorted = Array.from(busy).sort((a, b) => a - b);
  const threshold = Math.max(6, Math.min(26, sorted[Math.floor(sorted.length * 0.5)] * 1.6 + 3));
  const calm = new Uint8Array(cols * rows);
  for (let k = 0; k < calm.length; k++) calm[k] = busy[k] <= threshold ? 1 : 0;

  const candidates: Candidate[] = [];
  const minArea = cols * rows * 0.012;
  for (let id = 1; id <= 10; id++) {
    const best = largestRectangle(calm, cols, rows);
    if (!best || best.w * best.h < minArea || best.w < 2 || best.h < 2) break;
    let sumBusy = 0; let sumLum = 0;
    for (let r = best.y; r < best.y + best.h; r++) {
      for (let c = best.x; c < best.x + best.w; c++) {
        const k = r * cols + c;
        sumBusy += busy[k]; sumLum += lum[k];
        calm[k] = 0;
      }
    }
    const n = best.w * best.h;
    candidates.push({
      id,
      x: best.x / cols, y: best.y / rows, w: best.w / cols, h: best.h / rows,
      calm: Math.max(0, 1 - sumBusy / n / (threshold * 1.2)),
      lum: sumLum / n,
    });
  }

  return { candidates, regions: heuristicRegions(candidates), cols, rows };
};

/** Maior retângulo só de células calmas (histograma por linha, O(linhas × colunas)). */
const largestRectangle = (calm: Uint8Array, cols: number, rows: number) => {
  const heights = new Int32Array(cols);
  let best: { x: number; y: number; w: number; h: number } | null = null;
  let bestArea = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) heights[c] = calm[r * cols + c] ? heights[c] + 1 : 0;
    const stack: number[] = [];
    for (let c = 0; c <= cols; c++) {
      const h = c === cols ? 0 : heights[c];
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const top = stack.pop()!;
        const height = heights[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const width = c - left;
        // Área ponderada: retângulo muito fino vale menos (não cabe cartão).
        const ratio = Math.min(width, height) / Math.max(width, height);
        const area = width * height * (0.55 + 0.45 * Math.min(1, ratio * 3));
        if (height > 0 && area > bestArea) {
          bestArea = area;
          best = { x: left, y: r - height + 1, w: width, h: height };
        }
      }
      stack.push(c);
    }
  }
  return best;
};

const area = (r: NRect) => r.w * r.h;
const shrink = (r: NRect, d: number): NRect => ({ x: r.x + d, y: r.y + d, w: Math.max(0.02, r.w - 2 * d), h: Math.max(0.02, r.h - 2 * d) });
const pick = (r: NRect): NRect => ({ x: r.x, y: r.y, w: r.w, h: r.h });

/** Sugestão sem IA, pela geometria das candidatas. */
export const heuristicRegions = (candidates: Candidate[]): Regions => {
  const out: Regions = {};
  if (!candidates.length) {
    return { products: { x: 0.05, y: 0.2, w: 0.9, h: 0.68 } };
  }
  const pool = [...candidates];
  const products = pool.sort((a, b) => area(b) - area(a)).shift()!;
  out.products = shrink(pick(products), 0.012);

  const rest = pool.filter((c) => c.id !== products.id);
  const footer = rest
    .filter((c) => c.y + c.h > 0.84 && c.w / Math.max(c.h, 0.01) > 2.5)
    .sort((a, b) => b.w - a.w)[0];
  if (footer) out.footer = shrink(pick(footer), 0.006);

  const logo = rest
    .filter((c) => c.id !== footer?.id && c.y + c.h / 2 < 0.3 && area(c) < 0.12)
    .sort((a, b) => a.y - b.y || area(b) - area(a))[0];
  if (logo) out.logo = shrink(pick(logo), 0.008);

  const seal = rest
    .filter((c) => c.id !== footer?.id && c.id !== logo?.id && c.y < 0.5)
    .map((c) => ({ c, ratio: c.w / Math.max(c.h, 0.01) }))
    .filter(({ ratio }) => ratio > 0.5 && ratio < 2.2)
    .sort((a, b) => area(b.c) - area(a.c))[0]?.c;
  if (seal) out.seal = shrink(pick(seal), 0.008);
  return out;
};

/** Aplica a escolha da IA (números das candidatas) sobre a sugestão local. */
export const regionsFromAssignment = (
  candidates: Candidate[], assignment: Partial<Record<RegionKey, number | null>>, fallback: Regions,
): Regions => {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const out: Regions = {};
  (['products', 'logo', 'footer', 'seal'] as RegionKey[]).forEach((key) => {
    const id = assignment[key];
    const c = id != null ? byId.get(id) : undefined;
    if (c) out[key] = shrink(pick(c), key === 'products' ? 0.012 : 0.006);
    else if (key === 'products' && fallback.products) out.products = fallback.products;
  });
  return out;
};

/** Fundo reduzido com as candidatas numeradas por cima: é o que a IA enxerga. */
export const annotatedImage = (img: HTMLImageElement, candidates: Candidate[]): string => {
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * scale);
  const H = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const palette = ['#e11d48', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#059669'];
  candidates.forEach((c, i) => {
    const color = palette[i % palette.length];
    const x = c.x * W; const y = c.y * H; const w = c.w * W; const h = c.h * H;
    ctx.fillStyle = `${color}33`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    const size = Math.max(22, Math.min(56, Math.min(w, h) * 0.5));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + size * 0.7, y + size * 0.7, size * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${size * 0.6}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(c.id), x + size * 0.7, y + size * 0.72);
  });
  return canvas.toDataURL('image/jpeg', 0.82);
};

export const regionColor = (key: RegionKey) => REGION_META[key].color;
