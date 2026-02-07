package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.DemandForecastRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.SalesAnalyticsRepository;
import com.pdv2cloud.model.entity.DemandForecast;
import java.util.List;
import java.util.ArrayList;
import java.util.UUID;
import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class MLPredictionJob {

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private SalesAnalyticsRepository salesAnalyticsRepository;

    @Autowired
    private DemandForecastRepository demandForecastRepository;

    @Autowired
    private ProductRepository productRepository;

    @Scheduled(cron = "0 0 4 * * ?")
    public void runPrediction() {
        List<Market> markets = marketRepository.findAllActive();
        for (Market market : markets) {
            generateForecast(market);
        }
    }

    private void generateForecast(Market market) {
        UUID marketId = market.getId();
        LocalDate today = LocalDate.now();
        LocalDate historyStart = today.minusDays(30);
        LocalDate historyEnd = today.minusDays(1);

        LocalDate forecastStart = today.plusDays(1);
        LocalDate forecastEnd = today.plusDays(7);

        // Replace forecast window for idempotency.
        demandForecastRepository.deleteRange(marketId, forecastStart, forecastEnd);

        List<Object[]> averages = salesAnalyticsRepository.averageDailyQuantityByProduct(marketId, historyStart, historyEnd);
        if (averages.isEmpty()) {
            log.info("Skipping forecast for market {} (no analytics)", marketId);
            return;
        }

        List<DemandForecast> out = new ArrayList<>();
        int limit = 0;
        for (Object[] row : averages) {
            if (limit++ >= 50) {
                break;
            }
            UUID productId = row[0] instanceof UUID ? (UUID) row[0] : UUID.fromString(row[0].toString());
            BigDecimal avgQty = (BigDecimal) row[1];
            if (avgQty == null || avgQty.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            for (LocalDate d = forecastStart; !d.isAfter(forecastEnd); d = d.plusDays(1)) {
                DemandForecast df = new DemandForecast();
                df.setMarket(market);
                df.setProduct(productRepository.getReferenceById(productId));
                df.setForecastDate(d);
                df.setPredictedQuantity(avgQty);
                out.add(df);
            }
        }

        if (!out.isEmpty()) {
            demandForecastRepository.saveAll(out);
            log.info("Generated {} forecast rows for market {}", out.size(), marketId);
        }
    }
}
