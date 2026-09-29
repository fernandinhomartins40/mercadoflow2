import React, { useEffect, useRef, useState } from 'react';

/**
 * Recorte 1:1 do ícone do app, sem biblioteca: arrasta para posicionar,
 * controle de zoom, cor de fundo. Gera os PNGs que Android e iPhone pedem:
 * 192, 512, 512 "maskable" (com margem de segurança para o recorte redondo
 * do Android) e 180 (iPhone, sem transparência).
 */

export interface GeneratedIcons { icon192: Blob; icon512: Blob; maskable: Blob; apple: Blob; background: string }

const VIEW = 280;

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'));

const IconCropper: React.FC<{ file: File; onGenerate: (icons: GeneratedIcons) => void; busy?: boolean }> = ({ file, onGenerate, busy }) => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [bg, setBg] = useState('#15803d');
  const [safe, setSafe] = useState(80);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => { setImg(i); setZoom(1); setOffset({ x: 0, y: 0 }); };
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Escala base: a imagem cobre o quadrado inteiro no zoom 1.
  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = base * zoom;
  const w = img ? img.naturalWidth * scale : VIEW;
  const h = img ? img.naturalHeight * scale : VIEW;
  const clampOffset = (o: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(VIEW - w, o.x)),
    y: Math.min(0, Math.max(VIEW - h, o.y)),
  });
  // Centraliza quando a imagem ou o zoom mudam.
  useEffect(() => {
    if (!img) return;
    setOffset((o) => clampOffset(o.x === 0 && o.y === 0 ? { x: (VIEW - w) / 2, y: (VIEW - h) / 2 } : o));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, zoom]);

  /** Desenha o recorte num quadrado de `size`, com o conteúdo ocupando `content` (0-1) no centro. */
  const draw = (canvas: HTMLCanvasElement, size: number, content: number, fill: boolean) => {
    if (!img) return;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, size, size);
    if (fill) { ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size); }
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sSize = VIEW / scale;
    const d = size * content;
    ctx.drawImage(img, sx, sy, sSize, sSize, (size - d) / 2, (size - d) / 2, d, d);
  };

  useEffect(() => {
    if (previewRef.current) draw(previewRef.current, 192, 1, true);
    if (maskRef.current) draw(maskRef.current, 192, safe / 100, true);
  });

  const generate = async () => {
    const c = document.createElement('canvas');
    draw(c, 192, 1, true); const icon192 = await toBlob(c);
    draw(c, 512, 1, true); const icon512 = await toBlob(c);
    draw(c, 512, safe / 100, true); const maskable = await toBlob(c);
    draw(c, 180, 1, true); const apple = await toBlob(c);
    onGenerate({ icon192, icon512, maskable, apple, background: bg });
  };

  if (!img) return <p className="text-sm text-slate-600">Abrindo a imagem…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
      <div className="flex flex-col gap-3">
        <div
          className="relative cursor-move touch-none overflow-hidden rounded-xl"
          style={{ width: VIEW, height: VIEW, background: 'repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 50% / 16px 16px' }}
          onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }; }}
          onPointerMove={(e) => { const d = drag.current; if (d) setOffset(clampOffset({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y })); }}
          onPointerUp={() => { drag.current = null; }}
          role="img" aria-label="Área do recorte: arraste para posicionar"
        >
          <img src={img.src} alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none"
            style={{ left: offset.x, top: offset.y, width: w, height: h }} />
          <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-inset ring-white/80" />
        </div>
        <label className="flex items-center gap-3 text-sm text-slate-700">
          Zoom
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-green-600" aria-label="Zoom do recorte" />
        </label>
        <p className="text-xs text-slate-500">Arraste a imagem para posicionar. Use uma imagem quadrada de 512 px ou mais.</p>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-6">
          <figure className="flex flex-col items-center gap-2">
            <canvas ref={previewRef} className="h-24 w-24 rounded-[22%] shadow" aria-label="Prévia do ícone" />
            <figcaption className="text-xs text-slate-600">iPhone e Android</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-2">
            <canvas ref={maskRef} className="h-24 w-24 rounded-full shadow" aria-label="Prévia do ícone redondo" />
            <figcaption className="text-xs text-slate-600">Android (redondo)</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-2">
            <canvas ref={(c) => { if (c && img) draw(c, 96, 1, true); }} className="h-12 w-12 rounded-[22%] shadow" aria-hidden="true" />
            <figcaption className="text-xs text-slate-600">Pequeno</figcaption>
          </figure>
        </div>
        <label className="flex items-center gap-3 text-sm text-slate-700">
          Cor de fundo
          <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-300 p-0.5" />
          <span className="font-mono text-xs text-slate-500">{bg}</span>
        </label>
        <label className="flex items-center gap-3 text-sm text-slate-700">
          <span className="shrink-0">Margem no ícone redondo</span>
          <input type="range" min={60} max={100} value={safe} onChange={(e) => setSafe(Number(e.target.value))} className="w-full accent-green-600" aria-label="Tamanho do desenho no ícone redondo" />
          <span className="w-10 text-right tabular-nums">{safe}%</span>
        </label>
        <p className="text-xs text-slate-500">O Android recorta o ícone em círculo ou gota: mantenha o desenho dentro do círculo na prévia redonda.</p>
        <button type="button" onClick={generate} disabled={busy}
          className="h-10 self-start rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
          {busy ? 'Salvando…' : 'Gerar os tamanhos e salvar'}
        </button>
      </div>
    </div>
  );
};

export default IconCropper;
