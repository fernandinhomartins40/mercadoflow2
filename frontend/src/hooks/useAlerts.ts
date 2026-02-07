import { useEffect, useState } from 'react';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import { AlertItem } from '../types/alert.types';

export const useAlerts = () => {
  const { marketId } = useAuth();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!marketId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await marketService.getAlerts(marketId, { onlyUnread });
        setAlerts(data || []);
        setError(null);
      } catch (err: any) {
        setError(err?.message || 'Erro ao carregar alertas');
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [marketId, onlyUnread]);

  const refresh = async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const data = await marketService.getAlerts(marketId, { onlyUnread });
      setAlerts(data || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar alertas');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (alertId: string) => {
    if (!marketId) return;
    await marketService.markAlertRead(marketId, alertId);
    await refresh();
  };

  const markAllRead = async () => {
    if (!marketId) return;
    await marketService.markAllAlertsRead(marketId);
    await refresh();
  };

  return { alerts, loading, error, onlyUnread, setOnlyUnread, refresh, markRead, markAllRead };
};
