package com.pdv2cloud.job;

import com.pdv2cloud.service.billing.SubscriptionService;
import com.pdv2cloud.tenancy.TenantContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Ciclo diário das assinaturas: teste que acabou volta ao Grátis, aviso de
 * teste terminando, carência vencida vira só consulta e restrição longa volta
 * ao Grátis. Os avisos têm chave, então rodar de novo não repete nada.
 */
@Component
@Profile("jobs")
@Slf4j
public class BillingLifecycleJob {

    private final SubscriptionService subscriptions;

    public BillingLifecycleJob(SubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
    }

    @Scheduled(cron = "0 15 8 * * *", zone = "America/Sao_Paulo")
    public void run() {
        SubscriptionService.LifecycleResult r = TenantContext.runAsSystem(subscriptions::runLifecycle);
        log.info("Ciclo das assinaturas: {}", r);
    }
}
