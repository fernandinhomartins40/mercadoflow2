import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Save, RefreshCw, Plus, Minus, TrendingUp,
  Lightbulb, X, Check, AlertTriangle, ArrowRight,
} from 'lucide-react';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface GridCell {
  row: number;
  col: number;
  sectionName: string;
  categorySlug: string; // matches product.category (lowercase)
  color: string;
}

interface CategoryHeat {
  category: string;
  revenue: number;
  quantity: number;
  transactions: number;
  score: number; // 0–100
  heat: 'hot' | 'warm' | 'cold';
}

interface NeighborInsight {
  antecedentName: string;
  consequentName: string;
  antecedentCategory: string;
  consequentCategory: string;
  confidence: number;
  lift: number;
  pairCount: number;
  adjacency: 'adjacent' | 'far' | 'unmapped';
  posA: [number, number] | null;
  posB: [number, number] | null;
}

/* ── Palette for sections ────────────────────────────────────────────────── */

const SECTION_COLORS = [
  '#dbeafe', '#dcfce7', '#fef9c3', '#fce7f3', '#ede9fe',
  '#ffedd5', '#f1f5f9', '#cffafe', '#d1fae5', '#fef3c7',
];
const SECTION_TEXT_COLORS = [
  '#1e40af', '#166534', '#854d0e', '#9d174d', '#5b21b6',
  '#c2410c', '#475569', '#0e7490', '#065f46', '#92400e',
];

/* ── Heat styling ────────────────────────────────────────────────────────── */

function heatStyle(score: number): { bg: string; text: string; bar: string; label: string } {
  if (score >= 66) return { bg: '#dcfce7', text: '#15803d', bar: '#22c55e', label: 'Alta venda' };
  if (score >= 33) return { bg: '#fef9c3', text: '#854d0e', bar: '#f59e0b', label: 'Venda média' };
  return { bg: '#fee2e2', text: '#991b1b', bar: '#ef4444', label: 'Baixa venda' };
}

/* ── API helpers ─────────────────────────────────────────────────────────── */

const storeLayoutApi = {
  get: (marketId: string) => api.get(`/v1/markets/${marketId}/store-layout`).then(r => r.data),
  save: (marketId: string, payload: object) => api.put(`/v1/markets/${marketId}/store-layout`, payload).then(r => r.data),
  heatmap: (marketId: string) => api.get(`/v1/markets/${marketId}/store-layout/heatmap`).then(r => r.data),
  neighborInsights: (marketId: string, payload: object) =>
    api.post(`/v1/markets/${marketId}/store-layout/neighbor-insights`, payload).then(r => r.data),
};

/* ── Subcomponents ───────────────────────────────────────────────────────── */

const HeatLegend: React.FC = () => (
  <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
    {(['hot', 'warm', 'cold'] as const).map((h) => {
      const s = heatStyle(h === 'hot' ? 80 : h === 'warm' ? 50 : 20);
      return (
        <span key={h} className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.bar }} />
          {s.label}
        </span>
      );
    })}
  </div>
);

/* ── Main component ──────────────────────────────────────────────────────── */

