import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import type { Fixture, StorePlan } from '../../../types/storeMap.types';
import { DEPT_BY_KEY, FIXTURES, fixtureName, heatColor } from '../model';
import { useViewport } from '../editor/useViewport';
import { mix, shade } from './color';

/**
 * A loja em 3D sem motor 3D: projeção isométrica desenhada em SVG, com cada
 * móvel virando uma caixa da altura real (gôndola 1,8 m, freezer 0,9 m...).
 * As caixas são ordenadas de trás para a frente (algoritmo do pintor), então
 * o navegador só desenha polígonos — roda liso até num celular simples.
 */

export const HEIGHTS: Record<string, number> = {
  gondola: 1.8, ponta: 1.5, geladeira: 2.0, freezer: 0.9, ilha: 0.9, banca: 0.8, balcao: 1.15, caixa: 1.0, entrada: 0.02,
};

const C = Math.cos(Math.PI / 6);
const S = 0.5;
const WALL_H = 2.6;
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';

interface Box { f: Fixture; x1: number; y1: number; x2: number; y2: number; z: number }

const proj = (x: number, y: number, z = 0): [number, number] => [(x - y) * C, (x + y) * S - z];
const pts = (list: Array<[number, number, number]>) => list.map(([x, y, z]) => proj(x, y, z).map((v) => v.toFixed(3)).join(',')).join(' ');

/** Gira a planta de 90 em 90 graus para ver a loja de outro canto. */
function rotateRect(f: Fixture, k: number, W: number, H: number) {
  const corners: Array<[number, number]> = [[f.x, f.y], [f.x + f.w, f.y + f.h]];
  const r = corners.map(([x, y]) => {
    switch (k) {
      case 1: return [H - y, x];
      case 2: return [W - x, H - y];
      case 3: return [y, W - x];
      default: return [x, y];
    }
  });
  return { x1: Math.min(r[0][0], r[1][0]), y1: Math.min(r[0][1], r[1][1]), x2: Math.max(r[0][0], r[1][0]), y2: Math.max(r[0][1], r[1][1]) };
}

/** Ordem de desenho: quem está atrás primeiro. Em caso de dúvida, pela soma x+y. */
function paintOrder(boxes: Box[]): Box[] {
  const n = boxes.length;
  const eps = 1e-6;
  const after: number[][] = boxes.map(() => []);
  const indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = boxes[i];
      const b = boxes[j];
      const overlapY = a.y1 < b.y2 - eps && b.y1 < a.y2 - eps;
      const overlapX = a.x1 < b.x2 - eps && b.x1 < a.x2 - eps;
      const behind = (a.x2 <= b.x1 + eps && (overlapY || a.y2 <= b.y1 + eps)) || (a.y2 <= b.y1 + eps && overlapX);
      if (behind) { after[i].push(j); indeg[j]++; }
    }
  }
  const key = (b: Box) => b.x1 + b.x2 + b.y1 + b.y2;
  const ready = boxes.map((_, i) => i).filter((i) => indeg[i] === 0);
  const out: Box[] = [];
  while (ready.length) {
    ready.sort((p, q) => key(boxes[q]) - key(boxes[p]));
    const i = ready.pop()!;
    out.push(boxes[i]);
    after[i].forEach((j) => { if (--indeg[j] === 0) ready.push(j); });
  }
  // Ciclo (móveis sobrepostos): completa pela soma.
  if (out.length < n) {
    const done = new Set(out);
    boxes.filter((b) => !done.has(b)).sort((p, q) => key(p) - key(q)).forEach((b) => out.push(b));
  }
  return out;
}

interface Props {
  plan: StorePlan;
  selectedIds: string[];
  onSelect: (id: string | null) => void;
  heat?: Record<string, number>;
  heatMode?: boolean;
  highlightIds?: Set<string>;
  className?: string;
}

