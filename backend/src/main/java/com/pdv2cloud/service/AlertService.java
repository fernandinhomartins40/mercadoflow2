package com.pdv2cloud.service;

import com.pdv2cloud.exception.CustomExceptions;
import com.pdv2cloud.model.dto.AlertDTO;
import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.dto.ProductPerformanceDTO;
import com.pdv2cloud.model.entity.Alert;
import com.pdv2cloud.model.entity.AlertPriority;
import com.pdv2cloud.model.entity.AlertType;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.AlertRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.ProductRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.ToDoubleFunction;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Alert generation engine — six independent signal detectors running on real analytics data.
 *
 * Each detector:
 *  1. Loads a product performance window (14–60 days depending on signal type)
 *  2. Computes Z-scores across the portfolio to find statistical outliers
 *  3. Applies business-rule filters (thresholds, minimum activity, trend direction)
 *  4. Writes rich alerts with a metadata payload carrying the actual numbers
 *  5. Deduplicates within a 36-hour window per product+type
 *
 * Dedup window: 36 h per (market, product, type) tuple.
 * Priority ladder: URGENT > HIGH > MEDIUM > LOW
 */
@Service
public class AlertService {

    private static final int DEDUP_HOURS = 36;

    @Autowired private AlertRepository alertRepository;
    @Autowired private MarketRepository marketRepository;
    @Autowired private AdvancedAnalyticsService advancedAnalyticsService;
    @Autowired private MarketBasketService marketBasketService;
    @Autowired private ProductRepository productRepository;

    // ── Read ──────────────────────────────────────────────────────────────────

    public List<AlertDTO> getAlerts(UUID marketId, AlertType type, AlertPriority priority, boolean onlyUnread) {
        List<Alert> alerts = onlyUnread
            ? alertRepository.findByMarketIdAndIsReadFalse(marketId)
            : alertRepository.findByMarketId(marketId);
        if (type != null) alerts = alerts.stream().filter(a -> a.getType() == type).toList();
        if (priority != null) alerts = alerts.stream().filter(a -> a.getPriority() == priority).toList();
        return alerts.stream().map(this::mapAlert).toList();
    }

    @Transactional
    public void markAsRead(UUID marketId, UUID alertId) {
        if (alertRepository.markAsRead(marketId, alertId) == 0) {
            throw new CustomExceptions.NotFound("Alert not found");
        }
    }

    @Transactional
    public int markAllAsRead(UUID marketId) {
        return alertRepository.markAllAsRead(marketId);
    }

    // ── Detectors ─────────────────────────────────────────────────────────────

    /**
     * ZERO_SALES — product with sales history that has gone silent.
     * Trigger: >= 7 days with no sale but had >= 5 transactions in the previous 30 days.
     * Priority: URGENT if > 14 days, HIGH if 7–14 days.
     */
    @Transactional
    public void checkZeroSales(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        List<ProductPerformanceDTO> all = advancedAnalyticsService
            .getProductPerformance(marketId, end.minusDays(44), end, null, null, "REVENUE",
                PageRequest.of(0, 200))
            .getContent();

        all.stream()
            .filter(r -> r.getLastSoldAt() != null)
            .filter(r -> r.getTransactionCount() != null && r.getTransactionCount() >= 5)
            .filter(r -> {
                long daysSilent = java.time.Duration.between(
                    r.getLastSoldAt(), LocalDateTime.now()).toDays();
                return daysSilent >= 7;
            })
            .limit(8)
            .forEach(r -> {
                long daysSilent = java.time.Duration.between(
                    r.getLastSoldAt(), LocalDateTime.now()).toDays();
                AlertPriority prio = daysSilent > 14 ? AlertPriority.URGENT : AlertPriority.HIGH;
                String title = daysSilent > 14
                    ? "Produto sem venda há " + daysSilent + " dias"
                    : "Produto parou de vender";
                String msg = String.format(
                    "%s não registra saída há %d dias. Tinha %.0f transações nos 44 dias anteriores. " +
                    "Verifique disponibilidade no PDV e preço em relação à concorrência.",
                    r.getName(), daysSilent, (double)(r.getTransactionCount() != null ? r.getTransactionCount() : 0));
                Map<String, Object> meta = Map.of(
                    "daysSilent", daysSilent,
                    "previousTransactions", r.getTransactionCount() != null ? r.getTransactionCount() : 0,
                    "revenue", dbl(r.getRevenue()),
                    "priceIndex", dbl(r.getPriceIndex())
                );
                createAlert(market, r, AlertType.ZERO_SALES, prio, title, msg, meta);
            });
    }

