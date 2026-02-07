package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.AlertDTO;
import com.pdv2cloud.model.dto.MarketBasketDTO;
import com.pdv2cloud.model.dto.MarketDashboardDTO;
import com.pdv2cloud.model.dto.ProductAnalyticsDTO;
import com.pdv2cloud.model.dto.SalesTrendPointDTO;
import com.pdv2cloud.model.dto.TopSellerDTO;
import com.pdv2cloud.model.entity.Alert;
import com.pdv2cloud.model.entity.MarketBasketRule;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.AlertRepository;
import com.pdv2cloud.repository.InvoiceRepository;
import com.pdv2cloud.repository.MarketBasketRuleRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.SalesAnalyticsRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service
public class AnalyticsService {

    @Autowired
    private SalesAnalyticsRepository analyticsRepository;

    @Autowired
    private InvoiceRepository invoiceRepository;

    @Autowired
    private AlertRepository alertRepository;

    @Autowired
    private MarketBasketService marketBasketService;

    @Autowired
    private MarketBasketRuleRepository marketBasketRuleRepository;

    @Autowired
    private ProductRepository productRepository;

    public MarketDashboardDTO getMarketDashboard(UUID marketId, LocalDate startDate, LocalDate endDate) {
        if (startDate == null) {
            startDate = LocalDate.now().minusDays(30);
        }
        if (endDate == null) {
            endDate = LocalDate.now();
        }

        MarketDashboardDTO dashboard = new MarketDashboardDTO();

        BigDecimal totalRevenue = invoiceRepository.getTotalRevenue(marketId, startDate, endDate);
        dashboard.setTotalRevenue(totalRevenue);

        BigDecimal todayRevenue = invoiceRepository.getTotalRevenue(marketId, LocalDate.now(), LocalDate.now());
        dashboard.setTodayRevenue(todayRevenue);

        LocalDate previousStart = startDate.minusDays(ChronoUnit.DAYS.between(startDate, endDate));
        BigDecimal previousRevenue = invoiceRepository.getTotalRevenue(marketId, previousStart, startDate.minusDays(1));
        double growth = calculateGrowth(totalRevenue, previousRevenue);
        dashboard.setGrowthPercentage(growth);

        List<TopSellerDTO> topSellers = getTopSellers(marketId, 5, startDate, endDate);
        dashboard.setTopSellers(topSellers);

        long unreadAlerts = alertRepository.countByMarketIdAndIsReadFalse(marketId);
        dashboard.setUnreadAlerts(unreadAlerts);

        dashboard.setActiveProducts((int) invoiceRepository.countDistinctProducts(marketId));

        List<SalesTrendPointDTO> salesTrend = analyticsRepository.getSalesTrend(marketId, startDate, endDate);
        dashboard.setSalesTrend(salesTrend);

        List<AlertDTO> recentAlerts = alertRepository.findByMarketId(marketId).stream()
            .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
            .limit(5)
            .map(this::mapAlert)
            .collect(Collectors.toList());
        dashboard.setRecentAlerts(recentAlerts);

        return dashboard;
    }

    public Page<ProductAnalyticsDTO> getProductAnalytics(UUID marketId, String category, String sortBy, Pageable pageable) {
        String normalizedSort = sortBy != null ? sortBy.trim().toUpperCase() : null;
        if (normalizedSort != null && normalizedSort.isBlank()) {
            normalizedSort = null;
        }
        return analyticsRepository.getProductAnalytics(marketId, category, normalizedSort, pageable);
    }

    public List<TopSellerDTO> getTopSellers(UUID marketId, int limit, LocalDate startDate, LocalDate endDate) {
        List<TopSellerDTO> list = invoiceRepository.findTopSellers(marketId, startDate, endDate);
        return list.stream().limit(limit).collect(Collectors.toList());
    }

    public List<MarketBasketDTO> getMarketBasketAnalysis(UUID marketId, double minSupport, double minConfidence) {
        return marketBasketService.analyzeMarketBasket(marketId, minSupport, minConfidence);
    }

    public List<MarketBasketDTO> getCachedMarketBasketAnalysis(UUID marketId) {
        LocalDateTime computedAt = marketBasketRuleRepository.findLatestComputedAt(marketId);
        if (computedAt == null) {
            return List.of();
        }

        List<MarketBasketRule> rows = marketBasketRuleRepository.findByMarketIdAndComputedAt(marketId, computedAt);
        if (rows.isEmpty()) {
            return List.of();
        }

        List<MarketBasketDTO> dtos = rows.stream().map(r -> {
            MarketBasketDTO dto = new MarketBasketDTO();
            dto.setAntecedent(parseIds(r.getAntecedent()));
            dto.setConsequent(parseIds(r.getConsequent()));
            dto.setSupport(r.getSupport() != null ? r.getSupport().doubleValue() : 0);
            dto.setConfidence(r.getConfidence() != null ? r.getConfidence().doubleValue() : 0);
            dto.setLift(r.getLift() != null ? r.getLift().doubleValue() : 0);
            return dto;
        }).toList();

        // Enrich names in bulk
        Set<UUID> ids = new HashSet<>();
        for (MarketBasketDTO dto : dtos) {
            ids.addAll(dto.getAntecedent());
            ids.addAll(dto.getConsequent());
        }
        Map<UUID, String> names = productRepository.findAllById(ids).stream()
            .collect(Collectors.toMap(Product::getId, Product::getName));

        for (MarketBasketDTO dto : dtos) {
            dto.setAntecedentNames(dto.getAntecedent().stream().map(names::get).toList());
            dto.setConsequentNames(dto.getConsequent().stream().map(names::get).toList());
        }

        return dtos;
    }

    private List<UUID> parseIds(String ids) {
        if (ids == null || ids.isBlank()) {
            return List.of();
        }
        return java.util.Arrays.stream(ids.split(","))
            .map(String::trim)
            .filter(s -> !s.isBlank())
            .map(UUID::fromString)
            .toList();
    }

    private double calculateGrowth(BigDecimal current, BigDecimal previous) {
        if (previous.compareTo(BigDecimal.ZERO) == 0) {
            return 0;
        }
        return current.subtract(previous)
            .divide(previous, 4, RoundingMode.HALF_UP)
            .multiply(BigDecimal.valueOf(100))
            .doubleValue();
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
