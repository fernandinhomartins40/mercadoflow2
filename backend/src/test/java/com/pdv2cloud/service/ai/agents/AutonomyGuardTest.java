package com.pdv2cloud.service.ai.agents;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** Nível 3: o agente só age sozinho com todas as travas abertas; qualquer uma fechada, a decisão espera o sim. */
class AutonomyGuardTest {

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final CopilotSettingsService settings = mock(CopilotSettingsService.class);
    private final AutonomyGuard guard = new AutonomyGuard(jdbc, settings);
    private final UUID market = UUID.randomUUID();
    private final String supplier = UUID.randomUUID().toString();
    private final String rec = UUID.randomUUID().toString();

    @BeforeEach
    void open() {
        when(settings.autonomyConfig()).thenReturn(new CopilotSettingsService.AutonomyConfig(true, BigDecimal.valueOf(2000)));
        when(settings.autonomyPaused(market)).thenReturn(false);
        when(jdbc.queryForObject(anyString(), anyMap(), eq(BigDecimal.class))).thenReturn(BigDecimal.valueOf(100));
        when(jdbc.queryForList(anyString(), any(MapSqlParameterSource.class))).thenReturn(List.of(Map.of("id", rec, "supplier_id", supplier)));
    }

    private CopilotSettingsService.AgentSettings cfg(int level, LocalDateTime accepted, String... allowed) {
        return new CopilotSettingsService.AgentSettings("COMPRAS", "Compras", true, level, 5, BigDecimal.ZERO,
            new CopilotSettingsService.Autonomy(true, BigDecimal.valueOf(500), BigDecimal.valueOf(800), List.of(allowed), accepted, "dono"));
    }

    private AgentSignal pedido(double valor) {
        return new AgentSignal("COMPRAS", "PEDIDO", "compras", "Pedido", "", Map.of("valorEstimado", BigDecimal.valueOf(valor)),
            Map.of("recommendationIds", List.of(rec)), BigDecimal.TEN, true, "k");
    }

    @Test
    void tudoAbertoAgeSozinho() {
        assertNull(guard.blockReason(market, pedido(300), cfg(3, LocalDateTime.now(), supplier)));
    }

    @Test
    void cadaTravaSegura() {
        assertEquals("nivel", guard.blockReason(market, pedido(300), cfg(2, LocalDateTime.now(), supplier)));
        assertEquals("sem aceite do lojista", guard.blockReason(market, pedido(300), cfg(3, null, supplier)));
        assertEquals("acima do teto por pedido", guard.blockReason(market, pedido(501), cfg(3, LocalDateTime.now(), supplier)));
        // Já fez R$ 100 hoje: + R$ 750 passa do teto do dia (R$ 800)... mas também do teto por pedido; com R$ 450 + 100 cabe.
        when(jdbc.queryForObject(anyString(), anyMap(), eq(BigDecimal.class))).thenReturn(BigDecimal.valueOf(400));
        assertEquals("acima do teto do dia", guard.blockReason(market, pedido(450), cfg(3, LocalDateTime.now(), supplier)));
        when(jdbc.queryForObject(anyString(), anyMap(), eq(BigDecimal.class))).thenReturn(BigDecimal.valueOf(100));
        assertEquals("fornecedor fora da lista", guard.blockReason(market, pedido(300), cfg(3, LocalDateTime.now(), UUID.randomUUID().toString())));
    }

    @Test
    void itemSemFornecedorConhecidoNaoAgeSozinho() {
        when(jdbc.queryForList(anyString(), any(MapSqlParameterSource.class))).thenReturn(List.of(new java.util.HashMap<>(Map.of("id", rec))));
        assertEquals("fornecedor fora da lista", guard.blockReason(market, pedido(300), cfg(3, LocalDateTime.now(), supplier)));
    }

    @Test
    void plataformaDesligadaOuPausadoSegura() {
        when(settings.autonomyPaused(market)).thenReturn(true);
        assertEquals("pausado pelo lojista", guard.blockReason(market, pedido(300), cfg(3, LocalDateTime.now(), supplier)));
        when(settings.autonomyConfig()).thenReturn(new CopilotSettingsService.AutonomyConfig(false, BigDecimal.valueOf(2000)));
        assertEquals("autonomia não liberada pela plataforma", guard.blockReason(market, pedido(300), cfg(3, LocalDateTime.now(), supplier)));
    }

    @Test
    void outrosAgentesNuncaAgemSozinhos() {
        AgentSignal preco = new AgentSignal("PRECO", "AJUSTE_PRECO", "preco", "Preço", "", Map.of("valorEstimado", 10),
            Map.of("recommendationIds", List.of(rec)), BigDecimal.TEN, true, "k");
        assertEquals("nivel", guard.blockReason(market, preco, cfg(3, LocalDateTime.now(), supplier)));
    }
}
