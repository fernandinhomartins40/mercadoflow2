import type { CampaignItem, MotionPreset, Palette, Regions, ThemeLayer } from '../../types/art.types';
import { regionLuminance } from './assets';
import { DEFAULT_STYLE, ResolvedStyle, TagShape, applyCase, fontStack, nearestWeight } from './style';
import { Rect, WIDE_CARD, contain, inset, layoutProducts, toPx } from './layout';
import { MotionTarget, Pose, poseAt } from './motion';

/**
 * O desenhista da arte. A mesma função desenha a prévia na tela, o PNG, o
 * PDF e a arte publicada — por isso o que o lojista vê é o que sai.
 *
 * Tudo é proporcional ao tamanho da arte: um story de 1080 px e um A4 de
 * 2480 px saem com a mesma cara.
 */

export interface SceneItem extends CampaignItem {
  image?: HTMLImageElement | null;
}

export interface Scene {
  width: number;
  height: number;
  /** Fundo do tema; null desenha o tema básico. */
  background: HTMLImageElement | null;
  regions: Regions;
  palette: Palette;
  seal: HTMLImageElement | null;
  showSeal: boolean;
  logo: HTMLImageElement | null;
  brandName: string;
  /** Título do tema básico. */
  headline?: string;
  footerLines: string[];
  items: SceneItem[];
  /** Cartão destacado na prévia (seleção do editor). Nunca sai na exportação. */
  selectedKey?: string | null;
  /** Camadas do fundo, de trás para frente. Quando há, substituem o fundo achatado no desenho. */
  layers?: SceneLayer[];
  /** Instante da animação. Ausente: arte estática. */
  motion?: SceneMotion | null;
  /** Fontes, etiqueta, cartão, nome e rodapé do tema. Ausente: o visual padrão. */
  style?: ResolvedStyle;
}

export interface SceneLayer extends ThemeLayer { image: HTMLImageElement }
export interface SceneMotion { preset: MotionPreset; t: number; duration: number }

export interface RenderResult {
  cards: Array<{ key: string; rect: Rect }>;
}

// ── Cores ────────────────────────────────────────────────────────────────

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb = (c: [number, number, number], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
export const mixHex = (a: string, b: string, t: number) => {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgb([0, 1, 2].map((i) => Math.round(x[i] + (y[i] - x[i]) * t)) as [number, number, number]);
};
export const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

// ── Texto ────────────────────────────────────────────────────────────────

const font = (weight: number | string, size: number, family: string) => `${weight} ${Math.max(1, size)}px ${family}`;

const wrap = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxW || !line) {
      line = test;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
};

/** Maior fonte em que o texto cabe na caixa em até maxLines linhas. */
const fitWrapped = (
  ctx: CanvasRenderingContext2D, text: string, box: Rect, weight: number, family: string,
  maxLines: number, maxSize: number, minSize: number, lineHeight = 1.02,
): { size: number; lines: string[] } => {
  let size = Math.max(minSize, Math.min(maxSize, box.h / lineHeight));
  for (let i = 0; i < 40; i++) {
    ctx.font = font(weight, size, family);
    const lines = wrap(ctx, text, box.w);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length <= maxLines && lines.length * size * lineHeight <= box.h && widest <= box.w) {
      return { size, lines };
    }
    if (size <= minSize) break;
    size = Math.max(minSize, size * 0.92);
  }
  ctx.font = font(weight, size, family);
  const lines = wrap(ctx, text, box.w).slice(0, maxLines);
  const last = lines.length - 1;
  if (last >= 0) {
    let l = lines[last];
    while (l.length > 1 && ctx.measureText(`${l}…`).width > box.w) l = l.slice(0, -1);
    if (l !== lines[last] || wrap(ctx, text, box.w).length > maxLines) lines[last] = `${l.replace(/\s+$/, '')}…`;
  }
  return { size, lines };
};

/** Maior fonte (até maxSize) em que uma linha cabe na largura. */
const fitLine = (ctx: CanvasRenderingContext2D, text: string, maxW: number, weight: number | string, family: string, maxSize: number) => {
  ctx.font = font(weight, maxSize, family);
  const w = ctx.measureText(text).width;
  return w <= maxW ? maxSize : Math.max(1, maxSize * (maxW / w));
};

const roundRect = (ctx: CanvasRenderingContext2D, r: Rect, radius: number) => {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad);
  ctx.closePath();
};

const drawContain = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, box: Rect) => {
  const r = contain(img.naturalWidth || img.width, img.naturalHeight || img.height, box);
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
  return r;
};

// ── Preço ────────────────────────────────────────────────────────────────

