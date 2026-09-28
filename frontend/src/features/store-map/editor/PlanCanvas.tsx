import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { Fixture, FixtureType, StorePlan } from '../../../types/storeMap.types';
import { FIXTURES, fixtureName, heatColor } from '../model';
import {
  GRID, HANDLES, Handle, Guide, Rect, boundsOf, clamp, fmtM, intersects, normRect, resizeRect, round2, smartSnap, snapTo,
} from './geometry';
import { FixtureGlyph, FixtureLabel, FloorDefs, WALL, subLabel } from './FixtureGlyph';
import { useViewport } from './useViewport';

export type CanvasMode = 'edit' | 'heat' | 'view';
export type Tool = 'select' | 'hand';
export const FIXTURE_MIME = 'application/x-loja-viva-fixture';

const SEL = '#15803d';
const GUIDE = '#db2777';
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';

interface Props {
  plan: StorePlan;
  mode: CanvasMode;
  tool?: Tool;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  highlightIds?: Set<string>;
  connect?: [string, string] | null;
  heat?: Record<string, number>;
  heatLabel?: (fixtureId: string) => string;
  onPreview?: (plan: StorePlan) => void;
  onCommit?: (plan?: StorePlan) => void;
  onCancel?: () => void;
  onDropType?: (type: FixtureType, x: number, y: number) => void;
  /** Muda quando há algo novo a mostrar (busca, sugestão): enquadra os destacados. */
  revealKey?: string | null;
  className?: string;
}

type Pt = { x: number; y: number };
type Gesture =
  | { kind: 'move'; start: Pt; client: Pt; rects: Map<string, Rect>; bounds: Rect; moved: boolean; clickId: string; wasSelected: boolean }
  | { kind: 'resize'; id: string; handle: Handle; start: Pt; rect: Rect }
  | { kind: 'wall'; edge: 'e' | 's' | 'se'; start: Pt; w: number; h: number; minW: number; minH: number }
  | { kind: 'pan'; client: Pt }
  | { kind: 'marquee'; start: Pt; now: Pt; base: string[] }
  | { kind: 'pinch'; dist: number; mid: Pt };

const HANDLE_CURSOR: Record<Handle, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
};

const handlePoint = (r: Rect, h: Handle): Pt => ({
  x: h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2,
  y: h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2,
});

/** Régua de escala com um comprimento redondo que ocupe de 60 a 140 px. */
const scaleBar = (s: number) => {
  const options = [0.5, 1, 2, 5, 10, 20, 50];
  return options.find((m) => m * s >= 60) ?? 50;
};

/**
 * Editor da planta: zoom com a roda ou pinça, arrastar o fundo para andar,
 * arrastar móveis (com encaixe na grade e nas bordas dos outros), alças para
 * mudar o tamanho, seleção por laço e as paredes da loja arrastáveis.
 */
