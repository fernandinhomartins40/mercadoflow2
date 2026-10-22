package com.pdv2cloud.service.ai.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** REC-02: o portão da IA para conta que não pode gastar (não só a restrita). */
class AiGateAccountStateTest {

    private final UUID market = UUID.randomUUID();
    private AiPlatformConfig config;
    private AiWalletService wallets;
    private NamedParameterJdbcTemplate jdbc;
    private AiGate gate;

    @BeforeEach
    void setUp() {
        config = mock(AiPlatformConfig.class);
        wallets = mock(AiWalletService.class);
        jdbc = mock(NamedParameterJdbcTemplate.class);
        gate = new AiGate(config, wallets, jdbc);
        AiPlatformConfig.Route route = new AiPlatformConfig.Route("PERGUNTE_AOS_DADOS", "Perguntas", "FLASH", "DEEPSEEK", "deepseek-flash",
            8000, 800, 0.2, 0.7, 1, new BigDecimal("0.27"), new BigDecimal("1.10"), false, true, null, null, null);
        when(config.route("PERGUNTE_AOS_DADOS")).thenReturn(Optional.of(route));
        when(config.settings()).thenReturn(new AiPlatformConfig.Settings(true, false, new BigDecimal("5.00"), new BigDecimal("10"), 3000,
            new BigDecimal("5.5"), 500, true, null, null));
        when(config.key("DEEPSEEK")).thenReturn(Optional.of(new AiPlatformConfig.Key("DEEPSEEK", "https://api.deepseek.com", "sk-x", "deepseek-flash")));
        when(jdbc.queryForObject(anyString(), anyMap(), eq(BigDecimal.class))).thenReturn(new BigDecimal("0.10"));
        when(wallets.canSpend(market, 1)).thenReturn(true);
    }

    private void account(boolean active, String status, LocalDateTime expires) {
        Map<String, Object> row = new HashMap<>();
        row.put("is_active", active);
        row.put("billing_status", status);
        row.put("access_expires_at", expires == null ? null : Timestamp.valueOf(expires));
        when(jdbc.queryForList(contains("from markets"), anyMap())).thenReturn(List.of(row));
    }

    @Test
    void canceladaSuspensaPendenteNaoUsamIa() {
        for (String s : List.of("CANCELLED", "SUSPENDED", "PENDING", "RESTRICTED")) {
            account(true, s, null);
            assertEquals(AiGate.Reason.RESTRICTED, gate.decide(market, "PERGUNTE_AOS_DADOS").reason(), s);
        }
        verify(wallets, never()).canSpend(market, 1);
    }

    @Test
    void vencidaOuDesativadaNaoUsaIa() {
        account(true, "ACTIVE", LocalDateTime.now().minusDays(1));
        assertEquals(AiGate.Reason.RESTRICTED, gate.decide(market, "PERGUNTE_AOS_DADOS").reason());
        account(false, "ACTIVE", null);
        assertEquals(AiGate.Reason.RESTRICTED, gate.decide(market, "PERGUNTE_AOS_DADOS").reason());
    }

    @Test
    void emDiaTesteECarenciaUsam() {
        for (String s : List.of("ACTIVE", "TRIAL", "PAST_DUE")) {
            account(true, s, null);
            assertTrue(gate.decide(market, "PERGUNTE_AOS_DADOS").allowed(), s);
        }
    }
}
