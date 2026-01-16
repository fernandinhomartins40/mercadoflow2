import { useEffect, useState } from 'react';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';

export const useAlerts = () => {
  const { marketId } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!marketId) {
        setLoading(false);
        return;
      }
      const data = await marketService.getAlerts(marketId, false);
      setAlerts(data);
      setLoading(false);
    };
    load();
  }, [marketId]);

  return { alerts, loading };
};