const IsoView: React.FC<Props> = ({ plan, selectedIds, onSelect, heat, heatMode = false, highlightIds, className }) => {
  const [turn, setTurn] = useState(0);
  const [salesHeight, setSalesHeight] = useState(true);
  const { width: W0, height: H0 } = plan;
  const W = turn % 2 ? H0 : W0;
  const H = turn % 2 ? W0 : H0;
  const maxHeat = Math.max(1, ...Object.values(heat ?? {}));

  const boxes = useMemo(() => paintOrder(plan.fixtures.map((f) => {
    const r = rotateRect(f, turn, W0, H0);
    const meta = FIXTURES[f.type];
    let z = HEIGHTS[f.type] ?? 1;
    if (heatMode && salesHeight && !meta.noProducts) {
      const v = heat?.[f.id];
      z = v != null ? 0.3 + (v / maxHeat) * 3.4 : 0.15;
    }
    return { f, ...r, z };
  })), [plan, turn, W0, H0, heat, heatMode, salesHeight, maxHeat]);

  // Enquadramento: a projeção do piso com as paredes de trás.
  const content = useMemo(() => {
    const corners = [proj(0, 0, WALL_H), proj(W, 0, WALL_H), proj(0, H, WALL_H), proj(W, H, 0), proj(0, H, 0), proj(W, 0, 0)];
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    return { x: Math.min(...xs), y: Math.min(...ys) - 1.5, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) + 1.5 };
  }, [W, H]);
  const vp = useViewport(content, 1);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const px = vp.px;
  // Girou: enquadra de novo (o desenho muda de forma).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { vp.fit(); }, [turn]);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    d.moved = true;
    vp.panBy(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX; d.y = e.clientY;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const id = (e.target as Element).closest('[data-id]')?.getAttribute('data-id');
      onSelect(id ?? null);
    }
  };

  const grid: React.ReactNode[] = [];
  for (let x = 1; x < W; x += 1) grid.push(<polyline key={`gx${x}`} points={pts([[x, 0, 0], [x, H, 0]])} stroke="#dfe5de" strokeWidth={0.6 * px} fill="none" />);
  for (let y = 1; y < H; y += 1) grid.push(<polyline key={`gy${y}`} points={pts([[0, y, 0], [W, y, 0]])} stroke="#dfe5de" strokeWidth={0.6 * px} fill="none" />);

  // Onde fica a frente depois de girar (para o rótulo "Frente da loja").
  const front = [[W / 2, H + 0.9], [-0.9, H / 2], [W / 2, -0.9], [W + 0.9, H / 2]][turn];
  const frontPt = proj(front[0], front[1], 0);
  const selected = new Set(selectedIds);

  return (
    <div ref={vp.boxRef} className={`relative overflow-hidden ${className ?? ''}`} style={{ background: 'linear-gradient(#eef2ee, #e2e8e2)', touchAction: 'none' }}>
      {vp.size.w > 0 && (
        <svg width={vp.size.w} height={vp.size.h} viewBox={vp.viewBox} className="block select-none" role="img"
          aria-label={`Loja em 3D com ${plan.fixtures.length} móveis`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          style={{ cursor: 'grab' }}>
          {/* Paredes do fundo e piso */}
          <polygon points={pts([[0, 0, 0], [W, 0, 0], [W, 0, WALL_H], [0, 0, WALL_H]])} fill="#dde4dd" stroke="#b9c4ba" strokeWidth={px} />
          <polygon points={pts([[0, 0, 0], [0, H, 0], [0, H, WALL_H], [0, 0, WALL_H]])} fill="#cfd8cf" stroke="#b9c4ba" strokeWidth={px} />
          <polygon points={pts([[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]])} fill="#f6f8f5" stroke="#9aa89e" strokeWidth={1.5 * px} />
          {grid}
          <text x={frontPt[0]} y={frontPt[1]} textAnchor="middle" fontSize={12 * px} fontWeight={600} fill="#6b7a72">Frente da loja</text>

          {boxes.map((b) => {
            const { f, x1, y1, x2, y2, z } = b;
            const meta = FIXTURES[f.type];
            const v = heat?.[f.id];
            const t = v != null ? v / maxHeat : 0;
            const dept = f.departments[0] ? DEPT_BY_KEY[f.departments[0]]?.color : undefined;
            const top = heatMode ? (meta.noProducts ? '#e5e9e5' : v != null ? heatColor(t) : '#eef1ee') : meta.fill;
            const side = heatMode ? top : dept ? mix(dept, '#ffffff', 0.45) : meta.fill;
            const isSel = selected.has(f.id);
            const hl = highlightIds?.has(f.id);
            const dim = !!highlightIds?.size && !hl;
            const stroke = isSel ? '#15803d' : hl ? '#f59e0b' : shade(meta.stroke, 0.85);
            const sw = (isSel || hl ? 2.2 : 0.8) * px;
            const shelves: React.ReactNode[] = [];
            if (!heatMode && (f.type === 'gondola' || f.type === 'geladeira' || f.type === 'ponta') && z > 1) {
              for (let h = 0.35; h < z - 0.1; h += 0.4) {
                shelves.push(<polyline key={`e${h}`} points={pts([[x2, y1, h], [x2, y2, h]])} stroke={shade(side, 0.7)} strokeWidth={0.7 * px} fill="none" />);
                shelves.push(<polyline key={`s${h}`} points={pts([[x1, y2, h], [x2, y2, h]])} stroke={shade(side, 0.62)} strokeWidth={0.7 * px} fill="none" />);
              }
            }
            const vertical = y2 - y1 > x2 - x1;
            const cx = (x1 + x2) / 2;
            const cy = (y1 + y2) / 2;
            const long = Math.max(x2 - x1, y2 - y1);
            const fs = Math.min(0.42, Math.min(x2 - x1, y2 - y1) * 0.5);
            const name = fixtureName(f);
            const showName = f.type !== 'entrada' && fs * vp.view.s >= 7.5 && long > name.length * fs * 0.45;
            return (
              <g key={f.id} data-id={f.id} opacity={dim ? 0.35 : 1} style={{ cursor: 'pointer' }}>
                <title>{name}</title>
                {/* Sombra */}
                <polygon points={pts([[x1 + 0.12, y1 + 0.12, 0], [x2 + 0.18, y1 + 0.12, 0], [x2 + 0.18, y2 + 0.18, 0], [x1 + 0.12, y2 + 0.18, 0]])} fill="rgba(31,42,36,0.10)" />
                <polygon points={pts([[x2, y1, 0], [x2, y2, 0], [x2, y2, z], [x2, y1, z]])} fill={shade(side, 0.86)} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
                <polygon points={pts([[x1, y2, 0], [x2, y2, 0], [x2, y2, z], [x1, y2, z]])} fill={shade(side, 0.74)} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
                {shelves}
                <polygon points={pts([[x1, y1, z], [x2, y1, z], [x2, y2, z], [x1, y2, z]])} fill={top} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
                {showName && (
                  <g transform={`matrix(${C} ${S} ${-C} ${S} 0 ${-z})`} pointerEvents="none">
                    <text x={cx} y={cy + fs * 0.35} textAnchor="middle" fontSize={fs} fontWeight={650}
                      transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
                      fill={heatMode && t > 0.7 ? '#fff' : '#1f2a24'}>
                      {name}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      )}

      <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1 rounded-xl p-1 shadow-sm" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}>
        <button type="button" onClick={() => setTurn((t) => (t + 3) % 4)} aria-label="Girar a vista para a esquerda" title="Girar para a esquerda"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-soft)] ${FOCUS}`}><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" onClick={() => setTurn((t) => (t + 1) % 4)} aria-label="Girar a vista para a direita" title="Girar para a direita"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-soft)] ${FOCUS}`}><RotateCw className="h-4 w-4" aria-hidden="true" /></button>
        {heatMode && (
          <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-medium">
            <input type="checkbox" checked={salesHeight} onChange={(e) => setSalesHeight(e.target.checked)} className="h-4 w-4 accent-[var(--brand-700)]" />
            Altura mostra a venda
          </label>
        )}
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-xl p-1 shadow-sm" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}>
        <button type="button" onClick={() => vp.zoomAt(1 / 1.25)} aria-label="Diminuir o zoom" className={`inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-soft)] ${FOCUS}`}><Minus className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" onClick={() => vp.zoomAt(1.25)} aria-label="Aumentar o zoom" className={`inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-soft)] ${FOCUS}`}><Plus className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" onClick={vp.fit} aria-label="Ver a loja inteira" className={`inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-soft)] ${FOCUS}`}><Maximize className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </div>
  );
};

export default IsoView;
