import { useCallback, useEffect, useState } from 'react';
import { invalidateCached, useCached } from '../../hooks/useCached';
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
  const on = !!marketId && enabled;
  const recsQ = useCached<RecommendationItem[]>(on ? `recs:${marketId}` : null,
    () => marketService.getPendingRecommendations(marketId!).then((r: RecommendationItem[]) => r || []), 30_000);
  const tinoQ = useCached<CopilotDecision[]>(on ? `tino:${marketId}` : null,
    () => copilotAgentsService.inbox(marketId!, 'abertas').then((r) => r.decisoes || []), 30_000);
  // Decidir atualiza uma decisão do Tino na hora, sem esperar a próxima busca.
  const [localTino, setTino] = useState<CopilotDecision[] | null>(null);
  useEffect(() => { setTino(null); }, [tinoQ.data]);

  const recs = recsQ.data ?? [];
  const tino = localTino ?? tinoQ.data ?? [];
  const reload = useCallback(async () => {
    if (!marketId) return;
    invalidateCached(`recs:${marketId}`);
    invalidateCached(`tino:${marketId}`);
    await Promise.allSettled([recsQ.refresh(), tinoQ.refresh()]);
  }, [marketId, recsQ, tinoQ]);

  const items = sortQueue([...tino.filter(isOpen).map(fromDecision), ...recs.map(fromRecommendation)]);
  const total = items.reduce((a, i) => a + (i.value ?? 0), 0);
  const loading = on && recsQ.loading && tinoQ.loading;
  const setTinoList = (fn: (cur: CopilotDecision[]) => CopilotDecision[]) => setTino((cur) => fn(cur ?? tinoQ.data ?? []));
  return { items, recs, tino, setTino: setTinoList, total, loading, reload };
};
