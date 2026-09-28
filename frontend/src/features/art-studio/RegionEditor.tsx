import React, { useRef, useState } from 'react';
import type { NRect, RegionKey, Regions } from '../../types/art.types';
import { REGION_META } from './formats';
import type { Candidate } from './analyze';

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CURSOR: Record<Handle, string> = {
  move: 'move', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
};
const MIN = 0.03;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round = (v: number) => Math.round(v * 10000) / 10000;

interface Props {
  backgroundUrl: string;
  width: number;
  height: number;
  regions: Regions;
  candidates?: Candidate[];
  showCandidates?: boolean;
  active: RegionKey | null;
  onActive: (key: RegionKey | null) => void;
  /** Durante o arraste (só visual). */
  onPreview: (regions: Regions) => void;
  /** Ao soltar: grava. */
  onCommit: (regions: Regions) => void;
}

/**
 * O fundo do tema com as áreas por cima, cada uma com oito alças. Arrastar o
 * meio move, as alças redimensionam; as coordenadas ficam de 0 a 1 para valer
 * em qualquer tamanho de exportação.
 */
const RegionEditor: React.FC<Props> = ({
  backgroundUrl, width, height, regions, candidates, showCandidates, active, onActive, onPreview, onCommit,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ key: RegionKey; handle: Handle; start: NRect; px: number; py: number; moved: boolean } | null>(null);
  const [live, setLive] = useState<Regions | null>(null);
  const shown = live ?? regions;

  const toUnit = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const begin = (key: RegionKey, handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = shown[key];
    if (!rect) return;
    onActive(key);
    const p = toUnit(e);
    drag.current = { key, handle, start: rect, px: p.x, py: p.y, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toUnit(e);
    const dx = p.x - d.px;
    const dy = p.y - d.py;
    if (Math.abs(dx) + Math.abs(dy) > 0.002) d.moved = true;
    let { x, y, w, h } = d.start;
    if (d.handle === 'move') {
      x = clamp(x + dx, 0, 1 - w);
      y = clamp(y + dy, 0, 1 - h);
    } else {
      if (d.handle.includes('w')) { const nx = clamp(x + dx, 0, x + w - MIN); w += x - nx; x = nx; }
      if (d.handle.includes('e')) w = clamp(w + dx, MIN, 1 - x);
      if (d.handle.includes('n')) { const ny = clamp(y + dy, 0, y + h - MIN); h += y - ny; y = ny; }
      if (d.handle.includes('s')) h = clamp(h + dy, MIN, 1 - y);
    }
    const next = { ...shown, [d.key]: { x: round(x), y: round(y), w: round(w), h: round(h) } };
    setLive(next);
    onPreview(next);
  };

  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && live) onCommit(live);
    setLive(null);
  };

  const keyNudge = (key: RegionKey) => (e: React.KeyboardEvent) => {
    const rect = regions[key];
    if (!rect) return;
    const step = e.shiftKey ? 0.02 : 0.005;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    const next = { ...regions, [key]: { ...rect, x: round(clamp(rect.x + d[0], 0, 1 - rect.w)), y: round(clamp(rect.y + d[1], 0, 1 - rect.h)) } };
    onCommit(next);
  };

  const vbW = 1000;
  const vbH = (1000 * height) / width;
  const hs = 14; // alça em unidades do viewBox (1000 de largura)

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: `${width} / ${height}` }}>
      <img src={backgroundUrl} alt="" className="absolute inset-0 h-full w-full rounded-lg object-fill"
        style={{ background: 'repeating-conic-gradient(#e7e5e4 0% 25%, #fafaf9 0% 50%) 50% / 20px 20px' }} draggable={false} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerDown={() => onActive(null)}
        aria-label="Áreas do tema sobre o fundo"
      >
        {showCandidates && candidates?.map((c) => (
          <g key={`c${c.id}`} pointerEvents="none">
            <rect x={c.x * vbW} y={c.y * vbH} width={c.w * vbW} height={c.h * vbH} fill="none" stroke="#0f172a" strokeOpacity={0.45}
              strokeDasharray="6 5" strokeWidth={2} />
            <text x={c.x * vbW + 8} y={c.y * vbH + 22} fontSize={18} fontWeight={800} fill="#0f172a" fillOpacity={0.6}>{c.id}</text>
          </g>
        ))}
        {(Object.keys(REGION_META) as RegionKey[]).map((key) => {
          const r = shown[key];
          if (!r) return null;
          const meta = REGION_META[key];
          const x = r.x * vbW; const y = r.y * vbH; const w = r.w * vbW; const h = r.h * vbH;
          const isActive = active === key;
          const pts: Record<Handle, [number, number]> = {
            move: [x + w / 2, y + h / 2], nw: [x, y], n: [x + w / 2, y], ne: [x + w, y], e: [x + w, y + h / 2],
            se: [x + w, y + h], s: [x + w / 2, y + h], sw: [x, y + h], w: [x, y + h / 2],
          };
          return (
            <g key={key}>
              <rect
                x={x} y={y} width={w} height={h}
                fill={meta.color} fillOpacity={isActive ? 0.22 : 0.14}
                stroke={meta.color} strokeWidth={isActive ? 4 : 3}
                style={{ cursor: 'move' }}
                tabIndex={0}
                role="button"
                aria-label={`Área de ${meta.label}. Setas movem, Shift move mais.`}
                onPointerDown={begin(key, 'move')}
                onKeyDown={keyNudge(key)}
                onFocus={() => onActive(key)}
              />
              <g pointerEvents="none">
                <rect x={x} y={y - 30 < 0 ? y : y - 30} width={Math.max(92, meta.label.length * 13 + 24)} height={28} rx={6} fill={meta.color} />
                <text x={x + 12} y={(y - 30 < 0 ? y : y - 30) + 20} fontSize={17} fontWeight={700} fill="#fff">{meta.label}</text>
              </g>
              {isActive && HANDLES.map((hd) => (
                <rect key={hd} x={pts[hd][0] - hs / 2} y={pts[hd][1] - hs / 2} width={hs} height={hs} rx={3}
                  fill="#fff" stroke={meta.color} strokeWidth={3} style={{ cursor: CURSOR[hd] }}
                  onPointerDown={begin(key, hd)} />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default RegionEditor;
