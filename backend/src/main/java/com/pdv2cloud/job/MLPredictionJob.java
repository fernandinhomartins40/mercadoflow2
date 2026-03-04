package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.DemandForecastRepository;
import com.pdv2cloud.repository.InvoiceRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.model.entity.DemandForecast;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.DayOfWeek;
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
    private InvoiceRepository invoiceRepository;

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
        LocalDate historyStart = today.minusDays(84);
        LocalDate historyEnd = today.minusDays(1);

        LocalDate forecastStart = today.plusDays(1);
        LocalDate forecastEnd = today.plusDays(30);

        // Replace forecast window for idempotency.
        demandForecastRepository.deleteRange(marketId, forecastStart, forecastEnd);

        List<Object[]> history = invoiceRepository.aggregateDailyQuantityByProductBetween(marketId, historyStart, historyEnd);
        if (history.isEmpty()) {
            log.info("Skipping forecast for market {} (no invoice history)", marketId);
            return;
        }

        Map<UUID, Map<LocalDate, BigDecimal>> byProductAndDate = new HashMap<>();
        for (Object[] row : history) {
            UUID productId = row[0] instanceof UUID ? (UUID) row[0] : UUID.fromString(row[0].toString());
            LocalDate date = row[1] instanceof LocalDate
                ? (LocalDate) row[1]
                : ((java.sql.Date) row[1]).toLocalDate();
            BigDecimal quantity = row[2] != null ? (BigDecimal) row[2] : BigDecimal.ZERO;
            byProductAndDate.computeIfAbsent(productId, ignored -> new HashMap<>()).put(date, quantity);
        }

        List<Map.Entry<UUID, Map<LocalDate, BigDecimal>>> rankedProducts = byProductAndDate.entrySet().stream()
            .sorted(Comparator.comparing(entry -> recentAverage(entry.getValue(), historyEnd), Comparator.reverseOrder()))
            .limit(100)
            .toList();

        List<DemandForecast> out = new ArrayList<>();
        for (Map.Entry<UUID, Map<LocalDate, BigDecimal>> entry : rankedProducts) {
            UUID productId = entry.getKey();
            Map<LocalDate, BigDecimal> dailyHistory = entry.getValue();
            BigDecimal overallRecentAverage = recentAverage(dailyHistory, historyEnd);
            if (overallRecentAverage.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            Map<DayOfWeek, BigDecimal> weekdayAverage = weekdayAverage(dailyHistory);
            BigDecimal previousAverage = previousAverage(dailyHistory, historyEnd);
            BigDecimal trendFactor = trendFactor(overallRecentAverage, previousAverage);

            for (LocalDate d = forecastStart; !d.isAfter(forecastEnd); d = d.plusDays(1)) {
                BigDecimal dayBase = weekdayAverage.getOrDefault(d.getDayOfWeek(), overallRecentAverage);
                BigDecimal predicted = dayBase.multiply(trendFactor).setScale(3, RoundingMode.HALF_UP);
                if (predicted.compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }
                DemandForecast df = new DemandForecast();
                df.setMarket(market);
                df.setProduct(productRepository.getReferenceById(productId));
                df.setForecastDate(d);
                df.setPredictedQuantity(predicted);
                out.add(df);
            }
        }

        if (!out.isEmpty()) {
            demandForecastRepository.saveAll(out);
            log.info("Generated {} forecast rows for market {}", out.size(), marketId);
        }
    }

    private BigDecimal recentAverage(Map<LocalDate, BigDecimal> dailyHistory, LocalDate historyEnd) {
        return averageBetween(dailyHistory, historyEnd.minusDays(27), historyEnd);
    }

    private BigDecimal previousAverage(Map<LocalDate, BigDecimal> dailyHistory, LocalDate historyEnd) {
        return averageBetween(dailyHistory, historyEnd.minusDays(55), historyEnd.minusDays(28));
    }

    private BigDecimal averageBetween(Map<LocalDate, BigDecimal> dailyHistory, LocalDate start, LocalDate end) {
        BigDecimal total = BigDecimal.ZERO;
        int days = 0;
        for (LocalDate date = start; !date.isAfter(end); date = date.plusDays(1)) {
            total = total.add(dailyHistory.getOrDefault(date, BigDecimal.ZERO));
            days++;
        }
        if (days == 0) {
            return BigDecimal.ZERO;
        }
        return total.divide(BigDecimal.valueOf(days), 4, RoundingMode.HALF_UP);
    }

    private Map<DayOfWeek, BigDecimal> weekdayAverage(Map<LocalDate, BigDecimal> dailyHistory) {
        Map<DayOfWeek, BigDecimal> totals = new EnumMap<>(DayOfWeek.class);
        Map<DayOfWeek, Integer> counts = new EnumMap<>(DayOfWeek.class);

        dailyHistory.forEach((date, qty) -> {
            DayOfWeek dayOfWeek = date.getDayOfWeek();
            totals.merge(dayOfWeek, qty, BigDecimal::add);
            counts.merge(dayOfWeek, 1, Integer::sum);
        });

        Map<DayOfWeek, BigDecimal> averages = new EnumMap<>(DayOfWeek.class);
        for (DayOfWeek dayOfWeek : DayOfWeek.values()) {
            BigDecimal total = totals.getOrDefault(dayOfWeek, BigDecimal.ZERO);
            int count = counts.getOrDefault(dayOfWeek, 0);
            averages.put(
                dayOfWeek,
                count > 0 ? total.divide(BigDecimal.valueOf(count), 4, RoundingMode.HALF_UP) : BigDecimal.ZERO
            );
        }
        return averages;
    }

    private BigDecimal trendFactor(BigDecimal recentAverage, BigDecimal previousAverage) {
        if (previousAverage.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ONE;
        }

        BigDecimal ratio = recentAverage.divide(previousAverage, 4, RoundingMode.HALF_UP);
        if (ratio.compareTo(BigDecimal.valueOf(1.40)) > 0) {
            return BigDecimal.valueOf(1.40);
        }
        if (ratio.compareTo(BigDecimal.valueOf(0.70)) < 0) {
            return BigDecimal.valueOf(0.70);
        }
        return ratio;
    }
}
