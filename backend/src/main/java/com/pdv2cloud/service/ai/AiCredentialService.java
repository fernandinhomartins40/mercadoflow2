package com.pdv2cloud.service.ai;

import com.pdv2cloud.model.entity.AiProviderCredential;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.AiProviderCredentialRepository;
import com.pdv2cloud.repository.AiUsageLogRepository;
import com.pdv2cloud.repository.MarketRepository;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cadastro das chaves de IA do cliente (BYOK).
 *
 * A decisão de produto por trás desta classe (dono, 11/08/2026): a plataforma
 * não fornece chave. Cada mercado usa a própria conta no provedor — e como
 * quase todos os provedores do catálogo têm free tier generoso, o cliente
 * consegue operar sem pagar nada.
 *
 * O que isso resolve, além de custo: a cota de um cliente nunca é consumida por
 * outro, e o limite de gasto é o da conta dele, não um teto artificial nosso.
 *
 * REGRA QUE NÃO PODE SER QUEBRADA: a chave em claro nunca sai deste serviço.
 * Ela entra por {@link #save}, é cifrada, e a partir daí só o
 * {@link AiOrchestrator} a decifra no instante da chamada. Nenhum método aqui
 * devolve a chave — nem para o dono do mercado, nem para o admin.
 */
@Service
@Slf4j
public class AiCredentialService {

    private final AiProviderCredentialRepository credentialRepository;
    private final AiUsageLogRepository usageLogRepository;
    private final MarketRepository marketRepository;
    private final AiCredentialCipher cipher;
    private final AiOrchestrator orchestrator;

    public AiCredentialService(
        AiProviderCredentialRepository credentialRepository,
        AiUsageLogRepository usageLogRepository,
        MarketRepository marketRepository,
        AiCredentialCipher cipher,
        AiOrchestrator orchestrator
    ) {
        this.credentialRepository = credentialRepository;
        this.usageLogRepository = usageLogRepository;
        this.marketRepository = marketRepository;
        this.cipher = cipher;
        this.orchestrator = orchestrator;
    }

    /** Visão segura de uma credencial: tudo menos a chave. */
    public record CredentialView(
        UUID id,
        String provider,
        String providerLabel,
        boolean hasFreeTier,
        String baseUrl,
        String model,
        String keyHint,
        boolean enabled,
        int priority,
        LocalDateTime lastCheckAt,
        Boolean lastCheckOk,
        String lastCheckError
    ) {
        static CredentialView from(AiProviderCredential c) {
            return new CredentialView(
                c.getId(),
                c.getProvider().name(),
                c.getProvider().label(),
                c.getProvider().hasFreeTier(),
                c.effectiveBaseUrl(),
                c.effectiveModel(),
                c.getKeyHint(),
                Boolean.TRUE.equals(c.getEnabled()),
                c.getPriority() == null ? 100 : c.getPriority(),
                c.getLastCheckAt(),
                c.getLastCheckOk(),
                c.getLastCheckError()
            );
        }
    }

    public List<CredentialView> list(UUID marketId) {
        return credentialRepository.findAllByMarket(marketId).stream()
            .map(CredentialView::from).toList();
    }

    /**
     * Cadastra ou atualiza a credencial de um provedor.
     *
     * Quando {@code apiKey} vem vazio numa credencial que já existe, a chave
     * atual é preservada — permite ao usuário mudar o modelo ou a prioridade
     * sem precisar colar a chave de novo (que ele provavelmente já não tem em
     * mãos, porque os provedores só a exibem uma vez).
     */
    @Transactional
    public CredentialView save(
        UUID marketId,
        AiProvider provider,
        String apiKey,
        String baseUrl,
        String model,
        Integer priority,
        String actor
    ) {
        if (!cipher.isConfigured()) {
            throw new IllegalStateException(
                "O servidor não tem chave de criptografia configurada "
                    + "(app.ai.encryption-key). Sem ela, guardar a sua chave de API "
                    + "em segurança é impossível.");
        }
        if (provider.requiresBaseUrl() && (baseUrl == null || baseUrl.isBlank())) {
            throw new IllegalArgumentException(
                "Para endpoint próprio é obrigatório informar a URL do serviço.");
        }

        Optional<AiProviderCredential> existing =
            credentialRepository.findByMarketIdAndProvider(marketId, provider);

        if (existing.isEmpty() && (apiKey == null || apiKey.isBlank())) {
            throw new IllegalArgumentException("Informe a chave de API do provedor.");
        }

        AiProviderCredential credential = existing.orElseGet(() -> {
            AiProviderCredential fresh = new AiProviderCredential();
            Market market = marketRepository.findById(marketId)
                .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
            fresh.setMarket(market);
            fresh.setProvider(provider);
            fresh.setCreatedBy(actor);
            return fresh;
        });

        if (apiKey != null && !apiKey.isBlank()) {
            String trimmed = apiKey.trim();
            credential.setEncryptedApiKey(cipher.encrypt(trimmed));
            credential.setKeyHint(cipher.hint(trimmed));
            // Chave nova invalida o resultado do teste anterior: ele se referia
            // a outra credencial.
            credential.setLastCheckAt(null);
            credential.setLastCheckOk(null);
            credential.setLastCheckError(null);
        }

        credential.setBaseUrl(blankToNull(baseUrl));
        credential.setModel(blankToNull(model));
        credential.setPriority(priority == null ? 100 : priority);
        credential.setEnabled(true);
        credential.setUpdatedAt(LocalDateTime.now());

        return CredentialView.from(credentialRepository.save(credential));
    }

    /**
     * Faz uma chamada real e mínima ao provedor.
     *
     * O resultado fica gravado na credencial porque uma chave que expirou
     * precisa aparecer como problema na tela — e não falhar em silêncio toda
     * madrugada, deixando o usuário achar que a IA "simplesmente não escreve
     * mais".
     */
    @Transactional
    public CredentialView test(UUID marketId, UUID credentialId) {
        AiProviderCredential credential = credentialRepository
            .findByIdAndMarketId(credentialId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Credencial não encontrada"));

        LlmClient.LlmResponse response;
        try {
            response = orchestrator.testCredential(credential);
        } catch (Exception e) {
            response = LlmClient.LlmResponse.fail(
                "Não foi possível usar esta credencial: " + e.getMessage(), false, 0);
        }

        credential.setLastCheckAt(LocalDateTime.now());
        credential.setLastCheckOk(response.success());
        credential.setLastCheckError(response.success() ? null : response.errorMessage());
        credential.setUpdatedAt(LocalDateTime.now());

        return CredentialView.from(credentialRepository.save(credential));
    }

    @Transactional
    public void setEnabled(UUID marketId, UUID credentialId, boolean enabled) {
        AiProviderCredential credential = credentialRepository
            .findByIdAndMarketId(credentialId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Credencial não encontrada"));
        credential.setEnabled(enabled);
        credential.setUpdatedAt(LocalDateTime.now());
        credentialRepository.save(credential);
    }

    /**
     * Remove a credencial de vez.
     *
     * Delete e não soft-delete: o cliente que pede para apagar a chave dele
     * espera que ela suma do nosso banco, não que fique marcada como inativa.
     */
    @Transactional
    public void delete(UUID marketId, UUID credentialId) {
        credentialRepository.findByIdAndMarketId(credentialId, marketId)
            .ifPresent(credentialRepository::delete);
    }

    /**
     * Consumo dos últimos 30 dias, para o cliente ver o que a chave dele está
     * gastando.
     */
    public Map<String, Object> usageSummary(UUID marketId) {
        LocalDateTime since = LocalDateTime.now().minusDays(30);
        Map<String, Object> byOutcome = new LinkedHashMap<>();
        long totalIn = 0;
        long totalOut = 0;
        long calls = 0;

        for (Object[] row : usageLogRepository.summarizeSince(marketId, since)) {
            String outcome = String.valueOf(row[0]);
            long count = ((Number) row[1]).longValue();
            long in = ((Number) row[2]).longValue();
            long out = ((Number) row[3]).longValue();
            byOutcome.put(outcome, Map.of("chamadas", count, "tokensEntrada", in,
                "tokensSaida", out));
            calls += count;
            totalIn += in;
            totalOut += out;
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("periodoDias", 30);
        summary.put("chamadas", calls);
        summary.put("tokensEntrada", totalIn);
        summary.put("tokensSaida", totalOut);
        summary.put("porResultado", byOutcome);
        summary.put("configurado", cipher.isConfigured()
            && credentialRepository.existsByMarketIdAndEnabledTrue(marketId));
        summary.put("criptografiaDisponivel", cipher.isConfigured());
        return summary;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
