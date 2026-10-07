package com.pdv2cloud.service.intelligence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.pdv2cloud.model.entity.ProductCapitalMetric.CapitalStatus;
import com.pdv2cloud.service.WorkingCapitalService.CapitalMetric;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CapitalScoreboardTest {

    private static CapitalMetric m(double revenue, double margin, String costSource, Double stockValue, Double confidence, CapitalStatus status) {
        BigDecimal z = BigDecimal.ZERO;
        return new CapitalMetric(UUID.randomUUID(), "p", "c", "1", null,
            BigDecimal.valueOf(revenue), z, BigDecimal.valueOf(margin), z, z, z, costSource,
            z, z, "A", "X", z, z, z,
            stockValue == null ? null : BigDecimal.valueOf(stockValue),
            confidence == null ? null : BigDecimal.valueOf(confidence), null,
            z, z, z, z, z, z, z, status, null, z, null);
    }

    @Test
    void somaEstoqueMargemEDinheiroParado() {
        // 90 dias: 9.000 de venda com 2.700 de margem; estoque conhecido de 2.100 nos dois primeiros
        CapitalScoreboardService.Score s = CapitalScoreboardService.compute(List.of(
            m(6000, 1800, "PURCHASE", 1400.0, 0.9, CapitalStatus.MANTER),
            m(2000, 600, "PURCHASE", 700.0, 0.8, CapitalStatus.LIQUIDAR),
            m(1000, 300, "MARGIN_ESTIMATE", null, null, CapitalStatus.MANTER)), 90);
        assertEquals(new BigDecimal("2100.00"), s.stockValue());
        assertEquals(new BigDecimal("3000.00"), s.revenue30());
        assertEquals(new BigDecimal("900.00"), s.margin30());
        assertEquals(new BigDecimal("30.00"), s.marginPercent());
        assertEquals(0.8889, s.stockMeasuredShare(), 0.001);   // 8.000 de 9.000 com estoque conhecido
        assertEquals(0.8889, s.marginMeasuredShare(), 0.001);  // 1.000 com custo estimado
        // custo do que vende por dia nos que têm estoque: (8000-2400)/90 = 62,22 → 2100/62,22 = 33,8 dias
        assertEquals(new BigDecimal("33.8"), s.daysOfStock());
        assertEquals(new BigDecimal("700.00"), s.idleValue());
        assertEquals(1, s.idleProducts());
    }

    @Test
    void semEstoqueConhecidoNaoInventaNumero() {
        CapitalScoreboardService.Score s = CapitalScoreboardService.compute(List.of(
            m(1000, 300, "MARGIN_ESTIMATE", 500.0, 0.1, CapitalStatus.LIQUIDAR)), 90);
        assertNull(s.stockValue());
        assertNull(s.daysOfStock());
        assertEquals(new BigDecimal("0.00"), s.idleValue());
    }
}
