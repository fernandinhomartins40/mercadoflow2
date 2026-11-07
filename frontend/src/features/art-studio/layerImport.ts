import type { FormatKey, ThemeLayer } from '../../types/art.types';
import { FORMATS, FORMAT_KEYS } from './formats';

/**
 * Entrada das camadas no criador de temas.
 *
 * Com o composicao.json do Codex (skills/encartes-fieis, `camadas.py compose`)
 * cada PNG cai na posição e na ordem do plano, nos cinco formatos de uma vez.
 * Sem ele, cada PNG vira uma camada no formato aberto.
 */

export interface LayerManifest {
  kind: string;
  seal?: string;
  formats: Partial<Record<FormatKey, {
    base: string;
    layers: Array<{ id: string; file: string; cx: number; cy: number; width: number; rotation?: number; opacity?: number; z_index?: number }>;
  }>>;
}

export type Uploaded = { url: string; w: number; h: number };
export type Upload = (file: File) => Promise<Uploaded>;

const baseName = (path: string) => (path.split(/[\\/]/).pop() ?? path).toLowerCase();
const isImage = (f: File) => /\.(png|webp|jpe?g)$/i.test(f.name);
const pretty = (id: string) => id.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Mede no navegador quando o servidor não mede (WebP). */
export const measure = async (file: Blob): Promise<{ w: number; h: number }> => {
  const bmp = await createImageBitmap(file);
  const out = { w: bmp.width, h: bmp.height };
  bmp.close();
  return out;
};

export const findManifest = async (files: File[]): Promise<LayerManifest | null> => {
  const file = files.find((f) => baseName(f.name) === 'composicao.json');
  if (!file) return null;
  let data: LayerManifest;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('O composicao.json não é um JSON válido.'); }
  if (data?.kind !== 'mercadoflow-layered-theme' || typeof data.formats !== 'object') {
    throw new Error('O composicao.json não é de um tema em camadas do MercadoFlow.');
  }
  return data;
};

/**
 * Monta as camadas de cada formato do manifesto, subindo cada arquivo uma vez
 * só (os elementos são os mesmos em todos os formatos).
 */
export const layersFromManifest = async (manifest: LayerManifest, files: File[], upload: Upload) => {
  const byName = new Map(files.map((f) => [baseName((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name), f]));
  const needed = new Set<string>();
  FORMAT_KEYS.forEach((key) => {
    const f = manifest.formats[key];
    if (!f) return;
    needed.add(baseName(f.base));
    f.layers.forEach((l) => needed.add(baseName(l.file)));
  });
  const missing = [...needed].filter((n) => !byName.has(n));
  if (missing.length) throw new Error(`Faltam arquivos do composicao.json: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}`);

  const uploaded = new Map<string, Uploaded>();
  for (const name of needed) uploaded.set(name, await upload(byName.get(name)!));

  const out: Partial<Record<FormatKey, ThemeLayer[]>> = {};
  FORMAT_KEYS.forEach((key) => {
    const f = manifest.formats[key];
    if (!f) return;
    const base = uploaded.get(baseName(f.base))!;
    const elements = [...f.layers].sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0)).map((l): ThemeLayer => {
      const u = uploaded.get(baseName(l.file))!;
      return {
        id: l.id, name: pretty(l.id), url: u.url, w: u.w, h: u.h, role: 'element',
        cx: l.cx, cy: l.cy, width: l.width, rotation: l.rotation ?? 0, opacity: l.opacity ?? 1,
      };
    });
    out[key] = [
      { id: 'base', name: 'Fundo', url: base.url, w: base.w, h: base.h, role: 'base', cx: 0.5, cy: 0.5, width: 1, rotation: 0, opacity: 1 },
      ...elements,
    ];
  });
  const sealFile = manifest.seal ? byName.get(baseName(manifest.seal)) ?? null : null;
  return { layers: out, sealFile };
};

/**
 * PNGs soltos viram camadas do formato aberto, na frente das existentes. Um
 * arquivo chamado fundo/base/bg, ou do tamanho da arte quando ainda não há
 * base, vira a base.
 */
export const layersFromFiles = async (files: File[], format: FormatKey, current: ThemeLayer[], upload: Upload): Promise<ThemeLayer[]> => {
  const { width: W, height: H } = FORMATS[format];
  let hasBase = current.some((l) => l.role === 'base');
  const ids = new Set(current.map((l) => l.id));
  const added: ThemeLayer[] = [];
  for (const file of files.filter(isImage)) {
    const u = await upload(file);
    const stem = file.name.replace(/\.[^.]+$/, '');
    let id = stem.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'camada';
    while (ids.has(id)) id = `${id}-2`;
    ids.add(id);
    const sameRatio = u.w > 0 && Math.abs(u.w / u.h - W / H) / (W / H) < 0.02;
    const base = !hasBase && (/^(fundo|base|bg)/i.test(stem) || sameRatio);
    if (base) hasBase = true;
    added.push({
      id, name: pretty(stem), url: u.url, w: u.w, h: u.h, role: base ? 'base' : 'element',
      cx: 0.5, cy: 0.5, width: base ? 1 : Math.min(0.5, u.w / W || 0.3), rotation: 0, opacity: 1,
    });
  }
  return [...current, ...added];
};
