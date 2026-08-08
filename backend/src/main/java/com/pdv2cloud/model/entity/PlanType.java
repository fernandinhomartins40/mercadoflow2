package com.pdv2cloud.model.entity;

/**
 * Planos do SaaS.
 *
 * Dois eixos de limite, deliberadamente combinados:
 *
 *  VOLUME  — notas fiscais por mês. Acompanha o faturamento da loja, então um
 *            mercado pequeno opera de graça indefinidamente enquanto um maior
 *            chega ao teto naturalmente.
 *
 *  ESTRUTURA — filiais, PDVs por filial e PDVs no total. Existe para impedir
 *            que uma rede caiba num plano barato. Sem o teto por filial, uma
 *            rede de 10 lojas com 1 caixa cada passaria pelo limite total; sem
 *            o teto total, uma loja só concentraria dezenas de caixas. Os dois
 *            juntos fecham as duas saídas.
 *
 * Os limites são apurados sobre a REDE inteira (matriz + filiais), não por
 * conta: criar uma conta por loja não contorna nada.
 *
 * O plano gratuito enxerga toda a inteligência do produto, porém restrita aos
 * {@link #FREE_INSIGHT_PREVIEW_SIZE} principais itens de cada lista — prova o
 * valor sem permitir operar apenas com ele.
 */
public enum PlanType {

    /** Gratuito para sempre, sem cartão. Acesso imediato no cadastro. */
    FREE(
        "Gratuito",
        0,
        1_000,
        1,      // filiais
        1,      // PDVs por filial
        1,      // PDVs no total
        2,      // usuários
        90,
        false
    ),

    /** Loja única que já opera de verdade. */
    ESSENCIAL(
        "Essencial",
        19_700,
        15_000,
        1,
        3,
        3,
        5,
        365,
        true
    ),

    /** Operação com algumas lojas ou mais caixas. */
    PROFISSIONAL(
        "Profissional",
        39_700,
        50_000,
        3,
        4,
        10,
        15,
        730,
        true
    ),

    /**
     * Redes maiores. Sem teto fixo: os limites reais vêm dos overrides do
     * mercado, negociados caso a caso pelo super admin.
     */
    REDE(
        "Rede",
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        true
    );

    /** Sentinela para "sem teto" / "sob consulta". */
    public static final int UNLIMITED = -1;

    /** Quantos itens de cada lista de inteligência o plano gratuito enxerga. */
    public static final int FREE_INSIGHT_PREVIEW_SIZE = 5;

    private final String displayName;
    private final int monthlyPriceCents;
    private final int monthlyInvoiceLimit;
    private final int branchLimit;
    private final int pdvPerBranchLimit;
    private final int pdvLimit;
    private final int userSeatLimit;
    private final int historyRetentionDays;
    private final boolean fullInsights;

    PlanType(
        String displayName,
        int monthlyPriceCents,
        int monthlyInvoiceLimit,
        int branchLimit,
        int pdvPerBranchLimit,
        int pdvLimit,
        int userSeatLimit,
        int historyRetentionDays,
        boolean fullInsights
    ) {
        this.displayName = displayName;
        this.monthlyPriceCents = monthlyPriceCents;
        this.monthlyInvoiceLimit = monthlyInvoiceLimit;
        this.branchLimit = branchLimit;
        this.pdvPerBranchLimit = pdvPerBranchLimit;
        this.pdvLimit = pdvLimit;
        this.userSeatLimit = userSeatLimit;
        this.historyRetentionDays = historyRetentionDays;
        this.fullInsights = fullInsights;
    }

    public String getDisplayName() {
        return displayName;
    }

    /** Preço mensal em centavos. -1 = sob consulta. */
    public int getMonthlyPriceCents() {
        return monthlyPriceCents;
    }

    /** Notas fiscais aceitas por ciclo mensal, somando toda a rede. */
    public int getMonthlyInvoiceLimit() {
        return monthlyInvoiceLimit;
    }

    /** Lojas na rede, contando a matriz. */
    public int getBranchLimit() {
        return branchLimit;
    }

    /** Teto de PDVs numa mesma loja. */
    public int getPdvPerBranchLimit() {
        return pdvPerBranchLimit;
    }

    /** Teto de PDVs somando todas as lojas da rede. */
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

    /** Planos sob medida têm os limites definidos por override, não pelo enum. */
    public boolean isCustom() {
        return this == REDE;
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
            case "ESSENCIAL", "PRO", "INTERMEDIATE" -> ESSENCIAL;
            case "PROFISSIONAL" -> PROFISSIONAL;
            case "REDE", "ENTERPRISE", "ADVANCED" -> REDE;
            default -> FREE;
        };
    }
}
