package com.pdv2cloud.service.ai;

import com.pdv2cloud.model.entity.AiInterpretation;
import com.pdv2cloud.model.entity.AiUsageLog;
import com.pdv2cloud.repository.AiInterpretationRepository;
import com.pdv2cloud.repository.AiUsageLogRepository;
import com.pdv2cloud.repository.MarketRepository;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Escritas curtas do caminho de IA, cada uma em transação própria.
 *
 * Componente separado por necessidade técnica, não por gosto: {@code @Transactional}
 * só vale quando a chamada atravessa o proxy do Spring. Se estes métodos
 * vivessem dentro do {@link AiOrchestrator} e fossem chamados de lá mesmo, a
 * anotação seria silenciosamente ignorada — e como o orquestrador roda FORA de
 * transação (para não prender conexão do pool durante uma chamada HTTP de 45s),
 * não haveria sessão para resolver o proxy do mercado nem para gravar.
 */
@Component
@Slf4j
public class AiUsageRecorder {

    private final AiUsageLogRepository usageLogRepository;
    private final AiInterpretationRepository interpretationRepository;
    private final MarketRepository marketRepository;

    public AiUsageRecorder(
        AiUsageLogRepository usageLogRepository,
        AiInterpretationRepository interpretationRepository,
        MarketRepository marketRepository
    ) {
        this.usageLogRepository = usageLogRepository;
        this.interpretationRepository = interpretationRepository;
        this.marketRepository = marketRepository;
    }

    /**
     * Guarda o texto produzido (pela IA ou pelo fallback) para reuso.
     *
     * Falha aqui não pode derrubar a interpretação que já foi obtida: o pior
     * caso é regerar o texto na próxima rodada, não perder a resposta atual.
     * A causa mais comum é corrida entre duas rodadas para o mesmo hash, que
     * viola a unique — e nesse caso a outra já gravou o mesmo conteúdo.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void storeInterpretation(
        UUID marketId, String task, String subjectType, UUID subjectId, String contextHash,
        String content, String provider, String model, String promptVersion, boolean deterministic
    ) {
        try {
            AiInterpretation entity = new AiInterpretation();
            entity.setMarket(marketRepository.getReferenceById(marketId));
            entity.setTask(task);
            entity.setContextHash(contextHash);
            entity.setSubjectType(subjectType);
            entity.setSubjectId(subjectId);
            entity.setContent(content);
            entity.setProvider(provider);
            entity.setModel(model);
            entity.setPromptVersion(promptVersion);
            entity.setDeterministic(deterministic);
            interpretationRepository.save(entity);
        } catch (Exception e) {
            log.debug("Interpretação não gravada (provável duplicata): {}", e.getMessage());
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(
        UUID marketId, String task, String provider, String model, String promptVersion,
        String contextHash, Integer inputTokens, Integer outputTokens, Integer latencyMs,
        AiUsageLog.Outcome outcome, String error
    ) {
        try {
            AiUsageLog entry = new AiUsageLog();
            entry.setMarket(marketRepository.getReferenceById(marketId));
            entry.setTask(task);
            entry.setProvider(provider);
            entry.setModel(model);
            entry.setPromptVersion(promptVersion);
            entry.setContextHash(contextHash);
            entry.setInputTokens(inputTokens);
            entry.setOutputTokens(outputTokens);
            entry.setLatencyMs(latencyMs);
            entry.setOutcome(outcome);
            entry.setErrorMessage(truncate(error));
            usageLogRepository.save(entry);
        } catch (Exception e) {
            // Log de observabilidade não pode derrubar a operação que observa.
            log.warn("Falha ao registrar uso de IA: {}", e.getMessage());
        }
    }

    private String truncate(String value) {
        if (value == null) {
            return null;
        }
        return value.length() <= 500 ? value : value.substring(0, 497) + "...";
    }
}
