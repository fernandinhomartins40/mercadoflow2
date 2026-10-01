package com.pdv2cloud.service.ai.agents;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.seasonal.SeasonalCalendarService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** Cenários: "e se" pelo motor. Data forte chegando + alta no ano passado = aviso com o que mais vendeu. */
class CenariosAgentTest {

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final SeasonalCalendarService calendar = mock(SeasonalCalendarService.class);
    private final CenariosAgent agent = new CenariosAgent(jdbc, calendar);
    private final UUID market = UUID.randomUUID();
    private final LocalDate today = LocalDate.of(2026, 11, 15);

    private void window(String status, long days) {
        when(calendar.resolveDisplayWindows(today)).thenReturn(List.of(new SeasonalCalendarService.SeasonalWindow(
            "natal", "Natal", "", LocalDate.of(2025, 12, 1), LocalDate.of(2025, 12, 25), "1 a 25/12", "Começa em " + days + " dias",
            status, 1, days)));
    }

    private void revenue(String season, String before) {
        when(jdbc.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(BigDecimal.class)))
            .thenReturn(new BigDecimal(season), new BigDecimal(before));
        when(jdbc.queryForList(anyString(), any(MapSqlParameterSource.class))).thenReturn(List.of(
            Map.of("produto", "Panetone 500g", "qtd", 320), Map.of("produto", "Espumante 750ml", "qtd", 140)));
    }

    @Test
    void avisaComAAltaEOQueMaisVendeu() {
        window("UPCOMING", 16);
        // 25 dias de temporada: R$ 50.000 (2.000/dia); 28 dias antes: R$ 42.000 (1.500/dia) → +33%.
        revenue("50000", "42000");
        List<AgentSignal> s = agent.signals(market, today);
        assertEquals(1, s.size());
        assertEquals("Natal: venda costuma subir 33%", s.get(0).title());
        assertTrue(s.get(0).body().contains("R$ 2.000,00 por dia, 33% acima das 4 semanas anteriores (R$ 1.500,00 por dia)"), s.get(0).body());
        assertTrue(s.get(0).body().contains("• Panetone 500g: 320 un."));
        assertFalse(s.get(0).actionable(), "cenário só informa: a decisão de compra é do lojista");
        assertEquals("natal|2025", s.get(0).key().substring(0, 10));
    }

    @Test
    void foraDaJanelaOuSemAltaNaoAvisa() {
        window("UPCOMING", 40);
        revenue("50000", "42000");
        assertTrue(agent.signals(market, today).isEmpty(), "longe demais");
        window("CURRENT", 5);
        assertTrue(agent.signals(market, today).isEmpty(), "já começou");
        window("UPCOMING", 10);
        revenue("38000", "42000");
        assertTrue(agent.signals(market, today).isEmpty(), "sem alta no ano passado");
    }
}
