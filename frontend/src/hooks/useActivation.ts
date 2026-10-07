import { useEffect, useState } from 'react';
import { activationService } from '../services/activation.service';
import { useAuth } from '../context/AuthContext';
import { fetchCached } from './useCached';
import { FEATURE_ACTIVATION_CHECKLIST_ENABLED } from '../config/features';
import type { ActivationStatus } from '../types/activation.types';

/** Enquanto a ativação não termina, o estado é relido a cada 30 s: o dono vê o passo mudar sem recarregar. */
const POLL_MS = 30_000;

export const useActivation = () => {
  const { marketId } = useAuth();
  const [status, setStatus] = useState<ActivationStatus | null>(null);
  const [loading, setLoading] = useState(FEATURE_ACTIVATION_CHECKLIST_ENABLED);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!FEATURE_ACTIVATION_CHECKLIST_ENABLED || !marketId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        // Mesma chave do selo do topo: as duas leituras ao abrir a tela viram uma só.
        const data = await fetchCached(`ativacao:${marketId}`, () => activationService.getStatus(marketId));
        if (cancelled) return;
        setStatus(data);
        setError(false);
        if (!data.complete) timer = setTimeout(load, POLL_MS);
      } catch {
        // Sem o estado, o Painel continua como antes: a ativação nunca deixa a loja sem tela.
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [marketId]);

  const stepsDone = !!status && status.steps.every((s) => s.done);

  return {
    status,
    loading,
    error,
    /** Algum passo pendente: o Painel dá lugar ao checklist. */
    showChecklist: !!status && !stepsDone,
    /** Passos feitos, mas poucos dias de venda: Painel com aviso de coleta. */
    collecting: !!status && stepsDone && !status.complete,
  };
};