export const priceParts = (value: number) => {
  const [int, cents] = Math.max(0, value).toFixed(2).split('.');
  return { int: Number(int).toLocaleString('pt-BR'), cents };
};
export const formatPrice = (value: number | null | undefined) =>
  value == null ? '' : `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const unitLabel = (unit: string) => (unit === 'un' ? 'cada' : unit === 'kg' ? 'o kg' : unit);

/**
 * Etiqueta de preço: "R$" pequeno, reais grandes, centavos em sobrescrito e a
 * unidade embaixo dos centavos. Inclinada 3° — é o que dá cara de encarte.
 * Encaixa à direita da caixa e devolve o retângulo ocupado.
 */
/** Contorno da etiqueta no formato escolhido. */
const tagPath = (ctx: CanvasRenderingContext2D, tag: Rect, shape: TagShape) => {
  const H = tag.h;
  if (shape === 'burst') {
    // Explosão de encarte: estrela de muitas pontas em volta da elipse da etiqueta.
    const cx = tag.x + tag.w / 2;
    const cy = tag.y + tag.h / 2;
    const n = 18;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i * Math.PI) / n - Math.PI / 2;
      const k = i % 2 === 0 ? 0.56 : 0.47;
      const x = cx + Math.cos(a) * tag.w * k * 1.04;
      const y = cy + Math.sin(a) * tag.h * k * 1.18;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    return;
  }
  if (shape === 'ribbon') {
    // Faixa com recorte em "V" na esquerda.
    const notch = H * 0.32;
    ctx.beginPath();
    ctx.moveTo(tag.x, tag.y);
    ctx.lineTo(tag.x + tag.w, tag.y);
    ctx.lineTo(tag.x + tag.w, tag.y + H);
    ctx.lineTo(tag.x, tag.y + H);
    ctx.lineTo(tag.x + notch, tag.y + H / 2);
    ctx.closePath();
    return;
  }
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.ellipse(tag.x + tag.w / 2, tag.y + H / 2, tag.w / 2, H / 2, 0, 0, Math.PI * 2);
    return;
  }
  if (shape === 'hang') {
    // Etiqueta de loja: ponta à esquerda com o furo do barbante.
    const tip = H * 0.34;
    ctx.beginPath();
    ctx.moveTo(tag.x + tip, tag.y);
    ctx.lineTo(tag.x + tag.w, tag.y);
    ctx.lineTo(tag.x + tag.w, tag.y + H);
    ctx.lineTo(tag.x + tip, tag.y + H);
    ctx.lineTo(tag.x, tag.y + H / 2);
    ctx.closePath();
    ctx.moveTo(tag.x + tip * 0.72 + H * 0.07, tag.y + H / 2);
    ctx.arc(tag.x + tip * 0.72, tag.y + H / 2, H * 0.07, 0, Math.PI * 2, true);
    return;
  }
  roundRect(ctx, tag, shape === 'pill' ? H / 2 : shape === 'square' ? 0 : H * 0.16);
};

const drawPriceTag = (ctx: CanvasRenderingContext2D, area: Rect, item: CampaignItem, p: Palette, autoAlign: 'right' | 'center', st: ResolvedStyle) => {
  if (item.price == null || !Number.isFinite(item.price)) return;
  const t = st.tag;
  const FP = fontStack(st.fonts.price);
  const FN = fontStack(st.fonts.name);
  const align = t.align === 'auto' ? autoAlign : t.align;
  // Tamanho: a etiqueta encolhe dentro da faixa reservada, presa embaixo.
  const H = area.h * Math.max(0.5, Math.min(1, t.size));
  const box: Rect = { x: area.x, y: area.y + area.h - H, w: area.w, h: H };
  const { int, cents } = priceParts(item.price);
  const unit = unitLabel(item.unit || 'un');
  const inline = t.cents === 'inline';
  const round = t.shape === 'burst' || t.shape === 'circle';
  let S = H * (round ? 0.6 : 0.78);
  const measure = (s: number) => {
    ctx.font = font(400, s * 0.3, FP);
    const wr = t.currency ? ctx.measureText('R$').width : 0;
    ctx.font = font(400, s, FP);
    const wi = ctx.measureText(int).width;
    ctx.font = font(400, s * (inline ? 0.6 : 0.42), FP);
    const wc = ctx.measureText(`,${cents}`).width;
    ctx.font = font(700, s * 0.17, FN);
    const wu = ctx.measureText(unit).width;
    const gap = s * 0.05;
    const tail = inline ? wc + gap + wu : Math.max(wc, wu);
    return { wr, wi, wc, gap, total: (t.currency ? wr + gap : 0) + wi + gap + tail };
  };
  let m = measure(S);
  const padX = H * (round ? 0.3 : t.shape === 'ribbon' || t.shape === 'hang' ? 0.36 : 0.16);
  const maxInner = box.w - padX * 2;
  if (m.total > maxInner) {
    S *= maxInner / m.total;
    m = measure(S);
  }
  // Círculo nunca fica mais estreito que alto.
  let tagW = Math.min(box.w, m.total + padX * 2);
  let tagH = H;
  if (t.shape === 'circle') {
    // Selo redondo: passa um pouco da faixa (centrado nela) e o preço encolhe para caber no miolo.
    tagW = tagH = Math.min(box.w, H * 1.35);
    if (m.total > tagW * 0.72) { S *= (tagW * 0.72) / m.total; m = measure(S); }
  }
  const tag: Rect = {
    x: align === 'right' ? box.x + box.w - tagW : align === 'left' ? box.x : box.x + (box.w - tagW) / 2,
    y: box.y + (H - tagH) / 2, w: tagW, h: tagH,
  };

  ctx.save();
  const cx = tag.x + tag.w / 2;
  const cy = tag.y + tag.h / 2;
  ctx.translate(cx, cy);
  if (t.tilt) ctx.rotate((t.tilt * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  if (t.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = H * 0.12;
    ctx.shadowOffsetY = H * 0.04;
  }
  if (t.gradient) {
    const g = ctx.createLinearGradient(0, tag.y, 0, tag.y + H);
    g.addColorStop(0, mixHex(p.tag, '#ffffff', 0.22));
    g.addColorStop(1, mixHex(p.tag, '#000000', 0.2));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = p.tag;
  }
  tagPath(ctx, tag, t.shape);
  ctx.fill('evenodd');
  ctx.shadowColor = 'transparent';
  if (t.border) {
    ctx.strokeStyle = t.border;
    ctx.lineWidth = Math.max(1, H * t.borderWidth);
    ctx.stroke();
  }

  // Linha de base: o número grande ocupa ~72% da etiqueta (fontes de impacto têm caixa-alta alta).
  const baseline = tag.y + tag.h * 0.5 + S * 0.36;
  // Faixa com recorte: o texto fica no miolo, longe do "V".
  let x = tag.x + (tag.w - m.total) / 2 + (t.shape === 'ribbon' || t.shape === 'hang' ? H * 0.08 : 0);
  ctx.fillStyle = p.tagText;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (t.currency) {
    ctx.font = font(400, S * 0.3, FP);
    ctx.fillText('R$', x, baseline - S * 0.42);
    x += m.wr + m.gap;
  }
  ctx.font = font(400, S, FP);
  ctx.fillText(int, x, baseline);
  x += m.wi + m.gap;
  if (inline) {
    ctx.font = font(400, S * 0.6, FP);
    ctx.fillText(`,${cents}`, x, baseline);
    x += m.wc + m.gap;
    ctx.font = font(700, S * 0.17, FN);
    ctx.globalAlpha = 0.92;
    ctx.fillText(unit, x, baseline);
  } else {
    ctx.font = font(400, S * 0.42, FP);
    ctx.fillText(`,${cents}`, x, baseline - S * 0.3);
    ctx.font = font(700, S * 0.17, FN);
    ctx.globalAlpha = 0.92;
    ctx.fillText(unit, x + S * 0.02, baseline);
  }
  ctx.restore();
};

const drawOldPrice = (ctx: CanvasRenderingContext2D, box: Rect, value: number, color: string, st: ResolvedStyle, centered = false) => {
  if (!st.oldPrice.show) return;
  const FN = fontStack(st.fonts.name);
  const text = `De ${formatPrice(value)}`;
  const size = fitLine(ctx, text, box.w, 600, FN, box.h);
  ctx.save();
  ctx.font = font(600, size, FN);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const y = box.y + box.h / 2;
  const w = ctx.measureText(text).width;
  const x = centered ? box.x + (box.w - w) / 2 : box.x;
  ctx.fillText(text, x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.beginPath();
  ctx.moveTo(x + size * 0.9, y + size * 0.05);
  ctx.lineTo(x + w, y - size * 0.05);
  ctx.stroke();
  ctx.restore();
};

// ── Cartão do produto ────────────────────────────────────────────────────

type CardShape = ResolvedStyle['card']['shape'];

/** Contorno do cartão: retângulo arredondado, cupom com picote, cantos cortados ou arco no alto. */
const cardPath = (ctx: CanvasRenderingContext2D, r: Rect, radius: number, shape: CardShape) => {
  const { x, y, w, h } = r;
  const short = Math.min(w, h);
  if (shape === 'cut') {
    const c = short * 0.12;
    ctx.beginPath();
    ctx.moveTo(x + c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + c);
    ctx.closePath();
    return;
  }
  const rad = Math.max(0, Math.min(radius, w / 2, h / 2));
  // Arco: cantos de cima bem abertos (meia largura, até metade da altura).
  const top = shape === 'arch' ? Math.min(w / 2, h / 2) : rad;
  ctx.beginPath();
  ctx.moveTo(x + top, y);
  ctx.arcTo(x + w, y, x + w, y + h, top);
  if (shape === 'ticket') {
    // Picote: meia-lua para dentro dos dois lados, na altura da etiqueta.
    const n = short * 0.065;
    const cy = y + h * 0.66;
    ctx.lineTo(x + w, cy - n);
    ctx.arc(x + w, cy, n, -Math.PI / 2, Math.PI / 2, true);
  }
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  if (shape === 'ticket') {
    const n = short * 0.065;
    const cy = y + h * 0.66;
    ctx.lineTo(x, cy + n);
    ctx.arc(x, cy, n, Math.PI / 2, -Math.PI / 2, true);
  }
  ctx.arcTo(x, y, x + w, y, top);
  ctx.closePath();
};

const canBlur = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

/** Fundo do cartão: cor lisa, degradê ou vidro fosco (desfoca o que já está desenhado atrás). */
const fillCard = (ctx: CanvasRenderingContext2D, r: Rect, p: Palette, c: ResolvedStyle['card']) => {
  const alpha = Math.max(0.1, Math.min(1, c.opacity));
  if (c.fill === 'glass') {
    ctx.save();
    ctx.clip();
    if (canBlur) {
      // A fonte do drawImage ignora a transformação: leva o cartão para pixels da tela.
      const m = ctx.getTransform();
      const sx = r.x * m.a + m.e;
      const sy = r.y * m.d + m.f;
      ctx.filter = `blur(${Math.max(2, Math.min(r.w, r.h) * 0.05)}px)`;
      ctx.drawImage(ctx.canvas, sx, sy, r.w * m.a, r.h * m.d, r.x, r.y, r.w, r.h);
      ctx.filter = 'none';
    }
    ctx.globalAlpha = alpha * 0.75;
    ctx.fillStyle = p.card;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();
    return;
  }
  ctx.globalAlpha = alpha;
  if (c.fill === 'gradient') {
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, p.card);
    g.addColorStop(1, mixHex(p.card, p.accent, 0.3));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = p.card;
  }
  ctx.fill();
  ctx.globalAlpha = 1;
};

/** Forma de "mancha" com contorno suave, diferente para cada produto. */
const blobPath = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rad: number, seed: number) => {
  const n = 8;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 0.82 + 0.18 * Math.abs(Math.sin(seed * 12.9898 + i * 78.233));
    return [cx + Math.cos(a) * rad * k, cy + Math.sin(a) * rad * k];
  });
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const [x0, y0] = pts[i % n];
    const [x1, y1] = pts[(i + 1) % n];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(x0, y0, mx, my);
  }
  ctx.closePath();
};

/** Foto do produto com o fundo escolhido (círculo, mancha, raios) e sombra no chão. */
const drawPhoto = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, box: Rect, p: Palette, c: ResolvedStyle['card'], seed: number) => {
  if (box.w <= 4 || box.h <= 4) return;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rad = Math.min(box.w, box.h) * 0.48;
  if (c.photoBg !== 'none') {
    ctx.save();
    ctx.fillStyle = p.accent;
    if (c.photoBg === 'circle') {
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    } else if (c.photoBg === 'blob') {
      ctx.globalAlpha = 0.18;
      blobPath(ctx, cx, cy, rad * 1.05, seed + 1);
      ctx.fill();
    } else {
      // Raios de sol saindo do centro, presos num círculo.
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 1.1, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.2;
      const n = 16;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, rad * 1.2, a0, a0 + Math.PI / n);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }
  const r = contain(img.naturalWidth || img.width, img.naturalHeight || img.height, inset(box, c.photoBg !== 'none' ? rad * 0.12 : 0));
  if (c.photoShadow) {
    const sw = r.w * 0.42;
    const sh = Math.max(2, r.h * 0.06);
    const sy = r.y + r.h - sh * 0.4;
    ctx.save();
    ctx.translate(cx, sy);
    ctx.scale(1, sh / sw);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, sw);
    g.addColorStop(0, 'rgba(0,0,0,0.32)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, sw, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
};

const discount = (item: CampaignItem) =>
  (item.oldPrice != null && item.price != null && item.oldPrice > item.price ? Math.round((1 - item.price / item.oldPrice) * 100) : 0);
const badgeShown = (item: CampaignItem, st: ResolvedStyle) => st.badge.show && discount(item) >= 1;

/** Selo "-20%" no canto do cartão, quando há preço antigo. */
const drawBadge = (ctx: CanvasRenderingContext2D, r: Rect, item: CampaignItem, p: Palette, st: ResolvedStyle, top: number) => {
  if (!badgeShown(item, st)) return;
  const pct = discount(item);
  const short = Math.min(r.w, r.h);
  const d = short * 0.24;
  const b = st.badge;
  const cx = b.position === 'left' ? r.x + d * 0.5 + short * 0.03 : r.x + r.w - d * 0.5 - short * 0.03;
  const cy = top + d * 0.5;
  const text = `-${pct}%`;
  const FP = fontStack(st.fonts.price);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((b.position === 'left' ? -8 : 8) * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = d * 0.12;
  ctx.shadowOffsetY = d * 0.04;
  ctx.fillStyle = p.accent;
  if (b.shape === 'burst') {
    const n = 14;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i * Math.PI) / n;
      const k = i % 2 === 0 ? 0.5 : 0.41;
      if (i === 0) ctx.moveTo(Math.cos(a) * d * k, Math.sin(a) * d * k); else ctx.lineTo(Math.cos(a) * d * k, Math.sin(a) * d * k);
    }
    ctx.closePath();
  } else if (b.shape === 'tag') {
    roundRect(ctx, { x: -d * 0.62, y: -d * 0.3, w: d * 1.24, h: d * 0.6 }, d * 0.1);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, d * 0.46, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = luminance(p.accent) > 0.55 ? '#1c1917' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitLine(ctx, text, d * (b.shape === 'tag' ? 1.05 : 0.7), 400, FP, d * 0.34);
  ctx.font = font(400, size, FP);
  ctx.fillText(text, 0, size * 0.05);
  ctx.restore();
};

/** Paleta de um cartão: no modo "cores alternadas", os ímpares trocam cartão e destaque. */
const cardPalette = (p: Palette, st: ResolvedStyle, index: number): Palette => {
  if (st.card.vary !== 'alternate' || index % 2 === 0) return p;
  return { ...p, card: p.accent, accent: p.card, cardText: luminance(p.accent) > 0.55 ? '#1c1917' : '#ffffff' };
};

const drawCard = (ctx: CanvasRenderingContext2D, r: Rect, item: SceneItem, p0: Palette, selected: boolean, st: ResolvedStyle, index = 0) => {
  const p = cardPalette(p0, st, index);
  const short = Math.min(r.w, r.h);
  const pad = short * 0.06;
  const c = st.card;
  const radius = short * c.radius;
  const FN = fontStack(st.fonts.name);

  if (c.style !== 'none') {
    ctx.save();
    cardPath(ctx, r, radius, c.shape);
    if (c.style === 'solid') {
      // Vidro fosco não leva sombra (ela apareceria através do cartão).
      if (c.shadow && c.fill !== 'glass') {
        ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
        ctx.shadowBlur = short * 0.05;
        ctx.shadowOffsetY = short * 0.018;
      }
      fillCard(ctx, r, p, c);
      ctx.shadowColor = 'transparent';
    }
    // Contorno: borda escolhida, ou a cor do cartão quando o estilo é só contorno.
    const stroke = c.border ?? (c.style === 'outline' ? p.card : null);
    if (stroke) {
      cardPath(ctx, r, radius, c.shape);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(1, short * (c.style === 'outline' ? Math.max(c.borderWidth, 0.012) : c.borderWidth));
      ctx.stroke();
    }
    if (c.shape === 'ticket') {
      // Linha do picote entre as meias-luas.
      const cy = r.y + r.h * 0.66;
      ctx.strokeStyle = p.cardText;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = Math.max(1, short * 0.008);
      ctx.setLineDash([short * 0.03, short * 0.025]);
      ctx.beginPath();
      ctx.moveTo(r.x + short * 0.1, cy);
      ctx.lineTo(r.x + r.w - short * 0.1, cy);
      ctx.stroke();
    }
    ctx.restore();
  }

  let top = r.y + pad;
  // Arco: o miolo começa abaixo da curva e recua dos lados.
  const archR = c.shape === 'arch' ? Math.min(r.w / 2, r.h / 2) : 0;
  if (archR) top = r.y + archR * 0.42 + pad;
  const side = archR ? Math.max(pad, archR * 0.18) : pad;
  if (item.deal) {
    // Faixa da condição, presa no alto do cartão.
    const bandH = Math.max(short * 0.11, 8);
    const bandY = c.shape === 'arch' ? top - pad * 0.5 : r.y;
    ctx.save();
    cardPath(ctx, r, radius, c.shape);
    ctx.clip();
    ctx.fillStyle = p.accent;
    ctx.fillRect(r.x, bandY, r.w, bandH);
    const text = item.deal.toUpperCase();
    const size = fitLine(ctx, text, r.w - pad * 2, 800, FN, bandH * 0.72);
    ctx.font = font(nearestWeight(st.fonts.name, 800), size, FN);
    ctx.fillStyle = luminance(p.accent) > 0.55 ? '#1c1917' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, r.x + r.w / 2, bandY + bandH / 2 + size * 0.04);
    ctx.restore();
    top = bandY + bandH + pad * 0.6;
  }
  const badgeTop = top - pad * 0.4;

  // Empilhar num cartão muito largo deixa tudo miúdo no meio: aí vira lado a lado.
  const aspect = r.w / r.h;
  const layout = c.layout === 'auto' ? (aspect > WIDE_CARD ? 'side' : 'classic')
    : c.layout !== 'side' && c.layout !== 'photo' && aspect > 2 ? 'side' : c.layout;
  const name = applyCase(item.name || '', st.name.case);
  const detail = item.detail?.trim() ?? '';
  const hasImage = !!item.image;
  const hasOld = item.oldPrice != null && item.price != null && item.oldPrice > item.price;

  if (layout === 'side') {
    const col: Rect = { x: r.x + pad, y: top, w: r.w - pad * 2, h: r.y + r.h - pad - top };
    if (hasImage && r.w / r.h > 2.6) {
      // Faixa larga (lista): foto | nome | preço, cada um na sua coluna.
      const imgW = Math.min(col.h * 1.15, col.w * 0.3);
      drawPhoto(ctx, item.image!, { x: col.x, y: col.y, w: imgW, h: col.h }, p, c, index);
      const priceW = col.w * 0.34;
      const mid: Rect = { x: col.x + imgW + pad, y: col.y, w: col.w - imgW - priceW - pad * 2, h: col.h };
      const detailH = detail ? mid.h * 0.18 : 0;
      drawName(ctx, name, detail, { x: mid.x, y: mid.y, w: mid.w, h: mid.h - detailH }, p, st, detailH, 2, 'left', true);
      const right: Rect = { x: col.x + col.w - priceW, y: col.y, w: priceW, h: col.h };
      const oldH = hasOld ? right.h * 0.2 : 0;
      const priceH = Math.min(right.h - oldH, right.h * 0.78);
      const priceY = right.y + (right.h - priceH + oldH) / 2;
      if (hasOld) drawOldPrice(ctx, { x: right.x, y: priceY - oldH, w: right.w, h: oldH }, item.oldPrice!, p.cardText, st, true);
      drawPriceTag(ctx, { x: right.x, y: priceY, w: right.w, h: priceH }, item, p, 'center', st);
    } else if (hasImage) {
      // Foto à esquerda; nome e preço à direita.
      const imgW = col.w * 0.42;
      drawPhoto(ctx, item.image!, { x: col.x, y: col.y, w: imgW - pad, h: col.h }, p, c, index);
      const right: Rect = { x: col.x + imgW, y: col.y, w: col.w - imgW, h: col.h };
      const priceH = right.h * 0.42;
      const oldH = hasOld ? right.h * 0.12 : 0;
      const detailH = detail ? right.h * 0.12 : 0;
      drawName(ctx, name, detail, { x: right.x, y: right.y, w: right.w, h: right.h - priceH - oldH - detailH - pad * 0.4 }, p, st, detailH, 3);
      if (hasOld) drawOldPrice(ctx, { x: right.x, y: right.y + right.h - priceH - oldH, w: right.w, h: oldH }, item.oldPrice!, p.cardText, st);
      drawPriceTag(ctx, { x: right.x, y: right.y + right.h - priceH, w: right.w, h: priceH }, item, p, 'right', st);
    } else {
      // Sem foto: nome grande à esquerda, etiqueta grande à direita.
      const nameW = col.w * 0.54;
      const detailH = detail ? col.h * 0.14 : 0;
      const nameBox: Rect = { x: col.x, y: col.y + col.h * 0.08, w: nameW, h: col.h * 0.84 - detailH };
      drawName(ctx, name, detail, nameBox, p, st, detailH, 3, 'left', true);
      const right: Rect = { x: col.x + nameW + pad, y: col.y, w: col.w - nameW - pad, h: col.h };
      const priceH = Math.min(right.h * 0.56, right.w * 0.5);
      const oldH = hasOld ? right.h * 0.14 : 0;
      const priceY = right.y + (right.h - priceH + oldH) / 2;
      if (hasOld) drawOldPrice(ctx, { x: right.x + right.w * 0.12, y: priceY - oldH - pad * 0.2, w: right.w * 0.88, h: oldH }, item.oldPrice!, p.cardText, st);
      drawPriceTag(ctx, { x: right.x, y: priceY, w: right.w, h: priceH }, item, p, 'center', st);
    }
  } else if (layout === 'photo' && hasImage) {
    // Foto grande: ocupa o cartão; nome no alto e o preço sobre o canto da foto.
    const inner: Rect = { x: r.x + pad, y: top, w: r.w - pad * 2, h: r.y + r.h - pad - top };
    const detailH = detail ? inner.h * 0.07 : 0;
    const nameH = inner.h * 0.14;
    const dodge = badgeShown(item, st) && st.badge.position === 'left' ? short * 0.26 : 0;
    drawName(ctx, name, detail, { x: inner.x + dodge, y: inner.y, w: inner.w - dodge, h: nameH }, p, st, detailH, 2, 'left');
    const photo: Rect = { x: inner.x, y: inner.y + nameH + detailH + pad * 0.3, w: inner.w, h: inner.h - nameH - detailH - pad * 0.3 };
    drawPhoto(ctx, item.image!, photo, p, c, index);
    const priceH = inner.h * 0.3;
    const oldH = hasOld ? inner.h * 0.07 : 0;
    const priceBox: Rect = { x: inner.x + inner.w * 0.3, y: inner.y + inner.h - priceH, w: inner.w * 0.7, h: priceH };
    if (hasOld) drawOldPrice(ctx, { x: inner.x, y: inner.y + inner.h - oldH, w: inner.w * 0.32, h: oldH }, item.oldPrice!, p.cardText, st);
    drawPriceTag(ctx, priceBox, item, p, 'right', st);
  } else {
    // Empilhado: ordem da foto, do nome e do preço conforme o layout.
    const inner: Rect = { x: r.x + side, y: top, w: r.w - side * 2, h: r.y + r.h - pad - top };
    const priceH = inner.h * (hasImage ? (layout === 'price-top' ? 0.3 : 0.26) : 0.34);
    const oldH = hasOld ? inner.h * 0.075 : 0;
    const detailH = detail ? inner.h * 0.085 : 0;
    // O selo redondo passa da faixa do preço; reserva a sobra em cima e embaixo.
    const halo = st.tag.shape === 'circle' ? priceH * 0.18 : 0;
    if (!hasImage) {
      // Sem foto, o nome ocupa o espaço livre e o preço fica embaixo (ou em cima).
      const free = inner.h - priceH - oldH - pad * 0.5;
      const priceFirst = layout === 'price-top';
      const nameY = priceFirst ? inner.y + priceH + oldH + pad * 0.5 : inner.y;
      drawName(ctx, name, detail, { x: inner.x, y: nameY, w: inner.w, h: free - detailH }, p, st, detailH, 4, 'center', true);
      const priceTop = priceFirst ? inner.y + oldH : inner.y + inner.h - priceH;
      if (hasOld) drawOldPrice(ctx, { x: inner.x, y: priceTop - oldH, w: inner.w * 0.7, h: oldH }, item.oldPrice!, p.cardText, st);
      drawPriceTag(ctx, { x: inner.x, y: priceTop, w: inner.w, h: priceH }, item, p, 'center', st);
    } else {
      const nameH = inner.h * 0.17;
      const imgH = inner.h - priceH - oldH - nameH - detailH - pad * 0.6 - halo * 2;
      const order = layout === 'price-top' ? ['price', 'photo', 'name'] : layout === 'name-top' ? ['name', 'photo', 'price'] : ['photo', 'name', 'price'];
      let y = inner.y;
      for (const part of order) {
        if (part === 'photo') {
          if (imgH > 4) drawPhoto(ctx, item.image!, { x: inner.x, y, w: inner.w, h: imgH }, p, c, index);
          y += Math.max(0, imgH) + pad * 0.3;
        } else if (part === 'name') {
          drawName(ctx, name, detail, { x: inner.x, y, w: inner.w, h: nameH }, p, st, detailH, 2, 'center');
          y += nameH + detailH + pad * 0.3;
        } else {
          if (hasOld) {
            const priceFirst = layout === 'price-top';
            drawOldPrice(ctx, priceFirst ? { x: inner.x, y, w: inner.w, h: oldH } : { x: inner.x, y, w: inner.w * 0.7, h: oldH }, item.oldPrice!, p.cardText, st, priceFirst);
          }
          drawPriceTag(ctx, { x: inner.x, y: y + oldH + halo, w: inner.w, h: priceH }, item, p, layout === 'price-top' ? 'center' : 'right', st);
          y += oldH + priceH + halo * 2 + pad * 0.3;
        }
      }
    }
  }

  drawBadge(ctx, r, item, p, st, badgeTop);

  if (selected) {
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = Math.max(3, short * 0.018);
    ctx.setLineDash([short * 0.05, short * 0.03]);
    roundRect(ctx, inset(r, -ctx.lineWidth), radius + ctx.lineWidth);
    ctx.stroke();
    ctx.restore();
  }
};

const drawName = (
  ctx: CanvasRenderingContext2D, name: string, detail: string, box: Rect, p: Palette, st: ResolvedStyle, detailH: number,
  autoLines: number, autoAlign: 'left' | 'center' = 'left', centerVertical = false,
) => {
  if (box.h <= 2 || box.w <= 2) return;
  const FN = fontStack(st.fonts.name);
  const weight = nearestWeight(st.fonts.name, st.name.weight);
  const align = st.name.align === 'auto' ? autoAlign : st.name.align;
  const maxLines = st.name.maxLines ?? autoLines;
  const fit = fitWrapped(ctx, name, box, weight, FN, maxLines, box.h * 0.62 * st.name.size, Math.max(6, box.h * 0.16), 1.0);
  ctx.save();
  ctx.fillStyle = st.name.color ?? p.cardText;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  ctx.font = font(weight, fit.size, FN);
  const x = align === 'center' ? box.x + box.w / 2 : box.x;
  const used = fit.lines.length * fit.size;
  // Nome colado embaixo da foto (centro) ou no alto da coluna (horizontal).
  let y = align === 'center' || centerVertical ? box.y + Math.max(0, (box.h - used) / 2) : box.y;
  if (st.name.stroke) {
    ctx.strokeStyle = st.name.stroke;
    ctx.lineWidth = Math.max(1, fit.size * 0.14);
    ctx.lineJoin = 'round';
  }
  for (const line of fit.lines) {
    if (st.name.stroke) ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    y += fit.size;
  }
  if (detail && detailH > 2) {
    const size = fitLine(ctx, detail, box.w, 500, FN, detailH * 0.85);
    ctx.font = font(nearestWeight(st.fonts.name, 500), size, FN);
    ctx.globalAlpha = 0.72;
    ctx.fillText(detail, x, y + size * 0.12);
  }
  ctx.restore();
};

// ── Cena ─────────────────────────────────────────────────────────────────

const drawBuiltinBackground = (ctx: CanvasRenderingContext2D, s: Scene) => {
  const { width: W, height: H, palette: p } = s;
  const products = s.regions.products ? toPx(s.regions.products, W, H) : { x: 0, y: H * 0.2, w: W, h: H * 0.7 };
  const bandH = products.y - Math.min(W, H) * 0.02;
  const body = ctx.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, mixHex(p.accent, '#ffffff', 0.55));
  body.addColorStop(1, mixHex(p.accent, '#ffffff', 0.25));
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, W, H);

  const band = ctx.createLinearGradient(0, 0, W, bandH);
  band.addColorStop(0, p.tag);
  band.addColorStop(1, mixHex(p.tag, '#000000', 0.22));
  ctx.fillStyle = band;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, bandH * 0.86);
  ctx.quadraticCurveTo(W / 2, bandH * 1.14, 0, bandH * 0.86);
  ctx.closePath();
  ctx.fill();

  if (s.regions.footer) {
    const f = toPx(s.regions.footer, W, H);
    ctx.fillStyle = mixHex(p.tag, '#000000', 0.3);
    ctx.fillRect(0, f.y - Math.min(W, H) * 0.01, W, H - f.y + Math.min(W, H) * 0.01);
  }

  if (s.headline) {
    const logo = s.regions.logo ? toPx(s.regions.logo, W, H) : null;
    const left = logo ? logo.x + logo.w + W * 0.03 : W * 0.05;
    const box: Rect = { x: left, y: bandH * 0.12, w: W - left - W * 0.05, h: bandH * 0.62 };
    const FP = fontStack((s.style ?? DEFAULT_STYLE).fonts.price);
    const fit = fitWrapped(ctx, s.headline.toUpperCase(), box, 400, FP, 2, box.h, box.h * 0.2, 1.02);
    ctx.save();
    ctx.fillStyle = p.tagText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = font(400, fit.size, FP);
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = fit.size * 0.08;
    ctx.shadowOffsetY = fit.size * 0.04;
    const total = fit.lines.length * fit.size * 1.02;
    let y = box.y + (box.h - total) / 2;
    for (const line of fit.lines) {
      ctx.fillText(line, box.x + box.w / 2, y);
      y += fit.size * 1.02;
    }
    ctx.restore();
  }
};

/** Texto claro sobre fundo escuro e vice-versa, medindo o fundo no lugar do texto. */
const inkFor = (s: Scene, key: 'footer' | 'logo'): string => {
  const region = s.regions[key];
  if (!s.background) return key === 'footer' ? '#ffffff' : s.palette.tagText;
  if (!region) return '#1c1917';
  return regionLuminance(s.background, region) < 0.55 ? '#ffffff' : '#1c1917';
};

// ── Camadas e animação ───────────────────────────────────────────────────

/** Desenha com o deslocamento da animação, girando e escalando em torno de (px, py). */
const withPose = (ctx: CanvasRenderingContext2D, p: Pose | null, unit: number, px: number, py: number, draw: () => void) => {
  if (!p) { draw(); return; }
  if (p.alpha <= 0.001 || p.scale <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= p.alpha;
  ctx.translate(px + p.dx * unit, py + p.dy * unit);
  if (p.rotate) ctx.rotate((p.rotate * Math.PI) / 180);
  if (p.scale !== 1) ctx.scale(p.scale, p.scale);
  ctx.translate(-px, -py);
  draw();
  ctx.restore();
};

/**
 * Camada parada na animação. A base (fundo) fica parada a menos que o
 * superadmin libere: animar o fundo abre bordas vazias na arte.
 */
export const layerStill = (l: Pick<ThemeLayer, 'role' | 'still'>) => (l.role === 'base' ? l.still !== false : !!l.still);

const poseOf = (s: Scene, target: MotionTarget): Pose | null =>
  (s.motion ? poseAt(s.motion.preset, target, s.motion.t, s.motion.duration) : null);

/**
 * Desenha as camadas do fundo. Também é usada para montar a imagem achatada
 * que vai para o servidor (sem `motion`).
 */
export const drawLayers = (ctx: CanvasRenderingContext2D, layers: SceneLayer[], W: number, H: number, motion?: SceneMotion | null) => {
  const unit = Math.min(W, H);
  const elements = layers.filter((l) => l.role !== 'base');
  layers.forEach((layer) => {
    const img = layer.image;
    if (layer.hidden || !img.naturalWidth) return;
    const base = layer.role === 'base';
    const w = base ? W : layer.width * W;
    const h = base ? H : w * (img.naturalHeight / img.naturalWidth);
    const cx = base ? W / 2 : layer.cx * W;
    const cy = base ? H / 2 : layer.cy * H;
    const target: MotionTarget = base
      ? { kind: 'base', index: 0, count: 1, cx: 0.5, cy: 0.5, still: layerStill(layer) }
      : { kind: 'layer', index: elements.indexOf(layer), count: elements.length, cx: layer.cx, cy: layer.cy, still: layerStill(layer) };
    const p = motion ? poseAt(motion.preset, target, motion.t, motion.duration) : null;
    withPose(ctx, p, unit, cx, cy, () => {
      ctx.save();
      ctx.globalAlpha *= layer.opacity ?? 1;
      ctx.translate(cx, cy);
      if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    });
  });
};

export const renderScene = (ctx: CanvasRenderingContext2D, s: Scene): RenderResult => {
  const { width: W, height: H } = s;
  const st = s.style ?? DEFAULT_STYLE;
  const unit = Math.min(W, H);
  const center = (r: Rect) => ({ cx: (r.x + r.w / 2) / W, cy: (r.y + r.h / 2) / H });
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (s.layers?.length) {
    // Fundo de cor por trás: zoom e parallax afastam a base das bordas.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    drawLayers(ctx, s.layers, W, H, s.motion);
  } else if (s.background) {
    // Fundo numa imagem só: fica parado (só selo, logo, produtos e rodapé animam).
    ctx.drawImage(s.background, 0, 0, W, H);
  } else {
    drawBuiltinBackground(ctx, s);
  }

  // Logo: imagem do mercado ou o nome, quando ainda não há logo.
  if (s.regions.logo) {
    const box = toPx(s.regions.logo, W, H);
    const logo = s.logo;
    withPose(ctx, poseOf(s, { kind: 'logo', index: 0, count: 1, ...center(box) }), unit, box.x + box.w / 2, box.y + box.h / 2, () => {
      if (logo) {
        drawContain(ctx, logo, inset(box, Math.min(box.w, box.h) * 0.04));
      } else if (s.brandName) {
        const FN = fontStack(st.fonts.name);
        const weight = nearestWeight(st.fonts.name, 800);
        const fit = fitWrapped(ctx, s.brandName.toUpperCase(), inset(box, box.h * 0.08), weight, FN, 2, box.h * 0.6, box.h * 0.15, 1);
        ctx.save();
        ctx.fillStyle = inkFor(s, 'logo');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = font(weight, fit.size, FN);
        const total = fit.lines.length * fit.size;
        let y = box.y + (box.h - total) / 2;
        for (const line of fit.lines) {
          ctx.fillText(line, box.x + box.w / 2, y);
          y += fit.size;
        }
        ctx.restore();
      }
    });
  }

  if (s.showSeal && s.seal && s.regions.seal) {
    const box = toPx(s.regions.seal, W, H);
    const seal = s.seal;
    withPose(ctx, poseOf(s, { kind: 'seal', index: 0, count: 1, ...center(box) }), unit, box.x + box.w / 2, box.y + box.h / 2, () => {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = Math.min(box.w, box.h) * 0.06;
      ctx.shadowOffsetY = Math.min(box.w, box.h) * 0.02;
      drawContain(ctx, seal, box);
      ctx.restore();
    });
  }

  const cards: RenderResult['cards'] = [];
  if (s.regions.products && s.items.length) {
    const area = toPx(s.regions.products, W, H);
    const gap = Math.min(W, H) * (s.items.length > 12 ? 0.012 : 0.018) * st.grid.gap;
    const heroes = s.items.filter((i) => i.hero).length;
    // Destaques primeiro, na ordem em que o lojista os deixou.
    const ordered = [...s.items.filter((i) => i.hero).slice(0, 2), ...s.items.filter((i) => !i.hero), ...s.items.filter((i) => i.hero).slice(2)];
    const rects = layoutProducts(area, ordered.length, Math.min(heroes, 2), gap, st.grid.layout);
    ordered.forEach((item, i) => {
      const r = rects[i];
      if (!r) return;
      const target: MotionTarget = { kind: 'card', index: i, count: ordered.length, hero: !!item.hero, ...center(r) };
      // "Inclinar alternado": cartões vizinhos tortos para lados opostos, como papel colado.
      const tilt = st.card.vary === 'tilt' ? (i % 2 === 0 ? -1.6 : 1.6) : 0;
      withPose(ctx, poseOf(s, target), unit, r.x + r.w / 2, r.y + r.h / 2, () => {
        if (!tilt) { drawCard(ctx, r, item, s.palette, s.selectedKey === item.key, st, i); return; }
        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
        ctx.rotate((tilt * Math.PI) / 180);
        ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
        drawCard(ctx, r, item, s.palette, s.selectedKey === item.key, st, i);
        ctx.restore();
      });
      cards.push({ key: item.key, rect: r });
    });
  }

  if (s.regions.footer && s.footerLines.length) {
    const box = inset(toPx(s.regions.footer, W, H), 0);
    const lines = s.footerLines.filter(Boolean).slice(0, 3);
    const lineH = box.h / lines.length;
    const f = st.footer;
    const FT = fontStack(st.fonts.text);
    ctx.save();
    const fp = poseOf(s, { kind: 'footer', index: 0, count: 1, ...center(box) });
    if (fp) {
      // Rodapé só sobe e aparece (sem giro): desloca e esmaece o bloco.
      ctx.globalAlpha *= fp.alpha;
      ctx.translate(fp.dx * unit, fp.dy * unit);
    }
    if (f.band) {
      // Faixa atrás do texto, de borda a borda da área.
      ctx.save();
      ctx.globalAlpha *= Math.max(0.1, Math.min(1, f.bandOpacity));
      ctx.fillStyle = f.band;
      roundRect(ctx, inset(box, -box.h * 0.08), box.h * 0.12);
      ctx.fill();
      ctx.restore();
    }
    const ink = f.color ?? (f.band ? (luminance(f.band) > 0.55 ? '#1c1917' : '#ffffff') : inkFor(s, 'footer'));
    ctx.fillStyle = ink;
    if (f.shadow && !f.band) {
      // Fundo de designer muda de cor dentro do rodapé (faixas, ondas): uma
      // sombra no tom oposto mantém o texto legível sobre qualquer trecho.
      ctx.shadowColor = luminance(ink) > 0.55 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)';
      ctx.shadowBlur = Math.max(2, box.h * 0.06);
      ctx.shadowOffsetY = Math.max(1, box.h * 0.012);
    }
    ctx.textAlign = f.align;
    ctx.textBaseline = 'middle';
    const x = f.align === 'left' ? box.x : f.align === 'right' ? box.x + box.w : box.x + box.w / 2;
    lines.forEach((raw, i) => {
      const line = applyCase(raw, f.case);
      // Primeira linha (nome e endereço) mais forte que as outras.
      const weight = nearestWeight(st.fonts.text, i === 0 ? f.weight : Math.max(400, f.weight - 200));
      const size = fitLine(ctx, line, box.w, weight, FT, lineH * 0.62 * f.size);
      ctx.font = font(weight, size, FT);
      ctx.fillText(line, x, box.y + lineH * (i + 0.5));
    });
    ctx.restore();
  }

  ctx.restore();
  return { cards };
};

export const brDate = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d && m ? `${d}/${m}${y && y !== String(new Date().getFullYear()) ? `/${y}` : ''}` : iso;
};

/** Linhas do rodapé: validade (com o aviso de estoque) e contato. */
export const footerLinesFor = (
  brand: { addressLine?: string | null; phone?: string | null; whatsapp?: string | null; instagram?: string | null; footerNote?: string | null } | null,
  validFrom: string | null, validUntil: string | null,
): string[] => {
  const lines: string[] = [];
  if (validFrom && validUntil) lines.push(`Ofertas válidas de ${brDate(validFrom)} a ${brDate(validUntil)} ou enquanto durarem os estoques`);
  else if (validUntil) lines.push(`Ofertas válidas até ${brDate(validUntil)} ou enquanto durarem os estoques`);
  else lines.push('Ofertas válidas enquanto durarem os estoques');
  const contact = [
    brand?.addressLine,
    brand?.whatsapp ? `WhatsApp ${brand.whatsapp}` : brand?.phone,
    brand?.instagram ? `@${brand.instagram.replace(/^@/, '')}` : null,
  ].filter(Boolean).join('  •  ');
  if (contact) lines.push(contact);
  if (brand?.footerNote) lines.push(brand.footerNote);
  return lines;
};
