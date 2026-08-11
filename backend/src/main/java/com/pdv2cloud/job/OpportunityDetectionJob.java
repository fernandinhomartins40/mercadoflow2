package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.opportunity.OpportunityEngine;
import com.pdv2cloud.service.opportunity.OpportunityEngine.DetectionResult;
import com.pdv2cloud.service.opportunity.RecommendationEngine;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Detecta oportunidades e gera recomendações, uma vez por dia.
 *
 * Roda às 03:30 — depois do ProductIntelligenceJob (03:00), do qual depende: os
 * detectores de capital e halo leem as tabelas que aquele job materializa. Rodar
 * antes usaria os números da véspera.
 */
@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class OpportunityDetectionJob {

    private final OpportunityEngine opportunityEngine;
    private final RecommendationEngine recommendationEngine;
    private final MarketRepository marketRepository;

    public OpportunityDetectionJob(
        OpportunityEngine opportunityEngine,
        RecommendationEngine recommendationEngine,
        MarketRepository marketRepository
    ) {
        this.opportunityEngine = opportunityEngine;
        this.recommendationEngine = recommendationEngine;
        this.marketRepository = marketRepository;
    }

    /**
     * Como os demais jobs, o escopo de sistema envolve CADA chamada
     * transacional — as variáveis de tenant são fixadas no checkout da conexão,
     * que o @Transactional faz antes de o corpo executar. Um mercado que falha
     * não derruba os outros.
     */
    @Scheduled(cron = "0 30 3 * * ?")
    public void detectOpportunities() {
        List<Market> markets = TenantContext.runAsSystem(marketRepository::findAllActive);
        log.info("Deteccao de oportunidades iniciada para {} mercado(s)", markets.size());

        int ok = 0;
        int failed = 0;
        int totalCreated = 0;
        int totalRecommendations = 0;

        for (Market market : markets) {
            try {
                DetectionResult result = TenantContext.runAsSystem(
                    () -> opportunityEngine.detectForMarket(market.getId()));
                int recs = TenantContext.runAsSystem(
                    () -> recommendationEngine.generateForMarket(market.getId()));

                totalCreated += result.created();
                totalRecommendations += recs;
                ok++;
                log.debug(
                    "Mercado {}: {} detectadas, {} novas, {} atualizadas, {} concluidas, "
                        + "{} expiradas, {} recomendacoes em {} ms",
                    market.getId(), result.detected(), result.created(), result.updated(),
                    result.closed(), result.expired(), recs, result.durationMillis());
            } catch (Exception e) {
                failed++;
                log.error("Falha ao detectar oportunidades do mercado {}", market.getId(), e);
            }
        }

        log.info("Deteccao concluida: {} mercado(s) ok, {} com falha, "
                + "{} oportunidades novas, {} recomendacoes geradas",
            ok, failed, totalCreated, totalRecommendations);
    }
}
