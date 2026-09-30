package com.pdv2cloud.job;

import com.pdv2cloud.service.confere.ConfereService;
import com.pdv2cloud.service.confere.SellInAggregator;
import com.pdv2cloud.tenancy.TenantContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Dados do Confere: extrai os itens das notas guardadas antes da tabela de
 * itens (lotes pequenos até acabar) e recalcula de madrugada o agregado
 * anônimo de entrada de mercadoria.
 */
@Component
@Profile("jobs")
@Slf4j
public class ConfereDataJob {

    private final ConfereService confere;
    private final SellInAggregator aggregator;

    public ConfereDataJob(ConfereService confere, SellInAggregator aggregator) {
        this.confere = confere;
        this.aggregator = aggregator;
    }

    @Scheduled(fixedDelayString = "900000", initialDelayString = "120000")
    public void backfill() {
        try {
            int n = TenantContext.runAsSystem(() -> confere.backfillItems(200));
            if (n > 0) {
                log.info("Confere backfill | {} notas/conferências processadas", n);
            }
        } catch (RuntimeException e) {
            log.warn("Confere backfill falhou: {}", e.getMessage());
        }
    }

    @Scheduled(cron = "0 30 3 * * *", zone = "America/Sao_Paulo")
    public void aggregate() {
        try {
            SellInAggregator.Result r = TenantContext.runAsSystem(() -> aggregator.rebuild(104));
            log.info("Agregado de entrada | desde {} | {} células | mínimo {} lojas", r.from(), r.cells(), r.minStores());
        } catch (RuntimeException e) {
            log.warn("Agregado de entrada falhou: {}", e.getMessage());
        }
    }
}
