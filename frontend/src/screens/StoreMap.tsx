import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { marketService } from '../services/market.service';
import {
  Save, RefreshCw, Plus, Minus, X, Check, ChevronRight,
  Search, TrendingUp, Lightbulb, AlertTriangle, ArrowRight,
  Package, Eye, Layers, Map,
} from 'lucide-react';

/* ══════════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════════ */

interface ShelfProduct {
  productId: string;
  name: string;
  imageUrl?: string | null;
  position: number; // 0 = left
}

interface Shelf {
  shelfNum: number; // 1 = top
  products: ShelfProduct[];
}

interface GridCell {
  row: number;
  col: number;
  type: 'gondola' | 'aisle' | 'empty';
  // gondola fields
  gondolaId?: string;
  gondolaNum?: number;
  sectionName?: string;
  categorySlug?: string;
  color?: string;
  shelves?: Shelf[];
}

interface CategoryHeat {
  category: string;
  revenue: number;
  score: number;
  heat: 'hot' | 'warm' | 'cold';
}

interface NeighborInsight {
  antecedentCategory: string;
  consequentCategory: string;
  confidence: number;
  lift: number;
  pairCount: number;
  adjacency: 'adjacent' | 'far' | 'unmapped';
}

type ViewMode = 'map' | 'analysis';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════════════════ */

const PRESET_COLORS = [
  '#dbeafe', '#dcfce7', '#fef9c3', '#fce7f3', '#ede9fe',
  '#ffedd5', '#cffafe', '#d1fae5', '#fef3c7', '#f1f5f9',
  '#fee2e2', '#fdf4ff', '#ecfdf5', '#fff7ed', '#f0f9ff',
];

const SHELF_COUNT_DEFAULT = 4;

function heatStyle(score: number) {
  if (score >= 66) return { bg: '#dcfce7', text: '#15803d', bar: '#22c55e', label: 'Alta venda' };
  if (score >= 33) return { bg: '#fef9c3', text: '#854d0e', bar: '#f59e0b', label: 'Média' };
  return { bg: '#fee2e2', text: '#991b1b', bar: '#ef4444', label: 'Baixa venda' };
}

function contrastText(hex: string): string {
  // Simple luminance check — return dark or light text
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? '#1e293b' : '#ffffff';
}

let _gondolaCounter = 1;
function nextGondolaId() { return `g${++_gondolaCounter}`; }

/* ══════════════════════════════════════════════════════════════════════════
   API HELPERS
══════════════════════════════════════════════════════════════════════════ */

const layoutApi = {
  get: (mid: string) => api.get(`/v1/markets/${mid}/store-layout`).then(r => r.data),
  save: (mid: string, body: object) => api.put(`/v1/markets/${mid}/store-layout`, body).then(r => r.data),
  heatmap: (mid: string) => api.get(`/v1/markets/${mid}/store-layout/heatmap`).then(r => r.data),
  neighborInsights: (mid: string, body: object) =>
    api.post(`/v1/markets/${mid}/store-layout/neighbor-insights`, body).then(r => r.data),
};

/* ══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════════════════════════════════════ */

// ── Color Picker ──────────────────────────────────────────────────────────
const ColorPicker: React.FC<{
  value: string;
  onChange: (c: string) => void;
}> = ({ value, onChange }) => {
  const nativeRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESET_COLORS.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)}
          className="h-5 w-5 rounded-full transition hover:scale-110"
          style={{ background: c, border: value === c ? '2px solid #334155' : '1px solid #cbd5e1', outline: value === c ? '2px solid #94a3b8' : 'none', outlineOffset: 1 }} />
      ))}
      {/* Native color picker for custom colors */}
      <button type="button" onClick={() => nativeRef.current?.click()}
        className="relative flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
        style={{ background: value, border: '2px solid #334155', color: contrastText(value) }}
        title="Cor personalizada">
        +
        <input ref={nativeRef} type="color" value={value} onChange={e => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </button>
    </div>
  );
};

