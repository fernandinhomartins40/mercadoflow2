import React, { useRef, useState } from 'react';
import type { Fixture, StorePlan } from '../../types/storeMap.types';
import { DEPT_BY_KEY, FIXTURES, fixtureName, heatColor, snap } from './model';

export type PlanMode = 'edit' | 'heat' | 'view';

interface PlanViewProps {
  plan: StorePlan;
  mode: PlanMode;
  selectedId: string | null;
  highlightIds?: Set<string>;
  /** Liga dois móveis com uma linha tracejada (sugestão "aproxime"). */
  connect?: [string, string] | null;
  heat?: Record<string, number>;
  heatLabel?: (fixtureId: string) => string;
  onSelect: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onMoveEnd?: () => void;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * A loja vista de cima. Fundo da loja em cima, entrada e caixas embaixo —
 * como o dono vê ao entrar. Cada móvel é um botão: toque para abrir, arraste
 * para mover (modo Montar) ou use as setas do teclado.
 */
const PlanView: React.FC<PlanViewProps> = ({
  plan, mode, selectedId, highlightIds, connect, heat, heatLabel, onSelect, onMove, onMoveEnd,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const { width: W, height: H } = plan;
  const maxHeat = Math.max(1, ...Object.values(heat ?? {}));
  const editable = mode === 'edit';

  const toPlan = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const onPointerDown = (e: React.PointerEvent, f: Fixture) => {
    e.stopPropagation();
    if (!editable) { onSelect(f.id); return; }
    const p = toPlan(e.clientX, e.clientY);
    drag.current = { id: f.id, dx: p.x - f.x, dy: p.y - f.y, startX: p.x, startY: p.y, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent, f: Fixture) => {
    const d = drag.current;
    if (!d || d.id !== f.id) return;
    const p = toPlan(e.clientX, e.clientY);
    if (!d.moved && Math.hypot(p.x - d.startX, p.y - d.startY) < 0.25) return;
    if (!d.moved) { d.moved = true; setDraggingId(f.id); }
    onMove?.(f.id, clamp(snap(p.x - d.dx), 0, W - f.w), clamp(snap(p.y - d.dy), 0, H - f.h));
  };

  const onPointerUp = (_e: React.PointerEvent, f: Fixture) => {
    const d = drag.current;
    drag.current = null;
    setDraggingId(null);
    if (!d || d.id !== f.id) return;
    if (d.moved) onMoveEnd?.(); else onSelect(f.id);
  };

  const onKeyDown = (e: React.KeyboardEvent, f: Fixture) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(f.id); return; }
    if (!editable || selectedId !== f.id) return;
    const delta: Record<string, [number, number]> = { ArrowUp: [0, -0.5], ArrowDown: [0, 0.5], ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0] };
    const mv = delta[e.key];
    if (!mv) return;
    e.preventDefault();
    onMove?.(f.id, clamp(f.x + mv[0], 0, W - f.w), clamp(f.y + mv[1], 0, H - f.h));
    onMoveEnd?.();
  };

