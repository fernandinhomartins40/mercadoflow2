package com.pdv2cloud.service.ai.agents;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.ai.AiUsageRecorder;
import com.pdv2cloud.service.ai.platform.AiGate;
import com.pdv2cloud.service.ai.platform.AiPlatformConfig;
import com.pdv2cloud.service.ai.platform.JevClient;
import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** O funil dos agentes: o Jev só silencia com confiança, e sem Jev a regra segura o produto. */
class AgentFunnelTest {

    private final AiGate gate = mock(AiGate.class);
    private final JevClient jev = mock(JevClient.class);
    private final LessonService lessons = mock(LessonService.class);
    private final AgentRunner runner = new AgentRunner(List.of(), mock(CopilotSettingsService.class), lessons, gate, jev,
        mock(AiUsageRecorder.class), mock(NamedParameterJdbcTemplate.class));
    private final UUID market = UUID.randomUUID();

    private AgentSignal signal(String kind, BigDecimal impact) {
        return new AgentSignal("COMPRAS", kind, "compras", "Pedido sugerido: 3 produtos", "• Leite: comprar 12 un.",
            Map.of("produtos", 3), Map.of(), impact, true, "a:1,b:2");
    }

    private void jevReady() {
        AiPlatformConfig.Route route = new AiPlatformConfig.Route("JEV_VIGILIA", "Jev", "JEV", "JEV", "jev-latest", 2000, 0, 0,
            0.8, 0, BigDecimal.valueOf(0.042), BigDecimal.ZERO, false, true, null, null, null);
        when(gate.decide(market, "JEV_VIGILIA")).thenReturn(new AiGate.Decision(AiGate.Reason.OK, route,
            new AiPlatformConfig.Key("JEV", "https://api.typesafe.ai", "k", "jev-latest")));
        when(lessons.about(any(), any())).thenReturn(List.of());
    }

    private void jevSays(String worth, double worthConfidence, String urgent) {
        when(jev.decide(anyString(), anyString(), anyString(), any(), any())).thenReturn(new JevClient.Result(true, Map.of(
            "vale", new JevClient.Answer(worth, worthConfidence, "sim".equals(worth) ? 0.9 : 0.1, Map.of()),
            "urgente", new JevClient.Answer(urgent, 0.9, null, Map.of())), 200, 30, null));
    }

    @Test
    void semJevValeARegraENadaESilenciado() {
        when(gate.decide(market, "JEV_VIGILIA")).thenReturn(new AiGate.Decision(AiGate.Reason.PLATFORM_OFF, null, null));

        AgentRunner.Verdict v = runner.judge(market, signal("PEDIDO", BigDecimal.valueOf(800)));

        assertTrue(v.worth());
        assertTrue(v.urgent(), "impacto acima de R$ 500 é urgente pela regra");
        assertEquals("REGRA", v.source());
        verifyNoInteractions(jev);
    }

    @Test
    void jevSilenciaSoComConfianca() {
        jevReady();
        jevSays("nao", 0.95, "nao");
        assertFalse(runner.judge(market, signal("PEDIDO", BigDecimal.TEN)).worth());

        jevSays("nao", 0.3, "nao");
        assertTrue(runner.judge(market, signal("PEDIDO", BigDecimal.TEN)).worth(), "na dúvida o lojista recebe");
    }

    @Test
    void mensagemAoFornecedorEUrgenteMesmoSeOJevDisserQueNao() {
        jevReady();
        jevSays("sim", 0.9, "nao");
        AgentRunner.Verdict v = runner.judge(market, signal("MENSAGEM_FORNECEDOR", null));
        assertTrue(v.worth());
        assertTrue(v.urgent());
        assertEquals("JEV", v.source());
    }