// ── Shelf Product Slot ────────────────────────────────────────────────────
const ProductSlot: React.FC<{
  product?: ShelfProduct;
  onAdd: () => void;
  onRemove: () => void;
}> = ({ product, onAdd, onRemove }) => {
  const [imgBroken, setImgBroken] = useState(false);
  return product ? (
    <div className="group relative flex flex-col items-center" style={{ width: 64 }}>
      <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg"
        style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        {product.imageUrl && !imgBroken ? (
          <img src={product.imageUrl} alt={product.name} onError={() => setImgBroken(true)}
            loading="lazy" className="max-h-full max-w-full object-contain p-1" />
        ) : (
          <Package className="h-6 w-6 opacity-30" style={{ color: '#94a3b8' }} />
        )}
        <button type="button" onClick={onRemove}
          className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full opacity-0 transition group-hover:opacity-100"
          style={{ background: '#ef4444', color: '#fff' }}>
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
      <p className="mt-0.5 w-full text-center text-[9px] leading-tight line-clamp-2"
        style={{ color: '#475569' }}>{product.name}</p>
    </div>
  ) : (
    <button type="button" onClick={onAdd}
      className="flex h-14 w-14 flex-col items-center justify-center rounded-lg transition hover:bg-slate-100"
      style={{ border: '1.5px dashed #cbd5e1' }}>
      <Plus className="h-4 w-4" style={{ color: '#94a3b8' }} />
    </button>
  );
};

