package com.pdv2cloud.model.dto;

import java.math.BigDecimal;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ProductPurchaseSignalDTO {
    // Decisão principal
    private String decision;         // BUY, HOLD, REDUCE, CAUTION
    private String decisionLabel;    // "Comprar agora"
    private String decisionReason;   // explicação em linguagem natural

    // Métricas base da decisão
    private BigDecimal salesVelocity;       // unidades/dia (média 14d)
    private BigDecimal suggestedOrderDays;  // para quantos dias cobrir
    private BigDecimal suggestedQuantity;   // quantidade sugerida de compra
    private BigDecimal daysWithoutSale;     // dias sem nenhuma venda

    // Projeção de estoque reforçado
    private List<StockProjectionPeriod> projections; // janelas onde reforçar

    @Data
    @AllArgsConstructor
    public static class StockProjectionPeriod {
        private String label;        // ex: "Natal (01/12–25/12)"
        private String key;
        private double upliftFactor; // fator esperado de aumento vs. baseline
        private String action;       // "Reforce o estoque em X semanas antes"
        private String daysUntil;    // ex: "em 18 dias"
    }
}
