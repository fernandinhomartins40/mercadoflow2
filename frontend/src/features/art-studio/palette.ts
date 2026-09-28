import type { NRect, Palette } from '../../types/art.types';
import { DEFAULT_PALETTE } from './formats';

/**
 * Cores automáticas: lê o fundo do tema e monta a paleta da etiqueta e dos
 * cartões para combinar com ele.
 *
 * - etiqueta de preço: a cor dominante do fundo (a "cor da campanha"), firmada
 *   para ter contraste com o número branco;
 * - faixa de condição: a segunda cor forte do fundo, ou uma vizinha da primeira;
 * - cartão: branco levemente tingido pela cor dominante;
 * - nome do produto: a cor dominante bem escura, em vez de preto chapado.
 *
 * Cada formato tem seu fundo, então cada um ganha sua paleta.
 */

type HSL = [number, number, number];

const rgbToHsl = (r: number, g: number, b: number): HSL => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
};

const hslToHex = (h: number, s: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
};

const hexLum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

const hueDist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const cache = new WeakMap<HTMLImageElement, Map<string, Palette>>();

export const derivePalette = (img: HTMLImageElement, products?: NRect | null): Palette => {
  const key = products ? `${products.x}:${products.y}:${products.w}:${products.h}` : '-';
  let map = cache.get(img);
  if (!map) { map = new Map(); cache.set(img, map); }
  const hit = map.get(key);
  if (hit) return hit;

  const W = 72;
  const H = Math.max(24, Math.round((72 * img.naturalHeight) / Math.max(1, img.naturalWidth)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return DEFAULT_PALETTE;
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  // Histograma de matiz ponderado pela saturação, fora da área de produtos
  // (ela é o "papel" onde vão os cartões, não a cor da campanha).
  const BUCKETS = 24;
  const weight = new Float32Array(BUCKETS);
  const sums = Array.from({ length: BUCKETS }, () => [0, 0, 0, 0]);
  let panel = [0, 0, 0, 0];
  const inside = (x: number, y: number) => !!products && x >= products.x * W && x < (products.x + products.w) * W
    && y >= products.y * H && y < (products.y + products.h) * H;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] < 128) continue;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (inside(x, y)) { panel = [panel[0] + r, panel[1] + g, panel[2] + b, panel[3] + 1]; continue; }
      const [h, s, l] = rgbToHsl(r, g, b);
      if (s < 0.28 || l < 0.12 || l > 0.9) continue;
      const bucket = Math.floor(h / (360 / BUCKETS)) % BUCKETS;
      const w = s * (1 - Math.abs(l - 0.5));
      weight[bucket] += w;
      sums[bucket][0] += r * w; sums[bucket][1] += g * w; sums[bucket][2] += b * w; sums[bucket][3] += w;
    }
  }
  const order = Array.from(weight.keys()).sort((a, b) => weight[b] - weight[a]);
  const total = weight.reduce((a, b) => a + b, 0);
  if (!total || weight[order[0]] < total * 0.08) {
    map.set(key, DEFAULT_PALETTE);
    return DEFAULT_PALETTE;
  }
  const avg = (bk: number) => {
    const [r, g, b, w] = sums[bk];
    return rgbToHsl(r / w, g / w, b / w);
  };

  const [h1, s1] = avg(order[0]);
  const hue1 = (order[0] + 0.5) * (360 / BUCKETS) * 0.3 + h1 * 0.7;
  // Etiqueta: a cor da campanha, saturada e escura o bastante para o número branco.
  const tag = hslToHex(hue1, clamp(s1, 0.68, 0.92), 0.42);

  const second = order.slice(1).find((bk) => weight[bk] > weight[order[0]] * 0.12 && hueDist(avg(bk)[0], hue1) >= 40);
  let accent: string;
  if (second != null) {
    const [h2, s2] = avg(second);
    accent = hslToHex(h2, clamp(s2, 0.75, 0.95), 0.56);
  } else {
    // Sem segunda cor: amarelo com vermelho/laranja (clássico de encarte), senão vizinha clara.
    accent = hue1 < 40 || hue1 > 330 ? '#ffd21f' : hslToHex((hue1 + 40) % 360, 0.9, 0.6);
  }

  const cardText = hslToHex(hue1, clamp(s1 * 0.6, 0.25, 0.55), 0.14);
  const panelLum = panel[3] ? (0.2126 * panel[0] + 0.7152 * panel[1] + 0.0722 * panel[2]) / panel[3] / 255 : 1;
  // Cartão branco com um toque da cor da campanha; sobre painel branco, um toque a mais para destacar.
  const card = hslToHex(hue1, 0.3, panelLum > 0.93 ? 0.978 : 0.992);

  const palette: Palette = {
    tag,
    tagText: hexLum(tag) > 0.62 ? '#1c1917' : '#ffffff',
    card,
    cardText,
    accent,
  };
  map.set(key, palette);
  return palette;
};
