package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.MarketBasketService;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class MarketBasketAnalysisJob {

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private MarketBasketService marketBasketService;

    @Scheduled(cron = "0 30 2 * * ?")
    public void runMarketBasket() {
        log.info("Starting market basket analysis");
        List<Market> markets = marketRepository.findAllActive();
        for (Market market : markets) {
            marketBasketService.analyzeMarketBasket(market.getId(), 0.01, 0.5);
        }
        log.info("Market basket analysis completed");
    }
}
