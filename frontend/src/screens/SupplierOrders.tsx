import React, { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '../components/layout/Layout';
import ProductImage from '../components/product/ProductImage';
import SupplierModal from '../components/suppliers/SupplierModal';
import { useAuth } from '../context/AuthContext';
import { marketService } from '../services/market.service';
import { SupplierOrder, SupplierOrderItem, Supplier, ProductPerformance } from '../types/analytics.types';
import {
  CheckCircle2,
  ClipboardList,
  Package,
  Plus,
  Search,
  Send,
  Trash2,
  Truck,
  X,
  Building2,
  Edit2,
  Ban,
} from 'lucide-react';

/* ── Helpers ── */
const fmtMoney = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
const fmtQty = (v?: number | null, dec = 0) => Number(v || 0).toFixed(dec);
const fmtDate = (v?: string | null) => {
  if (!v) return '--';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '--' : d.toLocaleDateString('pt-BR');
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  RASCUNHO:  { label: 'Rascunho',  bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' },
  ENVIADO:   { label: 'Enviado',   bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
  ENTREGUE:  { label: 'Entregue', bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' },
  CANCELADO: { label: 'Cancelado', bg: '#fef2f2', text: '#b91c1c', dot: '#f87171' },
};

const UNIT_TYPES = ['UN', 'CX', 'KG', 'DZ', 'FD', 'PC'];
const UNIT_LABELS: Record<string, string> = { UN: 'Unidade', CX: 'Caixa', KG: 'Kg', DZ: 'Dúzia', FD: 'Fardo', PC: 'Pacote' };

/* ══════════════════════════════════════════════════════════════════
   StatusBadge
══════════════════════════════════════════════════════════════════ */
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.RASCUNHO;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  );
};

/* ══════════════════════════════════════════════════════════════════
   ProductSearchDropdown
══════════════════════════════════════════════════════════════════ */
interface ProductSearchProps {
  marketId: string;
  existingIds: Set<string>;
  onSelect: (p: ProductPerformance) => void;
}

const ProductSearchDropdown: React.FC<ProductSearchProps> = ({ marketId, existingIds, onSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductPerformance[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await marketService.searchProductCatalog(marketId, q, 0, 10);
      setResults(data?.content || []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, [marketId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 350);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Buscar produto para adicionar..."
          className="h-10 w-full rounded-xl pl-9 pr-9 text-sm outline-none"
          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
          value={query}
          onChange={handleChange}
          onFocus={() => query && setOpen(true)}
        />
        {query && (
          <button type="button" onClick={() => { setQuery(''); setResults([]); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && query && (
        <div className="absolute left-0 right-0 top-11 z-40 overflow-y-auto rounded-xl shadow-xl" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', maxHeight: '320px' }}>
          {loading && <div className="flex items-center justify-center py-5"><div className="h-4 w-4 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>}
          {!loading && results.length === 0 && <p className="py-5 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum produto encontrado para "{query}"</p>}
          {!loading && results.map((p) => {
            const already = existingIds.has(p.productId);
            return (
              <div key={p.productId} className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-soft)]" style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-soft)' }}>
                  <ProductImage src={p.imageUrl} alt={p.name} className="h-full w-full object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{p.category || 'Sem categoria'}</p>
                </div>
                {already ? (
                  <span className="text-xs font-semibold" style={{ color: 'var(--brand-700)' }}>Adicionado</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => { onSelect(p); setQuery(''); setResults([]); setOpen(false); }}
                    className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition hover:opacity-80"
                    style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}
                  >
                    <Plus className="h-3 w-3" /> Adicionar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   AddItemRow — inline form for a new item
══════════════════════════════════════════════════════════════════ */
interface AddItemRowProps {
  marketId: string;
  orderId: string;
  product: ProductPerformance;
  onSaved: (item: SupplierOrderItem) => void;
  onCancel: () => void;
}

const AddItemRow: React.FC<AddItemRowProps> = ({ marketId, orderId, product, onSaved, onCancel }) => {
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
  const subtotal = cost > 0 ? (parseFloat(qty) || 0) * cost : 0;

  const handleSave = async () => {
    if (!cost || cost <= 0) { setErr('Informe o custo unitário'); return; }
    if (!qty || parseFloat(qty) <= 0) { setErr('Informe a quantidade'); return; }
    setSaving(true); setErr(null);
    try {
      const item = await marketService.addSupplierOrderItem(marketId, orderId, {
        productId: product.productId,
        quantityRequested: parseFloat(qty),
        unitType,
        unitsPerPack: unitsPerPack ? parseFloat(unitsPerPack) : undefined,
        unitCost: cost,
        unitSalePrice: sale > 0 ? sale : undefined,
        note: note.trim() || undefined,
      });
      onSaved(item);
    } catch (e: any) {
      setErr(e?.message || 'Erro ao salvar item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ border: '1px solid var(--brand-200)', background: 'var(--surface-soft)' }}>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-base)' }}>
          <ProductImage src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{product.name}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{product.category}</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg p-1 transition hover:opacity-70" style={{ color: 'var(--text-muted)' }}><X className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Quantidade <span style={{ color: '#ef4444' }}>*</span></label>
          <input type="number" min="0.001" step="any" placeholder="1" value={qty} onChange={(e) => setQty(e.target.value)}
            className="h-9 w-full rounded-lg px-3 text-sm outline-none"
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Tipo</label>
          <select value={unitType} onChange={(e) => setUnitType(e.target.value)}
            className="h-9 w-full rounded-lg px-2 text-sm outline-none"
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
            {UNIT_TYPES.map((u) => <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>)}
          </select>
        </div>
        {(unitType === 'CX' || unitType === 'FD' || unitType === 'PC') && (
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Un./emb.</label>
            <input type="number" min="1" placeholder="Ex: 12" value={unitsPerPack} onChange={(e) => setUnitsPerPack(e.target.value)}
              className="h-9 w-full rounded-lg px-3 text-sm outline-none"
              style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Custo unit. <span style={{ color: '#ef4444' }}>*</span></label>
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
          {margin !== null && (
            <p className="mt-0.5 text-xs font-semibold" style={{ color: margin >= 20 ? '#16a34a' : margin >= 10 ? '#d97706' : '#dc2626' }}>
              Margem: {margin.toFixed(1)}%
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Observação</label>
          <input type="text" placeholder="Lote, validade..." value={note} onChange={(e) => setNote(e.target.value)}
            className="h-9 w-full rounded-lg px-3 text-sm outline-none"
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
        </div>
      </div>

      {cost > 0 && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>Subtotal estimado:</span>
          <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(subtotal)}</span>
        </div>
      )}

      {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-medium transition hover:opacity-80"
          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
          Cancelar
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--brand-500)', color: '#fff' }}>
          <Plus className="h-3.5 w-3.5" />
          {saving ? 'Adicionando...' : 'Adicionar ao pedido'}
        </button>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   OrderDetailModal — checkout / order builder
══════════════════════════════════════════════════════════════════ */
interface OrderDetailModalProps {
  order: SupplierOrder;
  marketId: string;
  onClose: () => void;
  onUpdated: (o: SupplierOrder) => void;
}

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ order: initialOrder, marketId, onClose, onUpdated }) => {
  const [order, setOrder] = useState<SupplierOrder>(initialOrder);
  const [addingProduct, setAddingProduct] = useState<ProductPerformance | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'send' | 'cancel' | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const existingIds = new Set(order.items.map((i) => i.productId));

  const refresh = useCallback(async () => {
    try {
      const fresh = await marketService.getSupplierOrder(marketId, order.id);
      setOrder(fresh);
      onUpdated(fresh);
    } catch { /* silent */ }
  }, [marketId, order.id, onUpdated]);

  const handleItemAdded = async (item: SupplierOrderItem) => {
    setAddingProduct(null);
    await refresh();
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!order.canEdit) return;
    setLoading(true);
    setActionErr(null);
    try {
      await marketService.removeSupplierOrderItem(marketId, order.id, itemId);
      await refresh();
    } catch (e: any) {
      setActionErr(e?.message || 'Erro ao remover item');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    setLoading(true); setActionErr(null);
    try {
      const updated = await marketService.sendSupplierOrder(marketId, order.id);
      setOrder(updated);
      onUpdated(updated);
      setConfirmAction(null);
    } catch (e: any) {
      setActionErr(e?.message || 'Erro ao enviar pedido');
    } finally { setLoading(false); }
  };

  const handleCancel = async () => {
    setLoading(true); setActionErr(null);
    try {
      const updated = await marketService.cancelSupplierOrder(marketId, order.id, cancelReason.trim() || undefined);
      setOrder(updated);
      onUpdated(updated);
      setConfirmAction(null);
    } catch (e: any) {
      setActionErr(e?.message || 'Erro ao cancelar pedido');
    } finally { setLoading(false); }
  };

  const supplierDisplay = order.supplierFantasia || order.supplierName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl shadow-2xl" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)', maxHeight: '92vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-5" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{order.orderNumber}</span>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-soft)' }}>
              <Building2 className="inline h-3 w-3 mr-1" />
              {supplierDisplay} · {fmtDate(order.orderDate)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition hover:opacity-70" style={{ color: 'var(--text-muted)' }}><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Product search — only RASCUNHO */}
          {order.canEdit && (
            <div className="p-5 pb-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Adicionar produto</p>
              <ProductSearchDropdown
                marketId={marketId}
                existingIds={existingIds}
                onSelect={(p) => setAddingProduct(p)}
              />
            </div>
          )}

          {/* Add item form */}
          {addingProduct && order.canEdit && (
            <div className="px-5 pb-3">
              <AddItemRow
                marketId={marketId}
                orderId={order.id}
                product={addingProduct}
                onSaved={handleItemAdded}
                onCancel={() => setAddingProduct(null)}
              />
            </div>
          )}

          {/* Items list */}
          <div className="px-5 pb-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Itens do pedido ({order.items.length})
            </p>
            {order.items.length === 0 ? (
              <div className="rounded-xl py-8 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
                <Package className="mx-auto mb-2 h-7 w-7 opacity-30" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum produto adicionado. Use a busca acima.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-base)' }}>
                      <ProductImage src={item.imageUrl} alt={item.productName} className="h-full w-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{item.productName}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--text-soft)' }}>
                        <span>{fmtQty(item.quantityRequested, 3).replace(/\.?0+$/, '')} {UNIT_LABELS[item.unitType] || item.unitType}</span>
                        {item.unitsPerPack && <span>· {item.unitsPerPack} un/emb</span>}
                        <span>· custo {fmtMoney(item.unitCost)}</span>
                        {item.unitSalePrice && <span>· venda {fmtMoney(item.unitSalePrice)}</span>}
                        {item.marginPercent != null && (
                          <span className="font-semibold" style={{ color: Number(item.marginPercent) >= 20 ? '#16a34a' : Number(item.marginPercent) >= 10 ? '#d97706' : '#dc2626' }}>
                            · {Number(item.marginPercent).toFixed(1)}%
                          </span>
                        )}
                        {item.quantityReceived != null && (
                          <span className="font-medium" style={{ color: 'var(--brand-700)' }}>· recebido: {fmtQty(item.quantityReceived, 3).replace(/\.?0+$/, '')}</span>
                        )}
                      </div>
                      {item.note && <p className="mt-0.5 text-xs italic" style={{ color: 'var(--text-muted)' }}>{item.note}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(item.subtotal)}</p>
                      {order.canEdit && (
                        <button type="button" onClick={() => handleRemoveItem(item.id)} disabled={loading} className="mt-1 transition hover:opacity-70 disabled:opacity-30" style={{ color: '#ef4444' }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Total */}
          {order.items.length > 0 && (
            <div className="mx-5 mb-3 flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--surface-success)', border: '1px solid var(--border-success)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--brand-700)' }}>Total do pedido</span>
              <span className="text-xl font-bold" style={{ color: 'var(--brand-700)' }}>{fmtMoney(order.totalValue)}</span>
            </div>
          )}

          {/* Notes */}
          {order.notes && (
            <div className="mx-5 mb-3 rounded-xl px-4 py-3" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Observações</p>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{order.notes}</p>
            </div>
          )}

          {/* Confirm panels */}
          {confirmAction === 'send' && (
            <div className="mx-5 mb-3 rounded-xl p-4" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <p className="mb-3 text-sm font-semibold" style={{ color: '#1d4ed8' }}>Confirmar envio do pedido?</p>
              <p className="mb-3 text-xs" style={{ color: '#1e40af' }}>O pedido passará para status ENVIADO. Você não poderá mais editar os itens.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmAction(null)} className="flex-1 rounded-lg py-2 text-sm font-medium transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>Cancelar</button>
                <button type="button" onClick={handleSend} disabled={loading} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50" style={{ background: '#2563eb', color: '#fff' }}>
                  <Send className="h-3.5 w-3.5" /> {loading ? 'Enviando...' : 'Confirmar envio'}
                </button>
              </div>
            </div>
          )}

          {confirmAction === 'cancel' && (
            <div className="mx-5 mb-3 rounded-xl p-4" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              <p className="mb-2 text-sm font-semibold text-red-700">Cancelar pedido?</p>
              <input type="text" placeholder="Motivo do cancelamento (opcional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                className="mb-3 h-9 w-full rounded-lg px-3 text-sm outline-none"
                style={{ border: '1px solid #fecaca', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmAction(null)} className="flex-1 rounded-lg py-2 text-sm font-medium transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>Voltar</button>
                <button type="button" onClick={handleCancel} disabled={loading} className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50" style={{ background: '#dc2626', color: '#fff' }}>
                  <Ban className="h-3.5 w-3.5" /> {loading ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
              </div>
            </div>
          )}

          {actionErr && <p className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{actionErr}</p>}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-5" style={{ borderTop: '1px solid var(--border-soft)' }}>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
            Fechar
          </button>
          <div className="flex gap-2">
            {order.canCancel && !confirmAction && (
              <button type="button" onClick={() => setConfirmAction('cancel')} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition hover:opacity-80" style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626' }}>
                <Ban className="h-3.5 w-3.5" /> Cancelar pedido
              </button>
            )}
            {order.canSend && !confirmAction && order.items.length > 0 && (
              <button type="button" onClick={() => setConfirmAction('send')} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition hover:opacity-90" style={{ background: '#2563eb', color: '#fff' }}>
                <Send className="h-3.5 w-3.5" /> Enviar pedido
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   ReceiveOrderModal
══════════════════════════════════════════════════════════════════ */
interface ReceiveOrderModalProps {
  order: SupplierOrder;
  marketId: string;
  onClose: () => void;
  onReceived: (o: SupplierOrder) => void;
}

const ReceiveOrderModal: React.FC<ReceiveOrderModalProps> = ({ order, marketId, onClose, onReceived }) => {
  const [receivedQtys, setReceivedQtys] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    order.items.forEach((i) => { init[i.id] = String(i.quantityRequested); });
    return init;
  });
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleReceive = async () => {
    setSaving(true); setErr(null);
    try {
      const items = order.items.map((i) => ({
        itemId: i.id,
        quantityReceived: parseFloat(receivedQtys[i.id]) || Number(i.quantityRequested),
      }));
      const updated = await marketService.receiveSupplierOrder(marketId, order.id, {
        items,
        receivedAt: new Date(receivedAt).toISOString().slice(0, 19),
      });
      onReceived(updated);
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Erro ao receber pedido');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex w-full max-w-lg flex-col gap-0 overflow-hidden rounded-2xl shadow-2xl" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Receber pedido {order.orderNumber}</p>
            <p className="text-xs" style={{ color: 'var(--text-soft)' }}>Confirme as quantidades recebidas. O estoque e histórico de compras serão atualizados.</p>
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

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Quantidades recebidas</p>
            <div className="flex flex-col gap-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-base)' }}>
                    <ProductImage src={item.imageUrl} alt={item.productName} className="h-full w-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.productName}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pedido: {fmtQty(item.quantityRequested, 3).replace(/\.?0+$/, '')} {UNIT_LABELS[item.unitType] || item.unitType}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className="h-9 w-24 rounded-lg px-2 text-center text-sm outline-none"
                      style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
                      value={receivedQtys[item.id] ?? String(item.quantityRequested)}
                      onChange={(e) => setReceivedQtys((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-soft)' }}>{UNIT_LABELS[item.unitType] || item.unitType}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-3" style={{ background: 'var(--surface-success)', border: '1px solid var(--border-success)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--brand-700)' }}>
              Ao confirmar, o histórico de preços de compra será registrado para cada produto e o status do pedido passará para ENTREGUE.
            </p>
          </div>

          {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 p-5" style={{ borderTop: '1px solid var(--border-soft)' }}>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
            Cancelar
          </button>
          <button type="button" onClick={handleReceive} disabled={saving} className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50" style={{ background: '#16a34a', color: '#fff' }}>
            <Truck className="h-4 w-4" />
            {saving ? 'Registrando...' : 'Confirmar recebimento'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   CreateOrderModal — select supplier and create order
══════════════════════════════════════════════════════════════════ */
interface CreateOrderModalProps {
  marketId: string;
  onClose: () => void;
  onCreated: (o: SupplierOrder) => void;
}

const CreateOrderModal: React.FC<CreateOrderModalProps> = ({ marketId, onClose, onCreated }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSup, setLoadingSup] = useState(true);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    marketService.getSuppliers(marketId)
      .then((data) => setSuppliers(data || []))
      .catch(() => setSuppliers([]))
      .finally(() => setLoadingSup(false));
  }, [marketId]);

  const handleCreate = async () => {
    if (!selectedSupplier) { setErr('Selecione um fornecedor'); return; }
    setSaving(true); setErr(null);
    try {
      const order = await marketService.createSupplierOrder(marketId, { supplierId: selectedSupplier.id, notes: notes.trim() || undefined });
      onCreated(order);
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Erro ao criar pedido');
    } finally { setSaving(false); }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="w-full max-w-md overflow-hidden rounded-2xl shadow-2xl" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
          <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border-soft)' }}>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Novo pedido</p>
              <p className="text-xs" style={{ color: 'var(--text-soft)' }}>Selecione o fornecedor e crie o rascunho</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition hover:opacity-70" style={{ color: 'var(--text-muted)' }}><X className="h-4 w-4" /></button>
          </div>

          <div className="flex flex-col gap-4 p-5">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Fornecedor <span style={{ color: '#ef4444' }}>*</span></label>
              {loadingSup ? (
                <div className="flex items-center justify-center py-4"><div className="h-4 w-4 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /></div>
              ) : (
                <div className="flex flex-col gap-2">
                  {suppliers.length > 0 && (
                    <div className="max-h-52 overflow-y-auto rounded-xl border flex flex-col" style={{ borderColor: 'var(--border-strong)' }}>
                      {suppliers.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSelectedSupplier(s)}
                          className="flex items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-soft)]"
                          style={{
                            borderBottom: '1px solid var(--border-soft)',
                            background: selectedSupplier?.id === s.id ? 'var(--surface-success)' : 'transparent',
                          }}
                        >
                          <Building2 className="h-4 w-4 shrink-0" style={{ color: selectedSupplier?.id === s.id ? 'var(--brand-700)' : 'var(--text-muted)' }} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.nomeFantasia || s.razaoSocial}</p>
                            {s.nomeFantasia && <p className="text-xs truncate" style={{ color: 'var(--text-soft)' }}>{s.razaoSocial}</p>}
                          </div>
                          {selectedSupplier?.id === s.id && <CheckCircle2 className="h-4 w-4 shrink-0 ml-auto" style={{ color: 'var(--brand-700)' }} />}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSupplierModal(true)}
                    className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:opacity-80"
                    style={{ border: '1px dashed var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-soft)' }}
                  >
                    <Plus className="h-4 w-4" /> Cadastrar novo fornecedor
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Observações</label>
              <textarea rows={2} placeholder="Condições de pagamento, prazo de entrega..." value={notes} onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }} />
            </div>

            {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
          </div>

          <div className="flex items-center justify-end gap-3 p-5" style={{ borderTop: '1px solid var(--border-soft)' }}>
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
              Cancelar
            </button>
            <button type="button" onClick={handleCreate} disabled={saving || !selectedSupplier} className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--brand-500)', color: '#fff' }}>
              <Plus className="h-4 w-4" />
              {saving ? 'Criando...' : 'Criar pedido'}
            </button>
          </div>
        </div>
      </div>

      {showSupplierModal && (
        <SupplierModal
          marketId={marketId}
          onClose={() => setShowSupplierModal(false)}
          onSelect={(s: Supplier) => {
            setSelectedSupplier(s);
            setShowSupplierModal(false);
            // refresh suppliers list
            marketService.getSuppliers(marketId).then((data) => setSuppliers(data || [])).catch(() => {});
          }}
        />
      )}
    </>
  );
};

/* ══════════════════════════════════════════════════════════════════
   OrderCard
══════════════════════════════════════════════════════════════════ */
const OrderCard: React.FC<{
  order: SupplierOrder;
  onOpen: () => void;
  onReceive: () => void;
  onUpdated: (o: SupplierOrder) => void;
  marketId: string;
}> = ({ order, onOpen, onReceive, onUpdated, marketId }) => {
  const [deleting, setDeleting] = useState(false);
  const supplierDisplay = order.supplierFantasia || order.supplierName;

  const handleDelete = async () => {
    if (!window.confirm(`Excluir rascunho ${order.orderNumber}?`)) return;
    setDeleting(true);
    try {
      await marketService.deleteSupplierOrder(marketId, order.id);
      onUpdated({ ...order, status: 'CANCELADO' }); // trigger refresh via parent
    } catch { /* no-op */ }
    finally { setDeleting(false); }
  };

  return (
    <div className="flex flex-col rounded-xl transition" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}>
      <div className="flex items-start gap-3 p-4">
        <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl" style={{ background: 'var(--surface-soft)' }}>
          <Building2 className="h-5 w-5" style={{ color: 'var(--text-muted)' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{order.orderNumber}</span>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{supplierDisplay}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--text-soft)' }}>
            <span>{order.itemCount} {order.itemCount === 1 ? 'produto' : 'produtos'}</span>
            <span>· {fmtDate(order.orderDate)}</span>
            {order.sentAt && <span>· enviado {fmtDate(order.sentAt)}</span>}
            {order.deliveredAt && <span>· entregue {fmtDate(order.deliveredAt)}</span>}
            {order.cancelledAt && <span>· cancelado {fmtDate(order.cancelledAt)}</span>}
          </div>
          {order.cancelReason && <p className="mt-0.5 text-xs italic" style={{ color: '#dc2626' }}>{order.cancelReason}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(order.totalValue)}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>total</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--border-soft)' }}>
        <button type="button" onClick={onOpen} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
          {order.canEdit ? <><Edit2 className="h-3 w-3" /> Editar pedido</> : <><ClipboardList className="h-3 w-3" /> Ver detalhes</>}
        </button>
        {order.canReceive && (
          <button type="button" onClick={onReceive} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80" style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
            <Truck className="h-3 w-3" /> Receber mercadoria
          </button>
        )}
        {order.status === 'RASCUNHO' && (
          <button type="button" onClick={handleDelete} disabled={deleting} className="ml-auto flex items-center gap-1 text-xs transition hover:opacity-70 disabled:opacity-30" style={{ color: '#ef4444' }}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   Main Page
══════════════════════════════════════════════════════════════════ */
const SupplierOrdersPage: React.FC = () => {
  const { marketId } = useAuth();
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailOrder, setDetailOrder] = useState<SupplierOrder | null>(null);
  const [receiveOrder, setReceiveOrder] = useState<SupplierOrder | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!marketId) return;
    setLoading(true); setError(null);
    try {
      const data = await marketService.listSupplierOrders(marketId, statusFilter || undefined);
      setOrders(data || []);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar pedidos');
    } finally { setLoading(false); }
  }, [marketId, statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleOrderUpdated = useCallback((updated: SupplierOrder) => {
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === updated.id);
      if (idx === -1) return prev;
      // if status changed to CANCELADO and we deleted, re-fetch
      if (updated.status === 'CANCELADO' && prev[idx].status !== 'CANCELADO') {
        fetchOrders();
        return prev;
      }
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }, [fetchOrders]);

  const openDetail = useCallback(async (order: SupplierOrder) => {
    if (!marketId) return;
    try {
      const full = await marketService.getSupplierOrder(marketId, order.id);
      setDetailOrder(full);
    } catch {
      setDetailOrder(order);
    }
  }, [marketId]);

  const statusCounts = {
    '': orders.length,
    RASCUNHO: orders.filter((o) => o.status === 'RASCUNHO').length,
    ENVIADO: orders.filter((o) => o.status === 'ENVIADO').length,
    ENTREGUE: orders.filter((o) => o.status === 'ENTREGUE').length,
    CANCELADO: orders.filter((o) => o.status === 'CANCELADO').length,
  };

  const FILTER_TABS: Array<{ key: string; label: string }> = [
    { key: '', label: 'Todos' },
    { key: 'RASCUNHO', label: 'Rascunho' },
    { key: 'ENVIADO', label: 'Enviados' },
    { key: 'ENTREGUE', label: 'Entregues' },
    { key: 'CANCELADO', label: 'Cancelados' },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Pedidos a fornecedores</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Gerencie pedidos de compra, acompanhe entregas e registre histórico de preços</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-90"
            style={{ background: 'var(--brand-500)', color: '#fff' }}
          >
            <Plus className="h-4 w-4" /> Novo pedido
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2">
          {FILTER_TABS.map((tab) => {
            const active = statusFilter === tab.key;
            const cfg = tab.key ? STATUS_CONFIG[tab.key] : null;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition"
                style={active
                  ? { background: cfg?.bg || 'var(--brand-500)', color: cfg?.text || '#fff', border: `1px solid ${cfg?.dot || 'var(--brand-600)'}` }
                  : { background: 'var(--surface-base)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}
              >
                {tab.label}
                <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: active ? 'rgba(0,0,0,0.1)' : 'var(--surface-muted)', color: active ? 'inherit' : 'var(--text-muted)' }}>
                  {statusCounts[tab.key as keyof typeof statusCounts] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl py-16 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
            <ClipboardList className="mx-auto mb-3 h-10 w-10 opacity-20" style={{ color: 'var(--text-muted)' }} />
            <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Nenhum pedido encontrado</p>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              {statusFilter ? `Sem pedidos com status "${STATUS_CONFIG[statusFilter]?.label}".` : 'Crie seu primeiro pedido para um fornecedor.'}
            </p>
            {!statusFilter && (
              <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition hover:opacity-90" style={{ background: 'var(--brand-500)', color: '#fff' }}>
                <Plus className="h-4 w-4" /> Criar pedido
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                marketId={marketId!}
                onOpen={() => openDetail(order)}
                onReceive={() => setReceiveOrder(order)}
                onUpdated={handleOrderUpdated}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && marketId && (
        <CreateOrderModal
          marketId={marketId}
          onClose={() => setShowCreate(false)}
          onCreated={(o) => {
            setOrders((prev) => [o, ...prev]);
            setShowCreate(false);
            openDetail(o);
          }}
        />
      )}

      {detailOrder && marketId && (
        <OrderDetailModal
          order={detailOrder}
          marketId={marketId}
          onClose={() => setDetailOrder(null)}
          onUpdated={(updated) => {
            handleOrderUpdated(updated);
            setDetailOrder(updated);
          }}
        />
      )}

      {receiveOrder && marketId && (
        <ReceiveOrderModal
          order={receiveOrder}
          marketId={marketId}
          onClose={() => setReceiveOrder(null)}
          onReceived={(updated) => {
            handleOrderUpdated(updated);
            setReceiveOrder(null);
            fetchOrders();
          }}
        />
      )}
    </Layout>
  );
};

export default SupplierOrdersPage;
