package com.pdv2cloud.service.ai;

import com.pdv2cloud.model.entity.AiUsageLog;
import com.pdv2cloud.repository.AiUsageLogRepository;
import com.pdv2cloud.repository.MarketRepository;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Grava o log de uso de IA em transação própria.
 *
 * Componente separado por necessidade técnica, não por gosto: {@code @Transactional}
 * só vale quando a chamada atravessa o proxy do Spring. Se este método vivesse
 * dentro do {@link AiOrchestrator} e fosse chamado de lá mesmo, o
 * {@code REQUIRES_NEW} seria silenciosamente ignorado e o log desapareceria
 * junto com a transação que falhou — exatamente no caso em que ele mais importa.
 */
@Component
@Slf4j
public class AiUsageRecorder {

    private final AiUsageLogRepository usageLogRepository;
    private final MarketRepository marketRepository;

    public AiUsageRecorder(
        AiUsageLogRepository usageLogRepository,
        MarketRepository marketRepository
    ) {
        this.usageLogRepository = usageLogRepository;
        this.marketRepository = marketRepository;
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
