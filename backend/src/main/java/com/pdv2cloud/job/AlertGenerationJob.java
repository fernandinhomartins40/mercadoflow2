package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.AlertService;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class AlertGenerationJob {

    @Autowired
    private AlertService alertService;

    @Autowired
    private MarketRepository marketRepository;

    @Scheduled(fixedRate = 3600000)
    public void generateAlerts() {
        log.info("Starting alert generation");
        List<Market> markets = marketRepository.findAllActive();

        for (Market market : markets) {
            alertService.checkLowStock(market.getId());
            alertService.checkSlowMoving(market.getId());
            alertService.checkPromotionOpportunities(market.getId());
            alertService.checkHighPerformers(market.getId());
        }

        log.info("Alert generation completed");
    }
}