const StoreMap: React.FC = () => {
  const { marketId } = useAuth();

  const [gridCols, setGridCols] = useState(4);
  const [gridRows, setGridRows] = useState(5);
  const [cells, setCells] = useState<GridCell[]>([]);
  const [heatmap, setHeatmap] = useState<CategoryHeat[]>([]);
  const [insights, setInsights] = useState<NeighborInsight[]>([]);
  const [showHeat, setShowHeat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingHeat, setLoadingHeat] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Editing state
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editColor, setEditColor] = useState(SECTION_COLORS[0]);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Load layout
  useEffect(() => {
    if (!marketId) return;
    storeLayoutApi.get(marketId).then((data: any) => {
      setGridCols(data.gridCols || 4);
      setGridRows(data.gridRows || 5);
      setCells(data.cells || []);
    }).catch(() => {});
  }, [marketId]);

  // Load heatmap
  useEffect(() => {
    if (!marketId) return;
    setLoadingHeat(true);
    storeLayoutApi.heatmap(marketId)
      .then((data: any) => setHeatmap(data || []))
      .catch(() => {})
      .finally(() => setLoadingHeat(false));
  }, [marketId]);

  // Load neighbor insights when cells change (debounced)
  useEffect(() => {
    if (!marketId || cells.length === 0) { setInsights([]); return; }
    const t = setTimeout(() => {
      setLoadingInsights(true);
      storeLayoutApi.neighborInsights(marketId, { cells, gridCols })
        .then((data: any) => setInsights(data || []))
        .catch(() => {})
        .finally(() => setLoadingInsights(false));
    }, 800);
    return () => clearTimeout(t);
  }, [marketId, cells, gridCols]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell) setTimeout(() => editInputRef.current?.focus(), 50);
  }, [editingCell]);

  // Heat score lookup
  const heatBySlug = useMemo(() => {
    const m: Record<string, CategoryHeat> = {};
    heatmap.forEach(h => { m[h.category.toLowerCase()] = h; });
    return m;
  }, [heatmap]);

  const getCell = useCallback((row: number, col: number) =>
    cells.find(c => c.row === row && c.col === col) ?? null,
  [cells]);

  const startEdit = (row: number, col: number) => {
    const cell = getCell(row, col);
    setEditingCell({ row, col });
    setEditName(cell?.sectionName ?? '');
    setEditSlug(cell?.categorySlug ?? '');
    const usedColors = cells.map(c => c.color);
    const free = SECTION_COLORS.find(c => !usedColors.includes(c)) ?? SECTION_COLORS[0];
    setEditColor(cell?.color ?? free);
  };

  const confirmEdit = () => {
    if (!editingCell) return;
    const { row, col } = editingCell;
    if (!editName.trim()) {
      // Clear the cell
      setCells(prev => prev.filter(c => !(c.row === row && c.col === col)));
    } else {
      setCells(prev => {
        const without = prev.filter(c => !(c.row === row && c.col === col));
        return [...without, { row, col, sectionName: editName.trim(), categorySlug: editSlug.trim().toLowerCase(), color: editColor }];
      });
    }
    setEditingCell(null);
    setDirty(true);
  };

  const clearCell = (row: number, col: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCells(prev => prev.filter(c => !(c.row === row && c.col === col)));
    setDirty(true);
  };

  const save = async () => {
    if (!marketId) return;
    setSaving(true);
    try {
      await storeLayoutApi.save(marketId, { gridCols, gridRows, cells });
      setDirty(false);
    } finally { setSaving(false); }
  };

  const resizeGrid = (newCols: number, newRows: number) => {
    setGridCols(newCols);
    setGridRows(newRows);
    setCells(prev => prev.filter(c => c.row < newRows && c.col < newCols));
    setDirty(true);
  };

  // Insights split by adjacency
  const adjacentInsights = useMemo(() =>
    insights.filter(i => i.adjacency === 'adjacent').slice(0, 6),
  [insights]);
  const farInsights = useMemo(() =>
    insights.filter(i => i.adjacency === 'far' && i.lift >= 1.5).slice(0, 6),
  [insights]);

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <Layout>
      <div className="flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Mapa da loja</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Monte o layout de seções e descubra quais vizinhanças impulsionam vendas
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showHeat && <HeatLegend />}
            <button type="button" onClick={() => setShowHeat(v => !v)}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition"
              style={showHeat
                ? { borderColor: 'var(--brand-500)', background: 'var(--surface-success)', color: 'var(--brand-700)' }
                : { borderColor: 'var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
              <TrendingUp className="h-3.5 w-3.5" />
              {showHeat ? 'Ocultar calor' : 'Ver calor de vendas'}
            </button>
            <button type="button" onClick={save} disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition disabled:opacity-40"
              style={{ background: 'var(--brand-500)', color: '#fff' }}>
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {dirty ? 'Salvar' : 'Salvo'}
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          {/* Left: grid + controls */}
          <div className="flex flex-col gap-4">

            {/* Grid size controls */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Colunas</span>
                <div className="flex items-center gap-1 rounded-lg" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
                  <button type="button" onClick={() => resizeGrid(Math.max(2, gridCols - 1), gridRows)} className="px-2 py-1.5" style={{ color: 'var(--text-muted)' }}><Minus className="h-3.5 w-3.5" /></button>
                  <span className="min-w-[1.5ch] text-center text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{gridCols}</span>
                  <button type="button" onClick={() => resizeGrid(Math.min(8, gridCols + 1), gridRows)} className="px-2 py-1.5" style={{ color: 'var(--text-muted)' }}><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Linhas</span>
                <div className="flex items-center gap-1 rounded-lg" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
                  <button type="button" onClick={() => resizeGrid(gridCols, Math.max(2, gridRows - 1))} className="px-2 py-1.5" style={{ color: 'var(--text-muted)' }}><Minus className="h-3.5 w-3.5" /></button>
                  <span className="min-w-[1.5ch] text-center text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{gridRows}</span>
                  <button type="button" onClick={() => resizeGrid(gridCols, Math.min(10, gridRows + 1))} className="px-2 py-1.5" style={{ color: 'var(--text-muted)' }}><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <span className="text-xs" style={{ color: 'var(--text-soft)' }}>
                Clique em qualquer célula para nomear uma seção
              </span>
            </div>

            {/* The grid */}
            <div className="overflow-auto rounded-xl" style={{ border: '1px solid var(--border-soft)' }}>
              {/* Entrance label */}
              <div className="flex items-center justify-center border-b py-1.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ borderColor: 'var(--border-soft)', color: 'var(--brand-600)', background: 'var(--surface-success)' }}>
                Entrada
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gridCols}, minmax(120px, 1fr))`,
                background: 'var(--surface-soft)',
                gap: 2,
                padding: 2,
              }}>
                {Array.from({ length: gridRows }, (_, row) =>
                  Array.from({ length: gridCols }, (_, col) => {
                    const cell = getCell(row, col);
                    const slug = cell?.categorySlug ?? '';
                    const heat = slug ? heatBySlug[slug] : null;
                    const isEditing = editingCell?.row === row && editingCell?.col === col;

                    const colorIdx = cell ? SECTION_COLORS.indexOf(cell.color) : -1;
                    const textColor = colorIdx >= 0 ? SECTION_TEXT_COLORS[colorIdx] : 'var(--text-primary)';

                    const cellBg = showHeat && heat
                      ? heatStyle(heat.score).bg
                      : (cell?.color ?? 'var(--surface-base)');
                    const heatScore = showHeat && heat ? heat.score : null;

                    return (
                      <div key={`${row}-${col}`}
                        onClick={() => !isEditing && startEdit(row, col)}
                        className="relative flex min-h-[90px] cursor-pointer flex-col items-center justify-center rounded-lg transition hover:brightness-95"
                        style={{ background: cellBg, border: isEditing ? '2px solid var(--brand-500)' : '1px solid var(--border-soft)' }}>

                        {isEditing ? (
                          <div className="flex w-full flex-col gap-1.5 p-2" onClick={e => e.stopPropagation()}>
                            <input
                              ref={editInputRef}
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditingCell(null); }}
                              placeholder="Nome da seção"
                              className="w-full rounded px-2 py-1 text-xs outline-none"
                              style={{ border: '1px solid var(--border-strong)', background: '#fff', color: '#1e293b' }}
                            />
                            <input
                              value={editSlug}
                              onChange={e => setEditSlug(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditingCell(null); }}
                              placeholder="Categoria (ex: bebidas)"
                              className="w-full rounded px-2 py-1 text-[10px] outline-none"
                              style={{ border: '1px solid var(--border-strong)', background: '#fff', color: '#64748b' }}
                            />
                            <div className="flex gap-1 flex-wrap">
                              {SECTION_COLORS.map((c, i) => (
                                <button key={c} type="button" onClick={() => setEditColor(c)}
                                  className="h-5 w-5 rounded-full transition"
                                  style={{ background: c, border: editColor === c ? `2px solid ${SECTION_TEXT_COLORS[i]}` : '1px solid #cbd5e1' }} />
                              ))}
                            </div>
                            <div className="flex gap-1 mt-0.5">
                              <button type="button" onClick={confirmEdit}
                                className="flex flex-1 items-center justify-center gap-1 rounded py-1 text-[10px] font-semibold"
                                style={{ background: 'var(--brand-500)', color: '#fff' }}>
                                <Check className="h-3 w-3" /> OK
                              </button>
                              <button type="button" onClick={() => setEditingCell(null)}
                                className="flex items-center justify-center rounded px-2 py-1 text-[10px]"
                                style={{ border: '1px solid var(--border-strong)', color: 'var(--text-muted)' }}>
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ) : cell ? (
                          <>
                            {/* Clear button */}
                            <button type="button" onClick={e => clearCell(row, col, e)}
                              className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full opacity-0 transition group-hover:opacity-100 hover:opacity-100"
                              style={{ background: 'rgba(0,0,0,0.12)' }}>
                              <X className="h-2.5 w-2.5" style={{ color: textColor }} />
                            </button>
                            <span className="px-2 text-center text-xs font-bold leading-tight" style={{ color: textColor }}>
                              {cell.sectionName}
                            </span>
                            {cell.categorySlug && (
                              <span className="mt-0.5 text-[9px] font-medium opacity-60" style={{ color: textColor }}>
                                {cell.categorySlug}
                              </span>
                            )}
                            {/* Heat score bar */}
                            {showHeat && heat && (
                              <div className="absolute bottom-1.5 left-2 right-2">
                                <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: 'rgba(0,0,0,0.12)' }}>
                                  <div className="h-full rounded-full" style={{ width: `${heat.score}%`, background: heatStyle(heat.score).bar }} />
                                </div>
                              </div>
                            )}
                            {showHeat && heat && (
                              <span className="absolute left-1.5 top-1 text-[8px] font-bold" style={{ color: heatStyle(heat.score).text }}>
                                {heat.score}
                              </span>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5 opacity-30">
                            <Plus className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>seção</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Exit label */}
              <div className="flex items-center justify-center border-t py-1.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ borderColor: 'var(--border-soft)', color: 'var(--text-soft)', background: 'var(--surface-soft)' }}>
                Saída / Caixas
              </div>
            </div>
          </div>

          {/* Right: heatmap ranking + insights */}
          <div className="flex flex-col gap-4">

            {/* Category performance ranking */}
            <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Calor por categoria
                </h3>
                <span className="text-[10px]" style={{ color: 'var(--text-soft)' }}>últimos 30 dias</span>
              </div>
              {loadingHeat ? (
                <div className="flex justify-center py-4"><div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>
              ) : heatmap.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum dado disponível.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {heatmap.slice(0, 10).map((h, i) => {
                    const hs = heatStyle(h.score);
                    return (
                      <div key={h.category} className="flex items-center gap-2">
                        <span className="w-3 text-[10px] font-bold" style={{ color: 'var(--text-soft)' }}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{h.category}</span>
                            <span className="ml-1 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                              style={{ background: hs.bg, color: hs.text }}>{hs.label}</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${h.score}%`, background: hs.bar }} />
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
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Vizinhança inteligente
                </h3>
              </div>

              {loadingInsights && (
                <div className="flex justify-center py-3"><div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" /></div>
              )}

              {!loadingInsights && insights.length === 0 && cells.length < 2 && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Preencha pelo menos 2 seções com suas categorias para ver quais vizinhanças impulsionam vendas.
                </p>
              )}

              {/* Already adjacent — good news */}
              {adjacentInsights.length > 0 && (
                <div className="mb-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#15803d' }}>
                    Vizinhos que vendem juntos
                  </p>
                  {adjacentInsights.map((ins, i) => (
                    <div key={i} className="mb-2 rounded-lg p-2.5" style={{ background: '#dcfce7', border: '1px solid #bbf7d0' }}>
                      <p className="text-xs font-semibold" style={{ color: '#15803d' }}>
                        {ins.antecedentCategory} + {ins.consequentCategory}
                      </p>
                      <p className="mt-0.5 text-[10px]" style={{ color: '#166534' }}>
                        {Math.round(ins.confidence * 100)}% das cestas levam os dois — afinidade {ins.lift.toFixed(1)}x
                      </p>
                      <p className="mt-0.5 text-[10px] italic" style={{ color: '#166534' }}>
                        Crie um combo de preco ou ponta de gondola entre as duas secoes
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Far apart — opportunity */}
              {farInsights.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#c2410c' }}>
                    Oportunidades de aproximar
                  </p>
                  {farInsights.map((ins, i) => (
                    <div key={i} className="mb-2 rounded-lg p-2.5" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-semibold" style={{ color: '#c2410c' }}>
                          {ins.antecedentCategory}
                        </p>
                        <ArrowRight className="h-3 w-3 shrink-0 mt-0.5" style={{ color: '#f97316' }} />
                        <p className="text-xs font-semibold" style={{ color: '#c2410c' }}>
                          {ins.consequentCategory}
                        </p>
                      </div>
                      <p className="mt-0.5 text-[10px]" style={{ color: '#9a3412' }}>
                        {ins.pairCount} cestas juntos · lift {ins.lift.toFixed(1)}x · mas estao longe no mapa
                      </p>
                      <p className="mt-0.5 text-[10px] italic" style={{ color: '#9a3412' }}>
                        Aproximar pode aumentar a co-compra
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Unmapped tip */}
              {!loadingInsights && insights.length > 0 && insights.some(i => i.adjacency === 'unmapped') && (
                <div className="mt-2 rounded-lg p-2.5" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-soft)' }}>
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      Algumas categorias do seu historico de vendas ainda nao estao mapeadas. Preencha o campo "categoria" nas secoes para ver mais insights.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default StoreMap;
