package com.pdv2cloud.job;

import com.pdv2cloud.model.entity.DemandForecast;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.DemandForecastRepository;
import com.pdv2cloud.repository.InvoiceRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.ProductRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Demand forecast using Holt-Winters double exponential smoothing with
 * day-of-week seasonality adjustment and confidence intervals.
 *
 * Model:
 *   Level:  L[t] = alpha * y[t] + (1 - alpha) * (L[t-1] + T[t-1])
 *   Trend:  T[t] = beta  * (L[t] - L[t-1]) + (1 - beta) * T[t-1]
 *   Forecast h steps ahead: F[t+h] = L[t] + h * T[t], scaled by weekday factor
 *
 * Confidence intervals use residual standard deviation from the training window.
 */
@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class MLPredictionJob {

    private static final double ALPHA = 0.30;  // level smoothing
    private static final double BETA  = 0.10;  // trend smoothing
    private static final double CI_Z  = 1.645; // 90% confidence interval

    @Autowired private MarketRepository marketRepository;
    @Autowired private InvoiceRepository invoiceRepository;
    @Autowired private DemandForecastRepository demandForecastRepository;
    @Autowired private ProductRepository productRepository;

    @Scheduled(cron = "0 0 4 * * ?")
    public void runPrediction() {
        List<Market> markets = marketRepository.findAllActive();
        for (Market market : markets) {
            try {
                generateForecast(market);
            } catch (Exception e) {
                log.error("Forecast failed for market {}: {}", market.getId(), e.getMessage());
            }
        }
    }

    private void generateForecast(Market market) {
        UUID marketId = market.getId();
        LocalDate today = LocalDate.now();
        LocalDate historyStart = today.minusDays(84);
        LocalDate historyEnd = today.minusDays(1);
        LocalDate forecastStart = today.plusDays(1);
        LocalDate forecastEnd = today.plusDays(30);

        demandForecastRepository.deleteRange(marketId, forecastStart, forecastEnd);

        List<Object[]> history = invoiceRepository.aggregateDailyQuantityByProductBetween(
            marketId, historyStart, historyEnd);
        if (history.isEmpty()) {
            log.info("Skipping forecast for market {} (no history)", marketId);
            return;
        }

        Map<UUID, Map<LocalDate, Double>> byProduct = buildProductHistory(history);

        List<Map.Entry<UUID, Map<LocalDate, Double>>> ranked = byProduct.entrySet().stream()
            .sorted(Comparator.comparingDouble(e -> -recentSum(e.getValue(), historyEnd, 14)))
            .limit(100)
            .toList();

        List<DemandForecast> out = new ArrayList<>();
        for (Map.Entry<UUID, Map<LocalDate, Double>> entry : ranked) {
            UUID productId = entry.getKey();
            Map<LocalDate, Double> daily = entry.getValue();

            double[] series = toSeries(daily, historyStart, historyEnd);
            if (seriesSum(series) <= 0) continue;

            HoltWinters hw = fitHoltWinters(series);
            Map<DayOfWeek, Double> weekdayFactors = computeWeekdayFactors(daily, historyStart, historyEnd);

            int h = 0;
            for (LocalDate d = forecastStart; !d.isAfter(forecastEnd); d = d.plusDays(1)) {
                h++;
                double raw = hw.forecast(h);
                double factor = weekdayFactors.getOrDefault(d.getDayOfWeek(), 1.0);
                double predicted = Math.max(0, raw * factor);

                // Confidence interval widens with forecast horizon
                double stdErr = hw.residualStd * Math.sqrt(1 + h * 0.05);
                double lo = Math.max(0, predicted - CI_Z * stdErr);
                double hi = predicted + CI_Z * stdErr;

                if (predicted <= 0) continue;

                DemandForecast df = new DemandForecast();
                df.setMarket(market);
                df.setProduct(productRepository.getReferenceById(productId));
                df.setForecastDate(d);
                df.setPredictedQuantity(bd(predicted, 3));
                df.setConfidenceLow(bd(lo, 3));
                df.setConfidenceHigh(bd(hi, 3));
                df.setTrendDirection(hw.trendValue() > 0.01 ? "UP" : hw.trendValue() < -0.01 ? "DOWN" : "STABLE");
                out.add(df);
            }
        }

        if (!out.isEmpty()) {
            demandForecastRepository.saveAll(out);
            log.info("Generated {} forecast rows for market {}", out.size(), marketId);
        }
    }

    // ── Holt-Winters double exponential smoothing ────────────────────────────

    private HoltWinters fitHoltWinters(double[] series) {
        // Initialise with first 7 observations or full series if shorter
        int initLen = Math.min(7, series.length);
        double level = 0;
        for (int i = 0; i < initLen; i++) level += series[i];
        level /= initLen;

        double trend = 0;
        if (series.length >= 2) {
            double trendSum = 0;
            for (int i = 1; i < initLen; i++) trendSum += (series[i] - series[i - 1]);
            trend = trendSum / (initLen - 1);
        }

        double sumSqResidual = 0;
        double prevLevel = level;
        for (int t = 0; t < series.length; t++) {
            double y = series[t];
            double newLevel = ALPHA * y + (1 - ALPHA) * (prevLevel + trend);
            double newTrend = BETA * (newLevel - prevLevel) + (1 - BETA) * trend;
            double fitted = prevLevel + trend;
            sumSqResidual += Math.pow(y - fitted, 2);
            prevLevel = newLevel;
            trend = newTrend;
        }
        double residualStd = series.length > 1
            ? Math.sqrt(sumSqResidual / (series.length - 1))
            : level * 0.2;

        return new HoltWinters(prevLevel, trend, residualStd);
    }

    record HoltWinters(double level, double trend, double residualStd) {
        double forecast(int h) {
            double raw = level + h * trend;
            // Clamp extreme trend extrapolation to ±50% of level
            double maxDelta = Math.abs(level) * 0.50;
            double delta = Math.min(Math.max(h * trend, -maxDelta), maxDelta);
            return Math.max(0, level + delta);
        }
        double trendValue() { return trend; }
    }

    // ── Weekday seasonality factors ──────────────────────────────────────────

    private Map<DayOfWeek, Double> computeWeekdayFactors(
        Map<LocalDate, Double> daily, LocalDate start, LocalDate end) {

        Map<DayOfWeek, Double> totals = new EnumMap<>(DayOfWeek.class);
        Map<DayOfWeek, Integer> counts = new EnumMap<>(DayOfWeek.class);
        double grandTotal = 0;
        int activeDays = 0;

        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            Double v = daily.get(d);
            if (v == null || v <= 0) continue;
            DayOfWeek dow = d.getDayOfWeek();
            totals.merge(dow, v, Double::sum);
            counts.merge(dow, 1, Integer::sum);
            grandTotal += v;
            activeDays++;
        }

        if (activeDays == 0 || grandTotal == 0) return Map.of();

        double dailyAvg = grandTotal / activeDays;
        Map<DayOfWeek, Double> factors = new EnumMap<>(DayOfWeek.class);
        for (DayOfWeek dow : DayOfWeek.values()) {
            Integer cnt = counts.get(dow);
            if (cnt == null || cnt == 0) {
                factors.put(dow, 1.0);
            } else {
                double dowAvg = totals.get(dow) / cnt;
                double factor = dowAvg / dailyAvg;
                // Clamp factor to [0.3, 2.5] to prevent outlier distortion
                factors.put(dow, Math.min(Math.max(factor, 0.3), 2.5));
            }
        }
        return factors;
    }

    // ── Utility ──────────────────────────────────────────────────────────────

    private Map<UUID, Map<LocalDate, Double>> buildProductHistory(List<Object[]> rows) {
        Map<UUID, Map<LocalDate, Double>> result = new HashMap<>();
        for (Object[] row : rows) {
            UUID productId = row[0] instanceof UUID ? (UUID) row[0] : UUID.fromString(row[0].toString());
            LocalDate date = row[1] instanceof LocalDate
                ? (LocalDate) row[1]
                : ((java.sql.Date) row[1]).toLocalDate();
            double qty = row[2] != null ? ((BigDecimal) row[2]).doubleValue() : 0;
            result.computeIfAbsent(productId, k -> new HashMap<>()).put(date, qty);
        }
        return result;
    }

    private double[] toSeries(Map<LocalDate, Double> daily, LocalDate start, LocalDate end) {
        List<Double> vals = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            vals.add(daily.getOrDefault(d, 0.0));
        }
        return vals.stream().mapToDouble(Double::doubleValue).toArray();
    }

    private double recentSum(Map<LocalDate, Double> daily, LocalDate end, int days) {
        LocalDate s = end.minusDays(days - 1L);
        double sum = 0;
        for (LocalDate d = s; !d.isAfter(end); d = d.plusDays(1)) {
            sum += daily.getOrDefault(d, 0.0);
        }
        return sum;
    }

    private double seriesSum(double[] series) {
        double s = 0;
        for (double v : series) s += v;
        return s;
    }

    private BigDecimal bd(double value, int scale) {
        return BigDecimal.valueOf(value).setScale(scale, RoundingMode.HALF_UP);
    }
}
