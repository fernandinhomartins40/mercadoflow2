import type { CampaignItem, Palette } from '../../types/art.types';
import { FONT_NAME, FONT_PRICE, FONT_TEXT } from './assets';
import { Scene, formatPrice, mixHex, priceParts, renderScene } from './render';

/**
 * Exportação: a arte é desenhada de novo, em tamanho real, num canvas fora da
 * tela — com o mesmo {@link renderScene} da prévia.
 */

export const sceneCanvas = (scene: Scene): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = scene.width;
  canvas.height = scene.height;
  const ctx = canvas.getContext('2d')!;
  renderScene(ctx, { ...scene, selectedKey: null });
  return canvas;
};

export const canvasBlob = (canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality = 0.92) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem'))), type, quality);
  });

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export const slugify = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'encarte';

// ── PDF ──────────────────────────────────────────────────────────────────

/**
 * PDF mínimo com uma imagem JPEG por página (DCTDecode). A arte sai a 300 dpi
 * no A4 (2480 × 3508 px): é o padrão de gráfica, e o texto fica nítido.
 */
export const jpegPagesToPdf = async (pages: HTMLCanvasElement[], pageWpt = 595.28, pageHpt = 841.89): Promise<Blob> => {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: string) => { offsets[n] = length; push(`${n} 0 obj\n${body}\nendobj\n`); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const count = pages.length;
  // 1 catálogo, 2 páginas; cada página usa 3 objetos: página, conteúdo, imagem.
  const pageIds = pages.map((_, i) => 3 + i * 3);
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${count} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  for (let i = 0; i < count; i++) {
    const canvas = pages[i];
    const jpeg = new Uint8Array(await (await canvasBlob(canvas, 'image/jpeg', 0.93)).arrayBuffer());
    const [pid, cid, iid] = [pageIds[i], pageIds[i] + 1, pageIds[i] + 2];
    object(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt} ${pageHpt}] /Resources << /XObject << /Im${i} ${iid} 0 R >> >> /Contents ${cid} 0 R >>`);
    const content = `q ${pageWpt} 0 0 ${pageHpt} 0 0 cm /Im${i} Do Q`;
    object(cid, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    offsets[iid] = length;
    push(`${iid} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push('\nendstream\nendobj\n');
  }
  const total = 3 + count * 3;
  const xref = length;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let n = 1; n < total; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
};

// ── Cartaz de gôndola ────────────────────────────────────────────────────

export interface PosterOptions {
  palette: Palette;
  brandName: string;
  seal: HTMLImageElement | null;
  validity: string;
  /** Cartazes por folha A4: 1 (em pé), 2 (meia folha deitada) ou 4. */
  perPage: 1 | 2 | 4;
}

const PAGE_W = 2480;
const PAGE_H = 3508;

const fontOf = (w: number | string, s: number, f: string) => `${w} ${Math.max(1, s)}px ${f}`;

const fitSize = (ctx: CanvasRenderingContext2D, text: string, maxW: number, weight: number | string, family: string, maxSize: number) => {
  ctx.font = fontOf(weight, maxSize, family);
  const w = ctx.measureText(text).width;
  return w <= maxW ? maxSize : maxSize * (maxW / w);
};

const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxW: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  words.forEach((w) => {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !line) line = t;
    else { lines.push(line); line = w; }
  });
  if (line) lines.push(line);
  return lines;
};

/**
 * Um cartaz: faixa de chamada em cima (a condição ou "OFERTA"), o nome do
 * produto, o preço gigante e a validade. Sem foto de propósito — cartaz de
 * gôndola é lido de longe, e o produto está logo abaixo dele.
 */
