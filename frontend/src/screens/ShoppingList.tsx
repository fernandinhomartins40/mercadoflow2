import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import ProductImage from '../components/product/ProductImage';
import { useMarketData } from '../hooks/useMarketData';
import { useShoppingList } from '../hooks/useShoppingList';
import { ProductPairInsight, ProductPerformance, ShoppingListItem } from '../types/analytics.types';
import { AlertCircle, CheckCircle2, Clock, Trash2, ArrowRight, Download } from 'lucide-react';

const formatMoney = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));

const suggestedQuantity = (product: ProductPerformance) => {
  const v = Number(product.salesVelocity || 0);
  if (v >= 8) return 24;
  if (v >= 4) return 12;
  if (v >= 2) return 6;
  return 3;
};

const ListItem: React.FC<{
  item: ShoppingListItem;
  onToggle: (checked: boolean) => Promise<unknown>;
  onUpdate: (p: { quantityTarget?: number; note?: string }) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}> = ({ item, onToggle, onUpdate, onRemove }) => {
  const [qty, setQty] = useState(String(item.quantityTarget || 1));
  return (
    <div className={`flex items-start gap-4 rounded-xl border bg-white p-4 transition ${item.checked ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
      <button
        type="button"
        onClick={() => void onToggle(!item.checked)}
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${item.checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 hover:border-emerald-400'}`}
      >
        {item.checked && <CheckCircle2 className="h-4 w-4" />}
      </button>
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
        <ProductImage src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${item.checked ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.name}</p>
            <p className="text-xs text-gray-400">{item.category || 'Sem categoria'}</p>
          </div>
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            {item.sourceTag.replace(/_/g, ' ')}
          </span>
        </div>
        {item.reasonSummary && <p className="mt-1 text-xs text-gray-500">{item.reasonSummary}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            Qtd:
            <input
              type="number"
              min="1"
              className="h-7 w-16 rounded border border-gray-200 px-2 text-center text-xs text-gray-900 outline-none focus:border-emerald-500"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onBlur={() => void onUpdate({ quantityTarget: Math.max(1, Number(qty || 1)) })}
            />
          </label>
          <Link to={`/app/produtos/${item.productId}`} className="text-xs font-medium text-emerald-600 no-underline hover:text-emerald-700">
            Ver produto <ArrowRight className="inline h-3 w-3" />
          </Link>
          <button type="button" onClick={() => void onRemove()} className="text-xs text-red-400 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

const SuggestionRow: React.FC<{ product: ProductPerformance; label: string; onAdd: () => Promise<void>; inList: boolean }> = ({ product, label, onAdd, inList }) => (
  <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-3 transition hover:bg-gray-50">
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
      <ProductImage src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
      <p className="text-xs text-gray-400">{label} · {formatMoney(product.revenue)}</p>
    </div>
    {inList ? (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">Na lista</span>
    ) : (
      <button type="button" onClick={() => void onAdd()} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100">
        + Adicionar
      </button>
    )}
  </div>
);

const ShoppingListPage: React.FC = () => {
  const { dashboard, loading: dLoading, error: dError } = useMarketData();
  const { overview, items, productIds, loading, error, addItem, updateItem, removeItem } = useShoppingList();

  const restockSuggestions = useMemo(
    () => (dashboard?.replenishmentCandidates || []).filter((p) => !productIds.has(p.productId)).slice(0, 8),
    [dashboard?.replenishmentCandidates, productIds]
  );
  const lowProducts = useMemo(
    () => (dashboard?.lowTurnoverProducts || []).slice(0, 6),
    [dashboard?.lowTurnoverProducts]
  );

  const handleAdd = async (product: ProductPerformance, sourceTag: string, reason: string) => {
    await addItem({ productId: product.productId, quantityTarget: suggestedQuantity(product), sourceTag, reasonSummary: reason });
  };

  const urgentItems = items.filter((i) => !i.checked && Number(i.quantityTarget || 0) >= 10);
  const reinforceItems = items.filter((i) => !i.checked && Number(i.quantityTarget || 0) >= 3 && Number(i.quantityTarget || 0) < 10);
  const regularItems = items.filter((i) => !i.checked && Number(i.quantityTarget || 0) < 3);
  const checkedItems = items.filter((i) => i.checked);

  if (loading || dLoading) {
    return (
      <Layout>
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
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

  const renderGroup = (title: string, icon: React.ReactNode, color: string, groupItems: ShoppingListItem[]) => {
    if (groupItems.length === 0) return null;
    return (
      <div>
        <div className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 ${color}`}>
          {icon}
          <span className="text-sm font-semibold">{title} ({groupItems.length})</span>
        </div>
        <div className="flex flex-col gap-3">
          {groupItems.map((item) => (
            <ListItem
              key={item.id}
              item={item}
              onToggle={(c) => updateItem(item.id, { checked: c })}
              onUpdate={(p) => updateItem(item.id, p)}
              onRemove={() => removeItem(item.id)}
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
            <h1 className="text-xl font-bold text-gray-900">Pedido inteligente</h1>
            <p className="text-sm text-gray-500">Compra guiada por vendas reais</p>
          </div>
          <button
            type="button"
            onClick={() => { console.log('Export:', items); alert('Lista exportada no console!'); }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <Download className="h-4 w-4" /> Exportar lista
          </button>
        </div>

        {/* KPI summary */}
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Na lista', value: overview.totalItems, color: 'text-gray-900' },
            { label: 'Pendentes', value: overview.pendingItems, color: 'text-amber-600' },
            { label: 'Comprados', value: overview.checkedItems, color: 'text-emerald-600' },
            { label: 'Sugestões', value: restockSuggestions.length, color: 'text-blue-600' },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">{kpi.label}</span>
              <p className={`mt-1 text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Grouped list */}
        <div className="flex flex-col gap-6">
          {items.length === 0 ? (
            <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
              <p className="text-gray-500">A lista está vazia. Use as sugestões abaixo para começar.</p>
            </div>
          ) : (
            <>
              {renderGroup('Urgente — quantidade alta', <AlertCircle className="h-4 w-4 text-red-600" />, 'bg-red-50 text-red-700', urgentItems)}
              {renderGroup('Reforçar — giro acelerando', <Clock className="h-4 w-4 text-amber-600" />, 'bg-amber-50 text-amber-700', reinforceItems)}
              {renderGroup('Manter — compra regular', <CheckCircle2 className="h-4 w-4 text-emerald-600" />, 'bg-emerald-50 text-emerald-700', regularItems)}
              {renderGroup('Comprados', <CheckCircle2 className="h-4 w-4 text-gray-400" />, 'bg-gray-50 text-gray-500', checkedItems)}
            </>
          )}
        </div>

        {/* Restock suggestions */}
        {restockSuggestions.length > 0 && (
          <div>
            <h2 className="mb-3 text-base font-semibold text-gray-900">Sugestões de reposição</h2>
            <div className="grid gap-2 sm:grid-cols-2">
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
            <h2 className="mb-3 text-base font-semibold text-gray-900">Compra com cautela</h2>
            <p className="mb-2 text-xs text-gray-500">Produtos com baixa tração. Reduza pedido ou revise posicionamento.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {lowProducts.map((p) => (
                <div key={p.productId} className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50/50 p-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white">
                    <ProductImage src={p.imageUrl} alt={p.name} className="h-full w-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-red-500">Giro {Number(p.salesVelocity || 0).toFixed(1)}/dia · {formatMoney(p.revenue)}</p>
                  </div>
                  <Link to={`/app/produtos/${p.productId}`} className="text-xs font-medium text-red-500 no-underline hover:text-red-700">Analisar</Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ShoppingListPage;