    /**
     * LOW_STOCK / DEMAND_SPIKE — high-velocity product at risk of stock-out.
     * Uses Z-score on salesVelocity: flags products > 1.5σ above portfolio mean.
     * Also flags products whose momentumScore > 1.3 (accelerating fast).
     */
    @Transactional
    public void checkLowStock(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        List<ProductPerformanceDTO> candidates = advancedAnalyticsService
            .getProductPerformance(marketId, end.minusDays(13), end, null, null, "TURNOVER",
                PageRequest.of(0, 60))
            .getContent()
            .stream()
            .filter(r -> r.getTransactionCount() != null && r.getTransactionCount() >= 3)
            .toList();

        if (candidates.isEmpty()) return;

        ZStats velStats = zStats(candidates, r -> dbl(r.getSalesVelocity()));

        candidates.stream()
            .filter(r -> zScore(dbl(r.getSalesVelocity()), velStats) > 1.5)
            .sorted((a, b) -> Double.compare(dbl(b.getSalesVelocity()), dbl(a.getSalesVelocity())))
            .limit(6)
            .forEach(r -> {
                double z = zScore(dbl(r.getSalesVelocity()), velStats);
                double velocityRatio = velStats.mean > 0 ? dbl(r.getSalesVelocity()) / velStats.mean : 1;
                boolean isSpiking = r.getMomentumScore() != null && r.getMomentumScore() > 1.3;
                AlertType alertType = isSpiking ? AlertType.DEMAND_SPIKE : AlertType.LOW_STOCK;
                AlertPriority prio = z > 2.5 ? AlertPriority.URGENT : AlertPriority.HIGH;

                String title = isSpiking
                    ? "Demanda acelerando — risco de ruptura"
                    : "Saída " + String.format("%.1f", velocityRatio) + "× acima da média";
                String msg = String.format(
                    "%s vende %.1f un./dia (média do portfólio: %.1f un./dia). " +
                    "Momentum %.2f%s. Reforce o estoque para não ter ruptura.",
                    r.getName(),
                    dbl(r.getSalesVelocity()),
                    velStats.mean,
                    r.getMomentumScore() != null ? r.getMomentumScore() : 1.0,
                    isSpiking ? " — acelerando" : "");
                Map<String, Object> meta = new HashMap<>();
                meta.put("salesVelocity", dbl(r.getSalesVelocity()));
                meta.put("portfolioMeanVelocity", velStats.mean);
                meta.put("velocityRatio", velocityRatio);
                meta.put("momentumScore", r.getMomentumScore());
                meta.put("zScore", z);
                meta.put("revenue14d", dbl(r.getRevenue()));
                createAlert(market, r, alertType, prio, title, msg, meta);
            });
    }

    /**
     * SLOW_MOVING — product losing revenue AND below portfolio velocity.
     * Z-score on revenueTrendPercentage; must also be below mean velocity.
     */
    @Transactional
    public void checkSlowMoving(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        List<ProductPerformanceDTO> candidates = advancedAnalyticsService
            .getProductPerformance(marketId, end.minusDays(29), end, null, null, "REVENUE",
                PageRequest.of(0, 100))
            .getContent()
            .stream()
            .filter(r -> r.getTransactionCount() != null && r.getTransactionCount() >= 2)
            .toList();

        if (candidates.isEmpty()) return;

        ZStats trendStats = zStats(candidates, r -> r.getRevenueTrendPercentage() != null ? r.getRevenueTrendPercentage() : 0.0);
        ZStats velStats   = zStats(candidates, r -> dbl(r.getSalesVelocity()));

        candidates.stream()
            .filter(r -> r.getRevenueTrendPercentage() != null && r.getRevenueTrendPercentage() < -5)
            .filter(r -> zScore(r.getRevenueTrendPercentage(), trendStats) < -1.2)
            .filter(r -> dbl(r.getSalesVelocity()) < velStats.mean)
            .sorted((a, b) -> Double.compare(
                a.getRevenueTrendPercentage() != null ? a.getRevenueTrendPercentage() : 0,
                b.getRevenueTrendPercentage() != null ? b.getRevenueTrendPercentage() : 0))
            .limit(6)
            .forEach(r -> {
                double z = Math.abs(zScore(r.getRevenueTrendPercentage(), trendStats));
                AlertPriority prio = z > 2.5 ? AlertPriority.URGENT : (z > 2.0 ? AlertPriority.HIGH : AlertPriority.MEDIUM);
                double trend = r.getRevenueTrendPercentage() != null ? r.getRevenueTrendPercentage() : 0;
                double velRatio = velStats.mean > 0 ? dbl(r.getSalesVelocity()) / velStats.mean : 0;
                String title = String.format("Queda de %.1f%% em receita — produto em retração", Math.abs(trend));
                String msg = String.format(
                    "%s perdeu %.1f%% de receita em 30 dias. Giro %.2f un./dia (%.0f%% da média do portfólio). " +
                    "HealthScore: %.0f/100. Considere promoção, reposicionamento ou retirada.",
                    r.getName(),
                    Math.abs(trend),
                    dbl(r.getSalesVelocity()),
                    velRatio * 100,
                    r.getHealthScore() != null ? r.getHealthScore() : 0);
                Map<String, Object> meta = new HashMap<>();
                meta.put("revenueTrend", trend);
                meta.put("salesVelocity", dbl(r.getSalesVelocity()));
                meta.put("portfolioMeanVelocity", velStats.mean);
                meta.put("velocityRatio", velRatio);
                meta.put("healthScore", r.getHealthScore());
                meta.put("momentumScore", r.getMomentumScore());
                meta.put("revenue30d", dbl(r.getRevenue()));
                createAlert(market, r, AlertType.SLOW_MOVING, prio, title, msg, meta);
            });
    }

