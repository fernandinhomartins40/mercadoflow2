import { useCallback, useState } from 'react';
import { marketService } from '../services/market.service';
import type { RecommendationItem } from '../types/analytics.types';
import type { DecisionFeedbackState } from '../components/intelligence/DecisionFeedback';

/**
 * Decidir uma recomendação e mostrar o que aconteceu (pedido criado, desfazer).
 * Usado pela tela Hoje e pela lista completa de decisões, para as duas se
 * comportarem igual.
 */
export const useRecommendationDecision = (
  marketId: string | null,
  recommendations: RecommendationItem[],
  reload: () => Promise<void> | void,
) => {
  const [deciding, setDeciding] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<DecisionFeedbackState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = useCallback(async (id: string, decision: 'ACEITA' | 'REJEITADA') => {
    if (!marketId) return;
    setDeciding(id);
    setFeedback(null);
    setError(null);
    try {
      const decided = await marketService.decideRecommendation(marketId, id, decision);
      const rec = recommendations.find((r) => r.id === id);
      setFeedback({
        recommendationId: id,
        title: rec?.title || decided?.title || 'Recomendação',
        decision,
        orderLink: decided?.orderLink ?? null,
      });
      await reload();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Não foi possível registrar a decisão.');
    } finally {
      setDeciding(null);
    }
  }, [marketId, recommendations, reload]);

  return { deciding, feedback, setFeedback, error, setError, decide };
};

export default useRecommendationDecision;
