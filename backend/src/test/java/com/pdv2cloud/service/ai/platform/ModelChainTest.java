package com.pdv2cloud.service.ai.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.ai.agents.PromocoesAgent;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** Cadeia de reserva: principal primeiro, depois as reservas com chave, cada uma com o próprio preço. */
class ModelChainTest {

    private final AiPlatformConfig config = mock(AiPlatformConfig.class);
    private final AiGate gate = new AiGate(config, mock(AiWalletService.class), mock(NamedParameterJdbcTemplate.class));

    private AiPlatformConfig.Route route() {
        return new AiPlatformConfig.Route("PERGUNTE_AOS_DADOS", "Chat", "FLASH", "DEEPSEEK", "deepseek-flash", 8000, 900, 0, 0.8, 1,
            BigDecimal.valueOf(0.30), BigDecimal.valueOf(1.20), false, true, null, null, null);
    }

    @Test
    void principalEReservasComPrecoProprio() {
        AiGate.Decision primary = new AiGate.Decision(AiGate.Reason.OK, route(),
            new AiPlatformConfig.Key("DEEPSEEK", "https://api.deepseek.com", "k1", "deepseek-flash"));
        when(config.fallbacks("PERGUNTE_AOS_DADOS")).thenReturn(List.of(
            new AiPlatformConfig.Fallback("PERGUNTE_AOS_DADOS", 1, "OPENROUTER", "qwen/qwen3.5-flash",
                BigDecimal.valueOf(0.10), BigDecimal.valueOf(0.40), true, null, null),
            new AiPlatformConfig.Fallback("PERGUNTE_AOS_DADOS", 2, "DEEPSEEK", "deepseek-pro",
                BigDecimal.valueOf(0.66), BigDecimal.valueOf(1.98), true, null, null)));
        when(config.key("OPENROUTER")).thenReturn(Optional.of(new AiPlatformConfig.Key("OPENROUTER", "https://openrouter.ai/api/v1", "k2", null)));
        when(config.key("DEEPSEEK")).thenReturn(Optional.of(new AiPlatformConfig.Key("DEEPSEEK", "https://api.deepseek.com", "k1", null)));

        List<AiGate.Decision> chain = gate.attempts(primary);

        assertEquals(3, chain.size());
        assertEquals("deepseek-flash", chain.get(0).model());
        assertEquals("qwen/qwen3.5-flash", chain.get(1).model());
        assertEquals("OPENROUTER", chain.get(1).route().provider());
        // 1M de entrada + 1M de saída no Qwen = 0,10 + 0,40.
        assertEquals(0.50, AiGate.costUsd(chain.get(1).route(), 1_000_000, 1_000_000), 1e-9);
        assertEquals(1, chain.get(1).route().creditsPerUse(), "o lojista paga o mesmo crédito, qualquer que seja o modelo");
    }

    @Test
    void reservaSemChaveFicaDeFora() {
        AiGate.Decision primary = new AiGate.Decision(AiGate.Reason.OK, route(),
            new AiPlatformConfig.Key("DEEPSEEK", "https://api.deepseek.com", "k1", "deepseek-flash"));
        when(config.fallbacks("PERGUNTE_AOS_DADOS")).thenReturn(List.of(new AiPlatformConfig.Fallback("PERGUNTE_AOS_DADOS", 1,
            "OPENROUTER", "qwen/qwen3.5-flash", BigDecimal.ONE, BigDecimal.ONE, true, null, null)));
        when(config.key("OPENROUTER")).thenReturn(Optional.empty());
        assertEquals(1, gate.attempts(primary).size());
    }

    @Test
    void precoDeOfertaComDesconto() {
        assertEquals(new BigDecimal("8.49"), PromocoesAgent.offer(new BigDecimal("9.99"), new BigDecimal("15")));
    }
}