// ── Gondola Panel (right drawer) ──────────────────────────────────────────
const GondolaPanel: React.FC<{
  cell: GridCell;
  marketId: string;
  onUpdate: (cell: GridCell) => void;
  onClose: () => void;
}> = ({ cell, marketId, onUpdate, onClose }) => {
  const [shelves, setShelves] = useState<Shelf[]>(() => {
    const existing = cell.shelves || [];
    if (existing.length > 0) return existing;
    return Array.from({ length: SHELF_COUNT_DEFAULT }, (_, i) => ({ shelfNum: i + 1, products: [] }));
  });
  const [shelfCount, setShelfCount] = useState(shelves.length);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingTo, setAddingTo] = useState<{ shelfNum: number; position: number } | null>(null);

  // Persist shelves up whenever they change
  useEffect(() => {
    onUpdate({ ...cell, shelves });
  }, [shelves]); // eslint-disable-line

  // Resize shelves when count changes
  useEffect(() => {
    setShelves(prev => {
      if (shelfCount > prev.length) {
        return [...prev, ...Array.from({ length: shelfCount - prev.length }, (_, i) => ({
          shelfNum: prev.length + i + 1, products: [],
        }))];
      }
      return prev.slice(0, shelfCount);
    });
  }, [shelfCount]);

  const searchProducts = async (q: string) => {
    if (!q.trim() || !marketId) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const data = await marketService.getProductPerformance(marketId, 0, 12, undefined, q);
      setSearchResults(data?.content || []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  useEffect(() => {
    const t = setTimeout(() => searchProducts(searchQ), 400);
    return () => clearTimeout(t);
  }, [searchQ]); // eslint-disable-line

  const addProduct = (shelfNum: number, position: number, product: any) => {
    setShelves(prev => prev.map(s => {
      if (s.shelfNum !== shelfNum) return s;
      const withoutPos = s.products.filter(p => p.position !== position);
      return {
        ...s, products: [...withoutPos, {
          productId: product.productId,
          name: product.name,
          imageUrl: product.imageUrl || null,
          position,
        }].sort((a, b) => a.position - b.position),
      };
    }));
    setAddingTo(null);
    setSearchQ('');
    setSearchResults([]);
  };

  const removeProduct = (shelfNum: number, position: number) => {
    setShelves(prev => prev.map(s =>
      s.shelfNum !== shelfNum ? s : { ...s, products: s.products.filter(p => p.position !== position) }
    ));
  };

  const SLOTS_PER_SHELF = 5;

  return (
    <div className="flex h-full flex-col" style={{ width: 380 }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--border-soft)', background: cell.color || '#f1f5f9' }}>
        <div>
          <p className="text-sm font-bold" style={{ color: contrastText(cell.color || '#f1f5f9') }}>
            Gôndola {cell.gondolaNum ?? '?'}
          </p>
          <p className="text-xs" style={{ color: contrastText(cell.color || '#f1f5f9'), opacity: 0.75 }}>
            {cell.sectionName || 'Sem seção'} · {shelfCount} prateleiras
          </p>
        </div>
        <button type="button" onClick={onClose}
          className="rounded-lg p-1.5 transition hover:bg-black/10">
          <X className="h-4 w-4" style={{ color: contrastText(cell.color || '#f1f5f9') }} />
        </button>
      </div>

      {/* Shelf count control */}
      <div className="flex items-center gap-3 border-b px-4 py-2.5"
        style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-soft)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Prateleiras</span>
        <div className="flex items-center gap-1 rounded-lg" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
          <button type="button" onClick={() => setShelfCount(s => Math.max(1, s - 1))}
            className="px-2 py-1" style={{ color: 'var(--text-muted)' }}><Minus className="h-3 w-3" /></button>
          <span className="min-w-[1.5ch] text-center text-xs font-bold">{shelfCount}</span>
          <button type="button" onClick={() => setShelfCount(s => Math.min(8, s + 1))}
            className="px-2 py-1" style={{ color: 'var(--text-muted)' }}><Plus className="h-3 w-3" /></button>
        </div>
        <span className="text-[10px]" style={{ color: 'var(--text-soft)' }}>Clique + para adicionar produto</span>
      </div>

      {/* Search (only visible when addingTo is set) */}
      {addingTo && (
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-success)' }}>
          <p className="mb-2 text-[11px] font-semibold" style={{ color: 'var(--brand-700)' }}>
            Adicionando na prateleira {addingTo.shelfNum}, posição {addingTo.position + 1}
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--text-soft)' }} />
            <input
              autoFocus
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Buscar produto..."
              className="h-8 w-full rounded-lg pl-8 pr-3 text-xs outline-none"
              style={{ border: '1px solid var(--border-strong)', background: '#fff', color: '#1e293b' }}
            />
          </div>
          {searching && <p className="mt-1.5 text-[10px]" style={{ color: 'var(--text-soft)' }}>Buscando...</p>}
          {searchResults.length > 0 && (
            <div className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
              {searchResults.map(p => (
                <button key={p.productId} type="button"
                  onClick={() => addProduct(addingTo.shelfNum, addingTo.position, p)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white"
                  style={{ border: '1px solid var(--border-soft)' }}>
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="h-7 w-7 object-contain rounded" />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded" style={{ background: '#e2e8f0' }}>
                      <Package className="h-3.5 w-3.5" style={{ color: '#94a3b8' }} />
                    </div>
                  )}
                  <span className="flex-1 truncate text-[11px] font-medium" style={{ color: '#1e293b' }}>{p.name}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => { setAddingTo(null); setSearchQ(''); setSearchResults([]); }}
            className="mt-2 text-[10px] underline" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
        </div>
      )}

      {/* Gondola visual — shelves top to bottom */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Gondola frame */}
        <div className="rounded-lg overflow-hidden"
          style={{ border: '2px solid #cbd5e1', background: '#f8fafc' }}>
          {/* Top cap */}
          <div className="h-2.5 w-full" style={{ background: 'linear-gradient(to bottom, #e2e8f0, #cbd5e1)' }} />

          {shelves.map((shelf) => (
            <div key={shelf.shelfNum}>
              {/* Products row */}
              <div className="flex items-end gap-2 px-3 py-2" style={{ minHeight: 80 }}>
                <span className="shrink-0 text-[9px] font-bold" style={{ color: '#94a3b8', width: 12 }}>
                  P{shelf.shelfNum}
                </span>
                <div className="flex flex-1 gap-2 flex-wrap">
                  {Array.from({ length: SLOTS_PER_SHELF }, (_, pos) => {
                    const prod = shelf.products.find(p => p.position === pos);
                    return (
                      <ProductSlot
                        key={pos}
                        product={prod}
                        onAdd={() => setAddingTo({ shelfNum: shelf.shelfNum, position: pos })}
                        onRemove={() => removeProduct(shelf.shelfNum, pos)}
                      />
                    );
                  })}
                </div>
              </div>
              {/* Shelf plank */}
              <div className="h-2.5 w-full" style={{ background: 'linear-gradient(to bottom, #e2e8f0, #cbd5e1)' }} />
            </div>
          ))}

          {/* Base */}
          <div className="h-3 w-full" style={{ background: 'linear-gradient(to bottom, #94a3b8, #64748b)' }} />
        </div>
      </div>
    </div>
  );
};

// ── Section Edit Form ─────────────────────────────────────────────────────
interface SectionFormValues {
  sectionName: string;
  categorySlug: string;
  color: string;
}

const SectionForm: React.FC<{
  initial: SectionFormValues;
  onConfirm: (v: SectionFormValues) => void;
  onCancel: () => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}> = ({ initial, onConfirm, onCancel, onClear, inputRef }) => {
  const [name, setName] = useState(initial.sectionName);
  const [slug, setSlug] = useState(initial.categorySlug);
  const [color, setColor] = useState(initial.color || PRESET_COLORS[0]);

  return (
    /* Full-screen overlay so the form floats above the grid regardless of cell position */
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}>
      <div className="rounded-xl p-4 shadow-2xl"
        style={{ width: 280, background: '#fff', border: '1.5px solid var(--brand-500)' }}
        onClick={e => e.stopPropagation()}>
        <p className="mb-3 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Editar seção</p>
        <input ref={inputRef} value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onConfirm({ sectionName: name, categorySlug: slug, color }); if (e.key === 'Escape') onCancel(); }}
          placeholder="Nome da seção (ex: Bebidas)"
          className="mb-2 h-8 w-full rounded px-2 text-xs outline-none"
          style={{ border: '1px solid var(--border-strong)', color: '#1e293b', background: '#f8fafc' }} />
        <input value={slug} onChange={e => setSlug(e.target.value)}
          placeholder="Categoria (ex: bebidas)"
          className="mb-2 h-8 w-full rounded px-2 text-[11px] outline-none"
          style={{ border: '1px solid var(--border-strong)', color: '#64748b', background: '#f8fafc' }} />
        <div className="mb-3">
          <p className="mb-1.5 text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>Cor</p>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => onConfirm({ sectionName: name, categorySlug: slug, color })}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold"
            style={{ background: 'var(--brand-500)', color: '#fff' }}>
            <Check className="h-3 w-3" /> Salvar
          </button>
          <button type="button" onClick={onClear}
            className="rounded-lg px-2 py-1.5 text-xs"
            style={{ border: '1px solid #fecaca', color: '#ef4444', background: '#fff1f2' }}>
            Limpar
          </button>
          <button type="button" onClick={onCancel}
            className="rounded-lg px-2 py-1.5 text-xs"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--text-muted)' }}>
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   MAIN SCREEN
══════════════════════════════════════════════════════════════════════════ */

