package com.pdv2cloud.job;

import com.pdv2cloud.service.localprice.LocalPriceService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Toda madrugada, para cada loja do Paraná: os 150 produtos que mais vendem e
 * estão sem referência há 6 dias (cobre os ~300 principais por semana, com
 * uma consulta a cada 1,5 s ao Menor Preço).
 */
@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class LocalPriceJob {

    static final int PRODUCTS_PER_NIGHT = 150;

    private final LocalPriceService prices;

    public LocalPriceJob(LocalPriceService prices) {
        this.prices = prices;
    }

    @Scheduled(cron = "0 10 3 * * *", zone = "America/Sao_Paulo")
    public void run() {
        for (UUID marketId : prices.parana()) {
            TenantContext.set(new TenantContext.TenantInfo(marketId, false));
            try {
                prices.collect(marketId, PRODUCTS_PER_NIGHT);
            } catch (Exception e) {
                log.warn("Preço da vizinhança falhou (mercado {}): {}", marketId, e.getMessage());
            } finally {
                TenantContext.clear();
            }
        }
    }
}
