package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Análise de efetividade promocional por produto.
 *
 * Algoritmo:
 *  1. Separa dias com preço abaixo do baseline (promo) dos dias com preço normal.
 *  2. Calcula velocidade diária de quantidade e receita em cada modo.
 *  3. Lift = (velocidade_promo / velocidade_normal) - 1
 *  4. Elasticidade implícita = Δqty% / Δprice%
 *  5. Score de efetividade (0-100): combina revenue lift + qty lift + elasticidade + consistência das janelas.
 *  6. Classificação: BOOSTER / REVENUE_LOSS / NEUTRAL / INSUFFICIENT_DATA
 *
 * BOOSTER: qty lift forte E receita não cai (volume compensa desconto)
 * REVENUE_LOSS: qty sobe mas receita cai — desconto grande demais
 * NEUTRAL: pouca diferença entre promo e normal
 * INSUFFICIENT_DATA: <3 janelas ou <7 dias promo
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProductPromoEffectivenessDTO {
    private UUID productId;
    private String name;
    private String category;
    private String imageUrl;

    // ── Métricas de preço ──
    private BigDecimal baselinePrice;         // preço médio sem desconto
    private BigDecimal avgPromoPrice;         // preço médio em promoção
    private BigDecimal avgDiscountPercent;    // desconto médio aplicado (%)

    // ── Velocidades diárias (unidades) ──
    private BigDecimal normalDailyQty;        // unidades/dia no modo normal
    private BigDecimal promoDailyQty;         // unidades/dia em promoção

    // ── Velocidades diárias (receita) ──
    private BigDecimal normalDailyRevenue;    // R$/dia no modo normal
    private BigDecimal promoDailyRevenue;     // R$/dia em promoção

    // ── Lifts calculados ──
    private BigDecimal qtyLiftPercent;        // (promoDailyQty / normalDailyQty - 1) * 100
    private BigDecimal revenueLiftPercent;    // (promoDailyRevenue / normalDailyRevenue - 1) * 100
    private BigDecimal priceElasticity;       // Δqty% / Δprice% (negativo = produto elástico)

    // ── Volume absoluto no período ──
    private BigDecimal totalPromoRevenue;
    private BigDecimal totalNormalRevenue;
    private BigDecimal totalPromoQty;
    private BigDecimal totalNormalQty;
    private Integer promoDays;
    private Integer normalDays;
    private Integer promoWindowCount;         // nº de janelas de promoção detectadas

    // ── Score e classificação ──
    private Integer effectivenessScore;       // 0-100
    private String classification;            // BOOSTER / REVENUE_LOSS / NEUTRAL / INSUFFICIENT_DATA
    private String classificationLabel;       // texto legível
    private String insight;                   // texto explicativo gerado

    // ── Janelas individuais ──
    private List<PromoWindowSummary> windows;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PromoWindowSummary {
        private String startAt;
        private String endAt;
        private int durationDays;
        private BigDecimal discountPercent;
        private BigDecimal qtyLiftPercent;
        private BigDecimal revenueLiftPercent;
        private BigDecimal promoRevenue;
        private BigDecimal normalRevenueEquivalent; // receita estimada sem promo no mesmo período
        private String outcome;  // POSITIVE / NEGATIVE / NEUTRAL
    }
}
