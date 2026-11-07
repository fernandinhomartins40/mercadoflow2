import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { MotionPreset } from '../../types/art.types';
import { RenderResult, Scene, renderScene } from './render';

interface Props {
  scene: Scene | null;
  /** Clique num cartão: devolve a chave do produto. */
  onPick?: (key: string | null) => void;
  className?: string;
  label: string;
  /** Altura máxima em px da prévia (a largura segue a proporção da arte). */
  maxHeight?: number;
  /** Animação a tocar na prévia. Ausente: arte estática. */
  motion?: { preset: MotionPreset; duration: number } | null;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Prévia da arte. Desenha no tamanho real reduzido pela densidade da tela
 * (nítida em celular com tela retina) com o mesmo {@link renderScene} da
 * exportação. Com `motion`, toca a animação em loop, com pausa e linha do tempo.
 */
const ArtCanvas: React.FC<Props> = ({ scene, onPick, className, label, maxHeight = 720, motion }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const layoutRef = useRef<RenderResult | null>(null);
  const timeRef = useRef(0);
  const [boxW, setBoxW] = useState(0);
  const [playing, setPlaying] = useState(() => !reducedMotion());

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const ratio = scene ? scene.width / scene.height : 4 / 5;
  const cssW = Math.max(0, Math.min(boxW, maxHeight * ratio));
  const cssH = cssW / ratio;
  const preset = motion?.preset;
  const duration = motion?.duration ?? 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene || cssW <= 0) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = (cssW * dpr) / scene.width;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const draw = () => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      layoutRef.current = renderScene(ctx, preset ? { ...scene, motion: { preset, t: timeRef.current, duration } } : scene);
      if (rangeRef.current) rangeRef.current.value = String(timeRef.current);
    };
    if (!preset || !playing) { draw(); return undefined; }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      timeRef.current = (timeRef.current + (now - last) / 1000) % duration;
      last = now;
      draw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, cssW, cssH, preset, duration, playing]);

  // Trocou de animação: começa do início.
  useEffect(() => { timeRef.current = 0; }, [preset, duration]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPick || !scene || !layoutRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * scene.width;
    const y = ((e.clientY - rect.top) / rect.height) * scene.height;
    const hit = layoutRef.current.cards.find(({ rect: r }) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    onPick(hit?.key ?? null);
  };

  const seek = (value: number) => {
    timeRef.current = value;
    setPlaying(false);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !scene || !preset || !canvas) return;
    const scale = canvas.width / scene.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    layoutRef.current = renderScene(ctx, { ...scene, motion: { preset, t: value, duration } });
  };

  return (
    <div ref={boxRef} className={className}>
      {scene ? (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          onClick={pick}
          className="mx-auto block rounded-lg shadow-[0_10px_40px_-12px_rgba(15,23,42,0.35)]"
          style={{ width: cssW, height: cssH, cursor: onPick ? 'pointer' : 'default', background: '#f5f5f4' }}
        />
      ) : (
        <div className="mx-auto animate-pulse rounded-lg" style={{ width: cssW || '100%', aspectRatio: String(ratio), background: 'var(--surface-soft)' }} />
      )}
      {scene && preset && (
        <div className="mx-auto mt-2 flex items-center gap-2" style={{ width: cssW || '100%' }}>
          <button type="button" onClick={() => setPlaying((p) => !p)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700"
            aria-label={playing ? 'Pausar a animação' : 'Tocar a animação'}>
            {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          </button>
          <input ref={rangeRef} type="range" min={0} max={duration} step={0.01} defaultValue={0}
            onChange={(e) => seek(Number(e.target.value))} className="w-full accent-green-600" aria-label="Momento da animação" />
          <span className="shrink-0 text-xs tabular-nums text-slate-500">{duration} s</span>
        </div>
      )}
    </div>
  );
};

export default ArtCanvas;
