package com.pdv2cloud.service.ai;

import com.pdv2cloud.model.entity.AiInterpretation;
import com.pdv2cloud.model.entity.AiProviderCredential;
import com.pdv2cloud.model.entity.AiUsageLog;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.AiInterpretationRepository;
import com.pdv2cloud.repository.AiProviderCredentialRepository;
import com.pdv2cloud.repository.MarketRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ponto único de chamada de IA no sistema.
 *
 * Ordem do que ele faz, e por quê:
 *
 * <ol>
 *   <li><b>Cache primeiro.</b> No modelo BYOK quem paga o token é o cliente, e
 *       regerar um texto para números que não mudaram é gastar o dinheiro dele
 *       à toa.</li>
 *   <li><b>Cadeia de credenciais do mercado.</b> O cliente pode cadastrar mais
 *       de um provedor; tenta-se na ordem de prioridade dele.</li>
 *   <li><b>Circuit breaker por credencial.</b> Um provedor que acabou de
 *       recusar a chave não é tentado de novo por alguns minutos — numa rodada
 *       de 80 oportunidades, insistir seriam 80 chamadas inúteis e 80 esperas
 *       de timeout.</li>
 *   <li><b>Fallback determinístico.</b> Se nada funcionar, devolve o texto que
 *       as Fases 3 e 4 já produzem. Este é o ponto mais importante da classe:
 *       <b>a IA nunca é caminho crítico</b>. Sem chave, com chave inválida, com
 *       o provedor fora do ar — o produto continua entregando o mesmo que
 *       entregava antes da Fase 5.</li>
 * </ol>
 */
@Service
@Slf4j
public class AiOrchestrator {

    /** Teto de saída. A interpretação é um parágrafo; mais que isso é ruído. */
    private static final int MAX_OUTPUT_TOKENS = 400;

    /**
     * Baixa de propósito: o modelo deve interpretar números, não criar
     * variação estilística. Temperatura alta aqui produziria textos diferentes
     * para a mesma situação, o que corroeria a confiança do usuário.
     */
    private static final double TEMPERATURE = 0.3;

    /** Quanto tempo uma credencial que falhou fica fora da cadeia. */
    private static final long BREAKER_MINUTES = 10;

    private final AiProviderCredentialRepository credentialRepository;
    private final AiInterpretationRepository interpretationRepository;
    private final AiUsageRecorder usageRecorder;
    private final MarketRepository marketRepository;
    private final AiCredentialCipher cipher;
    private final LlmClient llmClient;

    /**
     * Credenciais em quarentena: id → instante em que volta a ser tentada.
     *
     * Em memória e por instância, como os demais caches do projeto. É aceitável
     * porque o efeito de perder o estado numa troca de réplica é apenas tentar
     * um provedor quebrado uma vez a mais.
     */
    private final Map<UUID, LocalDateTime> breaker = new ConcurrentHashMap<>();

    public AiOrchestrator(
        AiProviderCredentialRepository credentialRepository,
        AiInterpretationRepository interpretationRepository,
        AiUsageRecorder usageRecorder,
        MarketRepository marketRepository,
        AiCredentialCipher cipher,
        LlmClient llmClient
    ) {
        this.credentialRepository = credentialRepository;
        this.interpretationRepository = interpretationRepository;
        this.usageRecorder = usageRecorder;
        this.marketRepository = marketRepository;
        this.cipher = cipher;
        this.llmClient = llmClient;
    }

    /**
     * O texto produzido e sua origem.
     *
     * {@code deterministic} chega até a UI: o usuário tem direito de saber se
     * está lendo a análise da IA que ele configurou ou o texto do sistema.
     */
    public record Interpretation(String content, boolean deterministic, String provider) { }

    /** O mercado tem alguma credencial habilitada? Usado para não tentar à toa. */
    public boolean isEnabledFor(UUID marketId) {
        return cipher.isConfigured() && credentialRepository.existsByMarketIdAndEnabledTrue(marketId);
    }

