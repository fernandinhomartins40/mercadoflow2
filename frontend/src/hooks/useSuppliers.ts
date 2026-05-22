import { useCallback, useEffect, useState } from 'react';
import { marketService } from '../services/market.service';
import { Supplier } from '../types/analytics.types';

export function useSuppliers(marketId: string) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if (!marketId) return;
    setLoading(true);
    marketService.getSuppliers(marketId)
      .then(setSuppliers)
      .catch(() => setSuppliers([]))
      .finally(() => setLoading(false));
  }, [marketId]);

  useEffect(() => { reload(); }, [reload]);

  const save = useCallback(async (payload: Omit<Supplier, 'id'>) => {
    const saved = await marketService.saveSupplier(marketId, payload);
    setSuppliers(prev => {
      const idx = prev.findIndex(s => s.cnpj === saved.cnpj);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved].sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial));
    });
    return saved as Supplier;
  }, [marketId]);

  const remove = useCallback(async (id: string) => {
    await marketService.deleteSupplier(marketId, id);
    setSuppliers(prev => prev.filter(s => s.id !== id));
  }, [marketId]);

  return { suppliers, loading, reload, save, remove };
}