const StoreMap: React.FC = () => {
  const { marketId } = useAuth();

  const [gridCols, setGridCols] = useState(6);
  const [gridRows, setGridRows] = useState(6);
  const [cells, setCells] = useState<GridCell[]>([]);
  const [heatmap, setHeatmap] = useState<CategoryHeat[]>([]);
  const [insights, setInsights] = useState<NeighborInsight[]>([]);
  const [showHeat, setShowHeat] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadingHeat, setLoadingHeat] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Editing
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Gondola panel
  const [openGondola, setOpenGondola] = useState<GridCell | null>(null);

  // ── Load layout ──
  useEffect(() => {
    if (!marketId) return;
    layoutApi.get(marketId).then((d: any) => {
      setGridCols(d.gridCols || 6);
      setGridRows(d.gridRows || 6);
      const loaded: GridCell[] = (d.cells || []).map((c: any) => ({
        ...c,
        shelves: c.shelves || [],
      }));
      setCells(loaded);
      // Sync gondola counter
      const maxNum = loaded.reduce((m: number, c: GridCell) => Math.max(m, c.gondolaNum || 0), 0);
      _gondolaCounter = maxNum;
    }).catch(() => {});
  }, [marketId]);

  // ── Load heatmap ──
  useEffect(() => {
    if (!marketId) return;
    setLoadingHeat(true);
    layoutApi.heatmap(marketId).then((d: any) => setHeatmap(d || [])).catch(() => {}).finally(() => setLoadingHeat(false));
  }, [marketId]);

  // ── Neighbor insights (debounced on cell changes) ──
  useEffect(() => {
    if (!marketId || cells.filter(c => c.type === 'gondola').length < 2) { setInsights([]); return; }
    const t = setTimeout(() => {
      setLoadingInsights(true);
      layoutApi.neighborInsights(marketId, { cells, gridCols })
        .then((d: any) => setInsights(d || []))
        .catch(() => {})
        .finally(() => setLoadingInsights(false));
    }, 1000);
    return () => clearTimeout(t);
  }, [marketId, cells, gridCols]);

  // ── Focus form input ──
  useEffect(() => {
    if (editingCell) setTimeout(() => editInputRef.current?.focus(), 60);
  }, [editingCell]);

  // ── Helpers ──
  const getCell = useCallback((row: number, col: number) =>
    cells.find(c => c.row === row && c.col === col) ?? null, [cells]);

  const heatBySlug = useMemo(() => {
    const m: Record<string, CategoryHeat> = {};
    heatmap.forEach(h => { m[h.category.toLowerCase()] = h; });
    return m;
  }, [heatmap]);

  const gondolaCount = useMemo(() => cells.filter(c => c.type === 'gondola').length, [cells]);

  // ── Cell click ──
  const handleCellClick = (row: number, col: number) => {
    const cell = getCell(row, col);
    // If it's a gondola with products, open panel
    if (cell?.type === 'gondola' && openGondola?.row !== row) {
      setOpenGondola(cell);
      return;
    }
    // Otherwise open edit form
    setOpenGondola(null);
    setEditingCell({ row, col });
  };

  const handleAisleToggle = (row: number, col: number) => {
    const cell = getCell(row, col);
    if (cell?.type === 'aisle') {
      setCells(prev => prev.filter(c => !(c.row === row && c.col === col)));
    } else if (!cell || cell.type === 'empty') {
      setCells(prev => {
        const without = prev.filter(c => !(c.row === row && c.col === col));
        return [...without, { row, col, type: 'aisle' }];
      });
    }
    setDirty(true);
  };

  const confirmSectionEdit = (values: SectionFormValues) => {
    if (!editingCell) return;
    const { row, col } = editingCell;
    const existing = getCell(row, col);
    if (!values.sectionName.trim()) {
      setCells(prev => prev.filter(c => !(c.row === row && c.col === col)));
    } else {
      const gondolaId = existing?.gondolaId || nextGondolaId();
      const gondolaNum = existing?.gondolaNum || _gondolaCounter;
      setCells(prev => {
        const without = prev.filter(c => !(c.row === row && c.col === col));
        return [...without, {
          row, col, type: 'gondola',
          gondolaId, gondolaNum,
          sectionName: values.sectionName.trim(),
          categorySlug: values.categorySlug.trim().toLowerCase(),
          color: values.color,
          shelves: existing?.shelves || [],
        }];
      });
    }
    setEditingCell(null);
    setDirty(true);
  };

  const clearCell = (row: number, col: number) => {
    setCells(prev => prev.filter(c => !(c.row === row && c.col === col)));
    setEditingCell(null);
    if (openGondola?.row === row && openGondola?.col === col) setOpenGondola(null);
    setDirty(true);
  };

  const updateGondolaCell = useCallback((updated: GridCell) => {
    setCells(prev => {
      const without = prev.filter(c => !(c.row === updated.row && c.col === updated.col));
      return [...without, updated];
    });
    setOpenGondola(updated);
    setDirty(true);
  }, []);

  const resizeGrid = (newCols: number, newRows: number) => {
    setGridCols(newCols);
    setGridRows(newRows);
    setCells(prev => prev.filter(c => c.row < newRows && c.col < newCols));
    setDirty(true);
  };

  const save = async () => {
    if (!marketId) return;
    setSaving(true);
    try {
      await layoutApi.save(marketId, { gridCols, gridRows, cells });
      setDirty(false);
    } finally { setSaving(false); }
  };

  const adjacentInsights = useMemo(() => insights.filter(i => i.adjacency === 'adjacent').slice(0, 5), [insights]);
  const farInsights = useMemo(() => insights.filter(i => i.adjacency === 'far' && i.lift >= 1.5).slice(0, 5), [insights]);

  const editingInitial = useMemo(() => {
    if (!editingCell) return { sectionName: '', categorySlug: '', color: PRESET_COLORS[0] };
    const cell = getCell(editingCell.row, editingCell.col);
    if (!cell || cell.type !== 'gondola') return { sectionName: '', categorySlug: '', color: PRESET_COLORS[0] };
    return { sectionName: cell.sectionName || '', categorySlug: cell.categorySlug || '', color: cell.color || PRESET_COLORS[0] };
  }, [editingCell, cells]); // eslint-disable-line

  /* ── Render ───────────────────────────────────────────────────────────── */

  return (
    <Layout>
      {/* Section edit form — rendered as fixed overlay, above everything */}
      {editingCell && (
        <SectionForm
          initial={editingInitial}
          inputRef={editInputRef}
          onConfirm={confirmSectionEdit}
          onCancel={() => setEditingCell(null)}
          onClear={() => clearCell(editingCell.row, editingCell.col)}
        />
      )}
      <div className="flex flex-col gap-4">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Mapa da loja</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {gondolaCount} gôndola{gondolaCount !== 1 ? 's' : ''} mapeada{gondolaCount !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-strong)' }}>
              {([['map', Map, 'Mapa'], ['analysis', TrendingUp, 'Análise']] as const).map(([m, Icon, label]) => (
                <button key={m} type="button" onClick={() => setViewMode(m as ViewMode)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition"
                  style={viewMode === m
                    ? { background: 'var(--brand-500)', color: '#fff' }
                    : { background: 'var(--surface-base)', color: 'var(--text-muted)' }}>
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>
            {viewMode === 'map' && (
              <button type="button" onClick={() => setShowHeat(v => !v)}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition"
                style={showHeat
                  ? { borderColor: 'var(--brand-500)', background: 'var(--surface-success)', color: 'var(--brand-700)' }
                  : { borderColor: 'var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
                <Eye className="h-3.5 w-3.5" /> Calor
              </button>
            )}
            <button type="button" onClick={save} disabled={saving || !dirty}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40"
              style={{ background: dirty ? 'var(--brand-500)' : 'var(--surface-soft)', color: dirty ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border-strong)' }}>
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {dirty ? 'Salvar' : 'Salvo'}
            </button>
          </div>
        </div>

        {/* ── MAP VIEW ─────────────────────────────────────────────────── */}
        {viewMode === 'map' && (
          <div className="flex gap-4 items-start">

            {/* Grid area */}
            <div className="flex-1 min-w-0">
              {/* Grid controls */}
              <div className="mb-3 flex flex-wrap items-center gap-4">
                {[['Corredores (col)', gridCols, (v: number) => resizeGrid(v, gridRows), 2, 10],
                  ['Linhas', gridRows, (v: number) => resizeGrid(gridCols, v), 2, 12]
                ].map(([label, val, setter, min, max]) => (
                  <div key={label as string} className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label as string}</span>
                    <div className="flex items-center rounded-lg" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
                      <button type="button" onClick={() => (setter as Function)(Math.max(min as number, (val as number) - 1))} className="px-2 py-1.5" style={{ color: 'var(--text-muted)' }}><Minus className="h-3 w-3" /></button>
                      <span className="min-w-[1.5ch] text-center text-xs font-bold px-1" style={{ color: 'var(--text-primary)' }}>{val as number}</span>
                      <button type="button" onClick={() => (setter as Function)(Math.min(max as number, (val as number) + 1))} className="px-2 py-1.5" style={{ color: 'var(--text-muted)' }}><Plus className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
                <span className="text-[11px]" style={{ color: 'var(--text-soft)' }}>
                  Clique: editar seção · Alt+clique: marcar corredor
                </span>
              </div>

              {/* Legend */}
              <div className="mb-2 flex items-center gap-4 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-5 rounded" style={{ background: '#dbeafe', border: '1px solid #bfdbfe' }} /> Seção
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-5 rounded" style={{ background: 'repeating-linear-gradient(45deg, #f1f5f9 0px, #f1f5f9 4px, #e2e8f0 4px, #e2e8f0 8px)' }} /> Corredor
                </span>
                {showHeat && <>
                  {(['hot','warm','cold'] as const).map(h => {
                    const s = heatStyle(h === 'hot' ? 80 : h === 'warm' ? 50 : 15);
                    return <span key={h} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: s.bar }} />{s.label}</span>;
                  })}
                </>}
              </div>

              {/* THE GRID */}
              <div className="overflow-auto rounded-xl" style={{ border: '1px solid var(--border-soft)' }}>
                <div className="flex items-center justify-center border-b py-1.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ borderColor: 'var(--border-soft)', color: 'var(--brand-600)', background: 'var(--surface-success)' }}>
                  ENTRADA
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${gridCols}, minmax(100px, 1fr))`,
                  gap: 3,
                  padding: 3,
                  background: 'var(--surface-soft)',
                }}>
                  {Array.from({ length: gridRows }, (_, row) =>
                    Array.from({ length: gridCols }, (_, col) => {
                      const cell = getCell(row, col);
                      const isEditing = editingCell?.row === row && editingCell?.col === col;
                      const isOpen = openGondola?.row === row && openGondola?.col === col;
                      const isAisle = cell?.type === 'aisle';
                      const slug = cell?.categorySlug ?? '';
                      const heat = showHeat && slug ? heatBySlug[slug] : null;
                      const cellColor = heat ? heatStyle(heat.score).bg : (cell?.color ?? '');
                      const tColor = cell?.color ? contrastText(cellColor || '#f1f5f9') : 'var(--text-muted)';
                      const productCount = cell?.shelves?.reduce((n, s) => n + s.products.length, 0) ?? 0;

                      return (
                        <div key={`${row}-${col}`}
                          onClick={e => {
                            if (e.altKey) { handleAisleToggle(row, col); return; }
                            handleCellClick(row, col);
                          }}
                          className="relative flex min-h-[80px] cursor-pointer flex-col items-center justify-center rounded-lg transition hover:brightness-95"
                          style={isAisle ? {
                            background: 'repeating-linear-gradient(45deg, #f1f5f9 0px, #f1f5f9 4px, #e2e8f0 4px, #e2e8f0 8px)',
                            border: '1px dashed #94a3b8',
                            cursor: 'pointer',
                          } : {
                            background: cellColor || 'var(--surface-base)',
                            border: isOpen ? '2px solid var(--brand-500)' : isEditing ? '2px solid #6366f1' : '1px solid var(--border-soft)',
                            boxShadow: isOpen ? '0 0 0 3px rgba(34,197,94,0.15)' : undefined,
                          }}>

                          {isAisle ? (
                            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>
                              corredor
                            </span>
                          ) : cell?.type === 'gondola' ? (
                            <>
                              <span className="absolute left-1.5 top-1 text-[9px] font-bold" style={{ color: tColor, opacity: 0.6 }}>
                                G{cell.gondolaNum}
                              </span>
                              {/* Open gondola indicator */}
                              {isOpen && (
                                <span className="absolute right-1 top-1 flex h-3 w-3 items-center justify-center rounded-full"
                                  style={{ background: 'var(--brand-500)' }}>
                                  <ChevronRight className="h-2 w-2 text-white" />
                                </span>
                              )}
                              <span className="px-2 text-center text-xs font-bold leading-tight" style={{ color: tColor }}>
                                {cell.sectionName}
                              </span>
                              {cell.categorySlug && (
                                <span className="mt-0.5 text-[9px]" style={{ color: tColor, opacity: 0.65 }}>{cell.categorySlug}</span>
                              )}
                              {productCount > 0 && (
                                <span className="absolute bottom-1 right-1.5 flex items-center gap-0.5 text-[8px] font-bold"
                                  style={{ color: tColor, opacity: 0.7 }}>
                                  <Layers className="h-2.5 w-2.5" />{productCount}
                                </span>
                              )}
                              {showHeat && heat && (
                                <div className="absolute bottom-1 left-2 right-2">
                                  <div className="h-1 overflow-hidden rounded-full" style={{ background: 'rgba(0,0,0,0.15)' }}>
                                    <div className="h-full rounded-full" style={{ width: `${heat.score}%`, background: heatStyle(heat.score).bar }} />
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5 opacity-25">
                              <Plus className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>seção</span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex items-center justify-center border-t py-1.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ borderColor: 'var(--border-soft)', color: 'var(--text-soft)', background: 'var(--surface-soft)' }}>
                  SAÍDA / CAIXAS
                </div>
              </div>
            </div>

            {/* Gondola panel (right drawer) */}
            {openGondola && (
              <div className="shrink-0 overflow-hidden rounded-xl"
                style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)', width: 380, maxHeight: '80vh', overflowY: 'auto' }}>
                <GondolaPanel
                  cell={openGondola}
                  marketId={marketId!}
                  onUpdate={updateGondolaCell}
                  onClose={() => setOpenGondola(null)}
                />
              </div>
            )}
          </div>
        )}

        {/* ── ANALYSIS VIEW ────────────────────────────────────────────── */}
        {viewMode === 'analysis' && (
          <div className="grid gap-4 lg:grid-cols-2">

            {/* Category heatmap */}
            <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Calor por categoria</h3>
                <span className="text-[10px]" style={{ color: 'var(--text-soft)' }}>últimos 30 dias</span>
              </div>
              {loadingHeat ? (
                <div className="flex justify-center py-6"><div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>
              ) : heatmap.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum dado disponível.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {heatmap.slice(0, 12).map((h, i) => {
                    const hs = heatStyle(h.score);
                    return (
                      <div key={h.category} className="flex items-center gap-2">
                        <span className="w-4 text-[10px] font-bold text-right" style={{ color: 'var(--text-soft)' }}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{h.category}</span>
                            <span className="ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                              style={{ background: hs.bg, color: hs.text }}>{hs.label}</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                            <div className="h-full rounded-full" style={{ width: `${h.score}%`, background: hs.bar }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Neighbor insights */}
            <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <div className="mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Vizinhança inteligente</h3>
              </div>

              {loadingInsights && <div className="flex justify-center py-4"><div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" /></div>}

              {!loadingInsights && cells.filter(c => c.type === 'gondola').length < 2 && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Preencha pelo menos 2 seções no mapa para ver insights de vizinhança.
                </p>
              )}

              {adjacentInsights.length > 0 && (
                <div className="mb-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#15803d' }}>Vizinhos que vendem juntos</p>
                  {adjacentInsights.map((ins, i) => (
                    <div key={i} className="mb-2 rounded-lg p-2.5" style={{ background: '#dcfce7', border: '1px solid #bbf7d0' }}>
                      <p className="text-xs font-semibold" style={{ color: '#15803d' }}>
                        {ins.antecedentCategory} + {ins.consequentCategory}
                      </p>
                      <p className="mt-0.5 text-[10px]" style={{ color: '#166534' }}>
                        {Math.round(ins.confidence * 100)}% das cestas levam os dois · afinidade {ins.lift.toFixed(1)}x
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {farInsights.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#c2410c' }}>Oportunidades de aproximar</p>
                  {farInsights.map((ins, i) => (
                    <div key={i} className="mb-2 rounded-lg p-2.5" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold" style={{ color: '#c2410c' }}>{ins.antecedentCategory}</span>
                        <ArrowRight className="h-3 w-3 shrink-0" style={{ color: '#f97316' }} />
                        <span className="text-xs font-semibold" style={{ color: '#c2410c' }}>{ins.consequentCategory}</span>
                      </div>
                      <p className="mt-0.5 text-[10px]" style={{ color: '#9a3412' }}>
                        {ins.pairCount} cestas · lift {ins.lift.toFixed(1)}x · estão longe no mapa
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {!loadingInsights && insights.length > 0 && insights.some(i => i.adjacency === 'unmapped') && (
                <div className="mt-2 flex items-start gap-1.5 rounded-lg p-2.5" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-soft)' }}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Preencha o campo "categoria" nas seções para mapear mais pares.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default StoreMap;
