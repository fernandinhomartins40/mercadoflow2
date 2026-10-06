import { useCallback, useEffect, useState } from 'react';
import { marketService } from '../../services/market.service';
import { copilotAgentsService, type CopilotDecision } from '../../services/aiPlatform.service';
import { ACTION_LABEL } from '../../components/intelligence/RecommendationCard';
import { agentOf, valueOf } from '../copilot/shared';
import type { RecommendationItem } from '../../types/analytics.types';

/**
 * Fila única do "Decidir": as recomendações da análise e o que o Tino deixou
 * preparado, numa lista só, ordenada pelo que vale mais em reais. Antes essas
 * duas fontes apareciam em oito lugares (Hoje, Copiloto, Central, Comprar,
 * Produtos, Promoções, Encartes) com recortes diferentes.
 */

export type QueueGroup = 'comprar' | 'promover' | 'capital' | 'preco' | 'entregas' | 'outros';

export const GROUP_LABEL: Record<QueueGroup, string> = {
  comprar: 'Comprar',
  promover: 'Promover',
  capital: 'Dinheiro parado',
  preco: 'Preço',
  entregas: 'Entregas',
  outros: 'Atenção',
};

export interface QueueItem {
  key: string;
  source: 'rec' | 'tino';
  group: QueueGroup;
  /** O verbo: "Comprar", "Liquidar", "Resolver entrega incompleta". */
  action: string;
  title: string;
  value: number | null;
  name: string;
  image?: string | null;
  urgent: boolean;
  rec?: RecommendationItem;
  decision?: CopilotDecision;
}

const REC_GROUP: Record<string, QueueGroup> = {
  COMPRAR: 'comprar',
  PROMOVER: 'promover',
  LIQUIDAR: 'capital',
  AJUSTAR_PRECO: 'preco',
};

const AGENT_GROUP: Record<string, QueueGroup> = {
  COMPRAS: 'comprar',
  PROMOCOES: 'promover',
  CAPITAL: 'capital',
  PRECO: 'preco',
  RECEBIMENTO: 'entregas',
};

export const fromRecommendation = (r: RecommendationItem): QueueItem => ({
  key: `rec:${r.id}`,
  source: 'rec',
  group: REC_GROUP[r.actionType] ?? 'outros',
  action: ACTION_LABEL[r.actionType] || r.actionType,
  title: r.title,
  value: r.expectedImpactValue ? Number(r.expectedImpactValue) : null,
  name: r.productName || r.title,
  image: r.productImage,
  urgent: false,
  rec: r,
});

export const fromDecision = (d: CopilotDecision): QueueItem => ({
  key: `tino:${d.id}`,
  source: 'tino',
  group: AGENT_GROUP[d.agent] ?? 'outros',
  action: agentOf(d).action,
  title: d.title,
  value: valueOf(d),
  name: d.title,
  urgent: d.urgent,
  decision: d,
});

/** Urgente primeiro; depois o que vale mais; sem valor por último. */
export const sortQueue = (items: QueueItem[]) =>
  [...items].sort((a, b) => Number(b.urgent) - Number(a.urgent) || (b.value ?? -1) - (a.value ?? -1));

const isOpen = (d: CopilotDecision) => d.status === 'PENDENTE' || d.status === 'INFORMATIVA';

export const useDecisionQueue = (marketId: string | null | undefined, enabled = true) => {
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [tino, setTino] = useState<CopilotDecision[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!marketId || !enabled) { setLoading(false); return; }
    // Uma fonte fora do ar não apaga a outra.
    const [r, t] = await Promise.allSettled([
      marketService.getPendingRecommendations(marketId),
      copilotAgentsService.inbox(marketId, 'abertas'),
    ]);
    if (r.status === 'fulfilled') setRecs(r.value || []);
    if (t.status === 'fulfilled') setTino(t.value.decisoes || []);
    setLoading(false);
  }, [marketId, enabled]);

  useEffect(() => { reload(); }, [reload]);

  const items = sortQueue([...tino.filter(isOpen).map(fromDecision), ...recs.map(fromRecommendation)]);
  const total = items.reduce((a, i) => a + (i.value ?? 0), 0);
  return { items, recs, tino, setTino, total, loading, reload };
};
