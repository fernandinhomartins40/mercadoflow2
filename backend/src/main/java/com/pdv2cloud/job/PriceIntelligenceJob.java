package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.PriceIntelligenceService;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class PriceIntelligenceJob {

    @Autowired
    private PriceIntelligenceService priceIntelligenceService;

    @Autowired
    private MarketRepository marketRepository;

    @Scheduled(fixedDelayString = "${app.price-intelligence.fixed-delay-ms:900000}")
    public void syncPriceIntelligence() {
        List<Market> markets = marketRepository.findAllActive();
        for (Market market : markets) {
            try {
                priceIntelligenceService.syncMarket(market.getId());
            } catch (Exception e) {
                log.warn("Price intelligence sync failed for market {}", market.getId(), e);
            }
        }
    }
}