    /**
     * HEALTH_CRITICAL — composite healthScore below 25/100.
     * Catches products that are degrading across multiple dimensions simultaneously
     * even if no single metric is extreme enough to trigger a specific alert.
     */
    @Transactional
    public void checkHealthCritical(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        List<ProductPerformanceDTO> candidates = advancedAnalyticsService
            .getProductPerformance(marketId, end.minusDays(29), end, null, null, "REVENUE",
                PageRequest.of(0, 200))
            .getContent()
            .stream()
            .filter(r -> r.getHealthScore() != null && r.getHealthScore() < 25)
            .filter(r -> r.getTransactionCount() != null && r.getTransactionCount() >= 3)
            .sorted((a, b) -> Double.compare(
                a.getHealthScore() != null ? a.getHealthScore() : 0,
                b.getHealthScore() != null ? b.getHealthScore() : 0))
            .limit(5)
            .toList();

        for (ProductPerformanceDTO r : candidates) {
            double health = r.getHealthScore() != null ? r.getHealthScore() : 0;
            AlertPriority prio = health < 10 ? AlertPriority.URGENT : AlertPriority.HIGH;
            List<String> reasons = new ArrayList<>();
            if (r.getRevenueTrendPercentage() != null && r.getRevenueTrendPercentage() < -10)
                reasons.add(String.format("receita caindo %.1f%%", Math.abs(r.getRevenueTrendPercentage())));
            if (r.getMomentumScore() != null && r.getMomentumScore() < 0.7)
                reasons.add(String.format("momentum %.2f (desacelerando)", r.getMomentumScore()));
            if ("VERY_LOW".equals(r.getTurnoverBand()) || "LOW".equals(r.getTurnoverBand()))
                reasons.add("giro muito abaixo do portfólio");
            String reasonsText = reasons.isEmpty() ? "múltiplos indicadores em queda" : String.join(", ", reasons);

            String title = String.format("HealthScore crítico: %.0f/100", health);
            String msg = String.format(
                "%s está em estado crítico de saúde de produto (%s). " +
                "Ação urgente recomendada: avalie desconto agressivo, reposicionamento ou descontinuação.",
                r.getName(), reasonsText);
            Map<String, Object> meta = new HashMap<>();
            meta.put("healthScore", health);
            meta.put("revenueTrend", r.getRevenueTrendPercentage());
            meta.put("momentumScore", r.getMomentumScore());
            meta.put("turnoverBand", r.getTurnoverBand());
            meta.put("salesVelocity", dbl(r.getSalesVelocity()));
            meta.put("revenue30d", dbl(r.getRevenue()));
            createAlert(market, r, AlertType.HEALTH_CRITICAL, prio, title, msg, meta);
        }
    }

