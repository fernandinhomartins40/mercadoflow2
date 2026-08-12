package com.pdv2cloud.service.ai;

import com.pdv2cloud.model.entity.AiInterpretation;
import com.pdv2cloud.model.entity.AiProviderCredential;
import com.pdv2cloud.model.entity.AiUsageLog;
import com.pdv2cloud.repository.AiInterpretationRepository;
import com.pdv2cloud.repository.AiProviderCredentialRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

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

    /** Quanto tempo uma credencial que falhou fica fora da cadeia. */
    private static final long BREAKER_MINUTES = 10;

    private final AiProviderCredentialRepository credentialRepository;
    private final AiInterpretationRepository interpretationRepository;
    private final AiUsageRecorder usageRecorder;
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
        AiCredentialCipher cipher,
        LlmClient llmClient
    ) {
        this.credentialRepository = credentialRepository;
        this.interpretationRepository = interpretationRepository;
        this.usageRecorder = usageRecorder;
        this.cipher = cipher;
        this.llmClient = llmClient;
    }

    /**
     * O texto produzido e sua origem.
     *
     * {@code deterministic} chega até a UI: o usuário tem direito de saber se
     * está lendo a análise da IA que ele configurou ou o texto do sistema.
     */
    public record Interpretation(
        String content,
        boolean deterministic,
        String provider,
        /** Veio do cache — nenhuma chamada externa foi feita nem token gasto. */
        boolean fromCache
    ) { }

    /** O mercado tem alguma credencial habilitada? Usado para não tentar à toa. */
    public boolean isEnabledFor(UUID marketId) {
        return cipher.isConfigured() && credentialRepository.existsByMarketIdAndEnabledTrue(marketId);
    }

    /**
     * Produz (ou recupera do cache) a interpretação de um contexto.
     *
     * NÃO é {@code @Transactional} de propósito. O corpo faz uma chamada HTTP
     * de até 45 segundos por provedor, e envolvê-la numa transação prenderia
     * uma conexão do pool durante toda a espera — com uma cadeia de dois
     * provedores lentos, 90 segundos por oportunidade, vezes as dezenas que o
     * job percorre. As três operações de banco aqui (ler cache, gravar
     * interpretação, registrar uso) são independentes entre si e cada uma
     * conclui sozinha; não há estado intermediário que precise ser revertido
     * em bloco.
     *
     * @param fallbackText texto determinístico usado quando a IA não está
     *                     disponível. Nunca nulo — é a garantia de que este
     *                     método sempre devolve algo exibível.
     */
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
                hit.getContent(), Boolean.TRUE.equals(hit.getDeterministic()),
                hit.getProvider(), true);
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

            // Roteamento por tarefa (Fase 6): cada tarefa tem seu teto de
            // tokens e sua temperatura. Um parágrafo de oportunidade e um
            // resumo semanal não pedem os mesmos parâmetros.
            AiTaskProfile profile = AiTaskProfile.forTask(task);

            LlmClient.LlmResponse response = llmClient.chat(
                credential.effectiveBaseUrl(),
                apiKey,
                credential.effectiveModel(),
                systemPrompt,
                context.prompt(),
                profile.maxTokens(),
                profile.temperature()
            );

            if (response.success()) {
                usageRecorder.record(marketId, task, credential.getProvider().name(),
                    credential.effectiveModel(), promptVersion, context.hash(),
                    response.inputTokens(), response.outputTokens(),
                    (int) response.latencyMs(), AiUsageLog.Outcome.OK, null);

                usageRecorder.storeInterpretation(marketId, task, subjectType, subjectId,
                    context.hash(), response.content(), credential.getProvider().name(),
                    credential.effectiveModel(), promptVersion, false);

                return new Interpretation(
                    response.content(), false, credential.getProvider().name(), false);
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
        usageRecorder.storeInterpretation(marketId, task, subjectType, subjectId,
            context.hash(), fallbackText, null, null, promptVersion, true);

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
            AiTaskProfile.TESTE_DE_CONEXAO.maxTokens(),
            AiTaskProfile.TESTE_DE_CONEXAO.temperature()
        );
    }

    /**
     * Credencial pronta para uso, com a chave já decifrada.
     *
     * @param apiKey a chave em claro — existe apenas durante a chamada e nunca
     *               deve ser guardada, logada ou devolvida por API
     */
    public record ActiveCredential(
        AiProvider provider, String baseUrl, String apiKey, String model, UUID credentialId
    ) { }

    /**
     * Resolve a primeira credencial utilizável da cadeia do mercado.
     *
     * Existe para o chat "Pergunte aos dados", que precisa de um laço próprio
     * (o modelo responde pedindo ferramentas, não texto) e por isso não passa
     * pelo {@link #interpret}. Reaproveita a mesma cadeia de prioridade e o
     * mesmo circuit breaker — um provedor derrubado pela rodada noturna
     * continua fora aqui, e vice-versa.
     *
     * @return vazio quando não há credencial usável; o chamador decide o que
     *         dizer ao usuário
     */
    public Optional<ActiveCredential> resolveCredential(UUID marketId) {
        if (!cipher.isConfigured()) {
            return Optional.empty();
        }
        for (AiProviderCredential credential : credentialRepository.findChain(marketId)) {
            if (isOpen(credential.getId())) {
                continue;
            }
            try {
                return Optional.of(new ActiveCredential(
                    credential.getProvider(),
                    credential.effectiveBaseUrl(),
                    cipher.decrypt(credential.getEncryptedApiKey()),
                    credential.effectiveModel(),
                    credential.getId()
                ));
            } catch (Exception e) {
                // Cifrada com outra chave mestra: inútil insistir nesta rodada.
                trip(credential.getId());
            }
        }
        return Optional.empty();
    }

    /** Marca uma credencial como falha, tirando-a da cadeia por alguns minutos. */
    public void reportFailure(UUID credentialId) {
        trip(credentialId);
    }

    private Interpretation deterministic(String fallbackText) {
        return new Interpretation(fallbackText, true, null, false);
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


}
