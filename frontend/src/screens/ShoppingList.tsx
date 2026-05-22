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
} from '../types/analytics.types';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  ArrowRight,
  Search,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  Plus,
} from 'lucide-react';

/* ─── Formatadores ─── */
const fmtMoney = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
const fmtQty = (v?: number | null) => Number(v || 0).toFixed(0);
const fmtDate = (v?: string | null) => {
  if (!v) return '--';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '--' : d.toLocaleDateString('pt-BR');
};
const fmtPct = (v?: number | null) => {
  const n = Number(v || 0);
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
};

const suggestedQuantity = (product: ProductPerformance) => {
  const v = Number(product.salesVelocity || 0);
  if (v >= 8) return 24;
  if (v >= 4) return 12;
  if (v >= 2) return 6;
  return 3;
};

/* ─── Modal de registrar compra ─── */
interface RecordPurchaseModalProps {
  item: ShoppingListItem;
  marketId: string;
  onClose: () => void;
  onSaved: () => void;
}

const RecordPurchaseModal: React.FC<RecordPurchaseModalProps> = ({ item, marketId, onClose, onSaved }) => {
  const [unitCost, setUnitCost] = useState('');
  const [unitSalePrice, setUnitSalePrice] = useState('');
  const [qty, setQty] = useState(String(item.quantityTarget || 1));
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PurchasePriceHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    marketService.getPurchaseHistory(marketId, item.productId)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [marketId, item.productId]);

  const lastEntry = history[0];
  const cost = parseFloat(unitCost.replace(',', '.')) || 0;
  const salePrice = parseFloat(unitSalePrice.replace(',', '.')) || 0;
  const margin = cost > 0 && salePrice > 0 ? ((salePrice - cost) / cost) * 100 : null;
  const deltaVsLast = lastEntry && cost > 0
    ? ((cost - Number(lastEntry.unitCost)) / Number(lastEntry.unitCost)) * 100
    : null;

  const handleSave = async () => {
    if (!cost || cost <= 0) { setError('Informe o custo unitário'); return; }
    setSaving(true);
    setError(null);
    try {
      await marketService.recordPurchase(marketId, {
        productId: item.productId,
        shoppingListItemId: item.id,
        quantityPurchased: parseFloat(qty) || 1,
        unitCost: cost,
        unitSalePrice: salePrice > 0 ? salePrice : undefined,
        supplierName: supplier.trim() || undefined,
        note: note.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao registrar compra');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-full max-w-lg flex-col gap-0 overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-soft)' }}>
              <ProductImage src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-soft)' }}>Registrar compra</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Comparação com última compra */}
          {!loadingHistory && lastEntry && (
            <div className="mx-5 mt-4 rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Última compra — {fmtDate(lastEntry.purchasedAt)}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[0.65rem]" style={{ color: 'var(--text-soft)' }}>Custo</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(lastEntry.unitCost)}</p>
                </div>
                {lastEntry.unitSalePrice && (
                  <div>
                    <p className="text-[0.65rem]" style={{ color: 'var(--text-soft)' }}>Venda</p>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(lastEntry.unitSalePrice)}</p>
                  </div>
                )}
                {lastEntry.marginPercent && (
                  <div>
                    <p className="text-[0.65rem]" style={{ color: 'var(--text-soft)' }}>Margem</p>
                    <p className="text-sm font-bold" style={{ color: 'var(--brand-600)' }}>{Number(lastEntry.marginPercent).toFixed(1)}%</p>
                  </div>
                )}
              </div>
              {lastEntry.supplierName && (
                <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>Fornecedor: {lastEntry.supplierName}</p>
              )}
            </div>
          )}

          {/* Formulário */}
          <div className="flex flex-col gap-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  Custo unitário <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-soft)' }}>R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    className="h-10 w-full rounded-lg pl-8 pr-3 text-sm outline-none"
                    style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }}
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                  />
                </div>
                {deltaVsLast !== null && cost > 0 && (
                  <p
                    className="mt-1 flex items-center gap-1 text-xs font-semibold"
                    style={{ color: deltaVsLast > 1 ? '#dc2626' : deltaVsLast < -1 ? '#16a34a' : 'var(--text-soft)' }}
                  >
                    {deltaVsLast > 1 ? <TrendingUp className="h-3 w-3" /> : deltaVsLast < -1 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                    {deltaVsLast > 0 ? '+' : ''}{deltaVsLast.toFixed(1)}% vs. última
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  Preço de venda
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-soft)' }}>R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    className="h-10 w-full rounded-lg pl-8 pr-3 text-sm outline-none"
                    style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }}
                    value={unitSalePrice}
                    onChange={(e) => setUnitSalePrice(e.target.value)}
                  />
                </div>
                {margin !== null && (
                  <p
                    className="mt-1 text-xs font-semibold"
                    style={{ color: margin >= 20 ? '#16a34a' : margin >= 10 ? '#d97706' : '#dc2626' }}
                  >
                    Margem: {margin.toFixed(1)}%
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  Qtd. comprada
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="1"
                  className="h-10 w-full rounded-lg px-3 text-sm outline-none"
                  style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  Fornecedor
                </label>
                <input
                  type="text"
                  placeholder="Nome do fornecedor"
                  className="h-10 w-full rounded-lg px-3 text-sm outline-none"
                  style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }}
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                Observação
              </label>
              <textarea
                rows={2}
                placeholder="Lote, validade, condição de pagamento..."
                className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          </div>

          {/* Histórico de preços */}
          {!loadingHistory && history.length > 0 && (
            <div className="px-5 pb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Histórico de compras ({history.length})
              </p>
              <div className="flex flex-col gap-2">
                {history.slice(0, 6).map((h, idx) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                    style={{ background: idx === 0 ? 'var(--surface-success)' : 'var(--surface-soft)', border: `1px solid ${idx === 0 ? 'var(--border-success)' : 'var(--border-soft)'}` }}
                  >
                    <div className="flex items-center gap-2">
                      {h.costTrend === 'UP' && <TrendingUp className="h-3.5 w-3.5 shrink-0" style={{ color: '#dc2626' }} />}
                      {h.costTrend === 'DOWN' && <TrendingDown className="h-3.5 w-3.5 shrink-0" style={{ color: '#16a34a' }} />}
                      {(h.costTrend === 'STABLE' || h.costTrend === 'FIRST') && <Minus className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-soft)' }} />}
                      <div>
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {fmtMoney(h.unitCost)}
                          {h.unitSalePrice && <span className="ml-1.5 font-normal" style={{ color: 'var(--text-soft)' }}>→ venda {fmtMoney(h.unitSalePrice)}</span>}
                        </p>
                        <p className="text-[0.65rem]" style={{ color: 'var(--text-soft)' }}>
                          {fmtDate(h.purchasedAt)}{h.supplierName ? ` · ${h.supplierName}` : ''}
                        </p>
                      </div>
                    </div>
                    {h.costDeltaPercent != null && (
                      <span
                        className="shrink-0 text-xs font-semibold"
                        style={{ color: Number(h.costDeltaPercent) > 1 ? '#dc2626' : Number(h.costDeltaPercent) < -1 ? '#16a34a' : 'var(--text-soft)' }}
                      >
                        {fmtPct(h.costDeltaPercent)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5" style={{ borderTop: '1px solid var(--border-soft)' }}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80"
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !unitCost}
            className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--brand-500)', color: '#fff' }}
          >
            <ShoppingCart className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Registrar compra'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Busca de catálogo ─── */
interface CatalogSearchProps {
  marketId: string;
  productIds: Set<string>;
  onAdd: (product: ProductPerformance) => Promise<void>;
}

const CatalogSearch: React.FC<CatalogSearchProps> = ({ marketId, productIds, onAdd }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductPerformance[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await marketService.searchProductCatalog(marketId, q, 0, 10);
      setResults(data?.content || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 350);
  };

  const handleAdd = async (product: ProductPerformance) => {
    await onAdd(product);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Buscar produto no catálogo..."
          className="h-10 w-full rounded-xl py-2 pl-9 pr-9 text-sm outline-none transition"
          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
          value={query}
          onChange={handleChange}
          onFocus={() => query && setOpen(true)}
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && query && (
        <div
          className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-xl shadow-lg"
          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', maxHeight: '380px', overflowY: 'auto' }}
        >
          {loading && (
            <div className="flex items-center justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            </div>
          )}
          {!loading && results.length === 0 && (
            <p className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Nenhum produto encontrado para "{query}"
            </p>
          )}
          {!loading && results.map((product) => {
            const inList = productIds.has(product.productId);
            return (
              <div
                key={product.productId}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-soft)]"
                style={{ borderBottom: '1px solid var(--border-soft)' }}
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-soft)' }}>
                  <ProductImage src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{product.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-soft)' }}>
                    Giro {Number(product.salesVelocity || 0).toFixed(1)}/dia
                    {Number(product.revenueTrendPercentage) > 0 ? ' · tendência +' : ' · tendência '}
                    {Number(product.revenueTrendPercentage || 0).toFixed(0)}%
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-xs font-semibold" style={{ color: 'var(--brand-600)' }}>
                    {fmtMoney(product.averagePrice)}
                  </p>
                  {inList ? (
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--brand-700)' }}>Na lista</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleAdd(product)}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition hover:opacity-80"
                      style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}
                    >
                      <Plus className="h-3 w-3" /> Adicionar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ─── ListItem expandido ─── */
const ListItem: React.FC<{
  item: ShoppingListItem;
  marketId: string;
  histRefresh: number;
  onToggle: (checked: boolean) => Promise<unknown>;
  onUpdate: (p: { quantityTarget?: number; note?: string }) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
  onRecordPurchase: () => void;
}> = ({ item, marketId, histRefresh, onToggle, onUpdate, onRemove, onRecordPurchase }) => {
  const [qty, setQty] = useState(String(item.quantityTarget || 1));
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<PurchasePriceHistory[]>([]);
  const [histLoaded, setHistLoaded] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistLoaded(true);
    try {
      const data = await marketService.getPurchaseHistory(marketId, item.productId);
      setHistory(data || []);
    } catch {
      setHistory([]);
    }
  }, [marketId, item.productId]);

  // Load on mount for inline last-purchase summary
  useEffect(() => { loadHistory(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when a new purchase is recorded
  useEffect(() => {
    if (histLoaded) loadHistory();
  }, [histRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExpand = () => {
    if (!expanded && !histLoaded) loadHistory();
    setExpanded((v) => !v);
  };

  const lastPurchase = history[0];

  return (
    <div
      className={`flex flex-col rounded-xl transition ${item.checked ? 'opacity-60' : ''}`}
      style={{ border: `1px solid ${item.checked ? 'var(--border-soft)' : 'var(--border-strong)'}`, background: 'var(--surface-base)' }}
    >
      {/* Linha principal */}
      <div className="flex items-start gap-3 p-4">
        <button
          type="button"
          onClick={() => void onToggle(!item.checked)}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${item.checked ? 'border-green-500 bg-green-500 text-white' : 'border-slate-300 hover:border-green-400'}`}
        >
          {item.checked && <CheckCircle2 className="h-4 w-4" />}
        </button>

        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
          <ProductImage src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${item.checked ? 'line-through' : ''}`} style={{ color: item.checked ? 'var(--text-soft)' : 'var(--text-primary)' }}>
                {item.name}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{item.category || 'Sem categoria'}</p>
            </div>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
              {item.sourceTag.replace(/_/g, ' ')}
            </span>
          </div>

          {item.reasonSummary && (
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{item.reasonSummary}</p>
          )}

          {/* Última compra resumida */}
          {lastPurchase && (
            <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: 'var(--text-soft)' }}>
              <Clock className="h-3 w-3 shrink-0" />
              <span>Última compra: {fmtMoney(lastPurchase.unitCost)}</span>
              {lastPurchase.costDeltaPercent != null && (
                <span style={{ color: Number(lastPurchase.costDeltaPercent) > 1 ? '#dc2626' : Number(lastPurchase.costDeltaPercent) < -1 ? '#16a34a' : 'var(--text-soft)' }}>
                  ({fmtPct(lastPurchase.costDeltaPercent)})
                </span>
              )}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              Qtd:
              <input
                type="number"
                min="1"
                className="h-7 w-16 rounded px-2 text-center text-xs outline-none"
                style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onBlur={() => void onUpdate({ quantityTarget: Math.max(1, Number(qty || 1)) })}
              />
            </label>

            <button
              type="button"
              onClick={onRecordPurchase}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition hover:opacity-80"
              style={{ background: 'var(--surface-success)', color: 'var(--brand-700)', border: '1px solid var(--border-success)' }}
            >
              <ShoppingCart className="h-3 w-3" /> Registrar compra
            </button>

            <Link to={`/app/produtos/${item.productId}`} className="flex items-center gap-1 text-xs font-medium no-underline hover:opacity-70" style={{ color: 'var(--brand-600)' }}>
              Ver <ArrowRight className="h-3 w-3" />
            </Link>

            <button type="button" onClick={() => void onRemove()} className="text-xs hover:opacity-70" style={{ color: '#ef4444' }}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={handleExpand}
              className="ml-auto flex items-center gap-1 text-xs transition hover:opacity-70"
              style={{ color: 'var(--text-muted)' }}
            >
              <Clock className="h-3.5 w-3.5" />
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>

      {/* Painel expandido: histórico de preços */}
      {expanded && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Histórico de preços de compra
          </p>
          {history.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhuma compra registrada. Clique em "Registrar compra" para começar.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((h, idx) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                  style={{ background: idx === 0 ? 'var(--surface-success)' : 'var(--surface-soft)', border: `1px solid ${idx === 0 ? 'var(--border-success)' : 'var(--border-soft)'}` }}
                >
                  <div className="flex items-center gap-2">
                    {h.costTrend === 'UP' && <TrendingUp className="h-3.5 w-3.5 shrink-0" style={{ color: '#dc2626' }} />}
                    {h.costTrend === 'DOWN' && <TrendingDown className="h-3.5 w-3.5 shrink-0" style={{ color: '#16a34a' }} />}
                    {(h.costTrend === 'STABLE' || h.costTrend === 'FIRST') && <Minus className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-soft)' }} />}
                    <div>
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Custo {fmtMoney(h.unitCost)}
                        {h.unitSalePrice && <span className="ml-1.5 font-normal" style={{ color: 'var(--text-soft)' }}>· venda {fmtMoney(h.unitSalePrice)}</span>}
                        {h.marginPercent && <span className="ml-1.5 font-semibold" style={{ color: 'var(--brand-600)' }}>({Number(h.marginPercent).toFixed(1)}% margem)</span>}
                      </p>
                      <p className="text-[0.65rem]" style={{ color: 'var(--text-soft)' }}>
                        {fmtDate(h.purchasedAt)} · {fmtQty(h.quantityPurchased)} un
                        {h.supplierName ? ` · ${h.supplierName}` : ''}
                      </p>
                      {h.note && <p className="text-[0.65rem] italic" style={{ color: 'var(--text-muted)' }}>{h.note}</p>}
                    </div>
                  </div>
                  {h.costDeltaPercent != null && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold"
                      style={{
                        background: Number(h.costDeltaPercent) > 1 ? '#fee2e2' : Number(h.costDeltaPercent) < -1 ? '#dcfce7' : 'var(--surface-muted)',
                        color: Number(h.costDeltaPercent) > 1 ? '#dc2626' : Number(h.costDeltaPercent) < -1 ? '#16a34a' : 'var(--text-soft)',
                      }}
                    >
                      {fmtPct(h.costDeltaPercent)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── SuggestionRow ─── */
const SuggestionRow: React.FC<{ product: ProductPerformance; label: string; onAdd: () => Promise<void>; inList: boolean }> = ({ product, label, onAdd, inList }) => (
  <div className="flex items-center gap-3 rounded-lg p-3 transition" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
      <ProductImage src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{product.name}</p>
      <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{label}</p>
    </div>
    {inList ? (
      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}>Na lista</span>
    ) : (
      <button
        type="button"
        onClick={() => void onAdd()}
        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
        style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}
      >
        <Plus className="h-3 w-3" /> Adicionar
      </button>
    )}
  </div>
);

/* ═══════════════════════════════════════════════════════ */

const ShoppingListPage: React.FC = () => {
  const { marketId } = useAuth();
  const { dashboard, loading: dLoading, error: dError } = useMarketData();
  const { overview, items, productIds, loading, error, addItem, updateItem, removeItem } = useShoppingList();
  const [recordModal, setRecordModal] = useState<ShoppingListItem | null>(null);
  const [histRefresh, setHistRefresh] = useState(0);

  const restockSuggestions = useMemo(
    () => (dashboard?.replenishmentCandidates || []).filter((p) => !productIds.has(p.productId)).slice(0, 8),
    [dashboard?.replenishmentCandidates, productIds]
  );
  const lowProducts = useMemo(() => (dashboard?.lowTurnoverProducts || []).slice(0, 6), [dashboard?.lowTurnoverProducts]);

  const handleAdd = async (product: ProductPerformance, sourceTag: string, reason: string) => {
    await addItem({ productId: product.productId, quantityTarget: suggestedQuantity(product), sourceTag, reasonSummary: reason });
  };

  const handleCatalogAdd = async (product: ProductPerformance) => {
    await addItem({
      productId: product.productId,
      quantityTarget: suggestedQuantity(product),
      sourceTag: 'MANUAL',
      reasonSummary: `Giro ${Number(product.salesVelocity || 0).toFixed(1)}/dia · adicionado via busca`,
    });
  };

  const urgentItems    = items.filter((i) => !i.checked && Number(i.quantityTarget || 0) >= 10);
  const reinforceItems = items.filter((i) => !i.checked && Number(i.quantityTarget || 0) >= 3 && Number(i.quantityTarget || 0) < 10);
  const regularItems   = items.filter((i) => !i.checked && Number(i.quantityTarget || 0) < 3);
  const checkedItems   = items.filter((i) => i.checked);

  if (loading || dLoading) {
    return (
      <Layout>
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (error || dError) {
    return (
      <Layout>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">{error || dError}</p>
        </div>
      </Layout>
    );
  }

  const renderGroup = (title: string, icon: React.ReactNode, groupStyle: React.CSSProperties, groupItems: ShoppingListItem[]) => {
    if (groupItems.length === 0) return null;
    return (
      <div>
        <div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2" style={groupStyle}>
          {icon}
          <span className="text-sm font-semibold">{title} ({groupItems.length})</span>
        </div>
        <div className="flex flex-col gap-3">
          {groupItems.map((item) => (
            <ListItem
              key={item.id}
              item={item}
              marketId={marketId!}
              histRefresh={histRefresh}
              onToggle={(c) => updateItem(item.id, { checked: c })}
              onUpdate={(p) => updateItem(item.id, p)}
              onRemove={() => removeItem(item.id)}
              onRecordPurchase={() => setRecordModal(item)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Pedido inteligente</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Compra guiada por vendas reais — registre custos e acompanhe seu histórico de preços</p>
          </div>
          <button
            type="button"
            onClick={() => { console.log('Export:', items); alert('Lista exportada no console!'); }}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80"
            style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
          >
            <ArrowRight className="h-4 w-4" /> Exportar
          </button>
        </div>

        {/* Busca de catálogo */}
        {marketId && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Adicionar produto ao pedido
            </p>
            <CatalogSearch
              marketId={marketId}
              productIds={productIds}
              onAdd={handleCatalogAdd}
            />
          </div>
        )}

        {/* KPI summary */}
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Na lista', value: overview.totalItems, color: 'var(--text-primary)' },
            { label: 'Pendentes', value: overview.pendingItems, color: '#d97706' },
            { label: 'Comprados', value: overview.checkedItems, color: 'var(--brand-700)' },
            { label: 'Sugestões', value: restockSuggestions.length, color: '#1d4ed8' },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{kpi.label}</span>
              <p className="mt-1 text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Grouped list */}
        <div className="flex flex-col gap-6">
          {items.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <ShoppingCart className="mx-auto mb-3 h-8 w-8 opacity-30" style={{ color: 'var(--text-muted)' }} />
              <p style={{ color: 'var(--text-muted)' }}>A lista está vazia. Use a busca acima ou as sugestões abaixo para começar.</p>
            </div>
          ) : (
            <>
              {renderGroup('Urgente — quantidade alta', <AlertTriangle className="h-4 w-4 text-red-600" />, { background: '#fef2f2', color: '#991b1b' }, urgentItems)}
              {renderGroup('Reforçar — giro acelerando', <Clock className="h-4 w-4 text-amber-600" />, { background: '#fffbeb', color: '#92400e' }, reinforceItems)}
              {renderGroup('Manter — compra regular', <CheckCircle2 className="h-4 w-4 text-green-600" />, { background: 'var(--surface-success)', color: 'var(--brand-700)' }, regularItems)}
              {renderGroup('Comprados', <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--text-soft)' }} />, { background: 'var(--surface-soft)', color: 'var(--text-muted)' }, checkedItems)}
            </>
          )}
        </div>

        {/* Restock suggestions */}
        {restockSuggestions.length > 0 && (
          <div>
            <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Sugestões de reposição</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {restockSuggestions.map((p) => (
                <SuggestionRow
                  key={p.productId}
                  product={p}
                  label={`Giro ${Number(p.salesVelocity || 0).toFixed(1)}/dia`}
                  inList={productIds.has(p.productId)}
                  onAdd={() => handleAdd(p, 'REPOSIÇÃO', `Repor ${p.name}. Giro: ${Number(p.salesVelocity || 0).toFixed(1)}/dia.`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Caution products */}
        {lowProducts.length > 0 && (
          <div>
            <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Compra com cautela</h2>
            <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>Produtos com baixa tração. Reduza pedido ou revise posicionamento.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {lowProducts.map((p) => (
                <div
                  key={p.productId}
                  className="flex items-center gap-3 rounded-lg p-3"
                  style={{ border: '1px solid var(--border-danger)', background: 'var(--surface-danger)' }}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-base)' }}>
                    <ProductImage src={p.imageUrl} alt={p.name} className="h-full w-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                    <p className="text-xs text-red-500">Giro {Number(p.salesVelocity || 0).toFixed(1)}/dia</p>
                  </div>
                  <Link to={`/app/produtos/${p.productId}`} className="text-xs font-medium text-red-500 no-underline hover:text-red-700">
                    Analisar
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de registro de compra */}
      {recordModal && marketId && (
        <RecordPurchaseModal
          item={recordModal}
          marketId={marketId}
          onClose={() => setRecordModal(null)}
          onSaved={() => setHistRefresh((v) => v + 1)}
        />
      )}
    </Layout>
  );
};

export default ShoppingListPage;
