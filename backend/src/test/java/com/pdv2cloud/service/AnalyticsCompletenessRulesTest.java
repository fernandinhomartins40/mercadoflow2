package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Regras da auditoria de 06/10/2026: comparar só dias completos, na ordem do calendário. */
class AnalyticsCompletenessRulesTest {

    @Test
    void tendenciaPorDiaCompleto() {
        // Antes: R$ 998 mil x R$ 216 mil = +361%. Por dia completo: mesma venda diária = 0%.
        assertEquals(0.0, AdvancedAnalyticsService.completeTrend(9000, 60, 1500, 10), 1e-9);
        assertEquals(10.0, AdvancedAnalyticsService.completeTrend(110, 10, 100, 10), 1e-9);
        assertNull(AdvancedAnalyticsService.completeTrend(100, 10, 0, 10), "sem venda antes não há base");
        assertNull(AdvancedAnalyticsService.completeTrend(100, 10, 50, 0));
    }

    @Test
    void serieDoCalendarioComZeroNosDiasSemVenda() {
        LocalDate d1 = LocalDate.of(2026, 9, 1);
        LocalDate d2 = d1.plusDays(1);
        LocalDate d3 = d1.plusDays(2);
        List<Double> s = WorkingCapitalService.denseSeries(Map.of(d1, 10.0, d3, 30.0), List.of(d1, d2, d3));
        assertEquals(List.of(10.0, 0.0, 30.0), s);
    }
}
