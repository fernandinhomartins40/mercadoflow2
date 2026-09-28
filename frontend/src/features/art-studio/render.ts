import type { CampaignItem, Palette, Regions } from '../../types/art.types';
import { FONT_NAME, FONT_PRICE, FONT_TEXT, regionLuminance } from './assets';
import { Rect, WIDE_CARD, contain, inset, layoutProducts, toPx } from './layout';

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
}

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
const drawPriceTag = (ctx: CanvasRenderingContext2D, box: Rect, item: CampaignItem, p: Palette, align: 'right' | 'center') => {
  if (item.price == null || !Number.isFinite(item.price)) return;
  const { int, cents } = priceParts(item.price);
  const unit = unitLabel(item.unit || 'un');
  const H = box.h;
  let S = H * 0.78;
  const measure = (s: number) => {
    ctx.font = font(400, s * 0.3, FONT_PRICE);
    const wr = ctx.measureText('R$').width;
    ctx.font = font(400, s, FONT_PRICE);
    const wi = ctx.measureText(int).width;
    ctx.font = font(400, s * 0.42, FONT_PRICE);
    const wc = ctx.measureText(`,${cents}`).width;
    ctx.font = font(700, s * 0.17, FONT_NAME);
    const wu = ctx.measureText(unit).width;
    const gap = s * 0.05;
    return { wr, wi, wc: Math.max(wc, wu), gap, total: wr + gap + wi + gap + Math.max(wc, wu) };
  };
  let m = measure(S);
  const padX = H * 0.16;
  const maxInner = box.w - padX * 2;
  if (m.total > maxInner) {
    S *= maxInner / m.total;
    m = measure(S);
  }
  const tagW = Math.min(box.w, m.total + padX * 2);
  const tag: Rect = {
    x: align === 'right' ? box.x + box.w - tagW : box.x + (box.w - tagW) / 2,
    y: box.y, w: tagW, h: H,
  };

  ctx.save();
  const cx = tag.x + tag.w / 2;
  const cy = tag.y + tag.h / 2;
  ctx.translate(cx, cy);
  ctx.rotate((-3 * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = H * 0.12;
  ctx.shadowOffsetY = H * 0.04;
  ctx.fillStyle = p.tag;
  roundRect(ctx, tag, H * 0.16);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Linha de base: o número grande ocupa ~72% da etiqueta (Anton tem caixa-alta alta).
  const baseline = tag.y + tag.h * 0.5 + S * 0.36;
  let x = tag.x + (tag.w - m.total) / 2;
  ctx.fillStyle = p.tagText;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = font(400, S * 0.3, FONT_PRICE);
  ctx.fillText('R$', x, baseline - S * 0.42);
  x += m.wr + m.gap;
  ctx.font = font(400, S, FONT_PRICE);
  ctx.fillText(int, x, baseline);
  x += m.wi + m.gap;
  ctx.font = font(400, S * 0.42, FONT_PRICE);
  ctx.fillText(`,${cents}`, x, baseline - S * 0.3);
  ctx.font = font(700, S * 0.17, FONT_NAME);
  ctx.globalAlpha = 0.92;
  ctx.fillText(unit, x + S * 0.02, baseline);
  ctx.restore();
};

const drawOldPrice = (ctx: CanvasRenderingContext2D, box: Rect, value: number, color: string) => {
  const text = `De ${formatPrice(value)}`;
  const size = fitLine(ctx, text, box.w, 600, FONT_NAME, box.h);
  ctx.save();
  ctx.font = font(600, size, FONT_NAME);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const y = box.y + box.h / 2;
  ctx.fillText(text, box.x, y);
  const w = ctx.measureText(text).width;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.beginPath();
  ctx.moveTo(box.x + size * 0.9, y + size * 0.05);
  ctx.lineTo(box.x + w, y - size * 0.05);
  ctx.stroke();
  ctx.restore();
};

// ── Cartão do produto ────────────────────────────────────────────────────

const drawCard = (ctx: CanvasRenderingContext2D, r: Rect, item: SceneItem, p: Palette, selected: boolean) => {
  const short = Math.min(r.w, r.h);
  const pad = short * 0.06;
  const radius = short * 0.07;

  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
  ctx.shadowBlur = short * 0.05;
  ctx.shadowOffsetY = short * 0.018;
  ctx.fillStyle = p.card;
  roundRect(ctx, r, radius);
  ctx.fill();
  ctx.restore();

  let top = r.y + pad;
  if (item.deal) {
    // Faixa da condição, presa no alto do cartão.
    const bandH = Math.max(short * 0.11, 8);
    ctx.save();
    roundRect(ctx, r, radius);
    ctx.clip();
    ctx.fillStyle = p.accent;
    ctx.fillRect(r.x, r.y, r.w, bandH);
    const text = item.deal.toUpperCase();
    const size = fitLine(ctx, text, r.w - pad * 2, 800, FONT_NAME, bandH * 0.72);
    ctx.font = font(800, size, FONT_NAME);
    ctx.fillStyle = luminance(p.accent) > 0.55 ? '#1c1917' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, r.x + r.w / 2, r.y + bandH / 2 + size * 0.04);
    ctx.restore();
    top = r.y + bandH + pad * 0.6;
  }

  const wide = r.w / r.h > WIDE_CARD;
  const name = (item.name || '').toUpperCase();
  const detail = item.detail?.trim() ?? '';
  const hasImage = !!item.image;
  const hasOld = item.oldPrice != null && item.price != null && item.oldPrice > item.price;

  if (wide) {
    const col: Rect = { x: r.x + pad, y: top, w: r.w - pad * 2, h: r.y + r.h - pad - top };
    if (hasImage) {
      // Foto à esquerda; nome e preço à direita.
      const imgW = col.w * 0.42;
      drawContain(ctx, item.image!, { x: col.x, y: col.y, w: imgW - pad, h: col.h });
      const right: Rect = { x: col.x + imgW, y: col.y, w: col.w - imgW, h: col.h };
      const priceH = right.h * 0.42;
      const oldH = hasOld ? right.h * 0.12 : 0;
      const detailH = detail ? right.h * 0.12 : 0;
      drawName(ctx, name, detail, { x: right.x, y: right.y, w: right.w, h: right.h - priceH - oldH - detailH - pad * 0.4 }, p, detailH, 3);
      if (hasOld) drawOldPrice(ctx, { x: right.x, y: right.y + right.h - priceH - oldH, w: right.w, h: oldH }, item.oldPrice!, p.cardText);
      drawPriceTag(ctx, { x: right.x, y: right.y + right.h - priceH, w: right.w, h: priceH }, item, p, 'right');
    } else {
      // Sem foto: nome grande à esquerda, etiqueta grande à direita.
      const nameW = col.w * 0.54;
      const detailH = detail ? col.h * 0.14 : 0;
      const nameBox: Rect = { x: col.x, y: col.y + col.h * 0.08, w: nameW, h: col.h * 0.84 - detailH };
      drawName(ctx, name, detail, nameBox, p, detailH, 3, 'left', true);
      const right: Rect = { x: col.x + nameW + pad, y: col.y, w: col.w - nameW - pad, h: col.h };
      const priceH = Math.min(right.h * 0.56, right.w * 0.5);
      const oldH = hasOld ? right.h * 0.14 : 0;
      const priceY = right.y + (right.h - priceH + oldH) / 2;
      if (hasOld) drawOldPrice(ctx, { x: right.x + right.w * 0.12, y: priceY - oldH - pad * 0.2, w: right.w * 0.88, h: oldH }, item.oldPrice!, p.cardText);
      drawPriceTag(ctx, { x: right.x, y: priceY, w: right.w, h: priceH }, item, p, 'center');
    }
  } else {
    const inner: Rect = { x: r.x + pad, y: top, w: r.w - pad * 2, h: r.y + r.h - pad - top };
    const priceH = inner.h * (hasImage ? 0.26 : 0.34);
    const oldH = hasOld ? inner.h * 0.075 : 0;
    const detailH = detail ? inner.h * 0.085 : 0;
    if (hasImage) {
      const nameH = inner.h * 0.17;
      const imgH = inner.h - priceH - oldH - nameH - detailH - pad * 0.6;
      if (imgH > 4) drawContain(ctx, item.image!, { x: inner.x, y: inner.y, w: inner.w, h: imgH });
      drawName(ctx, name, detail, { x: inner.x, y: inner.y + imgH + pad * 0.3, w: inner.w, h: nameH }, p, detailH, 2, 'center');
    } else {
      // Sem foto, o nome ocupa o alto do cartão, centrado no espaço livre.
      const free = inner.h - priceH - oldH - pad * 0.5;
      drawName(ctx, name, detail, { x: inner.x, y: inner.y, w: inner.w, h: free - detailH }, p, detailH, 4, 'center', true);
    }
    const priceTop = inner.y + inner.h - priceH;
    if (hasOld) drawOldPrice(ctx, { x: inner.x, y: priceTop - oldH, w: inner.w * 0.7, h: oldH }, item.oldPrice!, p.cardText);
    drawPriceTag(ctx, { x: inner.x, y: priceTop, w: inner.w, h: priceH }, item, p, hasImage ? 'right' : 'center');
  }

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
  ctx: CanvasRenderingContext2D, name: string, detail: string, box: Rect, p: Palette, detailH: number,
  maxLines: number, align: 'left' | 'center' = 'left', centerVertical = false,
) => {
  if (box.h <= 2 || box.w <= 2) return;
  const fit = fitWrapped(ctx, name, box, 700, FONT_NAME, maxLines, box.h * 0.62, Math.max(6, box.h * 0.16), 1.0);
  ctx.save();
  ctx.fillStyle = p.cardText;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  ctx.font = font(700, fit.size, FONT_NAME);
  const x = align === 'center' ? box.x + box.w / 2 : box.x;
  const used = fit.lines.length * fit.size;
  // Nome colado embaixo da foto (centro) ou no alto da coluna (horizontal).
  let y = align === 'center' || centerVertical ? box.y + Math.max(0, (box.h - used) / 2) : box.y;
  for (const line of fit.lines) {
    ctx.fillText(line, x, y);
    y += fit.size;
  }
  if (detail && detailH > 2) {
    const size = fitLine(ctx, detail, box.w, 500, FONT_NAME, detailH * 0.85);
    ctx.font = font(500, size, FONT_NAME);
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
    const fit = fitWrapped(ctx, s.headline.toUpperCase(), box, 400, FONT_PRICE, 2, box.h, box.h * 0.2, 1.02);
    ctx.save();
    ctx.fillStyle = p.tagText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = font(400, fit.size, FONT_PRICE);
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

export const renderScene = (ctx: CanvasRenderingContext2D, s: Scene): RenderResult => {
  const { width: W, height: H } = s;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (s.background) {
    ctx.drawImage(s.background, 0, 0, W, H);
  } else {
    drawBuiltinBackground(ctx, s);
  }

  // Logo: imagem do mercado ou o nome, quando ainda não há logo.
  if (s.regions.logo) {
    const box = toPx(s.regions.logo, W, H);
    if (s.logo) {
      drawContain(ctx, s.logo, inset(box, Math.min(box.w, box.h) * 0.04));
    } else if (s.brandName) {
      const fit = fitWrapped(ctx, s.brandName.toUpperCase(), inset(box, box.h * 0.08), 800, FONT_NAME, 2, box.h * 0.6, box.h * 0.15, 1);
      ctx.save();
      ctx.fillStyle = inkFor(s, 'logo');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = font(800, fit.size, FONT_NAME);
      const total = fit.lines.length * fit.size;
      let y = box.y + (box.h - total) / 2;
      for (const line of fit.lines) {
        ctx.fillText(line, box.x + box.w / 2, y);
        y += fit.size;
      }
      ctx.restore();
    }
  }

  if (s.showSeal && s.seal && s.regions.seal) {
    const box = toPx(s.regions.seal, W, H);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = Math.min(box.w, box.h) * 0.06;
    ctx.shadowOffsetY = Math.min(box.w, box.h) * 0.02;
    drawContain(ctx, s.seal, box);
    ctx.restore();
  }

  const cards: RenderResult['cards'] = [];
  if (s.regions.products && s.items.length) {
    const area = toPx(s.regions.products, W, H);
    const gap = Math.min(W, H) * (s.items.length > 12 ? 0.012 : 0.018);
    const heroes = s.items.filter((i) => i.hero).length;
    // Destaques primeiro, na ordem em que o lojista os deixou.
    const ordered = [...s.items.filter((i) => i.hero).slice(0, 2), ...s.items.filter((i) => !i.hero), ...s.items.filter((i) => i.hero).slice(2)];
    const rects = layoutProducts(area, ordered.length, Math.min(heroes, 2), gap);
    ordered.forEach((item, i) => {
      if (!rects[i]) return;
      drawCard(ctx, rects[i], item, s.palette, s.selectedKey === item.key);
      cards.push({ key: item.key, rect: rects[i] });
    });
  }

  if (s.regions.footer && s.footerLines.length) {
    const box = inset(toPx(s.regions.footer, W, H), 0);
    const lines = s.footerLines.filter(Boolean).slice(0, 3);
    const lineH = box.h / lines.length;
    ctx.save();
    const ink = inkFor(s, 'footer');
    ctx.fillStyle = ink;
    // Fundo de designer muda de cor dentro do rodapé (faixas, ondas): uma
    // sombra no tom oposto mantém o texto legível sobre qualquer trecho.
    ctx.shadowColor = ink === '#ffffff' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)';
    ctx.shadowBlur = Math.max(2, box.h * 0.06);
    ctx.shadowOffsetY = Math.max(1, box.h * 0.012);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      const weight = i === 0 ? 700 : 500;
      const size = fitLine(ctx, line, box.w, weight, FONT_TEXT, lineH * 0.62);
      ctx.font = font(weight, size, FONT_TEXT);
      ctx.fillText(line, box.x + box.w / 2, box.y + lineH * (i + 0.5));
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
