package com.pdv2cloud.service.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.entity.AiProviderCredential;
import com.pdv2cloud.repository.AiInterpretationRepository;
import com.pdv2cloud.repository.AiProviderCredentialRepository;
import com.pdv2cloud.repository.AiUsageLogRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.ai.platform.AiGate;
import com.pdv2cloud.service.ai.platform.AiPlatformConfig;
import com.pdv2cloud.service.ai.platform.JevClient;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/**
 * LGPD-07: só camada paga. Modelo gratuito nunca é escolhido, nem como chave
 * própria nem como reserva; sem nenhum provedor pago, o lojista recebe o texto
 * determinístico do sistema.
 */
class PaidModelsOnlyTest {

    private static final String FALLBACK = "Texto do sistema.";

    private final AiProviderCredentialRepository credentials = mock(AiProviderCredentialRepository.class);
    private final AiInterpretationRepository interpretations = mock(AiInterpretationRepository.class);
    private final AiUsageRecorder usage = mock(AiUsageRecorder.class);
    private final LlmClient llm = mock(LlmClient.class);
    private final AiCredentialCipher cipher = new AiCredentialCipher("segredo-de-teste-com-tamanho-razoavel");
    private final UUID market = UUID.randomUUID();
    private final AiContextBuilder.AiContext context = new AiContextBuilder.AiContext("contexto", "hash-1");
    private AiOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        orchestrator = new AiOrchestrator(credentials, interpretations, usage, cipher, llm);
        when(interpretations.findByMarketIdAndTaskAndContextHash(any(), any(), any())).thenReturn(Optional.empty());
    }

    @Test
    void reconheceModeloGratuito() {
        assertTrue(AiProvider.isFreeModel("meta-llama/llama-3.3-70b-instruct:free"));
        assertTrue(AiProvider.isFreeModel(" Qwen/Qwen3-8B:FREE "));
        assertTrue(AiProvider.isFreeModel("openrouter/free"));
        assertFalse(AiProvider.isFreeModel("qwen/qwen3.7-flash"));
        assertFalse(AiProvider.isFreeModel("deepseek-flash"));
        assertFalse(AiProvider.isFreeModel(null));
    }

    @Test
    void nenhumPadraoDoCatalogoEGratuito() {
        for (AiProvider p : AiProvider.values()) {
            assertFalse(AiProvider.isFreeModel(p.defaultModel()), p.name());
        }
    }

    @Test
    void chaveSoComModeloGratuitoCaiNoTextoDoSistema() {
        when(credentials.findChain(market))
            .thenReturn(List.of(credential(AiProvider.OPENROUTER, "meta-llama/llama-3.3-70b-instruct:free")));

        AiOrchestrator.Interpretation r = interpret();

        assertTrue(r.deterministic());
        assertEquals(FALLBACK, r.content());
        verifyNoInteractions(llm);
        assertTrue(orchestrator.resolveCredential(market).isEmpty(), "o chat também não usa modelo gratuito");
    }

    @Test
    void modeloGratuitoEPuladoEOPagoAtende() {
        AiProviderCredential paid = credential(AiProvider.DEEPSEEK, null);
        when(credentials.findChain(market)).thenReturn(List.of(credential(AiProvider.OPENROUTER, "x/y:free"), paid));
        when(llm.chat(anyString(), anyString(), anyString(), anyString(), anyString(), anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.ok("Texto da IA.", 10, 5, 100));

        AiOrchestrator.Interpretation r = interpret();

        assertFalse(r.deterministic());
        assertEquals("DEEPSEEK", r.provider());
        verify(llm, never()).chat(anyString(), anyString(), eq("x/y:free"), anyString(), anyString(), anyInt(), anyDouble());
        assertEquals(paid.getId(), orchestrator.resolveCredential(market).orElseThrow().credentialId());
    }

    @Test
    void plataformaComModeloGratuitoESemChavePropriaDaTextoDoSistema() {
        AiGate gate = mock(AiGate.class);
        orchestrator.setGate(gate);
        when(gate.decide(market, "TAREFA"))
            .thenReturn(new AiGate.Decision(AiGate.Reason.FREE_MODEL, route("x/y:free"), null));
        when(credentials.findChain(market)).thenReturn(List.of());

        AiOrchestrator.Interpretation r = interpret();

        assertTrue(r.deterministic());
        assertEquals(FALLBACK, r.content());
        verifyNoInteractions(llm);
    }

    @Test
    void cadastroRecusaModeloGratuito() {
        AiCredentialService service = new AiCredentialService(credentials, mock(AiUsageLogRepository.class),
            mock(MarketRepository.class), cipher, orchestrator);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> service.save(
            market, AiProvider.OPENROUTER, "sk-or-chave", null, "meta-llama/llama-3.3-70b-instruct:free", 10, "dono"));
        assertEquals(AiProvider.FREE_MODEL_REFUSED, e.getMessage());

        AiPlatformConfig platform = new AiPlatformConfig(mock(NamedParameterJdbcTemplate.class), cipher, llm,
            mock(JevClient.class));
        assertThrows(IllegalArgumentException.class,
            () -> platform.saveProvider("OPENROUTER", "", null, "qwen/qwen3-8b:free", null, null, "admin"));
    }

    @Test
    void openRouterPedeProvedorQueNaoGuardaDados() throws Exception {
        JsonNode body = new ObjectMapper().readTree(new LlmClient().providerOptions(
            "https://openrouter.ai/api/v1", "{\"model\":\"qwen/qwen3.7-flash\"}"));
        assertEquals("deny", body.path("provider").path("data_collection").asText());
    }

    private AiOrchestrator.Interpretation interpret() {
        return orchestrator.interpret(market, "TAREFA", "OPPORTUNITY", UUID.randomUUID(), context, "sistema", "v1",
            FALLBACK);
    }

    private AiPlatformConfig.Route route(String model) {
        return new AiPlatformConfig.Route("TAREFA", "Tarefa", "FLASH", "OPENROUTER", model, 2000, 400, 0.3, 0.8, 1,
            BigDecimal.ONE, BigDecimal.ONE, false, true, null, null, null);
    }

    private AiProviderCredential credential(AiProvider provider, String model) {
        AiProviderCredential c = new AiProviderCredential();
        c.setId(UUID.randomUUID());
        c.setProvider(provider);
        c.setModel(model);
        c.setPriority(10);
        c.setEnabled(true);
        c.setEncryptedApiKey(cipher.encrypt("sk-chave-de-teste"));
        return c;
    }
}
