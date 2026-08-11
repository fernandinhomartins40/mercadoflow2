package com.pdv2cloud.service.opportunity;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Contrato de um detector de oportunidades.
 *
 * Cada implementação anotada com {@code @Component} é descoberta pelo Spring e
 * entra automaticamente no ciclo do {@link OpportunityEngine} — adicionar um
 * novo tipo de oportunidade não exige tocar no motor.
 *
 * REGRA IMPORTANTE: um detector NÃO decide status nem persiste nada. Ele apenas
 * reporta o que enxerga agora; o motor cuida do ciclo de vida, da deduplicação
 * por fingerprint e de não ressuscitar o que o usuário já descartou.
 */
public interface OpportunityDetector {

    /**
     * Nome curto para log e diagnóstico. Aparece quando um detector falha, e é
     * o que permite saber qual deles derrubou a rodada.
     */
    String name();

    /**
     * Oportunidades presentes na loja neste momento.
     *
     * Deve devolver lista vazia — nunca lançar — quando não houver dados
     * suficientes. Um detector que estoura derruba só a si mesmo, mas polui o
     * log e mascara problemas reais.
     */
    List<DetectedOpportunity> detect(UUID marketId);

    /**
     * O que um detector reporta: a situação e os números que a sustentam, sem
     * status nem identidade de banco.
     *
     * @param fingerprint    chave estável da MESMA situação entre execuções.
     *                       Deve conter o tipo e o alvo (ex.: "CAPITAL:{uuid}"),
     *                       nunca a data — senão cada rodada cria uma linha nova
     *                       e o feed vira histórico.
     * @param expiresAt      quando deixa de fazer sentido (null = sem prazo)
     */
    record DetectedOpportunity(
        String fingerprint,
        String type,
        String source,
        UUID productId,
        String category,
        String title,
        String description,
        Map<String, Object> evidence,
        BigDecimal expectedImpactValue,
        BigDecimal confidence,
        BigDecimal priorityScore,
        java.time.LocalDateTime expiresAt
    ) {
        /** Construtor curto para os detectores que não têm prazo de validade. */
        public DetectedOpportunity(
            String fingerprint, String type, String source, UUID productId,
            String title, String description, Map<String, Object> evidence,
            BigDecimal expectedImpactValue, BigDecimal confidence, BigDecimal priorityScore
        ) {
            this(fingerprint, type, source, productId, null, title, description,
                evidence, expectedImpactValue, confidence, priorityScore, null);
        }
    }
}
