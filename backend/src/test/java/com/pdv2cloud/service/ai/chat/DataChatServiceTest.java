package com.pdv2cloud.service.ai.chat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.ai.AiOrchestrator;
import com.pdv2cloud.service.ai.AiUsageRecorder;
import com.pdv2cloud.service.ai.LlmClient;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * O contrato do "Pergunte aos dados".
 *
 * O teste que mais importa aqui é o do isolamento entre lojas: o
 * {@code marketId} tem de vir do contexto autenticado, nunca dos argumentos
 * que o modelo produz. Se essa garantia cair, bastaria o modelo alucinar um
 * UUID para um lojista ler os números de outro.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DataChatServiceTest {

    @Mock private AiOrchestrator orchestrator;
    @Mock private AiUsageRecorder usageRecorder;
    @Mock private LlmClient llmClient;
    @Mock private CapitalTools capitalTools;
    @Mock private SalesTools salesTools;
    @Mock private OpportunityTools opportunityTools;

    private DataChatService service;
    private final UUID marketId = UUID.randomUUID();

    /** Ferramenta de mentira que registra com qual mercado foi chamada. */
    private UUID marketSeenByTool;

    @BeforeEach
    void setUp() {
        marketSeenByTool = null;

        DataTool spy = new DataTool() {
            @Override
            public String name() {
                return "ferramenta_de_teste";
            }

            @Override
            public String description() {
                return "Consulta de teste.";
            }

            @Override
            public Map<String, Object> parametersSchema() {
                return DataTool.schema(Map.of(), List.of());
            }

            @Override
            public Map<String, Object> execute(UUID market, Map<String, Object> args) {
                marketSeenByTool = market;
                return Map.of("faturamento", 1234.56);
            }
        };

        when(capitalTools.tools()).thenReturn(List.of(spy));
        when(salesTools.tools()).thenReturn(List.of());
        when(opportunityTools.tools()).thenReturn(List.of());

        service = new DataChatService(orchestrator, usageRecorder, llmClient,
            capitalTools, salesTools, opportunityTools);

        when(orchestrator.resolveCredential(any())).thenReturn(Optional.of(credential()));
    }

    /**
     * O isolamento entre lojas não pode depender do modelo.
     *
     * Aqui o modelo pede a ferramenta passando um marketId de OUTRA loja nos
     * argumentos. A ferramenta tem de receber o mercado autenticado mesmo
     * assim.
     */
    @Test
    void marketIdVemDoContextoAutenticadoNaoDosArgumentosDoModelo() {
        UUID outraLoja = UUID.randomUUID();
        when(llmClient.converse(anyString(), anyString(), anyString(), anyList(),
            anyList(), anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.withToolCalls(
                List.of(new LlmClient.ToolCall("c1", "ferramenta_de_teste",
                    "{\"marketId\":\"" + outraLoja + "\"}")), 10, 5, 100))
            .thenReturn(LlmClient.LlmResponse.ok("Faturou R$ 1.234,56.", 20, 10, 100));

        service.ask(marketId, "quanto faturei?", List.of());

        assertEquals(marketId, marketSeenByTool,
            "a ferramenta precisa receber o mercado autenticado, não o do modelo");
    }

    /** Sem créditos de IA nem chave própria, o chat não tenta chamar provedor nenhum. */
    @Test
    void semCredencialNaoChamaProvedor() {
        when(orchestrator.resolveCredential(marketId)).thenReturn(Optional.empty());

        DataChatService.ChatAnswer answer = service.ask(marketId, "quanto vendi?", List.of());

        assertFalse(answer.success());
        assertTrue(answer.errorMessage().contains("créditos de IA"));
        verifyNoInteractions(llmClient);
    }

    /** Resposta direta, sem ferramenta: cumprimento não vira consulta. */
    @Test
    void respostaSemFerramentaVoltaDireto() {
        when(llmClient.converse(anyString(), anyString(), anyString(), anyList(),
            anyList(), anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.ok("Olá! Posso consultar suas vendas.",
                10, 8, 90));

        DataChatService.ChatAnswer answer = service.ask(marketId, "bom dia", List.of());

        assertTrue(answer.success());
        assertEquals("Olá! Posso consultar suas vendas.", answer.answer());
        assertTrue(answer.toolsUsed().isEmpty());
        verify(llmClient, times(1)).converse(anyString(), anyString(), anyString(),
            anyList(), anyList(), anyInt(), anyDouble());
    }

    /** As consultas usadas voltam ao usuário — é o que prova a origem do número. */
    @Test
    void relataQuaisConsultasAlimentaramAResposta() {
        when(llmClient.converse(anyString(), anyString(), anyString(), anyList(),
            anyList(), anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.withToolCalls(
                List.of(new LlmClient.ToolCall("c1", "ferramenta_de_teste", "{}")), 10, 5, 100))
            .thenReturn(LlmClient.LlmResponse.ok("Faturou R$ 1.234,56.", 20, 10, 100));

        DataChatService.ChatAnswer answer = service.ask(marketId, "quanto faturei?", List.of());

        assertTrue(answer.success());
        assertEquals(List.of("ferramenta_de_teste"), answer.toolsUsed());
    }

    /**
     * O modelo que insiste em pedir ferramentas precisa ser cortado: cada volta
     * é uma chamada paga na conta do cliente.
     */
    @Test
    void modeloQueSoPedeFerramentasEDeCortado() {
        when(llmClient.converse(anyString(), anyString(), anyString(), anyList(),
            anyList(), anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.withToolCalls(
                List.of(new LlmClient.ToolCall("c1", "ferramenta_de_teste", "{}")), 5, 5, 50));

        service.ask(marketId, "quanto faturei?", List.of());

        // 4 voltas com ferramenta + 1 final sem: o teto tem de segurar.
        verify(llmClient, times(5)).converse(anyString(), anyString(), anyString(),
            anyList(), anyList(), anyInt(), anyDouble());
    }

    /**
     * Na última volta as ferramentas são retiradas — sem isso o modelo poderia
     * pedir consulta para sempre e o usuário ficaria sem resposta.
     */
    @Test
    void ultimaVoltaNaoOfereceFerramentas() {
        when(llmClient.converse(anyString(), anyString(), anyString(), anyList(),
            anyList(), anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.withToolCalls(
                List.of(new LlmClient.ToolCall("c1", "ferramenta_de_teste", "{}")), 5, 5, 50));

        service.ask(marketId, "quanto faturei?", List.of());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<LlmClient.ToolSpec>> captor =
            ArgumentCaptor.forClass((Class<List<LlmClient.ToolSpec>>) (Class<?>) List.class);
        verify(llmClient, times(5)).converse(anyString(), anyString(), anyString(),
            anyList(), captor.capture(), anyInt(), anyDouble());

        assertTrue(captor.getAllValues().get(4).isEmpty(),
            "a última volta precisa forçar resposta em texto");
    }

    /** Falha do provedor tira a credencial da cadeia e devolve erro legível. */
    @Test
    void falhaDoProvedorEReportadaAoOrquestrador() {
        when(llmClient.converse(anyString(), anyString(), anyString(), anyList(),
            anyList(), anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.fail("HTTP 429", true, 80));

        DataChatService.ChatAnswer answer = service.ask(marketId, "quanto vendi?", List.of());

        assertFalse(answer.success());
        verify(orchestrator).reportFailure(any());
    }

    /** Ferramenta desconhecida não derruba a conversa. */
    @Test
    void ferramentaDesconhecidaNaoDerrubaAConversa() {
        when(llmClient.converse(anyString(), anyString(), anyString(), anyList(),
            anyList(), anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.withToolCalls(
                List.of(new LlmClient.ToolCall("c1", "nao_existe", "{}")), 5, 5, 50))
            .thenReturn(LlmClient.LlmResponse.ok("Não consegui essa informação.", 10, 5, 60));

        DataChatService.ChatAnswer answer = service.ask(marketId, "algo", List.of());

        assertTrue(answer.success());
    }

    @Test
    void perguntaVaziaNaoChamaProvedor() {
        DataChatService.ChatAnswer answer = service.ask(marketId, "   ", List.of());

        assertFalse(answer.success());
        verifyNoInteractions(llmClient);
    }

    // ── Jev escolhendo a consulta (Copiloto F1) ─────────────────────────────

    @Mock private com.pdv2cloud.service.ai.platform.AiGate gate;
    @Mock private com.pdv2cloud.service.ai.platform.JevClient jev;

    private DataChatService serviceWithJev(double toolConfidence, double directProbability) {
        DataTool vendas = new DataTool() {
            @Override public String name() { return "resumo_de_vendas"; }
            @Override public String description() { return "Faturamento, cupons e ticket médio."; }
            @Override public Map<String, Object> parametersSchema() { return DataTool.schema(Map.of(), List.of()); }
            @Override public Map<String, Object> execute(UUID market, Map<String, Object> args) {
                marketSeenByTool = market;
                return Map.of("periodoDias", args.getOrDefault("dias", 30), "faturamento", 1000, "cupons", 50, "ticketMedio", 20);
            }
        };
        when(salesTools.tools()).thenReturn(List.of(vendas));
        DataChatService s = new DataChatService(orchestrator, usageRecorder, llmClient, capitalTools, salesTools, opportunityTools);
        var route = new com.pdv2cloud.service.ai.platform.AiPlatformConfig.Route("JEV_FERRAMENTA", "Jev", "JEV", "JEV",
            "jev-latest", 2000, 0, 0, 0.8, 0, java.math.BigDecimal.valueOf(0.042), java.math.BigDecimal.ZERO,
            false, true, null, null, null);
        var key = new com.pdv2cloud.service.ai.platform.AiPlatformConfig.Key("JEV", "https://api.typesafe.ai", "k", "jev-latest");
        when(gate.decide(any(), eq("JEV_FERRAMENTA"))).thenReturn(new com.pdv2cloud.service.ai.platform.AiGate.Decision(
            com.pdv2cloud.service.ai.platform.AiGate.Reason.OK, route, key));
        boolean yes = directProbability >= 0.5;
        when(jev.decide(anyString(), anyString(), anyString(), any(), any())).thenReturn(
            new com.pdv2cloud.service.ai.platform.JevClient.Result(true, Map.of(
                "ferramenta", new com.pdv2cloud.service.ai.platform.JevClient.Answer("resumo_de_vendas", toolConfidence, null, Map.of()),
                "direto", new com.pdv2cloud.service.ai.platform.JevClient.Answer(yes ? "sim" : "nao",
                    Math.abs(directProbability - 0.5) * 2, directProbability, Map.of())), 300, 40, null));
        s.setJevRouting(gate, jev, new DirectAnswers());
        return s;
    }

    /** Pergunta de número direto com o Jev confiante: texto pronto, sem modelo de linguagem e sem crédito. */
    @Test
    void perguntaDiretaSaiComTextoProntoSemChamarModelo() {
        DataChatService.ChatAnswer answer = serviceWithJev(0.95, 0.98).ask(marketId, "quanto vendi na semana?", List.of());

        assertTrue(answer.success());
        assertEquals("MERCADOFLOW", answer.provider());
        assertEquals("TEMPLATE", answer.layer());
        assertEquals(0, answer.credits());
        assertTrue(answer.answer().contains("Nos últimos 7 dias"), answer.answer());
        assertEquals(marketId, marketSeenByTool);
        verifyNoInteractions(llmClient);
    }

    /** Jev inseguro: segue o caminho normal do modelo, com todas as consultas. */
    @Test
    void jevInseguroNaoRespondeSozinho() {
        when(llmClient.converse(anyString(), anyString(), anyString(), anyList(), anyList(), anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.ok("Resposta do modelo.", 10, 5, 90));

        DataChatService.ChatAnswer answer = serviceWithJev(0.4, 0.98).ask(marketId, "quanto vendi na semana?", List.of());

        assertEquals("Resposta do modelo.", answer.answer());
        verify(llmClient, times(1)).converse(anyString(), anyString(), anyString(), anyList(), anyList(), anyInt(), anyDouble());
    }

    /** Pergunta que pede análise: o modelo responde, mas só com a consulta que o Jev escolheu. */
    @Test
    @SuppressWarnings("unchecked")
    void perguntaDeAnaliseUsaSoAConsultaEscolhida() {
        when(llmClient.converse(anyString(), anyString(), anyString(), anyList(), anyList(), anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.ok("Análise.", 10, 5, 90));

        serviceWithJev(0.95, 0.1).ask(marketId, "por que minhas vendas caíram?", List.of());

        ArgumentCaptor<List<LlmClient.ToolSpec>> tools = ArgumentCaptor.forClass(List.class);
        verify(llmClient).converse(anyString(), anyString(), anyString(), anyList(), tools.capture(), anyInt(), anyDouble());
        assertEquals(List.of("resumo_de_vendas"), tools.getValue().stream().map(LlmClient.ToolSpec::name).toList());
    }

    private AiOrchestrator.ActiveCredential credential() {
        return new AiOrchestrator.ActiveCredential(
            com.pdv2cloud.service.ai.AiProvider.GROQ,
            "https://api.groq.com/openai/v1",
            "sk-teste",
            "llama-3.3-70b-versatile",
            UUID.randomUUID()
        );
    }
}