const PlanCanvas: React.FC<Props> = ({
  plan, mode, tool = 'select', selectedIds, onSelectionChange, highlightIds, connect, heat, heatLabel,
  onPreview, onCommit, onCancel, onDropType, revealKey, className,
}) => {
  const content = useMemo<Rect>(() => ({ x: -1.4, y: -1.4, w: plan.width + 2.2, h: plan.height + 2.2 }), [plan.width, plan.height]);
  const vp = useViewport(content, 0.4);
  const { px, view } = vp;
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const space = useRef(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const editable = mode === 'edit';
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const planRef = useRef(plan);
  planRef.current = plan;

  const toPlan = (clientX: number, clientY: number): Pt => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  // Barra de espaço segurada = mão temporária, como nos editores de desenho.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(el.tagName) && el.getAttribute('role') !== 'button') space.current = true;
      if (e.key === 'Escape' && gesture.current) {
        if (gesture.current.kind === 'move' || gesture.current.kind === 'resize' || gesture.current.kind === 'wall') onCancel?.();
        gesture.current = null;
        setGuides([]); setMarquee(null); setActive(null);
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [onCancel]);

  // Busca ou sugestão: leva os móveis destacados para a área visível.
  useEffect(() => {
    if (!revealKey || !highlightIds?.size) return;
    const fx = planRef.current.fixtures.filter((f) => highlightIds.has(f.id));
    if (fx.length) vp.reveal(boundsOf(fx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);

  const capture = (e: React.PointerEvent) => {
    try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* ponteiro já saiu */ }
  };

  const startPan = (e: React.PointerEvent) => {
    gesture.current = { kind: 'pan', client: { x: e.clientX, y: e.clientY } };
    setPanning(true);
    capture(e);
  };

  const onPointerDownCapture = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // Segundo dedo: vira pinça e descarta o que o primeiro começou.
      const g = gesture.current;
      if (g && (g.kind === 'move' || g.kind === 'resize' || g.kind === 'wall')) onCancel?.();
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      setGuides([]); setMarquee(null); setActive(null);
      capture(e);
      e.stopPropagation();
    }
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (gesture.current?.kind === 'pinch') return;
    const wantsPan = tool === 'hand' || space.current || e.button === 1 || !editable || e.pointerType === 'touch';
    if (wantsPan) {
      if (!editable || e.pointerType === 'touch') {
        if (!e.shiftKey && tool !== 'hand') onSelectionChange([]);
      }
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    const p = toPlan(e.clientX, e.clientY);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    gesture.current = { kind: 'marquee', start: p, now: p, base: additive ? selectedIds : [] };
    if (!additive) onSelectionChange([]);
    capture(e);
  };

  const onFixtureDown = (e: React.PointerEvent, f: Fixture) => {
    if (gesture.current?.kind === 'pinch') return;
    e.stopPropagation();
    if (tool === 'hand' || space.current || e.button === 1) { startPan(e); return; }
    if (e.button !== 0) return;
    if (!editable) { onSelectionChange([f.id]); startPan(e); return; }
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (additive) {
      onSelectionChange(selected.has(f.id) ? selectedIds.filter((id) => id !== f.id) : [...selectedIds, f.id]);
      return;
    }
    const wasSelected = selected.has(f.id);
    const ids = wasSelected ? selectedIds : [f.id];
    if (!wasSelected) onSelectionChange(ids);
    const rects = new Map<string, Rect>();
    plan.fixtures.forEach((x) => { if (ids.includes(x.id)) rects.set(x.id, { x: x.x, y: x.y, w: x.w, h: x.h }); });
    gesture.current = {
      kind: 'move', start: toPlan(e.clientX, e.clientY), client: { x: e.clientX, y: e.clientY },
      rects, bounds: boundsOf([...rects.values()]), moved: false, clickId: f.id, wasSelected,
    };
    capture(e);
  };

  const onHandleDown = (e: React.PointerEvent, f: Fixture, handle: Handle) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    gesture.current = { kind: 'resize', id: f.id, handle, start: toPlan(e.clientX, e.clientY), rect: { x: f.x, y: f.y, w: f.w, h: f.h } };
    setActive(f.id);
    capture(e);
  };

  const onWallDown = (e: React.PointerEvent, edge: 'e' | 's' | 'se') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const minW = Math.max(4, ...plan.fixtures.map((f) => f.x + f.w));
    const minH = Math.max(4, ...plan.fixtures.map((f) => f.y + f.h));
    gesture.current = { kind: 'wall', edge, start: toPlan(e.clientX, e.clientY), w: plan.width, h: plan.height, minW, minH };
    capture(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      vp.panBy(mid.x - g.mid.x, mid.y - g.mid.y);
      if (g.dist > 0) vp.zoomAt(dist / g.dist, mid.x, mid.y);
      g.dist = dist; g.mid = mid;
      return;
    }
    if (g.kind === 'pan') {
      vp.panBy(e.clientX - g.client.x, e.clientY - g.client.y);
      g.client = { x: e.clientX, y: e.clientY };
      return;
    }

    const p = toPlan(e.clientX, e.clientY);
    if (g.kind === 'marquee') {
      g.now = p;
      const r = normRect(g.start.x, g.start.y, p.x, p.y);
      setMarquee(r);
      const hit = plan.fixtures.filter((f) => intersects(r, f)).map((f) => f.id);
      onSelectionChange([...new Set([...g.base, ...hit])]);
      return;
    }
    if (g.kind === 'move') {
      if (!g.moved && Math.hypot(e.clientX - g.client.x, e.clientY - g.client.y) < 4) return;
      if (!g.moved) { g.moved = true; setActive(g.clickId); }
      const raw = { ...g.bounds, x: g.bounds.x + p.x - g.start.x, y: g.bounds.y + p.y - g.start.y };
      const others = plan.fixtures.filter((f) => !g.rects.has(f.id));
      const snapped = e.altKey ? { dx: snapTo(raw.x) - raw.x, dy: snapTo(raw.y) - raw.y, guides: [] } : smartSnap(raw, others, plan, 7 * px);
      const nx = clamp(raw.x + snapped.dx, 0, Math.max(0, plan.width - g.bounds.w));
      const ny = clamp(raw.y + snapped.dy, 0, Math.max(0, plan.height - g.bounds.h));
      const dx = nx - g.bounds.x;
      const dy = ny - g.bounds.y;
      setGuides(snapped.guides);
      onPreview?.({
        ...plan,
        fixtures: plan.fixtures.map((f) => {
          const r = g.rects.get(f.id);
          return r ? { ...f, x: round2(r.x + dx), y: round2(r.y + dy) } : f;
        }),
      });
      return;
    }
    if (g.kind === 'resize') {
      const r = resizeRect(g.rect, g.handle, p.x - g.start.x, p.y - g.start.y, plan);
      onPreview?.({ ...plan, fixtures: plan.fixtures.map((f) => (f.id === g.id ? { ...f, ...r } : f)) });
      return;
    }
    if (g.kind === 'wall') {
      const w = g.edge !== 's' ? clamp(snapTo(g.w + p.x - g.start.x, 0.5), g.minW, 200) : plan.width;
      const h = g.edge !== 'e' ? clamp(snapTo(g.h + p.y - g.start.y, 0.5), g.minH, 200) : plan.height;
      if (w !== plan.width || h !== plan.height) onPreview?.({ ...plan, width: w, height: h });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    gesture.current = null;
    setGuides([]);
    setMarquee(null);
    setActive(null);
    setPanning(false);
    if (g.kind === 'move') {
      if (g.moved) onCommit?.();
      else if (g.wasSelected && selectedIds.length > 1) onSelectionChange([g.clickId]);
    } else if (g.kind === 'resize' || g.kind === 'wall') {
      onCommit?.();
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!editable || !e.dataTransfer.types.includes(FIXTURE_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData(FIXTURE_MIME) as FixtureType;
    if (!editable || !type || !FIXTURES[type]) return;
    e.preventDefault();
    const p = toPlan(e.clientX, e.clientY);
    onDropType?.(type, p.x, p.y);
  };

  // ── Desenho ─────────────────────────────────────────────────────────────
  const { width: W, height: H } = plan;
  const scale = view.s;
  const maxHeat = Math.max(1, ...Object.values(heat ?? {}));
  const single = selectedIds.length === 1 ? plan.fixtures.find((f) => f.id === selectedIds[0]) ?? null : null;
  const multi = selectedIds.length > 1 ? plan.fixtures.filter((f) => selected.has(f.id)) : [];
  const groupBounds = multi.length ? boundsOf(multi) : null;
  const center = (id: string) => {
    const f = plan.fixtures.find((x) => x.id === id);
    return f ? [f.x + f.w / 2, f.y + f.h / 2] : null;
  };
  const line = connect ? [center(connect[0]), center(connect[1])] : null;
  const barM = scaleBar(scale);
  const cursor = panning ? 'grabbing' : tool === 'hand' || !editable ? 'grab' : 'default';
  const doorGaps = plan.fixtures.filter((f) => f.type === 'entrada');

  /** Etiqueta de medida com fundo, em tamanho fixo na tela. */
  const Measure = ({ x, y, text, vertical = false, color = SEL }: { x: number; y: number; text: string; vertical?: boolean; color?: string }) => {
    const fs = 11 * px;
    const w = text.length * fs * 0.58 + 10 * px;
    const h = fs + 7 * px;
    return (
      <g transform={vertical ? `rotate(-90 ${x} ${y})` : undefined} pointerEvents="none">
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} fill={color} />
        <text x={x} y={y + fs * 0.36} textAnchor="middle" fontSize={fs} fontWeight={600} fill="#fff" style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</text>
      </g>
    );
  };

  return (
    <div
      ref={vp.boxRef}
      className={`relative overflow-hidden ${className ?? ''}`}
      style={{ background: '#e9ede8', touchAction: 'none' }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {vp.size.w > 0 && (
        <svg
          ref={svgRef}
          width={vp.size.w}
          height={vp.size.h}
          viewBox={vp.viewBox}
          className="block select-none"
          role="group"
          aria-label={`Planta da loja, ${fmtM(W)} por ${fmtM(H)}, com ${plan.fixtures.length} móveis`}
          style={{ cursor }}
          onPointerDownCapture={onPointerDownCapture}
          onPointerDown={onBackgroundDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <FloorDefs id="floor" scale={scale} />

          {/* Piso e paredes */}
          <rect x={0} y={0} width={W} height={H} fill="#f6f8f5" />
          <rect x={0} y={0} width={W} height={H} fill="url(#floor-5)" />
          <rect x={0} y={0} width={W} height={H} fill="none" stroke={WALL} strokeWidth={Math.max(0.12, 3 / scale)} />
          {doorGaps.map((d) => {
            const onFront = d.y + d.h >= H - 0.6;
            const onBack = d.y <= 0.6;
            const onLeft = d.x <= 0.6;
            const onRight = d.x + d.w >= W - 0.6;
            const t = Math.max(0.2, 4 / scale);
            if (onFront || onBack) return <rect key={d.id} x={d.x} y={(onFront ? H : 0) - t / 2} width={d.w} height={t} fill="#f6f8f5" />;
            if (onLeft || onRight) return <rect key={d.id} x={(onLeft ? 0 : W) - t / 2} y={d.y} width={t} height={d.h} fill="#f6f8f5" />;
            return null;
          })}

          {/* Cotas da loja */}
          {editable && (
            <g pointerEvents="none" stroke="#7b8a82" strokeWidth={px}>
              <line x1={0} y1={-0.7} x2={W} y2={-0.7} />
              <line x1={0} y1={-0.9} x2={0} y2={-0.5} />
              <line x1={W} y1={-0.9} x2={W} y2={-0.5} />
              <line x1={-0.7} y1={0} x2={-0.7} y2={H} />
              <line x1={-0.9} y1={0} x2={-0.5} y2={0} />
              <line x1={-0.9} y1={H} x2={-0.5} y2={H} />
            </g>
          )}
          {editable && <Measure x={W / 2} y={-0.7} text={`${fmtM(W)} de largura`} color="#5b6b63" />}
          {editable && <Measure x={-0.7} y={H / 2} text={`${fmtM(H)} de fundo`} vertical color="#5b6b63" />}
          <text x={W / 2} y={H + 0.9} textAnchor="middle" fontSize={Math.max(0.35, 11 * px)} fontWeight={600} fill="#7b8a82" pointerEvents="none">Frente da loja</text>

          {/* Móveis */}
          {plan.fixtures.map((f) => {
            const meta = FIXTURES[f.type];
            const value = heat?.[f.id];
            const t = value != null ? value / maxHeat : 0;
            const fill = mode === 'heat' ? (meta.noProducts ? '#eef1ee' : value != null ? heatColor(t) : '#f4f6f3') : undefined;
            const isSel = selected.has(f.id);
            const hl = highlightIds?.has(f.id);
            const dim = !!highlightIds?.size && !hl && mode !== 'edit';
            const aria = f.departments.length ? `: ${f.departments.map((d) => subLabel({ ...f, departments: [d] })).join(', ')}` : '';
            return (
              <g
                key={f.id}
                data-id={f.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                aria-label={`${fixtureName(f)}${aria}${mode === 'heat' && heatLabel ? `, ${heatLabel(f.id)}` : ''}`}
                className="store-fixture"
                style={{ cursor: editable && tool === 'select' ? (active === f.id ? 'grabbing' : 'move') : 'pointer', outline: 'none' }}
                onPointerDown={(e) => onFixtureDown(e, f)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectionChange(e.shiftKey ? [...new Set([...selectedIds, f.id])] : [f.id]);
                  }
                }}
                onFocus={() => vp.reveal({ x: f.x, y: f.y, w: f.w, h: f.h })}
              >
                <FixtureGlyph f={f} fill={fill} scale={scale} dim={dim} />
                {/* Área de toque mínima para móveis finos. */}
                <rect x={f.x - 4 * px} y={f.y - 4 * px} width={f.w + 8 * px} height={f.h + 8 * px} fill="transparent" />
              </g>
            );
          })}

          {/* Rótulos por cima de tudo, para um móvel não cobrir o nome do outro. */}
          {plan.fixtures.map((f) => {
            const meta = FIXTURES[f.type];
            const value = heat?.[f.id];
            const t = value != null ? value / maxHeat : 0;
            const strong = mode === 'heat' && value != null && t > 0.7;
            const main = mode === 'heat' && heatLabel && !meta.noProducts ? heatLabel(f.id) : fixtureName(f);
            const sub = mode === 'heat' ? fixtureName(f) : subLabel(f);
            const dim = !!highlightIds?.size && !highlightIds.has(f.id) && mode !== 'edit';
            return (
              <g key={`l${f.id}`} opacity={dim ? 0.4 : 1}>
                <FixtureLabel f={f} main={main} sub={sub} scale={scale} ink={strong ? '#ffffff' : undefined} halo={strong ? 'rgba(127,29,29,0.55)' : undefined} />
              </g>
            );
          })}

          {/* Destaques da busca e das sugestões */}
          {plan.fixtures.filter((f) => highlightIds?.has(f.id)).map((f) => (
            <rect key={`h${f.id}`} x={f.x - 5 * px} y={f.y - 5 * px} width={f.w + 10 * px} height={f.h + 10 * px} rx={6 * px}
              fill="none" stroke="#f59e0b" strokeWidth={2.5 * px} className="store-fixture-pulse" pointerEvents="none" />
          ))}
          {line && line[0] && line[1] && (
            <line x1={line[0][0]} y1={line[0][1]} x2={line[1][0]} y2={line[1][1]}
              stroke="#f59e0b" strokeWidth={3 * px} strokeDasharray={`${10 * px} ${6 * px}`} strokeLinecap="round" pointerEvents="none" />
          )}

          {/* Guias de alinhamento */}
          {guides.map((g, i) => (g.axis === 'v'
            ? <line key={i} x1={g.pos} y1={g.from - 0.4} x2={g.pos} y2={g.to + 0.4} stroke={GUIDE} strokeWidth={px} pointerEvents="none" />
            : <line key={i} x1={g.from - 0.4} y1={g.pos} x2={g.to + 0.4} y2={g.pos} stroke={GUIDE} strokeWidth={px} pointerEvents="none" />))}

          {/* Seleção */}
          {plan.fixtures.filter((f) => selected.has(f.id)).map((f) => (
            <rect key={`s${f.id}`} x={f.x} y={f.y} width={f.w} height={f.h} fill={SEL} fillOpacity={0.08}
              stroke={SEL} strokeWidth={1.5 * px} pointerEvents="none" />
          ))}
          {groupBounds && (
            <rect x={groupBounds.x - 3 * px} y={groupBounds.y - 3 * px} width={groupBounds.w + 6 * px} height={groupBounds.h + 6 * px}
              fill="none" stroke={SEL} strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} pointerEvents="none" />
          )}
          {single && (
            <>
              <Measure x={single.x + single.w / 2} y={single.y - 14 * px} text={fmtM(single.w)} />
              <Measure x={single.x + single.w + 14 * px} y={single.y + single.h / 2} text={fmtM(single.h)} vertical />
              {editable && HANDLES.filter((h) => {
                // Móvel fino na tela: as alças do meio cobririam o corpo e roubariam o arrasto.
                if ((h === 'e' || h === 'w') && single.w * scale < 26) return false;
                if ((h === 'n' || h === 's') && single.h * scale < 26) return false;
                return true;
              }).map((h) => {
                const p = handlePoint(single, h);
                const size = 9 * px;
                const hit = Math.min(13, Math.max(7, (Math.min(single.w, single.h) * scale) / 2.5)) * px;
                return (
                  <g key={h} style={{ cursor: HANDLE_CURSOR[h] }} onPointerDown={(e) => onHandleDown(e, single, h)}>
                    <circle cx={p.x} cy={p.y} r={hit} fill="transparent" />
                    <rect x={p.x - size / 2} y={p.y - size / 2} width={size} height={size} rx={2 * px}
                      fill="#ffffff" stroke={SEL} strokeWidth={1.5 * px} />
                  </g>
                );
              })}
            </>
          )}
          {marquee && (
            <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
              fill={SEL} fillOpacity={0.07} stroke={SEL} strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} pointerEvents="none" />
          )}

          {/* Paredes arrastáveis: mudar o tamanho da loja com o mouse. */}
          {editable && !single && (
            <>
              {([['e', W, H / 2, 'ew-resize'], ['s', W / 2, H, 'ns-resize'], ['se', W, H, 'nwse-resize']] as const).map(([edge, x, y, c]) => (
                <g key={edge} style={{ cursor: c }} onPointerDown={(e) => onWallDown(e, edge)} aria-hidden="true">
                  <circle cx={x} cy={y} r={14 * px} fill="transparent" />
                  {edge === 'se'
                    ? <rect x={x - 5 * px} y={y - 5 * px} width={10 * px} height={10 * px} rx={2 * px} fill="#ffffff" stroke={WALL} strokeWidth={1.5 * px} />
                    : <rect x={x - (edge === 'e' ? 4 : 14) * px} y={y - (edge === 'e' ? 14 : 4) * px}
                        width={(edge === 'e' ? 8 : 28) * px} height={(edge === 'e' ? 28 : 8) * px} rx={4 * px}
                        fill="#ffffff" stroke={WALL} strokeWidth={1.5 * px} />}
                </g>
              ))}
            </>
          )}
        </svg>
      )}

      {/* Escala */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium"
        style={{ background: 'rgba(255,255,255,0.88)', color: '#3f4d46' }} aria-hidden="true">
        <span style={{ width: barM * scale, height: 6, borderLeft: `1.5px solid ${WALL}`, borderRight: `1.5px solid ${WALL}`, borderBottom: `1.5px solid ${WALL}` }} />
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtM(barM)}</span>
      </div>

      {/* Zoom */}
      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-xl p-1 shadow-sm"
        style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid var(--border-soft)' }}>
        <button type="button" onClick={() => vp.zoomAt(1 / 1.25)} aria-label="Diminuir o zoom" title="Diminuir o zoom (−)"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-soft)] ${FOCUS}`} style={{ color: 'var(--text-primary)' }}>
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="min-w-[3.25rem] text-center text-xs font-semibold" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }} aria-live="polite">
          {vp.zoomPercent}%
        </span>
        <button type="button" onClick={() => vp.zoomAt(1.25)} aria-label="Aumentar o zoom" title="Aumentar o zoom (+)"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-soft)] ${FOCUS}`} style={{ color: 'var(--text-primary)' }}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={vp.fit} aria-label="Ver a loja inteira" title="Ver a loja inteira (0)"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-soft)] ${FOCUS}`} style={{ color: 'var(--text-primary)' }}>
          <Maximize className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ViewportKeys fit={vp.fit} zoom={vp.zoomAt} />
    </div>
  );
};

/** Atalhos de zoom: + e − aproximam e afastam, 0 enquadra a loja. */
const ViewportKeys: React.FC<{ fit: () => void; zoom: (f: number) => void }> = ({ fit, zoom }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1.25); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom(1 / 1.25); }
      else if (e.key === '0') { e.preventDefault(); fit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fit, zoom]);
  return null;
};

export { GRID };
export default PlanCanvas;
