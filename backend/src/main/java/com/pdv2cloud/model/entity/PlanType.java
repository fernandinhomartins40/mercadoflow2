package com.pdv2cloud.model.entity;

/**
 * Planos do SaaS.
 *
 * O limite que dispara o upgrade é o volume de notas fiscais por mês: cresce
 * junto com o faturamento da loja, então um mercado pequeno opera de graça
 * indefinidamente enquanto um mercado maior naturalmente chega ao teto.
 *
 * Limitar por uso (e não por funcionalidade) é a escolha deliberada: o plano
 * gratuito enxerga toda a inteligência do produto, porém restrita aos
 * {@link #FREE_INSIGHT_PREVIEW_SIZE} principais itens de cada lista. O
 * supermercadista prova o valor real sem conseguir operar só com o gratuito.
 *
 * Os nomes antigos (BASIC/INTERMEDIATE/ADVANCED) foram migrados em
 * V33__saas_plans_and_usage.sql.
 */
public enum PlanType {

    /** Gratuito para sempre, sem cartão. Acesso imediato no cadastro. */
    FREE(
        "Gratuito",
        1_000,
        1,
        2,
        90,
        false
    ),

    /** Operação real de um mercado de bairro a médio. */
    PRO(
        "Pro",
        15_000,
        5,
        10,
        730,
        true
    ),

    // -1 literal em vez da constante UNLIMITED: em Java, constantes do próprio
    // enum não podem ser referenciadas na lista de constantes (forward reference).
    /** Redes e alto volume: sem tetos numéricos. */
    ENTERPRISE(
        "Enterprise",
        -1,
        -1,
        -1,
        -1,
        true
    );

    /** Sentinela para "sem teto". Evita espalhar null pelas comparações. */
    public static final int UNLIMITED = -1;

    /** Quantos itens de cada lista de inteligência o plano gratuito enxerga. */
    public static final int FREE_INSIGHT_PREVIEW_SIZE = 5;

    private final String displayName;
    private final int monthlyInvoiceLimit;
    private final int pdvLimit;
    private final int userSeatLimit;
    private final int historyRetentionDays;
    private final boolean fullInsights;

    PlanType(
        String displayName,
        int monthlyInvoiceLimit,
        int pdvLimit,
        int userSeatLimit,
        int historyRetentionDays,
        boolean fullInsights
    ) {
        this.displayName = displayName;
        this.monthlyInvoiceLimit = monthlyInvoiceLimit;
        this.pdvLimit = pdvLimit;
        this.userSeatLimit = userSeatLimit;
        this.historyRetentionDays = historyRetentionDays;
        this.fullInsights = fullInsights;
    }

    public String getDisplayName() {
        return displayName;
    }

    /** Notas fiscais aceitas por ciclo mensal. */
    public int getMonthlyInvoiceLimit() {
        return monthlyInvoiceLimit;
    }

    public int getPdvLimit() {
        return pdvLimit;
    }

    public int getUserSeatLimit() {
        return userSeatLimit;
    }

    /** Janela de histórico visível nas análises. */
    public int getHistoryRetentionDays() {
        return historyRetentionDays;
    }

    /**
     * Se o plano vê as listas de inteligência completas. Quando falso, a API
     * devolve apenas os {@link #FREE_INSIGHT_PREVIEW_SIZE} primeiros itens.
     */
    public boolean hasFullInsights() {
        return fullInsights;
    }

    public boolean isFree() {
        return this == FREE;
    }

    public static boolean isUnlimited(int limit) {
        return limit == UNLIMITED;
    }

    /** Tolera os nomes antigos e valores desconhecidos, caindo para FREE. */
    public static PlanType fromString(String value) {
        if (value == null || value.isBlank()) {
            return FREE;
        }
        return switch (value.trim().toUpperCase()) {
            case "FREE", "BASIC" -> FREE;
            case "PRO", "INTERMEDIATE" -> PRO;
            case "ENTERPRISE", "ADVANCED" -> ENTERPRISE;
            default -> FREE;
        };
    }
}
