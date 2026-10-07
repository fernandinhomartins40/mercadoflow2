/**
 * Termos do sistema em palavras do balcão (F1 do plano de experiência).
 * Curva ABC, XYZ, ritmo, confiança e afinidade aparecem na tela só por aqui.
 */

/** Curva ABC: A = 80% do faturamento, B = os próximos 15%, C = a cauda. */
export const rankLabel = (abc?: string | null) =>
  abc === 'A' ? 'Entre os que mais vendem' : abc === 'B' ? 'Vende bem' : abc === 'C' ? 'Vende pouco' : 'Sem histórico';

/** Curva XYZ: regularidade da venda. */
export const regularityLabel = (xyz?: string | null) =>
  xyz === 'X' ? 'venda regular' : xyz === 'Y' ? 'venda oscila' : xyz === 'Z' ? 'venda irregular' : '';

/** Ritmo (1 = normal) como frase curta. */
export const paceLabel = (momentum?: number | null) => {
  if (momentum == null || !Number.isFinite(Number(momentum))) return 'ritmo ainda sem medida';
  const diff = (Number(momentum) - 1) * 100;
  if (Math.abs(diff) < 5) return 'vendendo no normal';
  return `vendendo ${Math.round(Math.abs(diff))}% ${diff > 0 ? 'acima' : 'abaixo'} do normal`;
};

/** Confiança (0 a 1) em palavras, com o motivo quando é baixa. */
export const confidenceLabel = (c?: number | null) => {
  if (c == null) return null;
  const v = Number(c);
  if (v >= 0.7) return { text: 'Confiança alta', tone: 'lime' as const };
  if (v >= 0.4) return { text: 'Confiança média', tone: 'ghost' as const };
  return { text: 'Confiança baixa: falta o estoque deste produto', tone: 'amber' as const };
};

/** Quantas vezes mais vão juntos no cupom do que o acaso explicaria. */
export const affinityLabel = (lift?: number | null) => {
  const v = Number(lift || 0);
  if (v < 1.05) return 'vão juntos por acaso';
  return `vão juntos ${v >= 2 ? `${Math.round(v)}x` : `${Math.round((v - 1) * 100)}%`} mais que o normal`;
};
