import React, { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Lock, Pause, RotateCw, Trash2 } from 'lucide-react';
import type { FormatKey, NRect, RegionKey, Regions, ThemeLayer } from '../../types/art.types';
import { BUILTIN_REGIONS, FORMATS, REGION_META } from './formats';
import { RegionHandle, dragRegion } from './layout';
import { layerStill } from './render';

/**
 * Editor das camadas do fundo de um formato (criador de temas).
 *
 * À esquerda, a arte: clicar escolhe a camada, arrastar move, o canto
 * redimensiona (mantendo a proporção) e a bolinha de cima gira. À direita, a
 * lista no estilo de programa de imagem: a de cima fica na frente. A base
 * (fundo opaco) fica sempre embaixo de tudo e cobre a arte inteira.
 */

interface Props {
  format: FormatKey;
  layers: ThemeLayer[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (layers: ThemeLayer[]) => void;
  /** Áreas já marcadas no formato. Sem elas, mostra as áreas padrão como sugestão. */
  regions?: Regions;
  /** Selo 3D do tema, desenhado na área do selo. */
  sealUrl?: string | null;
  /** Arrastando uma área (prévia ao vivo) e ao soltar (salvar). */
  onRegionsPreview?: (regions: Regions | null) => void;
  onRegionsCommit?: (regions: Regions) => void;
}

type RegionDrag = { key: RegionKey; handle: RegionHandle; start: NRect; px: number; py: number; next: Regions | null };

/** Margem de segurança: corte de gráfica e bordas que o celular esconde. */
const SAFE = 0.04;

const CHECKER = 'repeating-conic-gradient(#e7e5e4 0% 25%, #fafaf9 0% 50%) 50% / 20px 20px';
const round = (v: number) => Math.round(v * 10000) / 10000;

/** Base primeiro (uma só), depois os elementos na ordem dada. */
export const normalizeLayers = (layers: ThemeLayer[]): ThemeLayer[] => {
  const base = layers.find((l) => l.role === 'base');
  const rest = layers.filter((l) => l !== base).map((l) => (l.role === 'base' ? { ...l, role: 'element' as const } : l));
  return base ? [base, ...rest] : rest;
};

type Drag = { id: string; mode: 'move' | 'scale' | 'rotate'; start: ThemeLayer; px: number; py: number };

const LayerEditor: React.FC<Props> = ({ format, layers, selected, onSelect, onChange, regions, sealUrl, onRegionsPreview, onRegionsCommit }) => {
  const { width: W, height: H } = FORMATS[format];
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const rdrag = useRef<RegionDrag | null>(null);
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [guides, setGuides] = useState(true);
  /** Mover áreas (logo, produtos, rodapé, selo) em vez dos enfeites. */
  const [areaMode, setAreaMode] = useState(false);
  const [activeArea, setActiveArea] = useState<RegionKey | null>(null);
  const marked = !!regions && Object.keys(regions).length > 0;
  const shownRegions: Regions = marked ? regions! : BUILTIN_REGIONS[format];
  const showGuides = guides || areaMode;
  const current = layers.find((l) => l.id === selected && l.role !== 'base') ?? null;

  const update = (id: string, patch: Partial<ThemeLayer>) => onChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const point = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, r };
  };

  const begin = (layer: ThemeLayer, mode: Drag['mode']) => (e: React.PointerEvent) => {
    if (layer.role === 'base') { onSelect(layer.id); return; }
    e.stopPropagation();
    e.preventDefault();
    onSelect(layer.id);
    stageRef.current?.focus({ preventScroll: true });
    const p = point(e);
    drag.current = { id: layer.id, mode, start: layer, px: p.x, py: p.y };
    stageRef.current?.setPointerCapture(e.pointerId);
  };

  const beginArea = (key: RegionKey, handle: RegionHandle) => (e: React.PointerEvent) => {
    const start = shownRegions[key];
    if (!start) return;
    e.stopPropagation();
    e.preventDefault();
    setActiveArea(key);
    const p = point(e);
    rdrag.current = { key, handle, start, px: p.x, py: p.y, next: null };
    stageRef.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    const rd = rdrag.current;
    if (rd) {
      const p = point(e);
      rd.next = { ...shownRegions, [rd.key]: dragRegion(rd.start, rd.handle, p.x - rd.px, p.y - rd.py) };
      onRegionsPreview?.(rd.next);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    const s = d.start;
    if (d.mode === 'move') {
      update(d.id, { cx: round(s.cx + p.x - d.px), cy: round(s.cy + p.y - d.py) });
    } else {
      // Distâncias em px da tela: a arte não é quadrada.
      const cxPx = s.cx * p.r.width;
      const cyPx = s.cy * p.r.height;
      const vx = p.x * p.r.width - cxPx;
      const vy = p.y * p.r.height - cyPx;
      if (d.mode === 'scale') {
        const d0 = Math.hypot(d.px * p.r.width - cxPx, d.py * p.r.height - cyPx) || 1;
        update(d.id, { width: round(Math.max(0.01, Math.min(3, s.width * (Math.hypot(vx, vy) / d0)))) });
      } else {
        let angle = (Math.atan2(vy, vx) * 180) / Math.PI + 90;
        if (e.shiftKey) angle = Math.round(angle / 15) * 15;
        if (angle > 180) angle -= 360;
        update(d.id, { rotation: Math.round(angle * 10) / 10 });
      }
    }
  };

  const end = () => {
    drag.current = null;
    const rd = rdrag.current;
    rdrag.current = null;
    // Áreas sugeridas viram áreas do tema na primeira mexida (todas, não só a arrastada).
    if (rd?.next) onRegionsCommit?.(rd.next);
    else if (rd) onRegionsPreview?.(null);
  };

  const nudge = (e: React.KeyboardEvent) => {
    if (!current) return;
    const step = e.shiftKey ? 0.02 : 0.002;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const dd = delta[e.key];
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(current.id); return; }
    // + / - aumenta e diminui, [ / ] gira.
    const k = e.shiftKey ? 5 : 1;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); update(current.id, { width: round(Math.min(3, current.width * (1 + 0.02 * k))) }); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); update(current.id, { width: round(Math.max(0.01, current.width * (1 - 0.02 * k))) }); return; }
    if (e.key === '[' || e.key === ']') { e.preventDefault(); update(current.id, { rotation: current.rotation + (e.key === ']' ? k : -k) }); return; }
    if (!dd) return;
    e.preventDefault();
    update(current.id, { cx: round(current.cx + dd[0]), cy: round(current.cy + dd[1]) });
  };

  /** Move a camada na pilha: +1 vai para a frente. A base não sai do fundo. */
  const shift = (id: string, by: number) => {
    const i = layers.findIndex((l) => l.id === id);
    const j = i + by;
    const floor = layers[0]?.role === 'base' ? 1 : 0;
    if (i < floor || j < floor || j >= layers.length) return;
    const next = [...layers];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const dropOn = (targetId: string) => {
    if (!dragRow || dragRow === targetId) return;
    const moving = layers.find((l) => l.id === dragRow);
    if (!moving || moving.role === 'base') return;
    const rest = layers.filter((l) => l.id !== dragRow);
    const at = rest.findIndex((l) => l.id === targetId);
    // Soltar sobre uma linha põe a camada logo à frente dela (a lista mostra a frente em cima).
    rest.splice(Math.max(rest[0]?.role === 'base' ? 1 : 0, at + 1), 0, moving);
    onChange(rest);
    setDragRow(null);
  };

  const remove = (id: string) => {
    onChange(layers.filter((l) => l.id !== id));
    if (selected === id) onSelect(null);
  };

  const box = (l: ThemeLayer): React.CSSProperties => ({
    left: `${l.cx * 100}%`, top: `${l.cy * 100}%`, width: `${l.width * 100}%`,
    aspectRatio: l.w && l.h ? `${l.w} / ${l.h}` : undefined,
    transform: `translate(-50%, -50%) rotate(${l.rotation}deg)`,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div ref={stageRef} tabIndex={0} onKeyDown={nudge} aria-label="Montagem do fundo. Clique num enfeite para editar."
          className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          style={{ aspectRatio: `${W} / ${H}`, background: CHECKER, maxWidth: Math.min(560, 560 * (W / H) * 1.1) }}
          onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerDown={() => onSelect(null)}>
          {layers.map((l) => (l.hidden ? null : l.role === 'base' ? (
            <img key={l.id} src={l.url} alt="" draggable={false} onPointerDown={areaMode ? undefined : begin(l, 'move')}
              className="absolute inset-0 h-full w-full object-fill" style={{ opacity: l.opacity }} />
          ) : (
            <img key={l.id} src={l.url} alt="" draggable={false} onPointerDown={areaMode ? undefined : begin(l, 'move')}
              className={`absolute max-w-none ${areaMode ? '' : 'cursor-move'}`} style={{ ...box(l), opacity: l.opacity }} />
          )))}
          {/* Selo 3D na área dele, como sai no encarte */}
          {sealUrl && shownRegions.seal && (
            <img src={sealUrl} alt="" draggable={false} className="pointer-events-none absolute object-contain drop-shadow-lg"
              style={{ left: `${shownRegions.seal.x * 100}%`, top: `${shownRegions.seal.y * 100}%`, width: `${shownRegions.seal.w * 100}%`, height: `${shownRegions.seal.h * 100}%` }} />
          )}
          {showGuides && (
            <div className="pointer-events-none absolute inset-0" aria-hidden={!areaMode}>
              {/* Margem de segurança e linhas de centro */}
              <div className="absolute border border-dashed border-white/80 mix-blend-difference"
                style={{ left: `${SAFE * 100}%`, top: `${SAFE * (W / H) * 100}%`, right: `${SAFE * 100}%`, bottom: `${SAFE * (W / H) * 100}%` }} />
              <div className="absolute inset-y-0 left-1/2 w-px bg-fuchsia-500/50" />
              <div className="absolute inset-x-0 top-1/2 h-px bg-fuchsia-500/50" />
              {(Object.keys(REGION_META) as RegionKey[]).map((key) => {
                const r = shownRegions[key];
                if (!r) return null;
                const color = REGION_META[key].color;
                const active = areaMode && activeArea === key;
                return (
                  <div key={key} onPointerDown={areaMode ? beginArea(key, 'move') : undefined}
                    className={`absolute rounded-sm border-2 ${active ? 'border-solid' : 'border-dashed'} ${areaMode ? 'pointer-events-auto cursor-move' : ''}`}
                    style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, borderColor: color, background: `${color}${areaMode ? '33' : '1f'}`, zIndex: active ? 2 : 1 }}>
                    <span className="absolute left-0 top-0 rounded-br px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-white" style={{ background: color }}>
                      {REGION_META[key].label}
                    </span>
                    {areaMode && (['nw', 'ne', 'sw', 'se'] as const).map((h) => (
                      <span key={h} onPointerDown={beginArea(key, h)}
                        className={`absolute h-3.5 w-3.5 rounded-sm border-2 bg-white ${h === 'nw' || h === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'} ${h.includes('n') ? '-top-2' : '-bottom-2'} ${h.includes('w') ? '-left-2' : '-right-2'}`}
                        style={{ borderColor: color }} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          {current && !current.hidden && !areaMode && (
            <div className="pointer-events-none absolute outline outline-2 outline-offset-0 outline-sky-500" style={box(current)}>
              <button type="button" tabIndex={-1} onPointerDown={begin(current, 'move')}
                className="pointer-events-auto absolute inset-0 cursor-move focus:outline-none" aria-label={`Mover ${current.name}. Setas movem; Delete remove.`} />
              {(['-left-1.5 -top-1.5', '-right-1.5 -top-1.5', '-left-1.5 -bottom-1.5', '-right-1.5 -bottom-1.5'] as const).map((pos) => (
                <span key={pos} onPointerDown={begin(current, 'scale')}
                  className={`pointer-events-auto absolute h-3 w-3 cursor-nwse-resize rounded-sm border-2 border-sky-500 bg-white ${pos}`} aria-hidden="true" />
              ))}
              <span onPointerDown={begin(current, 'rotate')} title="Girar (Shift: de 15 em 15°)"
                className="pointer-events-auto absolute -top-7 left-1/2 flex h-5 w-5 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border-2 border-sky-500 bg-white text-sky-600">
                <RotateCw className="h-3 w-3" aria-hidden="true" />
              </span>
            </div>
          )}
        </div>
        <div className="mx-auto mt-2 flex max-w-[560px] flex-col gap-2 text-xs text-slate-600">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="radiogroup" aria-label="O que arrastar na montagem" className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
              {([[false, 'Mover enfeites'], [true, 'Mover áreas']] as const).map(([value, label]) => (
                <button key={label} type="button" role="radio" aria-checked={areaMode === value}
                  onClick={() => { setAreaMode(value); setActiveArea(null); if (value) onSelect(null); }}
                  className={`rounded-md px-3 py-1 font-medium transition ${areaMode === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                  {label}
                </button>
              ))}
            </div>
            {!areaMode && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} className="h-4 w-4 accent-green-600" />
                Mostrar áreas, margem e centro
              </label>
            )}
          </div>
          {areaMode && (
            <div className="flex flex-col gap-1.5 rounded-lg bg-slate-50 p-2">
              <span>Arraste uma área para mudar de lugar e puxe os cantos para aumentar ou diminuir. Cada formato tem as suas.</span>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(REGION_META) as RegionKey[]).map((key) => (shownRegions[key] ? (
                  key !== 'products' && (
                    <button key={key} type="button" onClick={() => { const next = { ...shownRegions }; delete next[key]; onRegionsCommit?.(next); }}
                      className="rounded-full border border-slate-200 bg-white px-2 py-0.5 hover:border-red-300 hover:text-red-700">
                      Tirar {REGION_META[key].label.toLowerCase()}
                    </button>
                  )
                ) : (
                  <button key={key} type="button" onClick={() => onRegionsCommit?.({ ...shownRegions, [key]: BUILTIN_REGIONS[format][key] })}
                    className="rounded-full border border-slate-200 bg-white px-2 py-0.5 hover:border-green-400">
                    + {REGION_META[key].label}
                  </button>
                )))}
              </div>
            </div>
          )}
          {showGuides && !marked && <span className="text-amber-700">Áreas padrão (sugestão). Mexa nelas em &quot;Mover áreas&quot; para valer neste design.</span>}
        </div>
        {current && (
          <div className="mx-auto mt-3 grid max-w-[560px] gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-3">
            <div className="flex items-center justify-between gap-2 sm:col-span-3">
              <span className="truncate font-semibold text-slate-900">{current.name}</span>
              <span className="flex gap-1">
                <button type="button" onClick={() => update(current.id, { cx: 0.5 })} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100">Centro horizontal</button>
                <button type="button" onClick={() => update(current.id, { cy: 0.5 })} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100">Centro vertical</button>
                <button type="button" onClick={() => update(current.id, { rotation: 0 })} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100">Sem giro</button>
              </span>
            </div>
            <label className="flex flex-col gap-1">Posição X (%)
              <input type="number" step={0.5} value={Math.round(current.cx * 1000) / 10} className="h-8 rounded border border-slate-300 bg-white px-2"
                onChange={(e) => e.target.value !== '' && update(current.id, { cx: round(Number(e.target.value) / 100) })} />
            </label>
            <label className="flex flex-col gap-1">Posição Y (%)
              <input type="number" step={0.5} value={Math.round(current.cy * 1000) / 10} className="h-8 rounded border border-slate-300 bg-white px-2"
                onChange={(e) => e.target.value !== '' && update(current.id, { cy: round(Number(e.target.value) / 100) })} />
            </label>
            <p className="self-end text-xs text-slate-500">Arraste na arte; setas movem, + e − mudam o tamanho, [ e ] giram.</p>
            <label className="flex flex-col gap-1">Tamanho {Math.round(current.width * 100)}%
              <input type="range" min={1} max={200} value={Math.round(current.width * 100)} className="accent-sky-600"
                onChange={(e) => update(current.id, { width: Number(e.target.value) / 100 })} />
            </label>
            <label className="flex flex-col gap-1">Giro {Math.round(current.rotation)}°
              <input type="range" min={-180} max={180} value={Math.round(current.rotation)} className="accent-sky-600"
                onChange={(e) => update(current.id, { rotation: Number(e.target.value) })} />
            </label>
            <label className="flex flex-col gap-1">Opacidade {Math.round(current.opacity * 100)}%
              <input type="range" min={0} max={100} value={Math.round(current.opacity * 100)} className="accent-sky-600"
                onChange={(e) => update(current.id, { opacity: Number(e.target.value) / 100 })} />
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Frente</span><span>{layers.length} {layers.length === 1 ? 'camada' : 'camadas'}</span>
        </div>
        <ol className="flex flex-col gap-1" aria-label="Camadas, da frente para o fundo">
          {[...layers].reverse().map((l) => {
            const base = l.role === 'base';
            const i = layers.indexOf(l);
            return (
              <li key={l.id}
                draggable={!base} onDragStart={() => setDragRow(l.id)} onDragEnd={() => setDragRow(null)}
                onDragOver={(e) => { if (dragRow) e.preventDefault(); }} onDrop={() => dropOn(l.id)}
                onClick={() => onSelect(l.id)}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition ${selected === l.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'} ${dragRow === l.id ? 'opacity-50' : ''}`}>
                {base ? <Lock className="h-4 w-4 shrink-0 text-slate-400" aria-label="Base fixa no fundo" /> : <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-400" aria-hidden="true" />}
                <img src={l.url} alt="" className="h-9 w-9 shrink-0 rounded object-contain" style={{ background: CHECKER }} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-medium ${l.hidden ? 'text-slate-400' : 'text-slate-800'}`}>{l.name}</span>
                  <span className="block text-xs text-slate-500">
                    {base ? (layerStill(l) ? 'Fundo · travado, não anima' : 'Fundo · anima (só aproxima)') : l.still ? 'Parada' : 'Anima'}
                  </span>
                </span>
                {!base && (
                  <>
                    <button type="button" onClick={(e) => { e.stopPropagation(); shift(l.id, 1); }} disabled={i === layers.length - 1}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label={`Trazer ${l.name} para a frente`}><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); shift(l.id, -1); }} disabled={i <= (layers[0]?.role === 'base' ? 1 : 0)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label={`Mandar ${l.name} para trás`}><ArrowDown className="h-3.5 w-3.5" /></button>
                  </>
                )}
                <button type="button" onClick={(e) => { e.stopPropagation(); update(l.id, { still: !layerStill(l) }); }}
                  className={`rounded p-1 hover:bg-slate-100 ${layerStill(l) ? 'text-amber-600' : 'text-slate-400'}`}
                  aria-pressed={layerStill(l)}
                  title={layerStill(l) ? 'Parada na animação (clique para animar)' : 'Anima (clique para travar)'}
                  aria-label={layerStill(l) ? `${l.name} parada; clique para animar` : `Deixar ${l.name} parada na animação`}>
                  {base && layerStill(l) ? <Lock className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); update(l.id, { hidden: !l.hidden }); }}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={l.hidden ? `Mostrar ${l.name}` : `Esconder ${l.name}`}>
                  {l.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); remove(l.id); }}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label={`Remover ${l.name}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-slate-500">Arraste as linhas para mudar a ordem. A de cima fica na frente. A base fica sempre no fundo.</p>
      </div>
    </div>
  );
};

export default LayerEditor;
