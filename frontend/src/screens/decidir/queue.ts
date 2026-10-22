import { useCallback, useEffect, useState } from 'react';
import { invalidateCached, useCached } from '../../hooks/useCached';
import { marketService } from '../../services/market.service';
import { copilotAgentsService, type CopilotDecision } from '../../services/aiPlatform.service';
import { ACTION_LABEL } from '../../components/intelligence/RecommendationCard';
import { agentOf, valueOf } from '../copilot/shared';
import type { RecommendationItem } from '../../types/analytics.types';
import { operationService, type OperationPanel } from '../../services/operation.service';
import { checkedGain, gainOfRecommendation } from '../../utils/gain';

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
  /** Ganho (utils/gain). Null quando não há valor ou quando passou do teto de bom senso. */
  value: number | null;
  /** O ganho veio, mas passou do teto: a tela mostra "—" com a dica. */
  outOfRange?: boolean;
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
  value: gainOfRecommendation(r),
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
/**
 * Ordem da fila: urgente primeiro, depois o ganho esperado pesado pela
 * confiança (F0, 07/10/2026). Antes era só o valor, e o valor de uma compra
 * era o tamanho do pedido: as maiores compras subiam como se fossem ganho.
 */
const weight = (i: QueueItem) => (i.value ?? 0) * (i.rec?.confidence != null ? Math.max(0.3, Number(i.rec.confidence)) : 0.6);
export const sortQueue = (items: QueueItem[]) =>
  [...items].sort((a, b) => Number(b.urgent) - Number(a.urgent) || weight(b) - weight(a));

const isOpen = (d: CopilotDecision) => d.status === 'PENDENTE' || d.status === 'INFORMATIVA';

/**
 * Teto de bom senso do ganho: o faturamento das últimas 4 semanas (o maior entre
 * elas e as 4 anteriores, para o agente parado não esconder tudo). Mesma chave
 * de cache do Início, então não pede de novo.
 */
export const useGainCap = (marketId: string | null | undefined, enabled = true): number | null => {
  const q = useCached<OperationPanel>(marketId && enabled ? `operacao:${marketId}:mes` : null,
    () => operationService.get(marketId!, 'mes'), 10 * 60_000);
  const vendas = q.data?.metrics.find((m) => m.key === 'vendas');
  const cap = vendas ? Math.max(Number(vendas.value) || 0, Number(vendas.previous) || 0) : 0;
  return cap > 0 ? cap : null;
};

/** Aplica o teto ao ganho do item: acima dele, o valor vira "—" com a dica. */
export const withCap = (item: QueueItem, cap: number | null): QueueItem => {
  const g = checkedGain(item.value, cap);
  return g.outOfRange ? { ...item, value: null, outOfRange: true } : item;
};

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

  const cap = useGainCap(marketId, enabled);
  const items = sortQueue([...tino.filter(isOpen).map(fromDecision), ...recs.map(fromRecommendation)].map((i) => withCap(i, cap)));
  const total = items.reduce((a, i) => a + (i.value ?? 0), 0);
  const loading = on && recsQ.loading && tinoQ.loading;
  // As duas buscas falharam e não há nada guardado: a lista vazia NÃO quer dizer "nada para decidir".
  const failed = on && !recsQ.loading && !tinoQ.loading && !!recsQ.error && !!tinoQ.error && !recsQ.data && !tinoQ.data;
  const setTinoList = (fn: (cur: CopilotDecision[]) => CopilotDecision[]) => setTino((cur) => fn(cur ?? tinoQ.data ?? []));
  return { items, recs, tino, setTino: setTinoList, total, cap, loading, failed, reload };
};