    /**
     * MOMENTUM_REVERSAL — product that was performing well but is now decelerating sharply.
     * Trigger: momentumScore < 0.72 AND revenueTrend > -3% (so it's not already in SLOW_MOVING).
     * This is an early-warning signal before the product fully deteriorates.
     */
    @Transactional
    public void checkMomentumReversal(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        List<ProductPerformanceDTO> candidates = advancedAnalyticsService
            .getProductPerformance(marketId, end.minusDays(29), end, null, null, "REVENUE",
                PageRequest.of(0, 100))
            .getContent()
            .stream()
            .filter(r -> r.getMomentumScore() != null && r.getMomentumScore() < 0.72)
            .filter(r -> r.getRevenueTrendPercentage() == null || r.getRevenueTrendPercentage() > -5)
            .filter(r -> r.getTransactionCount() != null && r.getTransactionCount() >= 5)
            .filter(r -> dbl(r.getRevenue()) > 0)
            .sorted((a, b) -> Double.compare(
                a.getMomentumScore() != null ? a.getMomentumScore() : 1,
                b.getMomentumScore() != null ? b.getMomentumScore() : 1))
            .limit(4)
            .toList();

        for (ProductPerformanceDTO r : candidates) {
            double momentum = r.getMomentumScore() != null ? r.getMomentumScore() : 1;
            AlertPriority prio = momentum < 0.6 ? AlertPriority.HIGH : AlertPriority.MEDIUM;
            String title = String.format("Demanda desacelerando — momentum %.2f", momentum);
            String msg = String.format(
                "%s mostra desaceleração de demanda: momentum %.2f (EMA7/SMA28). " +
                "Ainda com %.1f un./dia de giro, mas a tendência aponta queda nas próximas semanas. " +
                "Evite reposição excessiva agora.",
                r.getName(), momentum, dbl(r.getSalesVelocity()));
            Map<String, Object> meta = new HashMap<>();
            meta.put("momentumScore", momentum);
            meta.put("salesVelocity", dbl(r.getSalesVelocity()));
            meta.put("revenueTrend", r.getRevenueTrendPercentage());
            meta.put("healthScore", r.getHealthScore());
            meta.put("revenue30d", dbl(r.getRevenue()));
            createAlert(market, r, AlertType.MOMENTUM_REVERSAL, prio, title, msg, meta);
        }
    }

    /**
     * PROMOTION_OPPORTUNITY — price above baseline with revenue declining.
     * Uses priceIndex > 1.03 AND revenueTrendPercentage < -5%.
     */
    @Transactional
    public void checkPromotionOpportunities(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        List<ProductPerformanceDTO> candidates = advancedAnalyticsService
            .getProductPerformance(marketId, end.minusDays(59), end, null, null, "TREND_ASC",
                PageRequest.of(0, 60))
            .getContent()
            .stream()
            .filter(r -> r.getPriceIndex() != null && r.getPriceIndex().compareTo(BigDecimal.valueOf(1.03)) > 0)
            .filter(r -> r.getRevenueTrendPercentage() != null && r.getRevenueTrendPercentage() < -5)
            .filter(r -> r.getTransactionCount() != null && r.getTransactionCount() >= 3)
            .toList();

        if (candidates.isEmpty()) return;

        ZStats priceStats = zStats(candidates, r -> dbl(r.getPriceIndex()));
        candidates.stream()
            .filter(r -> zScore(dbl(r.getPriceIndex()), priceStats) > 0.3)
            .sorted((a, b) -> Double.compare(
                a.getRevenueTrendPercentage() != null ? a.getRevenueTrendPercentage() : 0,
                b.getRevenueTrendPercentage() != null ? b.getRevenueTrendPercentage() : 0))
            .limit(5)
            .forEach(r -> {
                double priceAbove = (dbl(r.getPriceIndex()) - 1.0) * 100;
                double trend = r.getRevenueTrendPercentage() != null ? r.getRevenueTrendPercentage() : 0;
                double promoShare = dbl(r.getPromoRevenueShare()) * 100;
                String title = String.format("Preço %.1f%% acima da base — oportunidade de promoção", priceAbove);
                String msg = String.format(
                    "%s está %.1f%% acima do preço histórico de referência com queda de %.1f%% em receita. " +
                    "Apenas %.0f%% da receita veio de promoções. Uma ação promocional pode recuperar volume.",
                    r.getName(), priceAbove, Math.abs(trend), promoShare);
                Map<String, Object> meta = new HashMap<>();
                meta.put("priceIndex", dbl(r.getPriceIndex()));
                meta.put("priceAboveBaselinePercent", priceAbove);
                meta.put("revenueTrend", trend);
                meta.put("promoRevenueShare", dbl(r.getPromoRevenueShare()));
                meta.put("baselinePrice", dbl(r.getBaselinePrice()));
                meta.put("averagePrice", dbl(r.getAveragePrice()));
                createAlert(market, r, AlertType.PROMOTION_OPPORTUNITY, AlertPriority.MEDIUM, title, msg, meta);
            });
    }