    @Test
    void jevRecebeAsLicoesDoAssunto() {
        jevReady();
        when(lessons.about(market, "compras")).thenReturn(List.of(new LessonService.Lesson(UUID.randomUUID(), "PREFERENCIA",
            "compras", "x", "O dono recusou pedido acima de R$ 3 mil.", 1, java.time.LocalDateTime.now())));
        jevSays("sim", 0.9, "nao");
        runner.judge(market, signal("PEDIDO", BigDecimal.TEN));
        org.mockito.ArgumentCaptor<Object> state = org.mockito.ArgumentCaptor.forClass(Object.class);
        org.mockito.Mockito.verify(jev).decide(anyString(), anyString(), anyString(), state.capture(), any());
        assertTrue(String.valueOf(state.getValue()).contains("O dono recusou pedido acima de R$ 3 mil."));
    }

    @Test
    void mesmoSinalMesmoHashNumerosNovosHashNovo() {
        AgentSignal a = signal("PEDIDO", BigDecimal.ONE);
        AgentSignal b = new AgentSignal("COMPRAS", "PEDIDO", "compras", "outro título", "outro corpo", Map.of(), Map.of(),
            BigDecimal.TEN, true, "a:1,b:2");
        AgentSignal c = new AgentSignal("COMPRAS", "PEDIDO", "compras", "Pedido", "x", Map.of(), Map.of(), null, true, "a:1,b:3");
        assertEquals(a.hash(), b.hash(), "o hash vem dos números (chave), não do texto");
        assertNotEquals(a.hash(), c.hash());
    }

    @Test
    void horarioDeSilencioQueViraAMeiaNoite() {
        CopilotSettingsService.Prefs p = new CopilotSettingsService.Prefs(LocalTime.of(21, 0), LocalTime.of(7, 0), null, false);
        assertTrue(CopilotSettingsService.quiet(p, LocalTime.of(23, 30)));
        assertTrue(CopilotSettingsService.quiet(p, LocalTime.of(6, 59)));
        assertFalse(CopilotSettingsService.quiet(p, LocalTime.of(7, 0)));
        assertFalse(CopilotSettingsService.quiet(p, LocalTime.of(12, 0)));
        CopilotSettingsService.Prefs day = new CopilotSettingsService.Prefs(LocalTime.of(12, 0), LocalTime.of(14, 0), null, false);
        assertTrue(CopilotSettingsService.quiet(day, LocalTime.of(13, 0)));
        assertFalse(CopilotSettingsService.quiet(day, LocalTime.of(15, 0)));
    }

    @Test
    void telefoneDoWhatsappNormalizado() {
        assertEquals("5511987654321", CopilotSettingsService.normalizePhone("(11) 98765-4321"));
        assertEquals("5511987654321", CopilotSettingsService.normalizePhone("+55 11 98765-4321"));
        assertNull(CopilotSettingsService.normalizePhone(" "));
        assertThrows(IllegalArgumentException.class, () -> CopilotSettingsService.normalizePhone("1234"));
    }

    @Test
    void mensagemAoFornecedorComFaltaSobraEProblema() {
        String msg = RecebimentoAgent.supplierMessage("Atacado Bom Preço", "45678", "29/09",
            List.of("2 CX de Leite Moça"), List.of(), List.of("Avaria: Óleo 900ml (2 amassadas)"));
        assertTrue(msg.startsWith("Olá, Atacado Bom Preço. Conferimos a entrega da nota 45678 em 29/09"));
        assertTrue(msg.contains("Faltou:\n- 2 CX de Leite Moça"));
        assertFalse(msg.contains("Veio a mais"));
        assertTrue(msg.contains("Problemas:\n- Avaria: Óleo 900ml (2 amassadas)"));
    }

    @Test
    void agenteGerenteNaoPreparaAcao() {
        assertFalse(new GerenteAgent(mock(NamedParameterJdbcTemplate.class)).signals(market).stream()
            .anyMatch(AgentSignal::actionable));
        assertEquals(Map.of(), new GerenteAgent(mock(NamedParameterJdbcTemplate.class)).execute(market, Map.of(), "x"));
    }
}
