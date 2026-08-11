package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.intelligence.ForecastAccuracyService;
import com.pdv2cloud.service.opportunity.OutcomeEvaluationService;
import com.pdv2cloud.tenancy.TenantContext;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Fecha o ciclo de aprendizado: mede o que aconteceu depois das decisões e
 * afere a acurácia da previsão de demanda.
 *
 * Semanal, e não diário, porque o horizonte de medição é de 30 dias — rodar
 * todo dia processaria as mesmas pendências sem nada novo para medir.
 *
 * Segunda-feira às 04:00: depois da materialização (03:00) e da detecção de
 * oportunidades (03:30), com a semana comercial recém-fechada.
 */
@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class OutcomeEvaluationJob {

    private final OutcomeEvaluationService outcomeEvaluationService;
    private final ForecastAccuracyService forecastAccuracyService;
    private final MarketRepository marketRepository;

    public OutcomeEvaluationJob(
        OutcomeEvaluationService outcomeEvaluationService,
        ForecastAccuracyService forecastAccuracyService,
        MarketRepository marketRepository
    ) {
        this.outcomeEvaluationService = outcomeEvaluationService;
        this.forecastAccuracyService = forecastAccuracyService;
        this.marketRepository = marketRepository;
    }

    @Scheduled(cron = "0 0 4 * * MON")
    public void evaluateOutcomes() {
        List<Market> markets = TenantContext.runAsSystem(marketRepository::findAllActive);
        log.info("Avaliacao de resultados iniciada para {} mercado(s)", markets.size());

        int ok = 0;
        int failed = 0;
        int totalOutcomes = 0;
        int totalForecasts = 0;

        for (Market market : markets) {
            try {
                int outcomes = TenantContext.runAsSystem(
                    () -> outcomeEvaluationService.evaluateDue(market.getId()));
                int forecasts = TenantContext.runAsSystem(
                    () -> forecastAccuracyService.evaluate(market.getId()));

                totalOutcomes += outcomes;
                totalForecasts += forecasts;
                ok++;
                log.debug("Mercado {}: {} decisoes medidas, {} previsoes aferidas",
                    market.getId(), outcomes, forecasts);
            } catch (Exception e) {
                failed++;
                log.error("Falha ao avaliar resultados do mercado {}", market.getId(), e);
            }
        }

        log.info("Avaliacao concluida: {} mercado(s) ok, {} com falha, "
                + "{} decisoes medidas, {} previsoes aferidas",
            ok, failed, totalOutcomes, totalForecasts);
    }
}
