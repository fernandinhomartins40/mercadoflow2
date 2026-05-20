import React, { useCallback, useMemo, useRef, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import { StoreElement, ELEMENT_TYPES, ElementType } from '../types/store-layout.types';
import { Lightbulb, Trash2, RotateCcw, Eye, EyeOff, Save, Grid3X3, Type, X } from 'lucide-react';

const CANVAS_W = 800;
const CANVAS_H = 600;
const GRID = 20;
const LS_KEY = 'mercadoflow_store_layout';

const snap = (v: number) => Math.round(v / GRID) * GRID;

let idCounter = Date.now();
const uid = () => `el_${++idCounter}`;

const StoreMap: React.FC = () => {
  const [elements, setElements] = useState<StoreElement[]>(() => {
    try { const d = localStorage.getItem(LS_KEY); return d ? JSON.parse(d) : []; } catch { return []; }
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placingType, setPlacingType] = useState<ElementType | null>(null);
  const [heatmap, setHeatmap] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => elements.find((e) => e.id === selectedId) || null, [elements, selectedId]);

  const saveToStorage = useCallback((els: StoreElement[]) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(els)); } catch { /* noop */ }
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placingType || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cfg = ELEMENT_TYPES[placingType];
    const x = snap(e.clientX - rect.left - cfg.defaultWidth / 2);
    const y = snap(e.clientY - rect.top - cfg.defaultHeight / 2);
    const newEl: StoreElement = {
      id: uid(), type: placingType,
      x: Math.max(0, Math.min(x, CANVAS_W - cfg.defaultWidth)),
      y: Math.max(0, Math.min(y, CANVAS_H - cfg.defaultHeight)),
      width: cfg.defaultWidth, height: cfg.defaultHeight,
      rotation: 0, label: cfg.label, categoryIds: [],
    };
    const next = [...elements, newEl];
    setElements(next);
    saveToStorage(next);
    setPlacingType(null);
    setSelectedId(newEl.id);
    setEditLabel(newEl.label);
  };

  const handleElementClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (placingType) return;
    setSelectedId(id);
    const el = elements.find((x) => x.id === id);
    if (el) setEditLabel(el.label);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const next = elements.filter((e) => e.id !== selectedId);
    setElements(next);
    saveToStorage(next);
    setSelectedId(null);
  };

  const rotateSelected = () => {
    if (!selectedId) return;
    const next = elements.map((e) =>
      e.id === selectedId ? { ...e, rotation: (e.rotation + 90) % 360, width: e.height, height: e.width } : e
    );
    setElements(next);
    saveToStorage(next);
  };

  const renameSelected = () => {
    if (!selectedId) return;
    const next = elements.map((e) => (e.id === selectedId ? { ...e, label: editLabel } : e));
    setElements(next);
    saveToStorage(next);
  };

  const heatValue = useMemo(() => {
    const map = new Map<string, number>();
    elements.forEach((e) => map.set(e.id, Math.random()));
    return map;
  }, [elements, heatmap]);

  const heatColor = (id: string) => {
    const v = heatValue.get(id) || 0;
    if (v > 0.66) return 'rgba(5, 150, 105, 0.35)';
    if (v > 0.33) return 'rgba(217, 119, 6, 0.3)';
    return 'rgba(220, 38, 38, 0.25)';
  };

  const suggestions = [
    { text: 'Coloque bebidas perto do açougue — 68% dos clientes compram juntos para churrasco', icon: '🥩' },
    { text: 'Ponta de gôndola subutilizada — coloque o produto mais vendido da semana ali', icon: '📦' },
    { text: 'Zona de impulso: adicione chocolates perto do caixa (venderam 23% mais no fim de semana)', icon: '🍫' },
    { text: 'Coloque itens essenciais (leite, pão, ovos) no fundo da loja para aumentar exposição a outros produtos', icon: '🥛' },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Mapa da loja</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Organize seus produtos estrategicamente para vender mais</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHeatmap(!heatmap)}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition"
              style={heatmap
                ? { borderColor: 'var(--brand-600)', background: 'var(--surface-success)', color: 'var(--brand-700)' }
                : { borderColor: 'var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
            >
              {heatmap ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {heatmap ? 'Ocultar heatmap' : 'Ver heatmap'}
            </button>
            <button
              type="button"
              onClick={() => { saveToStorage(elements); alert('Layout salvo!'); }}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80"
              style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
            >
              <Save className="h-4 w-4" /> Salvar
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[220px_1fr_240px]">
          {/* Element Library */}
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Elementos</h3>
            <div className="flex flex-col gap-2">
              {(Object.entries(ELEMENT_TYPES) as [ElementType, typeof ELEMENT_TYPES[ElementType]][]).map(([type, cfg]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setPlacingType(type); setSelectedId(null); }}
                  className="flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs font-medium transition"
                  style={placingType === type
                    ? { borderColor: 'var(--brand-500)', background: 'var(--surface-success)', color: 'var(--brand-700)' }
                    : { borderColor: 'var(--border-soft)', color: 'var(--text-primary)' }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm" style={{ background: cfg.color }}>
                    {cfg.icon}
                  </span>
                  <span>{cfg.label}</span>
                </button>
              ))}
            </div>
            {placingType && (
              <div className="mt-3 rounded-lg p-2 text-center text-xs" style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}>
                Clique no mapa para posicionar
                <button type="button" onClick={() => setPlacingType(null)} className="ml-2 underline" style={{ color: 'var(--brand-700)' }}>Cancelar</button>
              </div>
            )}
          </div>

          {/* Canvas */}
          <div className="overflow-auto rounded-xl" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
            <div
              ref={canvasRef}
              className="relative"
              style={{ width: CANVAS_W, height: CANVAS_H, cursor: placingType ? 'crosshair' : 'default' }}
              onClick={handleCanvasClick}
            >
              {/* Grid */}
              <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
                <defs>
                  <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                    <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="var(--border-soft)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>

              {/* Entrance / Exit labels */}
              <div className="absolute left-4 top-2 rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--brand-100)', color: 'var(--brand-700)' }}>ENTRADA</div>
              <div className="absolute bottom-2 right-4 rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--surface-muted)', color: 'var(--text-soft)' }}>SAÍDA</div>

              {/* Elements */}
              {elements.map((el) => {
                const isSelected = el.id === selectedId;
                return (
                  <div
                    key={el.id}
                    onClick={(e) => handleElementClick(e, el.id)}
                    className={`absolute flex cursor-pointer items-center justify-center rounded border-2 text-[10px] font-semibold transition ${
                      isSelected ? 'border-green-500 ring-2 ring-green-500/30 z-10' : ''
                    }`}
                    style={isSelected ? {} : { borderColor: 'var(--border-strong)' }}
                    style={{
                      left: el.x, top: el.y, width: el.width, height: el.height,
                      background: heatmap ? heatColor(el.id) : (ELEMENT_TYPES[el.type]?.color || 'var(--surface-muted)'),
                      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                    }}
                    title={el.label}
                  >
                    <span className="truncate px-1" style={{ color: 'var(--text-primary)' }}>{el.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Properties Panel */}
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
            {selected ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Propriedades</h3>
                  <button type="button" onClick={() => setSelectedId(null)} style={{ color: 'var(--text-soft)' }}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div>
                  <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Nome</label>
                  <div className="mt-1 flex gap-1">
                    <input
                      className="h-8 flex-1 rounded px-2 text-xs outline-none"
                      style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }}
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onBlur={renameSelected}
                      onKeyDown={(e) => e.key === 'Enter' && renameSelected()}
                    />
                    <button type="button" onClick={renameSelected} className="rounded px-2 text-xs" style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}>
                      <Type className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Tipo</label>
                  <p className="mt-0.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{ELEMENT_TYPES[selected.type]?.label}</p>
                </div>
                <div>
                  <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Posição</label>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{selected.x}x, {selected.y}y · {selected.width}×{selected.height}px</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={rotateSelected} className="flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
                    <RotateCcw className="h-3.5 w-3.5" /> Girar
                  </button>
                  <button type="button" onClick={deleteSelected} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 py-2 text-xs font-medium text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                </div>
                {heatmap && (
                  <div className="rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Performance</span>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                      <div className="h-full rounded-full bg-green-500" style={{ width: `${(heatValue.get(selected.id) || 0) * 100}%` }} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Grid3X3 className="mx-auto h-8 w-8" style={{ color: 'var(--border-strong)' }} />
                <p className="mt-2 text-xs" style={{ color: 'var(--text-soft)' }}>Selecione um elemento no mapa ou adicione um novo da biblioteca</p>
              </div>
            )}

            {/* Heatmap legend */}
            {heatmap && (
              <div className="mt-4 rounded-lg p-3" style={{ border: '1px solid var(--border-soft)' }}>
                <h4 className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Legenda heatmap</h4>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: 'rgba(5,150,105,0.35)' }} /><span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Alta venda</span></div>
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: 'rgba(217,119,6,0.3)' }} /><span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Venda média</span></div>
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: 'rgba(220,38,38,0.25)' }} /><span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Baixa venda</span></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Suggestions */}
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            <Lightbulb className="h-4 w-4 text-amber-500" /> Sugestões inteligentes
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl p-4" style={{ border: '1px solid var(--border-success)', background: 'var(--surface-success)' }}>
                <span className="text-xl">{s.icon}</span>
                <p className="text-sm" style={{ color: 'var(--brand-700)' }}>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default StoreMap;
