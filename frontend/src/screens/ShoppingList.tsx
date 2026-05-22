import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/product/ProductImage';
import { useMarketData } from '../hooks/useMarketData';
import { useShoppingList } from '../hooks/useShoppingList';
import { useAuth } from '../context/AuthContext';
import { marketService } from '../services/market.service';
import {
  PurchasePriceHistory,
  ProductPerformance,
  ShoppingListItem,
  Supplier,
  SupplierOrder,
  SupplierOrderItem,
} from '../types/analytics.types';
import SupplierModal from '../components/suppliers/SupplierModal';
import {
  AlertTriangle,
  Ban,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Edit2,
  Minus,
  Package,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  X,
  ArrowRight,
} from 'lucide-react';

/* ─── Formatadores ─── */
const fmtMoney = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
const fmtDate = (v?: string | null) => {
  if (!v) return '--';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '--' : d.toLocaleDateString('pt-BR');
};
const fmtPct = (v?: number | null) => {
  const n = Number(v || 0);
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
};

const SOURCE_TAG_PT: Record<string, string> = {
  RESTOCK: 'Reposição', MANUAL: 'Manual', PROMO_CANDIDATE: 'Promo',
  SLOW_MOVER: 'Baixo giro', SEASONAL: 'Sazonal', PRODUTO: 'Produto', PRODUTOS: 'Produto',
};

const suggestedQuantity = (p: ProductPerformance) => {
  const v = Number(p.salesVelocity || 0);
  if (v >= 8) return 24; if (v >= 4) return 12; if (v >= 2) return 6; return 3;
};

const UNIT_TYPES = ['UN', 'CX', 'KG', 'DZ', 'FD', 'PC'];
const UNIT_LABELS: Record<string, string> = { UN: 'Unidade', CX: 'Caixa', KG: 'Kg', DZ: 'Dúzia', FD: 'Fardo', PC: 'Pacote' };

