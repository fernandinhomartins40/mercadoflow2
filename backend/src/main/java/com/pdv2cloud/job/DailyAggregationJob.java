package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.SalesAnalytics;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.InvoiceRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.SalesAnalyticsRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class DailyAggregationJob {

    @Autowired
    private InvoiceRepository invoiceRepository;

    @Autowired
    private SalesAnalyticsRepository analyticsRepository;

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private TransactionTemplate tx;

    /** Notas do PDV que o agente envia atrasadas (fila offline) entram no recálculo. */
    static final int DAYS_BACK = 7;

    /** Dia comercial da loja: data_emissao guarda a hora local da nota, e a JVM roda em UTC. */
    static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");

    @Scheduled(cron = "0 0 2 * * ?", zone = "America/Sao_Paulo")
    public void aggregateDailySales() {
        log.info("Starting daily sales aggregation");
        LocalDate yesterday = LocalDate.now(ZONE).minusDays(1);
        List<Market> markets = marketRepository.findAllActive();

        int failures = 0;
        for (Market market : markets) {
            for (int back = DAYS_BACK - 1; back >= 0; back--) {
                LocalDate date = yesterday.minusDays(back);
                // Uma transação por mercado e dia: o delete @Modifying exige transação
                // (sem ela o job caía no primeiro mercado, toda noite, e sales_analytics
                // ficava vazia) e a falha de um mercado não interrompe os outros.
                try {
                    tx.executeWithoutResult(status -> aggregateMarketSales(market.getId(), date));
                } catch (RuntimeException e) {
                    failures++;
                    log.error("Daily sales aggregation failed for market {} on {}: {}", market.getId(), date, e.getMessage(), e);
                }
            }
        }

        log.info("Daily sales aggregation completed ({} markets, {} failures)", markets.size(), failures);
    }

    private void aggregateMarketSales(UUID marketId, LocalDate date) {
        List<Object[]> results = invoiceRepository.aggregateDailySales(marketId, date);

        // Ensure idempotency if job re-runs.
        analyticsRepository.deleteByMarketAndDate(marketId, date);

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
