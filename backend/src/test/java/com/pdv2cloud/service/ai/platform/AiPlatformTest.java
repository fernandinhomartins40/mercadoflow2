package com.pdv2cloud.service.ai.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** IA da plataforma: leitura do Jev, custo e as regras do portão. */
class AiPlatformTest {

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
        when(config.route("PERGUNTE_AOS_DADOS")).thenReturn(Optional.of(route("FLASH", 1, true)));
        when(config.settings()).thenReturn(settings(true, true, "5.00"));
        when(config.isPilot(market)).thenReturn(true);
        when(config.key("DEEPSEEK")).thenReturn(Optional.of(new AiPlatformConfig.Key("DEEPSEEK", "https://api.deepseek.com", "sk-x", "deepseek-flash")));
        when(jdbc.queryForObject(anyString(), anyMap(), eq(BigDecimal.class))).thenReturn(new BigDecimal("0.10"));
        when(wallets.canSpend(market, 1)).thenReturn(true);
    }

    @Test
    void liberadoQuandoTudoCerto() {
        AiGate.Decision d = gate.decide(market, "PERGUNTE_AOS_DADOS");
        assertTrue(d.allowed());
        assertEquals("deepseek-flash", d.model());
    }

    @Test
    void textoProntoNaoUsaModelo() {
        when(config.route("RESUMO_SEMANAL")).thenReturn(Optional.of(route("TEMPLATE", 1, true)));
        assertEquals(AiGate.Reason.TEMPLATE, gate.decide(market, "RESUMO_SEMANAL").reason());
    }

    @Test
    void interruptorGeralDesligado() {
        when(config.settings()).thenReturn(settings(false, true, "5.00"));
        assertEquals(AiGate.Reason.PLATFORM_OFF, gate.decide(market, "PERGUNTE_AOS_DADOS").reason());
    }

    @Test
    void foraDoPilotoNaoUsa() {
        when(config.isPilot(market)).thenReturn(false);
        assertEquals(AiGate.Reason.NOT_PILOT, gate.decide(market, "PERGUNTE_AOS_DADOS").reason());
    }

    @Test
    void semPilotoObrigatorioQualquerMercadoUsa() {
        when(config.settings()).thenReturn(settings(true, false, "5.00"));
        when(config.isPilot(market)).thenReturn(false);
        assertTrue(gate.decide(market, "PERGUNTE_AOS_DADOS").allowed());
    }

    @Test
    void semChaveDoProvedor() {
        when(config.key("DEEPSEEK")).thenReturn(Optional.empty());
        assertEquals(AiGate.Reason.NO_KEY, gate.decide(market, "PERGUNTE_AOS_DADOS").reason());
    }

    @Test
    void tetoDiarioAtingidoPara() {
        when(jdbc.queryForObject(anyString(), anyMap(), eq(BigDecimal.class))).thenReturn(new BigDecimal("5.00"));
        assertEquals(AiGate.Reason.DAILY_BUDGET, gate.decide(market, "PERGUNTE_AOS_DADOS").reason());
    }

    @Test
    void semCreditosNaoUsa() {
        when(wallets.canSpend(market, 1)).thenReturn(false);
        AiGate.Decision d = gate.decide(market, "PERGUNTE_AOS_DADOS");
        assertEquals(AiGate.Reason.NO_CREDITS, d.reason());
        assertTrue(d.message().contains("créditos"));
    }

    @Test
    void tarefaDesligada() {
        when(config.route("PERGUNTE_AOS_DADOS")).thenReturn(Optional.of(route("FLASH", 1, false)));
        assertEquals(AiGate.Reason.DISABLED_TASK, gate.decide(market, "PERGUNTE_AOS_DADOS").reason());
    }

    @Test
    void consoleNaoDebita() {
        AiPlatformConfig.Route r = route("FLASH", 3, true);
        int credits = AiGate.withoutCharge(() -> gate.charge(market, r, null));
        assertEquals(0, credits);
        verify(wallets, never()).debit(any(), anyInt(), anyString(), any());
    }

    @Test
    void cobrancaDebitaOsCreditosDaRota() {
        AiPlatformConfig.Route r = route("FLASH", 3, true);
        when(wallets.debit(market, 3, "PERGUNTE_AOS_DADOS", null)).thenReturn(true);
        assertEquals(3, gate.charge(market, r, null));
    }

    @Test
    void custoPeloPrecoDeReferencia() {
        // 8.000 entrada a US$ 0,30/M + 600 saída a US$ 1,20/M = 0,0024 + 0,00072
        assertEquals(0.00312, AiGate.costUsd(route("FLASH", 1, true), 8000, 600), 1e-9);
    }

    @Test
    void leRespostaDoJev() throws Exception {
        String json = """
            {"model":"jev-1.13.0","answers":{
              "ferramenta":{"type":"choice","choice":"resumo_de_vendas","probabilities":{"resumo_de_vendas":0.9,"nenhuma":0.1},"confidence":0.82},
              "urgente":{"type":"noul","noul":0.2}},
             "usage":{"input_tokens":312,"output_tokens":48}}
            """;
        Map<String, JevClient.Question> questions = new java.util.LinkedHashMap<>();
        questions.put("ferramenta", JevClient.Question.choice("?", Map.of("resumo_de_vendas", "a", "nenhuma", "b")));
        questions.put("urgente", JevClient.Question.yesNo("?"));
        JevClient.Result r = new JevClient().parse(new ObjectMapper().readTree(json), questions, 120);
        assertTrue(r.success());
        assertEquals(312, r.inputTokens());
        assertEquals("resumo_de_vendas", r.answers().get("ferramenta").answer());
        assertEquals(0.82, r.answers().get("ferramenta").confidence(), 1e-9);
        assertEquals("nao", r.answers().get("urgente").answer());
        assertEquals(0.6, r.answers().get("urgente").confidence(), 1e-9);
        assertFalse(r.answers().containsKey("inexistente"));
    }

    private static AiPlatformConfig.Route route(String layer, int credits, boolean enabled) {
        return new AiPlatformConfig.Route("PERGUNTE_AOS_DADOS", "Chat", layer, "DEEPSEEK", null, 8000, 900, 0.0, 0.8, credits,
            new BigDecimal("0.30"), new BigDecimal("1.20"), false, enabled, null, null, null);
    }

    private static AiPlatformConfig.Settings settings(boolean enabled, boolean pilotOnly, String budget) {
        return new AiPlatformConfig.Settings(enabled, pilotOnly, new BigDecimal(budget), new BigDecimal("10"), 3000,
            new BigDecimal("5.5"), 500, true, null, null);
    }
}
