package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.AlertDTO;
import com.pdv2cloud.model.entity.Alert;
import com.pdv2cloud.model.entity.AlertPriority;
import com.pdv2cloud.model.entity.AlertType;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.AlertRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.SalesAnalyticsRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AlertService {

    @Autowired
    private AlertRepository alertRepository;

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private SalesAnalyticsRepository analyticsRepository;

    @Autowired
    private ProductRepository productRepository;

    public List<AlertDTO> getAlerts(UUID marketId, AlertType type, AlertPriority priority, boolean onlyUnread) {
        List<Alert> alerts;
        if (onlyUnread) {
            alerts = alertRepository.findByMarketIdAndIsReadFalse(marketId);
        } else if (type != null) {
            alerts = alertRepository.findByMarketIdAndType(marketId, type);
        } else if (priority != null) {
            alerts = alertRepository.findByMarketIdAndPriority(marketId, priority);
        } else {
            alerts = alertRepository.findByMarketId(marketId);
        }
        return alerts.stream().map(this::mapAlert).toList();
    }

    @Transactional
    public void checkLowStock(UUID marketId) {
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(7);
        List<Object[]> results = analyticsRepository.aggregateByProduct(marketId, start, end);
        Market market = marketRepository.getReferenceById(marketId);

        results.stream()
            .limit(5)
            .forEach(row -> createAlertForProduct(
                market,
                row[0],
                AlertType.LOW_STOCK,
                AlertPriority.MEDIUM,
                "Risco de ruptura",
                "Produto com alta demanda nos ultimos dias"
            ));
    }

    @Transactional
    public void checkSlowMoving(UUID marketId) {
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(30);
        List<Object[]> results = analyticsRepository.aggregateByProduct(marketId, start, end);
        Market market = marketRepository.getReferenceById(marketId);

        results.stream()
            .filter(row -> ((BigDecimal) row[1]).compareTo(new BigDecimal("200")) < 0)
            .limit(5)
            .forEach(row -> createAlertForProduct(
                market,
                row[0],
                AlertType.SLOW_MOVING,
                AlertPriority.LOW,
                "Produtos com giro baixo",
                "Produto com receita baixa no periodo"
            ));
    }

    @Transactional
    public void checkPromotionOpportunities(UUID marketId) {
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(60);
        List<Object[]> results = analyticsRepository.aggregateByProduct(marketId, start, end);
        Market market = marketRepository.getReferenceById(marketId);

        results.stream()
            .filter(row -> ((BigDecimal) row[1]).compareTo(new BigDecimal("1000")) < 0)
            .limit(5)
            .forEach(row -> createAlertForProduct(
                market,
                row[0],
                AlertType.PROMOTION_OPPORTUNITY,
                AlertPriority.MEDIUM,
                "Oportunidade de promocao",
                "Produto com baixa receita e potencial promocional"
            ));
    }

    @Transactional
    public void checkHighPerformers(UUID marketId) {
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(7);
        List<Object[]> results = analyticsRepository.aggregateByProduct(marketId, start, end);
        Market market = marketRepository.getReferenceById(marketId);

        results.stream()
            .filter(row -> ((BigDecimal) row[1]).compareTo(new BigDecimal("8000")) > 0)
            .limit(5)
            .forEach(row -> createAlertForProduct(
                market,
                row[0],
                AlertType.HIGH_PERFORMING,
                AlertPriority.HIGH,
                "Alto desempenho",
                "Produto com receita alta no ultimo periodo"
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
