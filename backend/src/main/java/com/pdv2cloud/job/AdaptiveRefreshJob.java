package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.intelligence.IncrementalRefreshService;
import com.pdv2cloud.service.intelligence.IncrementalRefreshService.RefreshResult;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Mantém a inteligência acompanhando o dia da loja.
 *
 * Roda a cada 5 minutos, mas NÃO recalcula nada a cada 5 minutos: apenas oferece
 * a oportunidade a cada mercado, e o {@link IncrementalRefreshService} decide se
 * é a hora daquele — conforme o ritmo próprio da loja e se houve venda nova.
 *
 * Na prática, o custo de um ciclo para uma loja parada é uma consulta de
 * contagem. O trabalho pesado só acontece onde há movimento.
 *
 * Convive com o ProductIntelligenceJob (03:00), que continua fazendo a
 * materialização completa da madrugada: o que precisa de janela longa — halo de
 * 180 dias, sazonalidade de 365 — não ganha nada em rodar de 10 em 10 minutos.
 */
@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class AdaptiveRefreshJob {

    private final IncrementalRefreshService refreshService;
    private final MarketRepository marketRepository;

    public AdaptiveRefreshJob(
        IncrementalRefreshService refreshService,
        MarketRepository marketRepository
    ) {
        this.refreshService = refreshService;
        this.marketRepository = marketRepository;
    }

    /**
     * A cada 5 minutos: o menor denominador comum das cadências possíveis
     * (10 min no pico). Um mercado em hora de pico é atendido a cada dois
     * ciclos; um parado, a cada doze — e nos onze intermediários ele custa
     * apenas a verificação de "já é minha hora?".
     */
    @Scheduled(fixedDelayString = "300000", initialDelayString = "120000")
    public void refreshMarkets() {
        List<Market> markets = TenantContext.runAsSystem(marketRepository::findAllActive);

        int refreshed = 0;
        int skipped = 0;
        int failed = 0;
        int totalOpportunities = 0;

        for (Market market : markets) {
            try {
                RefreshResult result = TenantContext.runAsSystem(
                    () -> refreshService.refreshMarket(market.getId()));

                if (result.skipped()) {
                    skipped++;
                } else {
                    refreshed++;
                    totalOpportunities += result.opportunitiesCreated();
                    log.debug(
                        "Mercado {} [{}]: {} nota(s), {} produto(s), {} oportunidade(s), "
                            + "{} recomendacao(oes); proximo ciclo em {} min ({} ms)",
                        market.getId(), result.rhythm(), result.invoicesSinceLastRun(),
                        result.productsTouched(), result.opportunitiesCreated(),
                        result.recommendationsCreated(), result.nextIntervalMinutes(),
                        result.durationMillis());
                }
            } catch (Exception e) {
                failed++;
                log.error("Falha no refresh adaptativo do mercado {}", market.getId(), e);
            }
        }

        // Só loga em nível INFO quando houve trabalho de verdade: a cada 5 min,
        // um log por ciclo vazio poluiria a operação sem informar nada.
        if (refreshed > 0 || failed > 0) {
            log.info("Refresh adaptativo: {} atualizado(s), {} no aguardo, {} com falha, "
                    + "{} oportunidade(s) nova(s)",
                refreshed, skipped, failed, totalOpportunities);
        }
    }
}