  const center = (id: string) => {
    const f = plan.fixtures.find((x) => x.id === id);
    return f ? [f.x + f.w / 2, f.y + f.h / 2] : null;
  };
  const line = connect ? [center(connect[0]), center(connect[1])] : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`-0.6 -1.6 ${W + 1.2} ${H + 3.2}`}
      className="block h-auto w-full select-none"
      role="group"
      aria-label={`Planta da loja com ${plan.fixtures.length} móveis`}
      onPointerDown={() => onSelect(null)}
      style={{ touchAction: draggingId ? 'none' : 'manipulation' }}
    >
      <defs>
        <pattern id="floor-grid" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#e2e8f0" strokeWidth="0.03" />
        </pattern>
      </defs>

      <text x={W / 2} y={-0.6} textAnchor="middle" fontSize="0.55" fontWeight="700" fill="#94a3b8" letterSpacing="0.08">FUNDO DA LOJA</text>
      <rect x={0} y={0} width={W} height={H} rx={0.3} fill="url(#floor-grid)" stroke="#94a3b8" strokeWidth={0.08} />
      <rect x={0} y={0} width={W} height={H} rx={0.3} fill="#f8fafc" opacity={0.55} />
      <text x={W / 2} y={H + 1.1} textAnchor="middle" fontSize="0.55" fontWeight="700" fill="#94a3b8" letterSpacing="0.08">FRENTE · RUA</text>

      {plan.fixtures.map((f) => {
        const meta = FIXTURES[f.type];
        const selected = selectedId === f.id;
        const highlighted = highlightIds?.has(f.id);
        const value = heat?.[f.id];
        const t = value != null ? value / maxHeat : 0;
        const fill = mode === 'heat'
          ? (meta.noProducts ? '#f1f5f9' : value != null ? heatColor(t) : '#f8fafc')
          : meta.fill;
        // Nos móveis mais quentes o fundo é vermelho forte: texto branco para ler.
        const ink = mode === 'heat' && value != null && t > 0.7 ? '#ffffff' : '#0f172a';
        const inkSoft = ink === '#ffffff' ? '#fee2e2' : '#334155';
        const vertical = f.h > f.w * 1.6;
        const long = vertical ? f.h : f.w;
        const short = vertical ? f.w : f.h;
        const fontSize = Math.max(0.28, Math.min(0.5, short * 0.36));
        const cap = Math.max(3, Math.floor(long / (fontSize * 0.58)));
        const firstDept = f.departments[0] ? DEPT_BY_KEY[f.departments[0]]?.label ?? '' : '';
        const extra = f.departments.length > 1 ? ` +${f.departments.length - 1}` : '';
        const main = mode === 'heat' && heatLabel && !meta.noProducts ? heatLabel(f.id) : fixtureName(f);
        const sub = mode === 'heat' ? fixtureName(f) : (firstDept ? `${firstDept}${extra}` : (meta.noProducts ? '' : 'sem setor'));
        const cut = (s: string) => (s.length > cap ? `${s.slice(0, cap - 1)}…` : s);
        const cx = f.x + f.w / 2;
        const cy = f.y + f.h / 2;
        const twoLines = short >= 0.9 && sub;
        const ariaDepts = f.departments.map((d) => DEPT_BY_KEY[d]?.label ?? d).join(', ');
        return (
          <g
            key={f.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${fixtureName(f)}${ariaDepts ? `: ${ariaDepts}` : ''}${mode === 'heat' && heatLabel ? `, ${heatLabel(f.id)}` : ''}`}
            onPointerDown={(e) => onPointerDown(e, f)}
            onPointerMove={(e) => onPointerMove(e, f)}
            onPointerUp={(e) => onPointerUp(e, f)}
            onKeyDown={(e) => onKeyDown(e, f)}
            style={{ cursor: editable ? (draggingId === f.id ? 'grabbing' : 'grab') : 'pointer', outline: 'none', touchAction: editable ? 'none' : 'manipulation' }}
            className="store-fixture"
          >
            <rect
              x={f.x} y={f.y} width={f.w} height={f.h} rx={0.18}
              fill={fill}
              stroke={selected ? '#15803d' : highlighted ? '#f59e0b' : meta.stroke}
              strokeWidth={selected ? 0.16 : highlighted ? 0.16 : 0.06}
              strokeDasharray={f.type === 'entrada' ? '0.3 0.2' : undefined}
              opacity={draggingId === f.id ? 0.85 : 1}
            />
            {highlighted && (
              <rect x={f.x - 0.25} y={f.y - 0.25} width={f.w + 0.5} height={f.h + 0.5} rx={0.3}
                fill="none" stroke="#f59e0b" strokeWidth={0.08} strokeDasharray="0.25 0.15" className="store-fixture-pulse" />
            )}
            <g transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined} pointerEvents="none">
              <text x={cx} y={twoLines ? cy - fontSize * 0.15 : cy + fontSize * 0.35} textAnchor="middle"
                fontSize={fontSize} fontWeight="700" fill={ink}>{cut(main)}</text>
              {twoLines && (
                <text x={cx} y={cy + fontSize * 0.95} textAnchor="middle" fontSize={fontSize * 0.82} fill={inkSoft}>{cut(sub)}</text>
              )}
            </g>
          </g>
        );
      })}

      {line && line[0] && line[1] && (
        <line x1={line[0][0]} y1={line[0][1]} x2={line[1][0]} y2={line[1][1]}
          stroke="#f59e0b" strokeWidth={0.12} strokeDasharray="0.4 0.25" strokeLinecap="round" pointerEvents="none" />
      )}
    </svg>
  );
};

export default PlanView;
