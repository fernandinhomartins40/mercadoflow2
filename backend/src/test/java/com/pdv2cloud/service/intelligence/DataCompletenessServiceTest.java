package com.pdv2cloud.service.intelligence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.junit.jupiter.api.Test;

class DataCompletenessServiceTest {

    private final LocalDate today = LocalDate.of(2026, 10, 6);

    /** Formato real do Super Novo: ~150 notas/dia completo, ~22 nos meses parciais. */
    private Map<LocalDate, Long> history() {
        Map<LocalDate, Long> m = new TreeMap<>();
        for (LocalDate d = LocalDate.of(2026, 8, 1); d.isBefore(today.plusDays(1)); d = d.plusDays(1)) m.put(d, 150L);
        for (LocalDate d = LocalDate.of(2026, 5, 1); d.isBefore(LocalDate.of(2026, 6, 1)); d = d.plusDays(1)) m.put(d, 22L);
        m.put(today, 40L); // hoje, ainda acontecendo
        return m;
    }

    @Test
    void diaParcialNaoEhCompletoEDiaCheioEh() {
        DataCompletenessService.Coverage c = DataCompletenessService.classify(history(), today);
        assertTrue(c.isComplete(LocalDate.of(2026, 9, 15)));
        assertFalse(c.isComplete(LocalDate.of(2026, 5, 15)), "22 notas contra ~150 é mês com notas faltando");
        assertFalse(c.isComplete(LocalDate.of(2026, 6, 15)), "sem nota nenhuma");
        assertFalse(c.isComplete(today), "hoje nunca é completo");
    }

    @Test
    void fatiaELacunasDoPeriodo() {
        DataCompletenessService.Coverage c = DataCompletenessService.classify(history(), today);
        assertEquals(1.0, c.share(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 10, 1)), 1e-9);
        assertEquals(0.0, c.share(LocalDate.of(2026, 6, 1), LocalDate.of(2026, 7, 1)), 1e-9);
        List<DataCompletenessService.Gap> gaps = c.gaps(LocalDate.of(2026, 5, 1), LocalDate.of(2026, 8, 1));
        assertEquals(1, gaps.size());
        assertEquals(LocalDate.of(2026, 5, 1), gaps.get(0).from());
        assertEquals(LocalDate.of(2026, 7, 31), gaps.get(0).to());
    }

    @Test
    void percentil75IgualAoDoPostgres() {
        assertEquals(3.25, DataCompletenessService.p75(List.of(1L, 2L, 3L, 4L)), 1e-9);
        assertEquals(150.0, DataCompletenessService.p75(List.of(150L, 150L, 150L)), 1e-9);
    }
}