const drawPoster = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, item: CampaignItem, o: PosterOptions) => {
  const p = o.palette;
  const m = Math.min(w, h) * 0.05;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = mixHex(p.tag, '#ffffff', 0.55);
  ctx.lineWidth = Math.max(4, Math.min(w, h) * 0.006);
  ctx.setLineDash([Math.min(w, h) * 0.02, Math.min(w, h) * 0.014]);
  ctx.strokeRect(x + ctx.lineWidth, y + ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
  ctx.setLineDash([]);

  // Faixa de chamada.
  const bandH = h * 0.17;
  ctx.fillStyle = p.tag;
  ctx.fillRect(x + m * 0.5, y + m * 0.5, w - m, bandH);
  const call = (item.deal || 'Oferta').toUpperCase();
  const sealW = o.seal ? bandH * 1.25 : 0;
  const callSize = fitSize(ctx, call, w - m * 3 - sealW, 400, FONT_PRICE, bandH * 0.62);
  ctx.font = fontOf(400, callSize, FONT_PRICE);
  ctx.fillStyle = p.tagText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(call, x + (w - sealW) / 2, y + m * 0.5 + bandH / 2 + callSize * 0.04);
  if (o.seal) {
    const sw = sealW * 0.92;
    const ratio = o.seal.naturalWidth / o.seal.naturalHeight;
    const sh = Math.min(bandH * 1.3, sw / ratio);
    ctx.drawImage(o.seal, x + w - m - sw, y + m * 0.2, sh * ratio, sh);
  }

  // Nome e detalhe.
  const nameTop = y + m * 0.5 + bandH + h * 0.04;
  const nameMaxH = h * 0.24;
  const name = item.name.toUpperCase();
  let size = nameMaxH * 0.5;
  let lines: string[] = [];
  for (let i = 0; i < 30; i++) {
    ctx.font = fontOf(800, size, FONT_NAME);
    lines = wrapLines(ctx, name, w - m * 2);
    if (lines.length <= 2 && lines.length * size * 1.02 <= nameMaxH && lines.every((l) => ctx.measureText(l).width <= w - m * 2)) break;
    size *= 0.92;
  }
  ctx.fillStyle = p.cardText === '#ffffff' ? '#1c1917' : p.cardText;
  ctx.textBaseline = 'top';
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, x + w / 2, nameTop + i * size * 1.02));
  let cursor = nameTop + Math.min(lines.length, 2) * size * 1.02;
  if (item.detail) {
    const ds = fitSize(ctx, item.detail, w - m * 2, 600, FONT_NAME, size * 0.5);
    ctx.font = fontOf(600, ds, FONT_NAME);
    ctx.globalAlpha = 0.7;
    ctx.fillText(item.detail, x + w / 2, cursor + ds * 0.15);
    ctx.globalAlpha = 1;
    cursor += ds * 1.3;
  }

  // Preço.
  const priceTop = Math.max(cursor + h * 0.02, y + h * 0.5);
  const priceBottom = y + h - m - h * 0.08;
  if (item.oldPrice && item.price != null && item.oldPrice > item.price) {
    const t = `De ${formatPrice(item.oldPrice)} por`;
    const os = fitSize(ctx, t, w - m * 2, 600, FONT_NAME, h * 0.045);
    ctx.font = fontOf(600, os, FONT_NAME);
    ctx.fillStyle = '#44403c';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t, x + w / 2, priceTop + os);
  }
  if (item.price != null) {
    const { int, cents } = priceParts(item.price);
    const unit = item.unit === 'un' ? 'cada' : item.unit === 'kg' ? 'o kg' : item.unit;
    const avail = priceBottom - priceTop - h * 0.05;
    let S = avail * 0.95;
    const widths = (s: number) => {
      ctx.font = fontOf(400, s * 0.28, FONT_PRICE); const wr = ctx.measureText('R$').width;
      ctx.font = fontOf(400, s, FONT_PRICE); const wi = ctx.measureText(int).width;
      ctx.font = fontOf(400, s * 0.4, FONT_PRICE); const wc = ctx.measureText(`,${cents}`).width;
      ctx.font = fontOf(700, s * 0.14, FONT_NAME); const wu = ctx.measureText(unit).width;
      return { wr, wi, wc: Math.max(wc, wu), total: wr + wi + Math.max(wc, wu) + s * 0.08 };
    };
    let d = widths(S);
    if (d.total > w - m * 2) { S *= (w - m * 2) / d.total; d = widths(S); }
    const baseline = priceBottom - (avail - S * 0.72) / 2;
    let px = x + (w - d.total) / 2;
    ctx.fillStyle = p.tag;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = fontOf(400, S * 0.28, FONT_PRICE);
    ctx.fillText('R$', px, baseline - S * 0.44);
    px += d.wr + S * 0.04;
    ctx.font = fontOf(400, S, FONT_PRICE);
    ctx.fillText(int, px, baseline);
    px += d.wi + S * 0.04;
    ctx.font = fontOf(400, S * 0.4, FONT_PRICE);
    ctx.fillText(`,${cents}`, px, baseline - S * 0.32);
    ctx.font = fontOf(700, S * 0.14, FONT_NAME);
    ctx.fillStyle = '#44403c';
    ctx.fillText(unit, px + S * 0.02, baseline);
  }

  // Rodapé.
  const foot = [o.brandName, o.validity].filter(Boolean).join('  •  ');
  if (foot) {
    const fs = fitSize(ctx, foot, w - m * 2, 500, FONT_TEXT, h * 0.024);
    ctx.font = fontOf(500, fs, FONT_TEXT);
    ctx.fillStyle = '#57534e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(foot, x + w / 2, y + h - m - h * 0.03);
  }
  ctx.restore();
};

/** Folhas A4 (2480 × 3508) com os cartazes, prontas para o PDF. */
export const posterPages = (items: CampaignItem[], o: PosterOptions): HTMLCanvasElement[] => {
  const pages: HTMLCanvasElement[] = [];
  const priced = items.filter((i) => i.price != null);
  for (let i = 0; i < priced.length; i += o.perPage) {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    const slice = priced.slice(i, i + o.perPage);
    slice.forEach((item, j) => {
      if (o.perPage === 1) drawPoster(ctx, 0, 0, PAGE_W, PAGE_H, item, o);
      else if (o.perPage === 2) drawPoster(ctx, 0, j * (PAGE_H / 2), PAGE_W, PAGE_H / 2, item, o);
      else drawPoster(ctx, (j % 2) * (PAGE_W / 2), Math.floor(j / 2) * (PAGE_H / 2), PAGE_W / 2, PAGE_H / 2, item, o);
    });
    // Linhas de corte entre os cartazes.
    if (o.perPage > 1) {
      ctx.strokeStyle = '#d6d3d1';
      ctx.lineWidth = 3;
      ctx.setLineDash([24, 18]);
      ctx.beginPath();
      ctx.moveTo(0, PAGE_H / 2); ctx.lineTo(PAGE_W, PAGE_H / 2);
      if (o.perPage === 4) { ctx.moveTo(PAGE_W / 2, 0); ctx.lineTo(PAGE_W / 2, PAGE_H); }
      ctx.stroke();
    }
    pages.push(canvas);
  }
  return pages;
};
