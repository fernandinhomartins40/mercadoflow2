package com.pdv2cloud.service.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.AiInterpretation;
import com.pdv2cloud.model.entity.AiProviderCredential;
import com.pdv2cloud.model.entity.AiUsageLog;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.AiInterpretationRepository;
import com.pdv2cloud.repository.AiProviderCredentialRepository;
import com.pdv2cloud.repository.MarketRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * O contrato central da Fase 5: <b>a IA nunca é caminho crítico</b>.
 *
 * Sem chave, com chave inválida, com o provedor fora do ar — o usuário continua
 * recebendo o texto determinístico que as Fases 3 e 4 produzem. Se algum destes
 * testes quebrar, o produto passou a depender de um serviço externo para
 * funcionar, e uma queda do Groq viraria uma tela vazia para o lojista.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiOrchestratorTest {

    private static final String FALLBACK = "Texto do sistema, sempre disponível.";
    private static final String MASTER = "segredo-de-teste-com-tamanho-razoavel";

    @Mock private AiProviderCredentialRepository credentialRepository;
    @Mock private AiInterpretationRepository interpretationRepository;
    @Mock private AiUsageRecorder usageRecorder;
    @Mock private MarketRepository marketRepository;
    @Mock private LlmClient llmClient;

    private AiCredentialCipher cipher;
    private AiOrchestrator orchestrator;
    private final UUID marketId = UUID.randomUUID();
    private final AiContextBuilder.AiContext context =
        new AiContextBuilder.AiContext("contexto de teste", "hash-abc");

    @BeforeEach
    void setUp() {
        cipher = new AiCredentialCipher(MASTER);
        orchestrator = new AiOrchestrator(credentialRepository, interpretationRepository,
            usageRecorder, marketRepository, cipher, llmClient);

        when(interpretationRepository.findByMarketIdAndTaskAndContextHash(any(), any(), any()))
            .thenReturn(Optional.empty());
        when(marketRepository.getReferenceById(any())).thenReturn(new Market());
    }

    @Test
    void semCredencialDevolveFallbackENaoChamaProvedor() {
        when(credentialRepository.findChain(marketId)).thenReturn(List.of());

        AiOrchestrator.Interpretation result = interpret();

        assertEquals(FALLBACK, result.content());
        assertTrue(result.deterministic());
        verifyNoInteractions(llmClient);
        verify(usageRecorder).record(eq(marketId), anyString(), any(), any(), anyString(),
            anyString(), any(), any(), any(), eq(AiUsageLog.Outcome.SEM_CREDENCIAL), any());
    }

    /**
     * Sem chave mestra, nem se tenta ler as credenciais: elas seriam
     * indecifráveis de qualquer forma.
     */
    @Test
    void semChaveMestraDevolveFallback() {
        AiOrchestrator semCripto = new AiOrchestrator(credentialRepository,
            interpretationRepository, usageRecorder, marketRepository,
            new AiCredentialCipher(""), llmClient);

        AiOrchestrator.Interpretation result = semCripto.interpret(marketId, "TAREFA",
            "OPPORTUNITY", UUID.randomUUID(), context, "sistema", "v1", FALLBACK);

        assertEquals(FALLBACK, result.content());
        assertTrue(result.deterministic());
        verifyNoInteractions(llmClient);
    }

    @Test
    void provedorRespondendoDevolveOTextoDaIa() {
        when(credentialRepository.findChain(marketId))
            .thenReturn(List.of(credential(AiProvider.GROQ, 10)));
        when(llmClient.chat(anyString(), anyString(), anyString(), anyString(), anyString(),
            anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.ok("Análise escrita pelo modelo.", 100, 40, 800));

        AiOrchestrator.Interpretation result = interpret();

        assertEquals("Análise escrita pelo modelo.", result.content());
        assertFalse(result.deterministic());
        assertEquals("GROQ", result.provider());
    }

    /** O cliente pode cadastrar vários provedores; o segundo cobre o primeiro. */
    @Test
    void primeiroProvedorFalhandoCaiParaOSegundo() {
        when(credentialRepository.findChain(marketId)).thenReturn(List.of(
            credential(AiProvider.CEREBRAS, 10),
            credential(AiProvider.GROQ, 20)
        ));
        when(llmClient.chat(eq(AiProvider.CEREBRAS.defaultBaseUrl()), anyString(), anyString(),
            anyString(), anyString(), anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.fail("HTTP 429", true, 100));
        when(llmClient.chat(eq(AiProvider.GROQ.defaultBaseUrl()), anyString(), anyString(),
            anyString(), anyString(), anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.ok("Escrito pelo segundo.", 50, 20, 300));

        AiOrchestrator.Interpretation result = interpret();

        assertEquals("Escrito pelo segundo.", result.content());
        assertEquals("GROQ", result.provider());
    }

    /** Toda a cadeia falhando ainda entrega algo ao usuário. */
    @Test
    void cadeiaInteiraFalhandoDevolveFallback() {
        when(credentialRepository.findChain(marketId)).thenReturn(List.of(
            credential(AiProvider.CEREBRAS, 10),
            credential(AiProvider.GROQ, 20)
        ));
        when(llmClient.chat(anyString(), anyString(), anyString(), anyString(), anyString(),
            anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.fail("provedor fora do ar", true, 100));

        AiOrchestrator.Interpretation result = interpret();

        assertEquals(FALLBACK, result.content());
        assertTrue(result.deterministic());
        verify(usageRecorder).record(eq(marketId), anyString(), any(), any(), anyString(),
            anyString(), any(), any(), any(), eq(AiUsageLog.Outcome.FALLBACK), any());
    }

    /**
     * Cache: se os números não mudaram, nenhum token do cliente é gasto de
     * novo.
     */
    @Test
    void cacheEvitaChamadaAoProvedor() {
        AiInterpretation cached = new AiInterpretation();
        cached.setContent("Texto já gerado antes.");
        cached.setDeterministic(false);
        cached.setProvider("GROQ");
        when(interpretationRepository.findByMarketIdAndTaskAndContextHash(
            marketId, "TAREFA", "hash-abc")).thenReturn(Optional.of(cached));

        AiOrchestrator.Interpretation result = interpret();

        assertEquals("Texto já gerado antes.", result.content());
        assertFalse(result.deterministic());
        verifyNoInteractions(llmClient);
    }

    /**
     * Circuit breaker: um provedor que acabou de recusar a chave não é tentado
     * de novo em seguida. Numa rodada de 80 oportunidades, insistir seriam 80
     * chamadas inúteis e 80 esperas de timeout.
     */
    @Test
    void provedorQueFalhouNaoEDeTentadoNaChamadaSeguinte() {
        AiProviderCredential groq = credential(AiProvider.GROQ, 10);
        when(credentialRepository.findChain(marketId)).thenReturn(List.of(groq));
        when(llmClient.chat(anyString(), anyString(), anyString(), anyString(), anyString(),
            anyInt(), anyDouble()))
            .thenReturn(LlmClient.LlmResponse.fail("HTTP 401", false, 50));

        interpret();
        interpret();

        verify(llmClient, times(1)).chat(anyString(), anyString(), anyString(),
            anyString(), anyString(), anyInt(), anyDouble());
    }

    /** Credencial desabilitada não entra na cadeia (findChain já filtra). */
    @Test
    void isEnabledForRespeitaCredencialHabilitada() {
        when(credentialRepository.existsByMarketIdAndEnabledTrue(marketId)).thenReturn(false);
        assertFalse(orchestrator.isEnabledFor(marketId));

        when(credentialRepository.existsByMarketIdAndEnabledTrue(marketId)).thenReturn(true);
        assertTrue(orchestrator.isEnabledFor(marketId));
    }

    private AiOrchestrator.Interpretation interpret() {
        return orchestrator.interpret(marketId, "TAREFA", "OPPORTUNITY",
            UUID.randomUUID(), context, "sistema", "v1", FALLBACK);
    }

    private AiProviderCredential credential(AiProvider provider, int priority) {
        AiProviderCredential c = new AiProviderCredential();
        c.setId(UUID.randomUUID());
        c.setProvider(provider);
        c.setPriority(priority);
        c.setEnabled(true);
        c.setEncryptedApiKey(cipher.encrypt("sk-chave-de-teste"));
        return c;
    }
}
