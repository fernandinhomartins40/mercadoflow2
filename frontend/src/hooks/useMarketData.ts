import { useAuth } from '../context/AuthContext';
import { marketService } from '../services/market.service';
import { useCached } from './useCached';
import type { ProductPerformance } from '../types/analytics.types';

/** Os sinais de produto que Comprar e Produtos usam (não o cockpit inteiro). */
export interface ProductSignals {
  replenishmentCandidates: ProductPerformance[];
  slowMovers: ProductPerformance[];
  topProducts: ProductPerformance[];
  lowTurnoverProducts: ProductPerformance[];
}

export const useMarketData = () => {
  const { marketId } = useAuth();
  const { data, loading, error } = useCached<ProductSignals>(
    marketId ? `signals:${marketId}` : null,
    () => marketService.getProductSignals(marketId!),
    5 * 60_000,
  );
  return { dashboard: data ?? null, loading, error: error ? 'Erro ao carregar os produtos' : null };
};