    /**
     * HIGH_PERFORMING — product with strong revenue growth AND high momentum.
     * Actionable: ensure stock and display visibility to capture the full wave.
     */
    @Transactional
    public void checkHighPerformers(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        List<ProductPerformanceDTO> candidates = advancedAnalyticsService
            .getProductPerformance(marketId, end.minusDays(29), end, null, null, "TREND",
                PageRequest.of(0, 60))
            .getContent()
            .stream()
            .filter(r -> r.getRevenueTrendPercentage() != null && r.getRevenueTrendPercentage() > 10)
            .filter(r -> r.getTransactionCount() != null && r.getTransactionCount() >= 5)
            .toList();

        if (candidates.isEmpty()) return;

        ZStats trendStats = zStats(candidates, r -> r.getRevenueTrendPercentage() != null ? r.getRevenueTrendPercentage() : 0.0);
        candidates.stream()
            .filter(r -> zScore(r.getRevenueTrendPercentage(), trendStats) > 0.5)
            .sorted((a, b) -> Double.compare(
                b.getRevenueTrendPercentage() != null ? b.getRevenueTrendPercentage() : 0,
                a.getRevenueTrendPercentage() != null ? a.getRevenueTrendPercentage() : 0))
            .limit(5)
            .forEach(r -> {
                double z = zScore(r.getRevenueTrendPercentage(), trendStats);
                AlertPriority prio = z > 2.0 ? AlertPriority.HIGH : AlertPriority.MEDIUM;
                double trend = r.getRevenueTrendPercentage() != null ? r.getRevenueTrendPercentage() : 0;
                boolean accelerating = r.getMomentumScore() != null && r.getMomentumScore() > 1.15;
                String title = accelerating
                    ? String.format("%.1f%% de crescimento e acelerando — maximize o estoque", trend)
                    : String.format("Produto em alta: +%.1f%% de receita", trend);
                String msg = String.format(
                    "%s cresceu %.1f%% em receita nos últimos 30 dias. " +
                    "Giro atual: %.1f un./dia. Momentum %.2f%s. " +
                    "Garanta bom estoque e visibilidade no PDV para aproveitar o pico.",
                    r.getName(), trend, dbl(r.getSalesVelocity()),
                    r.getMomentumScore() != null ? r.getMomentumScore() : 1.0,
                    accelerating ? " (acelerando)" : "");
                Map<String, Object> meta = new HashMap<>();
                meta.put("revenueTrend", trend);
                meta.put("salesVelocity", dbl(r.getSalesVelocity()));
                meta.put("momentumScore", r.getMomentumScore());
                meta.put("healthScore", r.getHealthScore());
                meta.put("revenue30d", dbl(r.getRevenue()));
                meta.put("zScore", z);
                createAlert(market, r, AlertType.HIGH_PERFORMING, prio, title, msg, meta);
            });
    }

