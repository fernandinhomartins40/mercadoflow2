package com.pdv2cloud.service.opportunity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.pdv2cloud.model.entity.Recommendation;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class DecisionQueueHygieneTest {

    private static Recommendation rec(String impact, String confidence) {
        Recommendation r = new Recommendation();
        r.setExpectedImpactValue(impact == null ? null : new BigDecimal(impact));
        r.setConfidence(confidence == null ? null : new BigDecimal(confidence));
        return r;
    }

    @Test
    void soEntraNaFilaComGanhoEConfianca() {
        assertTrue(RecommendationEngine.worthDeciding(rec("120.00", "0.80")));
        assertTrue(RecommendationEngine.worthDeciding(rec("120.00", null)));   // promoção: confiança vem do texto
        assertFalse(RecommendationEngine.worthDeciding(rec("0.00", "0.90")));  // sem ganho
        assertFalse(RecommendationEngine.worthDeciding(rec(null, "0.90")));
        assertFalse(RecommendationEngine.worthDeciding(rec("500.00", "0.15"))); // certeza baixa
    }

    @Test
    void compraTemTetoDeBomSenso() {
        // 635 calculadas; últimas compras de até 120; vende 29,5/dia → teto = max(240, 885) = 885
        assertEquals(new BigDecimal("635"), CapitalOpportunityDetector.capQuantity(new BigDecimal("634.81"), new BigDecimal("120"), new BigDecimal("29.5")));
        // vende 2/dia, comprava 10: teto = max(20, 60) = 60
        assertEquals(new BigDecimal("60"), CapitalOpportunityDetector.capQuantity(new BigDecimal("1812"), new BigDecimal("10"), new BigDecimal("2")));
        // sem histórico de compra: só os 30 dias de venda
        assertEquals(new BigDecimal("90"), CapitalOpportunityDetector.capQuantity(new BigDecimal("400"), null, new BigDecimal("3")));
        // quantidade inteira, arredondada para cima
        assertEquals(new BigDecimal("13"), CapitalOpportunityDetector.capQuantity(new BigDecimal("12.2"), new BigDecimal("50"), new BigDecimal("5")));
        assertNull(CapitalOpportunityDetector.capQuantity(null, BigDecimal.TEN, BigDecimal.ONE));
    }
}
