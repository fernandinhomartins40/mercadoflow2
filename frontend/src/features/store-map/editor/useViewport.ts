import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Rect } from './geometry';

/**
 * Janela de zoom e arrasto sobre um desenho SVG.
 *
 * `x`/`y` é o ponto do desenho no canto superior esquerdo da área visível e
 * `s` quantos pixels de tela valem uma unidade do desenho (um metro na planta).
 * O viewBox sai daí, sempre com a mesma proporção da caixa — o desenho nunca
 * fica esticado nem com faixa sobrando.
 */
export interface View { x: number; y: number; s: number }

const MAX_SCALE = 240;

export function useViewport(content: Rect, padding = 1.2) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, s: 20 });
  const fitted = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitScale = useCallback((r: Rect) => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return 20;
    return Math.min(w / (r.w + padding * 2), h / (r.h + padding * 2));
  }, [padding]);

  const fitTo = useCallback((r: Rect, maxScale = MAX_SCALE) => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const s = Math.min(maxScale, fitScale(r));
    setView({ s, x: r.x + r.w / 2 - w / 2 / s, y: r.y + r.h / 2 - h / 2 / s });
  }, [fitScale]);

  const fit = useCallback(() => fitTo(content), [content, fitTo]);

  // Primeira medida: enquadra o desenho todo.
  useEffect(() => {
    if (fitted.current || !size.w || !size.h) return;
    fitted.current = true;
    fitTo(content);
  }, [size, content, fitTo]);

  // Caixa mudou de tamanho: mantém o centro.
  const lastSize = useRef(size);
  useEffect(() => {
    const prev = lastSize.current;
    lastSize.current = size;
    if (!prev.w || !size.w || (prev.w === size.w && prev.h === size.h)) return;
    setView((v) => ({ ...v, x: v.x + (prev.w - size.w) / 2 / v.s, y: v.y + (prev.h - size.h) / 2 / v.s }));
  }, [size]);

  const minScale = () => fitScale(content) * 0.4;

  /** Zoom mantendo parado o ponto sob o cursor (ou o centro, sem cursor). */
  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = clientX == null ? rect.width / 2 : clientX - rect.left;
    const py = clientY == null ? rect.height / 2 : clientY - rect.top;
    setView((v) => {
      const s = Math.max(minScale(), Math.min(MAX_SCALE, v.s * factor));
      const ax = v.x + px / v.s;
      const ay = v.y + py / v.s;
      return { s, x: ax - px / s, y: ay - py / s };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  const panBy = useCallback((dxPx: number, dyPx: number) => {
    setView((v) => ({ ...v, x: v.x - dxPx / v.s, y: v.y - dyPx / v.s }));
  }, []);

  /** Leva o retângulo para a área visível, só dando zoom se ele não couber. */
  const reveal = useCallback((r: Rect) => {
    const v = viewRef.current;
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const vw = w / v.s;
    const vh = h / v.s;
    const inside = r.x >= v.x && r.y >= v.y && r.x + r.w <= v.x + vw && r.y + r.h <= v.y + vh;
    if (inside) return;
    if (r.w + 2 > vw || r.h + 2 > vh) { fitTo(r, v.s); return; }
    setView({ s: v.s, x: r.x + r.w / 2 - vw / 2, y: r.y + r.h / 2 - vh / 2 });
  }, [fitTo]);

  // Roda do mouse dá zoom (listener não passivo para a página não rolar junto).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey) { panBy(-e.deltaY, 0); return; }
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-delta * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, panBy]);

  const vw = size.w / view.s || 1;
  const vh = size.h / view.s || 1;
  return {
    boxRef, size, view, setView, fit, fitTo, zoomAt, panBy, reveal,
    viewBox: `${view.x} ${view.y} ${vw} ${vh}`,
    /** Unidades do desenho por pixel de tela: para traços e alças de tamanho fixo. */
    px: 1 / view.s,
    zoomPercent: Math.round((view.s / Math.max(0.001, fitScale(content))) * 100),
  };
}
