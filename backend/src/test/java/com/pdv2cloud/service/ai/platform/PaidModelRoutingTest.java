package com.pdv2cloud.service.ai.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** LGPD-07: o roteamento da plataforma nunca escolhe modelo gratuito, nem na rota nem na reserva. */
class PaidModelRoutingTest {

    private final UUID market = UUID.randomUUID();
    private final AiPlatformConfig config = mock(AiPlatformConfig.class);
    private final AiWalletService wallets = mock(AiWalletService.class);
    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final AiGate gate = new AiGate(config, wallets, jdbc);

    @BeforeEach
    void setUp() {
        when(config.settings()).thenReturn(new AiPlatformConfig.Settings(true, false, new BigDecimal("5.00"),
            new BigDecimal("10"), 3000, new BigDecimal("5.5"), 500, true, null, null));
        when(jdbc.queryForObject(anyString(), anyMap(), eq(BigDecimal.class))).thenReturn(BigDecimal.ZERO);
        when(jdbc.queryForList(anyString(), anyMap())).thenReturn(List.of());
        when(wallets.canSpend(market, 1)).thenReturn(true);
    }

    private AiPlatformConfig.Route route(String provider, String model) {
        return new AiPlatformConfig.Route("PERGUNTE_AOS_DADOS", "Chat", "FLASH", provider, model, 8000, 900, 0, 0.8, 1,
            BigDecimal.valueOf(0.30), BigDecimal.valueOf(1.20), false, true, null, null, null);
    }

    @Test
    void rotaComModeloGratuitoNaoAtende() {
        when(config.route("PERGUNTE_AOS_DADOS"))
            .thenReturn(Optional.of(route("OPENROUTER", "meta-llama/llama-3.3-70b-instruct:free")));
        when(config.key("OPENROUTER")).thenReturn(Optional.of(
            new AiPlatformConfig.Key("OPENROUTER", "https://openrouter.ai/api/v1", "k", null)));

        AiGate.Decision d = gate.decide(market, "PERGUNTE_AOS_DADOS");

        assertFalse(d.allowed());
        assertEquals(AiGate.Reason.FREE_MODEL, d.reason());
    }

    @Test
    void padraoGratuitoDoProvedorTambemNaoAtende() {
        when(config.route("PERGUNTE_AOS_DADOS")).thenReturn(Optional.of(route("OPENROUTER", null)));
        when(config.key("OPENROUTER")).thenReturn(Optional.of(
            new AiPlatformConfig.Key("OPENROUTER", "https://openrouter.ai/api/v1", "k", "openrouter/free")));

        assertEquals(AiGate.Reason.FREE_MODEL, gate.decide(market, "PERGUNTE_AOS_DADOS").reason());
    }

    @Test
    void rotaPagaAtende() {
        when(config.route("PERGUNTE_AOS_DADOS")).thenReturn(Optional.of(route("DEEPSEEK", "deepseek-flash")));
        when(config.key("DEEPSEEK")).thenReturn(Optional.of(
            new AiPlatformConfig.Key("DEEPSEEK", "https://api.deepseek.com", "k", null)));

        assertEquals(AiGate.Reason.OK, gate.decide(market, "PERGUNTE_AOS_DADOS").reason());
    }

    @Test
    void reservaGratuitaFicaForaDaCadeia() {
        AiGate.Decision primary = new AiGate.Decision(AiGate.Reason.OK, route("DEEPSEEK", "deepseek-flash"),
            new AiPlatformConfig.Key("DEEPSEEK", "https://api.deepseek.com", "k1", "deepseek-flash"));
        when(config.fallbacks("PERGUNTE_AOS_DADOS")).thenReturn(List.of(
            new AiPlatformConfig.Fallback("PERGUNTE_AOS_DADOS", 1, "OPENROUTER", "qwen/qwen3-8b:free",
                BigDecimal.ZERO, BigDecimal.ZERO, true, null, null),
            new AiPlatformConfig.Fallback("PERGUNTE_AOS_DADOS", 2, "OPENROUTER", "qwen/qwen3.7-flash",
                BigDecimal.valueOf(0.03), BigDecimal.valueOf(0.13), true, null, null)));
        when(config.key("OPENROUTER")).thenReturn(Optional.of(
            new AiPlatformConfig.Key("OPENROUTER", "https://openrouter.ai/api/v1", "k2", null)));

        List<AiGate.Decision> chain = gate.attempts(primary);

        assertEquals(2, chain.size());
        assertEquals("deepseek-flash", chain.get(0).model());
        assertEquals("qwen/qwen3.7-flash", chain.get(1).model());
    }
}
