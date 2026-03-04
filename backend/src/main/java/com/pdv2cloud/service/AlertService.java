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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AlertService {

    @Autowired
    private AlertRepository alertRepository;

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private AdvancedAnalyticsService advancedAnalyticsService;

    @Autowired
    private ProductRepository productRepository;

    public List<AlertDTO> getAlerts(UUID marketId, AlertType type, AlertPriority priority, boolean onlyUnread) {
        List<Alert> alerts = onlyUnread
            ? alertRepository.findByMarketIdAndIsReadFalse(marketId)
            : alertRepository.findByMarketId(marketId);

        if (type != null) {
            alerts = alerts.stream().filter(a -> a.getType() == type).toList();
        }
        if (priority != null) {
            alerts = alerts.stream().filter(a -> a.getPriority() == priority).toList();
        }
        return alerts.stream().map(this::mapAlert).toList();
    }

    @Transactional
    public void markAsRead(UUID marketId, UUID alertId) {
        int updated = alertRepository.markAsRead(marketId, alertId);
        if (updated == 0) {
            throw new CustomExceptions.NotFound("Alert not found");
        }
    }

    @Transactional
    public int markAllAsRead(UUID marketId) {
        return alertRepository.markAllAsRead(marketId);
    }

    @Transactional
    public void checkLowStock(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(13);
        List<ProductPerformanceDTO> results = advancedAnalyticsService
            .getProductPerformance(marketId, start, end, null, "TURNOVER", PageRequest.of(0, 5))
            .getContent();

        results.stream()
            .filter(row -> row.getTransactionCount() != null && row.getTransactionCount() >= 3)
            .forEach(row -> createAlertForProduct(
                market,
                row.getProductId(),
                AlertType.LOW_STOCK,
                AlertPriority.MEDIUM,
                "Alta rotacao recente",
                "Produto com alta saida nos ultimos dias. Vale conferir estoque e reposicao."
            ));
    }

    @Transactional
    public void checkSlowMoving(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(29);
        List<ProductPerformanceDTO> results = advancedAnalyticsService
            .getProductPerformance(marketId, start, end, null, "TURNOVER_ASC", PageRequest.of(0, 10))
            .getContent();

        results.stream()
            .filter(row -> row.getTransactionCount() != null && row.getTransactionCount() >= 1)
            .filter(row -> row.getRevenueTrendPercentage() != null && row.getRevenueTrendPercentage() < 0)
            .limit(5)
            .forEach(row -> createAlertForProduct(
                market,
                row.getProductId(),
                AlertType.SLOW_MOVING,
                AlertPriority.LOW,
                "Produtos com giro baixo",
                "Produto com baixa velocidade de venda e perda de tracao no periodo."
            ));
    }

    @Transactional
    public void checkPromotionOpportunities(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(59);
        List<ProductPerformanceDTO> results = advancedAnalyticsService
            .getProductPerformance(marketId, start, end, null, "TREND_ASC", PageRequest.of(0, 20))
            .getContent();

        results.stream()
            .filter(row -> row.getPriceIndex() != null && row.getPriceIndex().compareTo(java.math.BigDecimal.valueOf(1.03)) > 0)
            .filter(row -> row.getRevenueTrendPercentage() != null && row.getRevenueTrendPercentage() < -5)
            .limit(5)
            .forEach(row -> createAlertForProduct(
                market,
                row.getProductId(),
                AlertType.PROMOTION_OPPORTUNITY,
                AlertPriority.MEDIUM,
                "Oportunidade de promocao",
                "Preco acima da base historica e queda recente de receita. Teste promocao ou ajuste de exposicao."
            ));
    }

    @Transactional
    public void checkHighPerformers(UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(29);
        List<ProductPerformanceDTO> results = advancedAnalyticsService
            .getProductPerformance(marketId, start, end, null, "TREND", PageRequest.of(0, 10))
            .getContent();

        results.stream()
            .filter(row -> row.getRevenueTrendPercentage() != null && row.getRevenueTrendPercentage() > 10)
            .limit(5)
            .forEach(row -> createAlertForProduct(
                market,
                row.getProductId(),
                AlertType.HIGH_PERFORMING,
                AlertPriority.HIGH,
                "Alto desempenho",
                "Produto acelerando receita e mantendo bom giro no periodo."
            ));
    }

    private void createAlertForProduct(Market market,
                                       Object productId,
                                       AlertType type,
                                       AlertPriority priority,
                                       String title,
                                       String message) {
        UUID id = productId instanceof UUID ? (UUID) productId : UUID.fromString(productId.toString());
        LocalDateTime since = LocalDateTime.now().minusHours(24);
        boolean exists = alertRepository.existsByMarketIdAndProductIdAndTypeAndCreatedAtAfter(
            market.getId(), id, type, since);
        if (exists) {
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
}
