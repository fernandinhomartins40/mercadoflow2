import { useEffect, useState } from 'react';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';

export const useMarketData = () => {
  const { marketId } = useAuth();
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!marketId) {
        setError('Market ID nao encontrado');
        setLoading(false);
        return;
      }
      try {
        const data = await marketService.getDashboard(marketId);
        setDashboard(data);
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [marketId]);

  return { dashboard, loading, error };
};
