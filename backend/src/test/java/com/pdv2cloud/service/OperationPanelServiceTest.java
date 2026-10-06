package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OperationPanelServiceTest {

    @Test
    void diaComparaComOMesmoDiaDaSemanaAteAMesmaHora() {
        LocalDate terca = LocalDate.of(2026, 10, 6);
        LocalDateTime agora = terca.atTime(14, 30);
        OperationPanelService.Window w = OperationPanelService.window(OperationPanelService.Period.DIA, terca, agora);
        assertEquals(terca.atStartOfDay(), w.start());
        assertEquals(agora, w.end());
        assertEquals(LocalDate.of(2026, 9, 29).atStartOfDay(), w.prevStart());
        assertEquals(LocalDate.of(2026, 9, 29).atTime(14, 30), w.prevEnd());
    }

    @Test
    void semanaEMesSaoJanelasSeguidasSemSobreposicao() {
        LocalDateTime corte = LocalDate.of(2026, 10, 6).atTime(10, 0);
        OperationPanelService.Window s = OperationPanelService.window(OperationPanelService.Period.SEMANA, corte.toLocalDate(), corte);
        assertEquals(corte.minusDays(7), s.start());
        assertEquals(s.start(), s.prevEnd());
        OperationPanelService.Window m = OperationPanelService.window(OperationPanelService.Period.MES, corte.toLocalDate(), corte);
        assertEquals(corte.minusDays(28), m.start());
        assertEquals(m.start(), m.prevEnd());
        assertEquals(corte.minusDays(56), m.prevStart());
    }

    @Test
    void variacaoSemBaseFicaNula() {
        assertNull(OperationPanelService.change(BigDecimal.TEN, BigDecimal.ZERO));
        assertEquals(10.0, OperationPanelService.change(BigDecimal.valueOf(110), BigDecimal.valueOf(100)), 1e-9);
    }

    @Test
    void rotuloDaComparacaoFalaComoODono() {
        assertEquals("vs terça passada até esta hora",
            OperationPanelService.comparisonLabel(OperationPanelService.Period.DIA, LocalDate.of(2026, 10, 6), true));
        assertEquals("vs sábado passado",
            OperationPanelService.comparisonLabel(OperationPanelService.Period.DIA, LocalDate.of(2026, 10, 3), false));
        assertEquals("terças", OperationPanelService.weekdayPlural(LocalDate.of(2026, 10, 6)));
    }

    private static OperationPanelService.ItemRow row(UUID id, String dep, double cur, double prev, double qty) {
        return new OperationPanelService.ItemRow(id, "P" + dep, null, dep, BigDecimal.valueOf(cur), BigDecimal.valueOf(prev),
            BigDecimal.valueOf(qty), 1, 1);
    }

    @Test
    void departamentosSomamOsProdutosEOrdenamPelaVenda() {
        List<OperationPanelService.ItemRow> items = List.of(
            row(UUID.randomUUID(), "Bebidas", 100, 50, 10),
            row(UUID.randomUUID(), "Açougue", 300, 300, 5),
            row(UUID.randomUUID(), "Bebidas", 100, 50, 10),
            row(null, "Outros", 0, 20, 0));
        List<OperationPanelService.Department> deps = OperationPanelService.departments(items);
        assertEquals("Açougue", deps.get(0).name());
        assertEquals("Bebidas", deps.get(1).name());
        assertEquals(100.0, deps.get(1).change(), 1e-9);
        assertEquals(0.4, deps.get(1).share(), 1e-9);
    }

    @Test
    void quemPuxouEmReaisNaoEmPercentual() {
        UUID grande = UUID.randomUUID();
        UUID pequeno = UUID.randomUUID();
        List<OperationPanelService.ItemRow> items = List.of(
            row(grande, "A", 1500, 1000, 1),   // +500 reais, +50%
            row(pequeno, "B", 30, 10, 1),      // +20 reais, +200%
            row(UUID.randomUUID(), "C", 50, 400, 1));
        assertEquals(grande, OperationPanelService.movers(items, true).get(0).productId());
        assertEquals(1, OperationPanelService.movers(items, false).size());
    }

    @Test
    void margemSoComCustoParaAMaiorParteDoVendido() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        List<OperationPanelService.ItemRow> items = List.of(row(a, "A", 800, 0, 10), row(b, "B", 200, 0, 10));
        OperationPanelService.Margin m = OperationPanelService.margin(items, Map.of(a, BigDecimal.valueOf(60)));
        assertEquals(0.8, m.coverage(), 1e-9);
        assertEquals(25.0, m.percent(), 1e-9);
        assertNull(OperationPanelService.margin(items, Map.of(b, BigDecimal.ONE)).percent());
    }
}
