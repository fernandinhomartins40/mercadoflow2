package com.pdv2cloud.job;

import com.pdv2cloud.service.StatePriceRetentionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Toda madrugada: preço estadual com mais de 90 dias vira resumo diário + arquivo .csv.gz. */
@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class StatePriceRetentionJob {

    private final StatePriceRetentionService retention;

    public StatePriceRetentionJob(StatePriceRetentionService retention) {
        this.retention = retention;
    }

    @Scheduled(cron = "0 20 4 * * *", zone = "America/Sao_Paulo")
    public void run() {
        try {
            retention.run();
        } catch (Exception e) {
            log.error("Retenção do preço estadual falhou; nada foi apagado", e);
        }
    }
}
