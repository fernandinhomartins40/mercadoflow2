package com.pdv2cloud.service;

import com.pdv2cloud.exception.CustomExceptions;
import com.pdv2cloud.model.dto.AlertDTO;
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
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Alert generation using Z-score anomaly detection.
 *
 * For each check the service computes a population mean (µ) and standard deviation (σ)
 * across the product set, then flags products that deviate beyond a threshold:
 *   Z = (x - µ) / σ
 *
 * Deduplication window: 36 hours per product+type combo (was 24 h).
 * Alert priority is dynamically assigned based on the Z-score magnitude.
 */
@Service
public class AlertService {

    private static final int DEDUP_HOURS = 36;

    @Autowired private AlertRepository alertRepository;
    @Autowired private MarketRepository marketRepository;
    @Autowired private AdvancedAnalyticsService advancedAnalyticsService;
    @Autowired private ProductRepository productRepository;

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

    // ── Alert checks ──────────────────────────────────────────────────────────

    @Transactional
    public void checkLowStock(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        List<ProductPerformanceDTO> candidates = advancedAnalyticsService
            .getProductPerformance(marketId, end.minusDays(13), end, null, null, "TURNOVER",
                PageRequest.of(0, 50))
            .getContent()
            .stream()
            .filter(r -> r.getTransactionCount() != null && r.getTransactionCount() >= 3)
            .toList();

        if (candidates.isEmpty()) return;

        ZStats stats = zStats(candidates, r -> dbl(r.getSalesVelocity()));
        candidates.stream()
            .filter(r -> zScore(dbl(r.getSalesVelocity()), stats) > 1.5)
            .limit(5)
            .forEach(r -> {
                double z = zScore(dbl(r.getSalesVelocity()), stats);
                AlertPriority priority = z > 2.5 ? AlertPriority.HIGH : AlertPriority.MEDIUM;
                String msg = String.format(
                    "Rotacao %.1fx acima da media do portfólio nos últimos 14 dias. Verifique estoque e reposição.",
                    dbl(r.getSalesVelocity()) / Math.max(stats.mean, 0.01));
                createAlert(market, r.getProductId(), AlertType.LOW_STOCK, priority,
                    "Produto com alta saída", msg);
            });
    }

    @Transactional
    public void checkSlowMoving(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        List<ProductPerformanceDTO> candidates = advancedAnalyticsService
            .getProductPerformance(marketId, end.minusDays(29), end, null, null, "REVENUE",
                PageRequest.of(0, 100))
            .getContent()
            .stream()
            .filter(r -> r.getTransactionCount() != null && r.getTransactionCount() >= 1)
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
            .limit(5)
            .forEach(r -> {
                double z = Math.abs(zScore(r.getRevenueTrendPercentage(), trendStats));
                AlertPriority priority = z > 2.0 ? AlertPriority.HIGH : AlertPriority.MEDIUM;
                String msg = String.format(
                    "Queda de %.1f%% em receita no período. Giro abaixo da média do portfólio.",
                    Math.abs(r.getRevenueTrendPercentage() != null ? r.getRevenueTrendPercentage() : 0));
                createAlert(market, r.getProductId(), AlertType.SLOW_MOVING, priority,
                    "Produto com giro baixo", msg);
            });
    }

    @Transactional
    public void checkPromotionOpportunities(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        List<ProductPerformanceDTO> candidates = advancedAnalyticsService
            .getProductPerformance(marketId, end.minusDays(59), end, null, null, "TREND_ASC",
                PageRequest.of(0, 50))
            .getContent()
            .stream()
            .filter(r -> r.getPriceIndex() != null && r.getPriceIndex().compareTo(BigDecimal.valueOf(1.03)) > 0)
            .filter(r -> r.getRevenueTrendPercentage() != null && r.getRevenueTrendPercentage() < -5)
            .toList();

        if (candidates.isEmpty()) return;

        ZStats priceStats = zStats(candidates, r -> dbl(r.getPriceIndex()));
        candidates.stream()
            .filter(r -> zScore(dbl(r.getPriceIndex()), priceStats) > 0.5)
            .limit(5)
            .forEach(r -> {
                String msg = String.format(
                    "Preço %.1f%% acima da base histórica com queda de %.1f%% em receita. " +
                    "Considere promoção ou reposicionamento.",
                    (dbl(r.getPriceIndex()) - 1.0) * 100,
                    Math.abs(r.getRevenueTrendPercentage() != null ? r.getRevenueTrendPercentage() : 0));
                createAlert(market, r.getProductId(), AlertType.PROMOTION_OPPORTUNITY, AlertPriority.MEDIUM,
                    "Oportunidade de promoção", msg);
            });
    }

    @Transactional
    public void checkHighPerformers(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        List<ProductPerformanceDTO> candidates = advancedAnalyticsService
            .getProductPerformance(marketId, end.minusDays(29), end, null, null, "TREND",
                PageRequest.of(0, 50))
            .getContent()
            .stream()
            .filter(r -> r.getRevenueTrendPercentage() != null && r.getRevenueTrendPercentage() > 10)
            .toList();

        if (candidates.isEmpty()) return;

        ZStats stats = zStats(candidates, r -> r.getRevenueTrendPercentage() != null ? r.getRevenueTrendPercentage() : 0.0);
        candidates.stream()
            .filter(r -> zScore(r.getRevenueTrendPercentage(), stats) > 0.5)
            .limit(5)
            .forEach(r -> {
                double z = zScore(r.getRevenueTrendPercentage(), stats);
                AlertPriority priority = z > 2.0 ? AlertPriority.HIGH : AlertPriority.MEDIUM;
                String msg = String.format(
                    "Crescimento de %.1f%% em receita no período. Produto acelerando acima do portfólio.",
                    r.getRevenueTrendPercentage() != null ? r.getRevenueTrendPercentage() : 0);
                createAlert(market, r.getProductId(), AlertType.HIGH_PERFORMING, priority,
                    "Alto desempenho", msg);
            });
    }

    // ── Z-score helpers ───────────────────────────────────────────────────────

    private record ZStats(double mean, double std) {}

    private ZStats zStats(List<ProductPerformanceDTO> rows, java.util.function.ToDoubleFunction<ProductPerformanceDTO> extractor) {
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

    private void createAlert(Market market, Object productId, AlertType type, AlertPriority priority,
                             String title, String message) {
        UUID id = productId instanceof UUID uid ? uid : UUID.fromString(productId.toString());
        LocalDateTime since = LocalDateTime.now().minusHours(DEDUP_HOURS);
        if (alertRepository.existsByMarketIdAndProductIdAndTypeAndCreatedAtAfter(market.getId(), id, type, since)) {
            return;
        }
        Product product = productRepository.getReferenceById(id);
        Alert alert = new Alert();
        alert.setMarket(market);
        alert.setProduct(product);
        alert.setType(type);
        alert.setPriority(priority);
        alert.setTitle(title);
        alert.setMessage(message);
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
            alert.getIsRead(),
            alert.getCreatedAt()
        );
    }

    private double dbl(BigDecimal v) {
        return v != null ? v.doubleValue() : 0.0;
    }
}
