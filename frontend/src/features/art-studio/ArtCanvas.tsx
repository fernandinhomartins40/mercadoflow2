import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RenderResult, Scene, renderScene } from './render';

interface Props {
  scene: Scene | null;
  /** Clique num cartão: devolve a chave do produto. */
  onPick?: (key: string | null) => void;
  className?: string;
  label: string;
  /** Altura máxima em px da prévia (a largura segue a proporção da arte). */
  maxHeight?: number;
}

/**
 * Prévia da arte. Desenha no tamanho real reduzido pela densidade da tela
 * (nítida em celular com tela retina) com o mesmo {@link renderScene} da
 * exportação.
 */
const ArtCanvas: React.FC<Props> = ({ scene, onPick, className, label, maxHeight = 720 }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<RenderResult | null>(null);
  const [boxW, setBoxW] = useState(0);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene || cssW <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = (cssW * dpr) / scene.width;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    layoutRef.current = renderScene(ctx, scene);
  }, [scene, cssW, cssH]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPick || !scene || !layoutRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * scene.width;
    const y = ((e.clientY - rect.top) / rect.height) * scene.height;
    const hit = layoutRef.current.cards.find(({ rect: r }) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    onPick(hit?.key ?? null);
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
    </div>
  );
};

export default ArtCanvas;
