package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class MLPredictionJob {

    @Autowired
    private MarketRepository marketRepository;

    @Scheduled(cron = "0 0 4 * * ?")
    public void runPrediction() {
        List<Market> markets = marketRepository.findAllActive();
        for (Market market : markets) {
            log.info("Generating demand forecast for market {}", market.getId());
        }
    }
}