    /**
     * BASKET_OPPORTUNITY — a high-lift basket pair where one product is growing
     * but the complementary product is not being cross-promoted or is stagnant.
     * Uses cached market basket rules (lift > 2.0) crossed with performance data.
     */
    @Transactional
    public void checkBasketOpportunities(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        List<MarketBasketDTO> rules;
        try {
            rules = marketBasketService.analyzeMarketBasket(marketId, 0.01, 0.05);
        } catch (Exception e) {
            return; // basket may not be computed yet
        }
        if (rules == null || rules.isEmpty()) return;

        LocalDate end = LocalDate.now();
        List<ProductPerformanceDTO> perf = advancedAnalyticsService
            .getProductPerformance(marketId, end.minusDays(29), end, null, null, "REVENUE",
                PageRequest.of(0, 200))
            .getContent();

        Map<UUID, ProductPerformanceDTO> perfMap = new HashMap<>();
        for (ProductPerformanceDTO p : perf) perfMap.put(p.getProductId(), p);

        int alertsCreated = 0;
        for (MarketBasketDTO rule : rules) {
            if (alertsCreated >= 4) break;
            if (rule.getLift() < 2.0 || rule.getAntecedent().isEmpty() || rule.getConsequent().isEmpty()) continue;

            UUID antId = rule.getAntecedent().get(0);
            UUID conId = rule.getConsequent().get(0);
            ProductPerformanceDTO ant = perfMap.get(antId);
            ProductPerformanceDTO con = perfMap.get(conId);
            if (ant == null || con == null) continue;

            // The interesting case: antecedent is growing but consequent is stagnant or declining
            boolean antGrowing = ant.getRevenueTrendPercentage() != null && ant.getRevenueTrendPercentage() > 5;
            boolean conStagnant = con.getRevenueTrendPercentage() == null || con.getRevenueTrendPercentage() < 5;
            if (!antGrowing || !conStagnant) continue;

            String antName = rule.getAntecedentNames().isEmpty() ? "Produto A" : rule.getAntecedentNames().get(0);
            String conName = rule.getConsequentNames().isEmpty() ? "Produto B" : rule.getConsequentNames().get(0);

            String title = String.format("Combo detectado: %.1f× mais vendas juntos", rule.getLift());
            String msg = String.format(
                "Clientes que levam %s compram %s %.1f× mais do que a média. " +
                "%s está em alta (+%.1f%%), mas %s não acompanha. " +
                "Posicione os dois próximos ou crie uma oferta combinada.",
                antName, conName, rule.getLift(),
                antName, ant.getRevenueTrendPercentage() != null ? ant.getRevenueTrendPercentage() : 0,
                conName);
            Map<String, Object> meta = new HashMap<>();
            meta.put("lift", rule.getLift());
            meta.put("confidence", rule.getConfidence());
            meta.put("support", rule.getSupport());
            meta.put("pairCount", rule.getPairCount());
            meta.put("antecedentProductId", antId.toString());
            meta.put("antecedentName", antName);
            meta.put("consequentProductId", conId.toString());
            meta.put("consequentName", conName);
            meta.put("antecedentTrend", ant.getRevenueTrendPercentage());
            meta.put("consequentTrend", con.getRevenueTrendPercentage());

            // Associate alert with the consequent product (the one being missed)
            createAlert(market, con, AlertType.BASKET_OPPORTUNITY, AlertPriority.MEDIUM, title, msg, meta);
            alertsCreated++;
        }
    }

    // ── Z-score helpers ───────────────────────────────────────────────────────

    private record ZStats(double mean, double std) {}

    private ZStats zStats(List<ProductPerformanceDTO> rows, ToDoubleFunction<ProductPerformanceDTO> extractor) {
        double[] vals = rows.stream().mapToDouble(extractor).toArray();
        double mean = 0;
        for (double v : vals) mean += v;
        mean /= Math.max(1, vals.length);
        double variance = 0;
        for (double v : vals) variance += Math.pow(v - mean, 2);
        variance /= Math.max(1, vals.length);
        return new ZStats(mean, Math.sqrt(variance));
    }

    private double zScore(double value, ZStats stats) {
        return stats.std > 0 ? (value - stats.mean) / stats.std : 0;
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    private void createAlert(Market market, ProductPerformanceDTO perf, AlertType type,
                             AlertPriority priority, String title, String message,
                             Map<String, Object> metadata) {
        UUID productId = perf.getProductId();
        LocalDateTime since = LocalDateTime.now().minusHours(DEDUP_HOURS);
        if (alertRepository.existsByMarketIdAndProductIdAndTypeAndCreatedAtAfter(
                market.getId(), productId, type, since)) {
            return;
        }
        Product product = productRepository.getReferenceById(productId);
        Alert alert = new Alert();
        alert.setMarket(market);
        alert.setProduct(product);
        alert.setType(type);
        alert.setPriority(priority);
        alert.setTitle(title);
        alert.setMessage(message);
        alert.setMetadata(metadata);
        alert.setProductName(perf.getName());
        alert.setProductEan(perf.getEan());
        alert.setProductImage(perf.getImageUrl());
        alertRepository.save(alert);
    }

    private AlertDTO mapAlert(Alert alert) {
        return new AlertDTO(
            alert.getId(),
            alert.getType() != null ? alert.getType().name() : null,
            alert.getTitle(),
            alert.getMessage(),
            alert.getPriority() != null ? alert.getPriority().name() : null,
            alert.getProduct() != null ? alert.getProduct().getId() : null,
            alert.getProductName(),
            alert.getProductEan(),
            alert.getProductImage(),
            alert.getIsRead(),
            alert.getCreatedAt(),
            alert.getMetadata()
        );
    }

    private double dbl(BigDecimal v) {
        return v != null ? v.doubleValue() : 0.0;
    }

    private double dbl(Double v) {
        return v != null ? v : 0.0;
    }
}
