package com.pdv2cloud.job;

import com.pdv2cloud.service.partner.PartnerWebhookService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Entrega os avisos aos ERPs parceiros (pedido enviado, preço aprovado) a cada minuto. */
@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class PartnerWebhookJob {

    private final PartnerWebhookService webhooks;

    public PartnerWebhookJob(PartnerWebhookService webhooks) {
        this.webhooks = webhooks;
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 90_000)
    public void deliver() {
        try {
            int n = webhooks.deliverDue();
            if (n > 0) log.info("Avisos entregues aos ERPs parceiros: {}", n);
        } catch (Exception e) {
            log.error("Entrega de avisos aos ERPs falhou", e);
        }
    }
}