    /**
     * Produz (ou recupera do cache) a interpretação de um contexto.
     *
     * @param fallbackText texto determinístico usado quando a IA não está
     *                     disponível. Nunca nulo — é a garantia de que este
     *                     método sempre devolve algo exibível.
     */
    @Transactional
    public Interpretation interpret(
        UUID marketId,
        String task,
        String subjectType,
        UUID subjectId,
        AiContextBuilder.AiContext context,
        String systemPrompt,
        String promptVersion,
        String fallbackText
    ) {
        // 1. Cache — inclusive quando o que foi guardado é o próprio fallback:
        // se a IA falhou para estes números, tentar de novo a cada request
        // repetiria a espera sem mudar o resultado.
        Optional<AiInterpretation> cached = interpretationRepository
            .findByMarketIdAndTaskAndContextHash(marketId, task, context.hash());
        if (cached.isPresent()) {
            AiInterpretation hit = cached.get();
            return new Interpretation(
                hit.getContent(), Boolean.TRUE.equals(hit.getDeterministic()), hit.getProvider());
        }

        if (!cipher.isConfigured()) {
            usageRecorder.record(marketId, task, null, null, promptVersion, context.hash(),
                null, null, null, AiUsageLog.Outcome.SEM_CREDENCIAL,
                "Chave mestra de criptografia não configurada no servidor");
            return deterministic(fallbackText);
        }

        List<AiProviderCredential> chain = credentialRepository.findChain(marketId);
        if (chain.isEmpty()) {
            usageRecorder.record(marketId, task, null, null, promptVersion, context.hash(),
                null, null, null, AiUsageLog.Outcome.SEM_CREDENCIAL, null);
            return deterministic(fallbackText);
        }

        // 2. Cadeia do cliente, na ordem de prioridade dele.
        String lastError = null;
        for (AiProviderCredential credential : chain) {
            if (isOpen(credential.getId())) {
                continue;
            }

            String apiKey;
            try {
                apiKey = cipher.decrypt(credential.getEncryptedApiKey());
            } catch (Exception e) {
                // Credencial cifrada com outra chave mestra (rotação sem
                // migração, restore de backup antigo). Não é recuperável aqui.
                lastError = "Credencial ilegível — recadastre a chave";
                trip(credential.getId());
                continue;
            }

            LlmClient.LlmResponse response = llmClient.chat(
                credential.effectiveBaseUrl(),
                apiKey,
                credential.effectiveModel(),
                systemPrompt,
                context.prompt(),
                MAX_OUTPUT_TOKENS,
                TEMPERATURE
            );

            if (response.success()) {
                usageRecorder.record(marketId, task, credential.getProvider().name(),
                    credential.effectiveModel(), promptVersion, context.hash(),
                    response.inputTokens(), response.outputTokens(),
                    (int) response.latencyMs(), AiUsageLog.Outcome.OK, null);

                store(marketId, task, subjectType, subjectId, context.hash(),
                    response.content(), credential.getProvider().name(),
                    credential.effectiveModel(), promptVersion, false);

                return new Interpretation(
                    response.content(), false, credential.getProvider().name());
            }

            lastError = response.errorMessage();
            trip(credential.getId());
            usageRecorder.record(marketId, task, credential.getProvider().name(),
                credential.effectiveModel(), promptVersion, context.hash(),
                null, null, (int) response.latencyMs(),
                AiUsageLog.Outcome.ERRO, response.errorMessage());
        }

        // 3. Nada funcionou: o texto do sistema. Guardado no cache para que a
        // rodada seguinte não repita a cadeia inteira pelos mesmos números.
        usageRecorder.record(marketId, task, null, null, promptVersion, context.hash(),
            null, null, null, AiUsageLog.Outcome.FALLBACK, lastError);
        store(marketId, task, subjectType, subjectId, context.hash(),
            fallbackText, null, null, promptVersion, true);

        return deterministic(fallbackText);
    }

    /**
     * Testa uma credencial com uma chamada mínima.
     *
     * Existe porque o cliente precisa saber que colou a chave certa no momento
     * em que a cola — descobrir isso só na madrugada seguinte, por ausência de
     * texto, seria uma experiência ruim.
     */
    public LlmClient.LlmResponse testCredential(AiProviderCredential credential) {
        String apiKey = cipher.decrypt(credential.getEncryptedApiKey());
        return llmClient.chat(
            credential.effectiveBaseUrl(),
            apiKey,
            credential.effectiveModel(),
            "Responda apenas com a palavra OK.",
            "Teste de conexão.",
            16,
            0.0
        );
    }

    private Interpretation deterministic(String fallbackText) {
        return new Interpretation(fallbackText, true, null);
    }

    private boolean isOpen(UUID credentialId) {
        LocalDateTime until = breaker.get(credentialId);
        if (until == null) {
            return false;
        }
        if (until.isBefore(LocalDateTime.now())) {
            breaker.remove(credentialId);
            return false;
        }
        return true;
    }

    private void trip(UUID credentialId) {
        breaker.put(credentialId, LocalDateTime.now().plusMinutes(BREAKER_MINUTES));
    }

    private void store(
        UUID marketId, String task, String subjectType, UUID subjectId, String hash,
        String content, String provider, String model, String promptVersion, boolean det
    ) {
        try {
            Market market = marketRepository.getReferenceById(marketId);
            AiInterpretation entity = new AiInterpretation();
            entity.setMarket(market);
            entity.setTask(task);
            entity.setContextHash(hash);
            entity.setSubjectType(subjectType);
            entity.setSubjectId(subjectId);
            entity.setContent(content);
            entity.setProvider(provider);
            entity.setModel(model);
            entity.setPromptVersion(promptVersion);
            entity.setDeterministic(det);
            interpretationRepository.save(entity);
        } catch (Exception e) {
            // Corrida entre duas rodadas para o mesmo hash viola a unique. Não
            // é erro: a outra já gravou o mesmo conteúdo.
            log.debug("Interpretação não gravada (provável duplicata): {}", e.getMessage());
        }
    }

}
