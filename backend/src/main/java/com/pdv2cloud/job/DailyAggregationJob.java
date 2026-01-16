package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.SalesAnalytics;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.InvoiceRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.SalesAnalyticsRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class DailyAggregationJob {

    @Autowired
    private InvoiceRepository invoiceRepository;

    @Autowired
    private SalesAnalyticsRepository analyticsRepository;

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private ProductRepository productRepository;

    @Scheduled(cron = "0 0 2 * * ?")
    public void aggregateDailySales() {
        log.info("Starting daily sales aggregation");
        LocalDate yesterday = LocalDate.now().minusDays(1);
        List<Market> markets = marketRepository.findAllActive();

        for (Market market : markets) {
            aggregateMarketSales(market.getId(), yesterday);
        }

        log.info("Daily sales aggregation completed");
    }

    private void aggregateMarketSales(UUID marketId, LocalDate date) {
        List<Object[]> results = invoiceRepository.aggregateDailySales(marketId, date);

        List<SalesAnalytics> analytics = results.stream()
            .map(row -> {
                SalesAnalytics sa = new SalesAnalytics();
                sa.setMarket(marketRepository.getReferenceById(marketId));
                sa.setProduct(productRepository.getReferenceById((UUID) row[0]));
                sa.setDate(date);
                sa.setQuantitySold((BigDecimal) row[1]);
                sa.setRevenue((BigDecimal) row[2]);
                sa.setAveragePrice((BigDecimal) row[3]);
                sa.setTransactionCount(((Number) row[4]).intValue());
                return sa;
            })
            .collect(Collectors.toList());

        analyticsRepository.saveAll(analytics);
    }
}