const STATUS_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  RASCUNHO:  { label: 'Rascunho',  bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' },
  ENVIADO:   { label: 'Enviado',   bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
  ENTREGUE:  { label: 'Entregue', bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' },
  CANCELADO: { label: 'Cancelado', bg: '#fef2f2', text: '#b91c1c', dot: '#f87171' },
};

/* ════════════════════════════════════════════════════════════════════
   ABA 1 — LISTA DE COMPRAS
════════════════════════════════════════════════════════════════════ */

const RecordPurchaseModal: React.FC<{ item: ShoppingListItem; marketId: string; onClose: () => void; onSaved: () => void }> = ({ item, marketId, onClose, onSaved }) => {
  const [unitCost, setUnitCost] = useState('');
  const [unitSalePrice, setUnitSalePrice] = useState('');
  const [qty, setQty] = useState(String(item.quantityTarget || 1));
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PurchasePriceHistory[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);
  const [showSupModal, setShowSupModal] = useState(false);

  useEffect(() => {
    marketService.getPurchaseHistory(marketId, item.productId)
      .then(setHistory).catch(() => setHistory([]))
      .finally(() => setLoadingHist(false));
  }, [marketId, item.productId]);

  const cost = parseFloat(unitCost.replace(',', '.')) || 0;
  const sale = parseFloat(unitSalePrice.replace(',', '.')) || 0;
  const margin = cost > 0 && sale > 0 ? ((sale - cost) / cost) * 100 : null;
  const lastEntry = history[0];
  const delta = lastEntry && cost > 0 ? ((cost - Number(lastEntry.unitCost)) / Number(lastEntry.unitCost)) * 100 : null;

  const handleSave = async () => {
    if (!cost || cost <= 0) { setError('Informe o custo unitário'); return; }
    setSaving(true); setError(null);
    try {
      await marketService.recordPurchase(marketId, {
        productId: item.productId, shoppingListItemId: item.id,
        quantityPurchased: parseFloat(qty) || 1, unitCost: cost,
        unitSalePrice: sale > 0 ? sale : undefined,
        supplierName: supplier.trim() || undefined, note: note.trim() || undefined,
      });
      onSaved(); onClose();
    } catch (e: any) { setError(e?.message || 'Erro ao registrar'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between gap-3 p-5" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-soft)' }}>
              <ProductImage src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-soft)' }}>Registrar compra avulsa</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition hover:opacity-70" style={{ color: 'var(--text-muted)' }}><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!loadingHist && lastEntry && (
            <div className="mx-5 mt-4 rounded-xl p-3" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Última compra — {fmtDate(lastEntry.purchasedAt)}</p>
              <div className="flex flex-wrap gap-4">
                <div><p className="text-[10px]" style={{ color: 'var(--text-soft)' }}>Custo</p><p className="text-sm font-bold">{fmtMoney(lastEntry.unitCost)}</p></div>
                {lastEntry.unitSalePrice && <div><p className="text-[10px]" style={{ color: 'var(--text-soft)' }}>Venda</p><p className="text-sm font-bold">{fmtMoney(lastEntry.unitSalePrice)}</p></div>}
                {lastEntry.marginPercent && <div><p className="text-[10px]" style={{ color: 'var(--text-soft)' }}>Margem</p><p className="text-sm font-bold" style={{ color: 'var(--brand-600)' }}>{Number(lastEntry.marginPercent).toFixed(1)}%</p></div>}
              </div>
              {lastEntry.supplierName && <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Fornecedor: {lastEntry.supplierName}</p>}
            </div>
          )}

          <div className="flex flex-col gap-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Custo unitário <span style={{ color: '#ef4444' }}>*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-soft)' }}>R$</span>
                  <input type="text" inputMode="decimal" placeholder="0,00" value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
                    className="h-10 w-full rounded-lg pl-8 pr-3 text-sm outline-none"
                    style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }} />
                </div>
                {delta !== null && cost > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold" style={{ color: delta > 1 ? '#dc2626' : delta < -1 ? '#16a34a' : 'var(--text-soft)' }}>
                    {delta > 1 ? <TrendingUp className="h-3 w-3" /> : delta < -1 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                    {delta > 0 ? '+' : ''}{delta.toFixed(1)}% vs. última
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Preço de venda</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-soft)' }}>R$</span>
                  <input type="text" inputMode="decimal" placeholder="0,00" value={unitSalePrice} onChange={(e) => setUnitSalePrice(e.target.value)}
                    className="h-10 w-full rounded-lg pl-8 pr-3 text-sm outline-none"
                    style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }} />
                </div>
                {margin !== null && <p className="mt-1 text-xs font-semibold" style={{ color: margin >= 20 ? '#16a34a' : margin >= 10 ? '#d97706' : '#dc2626' }}>Margem: {margin.toFixed(1)}%</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Qtd. comprada</label>
                <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)}
                  className="h-10 w-full rounded-lg px-3 text-sm outline-none"
                  style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Fornecedor</label>
                <div className="flex gap-2">
                  <div className="flex h-10 flex-1 min-w-0 items-center gap-2 rounded-lg px-3 cursor-pointer transition hover:opacity-80"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}
                    onClick={() => setShowSupModal(true)}>
                    <Building2 className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-sm truncate" style={{ color: supplier ? 'var(--text-primary)' : 'var(--text-muted)' }}>{supplier || 'Selecionar'}</span>
                  </div>
                  {supplier && <button type="button" onClick={() => setSupplier('')} className="h-10 px-2 transition hover:opacity-70" style={{ color: 'var(--text-muted)' }}><X className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Observação</label>
              <textarea rows={2} placeholder="Lote, validade..." value={note} onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }} />
            </div>

            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          </div>

          {!loadingHist && history.length > 0 && (
            <div className="px-5 pb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Histórico ({history.length})</p>
              <div className="flex flex-col gap-2">
                {history.slice(0, 5).map((h, i) => (
                  <div key={h.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                    style={{ background: i === 0 ? 'var(--surface-success)' : 'var(--surface-soft)', border: `1px solid ${i === 0 ? 'var(--border-success)' : 'var(--border-soft)'}` }}>
                    <div className="flex items-center gap-2">
                      {h.costTrend === 'UP' && <TrendingUp className="h-3.5 w-3.5 shrink-0 text-red-600" />}
                      {h.costTrend === 'DOWN' && <TrendingDown className="h-3.5 w-3.5 shrink-0 text-green-600" />}
                      {(h.costTrend === 'STABLE' || h.costTrend === 'FIRST') && <Minus className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-soft)' }} />}
                      <div>
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {fmtMoney(h.unitCost)}{h.unitSalePrice && <span className="ml-1.5 font-normal" style={{ color: 'var(--text-soft)' }}>→ {fmtMoney(h.unitSalePrice)}</span>}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--text-soft)' }}>{fmtDate(h.purchasedAt)}{h.supplierName ? ` · ${h.supplierName}` : ''}</p>
                      </div>
                    </div>
                    {h.costDeltaPercent != null && (
                      <span className="shrink-0 text-xs font-semibold" style={{ color: Number(h.costDeltaPercent) > 1 ? '#dc2626' : Number(h.costDeltaPercent) < -1 ? '#16a34a' : 'var(--text-soft)' }}>
                        {fmtPct(h.costDeltaPercent)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5" style={{ borderTop: '1px solid var(--border-soft)' }}>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving || !unitCost} className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--brand-500)', color: '#fff' }}>
            <ShoppingCart className="h-4 w-4" />{saving ? 'Salvando...' : 'Registrar compra'}
          </button>
        </div>
      </div>
      {showSupModal && (
        <SupplierModal marketId={marketId} onClose={() => setShowSupModal(false)} onSelect={(s: Supplier) => { setSupplier(s.nomeFantasia || s.razaoSocial); setShowSupModal(false); }} />
      )}
    </div>
  );
};

const CatalogSearch: React.FC<{ marketId: string; productIds: Set<string>; onAdd: (p: ProductPerformance) => Promise<void> }> = ({ marketId, productIds, onAdd }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductPerformance[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try { const d = await marketService.searchProductCatalog(marketId, q, 0, 10); setResults(d?.content || []); }
    catch { setResults([]); } finally { setLoading(false); }
  }, [marketId]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input type="text" placeholder="Buscar produto no catálogo..." value={query}
          className="h-10 w-full rounded-xl pl-9 pr-9 text-sm outline-none"
          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => search(e.target.value), 350); }}
          onFocus={() => query && setOpen(true)} />
        {query && <button type="button" onClick={() => { setQuery(''); setResults([]); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}><X className="h-4 w-4" /></button>}
      </div>
      {open && query && (
        <div className="absolute left-0 right-0 top-12 z-30 rounded-xl shadow-lg overflow-y-auto" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', maxHeight: '360px' }}>
          {loading && <div className="flex justify-center py-5"><div className="h-4 w-4 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>}
          {!loading && results.length === 0 && <p className="py-5 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum produto para "{query}"</p>}
          {!loading && results.map((p) => (
            <div key={p.productId} className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-soft)]" style={{ borderBottom: '1px solid var(--border-soft)' }}>
              <Link to={`/app/produtos/${p.productId}`} className="h-10 w-10 shrink-0 overflow-hidden rounded-lg no-underline" style={{ background: 'var(--surface-soft)' }}>
                <ProductImage src={p.imageUrl} alt={p.name} className="h-full w-full object-contain" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/app/produtos/${p.productId}`} className="block truncate text-sm font-medium no-underline hover:underline" style={{ color: 'var(--text-primary)' }}>{p.name}</Link>
                <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{Number(p.salesVelocity || 0).toFixed(1)} un./dia</p>
              </div>
              {productIds.has(p.productId)
                ? <span className="text-[10px] font-semibold" style={{ color: 'var(--brand-700)' }}>Na lista</span>
                : <button type="button" onClick={() => void onAdd(p)} className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition hover:opacity-80" style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}><Plus className="h-3 w-3" /> Adicionar</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ListItem: React.FC<{
  item: ShoppingListItem; marketId: string; histRefresh: number;
  onToggle: (c: boolean) => Promise<unknown>; onUpdate: (p: { quantityTarget?: number }) => Promise<unknown>;
  onRemove: () => Promise<unknown>; onRecordPurchase: () => void;
}> = ({ item, marketId, histRefresh, onToggle, onUpdate, onRemove, onRecordPurchase }) => {
  const [qty, setQty] = useState(String(item.quantityTarget || 1));
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<PurchasePriceHistory[]>([]);
  const [histLoaded, setHistLoaded] = useState(false);

  const loadHist = useCallback(async () => {
    setHistLoaded(true);
    try { setHistory(await marketService.getPurchaseHistory(marketId, item.productId) || []); }
    catch { setHistory([]); }
  }, [marketId, item.productId]);

  useEffect(() => { loadHist(); }, []); // eslint-disable-line
  useEffect(() => { if (histLoaded) loadHist(); }, [histRefresh]); // eslint-disable-line

  const last = history[0];

  return (
    <div className={`flex flex-col rounded-xl transition ${item.checked ? 'opacity-60' : ''}`}
      style={{ border: `1px solid ${item.checked ? 'var(--border-soft)' : 'var(--border-strong)'}`, background: 'var(--surface-base)' }}>
      <div className="flex items-start gap-3 p-4">
        <button type="button" onClick={() => void onToggle(!item.checked)}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${item.checked ? 'border-green-500 bg-green-500 text-white' : 'border-slate-300 hover:border-green-400'}`}>
          {item.checked && <CheckCircle2 className="h-4 w-4" />}
        </button>
        <Link to={`/app/produtos/${item.productId}`} className="h-12 w-12 shrink-0 overflow-hidden rounded-lg no-underline" style={{ display: 'block' }}>
          <ProductImage src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to={`/app/produtos/${item.productId}`} className={`block text-sm font-semibold no-underline hover:underline ${item.checked ? 'line-through' : ''}`} style={{ color: item.checked ? 'var(--text-soft)' : 'var(--text-primary)' }}>{item.name}</Link>
              <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{item.category || 'Sem categoria'}</p>
            </div>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
              {SOURCE_TAG_PT[item.sourceTag] ?? item.sourceTag.replace(/_/g, ' ')}
            </span>
          </div>
          {item.reasonSummary && <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{item.reasonSummary}</p>}
          {last && (
            <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: 'var(--text-soft)' }}>
              <Clock className="h-3 w-3 shrink-0" />
              <span>Última: {fmtMoney(last.unitCost)}</span>
              {last.costDeltaPercent != null && <span style={{ color: Number(last.costDeltaPercent) > 1 ? '#dc2626' : Number(last.costDeltaPercent) < -1 ? '#16a34a' : 'var(--text-soft)' }}>({fmtPct(last.costDeltaPercent)})</span>}
              {last.supplierName && <span style={{ color: 'var(--text-muted)' }}>· {last.supplierName}</span>}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              Qtd: <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} onBlur={() => void onUpdate({ quantityTarget: Math.max(1, Number(qty || 1)) })}
                className="h-7 w-16 rounded px-2 text-center text-xs outline-none"
                style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }} />
            </label>
            <button type="button" onClick={onRecordPurchase} className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition hover:opacity-80" style={{ background: 'var(--surface-success)', color: 'var(--brand-700)', border: '1px solid var(--border-success)' }}>
              <ShoppingCart className="h-3 w-3" /> Registrar compra
            </button>
            <Link to={`/app/produtos/${item.productId}`} className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold no-underline transition hover:opacity-80" style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)', border: '1px solid var(--border-soft)' }}>
              Desempenho <ArrowRight className="h-3 w-3" />
            </Link>
            <button type="button" onClick={() => void onRemove()} className="text-xs hover:opacity-70" style={{ color: '#ef4444' }}><Trash2 className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => { if (!expanded && !histLoaded) loadHist(); setExpanded(v => !v); }} className="ml-auto flex items-center gap-1 text-xs transition hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
              <Clock className="h-3.5 w-3.5" />{expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Histórico de preços</p>
          {history.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhuma compra registrada.</p> : (
            <div className="flex flex-col gap-2">
              {history.map((h, i) => (
                <div key={h.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                  style={{ background: i === 0 ? 'var(--surface-success)' : 'var(--surface-soft)', border: `1px solid ${i === 0 ? 'var(--border-success)' : 'var(--border-soft)'}` }}>
                  <div className="flex items-center gap-2">
                    {h.costTrend === 'UP' && <TrendingUp className="h-3.5 w-3.5 shrink-0 text-red-600" />}
                    {h.costTrend === 'DOWN' && <TrendingDown className="h-3.5 w-3.5 shrink-0 text-green-600" />}
                    {(h.costTrend === 'STABLE' || h.costTrend === 'FIRST') && <Minus className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-soft)' }} />}
                    <div>
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {fmtMoney(h.unitCost)}{h.unitSalePrice && <span className="ml-1.5 font-normal" style={{ color: 'var(--text-soft)' }}>· venda {fmtMoney(h.unitSalePrice)}</span>}
                        {h.marginPercent && <span className="ml-1.5 font-semibold" style={{ color: 'var(--brand-600)' }}>({Number(h.marginPercent).toFixed(1)}%)</span>}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-soft)' }}>{fmtDate(h.purchasedAt)}{h.supplierName ? ` · ${h.supplierName}` : ''}</p>
                    </div>
                  </div>
                  {h.costDeltaPercent != null && <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: Number(h.costDeltaPercent) > 1 ? '#fee2e2' : Number(h.costDeltaPercent) < -1 ? '#dcfce7' : 'var(--surface-muted)', color: Number(h.costDeltaPercent) > 1 ? '#dc2626' : Number(h.costDeltaPercent) < -1 ? '#16a34a' : 'var(--text-soft)' }}>{fmtPct(h.costDeltaPercent)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════
   ABA 2 — PEDIDOS A FORNECEDORES
════════════════════════════════════════════════════════════════════ */

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const c = STATUS_CFG[status] || STATUS_CFG.RASCUNHO;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: c.bg, color: c.text }}>
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c.dot }} />{c.label}
    </span>
  );
};

const ProductSearchDropdown: React.FC<{ marketId: string; existingIds: Set<string>; onSelect: (p: ProductPerformance) => void }> = ({ marketId, existingIds, onSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductPerformance[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try { setResults((await marketService.searchProductCatalog(marketId, q, 0, 10))?.content || []); }
    catch { setResults([]); } finally { setLoading(false); }
  }, [marketId]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input type="text" placeholder="Buscar produto para adicionar ao pedido..." value={query}
          className="h-10 w-full rounded-xl pl-9 pr-9 text-sm outline-none"
          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (debRef.current) clearTimeout(debRef.current); debRef.current = setTimeout(() => search(e.target.value), 350); }}
          onFocus={() => query && setOpen(true)} />
        {query && <button type="button" onClick={() => { setQuery(''); setResults([]); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}><X className="h-4 w-4" /></button>}
      </div>
      {open && query && (
        <div className="absolute left-0 right-0 top-11 z-40 overflow-y-auto rounded-xl shadow-xl" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', maxHeight: '300px' }}>
          {loading && <div className="flex justify-center py-4"><div className="h-4 w-4 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>}
          {!loading && results.length === 0 && <p className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum produto para "{query}"</p>}
          {!loading && results.map((p) => (
            <div key={p.productId} className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-soft)]" style={{ borderBottom: '1px solid var(--border-soft)' }}>
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-soft)' }}><ProductImage src={p.imageUrl} alt={p.name} className="h-full w-full object-contain" /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{p.category}</p>
              </div>
              {existingIds.has(p.productId)
                ? <span className="text-xs font-semibold" style={{ color: 'var(--brand-700)' }}>Adicionado</span>
                : <button type="button" onClick={() => { onSelect(p); setQuery(''); setResults([]); setOpen(false); }} className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition hover:opacity-80" style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}><Plus className="h-3 w-3" /> Adicionar</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AddItemForm: React.FC<{ marketId: string; orderId: string; product: ProductPerformance; onSaved: (i: SupplierOrderItem) => void; onCancel: () => void }> = ({ marketId, orderId, product, onSaved, onCancel }) => {
  const [qty, setQty] = useState('1');
  const [unitType, setUnitType] = useState('UN');
  const [unitsPerPack, setUnitsPerPack] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [unitSalePrice, setUnitSalePrice] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cost = parseFloat(unitCost.replace(',', '.')) || 0;
  const sale = parseFloat(unitSalePrice.replace(',', '.')) || 0;
  const margin = cost > 0 && sale > 0 ? ((sale - cost) / cost) * 100 : null;

  const handleSave = async () => {
    if (!cost || cost <= 0) { setErr('Informe o custo unitário'); return; }
    if (parseFloat(qty) <= 0) { setErr('Informe a quantidade'); return; }
    setSaving(true); setErr(null);
    try {
      const item = await marketService.addSupplierOrderItem(marketId, orderId, {
        productId: product.productId, quantityRequested: parseFloat(qty), unitType,
        unitsPerPack: unitsPerPack ? parseFloat(unitsPerPack) : undefined,
        unitCost: cost, unitSalePrice: sale > 0 ? sale : undefined, note: note.trim() || undefined,
      });
      onSaved(item);
    } catch (e: any) { setErr(e?.message || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ border: '1px solid var(--brand-200)', background: 'var(--surface-soft)' }}>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-base)' }}><ProductImage src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{product.name}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{product.category}</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg p-1 transition hover:opacity-70" style={{ color: 'var(--text-muted)' }}><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Quantidade *</label>
          <input type="number" min="0.001" step="any" value={qty} onChange={(e) => setQty(e.target.value)}
            className="h-9 w-full rounded-lg px-3 text-sm outline-none"
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Tipo</label>
          <select value={unitType} onChange={(e) => setUnitType(e.target.value)}
            className="h-9 w-full rounded-lg px-2 text-sm outline-none"
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
            {UNIT_TYPES.map(u => <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Custo unit. *</label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-soft)' }}>R$</span>
            <input type="text" inputMode="decimal" placeholder="0,00" value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
              className="h-9 w-full rounded-lg pl-7 pr-2 text-sm outline-none"
              style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Preço venda</label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-soft)' }}>R$</span>
            <input type="text" inputMode="decimal" placeholder="0,00" value={unitSalePrice} onChange={(e) => setUnitSalePrice(e.target.value)}
              className="h-9 w-full rounded-lg pl-7 pr-2 text-sm outline-none"
              style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
          </div>
          {margin !== null && <p className="mt-0.5 text-xs font-semibold" style={{ color: margin >= 20 ? '#16a34a' : margin >= 10 ? '#d97706' : '#dc2626' }}>Margem: {margin.toFixed(1)}%</p>}
        </div>
        <div className="sm:col-span-4">
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Observação</label>
          <input type="text" placeholder="Lote, validade..." value={note} onChange={(e) => setNote(e.target.value)}
            className="h-9 w-full rounded-lg px-3 text-sm outline-none"
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
        </div>
      </div>
      {cost > 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Subtotal: <strong style={{ color: 'var(--text-primary)' }}>{fmtMoney((parseFloat(qty) || 0) * cost)}</strong></p>}
      {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-medium transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>Cancelar</button>
        <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--brand-500)', color: '#fff' }}>
          <Plus className="h-3.5 w-3.5" />{saving ? 'Adicionando...' : 'Adicionar'}
        </button>
      </div>
    </div>
  );
};

const OrderDetailModal: React.FC<{ order: SupplierOrder; marketId: string; onClose: () => void; onUpdated: (o: SupplierOrder) => void }> = ({ order: init, marketId, onClose, onUpdated }) => {
  const [order, setOrder] = useState<SupplierOrder>(init);
  const [addProd, setAddProd] = useState<ProductPerformance | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'send' | 'cancel' | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const refresh = useCallback(async () => {
    try { const f = await marketService.getSupplierOrder(marketId, order.id); setOrder(f); onUpdated(f); } catch { /* silent */ }
  }, [marketId, order.id, onUpdated]);

  const existingIds = new Set(order.items.map(i => i.productId));

  const removeItem = async (itemId: string) => {
    setLoading(true); setErr(null);
    try { await marketService.removeSupplierOrderItem(marketId, order.id, itemId); await refresh(); }
    catch (e: any) { setErr(e?.message || 'Erro ao remover'); }
    finally { setLoading(false); }
  };

  const doSend = async () => {
    setLoading(true); setErr(null);
    try { const u = await marketService.sendSupplierOrder(marketId, order.id); setOrder(u); onUpdated(u); setConfirm(null); }
    catch (e: any) { setErr(e?.message || 'Erro ao enviar'); }
    finally { setLoading(false); }
  };

  const doCancel = async () => {
    setLoading(true); setErr(null);
    try { const u = await marketService.cancelSupplierOrder(marketId, order.id, cancelReason.trim() || undefined); setOrder(u); onUpdated(u); setConfirm(null); }
    catch (e: any) { setErr(e?.message || 'Erro ao cancelar'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between gap-3 p-5" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{order.orderNumber}</span>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-soft)' }}><Building2 className="inline h-3 w-3 mr-1" />{order.supplierFantasia || order.supplierName} · {fmtDate(order.orderDate)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition hover:opacity-70" style={{ color: 'var(--text-muted)' }}><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {order.canEdit && (
            <div className="p-5 pb-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Adicionar produto</p>
              <ProductSearchDropdown marketId={marketId} existingIds={existingIds} onSelect={p => setAddProd(p)} />
            </div>
          )}
          {addProd && order.canEdit && (
            <div className="px-5 pb-3">
              <AddItemForm marketId={marketId} orderId={order.id} product={addProd} onSaved={() => { setAddProd(null); refresh(); }} onCancel={() => setAddProd(null)} />
            </div>
          )}

          <div className="px-5 pb-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Itens ({order.items.length})</p>
            {order.items.length === 0
              ? <div className="rounded-xl py-8 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}><Package className="mx-auto mb-2 h-7 w-7 opacity-30" style={{ color: 'var(--text-muted)' }} /><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum produto. Use a busca acima.</p></div>
              : <div className="flex flex-col gap-2">
                  {order.items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-base)' }}><ProductImage src={item.imageUrl} alt={item.productName} className="h-full w-full object-contain" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{item.productName}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--text-soft)' }}>
                          <span>{Number(item.quantityRequested).toFixed(3).replace(/\.?0+$/, '')} {UNIT_LABELS[item.unitType] || item.unitType}</span>
                          <span>· custo {fmtMoney(item.unitCost)}</span>
                          {item.unitSalePrice && <span>· venda {fmtMoney(item.unitSalePrice)}</span>}
                          {item.marginPercent != null && <span className="font-semibold" style={{ color: Number(item.marginPercent) >= 20 ? '#16a34a' : Number(item.marginPercent) >= 10 ? '#d97706' : '#dc2626' }}>· {Number(item.marginPercent).toFixed(1)}%</span>}
                          {item.quantityReceived != null && <span className="font-medium" style={{ color: 'var(--brand-700)' }}>· recebido: {Number(item.quantityReceived).toFixed(3).replace(/\.?0+$/, '')}</span>}
                        </div>
                        {item.note && <p className="mt-0.5 text-xs italic" style={{ color: 'var(--text-muted)' }}>{item.note}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(item.subtotal)}</p>
                        {order.canEdit && <button type="button" onClick={() => removeItem(item.id)} disabled={loading} className="mt-1 transition hover:opacity-70 disabled:opacity-30" style={{ color: '#ef4444' }}><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    </div>
                  ))}
                </div>}
          </div>

          {order.items.length > 0 && (
            <div className="mx-5 mb-3 flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--surface-success)', border: '1px solid var(--border-success)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--brand-700)' }}>Total do pedido</span>
              <span className="text-xl font-bold" style={{ color: 'var(--brand-700)' }}>{fmtMoney(order.totalValue)}</span>
            </div>
          )}

          {order.notes && <div className="mx-5 mb-3 rounded-xl px-4 py-3" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}><p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Observações</p><p className="text-sm" style={{ color: 'var(--text-primary)' }}>{order.notes}</p></div>}

          {confirm === 'send' && (
            <div className="mx-5 mb-3 rounded-xl p-4" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <p className="mb-1 text-sm font-semibold text-blue-700">Confirmar envio?</p>
              <p className="mb-3 text-xs text-blue-600">O pedido passará para ENVIADO e não poderá mais ser editado.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirm(null)} className="flex-1 rounded-lg py-2 text-sm font-medium" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>Voltar</button>
                <button type="button" onClick={doSend} disabled={loading} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold disabled:opacity-50" style={{ background: '#2563eb', color: '#fff' }}><Send className="h-3.5 w-3.5" />{loading ? 'Enviando...' : 'Confirmar envio'}</button>
              </div>
            </div>
          )}

          {confirm === 'cancel' && (
            <div className="mx-5 mb-3 rounded-xl p-4" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              <p className="mb-2 text-sm font-semibold text-red-700">Cancelar pedido?</p>
              <input type="text" placeholder="Motivo (opcional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                className="mb-3 h-9 w-full rounded-lg px-3 text-sm outline-none"
                style={{ border: '1px solid #fecaca', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirm(null)} className="flex-1 rounded-lg py-2 text-sm font-medium" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>Voltar</button>
                <button type="button" onClick={doCancel} disabled={loading} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold disabled:opacity-50" style={{ background: '#dc2626', color: '#fff' }}><Ban className="h-3.5 w-3.5" />{loading ? 'Cancelando...' : 'Confirmar'}</button>
              </div>
            </div>
          )}

          {err && <p className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-5" style={{ borderTop: '1px solid var(--border-soft)' }}>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>Fechar</button>
          <div className="flex gap-2">
            {order.canCancel && !confirm && <button type="button" onClick={() => setConfirm('cancel')} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition hover:opacity-80" style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626' }}><Ban className="h-3.5 w-3.5" /> Cancelar</button>}
            {order.canSend && !confirm && order.items.length > 0 && <button type="button" onClick={() => setConfirm('send')} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition hover:opacity-90" style={{ background: '#2563eb', color: '#fff' }}><Send className="h-3.5 w-3.5" /> Enviar pedido</button>}
          </div>
        </div>
      </div>
    </div>
  );
};

const ReceiveOrderModal: React.FC<{ order: SupplierOrder; marketId: string; onClose: () => void; onReceived: (o: SupplierOrder) => void }> = ({ order, marketId, onClose, onReceived }) => {
  const [qtys, setQtys] = useState<Record<string, string>>(() => Object.fromEntries(order.items.map(i => [i.id, String(i.quantityRequested)])));
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleReceive = async () => {
    setSaving(true); setErr(null);
    try {
      const updated = await marketService.receiveSupplierOrder(marketId, order.id, {
        items: order.items.map(i => ({ itemId: i.id, quantityReceived: parseFloat(qtys[i.id]) || Number(i.quantityRequested) })),
        receivedAt: new Date(receivedAt).toISOString().slice(0, 19),
      });
      onReceived(updated); onClose();
    } catch (e: any) { setErr(e?.message || 'Erro ao receber'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Receber {order.orderNumber}</p>
            <p className="text-xs" style={{ color: 'var(--text-soft)' }}>Confirme as quantidades. Histórico de preços será registrado.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition hover:opacity-70" style={{ color: 'var(--text-muted)' }}><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Data de recebimento</label>
            <input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)}
              className="h-9 w-full rounded-lg px-3 text-sm outline-none"
              style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex flex-col gap-2">
            {order.items.map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-base)' }}><ProductImage src={item.imageUrl} alt={item.productName} className="h-full w-full object-contain" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.productName}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pedido: {Number(item.quantityRequested).toFixed(3).replace(/\.?0+$/, '')} {UNIT_LABELS[item.unitType] || item.unitType}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <input type="number" min="0" step="any" value={qtys[item.id] ?? String(item.quantityRequested)} onChange={(e) => setQtys(p => ({ ...p, [item.id]: e.target.value }))}
                    className="h-9 w-20 rounded-lg px-2 text-center text-sm outline-none"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-soft)' }}>{UNIT_LABELS[item.unitType] || item.unitType}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl p-3" style={{ background: 'var(--surface-success)', border: '1px solid var(--border-success)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--brand-700)' }}>Ao confirmar, o histórico de preços será registrado e o pedido passará para ENTREGUE.</p>
          </div>
          {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 p-5" style={{ borderTop: '1px solid var(--border-soft)' }}>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>Cancelar</button>
          <button type="button" onClick={handleReceive} disabled={saving} className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50" style={{ background: '#16a34a', color: '#fff' }}>
            <Truck className="h-4 w-4" />{saving ? 'Registrando...' : 'Confirmar recebimento'}
          </button>
        </div>
      </div>
    </div>
  );
};

const CreateOrderModal: React.FC<{ marketId: string; onClose: () => void; onCreated: (o: SupplierOrder) => void }> = ({ marketId, onClose, onCreated }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSup, setLoadingSup] = useState(true);
  const [showSupModal, setShowSupModal] = useState(false);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadSuppliers = useCallback(() => {
    setLoadingSup(true);
    marketService.getSuppliers(marketId).then(d => setSuppliers(d || [])).catch(() => setSuppliers([])).finally(() => setLoadingSup(false));
  }, [marketId]);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  const handleCreate = async () => {
    if (!selected) { setErr('Selecione um fornecedor'); return; }
    setSaving(true); setErr(null);
    try { const o = await marketService.createSupplierOrder(marketId, { supplierId: selected.id, notes: notes.trim() || undefined }); onCreated(o); onClose(); }
    catch (e: any) { setErr(e?.message || 'Erro ao criar'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="w-full max-w-md overflow-hidden rounded-2xl shadow-2xl" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
          <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border-soft)' }}>
            <div><p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Novo pedido</p><p className="text-xs" style={{ color: 'var(--text-soft)' }}>Selecione o fornecedor</p></div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition hover:opacity-70" style={{ color: 'var(--text-muted)' }}><X className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-col gap-4 p-5">
            {loadingSup ? <div className="flex justify-center py-4"><div className="h-4 w-4 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div> : (
              <div className="flex flex-col gap-2">
                {suppliers.length > 0 && (
                  <div className="max-h-52 overflow-y-auto rounded-xl border flex flex-col" style={{ borderColor: 'var(--border-strong)' }}>
                    {suppliers.map(s => (
                      <button key={s.id} type="button" onClick={() => setSelected(s)}
                        className="flex items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-soft)]"
                        style={{ borderBottom: '1px solid var(--border-soft)', background: selected?.id === s.id ? 'var(--surface-success)' : 'transparent' }}>
                        <Building2 className="h-4 w-4 shrink-0" style={{ color: selected?.id === s.id ? 'var(--brand-700)' : 'var(--text-muted)' }} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.nomeFantasia || s.razaoSocial}</p>
                          {s.nomeFantasia && <p className="text-xs truncate" style={{ color: 'var(--text-soft)' }}>{s.razaoSocial}</p>}
                        </div>
                        {selected?.id === s.id && <CheckCircle2 className="h-4 w-4 shrink-0 ml-auto" style={{ color: 'var(--brand-700)' }} />}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => setShowSupModal(true)} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:opacity-80" style={{ border: '1px dashed var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-soft)' }}>
                  <Plus className="h-4 w-4" /> Cadastrar novo fornecedor
                </button>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Observações</label>
              <textarea rows={2} placeholder="Condição de pagamento, prazo de entrega..." value={notes} onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
            </div>
            {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 p-5" style={{ borderTop: '1px solid var(--border-soft)' }}>
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>Cancelar</button>
            <button type="button" onClick={handleCreate} disabled={saving || !selected} className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--brand-500)', color: '#fff' }}>
              <Plus className="h-4 w-4" />{saving ? 'Criando...' : 'Criar pedido'}
            </button>
          </div>
        </div>
      </div>
      {showSupModal && (
        <SupplierModal marketId={marketId} onClose={() => setShowSupModal(false)} onSelect={(s: Supplier) => { setSelected(s); setShowSupModal(false); loadSuppliers(); }} />
      )}
    </>
  );
};

/* ════════════════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL COM ABAS
════════════════════════════════════════════════════════════════════ */

type Tab = 'lista' | 'pedidos' | 'fornecedores';

const ShoppingListPage: React.FC = () => {
  const { marketId } = useAuth();
  const { dashboard, loading: dLoading } = useMarketData();
  const { overview, items, productIds, loading, error, addItem, updateItem, removeItem } = useShoppingList();

  const [tab, setTab] = useState<Tab>('lista');

  // Lista
  const [recordModal, setRecordModal] = useState<ShoppingListItem | null>(null);
  const [histRefresh, setHistRefresh] = useState(0);

  // Pedidos
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailOrder, setDetailOrder] = useState<SupplierOrder | null>(null);
  const [receiveOrder, setReceiveOrder] = useState<SupplierOrder | null>(null);

  // Fornecedores
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliersLoaded, setSuppliersLoaded] = useState(false);
  const [showSupModal, setShowSupModal] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!marketId) return;
    setOrdersLoading(true);
    try { setOrders(await marketService.listSupplierOrders(marketId, statusFilter || undefined) || []); }
    catch { /* silent */ } finally { setOrdersLoading(false); setOrdersLoaded(true); }
  }, [marketId, statusFilter]);

  const fetchSuppliers = useCallback(async () => {
    if (!marketId) return;
    setSuppliersLoading(true);
    try { setSuppliers(await marketService.getSuppliers(marketId) || []); }
    catch { /* silent */ } finally { setSuppliersLoading(false); setSuppliersLoaded(true); }
  }, [marketId]);

  useEffect(() => { if (tab === 'pedidos' && !ordersLoaded) fetchOrders(); }, [tab, ordersLoaded, fetchOrders]);
  useEffect(() => { if (tab === 'fornecedores' && !suppliersLoaded) fetchSuppliers(); }, [tab, suppliersLoaded, fetchSuppliers]);
  useEffect(() => { if (tab === 'pedidos') fetchOrders(); }, [statusFilter]); // eslint-disable-line

  const openOrderDetail = useCallback(async (order: SupplierOrder) => {
    if (!marketId) return;
    try { setDetailOrder(await marketService.getSupplierOrder(marketId, order.id)); }
    catch { setDetailOrder(order); }
  }, [marketId]);

  const handleOrderUpdated = useCallback((updated: SupplierOrder) => {
    setOrders(prev => {
      const idx = prev.findIndex(o => o.id === updated.id);
      if (idx === -1) return prev;
      if (updated.status === 'CANCELADO' && prev[idx].status !== 'CANCELADO') { fetchOrders(); return prev; }
      const next = [...prev]; next[idx] = updated; return next;
    });
  }, [fetchOrders]);

  const restockSuggestions = useMemo(
    () => (dashboard?.replenishmentCandidates || []).filter(p => !productIds.has(p.productId)).slice(0, 8),
    [dashboard?.replenishmentCandidates, productIds]
  );

  const TABS: Array<{ key: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    { key: 'lista', label: 'Lista de compras', icon: <ShoppingCart className="h-4 w-4" />, badge: overview.pendingItems || undefined },
    { key: 'pedidos', label: 'Pedidos', icon: <ClipboardList className="h-4 w-4" />, badge: orders.filter(o => o.status === 'ENVIADO').length || undefined },
    { key: 'fornecedores', label: 'Fornecedores', icon: <Building2 className="h-4 w-4" /> },
  ];

  const STATUS_TABS = [
    { key: '', label: 'Todos' }, { key: 'RASCUNHO', label: 'Rascunho' },
    { key: 'ENVIADO', label: 'Enviados' }, { key: 'ENTREGUE', label: 'Entregues' }, { key: 'CANCELADO', label: 'Cancelados' },
  ];

  if (loading || dLoading) {
    return <Layout><div className="flex min-h-[300px] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div></Layout>;
  }
  if (error) {
    return <Layout><div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center"><p className="text-sm text-red-600">{error}</p></div></Layout>;
  }

  const urgentItems    = items.filter(i => !i.checked && Number(i.quantityTarget || 0) >= 10);
  const reinforceItems = items.filter(i => !i.checked && Number(i.quantityTarget || 0) >= 3 && Number(i.quantityTarget || 0) < 10);
  const regularItems   = items.filter(i => !i.checked && Number(i.quantityTarget || 0) < 3);
  const checkedItems   = items.filter(i => i.checked);

  const renderGroup = (title: string, icon: React.ReactNode, style: React.CSSProperties, groupItems: ShoppingListItem[]) => {
    if (!groupItems.length) return null;
    return (
      <div>
        <div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2" style={style}>{icon}<span className="text-sm font-semibold">{title} ({groupItems.length})</span></div>
        <div className="flex flex-col gap-3">
          {groupItems.map(item => (
            <ListItem key={item.id} item={item} marketId={marketId!} histRefresh={histRefresh}
              onToggle={c => updateItem(item.id, { checked: c })} onUpdate={p => updateItem(item.id, p)}
              onRemove={() => removeItem(item.id)} onRecordPurchase={() => setRecordModal(item)} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Pedido inteligente</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Lista de compras, pedidos a fornecedores e histórico de preços</p>
        </div>

        {/* Abas */}
        <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)' }}>
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition"
              style={tab === t.key
                ? { background: 'var(--surface-base)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                : { color: 'var(--text-muted)' }}>
              {t.icon}{t.label}
              {t.badge ? <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'var(--brand-500)', color: '#fff' }}>{t.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* ── ABA: LISTA ── */}
        {tab === 'lista' && (
          <div className="flex flex-col gap-5">
            {marketId && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Adicionar produto</p>
                <CatalogSearch marketId={marketId} productIds={productIds} onAdd={async p => addItem({ productId: p.productId, quantityTarget: suggestedQuantity(p), sourceTag: 'MANUAL', reasonSummary: `${Number(p.salesVelocity || 0).toFixed(1)} un./dia · adicionado via busca` })} />
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: 'Na lista', value: overview.totalItems, color: 'var(--text-primary)' },
                { label: 'Pendentes', value: overview.pendingItems, color: '#d97706' },
                { label: 'Comprados', value: overview.checkedItems, color: 'var(--brand-700)' },
                { label: 'Sugestões', value: restockSuggestions.length, color: '#1d4ed8' },
              ].map(k => (
                <div key={k.label} className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                  <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{k.label}</span>
                  <p className="mt-1 text-2xl font-bold" style={{ color: k.color }}>{k.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-6">
              {items.length === 0
                ? <div className="rounded-xl p-8 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}><ShoppingCart className="mx-auto mb-3 h-8 w-8 opacity-30" style={{ color: 'var(--text-muted)' }} /><p style={{ color: 'var(--text-muted)' }}>Lista vazia. Use a busca acima para começar.</p></div>
                : <>
                    {renderGroup('Urgente — quantidade alta', <AlertTriangle className="h-4 w-4 text-red-600" />, { background: '#fef2f2', color: '#991b1b' }, urgentItems)}
                    {renderGroup('Reforçar — vendas acelerando', <Clock className="h-4 w-4 text-amber-600" />, { background: '#fffbeb', color: '#92400e' }, reinforceItems)}
                    {renderGroup('Manter — compra regular', <CheckCircle2 className="h-4 w-4 text-green-600" />, { background: 'var(--surface-success)', color: 'var(--brand-700)' }, regularItems)}
                    {renderGroup('Comprados', <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--text-soft)' }} />, { background: 'var(--surface-soft)', color: 'var(--text-muted)' }, checkedItems)}
                  </>}
            </div>

            {restockSuggestions.length > 0 && (
              <div>
                <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Sugestões de reposição</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {restockSuggestions.map(p => (
                    <div key={p.productId} className="flex items-center gap-3 rounded-lg p-3" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                      <Link to={`/app/produtos/${p.productId}`} className="h-10 w-10 shrink-0 overflow-hidden rounded-lg no-underline" style={{ display: 'block' }}><ProductImage src={p.imageUrl} alt={p.name} className="h-full w-full object-contain" /></Link>
                      <div className="min-w-0 flex-1">
                        <Link to={`/app/produtos/${p.productId}`} className="block truncate text-sm font-medium no-underline hover:underline" style={{ color: 'var(--text-primary)' }}>{p.name}</Link>
                        <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{Number(p.salesVelocity || 0).toFixed(1)} un./dia</p>
                      </div>
                      {productIds.has(p.productId)
                        ? <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}>Na lista</span>
                        : <button type="button" onClick={() => void addItem({ productId: p.productId, quantityTarget: suggestedQuantity(p), sourceTag: 'REPOSIÇÃO', reasonSummary: `Repor ${p.name}` })} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80" style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}><Plus className="h-3 w-3" /> Adicionar</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ABA: PEDIDOS ── */}
        {tab === 'pedidos' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Gerencie pedidos de compra por fornecedor. Registre custo, venda e margem de cada produto.</p>
              <button type="button" onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-90" style={{ background: 'var(--brand-500)', color: '#fff' }}>
                <Plus className="h-4 w-4" /> Novo pedido
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map(t => {
                const active = statusFilter === t.key;
                const cfg = t.key ? STATUS_CFG[t.key] : null;
                const count = t.key ? orders.filter(o => o.status === t.key).length : orders.length;
                return (
                  <button key={t.key} type="button" onClick={() => setStatusFilter(t.key)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition"
                    style={active
                      ? { background: cfg?.bg || 'var(--surface-success)', color: cfg?.text || 'var(--brand-700)', border: `1px solid ${cfg?.dot || 'var(--brand-600)'}` }
                      : { background: 'var(--surface-base)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}>
                    {t.label}
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: active ? 'rgba(0,0,0,0.1)' : 'var(--surface-muted)', color: active ? 'inherit' : 'var(--text-muted)' }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {ordersLoading
              ? <div className="flex min-h-[160px] items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>
              : orders.length === 0
                ? <div className="rounded-xl py-12 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                    <ClipboardList className="mx-auto mb-3 h-9 w-9 opacity-20" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Nenhum pedido</p>
                    <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{statusFilter ? `Sem pedidos com status "${STATUS_CFG[statusFilter]?.label}".` : 'Crie seu primeiro pedido a um fornecedor.'}</p>
                    {!statusFilter && <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition hover:opacity-90" style={{ background: 'var(--brand-500)', color: '#fff' }}><Plus className="h-4 w-4" /> Criar pedido</button>}
                  </div>
                : <div className="flex flex-col gap-3">
                    {orders.map(order => {
                      const sup = order.supplierFantasia || order.supplierName;
                      return (
                        <div key={order.id} className="flex flex-col rounded-xl" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
                          <div className="flex items-start gap-3 p-4">
                            <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl" style={{ background: 'var(--surface-soft)' }}>
                              <Building2 className="h-5 w-5" style={{ color: 'var(--text-muted)' }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{order.orderNumber}</span>
                                <StatusBadge status={order.status} />
                              </div>
                              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{sup}</p>
                              <p className="text-xs" style={{ color: 'var(--text-soft)' }}>
                                {order.itemCount} {order.itemCount === 1 ? 'produto' : 'produtos'} · {fmtDate(order.orderDate)}
                                {order.sentAt ? ` · enviado ${fmtDate(order.sentAt)}` : ''}
                                {order.deliveredAt ? ` · entregue ${fmtDate(order.deliveredAt)}` : ''}
                              </p>
                              {order.cancelReason && <p className="mt-0.5 text-xs italic text-red-500">{order.cancelReason}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(order.totalValue)}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--border-soft)' }}>
                            <button type="button" onClick={() => openOrderDetail(order)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
                              {order.canEdit ? <><Edit2 className="h-3 w-3" /> Editar pedido</> : <><ClipboardList className="h-3 w-3" /> Ver detalhes</>}
                            </button>
                            {order.canReceive && (
                              <button type="button" onClick={() => setReceiveOrder(order)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80" style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                                <Truck className="h-3 w-3" /> Receber mercadoria
                              </button>
                            )}
                            {order.status === 'RASCUNHO' && (
                              <button type="button" onClick={async () => { if (!window.confirm(`Excluir ${order.orderNumber}?`)) return; await marketService.deleteSupplierOrder(marketId!, order.id); fetchOrders(); }}
                                className="ml-auto text-xs transition hover:opacity-70" style={{ color: '#ef4444' }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>}
          </div>
        )}

        {/* ── ABA: FORNECEDORES ── */}
        {tab === 'fornecedores' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Fornecedores cadastrados com dados da Receita Federal via CNPJ.</p>
              <button type="button" onClick={() => setShowSupModal(true)} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-90" style={{ background: 'var(--brand-500)', color: '#fff' }}>
                <Plus className="h-4 w-4" /> Cadastrar fornecedor
              </button>
            </div>

            {suppliersLoading
              ? <div className="flex min-h-[120px] items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>
              : suppliers.length === 0
                ? <div className="rounded-xl py-12 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                    <Building2 className="mx-auto mb-3 h-9 w-9 opacity-20" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Nenhum fornecedor cadastrado</p>
                    <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Cadastre fornecedores para criar pedidos de compra.</p>
                    <button type="button" onClick={() => setShowSupModal(true)} className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition hover:opacity-90" style={{ background: 'var(--brand-500)', color: '#fff' }}><Plus className="h-4 w-4" /> Cadastrar fornecedor</button>
                  </div>
                : <div className="flex flex-col gap-2">
                    {suppliers.map(s => (
                      <div key={s.id} className="flex items-center gap-4 rounded-xl px-4 py-4" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--surface-soft)' }}>
                          <Building2 className="h-5 w-5" style={{ color: 'var(--text-muted)' }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{s.nomeFantasia || s.razaoSocial}</p>
                          {s.nomeFantasia && <p className="text-xs truncate" style={{ color: 'var(--text-soft)' }}>{s.razaoSocial}</p>}
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <span>CNPJ: {s.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}</span>
                            {s.municipio && s.uf && <span>· {s.municipio}/{s.uf}</span>}
                            {s.telefone && <span>· {s.telefone}</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button type="button" onClick={() => { setTab('pedidos'); setShowCreate(true); }}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition hover:opacity-80"
                            style={{ background: 'var(--surface-success)', color: 'var(--brand-700)', border: '1px solid var(--border-success)' }}>
                            <ClipboardList className="h-3 w-3" /> Novo pedido
                          </button>
                          <button type="button" onClick={async () => {
                            if (!window.confirm(`Remover ${s.nomeFantasia || s.razaoSocial}?`)) return;
                            await marketService.deleteSupplier(marketId!, s.id);
                            setSuppliers(prev => prev.filter(x => x.id !== s.id));
                          }} className="rounded-lg p-1.5 transition hover:opacity-70" style={{ color: '#ef4444' }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>}
          </div>
        )}
      </div>

      {/* Modais */}
      {recordModal && marketId && (
        <RecordPurchaseModal item={recordModal} marketId={marketId} onClose={() => setRecordModal(null)} onSaved={() => setHistRefresh(v => v + 1)} />
      )}
      {showCreate && marketId && (
        <CreateOrderModal marketId={marketId} onClose={() => setShowCreate(false)} onCreated={o => { setOrders(prev => [o, ...prev]); setShowCreate(false); openOrderDetail(o); }} />
      )}
      {detailOrder && marketId && (
        <OrderDetailModal order={detailOrder} marketId={marketId} onClose={() => setDetailOrder(null)} onUpdated={u => { handleOrderUpdated(u); setDetailOrder(u); }} />
      )}
      {receiveOrder && marketId && (
        <ReceiveOrderModal order={receiveOrder} marketId={marketId} onClose={() => setReceiveOrder(null)} onReceived={u => { handleOrderUpdated(u); setReceiveOrder(null); fetchOrders(); }} />
      )}
      {showSupModal && marketId && (
        <SupplierModal marketId={marketId} onClose={() => setShowSupModal(false)} onSelect={(s: Supplier) => { setSuppliers(prev => { const idx = prev.findIndex(x => x.id === s.id); if (idx >= 0) { const n = [...prev]; n[idx] = s; return n; } return [...prev, s]; }); setShowSupModal(false); }} />
      )}
    </Layout>
  );
};

export default ShoppingListPage;
