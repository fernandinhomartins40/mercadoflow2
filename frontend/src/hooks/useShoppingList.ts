import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { marketService } from '../services/market.service';
import { ShoppingListItem, ShoppingListOverview } from '../types/analytics.types';

const EMPTY_OVERVIEW: ShoppingListOverview = {
  totalItems: 0,
  checkedItems: 0,
  pendingItems: 0,
  items: [],
};

export const useShoppingList = () => {
  const { marketId } = useAuth();
  const [overview, setOverview] = useState<ShoppingListOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!marketId) {
      setOverview(EMPTY_OVERVIEW);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await marketService.getShoppingList(marketId);
      setOverview(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar lista de compras');
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    load();
  }, [load]);

  const productIds = useMemo(() => new Set(overview.items.map((item) => item.productId)), [overview.items]);

  const addItem = useCallback(async (payload: {
    productId: string;
    quantityTarget?: number;
    note?: string;
    sourceTag?: string;
    reasonSummary?: string;
  }) => {
    if (!marketId) {
      throw new Error('Mercado não encontrado');
    }
    const item = await marketService.addShoppingListItem(marketId, payload);
    setOverview((current) => {
      const existing = current.items.find((row) => row.id === item.id || row.productId === item.productId);
      const items = existing
        ? current.items.map((row) => (row.id === existing.id ? item : row))
        : [item, ...current.items];
      const checkedItems = items.filter((row) => row.checked).length;
      return {
        totalItems: items.length,
        checkedItems,
        pendingItems: items.length - checkedItems,
        items,
      };
    });
    return item as ShoppingListItem;
  }, [marketId]);

  const updateItem = useCallback(async (
    itemId: string,
    payload: { quantityTarget?: number; note?: string; sourceTag?: string; reasonSummary?: string; checked?: boolean }
  ) => {
    if (!marketId) {
      throw new Error('Mercado não encontrado');
    }
    const item = await marketService.updateShoppingListItem(marketId, itemId, payload);
    setOverview((current) => {
      const items = current.items.map((row) => (row.id === item.id ? item : row));
      const checkedItems = items.filter((row) => row.checked).length;
      return {
        totalItems: items.length,
        checkedItems,
        pendingItems: items.length - checkedItems,
        items,
      };
    });
    return item as ShoppingListItem;
  }, [marketId]);

  const removeItem = useCallback(async (itemId: string) => {
    if (!marketId) {
      throw new Error('Mercado não encontrado');
    }
    await marketService.deleteShoppingListItem(marketId, itemId);
    setOverview((current) => {
      const items = current.items.filter((row) => row.id !== itemId);
      const checkedItems = items.filter((row) => row.checked).length;
      return {
        totalItems: items.length,
        checkedItems,
        pendingItems: items.length - checkedItems,
        items,
      };
    });
  }, [marketId]);

  return {
    overview,
    items: overview.items,
    productIds,
    loading,
    error,
    reload: load,
    addItem,
    updateItem,
    removeItem,
  };
};
