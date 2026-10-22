/**
 * Um cálculo só de "ganho" para Início, Decidir e a tela da decisão
 * (auditoria de 20/10, §4 D): se o item mostra R$ 156, a decisão aberta mostra
 * R$ 156. Também guarda o teto de bom senso dos números exibidos.
 *
 * De onde vem o ganho (não muda o backend):
 *  - recomendação e sinal da análise: `expectedImpactValue`;
 *  - decisão do Tino: `impact`; sem ele, o primeiro valor positivo de
 *    `numbers` (valorEstimado, valorEstoque, valor, vendaProtegida).
 * O total que a tela da decisão recalcula com as escolhas do dono (valor do
 * pedido, dinheiro parado, preço no encarte) não é ganho: aparece à parte.
 */

/** Dica no lugar do número que não passou no teto de bom senso. */
export const OUT_OF_RANGE_HINT = 'valor fora do esperado';

/** Variação acima disso (em %) é erro de dado, não notícia. */
export const MAX_PERCENT = 1000;

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? n : null;
};

/** Ganho de uma recomendação ou de um sinal da análise. */
export const gainOfRecommendation = (r: { expectedImpactValue?: number | null }): number | null =>
  positive(r.expectedImpactValue);

/** Ganho de uma decisão do Tino. */
export const gainOfDecision = (d: { impact: number | null; numbers?: Record<string, unknown> | null }): number | null => {
  const impact = positive(d.impact);
  if (impact != null) return impact;
  const n = d.numbers ?? {};
  for (const k of ['valorEstimado', 'valorEstoque', 'valor', 'vendaProtegida']) {
    const v = positive(n[k]);
    if (v != null) return v;
  }
  return null;
};

/**
 * Teto do ganho: o faturamento da loja no período (as últimas 4 semanas). Uma
 * decisão que promete mais do que a loja inteira vendeu é dado a conferir.
 * Sem faturamento conhecido, só valores inválidos caem.
 */
export const isSaneMoney = (value: number | null | undefined, cap?: number | null): boolean =>
  value == null || (Number.isFinite(value) && (cap == null || cap <= 0 || Math.abs(value) <= cap));

/** Percentual plausível (até ±1.000%). */
export const isSanePercent = (value: number | null | undefined): boolean =>
  value == null || (Number.isFinite(value) && Math.abs(value) <= MAX_PERCENT);

/** Ganho pronto para exibir: `value` null e `outOfRange` true quando passou do teto. */
export const checkedGain = (value: number | null, cap?: number | null): { value: number | null; outOfRange: boolean } =>
  isSaneMoney(value, cap) ? { value, outOfRange: false } : { value: null, outOfRange: true };
